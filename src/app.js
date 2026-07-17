import { audioEngine, createAudioEngineError, isAudioEngineError } from "./audio-engine.js";
import { createInputController } from "./input-controller.js";
import { LOWER_BLACK_KEYS, LOWER_WHITE_KEYS, UPPER_BLACK_KEYS, UPPER_WHITE_KEYS } from "./keyboard-layout.js";
import { createVoiceEngine, midiNoteToFrequency } from "./voice-engine.js";

const elements = {
  action: document.querySelector("#audio-action"), actionLabel: document.querySelector("#audio-action span"), activeVoices: document.querySelector("#active-voices"), audioState: document.querySelector("#audio-state"), audioTime: document.querySelector("#audio-time"), contextState: document.querySelector("#context-state"), errorMessage: document.querySelector("#error-message"), errorPanel: document.querySelector("#error-panel"), muteLabel: document.querySelector("#mute-label"), muteToggle: document.querySelector("#mute-toggle"), sampleRate: document.querySelector("#sample-rate"), statusDescription: document.querySelector("#status-description"), statusLight: document.querySelector("#status-light"), stopSound: document.querySelector("#stop-sound"), testSignal: document.querySelector("#test-signal"), voiceHold: document.querySelector("#voice-hold"), voiceSchedule: document.querySelector("#voice-schedule"), voiceTrigger: document.querySelector("#voice-trigger"), voiceType: document.querySelector("#voice-type"),
};

const voiceEngine = createVoiceEngine({ getAudioTime: audioEngine.getCurrentTime, getOutputNode: audioEngine.getInputNode });
const keyButtons = new Map();
let activeNotes = new Set();
const inputController = createInputController({
  voiceEngine,
  getVoiceType: () => elements.voiceType.value,
  onActiveNotesChange: (notes) => { activeNotes = notes; renderKeys(); },
});

const stateContent = {
  idle: { title: "Not started", action: "Enable audio", description: "Browsers require a deliberate gesture before they allow sound. Nothing will play until you enable audio." },
  running: { title: "Ready", action: "Audio enabled", description: "The audio clock is running. Future instruments will connect through the shared master signal path." },
  suspended: { title: "Paused by browser", action: "Resume audio", description: "The browser suspended the audio context. Resume it here without reloading or creating a second context." },
  closed: { title: "Closed", action: "Reload to restart", description: "This audio session has closed. Reload the page to start a new one." },
};

let errorState = null;
let timeFrame = null;
let heldVoice = null;

function createKeyButton(key, colour) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `music-key ${colour}`;
  button.dataset.note = String(key.note);
  button.disabled = true;
  button.setAttribute("aria-label", `${key.name}, computer key ${key.label}`);
  button.innerHTML = `<span>${key.label}</span><small>${key.name}</small>`;
  const owner = (pointerId) => `pointer:${pointerId}:${key.note}`;
  button.addEventListener("pointerdown", (event) => {
    button.setPointerCapture(event.pointerId);
    inputController.start(owner(event.pointerId), key.note);
  });
  button.addEventListener("pointerup", (event) => inputController.stop(owner(event.pointerId)));
  button.addEventListener("pointercancel", (event) => inputController.stop(owner(event.pointerId)));
  const buttons = keyButtons.get(key.note) ?? [];
  buttons.push(button);
  keyButtons.set(key.note, buttons);
  return button;
}

function renderKeyGroup(containerId, keys, colour) {
  const container = document.querySelector(containerId);
  for (const key of keys) container.append(createKeyButton(key, colour));
}

renderKeyGroup("#upper-black-keys", UPPER_BLACK_KEYS, "black");
renderKeyGroup("#upper-white-keys", UPPER_WHITE_KEYS, "white");
renderKeyGroup("#lower-black-keys", LOWER_BLACK_KEYS, "black");
renderKeyGroup("#lower-white-keys", LOWER_WHITE_KEYS, "white");

function renderKeys() {
  const ready = audioEngine.isReady();
  for (const [note, buttons] of keyButtons) {
    for (const button of buttons) {
      button.disabled = !ready;
      button.classList.toggle("active", activeNotes.has(note));
      button.setAttribute("aria-pressed", String(activeNotes.has(note)));
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

function stopTimeDisplay() { if (timeFrame !== null) cancelAnimationFrame(timeFrame); timeFrame = null; }

function render() {
  const state = audioEngine.getState();
  const content = errorState ? { title: "Needs attention", action: "Try again", description: errorState.message } : (stateContent[state] ?? stateContent.idle);
  const ready = audioEngine.isReady();
  const sampleRate = audioEngine.getSampleRate();
  elements.audioState.textContent = content.title; elements.actionLabel.textContent = content.action; elements.statusDescription.textContent = content.description; elements.contextState.textContent = state === "idle" ? "Not created" : state; elements.sampleRate.textContent = sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : "—"; elements.statusLight.dataset.state = errorState ? "error" : state; elements.errorPanel.hidden = !errorState; elements.errorMessage.textContent = errorState?.message ?? "";
  elements.action.disabled = state === "running" || state === "closed"; elements.testSignal.disabled = !ready; elements.muteToggle.disabled = !ready; elements.muteToggle.setAttribute("aria-pressed", String(audioEngine.getIsMuted())); elements.muteLabel.textContent = audioEngine.getIsMuted() ? "Unmute output" : "Mute output"; elements.voiceType.disabled = !ready; elements.voiceHold.disabled = !ready; elements.voiceTrigger.disabled = !ready; elements.voiceSchedule.disabled = !ready; elements.stopSound.disabled = !ready; elements.activeVoices.textContent = String(voiceEngine.getActiveVoiceCount());
  renderKeys();
  if (ready) startTimeDisplay(); else { stopTimeDisplay(); elements.audioTime.textContent = "—"; }
}

function selectedVoice() { return { type: elements.voiceType.value, frequency: midiNoteToFrequency(60) }; }
function stopHeldVoice() { heldVoice?.stop(); heldVoice = null; }
function stopAllSound() { stopHeldVoice(); inputController.stopAll(); voiceEngine.stopAll(); }

elements.action.addEventListener("click", async () => {
  errorState = null; elements.action.disabled = true; elements.actionLabel.textContent = "Starting…";
  try { await audioEngine.enable(); } catch (error) { console.error("Audio engine failed to enable.", error); errorState = isAudioEngineError(error) ? error : createAudioEngineError("unexpected", "An unexpected audio error occurred.", error); }
  render();
});
elements.testSignal.addEventListener("click", audioEngine.playDiagnosticTone);
elements.muteToggle.addEventListener("click", audioEngine.toggleMuted);
elements.voiceTrigger.addEventListener("click", () => voiceEngine.trigger({ ...selectedVoice(), duration: 0.2 }));
elements.voiceSchedule.addEventListener("click", () => voiceEngine.trigger({ ...selectedVoice(), startTime: audioEngine.getCurrentTime() + 0.5, duration: 0.2 }));
elements.voiceHold.addEventListener("pointerdown", (event) => { event.currentTarget.setPointerCapture(event.pointerId); if (!heldVoice) heldVoice = voiceEngine.trigger(selectedVoice()); });
elements.voiceHold.addEventListener("pointerup", stopHeldVoice); elements.voiceHold.addEventListener("pointercancel", stopHeldVoice);
elements.voiceHold.addEventListener("keydown", (event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat && !heldVoice) heldVoice = voiceEngine.trigger(selectedVoice()); });
elements.voiceHold.addEventListener("keyup", (event) => { if (event.key === " " || event.key === "Enter") stopHeldVoice(); });
elements.stopSound.addEventListener("click", stopAllSound);

document.addEventListener("keydown", inputController.handleKeyDown);
document.addEventListener("keyup", inputController.handleKeyUp);
document.addEventListener("visibilitychange", () => { if (document.hidden) stopAllSound(); });
window.addEventListener("blur", stopAllSound);
window.addEventListener("pagehide", () => { stopAllSound(); stopTimeDisplay(); });
audioEngine.addEventListener("statechange", () => { if (audioEngine.getState() === "running") errorState = null; render(); });
audioEngine.addEventListener("mutechange", render);
voiceEngine.addEventListener("voiceschange", render);

render();
