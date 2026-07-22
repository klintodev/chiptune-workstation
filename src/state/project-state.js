import { instrumentDefaults } from "./instrument-state.js";
import {
  createDefaultVisualiser,
  normalizeVisualiser,
  validateVisualiser,
} from "../visualiser/visualiser-config.js?v=20260721-3";
import {
  DEFAULT_PATTERN_LENGTH,
  DEFAULT_PATTERN_ROOT_OCTAVE,
  MAX_PATTERN_NOTE,
  MAX_PATTERN_ROOT_OCTAVE,
  MIN_PATTERN_NOTE,
  MIN_PATTERN_ROOT_OCTAVE,
  SUPPORTED_PATTERN_GATES,
  SUPPORTED_PATTERN_LENGTHS,
} from "./pattern-state.js";

export const PROJECT_SCHEMA_VERSION = 5;
export const DEFAULT_PATTERN_ID = "pattern-1";
export const DEFAULT_TRACK_ID = "track-1";
export const MAX_PROJECT_HISTORY = 100;
export const MAX_PROJECT_TRACKS = 8;
export const MAX_ARRANGEMENT_STEPS = 256;
export const MAX_TRACK_VOICES = 16;

const VOICE_TYPES = new Set(["pulse12", "pulse25", "square", "triangle", "sawtooth", "noise"]);

function cloneStep(step) {
  return step === null ? null : { ...step };
}

function clonePattern(pattern) {
  return { ...pattern, steps: pattern.steps.map(cloneStep) };
}

function cloneTrack(track) {
  return {
    ...track,
    clips: track.clips.map((clip) => ({ ...clip })),
    instrument: { ...track.instrument },
    mixer: { ...track.mixer },
  };
}

function freezeProject(project) {
  Object.freeze(project.metadata);
  for (const layer of project.visualiser.layers) {
    Object.freeze(layer.mapping);
    Object.freeze(layer);
  }
  Object.freeze(project.visualiser.layers);
  Object.freeze(project.visualiser);
  Object.freeze(project.transport.loop);
  Object.freeze(project.transport);
  for (const pattern of project.patterns) {
    for (const step of pattern.steps) {
      if (step !== null) Object.freeze(step);
    }
    Object.freeze(pattern.steps);
    Object.freeze(pattern);
  }
  Object.freeze(project.patterns);
  for (const track of project.tracks) {
    Object.freeze(track.instrument);
    Object.freeze(track.mixer);
    for (const clip of track.clips) Object.freeze(clip);
    Object.freeze(track.clips);
    Object.freeze(track);
  }
  Object.freeze(project.tracks);
  return Object.freeze(project);
}

function validateName(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must have a name.`);
  }
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
    !Number.isFinite(mixer.pan) ||
    mixer.pan < -1 ||
    mixer.pan > 1 ||
    !Number.isFinite(mixer.volume) ||
    mixer.volume < 0 ||
    mixer.volume > 1
  ) throw new RangeError(`Track ${trackId} has invalid mixer settings.`);
}

function validatePattern(pattern) {
  validateName(pattern?.name, `Pattern ${pattern?.id ?? "unknown"}`);
  if (
    !Number.isInteger(pattern.rootOctave) ||
    pattern.rootOctave < MIN_PATTERN_ROOT_OCTAVE ||
    pattern.rootOctave > MAX_PATTERN_ROOT_OCTAVE
  ) throw new RangeError(`Pattern ${pattern?.id ?? "unknown"} has an unsupported root octave.`);
  if (!Array.isArray(pattern?.steps) || !SUPPORTED_PATTERN_LENGTHS.includes(pattern.steps.length)) {
    throw new RangeError(`Pattern ${pattern?.id ?? "unknown"} has an unsupported length.`);
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
    ) throw new RangeError(`Pattern ${pattern.id} contains an invalid step.`);
  }
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function validateClipCollection(track, patternsById, clipIds) {
  const ranges = [];
  for (const clip of track.clips) {
    if (!clip || typeof clip.id !== "string" || clip.id === "" || clipIds.has(clip.id)) {
      throw new RangeError("Every clip must have a unique identifier.");
    }
    const pattern = patternsById.get(clip.patternId);
    if (!pattern) throw new RangeError(`Clip ${clip.id} references an unknown pattern.`);
    if (!Number.isInteger(clip.startStep) || clip.startStep < 0) {
      throw new RangeError(`Clip ${clip.id} must start on a valid step.`);
    }
    const endStep = clip.startStep + pattern.steps.length;
    if (endStep > MAX_ARRANGEMENT_STEPS) {
      throw new RangeError(`Clip ${clip.id} extends beyond step ${MAX_ARRANGEMENT_STEPS}.`);
    }
    for (const range of ranges) {
      if (rangesOverlap(clip.startStep, endStep, range.startStep, range.endStep)) {
        throw new RangeError(`Clips ${range.id} and ${clip.id} overlap on track ${track.name}.`);
      }
    }
    ranges.push({ id: clip.id, startStep: clip.startStep, endStep });
    clipIds.add(clip.id);
  }
}

function validateTransport(transport) {
  if (!Number.isFinite(transport?.bpm) || transport.bpm < 40 || transport.bpm > 240) {
    throw new RangeError("Project tempo must be between 40 and 240 BPM.");
  }
  if (!Number.isFinite(transport.masterVolume) || transport.masterVolume < 0 || transport.masterVolume > 1) {
    throw new RangeError("Master volume must be between zero and one.");
  }
  const loop = transport.loop;
  if (
    !loop ||
    typeof loop.enabled !== "boolean" ||
    !Number.isInteger(loop.startStep) ||
    !Number.isInteger(loop.endStep) ||
    loop.startStep < 0 ||
    loop.endStep <= loop.startStep ||
    loop.endStep > MAX_ARRANGEMENT_STEPS
  ) throw new RangeError("Arrangement loop bounds are invalid.");
}

export function validateProject(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("A project must be an object.");
  if (candidate.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported project schema version: ${candidate.schemaVersion}.`);
  }
  validateName(candidate.metadata?.title, "Project");
  validateVisualiser(candidate.visualiser);
  validateTransport(candidate.transport);
  if (!Array.isArray(candidate.patterns) || candidate.patterns.length === 0) {
    throw new RangeError("A project must contain at least one pattern.");
  }
  if (
    !Array.isArray(candidate.tracks) ||
    candidate.tracks.length === 0 ||
    candidate.tracks.length > MAX_PROJECT_TRACKS
  ) throw new RangeError(`A project must contain between one and ${MAX_PROJECT_TRACKS} tracks.`);

  const patternIds = new Set();
  const patternsById = new Map();
  for (const pattern of candidate.patterns) {
    if (!pattern || typeof pattern.id !== "string" || pattern.id === "" || patternIds.has(pattern.id)) {
      throw new RangeError("Every pattern must have a unique identifier.");
    }
    validatePattern(pattern);
    patternIds.add(pattern.id);
    patternsById.set(pattern.id, pattern);
  }

  const trackIds = new Set();
  const clipIds = new Set();
  for (const track of candidate.tracks) {
    if (!track || typeof track.id !== "string" || track.id === "" || trackIds.has(track.id)) {
      throw new RangeError("Every track must have a unique identifier.");
    }
    validateName(track.name, `Track ${track.id}`);
    validateInstrument(track.instrument, track.id);
    validateMixer(track.mixer, track.id);
    if (!Array.isArray(track.clips)) throw new TypeError(`Track ${track.id} must contain a clip collection.`);
    validateClipCollection(track, patternsById, clipIds);
    trackIds.add(track.id);
  }
  return true;
}

function isPatternEmpty(pattern) {
  return pattern.steps.every((step) => step === null);
}

export function migrateProject(candidate) {
  if (candidate?.schemaVersion === PROJECT_SCHEMA_VERSION) return candidate;
  if (candidate?.schemaVersion === 4 && Array.isArray(candidate.patterns)) {
    return {
      ...candidate,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      tracks: candidate.tracks.map((track) => ({
        ...track,
        mixer: { ...track.mixer, pan: track.mixer.pan ?? 0 },
      })),
    };
  }
  if (candidate?.schemaVersion === 3 && Array.isArray(candidate.patterns)) {
    return {
      ...candidate,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      visualiser: createDefaultVisualiser(),
      tracks: candidate.tracks.map((track) => ({
        ...track,
        mixer: { ...track.mixer, pan: track.mixer.pan ?? 0 },
      })),
    };
  }
  if (candidate?.schemaVersion === 2 && Array.isArray(candidate.patterns)) {
    return {
      ...candidate,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      visualiser: createDefaultVisualiser(),
      tracks: candidate.tracks.map((track) => ({
        ...track,
        mixer: { ...track.mixer, pan: track.mixer.pan ?? 0 },
      })),
      patterns: candidate.patterns.map((pattern) => ({
        ...pattern,
        rootOctave: pattern.rootOctave ?? DEFAULT_PATTERN_ROOT_OCTAVE,
      })),
    };
  }
  if (candidate?.schemaVersion !== 1 || !Array.isArray(candidate.tracks)) {
    throw new RangeError(`Unsupported project schema version: ${candidate?.schemaVersion}.`);
  }

  const patterns = candidate.tracks.map((track, index) => ({
    id: `pattern-${index + 1}`,
    name: index === 0 ? "Pattern 1" : `${track.name} pattern`,
    rootOctave: DEFAULT_PATTERN_ROOT_OCTAVE,
    steps: track.pattern.steps.map(cloneStep),
  }));
  const tracks = candidate.tracks.map((track, index) => ({
    id: track.id,
    name: track.name,
    instrument: { ...track.instrument },
    mixer: { ...track.mixer, pan: track.mixer.pan ?? 0 },
    clips: isPatternEmpty(patterns[index])
      ? []
      : [{ id: `clip-${index + 1}`, patternId: patterns[index].id, startStep: 0 }],
  }));

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: { ...candidate.metadata },
    visualiser: createDefaultVisualiser(),
    transport: {
      bpm: candidate.transport.bpm,
      masterVolume: 0.35,
      loop: { enabled: false, startStep: 0, endStep: DEFAULT_PATTERN_LENGTH },
    },
    patterns,
    tracks,
  };
}

function normalizeProject(candidate) {
  const migrated = migrateProject(candidate);
  validateProject(migrated);
  return freezeProject({
    ...migrated,
    metadata: { ...migrated.metadata },
    visualiser: normalizeVisualiser(migrated.visualiser),
    transport: { ...migrated.transport, loop: { ...migrated.transport.loop } },
    patterns: migrated.patterns.map(clonePattern),
    tracks: migrated.tracks.map(cloneTrack),
  });
}

export function createDefaultProject() {
  return normalizeProject({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: { title: "Untitled chiptune" },
    visualiser: createDefaultVisualiser(),
    transport: {
      bpm: 120,
      masterVolume: 0.35,
      loop: { enabled: false, startStep: 0, endStep: DEFAULT_PATTERN_LENGTH },
    },
    patterns: [{
      id: DEFAULT_PATTERN_ID,
      name: "Pattern 1",
      rootOctave: DEFAULT_PATTERN_ROOT_OCTAVE,
      steps: Array(DEFAULT_PATTERN_LENGTH).fill(null),
    }],
    tracks: [{
      id: DEFAULT_TRACK_ID,
      name: "Pulse 1",
      instrument: { ...instrumentDefaults },
      mixer: { muted: false, pan: 0, solo: false, volume: 1 },
      clips: [],
    }],
  });
}

function nextIdentifier(prefix, ids) {
  let number = 1;
  while (ids.has(`${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}

function uniqueName(base, existingNames) {
  if (!existingNames.has(base)) return base;
  let suffix = 2;
  while (existingNames.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export function isTrackAudible(project, trackId) {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new RangeError(`Unknown track: `);
  const anySolo = project.tracks.some((candidate) => candidate.mixer.solo);
  return !track.mixer.muted && (!anySolo || track.mixer.solo);
}
export function getArrangementEnd(project) {
  const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
  let endStep = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      endStep = Math.max(endStep, clip.startStep + patterns.get(clip.patternId).steps.length);
    }
  }
  return endStep;
}

function findClip(project, clipId) {
  for (const track of project.tracks) {
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex !== -1) return { track, clip: track.clips[clipIndex], clipIndex };
  }
  throw new RangeError(`Unknown clip: ${clipId}`);
}

function canPlaceClip(project, trackId, patternId, startStep, ignoredClipId = null) {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  const pattern = project.patterns.find((candidate) => candidate.id === patternId);
  if (!track) throw new RangeError(`Unknown track: ${trackId}`);
  if (!pattern) throw new RangeError(`Unknown pattern: ${patternId}`);
  if (!Number.isInteger(startStep) || startStep < 0) return false;
  const endStep = startStep + pattern.steps.length;
  if (endStep > MAX_ARRANGEMENT_STEPS) return false;
  return track.clips.every((clip) => {
    if (clip.id === ignoredClipId) return true;
    const clipPattern = project.patterns.find((candidate) => candidate.id === clip.patternId);
    return !rangesOverlap(startStep, endStep, clip.startStep, clip.startStep + clipPattern.steps.length);
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

  function getPattern(patternId = DEFAULT_PATTERN_ID) {
    const pattern = state.patterns.find(({ id }) => id === patternId);
    if (!pattern) throw new RangeError(`Unknown pattern: ${patternId}`);
    return pattern;
  }

  function getTrack(trackId = DEFAULT_TRACK_ID) {
    const track = state.tracks.find(({ id }) => id === trackId);
    if (!track) throw new RangeError(`Unknown track: ${trackId}`);
    return track;
  }

  function getClip(clipId) {
    const { clip, track } = findClip(state, clipId);
    return Object.freeze({ clip, track });
  }

  function getPatternUsageCount(patternId) {
    getPattern(patternId);
    return state.tracks.reduce(
      (count, track) => count + track.clips.filter((clip) => clip.patternId === patternId).length,
      0,
    );
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

  function updatePattern(patternId, update, detail = {}) {
    const patternIndex = state.patterns.findIndex(({ id }) => id === patternId);
    if (patternIndex === -1) throw new RangeError(`Unknown pattern: ${patternId}`);
    const currentPattern = state.patterns[patternIndex];
    const nextPattern = update(currentPattern);
    if (nextPattern === currentPattern) return false;
    const patterns = [...state.patterns];
    patterns[patternIndex] = nextPattern;
    return commit({ ...state, patterns }, { patternId, ...detail });
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

  function createPattern(name) {
    const patternIds = new Set(state.patterns.map(({ id }) => id));
    const names = new Set(state.patterns.map((pattern) => pattern.name));
    const id = nextIdentifier("pattern", patternIds);
    const resolvedName = uniqueName(name?.trim() || `Pattern ${state.patterns.length + 1}`, names);
    commit({
      ...state,
      patterns: [...state.patterns, {
        id,
        name: resolvedName,
        rootOctave: DEFAULT_PATTERN_ROOT_OCTAVE,
        steps: Array(DEFAULT_PATTERN_LENGTH).fill(null),
      }],
    }, { operation: "create-pattern", patternId: id });
    return id;
  }

  function createPatternClip(trackId, startStep, name) {
    const patternIds = new Set(state.patterns.map(({ id }) => id));
    const names = new Set(state.patterns.map((pattern) => pattern.name));
    const patternId = nextIdentifier("pattern", patternIds);
    const pattern = {
      id: patternId,
      name: uniqueName(name?.trim() || `Pattern ${state.patterns.length + 1}`, names),
      rootOctave: DEFAULT_PATTERN_ROOT_OCTAVE,
      steps: Array(DEFAULT_PATTERN_LENGTH).fill(null),
    };
    const projectWithPattern = { ...state, patterns: [...state.patterns, pattern] };
    if (!canPlaceClip(projectWithPattern, trackId, patternId, startStep)) {
      throw new RangeError("A new pattern does not fit at the selected track position.");
    }

    const clipIds = new Set(state.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
    const clipId = nextIdentifier("clip", clipIds);
    const tracks = state.tracks.map((track) => track.id === trackId
      ? {
        ...track,
        clips: [...track.clips, { id: clipId, patternId, startStep }]
          .sort((left, right) => left.startStep - right.startStep),
      }
      : track);
    commit(
      { ...projectWithPattern, tracks },
      { operation: "create-pattern-clip", trackId, patternId, clipId },
    );
    return Object.freeze({ clipId, patternId });
  }

  function renameProject(name) {
    const resolvedName = name.trim();
    validateName(resolvedName, "Project");
    if (state.metadata.title === resolvedName) return false;
    return commit(
      { ...state, metadata: { ...state.metadata, title: resolvedName } },
      { field: "metadata.title", operation: "rename-project" },
    );
  }

  function renamePattern(patternId, name) {
    const resolvedName = name.trim();
    validateName(resolvedName, "Pattern");
    return updatePattern(
      patternId,
      (pattern) => pattern.name === resolvedName ? pattern : { ...pattern, name: resolvedName },
      { operation: "rename-pattern" },
    );
  }

  function duplicatePattern(patternId) {
    const source = getPattern(patternId);
    const ids = new Set(state.patterns.map(({ id }) => id));
    const names = new Set(state.patterns.map((pattern) => pattern.name));
    const id = nextIdentifier("pattern", ids);
    const name = uniqueName(`${source.name} variation`, names);
    commit({
      ...state,
      patterns: [...state.patterns, {
        id,
        name,
        rootOctave: source.rootOctave,
        steps: source.steps.map(cloneStep),
      }],
    }, { operation: "duplicate-pattern", patternId: id, sourcePatternId: patternId });
    return id;
  }

  function setPatternRootOctave(patternId, rootOctave) {
    if (
      !Number.isInteger(rootOctave) ||
      rootOctave < MIN_PATTERN_ROOT_OCTAVE ||
      rootOctave > MAX_PATTERN_ROOT_OCTAVE
    ) throw new RangeError(`Pattern root octave must be between ${MIN_PATTERN_ROOT_OCTAVE} and ${MAX_PATTERN_ROOT_OCTAVE}.`);
    return updatePattern(
      patternId,
      (pattern) => pattern.rootOctave === rootOctave ? pattern : { ...pattern, rootOctave },
      { field: "pattern.rootOctave" },
    );
  }

  function deletePattern(patternId, { removeReferences = false } = {}) {
    if (state.patterns.length === 1) throw new RangeError("The final pattern cannot be deleted.");
    getPattern(patternId);
    const removedClipIds = state.tracks.flatMap((track) => track.clips)
      .filter((clip) => clip.patternId === patternId)
      .map((clip) => clip.id);
    if (removedClipIds.length > 0 && !removeReferences) {
      throw new RangeError(`Pattern is used by ${removedClipIds.length} clip${removedClipIds.length === 1 ? "" : "s"}.`);
    }
    return commit({
      ...state,
      patterns: state.patterns.filter((pattern) => pattern.id !== patternId),
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.patternId !== patternId),
      })),
    }, { operation: "delete-pattern", patternId, removedClipIds: Object.freeze(removedClipIds) });
  }

  function addTrack(name) {
    if (state.tracks.length >= MAX_PROJECT_TRACKS) {
      throw new RangeError(`A project supports at most ${MAX_PROJECT_TRACKS} tracks.`);
    }
    const ids = new Set(state.tracks.map(({ id }) => id));
    const names = new Set(state.tracks.map((track) => track.name));
    const id = nextIdentifier("track", ids);
    const resolvedName = uniqueName(name?.trim() || `Track ${state.tracks.length + 1}`, names);
    commit({
      ...state,
      tracks: [...state.tracks, {
        id,
        name: resolvedName,
        instrument: { ...instrumentDefaults },
        mixer: { muted: false, pan: 0, solo: false, volume: 1 },
        clips: [],
      }],
    }, { operation: "add-track", trackId: id });
    return id;
  }

  function renameTrack(trackId, name) {
    const resolvedName = name.trim();
    validateName(resolvedName, "Track");
    return updateTrack(
      trackId,
      (track) => track.name === resolvedName ? track : { ...track, name: resolvedName },
      { operation: "rename-track" },
    );
  }

  function moveTrack(trackId, direction) {
    if (direction !== -1 && direction !== 1) throw new RangeError("Track direction must be -1 or 1.");
    const index = state.tracks.findIndex((track) => track.id === trackId);
    if (index === -1) throw new RangeError(`Unknown track: ${trackId}`);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.tracks.length) return false;
    const tracks = [...state.tracks];
    [tracks[index], tracks[nextIndex]] = [tracks[nextIndex], tracks[index]];
    return commit({ ...state, tracks }, { operation: "move-track", trackId });
  }

  function removeTrack(trackId, { allowClips = false } = {}) {
    if (state.tracks.length === 1) throw new RangeError("The final track cannot be removed.");
    const track = getTrack(trackId);
    if (track.clips.length > 0 && !allowClips) {
      throw new RangeError(`Track contains ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}.`);
    }
    const removedClipIds = track.clips.map((clip) => clip.id);
    return commit(
      { ...state, tracks: state.tracks.filter((candidate) => candidate.id !== trackId) },
      { operation: "remove-track", trackId, removedClipIds: Object.freeze(removedClipIds) },
    );
  }

  function addClip(trackId, patternId, startStep) {
    if (!canPlaceClip(state, trackId, patternId, startStep)) {
      throw new RangeError("That pattern does not fit at the selected track position.");
    }
    const ids = new Set(state.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
    const id = nextIdentifier("clip", ids);
    const trackIndex = state.tracks.findIndex((track) => track.id === trackId);
    const tracks = [...state.tracks];
    const track = state.tracks[trackIndex];
    tracks[trackIndex] = {
      ...track,
      clips: [...track.clips, { id, patternId, startStep }]
        .sort((left, right) => left.startStep - right.startStep),
    };
    commit({ ...state, tracks }, { operation: "add-clip", trackId, patternId, clipId: id });
    return id;
  }

  function createClipVariation(clipId) {
    const found = findClip(state, clipId);
    const source = getPattern(found.clip.patternId);
    const ids = new Set(state.patterns.map(({ id }) => id));
    const names = new Set(state.patterns.map((pattern) => pattern.name));
    const patternId = nextIdentifier("pattern", ids);
    const name = uniqueName(`${source.name} variation`, names);
    const variation = {
      id: patternId,
      name,
      rootOctave: source.rootOctave,
      steps: source.steps.map(cloneStep),
    };
    const tracks = state.tracks.map((track) => track.id === found.track.id
      ? {
          ...track,
          clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, patternId } : clip),
        }
      : track);
    commit(
      { ...state, patterns: [...state.patterns, variation], tracks },
      { clipId, operation: "create-clip-variation", patternId, sourcePatternId: source.id },
    );
    return patternId;
  }

  function canMoveClip(clipId, trackId, startStep) {
    const found = findClip(state, clipId);
    return canPlaceClip(state, trackId, found.clip.patternId, startStep, clipId);
  }

  function moveClip(clipId, trackId, startStep) {
    const found = findClip(state, clipId);
    if (found.track.id === trackId && found.clip.startStep === startStep) return false;
    if (!canPlaceClip(state, trackId, found.clip.patternId, startStep, clipId)) {
      throw new RangeError("That clip does not fit at the selected track position.");
    }
    const tracks = state.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== clipId),
    }));
    const targetIndex = tracks.findIndex((track) => track.id === trackId);
    tracks[targetIndex] = {
      ...tracks[targetIndex],
      clips: [...tracks[targetIndex].clips, { ...found.clip, startStep }]
        .sort((left, right) => left.startStep - right.startStep),
    };
    return commit({ ...state, tracks }, { operation: "move-clip", clipId, trackId });
  }

  function repeatClip(clipId) {
    const { clip, track } = findClip(state, clipId);
    const pattern = getPattern(clip.patternId);
    for (
      let startStep = clip.startStep + pattern.steps.length;
      startStep + pattern.steps.length <= MAX_ARRANGEMENT_STEPS;
      startStep += 1
    ) {
      if (canPlaceClip(state, track.id, pattern.id, startStep)) {
        return addClip(track.id, pattern.id, startStep);
      }
    }
    throw new RangeError("There is no later position where this clip fits.");
  }

  function removeClip(clipId) {
    const { track } = findClip(state, clipId);
    return updateTrack(
      track.id,
      (current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== clipId) }),
      { operation: "remove-clip", clipId },
    );
  }

  function setVisualiser(values) {
    const visualiser = normalizeVisualiser({ ...state.visualiser, ...values });
    if (Object.keys(values).every((key) => state.visualiser[key] === visualiser[key])) return false;
    return commit({ ...state, visualiser }, { field: "visualiser", operation: "update-visualiser" });
  }

  function setBpm(bpm) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) {
      throw new RangeError("Tempo must be between 40 and 240 BPM.");
    }
    if (state.transport.bpm === bpm) return false;
    return commit({ ...state, transport: { ...state.transport, bpm } }, { field: "transport.bpm" });
  }

  function setMasterVolume(masterVolume) {
    if (!Number.isFinite(masterVolume) || masterVolume < 0 || masterVolume > 1) {
      throw new RangeError("Master volume must be between zero and one.");
    }
    if (state.transport.masterVolume === masterVolume) return false;
    return commit(
      { ...state, transport: { ...state.transport, masterVolume } },
      { field: "transport.masterVolume" },
    );
  }

  function setLoop(values) {
    const loop = { ...state.transport.loop, ...values };
    if (Object.keys(values).every((key) => state.transport.loop[key] === loop[key])) return false;
    return commit({ ...state, transport: { ...state.transport, loop } }, { field: "transport.loop" });
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
    addClip,
    addEventListener: events.addEventListener.bind(events),
    addTrack,
    beginHistoryGroup,
    canMoveClip,
    createClipVariation,
    createPattern,
    createPatternClip,
    deletePattern,
    duplicatePattern,
    endHistoryGroup,
    getArrangementEnd: () => getArrangementEnd(state),
    getClip,
    getHistoryState,
    getPattern,
    getPatternUsageCount,
    getState,
    getTrack,
    moveClip,
    moveTrack,
    redo,
    removeClip,
    removeEventListener: events.removeEventListener.bind(events),
    removeTrack,
    renamePattern,
    renameProject,
    renameTrack,
    repeatClip,
    replace,
    setBpm,
    setLoop,
    setMasterVolume,
    setPatternRootOctave,
    setVisualiser,
    undo,
    updatePattern,
    updateTrack,
  });
}
