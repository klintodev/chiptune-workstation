import assert from "node:assert/strict";
import test from "node:test";

import { createVoiceEngine } from "../src/audio/voice-engine.js";

function createAudioHarness() {
  let now = 0;
  const gainNodes = [];
  const sources = [];
  const context = {
    get currentTime() { return now; },
    createGain() {
      const events = [];
      const node = {
        context,
        events,
        gain: {
          value: 0,
          cancelScheduledValues: (time) => events.push(["cancel", time]),
          exponentialRampToValueAtTime: (value, time) => events.push(["exponential", value, time]),
          linearRampToValueAtTime: (value, time) => events.push(["linear", value, time]),
          setValueAtTime: (value, time) => events.push(["set", value, time]),
        },
        connect() {},
        disconnect() {},
      };
      gainNodes.push(node);
      return node;
    },
    createOscillator() {
      const source = {
        frequency: { value: 0 },
        addEventListener() {},
        connect() {},
        disconnect() {},
        start() {},
        stop(time) { source.stopTime = time; },
      };
      sources.push(source);
      return source;
    },
  };
  const output = { context };
  const voiceEngine = createVoiceEngine({
    getAudioTime: () => now,
    getOutputNode: () => output,
  });

  return {
    gainNodes,
    sources,
    voiceEngine,
    setTime: (time) => { now = time; },
  };
}

test("releasing during attack begins from the reached gain instead of peak volume", () => {
  const harness = createAudioHarness();
  const voice = harness.voiceEngine.trigger({ attackSeconds: 1, releaseSeconds: 0.5 });

  harness.setTime(0.25);
  voice.stop();

  const voiceGainEvents = harness.gainNodes[1].events;
  const heldGainEvent = voiceGainEvents.find(
    ([operation, , time]) => operation === "set" && time === 0.25,
  );
  assert.ok(heldGainEvent);
  assert.ok(heldGainEvent[1] > 0.0001);
  assert.ok(heldGainEvent[1] < 1);
  assert.deepEqual(voiceGainEvents.at(-1), ["exponential", 0.0001, 0.75]);
  assert.equal(harness.sources[0].stopTime, 0.76);
});
