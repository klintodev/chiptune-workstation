import assert from "node:assert/strict";
import test from "node:test";

import { createStepScheduler, getSixteenthNoteDuration } from "../src/transport/step-scheduler.js";

function createHarness({ steps = [{ note: 60, gate: 0.5, volume: 0.25 }, null] } = {}) {
  let audioTime = 10;
  let intervalCallback;
  const triggers = [];
  const stops = [];
  const scheduler = createStepScheduler({
    getAudioTime: () => audioTime,
    getInstrumentConfig: () => ({
      voiceType: "square",
      attackSeconds: 0.01,
      releaseSeconds: 0.03,
    }),
    getPatternState: () => ({ steps }),
    voiceEngine: {
      trigger(options) {
        triggers.push(options);
        return { stop: (time) => stops.push(time) };
      },
    },
    setIntervalFn(callback) {
      intervalCallback = callback;
      return 1;
    },
    clearIntervalFn() {},
  });

  return {
    scheduler,
    stops,
    triggers,
    advanceTo(time) {
      audioTime = time;
      intervalCallback?.();
    },
  };
}

test("tempo uses sixteenth-note timing", () => {
  assert.equal(getSixteenthNoteDuration(120), 0.125);
  assert.equal(getSixteenthNoteDuration(60), 0.25);
  assert.throws(() => getSixteenthNoteDuration(20), RangeError);
});

test("play schedules through audio time and carries step expression", () => {
  const harness = createHarness();

  assert.equal(harness.scheduler.play(), true);
  assert.equal(harness.scheduler.getState().status, "playing");
  assert.equal(harness.triggers.length, 1);
  assert.equal(harness.triggers[0].startTime, 10.05);
  assert.equal(harness.triggers[0].duration, 0.0625);
  assert.equal(harness.triggers[0].intensity, 0.25);
});

test("rests do not trigger voices and stop releases scheduled voices", () => {
  const harness = createHarness();

  harness.scheduler.play();
  harness.advanceTo(10.14);
  assert.equal(harness.triggers.length, 1);

  assert.equal(harness.scheduler.stop(), true);
  assert.deepEqual(harness.stops, [10.14]);
  assert.equal(harness.scheduler.getState().status, "stopped");
  assert.equal(harness.scheduler.getPlayheadStep(), 0);
});

test("tempo can change without creating a second scheduler", () => {
  const harness = createHarness();

  harness.scheduler.play();
  assert.equal(harness.scheduler.setBpm(180), true);
  assert.equal(harness.scheduler.getState().bpm, 180);
  assert.equal(harness.scheduler.play(), false);
});
