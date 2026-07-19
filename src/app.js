import {
  createAudioEngine,
  createAudioEngineError,
  isAudioEngineError,
} from "./audio/audio-engine.js";
import { createNotePreview } from "./audio/note-preview.js";
import { createTrackRuntimeRegistry } from "./audio/track-runtime-registry.js";
import { createAudioStatusFeature } from "./features/audio-status/audio-status.js";
import { createArrangerFeature } from "./features/arranger/arranger-feature.js?v=20260719-7";
import { createInstrumentFeature } from "./features/instrument/instrument.js";
import { createInputController } from "./features/keyboard/input-controller.js";
import { createKeyboardFeature } from "./features/keyboard/keyboard.js";
import { createPatternFeature } from "./features/pattern-editor/pattern-feature.js";
import { createWorkspaceTabs } from "./features/workspace-tabs/workspace-tabs.js";
import { getNoteName } from "./music/note.js";
import { createInstrumentState } from "./state/instrument-state.js";
import { DEFAULT_PATTERN_ROOT_OCTAVE, createPatternState } from "./state/pattern-state.js";
import { createProjectState } from "./state/project-state.js";
import { createSessionState } from "./state/session-state.js";
import { createArrangementScheduler } from "./transport/arrangement-scheduler.js";

const audioEngine = createAudioEngine();
const projectState = createProjectState();
const sessionState = createSessionState();
const workspaceTabs = createWorkspaceTabs({ sessionState });
const getSelectedTrackId = () => sessionState.getState().workspace.selectedTrackId;
const getSelectedPatternId = () => sessionState.getState().workspace.selectedPatternId;
const getKeyboardNoteOffset = () => (
  projectState.getPattern(getSelectedPatternId()).rootOctave - DEFAULT_PATTERN_ROOT_OCTAVE
);

const instrumentState = createInstrumentState(undefined, {
  getTrackId: getSelectedTrackId,
  projectState,
  sessionState,
});
const patternState = createPatternState(undefined, {
  getPatternId: getSelectedPatternId,
  projectState,
  sessionState,
});
const trackRuntimes = createTrackRuntimeRegistry({ audioEngine, projectState });
const getSelectedVoiceEngine = () => trackRuntimes.getVoiceEngine(getSelectedTrackId());

const notePreview = createNotePreview({
  getAudioTime: audioEngine.getCurrentTime,
  getInstrumentConfig: instrumentState.getState,
  getVoiceEngine: getSelectedVoiceEngine,
});
const scheduler = createArrangementScheduler({
  bpm: projectState.getState().transport.bpm,
  getAudioTime: audioEngine.getCurrentTime,
  getProjectState: projectState.getState,
  getSelectedPatternId,
  getSelectedTrackId,
  getVoiceEngine: trackRuntimes.getVoiceEngine,
});

let arrangerFeature;
let keyboardFeature;
let patternFeature;
const inputController = createInputController({
  getInstrumentConfig: instrumentState.getState,
  getKeyboardNoteOffset,
  getVoiceEngine: getSelectedVoiceEngine,
  onActiveNotesChange(notes) {
    sessionState.setActiveNotes(notes);
    keyboardFeature?.render();
  },
  onNoteStart: (note) => patternFeature?.setSelectedNote(note),
});

function stopAllSound() {
  scheduler.stop();
  notePreview.stop();
  inputController.stopAll();
  trackRuntimes.stopAll();
}

keyboardFeature = createKeyboardFeature({
  audioEngine,
  getKeyboardNoteOffset,
  getNoteName,
  inputController,
  instrumentState,
  onStopAllSound: stopAllSound,
  sessionState,
});
const instrumentFeature = createInstrumentFeature({
  getTrackName: () => projectState.getTrack(getSelectedTrackId()).name,
  inputController,
  instrumentState,
  onRenderKeyboard: keyboardFeature.render,
  projectState,
});
patternFeature = createPatternFeature({
  getNoteName,
  isNoiseTrack: () => instrumentState.getState().voiceType === "noise",
  notePreview,
  onError: (message) => arrangerFeature?.showError(message),
  onStructuralEdit: scheduler.stop,
  patternState,
  projectState,
  sessionState,
});
arrangerFeature = createArrangerFeature({
  audioEngine,
  inputController,
  notePreview,
  projectState,
  scheduler,
  sessionState,
});

const applicationLifecycle = new AbortController();
const audioStatusFeature = createAudioStatusFeature({
  audioEngine,
  createUnexpectedError: (error) => createAudioEngineError(
    "unexpected",
    "An unexpected audio error occurred.",
    error,
  ),
  isAudioEngineError,
  onRenderDependants() {
    arrangerFeature.render();
    instrumentFeature.render();
    keyboardFeature.render();
    patternFeature.render();
  },
  sessionState,
});

document.addEventListener("keydown", inputController.handleKeyDown, { signal: applicationLifecycle.signal });
document.addEventListener("keyup", inputController.handleKeyUp, { signal: applicationLifecycle.signal });
window.addEventListener("keyup", inputController.handleKeyUp, { signal: applicationLifecycle.signal });

function pauseForInterruption() {
  scheduler.pause();
  notePreview.stop();
  inputController.stopAll();
  trackRuntimes.stopAll();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseForInterruption();
}, { signal: applicationLifecycle.signal });
window.addEventListener("blur", pauseForInterruption, { signal: applicationLifecycle.signal });
window.addEventListener("pagehide", pauseForInterruption, { signal: applicationLifecycle.signal });

let previousWorkspace = sessionState.getState().workspace;
sessionState.addEventListener("change", (event) => {
  if (event.detail.slice !== "workspace") return;
  const workspace = sessionState.getState().workspace;
  if (
    workspace.selectedTrackId !== previousWorkspace.selectedTrackId ||
    workspace.selectedPatternId !== previousWorkspace.selectedPatternId
  ) {
    notePreview.stop();
    inputController.stopAll();
  }
  previousWorkspace = workspace;
  instrumentFeature.render();
  keyboardFeature.render();
  patternFeature.render();
}, { signal: applicationLifecycle.signal });

projectState.addEventListener("change", (event) => {
  scheduler.releaseInvalidOwnership();
  if (event.detail.field === "pattern.rootOctave") keyboardFeature.render();
}, { signal: applicationLifecycle.signal });

function disposeApplication() {
  applicationLifecycle.abort();
  audioStatusFeature.dispose();
  arrangerFeature.dispose();
  patternFeature.dispose();
  instrumentFeature.dispose();
  keyboardFeature.dispose();
  workspaceTabs.dispose();
  inputController.dispose();
  patternState.dispose();
  instrumentState.dispose();
  scheduler.stop();
  notePreview.stop();
  trackRuntimes.dispose();
  void audioEngine.dispose();
}

window.addEventListener("unload", disposeApplication, { once: true });

audioStatusFeature.render();
