import { describe, expect, it } from "vitest";

import { getOwnEntity, MissingEntityError, requireOwnEntity } from "./entity-collection";
import type { EntityCollection } from "./project";

const PROTOTYPE_PROPERTY_NAMES = ["toString", "valueOf", "constructor"] as const;

interface TestEntity {
  id: string;
  value: number;
}

describe("entity collection lookup", () => {
  it.each(PROTOTYPE_PROPERTY_NAMES)("does not return inherited %s properties", (id) => {
    const collection: EntityCollection<TestEntity> = { byId: {}, order: [id] };

    expect(getOwnEntity(collection, id)).toBeUndefined();
    expect(() => requireOwnEntity(collection, id)).toThrow(MissingEntityError);
  });

  it.each(PROTOTYPE_PROPERTY_NAMES)("returns an explicitly owned %s entity", (id) => {
    const entity = { id, value: 1 };
    const collection: EntityCollection<TestEntity> = {
      byId: { [id]: entity },
      order: [id],
    };

    expect(getOwnEntity(collection, id)).toBe(entity);
    expect(requireOwnEntity(collection, id)).toBe(entity);
  });
});
