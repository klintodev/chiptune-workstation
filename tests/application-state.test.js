import assert from "node:assert/strict";
import test from "node:test";

import { createInstrumentState } from "../src/state/instrument-state.js";
import { createPatternState } from "../src/state/pattern-state.js";
import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  PROJECT_SCHEMA_VERSION,
  createProjectState,
} from "../src/state/project-state.js";
import { createSessionState } from "../src/state/session-state.js";

function createProjectBackedAdapters(project, session = createSessionState()) {
  const getTrackId = () => session.getState().workspace.selectedTrackId;
  const getPatternId = () => session.getState().workspace.selectedPatternId;
  return {
    instrument: createInstrumentState(undefined, { getTrackId, projectState: project, sessionState: session }),
    pattern: createPatternState(undefined, { getPatternId, projectState: project, sessionState: session }),
    session,
  };
}

test("project state owns reusable patterns, tracks, transport, and mixer data", () => {
  const project = createProjectState();
  const snapshot = project.getState();

  assert.equal(snapshot.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(snapshot.metadata.title, "Untitled chiptune");
  assert.equal(snapshot.transport.bpm, 120);
  assert.equal(snapshot.transport.masterVolume, 0.35);
  assert.deepEqual(project.getTrack(DEFAULT_TRACK_ID).mixer, { muted: false, pan: 0, solo: false, volume: 1 });
  assert.equal(project.getPattern(DEFAULT_PATTERN_ID).steps.length, 16);
  assert.equal(project.getPattern(DEFAULT_PATTERN_ID).rootOctave, 4);
  assert.deepEqual(project.getTrack(DEFAULT_TRACK_ID).clips, []);
  assert.equal(Object.isFrozen(snapshot), true);

  project.setBpm(148);
  project.setMasterVolume(0.6);
  assert.equal(project.getState().transport.bpm, 148);
  assert.equal(project.getState().transport.masterVolume, 0.6);
});

test("session selection and playback state remain outside the persistable project", () => {
  const project = createProjectState();
  const session = createSessionState();

  session.setAudio({ status: "running" });
  session.setTransport({ status: "playing", retainedStepIndex: 3 });
  session.setTheme({ value: "light" });
  session.setWorkspace({ activeDockPanel: "instrument", playbackMode: "pattern", selectedClipId: "clip-1" });
  session.setActiveNotes(new Set([64, 60]));

  assert.deepEqual(session.getState().activeNotes, [60, 64]);
  assert.equal(session.getState().transport.status, "playing");
  assert.equal(session.getState().theme.value, "light");
  assert.equal(session.getState().workspace.playbackMode, "pattern");
  assert.equal(session.getState().workspace.activeDockPanel, "instrument");
  assert.equal("audio" in project.getState(), false);
});

test("feature state adapters write through dynamic pattern and track selections", () => {
  const project = createProjectState();
  const { instrument, pattern, session } = createProjectBackedAdapters(project);

  instrument.setVoiceType("triangle");
  pattern.setStep(0, 60);
  pattern.setVolume(0, 0.4);
  assert.equal(project.getTrack(DEFAULT_TRACK_ID).instrument.voiceType, "triangle");
  assert.deepEqual(project.getPattern(DEFAULT_PATTERN_ID).steps[0], { note: 60, gate: 0.75, volume: 0.4 });

  const secondPatternId = project.createPattern("Bass idea");
  const secondTrackId = project.addTrack("Bass");
  session.setWorkspace({ selectedPatternId: secondPatternId, selectedTrackId: secondTrackId });
  pattern.setStep(0, 36);
  instrument.setVoiceType("sawtooth");

  assert.equal(project.getPattern(DEFAULT_PATTERN_ID).steps[0].note, 60);
  assert.equal(project.getPattern(secondPatternId).steps[0].note, 36);
  assert.equal(project.getTrack(DEFAULT_TRACK_ID).instrument.voiceType, "triangle");
  assert.equal(project.getTrack(secondTrackId).instrument.voiceType, "sawtooth");
});

test("replacing a project updates selected feature projections and clears history", () => {
  const project = createProjectState();
  const { instrument, pattern } = createProjectBackedAdapters(project);
  pattern.setStep(0, 60);

  const current = project.getState();
  project.replace({
    ...current,
    patterns: current.patterns.map((candidate) => candidate.id === DEFAULT_PATTERN_ID
      ? { ...candidate, steps: [{ note: 64, gate: 0.75, volume: 0.7 }, null, null, null] }
      : candidate),
    tracks: current.tracks.map((track) => track.id === DEFAULT_TRACK_ID
      ? { ...track, instrument: { ...track.instrument, voiceType: "noise" } }
      : track),
  });

  assert.equal(instrument.getState().voiceType, "noise");
  assert.equal(pattern.getState().steps[0].note, 64);
  assert.equal(pattern.getState().length, 4);
  assert.equal(pattern.getState().canUndo, false);
});

test("a project survives JSON serialization and validates on restoration", () => {
  const original = createProjectState();
  original.setBpm(132);
  const patternId = original.duplicatePattern(DEFAULT_PATTERN_ID);
  original.addClip(DEFAULT_TRACK_ID, patternId, 16);
  const restored = createProjectState(JSON.parse(JSON.stringify(original.getState())));

  assert.deepEqual(restored.getState(), original.getState());
  assert.throws(() => createProjectState({ ...original.getState(), schemaVersion: 99 }), RangeError);
});

test("schema two projects gain a default pattern root octave", () => {
  const current = createProjectState().getState();
  const legacy = JSON.parse(JSON.stringify({
    ...current,
    schemaVersion: 2,
    patterns: current.patterns.map(({ rootOctave, ...pattern }) => pattern),
  }));
  const migrated = createProjectState(legacy);

  assert.equal(migrated.getState().schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(migrated.getPattern(DEFAULT_PATTERN_ID).rootOctave, 4);
  assert.throws(() => migrated.setPatternRootOctave(DEFAULT_PATTERN_ID, 7), RangeError);
});

test("schema four projects gain centred track panning", () => {
  const legacy = structuredClone(createProjectState().getState());
  legacy.schemaVersion = 4;
  delete legacy.tracks[0].mixer.pan;

  const migrated = createProjectState(legacy);

  assert.equal(migrated.getState().schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(migrated.getTrack(DEFAULT_TRACK_ID).mixer.pan, 0);
});

test("legacy single-track projects migrate into a pattern library and clip lane", () => {
  const legacy = {
    schemaVersion: 1,
    metadata: { title: "Legacy tune" },
    transport: { bpm: 120 },
    tracks: [{
      id: "track-1",
      name: "Pulse 1",
      instrument: {
        attackSeconds: 0.008,
        octaveOffset: 0,
        releaseSeconds: 0.03,
        voiceType: "square",
        volume: 0.35,
      },
      mixer: { muted: false, solo: false, volume: 1 },
      pattern: {
        steps: [{ note: 60, gate: 0.75, volume: 0.7 }, null, null, null],
      },
    }],
  };

  const migrated = createProjectState(legacy).getState();
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(migrated.patterns[0].steps[0].note, 60);
  assert.deepEqual(migrated.tracks[0].clips, [{ id: "clip-1", patternId: "pattern-1", startStep: 0 }]);
});

test("project history spans instrument and pattern mutations", () => {
  const project = createProjectState();
  const { instrument, pattern } = createProjectBackedAdapters(project);

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

test("project-backed range edits collapse into one history entry", () => {
  const project = createProjectState();
  const { pattern } = createProjectBackedAdapters(project);
  pattern.setStep(0, 60);
  pattern.beginHistoryGroup();
  pattern.setVolume(0, 0.6);
  pattern.setVolume(0, 0.5);
  pattern.setVolume(0, 0.4);
  pattern.endHistoryGroup();

  pattern.undo();
  assert.equal(pattern.getState().steps[0].volume, 0.7);
});

test("track pan is validated, persisted, and undoable", () => {
  const project = createProjectState();
  project.beginHistoryGroup();
  project.updateTrack(DEFAULT_TRACK_ID, (track) => ({
    ...track,
    mixer: { ...track.mixer, pan: -0.25 },
  }), { field: "mixer.pan" });
  project.updateTrack(DEFAULT_TRACK_ID, (track) => ({
    ...track,
    mixer: { ...track.mixer, pan: -0.75 },
  }), { field: "mixer.pan" });
  project.endHistoryGroup();

  assert.equal(project.getTrack(DEFAULT_TRACK_ID).mixer.pan, -0.75);
  project.undo();
  assert.equal(project.getTrack(DEFAULT_TRACK_ID).mixer.pan, 0);

  const invalid = structuredClone(project.getState());
  invalid.tracks[0].mixer.pan = 1.1;
  assert.throws(() => createProjectState(invalid), /invalid mixer/);
});
