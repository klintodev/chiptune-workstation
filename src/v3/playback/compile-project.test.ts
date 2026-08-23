import { describe, expect, it } from "vitest";

import { createProject, type Note, type Project } from "../project";
import { compileProject } from "./compile-project";
import { MAX_PLAYBACK_EVENTS } from "./playback-plan";

const ids = {
  project: "project-compile",
  pattern: "pattern-compile",
  track: "track-compile",
  instrument: "instrument-compile",
} as const;

function projectWithNotes(notes: Array<Omit<Note, "patternId">>): Project {
  const project = createProject({
    ids,
    timestamp: "2026-08-23T12:00:00.000Z",
  });
  const pattern = project.patterns.byId[ids.pattern];
  const track = project.tracks.byId[ids.track];
  if (!pattern || !track) throw new Error("Expected the default project entities.");

  project.notes = {
    byId: Object.fromEntries(notes.map((note) => [note.id, { ...note, patternId: pattern.id }])),
    order: notes.map((note) => note.id),
  };
  project.clips = {
    byId: {
      "clip-later": {
        id: "clip-later",
        trackId: track.id,
        patternId: pattern.id,
        startTick: 384,
      },
      "clip-first": {
        id: "clip-first",
        trackId: track.id,
        patternId: pattern.id,
        startTick: 0,
      },
    },
    order: ["clip-later", "clip-first"],
  };
  return project;
}

describe("compileProject", () => {
  it("projects clips into deterministically ordered playback events", () => {
    const project = projectWithNotes([
      { id: "note-high", pitch: 72, startTick: 48, durationTicks: 24, velocity: 0.6 },
      { id: "note-low", pitch: 60, startTick: 0, durationTicks: 48, velocity: 0.8 },
    ]);

    const plan = compileProject(project);

    expect(plan.projectId).toBe(project.id);
    expect(plan.projectRevision).toBe(project.revision);
    expect(plan.durationTicks).toBe(768);
    expect(
      plan.tracks[0]?.events.map((event) => [event.clipId, event.noteId, event.startTick]),
    ).toEqual([
      ["clip-first", "note-low", 0],
      ["clip-first", "note-high", 48],
      ["clip-later", "note-low", 384],
      ["clip-later", "note-high", 432],
    ]);
  });

  it("uses locale-independent IDs to break musical event ties", () => {
    const project = projectWithNotes([
      { id: "note-a", pitch: 60, startTick: 0, durationTicks: 24, velocity: 1 },
      { id: "note-Z", pitch: 60, startTick: 0, durationTicks: 24, velocity: 1 },
    ]);

    const plan = compileProject(project);

    expect(
      plan.tracks[0]?.events
        .filter((event) => event.clipId === "clip-first")
        .map((event) => event.noteId),
    ).toEqual(["note-Z", "note-a"]);
  });

  it("rejects pathological clip expansion before allocating playback events", () => {
    const noteCount = 101;
    const project = projectWithNotes(
      Array.from({ length: noteCount }, (_, index) => ({
        id: `note-${index}`,
        pitch: index % 128,
        startTick: index,
        durationTicks: 1,
        velocity: 1,
      })),
    );
    const clipCount = Math.floor(MAX_PLAYBACK_EVENTS / noteCount) + 1;
    const clips = Array.from({ length: clipCount }, (_, index) => ({
      id: `clip-${index}`,
      trackId: ids.track,
      patternId: ids.pattern,
      startTick: index * 384,
    }));
    project.clips = {
      byId: Object.fromEntries(clips.map((clip) => [clip.id, clip])),
      order: clips.map((clip) => clip.id),
    };

    expect(() => compileProject(project)).toThrow(
      `Project expands beyond the ${MAX_PLAYBACK_EVENTS} playback-event limit.`,
    );
  });

  it("rejects unsafe tick arithmetic in an in-memory project", () => {
    const project = projectWithNotes([]);
    const clip = project.clips.byId["clip-later"];
    if (!clip) throw new Error("Expected the later clip.");
    clip.startTick = Number.MAX_SAFE_INTEGER;

    expect(() => compileProject(project)).toThrow(/safe integer range/i);
  });

  it("applies mute and solo policy without changing project state", () => {
    const project = projectWithNotes([
      { id: "note-1", pitch: 60, startTick: 0, durationTicks: 24, velocity: 1 },
    ]);
    const firstTrack = project.tracks.byId[ids.track];
    if (!firstTrack) throw new Error("Expected the default track.");
    project.tracks.byId["track-solo"] = {
      ...firstTrack,
      id: "track-solo",
      name: "Solo",
      solo: true,
    };
    project.tracks.order.push("track-solo");
    const before = JSON.stringify(project);

    const plan = compileProject(project);

    expect(plan.tracks.map((track) => [track.id, track.audible])).toEqual([
      [ids.track, false],
      ["track-solo", true],
    ]);
    expect(JSON.stringify(project)).toBe(before);
  });

  it("copies engine-facing instrument data instead of leaking project references", () => {
    const project = projectWithNotes([]);
    const projectInstrument = project.instruments.byId[ids.instrument];
    if (!projectInstrument) throw new Error("Expected the default instrument.");
    const nestedParameter = { levels: [0.25, 0.75] };
    projectInstrument.parameters["nested"] = nestedParameter;

    const plan = compileProject(project);
    const planInstrument = plan.tracks[0]?.instrument;

    expect(planInstrument).not.toBe(projectInstrument);
    expect(planInstrument?.parameters).not.toBe(projectInstrument.parameters);
    expect(planInstrument?.parameters["nested"]).not.toBe(nestedParameter);
  });
});
