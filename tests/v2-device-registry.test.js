import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVICE_REGISTRY,
  EFFECT_REGISTRY,
  INSTRUMENT_REGISTRY,
  KLINTO_CHIP_DEFINITION,
  KLINTO_DELAY_DEFINITION,
  KLINTO_DRUMS_DEFINITION,
  KLINTO_FILTER_DEFINITION,
  getInstrumentTailSeconds,
} from "../src/v2/audio/device-registry.js";
import { KLINTO_DRUM_PITCH_NAMES } from "../src/v2/audio/klinto-drums-synth.js";
import { toWebAudioWaveform } from "../src/v2/audio/web-audio-runtime.js";
import {
  KLINTO_CHIP_CONTRACT,
  KLINTO_DELAY_CONTRACT,
  KLINTO_DRUMS_CONTRACT,
  KLINTO_FILTER_CONTRACT,
} from "../src/v2/domain/device-contracts.js";

test("the closed registries expose only the pinned first-party definitions", () => {
  assert.equal(DEVICE_REGISTRY.instruments, INSTRUMENT_REGISTRY);
  assert.equal(DEVICE_REGISTRY.effects, EFFECT_REGISTRY);
  assert.deepEqual(INSTRUMENT_REGISTRY.all().map(({ type }) => type), [
    "klinto-chip",
    "klinto-drums",
  ]);
  assert.deepEqual(EFFECT_REGISTRY.all().map(({ type }) => type), [
    "klinto-filter",
    "klinto-delay",
  ]);
  assert.equal(KLINTO_CHIP_DEFINITION.contract, KLINTO_CHIP_CONTRACT);
  assert.equal(KLINTO_DRUMS_DEFINITION.contract, KLINTO_DRUMS_CONTRACT);
  assert.equal(KLINTO_FILTER_DEFINITION.contract, KLINTO_FILTER_CONTRACT);
  assert.equal(KLINTO_DELAY_DEFINITION.contract, KLINTO_DELAY_CONTRACT);
  assert.equal("register" in INSTRUMENT_REGISTRY, false);
  assert.equal("register" in EFFECT_REGISTRY, false);
  assert.ok(Object.isFrozen(INSTRUMENT_REGISTRY));
  assert.ok(Object.isFrozen(EFFECT_REGISTRY));
  assert.ok(Object.isFrozen(KLINTO_CHIP_DEFINITION.defaults));
  assert.ok(Object.isFrozen(KLINTO_DRUMS_DEFINITION.defaults));
});

test("lookup is deterministic and rejects unknown type/version or state", () => {
  assert.equal(INSTRUMENT_REGISTRY.get("klinto-chip"), KLINTO_CHIP_DEFINITION);
  assert.equal(INSTRUMENT_REGISTRY.get("missing"), null);
  assert.equal(INSTRUMENT_REGISTRY.get("klinto-chip", 2), null);
  assert.throws(() => INSTRUMENT_REGISTRY.require("klinto-chip", 2), /type\/version/);

  const instrument = INSTRUMENT_REGISTRY.createDefault("klinto-chip", "inst_track-1");
  assert.deepEqual(instrument.params, KLINTO_CHIP_CONTRACT.defaults);
  assert.deepEqual(INSTRUMENT_REGISTRY.normalize(instrument), instrument);
  assert.throws(() => INSTRUMENT_REGISTRY.normalize({
    ...instrument,
    params: { ...instrument.params, hiddenLfo: 1 },
  }), /invalid keys/i);

  const drums = INSTRUMENT_REGISTRY.createDefault("klinto-drums", "drums_track-1");
  assert.deepEqual(drums, {
    instanceId: "drums_track-1",
    params: { decaySeconds: 0.45, level: 0.5, tone: 0.5 },
    type: "klinto-drums",
    version: 1,
  });
  assert.equal(INSTRUMENT_REGISTRY.get("klinto-drums"), KLINTO_DRUMS_DEFINITION);
  assert.deepEqual(INSTRUMENT_REGISTRY.normalize(drums), drums);

  const delay = EFFECT_REGISTRY.createDefault("klinto-delay", "delay-1");
  assert.deepEqual(delay.params, KLINTO_DELAY_CONTRACT.defaults);
  assert.throws(() => EFFECT_REGISTRY.normalize({ ...delay, version: 99 }), /type\/version/);
  assert.throws(() => EFFECT_REGISTRY.createDefault("remote-plugin", "effect-1"), /Unknown/);
});

test("all playback surfaces share one factory and the saw adapter is explicit", () => {
  for (const definition of [
    KLINTO_CHIP_DEFINITION,
    KLINTO_DRUMS_DEFINITION,
    KLINTO_FILTER_DEFINITION,
    KLINTO_DELAY_DEFINITION,
  ]) {
    assert.equal(definition.runtimeAdapters.live, definition.runtimeAdapters.offline);
    assert.equal(definition.runtimeAdapters.live, definition.runtimeAdapters.public);
  }
  assert.equal(toWebAudioWaveform("saw"), "sawtooth");
  assert.equal(toWebAudioWaveform("square"), "square");
  assert.throws(() => toWebAudioWaveform("sawtooth"), /Unsupported/);
  assert.equal(KLINTO_CHIP_DEFINITION.adaptParameters({
    ...KLINTO_CHIP_CONTRACT.defaults,
    waveform: "saw",
  }).webAudioWaveform, "sawtooth");
});

test("the Drums definition owns synthesis, one-shot tails and exact Piano Roll metadata", () => {
  assert.equal(KLINTO_DRUMS_DEFINITION.ui.pitchNames, KLINTO_DRUM_PITCH_NAMES);
  assert.equal(Object.isFrozen(KLINTO_DRUMS_DEFINITION.ui.pitchNames), true);
  assert.deepEqual(Object.keys(KLINTO_DRUMS_DEFINITION.ui.pitchNames), [
    "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "70", "71",
  ]);
  assert.equal(typeof KLINTO_DRUMS_DEFINITION.adaptVoice, "function");
  assert.equal(typeof KLINTO_DRUMS_DEFINITION.getTailSeconds, "function");
  assert.equal(typeof KLINTO_DRUMS_DEFINITION.createSynthRuntime, "function");
  assert.equal(KLINTO_DRUMS_DEFINITION.synthAdapters.live, KLINTO_DRUMS_DEFINITION.createSynthRuntime);
  assert.equal(KLINTO_DRUMS_DEFINITION.synthAdapters.offline, KLINTO_DRUMS_DEFINITION.createSynthRuntime);
  assert.equal(KLINTO_DRUMS_DEFINITION.synthAdapters.public, KLINTO_DRUMS_DEFINITION.createSynthRuntime);
  assert.equal(getInstrumentTailSeconds(KLINTO_DRUMS_DEFINITION.createDefault("drums")), 0.455);
  assert.equal(KLINTO_DRUMS_DEFINITION.adaptVoice({
    noteDurationSeconds: 0.125,
    params: KLINTO_DRUMS_CONTRACT.defaults,
    pitch: 60,
  }).drumPiece, "kick");
  assert.equal(KLINTO_DRUMS_DEFINITION.adaptVoice({
    noteDurationSeconds: 0.125,
    params: KLINTO_DRUMS_CONTRACT.defaults,
    pitch: 59,
  }), null);
});

test("importing definitions does not construct browser, timer or DOM state", async () => {
  const originalAudioContext = globalThis.AudioContext;
  let constructed = 0;
  globalThis.AudioContext = class {
    constructor() {
      constructed += 1;
      throw new Error("must stay lazy");
    }
  };
  try {
    const imported = await import(`../src/v2/audio/device-registry.js?lazy=${Date.now()}`);
    assert.equal(imported.INSTRUMENT_REGISTRY.all().length, 2);
    assert.equal(constructed, 0);
  } finally {
    if (originalAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalAudioContext;
  }
});
