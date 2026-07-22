import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCloudProjectRecord,
  normalizeCloudProjectRecord,
} from "../src/firebase/cloud-project.js";
import { createProjectDocument } from "../src/persistence/project-document.js";
import { createDefaultProject } from "../src/state/project-state.js";

const NOW = "2026-07-20T12:00:00.000Z";

test("cloud records bind a validated project to one owner and revision", () => {
  const document = createProjectDocument(createDefaultProject(), { id: "project-one", now: NOW });
  const record = createCloudProjectRecord("user-one", document, 3);

  assert.equal(record.ownerId, "user-one");
  assert.equal(record.projectId, document.id);
  assert.equal(record.cloudRevision, 3);
  assert.deepEqual(normalizeCloudProjectRecord(record, { ownerId: "user-one" }), record);
  assert.throws(() => normalizeCloudProjectRecord(record, { ownerId: "user-two" }), /owner/);
});

test("cloud records reject projects with excessive collection counts", () => {
  const project = JSON.parse(JSON.stringify(createDefaultProject()));
  const source = project.patterns[0];
  project.patterns = Array.from({ length: 65 }, (_, index) => ({
    ...source,
    id: `pattern-${index}`,
    name: `Pattern ${index}`,
    steps: source.steps.map((step) => step === null ? null : { ...step }),
  }));
  assert.throws(
    () => createProjectDocument(project, { id: "large-project", now: NOW }),
    /between one and 64 patterns/,
  );
});

test("checked-in Firestore rules are owner-scoped and deny unmatched documents", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.resource\.data\.ownerId == userId/);
  assert.match(rules, /cloudRevision == resource\.data\.cloudRevision \+ 1/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
});
