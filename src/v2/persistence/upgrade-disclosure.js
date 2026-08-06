const PENDING_PREFIX = "chiptune-workstation:v2-upgrade-pending:";
const SHOWN_PREFIX = "chiptune-workstation:v2-upgrade-shown:";

export const V2_UPGRADE_DISCLOSURE_COPY = "This project was upgraded to the Studio V2 format when it was first saved. Older Studio builds cannot edit it, but the recovery build can still list and download the raw V2 record.";

function validDetail(candidate) {
  return candidate
    && typeof candidate.projectId === "string"
    && candidate.projectId.trim() !== ""
    && Number.isInteger(candidate.fromSchemaVersion)
    && candidate.fromSchemaVersion >= 1
    && candidate.fromSchemaVersion < 7;
}

function storageKey(prefix, projectId) {
  return `${prefix}${encodeURIComponent(projectId)}`;
}

export function createV2UpgradeDisclosurePreference(storage = null) {
  if (storage === null) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  const memoryPending = new Map();
  const memoryShown = new Set();

  function wasShown(projectId) {
    if (memoryShown.has(projectId)) return true;
    try {
      return storage?.getItem(storageKey(SHOWN_PREFIX, projectId)) === "1";
    } catch {
      return false;
    }
  }

  function queue(candidate) {
    if (!validDetail(candidate) || wasShown(candidate.projectId)) return false;
    const detail = Object.freeze({
      fromSchemaVersion: candidate.fromSchemaVersion,
      projectId: candidate.projectId,
    });
    memoryPending.set(detail.projectId, detail);
    try {
      storage?.setItem(storageKey(PENDING_PREFIX, detail.projectId), JSON.stringify(detail));
    } catch {
      // In-memory delivery still works for the current page.
    }
    return true;
  }

  function getPending(projectId) {
    if (wasShown(projectId)) return null;
    const memory = memoryPending.get(projectId);
    if (memory) return memory;
    try {
      const value = storage?.getItem(storageKey(PENDING_PREFIX, projectId));
      if (!value) return null;
      const parsed = JSON.parse(value);
      return validDetail(parsed) && parsed.projectId === projectId
        ? Object.freeze({
          fromSchemaVersion: parsed.fromSchemaVersion,
          projectId: parsed.projectId,
        })
        : null;
    } catch {
      return null;
    }
  }

  function markShown(projectId) {
    if (typeof projectId !== "string" || projectId === "") return false;
    memoryPending.delete(projectId);
    memoryShown.add(projectId);
    try {
      storage?.removeItem(storageKey(PENDING_PREFIX, projectId));
      storage?.setItem(storageKey(SHOWN_PREFIX, projectId), "1");
    } catch {
      // The current page still suppresses duplicate disclosure.
    }
    return true;
  }

  return Object.freeze({ getPending, markShown, queue, wasShown });
}

export function createV2UpgradeDisclosure({
  document: documentLike = document,
  persistence,
  preference = createV2UpgradeDisclosurePreference(),
  root,
} = {}) {
  if (!persistence || !root) throw new TypeError("Upgrade disclosure requires persistence and a root element.");
  const lifecycle = new AbortController();
  const banner = documentLike.createElement("aside");
  banner.className = "v2-upgrade-disclosure";
  banner.hidden = true;
  banner.setAttribute("aria-label", "Project format upgrade");
  banner.setAttribute("role", "region");
  const message = documentLike.createElement("p");
  message.setAttribute("aria-atomic", "true");
  message.setAttribute("aria-live", "polite");
  message.setAttribute("role", "status");
  const dismiss = documentLike.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  banner.append(message, dismiss);
  root.append(banner);

  function show(detail) {
    if (!validDetail(detail) || preference.wasShown(detail.projectId)) return false;
    message.textContent = V2_UPGRADE_DISCLOSURE_COPY;
    banner.hidden = false;
    preference.markShown(detail.projectId);
    return true;
  }

  dismiss.addEventListener("click", () => {
    banner.hidden = true;
  }, { signal: lifecycle.signal });
  persistence.addEventListener("change", (event) => {
    show(event.detail);
  }, { signal: lifecycle.signal });

  const activeProjectId = persistence.getActiveDocument?.()?.id;
  if (activeProjectId) show(preference.getPending(activeProjectId));

  return Object.freeze({
    banner,
    dispose() {
      lifecycle.abort();
      banner.remove();
    },
    show,
  });
}
