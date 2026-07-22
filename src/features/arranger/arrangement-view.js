import {
  MAX_ARRANGEMENT_STEPS,
  MAX_PROJECT_TRACKS,
} from "../../state/project-state.js";
import { queryRequired } from "../../shared/query-required.js";
import { getTrackColour, getVoiceLabel } from "../../shared/track-presentation.js";
import { createClipDragController, getTimelineStep } from "./clip-drag-controller.js";

const STEP_WIDTH = 14;

function formatPan(value) {
  const amount = Math.round(Math.abs(value) * 100);
  if (amount === 0) return "C";
  return `${value < 0 ? "L" : "R"}${amount}`;
}

function createButton(root, label, action, trackId) {
  const button = root.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  if (trackId) button.dataset.trackId = trackId;
  button.textContent = label;
  return button;
}

function createTrackDeleteDialog(root) {
  const overlay = root.createElement("dialog");
  overlay.className = "track-delete-dialog";
  overlay.setAttribute("aria-labelledby", "track-delete-title");
  overlay.setAttribute("aria-describedby", "track-delete-message");

  const panel = root.createElement("div");
  panel.className = "track-delete-dialog-panel";
  const context = root.createElement("span");
  context.className = "panel-context";
  context.textContent = "Confirm removal";
  const title = root.createElement("h2");
  title.id = "track-delete-title";
  title.textContent = "Remove track?";
  const message = root.createElement("p");
  message.id = "track-delete-message";
  const actions = root.createElement("div");
  actions.className = "track-delete-dialog-actions";
  const cancel = root.createElement("button");
  cancel.type = "button";
  cancel.className = "safe-action";
  cancel.textContent = "Keep track";
  const confirm = root.createElement("button");
  confirm.type = "button";
  confirm.className = "neutral-action";
  confirm.textContent = "Remove track";
  actions.append(confirm, cancel);
  panel.append(context, title, message, actions);
  overlay.append(panel);
  return Object.freeze({ cancel, confirm, message, overlay, panel });
}

function createClipContextMenu(root) {
  const menu = root.createElement("div");
  menu.className = "clip-context-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  const newPattern = root.createElement("button");
  newPattern.type = "button";
  newPattern.setAttribute("role", "menuitem");
  const variation = root.createElement("button");
  variation.type = "button";
  variation.setAttribute("role", "menuitem");
  variation.textContent = "Create variation";
  menu.append(newPattern, variation);
  return Object.freeze({ menu, newPattern, variation });
}

export function createArrangementView({
  onBeforeSelectionChange = () => {},
  onError = () => {},
  onSeek = () => {},
  projectState,
  root = document,
  sessionState,
}) {
  const lifecycle = new AbortController();
  const deleteDialog = createTrackDeleteDialog(root);
  const clipContextMenu = createClipContextMenu(root);
  const dialogHost = root.body ?? root;
  dialogHost.append(deleteDialog.overlay, clipContextMenu.menu);
  const addTrack = root.createElement("button");
  addTrack.id = "add-track";
  addTrack.className = "add-track";
  addTrack.type = "button";
  addTrack.textContent = "+ Add track";
  const elements = {
    addTrack,
    canvas: queryRequired(root, "#arrangement-canvas"),
    empty: queryRequired(root, "#arrangement-empty"),
    scroll: queryRequired(root, ".arrangement-scroll"),
    trackDown: queryRequired(root, "#selected-track-down"),
    trackMenu: queryRequired(root, "#selected-track-menu"),
    trackName: queryRequired(root, "#selected-track-name"),
    trackRemove: queryRequired(root, "#selected-track-remove"),
    trackUp: queryRequired(root, "#selected-track-up"),
  };
  let activeRangeTrackId = null;
  let contextClipId = null;
  let contextPlacement = null;
  let dialogReturnFocus = null;
  let pendingTrackId = null;
  let playheadStepIndex = sessionState.getState().workspace.arrangementStartStep;
  let playbackStatus = "stopped";

  function getWorkspace() {
    return sessionState.getState().workspace;
  }

  function selectTrack(trackId, values = {}) {
    const workspace = getWorkspace();
    if (trackId !== workspace.selectedTrackId || values.selectedPatternId) onBeforeSelectionChange();
    const opensEditor = values.activeDockPanel !== undefined;
    sessionState.setWorkspace({
      selectedTrackId: trackId,
      ...(opensEditor ? { detailPanelCollapsed: false } : {}),
      ...values,
    });
  }

  function createRuler() {
    const row = root.createElement("div");
    row.className = "arrangement-ruler-row";
    const label = root.createElement("div");
    label.className = "arrangement-ruler-label";
    const labelText = root.createElement("span");
    labelText.textContent = "Tracks";
    const count = root.createElement("small");
    count.textContent = `${projectState.getState().tracks.length}/${MAX_PROJECT_TRACKS}`;
    const labelMeta = root.createElement("span");
    labelMeta.className = "arrangement-ruler-meta";
    labelMeta.append(count);
    label.append(labelText, labelMeta);
    const ruler = root.createElement("div");
    ruler.className = "arrangement-ruler";
    ruler.dataset.action = "seek-arrangement";
    ruler.tabIndex = 0;
    ruler.setAttribute("role", "slider");
    ruler.setAttribute("aria-label", "Arrangement start position");
    ruler.setAttribute("aria-valuemin", "1");
    ruler.setAttribute("aria-valuemax", String(MAX_ARRANGEMENT_STEPS));
    ruler.setAttribute("aria-valuenow", String(playheadStepIndex + 1));
    ruler.style.width = `${MAX_ARRANGEMENT_STEPS * STEP_WIDTH}px`;
    for (let step = 0; step < MAX_ARRANGEMENT_STEPS; step += 16) {
      const marker = root.createElement("span");
      marker.className = "arrangement-ruler-marker";
      marker.style.left = `${step * STEP_WIDTH}px`;
      marker.textContent = String(step + 1).padStart(3, "0");
      ruler.append(marker);
    }
    const playhead = root.createElement("span");
    playhead.className = "arrangement-ruler-playhead";
    playhead.classList.toggle("playing", playbackStatus === "playing");
    playhead.style.left = `${playheadStepIndex * STEP_WIDTH}px`;
    playhead.setAttribute("aria-hidden", "true");
    ruler.append(playhead);
    row.append(label, ruler);
    return row;
  }

  function createAddTrackRow() {
    const row = root.createElement("div");
    row.className = "arrangement-add-track-row";
    const action = root.createElement("div");
    action.className = "arrangement-add-track-cell";
    action.append(elements.addTrack);
    const timeline = root.createElement("div");
    timeline.className = "arrangement-add-track-timeline";
    timeline.setAttribute("aria-hidden", "true");
    row.append(action, timeline);
    return row;
  }

  function createTrackHeader(track, trackIndex, selected, canRemove) {
    const header = root.createElement("div");
    header.className = "track-header";
    header.dataset.trackId = track.id;

    const primary = root.createElement("div");
    primary.className = "track-primary";
    const channel = root.createElement("span");
    channel.className = "track-channel";
    channel.textContent = `Track ${trackIndex + 1}`;
    const switches = root.createElement("div");
    switches.className = "track-switches";
    const mute = createButton(root, "M", "mute-track", track.id);
    mute.classList.toggle("active", track.mixer.muted);
    mute.setAttribute("aria-pressed", String(track.mixer.muted));
    mute.setAttribute("aria-label", `Mute ${track.name}`);
    const solo = createButton(root, "S", "solo-track", track.id);
    solo.classList.toggle("active", track.mixer.solo);
    solo.setAttribute("aria-pressed", String(track.mixer.solo));
    solo.setAttribute("aria-label", `Solo ${track.name}`);
    switches.append(mute, solo);
    const remove = createButton(root, "\u00d7", "remove-track", track.id);
    remove.className = "track-remove";
    remove.disabled = !canRemove;
    remove.setAttribute("aria-label", `Remove ${track.name}`);
    remove.title = canRemove ? `Remove ${track.name}` : "The project must keep one track";
    primary.append(channel, switches, remove);

    const name = root.createElement("input");
    name.className = "track-name-input";
    name.type = "text";
    name.maxLength = 32;
    name.value = track.name;
    name.dataset.action = "rename-track";
    name.dataset.trackId = track.id;
    name.setAttribute("aria-label", `Rename ${track.name}`);

    const secondary = root.createElement("div");
    secondary.className = "track-secondary";
    const voice = root.createElement("small");
    voice.textContent = getVoiceLabel(track.instrument.voiceType);
    const volume = root.createElement("label");
    volume.className = "track-volume";
    const volumeText = root.createElement("span");
    volumeText.className = "track-volume-value";
    volumeText.textContent = `${Math.round(track.mixer.volume * 100)}%`;
    const range = root.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.value = String(track.mixer.volume * 100);
    range.dataset.action = "track-volume";
    range.dataset.trackId = track.id;
    range.setAttribute("aria-label", `${track.name} volume`);
    volume.append(range, volumeText);
    const pan = root.createElement("label");
    pan.className = "track-pan";
    const panText = root.createElement("span");
    panText.className = "track-pan-value";
    panText.textContent = formatPan(track.mixer.pan);
    const panRange = root.createElement("input");
    panRange.type = "range";
    panRange.min = "-100";
    panRange.max = "100";
    panRange.step = "1";
    panRange.value = String(track.mixer.pan * 100);
    panRange.dataset.action = "track-pan";
    panRange.dataset.trackId = track.id;
    panRange.setAttribute("aria-label", `${track.name} pan`);
    panRange.title = `${track.name} pan: ${formatPan(track.mixer.pan)}`;
    pan.append(panRange, panText);
    secondary.append(voice, volume, pan);
    header.append(primary, name, secondary);
    return header;
  }
  function createLane(track, patterns, selectedClipId) {
    const lane = root.createElement("div");
    lane.className = "track-lane";
    lane.dataset.trackId = track.id;
    lane.style.width = `${MAX_ARRANGEMENT_STEPS * STEP_WIDTH}px`;
    lane.setAttribute("aria-label", `${track.name} arrangement lane`);
    for (const clip of track.clips) {
      const pattern = patterns.get(clip.patternId);
      const clipElement = root.createElement("div");
      clipElement.className = "arrangement-clip";
      clipElement.classList.toggle("selected", clip.id === selectedClipId);
      clipElement.dataset.action = "select-clip";
      clipElement.dataset.clipId = clip.id;
      clipElement.dataset.patternId = clip.patternId;
      clipElement.dataset.trackId = track.id;
      clipElement.style.left = `${clip.startStep * STEP_WIDTH}px`;
      clipElement.style.width = `${pattern.steps.length * STEP_WIDTH}px`;
      clipElement.tabIndex = 0;
      clipElement.setAttribute("role", "button");
      clipElement.setAttribute("aria-pressed", String(clip.id === selectedClipId));
      clipElement.setAttribute("aria-label", `${pattern.name}, ${pattern.steps.length} steps, starts at step ${clip.startStep + 1}`);
      clipElement.title = "Drag to move this clip. Right-click to create an editable variation.";

      const name = root.createElement("strong");
      name.textContent = pattern.name;
      const detail = root.createElement("small");
      detail.textContent = `${clip.startStep + 1}-${clip.startStep + pattern.steps.length}`;
      const remove = root.createElement("button");
      remove.type = "button";
      remove.className = "arrangement-clip-remove";
      remove.dataset.action = "remove-clip";
      remove.dataset.clipId = clip.id;
      remove.textContent = "\u00d7";
      remove.setAttribute("aria-label", `Remove ${pattern.name} clip`);
      remove.title = "Remove clip";
      clipElement.append(name, detail, remove);
      lane.append(clipElement);
    }
    return lane;
  }
  function renderTrackMenu(project, workspace) {
    const index = project.tracks.findIndex((track) => track.id === workspace.selectedTrackId);
    const track = project.tracks[index] ?? project.tracks[0];
    elements.trackName.value = track.name;
    elements.trackUp.disabled = index <= 0;
    elements.trackDown.disabled = index < 0 || index >= project.tracks.length - 1;
    elements.trackRemove.disabled = project.tracks.length === 1;
    elements.trackMenu.querySelector("summary").textContent = `${track.name} options`;
  }

  function render() {
    if (activeRangeTrackId !== null) return;
    const project = projectState.getState();
    const workspace = getWorkspace();
    const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
    const rows = [createRuler()];
    project.tracks.forEach((track, trackIndex) => {
      const row = root.createElement("div");
      row.className = "arrangement-track-row";
      row.style.setProperty("--track-color", getTrackColour(trackIndex));
      row.classList.toggle("selected", track.id === workspace.selectedTrackId);
      row.append(
        createTrackHeader(track, trackIndex, track.id === workspace.selectedTrackId, project.tracks.length > 1),
        createLane(track, patterns, workspace.selectedClipId),
      );
      rows.push(row);
    });
    rows.push(createAddTrackRow());
    elements.canvas.replaceChildren(...rows);
    elements.addTrack.disabled = project.tracks.length >= MAX_PROJECT_TRACKS;
    elements.empty.hidden = project.tracks.some((track) => track.clips.length > 0);
    renderTrackMenu(project, workspace);
  }

  function seekFromRuler(ruler, clientX) {
    const stepIndex = getTimelineStep({
      clientX,
      laneLeft: ruler.getBoundingClientRect().left,
      maxStep: MAX_ARRANGEMENT_STEPS - 1,
      stepWidth: STEP_WIDTH,
    });
    onSeek(stepIndex);
  }

  function closeClipContextMenu({ restoreFocus = false } = {}) {
    clipContextMenu.menu.hidden = true;
    const clipId = contextClipId;
    contextClipId = null;
    contextPlacement = null;
    if (restoreFocus && clipId) {
      elements.canvas.querySelector(`[data-action="select-clip"][data-clip-id="${clipId}"]`)?.focus();
    }
  }

  function positionContextMenu(clientX, clientY) {
    const viewportWidth = root.documentElement?.clientWidth ?? globalThis.innerWidth;
    const viewportHeight = root.documentElement?.clientHeight ?? globalThis.innerHeight;
    clipContextMenu.menu.style.left = `${Math.max(8, Math.min(clientX, viewportWidth - clipContextMenu.menu.offsetWidth - 8))}px`;
    clipContextMenu.menu.style.top = `${Math.max(8, Math.min(clientY, viewportHeight - clipContextMenu.menu.offsetHeight - 8))}px`;
  }

  function openClipContextMenu(clipId, clientX, clientY) {
    const selected = projectState.getClip(clipId);
    selectTrack(selected.track.id, {
      activeDockPanel: "sequencer",
      selectedClipId: clipId,
      selectedPatternId: selected.clip.patternId,
    });
    contextClipId = clipId;
    contextPlacement = null;
    clipContextMenu.newPattern.hidden = true;
    clipContextMenu.variation.hidden = false;
    clipContextMenu.menu.hidden = false;
    positionContextMenu(clientX, clientY);
    clipContextMenu.variation.focus();
  }

  function openLaneContextMenu(lane, clientX, clientY) {
    const startStep = getTimelineStep({
      clientX,
      laneLeft: lane.getBoundingClientRect().left,
      maxStep: MAX_ARRANGEMENT_STEPS - 1,
      stepWidth: STEP_WIDTH,
    });
    contextClipId = null;
    contextPlacement = { startStep, trackId: lane.dataset.trackId };
    clipContextMenu.newPattern.hidden = false;
    clipContextMenu.newPattern.textContent = `Create new pattern at step ${startStep + 1}`;
    clipContextMenu.variation.hidden = true;
    clipContextMenu.menu.hidden = false;
    positionContextMenu(clientX, clientY);
    clipContextMenu.newPattern.focus();
  }

  function closeTrackDeleteDialog({ restoreFocus = true } = {}) {
    if (deleteDialog.overlay.open) deleteDialog.overlay.close();
    pendingTrackId = null;
    if (restoreFocus && dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
    dialogReturnFocus = null;
  }

  function requestTrackRemoval(trackId) {
    const track = projectState.getTrack(trackId);
    const clipSummary = track.clips.length > 0
      ? ` This will also remove its ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}.`
      : "";
    pendingTrackId = trackId;
    dialogReturnFocus = root.activeElement;
    deleteDialog.message.textContent = `Remove ${track.name}?${clipSummary}`;
    if (!deleteDialog.overlay.open) deleteDialog.overlay.showModal();
    deleteDialog.cancel.focus();
  }

  function confirmTrackRemoval() {
    if (!pendingTrackId) return;
    const trackId = pendingTrackId;
    const project = projectState.getState();
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      closeTrackDeleteDialog({ restoreFocus: false });
      return;
    }
    const fallbackTrack = project.tracks.find((candidate) => candidate.id !== trackId);
    closeTrackDeleteDialog({ restoreFocus: false });
    if (getWorkspace().selectedTrackId === trackId && fallbackTrack) {
      sessionState.setWorkspace({ selectedClipId: null, selectedTrackId: fallbackTrack.id });
    }
    projectState.removeTrack(trackId, { allowClips: track.clips.length > 0 });
  }

  const clipDragController = createClipDragController({
    canvas: elements.canvas,
    maxArrangementSteps: MAX_ARRANGEMENT_STEPS,
    onDrop({ clipId, trackId }) {
      const selected = projectState.getClip(clipId);
      selectTrack(trackId, {
        activeDockPanel: "sequencer",
        selectedClipId: clipId,
        selectedPatternId: selected.clip.patternId,
      });
    },
    onError,
    projectState,
    root,
    scrollElement: elements.scroll,
    stepWidth: STEP_WIDTH,
  });

  function handleClick(event) {
    if (clipDragController.consumeClick(event)) return;
    const trackHeader = event.target.closest(".track-header");
    if (trackHeader) {
      const nameInput = event.target.closest('[data-action="rename-track"]');
      const workspace = getWorkspace();
      const togglesDock = !event.target.closest("button, input")
        && workspace.selectedTrackId === trackHeader.dataset.trackId
        && workspace.activeDockPanel === "instrument"
        && !workspace.detailPanelCollapsed;
      const shouldRestoreNameFocus = nameInput && (
        workspace.selectedTrackId !== trackHeader.dataset.trackId ||
        workspace.activeDockPanel !== "instrument" ||
        workspace.detailPanelCollapsed
      );
      if (togglesDock) {
        sessionState.setWorkspace({ detailPanelCollapsed: true });
      } else {
        selectTrack(trackHeader.dataset.trackId, {
          activeDockPanel: "instrument",
          selectedClipId: null,
        });
      }
      if (shouldRestoreNameFocus) {
        const replacement = elements.canvas.querySelector(
          `[data-action="rename-track"][data-track-id="${trackHeader.dataset.trackId}"]`,
        );
        replacement?.focus();
        replacement?.select();
      }
    }
    const target = event.target.closest("[data-action]");
    if (!target) {
      const lane = event.target.closest(".track-lane");
      if (!lane) return;
      const startStep = getTimelineStep({
        clientX: event.clientX,
        laneLeft: lane.getBoundingClientRect().left,
        stepWidth: STEP_WIDTH,
      });
      const workspace = getWorkspace();
      try {
        const clipId = projectState.addClip(lane.dataset.trackId, workspace.selectedPatternId, startStep);
        selectTrack(lane.dataset.trackId, { activeDockPanel: "sequencer", selectedClipId: clipId });
        onError("");
      } catch (error) {
        onError(error.message);
      }
      return;
    }
    const { action, clipId, trackId } = target.dataset;
    try {
      if (action === "seek-arrangement") {
        seekFromRuler(target, event.clientX);
      } else if (action === "remove-clip") {
        const wasSelected = getWorkspace().selectedClipId === clipId;
        projectState.removeClip(clipId);
        if (wasSelected) sessionState.setWorkspace({ selectedClipId: null });
      } else if (action === "remove-track") {
        requestTrackRemoval(trackId);
      } else if (action === "select-track") {
        selectTrack(trackId, { activeDockPanel: "instrument", selectedClipId: null });
      } else if (action === "select-clip") {
        const selected = projectState.getClip(clipId);
        selectTrack(selected.track.id, {
          activeDockPanel: "sequencer",
          selectedClipId: selected.clip.id,
          selectedPatternId: selected.clip.patternId,
        });
      } else if (action === "mute-track" || action === "solo-track") {
        const track = projectState.getTrack(trackId);
        const field = action === "mute-track" ? "muted" : "solo";
        projectState.updateTrack(trackId, (current) => ({
          ...current,
          mixer: { ...current.mixer, [field]: !track.mixer[field] },
        }), { field: `mixer.${field}` });
      }
      onError("");
    } catch (error) {
      onError(error.message);
      render();
    }
  }

  function finishRangeEdit() {
    if (activeRangeTrackId === null) return;
    activeRangeTrackId = null;
    projectState.endHistoryGroup();
    render();
  }

  elements.canvas.addEventListener("pointerdown", (event) => {
    if (!["track-volume", "track-pan"].includes(event.target.dataset.action)) return;
    activeRangeTrackId = event.target.dataset.trackId;
    projectState.beginHistoryGroup();
  }, { signal: lifecycle.signal });
  elements.canvas.addEventListener("input", (event) => {
    const action = event.target.dataset.action;
    if (!["track-volume", "track-pan"].includes(action)) return;
    const trackId = event.target.dataset.trackId;
    const value = Number(event.target.value) / 100;
    if (action === "track-volume") {
      event.target.closest(".track-volume").querySelector(".track-volume-value").textContent = `${Math.round(value * 100)}%`;
      projectState.updateTrack(trackId, (track) => ({
        ...track,
        mixer: { ...track.mixer, volume: value },
      }), { field: "mixer.volume" });
    } else {
      const formatted = formatPan(value);
      event.target.closest(".track-pan").querySelector(".track-pan-value").textContent = formatted;
      event.target.title = `${projectState.getTrack(trackId).name} pan: ${formatted}`;
      projectState.updateTrack(trackId, (track) => ({
        ...track,
        mixer: { ...track.mixer, pan: value },
      }), { field: "mixer.pan" });
    }
  }, { signal: lifecycle.signal });
  elements.canvas.addEventListener("pointerup", finishRangeEdit, { signal: lifecycle.signal });
  elements.canvas.addEventListener("pointercancel", finishRangeEdit, { signal: lifecycle.signal });
  elements.canvas.addEventListener("change", (event) => {
    if (["track-volume", "track-pan"].includes(event.target.dataset.action)) {
      finishRangeEdit();
      return;
    }
    if (event.target.dataset.action !== "rename-track") return;
    try {
      projectState.renameTrack(event.target.dataset.trackId, event.target.value);
      onError("");
    } catch (error) {
      onError(error.message);
      render();
    }
  }, { signal: lifecycle.signal });
  elements.canvas.addEventListener("click", handleClick, { signal: lifecycle.signal });
  elements.canvas.addEventListener("contextmenu", (event) => {
    const clip = event.target.closest(".arrangement-clip");
    const lane = event.target.closest(".track-lane");
    if (!lane) {
      closeClipContextMenu();
      return;
    }
    event.preventDefault();
    if (clip) {
      openClipContextMenu(clip.dataset.clipId, event.clientX, event.clientY);
    } else {
      openLaneContextMenu(lane, event.clientX, event.clientY);
    }
  }, { signal: lifecycle.signal });
  elements.canvas.addEventListener("keydown", (event) => {
    const trackName = event.target.closest('[data-action="rename-track"]');
    if (trackName && (event.key === "Enter" || event.key === "Escape")) {
      event.preventDefault();
      if (event.key === "Escape") {
        trackName.value = projectState.getTrack(trackName.dataset.trackId).name;
        trackName.blur();
        return;
      }
      try {
        projectState.renameTrack(trackName.dataset.trackId, trackName.value);
        onError("");
      } catch (error) {
        onError(error.message);
        render();
      }
      trackName.blur();
      return;
    }
    const contextClip = event.target.closest(".arrangement-clip");
    if (
      event.target === contextClip &&
      (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
    ) {
      event.preventDefault();
      const bounds = contextClip.getBoundingClientRect();
      openClipContextMenu(contextClip.dataset.clipId, bounds.left + 16, bounds.bottom);
      return;
    }
    const ruler = event.target.closest('[data-action="seek-arrangement"]');
    if (event.target === ruler && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const current = sessionState.getState().workspace.arrangementStartStep;
      const stepIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? MAX_ARRANGEMENT_STEPS - 1
          : Math.min(
            MAX_ARRANGEMENT_STEPS - 1,
            Math.max(0, current + (event.key === "ArrowLeft" ? -1 : 1)),
          );
      onSeek(stepIndex);
      return;
    }
    const clip = event.target.closest(".arrangement-clip");
    if (event.target !== clip || event.key !== "Enter") return;
    event.preventDefault();
    clip.click();
  }, { signal: lifecycle.signal });

  elements.addTrack.addEventListener("click", () => {
    try {
      const trackId = projectState.addTrack();
      selectTrack(trackId, { activeDockPanel: "instrument", selectedClipId: null });
      onError("");
    } catch (error) {
      onError(error.message);
    }
  }, { signal: lifecycle.signal });
  elements.trackName.addEventListener("change", () => {
    try {
      projectState.renameTrack(getWorkspace().selectedTrackId, elements.trackName.value);
      onError("");
    } catch (error) {
      onError(error.message);
      render();
    }
  }, { signal: lifecycle.signal });
  elements.trackName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") elements.trackName.blur();
  }, { signal: lifecycle.signal });
  elements.trackUp.addEventListener("click", () => {
    projectState.moveTrack(getWorkspace().selectedTrackId, -1);
  }, { signal: lifecycle.signal });
  elements.trackDown.addEventListener("click", () => {
    projectState.moveTrack(getWorkspace().selectedTrackId, 1);
  }, { signal: lifecycle.signal });
  elements.trackRemove.addEventListener("click", () => {
    requestTrackRemoval(getWorkspace().selectedTrackId);
    elements.trackMenu.open = false;
  }, { signal: lifecycle.signal });
  clipContextMenu.variation.addEventListener("click", () => {
    if (!contextClipId) return;
    const clipId = contextClipId;
    const selected = projectState.getClip(clipId);
    try {
      const patternId = projectState.createClipVariation(clipId);
      closeClipContextMenu();
      selectTrack(selected.track.id, {
        activeDockPanel: "sequencer",
        selectedClipId: clipId,
        selectedPatternId: patternId,
      });
      onError("");
    } catch (error) {
      closeClipContextMenu();
      onError(error.message);
    }
  }, { signal: lifecycle.signal });
  clipContextMenu.newPattern.addEventListener("click", () => {
    if (!contextPlacement) return;
    const { startStep, trackId } = contextPlacement;
    try {
      const { clipId, patternId } = projectState.createPatternClip(trackId, startStep);
      closeClipContextMenu();
      selectTrack(trackId, {
        activeDockPanel: "sequencer",
        selectedClipId: clipId,
        selectedPatternId: patternId,
      });
      onError("");
    } catch (error) {
      closeClipContextMenu();
      onError(error.message);
    }
  }, { signal: lifecycle.signal });
  root.addEventListener("pointerdown", (event) => {
    if (!clipContextMenu.menu.hidden && !clipContextMenu.menu.contains(event.target)) {
      closeClipContextMenu();
    }
  }, { capture: true, signal: lifecycle.signal });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !clipContextMenu.menu.hidden) {
      event.preventDefault();
      closeClipContextMenu({ restoreFocus: true });
    }
  }, { signal: lifecycle.signal });
  deleteDialog.cancel.addEventListener("click", () => closeTrackDeleteDialog(), { signal: lifecycle.signal });
  deleteDialog.confirm.addEventListener("click", () => {
    try {
      confirmTrackRemoval();
      onError("");
    } catch (error) {
      onError(error.message);
      closeTrackDeleteDialog({ restoreFocus: false });
      render();
    }
  }, { signal: lifecycle.signal });
  deleteDialog.overlay.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeTrackDeleteDialog();
  }, { signal: lifecycle.signal });
  deleteDialog.overlay.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusTarget = event.shiftKey ? deleteDialog.confirm : deleteDialog.cancel;
    if (root.activeElement === focusTarget) {
      event.preventDefault();
      (event.shiftKey ? deleteDialog.cancel : deleteDialog.confirm).focus();
    }
  }, { signal: lifecycle.signal });

  const handleProjectChange = (event) => {
    if (
      activeRangeTrackId !== null &&
      ["mixer.volume", "mixer.pan"].includes(event.detail.field)
    ) return;
    render();
  };
  const handleSessionChange = (event) => {
    if (event.detail.slice === "workspace") render();
  };
  projectState.addEventListener("change", handleProjectChange, { signal: lifecycle.signal });
  sessionState.addEventListener("change", handleSessionChange, { signal: lifecycle.signal });

  render();
  return Object.freeze({
    dispose() {
      lifecycle.abort();
      clipDragController.dispose();
      clipContextMenu.menu.remove();
      deleteDialog.overlay.remove();
    },
    render,
    setPlayhead(stepIndex, status, mode) {
      if (mode === "arrangement") {
        playheadStepIndex = stepIndex;
        playbackStatus = status;
      } else {
        playheadStepIndex = getWorkspace().arrangementStartStep;
        playbackStatus = "stopped";
      }
      const ruler = elements.canvas.querySelector(".arrangement-ruler");
      const playhead = elements.canvas.querySelector(".arrangement-ruler-playhead");
      if (!ruler || !playhead) return;
      ruler.setAttribute("aria-valuenow", String(playheadStepIndex + 1));
      playhead.style.left = `${playheadStepIndex * STEP_WIDTH}px`;
      playhead.classList.toggle("playing", playbackStatus === "playing");
    },
  });
}
