import { clearElement, createElement } from "./dom.js";
import { formatDurationTicks, formatTickPosition } from "./music-format.js";

const MAX_SONG_TICKS = 6144;
const SNAP_OPTIONS = Object.freeze({ "1/8": 48, "1/16": 24, "1/32": 12 });
const LANE_HEIGHT = 66;
const TRACK_HEADER_WIDTH = 210;
const TRACK_ACTION_ORDER = Object.freeze(["select", "instrument", "move-up", "move-down", "remove"]);

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
  confirmTrackRemoval = async () => true,
  onOpenInstrument = () => {},
  onOpenPattern = () => {},
  onSeek = (tick) => tick,
  onTransportToggle = () => {},
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

  const title = createElement("h2", { id: "v2-playlist-title", className: "v2-surface-title", textContent: "Playlist", tabIndex: -1 });
  const header = createElement("div", { className: "v2-surface-header v2-playlist-header" });
  const timeline = createElement("div", {
    className: "v2-playlist-timeline",
    role: "grid",
    tabIndex: 0,
    "aria-label": "Playlist timeline",
    "aria-describedby": "v2-playlist-help",
    "aria-keyshortcuts": "Home S",
  });
  const scroller = createElement("div", { className: "v2-playlist-scroll" }, [timeline]);
  const inspector = createElement("aside", { className: "v2-clip-inspector", "aria-label": "Playlist selection" });
  const help = createElement("p", {
    className: "v2-editor-help",
    id: "v2-playlist-help",
    textContent: "Arrow keys move the insertion cursor. S or an empty-timeline click seeks the Song. Enter selects or opens a clip. Alt with arrows moves a selected clip. Home enters Track actions; Escape returns to the timeline.",
  });
  const node = createElement("section", {
    className: "v2-primary-surface v2-playlist",
    "aria-labelledby": title.id,
    dataset: { primarySurface: "playlist" },
  }, [header, scroller, inspector, help]);

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

  function cursorTick() {
    return Math.max(0, Math.min(MAX_SONG_TICKS - snapTicks, session().cursorTick ?? 0));
  }

  function destinationTrackId() {
    const state = project();
    const candidate = session().destinationTrackId;
    return state.tracks.some(({ id }) => id === candidate) ? candidate : state.tracks[0].id;
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

  function selectClip(clipId, { focus = false } = {}) {
    const found = clipId ? findClip(project(), clipId) : null;
    if (!found) {
      setSession({ selectedClipId: null });
      render();
      return false;
    }
    rememberFocus({ clipId, tick: found.clip.startTick, trackAction: null, trackId: found.track.id });
    setSession({
      selectedClipId: clipId,
      cursorTick: found.clip.startTick,
      destinationTrackId: found.track.id,
    });
    announce(`${clipLabel(project(), found.track, found.clip)}, selected.`);
    render();
    if (focus) node.querySelector(`[data-clip-id="${CSS.escape(clipId)}"]`)?.focus({ preventScroll: true });
    return true;
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

  function moveSelected(deltaTick, deltaTrack, clipId = selectedClipId()) {
    const state = project();
    const found = findClip(state, clipId);
    if (!found) return false;
    const currentTrackIndex = state.tracks.findIndex(({ id }) => id === found.track.id);
    const targetIndex = currentTrackIndex + deltaTrack;
    if (targetIndex < 0 || targetIndex >= state.tracks.length) {
      throw new RangeError("That clip cannot move beyond the first or final Track.");
    }
    const target = state.tracks[targetIndex];
    const startTick = found.clip.startTick + deltaTick;
    rememberFocus({ clipId: found.clip.id, tick: startTick, trackId: target.id, trackIndex: targetIndex });
    mutateProject(() => projectState.moveClip(found.clip.id, target.id, startTick));
    setSession({ cursorTick: startTick, destinationTrackId: target.id, selectedClipId: found.clip.id });
    render();
    return true;
  }

  function duplicateSelected() {
    const id = selectedClipId();
    if (!id) return false;
    const created = mutateProject(() => projectState.duplicateClip(id));
    const resultId = typeof created === "string" ? created : created.clipId;
    selectClip(resultId, { focus: true });
    return true;
  }

  function removeSelected() {
    const id = selectedClipId();
    if (!id) return false;
    const state = project();
    const before = findClip(state, id);
    const trackIndex = state.tracks.findIndex(({ id: trackId }) => trackId === before?.track.id);
    rememberFocus({
      clipId: id,
      tick: before?.clip.startTick ?? cursorTick(),
      trackId: before?.track.id,
      trackIndex,
    });
    mutateProject(() => projectState.removeClip(id));
    setSession({ selectedClipId: null, cursorTick: before?.clip.startTick ?? cursorTick() });
    announce("Clip deleted.");
    render();
    return true;
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
      const selected = Boolean(selectedClipId());
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
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selected) {
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

  function bindClipPointer(button, found) {
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const originX = event.clientX;
      const originY = event.clientY;
      let deltaTick = 0;
      let deltaTrack = 0;
      button.setPointerCapture?.(event.pointerId);
      const move = (moveEvent) => {
        deltaTick = Math.round((moveEvent.clientX - originX) / pixelsPerTick / snapTicks) * snapTicks;
        deltaTrack = Math.round((moveEvent.clientY - originY) / LANE_HEIGHT);
        button.style.translate = `${deltaTick * pixelsPerTick}px ${deltaTrack * LANE_HEIGHT}px`;
      };
      const finish = (finishEvent) => {
        button.removeEventListener("pointermove", move);
        button.removeEventListener("pointerup", finish);
        button.removeEventListener("pointercancel", finish);
        button.style.translate = "";
        if (finishEvent.type !== "pointerup" || (deltaTick === 0 && deltaTrack === 0)) return;
        try {
          setSession({
            cursorTick: found.clip.startTick,
            destinationTrackId: found.track.id,
            selectedClipId: found.clip.id,
          });
          moveSelected(deltaTick, deltaTrack, found.clip.id);
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

  function renderHeader() {
    clearElement(header);
    header.append(title);
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
    const tracks = project().tracks;
    const addTrack = createElement("button", {
      disabled: tracks.length >= 8,
      textContent: "Add Track",
      title: tracks.length >= 8 ? "A Project supports at most eight Tracks" : "Add Track",
      type: "button",
      onClick: () => {
        const id = mutateProject(() => projectState.addTrack());
        rememberFocus({ trackId: id, trackIndex: project().tracks.length - 1 });
        setSession({ destinationTrackId: id, selectedClipId: null });
        render();
      },
    });
    header.append(
      createElement("label", {}, ["Snap", snap]),
      createElement("button", { textContent: "Zoom out", type: "button", onClick: () => { pixelsPerTick = Math.max(0.12, pixelsPerTick - 0.06); renderTimeline(); } }),
      createElement("button", { textContent: "Zoom in", type: "button", onClick: () => { pixelsPerTick = Math.min(1.1, pixelsPerTick + 0.06); renderTimeline(); } }),
      createElement("button", { textContent: "Fit song", type: "button", onClick: () => { pixelsPerTick = Math.max(0.12, (scroller.clientWidth - TRACK_HEADER_WIDTH) / Math.max(384, projectState.getArrangementEndTick?.() ?? MAX_SONG_TICKS)); renderTimeline(); } }),
      addTrack,
    );
  }

  function renderInspector() {
    clearElement(inspector);
    const state = project();
    const found = findClip(state, selectedClipId());
    if (!found) {
      const track = state.tracks.find(({ id }) => id === destinationTrackId()) ?? state.tracks[0];
      inspector.append(createElement("p", { textContent: `${track.name} · insertion cursor ${formatTickPosition(cursorTick())}` }));
      inspector.append(createElement("button", {
        textContent: "Seek Song here",
        type: "button",
        onClick: () => seekSong(cursorTick(), track.id),
      }));
      if (state.tracks.every(({ clips }) => clips.length === 0)) {
        inspector.append(createElement("button", {
          className: "v2-primary-action",
          textContent: "Open Piano Roll",
          type: "button",
          onClick: () => onOpenPattern(state.patterns[0].id, track.id),
        }));
      }
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
    inspector.append(createElement("button", { textContent: "Seek to clip", type: "button", onClick: () => seekSong(found.clip.startTick, found.track.id) }));
    inspector.append(
      createElement("button", { textContent: "Open Pattern", type: "button", onClick: openSelected }),
      createElement("button", { textContent: "Move earlier", type: "button", onClick: () => moveSelected(-snapTicks, 0) }),
      createElement("button", { textContent: "Move later", type: "button", onClick: () => moveSelected(snapTicks, 0) }),
      createElement("button", { textContent: "Duplicate", type: "button", onClick: duplicateSelected }),
      createElement("button", { className: "v2-danger-button", textContent: "Delete clip", type: "button", onClick: removeSelected }),
    );
    inspector.append(createElement("span", { textContent: `${pattern.lengthTicks} ticks, linked` }));
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
    const state = project();
    snapTicks = SNAP_OPTIONS[session().snap] ?? SNAP_OPTIONS["1/16"];
    const selectedId = selectedClipId();
    timeline.style.width = `${Math.max(900, TRACK_HEADER_WIDTH + MAX_SONG_TICKS * pixelsPerTick)}px`;
    timeline.style.height = `${46 + state.tracks.length * LANE_HEIGHT}px`;
    timeline.setAttribute("aria-rowcount", String(state.tracks.length));
    playheadElement = null;
    clearElement(timeline);

    const ruler = createElement("div", { className: "v2-playlist-ruler", role: "presentation", "aria-hidden": "true" });
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
      const trackHeader = createElement("div", {
        "aria-label": track.name,
        className: "v2-playlist-track-header",
        dataset: { trackId: track.id },
        role: "rowheader",
      });
      const trackFocus = createElement("button", {
        className: "v2-playlist-track-focus",
        dataset: { playlistTrackAction: "select", trackId: track.id },
        tabIndex: -1,
        textContent: track.name,
        type: "button",
      });
      trackFocus.addEventListener("click", () => {
        rememberFocus({ clipId: null, trackAction: "select", trackId: track.id, trackIndex });
        setSession({ destinationTrackId: track.id, selectedClipId: null });
        render();
      });
      const instrument = createElement("button", {
        "aria-label": `Open ${track.name} Klinto Chip`,
        className: "v2-device-launcher v2-playlist-instrument",
        dataset: { playlistTrackAction: "instrument", trackId: track.id },
        tabIndex: -1,
        textContent: "Chip",
        type: "button",
        onClick: (event) => onOpenInstrument(track.id, event.currentTarget),
      });
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
      trackHeader.append(trackFocus, instrument, up, down, remove);
      lane.append(trackHeader);

      for (const clip of track.clips) {
        const pattern = state.patterns.find(({ id }) => id === clip.patternId);
        const button = createElement("button", {
          className: `v2-playlist-clip${selectedId === clip.id ? " is-selected" : ""}`,
          id: `v2-playlist-clip-${clip.id}`,
          dataset: { clipId: clip.id, trackId: track.id },
          role: "gridcell",
          tabIndex: -1,
          type: "button",
          "aria-label": `${clipLabel(state, track, clip)}${selectedId === clip.id ? ", selected" : ""}`,
          "aria-selected": String(selectedId === clip.id),
          style: {
            left: `${TRACK_HEADER_WIDTH + clip.startTick * pixelsPerTick}px`,
            width: `${Math.max(24, pattern.lengthTicks * pixelsPerTick)}px`,
          },
        }, [createElement("strong", { textContent: pattern.name }), createElement("small", { textContent: formatDurationTicks(pattern.lengthTicks) })]);
        const found = { clip, track };
        bindClipPointer(button, found);
        button.addEventListener("click", () => selectClip(clip.id));
        button.addEventListener("dblclick", () => onOpenPattern(pattern.id, track.id));
        lane.append(button);
      }
      timeline.append(lane);
    });

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
      style: { left: `${TRACK_HEADER_WIDTH}px` },
    });
    timeline.append(playheadElement);
    timeline.setAttribute("aria-activedescendant", selectedId ? `v2-playlist-clip-${selectedId}` : cursor.id);
    updatePlayhead();
    renderInspector();
    restorePendingFocus();
  }

  function render() {
    captureFocusPreference();
    renderHeader();
    renderTimeline();
  }

  timeline.addEventListener("keydown", handleTimelineKeyDown, { signal: lifecycle.signal });
  timeline.addEventListener("click", (event) => {
    if (event.target.closest?.("button, input, select, textarea")) return;
    const bounds = timeline.getBoundingClientRect();
    const horizontal = event.clientX - bounds.left - TRACK_HEADER_WIDTH;
    if (horizontal < 0) return;
    const rawTick = Math.round(horizontal / pixelsPerTick / snapTicks) * snapTicks;
    const lane = event.target.closest?.(".v2-playlist-lane");
    seekSong(
      Math.max(0, Math.min(MAX_SONG_TICKS - snapTicks, rawTick)),
      lane?.dataset.trackId ?? destinationTrackId(),
    );
  }, { signal: lifecycle.signal });
  const replacementOperations = new Set(["open-project", "replace", "create-project-from-template"]);
  const handleProjectChange = (event) => {
    if (localProjectMutationDepth > 0 || replacementOperations.has(event?.detail?.operation)) return;
    render();
  };
  const handleWorkspaceChange = (event) => {
    if (localWorkspaceMutationDepth > 0 || localProjectMutationDepth > 0) return;
    const type = event?.detail?.action?.type ?? "";
    if (type === "playlist/update" || type.startsWith("project/") || type.endsWith("/repair")) {
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
