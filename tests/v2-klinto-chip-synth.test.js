import assert from "node:assert/strict";
import test from "node:test";

import { createKlintoChipSynthRuntime } from "../src/v2/audio/klinto-chip-synth.js";

function harness() {
  const gains = [];
  const sources = [];
  const periodicWaves = [];
  const context = {
    currentTime: 1,
    sampleRate: 48_000,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (index) => data[index], sampleRate };
    },
    createBufferSource: () => source("buffer"),
    createGain() {
      const events = [];
      const node = audioNode("gain", {
        gain: {
          value: 1,
          cancelScheduledValues: (time) => events.push(["cancel", time]),
          exponentialRampToValueAtTime: (value, time) => events.push(["exponential", value, time]),
          linearRampToValueAtTime: (value, time) => events.push(["linear", value, time]),
          setValueAtTime: (value, time) => events.push(["set", value, time]),
        },
        events,
      });
      gains.push(node);
      return node;
    },
    createOscillator: () => source("oscillator"),
    createPeriodicWave(real, imaginary) {
      const wave = { imaginary, real };
      periodicWaves.push(wave);
      return wave;
    },
  };
  const output = audioNode("output");

  function audioNode(kind, extra = {}) {
    return {
      connections: new Set(),
      disconnected: false,
      kind,
      connect(destination) { this.connections.add(destination); return destination; },
      disconnect() { this.disconnected = true; this.connections.clear(); },
      ...extra,
    };
  }

  function source(kind) {
    const listeners = new Map();
    const node = audioNode(kind, {
      frequency: { value: 0 },
      playbackRate: { value: 1 },
      addEventListener(type, listener) { listeners.set(type, listener); },
      emit(type) { listeners.get(type)?.(); },
      setPeriodicWave(wave) { node.periodicWave = wave; },
      start(time) { node.startTime = time; },
      stop(time) { node.stopTime = time; },
    });
    sources.push(node);
    return node;
  }

  const runtime = createKlintoChipSynthRuntime({
    context,
    getOutputNode: () => output,
    random: () => 0.25,
  });
  return { context, gains, output, periodicWaves, runtime, sources };
}

function event(overrides = {}) {
  return {
    attackSeconds: 0.008,
    durationSeconds: 0.25,
    effectivePitch: 60,
    frequencyHz: 261.625565,
    ownership: { occurrenceId: "voice-1", trackId: "track-1" },
    releaseSeconds: 0.03,
    startTime: 2,
    trackId: "track-1",
    velocity: 0.7,
    waveform: "square",
    ...overrides,
  };
}

test("production Chip synthesis schedules waveform, envelope, gate and cancellable retirement", () => {
  const audio = harness();
  const voice = audio.runtime.trigger(event({ waveform: "saw" }));
  assert.equal(audio.sources[0].type, "sawtooth");
  assert.equal(audio.sources[0].frequency.value, 261.625565);
  assert.equal(audio.sources[0].startTime, 2);
  assert.ok(Math.abs(audio.sources[0].stopTime - 2.29) < 1e-12);
  assert.deepEqual(audio.gains[0].events.slice(0, 2), [
    ["set", 0.0001, 2],
    ["exponential", 0.7, 2.008],
  ]);
  assert.equal(voice.retire(1.5), true);
  assert.equal(audio.sources[0].stopTime, 1.505);
  assert.deepEqual(audio.gains[0].events.at(-1), ["linear", 0.0001, 1.505]);
});

test("pulse waves and noise buffers are cached while disposal disconnects every owned voice", () => {
  const audio = harness();
  audio.runtime.trigger(event({ ownership: { occurrenceId: "p1" }, waveform: "pulse25" }));
  audio.runtime.trigger(event({ ownership: { occurrenceId: "p2" }, waveform: "pulse25" }));
  audio.runtime.trigger(event({
    effectivePitch: 57,
    frequencyHz: 220,
    ownership: { occurrenceId: "n1" },
    waveform: "noise",
  }));
  audio.runtime.trigger(event({
    effectivePitch: 81,
    frequencyHz: 880,
    ownership: { occurrenceId: "n2" },
    waveform: "noise",
  }));
  assert.equal(audio.periodicWaves.length, 1);
  assert.equal(audio.sources[0].periodicWave, audio.sources[1].periodicWave);
  assert.equal(audio.sources[2].buffer, audio.sources[3].buffer);
  assert.equal(audio.sources[2].playbackRate.value, 0.5);
  assert.equal(audio.sources[3].playbackRate.value, 2);
  assert.equal(audio.runtime.dispose(), true);
  assert.equal(audio.runtime.dispose(), false);
  assert.equal(audio.sources.every(({ disconnected }) => disconnected), true);
  assert.equal(audio.gains.every(({ disconnected }) => disconnected), true);
});
