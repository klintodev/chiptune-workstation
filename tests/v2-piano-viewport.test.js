import assert from "node:assert/strict";
import test from "node:test";

import { getInitialPianoViewportTop } from "../src/v2/ui/piano-roll.js";

test("an empty Piano Roll centres C4 after its scrollable layout exists", () => {
  assert.equal(getInitialPianoViewportTop({ notes: [] }, 500, 2_002), 1_115);
});

test("the initial Piano Roll centres the first note's octave", () => {
  assert.equal(getInitialPianoViewportTop({
    notes: [{ pitch: 76 }],
  }, 500, 2_002), 803);
});

test("initial Piano Roll centring is bounded for short viewports and edge pitches", () => {
  assert.equal(getInitialPianoViewportTop({
    notes: [{ pitch: 112 }],
  }, 500, 2_002), 0);
  assert.equal(getInitialPianoViewportTop({
    notes: [{ pitch: 36 }],
  }, 2_002, 2_002), 0);
});
