import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_PROJECT_FORMAT,
  CLOUD_PROJECT_VERSION,
  MAX_CLOUD_PROJECT_BYTES,
  createCloudProjectRecord,
  normalizeCloudProjectRecord,
} from "../src/firebase/cloud-project.js";
import {
  MAX_PUBLICATION_BYTES,
  PUBLICATION_FORMAT,
  PUBLICATION_VERSION,
  createPublicationRecord,
  normalizePublicationRecord,
} from "../src/firebase/publication.js";
import {
  MAX_PROJECT_FILE_BYTES,
  PROJECT_DOCUMENT_FORMAT,
  PROJECT_DOCUMENT_VERSION,
  createProjectDocument,
  parseProjectDocument,
  parseProjectDocumentToV7,
} from "../src/persistence/project-document.js";
import {
  MAX_NOTES_PER_PATTERN,
  parseV2ProjectDocument as parseDomainV2ProjectDocument,
  createDefaultV2Project,
} from "../src/v2/domain/schema.js";
import {
  parseV2ProjectDocument as parsePersistedV2ProjectDocument,
} from "../src/v2/persistence/project-document.js";

const NOW = "2026-08-04T12:00:00.000Z";
const OWNER_ID = "boundary-owner";

function encodedSize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return new TextEncoder().encode(text).byteLength;
}

function rawDocument(project, { id = "project-boundary" } = {}) {
  return {
    format: PROJECT_DOCUMENT_FORMAT,
    documentVersion: PROJECT_DOCUMENT_VERSION,
    id,
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    project,
  };
}

function rawCloudRecord(document) {
  return {
    cloudFormat: CLOUD_PROJECT_FORMAT,
    cloudVersion: CLOUD_PROJECT_VERSION,
    ownerId: OWNER_ID,
    projectId: document.id,
    cloudRevision: 1,
    title: document.project.metadata.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    document,
  };
}

function publicationOptions(document) {
  return {
    allowRemix: true,
    creatorName: "Boundary Artist",
    document,
    ownerSlot: "01",
    publicationId: "publication-boundary",
    publicationRevision: 1,
    publishedAt: NOW,
    updatedAt: NOW,
  };
}

function rawPublicationRecord(document) {
  const options = publicationOptions(document);
  return {
    publicationFormat: PUBLICATION_FORMAT,
    publicationVersion: PUBLICATION_VERSION,
    publicationId: options.publicationId,
    publicationRevision: options.publicationRevision,
    sourceProjectId: document.id,
    title: document.project.metadata.title,
    creatorName: options.creatorName,
    publishedAt: options.publishedAt,
    updatedAt: options.updatedAt,
    document,
    allowRemix: options.allowRemix,
    ownerSlot: options.ownerSlot,
  };
}

function createDenseProject() {
  const project = structuredClone(createDefaultV2Project());
  project.patterns = Array.from({ length: 8 }, (_, patternIndex) => ({
    id: `pattern-${patternIndex}`,
    name: `Pattern ${patternIndex}`,
    lengthTicks: 3_072,
    notes: Array.from({ length: MAX_NOTES_PER_PATTERN }, (_, noteIndex) => ({
      id: `n${noteIndex.toString(36).padStart(4, "0")}-`,
      pitch: 36 + (noteIndex % 77),
      startTick: noteIndex % 3_072,
      durationTicks: 1,
      velocity: 1,
    })),
  }));
  return project;
}

function growNoteIds(project, byteCount) {
  let remaining = byteCount;
  for (const pattern of project.patterns) {
    for (const note of pattern.notes) {
      const growth = Math.min(64 - note.id.length, remaining);
      note.id += "x".repeat(growth);
      remaining -= growth;
      if (remaining === 0) return;
    }
  }
  assert.fail(`Dense fixture did not have capacity for ${byteCount} more bytes.`);
}

function tuneDenseProjectToPublicationBoundary() {
  const project = createDenseProject();
  const initialRecord = rawPublicationRecord(rawDocument(project));
  const growth = MAX_PUBLICATION_BYTES - encodedSize(initialRecord);
  assert.ok(growth > 0, "Dense fixture must begin below the hosted boundary.");
  growNoteIds(project, growth);
  return project;
}

function oversizedNotes() {
  return Array.from({ length: MAX_NOTES_PER_PATTERN + 1 }, (_, index) => ({
    id: `note-${index}`,
    pitch: 60,
    startTick: index % 384,
    durationTicks: 1,
    velocity: 1,
  }));
}

const localParsers = Object.freeze([
  ["compatibility parser", parseProjectDocument],
  ["explicit V7 parser", parseProjectDocumentToV7],
  ["V2 persistence parser", parsePersistedV2ProjectDocument],
  ["V2 domain parser", parseDomainV2ProjectDocument],
]);

function assertRejectedAtEveryTrustBoundary(document, expected, fixtureName) {
  const text = JSON.stringify(document);
  const boundaries = [
    ...localParsers.map(([name, parse]) => [name, () => parse(text)]),
    ["cloud create", () => createCloudProjectRecord(OWNER_ID, document, 1)],
    ["cloud normalize", () => normalizeCloudProjectRecord(rawCloudRecord(document))],
    ["publication create", () => createPublicationRecord(publicationOptions(document))],
    ["publication normalize", () => normalizePublicationRecord(rawPublicationRecord(document))],
  ];
  for (const [boundary, operation] of boundaries) {
    assert.throws(operation, expected, `${fixtureName} should fail at the ${boundary}`);
  }
}

test("all local V7 import adapters accept exactly 2 MB and reject one byte more", () => {
  const document = createProjectDocument(createDefaultV2Project(), {
    id: "project-local-boundary",
    now: NOW,
  });
  const compact = JSON.stringify(document);
  const exact = compact + " ".repeat(MAX_PROJECT_FILE_BYTES - encodedSize(compact));
  const oversized = `${exact} `;

  assert.equal(encodedSize(exact), MAX_PROJECT_FILE_BYTES);
  assert.equal(encodedSize(oversized), MAX_PROJECT_FILE_BYTES + 1);
  for (const [name, parse] of localParsers) {
    assert.deepEqual(parse(exact), document, `${name} should admit the exact byte boundary`);
    assert.throws(
      () => parse(oversized),
      /larger than 2 MB/,
      `${name} should preflight the oversized file before activation`,
    );
  }
});

test("cloud and public adapters share a deterministic near-900 KB size boundary", () => {
  const project = tuneDenseProjectToPublicationBoundary();
  const document = createProjectDocument(project, { id: "project-boundary", now: NOW });
  const publication = createPublicationRecord(publicationOptions(document));
  const cloud = createCloudProjectRecord(OWNER_ID, document, 1);
  const publicationBytes = encodedSize(publication);
  const cloudBytes = encodedSize(cloud);

  assert.equal(publicationBytes, MAX_PUBLICATION_BYTES);
  assert.ok(cloudBytes <= MAX_CLOUD_PROJECT_BYTES);
  assert.ok(
    MAX_CLOUD_PROJECT_BYTES - cloudBytes < 256,
    `Cloud fixture should be near ${MAX_CLOUD_PROJECT_BYTES} bytes; received ${cloudBytes}.`,
  );
  assert.deepEqual(normalizePublicationRecord(publication), publication);
  assert.deepEqual(normalizeCloudProjectRecord(cloud), cloud);

  const oversizedPublicationDocument = structuredClone(document);
  growNoteIds(oversizedPublicationDocument.project, 1);
  const oversizedPublication = {
    ...publication,
    document: oversizedPublicationDocument,
  };
  assert.equal(encodedSize(oversizedPublication), MAX_PUBLICATION_BYTES + 1);
  assert.throws(
    () => createPublicationRecord(publicationOptions(oversizedPublicationDocument)),
    /too large to publish/,
  );
  assert.throws(() => normalizePublicationRecord(oversizedPublication), /too large to publish/);

  const oversizedCloudDocument = structuredClone(document);
  growNoteIds(oversizedCloudDocument.project, MAX_CLOUD_PROJECT_BYTES - cloudBytes + 1);
  const oversizedCloud = {
    ...cloud,
    document: oversizedCloudDocument,
  };
  assert.equal(encodedSize(oversizedCloud), MAX_CLOUD_PROJECT_BYTES + 1);
  assert.throws(
    () => createCloudProjectRecord(OWNER_ID, oversizedCloudDocument, 1),
    /too large for cloud backup/,
  );
  assert.throws(() => normalizeCloudProjectRecord(oversizedCloud), /too large for cloud backup/);
});

test("malformed and oversized collections fail equivalently at local, cloud, and public boundaries", () => {
  const fixtures = [
    {
      name: "malformed number",
      expected: /Project tempo must be between/,
      mutate(document) {
        document.project.transport.bpm = null;
      },
    },
    {
      name: "duplicate Pattern identifier",
      expected: /duplicate Pattern id/,
      mutate(document) {
        const duplicate = structuredClone(document.project.patterns[0]);
        duplicate.name = "Duplicate Pattern";
        document.project.patterns.push(duplicate);
      },
    },
    {
      name: "missing Pattern reference",
      expected: /references unknown Pattern/,
      mutate(document) {
        document.project.tracks[0].clips.push({
          id: "clip-missing-pattern",
          patternId: "missing-pattern",
          startTick: 0,
        });
      },
    },
    {
      name: "oversized note array",
      expected: new RegExp(`at most ${MAX_NOTES_PER_PATTERN} notes`),
      mutate(document) {
        document.project.patterns[0].notes = oversizedNotes();
      },
    },
    {
      name: "note overlap",
      expected: /overlap in Pattern pattern-1/,
      mutate(document) {
        document.project.patterns[0].notes = [
          { id: "note-a", pitch: 60, startTick: 0, durationTicks: 24, velocity: 1 },
          { id: "note-b", pitch: 64, startTick: 12, durationTicks: 24, velocity: 1 },
        ];
      },
    },
    {
      name: "unknown Instrument type",
      expected: /Unknown Instrument type/,
      mutate(document) {
        document.project.tracks[0].instrument.type = "project-supplied-device";
      },
    },
    {
      name: "unknown Instrument version",
      expected: /Unsupported klinto-chip version/,
      mutate(document) {
        document.project.tracks[0].instrument.version = 2;
      },
    },
  ];

  for (const fixture of fixtures) {
    const document = rawDocument(structuredClone(createDefaultV2Project()), {
      id: `project-${fixture.name.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`,
    });
    fixture.mutate(document);
    assertRejectedAtEveryTrustBoundary(document, fixture.expected, fixture.name);
  }
});
