import assert from "node:assert/strict";
import test from "node:test";

import { createIndexedDbProjectRepository } from "../src/persistence/project-repository.js";

function event(type) {
  return new Event(type);
}

function createFakeIndexedDb() {
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
          getAll() {
            const read = new EventTarget();
            read.error = null;
            read.result = [];
            queueMicrotask(() => {
              read.dispatchEvent(event("success"));
              queueMicrotask(() => transaction.dispatchEvent(event("complete")));
            });
            return read;
          },
        });
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
