import { queryRequired } from "../../shared/query-required.js";

export function createPatternLibrary({
  confirmAction = (message) => globalThis.confirm(message),
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
    name: queryRequired(root, "#pattern-name"),
    place: queryRequired(root, "#place-pattern"),
    placeStart: queryRequired(root, "#place-start"),
    placeTrack: queryRequired(root, "#place-track-name"),
    rootOctave: queryRequired(root, "#pattern-root-octave"),
    select: queryRequired(root, "#pattern-select"),
    usage: queryRequired(root, "#pattern-usage"),
    variation: queryRequired(root, "#pattern-variation"),
  };

  function getWorkspace() {
    return sessionState.getState().workspace;
  }

  function selectPattern(patternId) {
    if (patternId === getWorkspace().selectedPatternId) return false;
    onBeforeSelectionChange();
    return sessionState.setWorkspace({ selectedClipId: null, selectedPatternId: patternId });
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
    elements.usage.value = `${usage} clip${usage === 1 ? "" : "s"}`;
    elements.delete.disabled = project.patterns.length === 1;
    elements.place.disabled = project.tracks.length === 0;
    elements.placeTrack.textContent = track.name;
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
  elements.delete.addEventListener("click", () => {
    const { selectedPatternId } = getWorkspace();
    const usage = projectState.getPatternUsageCount(selectedPatternId);
    if (usage > 0 && !confirmAction(
      `Delete this pattern and its ${usage} arrangement clip${usage === 1 ? "" : "s"}?`,
    )) return;
    const patterns = projectState.getState().patterns;
    const nextPattern = patterns.find((pattern) => pattern.id !== selectedPatternId);
    try {
      projectState.deletePattern(selectedPatternId, { removeReferences: usage > 0 });
      onBeforeSelectionChange();
      sessionState.setWorkspace({ selectedClipId: null, selectedPatternId: nextPattern.id });
      onError("");
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
      sessionState.setWorkspace({ selectedClipId: clipId });
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
