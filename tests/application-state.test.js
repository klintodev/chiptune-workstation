import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRACK_ID,
  PROJECT_SCHEMA_VERSION,
  createProjectState,
} from "../src/state/project-state.js";
import { createSessionState } from "../src/state/session-state.js";
import { createInstrumentState } from "../src/state/instrument-state.js";
import { createPatternState } from "../src/state/pattern-state.js";

test("project state owns persistable transport, instrument, and pattern data", () => {
  const project = createProjectState();
  const snapshot = project.getState();

  assert.equal(snapshot.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(snapshot.metadata.title, "Untitled chiptune");
  assert.equal(snapshot.transport.bpm, 120);
  assert.deepEqual(project.getTrack(DEFAULT_TRACK_ID).mixer, { muted: false, solo: false, volume: 1 });
  assert.equal(project.getTrack(DEFAULT_TRACK_ID).pattern.steps.length, 16);
  assert.equal(Object.isFrozen(snapshot), true);

  project.setBpm(148);
  assert.equal(project.getState().transport.bpm, 148);
});

test("session state remains separate from the persistable project", () => {
  const project = createProjectState();
  const session = createSessionState();

  session.setAudio({ status: "running" });
  session.setTransport({ status: "playing", retainedStepIndex: 3 });
  session.setActiveNotes(new Set([64, 60]));

  assert.deepEqual(session.getState().activeNotes, [60, 64]);
  assert.equal(session.getState().transport.status, "playing");
  assert.equal("audio" in project.getState(), false);
});


test("feature state adapters write through to the project", () => {
  const project = createProjectState();
  const instrument = createInstrumentState(undefined, { projectState: project });
  const pattern = createPatternState(undefined, { projectState: project });

  instrument.setVoiceType("triangle");
  pattern.setStep(0, 60);
  pattern.setVolume(0, 0.4);

  const track = project.getTrack();
  assert.equal(track.instrument.voiceType, "triangle");
  assert.deepEqual(track.pattern.steps[0], { note: 60, gate: 0.75, volume: 0.4 });

  pattern.undo();
  assert.equal(project.getTrack().pattern.steps[0].volume, 0.7);
});

test("replacing a project updates feature projections and resets stale pattern history", () => {
  const project = createProjectState();
  const instrument = createInstrumentState(undefined, { projectState: project });
  const pattern = createPatternState(undefined, { projectState: project });
  pattern.setStep(0, 60);

  const current = project.getState();
  const track = project.getTrack();
  project.replace({
    ...current,
    tracks: [{
      ...track,
      instrument: { ...track.instrument, voiceType: "noise" },
      pattern: { ...track.pattern, steps: [{ note: 64, gate: 0.75, volume: 0.7 }, null, null, null] },
    }],
  });

  assert.equal(instrument.getState().voiceType, "noise");
  assert.equal(pattern.getState().steps[0].note, 64);
  assert.equal(pattern.getState().length, 4);
  assert.equal(pattern.getState().canUndo, false);
});

test("a project survives JSON serialization and validates on restoration", () => {
  const original = createProjectState();
  original.setBpm(132);
  const restored = createProjectState(JSON.parse(JSON.stringify(original.getState())));

  assert.deepEqual(restored.getState(), original.getState());
  assert.throws(() => createProjectState({
    ...original.getState(),
    schemaVersion: 99,
  }), RangeError);
});

test("project history spans instrument and pattern mutations", () => {
  const project = createProjectState();
  const instrument = createInstrumentState(undefined, { projectState: project });
  const pattern = createPatternState(undefined, { projectState: project });

  instrument.setVoiceType("triangle");
  pattern.setStep(0, 60);
  assert.equal(pattern.getState().canUndo, true);

  pattern.undo();
  assert.equal(pattern.getState().steps[0], null);
  pattern.undo();
  assert.equal(instrument.getState().voiceType, "square");
  pattern.redo();
  assert.equal(instrument.getState().voiceType, "triangle");
});

test("project-backed slider edits still collapse into one history entry", () => {
  const project = createProjectState();
  const pattern = createPatternState(undefined, { projectState: project });
  pattern.setStep(0, 60);
  pattern.beginHistoryGroup();
  pattern.setVolume(0, 0.6);
  pattern.setVolume(0, 0.5);
  pattern.setVolume(0, 0.4);
  pattern.endHistoryGroup();

  pattern.undo();
  assert.equal(pattern.getState().steps[0].volume, 0.7);
});
