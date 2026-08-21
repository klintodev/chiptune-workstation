import {
  normalizeProjectDocument,
  normalizeProjectDocumentForSchema,
  normalizeProjectDocumentToV8,
  summarizeProjectDocument,
} from "../persistence/project-document.js";

export const MAX_CLOUD_PROJECT_BYTES = 900_000;
export const CLOUD_PROJECT_FORMAT = "chiptune-workstation-cloud";
export const CLOUD_PROJECT_VERSION = 1;

function encodedSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`Cloud project ${field} must be text.`);
  }
  return value;
}

function safeText(value, fallback, maximumLength = 160) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

function safeTimestamp(candidate, fallback = null) {
  return typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))
    ? candidate
    : fallback;
}

export function createCloudProjectRecord(ownerId, document, cloudRevision) {
  const normalized = normalizeProjectDocument(document);
  requireText(ownerId, "ownerId");
  if (!Number.isInteger(cloudRevision) || cloudRevision < 1) {
    throw new RangeError("Cloud project revision must be a positive integer.");
  }
  const record = Object.freeze({
    cloudFormat: CLOUD_PROJECT_FORMAT,
    cloudVersion: CLOUD_PROJECT_VERSION,
    ownerId,
    projectId: normalized.id,
    cloudRevision,
    title: normalized.project.metadata.title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    document: normalized,
  });
  if (encodedSize(record) > MAX_CLOUD_PROJECT_BYTES) {
    throw new RangeError("This project is too large for cloud backup.");
  }
  return record;
}

export function normalizeCloudProjectRecord(candidate, { ownerId } = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Cloud project must be an object.");
  }
  if (candidate.cloudFormat !== CLOUD_PROJECT_FORMAT || candidate.cloudVersion !== CLOUD_PROJECT_VERSION) {
    throw new RangeError("This cloud project format is not supported.");
  }
  const normalizedOwnerId = requireText(candidate.ownerId, "ownerId");
  if (ownerId && normalizedOwnerId !== ownerId) throw new Error("Cloud project owner does not match the signed-in account.");
  const document = normalizeProjectDocument(candidate.document);
  if (candidate.projectId !== document.id) throw new Error("Cloud project ID does not match its document.");
  if (!Number.isInteger(candidate.cloudRevision) || candidate.cloudRevision < 1) {
    throw new RangeError("Cloud project revision must be a positive integer.");
  }
  return createCloudProjectRecord(normalizedOwnerId, document, candidate.cloudRevision);
}

export function normalizeCloudProjectRecordToV8(candidate, options) {
  const source = normalizeCloudProjectRecord(candidate, options);
  return createCloudProjectRecord(
    source.ownerId,
    normalizeProjectDocumentToV8(source.document),
    source.cloudRevision,
  );
}

export const normalizeCloudProjectRecordToV7 = normalizeCloudProjectRecordToV8;

export function summarizeCloudProjectRecord(candidate, options) {
  const record = normalizeCloudProjectRecord(candidate, options);
  if (options?.targetSchemaVersion !== undefined) {
    // Compatibility is runtime-specific. Keep the returned summary/source
    // schema untouched after proving that this Studio can activate it.
    normalizeProjectDocumentForSchema(record.document, options.targetSchemaVersion);
  }
  return Object.freeze({
    ...summarizeProjectDocument(record.document),
    cloudRevision: record.cloudRevision,
    ownerId: record.ownerId,
    recoveryKey: options?.recoveryKey ?? record.projectId,
  });
}

/**
 * Summarize a Firestore record without allowing malformed nested Project data
 * to disappear from account listings. The Firestore document key is kept
 * separate from payload IDs so recovery never trusts or activates the record.
 */
export function summarizeCloudProjectRecordForRecovery(candidate, {
  ownerId,
  recoveryKey,
  targetSchemaVersion,
} = {}) {
  try {
    return summarizeCloudProjectRecord(candidate, {
      ownerId,
      recoveryKey,
      targetSchemaVersion,
    });
  } catch (error) {
    const document = candidate?.document;
    const nestedTitle = document?.project?.metadata?.title;
    const title = safeText(candidate?.title, safeText(nestedTitle, "Unavailable cloud project", 100), 100);
    const updatedAt = safeTimestamp(candidate?.updatedAt, safeTimestamp(document?.updatedAt));
    return Object.freeze({
      availability: "unavailable",
      cloudRevision: Number.isInteger(candidate?.cloudRevision) && candidate.cloudRevision >= 1
        ? candidate.cloudRevision
        : null,
      createdAt: safeTimestamp(candidate?.createdAt, safeTimestamp(document?.createdAt)),
      id: null,
      ownerId: typeof candidate?.ownerId === "string" ? candidate.ownerId : null,
      reason: error instanceof Error ? error.message : "This cloud project cannot be opened safely.",
      recoveryKey: typeof recoveryKey === "string" && recoveryKey ? recoveryKey : null,
      revision: Number.isInteger(document?.revision) && document.revision >= 0
        ? document.revision
        : null,
      schemaVersion: Number.isInteger(document?.project?.schemaVersion)
        ? document.project.schemaVersion
        : null,
      sourceSchemaVersion: Number.isInteger(document?.project?.schemaVersion)
        ? document.project.schemaVersion
        : null,
      title,
      updatedAt,
    });
  }
}

export function serializeRawCloudProjectRecord(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Cloud recovery data must be a JSON object.");
  }
  return `${JSON.stringify(candidate, null, 2)}\n`;
}

export function createCloudConflictError(remoteRecord) {
  const error = new Error("The cloud project changed on another device.");
  error.code = "cloud/revision-conflict";
  error.remoteRecord = remoteRecord ? normalizeCloudProjectRecord(remoteRecord) : null;
  return error;
}
