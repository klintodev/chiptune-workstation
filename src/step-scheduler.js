import { midiNoteToFrequency } from "./voice-engine.js";

export const DEFAULT_BPM = 120;
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
  lookAheadSeconds = DEFAULT_LOOK_AHEAD_SECONDS,
  schedulerIntervalMs = DEFAULT_SCHEDULER_INTERVAL_MS,
  startLeadSeconds = DEFAULT_START_LEAD_SECONDS,
  setIntervalFn = (callback, interval) => globalThis.setInterval(callback, interval),
  clearIntervalFn = (timer) => globalThis.clearInterval(timer),
}) {
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
  let currentBpm = bpm;
  let currentStepDurationSeconds = getSixteenthNoteDuration(currentBpm);
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
      bpm: currentBpm,
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

  function pruneTempoSegments(activeSession, now) {
    while (
      activeSession.tempoSegments.length > 1 &&
      activeSession.tempoSegments[1].anchorTime <= now
    ) {
      activeSession.tempoSegments.shift();
    }
  }

  function getTempoSegmentAtTime(activeSession, audioTime) {
    let selected = activeSession.tempoSegments[0];
    for (const segment of activeSession.tempoSegments) {
      if (segment.anchorTime > audioTime) break;
      selected = segment;
    }
    return selected;
  }

  function getNextStepAtTime(activeSession, audioTime) {
    const segment = getTempoSegmentAtTime(activeSession, audioTime);
    if (audioTime <= segment.anchorTime) return segment.anchorStepIndex;
    const elapsedSteps = Math.ceil(
      (audioTime - segment.anchorTime) / segment.stepDurationSeconds,
    );
    return (segment.anchorStepIndex + elapsedSteps) % activeSession.stepCount;
  }

  function getPlayheadStep(audioTime) {
    const activeSession = session;
    if (status !== "playing" || !activeSession) return retainedStepIndex;
    const resolvedAudioTime = audioTime ?? getAudioTime();
    const segment = getTempoSegmentAtTime(activeSession, resolvedAudioTime);
    if (resolvedAudioTime <= segment.anchorTime) return segment.anchorStepIndex;
    const elapsedSteps = Math.floor(
      (resolvedAudioTime - segment.anchorTime) / segment.stepDurationSeconds,
    );
    return (segment.anchorStepIndex + elapsedSteps) % activeSession.stepCount;
  }

  function scheduleStep(activeSession, stepIndex, startTime) {
    const step = getPatternState().steps[stepIndex];
    if (step === null) return;
    const config = getInstrumentConfig();
    const duration = activeSession.stepDurationSeconds * step.gate;
    const voice = voiceEngine.trigger({
      type: config.voiceType,
      frequency: midiNoteToFrequency(step.note),
      startTime,
      duration,
      intensity: step.accented ? 1 : 0.7,
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
      pruneTempoSegments(activeSession, now);

      if (activeSession.nextStepTime < now) {
        const missedSteps = Math.ceil(
          (now - activeSession.nextStepTime) / activeSession.stepDurationSeconds,
        );
        activeSession.nextStepIndex =
          (activeSession.nextStepIndex + missedSteps) % activeSession.stepCount;
        activeSession.nextStepTime += missedSteps * activeSession.stepDurationSeconds;
      }

      const horizon = now + lookAheadSeconds;
      while (activeSession.nextStepTime <= horizon) {
        scheduleStep(activeSession, activeSession.nextStepIndex, activeSession.nextStepTime);
        activeSession.nextStepIndex = (activeSession.nextStepIndex + 1) % activeSession.stepCount;
        activeSession.nextStepTime += activeSession.stepDurationSeconds;
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
      stepDurationSeconds: currentStepDurationSeconds,
      tempoSegments: [{
        anchorStepIndex: retainedStepIndex,
        anchorTime,
        stepDurationSeconds: currentStepDurationSeconds,
      }],
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

  function setBpm(nextBpm) {
    const nextStepDurationSeconds = getSixteenthNoteDuration(nextBpm);
    if (nextBpm === currentBpm) return false;
    currentBpm = nextBpm;
    currentStepDurationSeconds = nextStepDurationSeconds;

    if (session) {
      session.stepDurationSeconds = nextStepDurationSeconds;
      const segment = {
        anchorStepIndex: session.nextStepIndex,
        anchorTime: session.nextStepTime,
        stepDurationSeconds: nextStepDurationSeconds,
      };
      const lastSegment = session.tempoSegments.at(-1);
      if (lastSegment.anchorTime === segment.anchorTime) {
        session.tempoSegments[session.tempoSegments.length - 1] = segment;
      } else {
        session.tempoSegments.push(segment);
      }
    }

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
    setBpm,
    stop,
  });
}
