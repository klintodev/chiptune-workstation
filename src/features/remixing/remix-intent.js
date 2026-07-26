const MAX_PUBLICATION_ID_LENGTH = 100;

export function buildRemixStudioUrl({
  publicationId,
  publicationRevision,
}, baseUrl = globalThis.location?.href ?? "http://localhost/player.html") {
  if (typeof publicationId !== "string" || publicationId.trim() === "" || publicationId.length > MAX_PUBLICATION_ID_LENGTH) {
    throw new TypeError("A valid public project ID is required.");
  }
  if (!Number.isInteger(publicationRevision) || publicationRevision < 1) {
    throw new RangeError("A valid public revision is required.");
  }
  const url = new URL("./", baseUrl);
  url.searchParams.set("remix", publicationId);
  url.searchParams.set("revision", String(publicationRevision));
  return url.href;
}
export function parseRemixIntent(url = globalThis.location?.href ?? "http://localhost/") {
  const parsed = new URL(url);
  const publicationId = parsed.searchParams.get("remix");
  const revisionText = parsed.searchParams.get("revision");
  if (!publicationId && !revisionText) return null;
  const publicationRevision = Number(revisionText);
  if (
    !publicationId
    || publicationId.length > MAX_PUBLICATION_ID_LENGTH
    || !Number.isInteger(publicationRevision)
    || publicationRevision < 1
  ) throw new RangeError("This remix request is invalid. Return to the shared player and try again.");
  return Object.freeze({ publicationId, publicationRevision });
}
