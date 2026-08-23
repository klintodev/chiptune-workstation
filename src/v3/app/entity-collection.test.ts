import { describe, expect, it } from "vitest";

import type { EntityCollection } from "../project/project";
import { firstEntity, orderedEntities } from "./entity-collection";

const PROTOTYPE_PROPERTY_NAMES = ["toString", "valueOf", "constructor"] as const;

interface TestEntity {
  id: string;
}

describe("application entity collection helpers", () => {
  it.each(PROTOTYPE_PROPERTY_NAMES)("ignore inherited %s properties", (id) => {
    const collection: EntityCollection<TestEntity> = {
      byId: {},
      order: [id],
    };

    expect(firstEntity(collection)).toBeUndefined();
    expect(orderedEntities(collection)).toEqual([]);
  });
});
