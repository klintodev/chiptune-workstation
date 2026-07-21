const STORAGE_PREFIX = "chiptune-workstation:publication:";

function key(uid, projectId) {
  return `${uid}:${projectId}`;
}

export function normalizePublicationLink(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("Publication link is invalid.");
  for (const field of ["uid", "projectId", "publicationId", "creatorName", "publishedAt", "updatedAt"]) {
    if (typeof candidate[field] !== "string" || candidate[field].trim() === "") {
      throw new TypeError(`Publication link ${field} is required.`);
    }
  }
  if (!Number.isInteger(candidate.publicationRevision) || candidate.publicationRevision < 1) {
    throw new RangeError("Publication link revision is invalid.");
  }
  return Object.freeze({
    key: key(candidate.uid, candidate.projectId),
    uid: candidate.uid,
    projectId: candidate.projectId,
    publicationId: candidate.publicationId,
    publicationRevision: candidate.publicationRevision,
    creatorName: candidate.creatorName,
    publishedAt: candidate.publishedAt,
    updatedAt: candidate.updatedAt,
  });
}

export function createMemoryPublicationLinkRepository(initial = []) {
  const links = new Map(initial.map((candidate) => {
    const normalized = normalizePublicationLink(candidate);
    return [normalized.key, normalized];
  }));
  return Object.freeze({
    async delete(uid, projectId) { return links.delete(key(uid, projectId)); },
    async get(uid, projectId) { return links.get(key(uid, projectId)) ?? null; },
    async save(candidate) {
      const normalized = normalizePublicationLink(candidate);
      links.set(normalized.key, normalized);
      return normalized;
    },
  });
}

export function createLocalPublicationLinkRepository(storage = globalThis.localStorage) {
  if (!storage) return createMemoryPublicationLinkRepository();
  return Object.freeze({
    async delete(uid, projectId) {
      storage.removeItem(`${STORAGE_PREFIX}${key(uid, projectId)}`);
      return true;
    },
    async get(uid, projectId) {
      const value = storage.getItem(`${STORAGE_PREFIX}${key(uid, projectId)}`);
      if (!value) return null;
      try { return normalizePublicationLink(JSON.parse(value)); } catch { return null; }
    },
    async save(candidate) {
      const normalized = normalizePublicationLink(candidate);
      storage.setItem(`${STORAGE_PREFIX}${normalized.key}`, JSON.stringify(normalized));
      return normalized;
    },
  });
}
