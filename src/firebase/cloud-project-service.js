import {
  copyProjectDocument,
  createProjectIdentifier,
  normalizeProjectDocument,
} from "../persistence/project-document.js";

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
  const inFlight = new Set();
  let disposed = false;

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
      void syncProject(projectId);
    }, delay));
  }

  async function saveLink(link, type = "status") {
    const saved = await linkRepository.save({ ...link, updatedAt: now() });
    emit(saved, type);
    return saved;
  }

  async function preserveCopy(document, suffix) {
    const source = normalizeProjectDocument(document);
    const copy = copyProjectDocument(source, {
      id: createId(),
      now: now(),
      title: `${source.project.metadata.title} (${suffix})`,
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

  async function syncProject(projectId) {
    if (disposed || inFlight.has(projectId)) return null;
    const account = accountService.getState().account;
    if (account?.emailVerified !== true) return null;
    let link = await linkRepository.get(account.uid, projectId);
    if (!link?.pendingDocument || link.status === "conflict") return link;

    inFlight.add(projectId);
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
    } finally {
      inFlight.delete(projectId);
    }
  }

  async function queueProject(document) {
    const account = accountService.getState().account;
    if (account?.emailVerified !== true) return null;
    const normalized = normalizeProjectDocument(document);
    const link = await linkRepository.get(account.uid, normalized.id);
    if (!link || link.status === "conflict") return link;
    const saved = await saveLink({
      ...link,
      pendingDocument: normalized,
      status: "pending",
      error: "",
    }, "pending");
    schedule(normalized.id);
    return saved;
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
    if (persistence) await persistence.saveNow();
    const projectId = preferences.getLastProjectId();
    if (!projectId) throw new Error("No active local project is available for cloud backup.");
    const document = await localRepository.get(projectId);
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
  }

  async function overwriteConflictWithLocal(projectId) {
    const account = requireAccount();
    const link = await linkRepository.get(account.uid, projectId);
    if (!link || link.status !== "conflict" || !link.pendingDocument) {
      throw new Error("This project does not have a cloud conflict to resolve.");
    }
    const pending = link.pendingDocument;
    const client = await accountService.getClient();
    const record = await client.saveProject(account.uid, pending, link.cloudRevision);
    return saveLink({
      ...link,
      cloudRevision: record.cloudRevision,
      pendingDocument: null,
      status: "synced",
      error: "",
      conflictProjectId: "",
    }, "resolved");
  }

  function start() {
    if (persistence) {
      persistence.addEventListener("change", (event) => {
        if (event.detail.type !== "saved") return;
        void queueProject(event.detail.document);
      }, { signal: lifecycle.signal });
    }
    accountService.addEventListener("change", () => {
      if (accountService.getState().account?.emailVerified === true) {
        void retryAll();
      } else {
        clearAllTimers();
      }
    }, { signal: lifecycle.signal });
    onlineTarget?.addEventListener?.("online", () => void retryAll(), { signal: lifecycle.signal });
    if (accountService.getState().account?.emailVerified === true) void retryAll();
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    async deleteProject(projectId) {
      const account = requireAccount();
      const client = await accountService.getClient();
      await client.deleteProject(account.uid, projectId);
      await linkRepository.delete(account.uid, projectId);
      clearProjectTimer(projectId);
      emit(null, "deleted");
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
      const client = await accountService.getClient();
      const record = await client.getProject(account.uid, projectId);
      if (!record) throw new Error("That cloud project no longer exists.");
      const remote = normalizeProjectDocument(record.document);
      const local = await localRepository.get(projectId);
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
    },
    overwriteConflictWithLocal,
    queueProject,
    removeEventListener: events.removeEventListener.bind(events),
    retryAll,
    retryProject: (projectId) => syncProject(projectId),
    start,
  });
}
