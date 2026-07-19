import { queryRequired } from "../../shared/query-required.js";
import { createPatternEditor } from "./pattern-editor.js";
import { createPatternHistoryShortcut } from "./pattern-shortcuts.js";

export function createPatternFeature({
  audioEngine,
  getNoteName,
  notePreview,
  patternState,
  projectState,
  root = document,
  scheduler,
  sessionState,
}) {
  const lifecycle = new AbortController();
  const elements = {
    clear: queryRequired(root, "#pattern-clear"),
    duplicate: queryRequired(root, "#pattern-duplicate"),
    gate: queryRequired(root, "#pattern-gate"),
    grid: queryRequired(root, "#pattern-grid"),
    length: queryRequired(root, "#pattern-length"),
    octave: queryRequired(root, "#pattern-octave"),
    pause: queryRequired(root, "#transport-pause"),
    pitch: queryRequired(root, "#pattern-pitch"),
    play: queryRequired(root, "#transport-play"),
    preview: queryRequired(root, "#pattern-preview"),
    redo: queryRequired(root, "#pattern-redo"),
    selectedNote: queryRequired(root, "#selected-pattern-note"),
    status: queryRequired(root, "#transport-status"),
    stop: queryRequired(root, "#transport-stop"),
    tempo: queryRequired(root, "#tempo"),
    tempoValue: queryRequired(root, "#tempo-value"),
    transposeDown: queryRequired(root, "#transpose-down"),
    transposeOctaveDown: queryRequired(root, "#transpose-octave-down"),
    transposeOctaveUp: queryRequired(root, "#transpose-octave-up"),
    transposeUp: queryRequired(root, "#transpose-up"),
    undo: queryRequired(root, "#pattern-undo"),
  };
  let playheadFrame = null;

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

  const editor = createPatternEditor({
    patternState,
    grid: elements.grid,
    pitchSelect: elements.pitch,
    octaveSelect: elements.octave,
    gateSelect: elements.gate,
    previewInput: elements.preview,
    selectedNoteOutput: elements.selectedNote,
    getNoteName,
    previewNote: notePreview.play,
    onEditAction: disarmClear,
  });

  function renderPlayhead() {
    const transport = scheduler.getState();
    const stepIndex = scheduler.getPlayheadStep();
    editor.setPlayhead(stepIndex, transport.status);
    const stepLabel = String(stepIndex + 1).padStart(2, "0");
    elements.status.value = transport.status === "paused"
      ? `Paused / Next step ${stepLabel}`
      : `${transport.status === "playing" ? "Playing" : "Stopped"} / Step ${stepLabel}`;
  }

  function startPlayheadDisplay() {
    if (playheadFrame !== null) return;
    const update = () => {
      if (scheduler.getState().status !== "playing") {
        playheadFrame = null;
        renderPlayhead();
        return;
      }
      renderPlayhead();
      playheadFrame = requestAnimationFrame(update);
    };
    playheadFrame = requestAnimationFrame(update);
  }

  function stopPlayheadDisplay() {
    if (playheadFrame !== null) cancelAnimationFrame(playheadFrame);
    playheadFrame = null;
    renderPlayhead();
  }

  function renderTransport() {
    const { bpm, status } = scheduler.getState();
    const playing = status === "playing";
    elements.tempo.value = String(bpm);
    elements.tempoValue.value = `${bpm} BPM`;
    elements.play.disabled = !audioEngine.isReady() || playing;
    elements.play.textContent = status === "paused" ? "Resume" : "Play";
    elements.pause.disabled = !playing;
    elements.stop.disabled = status === "stopped";
    if (playing) startPlayheadDisplay();
    else stopPlayheadDisplay();
  }

  function render() {
    renderLength();
    renderActions();
    renderTransport();
  }

  function restoreHistory(action, available) {
    disarmClear();
    if (!available()) return false;
    scheduler.stop();
    return action();
  }

  const historyShortcut = createPatternHistoryShortcut({
    undo: () => restoreHistory(patternState.undo, () => patternState.getState().canUndo),
    redo: () => restoreHistory(patternState.redo, () => patternState.getState().canRedo),
  });

  elements.length.addEventListener("change", () => {
    disarmClear();
    scheduler.stop();
    patternState.setLength(Number(elements.length.value));
    elements.length.blur();
    renderLength();
  }, { signal: lifecycle.signal });
  elements.undo.addEventListener("click", () => {
    restoreHistory(patternState.undo, () => patternState.getState().canUndo);
  }, { signal: lifecycle.signal });
  elements.redo.addEventListener("click", () => {
    restoreHistory(patternState.redo, () => patternState.getState().canRedo);
  }, { signal: lifecycle.signal });
  elements.duplicate.addEventListener("click", () => {
    disarmClear();
    if (!patternState.canDuplicate()) return;
    scheduler.stop();
    patternState.duplicate();
  }, { signal: lifecycle.signal });
  elements.clear.addEventListener("click", () => {
    if (!sessionState.getState().editor.clearPatternArmed) {
      sessionState.setEditor({ clearPatternArmed: true });
      renderActions();
      return;
    }
    sessionState.setEditor({ clearPatternArmed: false });
    patternState.clearPattern();
    renderActions();
  }, { signal: lifecycle.signal });

  const transpose = (semitones) => {
    disarmClear();
    patternState.transpose(semitones);
  };
  elements.transposeOctaveDown.addEventListener("click", () => transpose(-12), { signal: lifecycle.signal });
  elements.transposeDown.addEventListener("click", () => transpose(-1), { signal: lifecycle.signal });
  elements.transposeUp.addEventListener("click", () => transpose(1), { signal: lifecycle.signal });
  elements.transposeOctaveUp.addEventListener("click", () => transpose(12), { signal: lifecycle.signal });
  elements.play.addEventListener("click", () => {
    try {
      scheduler.play();
    } catch (error) {
      console.error("Pattern playback could not start.", error);
    }
    renderTransport();
  }, { signal: lifecycle.signal });
  elements.pause.addEventListener("click", scheduler.pause, { signal: lifecycle.signal });
  elements.stop.addEventListener("click", scheduler.stop, { signal: lifecycle.signal });
  elements.tempo.addEventListener("input", () => {
    const bpm = Number(elements.tempo.value);
    projectState.setBpm(bpm);
    scheduler.setBpm(bpm);
  }, { signal: lifecycle.signal });

  root.addEventListener("keydown", historyShortcut, { capture: true, signal: lifecycle.signal });
  patternState.addEventListener("change", () => {
    disarmClear();
    renderLength();
    renderActions();
  }, { signal: lifecycle.signal });
  scheduler.addEventListener("statechange", () => {
    const transport = scheduler.getState();
    sessionState.setTransport({
      retainedStepIndex: transport.retainedStepIndex,
      status: transport.status,
    });
    renderTransport();
  }, { signal: lifecycle.signal });

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      editor.dispose();
      stopPlayheadDisplay();
    },
    render,
    setSelectedNote: editor.setSelectedNote,
  });
}
