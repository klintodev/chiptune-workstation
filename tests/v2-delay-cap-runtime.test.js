import assert from "node:assert/strict";
import test from "node:test";

import { createKlintoDelayRuntime } from "../src/v2/audio/web-audio-runtime.js";

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

function createHarness({ currentTime = 5 } = {}) {
  const tasks = [];
  const nodes = [];
  const context = {
    currentTime,
    createDelay(maxDelayTime) {
      return createNode("delay", { delayTime: createParam(), maxDelayTime });
    },
    createGain() {
      return createNode("gain", { gain: createParam(1) });
    },
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

  function schedule(delaySeconds, callback) {
    const task = { active: true, callback, delaySeconds };
    tasks.push(task);
    return () => { task.active = false; };
  }

  return { context, nodes, schedule, tasks };
}

function delay(feedback = 0.3) {
  return {
    instanceId: "delay-1",
    type: "klinto-delay",
    version: 1,
    bypassed: false,
    params: { timeDivision: "1/8", feedback, mix: 0.5 },
  };
}

test("Delay caps wet output ten seconds after actual input end and later input extends it", () => {
  const harness = createHarness();
  const runtime = createKlintoDelayRuntime({
    context: harness.context,
    instance: delay(),
    scheduleTransition: harness.schedule,
  });
  const firstCore = runtime.delayNode;

  assert.equal(runtime.markNonSilentInput(7), true);
  assert.ok(runtime.wetGainNode.gain.events.some((event) => (
    event[0] === "set" && Math.abs(event[2] - 16.98) < 1e-12
  )));
  assert.ok(runtime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 17
  )));
  assert.equal(harness.tasks.at(-1).delaySeconds, 12);

  const firstTask = harness.tasks.at(-1);
  assert.equal(runtime.markNonSilentInput(9), true);
  assert.equal(firstTask.active, false);
  assert.equal(harness.tasks.at(-1).delaySeconds, 14);
  assert.ok(runtime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 19
  )));

  const extendedTask = harness.tasks.at(-1);
  assert.equal(runtime.markNonSilentInput(8), true);
  assert.equal(extendedTask.active, false);
  assert.equal(harness.tasks.at(-1).delaySeconds, 14);
  assert.ok(runtime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 19
  )), "an earlier input report must not shorten the active tail deadline");

  harness.context.currentTime = 19;
  harness.tasks.at(-1).callback();
  assert.notEqual(runtime.delayNode, firstCore);
  assert.throws(() => runtime.markNonSilentInput(Number.NaN), /input end time/);
  runtime.dispose();
});

test("Delay waits for the final overlapping input owner before arming its cap", () => {
  const harness = createHarness({ currentTime: 0 });
  const runtime = createKlintoDelayRuntime({
    context: harness.context,
    instance: delay(),
    scheduleTransition: harness.schedule,
  });

  assert.equal(runtime.markNonSilentInput(0, { inputId: "voice-a", phase: "start" }), true);
  assert.equal(runtime.markNonSilentInput(0, { inputId: "voice-b", phase: "start" }), true);
  assert.equal(runtime.getActiveInputCount(), 2);
  assert.equal(harness.tasks.length, 0);

  assert.equal(runtime.markNonSilentInput(2, { inputId: "voice-a", phase: "end" }), true);
  assert.equal(runtime.getActiveInputCount(), 1);
  assert.equal(harness.tasks.length, 0, "one ending voice cannot arm the shared Delay cap");

  assert.equal(runtime.markNonSilentInput(5, { inputId: "voice-b", phase: "active" }), true);
  assert.equal(harness.tasks.length, 0, "an active heartbeat cannot arm the cap either");
  assert.equal(runtime.markNonSilentInput(7, { inputId: "voice-b", phase: "end" }), true);
  assert.equal(runtime.getActiveInputCount(), 0);
  assert.equal(harness.tasks.at(-1).delaySeconds, 17);
  assert.ok(runtime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 17
  )));
  assert.equal(
    runtime.markNonSilentInput(8, { inputId: "voice-b", phase: "end" }),
    false,
    "duplicate ends are idempotent",
  );
  assert.throws(
    () => runtime.markNonSilentInput(8, { inputId: "voice-c", phase: "paused" }),
    /lifecycle phase/,
  );
  assert.throws(() => runtime.markNonSilentInput(8, { inputId: "", phase: "start" }), /inputId/);
  runtime.dispose();
});

test("offline-style scheduling writes the final 20 ms fade without a wall-clock callback", () => {
  const harness = createHarness({ currentTime: 0 });
  const runtime = createKlintoDelayRuntime({
    context: harness.context,
    instance: delay(),
    scheduleTransition: () => () => {},
  });

  runtime.markNonSilentInput(2);
  assert.ok(runtime.wetGainNode.gain.events.some((event) => (
    event[0] === "set" && Math.abs(event[2] - 11.98) < 1e-12
  )));
  assert.ok(runtime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 12
  )));

  runtime.update(delay(0.5), { bpm: 120 });
  assert.equal(
    runtime.wetGainNode.gain.events.filter((event) => (
      event[0] === "ramp" && event[1] === 0 && event[2] === 12
    )).length,
    2,
    "parameter smoothing must re-arm the original absolute cap instead of extending it",
  );
  runtime.dispose();
});
