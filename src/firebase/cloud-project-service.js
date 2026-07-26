import {
  copyProjectDocument,
  createProjectIdentifier,
  normalizeProjectDocument,
  parseProjectDocument,
} from "../persistence/project-document.js?v=20260722-1";
import { createBoundedUniqueName } from "../shared/bounded-name.js";
import { MAX_PROJECT_TITLE_LENGTH } from "../state/project-state.js";

const RETRY_DELAYS = Object.freeze([5_000, 15_000, 30_000, 60_000]);

function sameDocument(left, right) {
  return JSON.stringify(normalizeProjectDocument(left)) === JSON.stringify(normalizeProjectDocument(right));
}

function isNetworkFailure(error, onlineTarget) {
  const code = String(error?.code || "").toLowerCase();
  return onlineTarget?.navigator?.onLine === false
    || code.includes("network")
    || code.includes("unavailable")
    || code.includes("deadline-exceeded");
}

function pendingToken(document) {
  return document ? `${document.revision}:${document.updatedAt}` : "";
}

export function createCloudProjectService({
  accountService,
  clearTimer = globalThis.clearTimeout,
  createId = createProjectIdentifier,
  linkRepository,
  localRepository,
  now = () => new Date().toISOString(),
  onlineTarget = globalThis,
  persistence = null,
  preferences,
  reload = () => globalThis.location?.reload(),
  retryDelays = RETRY_DELAYS,
  setTimer = globalThis.setTimeout,
  syncDelay = 1_500,
} = {}) {
  if (!accountService || !linkRepository || !localRepository || !preferences) {
    throw new TypeError("Cloud projects require account, link, local repository, and preference services.");
  }

  const events = new EventTarget();
  const lifecycle = new AbortController();
  const timers = new Map();
  const retryAttempts = new Map();
  const operationQueues = new Map();
  let disposed = false;

  function serializeProjectOperation(projectId, operation) {
    const previous = operationQueues.get(projectId) ?? Promise.resolve();
    const current = previous
      .catch(() => null)
      .then(() => disposed ? null : operation());
    operationQueues.set(projectId, current);
    return current.finally(() => {
      if (operationQueues.get(projectId) === current) operationQueues.delete(projectId);
    });
  }

  function requireAccount() {
    const account = accountService.getState().account;
    if (!account) throw new Error("Sign in before using cloud projects.");
    if (account.emailVerified !== true) throw new Error("Verify your email before using cloud projects.");
    return account;
  }

  function emit(link = null, type = "status") {
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ link, type }),
    }));
  }

  function runInBackground(operation) {
    void operation.catch(() => emit(null, "failed"));
  }

  async function captureActiveDocument(projectId = null) {
    const activeDocument = persistence?.getActiveDocument?.();
    if (!activeDocument || (projectId !== null && activeDocument.id !== projectId)) return null;
    try {
      await persistence.saveNow();
    } catch {
      // The in-memory snapshot remains authoritative when durable local saving fails.
    }
    return parseProjectDocument(persistence.getExportText());
  }

  function clearProjectTimer(projectId) {
    const timer = timers.get(projectId);
    if (timer !== undefined) clearTimer(timer);
    timers.delete(projectId);
  }

  function clearAllTimers() {
    for (const projectId of timers.keys()) clearProjectTimer(projectId);
  }

  function schedule(projectId, delay = syncDelay) {
    if (disposed || accountService.getState().account?.emailVerified !== true) return;
    clearProjectTimer(projectId);
    timers.set(projectId, setTimer(() => {
      timers.delete(projectId);
      runInBackground(syncProject(projectId));
    }, delay));
  }

  async function saveLink(link, type = "status") {
    const saved = await linkRepository.save({ ...link, updatedAt: now() });
    emit(saved, type);
    return saved;
  }

  async function preserveCopy(document, suffix) {
    const source = normalizeProjectDocument(document);
    const summaries = await localRepository.list();
    const title = createBoundedUniqueName(
      source.project.metadata.title,
      summaries.map((summary) => summary.title),
      { maximumLength: MAX_PROJECT_TITLE_LENGTH, suffix: `(${suffix})` },
    );
    const copy = copyProjectDocument(source, {
      id: createId(),
      now: now(),
      title,
    });
    await localRepository.save(copy);
    return copy;
  }

  async function markConflict(link, remoteRecord) {
    let conflictProjectId = "";
    if (remoteRecord?.document) {
      const conflict = await preserveCopy(remoteRecord.document, "cloud conflict");
      conflictProjectId = conflict.id;
    }
    return saveLink({
      ...link,
      cloudRevision: remoteRecord?.cloudRevision ?? link.cloudRevision,
      status: "conflict",
      error: conflictProjectId
        ? "The cloud version changed elsewhere. It was preserved as a separate local project."
        : "The cloud version changed elsewhere. Automatic sync is paused.",
      conflictProjectId,
    }, "conflict");
  }

  async function syncProjectNow(projectId) {
    if (disposed) return null;
    const account = accountService.getState().account;
    if (account?.emailVerified !== true) return null;
    let link = await linkRepository.get(account.uid, projectId);
    if (!link?.pendingDocument || link.status === "conflict") return link;

    clearProjectTimer(projectId);
    const candidate = link.pendingDocument;
    const candidateToken = pendingToken(candidate);
    link = await saveLink({ ...link, status: "syncing", error: "" });
    try {
      const client = await accountService.getClient();
      const record = await client.saveProject(account.uid, candidate, link.cloudRevision);
      retryAttempts.delete(projectId);
      const current = await linkRepository.get(account.uid, projectId);
      if (!current) return null;
      const hasNewerPending = pendingToken(current.pendingDocument) !== candidateToken;
      const saved = await saveLink({
        ...current,
        cloudRevision: record.cloudRevision,
        pendingDocument: hasNewerPending ? current.pendingDocument : null,
        status: hasNewerPending ? "pending" : "synced",
        error: "",
        conflictProjectId: "",
      }, "synced");
      if (hasNewerPending) schedule(projectId);
      return saved;
    } catch (error) {
      const current = await linkRepository.get(account.uid, projectId) ?? link;
      if (error?.code === "cloud/revision-conflict") {
        return markConflict(current, error.remoteRecord);
      }
      const offline = isNetworkFailure(error, onlineTarget);
      const saved = await saveLink({
        ...current,
        status: offline ? "offline" : "failed",
        error: offline
          ? "Cloud backup is offline. Local saving is unaffected and retry is scheduled."
          : error?.message || "Cloud backup failed.",
      }, offline ? "offline" : "failed");
      if (offline) {
        const attempt = retryAttempts.get(projectId) ?? 0;
        retryAttempts.set(projectId, attempt + 1);
        schedule(projectId, retryDelays[Math.min(attempt, retryDelays.length - 1)]);
      }
      return saved;
    }
  }

  function syncProject(projectId) {
    return serializeProjectOperation(projectId, () => syncProjectNow(projectId));
  }

  async function queueProject(document) {
    const account = accountService.getState().account;
    if (account?.emailVerified !== true) return null;
    const normalized = normalizeProjectDocument(document);
    return serializeProjectOperation(normalized.id, async () => {
      const currentAccount = accountService.getState().account;
      if (currentAccount?.uid !== account.uid || currentAccount.emailVerified !== true) return null;
      const link = await linkRepository.get(account.uid, normalized.id);
      if (!link) return null;
      if (link.status === "conflict") {
        return saveLink({ ...link, pendingDocument: normalized }, "conflict");
      }
      const saved = await saveLink({
        ...link,
        pendingDocument: normalized,
        status: "pending",
        error: "",
      }, "pending");
      schedule(normalized.id);
      return saved;
    });
  }

  async function retryAll() {
    const account = accountService.getState().account;
    if (account?.emailVerified !== true) return;
    const links = await linkRepository.list(account.uid);
    for (const link of links) {
      if (link.pendingDocument && link.status !== "conflict") schedule(link.projectId, 0);
    }
  }

  async function enableCurrentProject() {
    const account = requireAccount();
    const projectId = preferences.getLastProjectId() ?? persistence?.getActiveDocument().id;
    if (!projectId) throw new Error("No active local project is available for cloud backup.");
    const activeDocument = await captureActiveDocument(projectId);
    return serializeProjectOperation(projectId, async () => {
      const currentAccount = requireAccount();
      if (currentAccount.uid !== account.uid) throw new Error("The signed-in account changed.");
      const document = activeDocument ?? await localRepository.get(projectId);
      if (!document) throw new Error("Save the active project locally before enabling cloud backup.");
      const client = await accountService.getClient();
      const remote = await client.getProject(account.uid, projectId);

      if (!remote) {
        const uploaded = await client.saveProject(account.uid, document, 0);
        return saveLink({
          uid: account.uid,
          projectId,
          cloudRevision: uploaded.cloudRevision,
          pendingDocument: null,
          status: "synced",
          error: "",
          conflictProjectId: "",
        }, "linked");
      }

      if (sameDocument(remote.document, document)) {
        return saveLink({
          uid: account.uid,
          projectId,
          cloudRevision: remote.cloudRevision,
          pendingDocument: null,
          status: "synced",
          error: "",
          conflictProjectId: "",
        }, "linked");
      }

      return markConflict({
        uid: account.uid,
        projectId,
        cloudRevision: remote.cloudRevision,
        pendingDocument: document,
        status: "pending",
        error: "",
        conflictProjectId: "",
      }, remote);
    });
  }

  async function overwriteConflictWithLocal(projectId) {
    const account = requireAccount();
    const activeDocument = await captureActiveDocument(projectId);
    return serializeProjectOperation(projectId, async () => {
      const currentAccount = requireAccount();
      if (currentAccount.uid !== account.uid) throw new Error("The signed-in account changed.");
      const link = await linkRepository.get(account.uid, projectId);
      if (!link || link.status !== "conflict" || !link.pendingDocument) {
        throw new Error("This project does not have a cloud conflict to resolve.");
      }
      const pending = activeDocument ?? await localRepository.get(projectId) ?? link.pendingDocument;
      const client = await accountService.getClient();
      try {
        const record = await client.saveProject(account.uid, pending, link.cloudRevision);
        return saveLink({
          ...link,
          cloudRevision: record.cloudRevision,
          pendingDocument: null,
          status: "synced",
          error: "",
          conflictProjectId: "",
        }, "resolved");
      } catch (error) {
        if (error?.code === "cloud/revision-conflict") {
          return markConflict({ ...link, pendingDocument: pending }, error.remoteRecord);
        }
        throw error;
      }
    });
  }

  function start() {
    if (persistence) {
      persistence.addEventListener("change", (event) => {
        if (event.detail.type !== "saved") return;
        runInBackground(queueProject(event.detail.document));
      }, { signal: lifecycle.signal });
    }
    accountService.addEventListener("change", () => {
      if (accountService.getState().account?.emailVerified === true) {
        runInBackground(retryAll());
      } else {
        clearAllTimers();
      }
    }, { signal: lifecycle.signal });
    onlineTarget?.addEventListener?.(
      "online",
      () => runInBackground(retryAll()),
      { signal: lifecycle.signal },
    );
    if (accountService.getState().account?.emailVerified === true) {
      runInBackground(retryAll());
    }
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    async deleteProject(projectId) {
      const account = requireAccount();
      return serializeProjectOperation(projectId, async () => {
        const currentAccount = requireAccount();
        if (currentAccount.uid !== account.uid) throw new Error("The signed-in account changed.");
        const client = await accountService.getClient();
        await client.deleteProject(account.uid, projectId);
        await linkRepository.delete(account.uid, projectId);
        clearProjectTimer(projectId);
        emit(null, "deleted");
      });
    },
    dispose() {
      disposed = true;
      lifecycle.abort();
      clearAllTimers();
    },
    enableCurrentProject,
    async getProjectStatus(projectId = preferences.getLastProjectId()) {
      const account = accountService.getState().account;
      if (account?.emailVerified !== true || !projectId) return Object.freeze({ status: "local-only", link: null });
      const link = await linkRepository.get(account.uid, projectId);
      return Object.freeze({ status: link?.status ?? "local-only", link });
    },
    async listProjects() {
      const account = requireAccount();
      const client = await accountService.getClient();
      return client.listProjects(account.uid);
    },
    async openProject(projectId) {
      const account = requireAccount();
      const activeDocument = await captureActiveDocument();
      return serializeProjectOperation(projectId, async () => {
        const currentAccount = requireAccount();
        if (currentAccount.uid !== account.uid) throw new Error("The signed-in account changed.");
        const client = await accountService.getClient();
        const record = await client.getProject(account.uid, projectId);
        if (!record) throw new Error("That cloud project no longer exists.");
        const remote = normalizeProjectDocument(record.document);
        if (activeDocument && activeDocument.id !== projectId) {
          const storedActive = await localRepository.get(activeDocument.id);
          if (!storedActive || !sameDocument(storedActive, activeDocument)) {
            await localRepository.save(activeDocument);
          }
        }
        const local = activeDocument?.id === projectId
          ? activeDocument
          : await localRepository.get(projectId);
        if (local && !sameDocument(local, remote)) await preserveCopy(local, "local before cloud open");
        await localRepository.save(remote);
        await saveLink({
          uid: account.uid,
          projectId,
          cloudRevision: record.cloudRevision,
          pendingDocument: null,
          status: "synced",
          error: "",
          conflictProjectId: "",
        }, "opened");
        preferences.setLastProjectId(projectId);
        reload();
        return remote;
      });
    },
    overwriteConflictWithLocal,
    queueProject,
    removeEventListener: events.removeEventListener.bind(events),
    retryAll,
    retryProject: (projectId) => syncProject(projectId),
    start,
  });
}
