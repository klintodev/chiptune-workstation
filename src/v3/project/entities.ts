import type { OrderedEntityCollection } from "./project";

export class EntityNotFoundError extends Error {
  readonly code = "ENTITY_NOT_FOUND" as const;

  constructor(readonly entityId: string) {
    super(`Entity ${entityId} is missing.`);
    this.name = "EntityNotFoundError";
  }
}

export function findEntityById<T extends { id: string }>(
  entities: OrderedEntityCollection<T>,
  entityId: string,
): T | undefined {
  if (!Object.hasOwn(entities.byId, entityId)) return undefined;
  return entities.byId[entityId];
}

export function requireEntityById<T extends { id: string }>(
  entities: OrderedEntityCollection<T>,
  entityId: string,
  createNotFoundError?: () => Error,
): T {
  const entity = findEntityById(entities, entityId);
  if (entity === undefined) {
    throw createNotFoundError?.() ?? new EntityNotFoundError(entityId);
  }
  return entity;
}

export function listEntitiesInOrder<T extends { id: string }>(
  entities: OrderedEntityCollection<T>,
): T[] {
  const entitiesInOrder: T[] = [];
  for (const entityId of entities.order) {
    const entity = findEntityById(entities, entityId);
    if (entity !== undefined) entitiesInOrder.push(entity);
  }
  return entitiesInOrder;
}

export function findFirstEntityInOrder<T extends { id: string }>(
  entities: OrderedEntityCollection<T>,
): T | undefined {
  for (const entityId of entities.order) {
    const entity = findEntityById(entities, entityId);
    if (entity !== undefined) return entity;
  }
  return undefined;
}
