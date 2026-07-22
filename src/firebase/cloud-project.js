import {
  normalizeProjectDocument,
  summarizeProjectDocument,
} from "../persistence/project-document.js?v=20260722-1";

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

export function summarizeCloudProjectRecord(candidate, options) {
  const record = normalizeCloudProjectRecord(candidate, options);
  return Object.freeze({
    ...summarizeProjectDocument(record.document),
    cloudRevision: record.cloudRevision,
    ownerId: record.ownerId,
  });
}

export function createCloudConflictError(remoteRecord) {
  const error = new Error("The cloud project changed on another device.");
  error.code = "cloud/revision-conflict";
  error.remoteRecord = remoteRecord ? normalizeCloudProjectRecord(remoteRecord) : null;
  return error;
}
