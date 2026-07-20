import assert from "node:assert/strict";
import test from "node:test";

import {
  copyProjectDocument,
  createProjectDocument,
  parseProjectDocument,
  reviseProjectDocument,
  serializeProjectDocument,
} from "../src/persistence/project-document.js";
import {
  createMemoryProjectRepository,
  createProjectPreferences,
} from "../src/persistence/project-repository.js";
import {
  createProjectPersistence,
  loadInitialProjectDocument,
} from "../src/persistence/project-persistence.js";
import { createDefaultProject, createProjectState } from "../src/state/project-state.js";

const FIRST_TIME = "2026-07-20T10:00:00.000Z";
const SECOND_TIME = "2026-07-20T10:01:00.000Z";

function createPreferences() {
  const values = new Map();
  return createProjectPreferences({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
}

test("project documents serialize complete state and advance revisions", () => {
  const project = createDefaultProject();
  const document = createProjectDocument(project, { id: "project-one", now: FIRST_TIME });
  const changed = JSON.parse(JSON.stringify(project));
  changed.metadata.title = "Saved song";
  const revised = reviseProjectDocument(document, changed, { now: SECOND_TIME });
  const restored = parseProjectDocument(serializeProjectDocument(revised));

  assert.equal(restored.id, "project-one");
  assert.equal(restored.revision, 1);
  assert.equal(restored.createdAt, FIRST_TIME);
  assert.equal(restored.updatedAt, SECOND_TIME);
  assert.equal(restored.project.metadata.title, "Saved song");
  assert.deepEqual(restored.project.tracks, revised.project.tracks);
});

test("invalid portable documents fail before producing project state", () => {
  assert.throws(() => parseProjectDocument("not json"), /valid JSON/);
  assert.throws(() => parseProjectDocument(JSON.stringify({ format: "other" })), /not a Chiptune/);

  const document = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const invalid = JSON.parse(serializeProjectDocument(document));
  invalid.project.transport.bpm = 999;
  assert.throws(() => parseProjectDocument(JSON.stringify(invalid)), /tempo/);
});

test("the repository contract lists, replaces, retrieves, and deletes documents", async () => {
  const older = createProjectDocument(createDefaultProject(), { id: "older", now: FIRST_TIME });
  const newerProject = JSON.parse(JSON.stringify(createDefaultProject()));
  newerProject.metadata.title = "Newer";
  const newer = createProjectDocument(newerProject, { id: "newer", now: SECOND_TIME });
  const repository = createMemoryProjectRepository([older, newer]);

  assert.deepEqual((await repository.list()).map(({ id }) => id), ["newer", "older"]);
  const replacement = reviseProjectDocument(older, newerProject, { now: SECOND_TIME });
  await repository.save(replacement);
  assert.equal((await repository.get("older")).project.metadata.title, "Newer");
  await repository.delete("newer");
  assert.equal(await repository.get("newer"), null);
});

test("persistence saves event-driven state and project transitions clear history", async () => {
  const preferences = createPreferences();
  const repository = createMemoryProjectRepository();
  const initial = await loadInitialProjectDocument({
    createId: () => "project-one",
    now: () => FIRST_TIME,
    preferences,
    repository,
  });
  const projectState = createProjectState(initial.project);
  const ids = ["project-two"];
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    createId: () => ids.shift(),
    initialDocument: initial,
    now: () => SECOND_TIME,
    preferences,
    projectState,
    repository,
  });

  projectState.renameProject("First tune");
  assert.equal(persistence.getState().status, "unsaved");
  await persistence.saveNow();
  assert.equal((await repository.get("project-one")).revision, 1);
  assert.equal((await repository.get("project-one")).project.metadata.title, "First tune");

  projectState.setBpm(144);
  assert.equal(projectState.getHistoryState().canUndo, true);
  await persistence.duplicateProject();
  assert.equal(persistence.getActiveDocument().id, "project-two");
  assert.equal(projectState.getState().metadata.title, "First tune copy");
  assert.equal(projectState.getState().transport.bpm, 144);
  assert.equal(projectState.getHistoryState().canUndo, false);
  persistence.dispose();
});

test("failed import is atomic and ID collisions create independent copies", async () => {
  const repository = createMemoryProjectRepository();
  const initial = createProjectDocument(createDefaultProject(), { id: "same-id", now: FIRST_TIME });
  await repository.save(initial);
  const projectState = createProjectState(initial.project);
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    createId: () => "imported-id",
    initialDocument: initial,
    now: () => SECOND_TIME,
    preferences: createPreferences(),
    projectState,
    repository,
  });
  const before = projectState.getState();
  await assert.rejects(persistence.importProject("broken"), /valid JSON/);
  assert.deepEqual(projectState.getState(), before);
  assert.equal(persistence.getActiveDocument().id, "same-id");

  const importedProject = JSON.parse(JSON.stringify(initial.project));
  importedProject.metadata.title = "Shared tune";
  const collision = copyProjectDocument(initial, { id: "same-id", now: FIRST_TIME, title: "Shared tune" });
  await persistence.importProject(serializeProjectDocument(collision));
  assert.equal(persistence.getActiveDocument().id, "imported-id");
  assert.equal(projectState.getState().metadata.title, "Shared tune imported");
  assert.equal((await repository.list()).length, 2);
  persistence.dispose();
});