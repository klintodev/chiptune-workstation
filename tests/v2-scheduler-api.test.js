import assert from "node:assert/strict";
import test from "node:test";

import { createV2Scheduler } from "../src/v2/audio/index.js";
import { createDefaultV2Project } from "../src/v2/domain/index.js";

test("integration scheduler accepts audition-Track and scheduleVoice adapters", () => {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [{
    id: "note-1",
    pitch: 60,
    startTick: 0,
    durationTicks: 24,
    velocity: 0.7,
  }];
  const submitted = [];
  const scheduler = createV2Scheduler({
    clearIntervalFn() {},
    getAudioTime: () => 5,
    getAuditionTrackId: () => "track-1",
    getPatternId: () => "pattern-1",
    getProject: () => project,
    scheduleVoice(event) {
      submitted.push(event);
      return { retire: () => true, stop: () => true };
    },
    setIntervalFn: () => 1,
    startLeadSeconds: 0,
  });
  assert.equal(scheduler.play({ mode: "pattern" }), true);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].trackId, "track-1");
  assert.equal(submitted[0].startTime, 5);
  for (const method of [
    "addEventListener",
    "dispose",
    "getState",
    "pause",
    "play",
    "removeEventListener",
    "seek",
    "setBpm",
    "setMode",
    "stop",
  ]) assert.equal(typeof scheduler[method], "function", method);
  scheduler.dispose();
});
