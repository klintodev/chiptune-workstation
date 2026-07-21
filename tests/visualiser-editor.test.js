import assert from "node:assert/strict";
import test from "node:test";

import { createProjectState } from "../src/state/project-state.js";
import {
  MAX_VISUALISER_LAYERS,
  createLayersFromPreset,
  createVisualiserLayer,
  normalizeVisualiser,
  validateVisualiser,
} from "../src/visualiser/visualiser-config.js";

test("preset visualisers can become bounded custom layer data", () => {
  const layers = createLayersFromPreset("spectrum");
  const config = normalizeVisualiser({ mode: "custom", layers });
  assert.equal(config.layers.length, 2);
  assert.equal(config.layers[0].type, "bars");
  assert.equal(validateVisualiser(config), true);
  assert.doesNotThrow(() => JSON.stringify(config));
});

test("layer mappings reject unsupported signals, ranges, and excessive layer counts", () => {
  const invalidSignal = createVisualiserLayer("pulse", "layer-1");
  invalidSignal.mapping.signal = "arbitrary-code";
  assert.throws(() => normalizeVisualiser({ mode: "custom", layers: [invalidSignal] }), /signal/);

  const layers = Array.from({ length: MAX_VISUALISER_LAYERS + 1 }, (_, index) => (
    createVisualiserLayer("bars", `layer-${index + 1}`)
  ));
  assert.throws(() => normalizeVisualiser({ mode: "custom", layers }), /at most/);
});

test("custom layer state participates in project history and is deeply immutable", () => {
  const project = createProjectState();
  const layer = createVisualiserLayer("waveform", "layer-1");
  project.setVisualiser({ layers: [layer], mode: "custom" });
  const snapshot = project.getState().visualiser;
  assert.equal(snapshot.mode, "custom");
  assert.equal(Object.isFrozen(snapshot.layers), true);
  assert.equal(Object.isFrozen(snapshot.layers[0]), true);
  assert.equal(Object.isFrozen(snapshot.layers[0].mapping), true);
  project.undo();
  assert.equal(project.getState().visualiser.mode, "preset");
});

test("older preset-only visualiser data receives editor defaults", () => {
  const normalized = normalizeVisualiser({
    version: 1,
    enabled: true,
    preset: "scope",
    palette: "ice",
    intensity: 0.5,
    sensitivity: 1,
    motion: 1,
  });
  assert.equal(normalized.mode, "preset");
  assert.deepEqual(normalized.layers, []);
});
