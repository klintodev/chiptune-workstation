import {
  createDefaultV2Project,
  migrateProjectToV8,
  normalizeV2Project,
} from "../domain/schema.js";
import { assertBoundedV2Structure } from "../domain/domain-utils.js";

export const PROJECT_DOCUMENT_FORMAT = "chiptune-workstation";
export const PROJECT_DOCUMENT_VERSION = 1;
export const PROJECT_FILE_EXTENSION = ".chipwork.json";
export const MAX_PROJECT_FILE_BYTES = 2_000_000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateTimestamp(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`Project document ${field} must be a parseable timestamp.`);
  }
}

export function createV2ProjectIdentifier(
  randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto),
) {
  if (randomUUID) return `project-${randomUUID()}`;
  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeV2ProjectDocument(candidate, { migrate = true } = {}) {
  assertBoundedV2Structure(candidate, { label: "Project document" });
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Project file must contain a project document object.");
  }
  if (candidate.format !== PROJECT_DOCUMENT_FORMAT) {
    throw new RangeError("This file is not a Chiptune Workstation project.");
  }
  if (candidate.documentVersion !== PROJECT_DOCUMENT_VERSION) {
    throw new RangeError(`Unsupported project document version: ${candidate.documentVersion}.`);
  }
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
    throw new TypeError("Project document must have an identifier.");
  }
  if (!Number.isInteger(candidate.revision) || candidate.revision < 0) {
    throw new RangeError("Project document revision must be a non-negative integer.");
  }
  validateTimestamp(candidate.createdAt, "createdAt");
  validateTimestamp(candidate.updatedAt, "updatedAt");
  if (Date.parse(candidate.updatedAt) < Date.parse(candidate.createdAt)) {
    throw new RangeError("Project document update time cannot precede its creation time.");
  }

  const project = migrate
    ? migrateProjectToV8(candidate.project)
    : normalizeV2Project(candidate.project);
  return Object.freeze({
    format: PROJECT_DOCUMENT_FORMAT,
    documentVersion: PROJECT_DOCUMENT_VERSION,
    id: candidate.id,
    revision: candidate.revision,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    project,
  });
}

export function createV2ProjectDocument(project = createDefaultV2Project(), {
  id = createV2ProjectIdentifier(),
  now = new Date().toISOString(),
} = {}) {
  return normalizeV2ProjectDocument({
    format: PROJECT_DOCUMENT_FORMAT,
    documentVersion: PROJECT_DOCUMENT_VERSION,
    id,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    project,
  });
}

export function reviseV2ProjectDocument(document, project, {
  now = new Date().toISOString(),
} = {}) {
  const current = normalizeV2ProjectDocument(document);
  return normalizeV2ProjectDocument({
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    project,
  }, { migrate: false });
}

export function copyV2ProjectDocument(document, {
  id = createV2ProjectIdentifier(),
  now = new Date().toISOString(),
  title,
} = {}) {
  const source = normalizeV2ProjectDocument(document);
  const project = clone(source.project);
  if (title !== undefined) project.metadata.title = title;
  return createV2ProjectDocument(project, { id, now });
}

export function parseV2ProjectDocument(text) {
  if (typeof text !== "string") throw new TypeError("Project file contents must be text.");
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES) {
    throw new RangeError("Project file is larger than 2 MB.");
  }
  let candidate;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new SyntaxError("Project file is not valid JSON.");
  }
  return normalizeV2ProjectDocument(candidate);
}

export function serializeV2ProjectDocument(document) {
  return `${JSON.stringify(normalizeV2ProjectDocument(document), null, 2)}\n`;
}

export function summarizeV2ProjectDocument(document) {
  const normalized = normalizeV2ProjectDocument(document);
  return Object.freeze({
    availability: "ready",
    id: normalized.id,
    revision: normalized.revision,
    title: normalized.project.metadata.title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    sourceSchemaVersion: document?.project?.schemaVersion ?? null,
  });
}

export function summarizeUnavailableProjectDocument(candidate, error) {
  const safeId = typeof candidate?.id === "string" && candidate.id.trim()
    ? candidate.id
    : null;
  const safeTitle = typeof candidate?.project?.metadata?.title === "string"
    && candidate.project.metadata.title.trim()
    ? candidate.project.metadata.title.slice(0, 100)
    : "Unavailable project";
  return Object.freeze({
    availability: "unavailable",
    id: safeId,
    revision: Number.isInteger(candidate?.revision) && candidate.revision >= 0
      ? candidate.revision
      : null,
    title: safeTitle,
    createdAt: typeof candidate?.createdAt === "string" ? candidate.createdAt : null,
    updatedAt: typeof candidate?.updatedAt === "string" ? candidate.updatedAt : null,
    sourceSchemaVersion: Number.isInteger(candidate?.project?.schemaVersion)
      ? candidate.project.schemaVersion
      : null,
    reason: error instanceof Error ? error.message : "This project cannot be opened safely.",
  });
}
