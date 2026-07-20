import { createProjectState } from "../state/project-state.js";

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
  return clone(createProjectState(project).getState());
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

export function serializeProjectDocument(document) {
  return `${JSON.stringify(normalizeProjectDocument(document), null, 2)}\n`;
}

export function summarizeProjectDocument(document) {
  const normalized = normalizeProjectDocument(document);
  return Object.freeze({
    id: normalized.id,
    revision: normalized.revision,
    title: normalized.project.metadata.title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  });
}