import {
  copyProjectDocument,
  createProjectDocument,
  createProjectIdentifier,
  normalizeProjectDocument,
  parseProjectDocument,
  reviseProjectDocument,
  serializeProjectDocument,
} from "./project-document.js?v=20260722-1";
import { createDefaultProject } from "../state/project-state.js";

function uniqueTitle(base, summaries) {
  const titles = new Set(summaries.map(({ title }) => title));
  if (!titles.has(base)) return base;
  let suffix = 2;
  while (titles.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export async function loadInitialProjectDocument({
  createId = createProjectIdentifier,
  now = () => new Date().toISOString(),
  preferences,
  repository,
} = {}) {
  const preferredId = preferences?.getLastProjectId?.();
  if (preferredId) {
    try {
      const preferred = await repository.get(preferredId);
      if (preferred) return preferred;
    } catch {
      // Fall through to the most recent valid project.
    }
  }
  const projects = await repository.list();
  if (projects.length > 0) {
    const recent = await repository.get(projects[0].id);
    if (recent) {
      preferences?.setLastProjectId?.(recent.id);
      return recent;
    }
  }
  const document = createProjectDocument(createDefaultProject(), { id: createId(), now: now() });
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
  let activeDocument = normalizeProjectDocument(initialDocument);
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
      activeDocument = normalizeProjectDocument(saved);
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

  async function activate(document, { flushCurrent = true } = {}) {
    const target = normalizeProjectDocument(document);
    if (flushCurrent) await saveNow();
    suppressAutosave = true;
    try {
      projectState.replace(target.project, { operation: "open-project", projectId: target.id });
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
    const document = await repository.get(id);
    if (!document) throw new RangeError("That local project no longer exists.");
    return activate(document, { flushCurrent: false });
  }

  async function createProject(title = "Untitled chiptune") {
    await saveNow();
    const summaries = await repository.list();
    const project = JSON.parse(JSON.stringify(createDefaultProject()));
    project.metadata.title = uniqueTitle(title, summaries);
    const document = createProjectDocument(project, { id: createId(), now: now() });
    const saved = await repository.save(document);
    return activate(saved, { flushCurrent: false });
  }

  async function duplicateProject() {
    await saveNow();
    const summaries = await repository.list();
    const title = uniqueTitle(`${activeDocument.project.metadata.title} copy`, summaries);
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
    if (remaining.length > 0) {
      const next = await repository.get(remaining[0].id);
      return activate(next, { flushCurrent: false });
    }
    return createProject();
  }

  async function importProject(text) {
    let imported = parseProjectDocument(text);
    await saveNow();
    const existing = await repository.get(imported.id);
    if (existing) {
      const summaries = await repository.list();
      imported = copyProjectDocument(imported, {
        id: createId(),
        now: now(),
        title: uniqueTitle(`${imported.project.metadata.title} imported`, summaries),
      });
    }
    const saved = await repository.save(imported);
    return activate(saved, { flushCurrent: false });
  }

  async function exportProject() {
    await saveNow();
    return serializeProjectDocument(activeDocument);
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
    getState,
    hasUnsavedChanges,
    importProject,
    listProjects,
    openProject,
    removeEventListener: events.removeEventListener.bind(events),
    saveNow,
  });
}
