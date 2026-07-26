import {
  createAudioEngine,
  createAudioEngineError,
  isAudioEngineError,
} from "./audio/audio-engine.js?v=20260721-3";
import { createNotePreview } from "./audio/note-preview.js?v=20260721-1";
import { createTrackRuntimeRegistry } from "./audio/track-runtime-registry.js?v=20260722-1";
import { createAudioStatusFeature } from "./features/audio-status/audio-status.js?v=20260721-2";
import { createArrangerFeature } from "./features/arranger/arranger-feature.js?v=20260722-1";
import { createInstrumentFeature } from "./features/instrument/instrument.js";
import { createInputController } from "./features/keyboard/input-controller.js?v=20260721-1";
import { createKeyboardFeature } from "./features/keyboard/keyboard.js";
import { createPatternFeature } from "./features/pattern-editor/pattern-feature.js?v=20260721-3";
import { createProjectLibraryFeature } from "./features/project-library/project-library.js?v=20260722-1";
import { createGuidedCreationFeature } from "./features/guided-creation/guided-creation.js";
import { createScaleEntryController } from "./features/guided-creation/scale-entry-controller.js";
import { createStarterService } from "./features/guided-creation/starter-service.js";
import { createThemeFeature } from "./features/theme/theme.js";
import { createWorkspaceTabs } from "./features/workspace-tabs/workspace-tabs.js?v=20260721-3";
import { getNoteName } from "./music/note.js";
import { createInstrumentState } from "./state/instrument-state.js";
import { DEFAULT_PATTERN_ROOT_OCTAVE, createPatternState } from "./state/pattern-state.js";
import { createProjectState } from "./state/project-state.js?v=20260722-1";
import {
  createIndexedDbProjectRepository,
  createMemoryProjectRepository,
  createProjectPreferences,
} from "./persistence/project-repository.js?v=20260722-1";
import {
  createProjectPersistence,
  loadInitialProjectDocument,
} from "./persistence/project-persistence.js?v=20260722-1";
import {
  createIndexedDbCheckpointRepository,
  createMemoryCheckpointRepository,
} from "./persistence/checkpoint-repository.js";
import { createCheckpointService } from "./persistence/checkpoint-service.js";
import { createLocalRemixProvenanceRepository } from "./persistence/remix-provenance-repository.js";
import { createSessionState } from "./state/session-state.js";
import { createArrangementScheduler } from "./transport/arrangement-scheduler.js?v=20260722-1";

const projectPreferences = createProjectPreferences();
let projectRepository;
let initialProjectDocument;
let projectStorageError = null;
let projectStoragePersistent = true;
try {
  projectRepository = createIndexedDbProjectRepository();
  initialProjectDocument = await loadInitialProjectDocument({
    preferences: projectPreferences,
    repository: projectRepository,
  });
} catch (error) {
  projectStorageError = error;
  projectStoragePersistent = false;
  projectRepository = createMemoryProjectRepository();
  initialProjectDocument = await loadInitialProjectDocument({
    preferences: projectPreferences,
    repository: projectRepository,
  });
}
export { projectRepository };

export const audioEngine = createAudioEngine();
export const projectState = createProjectState(initialProjectDocument.project);
export const projectPersistence = createProjectPersistence({
  initialDocument: initialProjectDocument,
  initialError: projectStorageError,
  persistent: projectStoragePersistent,
  preferences: projectPreferences,
  projectState,
  repository: projectRepository,
});
export const sessionState = createSessionState();
export const scaleEntryController = createScaleEntryController({
  getScaleGuide: () => projectState.getState().scaleGuide,
});
let checkpointRepository;
try {
  checkpointRepository = createIndexedDbCheckpointRepository();
} catch {
  checkpointRepository = createMemoryCheckpointRepository();
}
export { checkpointRepository };
export const remixProvenanceRepository = createLocalRemixProvenanceRepository();
export const checkpointService = createCheckpointService({
  persistence: projectPersistence,
  replaceProject: (document, detail) => projectPersistence.replaceActiveProject(document.project, detail),
  repository: checkpointRepository,
});
export const starterService = createStarterService({
  checkpointService,
  onBeforeProjectChange: stopAllSound,
  persistence: projectPersistence,
  projectState,
});
const themeFeature = createThemeFeature({ sessionState });
const workspaceTabs = createWorkspaceTabs({ projectState, sessionState });
const getSelectedTrackId = () => sessionState.getState().workspace.selectedTrackId;
const getSelectedPatternId = () => sessionState.getState().workspace.selectedPatternId;
const getKeyboardNoteOffset = () => (
  projectState.getPattern(getSelectedPatternId()).rootOctave - DEFAULT_PATTERN_ROOT_OCTAVE
);

const instrumentState = createInstrumentState(undefined, {
  getTrackId: getSelectedTrackId,
  projectState,
  sessionState,
  starterService,
});
const patternState = createPatternState(undefined, {
  getPatternId: getSelectedPatternId,
  projectState,
  sessionState,
});
export const trackRuntimes = createTrackRuntimeRegistry({ audioEngine, projectState });
const getSelectedVoiceEngine = () => trackRuntimes.getVoiceEngine(getSelectedTrackId());

const notePreview = createNotePreview({
  getAudioTime: audioEngine.getCurrentTime,
  getInstrumentConfig: instrumentState.getState,
  getVoiceEngine: getSelectedVoiceEngine,
});
export const scheduler = createArrangementScheduler({
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
  resolvePatternNote: (note, options) => scaleEntryController.resolve(note, options),
});

export function stopAllSound() {
  scheduler.stop();
  notePreview.stop();
  inputController.stopAll();
  trackRuntimes.stopAll();
}

keyboardFeature = createKeyboardFeature({
  audioEngine,
  getKeyboardNoteOffset,
  getScaleGuide: () => projectState.getState().scaleGuide,
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
  getScaleGuide: () => projectState.getState().scaleGuide,
  notePreview,
  onError: (message) => arrangerFeature?.showError(message),
  onStructuralEdit: scheduler.stop,
  patternState,
  projectState,
  resolveNewNote: (note) => scaleEntryController.resolve(note),
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
const projectLibraryFeature = createProjectLibraryFeature({
  onBeforeProjectChange: stopAllSound,
  onProjectDeleted: (projectId) => Promise.all([
    checkpointRepository.deleteProject(projectId),
    remixProvenanceRepository.delete(projectId),
  ]),
  persistence: projectPersistence,
  projectState,
});
const guidedCreationFeature = createGuidedCreationFeature({
  checkpointService,
  entryController: scaleEntryController,
  getSelectedPatternId,
  onBeforeProjectReplace: stopAllSound,
  projectState,
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
  if (!document.hidden) return;
  pauseForInterruption();
  void projectPersistence.saveNow().catch(() => {});
}, { signal: applicationLifecycle.signal });
window.addEventListener("blur", pauseForInterruption, { signal: applicationLifecycle.signal });
window.addEventListener("pagehide", () => {
  pauseForInterruption();
  void projectPersistence.saveNow().catch(() => {});
}, { signal: applicationLifecycle.signal });

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
  if (event.detail.field === "pattern.rootOctave" || event.detail.field === "scaleGuide") {
    keyboardFeature.render();
    patternFeature.render();
  }
  if (event.detail.field === "track.name") instrumentFeature.render();
}, { signal: applicationLifecycle.signal });

function disposeApplication() {
  applicationLifecycle.abort();
  audioStatusFeature.dispose();
  arrangerFeature.dispose();
  patternFeature.dispose();
  projectLibraryFeature.dispose();
  guidedCreationFeature.dispose();
  projectPersistence.dispose();
  checkpointRepository.dispose?.();
  instrumentFeature.dispose();
  keyboardFeature.dispose();
  workspaceTabs.dispose();
  themeFeature.dispose();
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
