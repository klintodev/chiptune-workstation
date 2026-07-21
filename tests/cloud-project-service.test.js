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
  reviseProjectDocument,
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
