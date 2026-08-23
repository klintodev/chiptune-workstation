import type { EntityCollection } from "./project";

export class MissingEntityError extends Error {
  readonly code = "ENTITY_NOT_FOUND" as const;

  constructor(readonly entityId: string) {
    super(`Entity ${entityId} is missing.`);
    this.name = "MissingEntityError";
  }
}

export function getOwnEntity<T extends { id: string }>(
  collection: EntityCollection<T>,
  id: string,
): T | undefined {
  if (!Object.hasOwn(collection.byId, id)) return undefined;
  return collection.byId[id];
}

export function requireOwnEntity<T extends { id: string }>(
  collection: EntityCollection<T>,
  id: string,
  createMissingError?: () => Error,
): T {
  const entity = getOwnEntity(collection, id);
  if (entity === undefined) throw createMissingError?.() ?? new MissingEntityError(id);
  return entity;
}
