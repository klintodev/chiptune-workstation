import { getPatternEditorEndTick } from "../domain/pattern-span.js";

const PRIMARY_KIND_SET = new Set(["piano-roll", "playlist", "mixer"]);
const DEVICE_KIND_SET = new Set(["instrument", "effect"]);
const PLAYBACK_MODE_SET = new Set(["pattern", "song"]);
const PLAYLIST_SNAP_SET = new Set(["1/8", "1/16", "1/32"]);

export const PRIMARY_KINDS = Object.freeze([...PRIMARY_KIND_SET]);
export const DEVICE_KINDS = Object.freeze([...DEVICE_KIND_SET]);
export const PLAYBACK_MODES = Object.freeze([...PLAYBACK_MODE_SET]);
export const PLAYLIST_SNAPS = Object.freeze([...PLAYLIST_SNAP_SET]);
export const DEFAULT_PLAYLIST_SNAP = "1/16";
export const MASTER_CHANNEL_ID = "master";
export const SONG_END_TICK = 6_144;

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

function unwrapProject(project) {
  const snapshot = typeof project?.getState === "function" ? project.getState() : project;
  if (snapshot?.project && Array.isArray(snapshot.project.patterns)) return snapshot.project;
  return snapshot;
}

function projectDocumentId(project, fallback = "local-project") {
  const snapshot = typeof project?.getState === "function" ? project.getState() : project;
  if (typeof snapshot?.id === "string" && snapshot.id.length > 0) return snapshot.id;
  return fallback;
}

function assertProject(project) {
  const root = unwrapProject(project);
  if (!root || !Array.isArray(root.patterns) || root.patterns.length === 0) {
    throw new TypeError("A workspace requires a validated Project with at least one Pattern.");
  }
  if (!Array.isArray(root.tracks) || root.tracks.length === 0) {
    throw new TypeError("A workspace requires a validated Project with at least one Track.");
  }

  for (const [label, values] of [["Pattern", root.patterns], ["Track", root.tracks]]) {
    const ids = new Set();
    for (const value of values) {
      if (!value || typeof value.id !== "string" || value.id.length === 0 || ids.has(value.id)) {
        throw new TypeError(`Workspace received an invalid or duplicate ${label} ID.`);
      }
      ids.add(value.id);
    }
  }
  return root;
}

function clampInteger(value, minimum, maximum, fallback = minimum) {
  const candidate = Number.isInteger(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, candidate));
}

function patternLength(pattern) {
  if (Number.isInteger(pattern?.lengthTicks) && pattern.lengthTicks > 0) return pattern.lengthTicks;
  return 384;
}

function noteIds(pattern) {
  return new Set((Array.isArray(pattern?.notes) ? pattern.notes : [])
    .map((note) => note?.id)
    .filter((id) => typeof id === "string"));
}

function defaultPatternSurface(pattern, auditionTrackId) {
  const editorEndTick = getPatternEditorEndTick(pattern);
  return {
    selection: [],
    snap: DEFAULT_PLAYLIST_SNAP,
    cursor: { tick: 0, pitch: 60 },
    viewport: {
      startTick: 0,
      endTick: editorEndTick,
      lowPitch: 36,
      highPitch: 112,
    },
    auditionTrackId,
  };
}

function repairPatternSurface(surface, pattern, validTrackIds, fallbackTrackId) {
  const defaults = defaultPatternSurface(pattern, fallbackTrackId);
  const validNotes = noteIds(pattern);
  const editorEndTick = getPatternEditorEndTick(pattern);
  const maximumCursorTick = Math.max(0, editorEndTick - 1);
  const source = surface && typeof surface === "object" ? surface : defaults;
  const sourceCursor = source.cursor && typeof source.cursor === "object" ? source.cursor : defaults.cursor;
  const sourceViewport = source.viewport && typeof source.viewport === "object"
    ? source.viewport
    : defaults.viewport;
  const startTick = clampInteger(sourceViewport.startTick, 0, maximumCursorTick, 0);
  const endTick = clampInteger(sourceViewport.endTick, startTick + 1, editorEndTick, editorEndTick);
  const lowPitch = clampInteger(sourceViewport.lowPitch, 36, 112, 36);
  const highPitch = clampInteger(sourceViewport.highPitch, lowPitch, 112, 112);
  const selection = Array.isArray(source.selection)
    ? [...new Set(source.selection.filter((id) => validNotes.has(id)))]
    : [];

  return {
    selection,
    snap: PLAYLIST_SNAP_SET.has(source.snap) ? source.snap : DEFAULT_PLAYLIST_SNAP,
    cursor: {
      ...cloneValue(sourceCursor),
      tick: clampInteger(sourceCursor.tick, 0, maximumCursorTick, 0),
      pitch: clampInteger(sourceCursor.pitch, 36, 112, 60),
    },
    viewport: {
      ...cloneValue(sourceViewport),
      startTick,
      endTick,
      lowPitch,
      highPitch,
    },
    auditionTrackId: validTrackIds.has(source.auditionTrackId)
      ? source.auditionTrackId
      : fallbackTrackId,
  };
}

function allClips(project) {
  return project.tracks.flatMap((track) => (
    Array.isArray(track.clips)
      ? track.clips.map((clip) => ({ ...clip, trackId: track.id }))
      : []
  ));
}

function findDevice(project, kind, instanceId) {
  if (!DEVICE_KIND_SET.has(kind) || typeof instanceId !== "string") return null;

  if (kind === "instrument") {
    for (const track of project.tracks) {
      if (track.instrument?.instanceId === instanceId) {
        return {
          kind,
          instanceId,
          owner: { kind: "track", trackId: track.id },
          slotIndex: null,
        };
      }
    }
    return null;
  }

  for (const track of project.tracks) {
    const effects = Array.isArray(track.mixer?.effects) ? track.mixer.effects : [];
    const slotIndex = effects.findIndex((effect) => effect?.instanceId === instanceId);
    if (slotIndex >= 0) {
      return {
        kind,
        instanceId,
        owner: { kind: "track", trackId: track.id },
        slotIndex,
      };
    }
  }

  const masterEffects = Array.isArray(project.mixer?.master?.effects)
    ? project.mixer.master.effects
    : [];
  const slotIndex = masterEffects.findIndex((effect) => effect?.instanceId === instanceId);
  return slotIndex >= 0
    ? {
        kind,
        instanceId,
        owner: { kind: "master" },
        slotIndex,
      }
    : null;
}

function stateEquals(left, right) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function freezeWorkspace(candidate) {
  return deepFreeze(candidate);
}

export function createInitialWorkspaceState(project, {
  projectId = projectDocumentId(project),
  activePatternId,
  auditionTrackId,
} = {}) {
  const root = assertProject(project);
  const pattern = root.patterns.find((candidate) => candidate.id === activePatternId) ?? root.patterns[0];
  const track = root.tracks.find((candidate) => candidate.id === auditionTrackId) ?? root.tracks[0];
  return freezeWorkspace({
    projectId,
    activePrimary: "piano-roll",
    activePatternId: pattern.id,
    patternSurfaces: {
      [pattern.id]: defaultPatternSurface(pattern, track.id),
    },
    playlist: {
      cursorTick: 0,
      destinationTrackId: track.id,
      selectedClipId: null,
      selectedClipIds: [],
      snap: DEFAULT_PLAYLIST_SNAP,
    },
    mixer: { channelId: track.id },
    playback: {
      mode: "pattern",
      patternLoopEnabled: true,
      patternPlayheadTick: 0,
      songPlayheadTick: 0,
    },
    device: null,
  });
}

export function repairWorkspaceState(state, project, {
  projectId = state?.projectId ?? projectDocumentId(project),
} = {}) {
  const root = assertProject(project);
  const patternById = new Map(root.patterns.map((pattern) => [pattern.id, pattern]));
  const trackIds = new Set(root.tracks.map((track) => track.id));
  const fallbackTrackId = root.tracks[0].id;
  const requestedPatternId = typeof state?.activePatternId === "string"
    ? state.activePatternId
    : null;
  const activePattern = patternById.get(requestedPatternId) ?? root.patterns[0];
  const sourceSurfaces = state?.patternSurfaces && typeof state.patternSurfaces === "object"
    ? state.patternSurfaces
    : {};
  const patternEntries = Object.entries(sourceSurfaces)
    .filter(([patternId]) => patternById.has(patternId))
    .map(([patternId, surface]) => [
      patternId,
      repairPatternSurface(surface, patternById.get(patternId), trackIds, fallbackTrackId),
    ]);
  if (!patternEntries.some(([patternId]) => patternId === activePattern.id)) {
    patternEntries.push([
      activePattern.id,
      defaultPatternSurface(activePattern, fallbackTrackId),
    ]);
  }

  const clipIds = new Set(allClips(root).map((clip) => clip.id));
  const sourcePlaylist = state?.playlist && typeof state.playlist === "object" ? state.playlist : {};
  const selectedClipIds = [...new Set(
    (Array.isArray(sourcePlaylist.selectedClipIds) ? sourcePlaylist.selectedClipIds : [])
      .filter((clipId) => clipIds.has(clipId)),
  )];
  const selectedClipId = clipIds.has(sourcePlaylist.selectedClipId)
    ? sourcePlaylist.selectedClipId
    : selectedClipIds[0] ?? null;
  if (selectedClipId && !selectedClipIds.includes(selectedClipId)) selectedClipIds.unshift(selectedClipId);
  const sourceMixer = state?.mixer && typeof state.mixer === "object" ? state.mixer : {};
  const sourcePlayback = state?.playback && typeof state.playback === "object" ? state.playback : {};
  const activePrimary = PRIMARY_KIND_SET.has(state?.activePrimary)
    ? state.activePrimary
    : "piano-roll";
  const channelId = sourceMixer.channelId === MASTER_CHANNEL_ID || trackIds.has(sourceMixer.channelId)
    ? sourceMixer.channelId
    : fallbackTrackId;
  const repairedDevice = state?.device
    ? findDevice(root, state.device.kind, state.device.instanceId)
    : null;

  const candidate = {
    projectId,
    activePrimary,
    activePatternId: activePattern.id,
    patternSurfaces: Object.fromEntries(patternEntries),
    playlist: {
      cursorTick: clampInteger(sourcePlaylist.cursorTick, 0, SONG_END_TICK, 0),
      destinationTrackId: trackIds.has(sourcePlaylist.destinationTrackId)
        ? sourcePlaylist.destinationTrackId
        : fallbackTrackId,
      selectedClipId,
      selectedClipIds,
      snap: PLAYLIST_SNAP_SET.has(sourcePlaylist.snap)
        ? sourcePlaylist.snap
        : DEFAULT_PLAYLIST_SNAP,
    },
    mixer: {
      ...cloneValue(sourceMixer),
      channelId,
    },
    playback: {
      ...cloneValue(sourcePlayback),
      mode: PLAYBACK_MODE_SET.has(sourcePlayback.mode) ? sourcePlayback.mode : "pattern",
      patternLoopEnabled: sourcePlayback.patternLoopEnabled !== false,
      patternPlayheadTick: clampInteger(
        sourcePlayback.patternPlayheadTick,
        0,
        patternLength(activePattern),
        0,
      ),
      songPlayheadTick: clampInteger(sourcePlayback.songPlayheadTick, 0, SONG_END_TICK, 0),
    },
    device: repairedDevice,
  };
  const frozen = freezeWorkspace(candidate);
  return stateEquals(state, frozen) ? state : frozen;
}

function activatePrimary(state, action, project) {
  const kind = action.kind;
  if (!PRIMARY_KIND_SET.has(kind)) throw new RangeError(`Unknown primary surface: ${kind}`);
  const root = assertProject(project);
  let activePatternId = state.activePatternId;
  const requestedPatternId = kind === "piano-roll" ? action.patternId ?? activePatternId : null;
  if (kind === state.activePrimary && (kind !== "piano-roll" || requestedPatternId === activePatternId)) {
    return state;
  }
  let patternSurfaces = state.patternSurfaces;

  if (kind === "piano-roll") {
    const pattern = root.patterns.find((candidate) => candidate.id === (action.patternId ?? activePatternId));
    if (!pattern) throw new RangeError(`Unknown Pattern: ${action.patternId}`);
    activePatternId = pattern.id;
    if (!patternSurfaces[pattern.id]) {
      const trackIds = new Set(root.tracks.map((track) => track.id));
      const previousTrackId = state.patternSurfaces[state.activePatternId]?.auditionTrackId;
      const requestedTrackId = action.auditionTrackId;
      const auditionTrackId = trackIds.has(requestedTrackId)
        ? requestedTrackId
        : trackIds.has(previousTrackId)
          ? previousTrackId
          : state.mixer.channelId !== MASTER_CHANNEL_ID && trackIds.has(state.mixer.channelId)
            ? state.mixer.channelId
            : root.tracks[0].id;
      patternSurfaces = {
        ...patternSurfaces,
        [pattern.id]: defaultPatternSurface(pattern, auditionTrackId),
      };
    }
  }

  const next = {
    ...state,
    activePrimary: kind,
    activePatternId,
    patternSurfaces,
  };
  if (kind === "mixer" || state.activePrimary === "mixer") next.device = null;
  return repairWorkspaceState(next, root);
}

function updatePatternSurface(state, action, project) {
  const root = assertProject(project);
  const pattern = root.patterns.find((candidate) => candidate.id === action.patternId);
  if (!pattern) throw new RangeError(`Unknown Pattern: ${action.patternId}`);
  const trackIds = new Set(root.tracks.map((track) => track.id));
  const existing = state.patternSurfaces[action.patternId]
    ?? defaultPatternSurface(pattern, root.tracks[0].id);
  const patch = action.patch && typeof action.patch === "object" ? action.patch : {};
  const candidate = {
    ...existing,
    ...cloneValue(patch),
    selection: "selection" in patch ? cloneValue(patch.selection) : existing.selection,
    cursor: patch.cursor ? { ...existing.cursor, ...cloneValue(patch.cursor) } : existing.cursor,
    viewport: patch.viewport
      ? { ...existing.viewport, ...cloneValue(patch.viewport) }
      : existing.viewport,
  };
  const repaired = repairPatternSurface(candidate, pattern, trackIds, root.tracks[0].id);
  const next = {
    ...state,
    patternSurfaces: { ...state.patternSurfaces, [action.patternId]: repaired },
  };
  return repairWorkspaceState(next, root);
}

export function reduceWorkspaceState(state, action, project) {
  if (!state || typeof state !== "object") throw new TypeError("Workspace state is required.");
  if (!action || typeof action.type !== "string") throw new TypeError("Workspace action is required.");
  const root = assertProject(project);

  switch (action.type) {
    case "primary/activate":
      return activatePrimary(state, action, root);
    case "primary/interact":
      return state;
    case "pattern/set-active": {
      if (action.patternId === state.activePatternId) return state;
      const pattern = root.patterns.find((candidate) => candidate.id === action.patternId);
      if (!pattern) throw new RangeError(`Unknown Pattern: ${action.patternId}`);
      let patternSurfaces = state.patternSurfaces;
      if (!patternSurfaces[pattern.id]) {
        const trackIds = new Set(root.tracks.map((track) => track.id));
        const previousTrackId = state.patternSurfaces[state.activePatternId]?.auditionTrackId;
        const auditionTrackId = trackIds.has(action.auditionTrackId)
          ? action.auditionTrackId
          : trackIds.has(previousTrackId)
            ? previousTrackId
            : root.tracks[0].id;
        patternSurfaces = {
          ...patternSurfaces,
          [pattern.id]: defaultPatternSurface(pattern, auditionTrackId),
        };
      }
      return repairWorkspaceState({
        ...state,
        activePatternId: pattern.id,
        patternSurfaces,
        device: state.device,
      }, root);
    }
    case "pattern/update":
      return updatePatternSurface(state, action, root);
    case "pattern/open-from-clip": {
      const clip = allClips(root).find((candidate) => candidate.id === action.clipId);
      if (!clip) throw new RangeError(`Unknown clip: ${action.clipId}`);
      const activated = activatePrimary(state, {
        type: "primary/activate",
        kind: "piano-roll",
        patternId: clip.patternId,
      }, root);
      return updatePatternSurface(activated, {
        type: "pattern/update",
        patternId: clip.patternId,
        patch: { auditionTrackId: clip.trackId },
      }, root);
    }
    case "playlist/update": {
      const patch = action.patch && typeof action.patch === "object" ? cloneValue(action.patch) : {};
      const hasPrimary = Object.hasOwn(patch, "selectedClipId");
      const hasSelection = Object.hasOwn(patch, "selectedClipIds");
      if (hasPrimary && !hasSelection) {
        patch.selectedClipIds = patch.selectedClipId ? [patch.selectedClipId] : [];
      } else if (hasSelection && !hasPrimary) {
        patch.selectedClipId = Array.isArray(patch.selectedClipIds)
          ? patch.selectedClipIds.find((clipId) => typeof clipId === "string") ?? null
          : null;
      }
      return repairWorkspaceState({
        ...state,
        playlist: { ...state.playlist, ...patch },
      }, root);
    }
    case "mixer/select-channel":
      return repairWorkspaceState({
        ...state,
        mixer: { ...state.mixer, channelId: action.channelId },
      }, root);
    case "mixer/update": {
      const patch = action.patch && typeof action.patch === "object" ? cloneValue(action.patch) : {};
      return repairWorkspaceState({
        ...state,
        mixer: { ...state.mixer, ...patch },
      }, root);
    }
    case "playback/update": {
      const patch = action.patch && typeof action.patch === "object" ? cloneValue(action.patch) : {};
      return repairWorkspaceState({
        ...state,
        playback: { ...state.playback, ...patch },
      }, root);
    }
    case "playback/seek-song":
      return repairWorkspaceState({
        ...state,
        playlist: { ...state.playlist, cursorTick: action.tick },
        playback: { ...state.playback, songPlayheadTick: action.tick },
      }, root);
    case "device/open": {
      const descriptor = findDevice(root, action.kind, action.instanceId);
      if (!descriptor) throw new RangeError(`Unknown ${action.kind} device: ${action.instanceId}`);
      const next = freezeWorkspace({ ...state, device: descriptor });
      return stateEquals(state, next) ? state : next;
    }
    case "device/close":
      return state.device === null ? state : freezeWorkspace({ ...state, device: null });
    case "lifecycle/repair":
      return repairWorkspaceState(state, root, { projectId: action.projectId ?? state.projectId });
    default:
      throw new RangeError(`Unknown workspace action: ${action.type}`);
  }
}

function notifyListener(listener, event) {
  if (typeof listener === "function") listener(event);
  else listener?.handleEvent?.(event);
}

export function createWorkspaceState(project, {
  projectId = projectDocumentId(project),
  validateProject,
  activePatternId,
  auditionTrackId,
} = {}) {
  let projectSource = project;
  let currentProjectId = projectId;
  let disposed = false;
  const listeners = new Set();

  function validatedSnapshot(source) {
    const snapshot = typeof source?.getState === "function" ? source.getState() : source;
    const validated = typeof validateProject === "function" ? validateProject(snapshot) : snapshot;
    return assertProject(validated ?? snapshot);
  }

  let state = createInitialWorkspaceState(validatedSnapshot(projectSource), {
    projectId: currentProjectId,
    activePatternId,
    auditionTrackId,
  });

  function emit(action, previousState) {
    const event = Object.freeze({
      type: "change",
      detail: Object.freeze({ action, previousState, state }),
    });
    for (const listener of [...listeners]) notifyListener(listener, event);
  }

  function commit(next, action) {
    if (next === state) return false;
    const previousState = state;
    state = next;
    emit(action, previousState);
    return true;
  }

  function dispatch(action) {
    if (disposed) return false;
    const root = validatedSnapshot(projectSource);
    return commit(reduceWorkspaceState(state, action, root), action);
  }

  function resetProject(nextProject, mode, options = {}) {
    if (disposed) return false;
    const root = validatedSnapshot(nextProject);
    const nextProjectId = options.projectId ?? projectDocumentId(nextProject, currentProjectId);
    const preferredPatternId = mode === "reload"
      ? options.activePatternId ?? state.activePatternId
      : options.activePatternId;
    const next = createInitialWorkspaceState(root, {
      projectId: nextProjectId,
      activePatternId: preferredPatternId,
      auditionTrackId: options.auditionTrackId,
    });
    projectSource = nextProject;
    currentProjectId = nextProjectId;
    return commit(next, Object.freeze({ type: `project/${mode}`, projectId: nextProjectId }));
  }

  function repairProject(nextProject = projectSource, options = {}) {
    if (disposed) return false;
    const root = validatedSnapshot(nextProject);
    const nextProjectId = options.projectId ?? currentProjectId;
    const next = repairWorkspaceState(state, root, { projectId: nextProjectId });
    projectSource = nextProject;
    currentProjectId = nextProjectId;
    return commit(next, Object.freeze({ type: options.reason ?? "project/repair" }));
  }

  const api = {
    addEventListener(type, listener) {
      if (type === "change" && listener) listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "change") listeners.delete(listener);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    dispatch,
    activatePrimary(kind, options = {}) {
      return dispatch({ type: "primary/activate", kind, ...options });
    },
    activatePianoRoll(patternId = state.activePatternId, options = {}) {
      return dispatch({
        type: "primary/activate",
        kind: "piano-roll",
        patternId,
        ...options,
      });
    },
    openPianoRoll(patternId = state.activePatternId, options = {}) {
      return api.activatePianoRoll(patternId, options);
    },
    activatePlaylist() {
      return dispatch({ type: "primary/activate", kind: "playlist" });
    },
    activateMixer() {
      return dispatch({ type: "primary/activate", kind: "mixer" });
    },
    interactWithPrimary() {
      return dispatch({ type: "primary/interact" });
    },
    openPatternFromClip(clipId) {
      return dispatch({ type: "pattern/open-from-clip", clipId });
    },
    setActivePattern(patternId, options = {}) {
      return dispatch({ type: "pattern/set-active", patternId, ...options });
    },
    updatePatternSurface(patternId, patch) {
      return dispatch({ type: "pattern/update", patternId, patch });
    },
    setPatternSelection(patternId, selection) {
      return api.updatePatternSurface(patternId, { selection });
    },
    setPatternCursor(patternId, cursor) {
      return api.updatePatternSurface(patternId, { cursor });
    },
    setPatternViewport(patternId, viewport) {
      return api.updatePatternSurface(patternId, { viewport });
    },
    setAuditionTrack(patternId, auditionTrackId) {
      return api.updatePatternSurface(patternId, { auditionTrackId });
    },
    setPlaylist(patch) {
      return dispatch({ type: "playlist/update", patch });
    },
    selectMixerChannel(channelId) {
      return dispatch({ type: "mixer/select-channel", channelId });
    },
    setMixer(patch) {
      return dispatch({ type: "mixer/update", patch });
    },
    setPlayback(patch) {
      return dispatch({ type: "playback/update", patch });
    },
    setPlaybackMode(mode) {
      return api.setPlayback({ mode });
    },
    setPatternPlayhead(tick) {
      return api.setPlayback({ patternPlayheadTick: tick });
    },
    setSongPlayhead(tick) {
      return api.setPlayback({ songPlayheadTick: tick });
    },
    seekSong(tick) {
      return dispatch({ type: "playback/seek-song", tick });
    },
    openDevice(kind, instanceId) {
      return dispatch({ type: "device/open", kind, instanceId });
    },
    closeDevice() {
      return dispatch({ type: "device/close" });
    },
    newProject(nextProject, options = {}) {
      return resetProject(nextProject, "new", options);
    },
    reload(nextProject = projectSource, options = {}) {
      return resetProject(nextProject, "reload", options);
    },
    replaceProject(nextProject, options = {}) {
      return resetProject(nextProject, "replace", options);
    },
    reset(nextProject, options = {}) {
      return resetProject(nextProject, "replace", options);
    },
    repair(nextProject = projectSource, options = {}) {
      return repairProject(nextProject, options);
    },
    repairProject,
    repairAfterTrackChange(nextProject = projectSource) {
      return repairProject(nextProject, { reason: "track/repair" });
    },
    repairAfterPatternChange(nextProject = projectSource) {
      return repairProject(nextProject, { reason: "pattern/repair" });
    },
    repairAfterClipChange(nextProject = projectSource) {
      return repairProject(nextProject, { reason: "clip/repair" });
    },
    repairAfterEffectChange(nextProject = projectSource) {
      return repairProject(nextProject, { reason: "effect/repair" });
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      listeners.clear();
      return true;
    },
  };

  return Object.freeze(api);
}
