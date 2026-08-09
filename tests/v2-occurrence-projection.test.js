import assert from "node:assert/strict";
import test from "node:test";

import {
  createPatternOccurrences,
  createSongOccurrences,
  createV2ProjectState,
  getAudibleTrackIds,
  secondsToTicks,
  snapTick,
  tickToBarBeat,
  ticksToSeconds,
} from "../src/v2/domain/index.js";

test("Pattern projection preserves touching notes, canonical order, ownership and loop boundaries", () => {
  const project = createV2ProjectState();
  const lowA = project.addNote("pattern-1", { id: "note-a", pitch: 60, startTick: 0, durationTicks: 48, velocity: 0.6 });
  const lowB = project.addNote("pattern-1", { id: "note-b", pitch: 61, startTick: 48, durationTicks: 48, velocity: 0.7 });
  const high = project.addNote("pattern-1", { pitch: 67, startTick: 96, durationTicks: 48, velocity: 0.8 });
  project.addNote("pattern-1", { id: "note-touch", pitch: 60, startTick: 144, durationTicks: 48, velocity: 0.5 });
  project.addNote("pattern-1", { pitch: 64, startTick: 192, durationTicks: 24, velocity: 0 });

  const occurrences = createPatternOccurrences(
    project.getState(),
    "pattern-1",
    "track-1",
    { loop: true, iterations: 2 },
  );

  assert.equal(occurrences.length, 8);
  assert.deepEqual(occurrences.slice(0, 3).map(({ noteId }) => noteId), [lowA, lowB, high]);
  assert.deepEqual(occurrences.map(({ startTick }) => startTick), [0, 48, 96, 144, 216, 264, 312, 360]);
  assert.equal(occurrences[0].mode, "pattern");
  assert.equal(occurrences[0].clipId, null);
  assert.equal(occurrences[0].endTick, 48);
  assert.equal(Object.isFrozen(occurrences[0]), true);
});

test("Song projection adds clip ticks and uses deterministic per-Track occurrence ordering", () => {
  const project = createV2ProjectState();
  project.addNote("pattern-1", { id: "note-z", pitch: 64, startTick: 24, durationTicks: 24, velocity: 1 });
  project.addNote("pattern-1", { id: "note-a", pitch: 60, startTick: 0, durationTicks: 18, velocity: 1 });
  const secondTrack = project.addTrack("Bass");
  project.addClip("track-1", "pattern-1", 384);
  project.addClip(secondTrack, "pattern-1", 0);

  const occurrences = createSongOccurrences(project.getState());

  assert.deepEqual(occurrences.map(({ trackId, startTick, noteId }) => ({ trackId, startTick, noteId })), [
    { trackId: secondTrack, startTick: 0, noteId: "note-a" },
    { trackId: secondTrack, startTick: 24, noteId: "note-z" },
    { trackId: "track-1", startTick: 384, noteId: "note-a" },
    { trackId: "track-1", startTick: 408, noteId: "note-z" },
  ]);
  assert.equal(occurrences[2].clipId, project.getTrack("track-1").clips[0].id);
  assert.match(occurrences[2].occurrenceId, /^song:track-1:/);
});

test("audible Track selection applies solo first and mute always wins", () => {
  const project = createV2ProjectState();
  const second = project.addTrack("Bass");
  const third = project.addTrack("Drums");
  project.setTrackMixer("track-1", { solo: true });
  project.setTrackMixer(second, { solo: true, muted: true });

  assert.deepEqual(getAudibleTrackIds(project.getState()), ["track-1"]);
  project.setTrackMixer("track-1", { solo: false });
  project.setTrackMixer(second, { solo: false });
  assert.deepEqual(getAudibleTrackIds(project.getState()), ["track-1", third]);
});

test("tick/second, snap and 4/4 position helpers are drift-free and reversible", () => {
  assert.equal(ticksToSeconds(96, 120), 0.5);
  assert.equal(secondsToTicks(0.5, 120), 96);
  assert.equal(secondsToTicks(ticksToSeconds(6_143, 137.5), 137.5, { rounding: "round" }), 6_143);
  assert.equal(snapTick(25, 24, "floor"), 24);
  assert.equal(snapTick(25, 24, "ceil"), 48);
  assert.deepEqual(tickToBarBeat(480), { bar: 2, beat: 2, tickInBeat: 0 });
});
