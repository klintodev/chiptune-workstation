import { clearElement, createElement, setPressed } from "./dom.js";
import { formatPercent, formatTickPosition } from "./music-format.js";

const MAX_SONG_TICKS = 6_144;
const RANGE_EDIT_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
const TEXT_ENTRY_INPUT_TYPES = new Set(["email", "password", "search", "tel", "text", "url"]);

function isNativeHistoryTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const editable = target.closest?.("input, select, textarea, [contenteditable]");
  return Boolean(editable);
}

export function getGlobalHistoryAction(event) {
  if (!event || event.defaultPrevented || event.altKey || isNativeHistoryTarget(event.target)) return null;
  if (!event.ctrlKey && !event.metaKey) return null;
  const key = String(event.key ?? "").toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

export function isGlobalTransportShortcut(event) {
  if (!event || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.code !== "Space" && event.key !== " " && event.key !== "Spacebar") return false;

  const target = event.target;
  if (target?.isContentEditable || target?.closest?.("textarea, [contenteditable]")) return false;
  const input = target?.closest?.("input");
  if (!input) return true;
  const inputType = String(input.type || input.getAttribute?.("type") || "text").toLowerCase();
  return !TEXT_ENTRY_INPUT_TYPES.has(inputType);
}

export function createStudioShell({
  audioEngine,
  onOpenAudio,
  onOpenHelp,
  onOpenProjectLibrary,
  onToggleTheme,
  persistence,
  projectState,
  scheduler,
  workspaceState,
}) {
  const lifecycle = new AbortController();
  let disposed = false;
  let transportFrame = null;
  const root = createElement("header", {
    className: "v2-global-shell global-bar",
    "aria-label": "Klinto Studio controls",
  });
  const projectTitle = createElement("output", { id: "project-title", textContent: projectState.getState().metadata.title });
  const saveStatus = createElement("output", { id: "project-save-status", textContent: "Saved", dataset: { state: "saved" } });
  const projectButton = createElement("button", {
    className: "v2-project-summary project-summary",
    id: "project-library-open",
    type: "button",
    "aria-haspopup": "dialog",
  }, [
    createElement("span", {
      className: "project-summary-icon",
      "aria-hidden": "true",
      textContent: "\u25b8",
    }),
    createElement("span", { className: "project-summary-copy" }, [
      createElement("span", { textContent: "Project" }),
      projectTitle,
    ]),
    createElement("span", { className: "project-save-pill" }, [
      createElement("span", { "aria-hidden": "true" }),
      saveStatus,
    ]),
  ]);

  const brand = createElement("div", { className: "v2-brand studio-badge" }, [
    createElement("span", { className: "v2-brand-mark studio-mark", "aria-hidden": "true" }),
    createElement("h1", { className: "v2-brand-name", textContent: "Klinto Studio" }),
    createElement("span", { className: "v2-beta-badge studio-beta", textContent: "V2 Beta" }),
  ]);
  const projectCluster = createElement("div", {
    className: "v2-project-cluster project-cluster",
  }, [brand, projectButton]);

  const start = createElement("button", { id: "transport-start", type: "button", title: "Return to start", "aria-label": "Return to start", textContent: "|◀" });
  const play = createElement("button", { id: "transport-play", className: "v2-transport-play", type: "button", "aria-label": "Play", textContent: "▶" });
  const stop = createElement("button", { id: "transport-stop", type: "button", "aria-label": "Stop", textContent: "■" });
  const mode = createElement("select", { id: "playback-mode", "aria-label": "Playback mode" }, [
    createElement("option", { textContent: "Pattern", value: "pattern" }),
    createElement("option", { textContent: "Song", value: "song" }),
  ]);
  const tempo = createElement("input", {
    id: "tempo",
    type: "number",
    min: 40,
    max: 240,
    step: 1,
    inputMode: "numeric",
    "aria-label": "Tempo in BPM",
  });
  const transportStatus = createElement("output", { id: "transport-status", className: "v2-transport-status" });
  const loopEnabled = createElement("input", {
    "aria-label": "Enable Song loop",
    id: "loop-enabled",
    type: "checkbox",
  });
  const loopMode = createElement("select", { "aria-label": "Song loop range", id: "loop-mode" }, [
    createElement("option", { textContent: "Custom", value: "custom" }),
    createElement("option", { textContent: "Whole Playlist", value: "arrangement" }),
  ]);
  const loopStart = createElement("input", {
    "aria-label": "Song loop start tick",
    id: "loop-start",
    inputMode: "numeric",
    max: MAX_SONG_TICKS - 1,
    min: 0,
    step: 1,
    type: "number",
  });
  const loopEnd = createElement("input", {
    "aria-label": "Song loop end tick",
    id: "loop-end",
    inputMode: "numeric",
    max: MAX_SONG_TICKS,
    min: 1,
    step: 1,
    type: "number",
  });
  const loopToggle = createElement("button", {
    className: "v2-loop-toggle",
    id: "transport-loop",
    type: "button",
    textContent: "\u21bb",
  });
  const loopHelp = createElement("p", {
    className: "v2-loop-help",
    textContent: "Pattern playback always repeats. These settings control Song playback only.",
  });
  const loopControls = createElement("details", { className: "v2-loop-controls" }, [
    createElement("summary", {
      id: "loop-summary",
      textContent: "Song loop range",
    }),
    createElement("div", { className: "v2-loop-panel" }, [
      loopHelp,
      createElement("label", { className: "v2-loop-enable" }, [loopEnabled, "Loop Song playback"]),
      createElement("label", {}, ["Song range", loopMode]),
      createElement("label", {}, ["Song start", loopStart]),
      createElement("label", {}, ["Song end", loopEnd]),
    ]),
  ]);
  const arrangementTransport = createElement("div", {
    className: "v2-arrangement-transport arrangement-transport",
    "aria-label": "Transport controls",
  }, [start, play, stop, loopToggle]);
  const modeControl = createElement("label", { className: "v2-mode-control mode-control" }, [
    createElement("span", { textContent: "Play" }),
    mode,
  ]);
  const tempoValue = createElement("output", { id: "tempo-value", textContent: "120" });
  const tempoControl = createElement("label", { className: "v2-tempo tempo-control" }, [
    createElement("span", { textContent: "Tempo" }),
    createElement("span", {}, [tempo, tempoValue, createElement("small", { textContent: "BPM" })]),
  ]);
  const masterValue = createElement("output", {
    id: "master-volume-value",
    textContent: "35%",
  });
  const masterVolume = createElement("input", {
    "aria-label": "Master output volume",
    id: "master-volume",
    max: 100,
    min: 0,
    step: 1,
    type: "range",
    value: 35,
  });
  const masterControl = createElement("label", {
    className: "v2-master-control master-control",
  }, [
    createElement("span", {}, ["Master ", masterValue]),
    masterVolume,
  ]);
  const transport = createElement("div", {
    className: "v2-global-transport global-transport",
    "aria-label": "Transport and mix controls",
  }, [
    arrangementTransport,
    modeControl,
    tempoControl,
    masterControl,
    transportStatus,
  ]);

  const switcher = createElement("nav", { className: "v2-surface-switcher", "aria-label": "Studio surfaces" });
  const surfaceButtons = new Map();
  for (const [kind, label, mobileLabel] of [
    ["piano-roll", "Piano Roll", "Roll"],
    ["playlist", "Playlist", "List"],
    ["mixer", "Mixer", "Mix"],
  ]) {
    const button = createElement("button", {
      "aria-label": label,
      dataset: { mobileLabel, surface: kind },
      textContent: label,
      type: "button",
    });
    button.addEventListener("click", () => workspaceState.activatePrimary(kind));
    switcher.append(button);
    surfaceButtons.set(kind, button);
  }

  const audioState = createElement("strong", { id: "audio-state", textContent: "Not started" });
  const audioButton = createElement("button", {
    className: "v2-audio-status status-cluster",
    id: "audio-status-open",
    type: "button",
    "aria-haspopup": "dialog",
    title: "Open audio setup",
    onClick: onOpenAudio,
  }, [createElement("span", { className: "v2-status-light status-light", id: "status-light", "aria-hidden": "true" }), audioState]);

  const toolsSlot = createElement("div", { id: "global-tools", className: "v2-menu-slot global-tools" });
  const accountSlot = createElement("div", { id: "account-slot", className: "v2-menu-slot account-slot" });
  const shareSlot = createElement("div", { id: "v2-project-share-slot", className: "v2-menu-slot" });
  const themeToggle = createElement("button", {
    className: "theme-toggle",
    id: "theme-toggle",
    type: "button",
    onClick: onToggleTheme,
  }, [
    createElement("span", { dataset: { themeIcon: "" }, "aria-hidden": "true", textContent: "\u263e" }),
    createElement("span", { dataset: { themeLabel: "" }, textContent: "Dark" }),
  ]);
  const globalUndo = createElement("button", { id: "global-undo", textContent: "Undo", type: "button", onClick: () => projectState.undo() });
  const globalRedo = createElement("button", { id: "global-redo", textContent: "Redo", type: "button", onClick: () => projectState.redo() });
  const globalHistory = createElement("div", {
    className: "v2-history-actions",
    role: "group",
    "aria-label": "Project history",
  }, [globalUndo, globalRedo]);
  const menu = createElement("details", { className: "v2-secondary-menu" }, [
    createElement("summary", { "aria-label": "Open Studio menu", textContent: "Menu" }),
    createElement("div", { className: "v2-secondary-menu-panel" }, [
      createElement("button", {
        textContent: "Projects",
        type: "button",
        onClick: () => {
          if (typeof onOpenProjectLibrary === "function") onOpenProjectLibrary();
          else projectButton.click();
        },
      }),
      createElement("button", { textContent: "Help", type: "button", onClick: onOpenHelp }),
      loopControls,
      globalHistory,
      shareSlot,
    ]),
  ]);
  menu.addEventListener("click", (event) => {
    if (!event.target.closest?.("button")) return;
    menu.open = false;
  }, { signal: lifecycle.signal });

  const statusCluster = createElement("div", {
    className: "v2-global-status global-status",
  }, [switcher, audioButton, toolsSlot, themeToggle, accountSlot, menu]);
  const announcer = createElement("p", {
    className: "visually-hidden",
    id: "workstation-status",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  root.append(projectCluster, transport, statusCluster, announcer);

  function reportTransportError(error) {
    announcer.textContent = error?.message ?? "Transport action failed.";
    return false;
  }

  function workspacePlayheadTick(nextMode, workspace = workspaceState.getState()) {
    return nextMode === "song"
      ? workspace.playback?.songPlayheadTick ?? 0
      : workspace.playback?.patternPlayheadTick ?? 0;
  }

  function arrangementEndTick(project = projectState.getState()) {
    if (typeof projectState.getArrangementEndTick === "function") {
      return projectState.getArrangementEndTick();
    }
    const lengths = new Map(project.patterns?.map((pattern) => [pattern.id, pattern.lengthTicks]) ?? []);
    return Math.max(0, ...(project.tracks?.flatMap((track) => (
      track.clips.map((clip) => clip.startTick + (lengths.get(clip.patternId) ?? 0))
    )) ?? []));
  }

  function readTransportFrame() {
    const workspace = workspaceState.getState();
    const transportState = scheduler?.getState?.() ?? {};
    const nextMode = workspace.playback?.mode ?? transportState.mode ?? "pattern";
    const status = transportState.status ?? "stopped";
    const schedulerOwnsMode = transportState.mode === undefined || transportState.mode === nextMode;
    const liveTick = status === "playing" && schedulerOwnsMode
      ? scheduler?.getPlayheadTick?.()
      : null;
    const pausedTick = status === "paused"
      && schedulerOwnsMode
      && Number.isFinite(transportState.retainedTick)
      ? transportState.retainedTick
      : null;
    const fallbackTick = workspacePlayheadTick(nextMode, workspace);
    const candidate = liveTick ?? pausedTick ?? fallbackTick;
    const tick = Number.isFinite(candidate) ? Math.max(0, candidate) : 0;
    return Object.freeze({
      mode: nextMode,
      patternTick: nextMode === "pattern"
        ? tick
        : workspacePlayheadTick("pattern", workspace),
      songTick: nextMode === "song"
        ? tick
        : workspacePlayheadTick("song", workspace),
      status,
      tick,
    });
  }

  function paintTransportFrame(frame) {
    transportStatus.value = `${frame.mode === "song" ? "Song" : "Pattern"} · ${
      frame.status[0].toUpperCase()
    }${frame.status.slice(1)} · ${formatTickPosition(frame.tick)}`;
  }

  function publishTransportFrame(frame = readTransportFrame()) {
    paintTransportFrame(frame);
    root.dispatchEvent(new CustomEvent("transportframe", { detail: frame }));
    return frame;
  }

  function playbackStartTick(nextMode) {
    const transportState = scheduler?.getState?.() ?? {};
    if (transportState.status === "paused"
      && transportState.mode === nextMode
      && Number.isInteger(transportState.retainedTick)) {
      return transportState.retainedTick;
    }
    return workspacePlayheadTick(nextMode);
  }

  function attemptTransport(action) {
    try {
      return action();
    } catch (error) {
      return reportTransportError(error);
    }
  }

  function updateLoop(patch) {
    try {
      return projectState.setLoop?.(patch) ?? false;
    } catch (error) {
      announcer.textContent = error.message;
      render();
      return false;
    }
  }

  function commitCustomLoopBounds() {
    const startTick = Number(loopStart.value);
    const endTick = Number(loopEnd.value);
    if (!Number.isInteger(startTick)
      || !Number.isInteger(endTick)
      || startTick < 0
      || endTick > MAX_SONG_TICKS
      || endTick <= startTick) {
      announcer.textContent = `Loop bounds must be whole ticks from 0 to ${MAX_SONG_TICKS}, with End after Start.`;
      render();
      return false;
    }
    return updateLoop({ endTick, mode: "custom", startTick });
  }

  function render() {
    if (disposed) return;
    const project = projectState.getState();
    const workspace = workspaceState.getState();
    const frame = readTransportFrame();
    const persistenceState = persistence.getState();
    projectTitle.value = project.metadata.title;
    saveStatus.value = persistenceState.status === "saving"
      ? "Saving…"
      : persistenceState.status === "unsaved"
        ? "Unsaved"
        : persistenceState.status === "error"
          ? "Save failed"
          : persistenceState.status === "unavailable"
            ? "Local save unavailable"
            : "Saved";
    saveStatus.dataset.state = persistenceState.status;
    tempo.value = String(project.transport.bpm);
    tempoValue.value = String(project.transport.bpm);
    mode.value = frame.mode;
    play.textContent = frame.status === "playing" ? "Ⅱ" : "▶";
    play.setAttribute("aria-label", frame.status === "playing" ? `Pause ${mode.value}` : `Play ${mode.value}`);
    stop.disabled = frame.status === "stopped";
    const loop = project.transport.loop ?? {
      enabled: false,
      endTick: 384,
      mode: "custom",
      startTick: 0,
    };
    const songEnd = arrangementEndTick(project);
    loopEnabled.checked = loop.enabled;
    loopEnabled.disabled = songEnd <= 0 && !loop.enabled;
    loopMode.value = loop.mode;
    loopStart.value = String(loop.startTick);
    loopStart.max = String(Math.max(0, loop.endTick - 1));
    loopStart.disabled = loop.mode === "arrangement";
    loopEnd.value = String(loop.endTick);
    loopEnd.min = String(Math.min(MAX_SONG_TICKS, loop.startTick + 1));
    loopEnd.disabled = loop.mode === "arrangement";
    setPressed(loopToggle, loop.enabled);
    loopToggle.disabled = songEnd <= 0 && !loop.enabled;
    loopToggle.setAttribute("aria-label", `Song loop ${loop.enabled ? "on" : "off"}`);
    loopToggle.title = loopToggle.disabled
      ? "Add a Playlist clip to use Song loop. Pattern playback repeats automatically."
      : `Song loop ${loop.enabled ? "on" : "off"}. Pattern playback repeats automatically.`;
    const history = projectState.getHistoryState?.() ?? {};
    globalUndo.disabled = history.canUndo !== true;
    globalRedo.disabled = history.canRedo !== true;
    paintTransportFrame(frame);
    for (const [kind, button] of surfaceButtons) {
      setPressed(button, workspace.activePrimary === kind);
      if (workspace.activePrimary === kind) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    masterVolume.value = String(Math.round(project.mixer.master.volume * 100));
    masterValue.value = formatPercent(project.mixer.master.volume);
    projectButton.dataset.saveState = persistenceState.status;
    const audio = audioEngine?.getState?.() ?? "idle";
    audioState.textContent = audio === "running" ? "Ready" : audio === "suspended" ? "Paused" : audio === "closed" ? "Closed" : "Not started";
    root.dataset.audioState = audio;
    return frame;
  }

  start.addEventListener("click", () => {
    if (scheduler?.seek && attemptTransport(() => scheduler.seek(0)) === false) return;
    if ((workspaceState.getState().playback?.mode ?? "pattern") === "song") workspaceState.seekSong?.(0);
    else workspaceState.setPatternPlayhead?.(0);
  }, { signal: lifecycle.signal });
  play.addEventListener("click", () => {
    if (audioEngine?.isReady && !audioEngine.isReady()) {
      onOpenAudio?.();
      return;
    }
    const status = scheduler?.getState?.().status;
    if (status === "playing") scheduler.pause();
    else {
      const nextMode = workspaceState.getState().playback?.mode ?? "pattern";
      attemptTransport(() => scheduler.play({ mode: nextMode, startTick: playbackStartTick(nextMode) }));
    }
  }, { signal: lifecycle.signal });
  stop.addEventListener("click", () => scheduler?.stop?.(), { signal: lifecycle.signal });
  mode.addEventListener("change", () => {
    workspaceState.setPlaybackMode(mode.value);
    scheduler?.setMode?.(mode.value);
  }, { signal: lifecycle.signal });
  tempo.addEventListener("change", () => {
    try {
      projectState.setBpm(Number(tempo.value));
      scheduler?.setBpm?.(Number(tempo.value));
    } catch (error) {
      announcer.textContent = error.message;
      render();
    }
  }, { signal: lifecycle.signal });
  function setLoopEnabled(enabled) {
    if (enabled && arrangementEndTick() <= 0) {
      announcer.textContent = "Add a Playlist clip before enabling a Song loop.";
      render();
      return false;
    }
    if (updateLoop({ enabled }) !== false) {
      announcer.textContent = `Song loop ${enabled ? "on" : "off"}. Pattern playback always repeats.`;
      return true;
    }
    return false;
  }
  loopToggle.addEventListener("click", () => {
    const enabled = projectState.getState().transport.loop?.enabled === true;
    setLoopEnabled(!enabled);
  }, { signal: lifecycle.signal });
  loopEnabled.addEventListener("change", () => {
    setLoopEnabled(loopEnabled.checked);
  }, { signal: lifecycle.signal });
  loopMode.addEventListener("change", () => {
    const enablingEmptyArrangement = loopMode.value === "arrangement"
      && projectState.getState().transport.loop?.enabled
      && arrangementEndTick() <= 0;
    updateLoop({ mode: loopMode.value });
    if (enablingEmptyArrangement) {
      announcer.textContent = "Whole Playlist loop is off until the Playlist contains a clip.";
    }
  }, { signal: lifecycle.signal });
  loopStart.addEventListener("change", commitCustomLoopBounds, { signal: lifecycle.signal });
  loopEnd.addEventListener("change", commitCustomLoopBounds, { signal: lifecycle.signal });

  const historyTarget = root.ownerDocument ?? globalThis.document;
  let masterHistoryActive = false;
  function beginMasterHistory() {
    if (masterHistoryActive) return;
    masterHistoryActive = true;
    projectState.beginHistoryGroup?.();
  }
  function endMasterHistory() {
    if (!masterHistoryActive) return;
    masterHistoryActive = false;
    projectState.endHistoryGroup?.();
  }
  masterVolume.addEventListener("pointerdown", beginMasterHistory, { signal: lifecycle.signal });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture", "change", "blur"]) {
    masterVolume.addEventListener(type, endMasterHistory, { signal: lifecycle.signal });
  }
  masterVolume.addEventListener("keydown", (event) => {
    if (RANGE_EDIT_KEYS.has(event.key)) beginMasterHistory();
  }, { signal: lifecycle.signal });
  masterVolume.addEventListener("keyup", (event) => {
    if (RANGE_EDIT_KEYS.has(event.key)) endMasterHistory();
  }, { signal: lifecycle.signal });
  masterVolume.addEventListener("input", () => {
    const volume = Number(masterVolume.value) / 100;
    masterValue.value = formatPercent(volume);
    try {
      projectState.setMasterVolume(volume);
    } catch (error) {
      announcer.textContent = error.message;
      endMasterHistory();
      render();
    }
  }, { signal: lifecycle.signal });

  historyTarget?.addEventListener?.("keydown", (event) => {
    const action = getGlobalHistoryAction(event);
    if (!action) return;
    event.preventDefault();
    if (action === "undo") projectState.undo();
    else projectState.redo();
  }, { signal: lifecycle.signal });

  function animateTransport() {
    transportFrame = null;
    if (disposed || scheduler?.getState?.().status !== "playing") return;
    publishTransportFrame(readTransportFrame());
    transportFrame = globalThis.requestAnimationFrame?.(animateTransport) ?? null;
  }
  function handleChange() {
    const frame = render();
    if (frame) publishTransportFrame(frame);
    if (scheduler?.getState?.().status === "playing" && transportFrame === null) {
      transportFrame = globalThis.requestAnimationFrame?.(animateTransport) ?? null;
    } else if (scheduler?.getState?.().status !== "playing" && transportFrame !== null) {
      globalThis.cancelAnimationFrame?.(transportFrame);
      transportFrame = null;
    }
  }
  projectState.addEventListener("change", handleChange);
  workspaceState.addEventListener("change", handleChange);
  persistence.addEventListener("change", handleChange);
  scheduler?.addEventListener?.("statechange", handleChange);
  audioEngine?.addEventListener?.("statechange", handleChange);
  handleChange();

  return Object.freeze({
    announce(message) {
      announcer.textContent = "";
      queueMicrotask(() => { announcer.textContent = message; });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      endMasterHistory();
      lifecycle.abort();
      if (transportFrame !== null) globalThis.cancelAnimationFrame?.(transportFrame);
      transportFrame = null;
      projectState.removeEventListener("change", handleChange);
      workspaceState.removeEventListener("change", handleChange);
      persistence.removeEventListener("change", handleChange);
      scheduler?.removeEventListener?.("statechange", handleChange);
      audioEngine?.removeEventListener?.("statechange", handleChange);
      root.remove();
    },
    getTransportFrame: readTransportFrame,
    root,
    slots: Object.freeze({ account: accountSlot, share: shareSlot, tools: toolsSlot }),
    render,
  });
}
