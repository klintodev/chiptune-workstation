export const PROJECT_SCHEMA_VERSION = 7;
export const PROJECT_DOCUMENT_FORMAT = "chiptune-workstation";
export const PROJECT_DOCUMENT_VERSION = 1;
export const MAX_PROJECT_FILE_BYTES = 2_000_000;
export const MAX_PROJECT_STRUCTURE_DEPTH = 32;
export const MAX_PROJECT_STRUCTURE_NODES = 100_000;

export const PPQ = 96;
export const TICKS_PER_QUARTER = PPQ;
export const TICKS_PER_EIGHTH = 48;
export const TICKS_PER_SIXTEENTH = 24;
export const TICKS_PER_THIRTY_SECOND = 12;
export const LEGACY_STEP_TICKS = TICKS_PER_SIXTEENTH;
export const SNAP_TICKS = Object.freeze([TICKS_PER_EIGHTH, TICKS_PER_SIXTEENTH, TICKS_PER_THIRTY_SECOND]);
export const DEFAULT_SNAP_TICKS = TICKS_PER_SIXTEENTH;

export const DEFAULT_PATTERN_ID = "pattern-1";
export const DEFAULT_TRACK_ID = "track-1";
export const DEFAULT_PATTERN_LENGTH_TICKS = 384;
export const MIN_PATTERN_LENGTH_TICKS = 96;
export const MAX_PATTERN_LENGTH_TICKS = 3_072;
export const PATTERN_LENGTH_INCREMENT_TICKS = 96;
export const MAX_ARRANGEMENT_TICKS = 6_144;

export const MIN_PATTERN_NOTE = 36;
export const MAX_PATTERN_NOTE = 112;
export const MAX_NOTES_PER_PATTERN = 1_024;
export const MAX_NOTES_PER_PROJECT = 8_192;
export const MAX_CLIPS_PER_TRACK = 64;
export const MAX_PROJECT_PATTERNS = 64;
export const MAX_PROJECT_TRACKS = 8;
export const MAX_EFFECTS_PER_CHAIN = 4;
export const MAX_PROJECT_HISTORY = 100;
export const MAX_TRACK_VOICES = 16;

export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const MAX_PROJECT_TITLE_LENGTH = 100;
export const MAX_PATTERN_NAME_LENGTH = 32;
export const MAX_TRACK_NAME_LENGTH = 32;

export const DOMAIN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const LOOP_MODES = Object.freeze(["custom", "arrangement"]);
export const MIGRATION_ID_NAMESPACE = "klinto-studio-project-v7";
export const MIGRATION_ID_ALGORITHM = "fnv1a32-base36-v1";

export const V2_LIMITS = Object.freeze({
  bpm: Object.freeze([MIN_BPM, MAX_BPM]),
  clipsPerTrack: MAX_CLIPS_PER_TRACK,
  effectsPerChain: MAX_EFFECTS_PER_CHAIN,
  notesPerPattern: MAX_NOTES_PER_PATTERN,
  notesPerProject: MAX_NOTES_PER_PROJECT,
  patternLengthTicks: Object.freeze([MIN_PATTERN_LENGTH_TICKS, MAX_PATTERN_LENGTH_TICKS]),
  patterns: MAX_PROJECT_PATTERNS,
  pitch: Object.freeze([MIN_PATTERN_NOTE, MAX_PATTERN_NOTE]),
  songTicks: MAX_ARRANGEMENT_TICKS,
  structureDepth: MAX_PROJECT_STRUCTURE_DEPTH,
  structureNodes: MAX_PROJECT_STRUCTURE_NODES,
  tracks: MAX_PROJECT_TRACKS,
});
