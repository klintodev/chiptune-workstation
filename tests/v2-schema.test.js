import assert from "node:assert/strict";
import test from "node:test";

import {
  KLINTO_CHIP_CONTRACT,
  PROJECT_SCHEMA_VERSION,
  canonicalizeV2Project,
  createDefaultV2Project,
  migrateProjectToV7,
  normalizeV2Project,
  validateV2Project,
} from "../src/v2/domain/schema.js";

function legacyProject(schemaVersion = 6) {
  return {
    schemaVersion,
    metadata: { title: "  Preserved title  " },
    transport: {
      bpm: 137.5,
      masterVolume: 0.42,
      loop: { enabled: true, mode: "arrangement", startStep: 1, endStep: 31 },
    },
    patterns: [{
      id: "legacy pattern!",
      name: " Lead ",
      rootOctave: 6,
      steps: [
        { note: 60, gate: 0.25, volume: 0.2 },
        null,
        { note: 64, gate: 0.75, volume: 0 },
        null,
      ],
    }],
    tracks: [{
      id: "track-1",
      name: "Lead",
      instrument: {
        voiceType: "sawtooth",
        octaveOffset: -1,
        attackSeconds: 0.1,
        releaseSeconds: 0.2,
        volume: 0.6,
      },
      mixer: { volume: 0.8, pan: -0.25, muted: false, solo: true },
      clips: [{ id: "bad clip!", patternId: "legacy pattern!", startStep: 3 }],
    }],
    visualiser: undefined,
    scaleGuide: { tonic: 0 },
  };
}

test("the default is the exact, deeply frozen canonical schema-7 Project", () => {
  const project = createDefaultV2Project();

  assert.equal(project.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(project), ["schemaVersion", "metadata", "transport", "patterns", "tracks", "mixer"]);
  assert.deepEqual(project.transport, {
    bpm: 120,
    loop: { enabled: false, mode: "custom", startTick: 0, endTick: 384 },
  });
  assert.deepEqual(project.patterns, [{ id: "pattern-1", name: "Pattern 1", lengthTicks: 1, notes: [] }]);
  assert.deepEqual(project.tracks[0].instrument.params, KLINTO_CHIP_CONTRACT.defaults);
  assert.deepEqual(project.mixer, { master: { volume: 0.35, effects: [] } });
  assert.equal(Object.isFrozen(project.tracks[0].instrument.params), true);
  assert.equal(validateV2Project(project), true);
});

test("strict validation rejects unknown keys, unresolved links, device state, bounds and collisions", () => {
  const valid = structuredClone(createDefaultV2Project());

  assert.throws(() => canonicalizeV2Project({ ...valid, visualiser: {} }), /invalid keys/);
  assert.throws(() => canonicalizeV2Project({
    ...valid,
    tracks: [{ ...valid.tracks[0], clips: [{ id: "clip-1", patternId: "missing", startTick: 0 }] }],
  }), /unknown Pattern/);
  assert.throws(() => canonicalizeV2Project({
    ...valid,
    tracks: [{
      ...valid.tracks[0],
      instrument: { ...valid.tracks[0].instrument, params: { ...valid.tracks[0].instrument.params, hidden: 1 } },
    }],
  }), /unknown hidden/);
  assert.throws(() => canonicalizeV2Project({
    ...valid,
    mixer: { master: { ...valid.mixer.master, effects: [{
      instanceId: valid.tracks[0].instrument.instanceId,
      type: "klinto-filter",
      version: 1,
      bypassed: false,
      params: { cutoffHz: 12_000, q: 0.7 },
    }] } },
  }), /duplicated/);
  assert.throws(() => canonicalizeV2Project({
    ...valid,
    patterns: [{ ...valid.patterns[0], lengthTicks: 0 }],
  }), /between 1 and 3072/);
  assert.equal(canonicalizeV2Project({
    ...valid,
    patterns: [{ ...valid.patterns[0], lengthTicks: 100 }],
  }).patterns[0].lengthTicks, 1);
});

test("canonicalization sorts notes and clips while retaining Pattern, Track and Effect-chain order", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [
    { id: "note-z", pitch: 60, startTick: 36, durationTicks: 24, velocity: 1 },
    { id: "note-b", pitch: 64, startTick: 24, durationTicks: 12, velocity: 1 },
    { id: "note-a", pitch: 64, startTick: 12, durationTicks: 12, velocity: 1 },
    { id: "note-c", pitch: 60, startTick: 0, durationTicks: 12, velocity: 1 },
  ];
  project.tracks[0].clips = [
    { id: "clip-z", patternId: "pattern-1", startTick: 768 },
    { id: "clip-b", patternId: "pattern-1", startTick: 384 },
    { id: "clip-a", patternId: "pattern-1", startTick: 0 },
  ];

  const normalized = canonicalizeV2Project(project);

  assert.deepEqual(normalized.patterns[0].notes.map(({ id }) => id), ["note-c", "note-a", "note-b", "note-z"]);
  assert.deepEqual(normalized.tracks[0].clips.map(({ id }) => id), ["clip-a", "clip-b", "clip-z"]);
});

test("notes may form chords and touch at the same pitch, but same-pitch intersections are rejected", () => {
  const valid = structuredClone(createDefaultV2Project());
  valid.patterns[0].notes = [
    { id: "note-a", pitch: 60, startTick: 0, durationTicks: 24, velocity: 0 },
    { id: "note-b", pitch: 64, startTick: 0, durationTicks: 48, velocity: 1 },
    { id: "note-c", pitch: 67, startTick: 12, durationTicks: 12, velocity: 1 },
    { id: "note-d", pitch: 60, startTick: 24, durationTicks: 24, velocity: 1 },
  ];

  const normalized = canonicalizeV2Project(valid);
  assert.deepEqual(
    normalized.patterns[0].notes.map(({ id }) => id),
    ["note-a", "note-b", "note-c", "note-d"],
  );

  const conflicts = [
    {
      noteIds: ["note-a", "note-b"],
      notes: [
        { id: "note-a", pitch: 60, startTick: 0, durationTicks: 24, velocity: 1 },
        { id: "note-b", pitch: 60, startTick: 0, durationTicks: 12, velocity: 1 },
      ],
    },
    {
      noteIds: ["note-a", "note-b"],
      notes: [
        { id: "note-a", pitch: 60, startTick: 0, durationTicks: 24, velocity: 1 },
        { id: "note-b", pitch: 60, startTick: 12, durationTicks: 24, velocity: 1 },
      ],
    },
    {
      noteIds: ["note-a", "note-b"],
      notes: [
        { id: "note-a", pitch: 60, startTick: 0, durationTicks: 48, velocity: 1 },
        { id: "note-b", pitch: 60, startTick: 12, durationTicks: 12, velocity: 0 },
      ],
    },
    {
      noteIds: ["note-a", "note-c"],
      notes: [
        { id: "note-a", pitch: 60, startTick: 0, durationTicks: 48, velocity: 1 },
        { id: "note-b", pitch: 64, startTick: 12, durationTicks: 1, velocity: 1 },
        { id: "note-c", pitch: 60, startTick: 24, durationTicks: 12, velocity: 1 },
      ],
    },
  ];
  for (const { noteIds, notes } of conflicts) {
    const candidate = structuredClone(createDefaultV2Project());
    candidate.patterns[0].notes = notes;
    assert.throws(() => canonicalizeV2Project(candidate), (error) => {
      assert.equal(error.code, "PATTERN_NOTE_OVERLAP");
      assert.deepEqual(error.details, {
        noteIds,
        patternId: "pattern-1",
      });
      return true;
    });
  }
});

test("schemas 2 through 6 migrate with exact ticks, parameters, ordering and deterministic ID repair", () => {
  for (let schemaVersion = 2; schemaVersion <= 6; schemaVersion += 1) {
    const source = legacyProject(schemaVersion);
    if (schemaVersion === 2) delete source.patterns[0].rootOctave;
    if (schemaVersion <= 4) delete source.tracks[0].mixer.pan;
    const before = structuredClone(source);
    const migrated = migrateProjectToV7(source);

    assert.deepEqual(source, before);
    assert.equal(migrated.schemaVersion, 7);
    assert.equal(migrated.metadata.title, "  Preserved title  ");
    assert.equal(migrated.transport.loop.startTick, 24);
    assert.equal(migrated.transport.loop.endTick, 744);
    assert.equal(migrated.transport.loop.mode, "arrangement");
    assert.equal(migrated.patterns[0].lengthTicks, 66);
    assert.deepEqual(migrated.patterns[0].notes.map(({ startTick, durationTicks, velocity }) => ({
      startTick,
      durationTicks,
      velocity,
    })), [
      { startTick: 0, durationTicks: 6, velocity: 0.2 },
      { startTick: 48, durationTicks: 18, velocity: 0 },
    ]);
    assert.equal(migrated.tracks[0].clips[0].startTick, 72);
    assert.equal(migrated.tracks[0].clips[0].patternId, migrated.patterns[0].id);
    assert.equal(migrated.tracks[0].instrument.params.waveform, "saw");
    assert.equal(migrated.tracks[0].mixer.pan, schemaVersion <= 4 ? 0 : -0.25);
    assert.equal(migrated.mixer.master.volume, 0.42);
    assert.equal("rootOctave" in migrated.patterns[0], false);
    assert.equal("visualiser" in migrated, false);
    assert.deepEqual(normalizeV2Project(migrated), migrated);
    assert.deepEqual(migrateProjectToV7(source), migrated);
  }
});

test("schema 1 follows the production Pattern-library migration before V7 conversion", () => {
  const source = {
    schemaVersion: 1,
    metadata: { title: "Legacy tune" },
    transport: { bpm: 120 },
    tracks: [{
      id: "track-1",
      name: "Pulse 1",
      instrument: {
        voiceType: "square",
        octaveOffset: 0,
        attackSeconds: 0.008,
        releaseSeconds: 0.03,
        volume: 0.35,
      },
      mixer: { volume: 1, muted: false, solo: false },
      pattern: { steps: [{ note: 60, gate: 0.75, volume: 0.7 }, null, null, null] },
    }],
  };

  const migrated = migrateProjectToV7(source);

  assert.equal(migrated.patterns[0].id, "pattern-1");
  assert.equal(migrated.patterns[0].notes[0].durationTicks, 18);
  assert.deepEqual(migrated.tracks[0].clips, [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }]);
  assert.deepEqual(migrated.transport.loop, { enabled: false, mode: "custom", startTick: 0, endTick: 384 });
});

test("legacy full-gate repeats migrate as valid touching same-pitch notes", () => {
  const source = legacyProject(6);
  source.patterns[0].steps = [
    { note: 60, gate: 1, volume: 0.7 },
    { note: 60, gate: 1, volume: 0.7 },
    null,
    null,
  ];

  const migrated = migrateProjectToV7(source);

  assert.deepEqual(
    migrated.patterns[0].notes.map(({ pitch, startTick, durationTicks }) => ({
      durationTicks,
      pitch,
      startTick,
    })),
    [
      { durationTicks: 24, pitch: 60, startTick: 0 },
      { durationTicks: 24, pitch: 60, startTick: 24 },
    ],
  );
});
