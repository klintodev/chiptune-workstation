import { describe, expect, it } from "vitest";

import { createProject, createProjectFile } from "./create-project";
import { requireOwnEntity } from "./entity-collection";
import { parseProject, parseProjectFile } from "./project-schema";

const PROTOTYPE_PROPERTY_NAMES = ["toString", "valueOf", "constructor"] as const;

const deterministicOptions = {
  name: "Test tune",
  timestamp: "2026-08-23T12:00:00.000Z",
  ids: {
    project: "project-test",
    pattern: "pattern-test",
    track: "track-test",
    instrument: "instrument-test",
  },
} as const;

describe("createProject", () => {
  it("is deterministic when IDs and the timestamp are supplied", () => {
    const first = createProject(deterministicOptions);
    const second = createProject(deterministicOptions);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      id: "project-test",
      name: "Test tune",
      revision: 0,
      createdAt: deterministicOptions.timestamp,
      updatedAt: deterministicOptions.timestamp,
    });
    expect(first.patterns.order).toEqual(["pattern-test"]);
    expect(first.patterns.byId["pattern-test"]?.id).toBe("pattern-test");
    expect(first.tracks.byId["track-test"]).toMatchObject({
      id: "track-test",
      instrumentId: "instrument-test",
    });
  });

  it("creates a JSON-safe version 1 project file", () => {
    const file = createProjectFile(createProject(deterministicOptions));
    const roundTrip = JSON.parse(JSON.stringify(file)) as unknown;

    expect(parseProjectFile(roundTrip)).toEqual(file);
    expect(file).toMatchObject({
      format: "chiptune-workstation-v3",
      formatVersion: 1,
    });
  });
});

describe("project boundary validation", () => {
  it("rejects unknown fields instead of silently accepting schema drift", () => {
    const project = createProject(deterministicOptions);

    expect(() => parseProject({ ...project, legacyState: {} })).toThrow();
  });

  it("rejects dangling cross-entity references", () => {
    const project = createProject(deterministicOptions);
    const track = requireOwnEntity(project.tracks, "track-test");

    const candidate = {
      ...project,
      tracks: {
        ...project.tracks,
        byId: {
          ...project.tracks.byId,
          [track.id]: { ...track, instrumentId: "instrument-missing" },
        },
      },
    };

    expect(() => parseProject(candidate)).toThrow(/unknown instrument/i);
  });

  it("rejects clips whose end tick cannot be represented safely", () => {
    const project = createProject(deterministicOptions);
    const clipId = "clip-overflow";
    const candidate = {
      ...project,
      clips: {
        byId: {
          [clipId]: {
            id: clipId,
            trackId: deterministicOptions.ids.track,
            patternId: deterministicOptions.ids.pattern,
            startTick: Number.MAX_SAFE_INTEGER,
          },
        },
        order: [clipId],
      },
    };

    expect(() => parseProject(candidate)).toThrow(/safe integer range/i);
  });

  it("rejects collection records and ordering that disagree", () => {
    const project = createProject(deterministicOptions);
    const candidate = {
      ...project,
      patterns: {
        ...project.patterns,
        order: ["pattern-missing"],
      },
    };

    expect(() => parseProject(candidate)).toThrow(/no entity|missing from order/i);
  });

  it.each(PROTOTYPE_PROPERTY_NAMES)(
    "rejects inherited %s properties used as ordered entity IDs",
    (id) => {
      const project = createProject(deterministicOptions);
      const candidate = {
        ...project,
        patterns: { byId: {}, order: [id] },
      };

      expect(() => parseProject(candidate)).toThrow(/no entity/i);
    },
  );

  it.each(PROTOTYPE_PROPERTY_NAMES)(
    "rejects inherited %s properties used as entity references",
    (instrumentId) => {
      const project = createProject(deterministicOptions);
      const track = requireOwnEntity(project.tracks, deterministicOptions.ids.track);
      const candidate = {
        ...project,
        tracks: {
          ...project.tracks,
          byId: {
            ...project.tracks.byId,
            [track.id]: { ...track, instrumentId },
          },
        },
      };

      expect(() => parseProject(candidate)).toThrow(/unknown instrument/i);
    },
  );
});
