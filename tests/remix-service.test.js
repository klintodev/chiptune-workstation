import assert from "node:assert/strict";
import test from "node:test";

import { createPublicationRecord } from "../src/firebase/publication.js";
import {
  createRemixImport,
  createRemixService,
} from "../src/firebase/remix-service.js";
import { importAndOpenRemix } from "../src/features/remixing/remix-import-feature.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createMemoryProjectRepository } from "../src/persistence/project-repository.js";
import { createMemoryRemixProvenanceRepository } from "../src/persistence/remix-provenance-repository.js";
import { createDefaultProject } from "../src/state/project-state.js";

function publication({ allowRemix = true, revision = 3 } = {}) {
  const project = structuredClone(createDefaultProject());
  project.metadata.title = "Public tune";
  const document = createProjectDocument(project, {
    id: "project-private-source",
    now: "2026-07-26T12:00:00.000Z",
  });
  return createPublicationRecord({
    allowRemix,
    creatorName: "Chip Artist",
    document,
    ownerSlot: "01",
    publicationId: "publication-public",
    publicationRevision: revision,
    publishedAt: "2026-07-26T12:00:00.000Z",
    updatedAt: "2026-07-26T12:00:00.000Z",
  });
}

test("remix imports create a new local identity with bounded public provenance", () => {
  const created = createRemixImport(publication(), {
    createId: () => "project-local-remix",
    expectedRevision: 3,
    now: "2026-07-26T12:30:00.000Z",
  });
  assert.equal(created.document.id, "project-local-remix");
  assert.equal(created.document.project.metadata.title, "Public tune remix");
  assert.equal(created.document.revision, 0);
  assert.deepEqual(Object.keys(created.provenance).sort(), [
    "creatorName",
    "permissionGranted",
    "publicationId",
    "publicationRevision",
    "sourceTitle",
  ]);
  assert.equal(JSON.stringify(created).includes("project-private-source"), false);
  assert.equal(JSON.stringify(created).includes("ownerSlot"), false);
});

test("remix permission and exact revision are revalidated before local writes", async () => {
  const projectRepository = createMemoryProjectRepository();
  const provenanceRepository = createMemoryRemixProvenanceRepository();
  let current = publication({ allowRemix: false });
  const service = createRemixService({
    createId: () => "project-remix",
    loadPublication: async () => current,
    projectRepository,
    provenanceRepository,
  });

  await assert.rejects(service.importPublication("publication-public", 3), /not allowing/);
  assert.deepEqual(await projectRepository.list(), []);
  current = publication({ allowRemix: true, revision: 4 });
  await assert.rejects(service.importPublication("publication-public", 3), /changed/);
  assert.deepEqual(await projectRepository.list(), []);

  const imported = await service.importPublication("publication-public", 4);
  assert.equal((await projectRepository.list()).length, 1);
  assert.deepEqual(await provenanceRepository.get(imported.document.id), imported.provenance);
});

test("failed provenance storage rolls back the new project without changing current work", async () => {
  const current = createProjectDocument(createDefaultProject(), {
    id: "project-current",
    now: "2026-07-26T10:00:00.000Z",
  });
  const projectRepository = createMemoryProjectRepository([current]);
  const service = createRemixService({
    createId: () => "project-remix-fails",
    loadPublication: async () => publication(),
    projectRepository,
    provenanceRepository: {
      async save() {
        throw new Error("Quota unavailable");
      },
    },
  });

  await assert.rejects(service.importPublication("publication-public", 3), /Quota unavailable/);
  assert.deepEqual((await projectRepository.list()).map(({ id }) => id), ["project-current"]);
});

test("a locally saved remix remains discoverable when opening it fails", async () => {
  const projectRepository = createMemoryProjectRepository();
  const provenanceRepository = createMemoryRemixProvenanceRepository();
  const service = createRemixService({
    createId: () => "project-remix-saved",
    loadPublication: async () => publication(),
    projectRepository,
    provenanceRepository,
  });
  const result = await importAndOpenRemix({
    intent: {
      publicationId: "publication-public",
      publicationRevision: 3,
    },
    persistence: {
      async openProject() {
        throw new Error("Could not activate local project");
      },
    },
    remixService: service,
  });

  assert.equal(result.status, "saved-not-opened");
  assert.equal(result.imported.document.id, "project-remix-saved");
  assert.match(result.error.message, /activate/);
  assert.deepEqual(
    (await projectRepository.list()).map(({ id }) => id),
    ["project-remix-saved"],
  );
  assert.deepEqual(
    await provenanceRepository.get("project-remix-saved"),
    result.imported.provenance,
  );
});

test("a remix creation failure remains distinct from a post-save open failure", async () => {
  await assert.rejects(importAndOpenRemix({
    intent: {
      publicationId: "publication-public",
      publicationRevision: 3,
    },
    persistence: {
      async openProject() {
        throw new Error("This should not be reached");
      },
    },
    remixService: {
      async importPublication() {
        throw new Error("Local storage quota unavailable");
      },
    },
  }), /quota unavailable/);
});
