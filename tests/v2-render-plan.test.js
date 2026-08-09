import assert from "node:assert/strict";
import test from "node:test";

import {
  RENDER_PLAN_ADAPTERS,
  createPlaybackOccurrences,
  createRenderPlan,
} from "../src/v2/audio/render-plan.js";
import {
  createDefaultInstrumentInstance,
  createDefaultV2Project,
} from "../src/v2/domain/index.js";

function note(id, pitch, startTick = 0, durationTicks = 24, velocity = 0.7) {
  return { id, pitch, startTick, durationTicks, velocity };
}

function fixture() {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [
    note("note-c", 67, 48),
    note("note-a", 60, 0),
    note("note-b", 64, 24),
  ];
  project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startTick: 48 }];
  return project;
}

test("Pattern and Song plans share canonical timing, ownership and synthesis parameters", () => {
  const project = fixture();
  project.tracks[0].instrument.params.octave = 1;
  const pattern = createRenderPlan(project, {
    mode: "pattern",
    patternId: "pattern-1",
    trackId: "track-1",
  });
  assert.deepEqual(pattern.events.map(({ noteId }) => noteId), ["note-a", "note-b", "note-c"]);
  assert.deepEqual(pattern.events.map(({ effectivePitch }) => effectivePitch), [72, 76, 79]);
  assert.equal(pattern.events[0].startSeconds, 0);
  assert.equal(pattern.events[0].durationSeconds, 0.125);
  assert.deepEqual(pattern.events[0].ownership, {
    clipId: null,
    mode: "pattern",
    noteId: "note-a",
    occurrenceId: "pattern:track-1:pattern:pattern-1:note-a:0",
    patternId: "pattern-1",
    projectId: null,
    trackId: "track-1",
  });

  const song = createRenderPlan(project, { mode: "song" });
  assert.deepEqual(song.events.map(({ startTick }) => startTick), [48, 72, 96]);
  assert.equal(song.events[0].startSeconds, 0.25);
  assert.equal(song.events[0].clipId, "clip-1");
  assert.equal(song.toTick, 120);
  assert.equal(RENDER_PLAN_ADAPTERS.live, RENDER_PLAN_ADAPTERS.offline);
  assert.equal(RENDER_PLAN_ADAPTERS.live, RENDER_PLAN_ADAPTERS.public);
});

test("the pure plan pins oldest-inserted retirement after the sixteenth Track voice", () => {
  const project = fixture();
  project.patterns[0].notes = Array.from({ length: 17 }, (_, index) => (
    note(`note-${String(index).padStart(2, "0")}`, 36 + index, index, 1)
  ));
  project.tracks[0].instrument.params.releaseSeconds = 3;
  const plan = createRenderPlan(project, {
    mode: "pattern",
    patternId: "pattern-1",
    trackId: "track-1",
  });
  assert.equal(plan.events.length, 17);
  assert.deepEqual(plan.events.slice(0, 16).flatMap(({ retireOccurrenceIds }) => retireOccurrenceIds), []);
  assert.deepEqual(plan.events[16].retireOccurrenceIds, [plan.events[0].occurrenceId]);
});

test("loop projection uses exclusive boundaries and unique monotonic cycle identities", () => {
  const project = fixture();
  project.patterns[0].notes = [
    note("first", 60, 0, 24),
    note("last", 61, 383, 1),
  ];
  const patternOccurrences = createPlaybackOccurrences(project, {
    fromTransportTick: 0,
    mode: "pattern",
    patternId: "pattern-1",
    toTransportTick: 769,
    trackId: "track-1",
  });
  assert.deepEqual(patternOccurrences.map(({ transportTick }) => transportTick), [0, 383, 384, 767, 768]);
  assert.equal(new Set(patternOccurrences.map(({ occurrenceId }) => occurrenceId)).size, 5);

  project.patterns[0].notes = [
    note("loop-start", 60, 24, 12),
    note("loop-end", 61, 47, 12),
  ];
  project.tracks[0].clips[0].startTick = 0;
  project.transport.loop = { enabled: true, mode: "custom", startTick: 24, endTick: 48 };
  const songOccurrences = createPlaybackOccurrences(project, {
    fromTransportTick: 24,
    mode: "song",
    patternId: null,
    toTransportTick: 72,
    trackId: null,
  });
  assert.deepEqual(songOccurrences.map(({ transportTick }) => transportTick), [24, 47, 48, 71]);
  assert.deepEqual(songOccurrences.map(({ playbackDurationTicks }) => playbackDurationTicks), [12, 1, 12, 1]);
});

test("voice limits are independent per Track", () => {
  const project = fixture();
  project.patterns[0].notes = Array.from({ length: 16 }, (_, index) => (
    note(`note-${String(index).padStart(2, "0")}`, 36 + index, index, 1)
  ));
  project.tracks[0].instrument.params.releaseSeconds = 3;
  const secondInstrument = structuredClone(createDefaultInstrumentInstance("instrument-2"));
  secondInstrument.params.releaseSeconds = 3;
  project.tracks.push({
    id: "track-2",
    name: "Pulse 2",
    instrument: secondInstrument,
    mixer: { volume: 1, pan: 0, muted: false, solo: false, effects: [] },
    clips: [{ id: "clip-2", patternId: "pattern-1", startTick: 0 }],
  });
  project.tracks[0].clips[0].startTick = 0;
  const song = createRenderPlan(project, { mode: "song" });
  assert.equal(song.events.length, 32);
  assert.deepEqual(song.events.flatMap(({ retireOccurrenceIds }) => retireOccurrenceIds), []);
});
