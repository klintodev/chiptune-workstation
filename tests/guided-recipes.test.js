import assert from "node:assert/strict";
import test from "node:test";

import { createRecipePreview } from "../src/music/recipe.js";
import { createVariationPreview } from "../src/music/variation.js";
import { createDefaultProject, createProjectState } from "../src/state/project-state.js";

function patternWithSteps(steps) {
  return {
    ...createDefaultProject().patterns[0],
    steps,
  };
}

test("arpeggio recipes transpose bounded chord tones into monophonic steps", () => {
  const pattern = patternWithSteps(Array(16).fill(null));
  const preview = createRecipePreview({
    guide: { tonic: 2, scale: "major", lock: true },
    pattern,
    recipe: {
      version: 1,
      id: "major-rise",
      name: "Major rise",
      type: "arpeggio",
      scaleDegree: 1,
      quality: "major",
      direction: "up-down",
      octaveSpan: 1,
      rate: 2,
      rootMidi: 60,
      gate: 0.5,
      volume: 0.8,
    },
    startStep: 4,
    endStep: 12,
  });

  assert.equal(preview.destinationPatternId, pattern.id);
  assert.equal(preview.resultingLength, 16);
  assert.deepEqual(preview.steps.slice(0, 4), pattern.steps.slice(0, 4));
  assert.deepEqual(
    preview.generated.map((step) => step?.note ?? null),
    [62, null, 66, null, 69, null, 66, null],
  );
  assert.ok(preview.generated.filter(Boolean).every((step) => step.gate === 0.5 && step.volume === 0.8));
});

test("rhythm recipe previews identify replaced steps without mutating the destination", () => {
  const original = Object.freeze({ note: 60, gate: 0.75, volume: 0.7 });
  const pattern = patternWithSteps(Array(8).fill(original));
  const preview = createRecipePreview({
    guide: { tonic: 0, scale: "chromatic", lock: false },
    pattern,
    recipe: {
      version: 1,
      id: "sparse-pulse",
      name: "Sparse pulse",
      type: "rhythm",
      note: 48,
      density: 0.5,
      accentEvery: 4,
    },
  });

  assert.equal(pattern.steps.every((step) => step === original), true);
  assert.equal(preview.replaced.length, 8);
  assert.equal(preview.generated.filter(Boolean).length, 4);
  assert.ok(preview.generated.filter(Boolean).every((step) => step.note === 48));
});

test("accepted recipe previews commit and undo as one project operation", () => {
  const state = createProjectState();
  const pattern = state.getState().patterns[0];
  const preview = createRecipePreview({
    guide: { tonic: 0, scale: "major", lock: true },
    pattern,
    recipe: {
      version: 1,
      id: "minor-fall",
      name: "Minor fall",
      type: "arpeggio",
      scaleDegree: 6,
      quality: "minor",
      direction: "down",
      octaveSpan: 1,
      rate: 1,
    },
  });

  state.updatePattern(pattern.id, (current) => ({ ...current, steps: preview.steps }), {
    field: "pattern.recipe",
  });
  assert.deepEqual(state.getPattern(pattern.id).steps, preview.steps);
  assert.equal(state.undo(), true);
  assert.deepEqual(state.getPattern(pattern.id).steps, pattern.steps);
});

test("seeded variations are reproducible and never alter fields outside their scopes", () => {
  const pattern = patternWithSteps(Array.from({ length: 16 }, (_, index) => ({
    note: 60 + (index % 4),
    gate: 0.75,
    volume: 0.7,
  })));
  const input = {
    guide: { tonic: 0, scale: "major", lock: true },
    options: {
      scopes: ["pitch", "velocity"],
      minimumNote: 55,
      maximumNote: 72,
      maximumLeap: 5,
      minimumVelocity: 0.5,
      maximumVelocity: 0.75,
      density: 0.2,
      gates: [0.25],
    },
    pattern,
    seed: 123456,
    startStep: 2,
    endStep: 14,
  };
  const first = createVariationPreview(input);
  const second = createVariationPreview(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first.steps.slice(0, 2), pattern.steps.slice(0, 2));
  assert.deepEqual(first.steps.slice(14), pattern.steps.slice(14));
  for (let index = 2; index < 14; index += 1) {
    assert.equal(first.steps[index].gate, pattern.steps[index].gate);
    assert.ok(first.steps[index].volume >= 0.5 && first.steps[index].volume <= 0.75);
    assert.ok(first.steps[index].note >= 55 && first.steps[index].note <= 72);
    assert.ok([0, 2, 4, 5, 7, 9, 11].includes(first.steps[index].note % 12));
    if (index > 2) assert.ok(Math.abs(first.steps[index].note - first.steps[index - 1].note) <= 5);
  }
});

test("recipe and variation validation fails before changing authoritative state", () => {
  const pattern = patternWithSteps(Array(4).fill(null));
  assert.throws(() => createRecipePreview({
    guide: { tonic: 0, scale: "major", lock: true },
    pattern,
    recipe: { version: 99, id: "bad", name: "Bad", type: "arpeggio" },
  }), /version/);
  assert.throws(() => createVariationPreview({
    options: { scopes: [] },
    pattern,
    seed: 1,
  }), /explicit scope/);
});
