import assert from "node:assert/strict";
import test from "node:test";

import { analyseAudioFrame } from "../src/visualiser/audio-features.js";
import {
  createDefaultVisualiser,
  normalizeVisualiser,
  validateVisualiser,
} from "../src/visualiser/visualiser-config.js";
import { PROJECT_SCHEMA_VERSION, createProjectState } from "../src/state/project-state.js";

test("visualiser configuration is bounded, serializable project state", () => {
  const project = createProjectState();
  assert.deepEqual(project.getState().visualiser, createDefaultVisualiser());
  project.setVisualiser({ palette: "sunset", preset: "scope", sensitivity: 1.4 });
  assert.equal(project.getState().visualiser.preset, "scope");
  assert.equal(project.getHistoryState().canUndo, true);
  assert.throws(() => project.setVisualiser({ sensitivity: 9 }), /sensitivity/);
  assert.equal(validateVisualiser(normalizeVisualiser({ motion: 0 })), true);
});

test("schema three projects migrate with stable visualiser defaults", () => {
  const current = structuredClone(createProjectState().getState());
  delete current.visualiser;
  current.schemaVersion = 3;
  const migrated = createProjectState(current).getState();
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(migrated.visualiser, createDefaultVisualiser());
});

test("audio features expose bounded amplitude and frequency bands", () => {
  const waveform = new Uint8Array([128, 255, 128, 1]);
  const frequencies = new Uint8Array([255, 255, 128, 128, 0, 0]);
  const features = analyseAudioFrame(waveform, frequencies, 1.5);
  assert.ok(features.amplitude > 0.9 && features.amplitude <= 1);
  assert.equal(features.bass, 1);
  assert.ok(features.mid > features.treble);
  assert.ok(Object.isFrozen(features));
});
