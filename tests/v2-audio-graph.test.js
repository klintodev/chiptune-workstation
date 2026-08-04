import assert from "node:assert/strict";
import test from "node:test";

import {
  createKlintoChipOutputRuntime,
  createKlintoDelayRuntime,
  createKlintoFilterRuntime,
} from "../src/v2/audio/web-audio-runtime.js";
import { createDeviceRuntimeRegistry } from "../src/v2/audio/runtime-registry.js";
import { describeProjectAudioRoute, selectAudibleTrackIds } from "../src/v2/audio/route-descriptor.js";

function createParam(initialValue = 0) {
  return {
    events: [],
    value: initialValue,
    cancelScheduledValues(time) { this.events.push(["cancel", time]); },
    linearRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push(["ramp", value, time]);
    },
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push(["set", value, time]);
    },
  };
}

function createHarness({ sampleRate = 48_000 } = {}) {
  let nextNodeId = 1;
  const nodes = [];
  const tasks = [];
  const context = {
    currentTime: 2,
    sampleRate,
    createAnalyser: () => makeNode("analyser"),
    createBiquadFilter() {
      return makeNode("biquad", {
        Q: createParam(),
        frequency: createParam(),
        type: "allpass",
      });
    },
    createDelay(maxDelayTime) {
      return makeNode("delay", { delayTime: createParam(), maxDelayTime });
    },
    createGain: () => makeNode("gain", { gain: createParam(1) }),
    createStereoPanner: () => makeNode("panner", { pan: createParam() }),
  };
  context.destination = makeNode("destination");

  function makeNode(kind, extra = {}) {
    const node = {
      connectCalls: [],
      connections: new Set(),
      context,
      disconnectAllCalls: 0,
      disconnectCalls: [],
      id: nextNodeId++,
      kind,
      connect(destination) {
        node.connectCalls.push(destination);
        node.connections.add(destination);
        return destination;
      },
      disconnect(destination) {
        node.disconnectCalls.push(destination);
        if (destination === undefined) {
          node.disconnectAllCalls += 1;
          node.connections.clear();
        } else node.connections.delete(destination);
      },
      ...extra,
    };
    nodes.push(node);
    return node;
  }

  function schedule(delaySeconds, callback) {
    const task = { active: true, callback, delaySeconds };
    tasks.push(task);
    return () => { task.active = false; };
  }

  function run(delaySeconds) {
    const runnable = tasks.filter((task) => task.active && task.delaySeconds === delaySeconds);
    for (const task of runnable) {
      task.active = false;
      task.callback();
    }
  }

  function flush() {
    while (tasks.some((task) => task.active)) {
      const next = tasks.find((task) => task.active);
      next.active = false;
      next.callback();
    }
  }

  return { context, flush, nodes, run, schedule, tasks };
}

function instrument(instanceId, overrides = {}) {
  return {
    instanceId,
    type: "klinto-chip",
    version: 1,
    params: {
      waveform: "square",
      octave: 0,
      attackSeconds: 0.008,
      releaseSeconds: 0.03,
      level: 0.35,
      ...overrides,
    },
  };
}

function effect(type, instanceId, overrides = {}, bypassed = false) {
  return type === "klinto-filter"
    ? {
        instanceId,
        type,
        version: 1,
        bypassed,
        params: { cutoffHz: 12_000, q: 0.7, ...overrides },
      }
    : {
        instanceId,
        type,
        version: 1,
        bypassed,
        params: { timeDivision: "1/8", feedback: 0.3, mix: 0.2, ...overrides },
      };
}

function projectFixture() {
  return {
    transport: { bpm: 120 },
    tracks: [
      {
        id: "track-1",
        instrument: instrument("instrument-1"),
        mixer: {
          volume: 0.8,
          pan: -0.25,
          muted: false,
          solo: false,
          effects: [effect("klinto-delay", "track-delay")],
        },
      },
      {
        id: "track-2",
        instrument: instrument("instrument-2", { waveform: "saw" }),
        mixer: {
          volume: 0.6,
          pan: 0.25,
          muted: false,
          solo: false,
          effects: [effect("klinto-filter", "track-filter")],
        },
      },
    ],
    mixer: {
      master: {
        volume: 0.35,
        effects: [effect("klinto-delay", "master-delay")],
      },
    },
  };
}

test("the pure descriptor selects audible Tracks and shares exactly one Master route", () => {
  const project = projectFixture();
  project.tracks[0].mixer.solo = true;
  project.tracks[1].mixer.muted = true;
  assert.deepEqual(selectAudibleTrackIds(project.tracks), ["track-1"]);
  const route = describeProjectAudioRoute(project);
  assert.equal(route.tracks[0].destination, route.masterBus);
  assert.equal(route.tracks[1].destination, route.masterBus);
  assert.equal(route.master.source, route.masterBus);
  assert.deepEqual(route.master.insertChain.map(({ instanceId }) => instanceId), ["master-delay"]);
  assert.equal(route.tracks[0].channelGain, 0.8);
  assert.equal(route.tracks[1].channelGain, 0);
});

test("Chip output is stable, smooths level and captures future voice parameters", () => {
  const harness = createHarness();
  const runtime = createKlintoChipOutputRuntime({
    context: harness.context,
    instance: instrument("chip", { waveform: "saw" }),
    scheduleTransition: harness.schedule,
  });
  const output = runtime.output;
  assert.equal(runtime.input, output);
  assert.equal(runtime.getVoiceParameters().webAudioWaveform, "sawtooth");
  runtime.update(instrument("chip", { waveform: "triangle", level: 0.6 }));
  assert.equal(runtime.output, output);
  assert.equal(runtime.getVoiceParameters().webAudioWaveform, "triangle");
  assert.deepEqual(output.gain.events.at(-1), ["ramp", 0.6, 2.015]);
  assert.equal(runtime.dispose(), true);
  assert.equal(runtime.dispose(), false);
});

test("Filter clamps below Nyquist and bypass owns a 20 ms transition", () => {
  const harness = createHarness({ sampleRate: 32_000 });
  const runtime = createKlintoFilterRuntime({
    context: harness.context,
    instance: effect("klinto-filter", "filter", { cutoffHz: 20_000 }),
    scheduleTransition: harness.schedule,
  });
  assert.equal(runtime.filterNode.type, "lowpass");
  assert.equal(runtime.filterNode.frequency.value, 15_999);
  runtime.update(effect("klinto-filter", "filter", { cutoffHz: 1_000, q: 10 }));
  assert.deepEqual(runtime.filterNode.Q.events.at(-1), ["ramp", 10, 2.015]);
  assert.equal(runtime.setBypassed(true), true);
  assert.ok(harness.tasks.some((task) => task.active && task.delaySeconds === 0.02));
  harness.run(0.02);
  assert.equal(runtime.input.connections.has(runtime.output), true);
  assert.equal(runtime.input.connections.has(runtime.filterNode), false);
  assert.equal(runtime.dispose(), true);
  assert.equal(runtime.dispose(), false);
});

test("Delay uses equal-power mix and fresh bounded lines for time and bypass", () => {
  const harness = createHarness();
  const runtime = createKlintoDelayRuntime({
    bpm: 120,
    context: harness.context,
    instance: effect("klinto-delay", "delay", { mix: 0.5 }),
    scheduleTransition: harness.schedule,
  });
  assert.ok(Math.abs(runtime.dryGainNode.gain.value - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(runtime.wetGainNode.gain.value - Math.SQRT1_2) < 1e-12);
  assert.equal(runtime.delayNode.delayTime.value, 0.25);
  const firstLine = runtime.delayNode;

  runtime.update(effect("klinto-delay", "delay", {
    mix: 0.5,
    timeDivision: "1/4",
  }), { bpm: 120 });
  const replacement = runtime.delayNode;
  assert.notEqual(replacement, firstLine);
  assert.equal(replacement.delayTime.value, 0.5);
  assert.ok(harness.tasks.some((task) => task.active && task.delaySeconds === 0.05));
  harness.run(0.05);
  assert.ok(firstLine.disconnectAllCalls > 0);

  assert.equal(runtime.setBypassed(true), true);
  assert.equal(runtime.dryGainNode.gain.value, 1);
  assert.ok(harness.tasks.some((task) => task.active && task.delaySeconds === 0.02));
  harness.run(0.02);
  assert.equal(runtime.delayNode, null);
  assert.ok(replacement.disconnectAllCalls > 0);
  assert.equal(runtime.setBypassed(false), true);
  assert.notEqual(runtime.delayNode, replacement);
  assert.equal(runtime.dispose(), true);
  assert.equal(runtime.dispose(), false);
  assert.equal(harness.nodes.every((node) => node.kind === "destination" || node.connections.size === 0), true);
});

test("same-ID device replacement retires the old runtime through the structural fade", () => {
  const harness = createHarness();
  const registry = createDeviceRuntimeRegistry({
    context: harness.context,
    scheduleTransition: harness.schedule,
  });
  const project = projectFixture();
  registry.sync(project);

  const previous = registry.getEffectRuntime("track-delay");
  const previousOutput = previous.output;
  const previousDelay = previous.delayNode;
  const replacement = structuredClone(project);
  replacement.tracks[0].mixer.effects[0] = effect("klinto-filter", "track-delay");

  registry.sync(replacement);
  const current = registry.getEffectRuntime("track-delay");
  assert.notEqual(current, previous);
  assert.equal(current.getState().params.cutoffHz, 12_000);
  assert.equal(previousOutput.disconnectAllCalls, 0, "replacement must not hard-dispose the old output");
  assert.equal(previousDelay.disconnectAllCalls, 0, "replacement must retain the old processor during fade-out");
  assert.ok(harness.tasks.some((task) => task.active && task.delaySeconds === 0.025));
  assert.ok(harness.tasks.some((task) => task.active && task.delaySeconds === 0.05));

  harness.run(0.025);
  assert.equal(previousOutput.disconnectAllCalls, 0);
  assert.equal(previousDelay.disconnectAllCalls, 0);
  harness.run(0.05);
  assert.ok(previousOutput.disconnectAllCalls > 0);
  assert.ok(previousDelay.disconnectAllCalls > 0);

  harness.flush();
  assert.equal(registry.dispose(), true);
  assert.equal(harness.nodes.every((node) => node.kind === "destination" || node.connections.size === 0), true);
});

test("runtime registry preserves identities and constructs the shared Master Effect once", () => {
  const harness = createHarness();
  const creations = [];
  const registry = createDeviceRuntimeRegistry({
    context: harness.context,
    onRuntimeCreated: (entry) => creations.push(entry),
    scheduleTransition: harness.schedule,
  });
  const project = projectFixture();
  const route = registry.sync(project);
  const masterEffect = registry.getEffectRuntime("master-delay");
  const firstInstrument = registry.getInstrumentRuntime("instrument-1");
  const master = registry.getMasterRuntime();
  assert.equal(route.master.insertChain.length, 1);
  assert.equal(creations.filter(({ instanceId }) => instanceId === "master-delay").length, 1);
  assert.equal(harness.nodes.filter((node) => node.connections.has(master.bus)).length, 2);
  assert.deepEqual(registry.getStats(), {
    effectCount: 3,
    instrumentCount: 2,
    masterCreated: true,
    routeEdgeCount: 14,
    trackCount: 2,
  });
  const routedDisconnects = () => harness.nodes.reduce((total, node) => total + node.disconnectCalls.length, 0);
  const initialDisconnects = routedDisconnects();

  const updated = structuredClone(project);
  updated.tracks.reverse();
  updated.tracks.find(({ id }) => id === "track-1").instrument.params.level = 0.5;
  updated.mixer.master.volume = 0.5;
  registry.sync(updated);
  assert.equal(registry.getMasterRuntime(), master);
  assert.equal(registry.getEffectRuntime("master-delay"), masterEffect);
  assert.equal(registry.getInstrumentRuntime("instrument-1"), firstInstrument);
  assert.equal(creations.filter(({ instanceId }) => instanceId === "master-delay").length, 1);
  assert.equal(routedDisconnects(), initialDisconnects, "scalar updates must not rebuild routing");
  assert.equal(harness.tasks.some((task) => task.active && task.delaySeconds === 0.025), false);

  const reduced = structuredClone(updated);
  reduced.tracks = reduced.tracks.filter(({ id }) => id === "track-1");
  registry.sync(reduced);
  assert.equal(registry.getEffectRuntime("track-filter"), null);
  assert.equal(registry.getInstrumentRuntime("instrument-2"), null);
  assert.equal(registry.getStats().routeEdgeCount, 14, "old topology remains through fade-out");
  assert.ok(harness.tasks.some((task) => task.active && task.delaySeconds === 0.025));
  assert.deepEqual(master.volumeNode.gain.events.at(-1), ["ramp", 0, 2.025]);
  harness.run(0.025);
  assert.equal(registry.getStats().routeEdgeCount, 9);
  assert.deepEqual(master.volumeNode.gain.events.at(-1), ["ramp", 0.5, 2.025]);
  assert.ok(harness.tasks.some((task) => task.active && task.delaySeconds === 0.05));
  harness.flush();
  assert.equal(registry.dispose(), true);
  assert.equal(registry.dispose(), false);
  assert.equal(harness.nodes.every((node) => node.kind === "destination" || node.connections.size === 0), true);
});
