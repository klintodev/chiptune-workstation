import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectDocument,
} from "../src/persistence/project-document.js";
import {
  createProjectPersistence,
  loadInitialProjectDocument,
} from "../src/persistence/project-persistence.js";
import { createMemoryProjectRepository } from "../src/persistence/project-repository.js";
import { createDefaultProject, createProjectState } from "../src/state/project-state.js";
import {
  createDefaultInstrumentInstance,
  createDefaultV2Project,
} from "../src/v2/domain/schema.js";

const EARLY = "2026-08-04T10:00:00.000Z";
const LATE = "2026-08-04T13:00:00.000Z";

function recoveryFixtures() {
  const ready = createProjectDocument(createDefaultProject(), { id: "ready-v1", now: EARLY });
  const v7Project = structuredClone(createDefaultV2Project());
  v7Project.schemaVersion = 7;
  v7Project.metadata.title = "Native V7 tune";
  const v7 = createProjectDocument(v7Project, { id: "native-v7", now: LATE });
  const v8Project = structuredClone(createDefaultV2Project());
  v8Project.metadata.title = "Native V8 drum tune";
  v8Project.tracks.push({
    id: "track-drums",
    name: "Drums",
    instrument: structuredClone(createDefaultInstrumentInstance(
      "instrument-drums",
      "klinto-drums",
    )),
    mixer: { volume: 1, pan: 0, muted: false, solo: false, effects: [] },
    clips: [],
  });
  const v8 = createProjectDocument(v8Project, { id: "native-v8", now: LATE });
  const future = structuredClone(v8);
  future.id = "future";
  future.project.schemaVersion = 9;
  future.project.metadata.title = "Future tune";
  const malformed = structuredClone(ready);
  malformed.id = "malformed";
  malformed.updatedAt = LATE;
  malformed.project.metadata.title = "Broken V1 tune";
  malformed.project.transport.bpm = 999;
  return { future, malformed, ready, v7, v8 };
}

test("the V1 repository distinguishes native V7, native V8, future V9, and malformed recovery records", async () => {
  const fixtures = recoveryFixtures();
  const repository = createMemoryProjectRepository(Object.values(fixtures));

  const summaries = await repository.list();

  assert.equal(summaries.length, 5);
  assert.equal(summaries.find(({ id }) => id === "ready-v1").availability, "ready");
  assert.deepEqual(summaries
    .filter(({ availability }) => availability === "unavailable")
    .map(({ id }) => id)
    .sort(), ["future", "malformed", "native-v7", "native-v8"]);
  assert.equal(summaries.find(({ id }) => id === "native-v7").schemaVersion, 7);
  assert.match(summaries.find(({ id }) => id === "native-v7").reason, /unavailable in the current Studio/);
  assert.equal(summaries.find(({ id }) => id === "native-v8").schemaVersion, 8);
  assert.match(summaries.find(({ id }) => id === "native-v8").reason, /unavailable in the current Studio/);
  assert.equal(summaries.find(({ id }) => id === "future").schemaVersion, 9);
  assert.match(summaries.find(({ id }) => id === "malformed").reason, /tempo/);
  assert.deepEqual(await repository.getRaw("native-v7"), fixtures.v7);
  assert.deepEqual(await repository.getRaw("native-v8"), fixtures.v8);
  assert.deepEqual(await repository.getRaw("future"), fixtures.future);
  assert.equal((await repository.get("native-v7")).project.schemaVersion, 7);
  assert.equal((await repository.get("native-v8")).project.schemaVersion, 8);
  assert.equal((await repository.get("native-v8")).project.tracks[1].instrument.type, "klinto-drums");
  await assert.rejects(repository.get("future"), /Unsupported project schema version/);
});

test("V1 startup skips V7, V8, V9, and malformed records without changing their raw data", async () => {
  const fixtures = recoveryFixtures();
  const repository = createMemoryProjectRepository([
    fixtures.future,
    fixtures.malformed,
    fixtures.v8,
    fixtures.v7,
    fixtures.ready,
  ]);
  const futureBefore = structuredClone(fixtures.future);
  const v7Before = structuredClone(fixtures.v7);
  const v8Before = structuredClone(fixtures.v8);

  const initial = await loadInitialProjectDocument({ repository });

  assert.equal(initial.id, "ready-v1");
  assert.deepEqual(await repository.getRaw("future"), futureBefore);
  assert.deepEqual(await repository.getRaw("native-v7"), v7Before);
  assert.deepEqual(await repository.getRaw("native-v8"), v8Before);
});

test("V1 persistence blocks V7 and V8 activation and exposes exact V7, V8, and V9 recovery text", async () => {
  const fixtures = recoveryFixtures();
  const repository = createMemoryProjectRepository([
    fixtures.ready,
    fixtures.v7,
    fixtures.v8,
    fixtures.future,
  ]);
  const projectState = createProjectState(fixtures.ready.project);
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    initialDocument: fixtures.ready,
    projectState,
    repository,
  });
  const before = projectState.getState();

  await assert.rejects(persistence.openProject("native-v7"), /unavailable for editing/);
  await assert.rejects(persistence.openProject("native-v8"), /unavailable for editing/);
  assert.equal(persistence.getActiveDocument().id, "ready-v1");
  assert.equal(projectState.getState(), before);
  assert.deepEqual(JSON.parse(await persistence.getRawRecoveryText("native-v7")), fixtures.v7);
  assert.deepEqual(JSON.parse(await persistence.getRawRecoveryText("native-v8")), fixtures.v8);
  assert.deepEqual(JSON.parse(await persistence.getRawRecoveryText("future")), fixtures.future);
  persistence.dispose();
});

test("deleting the active V1 Project preserves unavailable records and creates a safe replacement", async () => {
  const fixtures = recoveryFixtures();
  const repository = createMemoryProjectRepository([fixtures.ready, fixtures.v7, fixtures.v8]);
  const projectState = createProjectState(fixtures.ready.project);
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    createId: () => "replacement-v1",
    initialDocument: fixtures.ready,
    now: () => LATE,
    projectState,
    repository,
  });

  await persistence.deleteProject("ready-v1");

  assert.equal(persistence.getActiveDocument().id, "replacement-v1");
  assert.equal(projectState.getState().schemaVersion, 6);
  assert.deepEqual(await repository.getRaw("native-v7"), fixtures.v7);
  assert.deepEqual(await repository.getRaw("native-v8"), fixtures.v8);
  assert.equal((await repository.list()).find(({ id }) => id === "native-v7").availability, "unavailable");
  assert.equal((await repository.list()).find(({ id }) => id === "native-v8").availability, "unavailable");
  persistence.dispose();
});
