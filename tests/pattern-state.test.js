import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PATTERN_GATE,
  DEFAULT_PATTERN_LENGTH,
  DEFAULT_PATTERN_VOLUME,
  createPatternState,
} from "../src/state/pattern-state.js";

test("a pattern starts empty and exposes immutable snapshots", () => {
  const pattern = createPatternState();
  const snapshot = pattern.getState();

  assert.equal(snapshot.length, DEFAULT_PATTERN_LENGTH);
  assert.deepEqual(snapshot.steps, Array(DEFAULT_PATTERN_LENGTH).fill(null));
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.steps), true);
});

test("editing a note preserves its expression and can be undone", () => {
  const pattern = createPatternState();

  pattern.setStep(0, 60);
  pattern.setGate(0, 0.5);
  pattern.setVolume(0, 0.25);
  pattern.setStep(0, 62);

  assert.deepEqual(pattern.getState().steps[0], {
    note: 62,
    gate: 0.5,
    volume: 0.25,
  });

  pattern.undo();
  assert.deepEqual(pattern.getState().steps[0], {
    note: 60,
    gate: 0.5,
    volume: 0.25,
  });
});

test("new notes receive the documented gate and volume defaults", () => {
  const pattern = createPatternState();
  pattern.setStep(3, 64);

  assert.deepEqual(pattern.getState().steps[3], {
    note: 64,
    gate: DEFAULT_PATTERN_GATE,
    volume: DEFAULT_PATTERN_VOLUME,
  });
});

test("clearing a note can be undone", () => {
  const pattern = createPatternState();
  pattern.setStep(0, 60);

  assert.equal(pattern.clearStep(0), true);
  assert.equal(pattern.getState().steps[0], null);

  pattern.undo();
  assert.equal(pattern.getState().steps[0].note, 60);
});

test("a history group turns continuous slider input into one undo step", () => {
  const pattern = createPatternState();
  pattern.setStep(0, 60);
  pattern.beginHistoryGroup();
  pattern.setVolume(0, 0.6);
  pattern.setVolume(0, 0.5);
  pattern.setVolume(0, 0.4);
  pattern.endHistoryGroup();

  pattern.undo();
  assert.equal(pattern.getState().steps[0].volume, DEFAULT_PATTERN_VOLUME);
});

test("bulk operations keep the pattern within supported note and length limits", () => {
  const pattern = createPatternState([60, null, 64, null]);

  assert.equal(pattern.duplicate(), true);
  assert.equal(pattern.getState().length, 8);
  assert.equal(pattern.transpose(12), true);
  assert.equal(pattern.getState().steps[0].note, 72);
  assert.equal(pattern.getState().steps[4].note, 72);
});
