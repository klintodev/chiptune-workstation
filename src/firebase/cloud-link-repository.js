import { normalizeProjectDocument } from "../persistence/project-document.js";

const DATABASE_NAME = "chiptune-workstation-cloud";
const DATABASE_VERSION = 1;
const LINK_STORE = "links";
const STATUSES = new Set(["pending", "syncing", "synced", "offline", "conflict", "failed"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function linkKey(uid, projectId) {
  return `${uid}:${projectId}`;
}

export function normalizeCloudLink(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Cloud link must be an object.");
  }
  if (typeof candidate.uid !== "string" || candidate.uid.trim() === "") throw new TypeError("Cloud link requires a user ID.");
  if (typeof candidate.projectId !== "string" || candidate.projectId.trim() === "") throw new TypeError("Cloud link requires a project ID.");
  if (!Number.isInteger(candidate.cloudRevision) || candidate.cloudRevision < 0) {
    throw new RangeError("Cloud link revision must be a non-negative integer.");
  }
  if (!STATUSES.has(candidate.status)) throw new RangeError("Cloud link has an unsupported status.");
  const pendingDocument = candidate.pendingDocument
    ? normalizeProjectDocument(candidate.pendingDocument)
    : null;
  if (pendingDocument && pendingDocument.id !== candidate.projectId) {
    throw new Error("Pending cloud document does not match its link.");
  }
  return Object.freeze({
    key: linkKey(candidate.uid, candidate.projectId),
    uid: candidate.uid,
    projectId: candidate.projectId,
    cloudRevision: candidate.cloudRevision,
    status: candidate.status,
    pendingDocument,
    error: typeof candidate.error === "string" ? candidate.error : "",
    conflictProjectId: typeof candidate.conflictProjectId === "string" ? candidate.conflictProjectId : "",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
  });
}

export function createMemoryCloudLinkRepository(initialLinks = []) {
  const links = new Map(initialLinks.map((link) => {
    const normalized = normalizeCloudLink(link);
    return [normalized.key, normalized];
  }));
  return Object.freeze({
    async delete(uid, projectId) {
      return links.delete(linkKey(uid, projectId));
    },
    async get(uid, projectId) {
      const link = links.get(linkKey(uid, projectId));
      return link ? normalizeCloudLink(clone(link)) : null;
    },
    async list(uid) {
      return [...links.values()]
        .filter((link) => link.uid === uid)
        .map((link) => normalizeCloudLink(clone(link)));
    },
    async save(link) {
      const normalized = normalizeCloudLink(link);
      links.set(normalized.key, normalized);
      return normalizeCloudLink(clone(normalized));
    },
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")), { once: true });
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")), { once: true });
  });
}

export function createIndexedDbCloudLinkRepository({
  databaseName = DATABASE_NAME,
  indexedDB = globalThis.indexedDB,
} = {}) {
  if (!indexedDB?.open) throw new Error("IndexedDB is not available in this browser.");
  let databasePromise;

  function getDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(LINK_STORE)) {
          request.result.createObjectStore(LINK_STORE, { keyPath: "key" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("Could not open cloud-link storage.")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Cloud-link storage is blocked by another tab.")), { once: true });
    });
    return databasePromise;
  }

  return Object.freeze({
    async delete(uid, projectId) {
      const database = await getDatabase();
      const transaction = database.transaction(LINK_STORE, "readwrite");
      transaction.objectStore(LINK_STORE).delete(linkKey(uid, projectId));
      await transactionComplete(transaction);
      return true;
    },
    async get(uid, projectId) {
      const database = await getDatabase();
      const transaction = database.transaction(LINK_STORE, "readonly");
      const complete = transactionComplete(transaction);
      const value = await requestResult(transaction.objectStore(LINK_STORE).get(linkKey(uid, projectId)));
      await complete;
      return value ? normalizeCloudLink(value) : null;
    },
    async list(uid) {
      const database = await getDatabase();
      const transaction = database.transaction(LINK_STORE, "readonly");
      const complete = transactionComplete(transaction);
      const values = await requestResult(transaction.objectStore(LINK_STORE).getAll());
      await complete;
      return values.filter((value) => value.uid === uid).map(normalizeCloudLink);
    },
    async save(link) {
      const normalized = normalizeCloudLink(link);
      const database = await getDatabase();
      const transaction = database.transaction(LINK_STORE, "readwrite");
      transaction.objectStore(LINK_STORE).put(normalized);
      await transactionComplete(transaction);
      return normalizeCloudLink(normalized);
    },
  });
}
