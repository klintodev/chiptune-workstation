import { normalizeProjectDocument } from "../persistence/project-document.js?v=20260722-1";

export const PUBLICATION_FORMAT = "chiptune-workstation-publication";
export const PUBLICATION_VERSION = 1;
export const MAX_PUBLICATION_BYTES = 900_000;

function requireText(value, field, maximum) {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximum) {
    throw new TypeError(`Publication ${field} must contain 1 to ${maximum} characters.`);
  }
  return value.trim();
}

function requireTimestamp(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`Publication ${field} must be an ISO timestamp.`);
  }
  return value;
}

function encodedSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function createPublicationRecord({
  creatorName,
  document,
  ownerId,
  publicationId,
  publicationRevision,
  publishedAt,
  updatedAt,
}) {
  const normalizedDocument = normalizeProjectDocument(document);
  const record = Object.freeze({
    publicationFormat: PUBLICATION_FORMAT,
    publicationVersion: PUBLICATION_VERSION,
    publicationId: requireText(publicationId, "ID", 100),
    publicationRevision,
    ownerId: requireText(ownerId, "owner", 128),
    sourceProjectId: normalizedDocument.id,
    title: normalizedDocument.project.metadata.title,
    creatorName: requireText(creatorName, "creator name", 48),
    publishedAt: requireTimestamp(publishedAt, "publish time"),
    updatedAt: requireTimestamp(updatedAt, "update time"),
    document: normalizedDocument,
  });
  if (!Number.isInteger(publicationRevision) || publicationRevision < 1) {
    throw new RangeError("Publication revision must be a positive integer.");
  }
  if (Date.parse(record.updatedAt) < Date.parse(record.publishedAt)) {
    throw new RangeError("Publication update time cannot precede its publish time.");
  }
  if (encodedSize(record) > MAX_PUBLICATION_BYTES) {
    throw new RangeError("This project is too large to publish.");
  }
  return record;
}

export function normalizePublicationRecord(candidate, { ownerId } = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Publication must be an object.");
  }
  if (candidate.publicationFormat !== PUBLICATION_FORMAT || candidate.publicationVersion !== PUBLICATION_VERSION) {
    throw new RangeError("This publication format is not supported.");
  }
  if (ownerId && candidate.ownerId !== ownerId) throw new Error("Publication owner does not match the signed-in account.");
  return createPublicationRecord(candidate);
}
