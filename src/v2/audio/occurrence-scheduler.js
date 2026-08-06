import {
  MAX_BPM,
  MAX_TRACK_VOICES,
  MIN_BPM,
  getV2ArrangementEndTick,
  isV2TrackAudible,
  normalizeV2Project,
  secondsToTicks,
  ticksToSeconds,
} from "../domain/index.js";
import {
  PLAYBACK_MODES,
  adaptOccurrenceToRenderEvent,
  createPlaybackOccurrences,
} from "./render-plan.js";

export const DEFAULT_V2_LOOK_AHEAD_SECONDS = 0.1;
export const DEFAULT_V2_SCHEDULER_INTERVAL_MS = 25;
export const DEFAULT_V2_START_LEAD_SECONDS = 0.025;

function assertMode(mode) {
  if (!PLAYBACK_MODES.includes(mode)) throw new RangeError(`Unsupported playback mode: ${mode}.`);
}

function assertBpm(bpm) {
  if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    throw new RangeError(`Tempo must be between ${MIN_BPM} and ${MAX_BPM}.`);
  }
}

function loopSignature(bounds) {
  return `${bounds.looping}:${bounds.startTick}:${bounds.endTick}`;
}

function getPlaybackBounds(project, mode, patternId) {
  if (mode === "pattern") {
    const pattern = project.patterns.find((candidate) => candidate.id === patternId);
    if (!pattern) throw new RangeError(`Unknown Pattern: ${patternId}.`);
    return Object.freeze({ endTick: pattern.lengthTicks, looping: true, startTick: 0 });
  }
  const arrangementEnd = getV2ArrangementEndTick(project);
  if (arrangementEnd === 0) {
    return Object.freeze({ endTick: 0, looping: false, startTick: 0 });
  }
  if (project.transport.loop.enabled) {
    return Object.freeze({
      endTick: project.transport.loop.endTick,
      looping: true,
      startTick: project.transport.loop.startTick,
    });
  }
  return Object.freeze({ endTick: arrangementEnd, looping: false, startTick: 0 });
}

function mapTransportTick(transportTick, bounds) {
  if (!bounds.looping) return transportTick;
  const length = bounds.endTick - bounds.startTick;
  return bounds.startTick + (((transportTick - bounds.startTick) % length) + length) % length;
}

function defaultSetInterval(callback, milliseconds) {
  return globalThis.setInterval(callback, milliseconds);
}

function defaultClearInterval(timer) {
  globalThis.clearInterval(timer);
}

export function createOccurrenceScheduler({
  bpm,
  clearIntervalFn = defaultClearInterval,
  getAudioTime,
  getPatternId = () => null,
  getProject,
  getSynthRuntime,
  getTrackId = () => null,
  lookAheadSeconds = DEFAULT_V2_LOOK_AHEAD_SECONDS,
  maxVoicesPerTrack = MAX_TRACK_VOICES,
  onTrackInput = () => {},
  schedulerIntervalMs = DEFAULT_V2_SCHEDULER_INTERVAL_MS,
  setIntervalFn = defaultSetInterval,
  startLeadSeconds = DEFAULT_V2_START_LEAD_SECONDS,
} = {}) {
  if (typeof getAudioTime !== "function" || typeof getProject !== "function") {
    throw new TypeError("Scheduler audio-time and Project providers are required.");
  }
  if (typeof getSynthRuntime !== "function") {
    throw new TypeError("A per-Track synth runtime provider is required.");
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
  if (!Number.isInteger(maxVoicesPerTrack) || maxVoicesPerTrack < 1 || maxVoicesPerTrack > 16) {
    throw new RangeError("Per-Track voice limit must be between 1 and 16.");
  }
  const events = new EventTarget();
  let currentBpm = bpm ?? normalizeV2Project(getProject()).transport.bpm;
  assertBpm(currentBpm);
  let disposed = false;
  let mode = "pattern";
  let nextSessionId = 1;
  let retainedTick = 0;
  let session = null;
  let status = "stopped";

  function getState() {
    return Object.freeze({
      bpm: currentBpm,
      mode,
      patternId: session?.patternId ?? null,
      retainedTick,
      sessionId: session?.id ?? null,
      status,
      trackId: session?.trackId ?? null,
    });
  }

  function emit(error) {
    events.dispatchEvent(new CustomEvent("statechange", {
      detail: Object.freeze({ ...getState(), error }),
    }));
  }

  function clearTimer(activeSession) {
    if (activeSession.timer === null) return;
    clearIntervalFn(activeSession.timer);
    activeSession.timer = null;
  }

  function allVoiceRecords(activeSession) {
    return [...activeSession.voicesByTrack.values()].flatMap((records) => [...records.values()]);
  }

  function releaseRecord(record, time, immediate = false) {
    if (immediate || record.startTime > time + 0.001) record.voice.retire?.(time) ?? record.voice.stop(time);
    else record.voice.stop(time);
  }

  function releaseVoices(activeSession, time, predicate = () => true, immediate = false) {
    let released = false;
    for (const records of activeSession.voicesByTrack.values()) {
      for (const [occurrenceId, record] of records) {
        if (!predicate(record)) continue;
        releaseRecord(record, time, immediate);
        records.delete(occurrenceId);
        released = true;
      }
    }
    return released;
  }

  function endSession(activeSession, time, { release = true } = {}) {
    if (session !== activeSession) return false;
    clearTimer(activeSession);
    if (release) releaseVoices(activeSession, time);
    activeSession.voicesByTrack.clear();
    session = null;
    return true;
  }

  function getUnwrappedTick(activeSession, audioTime) {
    const elapsed = Math.max(0, audioTime - activeSession.anchorAudioTime);
    return activeSession.anchorTransportTick + secondsToTicks(elapsed, activeSession.bpm);
  }

  function getSourceTick(activeSession, audioTime) {
    return mapTransportTick(getUnwrappedTick(activeSession, audioTime), activeSession.bounds);
  }

  function pruneEndedVoices(activeSession, audioTime) {
    for (const records of activeSession.voicesByTrack.values()) {
      for (const [occurrenceId, record] of records) {
        if (record.releaseEndTime <= audioTime || record.voice.ended === true) {
          records.delete(occurrenceId);
        }
      }
    }
  }

  function scheduleOccurrence(activeSession, occurrence) {
    if (activeSession.projectionGeneration > 0) {
      occurrence = Object.freeze({
        ...occurrence,
        occurrenceId: `generation:${activeSession.projectionGeneration}:${occurrence.occurrenceId}`,
      });
    }
    if ([...activeSession.voicesByTrack.values()].some((records) => (
      records.has(occurrence.occurrenceId)
    ))) return false;
    const event = adaptOccurrenceToRenderEvent(activeSession.project, occurrence, activeSession.bpm);
    const startTime = activeSession.anchorAudioTime
      + ticksToSeconds(occurrence.transportTick - activeSession.anchorTransportTick, activeSession.bpm);
    const releaseEndTime = startTime
      + event.durationSeconds
      + event.releaseSeconds
      + 0.01;
    let trackVoices = activeSession.voicesByTrack.get(event.trackId);
    if (!trackVoices) {
      trackVoices = new Map();
      activeSession.voicesByTrack.set(event.trackId, trackVoices);
    }
    while (trackVoices.size >= maxVoicesPerTrack) {
      const [oldestId, oldest] = trackVoices.entries().next().value;
      oldest.voice.retire?.(startTime) ?? oldest.voice.stop(startTime);
      trackVoices.delete(oldestId);
    }
    const scheduledEvent = Object.freeze({
      ...event,
      releaseEndTime,
      startTime,
    });
    const voice = getSynthRuntime(event.trackId).trigger(scheduledEvent);
    const record = {
      event: scheduledEvent,
      releaseEndTime,
      startTime,
      voice,
    };
    trackVoices.set(scheduledEvent.occurrenceId, record);
    voice.addEndedListener?.(() => trackVoices.delete(scheduledEvent.occurrenceId));
    onTrackInput(scheduledEvent.trackId, scheduledEvent);
    return true;
  }

  function finishNaturally(activeSession, time) {
    if (session !== activeSession) return;
    retainedTick = activeSession.startTick;
    endSession(activeSession, time, { release: false });
    status = "stopped";
    emit();
  }

  function scheduleWindow(activeSession, now) {
    const currentTransportTick = getUnwrappedTick(activeSession, now);
    const earliestSchedulableTick = Math.ceil(currentTransportTick - 1e-9);
    if (activeSession.nextScanTick < earliestSchedulableTick) {
      activeSession.nextScanTick = earliestSchedulableTick;
    }
    const horizonAudioTime = now + lookAheadSeconds;
    const horizonTransportTick = activeSession.anchorTransportTick
      + secondsToTicks(
        Math.max(0, horizonAudioTime - activeSession.anchorAudioTime),
        activeSession.bpm,
      );
    let toTransportTick = Math.floor(horizonTransportTick + 1e-9) + 1;
    if (!activeSession.bounds.looping) {
      toTransportTick = Math.min(toTransportTick, activeSession.bounds.endTick);
    }
    if (toTransportTick <= activeSession.nextScanTick) return;
    const occurrences = createPlaybackOccurrences(activeSession.project, {
      fromTransportTick: activeSession.nextScanTick,
      mode: activeSession.mode,
      patternId: activeSession.patternId,
      toTransportTick,
      trackId: activeSession.trackId,
    });
    for (const occurrence of occurrences) scheduleOccurrence(activeSession, occurrence);
    activeSession.nextScanTick = toTransportTick;
  }

  function tick(sessionId = session?.id) {
    const activeSession = session;
    if (!activeSession || activeSession.id !== sessionId) return false;
    try {
      const now = getAudioTime();
      pruneEndedVoices(activeSession, now);
      if (!activeSession.bounds.looping) {
        const finishTime = activeSession.anchorAudioTime
          + ticksToSeconds(
            activeSession.bounds.endTick - activeSession.anchorTransportTick,
            activeSession.bpm,
          );
        if (now >= finishTime) {
          finishNaturally(activeSession, now);
          return true;
        }
      }
      scheduleWindow(activeSession, now);
      return true;
    } catch (error) {
      try { endSession(activeSession, getAudioTime()); } catch { clearTimer(activeSession); }
      status = "stopped";
      retainedTick = activeSession.startTick;
      emit(error);
      return false;
    }
  }

  function resolvePlayOptions(options) {
    if (typeof options === "string") return { mode: options };
    return options ?? {};
  }

  function play(options) {
    if (disposed) throw new Error("The occurrence scheduler has been disposed.");
    if (status === "playing") return false;
    const requested = resolvePlayOptions(options);
    const nextMode = requested.mode ?? mode;
    assertMode(nextMode);
    const projectSource = getProject();
    const project = normalizeV2Project(projectSource);
    const patternId = nextMode === "pattern" ? (requested.patternId ?? getPatternId()) : null;
    const trackId = nextMode === "pattern" ? (requested.trackId ?? getTrackId()) : null;
    if (nextMode === "pattern" && !project.tracks.some((track) => track.id === trackId)) {
      throw new RangeError(`Unknown Track: ${trackId}.`);
    }
    const bounds = getPlaybackBounds(project, nextMode, patternId);
    if (nextMode === "song" && bounds.endTick <= bounds.startTick) {
      throw new RangeError("Place an audible Pattern in Playlist before playing Song mode.");
    }
    let startTick = requested.startTick ?? (nextMode === mode ? retainedTick : bounds.startTick);
    if (!Number.isInteger(startTick)) throw new RangeError("Playback start tick must be an integer.");
    if (bounds.looping && (startTick < bounds.startTick || startTick >= bounds.endTick)) {
      startTick = bounds.startTick;
    }
    if (!bounds.looping && (startTick < 0 || startTick >= bounds.endTick)) {
      throw new RangeError("Playback start is beyond the available content.");
    }
    mode = nextMode;
    currentBpm = requested.bpm ?? project.transport.bpm;
    assertBpm(currentBpm);
    retainedTick = startTick;
    const anchorAudioTime = getAudioTime() + startLeadSeconds;
    const activeSession = {
      anchorAudioTime,
      anchorTransportTick: startTick,
      bounds,
      bpm: currentBpm,
      id: nextSessionId,
      mode,
      nextScanTick: startTick,
      patternId,
      project,
      projectSource,
      projectionGeneration: 0,
      startTick,
      timer: null,
      trackId,
      voicesByTrack: new Map(),
    };
    nextSessionId += 1;
    session = activeSession;
    status = "playing";
    activeSession.timer = setIntervalFn(() => tick(activeSession.id), schedulerIntervalMs);
    emit();
    tick(activeSession.id);
    return true;
  }

  function cancelFutureAndReanchor(activeSession, now, sourceTick, bounds = activeSession.bounds) {
    releaseVoices(activeSession, now, (record) => record.startTime > now + 0.001, true);
    const repairedSourceTick = bounds.looping
      && (sourceTick < bounds.startTick || sourceTick >= bounds.endTick)
      ? bounds.startTick
      : sourceTick;
    activeSession.anchorAudioTime = now;
    activeSession.anchorTransportTick = repairedSourceTick;
    activeSession.bounds = bounds;
    activeSession.nextScanTick = Math.floor(repairedSourceTick + 1e-9) + 1;
    activeSession.projectionGeneration += 1;
  }

  function setBpm(nextBpm) {
    assertBpm(nextBpm);
    if (nextBpm === currentBpm) return false;
    if (session) {
      const now = getAudioTime();
      const sourceTick = getSourceTick(session, now);
      cancelFutureAndReanchor(session, now, sourceTick);
      session.bpm = nextBpm;
    }
    currentBpm = nextBpm;
    emit();
    if (session) tick(session.id);
    return true;
  }

  function seek(nextTick) {
    if (!Number.isInteger(nextTick) || nextTick < 0) {
      throw new RangeError("Seek tick must be a non-negative integer.");
    }
    const project = session?.project ?? normalizeV2Project(getProject());
    const patternId = session?.patternId ?? (mode === "pattern" ? getPatternId() : null);
    const bounds = getPlaybackBounds(project, mode, patternId);
    if (nextTick >= bounds.endTick || (bounds.looping && nextTick < bounds.startTick)) {
      throw new RangeError("Seek tick is outside the playback range.");
    }
    retainedTick = nextTick;
    if (!session) {
      emit();
      return true;
    }
    const now = getAudioTime();
    releaseVoices(session, now, () => true, true);
    session.anchorAudioTime = now + startLeadSeconds;
    session.anchorTransportTick = nextTick;
    session.nextScanTick = nextTick;
    session.projectionGeneration += 1;
    session.startTick = nextTick;
    tick(session.id);
    emit();
    return true;
  }

  function pause() {
    if (!session || status !== "playing") return false;
    const activeSession = session;
    const now = getAudioTime();
    retainedTick = Math.floor(getSourceTick(activeSession, now));
    endSession(activeSession, now);
    status = "paused";
    emit();
    return true;
  }

  function stop() {
    if (status === "stopped") return false;
    const activeSession = session;
    if (activeSession) {
      endSession(activeSession, getAudioTime());
      retainedTick = activeSession.startTick;
    } else retainedTick = 0;
    status = "stopped";
    emit();
    return true;
  }

  function setMode(nextMode) {
    assertMode(nextMode);
    if (mode === nextMode) return false;
    if (status !== "stopped") stop();
    mode = nextMode;
    retainedTick = 0;
    emit();
    return true;
  }

  function isRecordStillOwned(record, project) {
    const { event } = record;
    const track = project.tracks.find((candidate) => candidate.id === event.trackId);
    const pattern = project.patterns.find((candidate) => candidate.id === event.patternId);
    if (!track || !pattern) return false;
    if (event.mode === "song" && !isV2TrackAudible(project, track.id)) return false;
    const note = pattern.notes.find((candidate) => candidate.id === event.noteId);
    if (!note || note.velocity === 0) return false;
    let expectedStart = note.startTick;
    if (event.clipId !== null) {
      const clip = track.clips.find((candidate) => candidate.id === event.clipId);
      if (!clip || clip.patternId !== pattern.id) return false;
      expectedStart += clip.startTick;
    }
    return note.pitch === event.pitch
      && note.velocity === event.velocity
      && note.durationTicks === event.durationTicks
      && expectedStart === event.startTick;
  }

  function rescanSubmittedWindow(activeSession, now, scannedThroughTick) {
    const fromTransportTick = Math.ceil(getUnwrappedTick(activeSession, now) - 1e-9);
    if (scannedThroughTick <= fromTransportTick) return false;
    const occurrences = createPlaybackOccurrences(activeSession.project, {
      fromTransportTick,
      mode: activeSession.mode,
      patternId: activeSession.patternId,
      toTransportTick: scannedThroughTick,
      trackId: activeSession.trackId,
    });
    let scheduled = false;
    for (const occurrence of occurrences) {
      scheduled = scheduleOccurrence(activeSession, occurrence) || scheduled;
    }
    return scheduled;
  }

  function syncProject(projectCandidate = getProject()) {
    const project = normalizeV2Project(projectCandidate);
    if (!session) return false;
    const activeSession = session;
    const now = getAudioTime();
    const currentSourceTick = getSourceTick(activeSession, now);
    if (activeSession.mode === "pattern" && (
      !project.patterns.some(({ id }) => id === activeSession.patternId)
      || !project.tracks.some(({ id }) => id === activeSession.trackId)
    )) {
      stop();
      return true;
    }
    const nextBounds = getPlaybackBounds(project, activeSession.mode, activeSession.patternId);
    const boundsChanged = loopSignature(nextBounds) !== loopSignature(activeSession.bounds);
    const scannedThroughTick = activeSession.nextScanTick;
    releaseVoices(activeSession, now, (record) => !isRecordStillOwned(record, project));
    activeSession.project = project;
    activeSession.projectSource = projectCandidate;
    if (boundsChanged) {
      cancelFutureAndReanchor(activeSession, now, currentSourceTick, nextBounds);
    } else {
      rescanSubmittedWindow(activeSession, now, scannedThroughTick);
    }
    tick(activeSession.id);
    return true;
  }

  function releaseOwnedBy(criteria = {}) {
    if (!session) return false;
    const keys = ["clipId", "mode", "noteId", "occurrenceId", "patternId", "trackId"];
    const now = getAudioTime();
    return releaseVoices(session, now, (record) => keys.every((key) => (
      criteria[key] === undefined || record.event.ownership[key] === criteria[key]
    )));
  }

  function getPlayheadTick(audioTime = getAudioTime()) {
    if (!session) return retainedTick;
    return getSourceTick(session, audioTime);
  }

  function getTimelineSnapshot(audioTime = getAudioTime()) {
    const playheadTick = getPlayheadTick(audioTime);
    return Object.freeze({
      ...getState(),
      audioTime: session ? audioTime : null,
      playheadTick,
      tickProgress: playheadTick - Math.floor(playheadTick),
    });
  }

  function dispose() {
    if (disposed) return false;
    if (session) endSession(session, getAudioTime());
    disposed = true;
    status = "stopped";
    retainedTick = 0;
    return true;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    dispose,
    getPlayheadTick,
    getScheduledVoiceCount: () => session ? allVoiceRecords(session).length : 0,
    getState,
    getTimelineSnapshot,
    pause,
    play,
    releaseOwnedBy,
    removeEventListener: events.removeEventListener.bind(events),
    seek,
    setBpm,
    setMode,
    stop,
    syncProject,
    tick,
  });
}

export const createV2Scheduler = createOccurrenceScheduler;
export const createV2OccurrenceScheduler = createOccurrenceScheduler;
