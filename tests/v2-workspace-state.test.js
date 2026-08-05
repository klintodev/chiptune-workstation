import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialWorkspaceState,
  createWorkspaceState,
  reduceWorkspaceState,
  repairWorkspaceState,
} from "../src/v2/state/workspace-state.js";

function createProject({ id = "project-a" } = {}) {
  return {
    id,
    schemaVersion: 7,
    patterns: [
      {
        id: "pattern-1",
        name: "Pattern 1",
        lengthTicks: 384,
        notes: [{ id: "note-1", pitch: 60, startTick: 0, durationTicks: 24, velocity: 0.8 }],
      },
      {
        id: "pattern-2",
        name: "Pattern 2",
        lengthTicks: 192,
        notes: [{ id: "note-2", pitch: 64, startTick: 24, durationTicks: 24, velocity: 0.7 }],
      },
    ],
    tracks: [
      {
        id: "track-1",
        instrument: { instanceId: "instrument-1" },
        mixer: {
          effects: [{ instanceId: "effect-1", type: "klinto-filter" }],
        },
        clips: [{ id: "clip-1", patternId: "pattern-1", startTick: 0 }],
      },
      {
        id: "track-2",
        instrument: { instanceId: "instrument-2" },
        mixer: {
          effects: [
            { instanceId: "effect-2", type: "klinto-filter" },
            { instanceId: "effect-3", type: "klinto-delay" },
          ],
        },
        clips: [{ id: "clip-2", patternId: "pattern-2", startTick: 384 }],
      },
    ],
    mixer: {
      master: { effects: [{ instanceId: "effect-master", type: "klinto-delay" }] },
    },
  };
}

test("initial workspace is deeply immutable, safe, and separate from Project JSON", () => {
  const project = createProject();
  const projectJson = JSON.stringify(project);
  const state = createInitialWorkspaceState(project);

  assert.equal(state.activePrimary, "piano-roll");
  assert.equal(state.activePatternId, "pattern-1");
  assert.equal(state.patternSurfaces["pattern-1"].auditionTrackId, "track-1");
  assert.deepEqual(state.playlist, {
    cursorTick: 0,
    destinationTrackId: "track-1",
    selectedClipId: null,
    snap: "1/16",
  });
  assert.deepEqual(state.mixer, { channelId: "track-1" });
  assert.deepEqual(state.playback, {
    mode: "pattern",
    patternPlayheadTick: 0,
    songPlayheadTick: 0,
  });
  assert.equal(state.device, null);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.patternSurfaces["pattern-1"].viewport), true);
  assert.throws(() => state.patternSurfaces["pattern-1"].selection.push("note-1"), TypeError);
  assert.equal(JSON.stringify(project), projectJson);
  assert.equal("workspace" in project, false);
});

test("Pattern identities retain independent selection, cursor, viewport, and audition Track", () => {
  const project = createProject();
  const workspace = createWorkspaceState(project);
  workspace.updatePatternSurface("pattern-1", {
    selection: ["note-1"],
    cursor: { tick: 48, pitch: 67 },
    viewport: { startTick: 24, endTick: 216, lowPitch: 48, highPitch: 84 },
    auditionTrackId: "track-2",
  });
  workspace.activatePianoRoll("pattern-2");
  workspace.updatePatternSurface("pattern-2", {
    selection: ["note-2"],
    cursor: { tick: 24, pitch: 64 },
  });
  workspace.openDevice("instrument", "instrument-2");

  assert.equal(workspace.activatePianoRoll("pattern-2"), false);
  assert.equal(workspace.getState().device.instanceId, "instrument-2");
  workspace.activatePlaylist();
  assert.equal(workspace.getState().device.instanceId, "instrument-2");
  workspace.activatePianoRoll("pattern-1");
  assert.equal(workspace.getState().device.instanceId, "instrument-2");
  workspace.activateMixer();
  assert.equal(workspace.getState().device, null);
  workspace.activatePianoRoll("pattern-1");

  assert.deepEqual(workspace.getState().patternSurfaces["pattern-1"], {
    selection: ["note-1"],
    snap: "1/16",
    cursor: { tick: 48, pitch: 67 },
    viewport: { startTick: 24, endTick: 216, lowPitch: 48, highPitch: 84 },
    auditionTrackId: "track-2",
  });
  assert.deepEqual(workspace.getState().patternSurfaces["pattern-2"].selection, ["note-2"]);
});

test("opening a Playlist clip explicitly changes audition Track while ordinary return preserves it", () => {
  const project = createProject();
  const initial = createInitialWorkspaceState(project);
  const changed = reduceWorkspaceState(initial, {
    type: "pattern/open-from-clip",
    clipId: "clip-2",
  }, project);

  assert.equal(changed.activePrimary, "piano-roll");
  assert.equal(changed.activePatternId, "pattern-2");
  assert.equal(changed.patternSurfaces["pattern-2"].auditionTrackId, "track-2");
  const playlist = reduceWorkspaceState(changed, {
    type: "primary/activate",
    kind: "playlist",
  }, project);
  const returned = reduceWorkspaceState(playlist, {
    type: "primary/activate",
    kind: "piano-roll",
    patternId: "pattern-2",
  }, project);
  assert.equal(returned.patternSurfaces["pattern-2"].auditionTrackId, "track-2");
});

test("Track removal repairs every dependent transient reference without closing Pattern state", () => {
  const project = createProject();
  const workspace = createWorkspaceState(project);
  workspace.activatePianoRoll("pattern-2", { auditionTrackId: "track-2" });
  workspace.updatePatternSurface("pattern-2", {
    selection: ["note-2"],
    cursor: { tick: 48, pitch: 72 },
    viewport: { startTick: 24, endTick: 168, lowPitch: 48, highPitch: 90 },
    auditionTrackId: "track-2",
  });
  workspace.setPlaylist({
    selectedClipId: "clip-2",
    cursorTick: 576,
    destinationTrackId: "track-2",
    snap: "1/32",
  });
  workspace.selectMixerChannel("track-2");
  workspace.openDevice("instrument", "instrument-2");

  const nextProject = structuredClone(project);
  nextProject.tracks = nextProject.tracks.filter((track) => track.id !== "track-2");
  workspace.repairAfterTrackChange(nextProject);
  const state = workspace.getState();

  assert.equal(state.device, null);
  assert.equal(state.mixer.channelId, "track-1");
  assert.equal(state.playlist.selectedClipId, null);
  assert.equal(state.playlist.destinationTrackId, "track-1");
  assert.equal(state.patternSurfaces["pattern-2"].auditionTrackId, "track-1");
  assert.deepEqual(state.patternSurfaces["pattern-2"].selection, ["note-2"]);
  assert.equal(state.patternSurfaces["pattern-2"].cursor.tick, 48);
  assert.equal(state.patternSurfaces["pattern-2"].viewport.startTick, 24);
});

test("Pattern and note repair closes only missing Pattern sessions and filters invalid editor state", () => {
  const project = createProject();
  const workspace = createWorkspaceState(project);
  workspace.activatePianoRoll("pattern-2");
  workspace.updatePatternSurface("pattern-2", {
    selection: ["note-2", "missing-note"],
    cursor: { tick: 180, pitch: 112 },
  });

  const resized = structuredClone(project);
  resized.patterns[1].lengthTicks = 96;
  resized.patterns[1].notes = [];
  workspace.repairAfterPatternChange(resized);
  assert.deepEqual(workspace.getState().patternSurfaces["pattern-2"].selection, []);
  assert.equal(workspace.getState().patternSurfaces["pattern-2"].cursor.tick, 95);

  const removed = structuredClone(resized);
  removed.patterns = removed.patterns.filter((pattern) => pattern.id !== "pattern-2");
  workspace.repairAfterPatternChange(removed);
  assert.equal(workspace.getState().activePatternId, "pattern-1");
  assert.equal("pattern-2" in workspace.getState().patternSurfaces, false);

  removed.patterns.push(resized.patterns[1]);
  workspace.repairAfterPatternChange(removed);
  assert.equal("pattern-2" in workspace.getState().patternSurfaces, false);
});

test("clip, Effect, Mixer, and transport state repair by stable identity", () => {
  const project = createProject();
  const workspace = createWorkspaceState(project);
  workspace.setPlaylist({ cursorTick: 500, selectedClipId: "clip-2", snap: "1/8" });
  workspace.selectMixerChannel("master");
  workspace.setPlayback({ mode: "song", patternPlayheadTick: 999, songPlayheadTick: 7_000 });
  workspace.openDevice("effect", "effect-3");

  const reordered = structuredClone(project);
  reordered.tracks[1].mixer.effects.reverse();
  workspace.repairAfterEffectChange(reordered);
  assert.equal(workspace.getState().device.instanceId, "effect-3");
  assert.equal(workspace.getState().device.slotIndex, 0);
  assert.equal(workspace.getState().mixer.channelId, "master");
  assert.equal(workspace.getState().playback.patternPlayheadTick, 384);
  assert.equal(workspace.getState().playback.songPlayheadTick, 6_144);

  reordered.tracks[1].mixer.effects = reordered.tracks[1].mixer.effects
    .filter((effect) => effect.instanceId !== "effect-3");
  reordered.tracks[1].clips = [];
  workspace.repairAfterEffectChange(reordered);
  assert.equal(workspace.getState().device, null);
  assert.equal(workspace.getState().playlist.selectedClipId, null);

  workspace.seekSong(240);
  assert.equal(workspace.getState().playlist.cursorTick, 240);
  assert.equal(workspace.getState().playback.songPlayheadTick, 240);
});

test("reload, replacement, and new-Project lifecycle reset to one safe Piano Roll", () => {
  const project = createProject();
  let validations = 0;
  const workspace = createWorkspaceState(project, {
    validateProject(candidate) {
      validations += 1;
      if (candidate.metadata?.title === "invalid") throw new Error("invalid Project");
      return candidate;
    },
  });
  workspace.activatePianoRoll("pattern-2");
  workspace.setPatternCursor("pattern-2", { tick: 72, pitch: 70 });
  workspace.openDevice("effect", "effect-master");
  workspace.setPlaybackMode("song");

  workspace.reload();
  assert.equal(workspace.getState().activePatternId, "pattern-2");
  assert.equal(workspace.getState().activePrimary, "piano-roll");
  assert.deepEqual(Object.keys(workspace.getState().patternSurfaces), ["pattern-2"]);
  assert.equal(workspace.getState().patternSurfaces["pattern-2"].cursor.tick, 0);
  assert.equal(workspace.getState().device, null);
  assert.equal(workspace.getState().playback.mode, "pattern");

  const replacement = createProject({ id: "project-b" });
  replacement.patterns[0].id = "replacement-pattern";
  replacement.tracks[0].clips[0].patternId = "replacement-pattern";
  workspace.replaceProject(replacement);
  assert.equal(workspace.getState().projectId, "project-b");
  assert.equal(workspace.getState().activePatternId, "replacement-pattern");

  const beforeFailure = workspace.getState();
  assert.throws(() => workspace.replaceProject({ ...replacement, metadata: { title: "invalid" } }));
  assert.equal(workspace.getState(), beforeFailure);

  workspace.newProject(project);
  assert.equal(workspace.getState().activePatternId, "pattern-1");
  assert.ok(validations >= 4);
});

test("repairWorkspaceState rejects structurally unsafe Projects before changing state", () => {
  const project = createProject();
  const state = createInitialWorkspaceState(project);
  assert.throws(() => repairWorkspaceState(state, { patterns: [], tracks: [] }), /at least one Pattern/);
  assert.throws(
    () => repairWorkspaceState(state, { patterns: project.patterns, tracks: [] }),
    /at least one Track/,
  );
});
test("snap and Playlist destination use canonical repaired workspace keys", () => {
  const project = createProject();
  const workspace = createWorkspaceState(project);

  workspace.updatePatternSurface("pattern-1", { snap: "1/8", snapTicks: 48 });
  workspace.setPlaylist({ destinationTrackId: "track-2", snap: "1/32", snapTicks: 12 });
  let state = workspace.getState();
  assert.equal(state.patternSurfaces["pattern-1"].snap, "1/8");
  assert.equal("snapTicks" in state.patternSurfaces["pattern-1"], false);
  assert.equal(state.playlist.destinationTrackId, "track-2");
  assert.equal(state.playlist.snap, "1/32");
  assert.equal("snapTicks" in state.playlist, false);

  const removedTrack = structuredClone(project);
  removedTrack.tracks = removedTrack.tracks.filter(({ id }) => id !== "track-2");
  workspace.repairAfterTrackChange(removedTrack);
  state = workspace.getState();
  assert.equal(state.playlist.destinationTrackId, "track-1");
  assert.equal(state.playlist.snap, "1/32");
});