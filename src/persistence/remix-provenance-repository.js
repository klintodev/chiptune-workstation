const STORAGE_PREFIX = "chiptune-workstation:remix-source:";

function normalizeProvenance(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("Remix source is invalid.");
  for (const [field, maximum] of [
    ["publicationId", 100],
    ["sourceTitle", 100],
    ["creatorName", 48],
  ]) {
    if (typeof candidate[field] !== "string" || candidate[field].trim() === "" || candidate[field].length > maximum) {
      throw new TypeError(`Remix source ${field} is invalid.`);
    }
  }
  if (!Number.isInteger(candidate.publicationRevision) || candidate.publicationRevision < 1) {
    throw new RangeError("Remix source revision is invalid.");
  }
  if (candidate.permissionGranted !== true) {
    throw new RangeError("Remix source must record explicit in-product permission.");
  }
  return Object.freeze({
    creatorName: candidate.creatorName.trim(),
    permissionGranted: true,
    publicationId: candidate.publicationId.trim(),
    publicationRevision: candidate.publicationRevision,
    sourceTitle: candidate.sourceTitle.trim(),
  });
}

export function createMemoryRemixProvenanceRepository() {
  const records = new Map();
  return Object.freeze({
    async delete(projectId) {
      return records.delete(projectId);
    },
    async get(projectId) {
      return records.get(projectId) ?? null;
    },
    async save(projectId, provenance) {
      if (typeof projectId !== "string" || projectId.trim() === "") {
        throw new TypeError("A local project ID is required for remix attribution.");
      }
      const normalized = normalizeProvenance(provenance);
      records.set(projectId, normalized);
      return normalized;
    },
  });
}

export function createLocalRemixProvenanceRepository(storage = globalThis.localStorage) {
  if (!storage) return createMemoryRemixProvenanceRepository();
  return Object.freeze({
    async delete(projectId) {
      storage.removeItem(`${STORAGE_PREFIX}${projectId}`);
      return true;
    },
    async get(projectId) {
      const value = storage.getItem(`${STORAGE_PREFIX}${projectId}`);
      if (!value) return null;
      try {
        return normalizeProvenance(JSON.parse(value));
      } catch {
        return null;
      }
    },
    async save(projectId, provenance) {
      const normalized = normalizeProvenance(provenance);
      storage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(normalized));
      return normalized;
    },
  });
}
