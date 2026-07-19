import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  MAX_ARRANGEMENT_STEPS,
  MAX_PROJECT_TRACKS,
  createProjectState,
  isTrackAudible,
} from "../src/state/project-state.js";

test("pattern duplication creates an independent variation while clips stay linked", () => {
  const project = createProjectState();
  project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0
      ? { note: 60, gate: 0.75, volume: 0.7 }
      : step),
  }));
  const firstClipId = project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const repeatedClipId = project.repeatClip(firstClipId);
  const variationId = project.duplicatePattern(DEFAULT_PATTERN_ID);

  assert.equal(project.getClip(firstClipId).clip.patternId, DEFAULT_PATTERN_ID);
  assert.equal(project.getClip(repeatedClipId).clip.patternId, DEFAULT_PATTERN_ID);
  assert.notEqual(variationId, DEFAULT_PATTERN_ID);

  project.updatePattern(variationId, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0 ? { ...step, note: 64 } : step),
  }));
  assert.equal(project.getPattern(DEFAULT_PATTERN_ID).steps[0].note, 60);
  assert.equal(project.getPattern(variationId).steps[0].note, 64);
});

test("a clip variation copies pattern settings and relinks only that clip", () => {
  const project = createProjectState();
  project.setPatternRootOctave(DEFAULT_PATTERN_ID, 2);
  project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0
      ? { note: 36, gate: 0.75, volume: 0.7 }
      : step),
  }));
  const originalClipId = project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const variationClipId = project.repeatClip(originalClipId);
  const variationId = project.createClipVariation(variationClipId);

  assert.equal(project.getClip(originalClipId).clip.patternId, DEFAULT_PATTERN_ID);
  assert.equal(project.getClip(variationClipId).clip.patternId, variationId);
  assert.equal(project.getPattern(variationId).rootOctave, 2);
  assert.deepEqual(project.getPattern(variationId).steps, project.getPattern(DEFAULT_PATTERN_ID).steps);

  project.undo();
  assert.equal(project.getClip(variationClipId).clip.patternId, DEFAULT_PATTERN_ID);
  assert.throws(() => project.getPattern(variationId), RangeError);
});

test("clip placement rejects overlaps and arrangement overflow atomically", () => {
  const project = createProjectState();
  const firstClipId = project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);

  assert.throws(() => project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 8), RangeError);
  assert.throws(
    () => project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, MAX_ARRANGEMENT_STEPS - 8),
    RangeError,
  );
  assert.equal(project.getTrack().clips.length, 1);
  assert.equal(project.getClip(firstClipId).clip.startStep, 0);
});

test("clips move independently between tracks and repeat at the first available position", () => {
  const project = createProjectState();
  const secondTrackId = project.addTrack("Bass");
  const clipId = project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const repeatedId = project.repeatClip(clipId);

  assert.equal(project.getClip(repeatedId).clip.startStep, 16);
  project.moveClip(repeatedId, secondTrackId, 32);
  assert.equal(project.getClip(repeatedId).track.id, secondTrackId);
  assert.equal(project.getClip(repeatedId).clip.startStep, 32);
  assert.equal(project.getClip(clipId).track.id, DEFAULT_TRACK_ID);
});

test("resizing a linked pattern is rejected when its clips would collide", () => {
  const project = createProjectState();
  project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 16);

  assert.throws(() => project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: [...pattern.steps, ...pattern.steps],
  })), RangeError);
  assert.equal(project.getPattern(DEFAULT_PATTERN_ID).steps.length, 16);
});

test("pattern deletion requires resolving linked clips and remains undoable", () => {
  const project = createProjectState();
  const variationId = project.duplicatePattern(DEFAULT_PATTERN_ID);
  const clipId = project.addClip(DEFAULT_TRACK_ID, variationId, 0);

  assert.throws(() => project.deletePattern(variationId), RangeError);
  project.deletePattern(variationId, { removeReferences: true });
  assert.equal(project.getState().patterns.some((pattern) => pattern.id === variationId), false);
  assert.throws(() => project.getClip(clipId), RangeError);

  project.undo();
  assert.equal(project.getPattern(variationId).id, variationId);
  assert.equal(project.getClip(clipId).clip.patternId, variationId);
});

test("track count and final-track removal limits are enforced", () => {
  const project = createProjectState();
  assert.throws(() => project.removeTrack(DEFAULT_TRACK_ID), RangeError);
  while (project.getState().tracks.length < MAX_PROJECT_TRACKS) project.addTrack();
  assert.throws(() => project.addTrack(), RangeError);

  const removable = project.getState().tracks.at(-1);
  project.removeTrack(removable.id);
  assert.equal(project.getState().tracks.length, MAX_PROJECT_TRACKS - 1);
});

test("multiple solos are audible while mute always overrides solo", () => {
  const project = createProjectState();
  const secondTrackId = project.addTrack("Bass");
  const thirdTrackId = project.addTrack("Drums");
  project.updateTrack(DEFAULT_TRACK_ID, (track) => ({
    ...track,
    mixer: { ...track.mixer, solo: true },
  }));
  project.updateTrack(secondTrackId, (track) => ({
    ...track,
    mixer: { ...track.mixer, solo: true, muted: true },
  }));

  const snapshot = project.getState();
  assert.equal(isTrackAudible(snapshot, DEFAULT_TRACK_ID), true);
  assert.equal(isTrackAudible(snapshot, secondTrackId), false);
  assert.equal(isTrackAudible(snapshot, thirdTrackId), false);
});
