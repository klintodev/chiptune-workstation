import { clearElement, createElement } from "./dom.js";
import { formatDurationTicks, formatTickPosition } from "./music-format.js";

const MAX_SONG_TICKS = 6144;
const SNAP_OPTIONS = Object.freeze({ "1/8": 48, "1/16": 24, "1/32": 12 });
const LANE_HEIGHT = 66;
const ADD_INSTRUMENT_ROW_HEIGHT = 44;
const TRACK_HEADER_WIDTH = 320;
const TRACK_ACTION_ORDER = Object.freeze([
  "select",
  "instrument",
  "mute",
  "solo",
  "move-up",
  "move-down",
  "remove",
]);
const PATTERN_DRAG_TYPE = "application/x-klinto-pattern-id";
const PLAYLIST_DOUBLE_CLICK_DELAY_MS = 250;

export function createPlaylistPatternActivation({
  cancel = (handle) => globalThis.clearTimeout(handle),
  delay = PLAYLIST_DOUBLE_CLICK_DELAY_MS,
  onOpen,
  onSelect,
  schedule = (callback, timeout) => globalThis.setTimeout(callback, timeout),
} = {}) {
  if (typeof cancel !== "function" || typeof onOpen !== "function"
    || typeof onSelect !== "function" || typeof schedule !== "function") {
    throw new TypeError("Playlist Pattern activation requires timer, select, and open functions.");
  }
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError("Playlist Pattern activation delay must be non-negative.");
  }

  let pendingSelection = null;
  function cancelPendingSelection() {
    if (pendingSelection === null) return false;
    cancel(pendingSelection);
    pendingSelection = null;
    return true;
  }

  return Object.freeze({
    cancel: cancelPendingSelection,
    click(clickCount = 1) {
      if (clickCount > 1) return false;
      cancelPendingSelection();
      pendingSelection = schedule(() => {
        pendingSelection = null;
        onSelect();
      }, delay);
      return true;
    },
    doubleClick() {
      cancelPendingSelection();
      onOpen();
      return true;
    },
  });
}

export function getSnappedPlaylistDropTick({ clientX, pixelsPerTick, snapTicks, timelineLeft }) {
  if (![clientX, pixelsPerTick, snapTicks, timelineLeft].every(Number.isFinite)
    || pixelsPerTick <= 0
    || snapTicks <= 0) return null;
  const horizontal = clientX - timelineLeft - TRACK_HEADER_WIDTH;
  if (horizontal < 0) return null;
  return Math.max(0, Math.min(
    MAX_SONG_TICKS - snapTicks,
    Math.round(horizontal / pixelsPerTick / snapTicks) * snapTicks,
  ));
}

export function getPlaylistRulerSeekTick(event, geometry) {
  if (!event || event.button !== 0 || !event.target?.closest?.(".v2-playlist-ruler")) return null;
  return getSnappedPlaylistDropTick({ clientX: event.clientX, ...geometry });
}

export function getPlaylistWheelScrollDelta({ clientWidth = 0, deltaMode = 0, deltaX = 0, deltaY = 0 } = {}) {
  const dominantDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (!Number.isFinite(dominantDelta)) return 0;
  if (deltaMode === 1) return dominantDelta * 40;
  if (deltaMode === 2) return dominantDelta * Math.max(1, Number(clientWidth) || 0);
  return dominantDelta;
}

export function isPlaylistDuplicateShortcut(event) {
  return Boolean(
    event
    && !event.defaultPrevented
    && !event.altKey
    && !event.shiftKey
    && !event.repeat
    && (event.ctrlKey || event.metaKey)
    && String(event.key ?? "").toLowerCase() === "b"
  );
}

export function getPlaylistContextMenuPosition({
  clientX,
  clientY,
  edge = 8,
  menuHeight,
  menuWidth,
  viewportHeight,
  viewportWidth,
} = {}) {
  if (![clientX, clientY, edge, menuHeight, menuWidth, viewportHeight, viewportWidth]
    .every(Number.isFinite)) return null;
  const inset = Math.max(0, edge);
  const maximumLeft = Math.max(inset, viewportWidth - Math.max(0, menuWidth) - inset);
  const maximumTop = Math.max(inset, viewportHeight - Math.max(0, menuHeight) - inset);
  return Object.freeze({
    left: Math.round(Math.max(inset, Math.min(clientX, maximumLeft))),
    top: Math.round(Math.max(inset, Math.min(clientY, maximumTop))),
  });
}

export function routePlaylistContextMenu(event, options = {}) {
  const onClip = options.onClip ?? (() => {});
  const onTrack = options.onTrack ?? (() => {});
  const onInstrument = options.onInstrument ?? onTrack;
  const clip = event?.target?.closest?.(".v2-playlist-clip");
  const instrument = event?.target?.closest?.(".v2-playlist-instrument");
  const lane = event?.target?.closest?.(".v2-playlist-lane");
  if (!clip?.dataset.clipId && !instrument?.dataset.trackId && !lane?.dataset.trackId) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  if (clip?.dataset.clipId) onClip(clip.dataset.clipId, event, clip);
  else if (instrument?.dataset.trackId) {
    onInstrument(instrument.dataset.trackId, event, instrument);
  }
  else onTrack(lane.dataset.trackId, event, lane);
  return true;
}

export function renamePlaylistInstrument({
  announce = () => {},
  mutate = (action) => action(),
  projectState,
  render = () => {},
  requestedName,
  trackId,
} = {}) {
  if (requestedName === null || requestedName === undefined) return false;
  if (!projectState?.getTrack || !projectState?.renameTrack) {
    throw new TypeError("Renaming a Playlist Instrument requires Project state.");
  }
  projectState.getTrack(trackId);
  const changed = mutate(() => projectState.renameTrack(trackId, requestedName));
  if (!changed) return false;
  const resolvedName = projectState.getTrack(trackId).name;
  announce(`Renamed Instrument to ${resolvedName}.`);
  render();
  return true;
}

export function createPatternForPlaylistTrack({
  announce = () => {},
  mutate = (action) => action(),
  onOpenPattern = () => {},
  projectState,
  render = () => {},
  setActivePattern = () => {},
  setPlaylist = () => {},
  trackId,
} = {}) {
  if (!projectState?.getState || !projectState?.createPattern || !projectState?.getPattern) {
    throw new TypeError("Creating a Playlist Pattern requires Project state.");
  }
  const track = projectState.getState().tracks.find(({ id }) => id === trackId);
  if (!track) throw new RangeError("The selected Track is no longer available.");
  const patternId = mutate(() => projectState.createPattern());
  setPlaylist({
    destinationTrackId: track.id,
    selectedClipId: null,
    selectedClipIds: [],
  });
  setActivePattern(patternId);
  announce(`Created ${projectState.getPattern(patternId).name} for ${track.name}.`);
  render();
  onOpenPattern(patternId, track.id);
  return patternId;
}

export function getPlaylistMarqueeClipIds(project, {
  endTick,
  endTrackIndex,
  startTick,
  startTrackIndex,
} = {}) {
  if (!project?.tracks?.length || !project?.patterns?.length) return [];
  if (![endTick, endTrackIndex, startTick, startTrackIndex].every(Number.isFinite)) return [];
  const leftTick = Math.max(0, Math.min(startTick, endTick));
  const rightTick = Math.min(MAX_SONG_TICKS, Math.max(startTick, endTick));
  if (rightTick <= leftTick) return [];
  const firstTrack = Math.max(0, Math.min(
    project.tracks.length - 1,
    Math.floor(Math.min(startTrackIndex, endTrackIndex)),
  ));
  const finalTrack = Math.max(0, Math.min(
    project.tracks.length - 1,
    Math.floor(Math.max(startTrackIndex, endTrackIndex)),
  ));
  const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
  const result = [];
  for (let trackIndex = firstTrack; trackIndex <= finalTrack; trackIndex += 1) {
    for (const clip of project.tracks[trackIndex].clips) {
      const end = clip.startTick + (patterns.get(clip.patternId)?.lengthTicks ?? 0);
      if (clip.startTick < rightTick && end > leftTick) result.push(clip.id);
    }
  }
  return result;
}

function findClip(project, clipId) {
  for (const track of project.tracks) {
    const clip = track.clips.find(({ id }) => id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}

function clipLabel(project, track, clip) {
  const pattern = project.patterns.find(({ id }) => id === clip.patternId);
  return `${pattern?.name ?? "Unknown Pattern"}, ${track.name}, starts ${formatTickPosition(clip.startTick)}, duration ${formatDurationTicks(pattern?.lengthTicks ?? 0)}`;
}

function formatPatternSpan(pattern) {
  return pattern.notes.length === 0 ? "Empty" : formatDurationTicks(pattern.lengthTicks);
}

export function resolvePlaylistFocusTarget(project, preference = {}) {
  let clipId = preference.clipId;
  if (!clipId || !findClip(project, clipId)) {
    const candidates = project.tracks.flatMap((track, trackIndex) => (
      track.clips.map((clip) => ({ clip, track, trackIndex }))
    ));
    if (candidates.length > 0 && Number.isFinite(preference.tick)) {
      candidates.sort((left, right) => (
        Number(right.track.id === preference.trackId) - Number(left.track.id === preference.trackId)
        || Math.abs(left.clip.startTick - preference.tick) - Math.abs(right.clip.startTick - preference.tick)
        || left.trackIndex - right.trackIndex
        || left.clip.startTick - right.clip.startTick
      ));
      clipId = candidates[0].clip.id;
    } else {
      clipId = null;
    }
  }
  const found = clipId ? findClip(project, clipId) : null;
  let trackId = found?.track.id ?? preference.trackId;
  if (!project.tracks.some(({ id }) => id === trackId)) {
    const index = Math.max(0, Math.min(
      project.tracks.length - 1,
      Number.isInteger(preference.trackIndex) ? preference.trackIndex : 0,
    ));
    trackId = project.tracks[index]?.id ?? null;
  }
  return Object.freeze({ clipId: found?.clip.id ?? null, trackId: trackId ?? null });
}

export function createPlaylistSurface({
  announce = () => {},
  confirmPatternDelete = async (pattern) => globalThis.confirm?.(
    `Delete ${pattern.name} and every Playlist clip that uses it?`,
  ) ?? false,
  confirmTrackRemoval = async () => true,
  onAddPattern = null,
  onOpenInstrument = () => {},
  onOpenPattern = () => {},
  onSeek = (tick) => tick,
  onTransportToggle = () => {},
  promptInstrumentName = (track) => globalThis.prompt?.("Instrument name", track.name),
  projectState,
  getTransportFrame = () => null,
  transportFrameSource = null,
  workspaceState,
}) {
  const lifecycle = new AbortController();
  let disposed = false;
  let localProjectMutationDepth = 0;
  let localWorkspaceMutationDepth = 0;
  let pendingFocus = null;
  let pixelsPerTick = 0.36;
  let playheadElement = null;
  let snapTicks = 24;
  let draggedPatternId = null;
  let marquee = null;
  let suppressNextPlaylistClick = false;
  let trackContextMenu = null;
  let trackContextReturnFocus = null;
  let trackContextTrackId = null;

  const title = createElement("h2", { id: "v2-playlist-title", className: "v2-surface-title", textContent: "Playlist", tabIndex: -1 });
  const header = createElement("div", { className: "v2-surface-header v2-playlist-header" });
  const timeline = createElement("div", {
    className: "v2-playlist-timeline",
    role: "grid",
    tabIndex: 0,
    "aria-label": "Playlist timeline",
    "aria-keyshortcuts": "Home S Control+B Meta+B",
    "aria-multiselectable": "true",
  });
  const scroller = createElement("div", { className: "v2-playlist-scroll" }, [timeline]);
  const patternLibrary = createElement("details", {
    className: "v2-playlist-pattern-library",
    open: true,
  });
  const inspector = createElement("aside", { className: "v2-clip-inspector", "aria-label": "Playlist selection" });
  const node = createElement("section", {
    className: "v2-primary-surface v2-playlist",
    "aria-labelledby": title.id,
    dataset: { primarySurface: "playlist" },
  }, [header, patternLibrary, scroller, inspector]);

  node.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    scroller.scrollLeft += getPlaylistWheelScrollDelta({
      clientWidth: scroller.clientWidth,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }, { passive: false, signal: lifecycle.signal });

  function project() {
    return projectState.getState();
  }

  function session() {
    return workspaceState.getState().playlist ?? {};
  }

  function setSession(values) {
    localWorkspaceMutationDepth += 1;
    try {
      if (workspaceState.setPlaylist) workspaceState.setPlaylist(values);
      else workspaceState.updatePlaylist?.(values);
    } finally {
      localWorkspaceMutationDepth -= 1;
    }
  }

  function mutateProject(action) {
    localProjectMutationDepth += 1;
    try {
      return action();
    } finally {
      localProjectMutationDepth -= 1;
    }
  }

  function selectorId(value) {
    return globalThis.CSS?.escape?.(value) ?? String(value).replaceAll('"', '\\\"');
  }

  function rememberFocus(preference) {
    pendingFocus = { ...pendingFocus, ...preference };
  }

  function captureFocusPreference() {
    const active = node.ownerDocument?.activeElement;
    if (!active || !node.contains?.(active)) return;
    const clip = active.closest?.("[data-clip-id]");
    const action = active.closest?.("[data-playlist-track-action]");
    const track = active.closest?.("[data-track-id]");
    if (clip?.dataset.clipId) {
      rememberFocus({ clipId: clip.dataset.clipId, trackAction: null });
    } else if (action?.dataset.playlistTrackAction && track?.dataset.trackId) {
      rememberFocus({
        clipId: null,
        trackAction: action.dataset.playlistTrackAction,
        trackId: track.dataset.trackId,
      });
    } else if (track?.dataset.trackId) {
      rememberFocus({ clipId: null, trackAction: null, trackId: track.dataset.trackId });
    }
  }

  function restorePendingFocus() {
    if (!pendingFocus) return false;
    const preference = pendingFocus;
    pendingFocus = null;
    const target = resolvePlaylistFocusTarget(project(), preference);
    const actionTarget = preference.trackAction && target.trackId
      ? node.querySelector(`[data-track-id="${selectorId(target.trackId)}"][data-playlist-track-action="${selectorId(preference.trackAction)}"]`)
      : null;
    if (actionTarget && !actionTarget.disabled) {
      actionTarget.focus({ preventScroll: true });
      return true;
    }
    const clipTarget = target.clipId
      ? node.querySelector(`[data-clip-id="${selectorId(target.clipId)}"]`)
      : null;
    if (clipTarget) {
      clipTarget.focus({ preventScroll: true });
      return true;
    }
    const trackTarget = target.trackId
      ? node.querySelector(`.v2-playlist-track-focus[data-track-id="${selectorId(target.trackId)}"]`)
      : null;
    if (trackTarget) {
      trackTarget.focus({ preventScroll: true });
      return true;
    }
    title.focus({ preventScroll: true });
    return true;
  }

  function selectedClipId() {
    const id = session().selectedClipId;
    return id && findClip(project(), id) ? id : null;
  }

  function selectedClipIds() {
    const state = project();
    const requested = new Set(Array.isArray(session().selectedClipIds)
      ? session().selectedClipIds
      : []);
    const primary = selectedClipId();
    if (primary) requested.add(primary);
    return state.tracks.flatMap((track) => (
      track.clips.filter(({ id }) => requested.has(id)).map(({ id }) => id)
    ));
  }

  function cursorTick() {
    return Math.max(0, Math.min(MAX_SONG_TICKS - snapTicks, session().cursorTick ?? 0));
  }

  function destinationTrackId() {
    const state = project();
    const candidate = session().destinationTrackId;
    return state.tracks.some(({ id }) => id === candidate) ? candidate : state.tracks[0].id;
  }

  function patternToAddId() {
    const state = project();
    const candidate = workspaceState.getState().activePatternId;
    return state.patterns.some(({ id }) => id === candidate) ? candidate : state.patterns[0].id;
  }

  function trackActions(trackId) {
    return [...node.querySelectorAll(
      `[data-track-id="${selectorId(trackId)}"][data-playlist-track-action]`,
    )]
      .filter((candidate) => !candidate.disabled)
      .sort((left, right) => TRACK_ACTION_ORDER.indexOf(left.dataset.playlistTrackAction) - TRACK_ACTION_ORDER.indexOf(right.dataset.playlistTrackAction));
  }

  function focusTrackAction(trackId, requestedAction = "select") {
    const actions = trackActions(trackId);
    const target = actions.find(({ dataset }) => dataset.playlistTrackAction === requestedAction)
      ?? actions[0];
    target?.focus({ preventScroll: true });
    return Boolean(target);
  }

  function closeTrackContextMenu({ restoreFocus = false } = {}) {
    if (!trackContextMenu || trackContextMenu.menu.hidden) return false;
    const returnFocus = trackContextReturnFocus;
    const trackId = trackContextTrackId;
    trackContextMenu.menu.hidden = true;
    trackContextMenu.menu.removeAttribute("data-track-id");
    trackContextReturnFocus = null;
    trackContextTrackId = null;
    if (restoreFocus) {
      if (returnFocus?.isConnected && !returnFocus.disabled) {
        returnFocus.focus({ preventScroll: true });
      } else if (trackId) {
        focusTrackAction(trackId);
      }
    }
    return true;
  }

  function createPatternForTrack(trackId) {
    try {
      return createPatternForPlaylistTrack({
        announce,
        mutate: (action) => mutateProject(action),
        onOpenPattern,
        projectState,
        render,
        setActivePattern: (patternId) => workspaceState.setActivePattern?.(patternId),
        setPlaylist: (patch) => setSession(patch),
        trackId,
      });
    } catch (error) {
      announce(error.message);
      renderPatternLibrary();
      return null;
    }
  }

  function requestInstrumentRename(trackId) {
    const state = project();
    const trackIndex = state.tracks.findIndex(({ id }) => id === trackId);
    const track = state.tracks[trackIndex];
    if (!track) return false;
    let requestedName;
    try {
      requestedName = promptInstrumentName(track);
      if (requestedName === null || requestedName === undefined) return false;
      return renamePlaylistInstrument({
        announce,
        mutate: (action) => mutateProject(action),
        projectState,
        render: () => {
          rememberFocus({ clipId: null, trackAction: "instrument", trackId, trackIndex });
          render();
        },
        requestedName,
        trackId,
      });
    } catch (error) {
      announce(error.message);
      focusTrackAction(trackId, "instrument");
      return false;
    }
  }

  function ensureTrackContextMenu() {
    if (trackContextMenu) return trackContextMenu;
    const renameInstrument = createElement("button", {
      role: "menuitem",
      textContent: "Rename Instrument",
      type: "button",
    });
    const newPattern = createElement("button", {
      role: "menuitem",
      textContent: "New Pattern",
      type: "button",
    });
    const menu = createElement("div", {
      "aria-label": "Track actions",
      className: "v2-action-menu-panel v2-playlist-track-context-menu",
      hidden: true,
      role: "menu",
      tabIndex: -1,
    }, [renameInstrument, newPattern]);
    renameInstrument.addEventListener("click", () => {
      const trackId = trackContextTrackId;
      closeTrackContextMenu({ restoreFocus: true });
      if (trackId) requestInstrumentRename(trackId);
    }, { signal: lifecycle.signal });
    newPattern.addEventListener("click", () => {
      const trackId = trackContextTrackId;
      closeTrackContextMenu();
      if (trackId) createPatternForTrack(trackId);
    }, { signal: lifecycle.signal });
    menu.addEventListener("contextmenu", (event) => event.preventDefault(), {
      signal: lifecycle.signal,
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        closeTrackContextMenu({ restoreFocus: true });
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [...menu.querySelectorAll('[role="menuitem"]')]
        .filter((item) => !item.hidden && !item.disabled);
      if (items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = items.indexOf(node.ownerDocument?.activeElement);
      const directionalOrigin = currentIndex >= 0
        ? currentIndex
        : event.key === "ArrowUp" ? 0 : -1;
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (directionalOrigin + (event.key === "ArrowUp" ? -1 : 1) + items.length)
            % items.length;
      items[nextIndex].focus({ preventScroll: true });
    }, { signal: lifecycle.signal });
    const menuHost = node.closest?.(".v2-workspace") ?? node.ownerDocument?.body;
    menuHost?.append(menu);
    trackContextMenu = { menu, newPattern, renameInstrument };
    return trackContextMenu;
  }

  function openTrackContextMenu(event, trackId, { instrumentTarget = false } = {}) {
    const track = project().tracks.find(({ id }) => id === trackId);
    if (!track) return false;
    closeTrackContextMenu();
    const contextMenu = ensureTrackContextMenu();
    const trackCountAtOpen = project().patterns.length;
    trackContextTrackId = track.id;
    trackContextReturnFocus = event.target?.closest?.("button")
      ?? node.querySelector(`.v2-playlist-track-focus[data-track-id="${selectorId(track.id)}"]`);
    contextMenu.menu.dataset.trackId = track.id;
    contextMenu.menu.setAttribute(
      "aria-label",
      instrumentTarget ? `Actions for ${track.name} Instrument` : `Actions for ${track.name}`,
    );
    contextMenu.renameInstrument.hidden = !instrumentTarget;
    contextMenu.renameInstrument.title = `Rename ${track.name} Instrument`;
    contextMenu.newPattern.disabled = trackCountAtOpen >= 64;
    contextMenu.newPattern.title = trackCountAtOpen >= 64
      ? "A Project supports at most 64 Patterns"
      : `Create a new Pattern for ${track.name}`;
    contextMenu.menu.hidden = false;
    const documentElement = node.ownerDocument?.documentElement;
    const view = node.ownerDocument?.defaultView;
    const position = getPlaylistContextMenuPosition({
      clientX: event.clientX,
      clientY: event.clientY,
      menuHeight: contextMenu.menu.offsetHeight,
      menuWidth: contextMenu.menu.offsetWidth,
      viewportHeight: documentElement?.clientHeight ?? view?.innerHeight ?? 0,
      viewportWidth: documentElement?.clientWidth ?? view?.innerWidth ?? 0,
    }) ?? { left: 8, top: 8 };
    contextMenu.menu.style.left = `${position.left}px`;
    contextMenu.menu.style.top = `${position.top}px`;
    const focusTarget = [contextMenu.renameInstrument, contextMenu.newPattern]
      .find((item) => !item.hidden && !item.disabled);
    (focusTarget ?? contextMenu.menu).focus({ preventScroll: true });
    return true;
  }

  function addPatternToTrack(patternId, trackId, requestedTick, { exact = false } = {}) {
    const state = project();
    const pattern = state.patterns.find(({ id }) => id === patternId);
    const track = state.tracks.find(({ id }) => id === trackId);
    if (!pattern || !track) return false;
    try {
      if (exact && projectState.canPlaceClip?.(track.id, pattern.id, requestedTick) === false) {
        throw new RangeError(
          `${pattern.name} does not fit at ${formatTickPosition(requestedTick)} on ${track.name}.`,
        );
      }
      const result = mutateProject(() => (
        typeof onAddPattern === "function"
          ? onAddPattern(pattern.id, track.id, requestedTick, snapTicks, { exact })
          : exact
            ? (() => {
                const clipId = projectState.addClip(track.id, pattern.id, requestedTick);
                return {
                  clipId,
                  endTick: requestedTick + pattern.lengthTicks,
                  patternId: pattern.id,
                  playlistCursorTick: requestedTick + pattern.lengthTicks,
                  startTick: requestedTick,
                  trackId: track.id,
                };
              })()
            : projectState.addPatternToPlaylist(pattern.id, track.id, requestedTick, { snapTicks })
      ));
      if (!result) return false;
      rememberFocus({ clipId: result.clipId, tick: result.startTick, trackId: result.trackId });
      setSession({
        cursorTick: result.playlistCursorTick,
        destinationTrackId: result.trackId,
        selectedClipId: result.clipId,
      });
      announce(`Added ${pattern.name} to ${track.name} at ${formatTickPosition(result.startTick)}.`);
      render();
      return true;
    } catch (error) {
      announce(error.message);
      renderInspector();
      return false;
    }
  }

  function addPatternAtCursor(patternId = patternToAddId()) {
    return addPatternToTrack(patternId, destinationTrackId(), cursorTick());
  }

  function getTransferredPatternId(dataTransfer) {
    const candidate = draggedPatternId
      || dataTransfer?.getData?.(PATTERN_DRAG_TYPE)
      || dataTransfer?.getData?.("text/plain");
    return project().patterns.some(({ id }) => id === candidate) ? candidate : null;
  }

  function clearPatternDropTargets() {
    for (const lane of timeline.querySelectorAll?.(".v2-playlist-lane.is-pattern-drop-target") ?? []) {
      lane.classList.remove("is-pattern-drop-target");
    }
  }

  function returnToTimelineNavigation({
    tick = cursorTick(),
    trackId = destinationTrackId(),
  } = {}) {
    const state = project();
    const track = state.tracks.find(({ id }) => id === trackId) ?? state.tracks[0];
    pendingFocus = null;
    setSession({
      cursorTick: tick,
      destinationTrackId: track.id,
      selectedClipId: null,
    });
    renderTimeline();
    timeline.focus({ preventScroll: true });
    announce(`${track.name}, ${formatTickPosition(tick)}, navigation cursor.`);
    return true;
  }

  function handleTrackActionKeyDown(event, current) {
    const actionName = current.dataset.playlistTrackAction;
    const trackId = current.dataset.trackId;
    const actions = trackActions(trackId);
    const actionIndex = actions.indexOf(current);
    let target = null;

    if (event.key === "Escape") {
      event.preventDefault();
      returnToTimelineNavigation({ trackId });
      return true;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      target = event.key === "Home" ? actions[0] : actions.at(-1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      target = actions[(actionIndex + delta + actions.length) % actions.length];
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const state = project();
      const trackIndex = state.tracks.findIndex(({ id }) => id === trackId);
      const delta = event.key === "ArrowUp" ? -1 : 1;
      const nextTrack = state.tracks[Math.max(0, Math.min(state.tracks.length - 1, trackIndex + delta))];
      if (nextTrack.id === trackId) return true;
      rememberFocus({ clipId: null, trackAction: actionName, trackId: nextTrack.id });
      setSession({ destinationTrackId: nextTrack.id, selectedClipId: null });
      renderTimeline();
      return true;
    } else {
      return false;
    }

    target?.focus({ preventScroll: true });
    return true;
  }

  function selectClips(clipIds, { focus = false, primaryId = null } = {}) {
    const state = project();
    const requested = new Set(clipIds ?? []);
    const ids = state.tracks.flatMap((track) => (
      track.clips.filter(({ id }) => requested.has(id)).map(({ id }) => id)
    ));
    const primary = ids.includes(primaryId) ? primaryId : ids[0] ?? null;
    const found = primary ? findClip(state, primary) : null;
    if (!found) {
      setSession({ selectedClipId: null, selectedClipIds: [] });
      render();
      if (focus) timeline.focus({ preventScroll: true });
      return false;
    }
    rememberFocus({ clipId: primary, tick: found.clip.startTick, trackAction: null, trackId: found.track.id });
    setSession({
      selectedClipId: primary,
      selectedClipIds: ids,
      cursorTick: found.clip.startTick,
      destinationTrackId: found.track.id,
    });
    announce(ids.length === 1
      ? `${clipLabel(state, found.track, found.clip)}, selected.`
      : `${ids.length} Playlist clips selected.`);
    render();
    if (focus) node.querySelector(`[data-clip-id="${selectorId(primary)}"]`)?.focus({ preventScroll: true });
    return true;
  }

  function selectClip(clipId, options = {}) {
    return selectClips(clipId ? [clipId] : [], { ...options, primaryId: clipId });
  }

  function toggleClipSelection(clipId) {
    const current = selectedClipIds();
    const next = current.includes(clipId)
      ? current.filter((id) => id !== clipId)
      : [...current, clipId];
    const primaryId = next.includes(clipId) ? clipId : next[0] ?? null;
    return selectClips(next, { focus: true, primaryId });
  }

  function moveCursor(deltaTick, deltaTrack) {
    const state = project();
    const tracks = state.tracks;
    const trackIndex = tracks.findIndex(({ id }) => id === destinationTrackId());
    const nextTrack = tracks[Math.max(0, Math.min(tracks.length - 1, trackIndex + deltaTrack))];
    const nextTick = Math.max(0, Math.min(MAX_SONG_TICKS - snapTicks, cursorTick() + deltaTick));
    setSession({ cursorTick: nextTick, destinationTrackId: nextTrack.id, selectedClipId: null });
    announce(`${nextTrack.name}, ${formatTickPosition(nextTick)}, ${findClipAt(nextTrack.id, nextTick) ? "clip" : "empty"}.`);
    render();
  }

  function findClipAt(trackId, tick) {
    const state = project();
    const track = state.tracks.find(({ id }) => id === trackId);
    if (!track) return null;
    return track.clips.find((clip) => {
      const pattern = state.patterns.find(({ id }) => id === clip.patternId);
      return tick >= clip.startTick && tick < clip.startTick + pattern.lengthTicks;
    }) ?? null;
  }

  function moveSelected(
    deltaTick,
    deltaTrack,
    clipIds = selectedClipIds(),
    primaryId = selectedClipId(),
  ) {
    const state = project();
    const requested = new Set(typeof clipIds === "string" ? [clipIds] : clipIds);
    const ids = state.tracks.flatMap((track) => (
      track.clips.filter(({ id }) => requested.has(id)).map(({ id }) => id)
    ));
    const primary = ids.includes(primaryId) ? primaryId : ids[0];
    const found = primary ? findClip(state, primary) : null;
    if (!found || ids.length === 0) return false;
    const currentTrackIndex = state.tracks.findIndex(({ id }) => id === found.track.id);
    const targetIndex = currentTrackIndex + deltaTrack;
    if (targetIndex < 0 || targetIndex >= state.tracks.length) {
      throw new RangeError(ids.length === 1
        ? "That clip cannot move beyond the first or final Track."
        : "The selected clips cannot move beyond the first or final Track.");
    }
    const target = state.tracks[targetIndex];
    const startTick = found.clip.startTick + deltaTick;
    rememberFocus({ clipId: found.clip.id, tick: startTick, trackId: target.id, trackIndex: targetIndex });
    mutateProject(() => ids.length === 1
      ? projectState.moveClip(found.clip.id, target.id, startTick)
      : projectState.moveClips(ids, { deltaTick, deltaTrack }));
    setSession({
      cursorTick: startTick,
      destinationTrackId: target.id,
      selectedClipId: found.clip.id,
      selectedClipIds: ids,
    });
    announce(ids.length === 1 ? "Clip moved." : `${ids.length} clips moved together.`);
    render();
    return true;
  }

  function duplicateSelected() {
    const ids = selectedClipIds();
    const primary = selectedClipId();
    if (ids.length === 0 || !primary) return false;
    const primaryIndex = Math.max(0, ids.indexOf(primary));
    const createdIds = mutateProject(() => projectState.duplicateClips(ids));
    const primaryId = createdIds[primaryIndex] ?? createdIds[0];
    const found = findClip(project(), primaryId);
    rememberFocus({ clipId: primaryId, tick: found.clip.startTick, trackId: found.track.id });
    setSession({
      cursorTick: found.clip.startTick,
      destinationTrackId: found.track.id,
      selectedClipId: primaryId,
      selectedClipIds: createdIds,
    });
    announce(createdIds.length === 1
      ? "Clip duplicated to the right."
      : `${createdIds.length} clips duplicated to the right.`);
    render();
    node.querySelector(`[data-clip-id="${selectorId(primaryId)}"]`)?.focus({ preventScroll: true });
    return true;
  }

  function removeClip(clipId) {
    if (!clipId) return false;
    const state = project();
    const before = findClip(state, clipId);
    if (!before) return false;
    const trackIndex = state.tracks.findIndex(({ id: trackId }) => trackId === before?.track.id);
    rememberFocus({
      clipId,
      tick: before?.clip.startTick ?? cursorTick(),
      trackId: before?.track.id,
      trackIndex,
    });
    const remaining = selectedClipIds().filter((id) => id !== clipId);
    const nextPrimary = remaining.includes(selectedClipId()) ? selectedClipId() : remaining[0] ?? null;
    mutateProject(() => projectState.removeClip(clipId));
    setSession({
      selectedClipId: nextPrimary,
      selectedClipIds: remaining,
      cursorTick: before?.clip.startTick ?? cursorTick(),
    });
    announce("Clip deleted.");
    render();
    return true;
  }

  function removeSelected() {
    return removeClip(selectedClipId());
  }

  function openSelected() {
    const found = findClip(project(), selectedClipId());
    if (!found) return false;
    onOpenPattern(found.clip.patternId, found.track.id);
    return true;
  }

  function seekSong(tick = cursorTick(), trackId = destinationTrackId()) {
    try {
      const requestedTick = Math.max(0, Math.min(MAX_SONG_TICKS - snapTicks, tick));
      const result = onSeek(requestedTick);
      if (result === false) return false;
      const resolvedTick = Number.isInteger(result) ? result : requestedTick;
      const state = project();
      const track = state.tracks.find(({ id }) => id === trackId) ?? state.tracks[0];
      pendingFocus = null;
      setSession({
        cursorTick: resolvedTick,
        destinationTrackId: track.id,
        selectedClipId: null,
      });
      renderTimeline();
      timeline.focus({ preventScroll: true });
      announce(`Song playhead moved to ${formatTickPosition(resolvedTick)}.`);
      return true;
    } catch (error) {
      announce(error.message);
      return false;
    }
  }

  function handleTimelineKeyDown(event) {
    try {
      const trackAction = event.target.closest?.("[data-playlist-track-action]");
      if (trackAction && timeline.contains(trackAction)) {
        handleTrackActionKeyDown(event, trackAction);
        return;
      }
      const selected = selectedClipIds().length > 0;
      if (event.key.toLowerCase() === "s" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const found = findClip(project(), selectedClipId());
        seekSong(found?.clip.startTick ?? cursorTick(), found?.track.id ?? destinationTrackId());
      } else if (event.key === " " && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        onTransportToggle();
      } else if (event.key === "Escape" && selected) {
        event.preventDefault();
        const found = findClip(project(), selectedClipId());
        returnToTimelineNavigation({
          tick: found?.clip.startTick ?? cursorTick(),
          trackId: found?.track.id ?? destinationTrackId(),
        });
      } else if (event.key === "Home" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const found = findClip(project(), selectedClipId());
        const trackId = found?.track.id ?? destinationTrackId();
        if (focusTrackAction(trackId)) {
          announce(`${projectState.getTrack(trackId).name} Track actions.`);
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (selected) openSelected();
        else {
          const clip = findClipAt(destinationTrackId(), cursorTick());
          if (clip) selectClip(clip.id);
          else announce(`${formatTickPosition(cursorTick())}, empty.`);
        }
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        removeSelected();
      } else if (isPlaylistDuplicateShortcut(event) && selected) {
        event.preventDefault();
        duplicateSelected();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) projectState.redo();
        else projectState.undo();
      } else if (selected && event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelected(-snapTicks, 0);
      } else if (selected && event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        moveSelected(snapTicks, 0);
      } else if (selected && event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveSelected(0, -1);
      } else if (selected && event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveSelected(0, 1);
      } else if (!selected && event.key === "ArrowLeft") {
        event.preventDefault();
        moveCursor(-snapTicks, 0);
      } else if (!selected && event.key === "ArrowRight") {
        event.preventDefault();
        moveCursor(snapTicks, 0);
      } else if (!selected && event.key === "ArrowUp") {
        event.preventDefault();
        moveCursor(0, -1);
      } else if (!selected && event.key === "ArrowDown") {
        event.preventDefault();
        moveCursor(0, 1);
      }
    } catch (error) {
      announce(error.message);
      render();
    }
  }

  function suppressFollowingPlaylistClick() {
    suppressNextPlaylistClick = true;
    globalThis.setTimeout?.(() => {
      suppressNextPlaylistClick = false;
    }, 0);
  }

  function consumeSuppressedPlaylistClick(event) {
    if (!suppressNextPlaylistClick) return false;
    suppressNextPlaylistClick = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function bindClipPointer(button, found) {
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
      const originX = event.clientX;
      const originY = event.clientY;
      const selection = selectedClipIds();
      const dragIds = selection.includes(found.clip.id) ? selection : [found.clip.id];
      const dragElements = dragIds
        .map((clipId) => timeline.querySelector(`[data-clip-id="${selectorId(clipId)}"]`))
        .filter(Boolean);
      let deltaTick = 0;
      let deltaTrack = 0;
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture can disappear during cancellation or synthetic input.
      }
      const move = (moveEvent) => {
        deltaTick = Math.round((moveEvent.clientX - originX) / pixelsPerTick / snapTicks) * snapTicks;
        deltaTrack = Math.round((moveEvent.clientY - originY) / LANE_HEIGHT);
        for (const element of dragElements) {
          element.style.translate = `${deltaTick * pixelsPerTick}px ${deltaTrack * LANE_HEIGHT}px`;
        }
      };
      const finish = (finishEvent) => {
        button.removeEventListener("pointermove", move);
        button.removeEventListener("pointerup", finish);
        button.removeEventListener("pointercancel", finish);
        for (const element of dragElements) element.style.translate = "";
        if (finishEvent.type !== "pointerup" || (deltaTick === 0 && deltaTrack === 0)) return;
        try {
          suppressFollowingPlaylistClick();
          moveSelected(deltaTick, deltaTrack, dragIds, found.clip.id);
        } catch (error) {
          announce(error.message);
          render();
        }
      };
      button.addEventListener("pointermove", move);
      button.addEventListener("pointerup", finish);
      button.addEventListener("pointercancel", finish);
    });
  }

  function getMarqueePoint(event) {
    const state = project();
    const bounds = timeline.getBoundingClientRect();
    const tick = Math.max(0, Math.min(
      MAX_SONG_TICKS,
      (event.clientX - bounds.left - TRACK_HEADER_WIDTH) / pixelsPerTick,
    ));
    const trackIndex = Math.max(0, Math.min(
      state.tracks.length - 1,
      Math.floor((event.clientY - bounds.top - 46) / LANE_HEIGHT),
    ));
    return { tick, trackIndex };
  }

  function previewClipSelection(clipIds) {
    const selected = new Set(clipIds);
    for (const clip of timeline.querySelectorAll(".v2-playlist-clip")) {
      const isSelected = selected.has(clip.dataset.clipId);
      clip.classList.toggle("is-selected", isSelected);
      clip.setAttribute("aria-selected", String(isSelected));
    }
  }

  function updateMarquee(event) {
    if (!marquee || event.pointerId !== marquee.pointerId) return false;
    const point = getMarqueePoint(event);
    if (!marquee.moved) {
      marquee.moved = Math.hypot(
        event.clientX - marquee.clientX,
        event.clientY - marquee.clientY,
      ) >= 4;
    }
    if (!marquee.moved) return true;
    const leftTick = Math.min(marquee.origin.tick, point.tick);
    const rightTick = Math.max(marquee.origin.tick, point.tick);
    const firstTrack = Math.min(marquee.origin.trackIndex, point.trackIndex);
    const finalTrack = Math.max(marquee.origin.trackIndex, point.trackIndex);
    marquee.element.hidden = false;
    Object.assign(marquee.element.style, {
      height: `${(finalTrack - firstTrack + 1) * LANE_HEIGHT}px`,
      left: `${TRACK_HEADER_WIDTH + leftTick * pixelsPerTick}px`,
      top: `${46 + firstTrack * LANE_HEIGHT}px`,
      width: `${Math.max(1, (rightTick - leftTick) * pixelsPerTick)}px`,
    });
    marquee.selection = getPlaylistMarqueeClipIds(project(), {
      endTick: point.tick,
      endTrackIndex: point.trackIndex,
      startTick: marquee.origin.tick,
      startTrackIndex: marquee.origin.trackIndex,
    });
    previewClipSelection(marquee.selection);
    event.preventDefault();
    return true;
  }

  function finishMarquee(event) {
    if (!marquee || event.pointerId !== marquee.pointerId) return false;
    const current = marquee;
    marquee = null;
    try {
      timeline.releasePointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    current.element.remove();
    event.preventDefault();
    if (event.type !== "pointerup" || !current.moved) {
      previewClipSelection(current.previousSelection);
      return true;
    }
    suppressFollowingPlaylistClick();
    selectClips(current.selection, {
      focus: true,
      primaryId: current.selection[0] ?? null,
    });
    return true;
  }

  function startMarquee(event) {
    if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;
    const lane = event.target.closest?.(".v2-playlist-lane");
    if (!lane || event.target.closest?.(
      ".v2-playlist-track-header, .v2-playlist-clip, button, input, select, textarea",
    )) return false;
    const element = createElement("div", {
      "aria-hidden": "true",
      className: "v2-playlist-marquee",
      hidden: true,
      role: "presentation",
    });
    timeline.append(element);
    marquee = {
      clientX: event.clientX,
      clientY: event.clientY,
      element,
      moved: false,
      origin: getMarqueePoint(event),
      pointerId: event.pointerId,
      previousSelection: selectedClipIds(),
      selection: [],
    };
    try {
      timeline.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic input and cancelled pointers may not be capturable.
    }
    timeline.focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function createAddInstrumentButton() {
    const trackCount = project().tracks.length;
    return createElement("button", {
      className: "v2-primary-action v2-playlist-add-instrument",
      disabled: trackCount >= 8,
      textContent: "+ Add Instrument",
      title: trackCount >= 8
        ? "A Project supports at most eight Instruments"
        : "Create a Track with a Klinto Chip instrument",
      type: "button",
      onClick: () => {
        const id = mutateProject(() => projectState.addTrack());
        rememberFocus({ trackId: id, trackIndex: project().tracks.length - 1 });
        setSession({ destinationTrackId: id, selectedClipId: null });
        render();
      },
    });
  }

  function renderHeader() {
    clearElement(header);
    const snap = createElement("select", { "aria-label": "Playlist snap" });
    for (const label of Object.keys(SNAP_OPTIONS)) {
      snap.append(createElement("option", { textContent: label, value: label }));
    }
    snap.value = session().snap ?? "1/16";
    snap.addEventListener("change", () => {
      const snapValue = snap.value;
      snapTicks = SNAP_OPTIONS[snapValue];
      setSession({ snap: snapValue });
      renderTimeline();
    });
    header.append(
      title,
      createElement("label", {}, ["Snap", snap]),
      createElement("button", { textContent: "Zoom out", type: "button", onClick: () => { pixelsPerTick = Math.max(0.12, pixelsPerTick - 0.06); renderTimeline(); } }),
      createElement("button", { textContent: "Zoom in", type: "button", onClick: () => { pixelsPerTick = Math.min(1.1, pixelsPerTick + 0.06); renderTimeline(); } }),
      createElement("button", { textContent: "Fit song", type: "button", onClick: () => { pixelsPerTick = Math.max(0.12, (scroller.clientWidth - TRACK_HEADER_WIDTH) / Math.max(384, projectState.getArrangementEndTick?.() ?? MAX_SONG_TICKS)); renderTimeline(); } }),
    );
  }

  function focusPatternLibraryItem(patternId) {
    node.querySelector(`.v2-pattern-library-drag[data-pattern-id="${selectorId(patternId)}"]`)
      ?.focus({ preventScroll: true });
  }

  function renderPatternLibrary() {
    const state = project();
    const destination = state.tracks.find(({ id }) => id === destinationTrackId()) ?? state.tracks[0];
    clearElement(patternLibrary);
    patternLibrary.append(createElement("summary", {
      "aria-label": `Pattern Library, ${state.patterns.length} Pattern${state.patterns.length === 1 ? "" : "s"}`,
      textContent: `Patterns (${state.patterns.length})`,
    }));

    const selectedPatternId = patternToAddId();
    const pattern = state.patterns.find(({ id }) => id === selectedPatternId) ?? state.patterns[0];
    const picker = createElement("select", {
      "aria-label": "Playlist Pattern",
      "aria-describedby": "v2-pattern-library-help",
      className: "v2-pattern-library-select",
    });
    for (const candidate of state.patterns) {
      picker.append(createElement("option", {
        textContent: candidate.name,
        value: candidate.id,
      }));
    }
    picker.value = pattern.id;
    picker.addEventListener("change", () => {
      const selected = state.patterns.find(({ id }) => id === picker.value);
      if (!selected) return;
      workspaceState.setActivePattern?.(selected.id);
      announce(`${selected.name} selected in the Pattern Library.`);
      node.querySelector(".v2-pattern-library-select")?.focus({ preventScroll: true });
    });
    const libraryHeader = createElement("div", { className: "v2-pattern-library-header" }, [
      createElement("label", { className: "v2-pattern-library-picker" }, [
        createElement("span", { textContent: "Pattern" }),
        picker,
      ]),
    ]);
    const createPatternButton = createElement("button", {
      disabled: state.patterns.length >= 64,
      textContent: "New Pattern",
      type: "button",
    });
    createPatternButton.addEventListener("click", () => createPatternForTrack(destination.id));
    libraryHeader.append(createPatternButton);

    const help = createElement("p", {
      className: "visually-hidden",
      id: "v2-pattern-library-help",
      textContent: `Choose a Pattern, then double-click the selected card to edit it, drag it into a Track, or use Add to place it at the ${destination.name} cursor.`,
    });
    const list = createElement("div", {
      "aria-describedby": "v2-pattern-library-help",
      className: "v2-pattern-library-list",
      "aria-label": "Selected Pattern",
      role: "group",
    });
    function createSelectedPatternCard() {
      const audible = pattern.notes.some(({ velocity }) => velocity > 0);
      const item = createElement("div", {
        className: "v2-pattern-library-item",
        dataset: { patternLibraryId: pattern.id },
      });
      const dragPattern = createElement("button", {
        "aria-label": `${pattern.name}, ${formatPatternSpan(pattern)}. Double-click to edit or drag to a Playlist Track`,
        className: "v2-pattern-library-drag",
        dataset: { patternId: pattern.id },
        draggable: true,
        title: `Double-click to edit ${pattern.name}, or drag it to a Playlist Track`,
        type: "button",
      }, [
        createElement("strong", { textContent: pattern.name }),
        createElement("small", { textContent: formatPatternSpan(pattern) }),
      ]);
      dragPattern.addEventListener("click", () => {
        workspaceState.setActivePattern?.(pattern.id);
        announce(`${pattern.name} selected in the Pattern Library.`);
      });
      dragPattern.addEventListener("dblclick", () => {
        onOpenPattern(pattern.id, destination.id);
      });
      dragPattern.addEventListener("dragstart", (event) => {
        draggedPatternId = pattern.id;
        event.dataTransfer?.setData(PATTERN_DRAG_TYPE, pattern.id);
        event.dataTransfer?.setData("text/plain", pattern.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
        dragPattern.classList.add("is-dragging");
      });
      dragPattern.addEventListener("dragend", () => {
        draggedPatternId = null;
        dragPattern.classList.remove("is-dragging");
        clearPatternDropTargets();
      });

      const add = createElement("button", {
        "aria-label": audible
          ? `Add ${pattern.name} to ${destination.name} at or after ${formatTickPosition(cursorTick())}`
          : `Cannot add ${pattern.name}: add an audible note first`,
        className: "v2-pattern-library-add",
        disabled: !audible,
        textContent: "Add",
        title: audible
          ? `Add ${pattern.name} to ${destination.name} at or after ${formatTickPosition(cursorTick())}`
          : `${pattern.name} needs an audible note before it can be added`,
        type: "button",
        onClick: () => addPatternAtCursor(pattern.id),
      });

      const actions = createElement("details", { className: "v2-pattern-library-actions v2-action-menu" });
      const actionSummary = createElement("summary", {
        "aria-label": `Actions for ${pattern.name}`,
        textContent: "\u2699",
        title: `Actions for ${pattern.name}`,
      });
      actions.append(actionSummary);
      const panel = createElement("div", { className: "v2-action-menu-panel" });
      actions.addEventListener("toggle", () => {
        if (!actions.open) return;
        for (const other of node.querySelectorAll(".v2-pattern-library-actions[open]")) {
          if (other !== actions) other.open = false;
        }
        queueMicrotask(() => {
          if (!actions.open || !actions.isConnected) return;
          const anchor = actionSummary.getBoundingClientRect();
          const menu = panel.getBoundingClientRect();
          const view = node.ownerDocument?.defaultView;
          const viewportWidth = view?.innerWidth ?? 0;
          const viewportHeight = view?.innerHeight ?? 0;
          const gap = 6;
          const edge = 8;
          const left = Math.max(edge, Math.min(
            anchor.right - menu.width,
            viewportWidth - menu.width - edge,
          ));
          const below = anchor.bottom + gap;
          const top = below + menu.height <= viewportHeight - edge
            ? below
            : Math.max(edge, anchor.top - menu.height - gap);
          panel.style.left = `${Math.round(left)}px`;
          panel.style.right = "auto";
          panel.style.top = `${Math.round(top)}px`;
        });
      }, { signal: lifecycle.signal });
      panel.addEventListener("click", (event) => {
        if (event.target.closest?.("button")) actions.open = false;
      }, { signal: lifecycle.signal });
      panel.append(createElement("button", {
        textContent: "Open Pattern",
        type: "button",
        onClick: () => onOpenPattern(pattern.id, destination.id),
      }));
      panel.append(createElement("button", {
        disabled: state.patterns.length >= 64,
        textContent: "Duplicate Pattern",
        type: "button",
        onClick: () => {
          try {
            const id = mutateProject(() => projectState.duplicatePattern(pattern.id));
            workspaceState.setActivePattern?.(id);
            announce(`Duplicated ${pattern.name}.`);
            render();
            focusPatternLibraryItem(id);
          } catch (error) {
            announce(error.message);
          }
        },
      }));
      panel.append(createElement("button", {
        textContent: "Rename Pattern",
        type: "button",
        onClick: () => {
          const name = globalThis.prompt?.("Pattern name", pattern.name);
          if (name === null || name === undefined) return;
          try {
            mutateProject(() => projectState.renamePattern(pattern.id, name));
            announce(`Renamed Pattern to ${projectState.getPattern(pattern.id).name}.`);
            render();
            focusPatternLibraryItem(pattern.id);
          } catch (error) {
            announce(error.message);
          }
        },
      }));
      panel.append(createElement("button", {
        className: "v2-danger-button",
        disabled: state.patterns.length === 1,
        textContent: "Delete Pattern",
        type: "button",
        onClick: async () => {
          if (!await confirmPatternDelete(pattern)) return;
          const patternIndex = state.patterns.findIndex(({ id }) => id === pattern.id);
          const focusId = state.patterns[patternIndex + 1]?.id
            ?? state.patterns[patternIndex - 1]?.id;

          try {
            mutateProject(() => projectState.deletePattern(pattern.id, { removeReferences: true }));
            announce(`Deleted ${pattern.name}.`);
            render();
            focusPatternLibraryItem(focusId);
          } catch (error) {
            announce(error.message);
          }
        },
      }));
      actions.append(panel);
      item.append(dragPattern, add, actions);
      return item;
    }
    list.append(createSelectedPatternCard());
    patternLibrary.append(libraryHeader, help, list);
  }

  function renderInspector() {
    clearElement(inspector);
    const state = project();
    const selection = selectedClipIds();
    const found = findClip(state, selectedClipId());
    const destination = state.tracks.find(({ id }) => id === destinationTrackId()) ?? state.tracks[0];
    if (!found) {
      const track = destination;
      inspector.append(createElement("p", { textContent: `${track.name} · insertion cursor ${formatTickPosition(cursorTick())}` }));
      if (state.tracks.every(({ clips }) => clips.length === 0)) {
        inspector.append(createElement("button", {
          className: "v2-primary-action",
          textContent: "Open Piano Roll",
          type: "button",
          onClick: () => onOpenPattern(patternToAddId(), track.id),
        }));
      }
      return;
    }
    if (selection.length > 1) {
      inspector.append(
        createElement("strong", { textContent: `${selection.length} Playlist clips selected` }),
        createElement("button", { textContent: "Open primary Pattern", type: "button", onClick: openSelected }),
        createElement("button", { textContent: "Move earlier", type: "button", onClick: () => moveSelected(-snapTicks, 0) }),
        createElement("button", { textContent: "Move later", type: "button", onClick: () => moveSelected(snapTicks, 0) }),
        createElement("button", {
          "aria-keyshortcuts": "Control+B Meta+B",
          textContent: "Duplicate right",
          type: "button",
          onClick: duplicateSelected,
        }),
        createElement("span", { textContent: "Drag any selected clip to move the complete selection." }),
      );
      return;
    }
    const pattern = state.patterns.find(({ id }) => id === found.clip.patternId);
    inspector.append(createElement("strong", { textContent: clipLabel(state, found.track, found.clip) }));
    const trackSelect = createElement("select", { "aria-label": "Selected clip Track" });
    for (const track of state.tracks) trackSelect.append(createElement("option", { textContent: track.name, value: track.id }));
    trackSelect.value = found.track.id;
    trackSelect.addEventListener("change", () => {
      const targetIndex = state.tracks.findIndex(({ id }) => id === trackSelect.value);
      rememberFocus({
        clipId: found.clip.id,
        tick: found.clip.startTick,
        trackId: trackSelect.value,
        trackIndex: targetIndex,
      });
      mutateProject(() => projectState.moveClip(
        found.clip.id,
        trackSelect.value,
        found.clip.startTick,
      ));
      setSession({ destinationTrackId: trackSelect.value, selectedClipId: found.clip.id });
      render();
    });
    inspector.append(createElement("label", {}, ["Track", trackSelect]));
    inspector.append(
      createElement("button", { textContent: "Open Pattern", type: "button", onClick: openSelected }),
      createElement("button", { textContent: "Move earlier", type: "button", onClick: () => moveSelected(-snapTicks, 0) }),
      createElement("button", { textContent: "Move later", type: "button", onClick: () => moveSelected(snapTicks, 0) }),
      createElement("button", {
        "aria-keyshortcuts": "Control+B Meta+B",
        textContent: "Duplicate",
        type: "button",
        onClick: duplicateSelected,
      }),
      createElement("button", { className: "v2-danger-button", textContent: "Delete clip", type: "button", onClick: removeSelected }),
    );
    inspector.append(createElement("span", {
      textContent: `${formatDurationTicks(pattern.lengthTicks)}, automatically sized to Pattern content`,
    }));
  }

  function updatePlayhead(frame = getTransportFrame?.()) {
    if (!playheadElement) return false;
    const fallback = workspaceState.getState().playback?.songPlayheadTick ?? 0;
    const tick = Number.isFinite(frame?.songTick) ? frame.songTick : fallback;
    playheadElement.style.translate = `${
      Math.max(0, Math.min(MAX_SONG_TICKS, tick)) * pixelsPerTick
    }px 0`;
    return true;
  }

  function renderTimeline() {
    if (disposed) return;
    closeTrackContextMenu();
    const state = project();
    snapTicks = SNAP_OPTIONS[session().snap] ?? SNAP_OPTIONS["1/16"];
    const selectedId = selectedClipId();
    const selectedIds = new Set(selectedClipIds());
    timeline.style.width = `${Math.max(900, TRACK_HEADER_WIDTH + MAX_SONG_TICKS * pixelsPerTick)}px`;
    timeline.style.height = `${
      46 + state.tracks.length * LANE_HEIGHT + ADD_INSTRUMENT_ROW_HEIGHT
    }px`;
    timeline.setAttribute("aria-rowcount", String(state.tracks.length + 1));
    playheadElement = null;
    clearElement(timeline);

    const ruler = createElement("div", {
      "aria-hidden": "true",
      className: "v2-playlist-ruler",
      role: "presentation",
      title: "Click to set the Song start position",
    });
    for (let tick = 0; tick <= MAX_SONG_TICKS; tick += 384) {
      ruler.append(createElement("span", {
        style: { left: `${TRACK_HEADER_WIDTH + tick * pixelsPerTick}px` },
        textContent: String(tick / 384 + 1),
      }));
    }
    timeline.append(ruler);

    state.tracks.forEach((track, trackIndex) => {
      const lane = createElement("div", {
        className: `v2-playlist-lane${track.id === destinationTrackId() ? " is-destination" : ""}`,
        dataset: { trackId: track.id },
        role: "row",
        "aria-rowindex": trackIndex + 1,
        style: { top: `${46 + trackIndex * LANE_HEIGHT}px` },
      });
      lane.addEventListener("dragover", (event) => {
        const patternId = getTransferredPatternId(event.dataTransfer);
        const dropTick = getSnappedPlaylistDropTick({
          clientX: event.clientX,
          pixelsPerTick,
          snapTicks,
          timelineLeft: timeline.getBoundingClientRect().left,
        });
        if (!patternId || dropTick === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        clearPatternDropTargets();
        lane.classList.add("is-pattern-drop-target");
      });
      lane.addEventListener("dragleave", (event) => {
        if (!lane.contains(event.relatedTarget)) lane.classList.remove("is-pattern-drop-target");
      });
      lane.addEventListener("drop", (event) => {
        const patternId = getTransferredPatternId(event.dataTransfer);
        const dropTick = getSnappedPlaylistDropTick({
          clientX: event.clientX,
          pixelsPerTick,
          snapTicks,
          timelineLeft: timeline.getBoundingClientRect().left,
        });
        event.preventDefault();
        event.stopPropagation();
        clearPatternDropTargets();
        draggedPatternId = null;
        if (!patternId || dropTick === null) return;
        workspaceState.setActivePattern?.(patternId);
        addPatternToTrack(patternId, track.id, dropTick, { exact: true });
      });
      const trackHeader = createElement("div", {
        "aria-label": track.name,
        className: "v2-playlist-track-header",
        dataset: { trackId: track.id },
        role: "rowheader",
      });
      const trackFocus = createElement("button", {
        "aria-label": `Use ${track.name} as the Playlist destination`,
        "aria-pressed": String(track.id === destinationTrackId()),
        className: "v2-playlist-track-focus",
        dataset: { playlistTrackAction: "select", trackId: track.id },
        tabIndex: -1,
        title: `Use ${track.name} as the destination for new Playlist clips`,
        type: "button",
      }, [
        createElement("span", { textContent: track.name, title: track.name }),
        createElement("small", {
          textContent: track.id === destinationTrackId() ? "Destination" : "Choose track",
        }),
      ]);
      trackFocus.addEventListener("click", () => {
        rememberFocus({ clipId: null, trackAction: "select", trackId: track.id, trackIndex });
        setSession({ destinationTrackId: track.id, selectedClipId: null });
        announce(`${track.name} is the destination for new Playlist clips.`);
        render();
      });
      const instrument = createElement("button", {
        "aria-label": `Open ${track.name} Klinto Chip instrument`,
        className: "v2-device-launcher v2-playlist-instrument",
        dataset: { playlistTrackAction: "instrument", trackId: track.id },
        tabIndex: -1,
        title: `Open ${track.name} Klinto Chip instrument`,
        type: "button",
        onClick: (event) => onOpenInstrument(track.id, event.currentTarget),
      }, [
        createElement("span", { textContent: track.name, title: track.name }),
        createElement("small", { textContent: "Klinto Chip" }),
      ]);
      const toggleTrackSwitch = (field, trackAction) => {
        const current = projectState.getTrack(track.id);
        const next = !current.mixer[field];
        rememberFocus({
          clipId: null,
          tick: cursorTick(),
          trackAction,
          trackId: track.id,
          trackIndex,
        });
        mutateProject(() => projectState.setTrackMixer(track.id, { [field]: next }));
        announce(field === "muted"
          ? `${current.name} ${next ? "muted" : "unmuted"}.`
          : `${current.name} Solo ${next ? "on" : "off"}.`);
        render();
      };
      const mute = createElement("button", {
        "aria-label": `Mute ${track.name} Instrument`,
        "aria-pressed": String(track.mixer.muted),
        dataset: { playlistTrackAction: "mute", trackId: track.id },
        tabIndex: -1,
        textContent: "M",
        title: `${track.mixer.muted ? "Unmute" : "Mute"} ${track.name}`,
        type: "button",
        onClick: () => toggleTrackSwitch("muted", "mute"),
      });
      const solo = createElement("button", {
        "aria-label": `Solo ${track.name} Instrument`,
        "aria-pressed": String(track.mixer.solo),
        dataset: { playlistTrackAction: "solo", trackId: track.id },
        tabIndex: -1,
        textContent: "S",
        title: `${track.mixer.solo ? "Disable Solo for" : "Solo"} ${track.name}`,
        type: "button",
        onClick: () => toggleTrackSwitch("solo", "solo"),
      });
      for (const toggle of [mute, solo]) {
        toggle.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
      }
      const reorderTrack = (delta, trackAction) => {
        rememberFocus({
          clipId: null,
          tick: cursorTick(),
          trackAction,
          trackId: track.id,
          trackIndex: trackIndex + delta,
        });
        mutateProject(() => projectState.moveTrack(track.id, delta));
        render();
      };
      const up = createElement("button", {
        "aria-label": `Move ${track.name} up`,
        dataset: { playlistTrackAction: "move-up", trackId: track.id },
        tabIndex: -1,
        disabled: trackIndex === 0,
        textContent: "↑",
        type: "button",
        onClick: () => reorderTrack(-1, "move-up"),
      });
      const down = createElement("button", {
        "aria-label": `Move ${track.name} down`,
        dataset: { playlistTrackAction: "move-down", trackId: track.id },
        tabIndex: -1,
        disabled: trackIndex === state.tracks.length - 1,
        textContent: "↓",
        type: "button",
        onClick: () => reorderTrack(1, "move-down"),
      });
      const remove = createElement("button", {
        "aria-label": `Remove ${track.name}`,
        dataset: { playlistTrackAction: "remove", trackId: track.id },
        tabIndex: -1,
        disabled: state.tracks.length === 1,
        textContent: "×",
        type: "button",
      });
      remove.addEventListener("click", async () => {
        if (!await confirmTrackRemoval(track)) return;
        const selected = findClip(state, selectedId);
        rememberFocus({
          clipId: selectedId,
          tick: selected?.clip.startTick ?? cursorTick(),
          trackId: track.id,
          trackIndex,
        });
        mutateProject(() => projectState.removeTrack(track.id, { allowClips: true }));
        render();
      });
      const trackActionRail = createElement("div", {
        className: "v2-playlist-track-actions",
      }, [
        createElement("div", {
          className: "v2-playlist-track-switches",
        }, [mute, solo]),
        createElement("div", {
          className: "v2-playlist-track-management",
        }, [up, down, remove]),
      ]);
      trackHeader.append(trackFocus, instrument, trackActionRail);
      lane.append(trackHeader);

      for (const clip of track.clips) {
        const pattern = state.patterns.find(({ id }) => id === clip.patternId);
        const isSelected = selectedIds.has(clip.id);
        const button = createElement("button", {
          className: `v2-playlist-clip${isSelected ? " is-selected" : ""}`,
          id: `v2-playlist-clip-${clip.id}`,
          dataset: { clipId: clip.id, trackId: track.id },
          role: "gridcell",
          tabIndex: -1,
          type: "button",
          "aria-label": `${clipLabel(state, track, clip)}${isSelected ? ", selected" : ""}`,
          "aria-selected": String(isSelected),
          style: {
            left: `${TRACK_HEADER_WIDTH + clip.startTick * pixelsPerTick}px`,
            width: `${Math.max(8, pattern.lengthTicks * pixelsPerTick)}px`,
          },
        }, [createElement("strong", { textContent: pattern.name }), createElement("small", { textContent: formatDurationTicks(pattern.lengthTicks) })]);
        const found = { clip, track };
        bindClipPointer(button, found);
        const activation = createPlaylistPatternActivation({
          onOpen: () => onOpenPattern(pattern.id, track.id),
          onSelect: () => {
            if (!button.isConnected) return;
            const current = selectedClipIds();
            if (current.length > 1 && current.includes(clip.id)) {
              selectClips(current, { primaryId: clip.id });
            } else {
              selectClip(clip.id);
            }
          },
        });
        button.addEventListener("click", (event) => {
          if (consumeSuppressedPlaylistClick(event)) return;
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            activation.cancel();
            toggleClipSelection(clip.id);
            return;
          }
          activation.click(event.detail);
        });
        button.addEventListener("dblclick", (event) => {
          event.preventDefault();
          activation.doubleClick();
        });
        lane.append(button);
      }
      timeline.append(lane);
    });

    const addInstrumentRow = createElement("div", {
      "aria-label": "Add Instrument",
      "aria-rowindex": state.tracks.length + 1,
      className: "v2-playlist-add-instrument-row",
      role: "row",
      style: { top: `${46 + state.tracks.length * LANE_HEIGHT}px` },
    }, [
      createElement("div", {
        className: "v2-playlist-add-instrument-cell",
        role: "gridcell",
      }, [createAddInstrumentButton()]),
    ]);
    timeline.append(addInstrumentRow);

    const destinationIndex = state.tracks.findIndex(({ id }) => id === destinationTrackId());
    const destinationLane = timeline.querySelector(
      `.v2-playlist-lane[data-track-id="${selectorId(destinationTrackId())}"]`,
    );
    const cursor = createElement("div", {
      className: "v2-playlist-cursor",
      id: "v2-playlist-cursor",
      role: "gridcell",
      "aria-label": `${formatTickPosition(cursorTick())}, ${projectState.getTrack(destinationTrackId()).name}`,
      style: {
        bottom: "auto",
        height: `${1 + state.tracks.length * LANE_HEIGHT}px`,
        left: `${TRACK_HEADER_WIDTH + cursorTick() * pixelsPerTick}px`,
        top: `${-1 - destinationIndex * LANE_HEIGHT}px`,
      },
    });
    destinationLane.append(cursor);
    playheadElement = createElement("div", {
      "aria-hidden": "true",
      className: "v2-playlist-playhead",
      role: "presentation",
      style: {
        bottom: "auto",
        height: `${1 + state.tracks.length * LANE_HEIGHT}px`,
        left: `${TRACK_HEADER_WIDTH}px`,
      },
    });
    timeline.append(playheadElement);
    timeline.setAttribute("aria-activedescendant", selectedId ? `v2-playlist-clip-${selectedId}` : cursor.id);
    updatePlayhead();
    renderInspector();
    restorePendingFocus();
  }

  function render() {
    if (trackContextMenu?.menu.contains(node.ownerDocument?.activeElement) && trackContextTrackId) {
      rememberFocus({
        clipId: null,
        trackAction: trackContextReturnFocus?.dataset?.playlistTrackAction ?? "select",
        trackId: trackContextTrackId,
      });
    }
    captureFocusPreference();
    renderHeader();
    renderPatternLibrary();
    renderTimeline();
  }

  timeline.addEventListener("keydown", handleTimelineKeyDown, { signal: lifecycle.signal });
  timeline.addEventListener("pointerdown", startMarquee, { signal: lifecycle.signal });
  timeline.addEventListener("pointermove", updateMarquee, { signal: lifecycle.signal });
  timeline.addEventListener("pointerup", finishMarquee, { signal: lifecycle.signal });
  timeline.addEventListener("pointercancel", finishMarquee, { signal: lifecycle.signal });
  timeline.addEventListener("click", (event) => {
    if (consumeSuppressedPlaylistClick(event)) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.target.closest?.("button, input, select, textarea")) return;
    const rulerSeekTick = getPlaylistRulerSeekTick(event, {
      pixelsPerTick,
      snapTicks,
      timelineLeft: timeline.getBoundingClientRect().left,
    });
    if (rulerSeekTick !== null) {
      event.preventDefault();
      seekSong(rulerSeekTick);
      return;
    }
    const lane = event.target.closest?.(".v2-playlist-lane");
    if (!lane?.dataset.trackId) return;
    const dropTick = getSnappedPlaylistDropTick({
      clientX: event.clientX,
      pixelsPerTick,
      snapTicks,
      timelineLeft: timeline.getBoundingClientRect().left,
    });
    if (dropTick === null) return;
    addPatternToTrack(patternToAddId(), lane.dataset.trackId, dropTick, { exact: true });
  }, { signal: lifecycle.signal });
  timeline.addEventListener("contextmenu", (event) => {
    routePlaylistContextMenu(event, {
      onClip: (clipId, _contextEvent, clip) => {
        clip.focus({ preventScroll: true });
        removeClip(clipId);
      },
      onInstrument: (trackId, contextEvent) => openTrackContextMenu(
        contextEvent,
        trackId,
        { instrumentTarget: true },
      ),
      onTrack: (trackId, contextEvent) => openTrackContextMenu(contextEvent, trackId),
    });
  }, { signal: lifecycle.signal });
  node.ownerDocument?.addEventListener?.("pointerdown", (event) => {
    if (!event.target.closest?.(".v2-playlist-track-context-menu")) {
      closeTrackContextMenu();
    }
    if (event.target.closest?.(".v2-pattern-library-actions")) return;
    for (const actions of node.querySelectorAll(".v2-pattern-library-actions[open]")) {
      actions.open = false;
    }
  }, { capture: true, signal: lifecycle.signal });
  node.ownerDocument?.addEventListener?.("keydown", (event) => {
    if (event.key !== "Escape" || !trackContextMenu || trackContextMenu.menu.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    closeTrackContextMenu({ restoreFocus: true });
  }, { signal: lifecycle.signal });
  scroller.addEventListener("scroll", () => closeTrackContextMenu({
    restoreFocus: Boolean(trackContextMenu?.menu.contains(node.ownerDocument?.activeElement)),
  }), {
    signal: lifecycle.signal,
  });
  node.ownerDocument?.defaultView?.addEventListener?.("resize", () => closeTrackContextMenu({
    restoreFocus: Boolean(trackContextMenu?.menu.contains(node.ownerDocument?.activeElement)),
  }), {
    signal: lifecycle.signal,
  });
  const replacementOperations = new Set(["open-project", "replace", "create-project-from-template"]);
  const handleProjectChange = (event) => {
    if (localProjectMutationDepth > 0 || replacementOperations.has(event?.detail?.operation)) return;
    render();
  };
  const handleWorkspaceChange = (event) => {
    if (localWorkspaceMutationDepth > 0 || localProjectMutationDepth > 0) return;
    const renderedPatternId = patternLibrary.querySelector(".v2-pattern-library-item")?.dataset.patternLibraryId;
    if (renderedPatternId !== patternToAddId()) {
      renderPatternLibrary();
      return;
    }
    const type = event?.detail?.action?.type ?? "";
    if (type === "playlist/update"
      || type === "playback/seek-song"
      || type.startsWith("project/")
      || type.endsWith("/repair")) {
      render();
    }
  };
  const handleTransportFrame = (event) => updatePlayhead(event.detail);
  projectState.addEventListener("change", handleProjectChange);
  workspaceState.addEventListener?.("change", handleWorkspaceChange);
  transportFrameSource?.addEventListener?.("transportframe", handleTransportFrame, {
    signal: lifecycle.signal,
  });
  render();

  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      closeTrackContextMenu();
      trackContextMenu?.menu.remove();
      lifecycle.abort();
      projectState.removeEventListener("change", handleProjectChange);
      workspaceState.removeEventListener?.("change", handleWorkspaceChange);
      node.remove();
    },
    focus: () => title.focus({ preventScroll: true }),
    node,
    render,
  });
}
