import { MAX_PROJECT_FILE_BYTES } from "../../persistence/project-document.js?v=20260722-1";
import { queryRequired } from "../../shared/query-required.js";

const STATUS_LABELS = Object.freeze({
  error: "Save failed",
  saved: "Saved",
  saving: "Saving...",
  unavailable: "Not saved",
  unsaved: "Unsaved",
});

function formatUpdatedAt(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function createProjectLibraryFeature({
  onBeforeProjectChange = () => {},
  persistence,
  projectState,
  root = document,
}) {
  const lifecycle = new AbortController();
  const elements = {
    cancelDelete: queryRequired(root, "#project-delete-cancel"),
    close: queryRequired(root, "#project-library-close"),
    confirmDelete: queryRequired(root, "#project-delete-confirm"),
    count: queryRequired(root, "#project-library-count"),
    deleteDialog: queryRequired(root, "#project-delete-dialog"),
    deleteMessage: queryRequired(root, "#project-delete-message"),
    dialog: queryRequired(root, "#project-library-dialog"),
    duplicate: queryRequired(root, "#project-duplicate"),
    error: queryRequired(root, "#project-library-error"),
    import: queryRequired(root, "#project-import"),
    importFile: queryRequired(root, "#project-import-file"),
    librarySaveStatus: queryRequired(root, "#project-library-save-status"),
    list: queryRequired(root, "#project-list"),
    name: queryRequired(root, "#project-name-input"),
    create: queryRequired(root, "#project-new"),
    open: queryRequired(root, "#project-library-open"),
    saveStatus: queryRequired(root, "#project-save-status"),
    storageMessage: queryRequired(root, "#project-storage-message"),
    title: queryRequired(root, "#project-title"),
  };
  let busy = false;
  let pendingDelete = null;
  let renderGeneration = 0;

  function showError(message = "") {
    elements.error.textContent = message;
    elements.error.hidden = !message;
  }

  function renderHeader() {
    const project = projectState.getState();
    const state = persistence.getState();
    elements.title.value = project.metadata.title;
    elements.saveStatus.value = STATUS_LABELS[state.status] ?? state.status;
    elements.saveStatus.dataset.state = state.status;
    elements.librarySaveStatus.value = STATUS_LABELS[state.status] ?? state.status;
    elements.librarySaveStatus.dataset.state = state.status;
    elements.open.dataset.saveState = state.status;
    elements.open.title = `${project.metadata.title} · ${STATUS_LABELS[state.status] ?? state.status}`;
    if (root.activeElement !== elements.name) elements.name.value = project.metadata.title;
    elements.storageMessage.textContent = state.persistent
      ? "Projects are saved automatically in this browser."
      : `Browser storage is unavailable. This session will not survive a reload.${state.error?.message ? ` ${state.error.message}` : ""}`;
  }

  function createProjectRow(summary, activeId) {
    const row = root.createElement("div");
    row.className = "project-list-row";
    row.classList.toggle("active", summary.id === activeId);
    const open = root.createElement("button");
    open.type = "button";
    open.className = "project-list-open";
    open.dataset.action = "open-project";
    open.dataset.projectId = summary.id;
    open.setAttribute("aria-current", summary.id === activeId ? "true" : "false");
    const title = root.createElement("strong");
    title.textContent = summary.title;
    const meta = root.createElement("span");
    meta.textContent = `${formatUpdatedAt(summary.updatedAt)} · revision ${summary.revision}`;
    open.append(title, meta);
    const remove = root.createElement("button");
    remove.type = "button";
    remove.className = "project-list-delete";
    remove.dataset.action = "delete-project";
    remove.dataset.projectId = summary.id;
    remove.setAttribute("aria-label", `Delete ${summary.title}`);
    remove.title = `Delete ${summary.title}`;
    remove.textContent = "×";
    row.append(open, remove);
    return row;
  }

  async function renderLibrary() {
    const generation = ++renderGeneration;
    renderHeader();
    try {
      const projects = await persistence.listProjects();
      if (generation !== renderGeneration) return;
      const activeId = persistence.getActiveDocument().id;
      elements.list.replaceChildren(...projects.map((summary) => createProjectRow(summary, activeId)));
      elements.count.value = `${projects.length} project${projects.length === 1 ? "" : "s"}`;
      showError("");
    } catch (error) {
      if (generation !== renderGeneration) return;
      showError(`Could not load local projects. ${error.message}`);
    }
  }

  function setBusy(value) {
    busy = value;
    for (const element of [
      elements.close,
      elements.create,
      elements.duplicate,
      elements.import,
      elements.name,
    ]) {
      if ("disabled" in element) element.disabled = value;
      element.setAttribute("aria-disabled", String(value));
      element.classList.toggle("disabled", value);
    }
    for (const button of elements.list.querySelectorAll("button")) button.disabled = value;
  }

  async function run(action, { closeAfter = false } = {}) {
    if (busy) return false;
    setBusy(true);
    showError("");
    try {
      await action();
      await renderLibrary();
      if (closeAfter && elements.dialog.open) elements.dialog.close();
      return true;
    } catch (error) {
      showError(error.message || "The project action could not be completed.");
      return false;
    } finally {
      setBusy(false);
      renderHeader();
    }
  }

  function openLibrary() {
    void renderLibrary();
    if (!elements.dialog.open) elements.dialog.showModal();
  }

  function closeDeleteDialog({ reopenLibrary = true } = {}) {
    if (elements.deleteDialog.open) elements.deleteDialog.close();
    pendingDelete = null;
    if (reopenLibrary) openLibrary();
  }

  function requestDelete(summary) {
    pendingDelete = summary;
    elements.deleteMessage.textContent = `Delete “${summary.title}” from this browser? This cannot be undone.`;
    if (elements.dialog.open) elements.dialog.close();
    elements.deleteDialog.showModal();
    elements.cancelDelete.focus();
  }

  elements.open.addEventListener("click", openLibrary, { signal: lifecycle.signal });
  elements.close.addEventListener("click", () => elements.dialog.close(), { signal: lifecycle.signal });
  elements.dialog.addEventListener("cancel", () => elements.dialog.close(), { signal: lifecycle.signal });
  elements.name.addEventListener("focus", projectState.beginHistoryGroup, { signal: lifecycle.signal });
  elements.name.addEventListener("input", () => {
    if (elements.name.value.trim() === "") return;
    try {
      projectState.renameProject(elements.name.value);
      showError("");
    } catch (error) {
      showError(error.message);
    }
  }, { signal: lifecycle.signal });
  elements.name.addEventListener("blur", () => {
    projectState.endHistoryGroup();
    if (elements.name.value.trim() !== "") return;
    showError("Project must have a name.");
    renderHeader();
  }, { signal: lifecycle.signal });
  elements.name.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    elements.name.blur();
  }, { signal: lifecycle.signal });
  elements.create.addEventListener("click", () => void run(async () => {
    onBeforeProjectChange();
    await persistence.createProject();
  }, { closeAfter: true }), { signal: lifecycle.signal });
  elements.duplicate.addEventListener("click", () => void run(async () => {
    onBeforeProjectChange();
    await persistence.duplicateProject();
  }, { closeAfter: true }), { signal: lifecycle.signal });
  elements.import.addEventListener("click", () => elements.importFile.click(), { signal: lifecycle.signal });
  elements.importFile.addEventListener("change", () => void run(async () => {
    const [file] = elements.importFile.files;
    elements.importFile.value = "";
    if (!file) return;
    if (file.size > MAX_PROJECT_FILE_BYTES) throw new RangeError("Project file is larger than 2 MB.");
    const text = await file.text();
    onBeforeProjectChange();
    await persistence.importProject(text);
  }, { closeAfter: true }), { signal: lifecycle.signal });
  elements.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const projectId = button.dataset.projectId;
    if (button.dataset.action === "open-project") {
      if (projectId === persistence.getActiveDocument().id) {
        elements.dialog.close();
        return;
      }
      void run(async () => {
        onBeforeProjectChange();
        await persistence.openProject(projectId);
      }, { closeAfter: true });
      return;
    }
    if (button.dataset.action === "delete-project") {
      void persistence.listProjects().then((projects) => {
        const summary = projects.find(({ id }) => id === projectId);
        if (summary) requestDelete(summary);
      }).catch((error) => showError(error.message));
    }
  }, { signal: lifecycle.signal });
  elements.cancelDelete.addEventListener("click", () => closeDeleteDialog(), { signal: lifecycle.signal });
  elements.deleteDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDeleteDialog();
  }, { signal: lifecycle.signal });
  elements.confirmDelete.addEventListener("click", () => {
    if (!pendingDelete || busy) return;
    const projectId = pendingDelete.id;
    setBusy(true);
    onBeforeProjectChange();
    void persistence.deleteProject(projectId).then(async () => {
      if (elements.deleteDialog.open) elements.deleteDialog.close();
      pendingDelete = null;
      setBusy(false);
      openLibrary();
    }).catch((error) => {
      if (elements.deleteDialog.open) elements.deleteDialog.close();
      pendingDelete = null;
      setBusy(false);
      openLibrary();
      showError(error.message);
    });
  }, { signal: lifecycle.signal });

  const handleChange = () => {
    renderHeader();
    if (elements.dialog.open) void renderLibrary();
  };
  persistence.addEventListener("change", handleChange, { signal: lifecycle.signal });
  projectState.addEventListener("change", handleChange, { signal: lifecycle.signal });
  globalThis.addEventListener?.("beforeunload", (event) => {
    if (!persistence.hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  }, { signal: lifecycle.signal });

  renderHeader();
  return Object.freeze({
    dispose: () => lifecycle.abort(),
    render: renderHeader,
  });
}
