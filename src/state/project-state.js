import { instrumentDefaults } from "./instrument-state.js";
import {
  DEFAULT_PATTERN_LENGTH,
  MAX_PATTERN_NOTE,
  MIN_PATTERN_NOTE,
  SUPPORTED_PATTERN_GATES,
  SUPPORTED_PATTERN_LENGTHS,
} from "./pattern-state.js";

export const PROJECT_SCHEMA_VERSION = 1;
export const DEFAULT_TRACK_ID = "track-1";
export const MAX_PROJECT_HISTORY = 100;

const VOICE_TYPES = new Set(["square", "triangle", "sawtooth", "noise"]);

function cloneStep(step) {
  return step === null ? null : { ...step };
}

function freezeProject(project) {
  Object.freeze(project.metadata);
  Object.freeze(project.transport);
  for (const track of project.tracks) {
    Object.freeze(track.instrument);
    Object.freeze(track.mixer);
    for (const step of track.pattern.steps) {
      if (step !== null) Object.freeze(step);
    }
    Object.freeze(track.pattern.steps);
    Object.freeze(track.pattern);
    Object.freeze(track);
  }
  Object.freeze(project.tracks);
  return Object.freeze(project);
}

function cloneTrack(track) {
  return {
    ...track,
    instrument: { ...track.instrument },
    mixer: { ...track.mixer },
    pattern: { ...track.pattern, steps: track.pattern.steps.map(cloneStep) },
  };
}

function validateInstrument(instrument, trackId) {
  if (!instrument || !VOICE_TYPES.has(instrument.voiceType)) {
    throw new RangeError(`Track ${trackId} has an unsupported voice type.`);
  }
  const ranges = {
    attackSeconds: [0.001, 2],
    octaveOffset: [-2, 2],
    releaseSeconds: [0.01, 3],
    volume: [0, 1],
  };
  for (const [field, [minimum, maximum]] of Object.entries(ranges)) {
    const value = instrument[field];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(`Track ${trackId} has an invalid instrument ${field}.`);
    }
  }
}

function validateMixer(mixer, trackId) {
  if (
    !mixer ||
    typeof mixer.muted !== "boolean" ||
    typeof mixer.solo !== "boolean" ||
    !Number.isFinite(mixer.volume) ||
    mixer.volume < 0 ||
    mixer.volume > 1
  ) throw new RangeError(`Track ${trackId} has invalid mixer settings.`);
}

function validatePattern(pattern, trackId) {
  if (!Array.isArray(pattern?.steps) || !SUPPORTED_PATTERN_LENGTHS.includes(pattern.steps.length)) {
    throw new RangeError(`Track ${trackId} has an unsupported pattern length.`);
  }
  for (const step of pattern.steps) {
    if (step === null) continue;
    if (
      !step ||
      !Number.isInteger(step.note) ||
      step.note < MIN_PATTERN_NOTE ||
      step.note > MAX_PATTERN_NOTE ||
      !SUPPORTED_PATTERN_GATES.includes(step.gate) ||
      !Number.isFinite(step.volume) ||
      step.volume < 0 ||
      step.volume > 1
    ) throw new RangeError(`Track ${trackId} contains an invalid pattern step.`);
  }
}

export function createDefaultProject() {
  return freezeProject({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: { title: "Untitled chiptune" },
    transport: { bpm: 120 },
    tracks: [{
      id: DEFAULT_TRACK_ID,
      name: "Pulse 1",
      instrument: { ...instrumentDefaults },
      mixer: { muted: false, solo: false, volume: 1 },
      pattern: { steps: Array(DEFAULT_PATTERN_LENGTH).fill(null) },
    }],
  });
}

export function validateProject(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("A project must be an object.");
  }
  if (candidate.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported project schema version: ${candidate.schemaVersion}.`);
  }
  if (!candidate.metadata || typeof candidate.metadata.title !== "string" || candidate.metadata.title.trim() === "") {
    throw new TypeError("A project must have a title.");
  }
  if (!Number.isFinite(candidate.transport?.bpm) || candidate.transport.bpm < 40 || candidate.transport.bpm > 240) {
    throw new RangeError("Project tempo must be between 40 and 240 BPM.");
  }
  if (!Array.isArray(candidate.tracks) || candidate.tracks.length === 0) {
    throw new RangeError("A project must contain at least one track.");
  }

  const trackIds = new Set();
  for (const track of candidate.tracks) {
    if (!track || typeof track.id !== "string" || track.id === "" || trackIds.has(track.id)) {
      throw new RangeError("Every project track must have a unique identifier.");
    }
    if (typeof track.name !== "string" || track.name.trim() === "") {
      throw new TypeError(`Track ${track.id} must have a name.`);
    }
    trackIds.add(track.id);
    validateInstrument(track.instrument, track.id);
    validateMixer(track.mixer, track.id);
    validatePattern(track.pattern, track.id);
  }
  return true;
}

function normalizeProject(candidate) {
  validateProject(candidate);
  return freezeProject({
    ...candidate,
    metadata: { ...candidate.metadata },
    transport: { ...candidate.transport },
    tracks: candidate.tracks.map(cloneTrack),
  });
}

export function createProjectState(initialProject = createDefaultProject()) {
  const events = new EventTarget();
  const past = [];
  const future = [];
  let historyGroupActive = false;
  let groupedHistoryRecorded = false;
  let state = normalizeProject(initialProject);

  function getState() {
    return state;
  }

  function getHistoryState() {
    return Object.freeze({ canRedo: future.length > 0, canUndo: past.length > 0 });
  }

  function getTrack(trackId = DEFAULT_TRACK_ID) {
    const track = state.tracks.find(({ id }) => id === trackId);
    if (!track) throw new RangeError(`Unknown track: ${trackId}`);
    return track;
  }

  function emitChange(detail = {}) {
    events.dispatchEvent(new CustomEvent("change", {
      detail: Object.freeze({ ...getHistoryState(), state, ...detail }),
    }));
  }

  function retainPast(snapshot) {
    past.push(snapshot);
    if (past.length > MAX_PROJECT_HISTORY) past.shift();
  }

  function commit(nextProject, detail = {}) {
    const nextState = normalizeProject(nextProject);
    if (!historyGroupActive || !groupedHistoryRecorded) {
      retainPast(state);
      groupedHistoryRecorded = historyGroupActive;
    }
    future.length = 0;
    state = nextState;
    emitChange(detail);
    return true;
  }

  function replace(nextProject, detail = {}) {
    state = normalizeProject(nextProject);
    past.length = 0;
    future.length = 0;
    endHistoryGroup();
    emitChange({ operation: "replace", ...detail });
    return true;
  }

  function updateTrack(trackId, update, detail = {}) {
    const trackIndex = state.tracks.findIndex(({ id }) => id === trackId);
    if (trackIndex === -1) throw new RangeError(`Unknown track: ${trackId}`);
    const currentTrack = state.tracks[trackIndex];
    const nextTrack = update(currentTrack);
    if (nextTrack === currentTrack) return false;
    const tracks = [...state.tracks];
    tracks[trackIndex] = nextTrack;
    return commit({ ...state, tracks }, { trackId, ...detail });
  }

  function setBpm(bpm) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) {
      throw new RangeError("Tempo must be between 40 and 240 BPM.");
    }
    if (state.transport.bpm === bpm) return false;
    return commit(
      { ...state, transport: { ...state.transport, bpm } },
      { field: "transport.bpm" },
    );
  }

  function beginHistoryGroup() {
    historyGroupActive = true;
    groupedHistoryRecorded = false;
  }

  function endHistoryGroup() {
    historyGroupActive = false;
    groupedHistoryRecorded = false;
  }

  function undo() {
    endHistoryGroup();
    if (past.length === 0) return false;
    future.push(state);
    state = normalizeProject(past.pop());
    emitChange({ operation: "undo" });
    return true;
  }

  function redo() {
    endHistoryGroup();
    if (future.length === 0) return false;
    retainPast(state);
    state = normalizeProject(future.pop());
    emitChange({ operation: "redo" });
    return true;
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    beginHistoryGroup,
    endHistoryGroup,
    getHistoryState,
    getState,
    getTrack,
    redo,
    removeEventListener: events.removeEventListener.bind(events),
    replace,
    setBpm,
    undo,
    updateTrack,
  });
}
