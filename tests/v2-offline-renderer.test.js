import assert from "node:assert/strict";
import test from "node:test";

import {
  V2_EXPORT_SAMPLE_RATE,
  createV2ArrangementRenderPlan,
  renderV2ArrangementOffline,
} from "../src/v2/audio/offline-renderer.js";
import { createDefaultV2Project } from "../src/v2/domain/index.js";

function audibleArrangement() {
  const project = structuredClone(createDefaultV2Project());
  project.patterns[0].notes = [{
    id: "note-1",
    pitch: 60,
    startTick: 0,
    durationTicks: 24,
    velocity: 0.7,
  }];
  project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }];
  project.transport.loop = { enabled: true, mode: "custom", startTick: 0, endTick: 96 };
  return project;
}

test("V2 export renders the arrangement once at 44.1 kHz and adds its serial tail", () => {
  const project = audibleArrangement();
  const plan = createV2ArrangementRenderPlan(project);
  assert.equal(plan.sampleRate, 44_100);
  assert.equal(plan.sampleRate, V2_EXPORT_SAMPLE_RATE);
  assert.equal(plan.channelCount, 2);
  assert.equal(plan.toTick, 24);
  assert.equal(plan.events.length, 1);
  assert.equal(plan.contentDurationSeconds, 0.125);
  assert.equal(plan.tailSeconds, 0.03);
  assert.equal(plan.totalDurationSeconds, 0.155);
  assert.equal(plan.frameCount, Math.ceil(0.155 * 44_100));
});

test("the tail-aware duration guard rejects before constructing OfflineAudioContext", async () => {
  let constructions = 0;
  class NeverConstructed {
    constructor() { constructions += 1; }
  }
  await assert.rejects(renderV2ArrangementOffline(audibleArrangement(), {
    OfflineAudioContextClass: NeverConstructed,
    maxDurationSeconds: 0.145,
  }), /tail exceeds the render limit/);
  assert.equal(constructions, 0);
});

test("empty arrangements fail before any offline allocation", () => {
  assert.throws(() => createV2ArrangementRenderPlan(createDefaultV2Project()), /audible Playlist note/);
});
