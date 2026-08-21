import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DELAY_TAIL_SECONDS,
  calculateProjectExportTailSeconds,
  calculateSerialRouteTailSeconds,
  getDelayTailSeconds,
  getDelayTimeSeconds,
  getEqualPowerGains,
} from "../src/v2/audio/effect-tail.js";

function delay(params = {}, bypassed = false, instanceId = "delay-1") {
  return {
    instanceId,
    type: "klinto-delay",
    version: 1,
    bypassed,
    params: { timeDivision: "1/8", feedback: 0.3, mix: 0.2, ...params },
  };
}

const filter = {
  instanceId: "filter-1",
  type: "klinto-filter",
  version: 1,
  bypassed: false,
  params: { cutoffHz: 12_000, q: 0.7 },
};

test("equal-power dry/wet and tempo division calculations pin every boundary", () => {
  assert.deepEqual(getEqualPowerGains(0), { dryGain: 1, wetGain: 0 });
  const center = getEqualPowerGains(0.5);
  assert.ok(Math.abs(center.dryGain - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(center.wetGain - Math.SQRT1_2) < 1e-12);
  const wet = getEqualPowerGains(1);
  assert.ok(Math.abs(wet.dryGain) < 1e-12);
  assert.equal(wet.wetGain, 1);
  assert.equal(getDelayTimeSeconds(240, "1/32"), 0.03125);
  assert.equal(getDelayTimeSeconds(40, "1/2"), 3);
  assert.throws(() => getEqualPowerGains(1.01), RangeError);
  assert.throws(() => getDelayTimeSeconds(120, "dotted"), RangeError);
});

test("Delay export tails use wet gain and the exact conservative cap", () => {
  assert.equal(getDelayTailSeconds(delay({ mix: 0, feedback: 0.85 }), 120), 0);
  assert.equal(getDelayTailSeconds(delay({ mix: 1, feedback: 0 }, false), 120), 0.5);
  assert.equal(getDelayTailSeconds(delay({
    timeDivision: "1/32",
    feedback: 0,
    mix: 1,
  }), 240), 0.28125);
  assert.equal(getDelayTailSeconds(delay({ mix: 1e-12, feedback: 0.000001 }), 120), 10);
  assert.equal(getDelayTailSeconds(delay({ mix: 1, feedback: 0.85 }), 40), 10);
  assert.equal(getDelayTailSeconds(delay({ mix: 1, feedback: 0.85 }, true), 40), 0);
});

test("serial Track tails take the longest route then add the Master chain once", () => {
  const project = {
    transport: { bpm: 120 },
    tracks: [
      {
        id: "track-1",
        instrument: { params: { releaseSeconds: 0.03 } },
        mixer: { effects: [delay({}, false, "track-delay")] },
      },
      {
        id: "track-2",
        instrument: { params: { releaseSeconds: 3 } },
        mixer: { effects: [filter] },
      },
    ],
    mixer: { master: { effects: [delay({}, false, "master-delay")] } },
  };
  assert.equal(calculateProjectExportTailSeconds(project), 20.03);
  assert.equal(calculateProjectExportTailSeconds(project, { trackIds: ["track-2"] }), 13);
  assert.equal(calculateSerialRouteTailSeconds({
    bpm: 120,
    instrumentReleaseSeconds: 0.03,
    trackEffects: [delay({ feedback: 0, mix: 1 })],
    masterEffects: [filter, delay()],
  }), 10.53);
  assert.equal(MAX_DELAY_TAIL_SECONDS, 10);
});

test("generic Instrument tails support mixed release and one-shot decay policies", () => {
  const project = {
    transport: { bpm: 120 },
    tracks: [
      {
        id: "chip",
        instrument: { type: "klinto-chip", params: { releaseSeconds: 0.2 } },
        mixer: { effects: [] },
      },
      {
        id: "drums",
        instrument: { type: "klinto-drums", params: { decaySeconds: 0.8 } },
        mixer: { effects: [] },
      },
    ],
    mixer: { master: { effects: [] } },
  };
  const getInstrumentTailSeconds = (instrument) => instrument.type === "klinto-drums"
    ? instrument.params.decaySeconds + 0.005
    : instrument.params.releaseSeconds;
  assert.equal(calculateProjectExportTailSeconds(project, { getInstrumentTailSeconds }), 0.805);
  assert.equal(calculateProjectExportTailSeconds(project, {
    getInstrumentTailSeconds,
    trackIds: ["chip"],
  }), 0.2);
  assert.equal(calculateSerialRouteTailSeconds({
    bpm: 120,
    instrumentTailSeconds: 0.805,
    masterEffects: [],
    trackEffects: [],
  }), 0.805);
});
