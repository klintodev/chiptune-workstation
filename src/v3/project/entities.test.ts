import { describe, expect, it } from "vitest";

import {
  EntityNotFoundError,
  findEntityById,
  findFirstEntityInOrder,
  listEntitiesInOrder,
  requireEntityById,
} from "./entities";
import type { OrderedEntityCollection } from "./project";

const PROTOTYPE_PROPERTY_NAMES = ["toString", "valueOf", "constructor"] as const;

interface TestEntity {
  id: string;
  value: number;
}

describe("when finding an entity by ID", () => {
  it.each(PROTOTYPE_PROPERTY_NAMES)("then inherited %s properties should not be returned", (id) => {
    const entities: OrderedEntityCollection<TestEntity> = { byId: {}, order: [id] };

    expect(findEntityById(entities, id)).toBeUndefined();
  });

  it.each(PROTOTYPE_PROPERTY_NAMES)(
    "then an entity stored under the %s ID should be returned",
    (id) => {
      const entity = { id, value: 1 };
      const entities: OrderedEntityCollection<TestEntity> = {
        byId: { [id]: entity },
        order: [id],
      };

      expect(findEntityById(entities, id)).toBe(entity);
    },
  );
});

describe("when requiring an entity by ID", () => {
  it.each(PROTOTYPE_PROPERTY_NAMES)(
    "then inherited %s properties should throw an entity-not-found error",
    (id) => {
      const entities: OrderedEntityCollection<TestEntity> = { byId: {}, order: [id] };

      expect(() => requireEntityById(entities, id)).toThrow(EntityNotFoundError);
    },
  );

  it.each(PROTOTYPE_PROPERTY_NAMES)(
    "then an entity stored under the %s ID should be returned",
    (id) => {
      const entity = { id, value: 1 };
      const entities: OrderedEntityCollection<TestEntity> = {
        byId: { [id]: entity },
        order: [id],
      };

      expect(requireEntityById(entities, id)).toBe(entity);
    },
  );
});

describe("when listing entities in order", () => {
  it.each(PROTOTYPE_PROPERTY_NAMES)("then inherited %s properties should be ignored", (id) => {
    const entities: OrderedEntityCollection<TestEntity> = { byId: {}, order: [id] };

    expect(listEntitiesInOrder(entities)).toEqual([]);
  });

  it("then stored entities should be returned in declared order while missing IDs are ignored", () => {
    const first = { id: "first", value: 1 };
    const second = { id: "second", value: 2 };
    const entities: OrderedEntityCollection<TestEntity> = {
      byId: { first, second },
      order: ["second", "missing", "first"],
    };

    expect(listEntitiesInOrder(entities)).toEqual([second, first]);
  });
});

describe("when finding the first entity in order", () => {
  it.each(PROTOTYPE_PROPERTY_NAMES)("then inherited %s properties should be ignored", (id) => {
    const entities: OrderedEntityCollection<TestEntity> = { byId: {}, order: [id] };

    expect(findFirstEntityInOrder(entities)).toBeUndefined();
  });

  it.each(PROTOTYPE_PROPERTY_NAMES)(
    "then the first stored entity after missing and inherited %s IDs should be returned",
    (id) => {
      const entity = { id: "stored", value: 1 };
      const entities: OrderedEntityCollection<TestEntity> = {
        byId: { stored: entity },
        order: ["missing", id, entity.id],
      };

      expect(findFirstEntityInOrder(entities)).toBe(entity);
    },
  );
});
