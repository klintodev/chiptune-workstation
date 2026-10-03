import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultV2Project,
  createV2ProjectState,
  getPatternPlaybackEndTick,
  normalizeV2Project,
} from "../src/v2/domain/index.js";
import { createPlaybackOccurrences, createRenderPlan } from "../src/v2/audio/render-plan.js";
import { createV2ArrangementRenderPlan } from "../src/v2/audio/offline-renderer.js";
import {
  createV2ProjectDocument,
  parseV2ProjectDocument,
  serializeV2ProjectDocument,
} from "../src/v2/persistence/project-document.js";
import { createV2MemoryProjectRepository } from "../src/v2/persistence/project-repository.js";
import { normalizeProjectDocument } from "../src/persistence/project-document.js";

function twoBarPattern() {
  const state = createV2ProjectState();
  state.setPatternLength("pattern-1", 768);
  state.addNotes("pattern-1", Array.from({ length: 8 }, (_, index) => ({
    pitch: 60 + index,
    startTick: index * 72,
    durationTicks: 24,
    velocity: 0.7,
  })));
  return state;
}

test("two-bar repetitions preserve the final rest in Pattern, Playlist and WAV timing", () => {
  const state = twoBarPattern();
  const originalNotes = state.getPattern().notes;
  const first = state.addPatternToPlaylist("pattern-1", "track-1");
  const second = state.addPatternToPlaylist("pattern-1", "track-1", first.playlistCursorTick);
  assert.equal(second.startTick, 768);
  assert.equal(second.playlistCursorTick, 1536);
  assert.equal(state.getArrangementEndTick(), 1536);
  const song = createRenderPlan(state.getState());
  const loop = createPlaybackOccurrences(state.getState(), {
    mode: "pattern", patternId: "pattern-1", trackId: "track-1",
    fromTransportTick: 0, toTransportTick: 1536,
  });
  assert.deepEqual(loop.map((event) => event.transportTick), song.events.map((event) => event.startTick));
  assert.deepEqual(song.events.map((event) => event.durationTicks), Array(16).fill(24));
  assert.equal(song.contentDurationSeconds, 8);
  assert.equal(getPatternPlaybackEndTick(state.getPattern()), 768);
  const wav = createV2ArrangementRenderPlan(state.getState());
  assert.equal(wav.toTick, 1536);
  assert.equal(wav.frameCount, Math.ceil((8 + wav.tailSeconds) * wav.sampleRate));
  assert.deepEqual(state.getPattern().notes, originalNotes);
});

test("length, duplication and trailing silence survive document and repository round trips", async () => {
  const state = twoBarPattern();
  const duplicate = state.duplicatePattern("pattern-1");
  assert.equal(state.getPattern(duplicate).lengthTicks, 768);
  state.removeNotes("pattern-1", state.getPattern().notes.map(({ id }) => id));
  assert.equal(state.getPattern().lengthTicks, 768);
  const document = createV2ProjectDocument(state.getState(), { id: "length-roundtrip" });
  const serialized = serializeV2ProjectDocument(document);
  assert.deepEqual(parseV2ProjectDocument(serialized), document);
  assert.deepEqual(normalizeProjectDocument(document), document);
  const repository = createV2MemoryProjectRepository();
  await repository.save(document);
  const reopened = createV2ProjectState((await repository.get(document.id)).project);
  assert.equal(reopened.getPattern().lengthTicks, 768);
  assert.equal(reopened.getPattern().notes.length, 0);
});

test("new Patterns start with one bar and grow by whole bars without shrinking on deletion", () => {
  const state = createV2ProjectState();
  assert.equal(state.getPattern().lengthTicks, 384);
  assert.equal(state.getPattern(state.createPattern()).lengthTicks, 384);
  const note = state.addNote("pattern-1", { pitch: 60, startTick: 384, durationTicks: 18 });
  assert.equal(state.getPattern().lengthTicks, 768);
  assert.equal(state.getPattern().notes[0].durationTicks, 18);
  state.removeNotes("pattern-1", [note]);
  assert.equal(state.getPattern().lengthTicks, 768);
  state.undo();
  state.undo();
  assert.equal(state.getPattern().lengthTicks, 384);
});

test("length changes are atomic, undoable and keep arrangement looping in sync", () => {
  const state = createV2ProjectState();
  state.addClip("track-1", "pattern-1", 0);
  state.setLoop({ mode: "arrangement", enabled: true });
  const before = state.getState();
  state.setPatternLength("pattern-1", 768);
  assert.equal(state.getState().transport.loop.endTick, 768);
  state.undo();
  assert.deepEqual(state.getState(), before);
  state.redo();
  assert.equal(state.getPattern().lengthTicks, 768);
  state.setPatternLength("pattern-1", 384);
  assert.equal(state.getState().transport.loop.endTick, 384);
});

test("shortening before notes, overlapping linked clips and song overflow leave state and history untouched", () => {
  const state = twoBarPattern();
  state.addClip("track-1", "pattern-1", 0);
  state.addClip("track-1", "pattern-1", 768);
  const before = state.getState();
  const history = state.getHistoryState();
  for (const [length, code] of [[384, "PATTERN_LENGTH_BEFORE_NOTES"], [1152, "PATTERN_CONTENT_CLIP_CONFLICT"]]) {
    assert.throws(() => state.setPatternLength("pattern-1", length), (error) => error.code === code);
    assert.equal(state.getState(), before);
    assert.deepEqual(state.getHistoryState(), history);
  }
  const boundary = createV2ProjectState();
  boundary.addClip("track-1", "pattern-1", 5760);
  const beforeBoundary = boundary.getState();
  assert.throws(() => boundary.setPatternLength("pattern-1", 768), (error) => error.code === "PATTERN_CONTENT_CLIP_CONFLICT");
  assert.equal(boundary.getState(), beforeBoundary);
});

test("length validation rejects malformed persisted values and accepts the eight-bar maximum", () => {
  const state = twoBarPattern();
  for (const lengthTicks of [0, -1, 3073, 1.5, NaN, Infinity, "768", 384]) {
    const candidate = structuredClone(state.getState());
    candidate.patterns[0].lengthTicks = lengthTicks;
    assert.throws(() => normalizeV2Project(candidate));
  }
  state.setPatternLength("pattern-1", 3072);
  assert.equal(state.getPattern().lengthTicks, 3072);
  assert.equal(state.setPatternLength("pattern-1", 3072), false);
});

test("V7 migration preserves exact old Song timing, note gates and raw storage without padding collisions", async () => {
  const source = structuredClone(createDefaultV2Project());
  source.schemaVersion = 7;
  source.patterns[0].lengthTicks = 3000; // V7 canonicalization ignored stale supplied lengths.
  source.patterns[0].notes = [{ id: "gate", pitch: 60, startTick: 0, durationTicks: 18, velocity: 0.7 }];
  source.tracks[0].clips = [0, 18].map((startTick, index) => ({
    id: `clip-${index}`, patternId: "pattern-1", startTick,
  }));
  const before = structuredClone(source);
  const migrated = normalizeV2Project(source);
  assert.equal(migrated.schemaVersion, 8);
  assert.equal(migrated.patterns[0].lengthTicks, 18);
  assert.deepEqual(migrated.tracks, before.tracks);
  assert.deepEqual(migrated.patterns[0].notes, before.patterns[0].notes);
  assert.equal(createRenderPlan(migrated).toTick, 36);
  assert.equal(getPatternPlaybackEndTick(migrated.patterns[0]), 18);
  assert.deepEqual(normalizeV2Project(migrated), migrated);
  assert.deepEqual(source, before);
  const raw = { ...createV2ProjectDocument(), project: source };
  const repository = createV2MemoryProjectRepository([raw]);
  assert.equal((await repository.get(raw.id)).project.schemaVersion, 8);
  assert.deepEqual(await repository.getRaw(raw.id), raw);
});

test("empty V7 projects retain their valid technical length until the user chooses bars", () => {
  const source = { ...createDefaultV2Project(), schemaVersion: 7 };
  const state = createV2ProjectState(source);
  assert.equal(state.getPattern().lengthTicks, 1);
  state.setPatternLength("pattern-1", 384);
  assert.equal(state.getPattern().lengthTicks, 384);
});
