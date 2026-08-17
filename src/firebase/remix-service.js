import {
  copyProjectDocument,
  createProjectIdentifier,
} from "../persistence/project-document.js";
import {
  normalizePublicationRecord,
  normalizePublicationRecordToV7,
} from "./publication.js";

const MAX_PROJECT_TITLE_LENGTH = 100;

function remixTitle(title) {
  const suffix = " remix";
  return `${title.slice(0, MAX_PROJECT_TITLE_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

export function createRemixImport(publication, {
  createId = createProjectIdentifier,
  expectedRevision,
  now = new Date().toISOString(),
} = {}) {
  const source = normalizePublicationRecord(publication);
  if (source.allowRemix !== true) {
    throw new Error("The creator is not allowing new remixes from this publication.");
  }
  if (!Number.isInteger(expectedRevision) || source.publicationRevision !== expectedRevision) {
    throw new Error("This public snapshot changed. Reload it before starting a remix.");
  }
  const document = copyProjectDocument(source.document, {
    id: createId(),
    now,
    title: remixTitle(source.title),
  });
  const provenance = Object.freeze({
    creatorName: source.creatorName,
    permissionGranted: true,
    publicationId: source.publicationId,
    publicationRevision: source.publicationRevision,
    sourceTitle: source.title,
  });
  return Object.freeze({ document, provenance });
}

export function createV2RemixImport(publication, options = {}) {
  const normalized = normalizePublicationRecordToV7(publication);
  return createRemixImport(normalized, options);
}

export function createRemixService({
  createId = createProjectIdentifier,
  loadPublication,
  migrateToV7 = false,
  now = () => new Date().toISOString(),
  projectRepository,
  provenanceRepository,
} = {}) {
  if (!loadPublication || !projectRepository || !provenanceRepository) {
    throw new TypeError("Remixing requires public, project, and provenance repositories.");
  }

  async function importPublication(publicationId, expectedRevision) {
    const publication = await loadPublication(publicationId);
    if (!publication) throw new RangeError("This public project is no longer available.");
    const created = (migrateToV7 ? createV2RemixImport : createRemixImport)(publication, {
      createId,
      expectedRevision,
      now: now(),
    });
    await projectRepository.save(created.document);
    try {
      await provenanceRepository.save(created.document.id, created.provenance);
    } catch (error) {
      try {
        await projectRepository.delete(created.document.id);
      } catch {
        const rollbackError = new Error("Remix import could not roll back its incomplete local copy.", {
          cause: error,
        });
        rollbackError.code = "remix/rollback-failed";
        throw rollbackError;
      }
      throw error;
    }
    return created;
  }

  return Object.freeze({ importPublication });
}
