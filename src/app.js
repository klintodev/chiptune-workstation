import {
  audioEngine,
  createAudioEngineError,
  isAudioEngineError,
} from "./audio-engine.js";

const elements = {
  action: document.querySelector("#audio-action"),
  actionLabel: document.querySelector("#audio-action span"),
  audioState: document.querySelector("#audio-state"),
  audioTime: document.querySelector("#audio-time"),
  contextState: document.querySelector("#context-state"),
  errorMessage: document.querySelector("#error-message"),
  errorPanel: document.querySelector("#error-panel"),
  muteLabel: document.querySelector("#mute-label"),
  muteToggle: document.querySelector("#mute-toggle"),
  sampleRate: document.querySelector("#sample-rate"),
  statusDescription: document.querySelector("#status-description"),
  statusLight: document.querySelector("#status-light"),
  testSignal: document.querySelector("#test-signal"),
};

const stateContent = {
  idle: {
    title: "Not started",
    action: "Enable audio",
    description:
      "Browsers require a deliberate gesture before they allow sound. Nothing will play until you enable audio.",
  },
  running: {
    title: "Ready",
    action: "Audio enabled",
    description:
      "The audio clock is running. Future instruments will connect through the shared master signal path.",
  },
  suspended: {
    title: "Paused by browser",
    action: "Resume audio",
    description:
      "The browser suspended the audio context. Resume it here without reloading or creating a second context.",
  },
  closed: {
    title: "Closed",
    action: "Reload to restart",
    description: "This audio session has closed. Reload the page to start a new one.",
  },
};

let errorState = null;
let timeFrame = null;

function startTimeDisplay() {
  if (timeFrame !== null) return;
  const update = () => {
    if (!audioEngine.isReady()) {
      timeFrame = null;
      return;
    }
    elements.audioTime.textContent = `${audioEngine.getCurrentTime().toFixed(2)} s`;
    timeFrame = requestAnimationFrame(update);
  };
  timeFrame = requestAnimationFrame(update);
}

function stopTimeDisplay() {
  if (timeFrame === null) return;
  cancelAnimationFrame(timeFrame);
  timeFrame = null;
}

function render() {
  const state = audioEngine.getState();
  const content = errorState
    ? {
        title: "Needs attention",
        action: errorState.code === "closed" ? "Reload to restart" : "Try again",
        description: errorState.message,
      }
    : (stateContent[state] ?? stateContent.idle);
  const ready = audioEngine.isReady();
  const sampleRate = audioEngine.getSampleRate();

  elements.audioState.textContent = content.title;
  elements.actionLabel.textContent = content.action;
  elements.statusDescription.textContent = content.description;
  elements.contextState.textContent = state === "idle" ? "Not created" : state;
  elements.sampleRate.textContent = sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : "—";
  elements.statusLight.dataset.state = errorState ? "error" : state;
  elements.errorPanel.hidden = !errorState;
  elements.errorMessage.textContent = errorState?.message ?? "";
  elements.action.disabled = state === "running" || state === "closed";
  elements.testSignal.disabled = !ready;
  elements.muteToggle.disabled = !ready;
  elements.muteToggle.setAttribute("aria-pressed", String(audioEngine.getIsMuted()));
  elements.muteLabel.textContent = audioEngine.getIsMuted() ? "Unmute output" : "Mute output";

  if (ready) startTimeDisplay();
  else {
    stopTimeDisplay();
    elements.audioTime.textContent = "—";
  }
}

elements.action.addEventListener("click", async () => {
  errorState = null;
  elements.action.disabled = true;
  elements.actionLabel.textContent = "Starting…";

  try {
    await audioEngine.enable();
  } catch (error) {
    console.error("Audio engine failed to enable.", error);
    errorState = isAudioEngineError(error)
      ? error
      : createAudioEngineError("unexpected", "An unexpected audio error occurred.", error);
  }
  render();
});

elements.testSignal.addEventListener("click", () => {
  try {
    audioEngine.playDiagnosticTone();
  } catch (error) {
    console.error("Diagnostic signal failed.", error);
    errorState = error;
    render();
  }
});

elements.muteToggle.addEventListener("click", () => {
  try {
    audioEngine.toggleMuted();
  } catch (error) {
    console.error("Master mute failed.", error);
    errorState = error;
    render();
  }
});

audioEngine.addEventListener("statechange", () => {
  if (audioEngine.getState() === "running") errorState = null;
  render();
});
audioEngine.addEventListener("mutechange", render);
window.addEventListener("pagehide", stopTimeDisplay);

render();
