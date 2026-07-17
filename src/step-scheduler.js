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
  let nextVoiceId = 1;
  let retainedStepIndex = 0;
  let status = "stopped";
  let session = null;

  function emitState(error) {
    events.dispatchEvent(new CustomEvent("statechange", {
      detail: { ...getState(), error },
    }));
  }

  function getState() {
    return Object.freeze({
      status,
      retainedStepIndex,
      sessionId: session?.id ?? null,
    });
  }

  function clearSessionTimer(activeSession) {
    if (activeSession.timer === null) return;
    clearIntervalFn(activeSession.timer);
    activeSession.timer = null;
  }

  function releaseSessionVoices(activeSession, stopTime) {
    for (const record of activeSession.voices.values()) record.voice.stop(stopTime);
    activeSession.voices.clear();
  }

  function endSession(activeSession, stopTime) {
    if (session !== activeSession) return false;
    clearSessionTimer(activeSession);
    releaseSessionVoices(activeSession, stopTime);
    session = null;
    return true;
  }

  function pruneFinishedVoices(activeSession, now) {
    for (const [id, record] of activeSession.voices) {
      if (record.endTime <= now) activeSession.voices.delete(id);
    }
  }

  function getNextStepAtTime(activeSession, audioTime) {
    if (audioTime <= activeSession.anchorTime) return activeSession.anchorStepIndex;
    const elapsedSteps = Math.ceil(
      (audioTime - activeSession.anchorTime) / stepDurationSeconds,
    );
    return (activeSession.anchorStepIndex + elapsedSteps) % activeSession.stepCount;
  }

  function getPlayheadStep(audioTime) {
    const activeSession = session;
    if (status !== "playing" || !activeSession) return retainedStepIndex;
    const resolvedAudioTime = audioTime ?? getAudioTime();
    if (resolvedAudioTime <= activeSession.anchorTime) return activeSession.anchorStepIndex;
    const elapsedSteps = Math.floor(
      (resolvedAudioTime - activeSession.anchorTime) / stepDurationSeconds,
    );
    return (activeSession.anchorStepIndex + elapsedSteps) % activeSession.stepCount;
  }

  function scheduleStep(activeSession, stepIndex, startTime) {
    const note = getPatternState().steps[stepIndex];
    if (note === null) return;
    const config = getInstrumentConfig();
    const duration = stepDurationSeconds * gateRatio;
    const voice = voiceEngine.trigger({
      type: config.voiceType,
      frequency: midiNoteToFrequency(note),
      startTime,
      duration,
      attackSeconds: config.attackSeconds,
      releaseSeconds: config.releaseSeconds,
    });
    activeSession.voices.set(nextVoiceId, {
      voice,
      endTime: startTime + duration + config.releaseSeconds + 0.01,
    });
    nextVoiceId += 1;
  }

  function failSession(activeSession, error) {
    if (session !== activeSession) return;
    clearSessionTimer(activeSession);
    try {
      releaseSessionVoices(activeSession, getAudioTime());
    } catch {
      activeSession.voices.clear();
    }
    session = null;
    retainedStepIndex = 0;
    status = "stopped";
    emitState(error);
  }

  function tick(sessionId) {
    const activeSession = session;
    if (!activeSession || activeSession.id !== sessionId) return;

    try {
      const now = getAudioTime();
      pruneFinishedVoices(activeSession, now);

      if (activeSession.nextStepTime < now) {
        const missedSteps = Math.ceil(
          (now - activeSession.nextStepTime) / stepDurationSeconds,
        );
        activeSession.nextStepIndex =
          (activeSession.nextStepIndex + missedSteps) % activeSession.stepCount;
        activeSession.nextStepTime += missedSteps * stepDurationSeconds;
      }

      const horizon = now + lookAheadSeconds;
      while (activeSession.nextStepTime <= horizon) {
        scheduleStep(activeSession, activeSession.nextStepIndex, activeSession.nextStepTime);
        activeSession.nextStepIndex = (activeSession.nextStepIndex + 1) % activeSession.stepCount;
        activeSession.nextStepTime += stepDurationSeconds;
      }
    } catch (error) {
      failSession(activeSession, error);
    }
  }

  function play() {
    if (status === "playing") return false;
    const { steps } = getPatternState();
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new RangeError("A scheduled pattern must contain at least one step.");
    }

    const anchorTime = getAudioTime() + startLeadSeconds;
    const activeSession = {
      anchorStepIndex: retainedStepIndex,
      anchorTime,
      id: nextSessionId,
      nextStepIndex: retainedStepIndex,
      nextStepTime: anchorTime,
      stepCount: steps.length,
      timer: null,
      voices: new Map(),
    };
    nextSessionId += 1;
    session = activeSession;
    status = "playing";
    activeSession.timer = setIntervalFn(
      () => tick(activeSession.id),
      schedulerIntervalMs,
    );
    emitState();
    tick(activeSession.id);
    return true;
  }

  function pause() {
    const activeSession = session;
    if (status !== "playing" || !activeSession) return false;
    const now = getAudioTime();
    retainedStepIndex = getNextStepAtTime(activeSession, now);
    endSession(activeSession, now);
    status = "paused";
    emitState();
    return true;
  }

  function stop() {
    if (status === "stopped") return false;
    if (session) endSession(session, getAudioTime());
    retainedStepIndex = 0;
    status = "stopped";
    emitState();
    return true;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    getPlayheadStep,
    getState,
    pause,
    play,
    removeEventListener: events.removeEventListener.bind(events),
    stop,
  });
}
