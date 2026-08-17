import assert from "node:assert/strict";
import test from "node:test";

import { createIndexedDbProjectRepository } from "../src/persistence/project-repository.js";
import { createV2IndexedDbProjectRepository } from "../src/v2/persistence/project-repository.js";

function event(type) {
  return new Event(type);
}

function createFakeIndexedDb({ documents = [], keys = [] } = {}) {
  const databases = [];
  return Object.freeze({
    databases,
    open() {
      const request = new EventTarget();
      const database = new EventTarget();
      database.closeCount = 0;
      database.close = () => {
        database.closeCount += 1;
      };
      database.objectStoreNames = Object.freeze({
        contains: () => true,
      });
      database.transaction = () => {
        const transaction = new EventTarget();
        transaction.error = null;
        transaction.objectStore = () => Object.freeze({
          get(key) {
            const index = keys.findIndex((candidate) => Object.is(candidate, key));
            return readRequest(index === -1 ? undefined : documents[index]);
          },
          getAll() {
            return readRequest(documents);
          },
          getAllKeys() {
            return readRequest(keys);
          },
        });
        function readRequest(result) {
          const read = new EventTarget();
          read.error = null;
          read.result = structuredClone(result);
          queueMicrotask(() => {
            read.dispatchEvent(event("success"));
            queueMicrotask(() => transaction.dispatchEvent(event("complete")));
          });
          return read;
        }
        return transaction;
      };
      request.error = null;
      request.result = database;
      databases.push(database);
      queueMicrotask(() => request.dispatchEvent(event("success")));
      return request;
    },
  });
}

test("IndexedDB repositories close on version changes and can reopen cleanly", async () => {
  const indexedDB = createFakeIndexedDb();
  const repository = createIndexedDbProjectRepository({ indexedDB });

  assert.deepEqual(await repository.list(), []);
  assert.equal(indexedDB.databases.length, 1);

  indexedDB.databases[0].dispatchEvent(event("versionchange"));
  assert.equal(indexedDB.databases[0].closeCount, 1);
  assert.deepEqual(await repository.list(), []);
  assert.equal(indexedDB.databases.length, 2);

  repository.close();
  assert.equal(indexedDB.databases[1].closeCount, 1);
  assert.deepEqual(await repository.list(), []);
  assert.equal(indexedDB.databases.length, 3);

  repository.dispose();
  assert.equal(indexedDB.databases[2].closeCount, 1);
  repository.dispose();
  await assert.rejects(repository.list(), /disposed/);
});

test("V1 and V2 IndexedDB recovery address unavailable records by native keys", async () => {
  const raw = {
    format: "chiptune-workstation",
    documentVersion: 1,
    id: 42,
    revision: 0,
    createdAt: "2026-08-04T12:00:00.000Z",
    updatedAt: "2026-08-04T12:00:00.000Z",
    project: {
      schemaVersion: 99,
      metadata: { title: "Future numeric record" },
    },
  };
  for (const createRepository of [
    createIndexedDbProjectRepository,
    createV2IndexedDbProjectRepository,
  ]) {
    const indexedDB = createFakeIndexedDb({ documents: [raw], keys: [42] });
    const repository = createRepository({ indexedDB });

    const summaries = await repository.list();

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].availability, "unavailable");
    assert.equal(summaries[0].id, null);
    assert.equal(summaries[0].storageKey, 42);
    assert.deepEqual(await repository.getRaw(42), raw);
    assert.equal(await repository.getRaw("42"), null);
    await assert.rejects(repository.get(42));
    repository.dispose();
  }
});
