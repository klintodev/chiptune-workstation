const DEFAULT_MASTER_GAIN = 0.35;
const GAIN_RAMP_SECONDS = 0.015;

export function createAudioEngineError(code, message, cause) {
  const error = new Error(message, { cause });
  error.name = "AudioEngineError";
  error.code = code;
  return error;
}

export function isAudioEngineError(error) {
  return error instanceof Error && error.name === "AudioEngineError";
}

export function createAudioEngine() {
  const events = new EventTarget();
  let context = null;
  let masterGain = null;
  let muted = false;
  let initialization = null;
  let disposed = false;

  function getState() {
    if (disposed) return "closed";
    return context?.state ?? "idle";
  }

  function isReady() {
    return context?.state === "running" && masterGain !== null;
  }

  function emitState() {
    events.dispatchEvent(
      new CustomEvent("statechange", {
        detail: { state: getState(), sampleRate: context?.sampleRate ?? null },
      }),
    );
  }

  function requireReady() {
    if (!isReady()) {
      throw createAudioEngineError(
        "not-ready",
        "Enable or resume audio before using the master signal path.",
      );
    }
  }

  async function enableOnce() {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;

    if (!Context) {
      throw createAudioEngineError(
        "unsupported",
        "This browser does not support the Web Audio API. Try a current version of Chrome, Edge, Firefox, or Safari.",
      );
    }

    try {
      if (!context) {
        context = new Context();
        context.addEventListener("statechange", emitState);
        masterGain = context.createGain();
        masterGain.gain.setValueAtTime(DEFAULT_MASTER_GAIN, context.currentTime);
        masterGain.connect(context.destination);
      }

      if (context.state === "suspended") await context.resume();

      if (context.state !== "running") {
        throw createAudioEngineError(
          "blocked",
          "Audio is still paused by the browser. Select Enable audio again to retry.",
        );
      }

      emitState();
    } catch (error) {
      emitState();
      if (isAudioEngineError(error)) throw error;

      throw createAudioEngineError(
        "initialization-failed",
        "The browser could not start audio. Check the site's sound permissions and try again.",
        error,
      );
    }
  }

  async function enable() {
    if (disposed) {
      throw createAudioEngineError(
        "closed",
        "The audio engine has been closed. Reload the page to start a new session.",
      );
    }

    if (initialization) return initialization;
    initialization = enableOnce();

    try {
      await initialization;
    } finally {
      initialization = null;
    }
  }

  function setMasterGain(value) {
    const now = context.currentTime;
    const parameter = masterGain.gain;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(value, now + GAIN_RAMP_SECONDS);
  }

  function setMuted(nextMuted) {
    requireReady();
    muted = Boolean(nextMuted);
    setMasterGain(muted ? 0 : DEFAULT_MASTER_GAIN);
    events.dispatchEvent(new CustomEvent("mutechange", { detail: { muted } }));
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  function getInputNode() {
    requireReady();
    return masterGain;
  }

  function getCurrentTime() {
    if (!context || !masterGain) {
      throw createAudioEngineError(
        "not-ready",
        "The audio engine must be enabled before reading audio time.",
      );
    }
    return context.currentTime;
  }

  function playDiagnosticTone() {
    requireReady();
    const now = context.currentTime;
    const duration = 0.16;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(440, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
    oscillator.addEventListener(
      "ended",
      () => {
        oscillator.disconnect();
        envelope.disconnect();
      },
      { once: true },
    );
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const contextToClose = context;

    contextToClose?.removeEventListener("statechange", emitState);
    masterGain?.disconnect();
    masterGain = null;
    context = null;

    if (contextToClose && contextToClose.state !== "closed") {
      try {
        await contextToClose.close();
      } catch (error) {
        console.warn("Audio context could not be closed cleanly.", error);
      }
    }
    emitState();
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    enable,
    dispose,
    getCurrentTime,
    getInputNode,
    getIsMuted: () => muted,
    getSampleRate: () => context?.sampleRate ?? null,
    getState,
    isReady,
    playDiagnosticTone,
    setMuted,
    toggleMuted,
  });
}

export const audioEngine = createAudioEngine();
