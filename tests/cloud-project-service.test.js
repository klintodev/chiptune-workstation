import assert from "node:assert/strict";
import test from "node:test";

import {
  createCloudConflictError,
  createCloudProjectRecord,
} from "../src/firebase/cloud-project.js";
import { createMemoryCloudLinkRepository } from "../src/firebase/cloud-link-repository.js";
import { createCloudProjectService } from "../src/firebase/cloud-project-service.js";
import {
  createProjectDocument,
  normalizeProjectDocumentToV7,
  reviseProjectDocument,
  serializeProjectDocument,
} from "../src/persistence/project-document.js";
import {
  createMemoryProjectRepository,
  createProjectPreferences,
} from "../src/persistence/project-repository.js";
import { createDefaultProject } from "../src/state/project-state.js";

const FIRST_TIME = "2026-07-20T12:00:00.000Z";
const SECOND_TIME = "2026-07-20T12:01:00.000Z";

function createPreferences(projectId = null) {
  const values = new Map();
  const preferences = createProjectPreferences({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  if (projectId) preferences.setLastProjectId(projectId);
  return preferences;
}

function createAccountServiceDouble(client, account = { uid: "user-one", emailVerified: true }) {
  const events = new EventTarget();
  return {
    addEventListener: events.addEventListener.bind(events),
    getClient: async () => client,
    getState: () => ({ account }),
  };
}

function rename(document, title) {
  const project = JSON.parse(JSON.stringify(document.project));
  project.metadata.title = title;
  return reviseProjectDocument(document, project, { now: SECOND_TIME });
}

function createDeferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("first cloud backup is explicit and records its remote revision", async () => {
  const document = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const localRepository = createMemoryProjectRepository([document]);
  const linkRepository = createMemoryCloudLinkRepository();
  const calls = [];
  const client = {
    async getProject() {
      return null;
    },
    async saveProject(uid, candidate, expectedRevision) {
      calls.push({ uid, candidate, expectedRevision });
      return createCloudProjectRecord(uid, candidate, 1);
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    linkRepository,
    localRepository,
    preferences: createPreferences(document.id),
  });

  const link = await service.enableCurrentProject();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].uid, "user-one");
  assert.equal(calls[0].expectedRevision, 0);
  assert.equal(link.status, "synced");
  assert.equal(link.cloudRevision, 1);
  assert.equal(link.pendingDocument, null);
  service.dispose();
});

test("saved local revisions queue one latest snapshot before synchronization", async () => {
  const original = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const firstEdit = rename(original, "First edit");
  const secondEdit = rename(original, "Latest edit");
  const localRepository = createMemoryProjectRepository([secondEdit]);
  const linkRepository = createMemoryCloudLinkRepository([{
    uid: "user-one",
    projectId: original.id,
    cloudRevision: 1,
    pendingDocument: null,
    status: "synced",
  }]);
  const timers = [];
  let clearCount = 0;
  const writes = [];
  const client = {
    async saveProject(uid, document, expectedRevision) {
      writes.push({ uid, document, expectedRevision });
      return createCloudProjectRecord(uid, document, expectedRevision + 1);
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    clearTimer: () => { clearCount += 1; },
    linkRepository,
    localRepository,
    preferences: createPreferences(original.id),
    setTimer: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  });

  await service.queueProject(firstEdit);
  await service.queueProject(secondEdit);
  assert.equal(timers.length, 2);
  assert.equal(clearCount, 1);
  assert.equal(writes.length, 0);

  await service.retryProject(original.id);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].document.project.metadata.title, "Latest edit");
  const link = await linkRepository.get("user-one", original.id);
  assert.equal(link.status, "synced");
  assert.equal(link.cloudRevision, 2);
  service.dispose();
});

test("offline writes retain pending work and report retry state", async () => {
  const document = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const linkRepository = createMemoryCloudLinkRepository([{
    uid: "user-one",
    projectId: document.id,
    cloudRevision: 1,
    pendingDocument: document,
    status: "pending",
  }]);
  const client = {
    async saveProject() {
      const error = new Error("offline");
      error.code = "firestore/unavailable";
      throw error;
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    linkRepository,
    localRepository: createMemoryProjectRepository([document]),
    preferences: createPreferences(document.id),
    retryDelays: [60_000],
    setTimer: () => 1,
  });

  await service.retryProject(document.id);
  const link = await linkRepository.get("user-one", document.id);
  assert.equal(link.status, "offline");
  assert.deepEqual(link.pendingDocument, document);
  assert.match(link.error, /Local saving is unaffected/);
  service.dispose();
});

test("revision conflict preserves the remote version as an independent local project", async () => {
  const local = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const remoteDocument = rename(local, "Changed elsewhere");
  const remoteRecord = createCloudProjectRecord("user-one", remoteDocument, 2);
  const localRepository = createMemoryProjectRepository([local]);
  const linkRepository = createMemoryCloudLinkRepository([{
    uid: "user-one",
    projectId: local.id,
    cloudRevision: 1,
    pendingDocument: local,
    status: "pending",
  }]);
  const client = {
    async saveProject() {
      throw createCloudConflictError(remoteRecord);
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    createId: () => "conflict-copy",
    linkRepository,
    localRepository,
    now: () => SECOND_TIME,
    preferences: createPreferences(local.id),
  });

  await service.retryProject(local.id);
  const link = await linkRepository.get("user-one", local.id);
  assert.equal(link.status, "conflict");
  assert.equal(link.cloudRevision, 2);
  assert.equal(link.conflictProjectId, "conflict-copy");
  assert.equal((await localRepository.get("conflict-copy")).project.metadata.title, "Changed elsewhere (cloud conflict)");
  assert.equal((await localRepository.get(local.id)).project.metadata.title, local.project.metadata.title);
  service.dispose();
});

test("opening a divergent remote project preserves the existing local version first", async () => {
  const local = createProjectDocument(createDefaultProject(), { id: "shared-id", now: FIRST_TIME });
  const remote = rename(local, "Remote tune");
  const localRepository = createMemoryProjectRepository([local]);
  const preferences = createPreferences(local.id);
  let reloadCount = 0;
  const client = {
    async getProject() {
      return createCloudProjectRecord("user-one", remote, 3);
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    createId: () => "local-safety-copy",
    linkRepository: createMemoryCloudLinkRepository(),
    localRepository,
    now: () => SECOND_TIME,
    preferences,
    reload: () => { reloadCount += 1; },
  });

  await service.openProject(remote.id);
  assert.equal((await localRepository.get(remote.id)).project.metadata.title, "Remote tune");
  assert.equal((await localRepository.get("local-safety-copy")).project.metadata.title, "Untitled chiptune (local before cloud open)");
  assert.equal(preferences.getLastProjectId(), remote.id);
  assert.equal(reloadCount, 1);
  service.dispose();
});

test("cloud open preserves the active in-memory version when durable saving fails", async () => {
  const original = createProjectDocument(createDefaultProject(), { id: "shared-id", now: FIRST_TIME });
  const active = rename(original, "Unsaved active tune");
  const remote = rename(original, "Remote tune");
  const localRepository = createMemoryProjectRepository([original]);
  let reloadCount = 0;
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble({
      async getProject() {
        return createCloudProjectRecord("user-one", remote, 3);
      },
    }),
    createId: () => "active-safety-copy",
    linkRepository: createMemoryCloudLinkRepository(),
    localRepository,
    now: () => SECOND_TIME,
    persistence: {
      getActiveDocument: () => active,
      getExportText: () => serializeProjectDocument(active),
      async saveNow() {
        throw new Error("IndexedDB unavailable");
      },
    },
    preferences: createPreferences(original.id),
    reload: () => { reloadCount += 1; },
  });

  await service.openProject(remote.id);
  assert.equal((await localRepository.get(remote.id)).project.metadata.title, "Remote tune");
  assert.equal(
    (await localRepository.get("active-safety-copy")).project.metadata.title,
    "Unsaved active tune (local before cloud open)",
  );
  assert.equal(reloadCount, 1);
  service.dispose();
});

test("cloud operations require a signed-in owner", async () => {
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble({}, null),
    linkRepository: createMemoryCloudLinkRepository(),
    localRepository: createMemoryProjectRepository(),
    preferences: createPreferences(),
  });

  await assert.rejects(service.listProjects(), /Sign in/);
  service.dispose();
});

test("cloud operations reject an unverified account before network access", async () => {
  let clientRequested = false;
  const service = createCloudProjectService({
    accountService: {
      addEventListener() {},
      async getClient() {
        clientRequested = true;
        return {};
      },
      getState: () => ({ account: { uid: "user-one", emailVerified: false } }),
    },
    linkRepository: createMemoryCloudLinkRepository(),
    localRepository: createMemoryProjectRepository(),
    preferences: createPreferences(),
  });

  await assert.rejects(service.listProjects(), /Verify your email/);
  assert.equal(clientRequested, false);
  service.dispose();
});

test("startup cloud-link failures are caught and reported as background failures", async () => {
  const changes = [];
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble({}),
    linkRepository: {
      async delete() {},
      async get() {
        return null;
      },
      async list() {
        throw new Error("Storage access denied");
      },
      async save(link) {
        return link;
      },
    },
    localRepository: createMemoryProjectRepository(),
    onlineTarget: new EventTarget(),
    preferences: createPreferences(),
  });
  service.addEventListener("change", (event) => changes.push(event.detail.type));

  service.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(changes, ["failed"]);
  service.dispose();
});

test("simultaneous retries serialize one unchanged remote write", async () => {
  const document = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const linkRepository = createMemoryCloudLinkRepository([{
    uid: "user-one",
    projectId: document.id,
    cloudRevision: 1,
    pendingDocument: document,
    status: "pending",
  }]);
  const entered = createDeferred();
  const release = createDeferred();
  let activeWrites = 0;
  let maximumActiveWrites = 0;
  let writes = 0;
  const client = {
    async saveProject(uid, candidate, expectedRevision) {
      writes += 1;
      activeWrites += 1;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      entered.resolve();
      await release.promise;
      activeWrites -= 1;
      return createCloudProjectRecord(uid, candidate, expectedRevision + 1);
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    linkRepository,
    localRepository: createMemoryProjectRepository([document]),
    preferences: createPreferences(document.id),
  });

  const first = service.retryProject(document.id);
  const second = service.retryProject(document.id);
  await entered.promise;
  assert.equal(writes, 1);
  assert.equal(maximumActiveWrites, 1);
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(writes, 1);
  assert.equal((await linkRepository.get("user-one", document.id)).status, "synced");
  service.dispose();
});

test("a local edit queued during a write remains pending and syncs next", async () => {
  const original = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const latest = rename(original, "Post-write edit");
  const localRepository = createMemoryProjectRepository([original]);
  const linkRepository = createMemoryCloudLinkRepository([{
    uid: "user-one",
    projectId: original.id,
    cloudRevision: 1,
    pendingDocument: original,
    status: "pending",
  }]);
  const entered = createDeferred();
  const release = createDeferred();
  const writes = [];
  const client = {
    async saveProject(uid, candidate, expectedRevision) {
      writes.push(candidate);
      if (writes.length === 1) {
        entered.resolve();
        await release.promise;
      }
      return createCloudProjectRecord(uid, candidate, expectedRevision + 1);
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    linkRepository,
    localRepository,
    preferences: createPreferences(original.id),
    setTimer: () => 1,
  });

  const retry = service.retryProject(original.id);
  await entered.promise;
  await localRepository.save(latest);
  const queue = service.queueProject(latest);
  release.resolve();
  await Promise.all([retry, queue]);
  let link = await linkRepository.get("user-one", original.id);
  assert.equal(link.status, "pending");
  assert.equal(link.pendingDocument.project.metadata.title, "Post-write edit");

  await service.retryProject(original.id);
  link = await linkRepository.get("user-one", original.id);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].project.metadata.title, "Post-write edit");
  assert.equal(link.status, "synced");
  service.dispose();
});

test("conflict resolution uploads the latest post-conflict local document", async () => {
  const original = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const latest = rename(original, "Edited after conflict");
  const localRepository = createMemoryProjectRepository([latest]);
  const linkRepository = createMemoryCloudLinkRepository([{
    uid: "user-one",
    projectId: original.id,
    cloudRevision: 4,
    pendingDocument: original,
    status: "conflict",
  }]);
  let uploaded = null;
  const client = {
    async saveProject(uid, candidate, expectedRevision) {
      uploaded = candidate;
      return createCloudProjectRecord(uid, candidate, expectedRevision + 1);
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    linkRepository,
    localRepository,
    preferences: createPreferences(original.id),
  });

  await service.queueProject(latest);
  assert.equal(
    (await linkRepository.get("user-one", original.id)).pendingDocument.project.metadata.title,
    "Edited after conflict",
  );
  await service.overwriteConflictWithLocal(original.id);
  assert.equal(uploaded.project.metadata.title, "Edited after conflict");
  assert.equal((await linkRepository.get("user-one", original.id)).status, "synced");
  service.dispose();
});

test("conflict resolution uses the in-memory export when durable saving fails", async () => {
  const original = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const latest = rename(original, "Unsaved recovery edit");
  const localRepository = createMemoryProjectRepository([original]);
  const linkRepository = createMemoryCloudLinkRepository([{
    uid: "user-one",
    projectId: original.id,
    cloudRevision: 4,
    pendingDocument: original,
    status: "conflict",
  }]);
  let uploaded = null;
  const client = {
    async saveProject(uid, candidate, expectedRevision) {
      uploaded = candidate;
      return createCloudProjectRecord(uid, candidate, expectedRevision + 1);
    },
  };
  const persistence = {
    getActiveDocument: () => latest,
    getExportText: () => serializeProjectDocument(latest),
    async saveNow() {
      throw new Error("IndexedDB unavailable");
    },
  };
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble(client),
    linkRepository,
    localRepository,
    persistence,
    preferences: createPreferences(original.id),
  });

  await service.overwriteConflictWithLocal(original.id);
  assert.equal(uploaded.project.metadata.title, "Unsaved recovery edit");
  assert.equal((await linkRepository.get("user-one", original.id)).status, "synced");
  service.dispose();
});

test("conflict-copy names remain valid at the project title limit", async () => {
  const local = createProjectDocument(createDefaultProject(), { id: "project-one", now: FIRST_TIME });
  const remote = rename(local, "R".repeat(100));
  const localRepository = createMemoryProjectRepository([local]);
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble({
      async saveProject() {
        throw createCloudConflictError(createCloudProjectRecord("user-one", remote, 2));
      },
    }),
    createId: () => "bounded-conflict",
    linkRepository: createMemoryCloudLinkRepository([{
      uid: "user-one",
      projectId: local.id,
      cloudRevision: 1,
      pendingDocument: local,
      status: "pending",
    }]),
    localRepository,
    preferences: createPreferences(local.id),
  });

  await service.retryProject(local.id);
  const title = (await localRepository.get("bounded-conflict")).project.metadata.title;
  assert.ok(title.length <= 100);
  assert.match(title, / \(cloud conflict\)$/);
  service.dispose();
});

test("authenticated cloud recovery downloads the untouched raw Firestore object", async () => {
  const raw = {
    title: "Future cloud tune",
    document: {
      format: "chiptune-workstation",
      documentVersion: 1,
      id: "future",
      project: { schemaVersion: 99, unknown: { exact: [3, 2, 1] } },
    },
  };
  const calls = [];
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble({
      async getRawProject(uid, recoveryKey) {
        calls.push({ recoveryKey, uid });
        return structuredClone(raw);
      },
    }),
    linkRepository: createMemoryCloudLinkRepository(),
    localRepository: createMemoryProjectRepository(),
    preferences: createPreferences(),
  });

  const text = await service.getRawRecoveryText("firestore-document-key");

  assert.equal(text, `${JSON.stringify(raw, null, 2)}\n`);
  assert.deepEqual(calls, [{
    recoveryKey: "firestore-document-key",
    uid: "user-one",
  }]);
  service.dispose();
});

test("opening a V1 cloud Project into V2 queues the one-time upgrade disclosure", async () => {
  const source = createProjectDocument(createDefaultProject(), {
    id: "migrated-cloud",
    now: FIRST_TIME,
  });
  const activeV7 = normalizeProjectDocumentToV7(source);
  const upgrades = [];
  let reloadCount = 0;
  const localRepository = createMemoryProjectRepository([source]);
  const service = createCloudProjectService({
    accountService: createAccountServiceDouble({
      async getProject() {
        return createCloudProjectRecord("user-one", source, 4);
      },
    }),
    linkRepository: createMemoryCloudLinkRepository(),
    localRepository,
    onProjectUpgrade: (detail) => upgrades.push(detail),
    persistence: {
      getActiveDocument: () => activeV7,
      getExportText: () => serializeProjectDocument(activeV7),
      async saveNow() {},
    },
    preferences: createPreferences(source.id),
    reload: () => { reloadCount += 1; },
  });

  const opened = await service.openProject(source.id);

  assert.equal(opened.project.schemaVersion, 7);
  assert.deepEqual(upgrades, [{
    fromSchemaVersion: 6,
    projectId: source.id,
  }]);
  assert.equal(reloadCount, 1);
  service.dispose();
});
