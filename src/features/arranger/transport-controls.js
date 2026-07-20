import { queryRequired } from "../../shared/query-required.js";

export function createTransportControls({
  audioEngine,
  onError = () => {},
  onPlayhead = () => {},
  projectState,
  root = document,
  scheduler,
  sessionState,
}) {
  const lifecycle = new AbortController();
  const elements = {
    loop: queryRequired(root, "#transport-loop"),
    master: queryRequired(root, "#master-volume"),
    masterValue: queryRequired(root, "#master-volume-value"),
    mode: queryRequired(root, "#playback-mode"),
    play: queryRequired(root, "#transport-play"),
    projectTitle: queryRequired(root, "#project-title"),
    start: queryRequired(root, "#transport-start"),
    status: queryRequired(root, "#transport-status"),
    stop: queryRequired(root, "#transport-stop"),
    tempo: queryRequired(root, "#tempo"),
    tempoValue: queryRequired(root, "#tempo-value"),
  };
  let playheadFrame = null;
  let groupedRange = null;

  function renderPlayhead() {
    const transport = scheduler.getState();
    const stepIndex = scheduler.getPlayheadStep();
    onPlayhead(stepIndex, transport.status, transport.mode);
    const stepLabel = String(stepIndex + 1).padStart(3, "0");
    const modeLabel = transport.mode === "pattern" ? "Pattern" : "Arrangement";
    const statusLabel = transport.status === "paused"
      ? "Paused · next"
      : transport.status === "playing" ? "Playing" : "Stopped";
    elements.status.value = `${modeLabel} · ${statusLabel} · step ${stepLabel}`;
  }

  function startPlayheadDisplay() {
    if (playheadFrame !== null) return;
    const update = () => {
      renderPlayhead();
      if (scheduler.getState().status !== "playing") {
        playheadFrame = null;
        return;
      }
      playheadFrame = requestAnimationFrame(update);
    };
    playheadFrame = requestAnimationFrame(update);
  }

  function stopPlayheadDisplay() {
    if (playheadFrame !== null) cancelAnimationFrame(playheadFrame);
    playheadFrame = null;
    renderPlayhead();
  }

  function render() {
    const project = projectState.getState();
    const transport = scheduler.getState();
    const playing = transport.status === "playing";
    const hasArrangement = projectState.getArrangementEnd() > 0;
    elements.projectTitle.value = project.metadata.title;
    elements.mode.value = transport.mode;
    elements.tempo.value = String(project.transport.bpm);
    elements.tempoValue.value = String(project.transport.bpm);
    elements.master.value = String(project.transport.masterVolume * 100);
    elements.masterValue.value = `${Math.round(project.transport.masterVolume * 100)}%`;
    elements.play.disabled = !audioEngine.isReady() || (transport.mode === "arrangement" && !hasArrangement);
    const playLabel = playing ? "Pause" : transport.status === "paused" ? "Resume" : "Play";
    elements.play.textContent = playing ? "❙❙" : "▶";
    elements.play.classList.toggle("playing", playing);
    elements.play.setAttribute("aria-label", playLabel);
    elements.play.title = `${playLabel} (Space)`;
    elements.stop.disabled = transport.status === "stopped";
    elements.start.disabled = transport.status === "stopped" && scheduler.getPlayheadStep() === 0;
    elements.loop.disabled = !hasArrangement;
    elements.loop.classList.toggle("active", project.transport.loop.enabled);
    elements.loop.setAttribute("aria-pressed", String(project.transport.loop.enabled));
    elements.loop.title = project.transport.loop.enabled ? "Disable arrangement loop" : "Loop the whole arrangement";
    if (playing) startPlayheadDisplay();
    else stopPlayheadDisplay();
  }

  function startPlayback() {
    if (!audioEngine.isReady()) return false;
    if (elements.mode.value === "arrangement" && projectState.getArrangementEnd() === 0) return false;
    try {
      scheduler.play(elements.mode.value);
      onError("");
      return true;
    } catch (error) {
      onError(error.message);
      return false;
    } finally {
      render();
    }
  }

  function pausePlayback() {
    const paused = scheduler.pause();
    render();
    return paused;
  }

  function togglePlayback() {
    return scheduler.getState().status === "playing" ? pausePlayback() : startPlayback();
  }

  function jumpToStart() {
    scheduler.stop();
    scheduler.setStartStep(0);
    sessionState.setWorkspace({ arrangementStartStep: 0 });
    onError("");
    render();
  }

  function toggleLoop() {
    const project = projectState.getState();
    const enabled = !project.transport.loop.enabled;
    const endStep = Math.max(1, projectState.getArrangementEnd());
    projectState.setLoop({ enabled, startStep: 0, endStep });
    onError("");
  }

  function blocksTransportShortcut(target) {
    if (!target?.matches) return false;
    if (target.matches("textarea, select, [contenteditable='true']")) return true;
    if (!target.matches("input")) return false;
    return !["range", "button", "submit", "reset"].includes(target.type);
  }

  elements.mode.addEventListener("change", () => {
    scheduler.setMode(elements.mode.value);
    sessionState.setWorkspace({ playbackMode: elements.mode.value });
    elements.mode.blur();
    onError("");
    render();
  }, { signal: lifecycle.signal });
  elements.start.addEventListener("click", jumpToStart, { signal: lifecycle.signal });
  elements.play.addEventListener("click", togglePlayback, { signal: lifecycle.signal });
  elements.stop.addEventListener("click", scheduler.stop, { signal: lifecycle.signal });
  elements.loop.addEventListener("click", toggleLoop, { signal: lifecycle.signal });
  root.addEventListener("keydown", (event) => {
    if (
      (event.code !== "Space" && event.key !== " " && event.key !== "Spacebar") ||
      event.repeat ||
      event.defaultPrevented ||
      blocksTransportShortcut(event.target) ||
      root.querySelector("dialog[open], [role='menu']:not([hidden])")
    ) return;
    event.preventDefault();
    togglePlayback();
  }, { signal: lifecycle.signal });

  function applyTempo({ reportInvalid = false } = {}) {
    const invalidMessage = "Tempo must be a whole number between 40 and 240 BPM.";
    const rawValue = elements.tempo.value.trim();
    if (rawValue === "") {
      if (reportInvalid) {
        onError(invalidMessage);
        render();
      } else onError("");
      return false;
    }
    const bpm = Number(rawValue);
    if (!Number.isInteger(bpm) || bpm < 40 || bpm > 240) {
      onError(invalidMessage);
      if (reportInvalid) render();
      return false;
    }
    elements.tempoValue.value = String(bpm);
    projectState.setBpm(bpm);
    scheduler.setBpm(bpm);
    onError("");
    return true;
  }

  elements.tempo.addEventListener("input", () => applyTempo(), { signal: lifecycle.signal });
  elements.tempo.addEventListener("change", () => applyTempo({ reportInvalid: true }), { signal: lifecycle.signal });
  elements.master.addEventListener("input", () => {
    const volume = Number(elements.master.value) / 100;
    elements.masterValue.value = `${Math.round(volume * 100)}%`;
    projectState.setMasterVolume(volume);
  }, { signal: lifecycle.signal });

  function beginRange(event) {
    if (groupedRange !== null) return;
    groupedRange = event.currentTarget;
    projectState.beginHistoryGroup();
  }

  function finishRange() {
    if (groupedRange === null) return;
    groupedRange = null;
    projectState.endHistoryGroup();
  }

  elements.tempo.addEventListener("focus", beginRange, { signal: lifecycle.signal });
  elements.tempo.addEventListener("blur", finishRange, { signal: lifecycle.signal });
  elements.master.addEventListener("pointerdown", beginRange, { signal: lifecycle.signal });
  elements.master.addEventListener("pointerup", finishRange, { signal: lifecycle.signal });
  elements.master.addEventListener("pointercancel", finishRange, { signal: lifecycle.signal });
  elements.master.addEventListener("change", finishRange, { signal: lifecycle.signal });

  const handleProjectChange = () => {
    const bpm = projectState.getState().transport.bpm;
    if (scheduler.getState().bpm !== bpm) scheduler.setBpm(bpm);
    render();
  };
  const handleSchedulerChange = (event) => {
    const transport = scheduler.getState();
    sessionState.setTransport({ retainedStepIndex: transport.retainedStepIndex, status: transport.status });
    if (event.detail.error) onError(event.detail.error.message);
    render();
  };
  projectState.addEventListener("change", handleProjectChange, { signal: lifecycle.signal });
  scheduler.addEventListener("statechange", handleSchedulerChange, { signal: lifecycle.signal });
  render();

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      if (playheadFrame !== null) cancelAnimationFrame(playheadFrame);
      playheadFrame = null;
    },
    render,
    togglePlayback,
  });
}
