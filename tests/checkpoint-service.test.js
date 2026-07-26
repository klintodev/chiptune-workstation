import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryCheckpointRepository } from "../src/persistence/checkpoint-repository.js";
import { createCheckpointService } from "../src/persistence/checkpoint-service.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createDefaultProject } from "../src/state/project-state.js";

function document(title, revision = 0) {
  const project = structuredClone(createDefaultProject());
  project.metadata.title = title;
  return {
    ...createProjectDocument(project, {
      id: "project-active",
      now: "2026-07-26T10:00:00.000Z",
    }),
    revision,
  };
}

test("destructive replacement waits for its required recovery checkpoint", async () => {
  const current = document("Current work", 4);
  const target = document("Starter project");
  const calls = [];
  const service = createCheckpointService({
    createId: () => "checkpoint-recovery",
    now: () => "2026-07-26T11:00:00.000Z",
    persistence: {
      getActiveDocument: () => current,
      async saveNow() {
        calls.push("save-current");
        return current;
      },
    },
    async replaceProject(next, detail) {
      calls.push("replace");
      assert.equal(next.project.metadata.title, "Starter project");
      assert.equal(detail.recoveryCheckpointId, "checkpoint-recovery");
    },
    repository: {
      async save(record) {
        calls.push("checkpoint");
        return record;
      },
    },
  });

  await service.protectAndReplace(target);
  assert.deepEqual(calls, ["save-current", "checkpoint", "replace"]);
});

test("checkpoint quota failure blocks replacement without partial state", async () => {
  let replaced = false;
  const service = createCheckpointService({
    persistence: { saveNow: async () => document("Current") },
    replaceProject: async () => {
      replaced = true;
    },
    repository: {
      async save() {
        throw new Error("Checkpoint quota unavailable");
      },
    },
  });
  await assert.rejects(service.protectAndReplace(document("Starter")), /quota/);
  assert.equal(replaced, false);
});

test("restore creates a recovery checkpoint and never rewrites its source", async () => {
  const current = document("Current", 5);
  const source = document("Strong idea", 2);
  const repository = createMemoryCheckpointRepository();
  await repository.save({
    checkpointFormat: "chiptune-workstation-checkpoint",
    checkpointVersion: 1,
    checkpointId: "checkpoint-source",
    projectId: source.id,
    createdAt: "2026-07-26T10:30:00.000Z",
    label: "Strong idea",
    operation: "manual",
    schemaVersion: source.project.schemaVersion,
    sourceProjectRevision: source.revision,
    document: source,
  });
  const replacements = [];
  const service = createCheckpointService({
    createId: () => "checkpoint-before-restore",
    now: () => "2026-07-26T11:00:00.000Z",
    persistence: {
      getActiveDocument: () => current,
      saveNow: async () => current,
    },
    replaceProject: async (target, detail) => replacements.push({ target, detail }),
    repository,
  });

  const result = await service.restore("checkpoint-source");
  assert.equal(result.recovery.checkpointId, "checkpoint-before-restore");
  assert.equal(replacements[0].target.project.metadata.title, "Strong idea");
  assert.equal(replacements[0].detail.sourceCheckpointId, "checkpoint-source");
  assert.equal((await repository.get("checkpoint-source")).document.project.metadata.title, "Strong idea");
  assert.equal((await repository.list(current.id)).length, 2);
});
