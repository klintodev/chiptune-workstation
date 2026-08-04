import assert from "node:assert/strict";
import test from "node:test";

import { createDeviceRuntimeRegistry } from "../src/v2/audio/runtime-registry.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";

function createParam(initialValue = 0) {
  return {
    events: [],
    value: initialValue,
    cancelAndHoldAtTime(time) { this.events.push(["hold", time]); },
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

function createContext() {
  const nodes = [];
  const context = {
    currentTime: 0,
    sampleRate: 48_000,
    createAnalyser: () => createNode("analyser", { fftSize: 256 }),
    createDelay: (maxDelayTime) => createNode("delay", { delayTime: createParam(), maxDelayTime }),
    createGain: () => createNode("gain", { gain: createParam(1) }),
    createStereoPanner: () => createNode("panner", { pan: createParam(0) }),
  };

  function createNode(kind, extra = {}) {
    const connections = new Set();
    const node = {
      connections,
      context,
      kind,
      connect(destination) { connections.add(destination); return destination; },
      disconnect(destination) {
        if (destination === undefined) connections.clear();
        else connections.delete(destination);
      },
      ...extra,
    };
    nodes.push(node);
    return node;
  }

  context.destination = createNode("destination");
  return { context, nodes };
}

function delay(instanceId) {
  return {
    instanceId,
    type: "klinto-delay",
    version: 1,
    bypassed: false,
    params: { timeDivision: "1/8", feedback: 0.3, mix: 0.5 },
  };
}

test("serial Track and Master Delays cap from each processor's routed input end", () => {
  const harness = createContext();
  const project = structuredClone(createDefaultV2Project());
  project.tracks[0].mixer.effects = [delay("track-delay")];
  project.mixer.master.effects = [delay("master-delay")];
  const registry = createDeviceRuntimeRegistry({
    context: harness.context,
    scheduleTransition: () => () => {},
  });
  registry.sync(project);

  assert.equal(registry.markTrackInput("track-1", 2), true);
  const trackWet = registry.getEffectRuntime("track-delay").wetGainNode.gain.events;
  const masterWet = registry.getEffectRuntime("master-delay").wetGainNode.gain.events;
  assert.ok(trackWet.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 12
  )));
  assert.ok(masterWet.some((event) => (
    event[0] === "set" && Math.abs(event[2] - 21.98) < 1e-12
  )));
  assert.ok(masterWet.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 22
  )));

  registry.dispose();
  assert.equal(
    harness.nodes.every((node) => node.kind === "destination" || node.connections.size === 0),
    true,
  );
});
