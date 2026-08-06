import assert from "node:assert/strict";
import test from "node:test";

import { createSongOccurrences } from "../src/v2/domain/occurrence-projection.js";
import {
  createDefaultV2Project,
  migrateProjectToV7,
  normalizeV2Project,
} from "../src/v2/domain/schema.js";
import {
  createDefaultProject as createDefaultV1Project,
  migrateProject as migrateV1Project,
} from "../src/state/project-state.js";

const WAVEFORMS = Object.freeze([
  ["pulse12", "pulse12"],
  ["pulse25", "pulse25"],
  ["square", "square"],
  ["triangle", "triangle"],
  ["sawtooth", "saw"],
  ["noise", "noise"],
]);

function createBoundaryLegacyProject() {
  const project = structuredClone(createDefaultV1Project());
  const lengths = [4, 8, 16, 32];
  const starts = [0, 4, 12, 28];
  project.metadata.title = "  Migration boundary fixture  ";
  project.transport = {
    bpm: 40,
    masterVolume: 1,
    loop: { enabled: true, mode: "arrangement", startStep: 0, endStep: 256 },
  };
  project.patterns = lengths.map((length, index) => {
    const steps = Array.from({ length }, () => null);
    steps[0] = { note: 36, gate: 0.25, volume: 0 };
    steps[length - 1] = { note: 112, gate: 1, volume: 1 };
    return {
      id: `pattern-${index + 1}`,
      name: `Pattern ${index + 1}`,
      rootOctave: index % 2 === 0 ? 2 : 6,
      steps,
    };
  });
  project.tracks = WAVEFORMS.map(([voiceType], index) => ({
    id: `track-${index + 1}`,
    name: `Track ${index + 1}`,
    instrument: {
      voiceType,
      octaveOffset: index % 2 === 0 ? -2 : 2,
      attackSeconds: index % 2 === 0 ? 0.001 : 2,
      releaseSeconds: index % 2 === 0 ? 0.01 : 3,
      volume: index % 2 === 0 ? 0 : 1,
    },
    mixer: {
      volume: index % 2 === 0 ? 0 : 1,
      pan: index % 2 === 0 ? -1 : 1,
      muted: index === 1,
      solo: index === 2,
    },
    clips: index === 0
      ? project.patterns.map((pattern, patternIndex) => ({
          id: `clip-${patternIndex + 1}`,
          patternId: pattern.id,
          startStep: starts[patternIndex],
        }))
      : [],
  }));
  return project;
}

test("the V7 boundary consumes the shipped schema-1-through-6 migration chain", () => {
  const schemaSix = createBoundaryLegacyProject();
  for (let schemaVersion = 2; schemaVersion <= 6; schemaVersion += 1) {
    const source = structuredClone(schemaSix);
    source.schemaVersion = schemaVersion;
    if (schemaVersion === 2) {
      delete source.visualiser;
      for (const pattern of source.patterns) delete pattern.rootOctave;
    }
    if (schemaVersion <= 4) {
      for (const track of source.tracks) delete track.mixer.pan;
    }
    const before = structuredClone(source);
    const productionV6 = migrateV1Project(source);
    const expected = migrateProjectToV7(productionV6);
    const migrated = migrateProjectToV7(source);

    assert.deepEqual(source, before, `schema ${schemaVersion} source was mutated`);
    assert.deepEqual(migrated, expected, `schema ${schemaVersion} bypassed production migration`);
    assert.deepEqual(normalizeV2Project(migrated), migrated);
  }

  const schemaOne = {
    schemaVersion: 1,
    metadata: { title: "Schema one" },
    transport: { bpm: 240 },
    tracks: [{
      id: "track-1",
      name: "Pulse 1",
      instrument: {
        voiceType: "pulse25",
        octaveOffset: 2,
        attackSeconds: 2,
        releaseSeconds: 3,
        volume: 1,
      },
      mixer: { volume: 1, muted: false, solo: false },
      pattern: {
        steps: [
          { note: 36, gate: 0.25, volume: 0 },
          null,
          null,
          { note: 112, gate: 1, volume: 1 },
        ],
      },
    }],
  };
  const before = structuredClone(schemaOne);
  assert.deepEqual(
    migrateProjectToV7(schemaOne),
    migrateProjectToV7(migrateV1Project(schemaOne)),
  );
  assert.deepEqual(schemaOne, before);
});

test("migration pins every legacy Pattern length, waveform and scalar boundary", () => {
  const migrated = migrateProjectToV7(createBoundaryLegacyProject());

  assert.deepEqual(migrated.patterns.map(({ lengthTicks }) => lengthTicks), [96, 192, 384, 768]);
  for (const [index, pattern] of migrated.patterns.entries()) {
    assert.deepEqual(pattern.notes.map(({ pitch, startTick, durationTicks, velocity }) => ({
      pitch,
      startTick,
      durationTicks,
      velocity,
    })), [
      { pitch: 36, startTick: 0, durationTicks: 6, velocity: 0 },
      { pitch: 112, startTick: pattern.lengthTicks - 24, durationTicks: 24, velocity: 1 },
    ], `Pattern ${index + 1}`);
  }
  assert.deepEqual(
    migrated.tracks.map(({ instrument }) => instrument.params.waveform),
    WAVEFORMS.map(([, waveform]) => waveform),
  );
  assert.deepEqual(migrated.tracks.map(({ instrument }) => instrument.params.octave), [-2, 2, -2, 2, -2, 2]);
  assert.deepEqual(migrated.tracks.map(({ mixer }) => mixer.pan), [-1, 1, -1, 1, -1, 1]);
  assert.equal(migrated.transport.loop.endTick, 6_144);
  assert.equal(migrated.mixer.master.volume, 1);
  assert.equal(migrated.patterns.reduce((count, pattern) => count + pattern.notes.length, 0), 8);
  assert.equal(createSongOccurrences(migrated).length, 4, "zero-velocity notes do not schedule voices");
});

test("canonical V7 validation accepts the exact maximum note and clip counts", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns = Array.from({ length: 64 }, (_, patternIndex) => ({
    id: `pattern-${patternIndex + 1}`,
    name: `Pattern ${patternIndex + 1}`,
    lengthTicks: patternIndex < 8 ? 3_072 : 96,
    notes: patternIndex < 8
      ? Array.from({ length: 1_024 }, (_, noteIndex) => ({
          id: `note-${noteIndex + 1}`,
          pitch: 36 + (noteIndex % 77),
          startTick: noteIndex % 3_072,
          durationTicks: 1,
          velocity: noteIndex % 2,
        }))
      : [],
  }));
  project.tracks = Array.from({ length: 8 }, (_, trackIndex) => {
    const track = structuredClone(project.tracks[0]);
    track.id = `track-${trackIndex + 1}`;
    track.name = `Track ${trackIndex + 1}`;
    track.instrument.instanceId = `instrument-${trackIndex + 1}`;
    track.clips = Array.from({ length: 64 }, (_, clipIndex) => ({
      id: `clip-${trackIndex + 1}-${clipIndex + 1}`,
      patternId: "pattern-64",
      startTick: clipIndex * 96,
    }));
    return track;
  });

  const normalized = normalizeV2Project(project);
  assert.equal(normalized.patterns.reduce((count, pattern) => count + pattern.notes.length, 0), 8_192);
  assert.equal(normalized.tracks.reduce((count, track) => count + track.clips.length, 0), 512);
  assert.equal(normalized.tracks.at(-1).clips.at(-1).startTick, 6_048);
});
