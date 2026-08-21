import assert from "node:assert/strict";
import test from "node:test";

import {
  V2_EXPORT_SAMPLE_RATE,
  createV2ArrangementRenderPlan,
  renderV2ArrangementOffline,
} from "../src/v2/audio/offline-renderer.js";
import {
  createDefaultInstrumentInstance,
  createDefaultV2Project,
} from "../src/v2/domain/index.js";

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

function createOfflineHarness() {
  const nodes = [];
  function param(value = 0) {
    return {
      value,
      cancelScheduledValues() {},
      linearRampToValueAtTime(next) { this.value = next; },
      setValueAtTime(next) { this.value = next; },
    };
  }
  function node(kind, extra = {}) {
    const value = {
      kind,
      connections: new Set(),
      connect(destination) { this.connections.add(destination); return destination; },
      disconnect(destination) {
        if (destination === undefined) this.connections.clear();
        else this.connections.delete(destination);
      },
      ...extra,
    };
    nodes.push(value);
    return value;
  }
  const context = {
    currentTime: 0,
    sampleRate: 44_100,
    createAnalyser: () => node("analyser"),
    createGain: () => node("gain", { gain: param(1) }),
    createStereoPanner: () => node("panner", { pan: param(0) }),
  };
  context.destination = node("destination");
  const audioBuffer = { rendered: true };
  context.startRendering = async () => audioBuffer;
  return { audioBuffer, context, nodes };
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

test("offline rendering dispatches mixed Chip and Drums events and disposes the router", async () => {
  const project = audibleArrangement();
  project.patterns[0].notes.push({
    id: "chip-only-unmapped-drum",
    pitch: 59,
    startTick: 24,
    durationTicks: 24,
    velocity: 0.6,
  });
  project.tracks.push({
    id: "track-drums",
    name: "Drums",
    instrument: structuredClone(createDefaultInstrumentInstance(
      "instrument-drums",
      "klinto-drums",
    )),
    mixer: { volume: 1, pan: 0, muted: false, solo: false, effects: [] },
    clips: [{ id: "clip-drums", patternId: "pattern-1", startTick: 0 }],
  });
  const audio = createOfflineHarness();
  const triggered = [];
  const outputNodes = new Map();
  let routerDisposals = 0;
  let routerOptions = null;
  const result = await renderV2ArrangementOffline(project, {
    createOfflineAudioContext(options) {
      assert.equal(options.sampleRate, 44_100);
      return audio.context;
    },
    createSynthRouter(options) {
      routerOptions = options;
      return {
        dispose() { routerDisposals += 1; return true; },
        trigger(event) {
          triggered.push(event);
          outputNodes.set(event.trackId, options.getOutputNode(event.trackId));
          return { retire() { return true; }, stop() { return true; } };
        },
      };
    },
  });

  assert.equal(result.audioBuffer, audio.audioBuffer);
  assert.equal(routerOptions.context, audio.context);
  assert.equal(routerOptions.mode, "offline");
  assert.ok(outputNodes.get("track-1"));
  assert.ok(outputNodes.get("track-drums"));
  assert.deepEqual(
    triggered.map(({ instrumentType, noteId }) => [instrumentType, noteId]).sort(),
    [
      ["klinto-chip", "chip-only-unmapped-drum"],
      ["klinto-chip", "note-1"],
      ["klinto-drums", "note-1"],
    ],
  );
  assert.equal(triggered.every(({ startTime, startSeconds }) => startTime === startSeconds), true);
  assert.equal(routerDisposals, 1);
  assert.equal(
    audio.nodes.every((node) => node.kind === "destination" || node.connections.size === 0),
    true,
  );
});
