import { getOwnEntity } from "../project/entity-collection";
import type { EntityCollection } from "../project/project";

export function orderedEntities<T extends { id: string }>(collection: EntityCollection<T>): T[] {
  return collection.order.flatMap((id) => {
    const entity = getOwnEntity(collection, id);
    return entity ? [entity] : [];
  });
}

export function firstEntity<T extends { id: string }>(
  collection: EntityCollection<T>,
): T | undefined {
  const firstId = collection.order[0];
  return firstId ? getOwnEntity(collection, firstId) : undefined;
}
