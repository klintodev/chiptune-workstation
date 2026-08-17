import {
  normalizeV2ProjectDocument,
  summarizeUnavailableProjectDocument,
  summarizeV2ProjectDocument,
} from "./project-document.js";

const DATABASE_NAME = "chiptune-workstation";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const LAST_PROJECT_KEY = "chiptune-workstation:last-project-id";

function rawClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeClone(document) {
  return normalizeV2ProjectDocument(rawClone(document));
}

function sortSummaries(summaries) {
  return summaries.sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? "") || 0;
    const rightTime = Date.parse(right.updatedAt ?? "") || 0;
    return rightTime - leftTime || left.title.localeCompare(right.title);
  });
}

function summarizeRawDocuments(documents, storageKeys = documents.map((document) => document?.id)) {
  return sortSummaries(documents.map((document, index) => {
    let summary;
    try {
      summary = summarizeV2ProjectDocument(document);
    } catch (error) {
      summary = summarizeUnavailableProjectDocument(document, error);
    }
    return Object.freeze({ ...summary, storageKey: rawClone(storageKeys[index]) });
  }));
}

export function createV2MemoryProjectRepository(initialDocuments = []) {
  const documents = new Map();
  for (const document of initialDocuments) {
    const raw = rawClone(document);
    if (!raw || !Object.hasOwn(raw, "id") || raw.id === undefined || raw.id === null) {
      throw new TypeError("A stored project record must have an identifier.");
    }
    documents.set(raw.id, raw);
  }

  return Object.freeze({
    close() {},
    async delete(id) {
      return documents.delete(id);
    },
    dispose() {},
    async get(id) {
      const raw = documents.get(id);
      return raw ? normalizeClone(raw) : null;
    },
    async getRaw(id) {
      const raw = documents.get(id);
      return raw ? rawClone(raw) : null;
    },
    async list() {
      return summarizeRawDocuments([...documents.values()], [...documents.keys()]);
    },
    async save(document) {
      const normalized = normalizeClone(document);
      documents.set(normalized.id, rawClone(normalized));
      return normalizeClone(normalized);
    },
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(
      request.error ?? new Error("IndexedDB request failed."),
    ), { once: true });
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(
      transaction.error ?? new Error("IndexedDB transaction was aborted."),
    ), { once: true });
    transaction.addEventListener("error", () => reject(
      transaction.error ?? new Error("IndexedDB transaction failed."),
    ), { once: true });
  });
}

export function createV2IndexedDbProjectRepository({
  databaseName = DATABASE_NAME,
  indexedDB = globalThis.indexedDB,
} = {}) {
  if (!indexedDB?.open) throw new Error("IndexedDB is not available in this browser.");
  let database = null;
  let databasePromise = null;
  let disposed = false;
  let generation = 0;

  function getDatabase() {
    if (disposed) throw new Error("Project storage has been disposed.");
    if (databasePromise) return databasePromise;
    const openingGeneration = ++generation;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
          const store = request.result.createObjectStore(PROJECT_STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      });
      request.addEventListener("success", () => {
        const opened = request.result;
        if (disposed || openingGeneration !== generation) {
          opened.close();
          reject(new Error("Project storage was closed while opening."));
          return;
        }
        database = opened;
        opened.addEventListener("versionchange", () => {
          opened.close();
          if (database === opened) {
            database = null;
            databasePromise = null;
            generation += 1;
          }
        });
        resolve(opened);
      }, { once: true });
      request.addEventListener("error", () => {
        databasePromise = null;
        reject(request.error ?? new Error("Could not open project storage."));
      }, { once: true });
      request.addEventListener("blocked", () => {
        databasePromise = null;
        reject(new Error("Project storage is blocked by another tab."));
      }, { once: true });
    });
    return databasePromise;
  }

  function close() {
    generation += 1;
    database?.close();
    database = null;
    databasePromise = null;
  }

  async function read(id, { raw = false } = {}) {
    const db = await getDatabase();
    const transaction = db.transaction(PROJECT_STORE, "readonly");
    const complete = transactionComplete(transaction);
    const result = await requestResult(transaction.objectStore(PROJECT_STORE).get(id));
    await complete;
    if (!result) return null;
    return raw ? rawClone(result) : normalizeClone(result);
  }

  return Object.freeze({
    close,
    async delete(id) {
      const db = await getDatabase();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).delete(id);
      await transactionComplete(transaction);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      close();
    },
    get: (id) => read(id),
    getRaw: (id) => read(id, { raw: true }),
    async list() {
      const db = await getDatabase();
      const transaction = db.transaction(PROJECT_STORE, "readonly");
      const complete = transactionComplete(transaction);
      const store = transaction.objectStore(PROJECT_STORE);
      const [documents, storageKeys] = await Promise.all([
        requestResult(store.getAll()),
        requestResult(store.getAllKeys()),
      ]);
      await complete;
      return summarizeRawDocuments(documents, storageKeys);
    },
    async save(document) {
      const normalized = normalizeClone(document);
      const db = await getDatabase();
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).put(normalized);
      await transactionComplete(transaction);
      return normalizeClone(normalized);
    },
  });
}

export function createV2ProjectPreferences(storage = null) {
  if (storage === null) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  return Object.freeze({
    getLastProjectId() {
      try {
        return storage?.getItem(LAST_PROJECT_KEY) || null;
      } catch {
        return null;
      }
    },
    setLastProjectId(id) {
      try {
        storage?.setItem(LAST_PROJECT_KEY, id);
        return true;
      } catch {
        return false;
      }
    },
  });
}
