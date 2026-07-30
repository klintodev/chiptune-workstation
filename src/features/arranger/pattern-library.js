import { queryRequired } from "../../shared/query-required.js";
import { announceStatus } from "../../shared/status-announcer.js";

export function getPatternDeleteCopy(name, usage) {
  const clipLabel = `${usage} arrangement clip${usage === 1 ? "" : "s"}`;
  return Object.freeze({
    action: `Delete pattern and ${usage} clip${usage === 1 ? "" : "s"}`,
    message: `Delete “${name}”? ${clipLabel} will also be removed. This cannot be undone.`,
  });
}

export function createPatternLibrary({
  onBeforeSelectionChange = () => {},
  onError = () => {},
  projectState,
  root = document,
  sessionState,
}) {
  const lifecycle = new AbortController();
  const elements = {
    create: queryRequired(root, "#pattern-new"),
    delete: queryRequired(root, "#pattern-delete"),
    deleteCancel: queryRequired(root, "#pattern-delete-cancel"),
    deleteConfirm: queryRequired(root, "#pattern-delete-confirm"),
    deleteDialog: queryRequired(root, "#pattern-delete-dialog"),
    deleteMessage: queryRequired(root, "#pattern-delete-message"),
    name: queryRequired(root, "#pattern-name"),
    place: queryRequired(root, "#place-pattern"),
    placeStart: queryRequired(root, "#place-start"),
    placeTrack: queryRequired(root, "#place-track-name"),
    rootOctave: queryRequired(root, "#pattern-root-octave"),
    select: queryRequired(root, "#pattern-select"),
    usage: queryRequired(root, "#pattern-usage"),
    variation: queryRequired(root, "#pattern-variation"),
  };
  let pendingDelete = null;

  function closeDeleteDialog(restoreFocus = true) {
    if (elements.deleteDialog.open) elements.deleteDialog.close();
    pendingDelete = null;
    if (restoreFocus && elements.delete.isConnected) elements.delete.focus();
  }

  function requestDelete() {
    const { selectedPatternId } = getWorkspace();
    const pattern = projectState.getState().patterns.find(({ id }) => id === selectedPatternId);
    if (!pattern) return;
    const usage = projectState.getPatternUsageCount(selectedPatternId);
    pendingDelete = { id: selectedPatternId, name: pattern.name, usage };
    const copy = getPatternDeleteCopy(pattern.name, usage);
    elements.deleteMessage.textContent = copy.message;
    elements.deleteConfirm.textContent = copy.action;
    elements.deleteDialog.showModal();
    elements.deleteCancel.focus();
  }

  function getWorkspace() {
    return sessionState.getState().workspace;
  }

  function selectPattern(patternId) {
    if (patternId === getWorkspace().selectedPatternId) return false;
    onBeforeSelectionChange();
    return sessionState.setWorkspace({
      activeDockPanel: "sequencer",
      selectedClipId: null,
      selectedPatternId: patternId,
    });
  }

  function render() {
    const project = projectState.getState();
    const workspace = getWorkspace();
    const pattern = project.patterns.find((candidate) => candidate.id === workspace.selectedPatternId)
      ?? project.patterns[0];
    const track = project.tracks.find((candidate) => candidate.id === workspace.selectedTrackId)
      ?? project.tracks[0];
    const currentOptions = [...elements.select.options].map((option) => option.value);
    const nextOptions = project.patterns.map((candidate) => candidate.id);
    if (currentOptions.join("|") !== nextOptions.join("|")) {
      elements.select.replaceChildren(...project.patterns.map((candidate) => {
        const option = root.createElement("option");
        option.value = candidate.id;
        option.textContent = candidate.name;
        return option;
      }));
    } else {
      project.patterns.forEach((candidate, index) => {
        elements.select.options[index].textContent = candidate.name;
      });
    }
    elements.select.value = pattern.id;
    elements.name.value = pattern.name;
    elements.rootOctave.value = String(pattern.rootOctave);
    const usage = projectState.getPatternUsageCount(pattern.id);
    const hasNotes = pattern.steps.some((step) => step !== null && step.volume > 0);
    elements.usage.value = `${usage} clip${usage === 1 ? "" : "s"}`;
    elements.delete.disabled = project.patterns.length === 1;
    elements.place.disabled = project.tracks.length === 0 || !hasNotes;
    elements.place.classList.toggle(
      "place-pattern-primary",
      hasNotes && project.tracks.every((candidate) => candidate.clips.length === 0),
    );
    elements.place.title = hasNotes
      ? `Add ${pattern.name} to ${track.name} at song step ${workspace.arrangementStartStep + 1}`
      : "Add at least one note before adding this loop to the song.";
    if (hasNotes) elements.place.removeAttribute("aria-describedby");
    else elements.place.setAttribute("aria-describedby", "pattern-selection-empty");
    elements.placeTrack.textContent = track.name;
    elements.placeStart.value = String(workspace.arrangementStartStep + 1);
  }

  elements.select.addEventListener("change", () => {
    selectPattern(elements.select.value);
    elements.select.blur();
    onError("");
  }, { signal: lifecycle.signal });
  elements.name.addEventListener("change", () => {
    try {
      projectState.renamePattern(getWorkspace().selectedPatternId, elements.name.value);
      onError("");
    } catch (error) {
      onError(error.message);
      render();
    }
  }, { signal: lifecycle.signal });
  elements.rootOctave.addEventListener("change", () => {
    try {
      projectState.setPatternRootOctave(
        getWorkspace().selectedPatternId,
        Number(elements.rootOctave.value),
      );
      elements.rootOctave.blur();
      onError("");
    } catch (error) {
      onError(error.message);
      render();
    }
  }, { signal: lifecycle.signal });
  elements.create.addEventListener("click", () => {
    const patternId = projectState.createPattern();
    selectPattern(patternId);
    onError("");
  }, { signal: lifecycle.signal });
  elements.variation.addEventListener("click", () => {
    const patternId = projectState.duplicatePattern(getWorkspace().selectedPatternId);
    selectPattern(patternId);
    onError("");
  }, { signal: lifecycle.signal });
  elements.delete.addEventListener("click", requestDelete, { signal: lifecycle.signal });
  elements.deleteCancel.addEventListener("click", () => closeDeleteDialog(), { signal: lifecycle.signal });
  elements.deleteDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDeleteDialog();
  }, { signal: lifecycle.signal });
  elements.deleteDialog.addEventListener("click", (event) => {
    if (event.target === elements.deleteDialog) closeDeleteDialog();
  }, { signal: lifecycle.signal });
  elements.deleteConfirm.addEventListener("click", () => {
    if (!pendingDelete) return;
    const { id: selectedPatternId, name, usage } = pendingDelete;
    const patterns = projectState.getState().patterns;
    const nextPattern = patterns.find((pattern) => pattern.id !== selectedPatternId);
    try {
      projectState.deletePattern(selectedPatternId, { removeReferences: true });
      onBeforeSelectionChange();
      sessionState.setWorkspace({ selectedClipId: null, selectedPatternId: nextPattern.id });
      onError("");
      closeDeleteDialog(false);
      elements.select.focus();
      announceStatus(root, `Deleted pattern ${name} and ${usage} arrangement clip${usage === 1 ? "" : "s"}.`);
    } catch (error) {
      onError(error.message);
    }
  }, { signal: lifecycle.signal });
  elements.place.addEventListener("click", () => {
    const workspace = getWorkspace();
    const startStep = Number(elements.placeStart.value) - 1;
    try {
      const clipId = projectState.addClip(
        workspace.selectedTrackId,
        workspace.selectedPatternId,
        startStep,
      );
      sessionState.setWorkspace({
        activeDockPanel: "sequencer",
        selectedClipId: clipId,
      });
      onError("");
    } catch (error) {
      onError(error.message);
    }
  }, { signal: lifecycle.signal });

  const handleProjectChange = () => render();
  const handleSessionChange = (event) => {
    if (event.detail.slice === "workspace") render();
  };
  projectState.addEventListener("change", handleProjectChange, { signal: lifecycle.signal });
  sessionState.addEventListener("change", handleSessionChange, { signal: lifecycle.signal });

  render();
  return Object.freeze({ dispose: () => lifecycle.abort(), render });
}
