import { createProjectIdentifier } from "../persistence/project-document.js?v=20260722-1";

export function buildPublicationUrl(publicationId, baseUrl = globalThis.location?.href ?? "http://localhost/") {
  const url = new URL("./player.html", baseUrl);
  url.searchParams.set("id", publicationId);
  return url.href;
}

export function createPublicationService({
  accountService,
  createId = createProjectIdentifier,
  linkRepository,
  now = () => new Date().toISOString(),
  persistence,
  shareBaseUrl,
} = {}) {
  if (!accountService || !linkRepository || !persistence) {
    throw new TypeError("Publishing requires account, link, and project persistence services.");
  }

  function requireAccount() {
    const account = accountService.getState().account;
    if (!account) throw new Error("Sign in before publishing a project.");
    if (account.emailVerified !== true) throw new Error("Verify your email before publishing a project.");
    return account;
  }

  async function getLink() {
    const account = accountService.getState().account;
    const projectId = persistence.getActiveDocument().id;
    if (account?.emailVerified !== true) return null;
    return linkRepository.get(account.uid, projectId);
  }

  async function publish(creatorName) {
    const account = requireAccount();
    const document = await persistence.saveNow();
    const existing = await linkRepository.get(account.uid, document.id);
    const publicationId = existing?.publicationId ?? createId().replace(/^project-/, "publication-");
    const timestamp = now();
    const client = await accountService.getClient();
    const record = await client.savePublication({
      creatorName,
      document,
      ownerId: account.uid,
      publicationId,
      expectedRevision: existing?.publicationRevision ?? 0,
      publishedAt: existing?.publishedAt ?? timestamp,
      updatedAt: timestamp,
    });
    const link = await linkRepository.save({
      uid: account.uid,
      projectId: document.id,
      publicationId,
      publicationRevision: record.publicationRevision,
      creatorName: record.creatorName,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
    });
    return Object.freeze({ ...link, url: buildPublicationUrl(publicationId, shareBaseUrl) });
  }

  async function unpublish() {
    const account = requireAccount();
    const projectId = persistence.getActiveDocument().id;
    const link = await linkRepository.get(account.uid, projectId);
    if (!link) return false;
    const client = await accountService.getClient();
    await client.deletePublication(account.uid, link.publicationId);
    await linkRepository.delete(account.uid, projectId);
    return true;
  }

  return Object.freeze({
    getCurrentPublication: async () => {
      const link = await getLink();
      return link ? Object.freeze({ ...link, url: buildPublicationUrl(link.publicationId, shareBaseUrl) }) : null;
    },
    publish,
    unpublish,
  });
}
