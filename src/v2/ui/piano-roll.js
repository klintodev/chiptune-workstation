import {
  MAX_NOTES_PER_PATTERN,
  MAX_NOTES_PER_PROJECT,
  MAX_PATTERN_CONTENT_TICKS,
  PPQ,
  getPatternEditorEndTick,
  getPatternPlaybackEndTick,
} from "../domain/index.js";
import { createElement, clearElement, setPressed } from "./dom.js";
import { getInstrumentName, getInstrumentPitchName } from "./device-presentation.js";
import { formatDurationTicks, formatMidiPitch, formatPercent, formatTickPosition } from "./music-format.js";

const MIN_PITCH = 36;
const MAX_PITCH = 112;
const SNAP_OPTIONS = Object.freeze({ "1/8": 48, "1/16": 24, "1/32": 12 });
const ROW_HEIGHT = 26;
const LABEL_WIDTH = 88;
const MIN_PIXELS_PER_TICK = 0.45;
const MAX_PIXELS_PER_TICK = 3;
const PIANO_ZOOM_FACTOR = 1.2;
const PIANO_BAR_TICKS = PPQ * 4;
const POINTER_EDGE_SIZE = 24;
const PIANO_CLICK_SLOP_PX = 4;
const PIANO_RAIL_PREVIEW_VELOCITY = 0.7;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isMod(event) {
  return event.ctrlKey || event.metaKey;
}

function exceedsPianoClickSlop(originX, originY, event) {
  return Math.hypot(event.clientX - originX, event.clientY - originY) > PIANO_CLICK_SLOP_PX;
}

function isPlainSpace(event) {
  return !event.altKey
    && !isMod(event)
    && (event.code === "Space" || event.key === " " || event.key === "Spacebar");
}

export function isPianoDuplicateShortcut(event) {
  return Boolean(
    event
    && !event.defaultPrevented
    && !event.altKey
    && !event.shiftKey
    && !event.repeat
    && isMod(event)
    && String(event.key ?? "").toLowerCase() === "b"
  );
}

export function getPianoToolForViewport(compact, desktopTool = "draw") {
  const visibleTool = desktopTool === "select" ? "select" : "draw";
  return compact ? "pan" : visibleTool;
}

export function getPianoDuplicateDeltaTicks(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return 0;
  const firstTick = Math.min(...notes.map(({ startTick }) => startTick));
  const lastTick = Math.max(...notes.map(({ durationTicks, startTick }) => (
    startTick + durationTicks
  )));
  return Math.max(1, lastTick - firstTick);
}

export function renamePianoPattern({
  announce = () => {},
  patternId,
  projectState,
  requestedName,
} = {}) {
  if (requestedName === null || requestedName === undefined) return false;
  if (!projectState?.getPattern || !projectState?.renamePattern) {
    throw new TypeError("Renaming a Piano Roll Pattern requires Project state.");
  }
  try {
    const changed = projectState.renamePattern(patternId, requestedName);
    if (!changed) return false;
    announce(`Renamed Pattern to ${projectState.getPattern(patternId).name}.`);
    return true;
  } catch (error) {
    announce(error instanceof Error ? error.message : "The Pattern could not be renamed.");
    return false;
  }
}

function noteLabel(note, formatPitch = formatMidiPitch) {
  return `${formatPitch(note.pitch)}, ${formatTickPosition(note.startTick)}, ${formatDurationTicks(note.durationTicks)}, velocity ${formatPercent(note.velocity)}`;
}

function uniqueSelectedNotes(pattern, ids) {
  const wanted = new Set(ids);
  return pattern.notes.filter(({ id }) => wanted.has(id));
}

export function getBoundedPianoMove(notes, requestedTick, requestedPitch, patternLength) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return Object.freeze({ deltaPitch: 0, deltaTick: 0 });
  }
  const minimumTick = -Math.min(...notes.map(({ startTick }) => startTick));
  const maximumTick = Math.min(...notes.map((note) => (
    patternLength - note.startTick - note.durationTicks
  )));
  const minimumPitch = MIN_PITCH - Math.min(...notes.map(({ pitch }) => pitch));
  const maximumPitch = MAX_PITCH - Math.max(...notes.map(({ pitch }) => pitch));
  return Object.freeze({
    deltaPitch: clamp(requestedPitch, minimumPitch, maximumPitch) || 0,
    deltaTick: clamp(requestedTick, minimumTick, maximumTick) || 0,
  });
}

export function getExpandedPianoEditorEndTick(currentEndTick, requestedEndTick) {
  const current = clamp(
    Math.round(Number(currentEndTick) || 0),
    0,
    MAX_PATTERN_CONTENT_TICKS,
  );
  if (!Number.isFinite(Number(requestedEndTick)) || requestedEndTick < current) return current;
  return Math.min(MAX_PATTERN_CONTENT_TICKS, current + PIANO_BAR_TICKS);
}

export function getPianoMarqueeNoteIds(notes, {
  fromPitch,
  fromTick,
  patternLength,
  toPitch,
  toTick,
}) {
  const left = clamp(Math.min(fromTick, toTick), 0, patternLength);
  const right = clamp(Math.max(fromTick, toTick), 0, patternLength);
  const lowPitch = clamp(Math.min(fromPitch, toPitch), MIN_PITCH, MAX_PITCH);
  const highPitch = clamp(Math.max(fromPitch, toPitch), MIN_PITCH, MAX_PITCH);
  if (right <= left) return Object.freeze([]);
  return Object.freeze(notes
    .filter((note) => (
      note.startTick < right
      && note.startTick + note.durationTicks > left
      && note.pitch >= lowPitch
      && note.pitch <= highPitch
    ))
    .map(({ id }) => id));
}

export function getInitialPianoViewportTop(pattern, viewportHeight, contentHeight) {
  const firstPitch = pattern?.notes?.[0]?.pitch;
  const targetOctaveC = Number.isInteger(firstPitch)
    ? Math.floor(firstPitch / 12) * 12
    : 60;
  const targetPitch = clamp(targetOctaveC, MIN_PITCH, MAX_PITCH);
  const resolvedViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  const resolvedContentHeight = Math.max(
    resolvedViewportHeight,
    Number(contentHeight) || (MAX_PITCH - MIN_PITCH + 1) * ROW_HEIGHT,
  );
  const targetCentre = (MAX_PITCH - targetPitch) * ROW_HEIGHT + ROW_HEIGHT / 2;
  return clamp(targetCentre - resolvedViewportHeight / 2, 0, resolvedContentHeight - resolvedViewportHeight);
}

export function getPianoZoomViewport({
  anchorClientX,
  currentPixelsPerTick,
  deltaY,
  scrollLeft,
  viewportLeft,
  viewportWidth,
}) {
  const current = clamp(
    Number(currentPixelsPerTick) || MIN_PIXELS_PER_TICK,
    MIN_PIXELS_PER_TICK,
    MAX_PIXELS_PER_TICK,
  );
  const normalizedDelta = clamp(Number(deltaY) || 0, -100, 100);
  const next = clamp(
    current * PIANO_ZOOM_FACTOR ** (-normalizedDelta / 100),
    MIN_PIXELS_PER_TICK,
    MAX_PIXELS_PER_TICK,
  );
  const width = Math.max(LABEL_WIDTH, Number(viewportWidth) || LABEL_WIDTH);
  const fallbackAnchor = LABEL_WIDTH + (width - LABEL_WIDTH) / 2;
  const localAnchor = Number(anchorClientX) - Number(viewportLeft);
  const anchor = clamp(Number.isFinite(localAnchor) ? localAnchor : fallbackAnchor, LABEL_WIDTH, width);
  const anchorTick = Math.max(
    0,
    ((Number(scrollLeft) || 0) + anchor - LABEL_WIDTH) / current,
  );
  return Object.freeze({
    pixelsPerTick: next,
    scrollLeft: Math.max(0, LABEL_WIDTH + anchorTick * next - anchor),
  });
}

export function createPianoRollSurface({
  announce = () => {},
  confirmPatternDelete = async () => true,
  onAddToPlaylist = () => {},
  onAuditionPitch = () => false,
  onRequestPatternRename = () => false,
  onTransportToggle = () => {},
  projectState,
  getTransportFrame = () => null,
  transportFrameSource = null,
  workspaceState,
}) {
  const lifecycle = new AbortController();
  let clipboard = [];
  let cursorPitch = 60;
  let cursorTick = 0;
  let disposed = false;
  let pixelsPerTick = 1.35;
  let localProjectMutationDepth = 0;
  let localWorkspaceMutationDepth = 0;
  let viewportRestoreObserver = null;
  let activePointerCancel = null;
  let playheadElement = null;
  let selectedNoteIds = new Set();
  let snapTicks = 24;
  const editorEndOverrides = new Map();
  const mobileEditorQuery = globalThis.matchMedia?.("(max-width: 700px), (max-height: 640px)");
  let desktopTool = "draw";
  let tool = getPianoToolForViewport(mobileEditorQuery?.matches, desktopTool);
  const noteElements = new Map();
  const noteLabelElements = new Map();

  const title = createElement("h2", { className: "v2-surface-title", tabIndex: -1 });
  const header = createElement("div", { className: "v2-surface-header v2-piano-header" });
  const canvas = createElement("div", {
    className: "v2-piano-canvas",
    role: "listbox",
    "aria-multiselectable": "true",
    "aria-keyshortcuts": "Delete Backspace Control+B Meta+B",
    tabIndex: 0,
    "aria-label": "Piano Roll note editor",
    "aria-describedby": "v2-piano-help",
  });
  const scroller = createElement("div", { className: "v2-piano-scroll" }, [canvas]);
  const inspector = createElement("aside", { className: "v2-note-inspector", "aria-label": "Selected note properties" });
  const status = createElement("p", {
    className: "v2-editor-help",
    id: "v2-piano-help",
    textContent: "Hold Control or Command and drag to select notes. Delete removes the selection; Control or Command+B duplicates it to the right. Arrow keys move the cursor, and Control or Command with arrows edits selected notes. Space toggles playback when you are not typing in a name field.",
  });
  const node = createElement("section", {
    className: "v2-primary-surface v2-piano-roll",
    "aria-labelledby": "v2-piano-title",
    dataset: { primarySurface: "piano-roll" },
  }, [header, scroller, inspector, status]);
  title.id = "v2-piano-title";

  function snapshot() {
    return projectState.getState();
  }

  function workspace() {
    return workspaceState.getState();
  }

  function activePatternId() {
    const state = workspace();
    return state.activePatternId
      ?? state.pianoRoll?.patternId
      ?? state.patternSurfaces?.activePatternId
      ?? snapshot().patterns[0].id;
  }

  function activePattern() {
    const project = snapshot();
    return project.patterns.find(({ id }) => id === activePatternId())
      ?? project.patterns[0];
  }

  function requestPatternRename(returnFocus = canvas) {
    try {
      return onRequestPatternRename(returnFocus) ?? false;
    } catch (error) {
      announce(error instanceof Error ? error.message : "The Pattern could not be renamed.");
      return false;
    }
  }

  function editorEndTick(pattern = activePattern()) {
    return Math.min(
      MAX_PATTERN_CONTENT_TICKS,
      Math.max(
        getPatternEditorEndTick(pattern),
        editorEndOverrides.get(pattern.id) ?? 0,
      ),
    );
  }

  function paintEditorWidth(endTick = editorEndTick()) {
    canvas.style.width = `${Math.max(640, endTick * pixelsPerTick + LABEL_WIDTH)}px`;
  }

  function expandEditorAtRightEdge(pattern, requestedEndTick) {
    const currentEndTick = editorEndTick(pattern);
    const nextEndTick = getExpandedPianoEditorEndTick(currentEndTick, requestedEndTick);
    if (nextEndTick === currentEndTick) return currentEndTick;
    editorEndOverrides.set(pattern.id, nextEndTick);
    paintEditorWidth(nextEndTick);
    return nextEndTick;
  }

  function scrollEditorAtPointerEdge(event) {
    const rect = scroller.getBoundingClientRect();
    const maximumLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const amount = Math.max(12, snapTicks * pixelsPerTick);
    if (event.clientX >= rect.right - POINTER_EDGE_SIZE) {
      scroller.scrollLeft = Math.min(maximumLeft, scroller.scrollLeft + amount);
    } else if (event.clientX <= rect.left + LABEL_WIDTH + POINTER_EDGE_SIZE) {
      scroller.scrollLeft = Math.max(0, scroller.scrollLeft - amount);
    }
  }

  function patternSession(patternId = activePatternId()) {
    const state = workspace();
    return state.patterns?.[patternId]
      ?? state.patternSurfaces?.[patternId]
      ?? {};
  }

  function auditionTrackId() {
    const trackIds = new Set(snapshot().tracks.map(({ id }) => id));
    const candidate = patternSession().auditionTrackId ?? workspace().selectedTrackId;
    return trackIds.has(candidate) ? candidate : snapshot().tracks[0].id;
  }

  function auditionTrack() {
    const project = snapshot();
    return project.tracks.find(({ id }) => id === auditionTrackId()) ?? project.tracks[0];
  }

  function instrumentPitchName(pitch) {
    return getInstrumentPitchName(auditionTrack().instrument, pitch);
  }

  function formatEditorPitch(pitch, { visual = false } = {}) {
    const midiPitch = formatMidiPitch(pitch);
    const instrumentName = instrumentPitchName(pitch);
    if (!instrumentName) return midiPitch;
    return `${midiPitch}${visual ? " · " : ", "}${instrumentName}`;
  }

  function describeNote(note) {
    return noteLabel(note, (pitch) => formatEditorPitch(pitch));
  }

  function auditionPitch(pitch, {
    noteId = null,
    velocity = PIANO_RAIL_PREVIEW_VELOCITY,
  } = {}) {
    if (!Number.isInteger(pitch) || velocity === 0) return false;
    const pattern = activePattern();
    try {
      return onAuditionPitch(Object.freeze({
        noteId,
        patternId: pattern.id,
        pitch,
        trackId: auditionTrackId(),
        velocity,
      }));
    } catch (error) {
      announce(error instanceof Error ? error.message : "The note could not be auditioned.");
      return false;
    }
  }

  function updatePatternSession(values) {
    const id = activePatternId();
    const current = patternSession(id);
    const patch = { ...values };
    if (Object.hasOwn(patch, "selectedNoteIds")) {
      patch.selection = patch.selectedNoteIds;
      delete patch.selectedNoteIds;
    }
    if (Object.hasOwn(patch, "cursorTick") || Object.hasOwn(patch, "cursorPitch")) {
      patch.cursor = {
        ...(current.cursor ?? {}),
        ...(Object.hasOwn(patch, "cursorTick") ? { tick: patch.cursorTick } : {}),
        ...(Object.hasOwn(patch, "cursorPitch") ? { pitch: patch.cursorPitch } : {}),
      };
      delete patch.cursorTick;
      delete patch.cursorPitch;
    }
    localWorkspaceMutationDepth += 1;
    try {
      if (workspaceState.updatePatternSurface) {
        workspaceState.updatePatternSurface(id, patch);
      } else if (workspaceState.setPatternSession) {
        workspaceState.setPatternSession(id, patch);
      }
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

  function selectNotes(ids, { announceSelection = true } = {}) {
    const pattern = activePattern();
    const validIds = new Set(pattern.notes.map(({ id }) => id));
    selectedNoteIds = new Set([...ids].filter((id) => validIds.has(id)));
    updatePatternSession({ selectedNoteIds: [...selectedNoteIds] });
    if (announceSelection) {
      const notes = uniqueSelectedNotes(pattern, selectedNoteIds);
      if (notes.length === 0) announce(`${pattern.name}. Selection cleared.`);
      else if (notes.length === 1) announce(`${pattern.name}. Selected ${describeNote(notes[0])}.`);
      else announce(`${pattern.name}. ${notes.length} notes selected.`);
    }
    renderEditor();
  }

  function repairSelection() {
    const pattern = activePattern();
    const patternEditorEndTick = editorEndTick(pattern);
    const session = patternSession();
    const stored = session.selection ?? session.selectedNoteIds;
    if (Array.isArray(stored) && selectedNoteIds.size === 0) selectedNoteIds = new Set(stored);
    const valid = new Set(pattern.notes.map(({ id }) => id));
    selectedNoteIds = new Set([...selectedNoteIds].filter((id) => valid.has(id)));
    cursorTick = clamp(session.cursor?.tick ?? session.cursorTick ?? cursorTick, 0, Math.max(0, patternEditorEndTick - snapTicks));
    cursorPitch = clamp(session.cursor?.pitch ?? session.cursorPitch ?? cursorPitch, MIN_PITCH, MAX_PITCH);
  }

  function setCursor(nextTick, nextPitch, { announceCursor = true } = {}) {
    const pattern = activePattern();
    const patternEditorEndTick = editorEndTick(pattern);
    cursorTick = clamp(nextTick, 0, Math.max(0, patternEditorEndTick - snapTicks));
    cursorPitch = clamp(nextPitch, MIN_PITCH, MAX_PITCH);
    updatePatternSession({ cursorPitch, cursorTick });
    if (announceCursor) {
      const atCursor = pattern.notes.find((note) => (
        note.pitch === cursorPitch
        && cursorTick >= note.startTick
        && cursorTick < note.startTick + note.durationTicks
      ));
      announce(`${pattern.name}, ${formatTickPosition(cursorTick)}, ${formatEditorPitch(cursorPitch)}, ${atCursor ? describeNote(atCursor) : "empty"}.`);
    }
    renderEditor();
  }

  function addNoteAt(tick, pitch, durationTicks = snapTicks) {
    const pattern = activePattern();
    const patternEditorEndTick = editorEndTick(pattern);
    const startTick = clamp(Math.round(tick / snapTicks) * snapTicks, 0, patternEditorEndTick - snapTicks);
    const resolvedDuration = clamp(
      Math.round(durationTicks),
      1,
      MAX_PATTERN_CONTENT_TICKS - startTick,
    );
    const noteId = mutateProject(() => projectState.addNote(pattern.id, {
      pitch: clamp(Math.round(pitch), MIN_PITCH, MAX_PITCH),
      startTick,
      durationTicks: resolvedDuration,
      velocity: 0.7,
    }));
    cursorTick = startTick;
    cursorPitch = clamp(Math.round(pitch), MIN_PITCH, MAX_PITCH);
    selectNotes([noteId]);
    renderHeader();
    return noteId;
  }

  function updateSelectedNotes(transform, ids = selectedNoteIds, { selectOnSuccess = false } = {}) {
    const pattern = activePattern();
    const notes = uniqueSelectedNotes(pattern, ids);
    if (notes.length === 0) return false;
    const patches = new Map(notes.map((note) => [note.id, transform(note)]));
    mutateProject(() => projectState.updatePattern(pattern.id, (candidate) => ({
      ...candidate,
      notes: candidate.notes.map((note) => {
        const patch = patches.get(note.id);
        return patch ? { ...note, ...patch } : note;
      }),
    }), { operation: "update-notes" }));
    if (selectOnSuccess) persistPointerSelection(ids);
    renderEditor();
    renderHeader();
    return true;
  }

  function moveSelection(deltaTick, deltaPitch, ids = selectedNoteIds, options) {
    const pattern = activePattern();
    const notes = uniqueSelectedNotes(pattern, ids);
    if (notes.some((note) => (
      note.startTick + deltaTick < 0
      || note.startTick + note.durationTicks + deltaTick > MAX_PATTERN_CONTENT_TICKS
      || note.pitch + deltaPitch < MIN_PITCH
      || note.pitch + deltaPitch > MAX_PITCH
    ))) throw new RangeError("The selected note would move outside the Pattern or pitch range.");
    return updateSelectedNotes((note) => ({
      startTick: note.startTick + deltaTick,
      pitch: note.pitch + deltaPitch,
    }), ids, options);
  }

  function resizeSelection(deltaTick, ids = selectedNoteIds, options) {
    const pattern = activePattern();
    const notes = uniqueSelectedNotes(pattern, ids);
    if (notes.some((note) => (
      note.durationTicks + deltaTick < 1
      || note.startTick + note.durationTicks + deltaTick > MAX_PATTERN_CONTENT_TICKS
    ))) throw new RangeError("The selected note would have an invalid duration.");
    return updateSelectedNotes(
      (note) => ({ durationTicks: note.durationTicks + deltaTick }),
      ids,
      options,
    );
  }

  function changeVelocity(delta) {
    return updateSelectedNotes((note) => ({
      velocity: clamp(Math.round((note.velocity + delta) * 100) / 100, 0, 1),
    }));
  }

  function copySelection() {
    const pattern = activePattern();
    clipboard = uniqueSelectedNotes(pattern, selectedNoteIds).map((note) => ({ ...note }));
    if (clipboard.length > 0) announce(`Copied ${clipboard.length} note${clipboard.length === 1 ? "" : "s"}.`);
  }

  function pasteSelection() {
    if (clipboard.length === 0) return false;
    const pattern = activePattern();
    const firstTick = Math.min(...clipboard.map(({ startTick }) => startTick));
    const shift = cursorTick - firstTick;
    const planned = clipboard.map((note) => ({ ...note, startTick: note.startTick + shift }));
    if (planned.some((note) => (
      note.startTick < 0 || note.startTick + note.durationTicks > MAX_PATTERN_CONTENT_TICKS
    ))) {
      throw new RangeError("The copied notes do not fit at the cursor.");
    }
    if (pattern.notes.length + planned.length > MAX_NOTES_PER_PATTERN) {
      throw new RangeError(`A Pattern supports at most ${MAX_NOTES_PER_PATTERN} notes.`);
    }
    const projectNoteCount = snapshot().patterns.reduce((total, candidate) => (
      total + candidate.notes.length
    ), 0);
    if (projectNoteCount + planned.length > MAX_NOTES_PER_PROJECT) {
      throw new RangeError(`A Project supports at most ${MAX_NOTES_PER_PROJECT} notes.`);
    }
    const created = mutateProject(() => projectState.addNotes(
      pattern.id,
      planned.map((note) => ({
        pitch: note.pitch,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        velocity: note.velocity,
      })),
    ));
    selectNotes(created);
    renderHeader();
    return true;
  }

  function deleteSelection() {
    if (selectedNoteIds.size === 0) return false;
    const pattern = activePattern();
    const ids = [...selectedNoteIds];
    mutateProject(() => projectState.removeNotes(pattern.id, ids));
    selectedNoteIds.clear();
    updatePatternSession({ selectedNoteIds: [] });
    setCursor(cursorTick, cursorPitch, { announceCursor: false });
    renderHeader();
    announce(`Deleted ${ids.length} note${ids.length === 1 ? "" : "s"} from ${pattern.name}.`);
    return true;
  }

  function duplicateSelection() {
    const pattern = activePattern();
    const notes = uniqueSelectedNotes(pattern, selectedNoteIds);
    if (notes.length === 0) return false;
    const deltaTicks = getPianoDuplicateDeltaTicks(notes);
    const createdIds = mutateProject(() => projectState.duplicateNotes(
      pattern.id,
      notes.map(({ id }) => id),
      { deltaTicks },
    ));
    const copies = uniqueSelectedNotes(activePattern(), createdIds);
    const first = copies[0];
    if (first) {
      cursorTick = first.startTick;
      cursorPitch = first.pitch;
      updatePatternSession({ cursorPitch, cursorTick });
    }
    selectNotes(createdIds, { announceSelection: false });
    renderHeader();
    announce(`Duplicated ${createdIds.length} note${createdIds.length === 1 ? "" : "s"} to the right.`);
    return true;
  }

  function handleEditorKeyDown(event) {
    const pattern = activePattern();
    const selected = selectedNoteIds.size > 0;
    try {
      if (isPlainSpace(event)) {
        event.preventDefault();
        if (!event.repeat) onTransportToggle();
      } else if (isMod(event) && ["+", "="].includes(event.key)) {
        event.preventDefault();
        zoomPiano(-1, undefined, { announceZoom: true });
      } else if (isMod(event) && ["-", "_"].includes(event.key)) {
        event.preventDefault();
        zoomPiano(1, undefined, { announceZoom: true });
      } else if (event.key === "Enter" && !selected) {
        event.preventDefault();
        const existing = pattern.notes.find((note) => note.pitch === cursorPitch && note.startTick === cursorTick);
        if (existing) selectNotes([existing.id]);
        else addNoteAt(cursorTick, cursorPitch);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape" && selected) {
        event.preventDefault();
        const first = uniqueSelectedNotes(pattern, selectedNoteIds)[0];
        selectedNoteIds.clear();
        updatePatternSession({ selectedNoteIds: [] });
        setCursor(first?.startTick ?? cursorTick, first?.pitch ?? cursorPitch);
      } else if (isPianoDuplicateShortcut(event)) {
        event.preventDefault();
        if (selected) duplicateSelection();
        else announce("Select one or more notes before duplicating.");
      } else if (isMod(event) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
      } else if (isMod(event) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelection();
      } else if (isMod(event) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) projectState.redo();
        else projectState.undo();
      } else if (selected && isMod(event) && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        resizeSelection(event.key === "ArrowLeft" ? -snapTicks : snapTicks);
      } else if (selected && isMod(event) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveSelection(event.key === "ArrowLeft" ? -snapTicks : snapTicks, 0);
      } else if (selected && isMod(event) && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        moveSelection(0, event.key === "ArrowUp" ? 1 : -1);
      } else if (selected && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        changeVelocity(event.key === "[" ? -0.05 : 0.05);
      } else if (!selected && event.key === "ArrowLeft") {
        event.preventDefault();
        setCursor(cursorTick - snapTicks, cursorPitch);
      } else if (!selected && event.key === "ArrowRight") {
        event.preventDefault();
        setCursor(cursorTick + snapTicks, cursorPitch);
      } else if (!selected && event.key === "ArrowUp") {
        event.preventDefault();
        setCursor(cursorTick, cursorPitch + 1);
      } else if (!selected && event.key === "ArrowDown") {
        event.preventDefault();
        setCursor(cursorTick, cursorPitch - 1);
      }
    } catch (error) {
      announce(error.message);
    }
  }

  function pointerPosition(event) {
    const pattern = activePattern();
    const rect = canvas.getBoundingClientRect();
    const x = clamp(
      (event.clientX - rect.left - LABEL_WIDTH) / pixelsPerTick,
      0,
      editorEndTick(pattern),
    );
    const pitch = clamp(
      MAX_PITCH - Math.floor((event.clientY - rect.top) / ROW_HEIGHT),
      MIN_PITCH,
      MAX_PITCH,
    );
    return { pitch, tick: x };
  }

  function beginPointerGesture(event, { cancel = () => {}, commit, move = () => {} }) {
    activePointerCancel?.();
    const pointerId = event.pointerId;
    let active = true;
    const cleanup = () => {
      if (!active) return false;
      active = false;
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointerup", handleUp);
      canvas.removeEventListener("pointercancel", handleCancel);
      if (activePointerCancel === cancelGesture) activePointerCancel = null;
      return true;
    };
    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      move(moveEvent);
    };
    const handleUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId || !cleanup()) return;
      try {
        commit(upEvent);
      } catch (error) {
        announce(error.message);
        renderEditor();
      }
    };
    const handleCancel = (cancelEvent) => {
      if (cancelEvent.pointerId !== pointerId || !cleanup()) return;
      cancel(cancelEvent);
    };
    const cancelGesture = () => {
      if (!cleanup()) return;
      cancel();
    };
    activePointerCancel = cancelGesture;
    canvas.setPointerCapture?.(pointerId);
    canvas.addEventListener("pointermove", handleMove);
    canvas.addEventListener("pointerup", handleUp);
    canvas.addEventListener("pointercancel", handleCancel);
  }

  function selectionForDrag(noteId, shiftKey) {
    if (!shiftKey && selectedNoteIds.has(noteId)) return new Set(selectedNoteIds);
    if (!shiftKey) return new Set([noteId]);
    const next = new Set(selectedNoteIds);
    next.add(noteId);
    return next;
  }

  function selectionForClick(noteId, shiftKey) {
    if (!shiftKey) return new Set([noteId]);
    const next = new Set(selectedNoteIds);
    if (next.has(noteId)) next.delete(noteId);
    else next.add(noteId);
    return next;
  }

  function persistPointerSelection(ids) {
    selectedNoteIds = new Set(ids);
    updatePatternSession({ selectedNoteIds: [...selectedNoteIds] });
  }

  function resetNotePreview(ids, property) {
    for (const id of ids) {
      const element = noteElements.get(id);
      if (element) element.style[property] = "";
    }
  }

  function paintNoteMovePreview(notes, deltaTick, deltaPitch) {
    for (const note of notes) {
      const element = noteElements.get(note.id);
      if (!element) continue;
      const preview = {
        ...note,
        pitch: note.pitch + deltaPitch,
        startTick: note.startTick + deltaTick,
      };
      element.style.translate = `${deltaTick * pixelsPerTick}px ${-deltaPitch * ROW_HEIGHT}px`;
      element.setAttribute(
        "aria-label",
        `${describeNote(preview)}${selectedNoteIds.has(note.id) ? ", selected" : ""}`,
      );
      const label = noteLabelElements.get(note.id);
      if (label) label.textContent = formatMidiPitch(preview.pitch);
    }
  }

  function resetNoteMovePreview(notes) {
    for (const note of notes) {
      const element = noteElements.get(note.id);
      if (!element) continue;
      element.style.translate = "";
      element.setAttribute(
        "aria-label",
        `${describeNote(note)}${selectedNoteIds.has(note.id) ? ", selected" : ""}`,
      );
      const label = noteLabelElements.get(note.id);
      if (label) label.textContent = formatMidiPitch(note.pitch);
    }
  }

  function startNoteMove(event, note) {
    const pattern = activePattern();
    const dragSelection = selectionForDrag(note.id, event.shiftKey);
    const clickSelection = selectionForClick(note.id, event.shiftKey);
    const notes = uniqueSelectedNotes(pattern, dragSelection);
    const originX = event.clientX;
    const originY = event.clientY;
    const originScrollLeft = scroller.scrollLeft;
    const notesEndTick = Math.max(...notes.map((candidate) => (
      candidate.startTick + candidate.durationTicks
    )));
    let deltaTick = 0;
    let deltaPitch = 0;
    let dragged = false;
    const reset = () => resetNoteMovePreview(notes);
    beginPointerGesture(event, {
      move(moveEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, moveEvent);
        scrollEditorAtPointerEdge(moveEvent);
        const requestedTick = Math.round(
          (
            moveEvent.clientX - originX
            + scroller.scrollLeft - originScrollLeft
          ) / pixelsPerTick / snapTicks,
        ) * snapTicks;
        const requestedPitch = -Math.round((moveEvent.clientY - originY) / ROW_HEIGHT);
        const patternEditorEndTick = expandEditorAtRightEdge(
          pattern,
          notesEndTick + requestedTick,
        );
        ({ deltaTick, deltaPitch } = getBoundedPianoMove(
          notes,
          requestedTick,
          requestedPitch,
          patternEditorEndTick,
        ));
        paintNoteMovePreview(notes, deltaTick, deltaPitch);
      },
      commit(upEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, upEvent);
        reset();
        if (deltaTick === 0 && deltaPitch === 0) {
          selectNotes(clickSelection);
          if (!dragged) {
            auditionPitch(note.pitch, { noteId: note.id, velocity: note.velocity });
          }
          return;
        }
        moveSelection(deltaTick, deltaPitch, dragSelection, { selectOnSuccess: true });
      },
      cancel: reset,
    });
  }

  function startNoteResize(event, note) {
    const pattern = activePattern();
    const dragSelection = selectionForDrag(note.id, event.shiftKey);
    const clickSelection = selectionForClick(note.id, event.shiftKey);
    const notes = uniqueSelectedNotes(pattern, dragSelection);
    const originX = event.clientX;
    const originY = event.clientY;
    const originScrollLeft = scroller.scrollLeft;
    const notesEndTick = Math.max(...notes.map((candidate) => (
      candidate.startTick + candidate.durationTicks
    )));
    const minimumDelta = Math.max(...notes.map(({ durationTicks }) => 1 - durationTicks));
    let deltaTick = 0;
    let dragged = false;
    const reset = () => resetNotePreview(dragSelection, "width");
    beginPointerGesture(event, {
      move(moveEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, moveEvent);
        scrollEditorAtPointerEdge(moveEvent);
        const requested = Math.round(
          (
            moveEvent.clientX - originX
            + scroller.scrollLeft - originScrollLeft
          ) / pixelsPerTick / snapTicks,
        ) * snapTicks;
        const patternEditorEndTick = expandEditorAtRightEdge(
          pattern,
          notesEndTick + requested,
        );
        const maximumDelta = Math.min(...notes.map((candidate) => (
          patternEditorEndTick - candidate.startTick - candidate.durationTicks
        )));
        deltaTick = clamp(requested, minimumDelta, maximumDelta);
        for (const candidate of notes) {
          const element = noteElements.get(candidate.id);
          if (element) {
            element.style.width = `${Math.max(10, (candidate.durationTicks + deltaTick) * pixelsPerTick)}px`;
          }
        }
      },
      commit(upEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, upEvent);
        reset();
        if (deltaTick === 0) {
          selectNotes(clickSelection);
          if (!dragged) {
            auditionPitch(note.pitch, { noteId: note.id, velocity: note.velocity });
          }
          return;
        }
        resizeSelection(deltaTick, dragSelection, { selectOnSuccess: true });
      },
      cancel: reset,
    });
  }

  function startPitchAudition(event, pitch) {
    const originX = event.clientX;
    const originY = event.clientY;
    let dragged = false;
    beginPointerGesture(event, {
      move(moveEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, moveEvent);
      },
      commit(upEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, upEvent);
        if (!dragged) auditionPitch(pitch);
      },
    });
  }

  function startDraw(event) {
    const pattern = activePattern();
    let patternEditorEndTick = editorEndTick(pattern);
    const origin = pointerPosition(event);
    const startTick = clamp(
      Math.round(origin.tick / snapTicks) * snapTicks,
      0,
      patternEditorEndTick - snapTicks,
    );
    const pitch = origin.pitch;
    let durationTicks = Math.min(snapTicks, patternEditorEndTick - startTick);
    const preview = createElement("div", {
      "aria-hidden": "true",
      className: "v2-piano-draw-preview",
      style: {
        height: `${ROW_HEIGHT - 4}px`,
        left: `${LABEL_WIDTH + startTick * pixelsPerTick}px`,
        top: `${(MAX_PITCH - pitch) * ROW_HEIGHT + 2}px`,
        width: `${Math.max(10, durationTicks * pixelsPerTick)}px`,
      },
    });
    canvas.append(preview);
    const removePreview = () => preview.remove();
    beginPointerGesture(event, {
      move(moveEvent) {
        scrollEditorAtPointerEdge(moveEvent);
        const position = pointerPosition(moveEvent);
        const requestedEndTick = Math.ceil(position.tick / snapTicks) * snapTicks;
        patternEditorEndTick = expandEditorAtRightEdge(pattern, requestedEndTick);
        const endTick = clamp(
          requestedEndTick,
          startTick + snapTicks,
          patternEditorEndTick,
        );
        durationTicks = endTick - startTick;
        preview.style.width = `${Math.max(10, durationTicks * pixelsPerTick)}px`;
      },
      commit() {
        removePreview();
        addNoteAt(startTick, pitch, durationTicks);
      },
      cancel: removePreview,
    });
  }

  function startMarquee(event) {
    const pattern = activePattern();
    const origin = pointerPosition(event);
    let current = origin;
    const preview = createElement("div", {
      "aria-hidden": "true",
      className: "v2-piano-marquee",
    });
    canvas.append(preview);
    const paint = () => {
      const leftTick = Math.min(origin.tick, current.tick);
      const rightTick = Math.max(origin.tick, current.tick);
      const highPitch = Math.max(origin.pitch, current.pitch);
      const lowPitch = Math.min(origin.pitch, current.pitch);
      preview.style.left = `${LABEL_WIDTH + leftTick * pixelsPerTick}px`;
      preview.style.top = `${(MAX_PITCH - highPitch) * ROW_HEIGHT}px`;
      preview.style.width = `${Math.max(1, (rightTick - leftTick) * pixelsPerTick)}px`;
      preview.style.height = `${Math.max(1, (highPitch - lowPitch + 1) * ROW_HEIGHT)}px`;
    };
    paint();
    const removePreview = () => preview.remove();
    beginPointerGesture(event, {
      move(moveEvent) {
        current = pointerPosition(moveEvent);
        paint();
      },
      commit() {
        removePreview();
        const matches = getPianoMarqueeNoteIds(pattern.notes, {
          fromPitch: origin.pitch,
          fromTick: origin.tick,
          patternLength: editorEndTick(pattern),
          toPitch: current.pitch,
          toTick: current.tick,
        });
        const next = event.shiftKey ? new Set(selectedNoteIds) : new Set();
        for (const id of matches) next.add(id);
        selectNotes(next);
      },
      cancel: removePreview,
    });
  }

  function startPan(event, { note = null, pitch = null } = {}) {
    const originX = event.clientX;
    const originY = event.clientY;
    const originLeft = scroller.scrollLeft;
    const originTop = scroller.scrollTop;
    let dragged = false;
    beginPointerGesture(event, {
      move(moveEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, moveEvent);
        scroller.scrollLeft = originLeft - (moveEvent.clientX - originX);
        scroller.scrollTop = originTop - (moveEvent.clientY - originY);
      },
      commit(upEvent) {
        dragged ||= exceedsPianoClickSlop(originX, originY, upEvent);
        if (dragged) return;
        scroller.scrollLeft = originLeft;
        scroller.scrollTop = originTop;
        if (note) {
          selectNotes(selectionForClick(note.id, event.shiftKey));
          auditionPitch(note.pitch, { noteId: note.id, velocity: note.velocity });
        } else if (Number.isInteger(pitch)) {
          auditionPitch(pitch);
        }
      },
      cancel() {
        scroller.scrollLeft = originLeft;
        scroller.scrollTop = originTop;
      },
    });
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    canvas.focus({ preventScroll: true });
    const pitchLabel = event.target.closest?.(".v2-pitch-label[data-pitch]");
    if (pitchLabel) {
      const pitch = Number(pitchLabel.dataset.pitch);
      if (tool === "pan") startPan(event, { pitch });
      else startPitchAudition(event, pitch);
      return;
    }
    const noteButton = event.target.closest?.(".v2-piano-note");
    const note = noteButton
      ? activePattern().notes.find(({ id }) => id === noteButton.dataset.noteId)
      : null;
    if (isMod(event) && !note) {
      startMarquee(event);
      return;
    }
    if (tool === "pan") {
      startPan(event, { note });
      return;
    }
    if (note && event.target.closest?.(".v2-note-resize")) {
      startNoteResize(event, note);
      return;
    }
    if (note) {
      startNoteMove(event, note);
      return;
    }
    if (tool === "draw") startDraw(event);
    else startMarquee(event);
  }

  function handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    canvas.focus({ preventScroll: true });
    const noteButton = event.target.closest?.(".v2-piano-note");
    if (!noteButton) return;
    const pattern = activePattern();
    const note = pattern.notes.find(({ id }) => id === noteButton.dataset.noteId);
    if (!note) return;
    activePointerCancel?.();
    mutateProject(() => projectState.removeNotes(pattern.id, [note.id]));
    selectedNoteIds.delete(note.id);
    cursorTick = note.startTick;
    cursorPitch = note.pitch;
    updatePatternSession({
      cursorPitch,
      cursorTick,
      selectedNoteIds: [...selectedNoteIds],
    });
    renderEditor();
    renderHeader();
    announce(`Deleted ${describeNote(note)} from ${pattern.name}.`);
  }

  function renderInspector() {
    clearElement(inspector);
    const notes = uniqueSelectedNotes(activePattern(), selectedNoteIds);
    if (notes.length === 0) {
      inspector.append(createElement("p", { textContent: `${formatTickPosition(cursorTick)} · ${formatEditorPitch(cursorPitch, { visual: true })} · no note selected` }));
      inspector.append(createElement("button", {
        className: "v2-mobile-note-action",
        textContent: "Create note here",
        type: "button",
        onClick: () => {
          try {
            addNoteAt(cursorTick, cursorPitch);
          } catch (error) {
            announce(error instanceof Error ? error.message : "The note could not be created.");
            renderEditor();
            renderHeader();
          }
        },
      }));
      return;
    }
    inspector.append(createElement("strong", { textContent: notes.length === 1 ? describeNote(notes[0]) : `${notes.length} notes selected` }));
    const velocity = createElement("input", {
      "aria-label": "Selected note velocity",
      max: 1,
      min: 0,
      step: 0.05,
      type: "range",
      value: notes[0].velocity,
    });
    const velocityValue = createElement("output", { textContent: formatPercent(notes[0].velocity) });
    velocity.addEventListener("input", () => { velocityValue.value = formatPercent(Number(velocity.value)); });
    velocity.addEventListener("change", () => {
      const value = Number(velocity.value);
      updateSelectedNotes(() => ({ velocity: value }));
    });
    inspector.append(createElement("label", { className: "v2-note-velocity" }, ["Velocity", velocity, velocityValue]));
    inspector.append(createElement("button", {
      className: "v2-danger-button",
      textContent: notes.length === 1 ? "Delete note" : "Delete selected notes",
      type: "button",
      onClick: deleteSelection,
    }));
  }

  function updatePlayhead(frame = getTransportFrame?.()) {
    if (!playheadElement) return false;
    const fallback = workspace().playback?.patternPlayheadTick ?? 0;
    const tick = Number.isFinite(frame?.patternTick) ? frame.patternTick : fallback;
    playheadElement.style.translate = `${
      clamp(tick, 0, getPatternPlaybackEndTick(activePattern())) * pixelsPerTick
    }px 0`;
    return true;
  }

  function renderEditor() {
    if (disposed) return;
    activePointerCancel?.();
    repairSelection();
    const pattern = activePattern();
    const patternEditorEndTick = editorEndTick(pattern);
    canvas.style.setProperty("--v2-pixels-per-tick", String(pixelsPerTick));
    canvas.style.setProperty("--v2-piano-label-width", `${LABEL_WIDTH}px`);
    paintEditorWidth(patternEditorEndTick);
    canvas.style.height = `${(MAX_PITCH - MIN_PITCH + 1) * ROW_HEIGHT}px`;
    canvas.setAttribute("aria-label", `${pattern.name}, Piano Roll`);
    noteElements.clear();
    noteLabelElements.clear();
    playheadElement = null;
    clearElement(canvas);

    for (let pitch = MAX_PITCH; pitch >= MIN_PITCH; pitch -= 1) {
      const instrumentName = instrumentPitchName(pitch);
      const pitchText = formatEditorPitch(pitch, { visual: true });
      const row = createElement("div", {
        "aria-hidden": "true",
        className: `v2-pitch-row ${pitch % 12 === 0 ? "is-c" : ""}`,
        style: { top: `${(MAX_PITCH - pitch) * ROW_HEIGHT}px` },
      });
      row.append(createElement("span", {
        className: `v2-pitch-label${instrumentName ? " has-drum-name" : ""}`,
        dataset: { pitch },
        textContent: pitchText,
        title: instrumentName
          ? `Play ${instrumentName} (${formatMidiPitch(pitch)})`
          : `Play ${formatMidiPitch(pitch)}`,
      }));
      canvas.append(row);
    }

    const cursor = createElement("div", {
      className: "v2-piano-cursor",
      id: `v2-piano-cursor-${pattern.id}`,
      role: "option",
      "aria-selected": "false",
      "aria-label": `${formatTickPosition(cursorTick)}, ${formatEditorPitch(cursorPitch)}`,
      style: {
        height: `${ROW_HEIGHT - 2}px`,
        left: `${LABEL_WIDTH + cursorTick * pixelsPerTick}px`,
        top: `${(MAX_PITCH - cursorPitch) * ROW_HEIGHT + 1}px`,
        width: `${Math.max(6, snapTicks * pixelsPerTick)}px`,
      },
    });
    canvas.append(cursor);

    playheadElement = createElement("div", {
      "aria-hidden": "true",
      className: "v2-piano-playhead",
      style: { left: `${LABEL_WIDTH}px` },
    });
    canvas.append(playheadElement);

    for (const note of pattern.notes) {
      const selected = selectedNoteIds.has(note.id);
      const pitchLabel = createElement("span", {
        className: "v2-piano-note-label",
        textContent: formatMidiPitch(note.pitch),
      });
      const button = createElement("button", {
        className: `v2-piano-note${selected ? " is-selected" : ""}`,
        dataset: { noteId: note.id },
        id: `v2-piano-note-${note.id}`,
        role: "option",
        tabIndex: -1,
        type: "button",
        "aria-label": `${describeNote(note)}${selected ? ", selected" : ""}`,
        "aria-selected": String(selected),
        style: {
          height: `${ROW_HEIGHT - 4}px`,
          left: `${LABEL_WIDTH + note.startTick * pixelsPerTick}px`,
          top: `${(MAX_PITCH - note.pitch) * ROW_HEIGHT + 2}px`,
          width: `${Math.max(10, note.durationTicks * pixelsPerTick)}px`,
        },
      }, [
        pitchLabel,
        createElement("span", { className: "v2-note-resize", "aria-hidden": "true" }),
      ]);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.detail !== 0) return;
        selectNotes(selectionForClick(note.id, event.shiftKey));
        auditionPitch(note.pitch, { noteId: note.id, velocity: note.velocity });
      });
      noteElements.set(note.id, button);
      noteLabelElements.set(note.id, pitchLabel);
      canvas.append(button);
    }
    const activeNoteId = pattern.notes.find(({ id }) => selectedNoteIds.has(id))?.id;
    canvas.setAttribute(
      "aria-activedescendant",
      activeNoteId ? `v2-piano-note-${activeNoteId}` : cursor.id,
    );
    updatePlayhead();
    renderInspector();
  }

  function zoomPiano(deltaY, anchorClientX, { announceZoom = false } = {}) {
    if (deltaY === 0) return false;
    const rect = scroller.getBoundingClientRect();
    const next = getPianoZoomViewport({
      anchorClientX,
      currentPixelsPerTick: pixelsPerTick,
      deltaY,
      scrollLeft: scroller.scrollLeft,
      viewportLeft: rect.left,
      viewportWidth: scroller.clientWidth,
    });
    if (next.pixelsPerTick === pixelsPerTick) return false;
    pixelsPerTick = next.pixelsPerTick;
    renderEditor();
    scroller.scrollLeft = next.scrollLeft;
    updatePatternSession({
      viewport: { left: scroller.scrollLeft, top: scroller.scrollTop },
    });
    if (announceZoom) announce(`Piano Roll zoom ${Math.round(pixelsPerTick / 1.35 * 100)}%.`);
    return true;
  }

  function handleWheel(event) {
    if (!isMod(event)) return;
    event.preventDefault();
    event.stopPropagation();
    zoomPiano(event.deltaY, event.clientX);
  }

  function renderHeader() {
    const project = snapshot();
    const pattern = activePattern();
    title.textContent = `${pattern.name}, Piano Roll`;
    clearElement(header);
    header.append(title);

    const patternSelect = createElement("select", { "aria-label": "Pattern", value: pattern.id });
    for (const candidate of project.patterns) {
      patternSelect.append(createElement("option", { textContent: candidate.name, value: candidate.id }));
    }
    patternSelect.value = pattern.id;
    patternSelect.addEventListener("change", () => {
      workspaceState.openPianoRoll?.(patternSelect.value);
      workspaceState.setActivePattern?.(patternSelect.value);
      selectedNoteIds.clear();
      cursorTick = 0;
      render();
      title.focus();
    });

    const auditionSelect = createElement("select", { "aria-label": "Audition and destination Track" });
    for (const track of project.tracks) {
      auditionSelect.append(createElement("option", { textContent: track.name, value: track.id }));
    }
    auditionSelect.value = auditionTrackId();
    auditionSelect.addEventListener("change", () => {
      updatePatternSession({ auditionTrackId: auditionSelect.value });
      const track = projectState.getTrack(auditionSelect.value);
      renderEditor();
      announce(`${pattern.name} will audition through ${track.name} using ${getInstrumentName(track.instrument)}.`);
    });
    const toolGroup = createElement("div", { className: "v2-segmented v2-piano-tools", role: "group", "aria-label": "Piano Roll tool" });
    for (const [value, label] of [["draw", "Draw"], ["select", "Select"]]) {
      const button = createElement("button", {
        dataset: { pianoTool: value },
        textContent: label,
        type: "button",
      });
      setPressed(button, tool === value);
      button.addEventListener("click", () => {
        desktopTool = value;
        tool = value;
        canvas.dataset.tool = tool;
        renderHeader();
      });
      toolGroup.append(button);
    }
    const snapSelect = createElement("select", { "aria-label": "Piano Roll snap" });
    for (const label of Object.keys(SNAP_OPTIONS)) {
      snapSelect.append(createElement("option", { textContent: label, value: label }));
    }
    snapSelect.value = patternSession().snap ?? "1/16";
    snapSelect.addEventListener("change", () => {
      const snap = snapSelect.value;
      snapTicks = SNAP_OPTIONS[snap];
      updatePatternSession({ snap });
      renderEditor();
    });

    const audible = pattern.notes.some(({ velocity }) => velocity > 0);
    const add = createElement("button", {
      className: "v2-primary-action",
      disabled: !audible,
      textContent: "Add to Playlist",
      title: audible ? `Add ${pattern.name} to ${projectState.getTrack(auditionTrackId()).name}` : "Add a note with non-zero velocity first",
      type: "button",
      onClick: () => onAddToPlaylist(pattern.id, auditionTrackId(), snapTicks),
    });

    const actions = createElement("details", { className: "v2-action-menu" });
    actions.append(createElement("summary", { textContent: "Pattern actions" }));
    const actionPanel = createElement("div", { className: "v2-action-menu-panel" });
    const newPattern = createElement("button", { disabled: project.patterns.length >= 64, textContent: "New Pattern", type: "button" });
    newPattern.addEventListener("click", () => {
      const id = projectState.createPattern();
      workspaceState.openPianoRoll?.(id);
      workspaceState.setActivePattern?.(id);
    });
    const duplicate = createElement("button", { disabled: project.patterns.length >= 64, textContent: "Duplicate Pattern", type: "button" });
    duplicate.addEventListener("click", () => {
      const id = projectState.duplicatePattern(pattern.id);
      workspaceState.openPianoRoll?.(id);
      workspaceState.setActivePattern?.(id);
    });
    const rename = createElement("button", { textContent: "Rename Pattern", type: "button" });
    rename.addEventListener("click", () => {
      actions.open = false;
      requestPatternRename(rename);
    });
    const remove = createElement("button", {
      className: "v2-danger-button",
      disabled: project.patterns.length === 1,
      textContent: "Delete Pattern",
      type: "button",
    });
    remove.addEventListener("click", async () => {
      if (await confirmPatternDelete(pattern)) projectState.deletePattern(pattern.id, { removeReferences: true });
    });
    actionPanel.append(newPattern, duplicate, rename, remove);
    actions.append(actionPanel);

    const history = createElement("div", { className: "v2-history-actions" }, [
      createElement("button", { disabled: !projectState.getHistoryState().canUndo, textContent: "Undo", type: "button", onClick: () => projectState.undo() }),
      createElement("button", { disabled: !projectState.getHistoryState().canRedo, textContent: "Redo", type: "button", onClick: () => projectState.redo() }),
    ]);
    header.append(
      createElement("label", {}, ["Pattern", patternSelect]),
      createElement("label", {}, ["Audition Track", auditionSelect]),
      toolGroup,
      createElement("label", {}, ["Snap", snapSelect]),
      add,
      history,
      actions,
    );
  }

  function render() {
    if (disposed) return;
    const session = patternSession();
    snapTicks = SNAP_OPTIONS[session.snap] ?? SNAP_OPTIONS["1/16"];
    cursorTick = session.cursor?.tick ?? session.cursorTick ?? cursorTick;
    cursorPitch = session.cursor?.pitch ?? session.cursorPitch ?? cursorPitch;
    canvas.dataset.tool = tool;
    renderHeader();
    renderEditor();
  }

  function synchronizePianoNames() {
    if (disposed) return false;
    const project = snapshot();
    const pattern = activePattern();
    title.textContent = `${pattern.name}, Piano Roll`;
    canvas.setAttribute("aria-label", `${pattern.name}, Piano Roll`);
    const patternSelect = header.querySelector('select[aria-label="Pattern"]');
    for (const option of patternSelect?.querySelectorAll?.("option") ?? []) {
      const candidate = project.patterns.find(({ id }) => id === option.value);
      if (candidate) option.textContent = candidate.name;
    }
    const auditionSelect = header.querySelector('select[aria-label="Audition and destination Track"]');
    for (const option of auditionSelect?.querySelectorAll?.("option") ?? []) {
      const track = project.tracks.find(({ id }) => id === option.value);
      if (track) option.textContent = track.name;
    }
    const add = header.querySelector(".v2-primary-action");
    if (add && !add.disabled) {
      add.title = `Add ${pattern.name} to ${projectState.getTrack(auditionTrackId()).name}`;
    }
    return true;
  }

  canvas.addEventListener("keydown", handleEditorKeyDown, { signal: lifecycle.signal });
  canvas.addEventListener("pointerdown", handlePointerDown, { signal: lifecycle.signal });
  canvas.addEventListener("contextmenu", handleContextMenu, { signal: lifecycle.signal });
  scroller.addEventListener("wheel", handleWheel, { signal: lifecycle.signal, passive: false });
  mobileEditorQuery?.addEventListener?.("change", (event) => {
    const nextTool = getPianoToolForViewport(event.matches, desktopTool);
    if (tool === nextTool) return;
    tool = nextTool;
    canvas.dataset.tool = tool;
    renderHeader();
  }, { signal: lifecycle.signal });
  scroller.addEventListener("scroll", () => {
    updatePatternSession({ viewport: { left: scroller.scrollLeft, top: scroller.scrollTop } });
  }, { signal: lifecycle.signal, passive: true });

  const replacementOperations = new Set(["open-project", "replace", "create-project-from-template"]);
  const handleProjectChange = (event) => {
    if (localProjectMutationDepth > 0 || replacementOperations.has(event?.detail?.operation)) return;
    if (["rename-pattern", "rename-track"].includes(event?.detail?.operation)) {
      synchronizePianoNames();
      return;
    }
    render();
  };
  const handleWorkspaceChange = (event) => {
    if (localWorkspaceMutationDepth > 0) return;
    const action = event?.detail?.action;
    const type = action?.type ?? "";
    if (type === "pattern/update" && action.patternId === activePatternId()) {
      render();
    } else if (type.startsWith("project/") || type.endsWith("/repair")) {
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

  function restoreInitialViewport() {
    if (disposed) return;
    viewportRestoreObserver?.disconnect();
    viewportRestoreObserver = null;
    const viewport = patternSession().viewport;
    scroller.scrollLeft = Number.isFinite(viewport?.left) ? viewport.left : 0;
    if (Number.isFinite(viewport?.top)) {
      scroller.scrollTop = viewport.top;
    } else {
      scroller.scrollTop = getInitialPianoViewportTop(
        activePattern(),
        scroller.clientHeight,
        scroller.scrollHeight,
      );
    }
  }

  queueMicrotask(() => {
    if (disposed) return;
    if (typeof globalThis.ResizeObserver === "function") {
      viewportRestoreObserver = new globalThis.ResizeObserver(() => {
        if (scroller.clientHeight > 0) restoreInitialViewport();
      });
      viewportRestoreObserver.observe(scroller);
    } else restoreInitialViewport();
  });

  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      viewportRestoreObserver?.disconnect();
      viewportRestoreObserver = null;
      activePointerCancel?.();
      lifecycle.abort();
      projectState.removeEventListener("change", handleProjectChange);
      workspaceState.removeEventListener?.("change", handleWorkspaceChange);
      node.remove();
    },
    focus: () => title.focus({ preventScroll: true }),
    node,
    render,
    requestPatternRename,
  });
}
