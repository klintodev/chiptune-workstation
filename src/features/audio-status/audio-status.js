import { queryRequired } from "../../shared/query-required.js";
import { announceStatus, setTextIfChanged } from "../../shared/status-announcer.js";
const STATE_CONTENT = Object.freeze({
  idle: {
    title: "Not started",
    action: "Start making music",
    description: "Create, arrange, visualise and share chiptune tracks in your browser\u2014no installation required.",
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
    close: queryRequired(root, "#audio-setup-close"),
    audioTime: queryRequired(root, "#audio-time"),
    contextState: queryRequired(root, "#context-state"),
    errorMessage: queryRequired(root, "#error-message"),
    errorPanel: queryRequired(root, "#error-panel"),
    sampleRate: queryRequired(root, "#sample-rate"),
    setup: queryRequired(root, "#audio-setup"),
    statusOpen: queryRequired(root, "#audio-status-open"),
    statusDescription: queryRequired(root, "#status-description"),
    statusLight: queryRequired(root, "#status-light"),
  };
  let timeFrame = null;
  let previousStatus = null;
  let setupDismissed = false;
  let setupReturnFocus = null;
  if (elements.setup.open) elements.setup.close();

  function focusAfterSetup() {
    const fallback = root.querySelector(".v2-piano-canvas, .pattern-step-set");
    const target = setupReturnFocus?.isConnected
      && setupReturnFocus !== root.body
      ? setupReturnFocus
      : fallback;
    setupReturnFocus = null;
    globalThis.queueMicrotask?.(() => target?.focus());
  }

  function openSetup(returnFocus = root.activeElement) {
    setupDismissed = false;
    setupReturnFocus = returnFocus;
    if (!elements.setup.open) elements.setup.showModal();
    elements.action.focus();
  }

  function closeSetup({ dismissed = false } = {}) {
    setupDismissed = dismissed;
    if (elements.setup.open) elements.setup.close();
    focusAfterSetup();
  }

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

    setTextIfChanged(elements.audioState, content.title);
    setTextIfChanged(elements.actionLabel, content.action);
    setTextIfChanged(elements.statusDescription, content.description);
    setTextIfChanged(elements.contextState, state === "idle" ? "Not created" : state);
    setTextIfChanged(elements.sampleRate, sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : "\u2014");
    elements.statusLight.dataset.state = error ? "error" : state;
    elements.errorPanel.hidden = !error;
    setTextIfChanged(elements.errorMessage, error?.message ?? "");
    const needsSetup = state !== "running" || Boolean(error);
    if (needsSetup && !setupDismissed && !elements.setup.open) openSetup();
    if ((!needsSetup || setupDismissed) && elements.setup.open) closeSetup({
      dismissed: setupDismissed,
    });
    elements.action.disabled = state === "running" || state === "closed";
    const semanticStatus = error ? `Error: ${error.message}` : state;
    if (semanticStatus !== previousStatus) {
      previousStatus = semanticStatus;
      if (state === "running" && !error) announceStatus(root, "Ready");
      if (error) announceStatus(root, `Error: ${error.message}`);
    }

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
  elements.close.addEventListener("click", () => closeSetup({ dismissed: true }), {
    signal: lifecycle.signal,
  });
  elements.statusOpen.addEventListener("click", () => openSetup(elements.statusOpen), {
    signal: lifecycle.signal,
  });
  root.querySelector("#mobile-audio-open")?.addEventListener("click", () => {
    const mobileMix = root.querySelector("#mobile-mix-dialog");
    if (mobileMix?.open) mobileMix.close();
    openSetup(root.querySelector("#mobile-mix-open"));
  }, { signal: lifecycle.signal });
  elements.setup.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSetup({ dismissed: true });
  }, {
    signal: lifecycle.signal,
  });

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
