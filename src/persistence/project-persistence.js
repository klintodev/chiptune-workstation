import {
  copyProjectDocument,
  createProjectDocument,
  createProjectIdentifier,
  normalizeProjectDocument,
  normalizeProjectDocumentForSchema,
  parseProjectDocument,
  reviseProjectDocument,
  serializeProjectDocument,
} from "./project-document.js";
import { createBoundedUniqueName } from "../shared/bounded-name.js";
import {
  MAX_PROJECT_TITLE_LENGTH,
  PROJECT_SCHEMA_VERSION as LEGACY_PROJECT_SCHEMA_VERSION,
  createDefaultProject,
} from "../state/project-state.js";
import {
  PROJECT_SCHEMA_VERSION as V2_PROJECT_SCHEMA_VERSION,
  createDefaultV2Project,
} from "../v2/domain/schema.js";

function uniqueTitle(base, summaries, { fallback = "Untitled chiptune", suffix = "" } = {}) {
  return createBoundedUniqueName(
    base,
    summaries
      .filter(({ availability }) => availability !== "unavailable")
      .map(({ title }) => title),
    { fallback, maximumLength: MAX_PROJECT_TITLE_LENGTH, suffix },
  );
}

export async function loadInitialProjectDocument({
  createId = createProjectIdentifier,
  now = () => new Date().toISOString(),
  preferences,
  repository,
  targetSchemaVersion = LEGACY_PROJECT_SCHEMA_VERSION,
} = {}) {
  const preferredId = preferences?.getLastProjectId?.();
  if (preferredId) {
    try {
      const preferred = await repository.get(preferredId);
      if (preferred) {
        return normalizeProjectDocumentForSchema(preferred, targetSchemaVersion);
      }
    } catch {
      // Fall through to the most recent valid project.
    }
  }
  const projects = await repository.list();
  for (const summary of projects) {
    if (
      summary.availability === "unavailable"
      && summary.schemaVersion !== targetSchemaVersion
    ) continue;
    try {
      const recent = await repository.get(summary.id);
      if (recent) {
        const compatible = normalizeProjectDocumentForSchema(recent, targetSchemaVersion);
        preferences?.setLastProjectId?.(compatible.id);
        return compatible;
      }
    } catch {
      // Keep unsupported records listed and untouched; continue to an activatable Project.
    }
  }
  const project = targetSchemaVersion === V2_PROJECT_SCHEMA_VERSION
    ? createDefaultV2Project()
    : createDefaultProject();
  const document = createProjectDocument(project, { id: createId(), now: now() });
  await repository.save(document);
  preferences?.setLastProjectId?.(document.id);
  return document;
}

export function createProjectPersistence({
  autosaveDelay = 400,
  clearTimer = globalThis.clearTimeout,
  createId = createProjectIdentifier,
  initialDocument,
  initialError = null,
  now = () => new Date().toISOString(),
  persistent = true,
  preferences,
  projectState,
  repository,
  setTimer = globalThis.setTimeout,
}) {
  const events = new EventTarget();
  const runtimeSchemaVersion = projectState.getState().schemaVersion;

  function normalizeForRuntime(document) {
    return normalizeProjectDocumentForSchema(document, runtimeSchemaVersion);
  }

  let activeDocument = normalizeForRuntime(initialDocument);
  let autosaveTimer = null;
  let changeGeneration = 0;
  let dirty = false;
  let disposed = false;
  let savePromise = null;
  let status = persistent ? "saved" : "unavailable";
  let statusError = initialError;
  let suppressAutosave = false;
  let volatileChanges = false;

  function getState() {
    return Object.freeze({
      document: activeDocument,
      dirty,
      error: statusError,
      persistent,
      status,
    });
  }

  function emitChange(type = "status") {
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ ...getState(), type }),
    }));
  }

  function setStatus(nextStatus, error = null, type = "status") {
    status = persistent ? nextStatus : "unavailable";
    statusError = error;
    emitChange(type);
  }

  function cancelScheduledSave() {
    if (autosaveTimer === null) return;
    clearTimer(autosaveTimer);
    autosaveTimer = null;
  }

  function scheduleSave() {
    cancelScheduledSave();
    autosaveTimer = setTimer(() => {
      autosaveTimer = null;
      void saveNow().catch(() => {});
    }, autosaveDelay);
  }

  async function saveNow() {
    cancelScheduledSave();
    if (savePromise) {
      await savePromise;
      if (!dirty) return activeDocument;
    }
    if (!dirty) return activeDocument;
    const generation = changeGeneration;
    const candidate = reviseProjectDocument(activeDocument, projectState.getState(), { now: now() });
    setStatus("saving");
    savePromise = repository.save(candidate);
    try {
      const saved = await savePromise;
      activeDocument = normalizeForRuntime(saved);
      preferences?.setLastProjectId?.(activeDocument.id);
      if (generation === changeGeneration) {
        dirty = false;
        setStatus("saved", null, "saved");
      } else {
        setStatus("unsaved");
        scheduleSave();
      }
      return activeDocument;
    } catch (error) {
      dirty = true;
      setStatus("error", error, "error");
      throw error;
    } finally {
      savePromise = null;
    }
  }

  function handleProjectChange() {
    if (disposed || suppressAutosave) return;
    changeGeneration += 1;
    dirty = true;
    volatileChanges = true;
    setStatus("unsaved");
    scheduleSave();
  }

  projectState.addEventListener("change", handleProjectChange);

  async function activate(document, { detail = {}, flushCurrent = true } = {}) {
    const target = normalizeForRuntime(document);
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
      const document = await repository.get(id);
      if (!document) throw new RangeError("That local project no longer exists.");
      return await activate(document, { flushCurrent: false });
    } catch (error) {
      throw new Error(
        "This project is unavailable for editing. Download its raw recovery copy to preserve the original.",
        { cause: error },
      );
    }
  }

  async function createProject(title = "Untitled chiptune") {
    await saveNow();
    const summaries = await repository.list();
    const defaultProject = runtimeSchemaVersion === V2_PROJECT_SCHEMA_VERSION
      ? createDefaultV2Project()
      : createDefaultProject();
    const project = JSON.parse(JSON.stringify(defaultProject));
    project.metadata.title = uniqueTitle(title, summaries);
    const document = createProjectDocument(project, { id: createId(), now: now() });
    const saved = await repository.save(document);
    return activate(saved, { flushCurrent: false });
  }

  async function createProjectFromTemplate(project) {
    await saveNow();
    const summaries = await repository.list();
    const template = JSON.parse(JSON.stringify(project));
    template.metadata.title = uniqueTitle(template.metadata.title, summaries);
    const document = createProjectDocument(template, { id: createId(), now: now() });
    const saved = await repository.save(document);
    return activate(saved, {
      detail: { operation: "create-project-from-template" },
      flushCurrent: false,
    });
  }

  async function duplicateProject() {
    await saveNow();
    const summaries = await repository.list();
    const title = uniqueTitle(activeDocument.project.metadata.title, summaries, { suffix: "copy" });
    const copy = copyProjectDocument(activeDocument, { id: createId(), now: now(), title });
    const saved = await repository.save(copy);
    return activate(saved, { flushCurrent: false });
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
      if (
        summary.availability === "unavailable"
        && summary.schemaVersion !== runtimeSchemaVersion
      ) continue;
      try {
        const next = await repository.get(summary.id);
        if (next) return activate(next, { flushCurrent: false });
      } catch {
        // Preserve unavailable records and continue to another activatable Project.
      }
    }
    return createProject();
  }

  async function importProject(text) {
    let imported = normalizeForRuntime(parseProjectDocument(text));
    await saveNow();
    const existing = typeof repository.getRaw === "function"
      ? await repository.getRaw(imported.id)
      : await repository.get(imported.id);
    if (existing) {
      const summaries = await repository.list();
      imported = copyProjectDocument(imported, {
        id: createId(),
        now: now(),
        title: uniqueTitle(imported.project.metadata.title, summaries, { suffix: "imported" }),
      });
    }
    const saved = await repository.save(imported);
    return activate(saved, { flushCurrent: false });
  }

  async function exportProject() {
    await saveNow();
    return serializeProjectDocument(activeDocument);
  }

  async function replaceActiveProject(project, detail = {}) {
    await saveNow();
    const candidate = reviseProjectDocument(activeDocument, project, { now: now() });
    const saved = await repository.save(candidate);
    return activate(saved, { detail, flushCurrent: false });
  }

  async function getRawRecoveryText(id) {
    if (typeof repository.getRaw !== "function") {
      throw new Error("Raw project recovery is not supported by this storage provider.");
    }
    const raw = await repository.getRaw(id);
    if (!raw) throw new RangeError("That recovery record no longer exists.");
    return `${JSON.stringify(raw, null, 2)}\n`;
  }

  function getExportText() {
    const document = dirty
      ? reviseProjectDocument(activeDocument, projectState.getState(), { now: now() })
      : activeDocument;
    return serializeProjectDocument(document);
  }

  function hasUnsavedChanges() {
    return dirty || (!persistent && volatileChanges);
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    createProject,
    createProjectFromTemplate,
    deleteProject,
    dispose() {
      disposed = true;
      cancelScheduledSave();
      projectState.removeEventListener("change", handleProjectChange);
    },
    duplicateProject,
    exportProject,
    getActiveDocument: () => activeDocument,
    getExportText,
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
