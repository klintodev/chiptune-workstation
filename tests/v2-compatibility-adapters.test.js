import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCloudProjectRecord,
  normalizeCloudProjectRecord,
  normalizeCloudProjectRecordToV7,
} from "../src/firebase/cloud-project.js";
import {
  createPublicationRecord,
  normalizePublicationRecord,
  normalizePublicationRecordToV7,
} from "../src/firebase/publication.js";
import {
  createRemixService,
  createV2RemixImport,
} from "../src/firebase/remix-service.js";
import {
  createProjectDocument,
  normalizeProjectDocument,
  normalizeProjectDocumentForSchema,
  normalizeProjectDocumentToV7,
  parseProjectDocument,
  parseProjectDocumentToV7,
  serializeProjectDocument,
  serializeProjectDocumentToV7,
} from "../src/persistence/project-document.js";
import {
  createProjectPersistence,
  loadInitialProjectDocument,
} from "../src/persistence/project-persistence.js";
import { createMemoryProjectRepository } from "../src/persistence/project-repository.js";
import { createMemoryRemixProvenanceRepository } from "../src/persistence/remix-provenance-repository.js";
import { createDefaultProject, createProjectState } from "../src/state/project-state.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";

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

test("default document normalization preserves V1 while accepting canonical native V7", () => {
  const v1 = createV1Document();
  const v7 = createV7Document();

  assert.equal(normalizeProjectDocument(v1).project.schemaVersion, 6);
  assert.equal(normalizeProjectDocument(v1).project.visualiser.preset.length > 0, true);
  assert.deepEqual(normalizeProjectDocument(v7), v7);
  assert.equal(normalizeProjectDocument(v7).project.schemaVersion, 7);
});

test("the explicit V7 adapter migrates V1 purely, canonically, and idempotently", () => {
  const source = createV1Document();
  const before = JSON.stringify(source);
  const migrated = normalizeProjectDocumentToV7(source);

  assert.equal(JSON.stringify(source), before);
  assert.equal(migrated.project.schemaVersion, 7);
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
  assert.deepEqual(normalizeProjectDocumentToV7(migrated), migrated);
  assert.deepEqual(normalizeProjectDocumentForSchema(source, 7), migrated);
});

test("portable parsing has source-preserving and explicit-to-V7 paths", () => {
  const v1 = createV1Document();
  const text = serializeProjectDocument(v1);
  assert.equal(parseProjectDocument(text).project.schemaVersion, 6);
  assert.equal(parseProjectDocumentToV7(text).project.schemaVersion, 7);
  assert.equal(parseProjectDocument(serializeProjectDocumentToV7(v1)).project.schemaVersion, 7);
});

test("future and malformed nested state fails closed at every document adapter", () => {
  const future = structuredClone(createV7Document());
  future.project.schemaVersion = 8;
  assert.throws(() => normalizeProjectDocument(future), /Unsupported project schema version/);
  assert.throws(() => normalizeProjectDocumentToV7(future), /Unsupported project schema version/);

  const malformed = structuredClone(createV7Document());
  malformed.project.tracks[0].instrument.type = "project-supplied-device";
  assert.throws(() => normalizeProjectDocument(malformed), /Unknown Instrument type/);
  assert.throws(() => normalizeProjectDocumentToV7(malformed), /Unknown Instrument type/);
  assert.throws(() => normalizeProjectDocumentForSchema(createV7Document(), 6), /unavailable/);
  assert.throws(
    () => normalizeProjectDocumentForSchema(createV1Document(), 8),
    /Unsupported target project schema version/,
  );
});

test("cloud record adapters preserve either source family and explicitly migrate V1", () => {
  const v1Record = createCloudProjectRecord("user-one", createV1Document(), 3);
  const v7Record = createCloudProjectRecord("user-one", createV7Document(), 4);

  assert.equal(normalizeCloudProjectRecord(v1Record).document.project.schemaVersion, 6);
  assert.equal(normalizeCloudProjectRecord(v7Record).document.project.schemaVersion, 7);
  const migrated = normalizeCloudProjectRecordToV7(v1Record, { ownerId: "user-one" });
  assert.equal(migrated.document.project.schemaVersion, 7);
  assert.equal(migrated.cloudRevision, 3);
  assert.throws(
    () => normalizeCloudProjectRecordToV7(v1Record, { ownerId: "user-two" }),
    /owner/,
  );
});

test("publication and remix adapters validate before producing a V7 editable copy", async () => {
  const v1Publication = createPublication(createV1Document());
  const v7Publication = createPublication(createV7Document(), { publicationId: "publication-v7" });

  assert.equal(normalizePublicationRecord(v1Publication).document.project.schemaVersion, 6);
  assert.equal(normalizePublicationRecord(v7Publication).document.project.schemaVersion, 7);
  assert.equal(normalizePublicationRecordToV7(v1Publication).document.project.schemaVersion, 7);

  const remix = createV2RemixImport(v1Publication, {
    createId: () => "project-remix-v7",
    expectedRevision: 2,
    now: NOW,
  });
  assert.equal(remix.document.id, "project-remix-v7");
  assert.equal(remix.document.project.schemaVersion, 7);
  assert.equal(remix.document.project.patterns[0].id, "pattern-1");
  assert.equal(remix.document.project.tracks[0].id, "track-1");

  const projectRepository = createMemoryProjectRepository();
  const service = createRemixService({
    createId: () => "project-service-remix-v7",
    loadPublication: async () => v1Publication,
    migrateToV7: true,
    projectRepository,
    provenanceRepository: createMemoryRemixProvenanceRepository(),
  });
  assert.equal((await service.importPublication("publication-compat", 2)).document.project.schemaVersion, 7);

  const malformed = structuredClone(v7Publication);
  malformed.document.project.tracks[0].mixer.effects.push({
    instanceId: "effect-evil",
    type: "remote-code",
    version: 1,
    bypassed: false,
    params: {},
  });
  assert.throws(() => normalizePublicationRecord(malformed), /Unknown Effect type/);
});

test("repository recovery lists unsupported records and exposes untouched raw data", async () => {
  const future = structuredClone(createV7Document({ id: "future-project" }));
  future.project.schemaVersion = 8;
  const before = structuredClone(future);
  const repository = createMemoryProjectRepository([future]);

  const [summary] = await repository.list();
  assert.equal(summary.id, "future-project");
  assert.equal(summary.title, "Native V7 tune");
  assert.equal(summary.schemaVersion, 8);
  assert.equal(summary.availability, "unavailable");
  assert.deepEqual(await repository.getRaw("future-project"), before);
  await assert.rejects(repository.get("future-project"), /Unsupported project schema version/);
  await assert.rejects(repository.save(future), /Unsupported project schema version/);
  assert.deepEqual(await repository.getRaw("future-project"), before);
});

test("initial loading skips unavailable records and can migrate V1 for a V7 runtime", async () => {
  const future = structuredClone(createV7Document({ id: "future-project" }));
  future.project.schemaVersion = 8;
  future.updatedAt = "2026-08-04T13:00:00.000Z";
  const v1 = createV1Document({ id: "safe-v1" });
  const repository = createMemoryProjectRepository([future, v1]);

  const legacy = await loadInitialProjectDocument({ repository });
  assert.equal(legacy.id, "safe-v1");
  assert.equal(legacy.project.schemaVersion, 6);
  const v2 = await loadInitialProjectDocument({ repository, targetSchemaVersion: 7 });
  assert.equal(v2.id, "safe-v1");
  assert.equal(v2.project.schemaVersion, 7);
  assert.equal((await repository.getRaw("safe-v1")).project.schemaVersion, 6);
});

test("V1 persistence rejects V7 import before any repository write", async () => {
  const initial = createV1Document({ id: "active-v1" });
  const repository = createMemoryProjectRepository([initial]);
  const projectState = createProjectState(initial.project);
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    initialDocument: initial,
    projectState,
    repository,
  });

  await assert.rejects(
    persistence.importProject(serializeProjectDocument(createV7Document())),
    /unavailable/,
  );
  assert.deepEqual((await repository.list()).map(({ id }) => id), ["active-v1"]);
  assert.equal(projectState.getState().schemaVersion, 6);
  persistence.dispose();
});

test("Firestore rules admit only bounded schema 6 or schema 7 envelopes", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /project\.schemaVersion in \[6, 7\]/);
  assert.match(rules, /function validV1Project/);
  assert.match(rules, /function validV2Project/);
  assert.match(rules, /project\.transport\.loop\.endTick <= 6144/);
  assert.match(rules, /project\.mixer\.master\.effects\.size\(\) <= 4/);
});
