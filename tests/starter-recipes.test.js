import assert from "node:assert/strict";
import test from "node:test";

import { createStarterService } from "../src/features/guided-creation/starter-service.js";
import {
  createStarterPreview,
  getStarterRecipe,
  listStarterRecipes,
  normalizeStarterRecipe,
} from "../src/music/starter-recipe.js";
import { createMemoryCheckpointRepository } from "../src/persistence/checkpoint-repository.js";
import { createCheckpointService } from "../src/persistence/checkpoint-service.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createProjectPersistence } from "../src/persistence/project-persistence.js";
import {
  createMemoryProjectRepository,
  createProjectPreferences,
} from "../src/persistence/project-repository.js";
import { createDefaultProject, createProjectState } from "../src/state/project-state.js";

function createHarness({ checkpointRepository = createMemoryCheckpointRepository() } = {}) {
  const project = createDefaultProject();
  const initialDocument = createProjectDocument(project, {
    id: "project-current",
    now: "2026-07-26T12:00:00.000Z",
  });
  const projectState = createProjectState(project);
  const projectRepository = createMemoryProjectRepository([initialDocument]);
  let id = 0;
  let minute = 0;
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    createId: () => `project-starter-${++id}`,
    initialDocument,
    now: () => `2026-07-26T12:${String(++minute).padStart(2, "0")}:00.000Z`,
    preferences: createProjectPreferences(undefined),
    projectState,
    repository: projectRepository,
  });
  const checkpointService = createCheckpointService({
    createId: () => `checkpoint-starter-${++id}`,
    now: () => `2026-07-26T13:${String(++minute).padStart(2, "0")}:00.000Z`,
    persistence,
    replaceProject: (target, detail) => persistence.replaceActiveProject(target.project, detail),
    repository: checkpointRepository,
  });
  const starterService = createStarterService({
    checkpointService,
    persistence,
    projectState,
  });
  return {
    checkpointRepository,
    checkpointService,
    persistence,
    projectRepository,
    projectState,
    starterService,
  };
}

test("the versioned starter library previews tracks, patterns, instruments, tempo, scale, and sections", () => {
  const recipes = listStarterRecipes();
  assert.ok(recipes.length >= 2);
  assert.ok(recipes.every(({ libraryVersion, recipeVersion }) => libraryVersion === 1 && recipeVersion === 1));

  const preview = createStarterPreview({
    currentProject: createDefaultProject(),
    destination: "new",
    recipe: getStarterRecipe(recipes[0].id),
  });
  assert.ok(preview.proposal.tracks.length >= 2);
  assert.ok(preview.proposal.tracks.every(({ instrument }) => typeof instrument === "string"));
  assert.ok(preview.proposal.patterns.every(({ length }) => Number.isInteger(length)));
  assert.ok(preview.proposal.tempo >= 40);
  assert.equal(typeof preview.proposal.scaleGuide.scale, "string");
  assert.ok(preview.proposal.sections.length >= 2);
  assert.equal(preview.targetProject.transport.bpm, preview.proposal.tempo);
});

test("a starter can create a separate project without replacing the current library entry", async () => {
  const harness = createHarness();
  const preview = harness.starterService.preview("arcade-night-drive", "new");
  const result = await harness.starterService.apply(preview);

  assert.equal(result.destination, "new");
  assert.notEqual(harness.persistence.getActiveDocument().id, "project-current");
  assert.equal(harness.projectState.getState().metadata.title, "Arcade night drive");
  assert.deepEqual(
    (await harness.projectRepository.list()).map(({ id }) => id).sort(),
    ["project-current", "project-starter-1"],
  );
  harness.persistence.dispose();
});

test("compatible add is one atomic undoable project operation and preserves tempo and scale", async () => {
  const harness = createHarness();
  harness.projectState.setBpm(101);
  harness.projectState.setScaleGuide({ tonic: 2, scale: "major", lock: false });
  const before = harness.projectState.getState();
  const preview = harness.starterService.preview("bright-call-and-response", "add");
  await harness.starterService.apply(preview);

  const added = harness.projectState.getState();
  assert.equal(added.transport.bpm, 101);
  assert.deepEqual(added.scaleGuide, before.scaleGuide);
  assert.equal(added.tracks.length, before.tracks.length + preview.recipe.tracks.length);
  assert.equal(added.patterns.length, before.patterns.length + preview.recipe.patterns.length);
  assert.equal(harness.projectState.undo(), true);
  assert.deepEqual(harness.projectState.getState(), before);
  harness.persistence.dispose();
});

test("protected replace stores a recovery checkpoint before changing the active document", async () => {
  const harness = createHarness();
  harness.projectState.renameProject("Keep this idea");
  const preview = harness.starterService.preview("arcade-night-drive", "replace");
  await harness.starterService.apply(preview);

  assert.equal(harness.persistence.getActiveDocument().id, "project-current");
  assert.equal(harness.projectState.getState().metadata.title, "Arcade night drive");
  const checkpoints = await harness.checkpointRepository.list("project-current");
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].operation, "starter");
  assert.equal(checkpoints[0].document.project.metadata.title, "Keep this idea");
  harness.persistence.dispose();
});

test("checkpoint failure blocks starter replacement without changing working state", async () => {
  const harness = createHarness();
  const before = harness.projectState.getState();
  const service = createStarterService({
    checkpointService: {
      async protectAndReplace() {
        throw new Error("Checkpoint quota unavailable");
      },
    },
    persistence: harness.persistence,
    projectState: harness.projectState,
  });
  const preview = service.preview("arcade-night-drive", "replace");
  await assert.rejects(service.apply(preview), /Checkpoint quota unavailable/);
  assert.deepEqual(harness.projectState.getState(), before);
  assert.equal(harness.persistence.getActiveDocument().id, "project-current");
  harness.persistence.dispose();
});

test("starter snapshots remain stable across later recipe data and version changes", () => {
  const recipe = getStarterRecipe("arcade-night-drive");
  const first = createStarterPreview({
    currentProject: createDefaultProject(),
    destination: "new",
    recipe,
  });
  const changedRecipe = structuredClone(recipe);
  changedRecipe.tempo = 200;
  const changed = createStarterPreview({
    currentProject: createDefaultProject(),
    destination: "new",
    recipe: changedRecipe,
  });

  assert.equal(first.targetProject.transport.bpm, 148);
  assert.equal(changed.targetProject.transport.bpm, 200);
  assert.equal(getStarterRecipe("arcade-night-drive").tempo, 148);
  assert.throws(
    () => normalizeStarterRecipe({ ...structuredClone(recipe), recipeVersion: 2 }),
    /library 1 and recipe 1/,
  );
});

test("starter preview rejects project-limit and oversized plans before mutation", () => {
  const state = createProjectState();
  for (let index = 0; index < 6; index += 1) state.addTrack(`Existing ${index + 2}`);
  const before = state.getState();
  assert.throws(() => createStarterPreview({
    currentProject: before,
    destination: "add",
    recipe: getStarterRecipe("arcade-night-drive"),
  }), /8-track project limit/);
  assert.deepEqual(state.getState(), before);

  const oversized = structuredClone(getStarterRecipe("arcade-night-drive"));
  oversized.tracks[0].clips = Array.from({ length: 20_000 }, () => ({
    patternKey: "lead",
    startStep: 0,
  }));
  assert.throws(() => normalizeStarterRecipe(oversized), /too large/);
});
