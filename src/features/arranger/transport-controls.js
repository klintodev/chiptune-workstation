import { queryRequired } from "../../shared/query-required.js";
import { isGlobalShortcutEligible } from "../../shared/keyboard-policy.js";
import { announceStatus, setTextIfChanged } from "../../shared/status-announcer.js";

export function hasPlayableArrangement(project) {
  const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));
  return project.tracks.some((track) => track.clips.some((clip) => (
    patterns.get(clip.patternId)?.steps.some((step) => step !== null && step.volume > 0)
  )));
}

export function handlePlaybackShortcut(event, {
  root,
  scheduler,
  startPlayback,
  stopPlayback,
}) {
  if (
    (event.code !== "Space" && event.key !== " " && event.key !== "Spacebar") ||
    !isGlobalShortcutEligible(event, root)
  ) return false;
  event.preventDefault();
  if (scheduler.getState().status === "playing") stopPlayback();
  else startPlayback();
  return true;
}

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
    mobileMaster: queryRequired(root, "#mobile-master-volume"),
    mobileMasterValue: queryRequired(root, "#mobile-master-volume-value"),
    mobileMixClose: queryRequired(root, "#mobile-mix-close"),
    mobileMixDialog: queryRequired(root, "#mobile-mix-dialog"),
    mobileMixDone: queryRequired(root, "#mobile-mix-done"),
    mobileMixOpen: queryRequired(root, "#mobile-mix-open"),
    mobileMode: queryRequired(root, "#mobile-playback-mode"),
    mobileTempo: queryRequired(root, "#mobile-tempo"),
    mode: queryRequired(root, "#playback-mode"),
    play: queryRequired(root, "#transport-play"),
    projectTitle: queryRequired(root, "#project-title"),
    songHelp: queryRequired(root, "#song-play-help"),
    songMessage: queryRequired(root, "#song-play-message"),
    songNext: queryRequired(root, "#song-play-next"),
    start: queryRequired(root, "#transport-start"),
    status: queryRequired(root, "#transport-status"),
    stop: queryRequired(root, "#transport-stop"),
    tempo: queryRequired(root, "#tempo"),
    tempoValue: queryRequired(root, "#tempo-value"),
  };
  let playheadFrame = null;
  let groupedRange = null;
  let previousAnnouncedStatus = scheduler.getState().status;

  function renderPlayhead() {
    const transport = scheduler.getState();
    const stepIndex = scheduler.getPlayheadStep();
    onPlayhead(stepIndex, transport.status, transport.mode);
    const stepLabel = String(stepIndex + 1).padStart(3, "0");
    const modeLabel = transport.mode === "pattern" ? "Pattern" : "Song";
    const statusLabel = transport.status === "paused"
      ? "Paused · next"
      : transport.status === "playing" ? "Playing" : "Stopped";
    setTextIfChanged(elements.status, `${modeLabel} · ${statusLabel} · step ${stepLabel}`);
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
    const hasArrangement = hasPlayableArrangement(project);
    elements.projectTitle.value = project.metadata.title;
    elements.mode.value = transport.mode;
    elements.mobileMode.value = transport.mode;
    elements.tempo.value = String(project.transport.bpm);
    if (root.activeElement !== elements.mobileTempo) {
      elements.mobileTempo.value = String(project.transport.bpm);
    }
    elements.tempoValue.value = String(project.transport.bpm);
    elements.master.value = String(project.transport.masterVolume * 100);
    elements.mobileMaster.value = String(project.transport.masterVolume * 100);
    elements.masterValue.value = `${Math.round(project.transport.masterVolume * 100)}%`;
    elements.mobileMasterValue.value = `${Math.round(project.transport.masterVolume * 100)}%`;
    elements.play.disabled = !audioEngine.isReady() || (transport.mode === "arrangement" && !hasArrangement);
    const playLabel = playing ? "Pause" : transport.status === "paused" ? "Resume" : "Play";
    elements.play.textContent = playing ? "❙❙" : "▶";
    elements.play.classList.toggle("playing", playing);
    elements.play.setAttribute("aria-label", playLabel);
    elements.play.title = transport.mode === "arrangement" && !hasArrangement
      ? "Add a non-empty loop to the song before playing Song mode."
      : `${playLabel} (Space ${playing ? "stops and returns to step 1" : transport.status === "paused" ? "resumes playback" : "starts playback"} from the workspace)`;
    const selectedPattern = project.patterns.find(({ id }) => (
      id === sessionState.getState().workspace.selectedPatternId
    )) ?? project.patterns[0];
    const selectedPatternHasNotes = selectedPattern.steps.some(
      (step) => step !== null && step.volume > 0,
    );
    elements.songHelp.hidden = transport.mode !== "arrangement" || hasArrangement;
    elements.songMessage.textContent = selectedPatternHasNotes
      ? "Song needs this loop to be added."
      : "Song needs a loop with at least one note.";
    elements.songNext.textContent = selectedPatternHasNotes ? "Go to Add loop" : "Go to pattern";
    elements.stop.disabled = transport.status === "stopped";
    elements.start.disabled = transport.status === "stopped" && scheduler.getPlayheadStep() === 0;
    elements.loop.disabled = !hasArrangement;
    elements.loop.classList.toggle("active", project.transport.loop.enabled);
    elements.loop.setAttribute("aria-pressed", String(project.transport.loop.enabled));
    elements.loop.title = project.transport.loop.enabled ? "Disable arrangement loop" : "Loop the whole arrangement";
    if (transport.status !== previousAnnouncedStatus) {
      previousAnnouncedStatus = transport.status;
      announceStatus(root, transport.status === "playing"
        ? "Playing"
        : transport.status === "paused" ? "Paused" : "Stopped");
    }
    if (playing) startPlayheadDisplay();
    else stopPlayheadDisplay();
  }

  function startPlayback() {
    if (!audioEngine.isReady()) return false;
    if (elements.mode.value === "arrangement" && !hasPlayableArrangement(projectState.getState())) return false;
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
    projectState.setLoop({
      enabled,
      endStep,
      mode: "arrangement",
      startStep: 0,
    });
    onError("");
  }

  function changeMode(value) {
    scheduler.setMode(value);
    sessionState.setWorkspace({ playbackMode: value });
    onError("");
    render();
  }

  elements.mode.addEventListener("change", () => {
    changeMode(elements.mode.value);
    elements.mode.blur();
  }, { signal: lifecycle.signal });
  elements.mobileMode.addEventListener("change", () => changeMode(elements.mobileMode.value), {
    signal: lifecycle.signal,
  });
  elements.start.addEventListener("click", jumpToStart, { signal: lifecycle.signal });
  elements.play.addEventListener("click", togglePlayback, { signal: lifecycle.signal });
  elements.stop.addEventListener("click", scheduler.stop, { signal: lifecycle.signal });
  elements.loop.addEventListener("click", toggleLoop, { signal: lifecycle.signal });
  root.addEventListener("keydown", (event) => handlePlaybackShortcut(event, {
    root,
    scheduler,
    startPlayback,
    stopPlayback: jumpToStart,
  }), { signal: lifecycle.signal });

  function applyTempo(source = elements.tempo, { reportInvalid = false } = {}) {
    const invalidMessage = "Tempo must be a whole number between 40 and 240 BPM.";
    const rawValue = source.value.trim();
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

  elements.tempo.addEventListener("input", () => applyTempo(elements.tempo), { signal: lifecycle.signal });
  elements.tempo.addEventListener("change", () => applyTempo(elements.tempo, { reportInvalid: true }), { signal: lifecycle.signal });
  elements.mobileTempo.addEventListener("input", () => applyTempo(elements.mobileTempo), { signal: lifecycle.signal });
  elements.mobileTempo.addEventListener("change", () => applyTempo(elements.mobileTempo, { reportInvalid: true }), { signal: lifecycle.signal });

  function applyMaster(source) {
    const volume = Number(source.value) / 100;
    elements.masterValue.value = `${Math.round(volume * 100)}%`;
    elements.mobileMasterValue.value = `${Math.round(volume * 100)}%`;
    projectState.setMasterVolume(volume);
  }

  elements.master.addEventListener("input", () => applyMaster(elements.master), { signal: lifecycle.signal });
  elements.mobileMaster.addEventListener("input", () => applyMaster(elements.mobileMaster), { signal: lifecycle.signal });

  function closeMobileMix() {
    if (elements.mobileMixDialog.open) elements.mobileMixDialog.close();
    elements.mobileMixOpen.focus();
  }

  elements.mobileMixOpen.addEventListener("click", () => {
    render();
    if (!elements.mobileMixDialog.open) elements.mobileMixDialog.showModal();
    elements.mobileMode.focus();
  }, { signal: lifecycle.signal });
  elements.mobileMixClose.addEventListener("click", closeMobileMix, { signal: lifecycle.signal });
  elements.mobileMixDone.addEventListener("click", closeMobileMix, { signal: lifecycle.signal });
  elements.mobileMixDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMobileMix();
  }, { signal: lifecycle.signal });
  elements.songNext.addEventListener("click", () => {
    const workspace = sessionState.getState().workspace;
    const pattern = projectState.getState().patterns.find(({ id }) => (
      id === workspace.selectedPatternId
    ));
    const hasNotes = pattern?.steps.some((step) => step !== null && step.volume > 0);
    sessionState.setWorkspace({
      activeDockPanel: "sequencer",
      detailPanelCollapsed: false,
    });
    globalThis.requestAnimationFrame?.(() => {
      (hasNotes
        ? root.querySelector("#place-pattern")
        : root.querySelector(".pattern-step-set"))?.focus();
    });
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
  elements.mobileTempo.addEventListener("focus", beginRange, { signal: lifecycle.signal });
  elements.mobileTempo.addEventListener("blur", finishRange, { signal: lifecycle.signal });
  elements.master.addEventListener("pointerdown", beginRange, { signal: lifecycle.signal });
  elements.master.addEventListener("pointerup", finishRange, { signal: lifecycle.signal });
  elements.master.addEventListener("pointercancel", finishRange, { signal: lifecycle.signal });
  elements.master.addEventListener("change", finishRange, { signal: lifecycle.signal });
  elements.mobileMaster.addEventListener("pointerdown", beginRange, { signal: lifecycle.signal });
  elements.mobileMaster.addEventListener("pointerup", finishRange, { signal: lifecycle.signal });
  elements.mobileMaster.addEventListener("pointercancel", finishRange, { signal: lifecycle.signal });
  elements.mobileMaster.addEventListener("change", finishRange, { signal: lifecycle.signal });

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
