import {
  DEFAULT_PATTERN_EDITOR_END_TICKS,
  MAX_PATTERN_CONTENT_TICKS,
  PPQ,
} from "./constants.js";

export const EMPTY_PATTERN_LENGTH_TICKS = 1;

/**
 * The content end is independent of the musical length, including silence.
 * A one-tick minimum also preserves the exact spans of schema-7 projects.
 */
export function derivePatternLengthTicks(patternOrNotes) {
  const notes = Array.isArray(patternOrNotes)
    ? patternOrNotes
    : Array.isArray(patternOrNotes?.notes)
      ? patternOrNotes.notes
      : [];
  return notes.reduce((endTick, note) => {
    const noteEnd = Number(note?.startTick) + Number(note?.durationTicks);
    return Number.isFinite(noteEnd) ? Math.max(endTick, noteEnd) : endTick;
  }, EMPTY_PATTERN_LENGTH_TICKS);
}

/**
 * Round new content up to a complete 4/4 bar when growing a Pattern.
 */
export function getContainingBarEndTick(patternOrNotes) {
  const barTicks = PPQ * 4;
  const contentEndTick = derivePatternLengthTicks(patternOrNotes);
  const playbackEndTick = Math.ceil(contentEndTick / barTicks) * barTicks;
  return Math.min(MAX_PATTERN_CONTENT_TICKS, Math.max(barTicks, playbackEndTick));
}

/** Playback, Playlist repetitions and export use the same persisted length. */
export function getPatternPlaybackEndTick(patternOrNotes) {
  return patternOrNotes?.lengthTicks ?? getContainingBarEndTick(patternOrNotes);
}

/**
 * The editor always leaves writable grid after the musical content. This is a
 * viewport concern only; it never becomes part of the Pattern's duration.
 */
export function getPatternEditorEndTick(patternOrNotes) {
  const contentEndTick = derivePatternLengthTicks(patternOrNotes);
  const paddedEndTick = Math.ceil((contentEndTick + PPQ) / PPQ) * PPQ;
  const playbackEndTick = getPatternPlaybackEndTick(patternOrNotes);
  return Math.min(
    MAX_PATTERN_CONTENT_TICKS,
    Math.max(DEFAULT_PATTERN_EDITOR_END_TICKS, paddedEndTick, playbackEndTick),
  );
}
