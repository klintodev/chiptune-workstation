import {
  MAX_TRACK_VOICES,
  createPatternOccurrences,
  createSongOccurrences,
  getV2ArrangementEndTick,
  normalizeV2Project,
  ticksToSeconds,
} from "../domain/index.js";
import { calculateProjectExportTailSeconds, calculateSerialRouteTailSeconds } from "./effect-tail.js";
import { describeProjectAudioRoute } from "./route-descriptor.js";
import { toWebAudioWaveform } from "./web-audio-runtime.js";

export const VOICE_DISCONNECT_GRACE_SECONDS = 0.01;
export const PLAYBACK_MODES = Object.freeze(["pattern", "song"]);

function assertMode(mode) {
  if (!PLAYBACK_MODES.includes(mode)) throw new RangeError(`Unsupported playback mode: ${mode}.`);
}

function assertTick(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer.`);
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function midiPitchToFrequency(midiPitch) {
  if (!Number.isFinite(midiPitch) || midiPitch < 12 || midiPitch > 136) {
    throw new RangeError("Effective MIDI pitch must be between 12 and 136.");
  }
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

export function getEffectiveInstrumentPitch(pitch, octave) {
  if (!Number.isInteger(pitch) || !Number.isInteger(octave)) {
    throw new TypeError("Pitch and Instrument octave must be integers.");
  }
  const effectivePitch = pitch + octave * 12;
  if (effectivePitch < 12 || effectivePitch > 136) {
    throw new RangeError("Instrument octave produced an unsupported effective MIDI pitch.");
  }
  return effectivePitch;
}

function getTrack(project, trackId) {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new RangeError(`Unknown Track: ${trackId}.`);
  return track;
}

export function adaptOccurrenceToRenderEvent(project, occurrence, bpm = project.transport.bpm) {
  const track = getTrack(project, occurrence.trackId);
  const params = track.instrument.params;
  const effectivePitch = getEffectiveInstrumentPitch(occurrence.pitch, params.octave);
  const playbackDurationTicks = occurrence.playbackDurationTicks ?? occurrence.durationTicks;
  const transportTick = occurrence.transportTick ?? occurrence.startTick;
  const startSeconds = ticksToSeconds(transportTick, bpm);
  const durationSeconds = ticksToSeconds(playbackDurationTicks, bpm);
  const releaseEndSeconds = startSeconds
    + durationSeconds
    + params.releaseSeconds
    + VOICE_DISCONNECT_GRACE_SECONDS;
  return Object.freeze({
    ...occurrence,
    attackSeconds: params.attackSeconds,
    durationSeconds,
    effectivePitch,
    frequencyHz: midiPitchToFrequency(effectivePitch),
    instrumentInstanceId: track.instrument.instanceId,
    instrumentLevel: params.level,
    ownership: Object.freeze({
      clipId: occurrence.clipId,
      mode: occurrence.mode,
      noteId: occurrence.noteId,
      occurrenceId: occurrence.occurrenceId,
      patternId: occurrence.patternId,
      projectId: project.id ?? null,
      trackId: occurrence.trackId,
    }),
    playbackDurationTicks,
    releaseEndSeconds,
    releaseSeconds: params.releaseSeconds,
    startSeconds,
    transportTick,
    waveform: params.waveform,
    webAudioWaveform: toWebAudioWaveform(params.waveform),
  });
}

/**
 * Apply the launch arbitration policy without constructing nodes. Releases are
 * considered active through their 10 ms disconnect grace, and simultaneous
 * occurrences retain projection order.
 */
export function applyTrackVoiceLimit(events, maxVoices = MAX_TRACK_VOICES) {
  if (!Array.isArray(events)) throw new TypeError("Render events must be an array.");
  if (!Number.isInteger(maxVoices) || maxVoices < 1) {
    throw new RangeError("Voice limit must be a positive integer.");
  }
  const activeByTrack = new Map();
  return Object.freeze(events.map((event) => {
    let active = activeByTrack.get(event.trackId) ?? [];
    active = active.filter((candidate) => candidate.releaseEndSeconds > event.startSeconds);
    const retireOccurrenceIds = [];
    while (active.length >= maxVoices) {
      retireOccurrenceIds.push(active.shift().occurrenceId);
    }
    active.push(event);
    activeByTrack.set(event.trackId, active);
    return Object.freeze({ ...event, retireOccurrenceIds: Object.freeze(retireOccurrenceIds) });
  }));
}

function createOneShotOccurrences(project, { fromTick, mode, patternId, toTick, trackId }) {
  if (mode === "pattern") {
    return createPatternOccurrences(project, patternId, trackId, { fromTick, toTick });
  }
  return createSongOccurrences(project, { audibleOnly: true, fromTick, toTick });
}

/** Pure live/offline/public plan. It deliberately renders Song once, ignoring transport looping. */
export function createRenderPlan(projectCandidate, {
  fromTick = 0,
  mode = "song",
  patternId,
  toTick,
  trackId,
} = {}) {
  assertMode(mode);
  assertTick(fromTick, "Render fromTick");
  const project = normalizeV2Project(projectCandidate);
  const bpm = project.transport.bpm;
  let contentEndTick;
  let selectedTrack = null;
  if (mode === "pattern") {
    const pattern = project.patterns.find((candidate) => candidate.id === patternId);
    if (!pattern) throw new RangeError(`Unknown Pattern: ${patternId}.`);
    selectedTrack = getTrack(project, trackId);
    contentEndTick = pattern.lengthTicks;
  } else {
    contentEndTick = getV2ArrangementEndTick(project);
  }
  const resolvedToTick = toTick ?? contentEndTick;
  assertTick(resolvedToTick, "Render toTick");
  if (resolvedToTick < fromTick || resolvedToTick > contentEndTick) {
    throw new RangeError("Render range is outside the playback content.");
  }
  const occurrences = createOneShotOccurrences(project, {
    fromTick,
    mode,
    patternId,
    toTick: resolvedToTick,
    trackId,
  });
  const events = applyTrackVoiceLimit(occurrences.map((occurrence) => (
    adaptOccurrenceToRenderEvent(project, occurrence, bpm)
  )));
  const tailSeconds = mode === "song"
    ? calculateProjectExportTailSeconds(project)
    : calculateSerialRouteTailSeconds({
        bpm,
        instrumentReleaseSeconds: selectedTrack.instrument.params.releaseSeconds,
        masterEffects: project.mixer.master.effects,
        trackEffects: selectedTrack.mixer.effects,
      });
  const contentDurationSeconds = ticksToSeconds(resolvedToTick, bpm);
  return Object.freeze({
    bpm,
    contentDurationSeconds,
    events,
    fromTick,
    mode,
    patternId: mode === "pattern" ? patternId : null,
    route: describeProjectAudioRoute(project),
    tailSeconds,
    toTick: resolvedToTick,
    totalDurationSeconds: contentDurationSeconds + tailSeconds,
    trackId: mode === "pattern" ? trackId : null,
  });
}

/**
 * Project a monotonic transport range through Pattern or Song loop bounds.
 * `transportTick` never wraps; `startTick` remains the source Project tick.
 */
export function createPlaybackOccurrences(projectCandidate, {
  fromTransportTick,
  mode,
  patternId,
  toTransportTick,
  trackId,
}) {
  assertMode(mode);
  assertTick(fromTransportTick, "Playback fromTransportTick");
  assertTick(toTransportTick, "Playback toTransportTick");
  if (toTransportTick < fromTransportTick) {
    throw new RangeError("Playback range cannot run backwards.");
  }
  if (toTransportTick === fromTransportTick) return Object.freeze([]);
  const project = normalizeV2Project(projectCandidate);
  let loopStart;
  let loopEnd;
  let looping;
  if (mode === "pattern") {
    const pattern = project.patterns.find((candidate) => candidate.id === patternId);
    if (!pattern) throw new RangeError(`Unknown Pattern: ${patternId}.`);
    getTrack(project, trackId);
    loopStart = 0;
    loopEnd = pattern.lengthTicks;
    looping = true;
  } else {
    const arrangementEnd = getV2ArrangementEndTick(project);
    looping = project.transport.loop.enabled;
    loopStart = looping ? project.transport.loop.startTick : 0;
    loopEnd = looping ? project.transport.loop.endTick : arrangementEnd;
  }
  if (loopEnd <= loopStart) return Object.freeze([]);
  if (looping && fromTransportTick < loopStart) {
    throw new RangeError("Looped playback must begin within its loop range.");
  }

  const occurrences = [];
  let cursor = fromTransportTick;
  while (cursor < toTransportTick) {
    if (!looping && cursor >= loopEnd) break;
    const loopLength = loopEnd - loopStart;
    const cycle = looping ? Math.floor((cursor - loopStart) / loopLength) : 0;
    const sourceFrom = looping
      ? loopStart + modulo(cursor - loopStart, loopLength)
      : cursor;
    const availableTicks = loopEnd - sourceFrom;
    const segmentLength = Math.min(toTransportTick - cursor, availableTicks);
    const sourceTo = sourceFrom + segmentLength;
    const segmentOccurrences = mode === "pattern"
      ? createPatternOccurrences(project, patternId, trackId, {
          fromTick: sourceFrom,
          toTick: sourceTo,
        })
      : createSongOccurrences(project, {
          audibleOnly: true,
          fromTick: sourceFrom,
          toTick: sourceTo,
        });
    for (const occurrence of segmentOccurrences) {
      const transportTick = cursor + occurrence.startTick - sourceFrom;
      const playbackDurationTicks = Math.min(
        occurrence.durationTicks,
        loopEnd - occurrence.startTick,
      );
      occurrences.push(Object.freeze({
        ...occurrence,
        occurrenceId: `${occurrence.occurrenceId}:cycle:${cycle}`,
        playbackDurationTicks,
        transportTick,
      }));
    }
    cursor += segmentLength;
    if (segmentLength === 0) break;
  }
  return Object.freeze(occurrences);
}

export const renderPlanAdapters = Object.freeze({
  live: createRenderPlan,
  offline: createRenderPlan,
  public: createRenderPlan,
});
export const RENDER_PLAN_ADAPTERS = renderPlanAdapters;
export const createSharedRenderPlan = createRenderPlan;
