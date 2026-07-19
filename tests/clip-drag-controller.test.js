import assert from "node:assert/strict";
import test from "node:test";

import { getTimelineStep } from "../src/features/arranger/clip-drag-controller.js";
import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";

test("timeline placement accounts for horizontal scrolling", () => {
  assert.equal(getTimelineStep({
    clientX: 238,
    laneLeft: -462,
    stepWidth: 14,
  }), 50);
});

test("clip dragging preserves the grabbed offset and snaps to the nearest step", () => {
  assert.equal(getTimelineStep({
    clientX: 302,
    laneLeft: 224,
    maxStep: 240,
    pointerOffset: 21,
    rounding: "nearest",
    stepWidth: 14,
  }), 4);
});

test("timeline placement clamps clips within the arrangement", () => {
  assert.equal(getTimelineStep({
    clientX: -100,
    laneLeft: 224,
    maxStep: 240,
    stepWidth: 14,
  }), 0);
  assert.equal(getTimelineStep({
    clientX: 9999,
    laneLeft: 224,
    maxStep: 240,
    stepWidth: 14,
  }), 240);
});
test("drag destinations are validated without mutating the arrangement", () => {
  const project = createProjectState();
  const firstClipId = project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const secondClipId = project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 16);
  const secondTrackId = project.addTrack("Bass");

  assert.equal(project.canMoveClip(firstClipId, DEFAULT_TRACK_ID, 8), false);
  assert.equal(project.canMoveClip(firstClipId, secondTrackId, 8), true);
  assert.throws(() => project.moveClip(firstClipId, DEFAULT_TRACK_ID, 8), RangeError);
  assert.equal(project.getClip(firstClipId).clip.startStep, 0);
  assert.equal(project.getClip(secondClipId).clip.startStep, 16);
});