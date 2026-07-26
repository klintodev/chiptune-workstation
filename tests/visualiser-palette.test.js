import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createProjectState } from "../src/state/project-state.js";
import {
  VISUALISER_PALETTE_DEFINITIONS,
  VISUALISER_PALETTE_IDS,
  getVisualiserPalette,
  getVisualiserTrackColour,
} from "../src/visualiser/visualiser-palette.js";
import { normalizeVisualiser } from "../src/visualiser/visualiser-config.js";

const root = new URL("../", import.meta.url);
const HEX_COLOUR = /^#[\da-f]{6}$/i;

function relativeLuminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrast(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("visualiser palettes are immutable, bounded data with unique track colours", () => {
  assert.equal(VISUALISER_PALETTE_DEFINITIONS.length, 8);
  assert.equal(new Set(VISUALISER_PALETTE_IDS).size, VISUALISER_PALETTE_IDS.length);

  for (const palette of VISUALISER_PALETTE_DEFINITIONS) {
    assert.equal(Object.isFrozen(palette), true);
    assert.equal(Object.isFrozen(palette.tracks), true);
    assert.match(palette.background, HEX_COLOUR);
    assert.match(palette.grid, HEX_COLOUR);
    assert.match(palette.ink, HEX_COLOUR);
    assert.match(palette.muted, HEX_COLOUR);
    assert.equal(palette.tracks.length, 8);
    assert.equal(new Set(palette.tracks).size, 8);
    palette.tracks.forEach((colour) => assert.match(colour, HEX_COLOUR));
  }
});

test("palette text and track marks retain strong contrast against every scene", () => {
  for (const palette of VISUALISER_PALETTE_DEFINITIONS) {
    assert.ok(contrast(palette.background, palette.ink) >= 7, `${palette.id} ink contrast`);
    assert.ok(contrast(palette.background, palette.muted) >= 4.5, `${palette.id} muted contrast`);
    for (const colour of palette.tracks) {
      assert.ok(contrast(palette.background, colour) >= 3, `${palette.id} track contrast`);
    }
  }
});

test("palette lookup is deterministic and safely wraps every project track", () => {
  const studio = getVisualiserPalette("arcade");
  assert.equal(studio.name, "Studio");
  assert.equal(getVisualiserPalette("unsupported"), studio);
  assert.equal(getVisualiserTrackColour("ice", 0), getVisualiserPalette("ice").tracks[0]);
  assert.equal(getVisualiserTrackColour("ice", 8), getVisualiserPalette("ice").tracks[0]);
  assert.equal(getVisualiserTrackColour("ice", -1), getVisualiserPalette("ice").tracks[7]);
});

test("every curated palette is valid project state and participates in undo", () => {
  for (const palette of VISUALISER_PALETTE_DEFINITIONS) {
    assert.equal(normalizeVisualiser({ palette: palette.id }).palette, palette.id);
  }
  assert.throws(() => normalizeVisualiser({ palette: "user-css" }), /palette/);

  const project = createProjectState();
  project.setVisualiser({ palette: "ocean" });
  assert.equal(project.getState().visualiser.palette, "ocean");
  assert.equal(project.getHistoryState().canUndo, true);
  project.undo();
  assert.equal(project.getState().visualiser.palette, "arcade");
});

test("the palette picker exposes preview, apply, cancel, and keyboard-visible radio options", async () => {
  const [source, styles] = await Promise.all([
    Promise.all([
      readFile(new URL("src/features/visualiser/visualiser.js", root), "utf8"),
      readFile(new URL("src/features/visualiser/visualiser-palette-picker.js", root), "utf8"),
    ]).then((files) => files.join("\n")),
    readFile(new URL("src/features/visualiser/visualiser.css", root), "utf8"),
  ]);

  assert.match(source, /aria-labelledby="visualiser-palette-title"/);
  assert.match(source, /name="visualiser-palette"/);
  assert.match(source, /data-palette-preview/);
  assert.match(source, /data-palette-cancel/);
  assert.match(source, /data-palette-apply/);
  assert.match(source, /projectState\.setVisualiser\(\{ palette \}\)/);
  assert.match(styles, /\.visualiser-palette-card input:focus-visible/);
  assert.match(styles, /@media \(max-width: 767px\)/);
});

test("published playback resolves scene and track colours from saved project palette", async () => {
  const source = await readFile(new URL("src/player.js", root), "utf8");
  assert.match(source, /getVisualiserPalette\(projectState\?\.getState\(\)\.visualiser\.palette\)/);
  assert.match(source, /getVisualiserTrackColour\(paletteId, note\.trackIndex\)/);
});
