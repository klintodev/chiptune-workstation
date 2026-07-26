import { setTextIfChanged } from "../../shared/status-announcer.js";
import { fitCanvas } from "../../visualiser/canvas-renderer.js";
import { buildCompositionProjection } from "../../visualiser/composition-projection.js";
import { renderCompositionFrame } from "../../visualiser/signal-stack-renderer.js";
import {
  getVisualiserPalette,
  getVisualiserTrackColour,
} from "../../visualiser/visualiser-palette.js";
import { createVisualiserPalettePicker } from "./visualiser-palette-picker.js";
import {
  buildProjectionSummary,
  getProjectedNoteAccessibleName,
  getProjectedNoteDetails,
  normalizeVisualPreferences,
  resolveProjectedNoteSource,
} from "../../visualiser/visual-learning-model.js";

const PREFERENCE_KEY = "klinto-visual-learning-preferences";

function readTheme(paletteId, highContrast) {
  const palette = getVisualiserPalette(paletteId);
  return Object.freeze({
    background: palette.background,
    grid: highContrast ? palette.ink : palette.grid,
    highContrast,
    ink: palette.ink,
    muted: palette.muted,
  });
}

function readPreferences(root) {
  try {
    return normalizeVisualPreferences(JSON.parse(root.defaultView?.localStorage?.getItem(PREFERENCE_KEY) ?? "{}"));
  } catch {
    return normalizeVisualPreferences();
  }
}

function savePreferences(root, preferences) {
  try {
    root.defaultView?.localStorage?.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage is an enhancement; the visual surface remains available without it.
  }
}

function transportLabel(projection) {
  const mode = projection.mode === "pattern" ? "Pattern" : "Arrangement";
  return `${mode} · ${projection.status} · step ${String(projection.stepIndex + 1).padStart(3, "0")}`;
}

function legendMarkup() {
  return `
    <details class="visualiser-legend">
      <summary>How to read this</summary>
      <dl>
        <div><dt>Depth</dt><dd>Time until the note starts</dd></div>
        <div><dt>Height</dt><dd>Pitch: higher notes sit higher</dd></div>
        <div><dt>Size</dt><dd>Velocity or note emphasis</dd></div>
        <div><dt>Colour</dt><dd>The arrangement track</dd></div>
        <div><dt>Shape</dt><dd>The track's voice type</dd></div>
        <div><dt>Tail</dt><dd>Gate length or held duration</dd></div>
        <div><dt>Bright marks</dt><dd>A note sounding now</dd></div>
      </dl>
      <p data-mode-explanation>Track lanes group notes by track for learning; they do not show stereo position.</p>
      <p data-palette-explanation>The Studio palette changes the scene and track hues, not the music.</p>
    </details>`;
}

function surfaceMarkup(kind) {
  return `
    <div class="visualiser-surface visualiser-surface-` + kind + `" data-surface="` + kind + `">
      <div class="visualiser-stage">
        <canvas aria-label="Composition note visualisation"></canvas>
        <div class="visualiser-empty" data-empty hidden>
          <strong>No notes in this view yet</strong>
          <span>Add notes in the pattern editor to see time, pitch and expression here.</span>
          <button type="button" data-open-pattern>Open pattern editor</button>
        </div>
        <p data-fallback hidden>Canvas is unavailable. The note list, inspector and music playback still work.</p>
      </div>
      <section class="visualiser-explanation" aria-label="Visual note explanation">
        <p class="visualiser-summary" data-summary aria-live="off"></p>
        <ol class="visualiser-note-list" data-note-list aria-label="Projected notes"></ol>
        <aside class="visualiser-inspector" data-inspector aria-label="Selected note details" hidden>
          <div><strong>Selected note</strong><button type="button" data-clear-selection aria-label="Close note details">&times;</button></div>
          <dl data-inspector-details></dl>
          <button type="button" data-edit-note>Edit this note</button>
          <p data-stale hidden>This note is no longer available in the project.</p>
        </aside>
      </section>
    </div>`;
}

function createSurface(root, container) {
  const canvas = container.querySelector("canvas");
  let context = null;
  try {
    context = canvas.getContext?.("2d", { alpha: false }) ?? null;
    if (context) context.imageSmoothingEnabled = false;
  } catch {
    context = null;
  }
  if (!context) {
    canvas.hidden = true;
    container.querySelector("[data-fallback]").hidden = false;
  }
  return {
    canvas,
    container,
    context,
    empty: container.querySelector("[data-empty]"),
    inspector: container.querySelector("[data-inspector]"),
    inspectorDetails: container.querySelector("[data-inspector-details]"),
    lastLayout: null,
    list: container.querySelector("[data-note-list]"),
    semanticKey: "",
    summary: container.querySelector("[data-summary]"),
  };
}

export function createVisualiserFeature({
  onEditNote = null,
  projectState,
  root = document,
  scheduler,
  sessionState,
} = {}) {
  if (!projectState || !scheduler || !sessionState) {
    throw new TypeError("Visualiser requires project, scheduler, and session state.");
  }
  const lifecycle = new AbortController();
  const window = root.defaultView ?? globalThis;
  const mobile = window.matchMedia?.("(max-width: 767px)");
  const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let preferences = readPreferences(root);
  if (systemReducedMotion?.matches) {
    preferences = normalizeVisualPreferences({ ...preferences, motion: "reduced" });
  }
  let animationFrame = 0;
  let selectedNoteId = null;
  let dockSize = mobile?.matches ? "collapsed" : "default";

  const open = root.createElement("button");
  open.id = "visualiser-open";
  open.type = "button";
  open.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15v4M5 5v6M12 12v7M12 5v3M19 16v3M19 5v7"/><circle cx="5" cy="13" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="19" cy="14" r="2"/></svg><span class="visually-hidden">Open performance visualiser</span>`;
  open.setAttribute("aria-label", "Open performance visualiser");
  open.title = "Open performance visualiser";
  (root.querySelector("#global-tools") ?? root.querySelector(".global-status"))?.append(open);

  const template = root.createElement("template");
  template.innerHTML = `
    <section class="visualiser-dock" data-size="collapsed" aria-labelledby="visualiser-dock-title">
      <header class="visualiser-dock-header">
        <button type="button" data-dock-toggle aria-expanded="false" aria-controls="visualiser-dock-body">
          <span aria-hidden="true">▴</span><strong id="visualiser-dock-title">Visual guide</strong>
        </button>
        <output data-dock-status aria-live="off"></output>
        <div class="visualiser-dock-actions">
          <label>View <select data-presentation><option value="lanes">Track lanes</option><option value="stereo">Stereo</option></select></label>
          <button type="button" data-palette-open><span>Colours</span><small data-palette-label>Studio</small></button>
          <button type="button" data-resize>Expand</button>
          <button type="button" data-fullscreen>Performance view</button>
        </div>
      </header>
      <div id="visualiser-dock-body" class="visualiser-dock-body">`
    + legendMarkup()
    + surfaceMarkup("compact")
    + `</div>
    </section>
    <dialog class="visualiser-dialog" aria-labelledby="visualiser-title" aria-describedby="visualiser-description">
      <section class="visualiser-panel">
        <header class="visualiser-header">
          <div class="visualiser-heading">
            <span class="panel-context">Composition field</span>
            <h2 id="visualiser-title">Upcoming notes</h2>
            <p id="visualiser-description" class="visually-hidden">The same deterministic note projection shown in the editing dock.</p>
          </div>
          <output class="visualiser-status" data-status></output>
          <p class="visually-hidden" data-announcer role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="visualiser-actions">
            <label>View <select data-presentation><option value="lanes">Track lanes</option><option value="stereo">Stereo</option></select></label>
            <label><input type="checkbox" data-reduced-motion /> Reduced motion</label>
            <label><input type="checkbox" data-high-contrast /> High contrast</label>
            <button type="button" data-palette-open><span>Colours</span><small data-palette-label>Studio</small></button>
            <button type="button" data-announce>Announce current view</button>
            <button type="button" data-play>Play</button>
            <button type="button" data-stop>Stop</button>
            <button type="button" data-close>Close</button>
          </div>
        </header>
        <div class="visualiser-performance-body">`
    + legendMarkup()
    + surfaceMarkup("performance")
    + `</div>
      </section>
    </dialog>
    <p class="visually-hidden" data-visual-announcement role="status" aria-live="polite"></p>`;
  const fragment = template.content;
  const dock = fragment.querySelector(".visualiser-dock");
  const dialog = fragment.querySelector(".visualiser-dialog");
  const announcement = fragment.querySelector("[data-visual-announcement]");
  (root.querySelector(".daw-workspace") ?? root.querySelector("main"))?.append(dock);
  root.body.append(dialog, announcement);

  const surfaces = [
    createSurface(root, dock.querySelector('[data-surface="compact"]')),
    createSurface(root, dialog.querySelector('[data-surface="performance"]')),
  ];
  const dockToggle = dock.querySelector("[data-dock-toggle]");
  const dockStatus = dock.querySelector("[data-dock-status]");
  const resize = dock.querySelector("[data-resize]");
  const fullscreen = dock.querySelector("[data-fullscreen]");
  const status = dialog.querySelector("[data-status]");
  const announcer = dialog.querySelector("[data-announcer]");
  const play = dialog.querySelector("[data-play]");
  const stop = dialog.querySelector("[data-stop]");
  let announcedTransportStatus = null;
  let previewPaletteId = null;

  function getActivePaletteId() {
    return previewPaletteId ?? projectState.getState().visualiser.palette;
  }

  function syncPaletteMetadata() {
    const palette = getVisualiserPalette(getActivePaletteId());
    for (const label of root.querySelectorAll("[data-palette-label]")) label.textContent = palette.name;
    for (const button of root.querySelectorAll("[data-palette-open]")) {
      button.setAttribute("aria-label", `Choose visualiser colours. Current palette: ${palette.name}.`);
    }
    for (const explanation of root.querySelectorAll("[data-palette-explanation]")) {
      explanation.textContent = `${palette.name} changes the scene and track hues, not the music.`;
    }
  }

  function setPreferences(values) {
    preferences = normalizeVisualPreferences({ ...preferences, ...values });
    savePreferences(root, preferences);
    for (const select of root.querySelectorAll("[data-presentation]")) select.value = preferences.presentation;
    for (const explanation of root.querySelectorAll("[data-mode-explanation]")) {
      explanation.textContent = preferences.presentation === "lanes"
        ? "Track lanes group notes by track for learning; they do not show stereo position."
        : "Stereo places notes at the track's exact saved pan position.";
    }
    dialog.querySelector("[data-reduced-motion]").checked = preferences.motion === "reduced";
    dialog.querySelector("[data-high-contrast]").checked = preferences.contrast === "high";
    dock.dataset.contrast = preferences.contrast;
    dialog.dataset.contrast = preferences.contrast;
    scheduleDraw();
  }

  function getProjection() {
    const project = projectState.getState();
    const paletteId = getActivePaletteId();
    const workspace = sessionState.getState().workspace;
    const projection = buildCompositionProjection(project, scheduler.getTimelineSnapshot(), {
      horizonSteps: dockSize === "expanded" || dialog.open ? 16 : 10,
      selectedPatternId: workspace.selectedPatternId,
      selectedTrackId: workspace.selectedTrackId,
    });
    return Object.freeze({
      ...projection,
      notes: Object.freeze(projection.notes.map((note) => Object.freeze({
        ...note,
        colour: getVisualiserTrackColour(paletteId, note.trackIndex),
      }))),
    });
  }

  function renderInspector(surface, projection) {
    const note = projection.notes.find((candidate) => candidate.id === selectedNoteId);
    if (!note) {
      surface.inspector.hidden = true;
      return;
    }
    const details = getProjectedNoteDetails(note);
    surface.inspectorDetails.replaceChildren(...Object.entries(details).map(([label, value]) => {
      const row = root.createElement("div");
      const term = root.createElement("dt");
      const description = root.createElement("dd");
      term.textContent = label.replace(/([A-Z])/g, " $1");
      description.textContent = value;
      row.append(term, description);
      return row;
    }));
    const source = resolveProjectedNoteSource(projectState.getState(), note);
    const edit = surface.inspector.querySelector("[data-edit-note]");
    edit.hidden = typeof onEditNote !== "function";
    edit.disabled = !source;
    surface.inspector.querySelector("[data-stale]").hidden = Boolean(source);
    surface.inspector.hidden = false;
  }

  function renderList(surface, projection) {
    const focusedId = root.activeElement?.dataset?.projectedNoteId;
    surface.list.replaceChildren(...projection.notes.map((note) => {
      const item = root.createElement("li");
      const button = root.createElement("button");
      button.type = "button";
      button.dataset.projectedNoteId = note.id;
      button.setAttribute("aria-label", getProjectedNoteAccessibleName(note));
      button.setAttribute("aria-pressed", String(note.id === selectedNoteId));
      const track = root.createElement("span");
      const pitch = root.createElement("strong");
      const timing = root.createElement("small");
      track.textContent = note.trackName;
      pitch.textContent = note.noteLabel;
      timing.textContent = `${note.timingState} · step ${note.patternStepIndex + 1}`;
      button.append(track, pitch, timing);
      item.append(button);
      return item;
    }));
    if (focusedId) {
      [...surface.list.querySelectorAll("[data-projected-note-id]")]
        .find((button) => button.dataset.projectedNoteId === focusedId)
        ?.focus();
    }
  }

  function drawSurface(surface, projection) {
    const semanticKey = [
      projection.mode,
      projection.status,
      projection.stepIndex,
      selectedNoteId,
      ...projection.notes.map((note) => (
        `${note.id}:${note.timingState}:${Math.round(note.stepsUntilStart * 4)}`
      )),
    ].join("|");
    surface.empty.hidden = projection.notes.length > 0;
    if (surface.semanticKey !== semanticKey) {
      surface.semanticKey = semanticKey;
      surface.summary.textContent = buildProjectionSummary(projection);
      renderList(surface, projection);
      renderInspector(surface, projection);
    }
    if (!surface.context || surface.canvas.hidden) return;
    const { height, ratio, width } = fitCanvas(surface.canvas);
    surface.lastLayout = renderCompositionFrame(surface.context, projection, {
      ...readTheme(getActivePaletteId(), preferences.contrast === "high"),
      height,
      motion: preferences.motion,
      presentationMode: preferences.presentation,
      ratio,
      width,
    });
  }

  function isSurfaceVisible(surface) {
    if (surface.container.closest(".visualiser-dialog")) return dialog.open;
    return dockSize !== "collapsed";
  }

  function draw() {
    animationFrame = 0;
    if (root.visibilityState === "hidden") return;
    const projection = getProjection();
    const label = transportLabel(projection);
    setTextIfChanged(status, label);
    setTextIfChanged(dockStatus, label);
    if (announcedTransportStatus !== projection.status) {
      announcedTransportStatus = projection.status;
      const announcementLabel = projection.status === "playing"
        ? "Playing"
        : projection.status === "paused" ? "Paused" : "Stopped";
      setTextIfChanged(announcer, announcementLabel);
    }
    play.disabled = root.getElementById("transport-play")?.disabled ?? true;
    stop.disabled = root.getElementById("transport-stop")?.disabled ?? true;
    for (const surface of surfaces) {
      if (isSurfaceVisible(surface)) drawSurface(surface, projection);
    }
    if (scheduler.getState().status === "playing" && preferences.motion !== "reduced") {
      animationFrame = window.requestAnimationFrame(draw);
    }
  }

  function scheduleDraw() {
    if (!animationFrame && (dockSize !== "collapsed" || dialog.open)) {
      animationFrame = window.requestAnimationFrame(draw);
    }
  }

  function selectNote(noteId, { focusInspector = false } = {}) {
    selectedNoteId = noteId;
    scheduleDraw();
    if (focusInspector) {
      window.requestAnimationFrame(() => {
        const activeSurface = dialog.open ? surfaces[1] : surfaces[0];
        activeSurface.inspector.querySelector("[data-edit-note]:not([hidden])")?.focus();
      });
    }
  }

  function noteFromEvent(surface, event) {
    if (!surface.lastLayout) return null;
    const bounds = surface.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * surface.canvas.width / Math.max(1, bounds.width);
    const y = (event.clientY - bounds.top) * surface.canvas.height / Math.max(1, bounds.height);
    return [...surface.lastLayout.noteTargets]
      .sort((left, right) => {
        const leftDistance = Math.hypot(x - left.x, y - left.y);
        const rightDistance = Math.hypot(x - right.x, y - right.y);
        return leftDistance - rightDistance;
      })
      .find((target) => Math.hypot(x - target.x, y - target.y) <= target.radius)?.id ?? null;
  }

  function syncDockSize(nextSize, { restoreFocus = false } = {}) {
    dockSize = nextSize;
    dock.dataset.size = dockSize;
    const expanded = dockSize !== "collapsed";
    dockToggle.setAttribute("aria-expanded", String(expanded));
    dockToggle.querySelector("span").textContent = expanded ? "▾" : "▴";
    resize.textContent = dockSize === "expanded" ? "Default size" : "Expand";
    resize.hidden = !expanded;
    if (!expanded) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (restoreFocus) dockToggle.focus();
    } else scheduleDraw();
  }

  for (const surface of surfaces) {
    surface.list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-projected-note-id]");
      if (button) selectNote(button.dataset.projectedNoteId);
    }, { signal: lifecycle.signal });
    surface.canvas.addEventListener("pointerup", (event) => {
      const noteId = noteFromEvent(surface, event);
      if (noteId) selectNote(noteId, { focusInspector: true });
    }, { signal: lifecycle.signal });
    surface.container.addEventListener("click", (event) => {
      if (event.target.closest("[data-clear-selection]")) {
        selectedNoteId = null;
        scheduleDraw();
      }
      if (event.target.closest("[data-open-pattern]")) {
        sessionState.setWorkspace({ activeDockPanel: "sequencer", detailPanelCollapsed: false });
        root.querySelector("#pattern-grid button")?.focus();
      }
      if (event.target.closest("[data-edit-note]")) {
        const note = getProjection().notes.find((candidate) => candidate.id === selectedNoteId);
        if (!note || !resolveProjectedNoteSource(projectState.getState(), note)) return;
        if (dialog.open) {
          dialog.close();
          window.requestAnimationFrame(() => onEditNote?.(note));
        } else {
          onEditNote?.(note);
        }
      }
    }, { signal: lifecycle.signal });
  }

  dockToggle.addEventListener("click", () => {
    syncDockSize(dockSize === "collapsed" ? "default" : "collapsed", { restoreFocus: true });
  }, { signal: lifecycle.signal });
  resize.addEventListener("click", () => {
    syncDockSize(dockSize === "expanded" ? "default" : "expanded");
  }, { signal: lifecycle.signal });
  fullscreen.addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  open.addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("[data-close]").focus();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close(), { signal: lifecycle.signal });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close();
  }, { signal: lifecycle.signal });
  play.addEventListener("click", () => root.getElementById("transport-play")?.click(), { signal: lifecycle.signal });
  stop.addEventListener("click", () => root.getElementById("transport-stop")?.click(), { signal: lifecycle.signal });
  dialog.querySelector("[data-announce]").addEventListener("click", () => {
    announcement.textContent = buildProjectionSummary(getProjection());
  }, { signal: lifecycle.signal });
  dialog.querySelector("[data-reduced-motion]").addEventListener("change", (event) => {
    setPreferences({ motion: event.currentTarget.checked ? "reduced" : "full" });
  }, { signal: lifecycle.signal });
  dialog.querySelector("[data-high-contrast]").addEventListener("change", (event) => {
    setPreferences({ contrast: event.currentTarget.checked ? "high" : "standard" });
  }, { signal: lifecycle.signal });
  for (const select of root.querySelectorAll("[data-presentation]")) {
    select.addEventListener("change", (event) => {
      setPreferences({ presentation: event.currentTarget.value });
    }, { signal: lifecycle.signal });
  }
  const palettePicker = createVisualiserPalettePicker({
    getPaletteId: () => projectState.getState().visualiser.palette,
    onApply: (palette) => projectState.setVisualiser({ palette }),
    onPreview: (palette) => {
      previewPaletteId = palette;
      syncPaletteMetadata();
      scheduleDraw();
    },
    root,
  });
  for (const trigger of root.querySelectorAll("[data-palette-open]")) {
    trigger.addEventListener("click", () => palettePicker.open(trigger), { signal: lifecycle.signal });
  }
  dialog.addEventListener("close", () => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    (fullscreen.isConnected ? fullscreen : open).focus();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  projectState.addEventListener("change", () => {
    if (selectedNoteId && !getProjection().notes.some((note) => note.id === selectedNoteId)) selectedNoteId = null;
    syncPaletteMetadata();
    scheduleDraw();
  }, { signal: lifecycle.signal });
  sessionState.addEventListener("change", scheduleDraw, { signal: lifecycle.signal });
  scheduler.addEventListener("statechange", scheduleDraw, { signal: lifecycle.signal });
  systemReducedMotion?.addEventListener("change", (event) => {
    if (event.matches) setPreferences({ motion: "reduced" });
  }, { signal: lifecycle.signal });
  root.addEventListener("visibilitychange", scheduleDraw, { signal: lifecycle.signal });
  window.addEventListener?.("resize", scheduleDraw, { signal: lifecycle.signal });
  syncDockSize(dockSize);
  setPreferences(preferences);
  syncPaletteMetadata();

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      window.cancelAnimationFrame(animationFrame);
      dialog.remove();
      palettePicker.dispose();
      dock.remove();
      announcement.remove();
      open.remove();
    },
    open: () => open.click(),
  });
}
