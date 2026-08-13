import {
  DEFAULT_PATTERN_EDITOR_END_TICKS,
  MAX_PATTERN_CONTENT_TICKS,
  PPQ,
} from "./constants.js";

export const EMPTY_PATTERN_LENGTH_TICKS = 1;

/**
 * Pattern span is content-derived. The one-tick empty span keeps transport
 * arithmetic well-defined without exposing a user-controlled Pattern size.
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
 * Pattern playback completes the 4/4 bar containing the final note. This is a
 * transport boundary only: persisted Pattern length and Playlist clip width
 * remain content-derived.
 */
export function getPatternPlaybackEndTick(patternOrNotes) {
  const barTicks = PPQ * 4;
  const contentEndTick = derivePatternLengthTicks(patternOrNotes);
  const playbackEndTick = Math.ceil(contentEndTick / barTicks) * barTicks;
  return Math.min(MAX_PATTERN_CONTENT_TICKS, Math.max(barTicks, playbackEndTick));
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
