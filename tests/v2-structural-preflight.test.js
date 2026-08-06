import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_STRUCTURE_DEPTH,
  MAX_PROJECT_STRUCTURE_NODES,
} from "../src/v2/domain/constants.js";
import { assertBoundedV2Structure } from "../src/v2/domain/domain-utils.js";
import { migrateProjectToV7 } from "../src/v2/domain/migration.js";
import { createDefaultV2Project } from "../src/v2/domain/project-schema.js";
import { createV2ProjectState } from "../src/v2/domain/project-state.js";
import {
  createV2ProjectDocument,
  parseV2ProjectDocument,
} from "../src/v2/persistence/project-document.js";
import { createV2ProjectPersistence } from "../src/v2/persistence/project-persistence.js";
import { createV2MemoryProjectRepository } from "../src/v2/persistence/project-repository.js";

const NOW = "2026-08-04T12:00:00.000Z";

function createRawDocument(project = structuredClone(createDefaultV2Project())) {
  return {
    format: "chiptune-workstation",
    documentVersion: 1,
    id: "project-adversarial",
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    project,
  };
}

function createNestedObject(depth) {
  let value = null;
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

test("the iterative structural preflight has explicit depth, node and graph semantics", () => {
  const shallow = { child: { value: true } };
  assert.equal(assertBoundedV2Structure(shallow, {
    maximumDepth: 2,
    maximumNodes: 4,
  }), true);
  assert.throws(
    () => assertBoundedV2Structure(shallow, { maximumDepth: 1, maximumNodes: 4 }),
    /maximum structural depth of 1/,
  );
  assert.throws(
    () => assertBoundedV2Structure(shallow, { maximumDepth: 2, maximumNodes: 2 }),
    /structural node limit of 2/,
  );

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => assertBoundedV2Structure(cyclic), /acyclic JSON structure/);
});

test("portable V2 parsing rejects deeply nested and node-heavy JSON below the byte ceiling", () => {
  const deepDocument = createRawDocument();
  deepDocument.padding = createNestedObject(MAX_PROJECT_STRUCTURE_DEPTH + 1);
  const deepText = JSON.stringify(deepDocument);
  assert.ok(new TextEncoder().encode(deepText).byteLength < MAX_PROJECT_FILE_BYTES);
  assert.doesNotThrow(() => JSON.parse(deepText), "the adversarial fixture itself is valid JSON");
  assert.throws(
    () => parseV2ProjectDocument(deepText),
    new RegExp(`maximum structural depth of ${MAX_PROJECT_STRUCTURE_DEPTH}`),
  );

  const wideDocument = createRawDocument();
  wideDocument.padding = Array(MAX_PROJECT_STRUCTURE_NODES).fill(null);
  const wideText = JSON.stringify(wideDocument);
  assert.ok(new TextEncoder().encode(wideText).byteLength < MAX_PROJECT_FILE_BYTES);
  assert.throws(
    () => parseV2ProjectDocument(wideText),
    new RegExp(`structural node limit of ${MAX_PROJECT_STRUCTURE_NODES}`),
  );
});

test("direct migration activation applies the same bounds before legacy or V7 validation", () => {
  const deepProject = structuredClone(createDefaultV2Project());
  deepProject.padding = createNestedObject(MAX_PROJECT_STRUCTURE_DEPTH + 1);
  assert.throws(
    () => migrateProjectToV7(deepProject),
    new RegExp(`maximum structural depth of ${MAX_PROJECT_STRUCTURE_DEPTH}`),
  );

  const wideProject = structuredClone(createDefaultV2Project());
  wideProject.padding = Array(MAX_PROJECT_STRUCTURE_NODES).fill(null);
  assert.throws(
    () => migrateProjectToV7(wideProject),
    new RegExp(`structural node limit of ${MAX_PROJECT_STRUCTURE_NODES}`),
  );

  const cyclicProject = structuredClone(createDefaultV2Project());
  cyclicProject.padding = cyclicProject;
  assert.throws(() => migrateProjectToV7(cyclicProject), /acyclic JSON structure/);
});

test("a structural import failure cannot save or activate a partial Project", async () => {
  const projectState = createV2ProjectState(createDefaultV2Project());
  const initialDocument = createV2ProjectDocument(projectState.getState(), {
    id: "project-current",
    now: NOW,
  });
  const memoryRepository = createV2MemoryProjectRepository([initialDocument]);
  let saves = 0;
  const repository = {
    ...memoryRepository,
    async save(document) {
      saves += 1;
      return memoryRepository.save(document);
    },
  };
  const persistence = createV2ProjectPersistence({
    initialDocument,
    projectState,
    repository,
  });
  const before = projectState.getState();
  const wideDocument = createRawDocument();
  wideDocument.padding = Array(MAX_PROJECT_STRUCTURE_NODES).fill(null);

  await assert.rejects(
    persistence.importProject(JSON.stringify(wideDocument)),
    /structural node limit/,
  );
  assert.equal(saves, 0);
  assert.strictEqual(projectState.getState(), before);
  assert.equal(persistence.getActiveDocument().id, "project-current");
  await persistence.dispose();
});
