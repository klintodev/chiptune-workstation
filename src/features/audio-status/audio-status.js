import { queryRequired } from "../../shared/query-required.js";
const STATE_CONTENT = Object.freeze({
  idle: {
    title: "Not started",
    action: "Enable audio",
    description: "Browsers require a deliberate gesture before they allow sound. Nothing will play until you enable audio.",
  },
  running: {
    title: "Ready",
    action: "Audio enabled",
    description: "The audio clock is running. Instruments connect through the shared master signal path.",
  },
  suspended: {
    title: "Paused by browser",
    action: "Resume audio",
    description: "The browser suspended the audio context. Resume it here without creating a second context.",
  },
  closed: {
    title: "Closed",
    action: "Reload to restart",
    description: "This audio session has closed. Reload the page to start a new one.",
  },
});

export function createAudioStatusFeature({
  audioEngine,
  createUnexpectedError,
  isAudioEngineError,
  onRenderDependants,
  root = document,
  sessionState,
}) {
  const lifecycle = new AbortController();
  const elements = {
    action: queryRequired(root, "#audio-action"),
    actionLabel: queryRequired(root, "#audio-action span"),
    audioState: queryRequired(root, "#audio-state"),
    audioTime: queryRequired(root, "#audio-time"),
    contextState: queryRequired(root, "#context-state"),
    errorMessage: queryRequired(root, "#error-message"),
    errorPanel: queryRequired(root, "#error-panel"),
    sampleRate: queryRequired(root, "#sample-rate"),
    setup: queryRequired(root, "#audio-setup"),
    statusDescription: queryRequired(root, "#status-description"),
    statusLight: queryRequired(root, "#status-light"),
  };
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
    if (timeFrame !== null) cancelAnimationFrame(timeFrame);
    timeFrame = null;
  }

  function render() {
    const state = audioEngine.getState();
    const { error } = sessionState.getState().audio;
    const content = error
      ? { title: "Needs attention", action: "Try again", description: error.message }
      : (STATE_CONTENT[state] ?? STATE_CONTENT.idle);
    const sampleRate = audioEngine.getSampleRate();

    elements.audioState.textContent = content.title;
    elements.actionLabel.textContent = content.action;
    elements.statusDescription.textContent = content.description;
    elements.contextState.textContent = state === "idle" ? "Not created" : state;
    elements.sampleRate.textContent = sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : "\u2014";
    elements.statusLight.dataset.state = error ? "error" : state;
    elements.errorPanel.hidden = !error;
    elements.errorMessage.textContent = error?.message ?? "";
    elements.setup.hidden = state === "running" && !error;
    elements.action.disabled = state === "running" || state === "closed";

    if (audioEngine.isReady()) startTimeDisplay();
    else {
      stopTimeDisplay();
      elements.audioTime.textContent = "\u2014";
    }
    onRenderDependants?.();
  }

  elements.action.addEventListener("click", async () => {
    sessionState.setAudio({ error: null });
    elements.action.disabled = true;
    elements.actionLabel.textContent = "Starting\u2026";
    try {
      await audioEngine.enable();
    } catch (error) {
      console.error("Audio engine failed to enable.", error);
      sessionState.setAudio({
        error: isAudioEngineError(error) ? error : createUnexpectedError(error),
      });
    }
    render();
  }, { signal: lifecycle.signal });

  const handleAudioStateChange = () => {
    const status = audioEngine.getState();
    sessionState.setAudio({
      error: status === "running" ? null : sessionState.getState().audio.error,
      status,
    });
    render();
  };
  audioEngine.addEventListener("statechange", handleAudioStateChange, { signal: lifecycle.signal });

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      stopTimeDisplay();
    },
    render,
    stopTimeDisplay,
  });
}
