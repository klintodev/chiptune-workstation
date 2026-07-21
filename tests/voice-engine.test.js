import assert from "node:assert/strict";
import test from "node:test";

import { createVoiceEngine } from "../src/audio/voice-engine.js";

function createAudioHarness({ maxVoices = Infinity } = {}) {
  let now = 0;
  const gainNodes = [];
  const periodicWaves = [];
  const sources = [];
  const context = {
    sampleRate: 48_000,
    get currentTime() { return now; },
    createBuffer(numberOfChannels, length, sampleRate) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return {
        getChannelData: (index) => channels[index],
        length,
        numberOfChannels,
        sampleRate,
      };
    },
    createBufferSource() {
      const source = {
        playbackRate: { value: 1 },
        addEventListener() {},
        connect() {},
        disconnect() {},
        start() {},
        stop(time) { source.stopTime = time; },
      };
      sources.push(source);
      return source;
    },
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
        setPeriodicWave(wave) { source.periodicWave = wave; },
        start() {},
        stop(time) { source.stopTime = time; },
      };
      sources.push(source);
      return source;
    },
    createPeriodicWave(real, imaginary) {
      const wave = { imaginary: [...imaginary], real: [...real] };
      periodicWaves.push(wave);
      return wave;
    },
  };
  const output = { context };
  const voiceEngine = createVoiceEngine({
    getAudioTime: () => now,
    getOutputNode: () => output,
    maxVoices,
  });

  return {
    gainNodes,
    periodicWaves,
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

test("the oldest voice is retired when the per-track limit is reached", () => {
  const harness = createAudioHarness({ maxVoices: 2 });

  harness.voiceEngine.trigger();
  harness.setTime(0.1);
  harness.voiceEngine.trigger();
  harness.setTime(0.2);
  harness.voiceEngine.trigger();

  assert.equal(harness.voiceEngine.getActiveVoiceCount(), 2);
  assert.equal(harness.sources[0].stopTime, 0.2);
  assert.equal(harness.sources[1].stopTime, undefined);
  assert.equal(harness.sources[2].stopTime, undefined);
});
test("pulse-width voices use reusable periodic waves", () => {
  const harness = createAudioHarness();

  harness.voiceEngine.trigger({ type: "pulse25" });
  harness.voiceEngine.trigger({ type: "pulse25" });
  harness.voiceEngine.trigger({ type: "pulse12" });

  assert.equal(harness.periodicWaves.length, 2);
  assert.equal(harness.sources[0].periodicWave, harness.sources[1].periodicWave);
  assert.notEqual(harness.sources[0].periodicWave, harness.sources[2].periodicWave);
});

test("noise voices use note frequency to tune their sample-and-hold clock", () => {
  const harness = createAudioHarness();

  harness.voiceEngine.trigger({ frequency: 220, type: "noise" });
  harness.voiceEngine.trigger({ frequency: 880, type: "noise" });

  assert.equal(harness.sources[0].playbackRate.value, 0.5);
  assert.equal(harness.sources[1].playbackRate.value, 2);
  assert.equal(harness.sources[0].buffer, harness.sources[1].buffer);
});
