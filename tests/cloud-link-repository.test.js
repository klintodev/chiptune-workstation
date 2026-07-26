import assert from "node:assert/strict";
import test from "node:test";

import {
  createFallbackCloudLinkRepository,
  createIndexedDbCloudLinkRepository,
  createMemoryCloudLinkRepository,
} from "../src/firebase/cloud-link-repository.js";

function createLink(overrides = {}) {
  return {
    uid: "user-one",
    projectId: "project-one",
    cloudRevision: 1,
    pendingDocument: null,
    status: "synced",
    ...overrides,
  };
}

test("an asynchronous IndexedDB open failure switches cloud links to memory", async () => {
  const indexedDB = {
    open() {
      const request = new EventTarget();
      request.error = new Error("Storage access denied");
      queueMicrotask(() => request.dispatchEvent(new Event("error")));
      return request;
    },
  };
  const repository = createFallbackCloudLinkRepository({
    fallback: createMemoryCloudLinkRepository(),
    primary: createIndexedDbCloudLinkRepository({ indexedDB }),
  });
  const link = createLink();

  await repository.save(link);
  assert.equal((await repository.get(link.uid, link.projectId)).projectId, link.projectId);
  assert.deepEqual(
    (await repository.list(link.uid)).map(({ projectId }) => projectId),
    [link.projectId],
  );
});

test("successful primary links are mirrored before a later storage failure", async () => {
  const stored = new Map();
  let fail = false;
  const primary = {
    async delete(uid, projectId) {
      if (fail) throw new Error("Storage failed");
      return stored.delete(`${uid}:${projectId}`);
    },
    async get(uid, projectId) {
      if (fail) throw new Error("Storage failed");
      return stored.get(`${uid}:${projectId}`) ?? null;
    },
    async list(uid) {
      if (fail) throw new Error("Storage failed");
      return [...stored.values()].filter((link) => link.uid === uid);
    },
    async save(link) {
      if (fail) throw new Error("Storage failed");
      stored.set(`${link.uid}:${link.projectId}`, link);
      return link;
    },
  };
  const repository = createFallbackCloudLinkRepository({
    fallback: createMemoryCloudLinkRepository(),
    primary,
  });
  const link = createLink();

  await repository.save(link);
  fail = true;
  assert.equal((await repository.get(link.uid, link.projectId)).cloudRevision, 1);
});
