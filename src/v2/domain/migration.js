import { migrateProject as migrateLegacyProject } from "../../state/project-state.js";
import { normalizeVisualiser } from "../../visualiser/visualiser-config.js";
import {
  DEFAULT_PATTERN_LENGTH_TICKS,
  LEGACY_STEP_TICKS,
  MAX_ARRANGEMENT_TICKS,
  MAX_BPM,
  MAX_PATTERN_NAME_LENGTH,
  MAX_PATTERN_NOTE,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_PATTERNS,
  MAX_PROJECT_TITLE_LENGTH,
  MAX_PROJECT_TRACKS,
  MAX_TRACK_NAME_LENGTH,
  MIN_BPM,
  MIN_PATTERN_NOTE,
  PROJECT_DOCUMENT_FORMAT,
  PROJECT_DOCUMENT_VERSION,
  PROJECT_SCHEMA_VERSION,
} from "./constants.js";
import {
  KLINTO_CHIP_CONTRACT,
} from "./device-contracts.js";
import {
  allocateMigratedId,
  assertBoundedV2Structure,
  assertBoolean,
  assertEnum,
  assertFiniteNumber,
  assertInteger,
  assertName,
  assertRecord,
  createDeterministicMigrationId,
  deepFreeze,
  isRecord,
} from "./domain-utils.js";
import { canonicalizeV2Project } from "./project-schema.js";

const LEGACY_PATTERN_LENGTHS = Object.freeze([4, 8, 16, 32]);
const LEGACY_PATTERN_GATES = Object.freeze([0.25, 0.5, 0.75, 1]);
const LEGACY_VOICE_TYPES = Object.freeze(["pulse12", "pulse25", "square", "triangle", "sawtooth", "noise"]);
const LEGACY_LOOP_MODES = Object.freeze(["custom", "arrangement"]);

function validateLegacyId(value, label) {
  if (typeof value !== "string" || value === "") throw new RangeError(`${label} must be a non-empty string.`);
}

function validateLegacyStep(step, label) {
  if (!isRecord(step)) throw new RangeError(`${label} is invalid.`);
  assertInteger(step.note, `${label} note`, MIN_PATTERN_NOTE, MAX_PATTERN_NOTE);
  assertEnum(step.gate, LEGACY_PATTERN_GATES, `${label} gate`);
  assertFiniteNumber(step.volume, `${label} volume`, 0, 1);
}

function validateLegacySteps(steps, label) {
  if (!Array.isArray(steps) || !LEGACY_PATTERN_LENGTHS.includes(steps.length)) {
    throw new RangeError(`${label} has an unsupported length.`);
  }
  steps.forEach((step, index) => {
    if (step !== null) validateLegacyStep(step, `${label} step ${index}`);
  });
}

function validateLegacyInstrument(instrument, label) {
  assertRecord(instrument, `${label} Instrument`);
  assertEnum(instrument.voiceType, LEGACY_VOICE_TYPES, `${label} voiceType`);
  assertInteger(instrument.octaveOffset, `${label} octaveOffset`, -2, 2);
  assertFiniteNumber(instrument.attackSeconds, `${label} attackSeconds`, 0.001, 2);
  assertFiniteNumber(instrument.releaseSeconds, `${label} releaseSeconds`, 0.01, 3);
  assertFiniteNumber(instrument.volume, `${label} Instrument volume`, 0, 1);
}

function validateLegacyMixer(mixer, label, { defaultPan = false } = {}) {
  assertRecord(mixer, `${label} Mixer`);
  assertFiniteNumber(mixer.volume, `${label} Mixer volume`, 0, 1);
  assertBoolean(mixer.muted, `${label} Mixer muted`);
  assertBoolean(mixer.solo, `${label} Mixer solo`);
  if (!defaultPan || mixer.pan !== undefined) assertFiniteNumber(mixer.pan, `${label} Mixer pan`, -1, 1);
}

function validateLegacyTransport(transport, { schemaOne = false } = {}) {
  assertRecord(transport, "Legacy transport");
  assertFiniteNumber(transport.bpm, "Legacy tempo", MIN_BPM, MAX_BPM);
  if (schemaOne) return;
  assertFiniteNumber(transport.masterVolume, "Legacy master volume", 0, 1);
  assertRecord(transport.loop, "Legacy loop");
  assertBoolean(transport.loop.enabled, "Legacy loop enabled");
  const mode = transport.loop.mode ?? "custom";
  assertEnum(mode, LEGACY_LOOP_MODES, "Legacy loop mode");
  assertInteger(transport.loop.startStep, "Legacy loop startStep", 0, MAX_ARRANGEMENT_TICKS / LEGACY_STEP_TICKS - 1);
  assertInteger(transport.loop.endStep, "Legacy loop endStep", 1, MAX_ARRANGEMENT_TICKS / LEGACY_STEP_TICKS);
  if (transport.loop.endStep <= transport.loop.startStep) {
    throw new RangeError("Legacy loop endStep must be greater than startStep.");
  }
}

function mapLegacyWaveform(voiceType) {
  return voiceType === "sawtooth" ? "saw" : voiceType;
}

function createMigratedInstrument(source, trackId, trackIndex, usedInstanceIds) {
  validateLegacyInstrument(source, `Track ${trackId}`);
  const preferredId = `instrument-${trackId}`;
  const instanceId = allocateMigratedId(
    preferredId,
    "instrument",
    `track:${trackIndex}:${trackId}`,
    usedInstanceIds,
  );
  return {
    instanceId,
    type: KLINTO_CHIP_CONTRACT.type,
    version: KLINTO_CHIP_CONTRACT.version,
    params: {
      waveform: mapLegacyWaveform(source.voiceType),
      octave: source.octaveOffset,
      attackSeconds: source.attackSeconds,
      releaseSeconds: source.releaseSeconds,
      level: source.volume,
    },
  };
}

function createMigratedNotes(steps, patternId, patternIndex) {
  const noteIds = new Set();
  const notes = [];
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    if (step === null) continue;
    validateLegacyStep(step, `Pattern ${patternId} step ${stepIndex}`);
    const id = createDeterministicMigrationId(
      "note",
      `pattern:${patternIndex}:${patternId}:step:${stepIndex}`,
      noteIds,
    );
    noteIds.add(id);
    notes.push({
      id,
      pitch: step.note,
      startTick: stepIndex * LEGACY_STEP_TICKS,
      durationTicks: Math.max(1, Math.round(step.gate * LEGACY_STEP_TICKS)),
      velocity: step.volume,
    });
  }
  return notes;
}

function buildPatternRecords(sourcePatterns) {
  const usedPatternIds = new Set();
  const patternReferenceMap = new Map();
  const patterns = sourcePatterns.map((source, index) => {
    validateLegacyId(source.id, `Legacy Pattern ${index + 1} id`);
    assertName(source.name, `Legacy Pattern ${index + 1} name`, MAX_PATTERN_NAME_LENGTH);
    validateLegacySteps(source.steps, `Legacy Pattern ${source.id}`);
    const id = allocateMigratedId(source.id, "pattern", `pattern:${index}:${source.id}`, usedPatternIds);
    if (!patternReferenceMap.has(source.id)) patternReferenceMap.set(source.id, id);
    return {
      id,
      name: source.name,
      lengthTicks: source.steps.length * LEGACY_STEP_TICKS,
      notes: createMigratedNotes(source.steps, id, index),
    };
  });
  return { patterns, patternReferenceMap };
}

function validateLegacyClip(clip, label) {
  assertRecord(clip, label);
  validateLegacyId(clip.id, `${label} id`);
  validateLegacyId(clip.patternId, `${label} patternId`);
  assertInteger(clip.startStep, `${label} startStep`, 0, MAX_ARRANGEMENT_TICKS / LEGACY_STEP_TICKS - 1);
}

function migrateSchemaOne(candidate) {
  validateLegacyTransport(candidate.transport, { schemaOne: true });
  assertRecord(candidate.metadata, "Legacy metadata");
  assertName(candidate.metadata.title, "Legacy Project title", MAX_PROJECT_TITLE_LENGTH);
  if (!Array.isArray(candidate.tracks) || candidate.tracks.length < 1 || candidate.tracks.length > MAX_PROJECT_TRACKS) {
    throw new RangeError(`A legacy Project must contain between 1 and ${MAX_PROJECT_TRACKS} Tracks.`);
  }

  const sourcePatterns = candidate.tracks.map((track, index) => {
    assertRecord(track, `Legacy Track ${index + 1}`);
    validateLegacyId(track.id, `Legacy Track ${index + 1} id`);
    assertName(track.name, `Legacy Track ${index + 1} name`, MAX_TRACK_NAME_LENGTH);
    assertRecord(track.pattern, `Legacy Track ${index + 1} Pattern`);
    validateLegacySteps(track.pattern.steps, `Legacy Track ${index + 1} Pattern`);
    return {
      id: `pattern-${index + 1}`,
      name: index === 0 ? "Pattern 1" : `${track.name} pattern`,
      steps: track.pattern.steps,
    };
  });
  const { patterns } = buildPatternRecords(sourcePatterns);
  const usedTrackIds = new Set();
  const usedClipIds = new Set();
  const usedInstanceIds = new Set();
  const tracks = candidate.tracks.map((track, index) => {
    validateLegacyInstrument(track.instrument, `Legacy Track ${index + 1}`);
    validateLegacyMixer(track.mixer, `Legacy Track ${index + 1}`, { defaultPan: true });
    const id = allocateMigratedId(track.id, "track", `track:${index}:${track.id}`, usedTrackIds);
    const clips = patterns[index].notes.length === 0 ? [] : [{
      id: allocateMigratedId(`clip-${index + 1}`, "clip", `schema1:${index}`, usedClipIds),
      patternId: patterns[index].id,
      startTick: 0,
    }];
    return {
      id,
      name: track.name,
      instrument: createMigratedInstrument(track.instrument, id, index, usedInstanceIds),
      mixer: {
        volume: track.mixer.volume,
        pan: track.mixer.pan ?? 0,
        muted: track.mixer.muted,
        solo: track.mixer.solo,
        effects: [],
      },
      clips,
    };
  });

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: { title: candidate.metadata.title },
    transport: {
      bpm: candidate.transport.bpm,
      loop: { enabled: false, mode: "custom", startTick: 0, endTick: DEFAULT_PATTERN_LENGTH_TICKS },
    },
    patterns,
    tracks,
    mixer: { master: { volume: 0.35, effects: [] } },
  };
}

function migrateSchemaTwoThroughSix(candidate) {
  const schemaVersion = candidate.schemaVersion;
  validateLegacyTransport(candidate.transport);
  assertRecord(candidate.metadata, "Legacy metadata");
  assertName(candidate.metadata.title, "Legacy Project title", MAX_PROJECT_TITLE_LENGTH);
  normalizeVisualiser(candidate.visualiser);
  if (!Array.isArray(candidate.patterns) || candidate.patterns.length < 1 || candidate.patterns.length > MAX_PROJECT_PATTERNS) {
    throw new RangeError(`A legacy Project must contain between 1 and ${MAX_PROJECT_PATTERNS} Patterns.`);
  }
  if (!Array.isArray(candidate.tracks) || candidate.tracks.length < 1 || candidate.tracks.length > MAX_PROJECT_TRACKS) {
    throw new RangeError(`A legacy Project must contain between 1 and ${MAX_PROJECT_TRACKS} Tracks.`);
  }
  for (const [index, pattern] of candidate.patterns.entries()) {
    assertRecord(pattern, `Legacy Pattern ${index + 1}`);
    if (schemaVersion >= 3) assertInteger(pattern.rootOctave, `Legacy Pattern ${index + 1} rootOctave`, 2, 6);
  }
  const { patterns, patternReferenceMap } = buildPatternRecords(candidate.patterns);
  const patternsById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const usedTrackIds = new Set();
  const usedClipIds = new Set();
  const usedInstanceIds = new Set();

  const tracks = candidate.tracks.map((track, trackIndex) => {
    assertRecord(track, `Legacy Track ${trackIndex + 1}`);
    validateLegacyId(track.id, `Legacy Track ${trackIndex + 1} id`);
    assertName(track.name, `Legacy Track ${trackIndex + 1} name`, MAX_TRACK_NAME_LENGTH);
    validateLegacyInstrument(track.instrument, `Legacy Track ${trackIndex + 1}`);
    validateLegacyMixer(track.mixer, `Legacy Track ${trackIndex + 1}`, { defaultPan: schemaVersion <= 4 });
    if (!Array.isArray(track.clips)) throw new TypeError(`Legacy Track ${track.id} clips must be an array.`);
    const id = allocateMigratedId(track.id, "track", `track:${trackIndex}:${track.id}`, usedTrackIds);
    const clips = track.clips.map((clip, clipIndex) => {
      validateLegacyClip(clip, `Legacy Track ${track.id} clip ${clipIndex + 1}`);
      const patternId = patternReferenceMap.get(clip.patternId);
      if (!patternId || !patternsById.has(patternId)) {
        throw new RangeError(`Legacy clip ${clip.id} references unknown Pattern ${clip.patternId}.`);
      }
      return {
        id: allocateMigratedId(clip.id, "clip", `track:${trackIndex}:clip:${clipIndex}:${clip.id}`, usedClipIds),
        patternId,
        startTick: clip.startStep * LEGACY_STEP_TICKS,
      };
    });
    return {
      id,
      name: track.name,
      instrument: createMigratedInstrument(track.instrument, id, trackIndex, usedInstanceIds),
      mixer: {
        volume: track.mixer.volume,
        pan: track.mixer.pan ?? 0,
        muted: track.mixer.muted,
        solo: track.mixer.solo,
        effects: [],
      },
      clips,
    };
  });

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: { title: candidate.metadata.title },
    transport: {
      bpm: candidate.transport.bpm,
      loop: {
        enabled: candidate.transport.loop.enabled,
        mode: candidate.transport.loop.mode ?? "custom",
        startTick: candidate.transport.loop.startStep * LEGACY_STEP_TICKS,
        endTick: candidate.transport.loop.endStep * LEGACY_STEP_TICKS,
      },
    },
    patterns,
    tracks,
    mixer: { master: { volume: candidate.transport.masterVolume, effects: [] } },
  };
}

export function migrateProjectToV7(candidate) {
  assertBoundedV2Structure(candidate, { label: "Project" });
  assertRecord(candidate, "Project");
  if (candidate.schemaVersion === PROJECT_SCHEMA_VERSION) return canonicalizeV2Project(candidate);
  if (!Number.isInteger(candidate.schemaVersion) || candidate.schemaVersion < 1 || candidate.schemaVersion > 6) {
    throw new RangeError(`Unsupported project schema version: ${candidate.schemaVersion}.`);
  }
  // Keep the shipped schema 1 -> 6 path authoritative. The V7 boundary only
  // converts the resulting V6 musical model; it does not reinterpret history.
  const legacyV6 = migrateLegacyProject(candidate);
  const migrated = migrateSchemaTwoThroughSix(legacyV6);
  return canonicalizeV2Project(migrated);
}

export function normalizeV2Project(candidate) {
  return migrateProjectToV7(candidate);
}

function validateTimestamp(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`Project document ${field} must be an ISO timestamp.`);
  }
}

export function normalizeV2ProjectDocument(candidate) {
  assertBoundedV2Structure(candidate, { label: "Project document" });
  assertRecord(candidate, "Project document");
  if (candidate.format !== PROJECT_DOCUMENT_FORMAT) {
    throw new RangeError("This file is not a Chiptune Workstation project.");
  }
  if (candidate.documentVersion !== PROJECT_DOCUMENT_VERSION) {
    throw new RangeError(`Unsupported project document version: ${candidate.documentVersion}.`);
  }
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
    throw new TypeError("Project document must have an identifier.");
  }
  assertInteger(candidate.revision, "Project document revision", 0);
  validateTimestamp(candidate.createdAt, "createdAt");
  validateTimestamp(candidate.updatedAt, "updatedAt");
  if (Date.parse(candidate.updatedAt) < Date.parse(candidate.createdAt)) {
    throw new RangeError("Project document update time cannot precede its creation time.");
  }
  return deepFreeze({
    format: PROJECT_DOCUMENT_FORMAT,
    documentVersion: PROJECT_DOCUMENT_VERSION,
    id: candidate.id,
    revision: candidate.revision,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    project: normalizeV2Project(candidate.project),
  });
}

export const migrateProjectDocumentToV7 = normalizeV2ProjectDocument;

export function parseV2ProjectDocument(text) {
  if (typeof text !== "string") throw new TypeError("Project file contents must be text.");
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES) {
    throw new RangeError("Project file is larger than 2 MB.");
  }
  let candidate;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new SyntaxError("Project file is not valid JSON.");
  }
  return normalizeV2ProjectDocument(candidate);
}

export function serializeV2ProjectDocument(document) {
  return `${JSON.stringify(normalizeV2ProjectDocument(document), null, 2)}\n`;
}
