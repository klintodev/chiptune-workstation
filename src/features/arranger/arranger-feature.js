import { queryRequired } from "../../shared/query-required.js";
import { setTextIfChanged } from "../../shared/status-announcer.js";
import { createArrangementView } from "./arrangement-view.js";
import { createPatternLibrary } from "./pattern-library.js";
import { createTransportControls } from "./transport-controls.js";

export function createArrangerFeature({
  audioEngine,
  inputController,
  notePreview,
  onPatternPlayhead = () => {},
  projectState,
  root = document,
  scheduler,
  sessionState,
}) {
  const lifecycle = new AbortController();
  const error = queryRequired(root, "#arrangement-error");

  function showError(message) {
    setTextIfChanged(error, message);
    error.hidden = !message;
  }

  function stopEditingVoices() {
    notePreview.stop();
    inputController.stopAll();
  }

  function repairWorkspace() {
    const project = projectState.getState();
    const workspace = sessionState.getState().workspace;
    const selectedTrack = project.tracks.find((track) => track.id === workspace.selectedTrackId)
      ?? project.tracks[0];
    const selectedPattern = project.patterns.find((pattern) => pattern.id === workspace.selectedPatternId)
      ?? project.patterns[0];
    let selectedClipId = workspace.selectedClipId;
    if (selectedClipId) {
      try {
        const selected = projectState.getClip(selectedClipId);
        return sessionState.setWorkspace({
          selectedClipId,
          selectedPatternId: selected.clip.patternId,
          selectedTrackId: selected.track.id,
        });
      } catch {
        selectedClipId = null;
      }
    }
    return sessionState.setWorkspace({
      selectedClipId,
      selectedPatternId: selectedPattern.id,
      selectedTrackId: selectedTrack.id,
    });
  }

  const arrangementView = createArrangementView({
    onBeforeSelectionChange: stopEditingVoices,
    onError: showError,
    onSeek(stepIndex) {
      scheduler.setMode("arrangement");
      scheduler.setStartStep(stepIndex);
      sessionState.setWorkspace({
        arrangementStartStep: stepIndex,
        playbackMode: "arrangement",
      });
      showError("");
    },
    projectState,
    root,
    sessionState,
  });
  const patternLibrary = createPatternLibrary({
    onBeforeSelectionChange: stopEditingVoices,
    onError: showError,
    projectState,
    root,
    sessionState,
  });
  const transportControls = createTransportControls({
    audioEngine,
    onError: showError,
    onPlayhead(stepIndex, status, mode) {
      arrangementView.setPlayhead(stepIndex, status, mode);
      onPatternPlayhead(stepIndex, status, mode);
    },
    projectState,
    root,
    scheduler,
    sessionState,
  });

  const handleProjectChange = (event) => {
    if (event.detail.operation === "remove-clip" && event.detail.clipId) {
      scheduler.releaseOwnedBy({ clipId: event.detail.clipId });
    }
    if (event.detail.operation === "delete-pattern") {
      for (const clipId of event.detail.removedClipIds ?? []) scheduler.releaseOwnedBy({ clipId });
    }
    if (event.detail.operation === "remove-track" && event.detail.trackId) {
      scheduler.releaseOwnedBy({ trackId: event.detail.trackId });
    }
    repairWorkspace();
  };
  projectState.addEventListener("change", handleProjectChange, { signal: lifecycle.signal });
  repairWorkspace();

  function render() {
    arrangementView.render();
    patternLibrary.render();
    transportControls.render();
  }

  return Object.freeze({
    dispose() {
      lifecycle.abort();
      arrangementView.dispose();
      patternLibrary.dispose();
      transportControls.dispose();
    },
    render,
    showError,
  });
}
