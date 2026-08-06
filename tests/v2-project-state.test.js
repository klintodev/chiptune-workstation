import assert from "node:assert/strict";
import test from "node:test";

import {
  V2DomainError,
  createV2ProjectState,
} from "../src/v2/domain/index.js";

function makeAudible(state, patternId = "pattern-1", pitch = 60, startTick = 0, durationTicks = 24) {
  return state.addNote(patternId, { pitch, startTick, durationTicks, velocity: 0.7 });
}

test("note commands are immutable, atomic, canonically ordered and history-backed", () => {
  const project = createV2ProjectState();
  const original = project.getState();
  const high = project.addNote("pattern-1", { pitch: 67, startTick: 0, durationTicks: 24, velocity: 0.8 });
  const low = project.addNote("pattern-1", { pitch: 60, startTick: 0, durationTicks: 18, velocity: 0.6 });

  assert.equal(Object.isFrozen(project.getState()), true);
  assert.notEqual(project.getState(), original);
  assert.deepEqual(project.getPattern().notes.map(({ id }) => id), [low, high]);
  assert.throws(() => project.updateNote("pattern-1", low, { pitch: 113 }), RangeError);
  assert.equal(project.getPattern().notes.find(({ id }) => id === low).pitch, 60);

  const copies = project.duplicateNotes("pattern-1", [low, high], { deltaTicks: 24, deltaPitch: 1 });
  assert.equal(copies.length, 2);
  assert.equal(project.getPattern().notes.length, 4);
  project.removeNotes("pattern-1", copies);
  project.undo();
  assert.equal(project.getPattern().notes.length, 4);
  project.redo();
  assert.equal(project.getPattern().notes.length, 2);
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
