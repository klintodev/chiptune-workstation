import assert from "node:assert/strict";
import test from "node:test";

import { createInstrumentSynthRouter } from "../src/v2/audio/instrument-synth-router.js";
import {
  KLINTO_DRUM_PIECES,
  KLINTO_DRUM_PITCH_NAMES,
  adaptKlintoDrumsVoice,
  createKlintoDrumsSynthRuntime,
  resolveKlintoDrumPiece,
} from "../src/v2/audio/klinto-drums-synth.js";

function createParam(initialValue = 0) {
  return {
    events: [],
    value: initialValue,
    cancelScheduledValues(time) { this.events.push(["cancel", time]); },
    exponentialRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push(["exponential", value, time]);
    },
    linearRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push(["linear", value, time]);
    },
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push(["set", value, time]);
    },
  };
}

function createAudioHarness() {
  const buffers = [];
  const gains = [];
  const sources = [];
  function node(kind, extra = {}) {
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
    const value = node(kind, {
      addEventListener(type, listener) { listeners.set(type, listener); },
      emit(type) { listeners.get(type)?.(); },
      frequency: createParam(),
      playbackRate: { value: 1 },
      start(time) { this.startTime = time; },
      stop(time) { this.stopTime = time; },
    });
    sources.push(value);
    return value;
  }
  const context = {
    currentTime: 1,
    sampleRate: 32,
    createBuffer(channels, length, sampleRate) {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      const buffer = { channelData, getChannelData: (index) => channelData[index], sampleRate };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource: () => source("noise"),
    createGain() {
      const value = node("gain", { gain: createParam(1) });
      gains.push(value);
      return value;
    },
    createOscillator: () => source("oscillator"),
  };
  const output = node("output");
  const runtime = createKlintoDrumsSynthRuntime({ context, getOutputNode: () => output });
  return { buffers, context, gains, output, runtime, sources };
}

function drumEvent(overrides = {}) {
  return {
    durationSeconds: 0.45,
    ownership: { occurrenceId: "drum-1", trackId: "drums" },
    pitch: 60,
    startTime: 2,
    tone: 0.5,
    trackId: "drums",
    velocity: 0.4,
    ...overrides,
  };
}

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} is not close to ${expected}`);
}

test("Klinto Drums exposes one exact frozen MIDI 60..71 kit and rejects every unmapped pitch", () => {
  assert.equal(Object.isFrozen(KLINTO_DRUM_PIECES), true);
  assert.equal(Object.isFrozen(KLINTO_DRUM_PITCH_NAMES), true);
  assert.equal(KLINTO_DRUM_PIECES.every(Object.isFrozen), true);
  assert.deepEqual(
    KLINTO_DRUM_PIECES.map(({ id, name, pitch }) => ({ id, name, pitch })),
    [
      { id: "kick", name: "Kick", pitch: 60 },
      { id: "short-kick", name: "Short Kick", pitch: 61 },
      { id: "snare", name: "Snare", pitch: 62 },
      { id: "tight-snare", name: "Tight Snare", pitch: 63 },
      { id: "closed-hat", name: "Closed Hat", pitch: 64 },
      { id: "pedal-hat", name: "Pedal Hat", pitch: 65 },
      { id: "open-hat", name: "Open Hat", pitch: 66 },
      { id: "low-tom", name: "Low Tom", pitch: 67 },
      { id: "low-mid-tom", name: "Low-mid Tom", pitch: 68 },
      { id: "mid-tom", name: "Mid Tom", pitch: 69 },
      { id: "high-mid-tom", name: "High-mid Tom", pitch: 70 },
      { id: "high-tom", name: "High Tom", pitch: 71 },
    ],
  );
  assert.deepEqual(KLINTO_DRUM_PITCH_NAMES, Object.fromEntries(
    KLINTO_DRUM_PIECES.map(({ name, pitch }) => [pitch, name]),
  ));
  for (let pitch = 60; pitch <= 71; pitch += 1) {
    assert.equal(resolveKlintoDrumPiece(pitch), KLINTO_DRUM_PIECES[pitch - 60]);
  }
  for (const pitch of [59, 72, 60.5, NaN, null, "60"]) {
    assert.equal(resolveKlintoDrumPiece(pitch), null);
  }
  assert.equal(adaptKlintoDrumsVoice({
    noteDurationSeconds: 0.125,
    params: { decaySeconds: 0.45, tone: 0.5 },
    pitch: 59,
  }), null);
  const audio = createAudioHarness();
  assert.equal(audio.runtime.trigger(drumEvent({ pitch: 59 })), null);
  assert.equal(audio.runtime.trigger(drumEvent({ pitch: 72 })), null);
  assert.equal(audio.sources.length, 0);
  assert.equal(audio.gains.length, 0);
});

test("voice adaptation makes mapped drums finite one-shots controlled by decay and tone", () => {
  const params = { decaySeconds: 0.8, tone: 0.25 };
  const kick = adaptKlintoDrumsVoice({ noteDurationSeconds: 0.01, params, pitch: 60 });
  const shortKick = adaptKlintoDrumsVoice({ noteDurationSeconds: 9, params, pitch: 61 });
  const hat = adaptKlintoDrumsVoice({ noteDurationSeconds: 9, params, pitch: 64 });
  const tom = adaptKlintoDrumsVoice({ noteDurationSeconds: 9, params, pitch: 67 });
  assert.deepEqual(kick, {
    drumPiece: "kick",
    drumPieceName: "Kick",
    durationSeconds: 0.8,
    oneShot: true,
    releaseSeconds: 0,
    tone: 0.25,
    voiceEndOffsetSeconds: 0.805,
  });
  closeTo(shortKick.durationSeconds, 0.36);
  closeTo(hat.durationSeconds, 0.144);
  closeTo(tom.durationSeconds, 0.68);
  assert.equal(Object.isFrozen(kick), true);
});

test("noise is repeatable, shared per runtime and independent of ambient randomness", () => {
  const first = createAudioHarness();
  const second = createAudioHarness();
  first.runtime.trigger(drumEvent({ pitch: 62 }));
  first.runtime.trigger(drumEvent({ pitch: 64 }));
  second.runtime.trigger(drumEvent({ pitch: 62 }));
  assert.equal(first.buffers.length, 1);
  assert.equal(second.buffers.length, 1);
  assert.equal(first.sources[0].buffer, first.sources[2].buffer);
  assert.deepEqual(
    Array.from(first.buffers[0].getChannelData(0)),
    Array.from(second.buffers[0].getChannelData(0)),
  );
  assert.notEqual(first.buffers[0].getChannelData(0).every((sample) => sample === 0), true);
});

test("kick, snare, hat and tom synthesis pin their nodes, pitch sweeps and velocity envelopes", async (t) => {
  await t.test("kick", () => {
    const audio = createAudioHarness();
    audio.runtime.trigger(drumEvent());
    assert.equal(audio.sources[0].kind, "oscillator");
    assert.equal(audio.sources[0].type, "sine");
    assert.deepEqual(audio.sources[0].frequency.events, [
      ["set", 168.75, 2],
      ["exponential", 56.25, 2.11],
    ]);
    assert.deepEqual(audio.gains[0].gain.events, [
      ["set", 0.0001, 2],
      ["exponential", 0.4, 2.002],
      ["exponential", 0.0001, 2.45],
    ]);
    closeTo(audio.sources[0].stopTime, 2.455);
  });

  await t.test("snare", () => {
    const audio = createAudioHarness();
    audio.runtime.trigger(drumEvent({ pitch: 62, tone: 1, velocity: 0.5 }));
    assert.deepEqual(audio.sources.map(({ kind }) => kind), ["noise", "oscillator"]);
    assert.equal(audio.sources[0].playbackRate.value, 2.25);
    assert.equal(audio.sources[1].type, "triangle");
    assert.deepEqual(audio.sources[1].frequency.events, [
      ["set", 258.75, 2],
      ["exponential", 225, 2.04],
    ]);
    assert.equal(audio.gains[0].gain.events[1][1], 0.425);
    closeTo(audio.gains[1].gain.events[1][1], 0.14);
    closeTo(audio.gains[1].gain.events[2][2], 2.2925);
  });

  await t.test("hat", () => {
    const audio = createAudioHarness();
    audio.runtime.trigger(drumEvent({ durationSeconds: 0.2, pitch: 64, tone: 1, velocity: 0.5 }));
    assert.equal(audio.sources[0].kind, "noise");
    assert.equal(audio.sources[0].playbackRate.value, 3);
    assert.equal(audio.gains[0].gain.events[1][1], 0.3);
  });

  await t.test("tom", () => {
    const audio = createAudioHarness();
    audio.runtime.trigger(drumEvent({ durationSeconds: 0.3, pitch: 67, tone: 0, velocity: 0.5 }));
    assert.equal(audio.sources[0].type, "sine");
    closeTo(audio.sources[0].frequency.events[0][1], 82.5975);
    closeTo(audio.sources[0].frequency.events[1][1], 55.065);
    closeTo(audio.sources[0].frequency.events[1][2], 2.06);
    assert.equal(audio.gains[0].gain.events[1][1], 0.45);
  });
});

test("a multi-source snare finalizes only after every source, while retire and dispose are idempotent", () => {
  const audio = createAudioHarness();
  const snare = audio.runtime.trigger(drumEvent({ pitch: 62 }));
  let endedCalls = 0;
  snare.addEndedListener(() => { endedCalls += 1; });
  audio.sources[0].emit("ended");
  assert.equal(snare.ended, false);
  assert.equal(audio.runtime.getActiveVoiceCount(), 1);
  audio.sources[1].emit("ended");
  assert.equal(snare.ended, true);
  assert.equal(endedCalls, 1);
  assert.equal(audio.runtime.getActiveVoiceCount(), 0);
  assert.equal(audio.sources.slice(0, 2).every(({ disconnected }) => disconnected), true);

  const kick = audio.runtime.trigger(drumEvent({ ownership: { occurrenceId: "kick" } }));
  assert.equal(kick.retire(1.5), true);
  assert.deepEqual(audio.gains.at(-1).gain.events.slice(-3), [
    ["cancel", 1.5],
    ["set", 0.0001, 1.5],
    ["linear", 0.0001, 1.505],
  ]);
  assert.equal(audio.sources.at(-1).stopTime, 1.505);
  assert.equal(audio.runtime.dispose(), true);
  assert.equal(audio.runtime.dispose(), false);
  assert.equal(kick.ended, true);
  assert.equal(audio.sources.every(({ disconnected }) => disconnected), true);
  assert.equal(audio.gains.every(({ disconnected }) => disconnected), true);
});

test("the synth router dispatches exact type/version/mode lazily and owns runtime disposal", () => {
  const calls = [];
  let runtimeDisposals = 0;
  const runtime = {
    dispose() { runtimeDisposals += 1; return true; },
    trigger(event) {
      calls.push(["trigger", event.instrumentType, event.instrumentVersion]);
      return event.unmapped ? null : { stop() {} };
    },
  };
  const definition = {
    name: "Test Drums",
    synthAdapters: {
      live() { throw new Error("wrong mode"); },
      offline() { throw new Error("wrong mode"); },
      public(options) { calls.push(["factory", options.context]); return runtime; },
    },
  };
  const requireCalls = [];
  const router = createInstrumentSynthRouter({
    context: { name: "context" },
    deviceRegistry: {
      instruments: {
        require(type, version) {
          requireCalls.push([type, version]);
          if (type !== "test-drums" || version !== 3) throw new RangeError("unknown type/version");
          return definition;
        },
      },
    },
    getOutputNode: () => ({}),
    mode: "public",
  });
  assert.equal(router.getActiveRuntimeCount(), 0);
  assert.throws(() => router.trigger({ instrumentType: "test-drums" }), /type and version/);
  assert.equal(router.trigger({ instrumentType: "test-drums", instrumentVersion: 3 }).stop instanceof Function, true);
  assert.equal(router.trigger({ instrumentType: "test-drums", instrumentVersion: 3, unmapped: true }), null);
  assert.deepEqual(requireCalls, [["test-drums", 3]]);
  assert.equal(router.getRuntime("test-drums", 3), runtime);
  assert.equal(router.getActiveRuntimeCount(), 1);
  assert.throws(
    () => router.trigger({ instrumentType: "test-drums", instrumentVersion: 4 }),
    /unknown type\/version/,
  );
  assert.equal(router.dispose(), true);
  assert.equal(router.dispose(), false);
  assert.equal(runtimeDisposals, 1);
  assert.throws(
    () => router.trigger({ instrumentType: "test-drums", instrumentVersion: 3 }),
    /disposed/,
  );
  assert.throws(() => createInstrumentSynthRouter({
    context: {},
    getOutputNode: () => ({}),
    mode: "preview",
  }), /Unsupported Instrument synthesis mode/);
});
