import { audioEngine, createAudioEngineError, isAudioEngineError } from "./audio-engine.js";
import { createInputController } from "./input-controller.js";
import { createInstrumentState } from "./instrument-state.js";
import { createNotePreview } from "./note-preview.js";
import { createPatternEditor } from "./pattern-editor.js";
import { createPatternState } from "./pattern-state.js";
import { createStepScheduler } from "./step-scheduler.js";
import { LOWER_BLACK_KEYS, LOWER_WHITE_KEYS, UPPER_BLACK_KEYS, UPPER_WHITE_KEYS } from "./keyboard-layout.js";
import { createVoiceEngine } from "./voice-engine.js";

const selectors = {
  action: "#audio-action", attack: "#attack", attackValue: "#attack-value", release: "#release", releaseValue: "#release-value", audioState: "#audio-state", audioTime: "#audio-time", contextState: "#context-state", errorMessage: "#error-message", errorPanel: "#error-panel", patternAccent: "#pattern-accent", patternClear: "#pattern-clear", patternDuplicate: "#pattern-duplicate", patternGate: "#pattern-gate", patternGrid: "#pattern-grid", patternLength: "#pattern-length", patternOctave: "#pattern-octave", patternPitch: "#pattern-pitch", patternPreview: "#pattern-preview", transportPause: "#transport-pause", transportPlay: "#transport-play", transportStatus: "#transport-status", transportStop: "#transport-stop", transposeDown: "#transpose-down", transposeOctaveDown: "#transpose-octave-down", transposeOctaveUp: "#transpose-octave-up", transposeUp: "#transpose-up", octaveDown: "#octave-down", octaveUp: "#octave-up", octaveValue: "#octave-value", resetInstrument: "#reset-instrument", sampleRate: "#sample-rate", selectedPatternNote: "#selected-pattern-note", statusDescription: "#status-description", statusLight: "#status-light", tempo: "#tempo", tempoValue: "#tempo-value", stopSound: "#stop-sound", voiceType: "#voice-type", volume: "#volume", volumeValue: "#volume-value",
};
const elements = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)]));
elements.actionLabel = document.querySelector("#audio-action span");

const instrumentState = createInstrumentState();
const patternState = createPatternState();
const voiceEngine = createVoiceEngine({ getAudioTime: audioEngine.getCurrentTime, getOutputNode: audioEngine.getInputNode });
const notePreview = createNotePreview({
  getAudioTime: audioEngine.getCurrentTime,
  getInstrumentConfig: instrumentState.getState,
  voiceEngine,
});
const stepScheduler = createStepScheduler({
  getAudioTime: audioEngine.getCurrentTime,
  getInstrumentConfig: instrumentState.getState,
  getPatternState: patternState.getState,
  voiceEngine,
});
const keyButtons = new Map();
let activeNotes = new Set();
let patternEditor = null;
let patternClearArmed = false;
const inputController = createInputController({
  voiceEngine,
  getInstrumentConfig: instrumentState.getState,
  onActiveNotesChange: (notes) => { activeNotes = notes; renderKeys(); },
  onNoteStart: (note) => patternEditor?.setSelectedNote(note),
});

const stateContent = {
  idle: { title: "Not started", action: "Enable audio", description: "Browsers require a deliberate gesture before they allow sound. Nothing will play until you enable audio." },
  running: { title: "Ready", action: "Audio enabled", description: "The audio clock is running. Instruments connect through the shared master signal path." },
  suspended: { title: "Paused by browser", action: "Resume audio", description: "The browser suspended the audio context. Resume it here without creating a second context." },
  closed: { title: "Closed", action: "Reload to restart", description: "This audio session has closed. Reload the page to start a new one." },
};

let errorState = null;
let timeFrame = null;
let playheadFrame = null;

function noteName(note) {
  const names = ["C", "C\u266F", "D", "D\u266F", "E", "F", "F\u266F", "G", "G\u266F", "A", "A\u266F", "B"];
  return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
patternEditor = createPatternEditor({
  patternState,
  grid: elements.patternGrid,
  pitchSelect: elements.patternPitch,
  octaveSelect: elements.patternOctave,
  gateSelect: elements.patternGate,
  accentInput: elements.patternAccent,
  previewInput: elements.patternPreview,
  selectedNoteOutput: elements.selectedPatternNote,
  getNoteName: noteName,
  previewNote: notePreview.play,
  onEditAction: disarmPatternClear,
});

function createKeyButton(key, colour) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `music-key ${colour}`;
  button.dataset.note = String(key.note);
  button.disabled = true;
  const owner = (pointerId) => `pointer:${pointerId}:${key.note}`;
  button.addEventListener("pointerdown", (event) => { button.setPointerCapture(event.pointerId); inputController.start(owner(event.pointerId), key.note); });
  button.addEventListener("pointerup", (event) => inputController.stop(owner(event.pointerId)));
  button.addEventListener("pointercancel", (event) => inputController.stop(owner(event.pointerId)));
  const buttons = keyButtons.get(key.note) ?? [];
  buttons.push({ button, key });
  keyButtons.set(key.note, buttons);
  return button;
}

function renderKeyGroup(selector, keys, colour) {
  const container = document.querySelector(selector);
  for (const key of keys) container.append(createKeyButton(key, colour));
}

renderKeyGroup("#upper-black-keys", UPPER_BLACK_KEYS, "black");
renderKeyGroup("#upper-white-keys", UPPER_WHITE_KEYS, "white");
renderKeyGroup("#lower-black-keys", LOWER_BLACK_KEYS, "black");
renderKeyGroup("#lower-white-keys", LOWER_WHITE_KEYS, "white");

function renderKeys() {
  const ready = audioEngine.isReady();
  const { octaveOffset } = instrumentState.getState();
  for (const [baseNote, entries] of keyButtons) {
    for (const { button, key } of entries) {
      const displayedName = noteName(baseNote + octaveOffset * 12);
      button.disabled = !ready;
      button.classList.toggle("active", activeNotes.has(baseNote));
      button.setAttribute("aria-pressed", String(activeNotes.has(baseNote)));
      button.setAttribute("aria-label", `${displayedName}, computer key ${key.label}`);
      button.innerHTML = `<span>${key.label}</span><small>${displayedName}</small>`;
    }
  }
}

function startTimeDisplay() {
  if (timeFrame !== null) return;
  const update = () => {
    if (!audioEngine.isReady()) { timeFrame = null; return; }
    elements.audioTime.textContent = `${audioEngine.getCurrentTime().toFixed(2)} s`;
    timeFrame = requestAnimationFrame(update);
  };
  timeFrame = requestAnimationFrame(update);
}

function stopTimeDisplay() {
  if (timeFrame !== null) cancelAnimationFrame(timeFrame);
  timeFrame = null;
}

function renderInstrument() {
  const config = instrumentState.getState();
  elements.voiceType.value = config.voiceType;
  elements.octaveValue.textContent = config.octaveOffset > 0 ? `+${config.octaveOffset}` : String(config.octaveOffset);
  elements.octaveDown.disabled = config.octaveOffset <= -2;
  elements.octaveUp.disabled = config.octaveOffset >= 2;
  elements.volume.value = String(config.volume * 100);
  elements.volumeValue.value = `${Math.round(config.volume * 100)}%`;
  elements.attack.value = String(config.attackSeconds * 1000);
  elements.attackValue.value = `${Math.round(config.attackSeconds * 1000)} ms`;
  elements.release.value = String(config.releaseSeconds * 1000);
  elements.releaseValue.value = `${Math.round(config.releaseSeconds * 1000)} ms`;
  renderKeys();
}

function renderPlayhead() {
  const transport = stepScheduler.getState();
  const stepIndex = stepScheduler.getPlayheadStep();
  patternEditor.setPlayhead(stepIndex, transport.status);
  const stepLabel = String(stepIndex + 1).padStart(2, "0");
  elements.transportStatus.value = transport.status === "paused"
    ? `Paused / Next step ${stepLabel}`
    : `${transport.status === "playing" ? "Playing" : "Stopped"} / Step ${stepLabel}`;
}

function startPlayheadDisplay() {
  if (playheadFrame !== null) return;
  const update = () => {
    if (stepScheduler.getState().status !== "playing") {
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

function renderPatternLength() {
  elements.patternLength.value = String(patternState.getState().length);
}

function renderPatternActions() {
  elements.patternDuplicate.disabled = !patternState.canDuplicate();
  elements.transposeOctaveDown.disabled = !patternState.canTranspose(-12);
  elements.transposeDown.disabled = !patternState.canTranspose(-1);
  elements.transposeUp.disabled = !patternState.canTranspose(1);
  elements.transposeOctaveUp.disabled = !patternState.canTranspose(12);
  elements.patternClear.classList.toggle("armed", patternClearArmed);
  elements.patternClear.textContent = patternClearArmed ? "Confirm clear" : "Clear pattern";
}

function disarmPatternClear() {
  if (!patternClearArmed) return;
  patternClearArmed = false;
  renderPatternActions();
}

function renderPatternTransport() {
  const { bpm, status } = stepScheduler.getState();
  const playing = status === "playing";
  elements.tempo.value = String(bpm);
  elements.tempoValue.value = `${bpm} BPM`;
  elements.transportPlay.disabled = !audioEngine.isReady() || playing;
  elements.transportPlay.textContent = status === "paused" ? "Resume" : "Play";
  elements.transportPause.disabled = !playing;
  elements.transportStop.disabled = status === "stopped";
  if (playing) startPlayheadDisplay();
  else stopPlayheadDisplay();
}
function render() {
  const state = audioEngine.getState();
  const content = errorState ? { title: "Needs attention", action: "Try again", description: errorState.message } : (stateContent[state] ?? stateContent.idle);
  const ready = audioEngine.isReady();
  const sampleRate = audioEngine.getSampleRate();
  elements.audioState.textContent = content.title;
  elements.actionLabel.textContent = content.action;
  elements.statusDescription.textContent = content.description;
  elements.contextState.textContent = state === "idle" ? "Not created" : state;
  elements.sampleRate.textContent = sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : "\u2014";
  elements.statusLight.dataset.state = errorState ? "error" : state;
  elements.errorPanel.hidden = !errorState;
  elements.errorMessage.textContent = errorState?.message ?? "";
  elements.action.disabled = state === "running" || state === "closed";
  elements.stopSound.disabled = !ready;
  renderInstrument();
  renderPatternLength();
  renderPatternActions();
  renderPatternTransport();
  if (ready) startTimeDisplay();
  else { stopTimeDisplay(); elements.audioTime.textContent = "\u2014"; }
}

function stopAllSound() {
  stepScheduler.stop();
  notePreview.stop();
  inputController.stopAll();
  voiceEngine.stopAll();
}

elements.action.addEventListener("click", async () => {
  errorState = null;
  elements.action.disabled = true;
  elements.actionLabel.textContent = "Starting\u2026";
  try { await audioEngine.enable(); }
  catch (error) {
    console.error("Audio engine failed to enable.", error);
    errorState = isAudioEngineError(error) ? error : createAudioEngineError("unexpected", "An unexpected audio error occurred.", error);
  }
  render();
});

elements.patternLength.addEventListener("change", () => {
  disarmPatternClear();
  stepScheduler.stop();
  patternState.setLength(Number(elements.patternLength.value));
  elements.patternLength.blur();
  renderPatternLength();
});

elements.patternDuplicate.addEventListener("click", () => {
  disarmPatternClear();
  if (!patternState.canDuplicate()) return;
  stepScheduler.stop();
  patternState.duplicate();
});

elements.patternClear.addEventListener("click", () => {
  if (!patternClearArmed) {
    patternClearArmed = true;
    renderPatternActions();
    return;
  }
  patternClearArmed = false;
  patternState.clearPattern();
  renderPatternActions();
});

function transposePattern(semitones) {
  disarmPatternClear();
  patternState.transpose(semitones);
}

elements.transposeOctaveDown.addEventListener("click", () => transposePattern(-12));
elements.transposeDown.addEventListener("click", () => transposePattern(-1));
elements.transposeUp.addEventListener("click", () => transposePattern(1));
elements.transposeOctaveUp.addEventListener("click", () => transposePattern(12));
elements.transportPlay.addEventListener("click", () => {
  try { stepScheduler.play(); }
  catch (error) { console.error("Pattern playback could not start.", error); }
  renderPatternTransport();
});
elements.transportPause.addEventListener("click", stepScheduler.pause);
elements.transportStop.addEventListener("click", stepScheduler.stop);
elements.tempo.addEventListener("input", () => stepScheduler.setBpm(Number(elements.tempo.value)));
elements.stopSound.addEventListener("click", stopAllSound);
elements.voiceType.addEventListener("change", () => { instrumentState.setVoiceType(elements.voiceType.value); elements.voiceType.blur(); });
elements.octaveDown.addEventListener("click", () => instrumentState.setOctaveOffset(instrumentState.getState().octaveOffset - 1));
elements.octaveUp.addEventListener("click", () => instrumentState.setOctaveOffset(instrumentState.getState().octaveOffset + 1));
elements.volume.addEventListener("input", () => instrumentState.setVolume(Number(elements.volume.value) / 100));
elements.attack.addEventListener("input", () => instrumentState.setAttackSeconds(Number(elements.attack.value) / 1000));
elements.release.addEventListener("input", () => instrumentState.setReleaseSeconds(Number(elements.release.value) / 1000));
elements.resetInstrument.addEventListener("click", instrumentState.reset);

let previousInstrumentConfig = instrumentState.getState();
instrumentState.addEventListener("change", () => {
  const config = instrumentState.getState();
  voiceEngine.setVolume(config.volume);
  if (
    config.voiceType !== previousInstrumentConfig.voiceType ||
    config.octaveOffset !== previousInstrumentConfig.octaveOffset
  ) {
    inputController.refreshActiveVoices();
  }
  previousInstrumentConfig = config;
  renderInstrument();
});
document.addEventListener("keydown", inputController.handleKeyDown);
document.addEventListener("keyup", inputController.handleKeyUp);
window.addEventListener("keyup", inputController.handleKeyUp);
function pauseForInterruption() {
  stepScheduler.pause();
  notePreview.stop();
  inputController.stopAll();
  voiceEngine.stopAll();
}

document.addEventListener("visibilitychange", () => { if (document.hidden) pauseForInterruption(); });
window.addEventListener("blur", pauseForInterruption);
window.addEventListener("pagehide", () => { pauseForInterruption(); stopTimeDisplay(); });
audioEngine.addEventListener("statechange", () => { if (audioEngine.getState() === "running") errorState = null; render(); });
stepScheduler.addEventListener("statechange", renderPatternTransport);
patternState.addEventListener("change", () => { disarmPatternClear(); renderPatternLength(); renderPatternActions(); });

voiceEngine.setVolume(instrumentState.getState().volume);
render();
