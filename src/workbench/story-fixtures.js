import { createProjectState } from "../state/project-state.js";

const LEAD_STEPS = Object.freeze([
  { note: 60, gate: 0.5, volume: 0.82 },
  null,
  { note: 64, gate: 0.5, volume: 0.76 },
  null,
  { note: 67, gate: 0.75, volume: 0.9 },
  null,
  { note: 72, gate: 0.25, volume: 0.7 },
  null,
  { note: 67, gate: 0.5, volume: 0.8 },
  null,
  { note: 64, gate: 0.5, volume: 0.74 },
  null,
  { note: 62, gate: 0.75, volume: 0.8 },
  null,
  { note: 59, gate: 1, volume: 0.68 },
  null,
]);

const BASS_STEPS = Object.freeze(Array.from({ length: 16 }, (_, index) => (
  index % 4 === 0
    ? { note: [36, 36, 41, 43][index / 4], gate: 0.75, volume: 0.78 }
    : null
)));

export function createArrangedProject() {
  const projectState = createProjectState();
  projectState.renameProject("Neon Overpass");
  projectState.renamePattern("pattern-1", "Lead pulse");
  projectState.updatePattern("pattern-1", (pattern) => ({ ...pattern, steps: LEAD_STEPS }));
  projectState.renameTrack("track-1", "Pulse lead");
  projectState.addClip("track-1", "pattern-1", 0);
  projectState.addClip("track-1", "pattern-1", 16);

  const bassPatternId = projectState.createPattern();
  projectState.renamePattern(bassPatternId, "Bass anchors");
  projectState.updatePattern(bassPatternId, (pattern) => ({ ...pattern, steps: BASS_STEPS }));
  const bassTrackId = projectState.addTrack();
  projectState.renameTrack(bassTrackId, "Triangle bass");
  projectState.updateTrack(bassTrackId, (track) => ({
    ...track,
    instrument: { ...track.instrument, octaveOffset: -1, voiceType: "triangle", volume: 0.45 },
    mixer: { ...track.mixer, pan: -0.28 },
  }));
  projectState.addClip(bassTrackId, bassPatternId, 0);
  projectState.addClip(bassTrackId, bassPatternId, 16);
  return projectState;
}

export function createStoryScheduler({
  bpm = 120,
  mode = "arrangement",
  status = "stopped",
  stepIndex = 0,
} = {}) {
  const events = new EventTarget();
  let state = { bpm, mode, retainedStepIndex: stepIndex, status };

  function emit(detail = {}) {
    events.dispatchEvent(new CustomEvent("statechange", { detail }));
  }

  function update(values) {
    state = { ...state, ...values };
    emit();
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    getPlayheadStep: () => state.retainedStepIndex,
    getState: () => Object.freeze({ ...state }),
    getTimelineSnapshot: () => Object.freeze({
      ...state,
      audioTime: null,
      patternId: null,
      stepDurationSeconds: 60 / state.bpm / 4,
      stepIndex: state.retainedStepIndex,
      stepProgress: 0,
      trackId: null,
    }),
    pause() {
      if (state.status !== "playing") return false;
      update({ status: "paused" });
      return true;
    },
    play(nextMode = state.mode) {
      update({ mode: nextMode, status: "playing" });
      return true;
    },
    releaseInvalidOwnership: () => false,
    releaseOwnedBy: () => false,
    removeEventListener: events.removeEventListener.bind(events),
    setBpm(nextBpm) {
      update({ bpm: nextBpm });
    },
    setMode(nextMode) {
      update({ mode: nextMode });
    },
    setStartStep(nextStep) {
      update({ retainedStepIndex: nextStep });
    },
    stop() {
      update({ status: "stopped" });
      return true;
    },
  });
}

export function createStoryPersistence(projectState, {
  persistent = true,
  status = "saved",
} = {}) {
  const events = new EventTarget();
  const activeId = "workbench-project";
  const summaries = [
    { id: activeId, revision: 7, title: projectState.getState().metadata.title, updatedAt: "2026-07-27T12:00:00.000Z" },
    { id: "workbench-project-2", revision: 3, title: "Pocket Skyline", updatedAt: "2026-07-26T18:30:00.000Z" },
    { id: "workbench-project-3", revision: 12, title: "Bit Garden", updatedAt: "2026-07-24T09:15:00.000Z" },
  ];
  const emit = (type = "project") => events.dispatchEvent(new CustomEvent("change", {
    detail: Object.freeze({ type }),
  }));
  const resolve = async () => {
    emit();
    return true;
  };
  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    createProject: resolve,
    deleteProject: resolve,
    duplicateProject: resolve,
    getActiveDocument: () => Object.freeze({ id: activeId, project: projectState.getState() }),
    getExportText: () => JSON.stringify({ id: activeId, project: projectState.getState() }),
    getState: () => Object.freeze({
      error: persistent ? null : { message: "IndexedDB is unavailable in this scenario." },
      persistent,
      status: persistent ? status : "unavailable",
    }),
    hasUnsavedChanges: () => status === "unsaved",
    importProject: resolve,
    listProjects: async () => summaries,
    openProject: resolve,
    removeEventListener: events.removeEventListener.bind(events),
    saveNow: async () => true,
  });
}
