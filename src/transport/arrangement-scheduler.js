import { midiNoteToFrequency } from "../audio/voice-engine.js?v=20260721-1";
import { getArrangementEnd, MAX_ARRANGEMENT_STEPS } from "../state/project-state.js";
import {
  DEFAULT_BPM,
  DEFAULT_LOOK_AHEAD_SECONDS,
  DEFAULT_SCHEDULER_INTERVAL_MS,
  DEFAULT_START_LEAD_SECONDS,
  getSixteenthNoteDuration,
} from "./step-scheduler.js";

const MODES = new Set(["arrangement", "pattern"]);

export function createArrangementScheduler({
  bpm = DEFAULT_BPM,
  clearIntervalFn = (timer) => globalThis.clearInterval(timer),
  getAudioTime,
  getProjectState,
  getSelectedPatternId,
  getSelectedTrackId,
  getVoiceEngine,
  lookAheadSeconds = DEFAULT_LOOK_AHEAD_SECONDS,
  schedulerIntervalMs = DEFAULT_SCHEDULER_INTERVAL_MS,
  setIntervalFn = (callback, interval) => globalThis.setInterval(callback, interval),
  startLeadSeconds = DEFAULT_START_LEAD_SECONDS,
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
  let mode = "arrangement";
  let nextSessionId = 1;
  let nextVoiceId = 1;
  let retainedStepIndex = 0;
  let startStep = 0;
  let status = "stopped";
  let session = null;

  function getState() {
    return Object.freeze({
      bpm: currentBpm,
      mode,
      retainedStepIndex,
      sessionId: session?.id ?? null,
      startStep,
      status,
    });
  }

  function emitState(error) {
    events.dispatchEvent(new CustomEvent("statechange", {
      detail: Object.freeze({ ...getState(), error }),
    }));
  }

  function clearSessionTimer(activeSession) {
    if (activeSession.timer === null) return;
    clearIntervalFn(activeSession.timer);
    activeSession.timer = null;
  }

  function releaseSessionVoices(activeSession, stopTime, predicate = () => true) {
    for (const [id, record] of activeSession.voices) {
      if (!predicate(record)) continue;
      record.voice.stop(stopTime);
      activeSession.voices.delete(id);
    }
  }

  function endSession(activeSession, stopTime, { release = true } = {}) {
    if (session !== activeSession) return false;
    clearSessionTimer(activeSession);
    if (release) releaseSessionVoices(activeSession, stopTime);
    activeSession.voices.clear();
    session = null;
    return true;
  }

  function pruneFinishedVoices(activeSession, now) {
    for (const [id, record] of activeSession.voices) {
      if (record.endTime <= now) activeSession.voices.delete(id);
    }
    activeSession.positions = activeSession.positions.filter(
      (position) => position.startTime + position.duration >= now - 0.5,
    );
  }

  function getPattern(project, patternId) {
    const pattern = project.patterns.find((candidate) => candidate.id === patternId);
    if (!pattern) throw new RangeError(`Unknown pattern: ${patternId}`);
    return pattern;
  }

  function getTrack(project, trackId) {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new RangeError(`Unknown track: ${trackId}`);
    return track;
  }

  function getBounds(activeSession, project = getProjectState()) {
    if (activeSession.mode === "pattern") {
      const pattern = getPattern(project, activeSession.patternId);
      return { endStep: pattern.steps.length, looping: true, startStep: 0 };
    }
    if (project.transport.loop.enabled) {
      return {
        endStep: project.transport.loop.endStep,
        looping: true,
        startStep: project.transport.loop.startStep,
      };
    }
    return { endStep: getArrangementEnd(project), looping: false, startStep: 0 };
  }

  function getNextStep(activeSession, currentStep, project = getProjectState()) {
    const bounds = getBounds(activeSession, project);
    const candidate = currentStep + 1;
    if (candidate < bounds.endStep) return candidate;
    return bounds.looping ? bounds.startStep : null;
  }

  function triggerStep(activeSession, { clipId = null, pattern, step, track }, startTime) {
    if (step === null || step.volume === 0) return null;
    const config = track.instrument;
    const duration = activeSession.stepDurationSeconds * step.gate;
    const voice = getVoiceEngine(track.id).trigger({
      type: config.voiceType,
      frequency: midiNoteToFrequency(step.note + config.octaveOffset * 12),
      startTime,
      duration,
      intensity: step.volume,
      attackSeconds: config.attackSeconds,
      releaseSeconds: config.releaseSeconds,
    });
    const endTime = startTime + duration + config.releaseSeconds + 0.01;
    activeSession.voices.set(nextVoiceId, {
      clipId,
      endTime,
      patternId: pattern.id,
      startTime,
      trackId: track.id,
      voice,
    });
    nextVoiceId += 1;
    return endTime;
  }

  function schedulePatternStep(activeSession, stepIndex, startTime, project) {
    const pattern = getPattern(project, activeSession.patternId);
    const track = getTrack(project, activeSession.trackId);
    return triggerStep(activeSession, {
      pattern,
      step: pattern.steps[stepIndex],
      track,
    }, startTime);
  }

  function scheduleArrangementStep(activeSession, stepIndex, startTime, project) {
    const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
    let latestEndTime = null;
    for (const track of project.tracks) {
      const clip = track.clips.find((candidate) => {
        const pattern = patterns.get(candidate.patternId);
        return candidate.startStep <= stepIndex && stepIndex < candidate.startStep + pattern.steps.length;
      });
      if (!clip) continue;
      const pattern = patterns.get(clip.patternId);
      const localStep = stepIndex - clip.startStep;
      const endTime = triggerStep(activeSession, {
        clipId: clip.id,
        pattern,
        step: pattern.steps[localStep],
        track,
      }, startTime);
      if (endTime !== null) latestEndTime = Math.max(latestEndTime ?? endTime, endTime);
    }
    return latestEndTime;
  }

  function markFinishing(activeSession, boundaryTime, latestEndTime) {
    activeSession.finishing = true;
    activeSession.finishTime = Math.max(
      boundaryTime,
      latestEndTime ?? boundaryTime,
      ...[...activeSession.voices.values()].map((record) => record.endTime),
    );
  }

  function schedulePosition(activeSession, stepIndex, startTime) {
    const project = getProjectState();
    const latestEndTime = activeSession.mode === "pattern"
      ? schedulePatternStep(activeSession, stepIndex, startTime, project)
      : scheduleArrangementStep(activeSession, stepIndex, startTime, project);
    activeSession.positions.push({
      duration: activeSession.stepDurationSeconds,
      startTime,
      stepIndex,
    });
    const nextStep = getNextStep(activeSession, stepIndex, project);
    if (nextStep === null) {
      activeSession.lastScheduledStep = stepIndex;
      activeSession.nextStepIndex = null;
      markFinishing(activeSession, startTime + activeSession.stepDurationSeconds, latestEndTime);
      return;
    }
    activeSession.nextStepIndex = nextStep;
    activeSession.nextStepTime = startTime + activeSession.stepDurationSeconds;
  }

  function reviveExtendedArrangement(activeSession) {
    if (!activeSession.finishing || activeSession.mode !== "arrangement") return false;
    if (getProjectState().transport.loop.enabled) return false;
    const nextStep = activeSession.lastScheduledStep + 1;
    if (getArrangementEnd(getProjectState()) <= nextStep) return false;
    activeSession.finishing = false;
    activeSession.finishTime = null;
    activeSession.nextStepIndex = nextStep;
    activeSession.nextStepTime = activeSession.positions.at(-1).startTime + activeSession.stepDurationSeconds;
    return true;
  }

  function completeSession(activeSession) {
    if (session !== activeSession) return;
    endSession(activeSession, getAudioTime(), { release: false });
    retainedStepIndex = activeSession.mode === "arrangement" ? startStep : 0;
    status = "stopped";
    emitState();
  }

  function failSession(activeSession, error) {
    if (session !== activeSession) return;
    try {
      endSession(activeSession, getAudioTime());
    } catch {
      clearSessionTimer(activeSession);
      session = null;
    }
    retainedStepIndex = activeSession.mode === "arrangement" ? startStep : 0;
    status = "stopped";
    emitState(error);
  }

  function skipMissedPositions(activeSession, now) {
    let guard = 0;
    while (
      !activeSession.finishing &&
      activeSession.nextStepIndex !== null &&
      activeSession.nextStepTime < now &&
      guard < MAX_ARRANGEMENT_STEPS * 2
    ) {
      const project = getProjectState();
      const next = getNextStep(activeSession, activeSession.nextStepIndex, project);
      if (next === null) {
        activeSession.lastScheduledStep = activeSession.nextStepIndex;
        activeSession.nextStepIndex = null;
        markFinishing(activeSession, now, null);
        return;
      }
      activeSession.nextStepIndex = next;
      activeSession.nextStepTime += activeSession.stepDurationSeconds;
      guard += 1;
    }
  }

  function tick(sessionId) {
    const activeSession = session;
    if (!activeSession || activeSession.id !== sessionId) return;
    try {
      const now = getAudioTime();
      pruneFinishedVoices(activeSession, now);
      reviveExtendedArrangement(activeSession);
      if (activeSession.finishing) {
        if (now >= activeSession.finishTime) completeSession(activeSession);
        return;
      }
      skipMissedPositions(activeSession, now);
      const horizon = now + lookAheadSeconds;
      while (
        !activeSession.finishing &&
        activeSession.nextStepIndex !== null &&
        activeSession.nextStepTime <= horizon
      ) {
        schedulePosition(activeSession, activeSession.nextStepIndex, activeSession.nextStepTime);
      }
    } catch (error) {
      failSession(activeSession, error);
    }
  }

  function play(nextMode = mode) {
    if (!MODES.has(nextMode)) throw new RangeError(`Unsupported playback mode: ${nextMode}`);
    if (status === "playing") return false;
    if (nextMode !== mode) {
      mode = nextMode;
      retainedStepIndex = nextMode === "arrangement" ? startStep : 0;
    }
    const project = getProjectState();
    const patternId = getSelectedPatternId();
    const trackId = getSelectedTrackId();
    if (mode === "arrangement" && getArrangementEnd(project) === 0) {
      throw new RangeError("Place at least one pattern in the arrangement before playing it.");
    }
    if (mode === "pattern") {
      getPattern(project, patternId);
      getTrack(project, trackId);
    }
    const provisional = { mode, patternId, trackId };
    const bounds = getBounds(provisional, project);
    if (mode === "arrangement" && !bounds.looping && startStep >= bounds.endStep) {
      throw new RangeError("The arrangement start is beyond the final clip.");
    }
    if (mode === "arrangement" && (retainedStepIndex < bounds.startStep || retainedStepIndex >= bounds.endStep)) {
      retainedStepIndex = bounds.looping ? bounds.startStep : startStep;
    }

    const anchorTime = getAudioTime() + startLeadSeconds;
    const activeSession = {
      finishTime: null,
      finishing: false,
      id: nextSessionId,
      lastScheduledStep: retainedStepIndex - 1,
      mode,
      nextStepIndex: retainedStepIndex,
      nextStepTime: anchorTime,
      patternId,
      positions: [],
      stepDurationSeconds: currentStepDurationSeconds,
      timer: null,
      trackId,
      voices: new Map(),
    };
    nextSessionId += 1;
    session = activeSession;
    status = "playing";
    activeSession.timer = setIntervalFn(() => tick(activeSession.id), schedulerIntervalMs);
    emitState();
    tick(activeSession.id);
    return true;
  }

  function getPlayheadStep(audioTime) {
    const activeSession = session;
    if (status !== "playing" || !activeSession) return retainedStepIndex;
    const now = audioTime ?? getAudioTime();
    let current = activeSession.positions[0]?.stepIndex ?? retainedStepIndex;
    for (const position of activeSession.positions) {
      if (position.startTime > now) break;
      current = position.stepIndex;
    }
    return current;
  }

  function getTimelineSnapshot(audioTime) {
    const activeSession = session;
    if (status !== "playing" || !activeSession) {
      return Object.freeze({
        ...getState(),
        audioTime: null,
        patternId: null,
        stepDurationSeconds: currentStepDurationSeconds,
        stepIndex: retainedStepIndex,
        stepProgress: 0,
        trackId: null,
      });
    }
    const now = audioTime ?? getAudioTime();
    let position = activeSession.positions[0] ?? {
      duration: activeSession.stepDurationSeconds,
      startTime: activeSession.nextStepTime,
      stepIndex: retainedStepIndex,
    };
    for (const candidate of activeSession.positions) {
      if (candidate.startTime > now) break;
      position = candidate;
    }
    return Object.freeze({
      ...getState(),
      audioTime: now,
      patternId: activeSession.patternId,
      stepDurationSeconds: position.duration,
      stepIndex: position.stepIndex,
      stepProgress: Math.max(-1, Math.min(1, (now - position.startTime) / position.duration)),
      trackId: activeSession.trackId,
    });
  }

  function pause() {
    const activeSession = session;
    if (status !== "playing" || !activeSession) return false;
    const now = getAudioTime();
    const futurePosition = activeSession.positions.find((position) => position.startTime > now + 0.001);
    retainedStepIndex = futurePosition?.stepIndex ?? activeSession.nextStepIndex ?? getPlayheadStep(now);
    endSession(activeSession, now);
    status = "paused";
    emitState();
    return true;
  }

  function stop() {
    if (status === "stopped") return false;
    if (session) endSession(session, getAudioTime());
    retainedStepIndex = mode === "arrangement" ? startStep : 0;
    status = "stopped";
    emitState();
    return true;
  }

  function setBpm(nextBpm) {
    const nextStepDurationSeconds = getSixteenthNoteDuration(nextBpm);
    if (nextBpm === currentBpm) return false;
    currentBpm = nextBpm;
    currentStepDurationSeconds = nextStepDurationSeconds;
    if (session) session.stepDurationSeconds = nextStepDurationSeconds;
    emitState();
    return true;
  }

  function setMode(nextMode) {
    if (!MODES.has(nextMode)) throw new RangeError(`Unsupported playback mode: ${nextMode}`);
    if (mode === nextMode) return false;
    if (status !== "stopped") stop();
    mode = nextMode;
    retainedStepIndex = mode === "arrangement" ? startStep : 0;
    emitState();
    return true;
  }

  function setStartStep(nextStartStep) {
    if (!Number.isInteger(nextStartStep) || nextStartStep < 0 || nextStartStep >= MAX_ARRANGEMENT_STEPS) {
      throw new RangeError(`Arrangement start must be between 0 and ${MAX_ARRANGEMENT_STEPS - 1}.`);
    }
    if (startStep === nextStartStep) return false;
    if (status !== "stopped") stop();
    startStep = nextStartStep;
    if (mode === "arrangement") retainedStepIndex = startStep;
    emitState();
    return true;
  }

  function releaseInvalidOwnership() {
    if (!session) return false;
    const project = getProjectState();
    const trackIds = new Set(project.tracks.map((track) => track.id));
    const patternIds = new Set(project.patterns.map((pattern) => pattern.id));
    const clipIds = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
    const now = getAudioTime();
    const before = session.voices.size;
    releaseSessionVoices(session, now, (record) =>
      !trackIds.has(record.trackId) ||
      !patternIds.has(record.patternId) ||
      (record.clipId !== null && !clipIds.has(record.clipId)));
    return session.voices.size !== before;
  }
  function releaseOwnedBy({ clipId, trackId }) {
    if (!session) return false;
    const now = getAudioTime();
    const before = session.voices.size;
    releaseSessionVoices(session, now, (record) =>
      (clipId === undefined || record.clipId === clipId) &&
      (trackId === undefined || record.trackId === trackId));
    return session.voices.size !== before;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    getPlayheadStep,
    getScheduledVoiceCount: () => session?.voices.size ?? 0,
    getState,
    getTimelineSnapshot,
    pause,
    play,
    releaseInvalidOwnership,
    releaseOwnedBy,
    removeEventListener: events.removeEventListener.bind(events),
    setBpm,
    setMode,
    setStartStep,
    stop,
  });
}
