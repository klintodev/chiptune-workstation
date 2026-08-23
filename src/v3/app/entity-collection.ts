import type { EntityCollection } from "../project";

export function orderedEntities<T extends { id: string }>(collection: EntityCollection<T>): T[] {
  return collection.order.flatMap((id) => {
    const entity = collection.byId[id];
    return entity ? [entity] : [];
  });
}

export function firstEntity<T extends { id: string }>(
  collection: EntityCollection<T>,
): T | undefined {
  const firstId = collection.order[0];
  return firstId ? collection.byId[firstId] : undefined;
}
