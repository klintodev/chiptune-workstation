import { clearElement, createElement, setPressed } from "./dom.js";
import { formatPercent, formatTickPosition } from "./music-format.js";

const MAX_SONG_TICKS = 6_144;

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
  const root = createElement("header", { className: "v2-global-shell", "aria-label": "Klinto Studio controls" });
  const projectTitle = createElement("output", { id: "project-title", textContent: projectState.getState().metadata.title });
  const saveStatus = createElement("output", { id: "project-save-status", textContent: "Saved", dataset: { state: "saved" } });
  const projectButton = createElement("button", {
    className: "v2-project-summary",
    id: "project-library-open",
    type: "button",
    "aria-haspopup": "dialog",
  }, [projectTitle, saveStatus]);

  const brand = createElement("div", { className: "v2-brand" }, [
    createElement("span", { className: "v2-brand-mark", "aria-hidden": "true", textContent: "K" }),
    createElement("span", { className: "v2-brand-name", textContent: "Klinto Studio" }),
    createElement("span", { className: "v2-beta-badge", textContent: "V2 Beta" }),
  ]);

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
  const loopMode = createElement("select", { "aria-label": "Song loop range mode", id: "loop-mode" }, [
    createElement("option", { textContent: "Custom", value: "custom" }),
    createElement("option", { textContent: "Whole Playlist", value: "arrangement" }),
  ]);
  const loopStart = createElement("input", {
    "aria-label": "Loop start tick",
    id: "loop-start",
    inputMode: "numeric",
    max: MAX_SONG_TICKS - 1,
    min: 0,
    step: 1,
    type: "number",
  });
  const loopEnd = createElement("input", {
    "aria-label": "Loop end tick",
    id: "loop-end",
    inputMode: "numeric",
    max: MAX_SONG_TICKS,
    min: 1,
    step: 1,
    type: "number",
  });
  const loopSummary = createElement("summary", { textContent: "Loop" });
  const loopControls = createElement("details", { className: "v2-loop-controls" }, [
    loopSummary,
    createElement("div", { className: "v2-loop-panel" }, [
      createElement("label", { className: "v2-loop-enable" }, [loopEnabled, "Enabled"]),
      createElement("label", {}, ["Range", loopMode]),
      createElement("label", {}, ["Start", loopStart]),
      createElement("label", {}, ["End", loopEnd]),
    ]),
  ]);
  const transport = createElement("div", { className: "v2-global-transport", "aria-label": "Transport" }, [
    start,
    play,
    stop,
    mode,
    createElement("label", { className: "v2-tempo" }, [tempo, createElement("span", { textContent: "BPM" })]),
    loopControls,
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
    className: "v2-audio-status",
    id: "audio-status-open",
    type: "button",
    "aria-haspopup": "dialog",
    title: "Open audio setup",
    onClick: onOpenAudio,
  }, [createElement("span", { className: "v2-status-light", id: "status-light", "aria-hidden": "true" }), audioState]);

  const masterReadout = createElement("button", { className: "v2-master-readout", type: "button", textContent: "Master 35%" });
  masterReadout.addEventListener("click", () => workspaceState.activateMixer());
  const toolsSlot = createElement("div", { id: "global-tools", className: "v2-menu-slot" });
  const accountSlot = createElement("div", { id: "account-slot", className: "v2-menu-slot" });
  const shareSlot = createElement("div", { id: "v2-project-share-slot", className: "v2-menu-slot" });
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
      createElement("button", { id: "theme-toggle", textContent: "Toggle theme", type: "button", onClick: onToggleTheme }),
      globalHistory,
      shareSlot,
      toolsSlot,
      accountSlot,
    ]),
  ]);
  menu.addEventListener("click", (event) => {
    if (!event.target.closest?.("button")) return;
    menu.open = false;
  }, { signal: lifecycle.signal });

  const statusCluster = createElement("div", { className: "v2-global-status" }, [masterReadout, audioButton, menu]);
  const announcer = createElement("p", {
    className: "visually-hidden",
    id: "workstation-status",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  root.append(brand, projectButton, transport, switcher, statusCluster, announcer);

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
    loopSummary.textContent = loop.enabled ? "Loop On" : "Loop";
    const history = projectState.getHistoryState?.() ?? {};
    globalUndo.disabled = history.canUndo !== true;
    globalRedo.disabled = history.canRedo !== true;
    paintTransportFrame(frame);
    for (const [kind, button] of surfaceButtons) {
      setPressed(button, workspace.activePrimary === kind);
      if (workspace.activePrimary === kind) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    masterReadout.textContent = `Master ${formatPercent(project.mixer.master.volume)}`;
    masterReadout.hidden = workspace.activePrimary === "mixer";
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
  loopEnabled.addEventListener("change", () => {
    if (loopEnabled.checked && arrangementEndTick() <= 0) {
      announcer.textContent = "Add a Playlist clip before enabling a Song loop.";
      render();
      return;
    }
    updateLoop({ enabled: loopEnabled.checked });
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
