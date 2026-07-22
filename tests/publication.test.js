import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createProjectDocument } from "../src/persistence/project-document.js";
import { createDefaultProject } from "../src/state/project-state.js";
import {
  createPublicationRecord,
  normalizePublicationRecord,
} from "../src/firebase/publication.js";
import { createMemoryPublicationLinkRepository } from "../src/firebase/publication-link-repository.js";
import { createPublicationService } from "../src/firebase/publication-service.js";

function createDocument() {
  return createProjectDocument(createDefaultProject(), {
    id: "project-song",
    now: "2026-07-20T12:00:00.000Z",
  });
}

test("publication records contain a validated immutable playback snapshot", () => {
  const record = createPublicationRecord({
    creatorName: "Chip Artist",
    document: createDocument(),
    ownerSlot: "01",
    publicationId: "publication-1",
    publicationRevision: 1,
    publishedAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
  });
  assert.equal(record.title, "Untitled chiptune");
  assert.equal(record.sourceProjectId, "project-song");
  assert.equal(record.ownerSlot, "01");
  assert.equal("ownerId" in record, false);
  assert.equal(normalizePublicationRecord(record).publicationId, "publication-1");
  const { ownerSlot, ...legacyBase } = record;
  const legacy = { ...legacyBase, publicationVersion: 1, ownerId: "user-1" };
  assert.equal(normalizePublicationRecord(legacy, { ownerId: "user-1" }).ownerId, "user-1");
  assert.throws(() => normalizePublicationRecord(legacy, { ownerId: "another-user" }), /owner/);
});

test("republishing preserves one stable URL and advances snapshot revision", async () => {
  let remote = null;
  let deleted = null;
  const client = {
    async deletePublication(uid, id) { deleted = { uid, id }; remote = null; },
    async savePublication(values) {
      assert.equal(values.expectedRevision, remote?.publicationRevision ?? 0);
      remote = createPublicationRecord({
        ...values,
        ownerSlot: "01",
        publicationRevision: (remote?.publicationRevision ?? 0) + 1,
        publishedAt: remote?.publishedAt ?? values.publishedAt,
      });
      return remote;
    },
  };
  const accountService = {
    async getClient() { return client; },
    getState() { return { account: { uid: "user-1", emailVerified: true } }; },
  };
  const document = createDocument();
  const service = createPublicationService({
    accountService,
    createId: () => "project-public",
    linkRepository: createMemoryPublicationLinkRepository(),
    now: (() => {
      let minute = 0;
      return () => `2026-07-20T12:${String(minute++).padStart(2, "0")}:00.000Z`;
    })(),
    persistence: {
      getActiveDocument: () => document,
      saveNow: async () => document,
    },
    shareBaseUrl: "https://studio.example/app/",
  });

  const first = await service.publish("Chip Artist");
  const second = await service.publish("Chip Artist");
  assert.equal(first.publicationId, "publication-public");
  assert.equal(second.url, "https://studio.example/app/player.html?id=publication-public");
  assert.equal(second.publicationRevision, 2);
  assert.equal(second.publishedAt, first.publishedAt);
  assert.equal(await service.unpublish(), true);
  assert.deepEqual(deleted, { uid: "user-1", id: "publication-public" });
  assert.equal(await service.getCurrentPublication(), null);
});

test("publishing rejects an unverified account before requesting Firebase", async () => {
  let clientRequested = false;
  const service = createPublicationService({
    accountService: {
      async getClient() {
        clientRequested = true;
        return {};
      },
      getState: () => ({ account: { uid: "user-1", emailVerified: false } }),
    },
    linkRepository: createMemoryPublicationLinkRepository(),
    persistence: { getActiveDocument: createDocument, saveNow: async () => createDocument() },
  });

  await assert.rejects(() => service.publish("Artist"), /Verify your email/);
  assert.equal(clientRequested, false);
});

test("publishing remains optional and requires a signed-in owner", async () => {
  const service = createPublicationService({
    accountService: { getState: () => ({ account: null }) },
    linkRepository: createMemoryPublicationLinkRepository(),
    persistence: { getActiveDocument: createDocument, saveNow: async () => createDocument() },
  });
  await assert.rejects(() => service.publish("Artist"), /Sign in/);
});

test("Firestore rules allow public reads while restricting legacy ownership discovery", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/publications\/\{publicationId\}/);
  assert.match(rules, /allow get: if true/);
  assert.match(rules, /allow list: if hasVerifiedEmail\(\)[\s\S]*resource\.data\.publicationVersion == 1/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /resource\.data\.ownerId == request\.auth\.uid/);
  assert.match(rules, /match \/publicationSlots\/\{slotId\}/);
  assert.match(rules, /validSlotId\(request\.resource\.data\.ownerSlot\)/);
  assert.match(rules, /publicationRevision == resource\.data\.publicationRevision \+ 1/);
});
