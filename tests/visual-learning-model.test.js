import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";
import {
  buildProjectionSummary,
  createClipContour,
  getProjectedNoteAccessibleName,
  getProjectedNoteDetails,
  normalizeVisualPreferences,
  resolveProjectedNoteSource,
} from "../src/visualiser/visual-learning-model.js";

function projectedNote(overrides = {}) {
  return {
    active: false,
    arrangementStepIndex: 8,
    audible: true,
    clipId: "clip-1",
    gate: 0.75,
    id: "track-1:clip-1:8:0",
    noteLabel: "C4",
    pan: -0.5,
    patternId: DEFAULT_PATTERN_ID,
    patternStepIndex: 8,
    stepsUntilStart: 2,
    timingState: "upcoming",
    trackId: DEFAULT_TRACK_ID,
    trackIndex: 0,
    trackName: "Pulse 1",
    velocity: 0.7,
    voiceType: "square",
    ...overrides,
  };
}

test("visual preferences are bounded presentation state rather than project state", () => {
  assert.deepEqual(normalizeVisualPreferences({
    contrast: "unknown",
    motion: "reduced",
    presentation: "stereo",
  }), {
    contrast: "standard",
    motion: "reduced",
    presentation: "stereo",
  });
  assert.equal("visualLearning" in createProjectState().getState(), false);
});

test("projected notes expose stable, beginner-readable DOM names and inspector values", () => {
  const note = projectedNote();
  assert.equal(
    getProjectedNoteAccessibleName(note),
    "Pulse 1, C4, upcoming, pattern step 9, arrangement step 9",
  );
  assert.deepEqual(getProjectedNoteDetails(note), {
    arrangement: "Step 9",
    gate: "75% of a step",
    note: "C4",
    pan: "50% left",
    pattern: DEFAULT_PATTERN_ID,
    patternStep: "9",
    track: "Pulse 1",
    velocity: "70%",
    voice: "pulse 50%",
  });
});

test("text summaries group bounded upcoming notes while reporting active notes and position", () => {
  const summary = buildProjectionSummary({
    mode: "arrangement",
    notes: [
      projectedNote({ active: true, stepsUntilStart: -0.2, timingState: "active" }),
      projectedNote({ id: "second", noteLabel: "E4", stepsUntilStart: 3 }),
      projectedNote({ id: "third", noteLabel: "G4", stepsUntilStart: 6, trackName: "Bass" }),
    ],
    status: "playing",
    stepIndex: 8,
  });
  assert.match(summary, /^Arrangement step 9, playing\./);
  assert.match(summary, /Active: Pulse 1 C4/);
  assert.match(summary, /Pulse 1: E4 in 3\.00 steps/);
  assert.match(summary, /Bass: G4 in 6\.00 steps/);
});

test("text summaries do not describe muted or solo-excluded notes as upcoming", () => {
  const summary = buildProjectionSummary({
    mode: "arrangement",
    notes: [
      projectedNote({
        audible: false,
        id: "muted",
        noteLabel: "D4",
        timingState: "inactive",
        trackName: "Muted lead",
      }),
      projectedNote({ id: "audible", noteLabel: "E4", timingState: "upcoming" }),
    ],
    status: "playing",
    stepIndex: 8,
  });
  assert.doesNotMatch(summary, /Muted lead|D4/);
  assert.match(summary, /Pulse 1: E4 in 2\.00 steps/);
});

test("edit handoff resolves authoritative IDs and fails closed for stale notes", () => {
  const project = createProjectState();
  project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 8
      ? { gate: 0.75, note: 60, volume: 0.7 }
      : step),
  }));
  const clipId = project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  const note = projectedNote({ clipId });
  assert.deepEqual(resolveProjectedNoteSource(project.getState(), note), {
    activeDockPanel: "sequencer",
    detailPanelCollapsed: false,
    selectedClipId: clipId,
    selectedPatternId: DEFAULT_PATTERN_ID,
    selectedStepIndex: 8,
    selectedTrackId: DEFAULT_TRACK_ID,
  });
  project.removeClip(clipId);
  assert.equal(resolveProjectedNoteSource(project.getState(), note), null);
  assert.equal(resolveProjectedNoteSource(project.getState(), { ...note, patternStepIndex: 99 }), null);
});

test("clip contours preserve rests, pitch, gate and velocity across supported lengths", () => {
  for (const length of [4, 8, 16, 32]) {
    const steps = Array(length).fill(null);
    steps[0] = { gate: 0.25, note: 48, volume: 0.3 };
    steps[length - 1] = { gate: 1, note: 72, volume: 1 };
    const contour = createClipContour({ steps });
    assert.equal(contour.length, 2);
    assert.equal(contour[0].step, 0);
    assert.equal(contour[0].pitch, 0);
    assert.equal(contour[0].gate, 0.25);
    assert.equal(contour[1].pitch, 1);
    assert.equal(contour[1].emphasis, 1);
    assert.ok(contour[1].width <= 1 / length);
  }
});
