import { normalizeProjectDocument } from "../persistence/project-document.js?v=20260722-1";

export const PUBLICATION_FORMAT = "chiptune-workstation-publication";
export const LEGACY_PUBLICATION_VERSION = 1;
export const PUBLICATION_VERSION = 2;
export const MAX_PUBLICATION_BYTES = 900_000;
export const MAX_PUBLICATIONS_PER_ACCOUNT = 20;
export const PUBLICATION_SLOTS = Object.freeze(Array.from(
  { length: MAX_PUBLICATIONS_PER_ACCOUNT },
  (_, index) => String(index + 1).padStart(2, "0"),
));

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

function requirePublicationSlot(value) {
  if (!PUBLICATION_SLOTS.includes(value)) {
    throw new RangeError("Publication slot is invalid.");
  }
  return value;
}

function normalizeCommonRecord(candidate) {
  const document = normalizeProjectDocument(candidate.document);
  const record = {
    publicationFormat: PUBLICATION_FORMAT,
    publicationVersion: candidate.publicationVersion,
    publicationId: requireText(candidate.publicationId, "ID", 100),
    publicationRevision: candidate.publicationRevision,
    sourceProjectId: requireText(candidate.sourceProjectId, "source project", 100),
    title: requireText(candidate.title, "title", 100),
    creatorName: requireText(candidate.creatorName, "creator name", 48),
    publishedAt: requireTimestamp(candidate.publishedAt, "publish time"),
    updatedAt: requireTimestamp(candidate.updatedAt, "update time"),
    document,
  };
  if (!Number.isInteger(record.publicationRevision) || record.publicationRevision < 1) {
    throw new RangeError("Publication revision must be a positive integer.");
  }
  if (record.sourceProjectId !== document.id) {
    throw new RangeError("Publication source project does not match its document.");
  }
  if (record.title !== document.project.metadata.title) {
    throw new RangeError("Publication title does not match its document.");
  }
  if (Date.parse(record.updatedAt) < Date.parse(record.publishedAt)) {
    throw new RangeError("Publication update time cannot precede its publish time.");
  }
  return record;
}

export function createPublicationRecord({
  creatorName,
  document,
  ownerSlot,
  publicationId,
  publicationRevision,
  publishedAt,
  updatedAt,
}) {
  const normalizedDocument = normalizeProjectDocument(document);
  const record = Object.freeze({
    ...normalizeCommonRecord({
      publicationFormat: PUBLICATION_FORMAT,
      publicationVersion: PUBLICATION_VERSION,
      publicationId: requireText(publicationId, "ID", 100),
      publicationRevision,
      sourceProjectId: normalizedDocument.id,
      title: normalizedDocument.project.metadata.title,
      creatorName: requireText(creatorName, "creator name", 48),
      publishedAt: requireTimestamp(publishedAt, "publish time"),
      updatedAt: requireTimestamp(updatedAt, "update time"),
      document: normalizedDocument,
    }),
    ownerSlot: requirePublicationSlot(ownerSlot),
  });
  if (encodedSize(record) > MAX_PUBLICATION_BYTES) {
    throw new RangeError("This project is too large to publish.");
  }
  return record;
}

export function normalizePublicationRecord(candidate, { ownerId } = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Publication must be an object.");
  }
  if (
    candidate.publicationFormat !== PUBLICATION_FORMAT
    || ![LEGACY_PUBLICATION_VERSION, PUBLICATION_VERSION].includes(candidate.publicationVersion)
  ) {
    throw new RangeError("This publication format is not supported.");
  }
  const common = normalizeCommonRecord(candidate);
  const record = candidate.publicationVersion === LEGACY_PUBLICATION_VERSION
    ? { ...common, ownerId: requireText(candidate.ownerId, "owner", 128) }
    : { ...common, ownerSlot: requirePublicationSlot(candidate.ownerSlot) };
  if (ownerId && record.ownerId && record.ownerId !== ownerId) {
    throw new Error("Publication owner does not match the signed-in account.");
  }
  if (encodedSize(record) > MAX_PUBLICATION_BYTES) {
    throw new RangeError("This project is too large to publish.");
  }
  return Object.freeze(record);
}
