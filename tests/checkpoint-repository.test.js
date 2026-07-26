import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CHECKPOINTS_PER_PROJECT,
  createCheckpointRecord,
  createMemoryCheckpointRepository,
  normalizeCheckpointRecord,
} from "../src/persistence/checkpoint-repository.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createDefaultProject } from "../src/state/project-state.js";

function projectDocument({
  id = "project-checkpoint",
  title = "Checkpoint song",
} = {}) {
  const project = structuredClone(createDefaultProject());
  project.metadata.title = title;
  return createProjectDocument(project, {
    id,
    now: "2026-07-26T12:00:00.000Z",
  });
}

function checkpoint(index, overrides = {}) {
  return createCheckpointRecord({
    checkpointId: `checkpoint-${index}`,
    createdAt: `2026-07-26T12:${String(index).padStart(2, "0")}:00.000Z`,
    document: projectDocument(overrides),
    label: `Idea ${index}`,
    operation: "manual",
  });
}

test("checkpoint records contain immutable validated project snapshots", () => {
  const record = checkpoint(1);
  assert.equal(record.projectId, "project-checkpoint");
  assert.equal(record.sourceProjectRevision, 0);
  assert.equal(record.schemaVersion, record.document.project.schemaVersion);
  assert.equal(normalizeCheckpointRecord(structuredClone(record)).checkpointId, "checkpoint-1");
  assert.throws(() => normalizeCheckpointRecord({
    ...record,
    projectId: "another-project",
  }), /does not match/);
  assert.throws(() => createCheckpointRecord({
    checkpointId: "checkpoint-long",
    document: projectDocument(),
    label: "x".repeat(65),
  }), /0 to 64/);
});

test("checkpoint storage is append-only, project-scoped, and separately deletable", async () => {
  const first = checkpoint(1);
  const other = checkpoint(2, { id: "project-other", title: "Other song" });
  const repository = createMemoryCheckpointRepository();

  await repository.save(first);
  await repository.save(other);
  assert.deepEqual((await repository.list(first.projectId)).map(({ checkpointId }) => checkpointId), ["checkpoint-1"]);
  assert.equal((await repository.get("checkpoint-1")).document.project.metadata.title, "Checkpoint song");
  await assert.rejects(repository.save(first), /immutable.*unique/);
  assert.equal(await repository.deleteProject(first.projectId), 1);
  assert.equal(await repository.get("checkpoint-1"), null);
  assert.equal((await repository.list(other.projectId)).length, 1);
});

test("checkpoint counts are bounded without damaging existing records", async () => {
  const repository = createMemoryCheckpointRepository();
  for (let index = 0; index < MAX_CHECKPOINTS_PER_PROJECT; index += 1) {
    await repository.save(checkpoint(index));
  }
  await assert.rejects(repository.save(checkpoint(MAX_CHECKPOINTS_PER_PROJECT)), /at most/);
  assert.equal((await repository.list("project-checkpoint")).length, MAX_CHECKPOINTS_PER_PROJECT);
});

test("disposed checkpoint storage rejects later work", async () => {
  const repository = createMemoryCheckpointRepository([checkpoint(1)]);
  repository.dispose();
  await assert.rejects(repository.list("project-checkpoint"), /disposed/);
  await assert.rejects(repository.save(checkpoint(2)), /disposed/);
});
