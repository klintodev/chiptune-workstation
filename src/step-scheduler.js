import { midiNoteToFrequency } from "./voice-engine.js";

export const DEFAULT_BPM = 120;
export const DEFAULT_GATE_RATIO = 0.8;
export const DEFAULT_LOOK_AHEAD_SECONDS = 0.1;
export const DEFAULT_SCHEDULER_INTERVAL_MS = 25;
export const DEFAULT_START_LEAD_SECONDS = 0.05;

export function getSixteenthNoteDuration(bpm) {
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) {
    throw new RangeError("Tempo must be between 40 and 240 BPM.");
  }
  return 60 / bpm / 4;
}

export function createStepScheduler({
  getAudioTime,
  getInstrumentConfig,
  getPatternState,
  voiceEngine,
  bpm = DEFAULT_BPM,
  gateRatio = DEFAULT_GATE_RATIO,
  lookAheadSeconds = DEFAULT_LOOK_AHEAD_SECONDS,
  schedulerIntervalMs = DEFAULT_SCHEDULER_INTERVAL_MS,
  startLeadSeconds = DEFAULT_START_LEAD_SECONDS,
  setIntervalFn = (callback, interval) => globalThis.setInterval(callback, interval),
  clearIntervalFn = (timer) => globalThis.clearInterval(timer),
}) {
  if (!Number.isFinite(gateRatio) || gateRatio <= 0 || gateRatio > 1) {
    throw new RangeError("Gate ratio must be greater than zero and no more than one.");
  }
  if (!Number.isFinite(lookAheadSeconds) || lookAheadSeconds <= 0 || lookAheadSeconds > 0.5) {
    throw new RangeError("Look-ahead must be greater than zero and no more than 0.5 seconds.");
  }
  if (!Number.isFinite(schedulerIntervalMs) || schedulerIntervalMs < 10 || schedulerIntervalMs > 100) {
    throw new RangeError("Scheduler interval must be between 10 and 100 milliseconds.");
  }
  if (!Number.isFinite(startLeadSeconds) || startLeadSeconds < 0 || startLeadSeconds > lookAheadSeconds) {
    throw new RangeError("Start lead must be between zero and the look-ahead horizon.");
  }

  const events = new EventTarget();
  const stepDurationSeconds = getSixteenthNoteDuration(bpm);
  let nextSessionId = 1;
  let session = null;

  function emitState(status, sessionId, error) {
    events.dispatchEvent(new CustomEvent("statechange", {
      detail: { status, sessionId, error },
    }));
  }

  function clearSessionTimer(activeSession) {
    if (activeSession.timer === null) return;
    clearIntervalFn(activeSession.timer);
    activeSession.timer = null;
  }

  function finishSession(activeSession) {
    if (session !== activeSession) return;
    clearSessionTimer(activeSession);
    session = null;
    emitState("complete", activeSession.id);
  }

  function stopSession(activeSession, status = "stopped", error) {
    if (session !== activeSession) return false;
    clearSessionTimer(activeSession);
    const stopTime = getAudioTime();
    for (const voice of activeSession.voices.values()) voice.stop(stopTime);
    session = null;
    emitState(status, activeSession.id, error);
    return true;
  }

  function scheduleStep(activeSession, stepIndex, startTime) {
    const note = getPatternState().steps[stepIndex];
    if (note === null) return;
    const config = getInstrumentConfig();
    const voice = voiceEngine.trigger({
      type: config.voiceType,
      frequency: midiNoteToFrequency(note),
      startTime,
      duration: stepDurationSeconds * gateRatio,
      attackSeconds: config.attackSeconds,
      releaseSeconds: config.releaseSeconds,
    });
    activeSession.voices.set(stepIndex, voice);
  }

  function tick(sessionId) {
    const activeSession = session;
    if (!activeSession || activeSession.id !== sessionId) return;

    try {
      const now = getAudioTime();

      while (
        activeSession.nextStepIndex < activeSession.stepCount &&
        activeSession.nextStepTime < now
      ) {
        activeSession.nextStepIndex += 1;
        activeSession.nextStepTime += stepDurationSeconds;
      }

      const horizon = now + lookAheadSeconds;
      while (
        activeSession.nextStepIndex < activeSession.stepCount &&
        activeSession.nextStepTime <= horizon
      ) {
        scheduleStep(
          activeSession,
          activeSession.nextStepIndex,
          activeSession.nextStepTime,
        );
        activeSession.nextStepIndex += 1;
        activeSession.nextStepTime += stepDurationSeconds;
      }

      if (
        activeSession.nextStepIndex >= activeSession.stepCount &&
        now >= activeSession.endTime
      ) {
        finishSession(activeSession);
      }
    } catch (error) {
      stopSession(activeSession, "error", error);
    }
  }

  function playOnce() {
    if (session) return false;
    const { steps } = getPatternState();
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new RangeError("A scheduled pattern must contain at least one step.");
    }

    const startTime = getAudioTime() + startLeadSeconds;
    const activeSession = {
      id: nextSessionId,
      timer: null,
      voices: new Map(),
      stepCount: steps.length,
      nextStepIndex: 0,
      nextStepTime: startTime,
      endTime: startTime + steps.length * stepDurationSeconds,
    };
    nextSessionId += 1;
    session = activeSession;
    activeSession.timer = setIntervalFn(
      () => tick(activeSession.id),
      schedulerIntervalMs,
    );
    emitState("playing", activeSession.id);
    tick(activeSession.id);
    return true;
  }

  function stop() {
    return session ? stopSession(session) : false;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    getIsPlaying: () => session !== null,
    playOnce,
    removeEventListener: events.removeEventListener.bind(events),
    stop,
  });
}
