import assert from "node:assert/strict";
import test from "node:test";

import { createV2ProjectState } from "../src/v2/domain/project-state.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";
import { createV2ProjectDocument } from "../src/v2/persistence/project-document.js";
import { createV2ProjectPersistence } from "../src/v2/persistence/project-persistence.js";

test("dispose waits for the final committed Project save before detaching", async () => {
  const projectState = createV2ProjectState(createDefaultV2Project());
  const initialDocument = createV2ProjectDocument(projectState.getState(), {
    id: "project-dispose",
    now: "2026-08-04T10:00:00.000Z",
  });
  const saved = [];
  const clearedTimers = [];
  let releaseSave;
  const repository = {
    save(document) {
      saved.push(document);
      return new Promise((resolve) => {
        releaseSave = () => resolve(document);
      });
    },
  };
  const persistence = createV2ProjectPersistence({
    autosaveDelay: 400,
    clearTimer: (timer) => clearedTimers.push(timer),
    initialDocument,
    now: () => "2026-08-04T10:00:01.000Z",
    projectState,
    repository,
    setTimer: () => "pending-autosave",
  });

  projectState.renameProject("Final committed title");
  assert.equal(persistence.hasUnsavedChanges(), true);

  const disposing = persistence.dispose();
  assert.equal(saved.length, 1, "dispose must start the dirty save before it resolves");
  assert.deepEqual(clearedTimers, ["pending-autosave"]);
  assert.equal(saved[0].project.metadata.title, "Final committed title");
  assert.equal(saved[0].revision, 1);

  let settled = false;
  void disposing.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "dispose must remain pending while repository.save is pending");

  releaseSave();
  assert.equal(await disposing, true);
  assert.equal(persistence.getState().status, "saved");
  assert.equal(persistence.hasUnsavedChanges(), false);
  assert.equal(await persistence.dispose(), false);

  projectState.renameProject("Change after disposal");
  await Promise.resolve();
  assert.equal(saved.length, 1, "disposed persistence must not observe later Project changes");
});

test("dispose drains an in-flight older generation without leaving a retry timer", async () => {
  const projectState = createV2ProjectState(createDefaultV2Project());
  const initialDocument = createV2ProjectDocument(projectState.getState(), {
    id: "project-dispose-race",
    now: "2026-08-04T11:00:00.000Z",
  });
  const activeTimers = new Set();
  const releases = [];
  const saved = [];
  let nextTimer = 0;
  const repository = {
    save(document) {
      saved.push(document);
      return new Promise((resolve) => {
        releases.push(() => resolve(document));
      });
    },
  };
  const persistence = createV2ProjectPersistence({
    autosaveDelay: 400,
    clearTimer: (timer) => activeTimers.delete(timer),
    initialDocument,
    now: () => "2026-08-04T11:00:01.000Z",
    projectState,
    repository,
    setTimer: () => {
      nextTimer += 1;
      activeTimers.add(nextTimer);
      return nextTimer;
    },
  });

  projectState.renameProject("Older in-flight title");
  const olderSave = persistence.saveNow();
  assert.equal(saved.length, 1);
  assert.equal(activeTimers.size, 0);

  projectState.renameProject("Final title during save");
  assert.equal(activeTimers.size, 1);
  const disposing = persistence.dispose();
  assert.equal(activeTimers.size, 0, "dispose must cancel the pending newer-generation timer");

  releases.shift()();
  await olderSave;
  for (let attempt = 0; attempt < 10 && saved.length < 2; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(saved.length, 2, "dispose must synchronously drain the dirty newer generation");
  assert.equal(saved[1].project.metadata.title, "Final title during save");
  assert.equal(activeTimers.size, 0, "the older save must not recreate an autosave timer");

  releases.shift()();
  assert.equal(await disposing, true);
  assert.equal(persistence.getActiveDocument().project.metadata.title, "Final title during save");
  assert.equal(persistence.getState().status, "saved");
  assert.equal(activeTimers.size, 0);
});
