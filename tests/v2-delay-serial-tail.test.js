import assert from "node:assert/strict";
import test from "node:test";

import { createV2KeyboardAudition } from "../src/v2/audio/keyboard-audition.js";
import { createDeviceRuntimeRegistry } from "../src/v2/audio/runtime-registry.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";

function keyEvent(type, code) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries({
    altKey: false,
    code,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
  })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

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

test("overlapping owners defer serial Track and Master Delay caps until the final route end", () => {
  const harness = createContext();
  const project = structuredClone(createDefaultV2Project());
  project.tracks[0].mixer.effects = [delay("track-delay")];
  project.mixer.master.effects = [delay("master-delay")];
  const registry = createDeviceRuntimeRegistry({
    context: harness.context,
    scheduleTransition: () => () => {},
  });
  registry.sync(project);

  const lifecycle = (inputId, phase) => ({ inputId, phase });
  assert.equal(registry.markTrackInput("track-1", 0, lifecycle("voice-a", "start")), true);
  assert.equal(registry.markTrackInput("track-1", 0, lifecycle("voice-b", "start")), true);
  assert.equal(registry.markTrackInput("track-1", 2, lifecycle("voice-a", "end")), true);
  const trackWet = registry.getEffectRuntime("track-delay").wetGainNode.gain.events;
  const masterWet = registry.getEffectRuntime("master-delay").wetGainNode.gain.events;
  assert.equal(trackWet.some((event) => event[0] === "ramp" && event[1] === 0), false);
  assert.equal(masterWet.some((event) => event[0] === "ramp" && event[1] === 0), false);

  assert.equal(registry.markTrackInput("track-1", 5, lifecycle("voice-b", "end")), true);
  assert.ok(trackWet.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 15
  )));
  assert.ok(masterWet.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 25
  )));
  registry.dispose();
});

test("Master Delay keeps identical input IDs distinct across overlapping Tracks", () => {
  const harness = createContext();
  const project = structuredClone(createDefaultV2Project());
  const secondTrack = structuredClone(project.tracks[0]);
  secondTrack.id = "track-2";
  secondTrack.name = "Track 2";
  secondTrack.instrument.instanceId = "instrument-track-2";
  secondTrack.clips = [];
  project.tracks.push(secondTrack);
  project.mixer.master.effects = [delay("master-delay")];
  const registry = createDeviceRuntimeRegistry({
    context: harness.context,
    scheduleTransition: () => () => {},
  });
  registry.sync(project);

  const start = { inputId: "voice-1", phase: "start" };
  const end = { inputId: "voice-1", phase: "end" };
  assert.equal(registry.markTrackInput("track-1", 0, start), true);
  assert.equal(registry.markTrackInput("track-2", 0, start), true);
  const masterRuntime = registry.getEffectRuntime("master-delay");
  assert.equal(masterRuntime.getActiveInputCount(), 2);
  assert.equal(registry.markTrackInput("track-1", 2, end), true);
  assert.equal(masterRuntime.getActiveInputCount(), 1);
  assert.equal(
    masterRuntime.wetGainNode.gain.events.some((event) => event[0] === "ramp" && event[1] === 0),
    false,
  );

  assert.equal(registry.markTrackInput("track-2", 4, end), true);
  assert.equal(masterRuntime.getActiveInputCount(), 0);
  assert.ok(masterRuntime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0 && event[2] === 14
  )));
  registry.dispose();
});

test("a Delay inserted during a held keyboard voice reconciles before release without a heartbeat", () => {
  const harness = createContext();
  const documentLike = new EventTarget();
  documentLike.querySelectorAll = () => [];
  let audioTime = 0;
  let heartbeatCalls = 0;
  let project = structuredClone(createDefaultV2Project());
  const registry = createDeviceRuntimeRegistry({
    context: harness.context,
    scheduleTransition: () => () => {},
  });
  registry.sync(project);
  const audition = createV2KeyboardAudition({
    audioEngine: {
      getCurrentTime: () => audioTime,
      isReady: () => true,
    },
    documentLike,
    ensureAudioGraph: () => true,
    getProject: () => project,
    getSynthRuntime: () => ({
      trigger() {
        const listeners = new Set();
        let ended = false;
        return {
          addEndedListener(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          get ended() { return ended; },
          retire: () => false,
          stop() {
            if (ended) return false;
            ended = true;
            for (const listener of listeners) listener();
            return true;
          },
        };
      },
    }),
    getTrackId: () => "track-1",
    keyupTarget: documentLike,
    onTrackInput: (trackId, event, lifecycle) => (
      registry.markTrackInput(trackId, event.releaseEndTime, lifecycle)
    ),
    setIntervalLike() {
      heartbeatCalls += 1;
      return 1;
    },
  });

  documentLike.dispatchEvent(keyEvent("keydown", "KeyZ"));
  project = structuredClone(project);
  project.tracks[0].mixer.effects = [delay("track-delay")];
  project.mixer.master.effects = [delay("master-delay")];
  registry.sync(project);
  const trackRuntime = registry.getEffectRuntime("track-delay");
  const masterRuntime = registry.getEffectRuntime("master-delay");
  assert.equal(trackRuntime.getActiveInputCount(), 1);
  assert.equal(masterRuntime.getActiveInputCount(), 1);

  audioTime = 2;
  const keyup = keyEvent("keyup", "KeyZ");
  documentLike.dispatchEvent(keyup);
  assert.equal(keyup.defaultPrevented, true);
  const releaseEndTime = 2 + project.tracks[0].instrument.params.releaseSeconds + 0.01;
  assert.equal(trackRuntime.getActiveInputCount(), 0);
  assert.equal(masterRuntime.getActiveInputCount(), 0);
  assert.ok(trackRuntime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0
      && Math.abs(event[2] - (releaseEndTime + 10)) < 1e-12
  )));
  assert.ok(masterRuntime.wetGainNode.gain.events.some((event) => (
    event[0] === "ramp" && event[1] === 0
      && Math.abs(event[2] - (releaseEndTime + 20)) < 1e-12
  )));
  assert.equal(heartbeatCalls, 1, "the interval is registered but never fires before release");
  audition.dispose();
  registry.dispose();
});
