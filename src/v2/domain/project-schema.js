import {
  DEFAULT_PATTERN_ID,
  DEFAULT_PATTERN_LENGTH_TICKS,
  DEFAULT_TRACK_ID,
  LOOP_MODES,
  MAX_ARRANGEMENT_TICKS,
  MAX_BPM,
  MAX_CLIPS_PER_TRACK,
  MAX_EFFECTS_PER_CHAIN,
  MAX_NOTES_PER_PATTERN,
  MAX_NOTES_PER_PROJECT,
  MAX_PATTERN_LENGTH_TICKS,
  MAX_PATTERN_NAME_LENGTH,
  MAX_PATTERN_NOTE,
  MAX_PROJECT_PATTERNS,
  MAX_PROJECT_TITLE_LENGTH,
  MAX_PROJECT_TRACKS,
  MAX_TRACK_NAME_LENGTH,
  MIN_BPM,
  MIN_PATTERN_LENGTH_TICKS,
  MIN_PATTERN_NOTE,
  PATTERN_LENGTH_INCREMENT_TICKS,
  PROJECT_SCHEMA_VERSION,
} from "./constants.js";
import {
  createDefaultInstrumentInstance,
  normalizeEffectInstance,
  normalizeInstrumentInstance,
} from "./device-contracts.js";
import {
  assertBoolean,
  assertDomainId,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertInteger,
  assertName,
  compareIds,
  deepFreeze,
  rangesOverlap,
} from "./domain-utils.js";

function normalizeLoop(candidate) {
  assertExactKeys(candidate, ["enabled", "mode", "startTick", "endTick"], "Transport loop");
  assertBoolean(candidate.enabled, "Transport loop enabled");
  assertEnum(candidate.mode, LOOP_MODES, "Transport loop mode");
  assertInteger(candidate.startTick, "Transport loop startTick", 0, MAX_ARRANGEMENT_TICKS - 1);
  assertInteger(candidate.endTick, "Transport loop endTick", 1, MAX_ARRANGEMENT_TICKS);
  if (candidate.endTick <= candidate.startTick) {
    throw new RangeError("Transport loop endTick must be greater than startTick.");
  }
  return {
    enabled: candidate.enabled,
    mode: candidate.mode,
    startTick: candidate.startTick,
    endTick: candidate.endTick,
  };
}

function normalizeNote(candidate, pattern, noteIds) {
  assertExactKeys(candidate, ["id", "pitch", "startTick", "durationTicks", "velocity"], `Pattern ${pattern.id} note`);
  assertDomainId(candidate.id, `Pattern ${pattern.id} note id`);
  if (noteIds.has(candidate.id)) throw new RangeError(`Pattern ${pattern.id} has duplicate note id ${candidate.id}.`);
  noteIds.add(candidate.id);
  assertInteger(candidate.pitch, `Note ${candidate.id} pitch`, MIN_PATTERN_NOTE, MAX_PATTERN_NOTE);
  assertInteger(candidate.startTick, `Note ${candidate.id} startTick`, 0, pattern.lengthTicks - 1);
  assertInteger(candidate.durationTicks, `Note ${candidate.id} durationTicks`, 1, pattern.lengthTicks);
  if (candidate.startTick + candidate.durationTicks > pattern.lengthTicks) {
    throw new RangeError(`Note ${candidate.id} extends beyond Pattern ${pattern.id}.`);
  }
  assertFiniteNumber(candidate.velocity, `Note ${candidate.id} velocity`, 0, 1);
  return {
    id: candidate.id,
    pitch: candidate.pitch,
    startTick: candidate.startTick,
    durationTicks: candidate.durationTicks,
    velocity: candidate.velocity,
  };
}

function compareNotes(left, right) {
  return left.startTick - right.startTick
    || left.pitch - right.pitch
    || compareIds(left.id, right.id);
}

function normalizePattern(candidate) {
  assertExactKeys(candidate, ["id", "name", "lengthTicks", "notes"], "Pattern");
  assertDomainId(candidate.id, "Pattern id");
  assertName(candidate.name, `Pattern ${candidate.id} name`, MAX_PATTERN_NAME_LENGTH);
  assertInteger(
    candidate.lengthTicks,
    `Pattern ${candidate.id} lengthTicks`,
    MIN_PATTERN_LENGTH_TICKS,
    MAX_PATTERN_LENGTH_TICKS,
  );
  if (candidate.lengthTicks % PATTERN_LENGTH_INCREMENT_TICKS !== 0) {
    throw new RangeError(`Pattern ${candidate.id} lengthTicks must use 96-tick increments.`);
  }
  if (!Array.isArray(candidate.notes) || candidate.notes.length > MAX_NOTES_PER_PATTERN) {
    throw new RangeError(`Pattern ${candidate.id} supports at most ${MAX_NOTES_PER_PATTERN} notes.`);
  }
  const noteIds = new Set();
  const pattern = { id: candidate.id, lengthTicks: candidate.lengthTicks };
  const notes = candidate.notes.map((note) => normalizeNote(note, pattern, noteIds)).sort(compareNotes);
  return {
    id: candidate.id,
    name: candidate.name,
    lengthTicks: candidate.lengthTicks,
    notes,
  };
}

function normalizeEffectChain(candidate, usedInstanceIds, label) {
  if (!Array.isArray(candidate) || candidate.length > MAX_EFFECTS_PER_CHAIN) {
    throw new RangeError(`${label} supports at most ${MAX_EFFECTS_PER_CHAIN} Effects.`);
  }
  return candidate.map((effect, index) => normalizeEffectInstance(effect, {
    usedInstanceIds,
    label: `${label} Effect ${index + 1}`,
  }));
}

function normalizeTrackMixer(candidate, usedInstanceIds, trackId) {
  assertExactKeys(candidate, ["volume", "pan", "muted", "solo", "effects"], `Track ${trackId} Mixer`);
  assertFiniteNumber(candidate.volume, `Track ${trackId} Mixer volume`, 0, 1);
  assertFiniteNumber(candidate.pan, `Track ${trackId} Mixer pan`, -1, 1);
  assertBoolean(candidate.muted, `Track ${trackId} Mixer muted`);
  assertBoolean(candidate.solo, `Track ${trackId} Mixer solo`);
  return {
    volume: candidate.volume,
    pan: candidate.pan,
    muted: candidate.muted,
    solo: candidate.solo,
    effects: normalizeEffectChain(candidate.effects, usedInstanceIds, `Track ${trackId}`),
  };
}

function normalizeClip(candidate, patternsById, clipIds, trackId) {
  assertExactKeys(candidate, ["id", "patternId", "startTick"], `Track ${trackId} clip`);
  assertDomainId(candidate.id, `Track ${trackId} clip id`);
  if (clipIds.has(candidate.id)) throw new RangeError(`Project has duplicate clip id ${candidate.id}.`);
  clipIds.add(candidate.id);
  assertDomainId(candidate.patternId, `Clip ${candidate.id} patternId`);
  const pattern = patternsById.get(candidate.patternId);
  if (!pattern) throw new RangeError(`Clip ${candidate.id} references unknown Pattern ${candidate.patternId}.`);
  assertInteger(candidate.startTick, `Clip ${candidate.id} startTick`, 0, MAX_ARRANGEMENT_TICKS - 1);
  if (candidate.startTick + pattern.lengthTicks > MAX_ARRANGEMENT_TICKS) {
    throw new RangeError(`Clip ${candidate.id} extends beyond tick ${MAX_ARRANGEMENT_TICKS}.`);
  }
  return { id: candidate.id, patternId: candidate.patternId, startTick: candidate.startTick };
}

function compareClips(left, right) {
  return left.startTick - right.startTick || compareIds(left.id, right.id);
}

function normalizeTrack(candidate, patternsById, clipIds, usedInstanceIds) {
  assertExactKeys(candidate, ["id", "name", "instrument", "mixer", "clips"], "Track");
  assertDomainId(candidate.id, "Track id");
  assertName(candidate.name, `Track ${candidate.id} name`, MAX_TRACK_NAME_LENGTH);
  const instrument = normalizeInstrumentInstance(candidate.instrument, {
    usedInstanceIds,
    label: `Track ${candidate.id} Instrument`,
  });
  const mixer = normalizeTrackMixer(candidate.mixer, usedInstanceIds, candidate.id);
  if (!Array.isArray(candidate.clips) || candidate.clips.length > MAX_CLIPS_PER_TRACK) {
    throw new RangeError(`Track ${candidate.id} supports at most ${MAX_CLIPS_PER_TRACK} clips.`);
  }
  const clips = candidate.clips
    .map((clip) => normalizeClip(clip, patternsById, clipIds, candidate.id))
    .sort(compareClips);
  for (let index = 1; index < clips.length; index += 1) {
    const left = clips[index - 1];
    const right = clips[index];
    const leftEnd = left.startTick + patternsById.get(left.patternId).lengthTicks;
    const rightEnd = right.startTick + patternsById.get(right.patternId).lengthTicks;
    if (rangesOverlap(left.startTick, leftEnd, right.startTick, rightEnd)) {
      throw new RangeError(`Clips ${left.id} and ${right.id} overlap on Track ${candidate.id}.`);
    }
  }
  return { id: candidate.id, name: candidate.name, instrument, mixer, clips };
}

function normalizeMasterMixer(candidate, usedInstanceIds) {
  assertExactKeys(candidate, ["volume", "effects"], "Master Mixer");
  assertFiniteNumber(candidate.volume, "Master Mixer volume", 0, 1);
  return {
    volume: candidate.volume,
    effects: normalizeEffectChain(candidate.effects, usedInstanceIds, "Master"),
  };
}

export function canonicalizeV2Project(candidate) {
  assertExactKeys(candidate, ["schemaVersion", "metadata", "transport", "patterns", "tracks", "mixer"], "V7 Project");
  if (candidate.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported project schema version: ${candidate.schemaVersion}.`);
  }

  assertExactKeys(candidate.metadata, ["title"], "Project metadata");
  assertName(candidate.metadata.title, "Project title", MAX_PROJECT_TITLE_LENGTH);
  assertExactKeys(candidate.transport, ["bpm", "loop"], "Project transport");
  assertFiniteNumber(candidate.transport.bpm, "Project tempo", MIN_BPM, MAX_BPM);

  if (!Array.isArray(candidate.patterns) || candidate.patterns.length < 1 || candidate.patterns.length > MAX_PROJECT_PATTERNS) {
    throw new RangeError(`A Project must contain between 1 and ${MAX_PROJECT_PATTERNS} Patterns.`);
  }
  const patternIds = new Set();
  const patterns = candidate.patterns.map((pattern) => {
    const normalized = normalizePattern(pattern);
    if (patternIds.has(normalized.id)) throw new RangeError(`Project has duplicate Pattern id ${normalized.id}.`);
    patternIds.add(normalized.id);
    return normalized;
  });
  const totalNotes = patterns.reduce((count, pattern) => count + pattern.notes.length, 0);
  if (totalNotes > MAX_NOTES_PER_PROJECT) {
    throw new RangeError(`A Project supports at most ${MAX_NOTES_PER_PROJECT} notes.`);
  }
  const patternsById = new Map(patterns.map((pattern) => [pattern.id, pattern]));

  if (!Array.isArray(candidate.tracks) || candidate.tracks.length < 1 || candidate.tracks.length > MAX_PROJECT_TRACKS) {
    throw new RangeError(`A Project must contain between 1 and ${MAX_PROJECT_TRACKS} Tracks.`);
  }
  const trackIds = new Set();
  const clipIds = new Set();
  const usedInstanceIds = new Set();
  const tracks = candidate.tracks.map((track) => {
    const normalized = normalizeTrack(track, patternsById, clipIds, usedInstanceIds);
    if (trackIds.has(normalized.id)) throw new RangeError(`Project has duplicate Track id ${normalized.id}.`);
    trackIds.add(normalized.id);
    return normalized;
  });

  assertExactKeys(candidate.mixer, ["master"], "Project Mixer");
  const master = normalizeMasterMixer(candidate.mixer.master, usedInstanceIds);

  return deepFreeze({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: { title: candidate.metadata.title },
    transport: { bpm: candidate.transport.bpm, loop: normalizeLoop(candidate.transport.loop) },
    patterns,
    tracks,
    mixer: { master },
  });
}

export function validateV2Project(candidate) {
  canonicalizeV2Project(candidate);
  return true;
}

export function createDefaultV2Project() {
  return canonicalizeV2Project({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: { title: "Untitled chiptune" },
    transport: {
      bpm: 120,
      loop: { enabled: false, mode: "custom", startTick: 0, endTick: DEFAULT_PATTERN_LENGTH_TICKS },
    },
    patterns: [{ id: DEFAULT_PATTERN_ID, name: "Pattern 1", lengthTicks: DEFAULT_PATTERN_LENGTH_TICKS, notes: [] }],
    tracks: [{
      id: DEFAULT_TRACK_ID,
      name: "Pulse 1",
      instrument: createDefaultInstrumentInstance("instrument-track-1"),
      mixer: { volume: 1, pan: 0, muted: false, solo: false, effects: [] },
      clips: [],
    }],
    mixer: { master: { volume: 0.35, effects: [] } },
  });
}

export function getV2ArrangementEndTick(project) {
  const patternsById = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
  let endTick = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const pattern = patternsById.get(clip.patternId);
      if (!pattern) throw new RangeError(`Clip ${clip.id} references unknown Pattern ${clip.patternId}.`);
      endTick = Math.max(endTick, clip.startTick + pattern.lengthTicks);
    }
  }
  return endTick;
}
