import { normalizeProjectDocument } from "./project-document.js";

export const CHECKPOINT_FORMAT = "chiptune-workstation-checkpoint";
export const CHECKPOINT_VERSION = 1;
export const MAX_CHECKPOINTS_PER_PROJECT = 20;
export const MAX_CHECKPOINT_BYTES = 2_000_000;
export const MAX_CHECKPOINT_TOTAL_BYTES = 8_000_000;
export const MAX_CHECKPOINT_LABEL_LENGTH = 64;
export const CHECKPOINT_OPERATIONS = Object.freeze([
  "manual",
  "recipe",
  "randomisation",
  "starter",
  "remix",
  "restore",
]);

const DATABASE_NAME = "chiptune-workstation-checkpoints";
const DATABASE_VERSION = 1;
const CHECKPOINT_STORE = "checkpoints";
const PROJECT_INDEX = "projectId";

function encodedSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function boundedText(value, label, maximum, { optional = false } = {}) {
  if (optional && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximum) {
    throw new TypeError(`${label} must contain ${optional ? "0" : "1"} to ${maximum} characters.`);
  }
  return value.trim();
}

function requireTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError("Checkpoint creation time must be an ISO timestamp.");
  }
  return value;
}

export function createCheckpointIdentifier(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (randomUUID) return `checkpoint-${randomUUID()}`;
  return `checkpoint-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeCheckpointRecord(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("A checkpoint record is required.");
  }
  if (candidate.checkpointFormat !== CHECKPOINT_FORMAT || candidate.checkpointVersion !== CHECKPOINT_VERSION) {
    throw new RangeError("This checkpoint format is not supported.");
  }
  const document = normalizeProjectDocument(candidate.document);
  const checkpointId = boundedText(candidate.checkpointId, "Checkpoint ID", 100);
  const projectId = boundedText(candidate.projectId, "Checkpoint project ID", 100);
  const operation = boundedText(candidate.operation, "Checkpoint operation", 32);
  if (!CHECKPOINT_OPERATIONS.includes(operation)) {
    throw new RangeError(`Checkpoint operation must be one of: ${CHECKPOINT_OPERATIONS.join(", ")}.`);
  }
  if (document.id !== projectId) throw new RangeError("Checkpoint project ID does not match its document.");
  if (candidate.sourceProjectRevision !== document.revision) {
    throw new RangeError("Checkpoint source revision does not match its document.");
  }
  if (candidate.schemaVersion !== document.project.schemaVersion) {
    throw new RangeError("Checkpoint schema does not match its project.");
  }
  const record = Object.freeze({
    checkpointFormat: CHECKPOINT_FORMAT,
    checkpointVersion: CHECKPOINT_VERSION,
    checkpointId,
    projectId,
    createdAt: requireTimestamp(candidate.createdAt),
    label: boundedText(candidate.label, "Checkpoint label", MAX_CHECKPOINT_LABEL_LENGTH, { optional: true }),
    operation,
    schemaVersion: candidate.schemaVersion,
    sourceProjectRevision: candidate.sourceProjectRevision,
    document,
  });
  if (encodedSize(record) > MAX_CHECKPOINT_BYTES) {
    throw new RangeError("This checkpoint is larger than the per-checkpoint storage limit.");
  }
  return record;
}

export function createCheckpointRecord({
  checkpointId = createCheckpointIdentifier(),
  createdAt = new Date().toISOString(),
  document,
  label = "",
  operation = "manual",
}) {
  const normalizedDocument = normalizeProjectDocument(document);
  return normalizeCheckpointRecord({
    checkpointFormat: CHECKPOINT_FORMAT,
    checkpointVersion: CHECKPOINT_VERSION,
    checkpointId,
    projectId: normalizedDocument.id,
    createdAt,
    label,
    operation,
    schemaVersion: normalizedDocument.project.schemaVersion,
    sourceProjectRevision: normalizedDocument.revision,
    document: normalizedDocument,
  });
}

function sortRecords(records) {
  return records.sort((left, right) => (
    Date.parse(right.createdAt) - Date.parse(left.createdAt)
    || left.checkpointId.localeCompare(right.checkpointId)
  ));
}

function assertProjectBudget(records, candidate) {
  if (records.length >= MAX_CHECKPOINTS_PER_PROJECT) {
    throw new RangeError(`A project can keep at most ${MAX_CHECKPOINTS_PER_PROJECT} checkpoints.`);
  }
  const total = records.reduce((size, record) => size + encodedSize(record), 0) + encodedSize(candidate);
  if (total > MAX_CHECKPOINT_TOTAL_BYTES) {
    throw new RangeError("This project has reached its checkpoint storage budget.");
  }
}

export function createMemoryCheckpointRepository(initialRecords = []) {
  const records = new Map();
  for (const candidate of initialRecords) {
    const record = normalizeCheckpointRecord(candidate);
    if (records.has(record.checkpointId)) throw new RangeError("Checkpoint IDs must be unique.");
    const projectRecords = [...records.values()].filter(({ projectId }) => projectId === record.projectId);
    assertProjectBudget(projectRecords, record);
    records.set(record.checkpointId, record);
  }
  let disposed = false;

  function ensureActive() {
    if (disposed) throw new Error("Checkpoint storage has been disposed.");
  }

  return Object.freeze({
    close() {},
    async deleteProject(projectId) {
      ensureActive();
      let deleted = 0;
      for (const [checkpointId, record] of records) {
        if (record.projectId !== projectId) continue;
        records.delete(checkpointId);
        deleted += 1;
      }
      return deleted;
    },
    dispose() {
      disposed = true;
    },
    async get(checkpointId) {
      ensureActive();
      const record = records.get(checkpointId);
      return record ? normalizeCheckpointRecord(clone(record)) : null;
    },
    async list(projectId) {
      ensureActive();
      return sortRecords([...records.values()]
        .filter((record) => record.projectId === projectId)
        .map((record) => normalizeCheckpointRecord(clone(record))));
    },
    async save(candidate) {
      ensureActive();
      const record = normalizeCheckpointRecord(candidate);
      if (records.has(record.checkpointId)) throw new RangeError("Checkpoint IDs are immutable and must be unique.");
      const projectRecords = [...records.values()].filter(({ projectId }) => projectId === record.projectId);
      assertProjectBudget(projectRecords, record);
      records.set(record.checkpointId, record);
      return normalizeCheckpointRecord(clone(record));
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
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Checkpoint transaction was aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Checkpoint transaction failed.")), { once: true });
  });
}

export function createIndexedDbCheckpointRepository({
  databaseName = DATABASE_NAME,
  indexedDB = globalThis.indexedDB,
} = {}) {
  if (!indexedDB?.open) throw new Error("IndexedDB is not available in this browser.");
  let database = null;
  let databasePromise = null;
  let disposed = false;

  function getDatabase() {
    if (disposed) throw new Error("Checkpoint storage has been disposed.");
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains(CHECKPOINT_STORE)) {
          const store = opened.createObjectStore(CHECKPOINT_STORE, { keyPath: "checkpointId" });
          store.createIndex(PROJECT_INDEX, "projectId");
        }
      });
      request.addEventListener("success", () => {
        database = request.result;
        database.addEventListener("versionchange", () => {
          database?.close();
          database = null;
          databasePromise = null;
        });
        resolve(request.result);
      }, { once: true });
      request.addEventListener("error", () => {
        databasePromise = null;
        reject(request.error ?? new Error("Could not open checkpoint storage."));
      }, { once: true });
      request.addEventListener("blocked", () => {
        databasePromise = null;
        reject(new Error("Checkpoint storage is blocked by another tab."));
      }, { once: true });
    });
    return databasePromise;
  }

  async function list(projectId) {
    const opened = await getDatabase();
    const transaction = opened.transaction(CHECKPOINT_STORE, "readonly");
    const complete = transactionComplete(transaction);
    const values = await requestResult(transaction.objectStore(CHECKPOINT_STORE).index(PROJECT_INDEX).getAll(projectId));
    await complete;
    return sortRecords(values.map(normalizeCheckpointRecord));
  }

  async function get(checkpointId) {
    const opened = await getDatabase();
    const transaction = opened.transaction(CHECKPOINT_STORE, "readonly");
    const complete = transactionComplete(transaction);
    const value = await requestResult(transaction.objectStore(CHECKPOINT_STORE).get(checkpointId));
    await complete;
    return value ? normalizeCheckpointRecord(value) : null;
  }

  function close() {
    database?.close();
    database = null;
    databasePromise = null;
  }

  return Object.freeze({
    close,
    async deleteProject(projectId) {
      const records = await list(projectId);
      if (records.length === 0) return 0;
      const opened = await getDatabase();
      const transaction = opened.transaction(CHECKPOINT_STORE, "readwrite");
      const store = transaction.objectStore(CHECKPOINT_STORE);
      for (const record of records) store.delete(record.checkpointId);
      await transactionComplete(transaction);
      return records.length;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      close();
    },
    get,
    list,
    async save(candidate) {
      const record = normalizeCheckpointRecord(candidate);
      if (await get(record.checkpointId)) {
        throw new RangeError("Checkpoint IDs are immutable and must be unique.");
      }
      const current = await list(record.projectId);
      assertProjectBudget(current, record);
      const opened = await getDatabase();
      const transaction = opened.transaction(CHECKPOINT_STORE, "readwrite");
      transaction.objectStore(CHECKPOINT_STORE).add(record);
      await transactionComplete(transaction);
      return normalizeCheckpointRecord(record);
    },
  });
}
