import assert from "node:assert/strict";
import test from "node:test";

import {
  getInitialPianoViewportTop,
  getPianoZoomViewport,
} from "../src/v2/ui/piano-roll.js";

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

test("Piano Roll zoom preserves the timeline tick beneath the pointer", () => {
  const viewportLeft = 100;
  const anchorClientX = 600;
  const anchorWithinViewport = anchorClientX - viewportLeft;
  const currentPixelsPerTick = 1;
  const scrollLeft = 300;
  const anchorTick = (scrollLeft + anchorWithinViewport - 88) / currentPixelsPerTick;

  const zoomed = getPianoZoomViewport({
    anchorClientX,
    currentPixelsPerTick,
    deltaY: -100,
    scrollLeft,
    viewportLeft,
    viewportWidth: 800,
  });

  assert.equal(zoomed.pixelsPerTick, 1.2);
  assert.ok(Math.abs(
    (zoomed.scrollLeft + anchorWithinViewport - 88) / zoomed.pixelsPerTick
      - anchorTick,
  ) < 1e-9);
});

test("Piano Roll zoom uses its centre for keyboard input and respects bounds", () => {
  const centred = getPianoZoomViewport({
    currentPixelsPerTick: 1.35,
    deltaY: 1,
    scrollLeft: 200,
    viewportLeft: 20,
    viewportWidth: 1_000,
  });
  const centre = 88 + (1_000 - 88) / 2;
  const anchorTickBefore = (200 + centre - 88) / 1.35;
  const anchorTickAfter = (centred.scrollLeft + centre - 88) / centred.pixelsPerTick;
  assert.ok(Math.abs(anchorTickAfter - anchorTickBefore) < 1e-9);

  assert.equal(getPianoZoomViewport({
    currentPixelsPerTick: 3,
    deltaY: -1,
    scrollLeft: 0,
    viewportWidth: 800,
  }).pixelsPerTick, 3);
  assert.equal(getPianoZoomViewport({
    currentPixelsPerTick: 0.45,
    deltaY: 1,
    scrollLeft: 0,
    viewportWidth: 800,
  }).pixelsPerTick, 0.45);
});
