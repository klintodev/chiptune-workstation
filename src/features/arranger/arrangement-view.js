import {
  MAX_ARRANGEMENT_STEPS,
  MAX_PROJECT_TRACKS,
  isTrackAudible,
} from "../../state/project-state.js";
import { getNoteName } from "../../music/note.js";
import { queryRequired } from "../../shared/query-required.js";
import { getTrackColour, getVoiceLabel } from "../../shared/track-presentation.js";
import { createClipContour } from "../../visualiser/visual-learning-model.js";
import { createClipDragController, getTimelineStep } from "./clip-drag-controller.js";
import {
  DEFAULT_TIMELINE_STEP_WIDTH,
  MAX_TIMELINE_STEP_WIDTH,
  MIN_TIMELINE_STEP_WIDTH,
  clampTimelineStepWidth,
  getFitSongStepWidth,
  getOverviewScrollLeft,
  getTimelineViewport,
} from "./timeline-navigation.js";

const RULER_HEIGHT = 26;

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

function createTimelineNavigation(root) {
  const controls = root.createElement("div");
  controls.className = "arrangement-navigation";
  controls.setAttribute("aria-label", "Timeline navigation");
  const zoomOut = createButton(root, "−", "zoom-out");
  zoomOut.setAttribute("aria-label", "Zoom timeline out");
  const zoomReset = createButton(root, "100%", "zoom-reset");
  zoomReset.setAttribute("aria-label", "Reset timeline zoom");
  const zoomIn = createButton(root, "+", "zoom-in");
  zoomIn.setAttribute("aria-label", "Zoom timeline in");
  const fitSong = createButton(root, "Fit song", "fit-song");
  controls.append(zoomOut, zoomReset, zoomIn, fitSong);

  const overview = root.createElement("div");
  overview.className = "arrangement-overview";
  overview.tabIndex = 0;
  overview.setAttribute("role", "slider");
  overview.setAttribute("aria-label", "Arrangement overview viewport");
  overview.setAttribute("aria-valuemin", "1");
  const content = root.createElement("div");
  content.className = "arrangement-overview-content";
  const loop = root.createElement("span");
  loop.className = "arrangement-overview-loop";
  const clips = root.createElement("div");
  clips.className = "arrangement-overview-clips";
  const playhead = root.createElement("span");
  playhead.className = "arrangement-overview-playhead";
  const viewport = root.createElement("span");
  viewport.className = "arrangement-overview-viewport";
  content.append(loop, clips, playhead, viewport);
  overview.append(content);
  return Object.freeze({
    clips,
    controls,
    fitSong,
    loop,
    overview,
    playhead,
    viewport,
    zoomIn,
    zoomOut,
    zoomReset,
  });
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
  const timelineNavigation = createTimelineNavigation(root);
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
    clipBack: queryRequired(root, "#selected-clip-back"),
    clipBackFour: queryRequired(root, "#selected-clip-back-four"),
    clipForward: queryRequired(root, "#selected-clip-forward"),
    clipForwardFour: queryRequired(root, "#selected-clip-forward-four"),
    clipInspector: queryRequired(root, "#selected-clip-inspector"),
    clipPattern: queryRequired(root, "#selected-clip-pattern"),
    clipRemove: queryRequired(root, "#selected-clip-remove"),
    clipStart: queryRequired(root, "#selected-clip-start"),
    clipTrack: queryRequired(root, "#selected-clip-track"),
    clipVariation: queryRequired(root, "#selected-clip-variation"),
    empty: queryRequired(root, "#arrangement-empty"),
    heading: queryRequired(root, ".arrangement-heading"),
    scroll: queryRequired(root, ".arrangement-scroll"),
    stage: queryRequired(root, ".arrangement-stage"),
    trackDown: queryRequired(root, "#selected-track-down"),
    trackMenu: queryRequired(root, "#selected-track-menu"),
    trackName: queryRequired(root, "#selected-track-name"),
    trackRemove: queryRequired(root, "#selected-track-remove"),
    trackUp: queryRequired(root, "#selected-track-up"),
  };
  elements.heading.append(timelineNavigation.controls);
  elements.stage.append(timelineNavigation.overview);
  let activeRangeTrackId = null;
  let contextClipId = null;
  let contextPlacement = null;
  let dialogReturnFocus = null;
  let activityMode = "arrangement";
  let activityStatus = "stopped";
  let activityStepIndex = 0;
  let pendingTrackId = null;
  let playheadStepIndex = sessionState.getState().workspace.arrangementStartStep;
  let playbackStatus = "stopped";
  let stepWidth = DEFAULT_TIMELINE_STEP_WIDTH;

  function getWorkspace() {
    return sessionState.getState().workspace;
  }

  function hasArrangementClips() {
    return projectState.getState().tracks.some((track) => track.clips.length > 0);
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
    row.style.gridTemplateColumns = `var(--track-header-width) ${MAX_ARRANGEMENT_STEPS * stepWidth}px`;
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
    ruler.style.width = `${MAX_ARRANGEMENT_STEPS * stepWidth}px`;
    ruler.style.setProperty(
      "--arrangement-playhead-height",
      `calc(${RULER_HEIGHT}px + (var(--track-height) * ${projectState.getState().tracks.length}))`,
    );
    for (let step = 0; step < MAX_ARRANGEMENT_STEPS; step += 4) {
      const marker = root.createElement("span");
      marker.className = "arrangement-ruler-marker";
      marker.classList.toggle("bar", step % 16 === 0);
      marker.style.left = `${step * stepWidth}px`;
      const bar = Math.floor(step / 16) + 1;
      const beat = Math.floor((step % 16) / 4) + 1;
      marker.textContent = step % 16 === 0 ? `Bar ${bar}` : `${bar}.${beat}`;
      marker.title = `Absolute step ${step + 1}`;
      ruler.append(marker);
    }
    const playhead = root.createElement("span");
    playhead.className = "arrangement-ruler-playhead";
    playhead.classList.toggle("playing", playbackStatus === "playing");
    playhead.style.left = `${playheadStepIndex * stepWidth}px`;
    playhead.setAttribute("aria-hidden", "true");
    ruler.append(playhead);
    row.append(label, ruler);
    return row;
  }

  function createAddTrackRow() {
    const row = root.createElement("div");
    row.className = "arrangement-add-track-row";
    row.style.gridTemplateColumns = `var(--track-header-width) ${MAX_ARRANGEMENT_STEPS * stepWidth}px`;
    const action = root.createElement("div");
    action.className = "arrangement-add-track-cell";
    action.append(elements.addTrack);
    const timeline = root.createElement("div");
    timeline.className = "arrangement-add-track-timeline";
    timeline.setAttribute("aria-hidden", "true");
    row.append(action, timeline);
    return row;
  }

  function createTrackHeader(track, trackIndex) {
    const header = root.createElement("div");
    header.className = "track-header";
    header.dataset.trackId = track.id;

    const primary = root.createElement("div");
    primary.className = "track-primary";
    const channel = root.createElement("span");
    channel.className = "track-channel";
    channel.textContent = `Track ${trackIndex + 1}`;
    const activity = root.createElement("output");
    activity.className = "track-activity";
    activity.dataset.trackActivity = track.id;
    activity.value = "Inactive";
    activity.setAttribute("aria-label", `${track.name} activity`);
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
    primary.append(channel, activity, switches);

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
    lane.style.width = `${MAX_ARRANGEMENT_STEPS * stepWidth}px`;
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
      clipElement.style.left = `${clip.startStep * stepWidth}px`;
      clipElement.style.width = `${pattern.steps.length * stepWidth}px`;
      clipElement.tabIndex = 0;
      clipElement.setAttribute("role", "button");
      clipElement.setAttribute("aria-pressed", String(clip.id === selectedClipId));
      clipElement.setAttribute("aria-label", `${pattern.name}, ${pattern.steps.length} steps, starts at step ${clip.startStep + 1}`);
      clipElement.title = "Select for move, track, variation and remove controls. Drag to move quickly.";

      const name = root.createElement("strong");
      name.textContent = pattern.name;
      const detail = root.createElement("small");
      detail.textContent = `${clip.startStep + 1}-${clip.startStep + pattern.steps.length}`;
      const contour = root.createElement("span");
      contour.className = "arrangement-clip-contour";
      contour.setAttribute("aria-hidden", "true");
      contour.append(...createClipContour(pattern).map((mark) => {
        const note = root.createElement("i");
        note.style.left = `${mark.step * 100}%`;
        note.style.bottom = `${3 + mark.pitch * 13}px`;
        note.style.width = `${Math.max(1.5, mark.width * 100)}%`;
        note.style.opacity = String(0.35 + mark.emphasis * 0.65);
        return note;
      }));
      clipElement.append(contour, name, detail);
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

  function getTrackActivity(project, track) {
    if (activityStatus !== "playing" || !isTrackAudible(project, track.id)) return null;
    const workspace = getWorkspace();
    let pattern = null;
    let patternStepIndex = null;
    if (activityMode === "pattern") {
      if (track.id !== workspace.selectedTrackId) return null;
      pattern = project.patterns.find((candidate) => candidate.id === workspace.selectedPatternId);
      patternStepIndex = pattern ? activityStepIndex % pattern.steps.length : null;
    } else {
      const patterns = new Map(project.patterns.map((candidate) => [candidate.id, candidate]));
      const clip = track.clips.find((candidate) => {
        const candidatePattern = patterns.get(candidate.patternId);
        return candidate.startStep <= activityStepIndex
          && activityStepIndex < candidate.startStep + candidatePattern.steps.length;
      });
      if (clip) {
        pattern = patterns.get(clip.patternId);
        patternStepIndex = activityStepIndex - clip.startStep;
      }
    }
    const step = patternStepIndex === null ? null : pattern?.steps[patternStepIndex];
    return step && step.volume > 0
      ? getNoteName(step.note + track.instrument.octaveOffset * 12)
      : null;
  }

  function syncTrackActivity() {
    const project = projectState.getState();
    for (const track of project.tracks) {
      const output = elements.canvas.querySelector(`[data-track-activity="${track.id}"]`);
      if (!output) continue;
      const noteLabel = getTrackActivity(project, track);
      const value = noteLabel ?? (isTrackAudible(project, track.id) ? "Inactive" : "Muted");
      if (output.value !== value) output.value = value;
      output.classList.toggle("active", Boolean(noteLabel));
      output.closest(".track-header")?.classList.toggle("track-sounding", Boolean(noteLabel));
    }
  }

  function renderOverview(project = projectState.getState(), { rebuildClips = true } = {}) {
    const occupiedSteps = Math.max(1, projectState.getArrangementEnd());
    const trackHeaderWidth = elements.canvas.querySelector(".track-header")?.getBoundingClientRect().width
      || 224;
    const viewportWidth = Math.max(1, elements.scroll.clientWidth - trackHeaderWidth);
    const visibleEndStep = Math.ceil((elements.scroll.scrollLeft + viewportWidth) / stepWidth);
    const overviewSteps = Math.min(
      MAX_ARRANGEMENT_STEPS,
      Math.max(16, occupiedSteps, visibleEndStep, playheadStepIndex + 1),
    );
    const viewport = getTimelineViewport({
      maximumSteps: overviewSteps,
      scrollLeft: elements.scroll.scrollLeft,
      stepWidth,
      viewportWidth,
    });
    timelineNavigation.viewport.style.left = `${viewport.start * 100}%`;
    timelineNavigation.viewport.style.width = `${viewport.width * 100}%`;
    timelineNavigation.playhead.style.left = `${playheadStepIndex / overviewSteps * 100}%`;
    const loop = project.transport.loop;
    timelineNavigation.loop.hidden = !loop.enabled;
    timelineNavigation.loop.style.left = `${loop.startStep / overviewSteps * 100}%`;
    timelineNavigation.loop.style.width = `${(loop.endStep - loop.startStep) / overviewSteps * 100}%`;
    timelineNavigation.overview.setAttribute("aria-valuemax", String(overviewSteps));
    timelineNavigation.overview.setAttribute(
      "aria-valuenow",
      String(Math.round(viewport.start * overviewSteps) + 1),
    );
    timelineNavigation.overview.dataset.steps = String(overviewSteps);
    const selectedClipId = getWorkspace().selectedClipId;
    for (const mark of timelineNavigation.clips.children) {
      mark.classList.toggle("selected", mark.dataset.clipId === selectedClipId);
      mark.classList.toggle(
        "playing",
        playbackStatus === "playing"
          && Number(mark.dataset.startStep) <= playheadStepIndex
          && playheadStepIndex < Number(mark.dataset.endStep),
      );
    }
    if (!rebuildClips) return;
    timelineNavigation.clips.replaceChildren(...project.tracks.flatMap((track, trackIndex) => (
      track.clips.map((clip) => {
        const pattern = project.patterns.find((candidate) => candidate.id === clip.patternId);
        const mark = root.createElement("span");
        mark.style.left = `${clip.startStep / overviewSteps * 100}%`;
        mark.style.width = `${pattern.steps.length / overviewSteps * 100}%`;
        mark.style.top = `${2 + trackIndex * 3}px`;
        mark.style.setProperty("--track-color", getTrackColour(trackIndex));
        mark.dataset.clipId = clip.id;
        mark.dataset.endStep = String(clip.startStep + pattern.steps.length);
        mark.dataset.startStep = String(clip.startStep);
        mark.classList.toggle("selected", clip.id === selectedClipId);
        mark.classList.toggle(
          "playing",
          playbackStatus === "playing"
            && clip.startStep <= playheadStepIndex
            && playheadStepIndex < clip.startStep + pattern.steps.length,
        );
        return mark;
      })
    )));
  }

  function setTimelineStepWidth(nextWidth) {
    const next = clampTimelineStepWidth(nextWidth);
    if (next === stepWidth) return false;
    const centreStep = (elements.scroll.scrollLeft + elements.scroll.clientWidth / 2) / stepWidth;
    stepWidth = next;
    render();
    elements.scroll.scrollLeft = Math.max(0, centreStep * stepWidth - elements.scroll.clientWidth / 2);
    timelineNavigation.zoomOut.disabled = stepWidth <= MIN_TIMELINE_STEP_WIDTH;
    timelineNavigation.zoomIn.disabled = stepWidth >= MAX_TIMELINE_STEP_WIDTH;
    timelineNavigation.zoomReset.textContent = `${Math.round(stepWidth / DEFAULT_TIMELINE_STEP_WIDTH * 100)}%`;
    renderOverview(undefined, { rebuildClips: false });
    return true;
  }

  function renderClipInspector(project, workspace) {
    if (!workspace.selectedClipId) {
      elements.clipInspector.hidden = true;
      return;
    }
    let selected;
    try {
      selected = projectState.getClip(workspace.selectedClipId);
    } catch {
      elements.clipInspector.hidden = true;
      return;
    }
    const pattern = project.patterns.find(({ id }) => id === selected.clip.patternId);
    elements.clipInspector.hidden = false;
    elements.clipPattern.textContent = `Loop: ${pattern.name}`;
    const optionIds = [...elements.clipTrack.options].map(({ value }) => value);
    if (optionIds.join("|") !== project.tracks.map(({ id }) => id).join("|")) {
      elements.clipTrack.replaceChildren(...project.tracks.map((track) => {
        const option = root.createElement("option");
        option.value = track.id;
        option.textContent = track.name;
        return option;
      }));
    } else {
      project.tracks.forEach((track, index) => {
        elements.clipTrack.options[index].textContent = track.name;
      });
    }
    elements.clipTrack.value = selected.track.id;
    elements.clipStart.value = String(selected.clip.startStep + 1);
    elements.clipStart.max = String(MAX_ARRANGEMENT_STEPS - pattern.steps.length + 1);
    const canMoveBy = (offset) => projectState.canMoveClip(
      selected.clip.id,
      selected.track.id,
      selected.clip.startStep + offset,
    );
    elements.clipBack.disabled = !canMoveBy(-1);
    elements.clipBackFour.disabled = !canMoveBy(-4);
    elements.clipForward.disabled = !canMoveBy(1);
    elements.clipForwardFour.disabled = !canMoveBy(4);
  }

  function render() {
    if (activeRangeTrackId !== null) return;
    const focusedClipId = root.activeElement?.closest?.(".arrangement-clip")?.dataset.clipId;
    const project = projectState.getState();
    const workspace = getWorkspace();
    const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
    const rows = [createRuler()];
    project.tracks.forEach((track, trackIndex) => {
      const row = root.createElement("div");
      row.className = "arrangement-track-row";
      row.style.gridTemplateColumns = `var(--track-header-width) ${MAX_ARRANGEMENT_STEPS * stepWidth}px`;
      row.style.setProperty("--track-color", getTrackColour(trackIndex));
      row.classList.toggle("selected", track.id === workspace.selectedTrackId);
      row.append(
        createTrackHeader(track, trackIndex),
        createLane(track, patterns, workspace.selectedClipId),
      );
      rows.push(row);
    });
    rows.push(createAddTrackRow());
    elements.canvas.replaceChildren(...rows);
    elements.addTrack.disabled = project.tracks.length >= MAX_PROJECT_TRACKS;
    elements.empty.hidden = project.tracks.some((track) => track.clips.some((clip) => (
      patterns.get(clip.patternId)?.steps.some((step) => step !== null && step.volume > 0)
    )));
    renderTrackMenu(project, workspace);
    timelineNavigation.zoomOut.disabled = stepWidth <= MIN_TIMELINE_STEP_WIDTH;
    timelineNavigation.zoomIn.disabled = stepWidth >= MAX_TIMELINE_STEP_WIDTH;
    timelineNavigation.zoomReset.textContent = `${Math.round(stepWidth / DEFAULT_TIMELINE_STEP_WIDTH * 100)}%`;
    syncTrackActivity();
    renderOverview(project);
    renderClipInspector(project, workspace);
    if (focusedClipId) {
      elements.canvas.querySelector(`[data-clip-id="${focusedClipId}"]`)?.focus();
    }
  }

  function seekFromRuler(ruler, clientX) {
    const stepIndex = getTimelineStep({
      clientX,
      laneLeft: ruler.getBoundingClientRect().left,
      maxStep: MAX_ARRANGEMENT_STEPS - 1,
      stepWidth,
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
      stepWidth,
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

  function moveClip(clipId, trackId, startStep, { focusClip = false } = {}) {
    try {
      projectState.moveClip(clipId, trackId, startStep);
      const selected = projectState.getClip(clipId);
      selectTrack(selected.track.id, {
        activeDockPanel: "sequencer",
        selectedClipId: clipId,
        selectedPatternId: selected.clip.patternId,
      });
      onError("");
      if (focusClip) elements.canvas.querySelector(`[data-clip-id="${clipId}"]`)?.focus();
      return true;
    } catch (error) {
      onError(`${error.message} Choose another track or start step.`);
      render();
      return false;
    }
  }

  function createVariation(clipId) {
    const selected = projectState.getClip(clipId);
    const patternId = projectState.createClipVariation(clipId);
    selectTrack(selected.track.id, {
      activeDockPanel: "sequencer",
      selectedClipId: clipId,
      selectedPatternId: patternId,
    });
    return patternId;
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
    getStepWidth: () => stepWidth,
    stepWidth,
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
        stepWidth,
      });
      const workspace = getWorkspace();
      try {
        const pattern = projectState.getPattern(workspace.selectedPatternId);
        if (!pattern.steps.some((step) => step !== null && step.volume > 0)) {
          throw new RangeError("Add at least one note to this loop before adding it to the song.");
        }
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
    if (event.target !== clip) return;
    if (["Enter", " ", "Spacebar"].includes(event.key)) {
      event.preventDefault();
      clip.click();
      return;
    }
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const selected = projectState.getClip(clip.dataset.clipId);
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      moveClip(
        selected.clip.id,
        selected.track.id,
        selected.clip.startStep + direction * (event.shiftKey ? 4 : 1),
        { focusClip: true },
      );
      return;
    }
    if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const selected = projectState.getClip(clip.dataset.clipId);
      const tracks = projectState.getState().tracks;
      const trackIndex = tracks.findIndex(({ id }) => id === selected.track.id);
      const targetTrack = tracks[trackIndex + (event.key === "ArrowUp" ? -1 : 1)];
      if (targetTrack) {
        moveClip(selected.clip.id, targetTrack.id, selected.clip.startStep, { focusClip: true });
      }
    }
  }, { signal: lifecycle.signal });

  function moveSelectedBy(offset) {
    const clipId = getWorkspace().selectedClipId;
    if (!clipId) return;
    const selected = projectState.getClip(clipId);
    moveClip(clipId, selected.track.id, selected.clip.startStep + offset);
  }

  elements.clipBack.addEventListener("click", () => moveSelectedBy(-1), { signal: lifecycle.signal });
  elements.clipBackFour.addEventListener("click", () => moveSelectedBy(-4), { signal: lifecycle.signal });
  elements.clipForward.addEventListener("click", () => moveSelectedBy(1), { signal: lifecycle.signal });
  elements.clipForwardFour.addEventListener("click", () => moveSelectedBy(4), { signal: lifecycle.signal });
  elements.clipTrack.addEventListener("change", () => {
    const clipId = getWorkspace().selectedClipId;
    if (!clipId) return;
    const selected = projectState.getClip(clipId);
    moveClip(clipId, elements.clipTrack.value, selected.clip.startStep);
  }, { signal: lifecycle.signal });
  elements.clipStart.addEventListener("change", () => {
    const clipId = getWorkspace().selectedClipId;
    if (!clipId) return;
    const selected = projectState.getClip(clipId);
    moveClip(clipId, selected.track.id, Number(elements.clipStart.value) - 1);
  }, { signal: lifecycle.signal });
  elements.clipVariation.addEventListener("click", () => {
    const clipId = getWorkspace().selectedClipId;
    if (!clipId) return;
    try {
      createVariation(clipId);
      onError("");
    } catch (error) {
      onError(error.message);
    }
  }, { signal: lifecycle.signal });
  elements.clipRemove.addEventListener("click", () => {
    const clipId = getWorkspace().selectedClipId;
    if (!clipId) return;
    projectState.removeClip(clipId);
    sessionState.setWorkspace({ selectedClipId: null });
    if (hasArrangementClips()) elements.scroll.focus();
    onError("");
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
  timelineNavigation.zoomOut.addEventListener("click", () => {
    setTimelineStepWidth(stepWidth - 2);
  }, { signal: lifecycle.signal });
  timelineNavigation.zoomIn.addEventListener("click", () => {
    setTimelineStepWidth(stepWidth + 2);
  }, { signal: lifecycle.signal });
  timelineNavigation.zoomReset.addEventListener("click", () => {
    setTimelineStepWidth(DEFAULT_TIMELINE_STEP_WIDTH);
  }, { signal: lifecycle.signal });
  timelineNavigation.fitSong.addEventListener("click", () => {
    setTimelineStepWidth(getFitSongStepWidth(
      projectState.getArrangementEnd(),
      elements.scroll.clientWidth,
      root.defaultView?.getComputedStyle(elements.canvas)
        .getPropertyValue("--track-header-width")
        .replace("px", "") || 224,
    ));
    elements.scroll.scrollLeft = 0;
    renderOverview(undefined, { rebuildClips: false });
  }, { signal: lifecycle.signal });
  function moveViewportFromOverview(clientX) {
    const bounds = timelineNavigation.overview.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width)));
    const overviewSteps = Number(timelineNavigation.overview.dataset.steps)
      || MAX_ARRANGEMENT_STEPS;
    elements.scroll.scrollLeft = getOverviewScrollLeft({
      clientRatio: ratio,
      maximumSteps: overviewSteps,
      stepWidth,
      viewportWidth: elements.scroll.clientWidth,
    });
    renderOverview(undefined, { rebuildClips: false });
  }
  timelineNavigation.overview.addEventListener("pointerdown", (event) => {
    timelineNavigation.overview.setPointerCapture?.(event.pointerId);
    moveViewportFromOverview(event.clientX);
  }, { signal: lifecycle.signal });
  timelineNavigation.overview.addEventListener("pointermove", (event) => {
    if (!timelineNavigation.overview.hasPointerCapture?.(event.pointerId)) return;
    moveViewportFromOverview(event.clientX);
  }, { signal: lifecycle.signal });
  timelineNavigation.overview.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") elements.scroll.scrollLeft = 0;
    else if (event.key === "End") elements.scroll.scrollLeft = elements.scroll.scrollWidth;
    else elements.scroll.scrollLeft += event.key === "ArrowLeft"
      ? -elements.scroll.clientWidth / 4
      : elements.scroll.clientWidth / 4;
    renderOverview(undefined, { rebuildClips: false });
  }, { signal: lifecycle.signal });
  elements.scroll.addEventListener("scroll", () => {
    renderOverview(undefined, { rebuildClips: false });
  }, { signal: lifecycle.signal });
  root.defaultView?.addEventListener("resize", () => {
    renderOverview(undefined, { rebuildClips: false });
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
    try {
      createVariation(clipId);
      closeClipContextMenu();
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
      timelineNavigation.controls.remove();
      timelineNavigation.overview.remove();
    },
    render,
    setPlayhead(stepIndex, status, mode) {
      activityMode = mode;
      activityStatus = status;
      activityStepIndex = stepIndex;
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
      playhead.style.left = `${playheadStepIndex * stepWidth}px`;
      playhead.classList.toggle("playing", playbackStatus === "playing");
      syncTrackActivity();
      renderOverview(undefined, { rebuildClips: false });
    },
  });
}
