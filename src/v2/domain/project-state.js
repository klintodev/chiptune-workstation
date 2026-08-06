import {
  DEFAULT_SNAP_TICKS,
  MAX_ARRANGEMENT_TICKS,
  MAX_EFFECTS_PER_CHAIN,
  MAX_PATTERN_NAME_LENGTH,
  MAX_PROJECT_HISTORY,
  MAX_PROJECT_PATTERNS,
  MAX_PROJECT_TRACKS,
  MAX_TRACK_NAME_LENGTH,
  SNAP_TICKS,
} from "./constants.js";
import {
  createDefaultEffectInstance,
  createDefaultInstrumentInstance,
  getEffectContract,
  KLINTO_CHIP_CONTRACT,
} from "./device-contracts.js";
import {
  V2DomainError,
  assertBoolean,
  assertFiniteNumber,
  assertInteger,
  assertName,
  createBoundedUniqueName,
  deepFreeze,
  nextDomainId,
  rangesOverlap,
} from "./domain-utils.js";
import { normalizeV2Project } from "./migration.js";
import {
  createDefaultV2Project,
  getV2ArrangementEndTick,
} from "./project-schema.js";
import { derivePatternLengthTicks, EMPTY_PATTERN_LENGTH_TICKS } from "./pattern-span.js";

function projectsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function findPattern(project, patternId) {
  const pattern = project.patterns.find((candidate) => candidate.id === patternId);
  if (!pattern) throw new RangeError(`Unknown Pattern: ${patternId}.`);
  return pattern;
}

function findTrack(project, trackId) {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new RangeError(`Unknown Track: ${trackId}.`);
  return track;
}

function findClip(project, clipId) {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { clip, track };
  }
  throw new RangeError(`Unknown clip: ${clipId}.`);
}

function findEffect(project, instanceId) {
  for (const track of project.tracks) {
    const index = track.mixer.effects.findIndex((effect) => effect.instanceId === instanceId);
    if (index !== -1) return { effect: track.mixer.effects[index], index, scope: "track", track };
  }
  const index = project.mixer.master.effects.findIndex((effect) => effect.instanceId === instanceId);
  if (index !== -1) return { effect: project.mixer.master.effects[index], index, scope: "master", track: null };
  throw new RangeError(`Unknown Effect: ${instanceId}.`);
}

function resolveEffectOwner(project, owner) {
  if (owner === "master" || owner?.scope === "master" || owner?.master === true) {
    return { scope: "master", track: null, effects: project.mixer.master.effects };
  }
  const trackId = typeof owner === "string" ? owner : owner?.trackId;
  const track = findTrack(project, trackId);
  return { scope: "track", track, effects: track.mixer.effects };
}

function replaceEffectChain(project, owner, effects) {
  if (owner.scope === "master") {
    return { ...project, mixer: { master: { ...project.mixer.master, effects } } };
  }
  return {
    ...project,
    tracks: project.tracks.map((track) => track.id === owner.track.id
      ? { ...track, mixer: { ...track.mixer, effects } }
      : track),
  };
}

function updateEffectById(project, instanceId, update) {
  const found = findEffect(project, instanceId);
  const effects = found.scope === "master" ? project.mixer.master.effects : found.track.mixer.effects;
  return replaceEffectChain(project, found, effects.map((effect) => effect.instanceId === instanceId ? update(effect) : effect));
}

function getInstanceIds(project) {
  return new Set([
    ...project.tracks.map((track) => track.instrument.instanceId),
    ...project.tracks.flatMap((track) => track.mixer.effects.map((effect) => effect.instanceId)),
    ...project.mixer.master.effects.map((effect) => effect.instanceId),
  ]);
}

function canPlaceClip(project, trackId, patternId, startTick, ignoredClipId = null, lengthOverride = null) {
  const track = findTrack(project, trackId);
  const pattern = findPattern(project, patternId);
  if (!Number.isInteger(startTick) || startTick < 0) return false;
  const lengthTicks = lengthOverride ?? pattern.lengthTicks;
  const endTick = startTick + lengthTicks;
  if (endTick > MAX_ARRANGEMENT_TICKS) return false;
  const patternsById = new Map(project.patterns.map((candidate) => [candidate.id, candidate]));
  return track.clips.every((clip) => {
    if (clip.id === ignoredClipId) return true;
    const clipEnd = clip.startTick + patternsById.get(clip.patternId).lengthTicks;
    return !rangesOverlap(startTick, endTick, clip.startTick, clipEnd);
  });
}

function synchronizeArrangementLoop(project) {
  const loop = project.transport.loop;
  if (!loop.enabled || loop.mode !== "arrangement") return project;
  const arrangementEndTick = getV2ArrangementEndTick(project);
  const nextLoop = arrangementEndTick > 0
    ? { enabled: true, mode: "arrangement", startTick: 0, endTick: arrangementEndTick }
    : { enabled: false, mode: "arrangement", startTick: 0, endTick: loop.endTick };
  if (
    loop.enabled === nextLoop.enabled
    && loop.mode === nextLoop.mode
    && loop.startTick === nextLoop.startTick
    && loop.endTick === nextLoop.endTick
  ) return project;
  return { ...project, transport: { ...project.transport, loop: nextLoop } };
}

function trimCommandName(name, label, maximumLength) {
  if (typeof name !== "string") throw new TypeError(`${label} must be text.`);
  const result = name.trim();
  assertName(result, label, maximumLength);
  return result;
}

function normalizeNoteIds(noteIds) {
  if (typeof noteIds === "string") return [noteIds];
  if (!noteIds || typeof noteIds[Symbol.iterator] !== "function") {
    throw new TypeError("Note identifiers must be iterable.");
  }
  return [...new Set(noteIds)];
}

export function createV2ProjectState(initialProject = createDefaultV2Project()) {
  const events = new EventTarget();
  const past = [];
  const future = [];
  let historyGroupActive = false;
  let groupedHistoryRecorded = false;
  let state = normalizeV2Project(initialProject);

  function getState() {
    return state;
  }

  function getHistoryState() {
    return deepFreeze({ canUndo: past.length > 0, canRedo: future.length > 0 });
  }

  function emitChange(detail = {}) {
    events.dispatchEvent(new CustomEvent("change", {
      detail: deepFreeze({ ...getHistoryState(), state, ...detail }),
    }));
  }

  function retainPast(snapshot) {
    past.push(snapshot);
    if (past.length > MAX_PROJECT_HISTORY) past.shift();
  }

  function commit(candidate, detail = {}) {
    const nextState = normalizeV2Project(synchronizeArrangementLoop(candidate));
    if (projectsEqual(state, nextState)) return false;
    if (!historyGroupActive || !groupedHistoryRecorded) {
      retainPast(state);
      groupedHistoryRecorded = historyGroupActive;
    }
    future.length = 0;
    state = nextState;
    emitChange({
      ...detail,
      committed: !historyGroupActive,
      transient: historyGroupActive,
    });
    return true;
  }

  function replace(candidate, detail = {}) {
    const nextState = normalizeV2Project(candidate);
    state = nextState;
    past.length = 0;
    future.length = 0;
    closeHistoryGroup(false);
    emitChange({ operation: "replace", ...detail });
    return true;
  }

  function getPattern(patternId = state.patterns[0].id) {
    return findPattern(state, patternId);
  }

  function getTrack(trackId = state.tracks[0].id) {
    return findTrack(state, trackId);
  }

  function getClip(clipId) {
    const found = findClip(state, clipId);
    return deepFreeze({ clip: found.clip, track: found.track });
  }

  function getEffect(instanceId) {
    const found = findEffect(state, instanceId);
    return deepFreeze({ effect: found.effect, index: found.index, scope: found.scope, track: found.track });
  }

  function updatePattern(patternId, update, detail = {}) {
    const pattern = getPattern(patternId);
    const updatedPattern = update(pattern);
    const nextPattern = updatedPattern === pattern ? pattern : {
      ...updatedPattern,
      lengthTicks: derivePatternLengthTicks(updatedPattern.notes),
    };
    if (nextPattern === pattern) return false;
    if (nextPattern.lengthTicks > pattern.lengthTicks) {
      for (const track of state.tracks) {
        for (const clip of track.clips.filter((candidate) => candidate.patternId === patternId)) {
          if (!canPlaceClip(state, track.id, patternId, clip.startTick, clip.id, nextPattern.lengthTicks)) {
            throw new V2DomainError(
              `The Pattern cannot grow because linked clip ${clip.id} would overlap another clip or exceed the song boundary.`,
              "PATTERN_CONTENT_CLIP_CONFLICT",
              { clipId: clip.id, patternId, trackId: track.id },
            );
          }
        }
      }
    }
    return commit({
      ...state,
      patterns: state.patterns.map((candidate) => candidate.id === patternId ? nextPattern : candidate),
    }, { patternId, ...detail });
  }

  function updateTrack(trackId, update, detail = {}) {
    const track = getTrack(trackId);
    const nextTrack = update(track);
    if (nextTrack === track) return false;
    return commit({
      ...state,
      tracks: state.tracks.map((candidate) => candidate.id === trackId ? nextTrack : candidate),
    }, { trackId, ...detail });
  }

  function createPattern(name) {
    if (state.patterns.length >= MAX_PROJECT_PATTERNS) {
      throw new RangeError(`A Project supports at most ${MAX_PROJECT_PATTERNS} Patterns.`);
    }
    const ids = new Set(state.patterns.map((pattern) => pattern.id));
    const id = nextDomainId("pattern", ids);
    const resolvedName = createBoundedUniqueName(name, state.patterns.map((pattern) => pattern.name), {
      fallback: `Pattern ${state.patterns.length + 1}`,
      maximumLength: MAX_PATTERN_NAME_LENGTH,
    });
    commit({
      ...state,
      patterns: [...state.patterns, {
        id,
        name: resolvedName,
        lengthTicks: EMPTY_PATTERN_LENGTH_TICKS,
        notes: [],
      }],
    }, { operation: "create-pattern", patternId: id });
    return id;
  }

  function duplicatePattern(patternId, name) {
    if (state.patterns.length >= MAX_PROJECT_PATTERNS) {
      throw new RangeError(`A Project supports at most ${MAX_PROJECT_PATTERNS} Patterns.`);
    }
    const source = getPattern(patternId);
    const id = nextDomainId("pattern", new Set(state.patterns.map((pattern) => pattern.id)));
    const resolvedName = createBoundedUniqueName(name ?? source.name, state.patterns.map((pattern) => pattern.name), {
      fallback: `Pattern ${state.patterns.length + 1}`,
      maximumLength: MAX_PATTERN_NAME_LENGTH,
      suffix: name === undefined ? "variation" : "",
    });
    const noteIds = new Set(source.notes.map((note) => note.id));
    const notes = source.notes.map((note) => {
      const noteId = nextDomainId("note", noteIds);
      noteIds.add(noteId);
      return { ...note, id: noteId };
    });
    commit({
      ...state,
      patterns: [...state.patterns, {
        id,
        name: resolvedName,
        lengthTicks: derivePatternLengthTicks(notes),
        notes,
      }],
    }, { operation: "duplicate-pattern", patternId: id, sourcePatternId: patternId });
    return id;
  }

  function renamePattern(patternId, name) {
    const resolvedName = trimCommandName(name, "Pattern name", MAX_PATTERN_NAME_LENGTH);
    return updatePattern(patternId, (pattern) => pattern.name === resolvedName
      ? pattern
      : { ...pattern, name: resolvedName }, { operation: "rename-pattern" });
  }

  function deletePattern(patternId, { removeReferences = false } = {}) {
    if (state.patterns.length === 1) throw new RangeError("The final Pattern cannot be deleted.");
    getPattern(patternId);
    const linkedClipIds = state.tracks.flatMap((track) => track.clips)
      .filter((clip) => clip.patternId === patternId)
      .map((clip) => clip.id);
    if (linkedClipIds.length > 0 && !removeReferences) {
      throw new V2DomainError(
        `Pattern ${patternId} is used by ${linkedClipIds.length} clip${linkedClipIds.length === 1 ? "" : "s"}.`,
        "PATTERN_IN_USE",
        { linkedClipIds, patternId },
      );
    }
    return commit({
      ...state,
      patterns: state.patterns.filter((pattern) => pattern.id !== patternId),
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.patternId !== patternId),
      })),
    }, { operation: "delete-pattern", patternId, removedClipIds: deepFreeze(linkedClipIds) });
  }

  function addNote(patternId, note) {
    if (!note || typeof note !== "object" || Array.isArray(note)) throw new TypeError("Note input must be an object.");
    const allowed = new Set(["id", "pitch", "startTick", "durationTicks", "velocity"]);
    const unknown = Object.keys(note).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new TypeError(`Note input has unknown keys: ${unknown.join(", ")}.`);
    const pattern = getPattern(patternId);
    const noteIds = new Set(pattern.notes.map((candidate) => candidate.id));
    const id = note.id ?? nextDomainId("note", noteIds);
    const nextNote = {
      id,
      pitch: note.pitch,
      startTick: note.startTick,
      durationTicks: note.durationTicks ?? DEFAULT_SNAP_TICKS,
      velocity: note.velocity ?? 0.7,
    };
    updatePattern(patternId, (candidate) => ({ ...candidate, notes: [...candidate.notes, nextNote] }), {
      operation: "add-note",
      noteId: id,
    });
    return id;
  }

  function updateNote(patternId, noteId, changes) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("Note changes must be an object.");
    }
    const allowed = new Set(["pitch", "startTick", "durationTicks", "velocity"]);
    const unknown = Object.keys(changes).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new TypeError(`Note changes have unknown keys: ${unknown.join(", ")}.`);
    const pattern = getPattern(patternId);
    const note = pattern.notes.find((candidate) => candidate.id === noteId);
    if (!note) throw new RangeError(`Unknown note: ${noteId}.`);
    if (Object.keys(changes).every((key) => note[key] === changes[key])) return false;
    return updatePattern(patternId, (candidate) => ({
      ...candidate,
      notes: candidate.notes.map((current) => current.id === noteId ? { ...current, ...changes } : current),
    }), { operation: "update-note", noteId });
  }

  function removeNotes(patternId, noteIds) {
    const ids = normalizeNoteIds(noteIds);
    if (ids.length === 0) return false;
    const pattern = getPattern(patternId);
    const existing = new Set(pattern.notes.map((note) => note.id));
    const unknown = ids.filter((id) => !existing.has(id));
    if (unknown.length > 0) throw new RangeError(`Unknown note: ${unknown[0]}.`);
    const removed = new Set(ids);
    return updatePattern(patternId, (candidate) => ({
      ...candidate,
      notes: candidate.notes.filter((note) => !removed.has(note.id)),
    }), { operation: "remove-notes", noteIds: deepFreeze(ids) });
  }

  function duplicateNotes(patternId, noteIds, { deltaTicks = DEFAULT_SNAP_TICKS, deltaPitch = 0 } = {}) {
    assertInteger(deltaTicks, "Note duplicate tick delta");
    assertInteger(deltaPitch, "Note duplicate pitch delta");
    const ids = normalizeNoteIds(noteIds);
    if (ids.length === 0) return Object.freeze([]);
    const pattern = getPattern(patternId);
    const byId = new Map(pattern.notes.map((note) => [note.id, note]));
    const unknown = ids.filter((id) => !byId.has(id));
    if (unknown.length > 0) throw new RangeError(`Unknown note: ${unknown[0]}.`);
    const occupied = new Set(byId.keys());
    const copies = ids.map((id) => {
      const source = byId.get(id);
      const copyId = nextDomainId("note", occupied);
      occupied.add(copyId);
      return {
        ...source,
        id: copyId,
        pitch: source.pitch + deltaPitch,
        startTick: source.startTick + deltaTicks,
      };
    });
    updatePattern(patternId, (candidate) => ({ ...candidate, notes: [...candidate.notes, ...copies] }), {
      operation: "duplicate-notes",
      noteIds: deepFreeze(copies.map((note) => note.id)),
    });
    return Object.freeze(copies.map((note) => note.id));
  }

  function addTrack(name) {
    if (state.tracks.length >= MAX_PROJECT_TRACKS) {
      throw new RangeError(`A Project supports at most ${MAX_PROJECT_TRACKS} Tracks.`);
    }
    const id = nextDomainId("track", new Set(state.tracks.map((track) => track.id)));
    const resolvedName = createBoundedUniqueName(name, state.tracks.map((track) => track.name), {
      fallback: `Track ${state.tracks.length + 1}`,
      maximumLength: MAX_TRACK_NAME_LENGTH,
    });
    const instanceIds = getInstanceIds(state);
    const preferredInstanceId = `instrument-${id}`;
    const instanceId = instanceIds.has(preferredInstanceId)
      ? nextDomainId("instrument", instanceIds)
      : preferredInstanceId;
    commit({
      ...state,
      tracks: [...state.tracks, {
        id,
        name: resolvedName,
        instrument: createDefaultInstrumentInstance(instanceId),
        mixer: { volume: 1, pan: 0, muted: false, solo: false, effects: [] },
        clips: [],
      }],
    }, { operation: "add-track", trackId: id });
    return id;
  }

  function renameTrack(trackId, name) {
    const resolvedName = trimCommandName(name, "Track name", MAX_TRACK_NAME_LENGTH);
    return updateTrack(trackId, (track) => track.name === resolvedName ? track : { ...track, name: resolvedName }, {
      operation: "rename-track",
    });
  }

  function moveTrack(trackId, direction) {
    if (direction !== -1 && direction !== 1) throw new RangeError("Track direction must be -1 or 1.");
    const index = state.tracks.findIndex((track) => track.id === trackId);
    if (index === -1) throw new RangeError(`Unknown Track: ${trackId}.`);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.tracks.length) return false;
    const tracks = [...state.tracks];
    [tracks[index], tracks[nextIndex]] = [tracks[nextIndex], tracks[index]];
    return commit({ ...state, tracks }, { operation: "move-track", trackId });
  }

  function removeTrack(trackId, { allowClips = false } = {}) {
    if (state.tracks.length === 1) throw new RangeError("The final Track cannot be removed.");
    const track = getTrack(trackId);
    if (track.clips.length > 0 && !allowClips) {
      throw new V2DomainError(
        `Track ${trackId} contains ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}.`,
        "TRACK_HAS_CLIPS",
        { clipIds: track.clips.map((clip) => clip.id), trackId },
      );
    }
    return commit({ ...state, tracks: state.tracks.filter((candidate) => candidate.id !== trackId) }, {
      operation: "remove-track",
      removedClipIds: deepFreeze(track.clips.map((clip) => clip.id)),
      trackId,
    });
  }

  function addClip(trackId, patternId, startTick) {
    if (!canPlaceClip(state, trackId, patternId, startTick)) {
      throw new V2DomainError(
        "That Pattern does not fit at the selected Track position.",
        "CLIP_PLACEMENT_INVALID",
        { patternId, startTick, trackId },
      );
    }
    const id = nextDomainId("clip", new Set(state.tracks.flatMap((track) => track.clips.map((clip) => clip.id))));
    updateTrack(trackId, (track) => ({ ...track, clips: [...track.clips, { id, patternId, startTick }] }), {
      clipId: id,
      operation: "add-clip",
      patternId,
    });
    return id;
  }

  function addPatternToPlaylist(patternId, trackId, cursorTick = 0, options = {}) {
    if (cursorTick && typeof cursorTick === "object") {
      options = cursorTick;
      cursorTick = options.cursorTick ?? 0;
    }
    const pattern = getPattern(patternId);
    findTrack(state, trackId);
    if (!pattern.notes.some((note) => note.velocity > 0)) {
      throw new V2DomainError(
        "Add a note with non-zero velocity first.",
        "PATTERN_NOT_AUDIBLE",
        { patternId },
      );
    }
    assertInteger(cursorTick, "Playlist cursor tick", 0, MAX_ARRANGEMENT_TICKS);
    const snapTicks = options.snapTicks ?? DEFAULT_SNAP_TICKS;
    if (!SNAP_TICKS.includes(snapTicks)) throw new RangeError(`Unsupported snap: ${snapTicks} ticks.`);
    const firstTick = Math.ceil(cursorTick / snapTicks) * snapTicks;
    for (let startTick = firstTick; startTick + pattern.lengthTicks <= MAX_ARRANGEMENT_TICKS; startTick += snapTicks) {
      if (!canPlaceClip(state, trackId, patternId, startTick)) continue;
      const clipId = addClip(trackId, patternId, startTick);
      return deepFreeze({
        clipId,
        patternId,
        trackId,
        startTick,
        endTick: startTick + pattern.lengthTicks,
        playlistCursorTick: startTick + pattern.lengthTicks,
      });
    }
    throw new V2DomainError(
      "The Track has no valid remaining space for this Pattern.",
      "PLAYLIST_NO_SPACE",
      { cursorTick, patternId, trackId },
    );
  }

  function moveClip(clipId, trackId, startTick) {
    const found = findClip(state, clipId);
    if (found.track.id === trackId && found.clip.startTick === startTick) return false;
    if (!canPlaceClip(state, trackId, found.clip.patternId, startTick, clipId)) {
      throw new V2DomainError(
        "That clip does not fit at the selected Track position.",
        "CLIP_PLACEMENT_INVALID",
        { clipId, startTick, trackId },
      );
    }
    const tracks = state.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== clipId),
    }));
    const targetIndex = tracks.findIndex((track) => track.id === trackId);
    tracks[targetIndex] = { ...tracks[targetIndex], clips: [...tracks[targetIndex].clips, { ...found.clip, startTick }] };
    return commit({ ...state, tracks }, { clipId, operation: "move-clip", trackId });
  }

  function duplicateClip(clipId) {
    const found = findClip(state, clipId);
    const pattern = findPattern(state, found.clip.patternId);
    const startTick = found.clip.startTick + pattern.lengthTicks;
    if (!canPlaceClip(state, found.track.id, pattern.id, startTick)) {
      throw new V2DomainError(
        "The duplicated clip does not fit immediately after the selected clip.",
        "CLIP_DUPLICATE_INVALID",
        { clipId, startTick, trackId: found.track.id },
      );
    }
    return addClip(found.track.id, pattern.id, startTick);
  }

  function removeClip(clipId) {
    const found = findClip(state, clipId);
    return updateTrack(found.track.id, (track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== clipId),
    }), { clipId, operation: "remove-clip" });
  }

  function setBpm(bpm) {
    if (state.transport.bpm === bpm) return false;
    return commit({ ...state, transport: { ...state.transport, bpm } }, { field: "transport.bpm" });
  }

  function setLoop(values) {
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new TypeError("Loop changes must be an object.");
    const allowed = new Set(["enabled", "mode", "startTick", "endTick"]);
    const unknown = Object.keys(values).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new TypeError(`Loop changes have unknown keys: ${unknown.join(", ")}.`);
    const changesBounds = Object.hasOwn(values, "startTick") || Object.hasOwn(values, "endTick");
    const loop = {
      ...state.transport.loop,
      ...values,
      mode: values.mode ?? (changesBounds ? "custom" : state.transport.loop.mode),
    };
    return commit({ ...state, transport: { ...state.transport, loop } }, { field: "transport.loop" });
  }

  function setMasterVolume(volume) {
    if (state.mixer.master.volume === volume) return false;
    return commit({
      ...state,
      mixer: { master: { ...state.mixer.master, volume } },
    }, { field: "mixer.master.volume" });
  }

  function setInstrumentParam(trackId, param, value) {
    if (!KLINTO_CHIP_CONTRACT.paramKeys.includes(param)) throw new RangeError(`Unknown Instrument parameter: ${param}.`);
    return updateTrack(trackId, (track) => track.instrument.params[param] === value ? track : {
      ...track,
      instrument: { ...track.instrument, params: { ...track.instrument.params, [param]: value } },
    }, { field: `instrument.params.${param}`, operation: "set-instrument-param" });
  }

  function resetInstrument(trackId) {
    return updateTrack(trackId, (track) => KLINTO_CHIP_CONTRACT.paramKeys.every(
      (param) => track.instrument.params[param] === KLINTO_CHIP_CONTRACT.defaults[param],
    ) ? track : {
      ...track,
      instrument: { ...track.instrument, params: { ...KLINTO_CHIP_CONTRACT.defaults } },
    }, { operation: "reset-instrument" });
  }

  function setTrackMixer(trackId, changes) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("Track Mixer changes must be an object.");
    }
    const allowed = new Set(["volume", "pan", "muted", "solo"]);
    const unknown = Object.keys(changes).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new TypeError(`Track Mixer changes have unknown keys: ${unknown.join(", ")}.`);
    return updateTrack(trackId, (track) => Object.keys(changes).every((key) => track.mixer[key] === changes[key])
      ? track
      : { ...track, mixer: { ...track.mixer, ...changes } }, { operation: "set-track-mixer" });
  }

  function addEffect(ownerInput, type, index) {
    const owner = resolveEffectOwner(state, ownerInput);
    if (owner.effects.length >= MAX_EFFECTS_PER_CHAIN) {
      throw new RangeError(`An Effect chain supports at most ${MAX_EFFECTS_PER_CHAIN} Effects.`);
    }
    getEffectContract(type);
    const used = getInstanceIds(state);
    const instanceId = nextDomainId("effect", used);
    const effect = createDefaultEffectInstance(type, instanceId);
    const insertionIndex = index ?? owner.effects.length;
    assertInteger(insertionIndex, "Effect insertion index", 0, owner.effects.length);
    const effects = [...owner.effects];
    effects.splice(insertionIndex, 0, effect);
    commit(replaceEffectChain(state, owner, effects), {
      instanceId,
      operation: "add-effect",
      scope: owner.scope,
      trackId: owner.track?.id ?? null,
    });
    return instanceId;
  }

  function setEffectParam(instanceId, param, value) {
    const found = findEffect(state, instanceId);
    const contract = getEffectContract(found.effect.type);
    if (!contract.paramKeys.includes(param)) throw new RangeError(`Unknown ${found.effect.type} parameter: ${param}.`);
    if (found.effect.params[param] === value) return false;
    return commit(updateEffectById(state, instanceId, (effect) => ({
      ...effect,
      params: { ...effect.params, [param]: value },
    })), { field: `effect.params.${param}`, instanceId, operation: "set-effect-param" });
  }

  function setEffectBypassed(instanceId, bypassed) {
    assertBoolean(bypassed, "Effect bypassed");
    const found = findEffect(state, instanceId);
    if (found.effect.bypassed === bypassed) return false;
    return commit(updateEffectById(state, instanceId, (effect) => ({ ...effect, bypassed })), {
      field: "effect.bypassed",
      instanceId,
      operation: "set-effect-bypassed",
    });
  }

  function moveEffect(instanceId, directionOrTarget) {
    const found = findEffect(state, instanceId);
    const owner = found.scope === "master"
      ? resolveEffectOwner(state, "master")
      : resolveEffectOwner(state, found.track.id);
    let targetIndex;
    if (typeof directionOrTarget === "object" && directionOrTarget !== null) {
      targetIndex = directionOrTarget.toIndex;
    } else if (directionOrTarget === -1 || directionOrTarget === 1) {
      targetIndex = found.index + directionOrTarget;
    } else {
      targetIndex = directionOrTarget;
    }
    assertInteger(targetIndex, "Effect target index", 0, owner.effects.length - 1);
    if (targetIndex === found.index) return false;
    const effects = [...owner.effects];
    const [effect] = effects.splice(found.index, 1);
    effects.splice(targetIndex, 0, effect);
    return commit(replaceEffectChain(state, owner, effects), { instanceId, operation: "move-effect" });
  }

  function removeEffect(instanceId) {
    const found = findEffect(state, instanceId);
    const owner = found.scope === "master"
      ? resolveEffectOwner(state, "master")
      : resolveEffectOwner(state, found.track.id);
    return commit(replaceEffectChain(
      state,
      owner,
      owner.effects.filter((effect) => effect.instanceId !== instanceId),
    ), { instanceId, operation: "remove-effect" });
  }

  function resetEffect(instanceId) {
    const found = findEffect(state, instanceId);
    const defaults = getEffectContract(found.effect.type).defaults;
    if (Object.keys(defaults).every((key) => found.effect.params[key] === defaults[key])) return false;
    return commit(updateEffectById(state, instanceId, (effect) => ({
      ...effect,
      params: { ...defaults },
    })), { instanceId, operation: "reset-effect" });
  }

  function renameProject(name) {
    const resolvedName = trimCommandName(name, "Project title", 100);
    if (state.metadata.title === resolvedName) return false;
    return commit({ ...state, metadata: { title: resolvedName } }, { operation: "rename-project" });
  }

  function beginHistoryGroup() {
    if (historyGroupActive) return false;
    historyGroupActive = true;
    groupedHistoryRecorded = false;
    return true;
  }

  function closeHistoryGroup(emitCommit) {
    const changed = historyGroupActive && groupedHistoryRecorded;
    historyGroupActive = false;
    groupedHistoryRecorded = false;
    if (changed && emitCommit) {
      emitChange({
        committed: true,
        operation: "commit-history-group",
        transient: false,
      });
    }
    return changed;
  }

  function endHistoryGroup() {
    return closeHistoryGroup(true);
  }

  function undo() {
    closeHistoryGroup(false);
    if (past.length === 0) return false;
    future.push(state);
    state = normalizeV2Project(past.pop());
    emitChange({ operation: "undo" });
    return true;
  }

  function redo() {
    closeHistoryGroup(false);
    if (future.length === 0) return false;
    retainPast(state);
    state = normalizeV2Project(future.pop());
    emitChange({ operation: "redo" });
    return true;
  }

  return Object.freeze({
    addClip,
    addEffect,
    addEventListener: events.addEventListener.bind(events),
    addNote,
    addPatternToPlaylist,
    addTrack,
    beginHistoryGroup,
    canPlaceClip: (trackId, patternId, startTick, ignoredClipId = null) => canPlaceClip(
      state,
      trackId,
      patternId,
      startTick,
      ignoredClipId,
    ),
    createPattern,
    deletePattern,
    duplicateClip,
    duplicateNotes,
    duplicatePattern,
    endHistoryGroup,
    getArrangementEndTick: () => getV2ArrangementEndTick(state),
    getClip,
    getEffect,
    getHistoryState,
    getPattern,
    getState,
    getTrack,
    moveClip,
    moveEffect,
    moveTrack,
    redo,
    removeClip,
    removeEffect,
    removeEventListener: events.removeEventListener.bind(events),
    removeNotes,
    removeTrack,
    renamePattern,
    renameProject,
    renameTrack,
    replace,
    resetEffect,
    resetInstrument,
    setBpm,
    setEffectBypassed,
    setEffectParam,
    setInstrumentParam,
    setLoop,
    setMasterVolume,
    setTrackMixer,
    undo,
    updateNote,
    updatePattern,
    updateTrack,
  });
}
