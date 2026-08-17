import {
  PROJECT_SCHEMA_VERSION as LEGACY_PROJECT_SCHEMA_VERSION,
  createProjectState,
} from "../state/project-state.js";
import {
  PROJECT_SCHEMA_VERSION as V2_PROJECT_SCHEMA_VERSION,
  normalizeV2Project,
  normalizeV2ProjectDocument,
} from "../v2/domain/schema.js";

export const PROJECT_DOCUMENT_FORMAT = "chiptune-workstation";
export const PROJECT_DOCUMENT_VERSION = 1;
export const PROJECT_FILE_EXTENSION = ".chipwork.json";
export const MAX_PROJECT_FILE_BYTES = 2_000_000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateTimestamp(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`Project document ${field} must be an ISO timestamp.`);
  }
}

function normalizeProject(project) {
  if (project?.schemaVersion === V2_PROJECT_SCHEMA_VERSION) return normalizeV2Project(project);
  return clone(createProjectState(project).getState());
}

export function normalizeProjectDocumentToV7(candidate) {
  return normalizeV2ProjectDocument(candidate);
}

export function normalizeProjectDocumentForSchema(candidate, schemaVersion) {
  if (![LEGACY_PROJECT_SCHEMA_VERSION, V2_PROJECT_SCHEMA_VERSION].includes(schemaVersion)) {
    throw new RangeError(
      `Unsupported target project schema version: ${schemaVersion}.`,
    );
  }
  if (schemaVersion === V2_PROJECT_SCHEMA_VERSION) {
    return normalizeProjectDocumentToV7(candidate);
  }
  const normalized = normalizeProjectDocument(candidate);
  if (normalized.project.schemaVersion === V2_PROJECT_SCHEMA_VERSION) {
    throw new RangeError(
      "This V7 project is unavailable in the current Studio version and was not modified.",
    );
  }
  return normalized;
}

export function createProjectIdentifier(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (randomUUID) return `project-${randomUUID()}`;
  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeProjectDocument(candidate) {
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
  return Object.freeze({
    format: PROJECT_DOCUMENT_FORMAT,
    documentVersion: PROJECT_DOCUMENT_VERSION,
    id: candidate.id,
    revision: candidate.revision,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    project: normalizeProject(candidate.project),
  });
}

export function createProjectDocument(project, {
  id = createProjectIdentifier(),
  now = new Date().toISOString(),
} = {}) {
  return normalizeProjectDocument({
    format: PROJECT_DOCUMENT_FORMAT,
    documentVersion: PROJECT_DOCUMENT_VERSION,
    id,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    project,
  });
}

export function reviseProjectDocument(document, project, {
  now = new Date().toISOString(),
} = {}) {
  const current = normalizeProjectDocument(document);
  return normalizeProjectDocument({
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    project,
  });
}

export function copyProjectDocument(document, {
  id = createProjectIdentifier(),
  now = new Date().toISOString(),
  title,
} = {}) {
  const source = normalizeProjectDocument(document);
  const project = clone(source.project);
  if (title !== undefined) project.metadata.title = title;
  return createProjectDocument(project, { id, now });
}

export function parseProjectDocument(text) {
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
  return normalizeProjectDocument(candidate);
}

export function parseProjectDocumentToV7(text) {
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
  return normalizeProjectDocumentToV7(candidate);
}

export function serializeProjectDocument(document) {
  return `${JSON.stringify(normalizeProjectDocument(document), null, 2)}\n`;
}

export function serializeProjectDocumentToV7(document) {
  return `${JSON.stringify(normalizeProjectDocumentToV7(document), null, 2)}\n`;
}

function summarizeNormalizedProjectDocument(normalized) {
  return Object.freeze({
    availability: "ready",
    id: normalized.id,
    revision: normalized.revision,
    schemaVersion: normalized.project.schemaVersion,
    title: normalized.project.metadata.title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  });
}

export function summarizeProjectDocument(document) {
  return summarizeNormalizedProjectDocument(normalizeProjectDocument(document));
}

export function summarizeUnavailableProjectDocument(candidate, error) {
  const id = typeof candidate?.id === "string" && candidate.id.trim()
    ? candidate.id
    : null;
  const title = typeof candidate?.project?.metadata?.title === "string"
    && candidate.project.metadata.title.trim()
    ? candidate.project.metadata.title.slice(0, 100)
    : "Unavailable project";
  return Object.freeze({
    availability: "unavailable",
    id,
    revision: Number.isInteger(candidate?.revision) && candidate.revision >= 0
      ? candidate.revision
      : null,
    title,
    createdAt: typeof candidate?.createdAt === "string" ? candidate.createdAt : null,
    updatedAt: typeof candidate?.updatedAt === "string" ? candidate.updatedAt : null,
    schemaVersion: Number.isInteger(candidate?.project?.schemaVersion)
      ? candidate.project.schemaVersion
      : null,
    sourceSchemaVersion: Number.isInteger(candidate?.project?.schemaVersion)
      ? candidate.project.schemaVersion
      : null,
    reason: error instanceof Error ? error.message : "This project cannot be opened safely.",
  });
}

export function summarizeProjectDocumentForSchema(document, schemaVersion) {
  try {
    return summarizeNormalizedProjectDocument(
      normalizeProjectDocumentForSchema(document, schemaVersion),
    );
  } catch (error) {
    return summarizeUnavailableProjectDocument(document, error);
  }
}
