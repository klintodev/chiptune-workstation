import assert from "node:assert/strict";
import test from "node:test";

import { createScaleEntryController } from "../src/features/guided-creation/scale-entry-controller.js";
import {
  buildRemixStudioUrl,
  parseRemixIntent,
} from "../src/features/remixing/remix-intent.js";
import { createRecipePreview } from "../src/music/recipe.js";
import { createMemoryCheckpointRepository } from "../src/persistence/checkpoint-repository.js";
import { createCheckpointService } from "../src/persistence/checkpoint-service.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createProjectPersistence } from "../src/persistence/project-persistence.js";
import {
  createMemoryProjectRepository,
  createProjectPreferences,
} from "../src/persistence/project-repository.js";
import {
  PROJECT_SCHEMA_VERSION,
  createDefaultProject,
  createProjectState,
} from "../src/state/project-state.js";

test("scale guidance migrates, persists, stays immutable, and never rewrites existing notes", () => {
  const current = structuredClone(createDefaultProject());
  current.patterns[0].steps[0] = { note: 61, gate: 0.75, volume: 0.7 };
  const legacy = structuredClone(current);
  legacy.schemaVersion = 5;
  delete legacy.scaleGuide;

  const state = createProjectState(legacy);
  assert.deepEqual(state.getState().scaleGuide, { tonic: 0, scale: "major", lock: false });
  state.setScaleGuide({ tonic: 2, scale: "minor-pentatonic", lock: true });

  assert.equal(state.getState().schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(state.getState().scaleGuide, {
    tonic: 2,
    scale: "minor-pentatonic",
    lock: true,
  });
  assert.equal(Object.isFrozen(state.getState().scaleGuide), true);
  assert.equal(state.getPattern("pattern-1").steps[0].note, 61);
  assert.equal(state.undo(), true);
  assert.deepEqual(state.getState().scaleGuide, { tonic: 0, scale: "major", lock: false });
});

test("scale entry snaps a new note, previews the result, and consumes bypass once", () => {
  const guide = { tonic: 0, scale: "major-pentatonic", lock: true };
  const controller = createScaleEntryController({ getScaleGuide: () => guide });

  assert.equal(controller.preview(61), 60);
  assert.equal(controller.resolve(61), 60);
  controller.armBypass();
  assert.equal(controller.preview(61), 61);
  assert.equal(controller.getState().bypassArmed, true);
  assert.equal(controller.resolve(61), 61);
  assert.equal(controller.getState().bypassArmed, false);
  assert.equal(controller.resolve(61), 60);
});

test("locked recipes snap generated notes without changing their destination before apply", () => {
  const project = createDefaultProject();
  const pattern = project.patterns[0];
  const preview = createRecipePreview({
    guide: { tonic: 0, scale: "major-pentatonic", lock: true },
    pattern,
    recipe: {
      version: 1,
      id: "locked-rhythm",
      name: "Locked rhythm",
      type: "rhythm",
      note: 61,
      density: 1,
    },
  });

  assert.equal(preview.steps.every((step) => step?.note === 60), true);
  assert.equal(pattern.steps.every((step) => step === null), true);
});

test("applying a preview to a duplicate is one atomic undoable project operation", () => {
  const state = createProjectState();
  const source = state.getPattern("pattern-1");
  const steps = source.steps.map((step, index) => (
    index === 0 ? { note: 60, gate: 0.75, volume: 0.7 } : step
  ));

  const duplicateId = state.applyPatternTransform(source.id, steps, {
    duplicate: true,
    operation: "apply-recipe",
  });
  assert.equal(state.getState().patterns.length, 2);
  assert.equal(state.getPattern(duplicateId).steps[0].note, 60);
  assert.equal(state.undo(), true);
  assert.equal(state.getState().patterns.length, 1);
  assert.equal(state.getPattern(source.id).steps[0], null);
});

test("checkpoint restore creates a recovery checkpoint and a new working revision", async () => {
  const project = createDefaultProject();
  const document = createProjectDocument(project, {
    id: "project-guided",
    now: "2026-07-26T10:00:00.000Z",
  });
  const projectState = createProjectState(project);
  const projectRepository = createMemoryProjectRepository([document]);
  let minute = 0;
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    initialDocument: document,
    now: () => `2026-07-26T10:${String(++minute).padStart(2, "0")}:00.000Z`,
    preferences: createProjectPreferences(undefined),
    projectState,
    repository: projectRepository,
  });
  const checkpointRepository = createMemoryCheckpointRepository();
  const service = createCheckpointService({
    createId: (() => {
      let id = 0;
      return () => `checkpoint-${++id}`;
    })(),
    now: () => `2026-07-26T11:${String(++minute).padStart(2, "0")}:00.000Z`,
    persistence,
    replaceProject: (target, detail) => persistence.replaceActiveProject(target.project, detail),
    repository: checkpointRepository,
  });

  const saved = await service.createCheckpoint("Strong opening", "manual");
  projectState.setBpm(150);
  await persistence.saveNow();
  const changedRevision = persistence.getActiveDocument().revision;
  await service.restore(saved.checkpointId);

  assert.equal(projectState.getState().transport.bpm, 120);
  assert.equal(persistence.getActiveDocument().revision, changedRevision + 1);
  const checkpoints = await service.list();
  assert.deepEqual(checkpoints.map(({ operation }) => operation).sort(), ["manual", "restore"]);
  assert.equal((await checkpointRepository.get(saved.checkpointId)).document.project.transport.bpm, 120);
  persistence.dispose();
});

test("remix URLs preserve an exact public revision and reject incomplete intents", () => {
  const url = buildRemixStudioUrl({
    publicationId: "publication-123",
    publicationRevision: 7,
  }, "https://studio.example/player.html?id=publication-123");

  assert.deepEqual(parseRemixIntent(url), {
    publicationId: "publication-123",
    publicationRevision: 7,
  });
  assert.equal(parseRemixIntent("https://studio.example/"), null);
  assert.throws(
    () => parseRemixIntent("https://studio.example/?remix=publication-123"),
    /invalid/,
  );
});
