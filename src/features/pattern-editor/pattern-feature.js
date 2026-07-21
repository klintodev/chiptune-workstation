import { queryRequired } from "../../shared/query-required.js";
import { createPatternEditor } from "./pattern-editor.js?v=20260721-1";
import { createPatternHistoryShortcut } from "./pattern-shortcuts.js";

export function createPatternFeature({
  getNoteName,
  notePreview,
  onError = () => {},
  onStructuralEdit = () => {},
  patternState,
  projectState,
  root = document,
  sessionState,
}) {
  const lifecycle = new AbortController();
  const elements = {
    clear: queryRequired(root, "#pattern-clear"),
    duplicate: queryRequired(root, "#pattern-duplicate"),
    grid: queryRequired(root, "#pattern-grid"),
    length: queryRequired(root, "#pattern-length"),
    noteDown: queryRequired(root, "#selected-note-down"),
    noteUp: queryRequired(root, "#selected-note-up"),
    octave: queryRequired(root, "#pattern-octave"),
    pitch: queryRequired(root, "#pattern-pitch"),
    preview: queryRequired(root, "#pattern-preview"),
    redo: queryRequired(root, "#pattern-redo"),
    selectedNote: queryRequired(root, "#selected-pattern-note"),
    selectionEmpty: queryRequired(root, "#pattern-selection-empty"),
    selectionSummary: queryRequired(root, "#pattern-selection-summary"),
    stepClear: queryRequired(root, "#selected-step-clear"),
    stepGate: queryRequired(root, "#selected-step-gate"),
    stepNumber: queryRequired(root, "#selected-step-number"),
    stepSummary: queryRequired(root, "#selected-step-summary"),
    stepVolume: queryRequired(root, "#selected-step-volume"),
    stepVolumeValue: queryRequired(root, "#selected-step-volume-value"),
    summaryGate: queryRequired(root, "#pattern-summary-gate"),
    summaryNote: queryRequired(root, "#pattern-summary-note"),
    summaryStep: queryRequired(root, "#pattern-summary-step"),
    summaryVolume: queryRequired(root, "#pattern-summary-volume"),
    transposeDown: queryRequired(root, "#transpose-down"),
    transposeOctaveDown: queryRequired(root, "#transpose-octave-down"),
    transposeOctaveUp: queryRequired(root, "#transpose-octave-up"),
    transposeUp: queryRequired(root, "#transpose-up"),
    undo: queryRequired(root, "#pattern-undo"),
    undoToast: queryRequired(root, "#pattern-undo-toast"),
    undoToastAction: queryRequired(root, "#pattern-undo-action"),
    undoToastDismiss: queryRequired(root, "#pattern-undo-dismiss"),
    undoToastMessage: queryRequired(root, "#pattern-undo-message"),
  };
  let undoToastTimer = 0;

  function renderLength() {
    elements.length.value = String(patternState.getState().length);
  }

  function renderActions() {
    const pattern = patternState.getState();
    elements.undo.disabled = !pattern.canUndo;
    elements.redo.disabled = !pattern.canRedo;
    elements.duplicate.disabled = !patternState.canDuplicate();
    elements.transposeOctaveDown.disabled = !patternState.canTranspose(-12);
    elements.transposeDown.disabled = !patternState.canTranspose(-1);
    elements.transposeUp.disabled = !patternState.canTranspose(1);
    elements.transposeOctaveUp.disabled = !patternState.canTranspose(12);
    const { clearPatternArmed } = sessionState.getState().editor;
    elements.clear.classList.toggle("armed", clearPatternArmed);
    elements.clear.textContent = clearPatternArmed ? "Confirm clear" : "Clear pattern";
  }

  function disarmClear() {
    if (!sessionState.getState().editor.clearPatternArmed) return;
    sessionState.setEditor({ clearPatternArmed: false });
    renderActions();
  }

  function hideUndoToast() {
    globalThis.clearTimeout(undoToastTimer);
    elements.undoToast.hidden = true;
  }

  function showUndoToast(stepIndex) {
    globalThis.clearTimeout(undoToastTimer);
    elements.undoToastMessage.textContent = `Step ${String(stepIndex + 1).padStart(2, "0")} cleared`;
    elements.undoToast.hidden = false;
    undoToastTimer = globalThis.setTimeout(hideUndoToast, 5000);
  }

  const editor = createPatternEditor({
    clearButton: elements.stepClear,
    gateControl: elements.stepGate,
    getNoteName,
    grid: elements.grid,
    noteDownButton: elements.noteDown,
    noteUpButton: elements.noteUp,
    octaveSelect: elements.octave,
    onEditAction: disarmClear,
    onStepCleared: showUndoToast,
    patternState,
    pitchSelect: elements.pitch,
    previewInput: elements.preview,
    previewNote: notePreview.play,
    selectedNoteOutput: elements.selectedNote,
    selectionEmpty: elements.selectionEmpty,
    selectionSummary: elements.selectionSummary,
    stepNumberOutput: elements.stepNumber,
    stepSummaryOutput: elements.stepSummary,
    summaryGate: elements.summaryGate,
    summaryNote: elements.summaryNote,
    summaryStep: elements.summaryStep,
    summaryVolume: elements.summaryVolume,
    volumeInput: elements.stepVolume,
    volumeOutput: elements.stepVolumeValue,
  });

  function runAction(action, { structural = false } = {}) {
    disarmClear();
    if (structural) onStructuralEdit();
    try {
      onError("");
      return action();
    } catch (error) {
      onError(error.message);
      renderLength();
      return false;
    }
  }

  function restoreHistory(action, available) {
    if (!available()) return false;
    return runAction(action, { structural: true });
  }

  const historyShortcut = createPatternHistoryShortcut({
    undo: () => restoreHistory(patternState.undo, () => patternState.getState().canUndo),
    redo: () => restoreHistory(patternState.redo, () => patternState.getState().canRedo),
  });

  elements.length.addEventListener("change", () => {
    runAction(() => patternState.setLength(Number(elements.length.value)), { structural: true });
    elements.length.blur();
    renderLength();
  }, { signal: lifecycle.signal });
  elements.undo.addEventListener("click", () => {
    restoreHistory(patternState.undo, () => patternState.getState().canUndo);
  }, { signal: lifecycle.signal });
  elements.redo.addEventListener("click", () => {
    restoreHistory(patternState.redo, () => patternState.getState().canRedo);
  }, { signal: lifecycle.signal });
  elements.undoToastAction.addEventListener("click", () => {
    restoreHistory(patternState.undo, () => patternState.getState().canUndo);
    hideUndoToast();
  }, { signal: lifecycle.signal });
  elements.undoToastDismiss.addEventListener("click", hideUndoToast, { signal: lifecycle.signal });
  elements.duplicate.addEventListener("click", () => {
    if (patternState.canDuplicate()) runAction(patternState.duplicate, { structural: true });
  }, { signal: lifecycle.signal });
  elements.clear.addEventListener("click", () => {
    if (!sessionState.getState().editor.clearPatternArmed) {
      sessionState.setEditor({ clearPatternArmed: true });
      renderActions();
      return;
    }
    sessionState.setEditor({ clearPatternArmed: false });
    runAction(patternState.clearPattern);
  }, { signal: lifecycle.signal });

  const transpose = (semitones) => runAction(() => patternState.transpose(semitones));
  elements.transposeOctaveDown.addEventListener("click", () => transpose(-12), { signal: lifecycle.signal });
  elements.transposeDown.addEventListener("click", () => transpose(-1), { signal: lifecycle.signal });
  elements.transposeUp.addEventListener("click", () => transpose(1), { signal: lifecycle.signal });
  elements.transposeOctaveUp.addEventListener("click", () => transpose(12), { signal: lifecycle.signal });

  root.addEventListener("keydown", historyShortcut, { capture: true, signal: lifecycle.signal });
  patternState.addEventListener("change", () => {
    disarmClear();
    renderLength();
    renderActions();
  }, { signal: lifecycle.signal });

  function render() {
    renderLength();
    renderActions();
    editor.render();
  }

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      globalThis.clearTimeout(undoToastTimer);
      editor.dispose();
    },
    render,
    setSelectedNote: editor.setSelectedNote,
  });
}
