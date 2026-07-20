import {
  normalizeProjectDocument,
  summarizeProjectDocument,
} from "./project-document.js";

const DATABASE_NAME = "chiptune-workstation";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const LAST_PROJECT_KEY = "chiptune-workstation:last-project-id";

function cloneDocument(document) {
  return normalizeProjectDocument(JSON.parse(JSON.stringify(document)));
}

function sortSummaries(summaries) {
  return summaries.sort((left, right) => (
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.title.localeCompare(right.title)
  ));
}

function summarizeValidDocuments(documents) {
  return sortSummaries(documents.flatMap((document) => {
    try {
      return [summarizeProjectDocument(document)];
    } catch {
      return [];
    }
  }));
}

export function createMemoryProjectRepository(initialDocuments = []) {
  const documents = new Map(initialDocuments.map((document) => {
    const normalized = cloneDocument(document);
    return [normalized.id, normalized];
  }));

  return Object.freeze({
    async delete(id) {
      return documents.delete(id);
    },
    async get(id) {
      const document = documents.get(id);
      return document ? cloneDocument(document) : null;
    },
    async list() {
      return summarizeValidDocuments([...documents.values()]);
    },
    async save(document) {
      const normalized = cloneDocument(document);
      documents.set(normalized.id, normalized);
      return cloneDocument(normalized);
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

export function createIndexedDbProjectRepository({
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
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_STORE)) {
          const store = database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("Could not open project storage.")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Project storage is blocked by another tab.")), { once: true });
    });
    return databasePromise;
  }

  return Object.freeze({
    async delete(id) {
      const database = await getDatabase();
      const transaction = database.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).delete(id);
      await transactionComplete(transaction);
      return true;
    },
    async get(id) {
      const database = await getDatabase();
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      const complete = transactionComplete(transaction);
      const result = await requestResult(transaction.objectStore(PROJECT_STORE).get(id));
      await complete;
      return result ? cloneDocument(result) : null;
    },
    async list() {
      const database = await getDatabase();
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      const complete = transactionComplete(transaction);
      const documents = await requestResult(transaction.objectStore(PROJECT_STORE).getAll());
      await complete;
      return summarizeValidDocuments(documents);
    },
    async save(document) {
      const normalized = cloneDocument(document);
      const database = await getDatabase();
      const transaction = database.transaction(PROJECT_STORE, "readwrite");
      transaction.objectStore(PROJECT_STORE).put(normalized);
      await transactionComplete(transaction);
      return cloneDocument(normalized);
    },
  });
}

export function createProjectPreferences(storage = null) {
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