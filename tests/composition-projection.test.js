import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";
import { buildCompositionProjection } from "../src/visualiser/composition-projection.js";

function programPattern(project) {
  project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => {
      if (index === 0) return { note: 60, gate: 0.75, volume: 0.8 };
      if (index === 4) return { note: 72, gate: 0.5, volume: 0.4 };
      return step;
    }),
  }));
}

function timeline(overrides = {}) {
  return {
    mode: "arrangement",
    status: "playing",
    stepIndex: 0,
    stepProgress: 0.5,
    ...overrides,
  };
}

test("arrangement projection derives notes, expression, pitch, and pan from project state", () => {
  const state = createProjectState();
  programPattern(state);
  state.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  state.updateTrack(DEFAULT_TRACK_ID, (track) => ({
    ...track,
    mixer: { ...track.mixer, pan: -0.75 },
  }));

  const projection = buildCompositionProjection(state.getState(), timeline(), { horizonSteps: 8 });
  const active = projection.notes.find((note) => note.patternStepIndex === 0);
  const upcoming = projection.notes.find((note) => note.patternStepIndex === 4);

  assert.equal(active.active, true);
  assert.equal(active.noteLabel, "C4");
  assert.equal(active.pan, -0.75);
  assert.equal(active.velocity, 0.8);
  assert.ok(Math.abs(active.life - 1 / 3) < 0.0001);
  assert.equal(upcoming.active, false);
  assert.equal(upcoming.noteLabel, "C5");
  assert.ok(Math.abs(upcoming.depth - 0.4375) < 0.0001);
});

test("projection respects mute and arrangement loop wrapping", () => {
  const state = createProjectState();
  programPattern(state);
  state.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  state.setLoop({ enabled: true, startStep: 0, endStep: 16 });

  const wrapped = buildCompositionProjection(
    state.getState(),
    timeline({ stepIndex: 15, stepProgress: 0.25 }),
    { horizonSteps: 2 },
  );
  assert.ok(wrapped.notes.some((note) => note.patternStepIndex === 0 && note.stepsUntilStart === 0.75));

  state.updateTrack(DEFAULT_TRACK_ID, (track) => ({
    ...track,
    mixer: { ...track.mixer, muted: true },
  }));
  const muted = buildCompositionProjection(state.getState(), timeline(), { horizonSteps: 8 });
  assert.ok(muted.notes.length > 0);
  assert.ok(muted.notes.every((note) => note.audible === false && note.timingState === "inactive"));
  assert.equal(muted.activity[0].audible, false);
});

test("pattern projection wraps the selected pattern independently of clips", () => {
  const state = createProjectState();
  programPattern(state);
  const projection = buildCompositionProjection(
    state.getState(),
    timeline({ mode: "pattern", stepIndex: 15, stepProgress: 0 }),
    {
      horizonSteps: 2,
      selectedPatternId: DEFAULT_PATTERN_ID,
      selectedTrackId: DEFAULT_TRACK_ID,
    },
  );

  const wrapped = projection.notes.find((note) => note.patternStepIndex === 0);
  assert.equal(wrapped.stepsUntilStart, 1);
  assert.equal(wrapped.noteLabel, "C4");
});

test("stopped and paused projections retain deterministic previews without claiming activity", () => {
  const state = createProjectState();
  programPattern(state);
  state.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  for (const status of ["stopped", "paused"]) {
    const first = buildCompositionProjection(
      state.getState(),
      timeline({ status, stepIndex: 0, stepProgress: 0 }),
      { horizonSteps: 8 },
    );
    const second = buildCompositionProjection(
      state.getState(),
      timeline({ status, stepIndex: 0, stepProgress: 0 }),
      { horizonSteps: 8 },
    );
    assert.deepEqual(first, second);
    assert.ok(first.notes.length > 0);
    assert.ok(first.notes.every((note) => note.active === false));
  }
});

test("projection preserves track order and marks solo-excluded tracks inactive", () => {
  const state = createProjectState();
  programPattern(state);
  state.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const secondTrackId = state.addTrack("Bass");
  state.addClip(secondTrackId, DEFAULT_PATTERN_ID, 0);
  state.updateTrack(secondTrackId, (track) => ({
    ...track,
    mixer: { ...track.mixer, solo: true },
  }));
  const projection = buildCompositionProjection(state.getState(), timeline(), { horizonSteps: 2 });
  assert.deepEqual(projection.activity.map(({ trackId }) => trackId), [DEFAULT_TRACK_ID, secondTrackId]);
  assert.equal(projection.activity[0].audible, false);
  assert.equal(projection.activity[1].audible, true);
  assert.ok(projection.notes.some((note) => note.trackId === DEFAULT_TRACK_ID && !note.audible));
  assert.ok(projection.notes.some((note) => note.trackId === secondTrackId && note.active));
});
