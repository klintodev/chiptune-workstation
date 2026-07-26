import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
} from "../src/persistence/project-document.js";
import {
  createProjectFilename,
  downloadProjectFile,
} from "../src/persistence/project-download.js";
import { createProjectPersistence } from "../src/persistence/project-persistence.js";
import {
  createMemoryProjectRepository,
  createProjectPreferences,
} from "../src/persistence/project-repository.js";
import { createDefaultProject, createProjectState } from "../src/state/project-state.js";

const NOW = "2026-07-20T10:00:00.000Z";

test("project download filenames remove reserved characters and device names", () => {
  assert.equal(createProjectFilename('  My <bad>:"tune" / demo.  '), "My -bad-tune- - demo.chipwork.json");
  assert.equal(createProjectFilename("CON"), "_CON.chipwork.json");
  assert.ok(createProjectFilename("X".repeat(200)).length <= 100);
});

test("a validated project document downloads without mutating its contents", () => {
  const document = createProjectDocument(createDefaultProject(), { id: "project-one", now: NOW });
  const text = serializeProjectDocument(document);
  const calls = [];
  const anchor = {
    click: () => calls.push("click"),
    remove: () => calls.push("remove"),
  };
  const filename = downloadProjectFile(text, document.project.metadata.title, {
    BlobClass: class {
      constructor(parts, options) {
        assert.deepEqual(parts, [text]);
        assert.equal(options.type, "application/json");
      }
    },
    documentTarget: {
      body: { append: (candidate) => assert.equal(candidate, anchor) },
      createElement: () => anchor,
    },
    urlTarget: {
      createObjectURL: () => "blob:project",
      revokeObjectURL: (url) => calls.push(`revoke:${url}`),
    },
  });

  assert.equal(filename, "Untitled chiptune.chipwork.json");
  assert.deepEqual(calls, ["click", "remove", "revoke:blob:project"]);
  assert.deepEqual(parseProjectDocument(text), document);
});

test("in-memory unsaved edits round-trip through the emergency document", async () => {
  const source = createProjectDocument(createDefaultProject(), { id: "at-risk", now: NOW });
  const sourceState = createProjectState(source.project);
  let repositoryCalls = 0;
  const unavailableRepository = {
    async delete() { repositoryCalls += 1; throw new Error("unavailable"); },
    async get() { repositoryCalls += 1; throw new Error("unavailable"); },
    async list() { repositoryCalls += 1; throw new Error("unavailable"); },
    async save() { repositoryCalls += 1; throw new Error("unavailable"); },
  };
  const persistence = createProjectPersistence({
    autosaveDelay: 60_000,
    initialDocument: source,
    initialError: new Error("IndexedDB unavailable"),
    now: () => NOW,
    persistent: false,
    projectState: sourceState,
    repository: unavailableRepository,
  });
  sourceState.renameProject("Recovered tune");
  sourceState.updatePattern("pattern-1", (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0
      ? { note: 112, gate: 1, volume: 0.8 }
      : step),
  }));
  const text = persistence.getExportText();
  assert.equal(repositoryCalls, 0);

  const restoredDocument = parseProjectDocument(text);
  assert.equal(restoredDocument.id, "at-risk");
  assert.equal(restoredDocument.project.metadata.title, "Recovered tune");
  assert.equal(restoredDocument.project.patterns[0].steps[0].note, 112);
  assert.equal("account" in restoredDocument, false);
  assert.equal("cloudLink" in restoredDocument, false);
  assert.equal("checkpoints" in restoredDocument, false);

  const fresh = createProjectDocument(createDefaultProject(), { id: "fresh", now: NOW });
  const freshState = createProjectState(fresh.project);
  const freshRepository = createMemoryProjectRepository([fresh]);
  const restoredPersistence = createProjectPersistence({
    autosaveDelay: 60_000,
    initialDocument: fresh,
    now: () => NOW,
    preferences: createProjectPreferences(),
    projectState: freshState,
    repository: freshRepository,
  });
  await restoredPersistence.importProject(text);
  assert.deepEqual(freshState.getState(), restoredDocument.project);
  assert.equal(restoredPersistence.getActiveDocument().id, "at-risk");

  persistence.dispose();
  restoredPersistence.dispose();
});
