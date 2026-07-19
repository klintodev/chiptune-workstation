import {
  createAudioEngine,
  createAudioEngineError,
  isAudioEngineError,
} from "./audio/audio-engine.js";
import { createNotePreview } from "./audio/note-preview.js";
import { createTrackChannel } from "./audio/track-channel.js";
import { createVoiceEngine } from "./audio/voice-engine.js";
import { createAudioStatusFeature } from "./features/audio-status/audio-status.js";
import { createInstrumentFeature } from "./features/instrument/instrument.js";
import { createInputController } from "./features/keyboard/input-controller.js";
import { createKeyboardFeature } from "./features/keyboard/keyboard.js";
import { createPatternFeature } from "./features/pattern-editor/pattern-feature.js";
import { getNoteName } from "./music/note.js";
import { createInstrumentState } from "./state/instrument-state.js";
import { createPatternState } from "./state/pattern-state.js";
import { DEFAULT_TRACK_ID, createProjectState } from "./state/project-state.js";
import { createSessionState } from "./state/session-state.js";
import { createStepScheduler } from "./transport/step-scheduler.js";

const audioEngine = createAudioEngine();
const projectState = createProjectState();
const sessionState = createSessionState();
const instrumentState = createInstrumentState(undefined, { projectState });
const patternState = createPatternState(undefined, { projectState });
const initialTrack = projectState.getTrack(DEFAULT_TRACK_ID);
const trackChannel = createTrackChannel({
  getAudioTime: audioEngine.getCurrentTime,
  getMasterOutputNode: audioEngine.getInputNode,
  initialMuted: initialTrack.mixer.muted,
  initialVolume: initialTrack.mixer.volume,
  trackId: initialTrack.id,
});
const voiceEngine = createVoiceEngine({
  getAudioTime: audioEngine.getCurrentTime,
  getOutputNode: trackChannel.getInputNode,
});
const notePreview = createNotePreview({
  getAudioTime: audioEngine.getCurrentTime,
  getInstrumentConfig: instrumentState.getState,
  voiceEngine,
});
const scheduler = createStepScheduler({
  getAudioTime: audioEngine.getCurrentTime,
  getInstrumentConfig: instrumentState.getState,
  getPatternState: patternState.getState,
  voiceEngine,
  bpm: projectState.getState().transport.bpm,
});

let keyboardFeature;
let patternFeature;
const inputController = createInputController({
  voiceEngine,
  getInstrumentConfig: instrumentState.getState,
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
  voiceEngine.stopAll();
}

keyboardFeature = createKeyboardFeature({
  audioEngine,
  getNoteName,
  inputController,
  instrumentState,
  onStopAllSound: stopAllSound,
  sessionState,
});
const instrumentFeature = createInstrumentFeature({
  inputController,
  instrumentState,
  onRenderKeyboard: keyboardFeature.render,
  voiceEngine,
});
patternFeature = createPatternFeature({
  audioEngine,
  getNoteName,
  notePreview,
  patternState,
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
  voiceEngine.stopAll();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseForInterruption();
}, { signal: applicationLifecycle.signal });
window.addEventListener("blur", pauseForInterruption, { signal: applicationLifecycle.signal });
window.addEventListener("pagehide", pauseForInterruption, { signal: applicationLifecycle.signal });

function syncTrackMixer() {
  const { mixer } = projectState.getTrack(DEFAULT_TRACK_ID);
  trackChannel.setMuted(mixer.muted);
  trackChannel.setVolume(mixer.volume);
}

projectState.addEventListener("change", syncTrackMixer, { signal: applicationLifecycle.signal });

function disposeApplication() {
  applicationLifecycle.abort();
  audioStatusFeature.dispose();
  patternFeature.dispose();
  instrumentFeature.dispose();
  keyboardFeature.dispose();
  inputController.dispose();
  patternState.dispose();
  instrumentState.dispose();
  scheduler.stop();
  notePreview.stop();
  voiceEngine.dispose();
  trackChannel.dispose();
  void audioEngine.dispose();
}

window.addEventListener("unload", disposeApplication, { once: true });

audioStatusFeature.render();
