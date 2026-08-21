import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCloudProjectRecord,
  normalizeCloudProjectRecord,
  normalizeCloudProjectRecordToV7,
  normalizeCloudProjectRecordToV8,
} from "../src/firebase/cloud-project.js";
import {
  createPublicationRecord,
  normalizePublicationRecord,
  normalizePublicationRecordToV7,
  normalizePublicationRecordToV8,
} from "../src/firebase/publication.js";
import {
  createRemixImport,
  createRemixService,
  createV2RemixImport,
  createV8RemixImport,
} from "../src/firebase/remix-service.js";
import {
  createProjectDocument,
  normalizeProjectDocument,
  normalizeProjectDocumentForSchema,
  normalizeProjectDocumentToV7,
  normalizeProjectDocumentToV8,
  parseProjectDocument,
  parseProjectDocumentToV7,
  parseProjectDocumentToV8,
  serializeProjectDocument,
  serializeProjectDocumentToV7,
  serializeProjectDocumentToV8,
} from "../src/persistence/project-document.js";
import {
  createProjectPersistence,
  loadInitialProjectDocument,
} from "../src/persistence/project-persistence.js";
import { createMemoryProjectRepository } from "../src/persistence/project-repository.js";
import { createMemoryRemixProvenanceRepository } from "../src/persistence/remix-provenance-repository.js";
import { createDefaultProject, createProjectState } from "../src/state/project-state.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";
import { createV2ProjectState } from "../src/v2/domain/project-state.js";
import { createV2ProjectPersistence } from "../src/v2/persistence/project-persistence.js";
import { createV2MemoryProjectRepository } from "../src/v2/persistence/project-repository.js";

const NOW = "2026-08-04T12:00:00.000Z";

function createV1Document({ id = "project-v1" } = {}) {
  const project = structuredClone(createDefaultProject());
  project.metadata.title = "Compatibility tune";
  project.patterns[0].steps[0] = { note: 60, gate: 0.25, volume: 0.7 };
  project.tracks[0].clips = [{ id: "clip-1", patternId: "pattern-1", startStep: 2 }];
  project.transport.loop = { enabled: true, mode: "custom", startStep: 1, endStep: 8 };
  return createProjectDocument(project, { id, now: NOW });
}

function createV7Document({ id = "project-v7" } = {}) {
  const project = structuredClone(createDefaultV2Project());
  project.schemaVersion = 7;
  project.metadata.title = "Native V7 tune";
  project.patterns[0].notes.push({
    id: "note-native",
    pitch: 67,
    startTick: 24,
    durationTicks: 18,
    velocity: 0.75,
  });
  project.tracks[0].clips.push({ id: "clip-native", patternId: "pattern-1", startTick: 0 });
  return createProjectDocument(project, { id, now: NOW });
}

function createV8Document({ id = "project-v8" } = {}) {
  const project = structuredClone(createDefaultV2Project());
  project.metadata.title = "Native V8 drum tune";
  project.patterns[0].notes.push({
    id: "note-native-v8",
    pitch: 36,
    startTick: 0,
    durationTicks: 24,
    velocity: 0.8,
  });
  project.tracks[0].clips.push({ id: "clip-chip-v8", patternId: "pattern-1", startTick: 0 });
  project.tracks.push({
    id: "track-drums",
    name: "Drums",
    instrument: {
      instanceId: "instrument-drums",
      type: "klinto-drums",
      version: 1,
      params: { tone: 0.8, decaySeconds: 1.25, level: 0.65 },
    },
    mixer: { volume: 0.9, pan: -0.1, muted: false, solo: false, effects: [] },
    clips: [{ id: "clip-drums-v8", patternId: "pattern-1", startTick: 384 }],
  });
  return createProjectDocument(project, { id, now: NOW });
}

function createPublication(document, { publicationId = "publication-compat" } = {}) {
  return createPublicationRecord({
    allowRemix: true,
    creatorName: "Chip Artist",
    document,
    ownerSlot: "01",
    publicationId,
    publicationRevision: 2,
    publishedAt: NOW,
    updatedAt: NOW,
  });
}

test("generic document normalization preserves native V6, V7, and V8 sources", () => {
  const v6 = createV1Document();
  const v7 = createV7Document();
  const v8 = createV8Document();

  assert.deepEqual(normalizeProjectDocument(v6), v6);
  assert.equal(normalizeProjectDocument(v6).project.visualiser.preset.length > 0, true);
  assert.deepEqual(normalizeProjectDocument(v7), v7);
  assert.deepEqual(normalizeProjectDocument(v8), v8);
  assert.deepEqual([v6, v7, v8].map(({ project }) => project.schemaVersion), [6, 7, 8]);
  assert.equal(normalizeProjectDocument(v8).project.tracks[1].instrument.type, "klinto-drums");
});

test("explicit ToV8 adapters are pure and idempotent while V7-named aliases return current V8", () => {
  const source = createV1Document();
  const v7 = createV7Document();
  const v8 = createV8Document();
  const before = JSON.stringify(source);
  const migrated = normalizeProjectDocumentToV8(source);

  assert.equal(JSON.stringify(source), before);
  assert.equal(migrated.project.schemaVersion, 8);
  assert.equal(migrated.project.patterns[0].lengthTicks, 6);
  assert.deepEqual(migrated.project.patterns[0].notes[0], {
    id: migrated.project.patterns[0].notes[0].id,
    pitch: 60,
    startTick: 0,
    durationTicks: 6,
    velocity: 0.7,
  });
  assert.equal(migrated.project.tracks[0].clips[0].startTick, 48);
  assert.equal(migrated.project.transport.loop.startTick, 24);
  assert.equal(migrated.project.transport.loop.endTick, 192);
  assert.equal(migrated.project.tracks[0].instrument.type, "klinto-chip");
  assert.equal(migrated.project.tracks[0].mixer.effects.length, 0);
  assert.deepEqual(normalizeProjectDocumentToV8(migrated), migrated);
  assert.deepEqual(normalizeProjectDocumentForSchema(source, 8), migrated);

  const migratedV7 = normalizeProjectDocumentToV8(v7);
  const expectedV7Project = structuredClone(v7.project);
  expectedV7Project.schemaVersion = 8;
  assert.deepEqual(migratedV7.project, expectedV7Project);
  assert.deepEqual(normalizeProjectDocumentToV8(v8), v8);
  for (const document of [source, v7, v8]) {
    assert.deepEqual(
      normalizeProjectDocumentToV7(document),
      normalizeProjectDocumentToV8(document),
    );
    assert.equal(normalizeProjectDocumentToV7(document).project.schemaVersion, 8);
  }
});

test("portable parsing preserves source versions and exposes explicit and legacy-named ToV8 paths", () => {
  const v6 = createV1Document();
  const v7 = createV7Document();
  const v8 = createV8Document();

  for (const document of [v6, v7, v8]) {
    assert.deepEqual(parseProjectDocument(serializeProjectDocument(document)), document);
    assert.equal(parseProjectDocumentToV8(serializeProjectDocument(document)).project.schemaVersion, 8);
    assert.deepEqual(
      parseProjectDocumentToV7(serializeProjectDocument(document)),
      parseProjectDocumentToV8(serializeProjectDocument(document)),
    );
  }
  assert.deepEqual(
    parseProjectDocument(serializeProjectDocumentToV8(v6)),
    normalizeProjectDocumentToV8(v6),
  );
  assert.equal(serializeProjectDocumentToV7(v7), serializeProjectDocumentToV8(v7));
});

test("native V7 raw data stays source-preserved until one committed V8 save reports its upgrade", async () => {
  const source = createV7Document({ id: "project-v7-commit" });
  const repository = createV2MemoryProjectRepository([source]);
  const activated = await repository.get(source.id);
  const projectState = createV2ProjectState(activated.project);
  const upgrades = [];
  const persistence = createV2ProjectPersistence({
    clearTimer() {},
    initialDocument: activated,
    initialSourceSchemaVersion: 7,
    now: () => "2026-08-04T12:01:00.000Z",
    onProjectUpgrade: (detail) => upgrades.push(detail),
    projectState,
    repository,
    setTimer: () => 1,
  });

  assert.equal(activated.project.schemaVersion, 8);
  assert.equal((await repository.getRaw(source.id)).project.schemaVersion, 7);
  assert.deepEqual(upgrades, []);

  projectState.renameProject("Committed V8 tune");
  await persistence.saveNow();

  assert.equal((await repository.getRaw(source.id)).project.schemaVersion, 8);
  assert.deepEqual(upgrades, [{
    fromSchemaVersion: 7,
    projectId: source.id,
  }]);

  projectState.renameProject("Second V8 save");
  await persistence.saveNow();
  assert.equal(upgrades.length, 1);
  await persistence.dispose();
});

test("a clean native V7 migration commits only on explicit opt-in and discloses once", async () => {
  const source = createV7Document({ id: "project-v7-forced-commit" });
  const repository = createV2MemoryProjectRepository([source]);
  const activated = await repository.get(source.id);
  const projectState = createV2ProjectState(activated.project);
  const upgrades = [];
  const upgradeEvents = [];
  const persistence = createV2ProjectPersistence({
    clearTimer() {},
    initialDocument: activated,
    initialSourceSchemaVersion: 7,
    now: () => "2026-08-04T12:01:00.000Z",
    onProjectUpgrade: (detail) => upgrades.push(detail),
    projectState,
    repository,
    setTimer: () => 1,
  });
  persistence.addEventListener("change", (event) => {
    if (Number.isInteger(event.detail?.fromSchemaVersion)) upgradeEvents.push(event.detail);
  });

  assert.equal(persistence.getPendingUpgradeSourceSchemaVersion(), 7);
  await persistence.saveNow();
  await persistence.exportProject();
  assert.deepEqual(await repository.getRaw(source.id), source);
  assert.deepEqual(upgrades, []);
  assert.deepEqual(upgradeEvents, []);

  const committed = await persistence.saveNow({ commitUpgrade: true });
  const committedRaw = await repository.getRaw(source.id);
  assert.equal(committed.project.schemaVersion, 8);
  assert.equal(committed.revision, source.revision + 1);
  assert.equal(committedRaw.project.schemaVersion, 8);
  assert.equal(committedRaw.revision, source.revision + 1);
  assert.equal(persistence.getPendingUpgradeSourceSchemaVersion(), null);
  assert.deepEqual(upgrades, [{
    fromSchemaVersion: 7,
    projectId: source.id,
  }]);
  assert.equal(upgradeEvents.length, 1);
  assert.equal(upgradeEvents[0].type, "saved");
  assert.equal(upgradeEvents[0].fromSchemaVersion, 7);
  assert.equal(upgradeEvents[0].projectId, source.id);

  const afterFirstCommit = structuredClone(committedRaw);
  await persistence.saveNow({ commitUpgrade: true });
  assert.deepEqual(await repository.getRaw(source.id), afterFirstCommit);
  assert.equal(upgrades.length, 1);
  assert.equal(upgradeEvents.length, 1);
  await persistence.dispose();
  assert.deepEqual(await repository.getRaw(source.id), afterFirstCommit);
});

test("disposing a clean native V7 migration preserves its raw source", async () => {
  const source = createV7Document({ id: "project-v7-clean-dispose" });
  const repository = createV2MemoryProjectRepository([source]);
  const activated = await repository.get(source.id);
  const persistence = createV2ProjectPersistence({
    initialDocument: activated,
    initialSourceSchemaVersion: 7,
    projectState: createV2ProjectState(activated.project),
    repository,
  });

  assert.equal(await persistence.dispose(), true);
  assert.deepEqual(await repository.getRaw(source.id), source);
});

test("future V9 and malformed nested state fail closed at every document adapter", () => {
  const future = structuredClone(createV8Document());
  future.project.schemaVersion = 9;
  assert.throws(() => normalizeProjectDocument(future), /Unsupported project schema version/);
  assert.throws(() => normalizeProjectDocumentToV8(future), /Unsupported project schema version/);
  assert.throws(() => normalizeProjectDocumentToV7(future), /Unsupported project schema version/);

  const malformed = structuredClone(createV8Document());
  malformed.project.tracks[1].instrument.type = "project-supplied-device";
  assert.throws(() => normalizeProjectDocument(malformed), /Unknown Instrument type/);
  assert.throws(() => normalizeProjectDocumentToV8(malformed), /Unknown Instrument type/);
  assert.throws(() => normalizeProjectDocumentForSchema(createV7Document(), 6), /unavailable/);
  assert.throws(
    () => normalizeProjectDocumentForSchema(createV1Document(), 9),
    /Unsupported target project schema version/,
  );
  assert.throws(
    () => normalizeProjectDocumentForSchema(createV1Document(), 7),
    /Unsupported target project schema version/,
  );
});

test("cloud adapters preserve V6, V7, and native drum V8 sources and explicitly normalize to V8", () => {
  const v6Record = createCloudProjectRecord("user-one", createV1Document(), 3);
  const v7Record = createCloudProjectRecord("user-one", createV7Document(), 4);
  const v8Record = createCloudProjectRecord("user-one", createV8Document(), 5);

  for (const [record, schemaVersion] of [[v6Record, 6], [v7Record, 7], [v8Record, 8]]) {
    assert.deepEqual(normalizeCloudProjectRecord(record), record);
    assert.equal(normalizeCloudProjectRecord(record).document.project.schemaVersion, schemaVersion);
    assert.equal(normalizeCloudProjectRecordToV8(record).document.project.schemaVersion, 8);
    assert.deepEqual(
      normalizeCloudProjectRecordToV7(record),
      normalizeCloudProjectRecordToV8(record),
    );
  }
  assert.deepEqual(normalizeCloudProjectRecordToV8(v8Record), v8Record);
  assert.deepEqual(v8Record.document.project.tracks[1].instrument.params, {
    tone: 0.8,
    decaySeconds: 1.25,
    level: 0.65,
  });
  assert.equal(normalizeCloudProjectRecordToV8(v6Record).cloudRevision, 3);
  assert.throws(
    () => normalizeCloudProjectRecordToV8(v6Record, { ownerId: "user-two" }),
    /owner/,
  );
});

test("publication and remix adapters preserve sources and expose V8 plus legacy compatibility APIs", async () => {
  const v6Publication = createPublication(createV1Document());
  const v7Publication = createPublication(createV7Document(), { publicationId: "publication-v7" });
  const v8Publication = createPublication(createV8Document(), { publicationId: "publication-v8" });

  for (const [publication, schemaVersion] of [
    [v6Publication, 6],
    [v7Publication, 7],
    [v8Publication, 8],
  ]) {
    assert.equal(normalizePublicationRecord(publication).document.project.schemaVersion, schemaVersion);
    assert.equal(normalizePublicationRecordToV8(publication).document.project.schemaVersion, 8);
    assert.deepEqual(
      normalizePublicationRecordToV7(publication),
      normalizePublicationRecordToV8(publication),
    );
    assert.equal(createRemixImport(publication, {
      createId: () => `project-generic-remix-v${schemaVersion}`,
      expectedRevision: 2,
      now: NOW,
    }).document.project.schemaVersion, schemaVersion);
  }
  assert.deepEqual(normalizePublicationRecord(v8Publication), v8Publication);

  const remix = createV8RemixImport(v8Publication, {
    createId: () => "project-remix-v8",
    expectedRevision: 2,
    now: NOW,
  });
  assert.equal(remix.document.id, "project-remix-v8");
  assert.equal(remix.document.project.schemaVersion, 8);
  assert.equal(remix.document.project.tracks[1].instrument.type, "klinto-drums");
  assert.deepEqual(remix.document.project.tracks[1].instrument.params, {
    tone: 0.8,
    decaySeconds: 1.25,
    level: 0.65,
  });
  const aliasedRemix = createV2RemixImport(v6Publication, {
    createId: () => "project-remix-v2-alias",
    expectedRevision: 2,
    now: NOW,
  });
  assert.equal(aliasedRemix.document.project.schemaVersion, 8);

  const v8Service = createRemixService({
    createId: () => "project-service-remix-v8",
    loadPublication: async () => v6Publication,
    migrateToV8: true,
    projectRepository: createMemoryProjectRepository(),
    provenanceRepository: createMemoryRemixProvenanceRepository(),
  });
  assert.equal((await v8Service.importPublication("publication-compat", 2)).document.project.schemaVersion, 8);

  const aliasService = createRemixService({
    createId: () => "project-service-remix-v7-alias",
    loadPublication: async () => v6Publication,
    migrateToV7: true,
    projectRepository: createMemoryProjectRepository(),
    provenanceRepository: createMemoryRemixProvenanceRepository(),
  });
  assert.equal((await aliasService.importPublication("publication-compat", 2)).document.project.schemaVersion, 8);

  const malformed = structuredClone(v8Publication);
  malformed.document.project.tracks[0].mixer.effects.push({
    instanceId: "effect-evil",
    type: "remote-code",
    version: 1,
    bypassed: false,
    params: {},
  });
  assert.throws(() => normalizePublicationRecord(malformed), /Unknown Effect type/);
});

test("repository recovery lists future V9 and exposes its untouched raw data", async () => {
  const future = structuredClone(createV8Document({ id: "future-project" }));
  future.project.schemaVersion = 9;
  const before = structuredClone(future);
  const repository = createMemoryProjectRepository([future]);

  const [summary] = await repository.list();
  assert.equal(summary.id, "future-project");
  assert.equal(summary.title, "Native V8 drum tune");
  assert.equal(summary.schemaVersion, 9);
  assert.equal(summary.availability, "unavailable");
  assert.deepEqual(await repository.getRaw("future-project"), before);
  await assert.rejects(repository.get("future-project"), /Unsupported project schema version/);
  await assert.rejects(repository.save(future), /Unsupported project schema version/);
  assert.deepEqual(await repository.getRaw("future-project"), before);
});

test("initial loading skips future V9 and can migrate V6 for a current V8 runtime", async () => {
  const future = structuredClone(createV8Document({ id: "future-project" }));
  future.project.schemaVersion = 9;
  future.updatedAt = "2026-08-04T13:00:00.000Z";
  const v6 = createV1Document({ id: "safe-v6" });
  const repository = createMemoryProjectRepository([future, v6]);

  const legacy = await loadInitialProjectDocument({ repository });
  assert.equal(legacy.id, "safe-v6");
  assert.equal(legacy.project.schemaVersion, 6);
  const current = await loadInitialProjectDocument({ repository, targetSchemaVersion: 8 });
  assert.equal(current.id, "safe-v6");
  assert.equal(current.project.schemaVersion, 8);
  assert.equal((await repository.getRaw("safe-v6")).project.schemaVersion, 6);
});

test("V1 persistence rejects native V7 and V8 imports before any repository write", async () => {
  const initial = createV1Document({ id: "active-v1" });
  const repository = createMemoryProjectRepository([initial]);
  const projectState = createProjectState(initial.project);
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    initialDocument: initial,
    projectState,
    repository,
  });

  for (const document of [createV7Document(), createV8Document()]) {
    await assert.rejects(
      persistence.importProject(serializeProjectDocument(document)),
      /unavailable/,
    );
  }
  assert.deepEqual((await repository.list()).map(({ id }) => id), ["active-v1"]);
  assert.equal(projectState.getState().schemaVersion, 6);
  persistence.dispose();
});

test("Firestore rules admit bounded schema 6, historical schema 7, and current schema 8 envelopes", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /project\.schemaVersion in \[6, 7, 8\]/);
  assert.match(rules, /project\.schemaVersion in \[7, 8\]/);
  assert.match(rules, /function validV1Project/);
  assert.match(rules, /function validV2Project/);
  assert.match(rules, /project\.transport\.loop\.endTick <= 6144/);
  assert.match(rules, /project\.mixer\.master\.effects\.size\(\) <= 4/);
});
