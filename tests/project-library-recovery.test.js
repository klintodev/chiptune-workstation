import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  downloadUnavailableProjectRecovery,
  getProjectLibraryRowModel,
} from "../src/features/project-library/project-library.js";
import {
  downloadProjectFile,
  downloadRawProjectFile,
} from "../src/persistence/project-download.js";
import { createDefaultV2Project } from "../src/v2/domain/schema.js";
import { createV2ProjectState } from "../src/v2/domain/project-state.js";
import {
  createV2ProjectDocument,
} from "../src/v2/persistence/project-document.js";
import { createV2ProjectPersistence } from "../src/v2/persistence/project-persistence.js";
import { createV2MemoryProjectRepository } from "../src/v2/persistence/project-repository.js";

const NOW = "2026-08-04T12:00:00.000Z";

function createRawFixtures() {
  const ready = createV2ProjectDocument(createDefaultV2Project(), { id: "ready", now: NOW });
  const future = structuredClone(ready);
  future.id = "future";
  future.project.schemaVersion = 99;
  future.project.metadata.title = "Future song";
  const malformed = structuredClone(ready);
  malformed.id = "malformed";
  malformed.project.metadata.title = "Broken links";
  malformed.project.tracks[0].clips = [{ id: "clip-1", patternId: "missing", startTick: 0 }];
  return { future, malformed, ready };
}

test("V2 local listings retain ready, future and malformed records with safe metadata", async () => {
  const fixtures = createRawFixtures();
  const repository = createV2MemoryProjectRepository([
    fixtures.ready,
    fixtures.future,
    fixtures.malformed,
  ]);

  const summaries = await repository.list();

  assert.equal(summaries.length, 3);
  assert.equal(summaries.find(({ id }) => id === "ready").availability, "ready");
  assert.equal(summaries.find(({ id }) => id === "future").availability, "unavailable");
  assert.equal(summaries.find(({ id }) => id === "future").title, "Future song");
  assert.match(summaries.find(({ id }) => id === "future").reason, /Unsupported project schema version/);
  assert.equal(summaries.find(({ id }) => id === "malformed").availability, "unavailable");
  assert.match(summaries.find(({ id }) => id === "malformed").reason, /unknown Pattern/);
  assert.deepEqual(await repository.getRaw("future"), fixtures.future);
  await assert.rejects(repository.get("future"), /Unsupported project schema version/);
});

test("persistence exposes an untouched raw copy and cannot activate an unavailable record", async () => {
  const fixtures = createRawFixtures();
  const repository = createV2MemoryProjectRepository([
    fixtures.ready,
    fixtures.future,
    fixtures.malformed,
  ]);
  const projectState = createV2ProjectState(fixtures.ready.project);
  const persistence = createV2ProjectPersistence({
    autosaveDelay: 60_000,
    initialDocument: fixtures.ready,
    now: () => NOW,
    projectState,
    repository,
  });
  const before = projectState.getState();

  const rawText = await persistence.getRawRecoveryText("future");

  assert.deepEqual(JSON.parse(rawText), fixtures.future);
  await assert.rejects(persistence.openProject("future"), /unavailable for editing/);
  assert.equal(persistence.getActiveDocument().id, "ready");
  assert.equal(projectState.getState(), before);
  persistence.dispose();
});

test("library row policy gives unavailable records only a per-record recovery action", () => {
  const ready = getProjectLibraryRowModel({
    id: "ready",
    revision: 3,
    title: "Ready song",
    updatedAt: NOW,
  }, "ready");
  const unavailable = getProjectLibraryRowModel({
    availability: "unavailable",
    id: "future",
    reason: "Unsupported project schema version: 99.",
    revision: null,
    title: "Future song",
    updatedAt: null,
  }, "future");

  assert.deepEqual({
    canDelete: ready.canDelete,
    canOpen: ready.canOpen,
    canRecover: ready.canRecover,
    isActive: ready.isActive,
  }, { canDelete: true, canOpen: true, canRecover: false, isActive: true });
  assert.deepEqual({
    canDelete: unavailable.canDelete,
    canOpen: unavailable.canOpen,
    canRecover: unavailable.canRecover,
    isActive: unavailable.isActive,
  }, { canDelete: false, canOpen: false, canRecover: true, isActive: false });
  assert.match(unavailable.meta, /Unavailable/);
  assert.match(unavailable.meta, /Unsupported project schema version/);
});

test("per-record recovery requests the exact raw ID and passes its text to the raw downloader", async () => {
  const calls = [];
  const summary = {
    availability: "unavailable",
    id: "future",
    reason: "Future schema",
    title: "Future song",
  };
  const result = await downloadUnavailableProjectRecovery(summary, {
    downloadRecoveryProject(text, title) {
      calls.push({ text, title });
      return "saved-recovery";
    },
    persistence: {
      async getRawRecoveryText(id) {
        calls.push({ id });
        return '{"id":"future","project":{"schemaVersion":99}}\n';
      },
    },
  });

  assert.equal(result, "saved-recovery");
  assert.deepEqual(calls, [
    { id: "future" },
    {
      text: '{"id":"future","project":{"schemaVersion":99}}\n',
      title: "Future song",
    },
  ]);
  await assert.rejects(downloadUnavailableProjectRecovery({
    availability: "ready",
    id: "ready",
    title: "Ready",
  }, { persistence: {} }), /Only an unavailable/);
});

test("raw recovery passes a non-string IndexedDB key without coercion", async () => {
  const calls = [];
  const summary = {
    availability: "unavailable",
    id: null,
    reason: "Malformed identifier",
    storageKey: 42,
    title: "Numeric key record",
  };

  await downloadUnavailableProjectRecovery(summary, {
    downloadRecoveryProject(text, title) {
      calls.push({ text, title });
      return title;
    },
    persistence: {
      async getRawRecoveryText(storageKey) {
        calls.push({ storageKey });
        return '{"id":42}\n';
      },
    },
  });

  assert.deepEqual(calls, [
    { storageKey: 42 },
    { text: '{"id":42}\n', title: "Numeric key record" },
  ]);
});

test("raw recovery download preserves future JSON while ordinary project download stays strict", () => {
  const text = '{"format":"chiptune-workstation","documentVersion":1,"project":{"schemaVersion":99}}\n';
  const calls = [];
  const anchor = {
    click: () => calls.push("click"),
    remove: () => calls.push("remove"),
  };
  const options = {
    BlobClass: class {
      constructor(parts, blobOptions) {
        assert.deepEqual(parts, [text]);
        assert.equal(blobOptions.type, "application/json");
      }
    },
    documentTarget: {
      body: { append: (candidate) => assert.equal(candidate, anchor) },
      createElement: () => anchor,
    },
    urlTarget: {
      createObjectURL: () => "blob:recovery",
      revokeObjectURL: (url) => calls.push(`revoke:${url}`),
    },
  };

  assert.equal(downloadRawProjectFile(text, "Future song", options), "Future song.chipwork.json");
  assert.deepEqual(calls, ["click", "remove", "revoke:blob:recovery"]);
  assert.throws(() => downloadProjectFile(text, "Future song", options), /Project document/);
});

test("rendered library code binds recovery only to unavailable rows and guards open/delete", async () => {
  const source = await readFile(new URL("../src/features/project-library/project-library.js", import.meta.url), "utf8");

  assert.match(source, /recover\.dataset\.action = "recover-project"/);
  assert.match(source, /downloadUnavailableProjectRecovery\(summary, \{[\s\S]*?persistence/);
  assert.match(source, /summary\.availability === "unavailable"[\s\S]*?unavailable for editing/);
  assert.match(source, /Unavailable records are preserved for recovery and cannot be deleted here/);
});
