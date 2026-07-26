import assert from "node:assert/strict";
import test from "node:test";

import {
  SCALE_IDS,
  classifyScaleNote,
  getScalePitchClasses,
  normalizeScaleGuide,
  snapMidiNoteToScale,
} from "../src/music/scale.js";

test("every supported scale produces bounded pitch classes for every tonic", () => {
  for (const scale of SCALE_IDS) {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      const pitchClasses = getScalePitchClasses({ tonic, scale, lock: false });
      assert.equal(new Set(pitchClasses).size, pitchClasses.length);
      assert.ok(pitchClasses.every((note) => note >= 0 && note < 12));
      assert.equal(classifyScaleNote(tonic, { tonic, scale, lock: false }).tonic, true);
    }
  }
});

test("scale lock snaps downward on ties and supports one-note bypass", () => {
  const guide = normalizeScaleGuide({ tonic: 0, scale: "major-pentatonic", lock: true });
  assert.equal(snapMidiNoteToScale(61, guide), 60);
  assert.equal(snapMidiNoteToScale(63, guide), 62);
  assert.equal(snapMidiNoteToScale(66, guide), 67);
  assert.equal(snapMidiNoteToScale(66, guide, { bypass: true }), 66);
});

test("scale classification follows sounding pitch class across instrument octaves", () => {
  const guide = { tonic: 9, scale: "natural-minor", lock: true };
  for (const octaveOffset of [-2, -1, 0, 1, 2]) {
    assert.deepEqual(
      classifyScaleNote(69 + octaveOffset * 12, guide),
      { inScale: true, tonic: true },
    );
    assert.equal(classifyScaleNote(70 + octaveOffset * 12, guide).inScale, false);
  }
});

test("scale validation and note bounds fail before producing a candidate", () => {
  assert.throws(() => normalizeScaleGuide({ tonic: 12, scale: "major", lock: false }), /tonic/);
  assert.throws(() => normalizeScaleGuide({ tonic: 0, scale: "unknown", lock: false }), /Scale must/);
  assert.throws(() => snapMidiNoteToScale(35, { tonic: 0, scale: "major", lock: true }, {
    minimum: 36,
    maximum: 112,
  }), /between 36 and 112/);
});
