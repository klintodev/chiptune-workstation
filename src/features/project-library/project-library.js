import {
  downloadProjectFile,
  downloadRawProjectFile,
} from "../../persistence/project-download.js";
import { queryRequired } from "../../shared/query-required.js";
import { announceStatus, setTextIfChanged } from "../../shared/status-announcer.js";

const STATUS_LABELS = Object.freeze({
  error: "Save failed",
  saved: "Saved",
  saving: "Saving...",
  unavailable: "Not saved",
  unsaved: "Unsaved",
});

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function getProjectLibraryRowModel(summary, activeId = null) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new TypeError("A project summary must be an object.");
  }
  const id = typeof summary.id === "string" && summary.id.trim() ? summary.id : null;
  const recoveryKey = summary.storageKey !== undefined && summary.storageKey !== null
    ? summary.storageKey
    : id;
  const unavailable = summary.availability === "unavailable";
  const title = typeof summary.title === "string" && summary.title.trim()
    ? summary.title
    : "Unavailable project";
  const updatedAt = formatUpdatedAt(summary.updatedAt);
  const reason = typeof summary.reason === "string" && summary.reason.trim()
    ? summary.reason.trim()
    : "This record cannot be opened safely.";
  return Object.freeze({
    availability: unavailable ? "unavailable" : "ready",
    canDelete: !unavailable && id !== null,
    canOpen: !unavailable && id !== null,
    canRecover: unavailable && recoveryKey !== null,
    id,
    isActive: !unavailable && id !== null && id === activeId,
    meta: unavailable
      ? `Unavailable \u00b7 ${updatedAt} \u00b7 ${reason.slice(0, 160)}`
      : `Edited ${updatedAt}`,
    reason,
    recoveryKey,
    title,
  });
}

export async function downloadUnavailableProjectRecovery(summary, {
  downloadRecoveryProject = downloadRawProjectFile,
  persistence,
} = {}) {
  const model = getProjectLibraryRowModel(summary);
  if (model.availability !== "unavailable" || !model.canRecover) {
    throw new RangeError("Only an unavailable stored record can be downloaded as a raw recovery copy.");
  }
  if (typeof persistence?.getRawRecoveryText !== "function") {
    throw new Error("A raw recovery copy is not available for this record.");
  }
  const text = await persistence.getRawRecoveryText(model.recoveryKey);
  return downloadRecoveryProject(text, model.title);
}

export function createProjectLibraryFeature({
  downloadProject = downloadProjectFile,
  downloadRecoveryProject = downloadRawProjectFile,
  onBeforeProjectChange = () => {},
  onProjectDeleted = async () => {},
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
    librarySaveStatus: queryRequired(root, "#project-library-save-status"),
    list: queryRequired(root, "#project-list"),
    name: queryRequired(root, "#project-name-input"),
    create: queryRequired(root, "#project-new"),
    open: queryRequired(root, "#project-library-open"),
    saveStatus: queryRequired(root, "#project-save-status"),
    storageRecovery: queryRequired(root, "#project-storage-recovery"),
    recoveryDownload: queryRequired(root, "#project-recovery-download"),
    backupDownload: queryRequired(root, "#project-backup-download"),
    storageMessage: queryRequired(root, "#project-storage-message"),
    title: queryRequired(root, "#project-title"),
  };
  let busy = false;
  let previousPersistenceStatus = persistence.getState().status;
  let pendingDelete = null;
  let projectSummaries = new Map();
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
    elements.open.title = `Open song shelf \u00b7 ${project.metadata.title} \u00b7 ${STATUS_LABELS[state.status] ?? state.status}`;
    if (state.status !== previousPersistenceStatus) {
      previousPersistenceStatus = state.status;
      if (state.status === "saved") announceStatus(root, "Saved");
      if (state.status === "error" || state.status === "unavailable") {
        announceStatus(root, `Error: ${state.error?.message ?? "Project could not be saved."}`);
      }
    }
    if (root.activeElement !== elements.name) elements.name.value = project.metadata.title;
    const needsRecovery = !state.persistent || state.status === "error";
    elements.storageRecovery.hidden = !needsRecovery;
    if (!state.persistent) {
      setTextIfChanged(elements.storageMessage, `Browser storage is unavailable. This session will not survive a reload.${state.error?.message ? ` ${state.error.message}` : ""}`);
    } else if (state.status === "error") {
      setTextIfChanged(elements.storageMessage, `Automatic saving failed. Your current edits are still available in this tab.${state.error?.message ? ` ${state.error.message}` : ""}`);
    } else {
      setTextIfChanged(elements.storageMessage, "Songs save automatically in this browser. Use Export project here to keep a backup with your notes, sounds and arrangement.");
    }
  }

  function createProjectRow(summary, activeId, summaryKey) {
    const model = getProjectLibraryRowModel(summary, activeId);
    const row = root.createElement("div");
    row.className = "project-list-row";
    row.classList.toggle("active", model.isActive);
    row.classList.toggle("unavailable", model.availability === "unavailable");
    row.dataset.availability = model.availability;
    row.dataset.projectId = model.id ?? "";

    const title = root.createElement("strong");
    title.textContent = model.title;
    const meta = root.createElement("span");
    meta.textContent = model.meta;

    if (model.canOpen) {
      const open = root.createElement("button");
      open.type = "button";
      open.className = "project-list-open";
      open.dataset.action = "open-project";
      open.dataset.projectId = model.id;
      open.dataset.summaryKey = summaryKey;
      open.setAttribute("aria-current", model.isActive ? "true" : "false");
      open.setAttribute("aria-label", `Open ${model.title}${model.isActive ? ", current song" : ""}`);
      const art = root.createElement("span");
      art.className = "song-cover";
      art.setAttribute("aria-hidden", "true");
      // Stable artwork belongs to the song ID, so renaming never changes its cover.
      const seed = Array.from(model.id).reduce((value, character) => ((value * 31) + character.codePointAt(0)) >>> 0, 0);
      art.dataset.cover = String(seed % 4);
      const cassette = root.createElement("span");
      cassette.className = "song-cassette";
      const label = root.createElement("span");
      label.textContent = "PIP / " + String((seed % 90) + 10);
      cassette.append(label);
      art.append(cassette);
      const state = root.createElement("span");
      state.className = "song-card-state";
      state.textContent = model.isActive ? "Current song" : "Open song \u2197";
      open.append(art, state, title, meta);

      const actions = root.createElement("div");
      actions.className = "song-card-actions";
      const rename = root.createElement("button");
      rename.type = "button";
      rename.className = "project-list-rename";
      rename.dataset.action = "rename-project";
      rename.dataset.projectId = model.id;
      rename.dataset.summaryKey = summaryKey;
      rename.setAttribute("aria-label", `Rename ${model.title}`);
      rename.textContent = "Rename";

      const remove = root.createElement("button");
      remove.type = "button";
      remove.className = "project-list-delete";
      remove.dataset.action = "delete-project";
      remove.dataset.projectId = model.id;
      remove.dataset.summaryKey = summaryKey;
      remove.setAttribute("aria-label", `Delete ${model.title}`);
      remove.title = `Delete ${model.title}`;
      remove.textContent = "\u00d7";
      actions.append(rename, remove);
      row.append(open, actions);
      return row;
    }

    const details = root.createElement("div");
    details.className = "project-list-open project-list-unavailable-summary";
    details.setAttribute("aria-label", `${model.title}. ${model.meta}`);
    details.append(title, meta);

    const recover = root.createElement("button");
    recover.type = "button";
    recover.className = "project-list-recover";
    recover.disabled = !model.canRecover;
    if (model.canRecover) {
      recover.dataset.action = "recover-project";
      recover.dataset.summaryKey = summaryKey;
    }
    recover.setAttribute("aria-label", `Download raw recovery copy for ${model.title}`);
    recover.title = `Download raw recovery copy for ${model.title}`;
    recover.textContent = "\u2193";
    row.append(details, recover);
    return row;
  }

  async function renderLibrary() {
    const generation = ++renderGeneration;
    renderHeader();
    try {
      const projects = await persistence.listProjects();
      if (generation !== renderGeneration) return;
      const activeId = persistence.getActiveDocument().id;
      const entries = projects.map((summary, index) => [`${generation}:${index}`, summary]);
      projectSummaries = new Map(entries);
      const focused = elements.list.contains(root.activeElement) ? root.activeElement?.dataset : null;
      elements.list.replaceChildren(...entries.map(([summaryKey, summary]) => (
        createProjectRow(summary, activeId, summaryKey)
      )));
      for (const button of elements.list.querySelectorAll("button")) {
        if (busy) button.disabled = true;
        if (focused?.projectId && button.dataset.projectId === focused.projectId
          && button.dataset.action === focused.action) button.focus({ preventScroll: true });
      }
      elements.count.value = `${projects.length} song${projects.length === 1 ? "" : "s"}`;
      showError("");
    } catch (error) {
      if (generation !== renderGeneration) return;
      showError(`Could not load local projects. ${error.message}`);
    }
  }

  function setBusy(value) {
    busy = value;
    elements.list.setAttribute("aria-busy", String(value));
    for (const element of [
      elements.close,
      elements.create,
      elements.duplicate,
      elements.name,
      elements.recoveryDownload,
      elements.backupDownload,
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
    elements.close.focus();
  }

  function downloadActiveProject() {
    if (busy) return false;
    try {
      const project = projectState.getState();
      downloadProject(persistence.getExportText(), project.metadata.title);
      showError("");
      return true;
    } catch (error) {
      showError(error.message || "The project file could not be downloaded.");
      return false;
    }
  }

  function closeDeleteDialog({ reopenLibrary = true } = {}) {
    if (elements.deleteDialog.open) elements.deleteDialog.close();
    pendingDelete = null;
    if (reopenLibrary) openLibrary();
  }

  function requestDelete(summary) {
    pendingDelete = summary;
    elements.deleteMessage.textContent = `Delete "${summary.title}" from this browser? This cannot be undone.`;
    if (elements.dialog.open) elements.dialog.close();
    elements.deleteDialog.showModal();
    elements.cancelDelete.focus();
  }

  elements.open.addEventListener("click", openLibrary, { signal: lifecycle.signal });
  elements.close.addEventListener("click", () => elements.dialog.close(), { signal: lifecycle.signal });
  elements.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    elements.dialog.close();
  }, { signal: lifecycle.signal });
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
  elements.recoveryDownload.addEventListener("click", downloadActiveProject, { signal: lifecycle.signal });
  elements.backupDownload.addEventListener("click", downloadActiveProject, { signal: lifecycle.signal });
  elements.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const summary = projectSummaries.get(button.dataset.summaryKey);
    const projectId = summary?.id ?? button.dataset.projectId;

    if (button.dataset.action === "recover-project") {
      if (summary?.availability !== "unavailable") return;
      void run(() => downloadUnavailableProjectRecovery(summary, {
        downloadRecoveryProject,
        persistence,
      }));
      return;
    }

    if (["open-project", "rename-project"].includes(button.dataset.action)) {
      if (!summary || summary.availability === "unavailable") {
        showError("This project is unavailable for editing. Download its raw recovery copy instead.");
        return;
      }
      const rename = button.dataset.action === "rename-project";
      const focusName = () => {
        if (!elements.dialog.open) return;
        elements.name.focus();
        elements.name.select();
      };
      if (projectId === persistence.getActiveDocument().id) {
        if (rename) focusName();
        else elements.dialog.close();
        return;
      }
      void run(async () => {
        onBeforeProjectChange();
        await persistence.openProject(projectId);
      }, { closeAfter: !rename }).then((completed) => {
        if (completed && rename) focusName();
      });
      return;
    }

    if (button.dataset.action === "delete-project") {
      if (!summary || summary.availability === "unavailable") {
        showError("Unavailable records are preserved for recovery and cannot be deleted here.");
        return;
      }
      void run(async () => {
        const projects = await persistence.listProjects();
        const current = projects.find(({ id }) => id === projectId);
        if (elements.dialog.open && current && current.availability !== "unavailable") requestDelete(current);
      });
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
    void persistence.deleteProject(projectId).then(() => onProjectDeleted(projectId)).then(async () => {
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
    downloadActiveProject,
    dispose: () => lifecycle.abort(),
    render: renderHeader,
  });
}
