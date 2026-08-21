import { createBoundedUniqueName } from "../../shared/bounded-name.js";
import {
  PROJECT_SCHEMA_VERSION,
  createDefaultV2Project,
} from "../domain/schema.js";
import {
  copyV2ProjectDocument,
  createV2ProjectDocument,
  createV2ProjectIdentifier,
  normalizeV2ProjectDocument,
  parseV2ProjectDocument,
  reviseV2ProjectDocument,
  serializeV2ProjectDocument,
} from "./project-document.js";

const MAX_PROJECT_TITLE_LENGTH = 100;

function uniqueTitle(base, summaries, { fallback = "Untitled chiptune", suffix = "" } = {}) {
  return createBoundedUniqueName(
    base,
    summaries.filter(({ availability }) => availability === "ready").map(({ title }) => title),
    { fallback, maximumLength: MAX_PROJECT_TITLE_LENGTH, suffix },
  );
}

export async function loadInitialV2ProjectDocument({
  createId = createV2ProjectIdentifier,
  now = () => new Date().toISOString(),
  onSourceSchema = () => {},
  preferences,
  repository,
} = {}) {
  async function readCandidate(id) {
    const raw = await repository.getRaw?.(id);
    const candidate = raw ?? await repository.get(id);
    if (!candidate) return null;
    const normalized = normalizeV2ProjectDocument(candidate);
    onSourceSchema(Object.freeze({
      projectId: normalized.id,
      sourceSchemaVersion: Number.isInteger(candidate?.project?.schemaVersion)
        ? candidate.project.schemaVersion
        : normalized.project.schemaVersion,
    }));
    return normalized;
  }

  const preferredId = preferences?.getLastProjectId?.();
  if (preferredId) {
    try {
      const preferred = await readCandidate(preferredId);
      if (preferred) return preferred;
    } catch {
      // Unsupported records remain listed for recovery but never activate.
    }
  }
  const projects = await repository.list();
  for (const summary of projects) {
    if (summary.availability !== "ready" || !summary.id) continue;
    try {
      const recent = await readCandidate(summary.id);
      if (recent) {
        preferences?.setLastProjectId?.(recent.id);
        return recent;
      }
    } catch {
      // Continue to another valid record without hiding the failed summary.
    }
  }
  const document = createV2ProjectDocument(createDefaultV2Project(), {
    id: createId(),
    now: now(),
  });
  const saved = await repository.save(document);
  onSourceSchema(Object.freeze({
    projectId: saved.id,
    sourceSchemaVersion: saved.project.schemaVersion,
  }));
  preferences?.setLastProjectId?.(saved.id);
  return saved;
}

export function createV2ProjectPersistence({
  autosaveDelay = 400,
  clearTimer = globalThis.clearTimeout,
  createId = createV2ProjectIdentifier,
  initialDocument,
  initialError = null,
  initialSourceSchemaVersion = initialDocument?.project?.schemaVersion,
  now = () => new Date().toISOString(),
  onProjectUpgrade = () => {},
  persistent = true,
  preferences,
  projectState,
  repository,
  setTimer = globalThis.setTimeout,
}) {
  const events = new EventTarget();
  let activeDocument = normalizeV2ProjectDocument(initialDocument);
  let autosaveTimer = null;
  let changeGeneration = 0;
  let dirty = false;
  let disposed = false;
  let savePromise = null;
  let status = persistent ? "saved" : "unavailable";
  let statusError = initialError;
  let suppressAutosave = false;
  let volatileChanges = false;
  let pendingUpgradeSource = Number.isInteger(initialSourceSchemaVersion)
    && initialSourceSchemaVersion >= 1
    && initialSourceSchemaVersion < PROJECT_SCHEMA_VERSION
    ? initialSourceSchemaVersion
    : null;

  function getState() {
    return Object.freeze({
      document: activeDocument,
      dirty,
      error: statusError,
      persistent,
      status,
    });
  }

  function emitChange(type = "status", detail = {}) {
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ ...getState(), type, ...detail }),
    }));
  }

  function setStatus(nextStatus, error = null, type = "status", detail = {}) {
    status = persistent ? nextStatus : "unavailable";
    statusError = error;
    emitChange(type, detail);
  }

  function recordCommittedUpgrade(projectId, sourceSchemaVersion = pendingUpgradeSource) {
    if (!Number.isInteger(sourceSchemaVersion)
      || sourceSchemaVersion < 1
      || sourceSchemaVersion >= PROJECT_SCHEMA_VERSION) return null;
    if (projectId === activeDocument.id) pendingUpgradeSource = null;
    const detail = Object.freeze({ fromSchemaVersion: sourceSchemaVersion, projectId });
    try {
      onProjectUpgrade(detail);
    } catch {
      // A disclosure preference failure must never turn a successful Project save into a failure.
    }
    return detail;
  }

  function cancelScheduledSave() {
    if (autosaveTimer === null) return;
    clearTimer(autosaveTimer);
    autosaveTimer = null;
  }

  function scheduleSave() {
    cancelScheduledSave();
    if (disposed) return false;
    autosaveTimer = setTimer(() => {
      autosaveTimer = null;
      void saveNow().catch(() => {});
    }, autosaveDelay);
    return true;
  }

  async function saveNow(options = {}) {
    const commitUpgrade = options?.commitUpgrade === true;
    cancelScheduledSave();
    if (savePromise) {
      await savePromise;
      if (!dirty && (!commitUpgrade || pendingUpgradeSource === null)) return activeDocument;
    }
    if (!dirty && (!commitUpgrade || pendingUpgradeSource === null)) return activeDocument;
    const generation = changeGeneration;
    const hadDirtyChanges = dirty;
    const candidate = reviseV2ProjectDocument(activeDocument, projectState.getState(), {
      now: now(),
    });
    setStatus("saving");
    savePromise = repository.save(candidate);
    try {
      const saved = await savePromise;
      activeDocument = normalizeV2ProjectDocument(saved, { migrate: false });
      preferences?.setLastProjectId?.(activeDocument.id);
      const upgradeDetail = recordCommittedUpgrade(activeDocument.id);
      if (generation === changeGeneration) {
        dirty = false;
        setStatus("saved", null, "saved", upgradeDetail ?? {});
      } else {
        setStatus("unsaved", null, "unsaved", upgradeDetail ?? {});
        scheduleSave();
      }
      return activeDocument;
    } catch (error) {
      dirty = hadDirtyChanges || generation !== changeGeneration;
      setStatus("error", error, "error");
      throw error;
    } finally {
      savePromise = null;
    }
  }

  function handleProjectChange(event) {
    if (disposed || suppressAutosave) return;
    if (event?.detail?.transient === true || event?.detail?.committed === false) return;
    changeGeneration += 1;
    dirty = true;
    volatileChanges = true;
    setStatus("unsaved");
    scheduleSave();
  }

  projectState.addEventListener("change", handleProjectChange);

  async function activate(document, {
    detail = {},
    flushCurrent = true,
    sourceSchemaVersion = document?.project?.schemaVersion,
  } = {}) {
    const target = normalizeV2ProjectDocument(document);
    if (flushCurrent) await saveNow();
    suppressAutosave = true;
    try {
      projectState.replace(target.project, {
        operation: "open-project",
        projectId: target.id,
        ...detail,
      });
    } finally {
      suppressAutosave = false;
    }
    activeDocument = target;
    pendingUpgradeSource = Number.isInteger(sourceSchemaVersion)
      && sourceSchemaVersion >= 1
      && sourceSchemaVersion < PROJECT_SCHEMA_VERSION
      ? sourceSchemaVersion
      : null;
    changeGeneration += 1;
    dirty = false;
    volatileChanges = false;
    preferences?.setLastProjectId?.(target.id);
    setStatus("saved", null, "project");
    return target;
  }

  async function listProjects() {
    return repository.list();
  }

  async function openProject(id) {
    if (id === activeDocument.id) return activeDocument;
    await saveNow();
    try {
      const raw = await repository.getRaw?.(id);
      const document = raw ?? await repository.get(id);
      if (!document) throw new RangeError("That local project no longer exists.");
      return await activate(document, {
        flushCurrent: false,
        sourceSchemaVersion: document?.project?.schemaVersion,
      });
    } catch (error) {
      throw new Error(
        "This project is unavailable for editing. Download its recovery copy to preserve the original.",
        { cause: error },
      );
    }
  }

  async function createProject(title = "Untitled chiptune") {
    await saveNow();
    const summaries = await repository.list();
    const project = JSON.parse(JSON.stringify(createDefaultV2Project()));
    project.metadata.title = uniqueTitle(title, summaries);
    const document = createV2ProjectDocument(project, { id: createId(), now: now() });
    const saved = await repository.save(document);
    return activate(saved, {
      flushCurrent: false,
      sourceSchemaVersion: PROJECT_SCHEMA_VERSION,
    });
  }

  async function createProjectFromTemplate(project) {
    await saveNow();
    const summaries = await repository.list();
    const template = JSON.parse(JSON.stringify(project));
    template.metadata.title = uniqueTitle(template.metadata.title, summaries);
    const document = createV2ProjectDocument(template, { id: createId(), now: now() });
    const saved = await repository.save(document);
    return activate(saved, {
      detail: { operation: "create-project-from-template" },
      flushCurrent: false,
      sourceSchemaVersion: PROJECT_SCHEMA_VERSION,
    });
  }

  async function duplicateProject() {
    await saveNow();
    const summaries = await repository.list();
    const title = uniqueTitle(projectState.getState().metadata.title, summaries, { suffix: "copy" });
    const source = reviseV2ProjectDocument(activeDocument, projectState.getState(), { now: now() });
    const copy = copyV2ProjectDocument(source, { id: createId(), now: now(), title });
    const saved = await repository.save(copy);
    return activate(saved, {
      flushCurrent: false,
      sourceSchemaVersion: PROJECT_SCHEMA_VERSION,
    });
  }

  async function deleteProject(id) {
    await saveNow();
    const deletingActive = id === activeDocument.id;
    await repository.delete(id);
    if (!deletingActive) {
      emitChange("library");
      return activeDocument;
    }
    const remaining = await repository.list();
    for (const summary of remaining) {
      if (summary.availability !== "ready" || !summary.id) continue;
      const raw = await repository.getRaw?.(summary.id);
      const next = raw ?? await repository.get(summary.id);
      if (next) return activate(next, {
        flushCurrent: false,
        sourceSchemaVersion: next?.project?.schemaVersion,
      });
    }
    return createProject();
  }

  async function importProject(text) {
    let source;
    try {
      source = JSON.parse(text);
    } catch {
      // parseV2ProjectDocument supplies the stable import error below.
    }
    const sourceSchemaVersion = source?.project?.schemaVersion;
    let imported = parseV2ProjectDocument(text);
    await saveNow();
    const existing = await repository.getRaw?.(imported.id);
    if (existing) {
      const summaries = await repository.list();
      imported = copyV2ProjectDocument(imported, {
        id: createId(),
        now: now(),
        title: uniqueTitle(imported.project.metadata.title, summaries, { suffix: "imported" }),
      });
    }
    const saved = await repository.save(imported);
    const upgradeDetail = recordCommittedUpgrade(saved.id, sourceSchemaVersion);
    return activate(saved, {
      detail: upgradeDetail ?? {},
      flushCurrent: false,
      sourceSchemaVersion: PROJECT_SCHEMA_VERSION,
    });
  }

  async function exportProject() {
    await saveNow();
    return serializeV2ProjectDocument(activeDocument);
  }

  async function replaceActiveProject(project, detail = {}) {
    await saveNow();
    const candidate = reviseV2ProjectDocument(activeDocument, project, { now: now() });
    const saved = await repository.save(candidate);
    const upgradeDetail = recordCommittedUpgrade(saved.id);
    return activate(saved, {
      detail: { ...detail, ...(upgradeDetail ?? {}) },
      flushCurrent: false,
      sourceSchemaVersion: PROJECT_SCHEMA_VERSION,
    });
  }

  async function getRawRecoveryText(id) {
    const raw = await repository.getRaw?.(id);
    if (!raw) throw new RangeError("That recovery record no longer exists.");
    return `${JSON.stringify(raw, null, 2)}\n`;
  }

  function getExportText() {
    const document = dirty
      ? reviseV2ProjectDocument(activeDocument, projectState.getState(), { now: now() })
      : activeDocument;
    return serializeV2ProjectDocument(document);
  }

  function hasUnsavedChanges() {
    return dirty || (!persistent && volatileChanges);
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    createProject,
    createProjectFromTemplate,
    deleteProject,
    async dispose() {
      if (disposed) return false;
      disposed = true;
      cancelScheduledSave();
      projectState.removeEventListener("change", handleProjectChange);
      try {
        await saveNow();
      } finally {
        cancelScheduledSave();
      }
      return true;
    },
    duplicateProject,
    exportProject,
    getActiveDocument: () => activeDocument,
    getExportText,
    getPendingUpgradeSourceSchemaVersion: () => pendingUpgradeSource,
    getRawRecoveryText,
    getState,
    hasUnsavedChanges,
    importProject,
    listProjects,
    openProject,
    replaceActiveProject,
    removeEventListener: events.removeEventListener.bind(events),
    saveNow,
  });
}
