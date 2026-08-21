import assert from "node:assert/strict";
import test from "node:test";

import {
  createCloudProjectRecord,
  serializeRawCloudProjectRecord,
  summarizeCloudProjectRecordForRecovery,
} from "../src/firebase/cloud-project.js";
import {
  downloadUnavailableCloudRecovery,
  getCloudProjectRowModel,
} from "../src/features/account/account.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";

function createNativeV8CloudRecord() {
  const project = structuredClone(createDefaultV2Project());
  project.metadata.title = "Native V8 tune";
  const document = createProjectDocument(project, {
    id: "native-v8",
    now: "2026-08-04T12:00:00.000Z",
  });
  return createCloudProjectRecord("user-one", document, 4);
}

test("unavailable cloud rows expose raw download only", () => {
  const ready = getCloudProjectRowModel({
    availability: "ready",
    cloudRevision: 3,
    id: "ready",
    recoveryKey: "ready-key",
    title: "Ready cloud tune",
    updatedAt: "2026-08-04T12:00:00.000Z",
  });
  const unavailableSummary = summarizeCloudProjectRecordForRecovery(
    createNativeV8CloudRecord(),
    {
      ownerId: "user-one",
      recoveryKey: "native-v8-firestore-key",
      targetSchemaVersion: 6,
    },
  );
  const unavailable = getCloudProjectRowModel(unavailableSummary);

  assert.deepEqual({
    canDelete: ready.canDelete,
    canOpen: ready.canOpen,
    canRecover: ready.canRecover,
  }, { canDelete: true, canOpen: true, canRecover: false });
  assert.deepEqual({
    canDelete: unavailable.canDelete,
    canOpen: unavailable.canOpen,
    canRecover: unavailable.canRecover,
  }, { canDelete: false, canOpen: false, canRecover: true });
  assert.equal(unavailable.recoveryKey, "native-v8-firestore-key");
  assert.match(unavailable.meta, /Unavailable/);
});

test("cloud recovery preserves raw JSON and uses the Firestore document key", async () => {
  const record = createNativeV8CloudRecord();
  const rawText = serializeRawCloudProjectRecord(record);
  const calls = [];
  const summary = summarizeCloudProjectRecordForRecovery(record, {
    ownerId: "user-one",
    recoveryKey: "opaque-firestore-key",
    targetSchemaVersion: 6,
  });

  const result = await downloadUnavailableCloudRecovery(summary, {
    cloudProjectService: {
      async getRawRecoveryText(recoveryKey) {
        calls.push({ recoveryKey });
        return rawText;
      },
    },
    downloadRecoveryProject(text, title) {
      calls.push({ text, title });
      return "downloaded";
    },
  });

  assert.equal(result, "downloaded");
  assert.deepEqual(calls, [
    { recoveryKey: "opaque-firestore-key" },
    { text: rawText, title: "Native V8 tune cloud recovery" },
  ]);
});
