import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadUnavailableCloudRecovery,
  getCloudProjectRowModel,
} from "../src/features/account/account.js";

test("unavailable cloud rows expose raw download only", () => {
  const ready = getCloudProjectRowModel({
    availability: "ready",
    cloudRevision: 3,
    id: "ready",
    recoveryKey: "ready-key",
    title: "Ready cloud tune",
    updatedAt: "2026-08-04T12:00:00.000Z",
  });
  const unavailable = getCloudProjectRowModel({
    availability: "unavailable",
    id: null,
    reason: "Unsupported project schema version: 99.",
    recoveryKey: "future-firestore-key",
    title: "Future cloud tune",
    updatedAt: null,
  });

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
  assert.equal(unavailable.recoveryKey, "future-firestore-key");
  assert.match(unavailable.meta, /Unavailable/);
});

test("cloud recovery preserves raw JSON and uses the Firestore document key", async () => {
  const rawText = '{"title":"Future","document":{"project":{"schemaVersion":99}}}\n';
  const calls = [];
  const summary = {
    availability: "unavailable",
    recoveryKey: "opaque-firestore-key",
    title: "Future cloud tune",
  };

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
    { text: rawText, title: "Future cloud tune cloud recovery" },
  ]);
});
