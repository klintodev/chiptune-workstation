import {
  DEFAULT_SNAP_TICKS,
  MAX_BPM,
  MIN_BPM,
  PPQ,
  SNAP_TICKS,
} from "./constants.js";
import {
  assertEnum,
  assertFiniteNumber,
  assertInteger,
  compareIds,
  deepFreeze,
} from "./domain-utils.js";
import { getPatternPlaybackEndTick } from "./pattern-span.js";
import { normalizeV2Project } from "./migration.js";
import { getV2ArrangementEndTick } from "./project-schema.js";

function assertBpm(bpm) {
  assertFiniteNumber(bpm, "Tempo", MIN_BPM, MAX_BPM);
}

export function ticksToSeconds(ticks, bpm) {
  assertFiniteNumber(ticks, "Ticks");
  assertBpm(bpm);
  return ticks * 60 / (bpm * PPQ);
}

export function secondsToTicks(seconds, bpm, { rounding = "none" } = {}) {
  assertFiniteNumber(seconds, "Seconds");
  assertBpm(bpm);
  assertEnum(rounding, ["none", "round", "floor", "ceil"], "Tick rounding mode");
  const ticks = seconds * bpm * PPQ / 60;
  if (rounding === "round") return Math.round(ticks);
  if (rounding === "floor") return Math.floor(ticks);
  if (rounding === "ceil") return Math.ceil(ticks);
  return ticks;
}

export function snapTick(tick, snapTicks = DEFAULT_SNAP_TICKS, mode = "nearest") {
  assertFiniteNumber(tick, "Tick");
  if (!SNAP_TICKS.includes(snapTicks)) throw new RangeError(`Unsupported snap: ${snapTicks} ticks.`);
  assertEnum(mode, ["nearest", "floor", "ceil"], "Snap mode");
  const scaled = tick / snapTicks;
  if (mode === "floor") return Math.floor(scaled) * snapTicks;
  if (mode === "ceil") return Math.ceil(scaled) * snapTicks;
  return Math.round(scaled) * snapTicks;
}

export function tickToBarBeat(tick) {
  assertInteger(tick, "Tick", 0);
  const barLength = PPQ * 4;
  return deepFreeze({
    bar: Math.floor(tick / barLength) + 1,
    beat: Math.floor((tick % barLength) / PPQ) + 1,
    tickInBeat: tick % PPQ,
  });
}

export function isV2TrackAudible(project, trackId) {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new RangeError(`Unknown Track: ${trackId}.`);
  const anySolo = project.tracks.some((candidate) => candidate.mixer.solo);
  return !track.mixer.muted && (!anySolo || track.mixer.solo);
}

export function getAudibleTrackIds(project) {
  const normalized = normalizeV2Project(project);
  return Object.freeze(normalized.tracks
    .filter((track) => isV2TrackAudible(normalized, track.id))
    .map((track) => track.id));
}

function occurrenceIdentity({ mode, trackId, clipId, patternId, noteId, iteration = 0 }) {
  return [mode, trackId, clipId ?? "pattern", patternId, noteId, iteration].join(":");
}

function createOccurrence({
  mode,
  trackId,
  clipId,
  patternId,
  note,
  startTick,
  iteration = 0,
}) {
  const identityFields = { mode, trackId, clipId, patternId, noteId: note.id, iteration };
  return deepFreeze({
    occurrenceId: occurrenceIdentity(identityFields),
    mode,
    trackId,
    clipId,
    patternId,
    noteId: note.id,
    pitch: note.pitch,
    velocity: note.velocity,
    startTick,
    durationTicks: note.durationTicks,
    endTick: startTick + note.durationTicks,
  });
}

function comparePatternOccurrences(left, right) {
  return left.startTick - right.startTick
    || left.pitch - right.pitch
    || compareIds(left.noteId, right.noteId);
}

function resolveRange(options, defaultEnd) {
  const fromTick = options.fromTick ?? 0;
  const toTick = options.toTick ?? defaultEnd;
  assertInteger(fromTick, "Occurrence range fromTick", 0);
  assertInteger(toTick, "Occurrence range toTick", 0);
  if (toTick < fromTick) throw new RangeError("Occurrence range toTick cannot precede fromTick.");
  return { fromTick, toTick };
}

export function createPatternOccurrences(project, patternId, trackId, options = {}) {
  const normalized = normalizeV2Project(project);
  const pattern = normalized.patterns.find((candidate) => candidate.id === patternId);
  if (!pattern) throw new RangeError(`Unknown Pattern: ${patternId}.`);
  if (!normalized.tracks.some((candidate) => candidate.id === trackId)) {
    throw new RangeError(`Unknown Track: ${trackId}.`);
  }
  const looping = options.loop === true;
  const playbackEndTick = getPatternPlaybackEndTick(pattern);
  const defaultEnd = looping && Number.isInteger(options.iterations)
    ? playbackEndTick * options.iterations
    : playbackEndTick;
  if (options.iterations !== undefined) assertInteger(options.iterations, "Pattern iterations", 1);
  const { fromTick, toTick } = resolveRange(options, defaultEnd);
  if (toTick === fromTick) return Object.freeze([]);

  const firstIteration = looping ? Math.floor(fromTick / playbackEndTick) : 0;
  const finalIteration = looping ? Math.floor((toTick - 1) / playbackEndTick) : 0;
  const occurrences = [];
  for (let iteration = firstIteration; iteration <= finalIteration; iteration += 1) {
    const offset = looping ? iteration * playbackEndTick : 0;
    for (const note of pattern.notes) {
      if (note.velocity === 0) continue;
      const startTick = offset + note.startTick;
      if (startTick < fromTick || startTick >= toTick) continue;
      occurrences.push(createOccurrence({
        mode: "pattern",
        trackId,
        clipId: null,
        patternId: pattern.id,
        note,
        startTick,
        iteration,
      }));
    }
  }
  return Object.freeze(occurrences.sort(comparePatternOccurrences));
}

function compareSongOccurrences(left, right, trackOrder) {
  return left.startTick - right.startTick
    || trackOrder.get(left.trackId) - trackOrder.get(right.trackId)
    || left.pitch - right.pitch
    || compareIds(left.noteId, right.noteId)
    || compareIds(left.clipId, right.clipId);
}

export function createSongOccurrences(project, options = {}) {
  const normalized = normalizeV2Project(project);
  const patternsById = new Map(normalized.patterns.map((pattern) => [pattern.id, pattern]));
  const arrangementEndTick = getV2ArrangementEndTick(normalized);
  const { fromTick, toTick } = resolveRange(options, arrangementEndTick);
  if (toTick === fromTick) return Object.freeze([]);
  const trackOrder = new Map(normalized.tracks.map((track, index) => [track.id, index]));
  const occurrences = [];
  for (const track of normalized.tracks) {
    if (options.audibleOnly === true && !isV2TrackAudible(normalized, track.id)) continue;
    for (const clip of track.clips) {
      const pattern = patternsById.get(clip.patternId);
      for (const note of pattern.notes) {
        if (note.velocity === 0) continue;
        const startTick = clip.startTick + note.startTick;
        if (startTick < fromTick || startTick >= toTick) continue;
        occurrences.push(createOccurrence({
          mode: "song",
          trackId: track.id,
          clipId: clip.id,
          patternId: pattern.id,
          note,
          startTick,
        }));
      }
    }
  }
  occurrences.sort((left, right) => compareSongOccurrences(left, right, trackOrder));
  return Object.freeze(occurrences);
}
