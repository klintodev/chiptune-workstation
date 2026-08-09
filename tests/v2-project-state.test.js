import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PATTERN_CONTENT_TICKS,
  MAX_PROJECT_TRACKS,
  V2DomainError,
  createV2ProjectState,
} from "../src/v2/domain/index.js";

function makeAudible(state, patternId = "pattern-1", pitch = 60, startTick = 0, durationTicks = 24) {
  return state.addNote(patternId, { pitch, startTick, durationTicks, velocity: 0.7 });
}

function patternNote(id, pitch, startTick, durationTicks, velocity = 0.7) {
  return { id, pitch, startTick, durationTicks, velocity };
}

function createProjectWithNotes(notes) {
  const project = createV2ProjectState();
  project.addNotes("pattern-1", notes);
  return project;
}

function assertOverlapRejectedAtomically(project, action, { noteIds }) {
  const beforeState = project.getState();
  const beforeHistory = project.getHistoryState();
  let changes = 0;
  const handleChange = () => { changes += 1; };
  project.addEventListener("change", handleChange);
  try {
    assert.throws(action, (error) => {
      assert.equal(error instanceof V2DomainError, true);
      assert.equal(error.code, "PATTERN_NOTE_OVERLAP");
      assert.deepEqual(error.details, {
        noteIds,
        patternId: "pattern-1",
      });
      return true;
    });
  } finally {
    project.removeEventListener("change", handleChange);
  }
  assert.equal(project.getState(), beforeState);
  assert.deepEqual(project.getHistoryState(), beforeHistory);
  assert.equal(changes, 0);
}

test("note commands are immutable, atomic, canonically ordered and history-backed", () => {
  const project = createV2ProjectState();
  const original = project.getState();
  const high = project.addNote("pattern-1", { pitch: 67, startTick: 24, durationTicks: 24, velocity: 0.8 });
  const low = project.addNote("pattern-1", { pitch: 60, startTick: 0, durationTicks: 18, velocity: 0.6 });

  assert.equal(Object.isFrozen(project.getState()), true);
  assert.notEqual(project.getState(), original);
  assert.deepEqual(project.getPattern().notes.map(({ id }) => id), [low, high]);
  assert.throws(() => project.updateNote("pattern-1", low, { pitch: 113 }), RangeError);
  assert.equal(project.getPattern().notes.find(({ id }) => id === low).pitch, 60);

  const copies = project.duplicateNotes("pattern-1", [low, high], { deltaTicks: 48, deltaPitch: 1 });
  assert.equal(copies.length, 2);
  assert.equal(project.getPattern().notes.length, 4);
  project.removeNotes("pattern-1", copies);
  project.undo();
  assert.equal(project.getPattern().notes.length, 4);
  project.redo();
  assert.equal(project.getPattern().notes.length, 2);
});

test("addNotes accepts touching notes at different pitches as one undoable commit", () => {
  const project = createV2ProjectState();
  const before = project.getState();
  const changes = [];
  project.addEventListener("change", (event) => changes.push(event.detail));

  const noteIds = project.addNotes("pattern-1", [
    patternNote("note-touch-left", 60, 0, 24),
    patternNote("note-touch-middle", 64, 24, 24),
    patternNote("note-touch-right", 60, 48, 12),
  ]);

  assert.deepEqual(noteIds, ["note-touch-left", "note-touch-middle", "note-touch-right"]);
  assert.equal(Object.isFrozen(noteIds), true);
  assert.deepEqual(project.getPattern().notes.map(({ id }) => id), [
    "note-touch-left",
    "note-touch-middle",
    "note-touch-right",
  ]);
  assert.equal(project.getPattern().lengthTicks, 60);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].operation, "add-notes");
  assert.deepEqual(changes[0].noteIds, noteIds);
  assert.deepEqual(project.getHistoryState(), { canRedo: false, canUndo: true });

  const committed = project.getState();
  assert.equal(project.undo(), true);
  assert.deepEqual(project.getState(), before);
  assert.deepEqual(project.getHistoryState(), { canRedo: true, canUndo: false });
  assert.equal(project.undo(), false, "the complete batch should occupy one undo step");
  assert.equal(project.redo(), true);
  assert.deepEqual(project.getState(), committed);
  assert.deepEqual(changes.map(({ operation }) => operation), ["add-notes", "undo", "redo"]);
});

test("addNote and addNotes reject overlap at different pitches without partial changes", () => {
  const project = createProjectWithNotes([
    patternNote("note-anchor", 60, 0, 24),
  ]);

  assertOverlapRejectedAtomically(
    project,
    () => project.addNote("pattern-1", patternNote("note-add-overlap", 67, 23, 12)),
    { noteIds: ["note-anchor", "note-add-overlap"] },
  );

  const emptyProject = createV2ProjectState();
  assertOverlapRejectedAtomically(
    emptyProject,
    () => emptyProject.addNotes("pattern-1", [
      patternNote("note-valid-prefix", 67, 48, 24),
      patternNote("note-batch-left", 60, 0, 24),
      patternNote("note-batch-overlap", 72, 12, 12),
    ]),
    { noteIds: ["note-batch-left", "note-batch-overlap"] },
  );
  assert.deepEqual(emptyProject.getPattern().notes, [], "no valid batch prefix may be committed");
});

test("note overlap validation wins before linked-clip growth conflicts", () => {
  const project = createProjectWithNotes([
    patternNote("note-anchor", 60, 0, 24),
  ]);
  const blockerPatternId = project.createPattern("Blocker");
  project.addNote(blockerPatternId, patternNote("note-blocker", 72, 0, 24));
  project.addClip("track-1", "pattern-1", 0);
  project.addClip("track-1", blockerPatternId, 48);

  assertOverlapRejectedAtomically(
    project,
    () => project.addNote("pattern-1", patternNote("note-overlap-and-growth", 67, 12, 48)),
    { noteIds: ["note-anchor", "note-overlap-and-growth"] },
  );
});

test("start and duration updates reject Pattern-wide overlap with deterministic details", () => {
  const project = createProjectWithNotes([
    patternNote("note-left", 60, 0, 24),
    patternNote("note-middle", 61, 24, 24),
    patternNote("note-right", 60, 48, 24),
  ]);

  assertOverlapRejectedAtomically(
    project,
    () => project.updateNote("pattern-1", "note-right", { startTick: 47 }),
    { noteIds: ["note-middle", "note-right"] },
  );
  assertOverlapRejectedAtomically(
    project,
    () => project.updateNote("pattern-1", "note-left", { durationTicks: 25 }),
    { noteIds: ["note-left", "note-middle"] },
  );
});

test("generic multi-note updates reject the complete batch when one transformed note overlaps", () => {
  const project = createProjectWithNotes([
    patternNote("note-anchor", 60, 0, 24),
    patternNote("note-batch-a", 62, 48, 12),
    patternNote("note-batch-b", 64, 72, 12),
  ]);

  assertOverlapRejectedAtomically(
    project,
    () => project.updatePattern("pattern-1", (pattern) => ({
      ...pattern,
      notes: pattern.notes.map((note) => {
        if (note.id === "note-batch-a") return { ...note, startTick: 12 };
        if (note.id === "note-batch-b") return { ...note, startTick: 96 };
        return note;
      }),
    }), { operation: "update-notes" }),
    { noteIds: ["note-anchor", "note-batch-a"] },
  );
});

test("duplicateNotes rejects an overlapping copy without consuming history or emitting changes", () => {
  const project = createProjectWithNotes([
    patternNote("note-source", 60, 0, 24),
  ]);

  assertOverlapRejectedAtomically(
    project,
    () => project.duplicateNotes("pattern-1", ["note-source"], { deltaPitch: 7, deltaTicks: 12 }),
    { noteIds: ["note-source", "note-1"] },
  );
  assert.deepEqual(project.getPattern().notes.map(({ id }) => id), ["note-source"]);
});

test("Pattern rename trims once, preserves musical content, and is undoable", () => {
  const project = createV2ProjectState();
  makeAudible(project, "pattern-1", 64, 48, 36);
  project.addClip("track-1", "pattern-1", 0);
  const originalPattern = project.getPattern("pattern-1");
  const originalClips = project.getTrack("track-1").clips;
  const changes = [];
  project.addEventListener("change", (event) => changes.push(event.detail));

  assert.equal(project.renamePattern("pattern-1", "  Lead Arp  "), true);
  const renamedPattern = project.getPattern("pattern-1");
  assert.equal(renamedPattern.name, "Lead Arp");
  assert.equal(renamedPattern.id, originalPattern.id);
  assert.equal(renamedPattern.lengthTicks, originalPattern.lengthTicks);
  assert.deepEqual(renamedPattern.notes, originalPattern.notes);
  assert.deepEqual(project.getTrack("track-1").clips, originalClips);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].operation, "rename-pattern");
  assert.equal(changes[0].patternId, "pattern-1");

  const renamed = project.getState();
  assert.equal(project.renamePattern("pattern-1", "Lead Arp"), false);
  assert.equal(project.getState(), renamed);
  assert.equal(changes.length, 1);
  assert.throws(() => project.renamePattern("pattern-1", "   "), TypeError);
  assert.throws(() => project.renamePattern("pattern-1", "x".repeat(33)), TypeError);
  assert.throws(() => project.renamePattern("missing-pattern", "Bass"), RangeError);
  assert.equal(project.getState(), renamed);
  assert.equal(changes.length, 1);

  assert.equal(project.undo(), true);
  assert.equal(project.getPattern("pattern-1").name, "Pattern 1");
  assert.equal(project.getPattern("pattern-1").lengthTicks, originalPattern.lengthTicks);
  assert.deepEqual(project.getPattern("pattern-1").notes, originalPattern.notes);
  assert.deepEqual(project.getTrack("track-1").clips, originalClips);
  assert.equal(project.redo(), true);
  assert.equal(project.getPattern("pattern-1").name, "Lead Arp");
  assert.deepEqual(project.getPattern("pattern-1").notes, originalPattern.notes);
  assert.deepEqual(project.getTrack("track-1").clips, originalClips);
});

test("Track rename is the undoable owner name for its Instrument and Mixer channel", () => {
  const project = createV2ProjectState();
  const original = project.getState();
  const originalInstrument = original.tracks[0].instrument;
  const changes = [];
  project.addEventListener("change", (event) => changes.push(event.detail));

  assert.equal(project.renameTrack("track-1", "  Lead Chip  "), true);
  assert.equal(project.getTrack("track-1").name, "Lead Chip");
  assert.deepEqual(project.getTrack("track-1").instrument, originalInstrument);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].operation, "rename-track");
  assert.equal(changes[0].trackId, "track-1");

  const renamed = project.getState();
  assert.equal(project.renameTrack("track-1", "Lead Chip"), false);
  assert.equal(project.getState(), renamed);
  assert.equal(changes.length, 1);
  assert.throws(() => project.renameTrack("track-1", "   "), TypeError);
  assert.throws(() => project.renameTrack("track-1", "x".repeat(33)), TypeError);
  assert.throws(() => project.renameTrack("missing-track", "Bass"), RangeError);
  assert.equal(project.getState(), renamed);
  assert.equal(changes.length, 1);

  assert.equal(project.undo(), true);
  assert.equal(project.getTrack("track-1").name, "Pulse 1");
  assert.deepEqual(project.getTrack("track-1").instrument, originalInstrument);
  assert.equal(project.redo(), true);
  assert.equal(project.getTrack("track-1").name, "Lead Chip");
});

test("duplicateInstrument creates an adjacent independent Instrument Track as one undoable command", () => {
  const setup = createV2ProjectState();
  setup.setInstrumentParam("track-1", "waveform", "triangle");
  setup.setInstrumentParam("track-1", "octave", -1);
  setup.setInstrumentParam("track-1", "attackSeconds", 0.25);
  setup.setInstrumentParam("track-1", "releaseSeconds", 1.5);
  setup.setInstrumentParam("track-1", "level", 0.8);
  setup.setTrackMixer("track-1", { muted: true, pan: -0.4, solo: true, volume: 0.45 });
  setup.addEffect("track-1", "klinto-filter");
  makeAudible(setup);
  setup.addClip("track-1", "pattern-1", 0);
  const trailingTrackId = setup.addTrack("Trailing");

  const project = createV2ProjectState(setup.getState());
  const before = project.getState();
  const source = project.getTrack("track-1");
  const changes = [];
  project.addEventListener("change", (event) => changes.push(event.detail));

  const duplicateId = project.duplicateInstrument("track-1");
  const duplicate = project.getTrack(duplicateId);

  assert.deepEqual(project.getState().tracks.map(({ id }) => id), [
    "track-1",
    duplicateId,
    trailingTrackId,
  ]);
  assert.equal(duplicate.name, "Pulse 1 copy");
  assert.equal(duplicate.instrument.type, source.instrument.type);
  assert.equal(duplicate.instrument.version, source.instrument.version);
  assert.deepEqual(duplicate.instrument.params, source.instrument.params);
  assert.notEqual(duplicate.instrument.params, source.instrument.params);
  assert.notEqual(duplicate.instrument.instanceId, source.instrument.instanceId);
  assert.equal(
    new Set(project.getState().tracks.map(({ instrument }) => instrument.instanceId)).size,
    project.getState().tracks.length,
  );
  assert.deepEqual(duplicate.mixer, {
    volume: 1,
    pan: 0,
    muted: false,
    solo: false,
    effects: [],
  });
  assert.deepEqual(duplicate.clips, []);
  assert.deepEqual(project.getTrack("track-1"), source, "the source Track must remain unchanged");
  assert.deepEqual(changes.map(({ operation, sourceTrackId, trackId }) => ({
    operation,
    sourceTrackId,
    trackId,
  })), [{
    operation: "duplicate-instrument",
    sourceTrackId: "track-1",
    trackId: duplicateId,
  }]);
  assert.deepEqual(project.getHistoryState(), { canRedo: false, canUndo: true });

  const duplicated = project.getState();
  assert.equal(project.undo(), true);
  assert.deepEqual(project.getState(), before);
  assert.equal(project.undo(), false, "duplication must consume exactly one undo entry");
  assert.equal(project.redo(), true);
  assert.deepEqual(project.getState(), duplicated);
  assert.deepEqual(project.getTrack(duplicateId), duplicate);
});

test("duplicateInstrument derives bounded repeated copy names and accepts an explicit name", () => {
  const setup = createV2ProjectState();
  setup.renameTrack("track-1", "A".repeat(32));
  const project = createV2ProjectState(setup.getState());

  const firstId = project.duplicateInstrument("track-1");
  const secondId = project.duplicateInstrument("track-1");
  const namedId = project.duplicateInstrument("track-1", "Lead Chip");

  assert.equal(project.getTrack(firstId).name, `${"A".repeat(27)} copy`);
  assert.equal(project.getTrack(secondId).name, `${"A".repeat(25)} copy 2`);
  assert.equal(project.getTrack(namedId).name, "Lead Chip");
  assert.deepEqual(project.getState().tracks.map(({ id }) => id), [
    "track-1",
    namedId,
    secondId,
    firstId,
  ]);
  assert.equal(new Set(project.getState().tracks.map(({ name }) => name)).size, 4);
  assert.ok(project.getState().tracks.every(({ name }) => name.length <= 32));
});

test("duplicateInstrument rejects unknown sources and the Track cap atomically", () => {
  const project = createV2ProjectState();
  const beforeUnknown = project.getState();
  const beforeUnknownHistory = project.getHistoryState();
  let unknownChanges = 0;
  project.addEventListener("change", () => { unknownChanges += 1; });

  assert.throws(() => project.duplicateInstrument("missing-track"), /Unknown Track/);
  assert.equal(project.getState(), beforeUnknown);
  assert.deepEqual(project.getHistoryState(), beforeUnknownHistory);
  assert.equal(unknownChanges, 0);

  const setup = createV2ProjectState();
  while (setup.getState().tracks.length < MAX_PROJECT_TRACKS) setup.addTrack();
  const capped = createV2ProjectState(setup.getState());
  const beforeCap = capped.getState();
  const beforeCapHistory = capped.getHistoryState();
  let cappedChanges = 0;
  capped.addEventListener("change", () => { cappedChanges += 1; });

  assert.throws(
    () => capped.duplicateInstrument("track-1"),
    new RegExp(`at most ${MAX_PROJECT_TRACKS} Tracks`),
  );
  assert.equal(capped.getState(), beforeCap);
  assert.deepEqual(capped.getHistoryState(), beforeCapHistory);
  assert.equal(cappedChanges, 0);
});

test("multi-note duplicate-right and delete preserve the complete block as atomic history", () => {
  const project = createV2ProjectState();
  const first = project.addNote("pattern-1", {
    pitch: 60,
    startTick: 0,
    durationTicks: 18,
    velocity: 0.6,
  });
  const second = project.addNote("pattern-1", {
    pitch: 67,
    startTick: 72,
    durationTicks: 30,
    velocity: 0.8,
  });
  const beforeDuplicate = project.getState();
  let changes = 0;
  project.addEventListener("change", () => { changes += 1; });

  const copies = project.duplicateNotes("pattern-1", [first, second], { deltaTicks: 102 });
  assert.equal(changes, 1);
  assert.equal(new Set(copies).size, 2);
  assert.deepEqual(copies.map((id) => {
    const note = project.getPattern().notes.find((candidate) => candidate.id === id);
    return {
      durationTicks: note.durationTicks,
      pitch: note.pitch,
      startTick: note.startTick,
      velocity: note.velocity,
    };
  }), [
    { durationTicks: 18, pitch: 60, startTick: 102, velocity: 0.6 },
    { durationTicks: 30, pitch: 67, startTick: 174, velocity: 0.8 },
  ]);

  project.undo();
  assert.deepEqual(project.getState(), beforeDuplicate);
  project.redo();
  assert.deepEqual(
    copies.map((id) => project.getPattern().notes.find((note) => note.id === id)?.startTick),
    [102, 174],
  );

  changes = 0;
  project.removeNotes("pattern-1", copies);
  assert.equal(changes, 1);
  assert.equal(project.getPattern().notes.length, 2);
  project.undo();
  assert.equal(project.getPattern().notes.length, 4);
});

test("multi-note duplication rejects out-of-range copies without a partial mutation", () => {
  const project = createV2ProjectState();
  const first = project.addNote("pattern-1", {
    pitch: 60,
    startTick: MAX_PATTERN_CONTENT_TICKS - 48,
    durationTicks: 24,
    velocity: 0.7,
  });
  const second = project.addNote("pattern-1", {
    pitch: 64,
    startTick: MAX_PATTERN_CONTENT_TICKS - 24,
    durationTicks: 24,
    velocity: 0.7,
  });
  const before = project.getState();
  let changes = 0;
  project.addEventListener("change", () => { changes += 1; });

  assert.throws(
    () => project.duplicateNotes("pattern-1", [first, second], { deltaTicks: 48 }),
    RangeError,
  );
  assert.equal(project.getState(), before);
  assert.equal(changes, 0);
});

test("Pattern span grows and shrinks with note content while preflighting every linked clip", () => {
  const project = createV2ProjectState();
  const crossing = project.addNote("pattern-1", {
    pitch: 60,
    startTick: 180,
    durationTicks: 120,
    velocity: 1,
  });
  const removed = project.addNote("pattern-1", {
    pitch: 64,
    startTick: 300,
    durationTicks: 24,
    velocity: 1,
  });
  project.addClip("track-1", "pattern-1", 0);
  project.addClip("track-1", "pattern-1", 384);
  assert.equal(project.getPattern().lengthTicks, 324);
  const beforeConflict = project.getState();

  assert.throws(() => project.updateNote("pattern-1", removed, { startTick: 372 }), (error) => {
    assert.equal(error.code, "PATTERN_CONTENT_CLIP_CONFLICT");
    return true;
  });
  assert.equal(project.getState(), beforeConflict);

  project.removeNotes("pattern-1", [removed]);
  assert.equal(project.getPattern().lengthTicks, 300);
  project.updateNote("pattern-1", crossing, { durationTicks: 12 });
  assert.equal(project.getPattern().lengthTicks, 192);
  assert.equal(project.getPattern().notes.length, 1);
  assert.equal(project.getPattern().notes[0].durationTicks, 12);
  project.undo();
  assert.equal(project.getPattern().lengthTicks, 300);
  project.undo();
  assert.equal(project.getPattern().lengthTicks, 324);
  assert.equal(project.getPattern().notes.length, 2);
});

test("Add to Playlist scans forward, then clip move/duplicate/delete remain atomic and undoable", () => {
  const project = createV2ProjectState();
  makeAudible(project);
  const secondPatternId = project.duplicatePattern("pattern-1");

  const first = project.addPatternToPlaylist("pattern-1", "track-1", 0);
  const second = project.addPatternToPlaylist(secondPatternId, "track-1", 0);
  assert.equal(first.startTick, 0);
  assert.equal(second.startTick, 24);
  assert.equal(second.playlistCursorTick, 48);

  const duplicateId = project.duplicateClip(second.clipId);
  assert.equal(project.getClip(duplicateId).clip.startTick, 48);
  const track2 = project.addTrack("Bass");
  project.moveClip(duplicateId, track2, 24);
  assert.equal(project.getClip(duplicateId).track.id, track2);
  assert.throws(() => project.moveClip(second.clipId, "track-1", 12), V2DomainError);
  assert.equal(project.getClip(second.clipId).clip.startTick, 24);
  project.removeClip(duplicateId);
  project.undo();
  assert.equal(project.getClip(duplicateId).track.id, track2);
});

test("multi-clip move and duplicate-right preserve the selected block as one undoable command", () => {
  const project = createV2ProjectState();
  makeAudible(project);
  const secondPatternId = project.duplicatePattern("pattern-1");
  const secondTrackId = project.addTrack("Bass");
  const first = project.addClip("track-1", "pattern-1", 0);
  const second = project.addClip("track-1", secondPatternId, 24);
  const third = project.addClip(secondTrackId, "pattern-1", 12);
  let changes = 0;
  project.addEventListener("change", () => { changes += 1; });

  project.moveClips([first, second, third], { deltaTick: 24, deltaTrack: 0 });
  assert.equal(changes, 1);
  assert.deepEqual([
    project.getClip(first).clip.startTick,
    project.getClip(second).clip.startTick,
    project.getClip(third).clip.startTick,
  ], [24, 48, 36]);
  assert.equal(project.getClip(third).track.id, secondTrackId);

  project.undo();
  assert.deepEqual([
    project.getClip(first).clip.startTick,
    project.getClip(second).clip.startTick,
    project.getClip(third).clip.startTick,
  ], [0, 24, 12]);
  project.redo();

  const beforeDuplicate = project.getState();
  const copies = project.duplicateClips([first, second, third]);
  assert.equal(copies.length, 3);
  assert.equal(new Set(copies).size, 3);
  assert.deepEqual(copies.map((id) => project.getClip(id).clip.startTick), [72, 96, 84]);
  assert.deepEqual(copies.map((id) => project.getClip(id).clip.patternId), [
    "pattern-1",
    secondPatternId,
    "pattern-1",
  ]);
  assert.deepEqual(copies.map((id) => project.getClip(id).track.id), [
    "track-1",
    "track-1",
    secondTrackId,
  ]);
  project.undo();
  assert.deepEqual(project.getState(), beforeDuplicate);
  project.redo();
  assert.deepEqual(copies.map((id) => project.getClip(id).clip.startTick), [72, 96, 84]);
});

test("multi-clip placement and duplicate failures leave every clip untouched", () => {
  const project = createV2ProjectState();
  makeAudible(project);
  const secondPatternId = project.duplicatePattern("pattern-1");
  const first = project.addClip("track-1", "pattern-1", 0);
  const second = project.addClip("track-1", secondPatternId, 24);
  project.addClip("track-1", "pattern-1", 72);
  let changes = 0;
  project.addEventListener("change", () => { changes += 1; });
  const before = project.getState();

  assert.throws(
    () => project.moveClips([first, second], { deltaTick: 48, deltaTrack: 0 }),
    (error) => error.code === "CLIP_PLACEMENT_INVALID",
  );
  assert.equal(project.getState(), before);
  assert.throws(
    () => project.duplicateClips([first, second]),
    (error) => error.code === "CLIP_DUPLICATE_INVALID",
  );
  assert.equal(project.getState(), before);
  assert.throws(
    () => project.moveClips([first, second], { deltaTick: 0, deltaTrack: -1 }),
    (error) => error.code === "CLIP_PLACEMENT_INVALID",
  );
  assert.equal(project.getState(), before);
  assert.equal(changes, 0);
});

test("Track, Instrument, Mixer and Effect commands retain identities and share history", () => {
  const project = createV2ProjectState();
  const track2 = project.addTrack("Bass");
  project.setInstrumentParam(track2, "waveform", "triangle");
  project.setTrackMixer(track2, { volume: 0.5, pan: -0.25, solo: true });
  project.setMasterVolume(0.8);
  const filterId = project.addEffect(track2, "klinto-filter");
  const delayId = project.addEffect(track2, "klinto-delay");

  project.setEffectParam(filterId, "cutoffHz", 800);
  project.setEffectBypassed(delayId, true);
  project.moveEffect(delayId, -1);
  assert.deepEqual(project.getTrack(track2).mixer.effects.map(({ instanceId }) => instanceId), [delayId, filterId]);
  assert.equal(project.getTrack(track2).instrument.params.waveform, "triangle");
  assert.equal(project.getTrack(track2).mixer.pan, -0.25);
  assert.equal(project.getState().mixer.master.volume, 0.8);
  assert.equal(project.getEffect(filterId).effect.params.cutoffHz, 800);

  project.resetEffect(filterId);
  assert.equal(project.getEffect(filterId).effect.params.cutoffHz, 12_000);
  project.removeEffect(delayId);
  project.undo();
  assert.equal(project.getEffect(delayId).effect.bypassed, true);
  assert.equal(project.removeTrack("track-1"), true);
});

test("arrangement-mode loop follows clips only while enabled and final-object rules hold", () => {
  const project = createV2ProjectState();
  makeAudible(project);
  const clipId = project.addClip("track-1", "pattern-1", 384);
  project.setLoop({ enabled: true, mode: "arrangement" });
  assert.deepEqual(project.getState().transport.loop, {
    enabled: true,
    mode: "arrangement",
    startTick: 0,
    endTick: 408,
  });
  project.removeClip(clipId);
  assert.equal(project.getState().transport.loop.enabled, false);
  assert.equal(project.getState().transport.loop.mode, "arrangement");
  assert.equal(project.getState().transport.loop.endTick, 408);
  project.addClip("track-1", "pattern-1", 0);
  assert.equal(project.getState().transport.loop.enabled, false);
  assert.equal(project.getState().transport.loop.endTick, 408);
  assert.throws(() => project.deletePattern("pattern-1"), /final Pattern/);
  assert.throws(() => project.removeTrack("track-1"), /final Track/);
});
test("custom loop bounds are serializable and share retained Project undo history", () => {
  const project = createV2ProjectState();
  const before = project.getState().transport.loop;
  project.setLoop({ enabled: true, mode: "custom", startTick: 24, endTick: 192 });
  assert.deepEqual(
    JSON.parse(JSON.stringify(project.getState())).transport.loop,
    { enabled: true, mode: "custom", startTick: 24, endTick: 192 },
  );
  assert.equal(project.undo(), true);
  assert.deepEqual(project.getState().transport.loop, before);
  assert.equal(project.redo(), true);
  assert.deepEqual(
    project.getState().transport.loop,
    { enabled: true, mode: "custom", startTick: 24, endTick: 192 },
  );
});
