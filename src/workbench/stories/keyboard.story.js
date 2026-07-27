import { createKeyboardFeature } from "../../features/keyboard/keyboard.js";
import { getNoteName } from "../../music/note.js";
import { createInstrumentState } from "../../state/instrument-state.js";
import { createSessionState } from "../../state/session-state.js";
import { defineStory } from "../story-registry.js";
import { createStoryRoot, disposeAll } from "../story-helpers.js";

function mountKeyboard({ canvas, scenario }) {
  const root = createStoryRoot(canvas);
  root.innerHTML = `
    <p class="story-note">Pointer interactions update local active-note state; no Web Audio context is created.</p>
    <section class="keyboard-section" aria-label="Playable keyboard">
      <div class="keyboard-heading">
        <div><h2>Keyboard</h2><p>Production keys with a simulated engine</p></div>
        <button id="stop-sound" class="panic-button" type="button">Stop sound</button>
      </div>
      <div class="keyboard-scroll"><div id="keyboard-keybed"></div></div>
    </section>
  `;

  const sessionState = createSessionState({ activeNotes: scenario.activeNotes });
  const instrumentState = createInstrumentState({ octaveOffset: scenario.octaveOffset ?? 0 });
  const audioEngine = Object.freeze({ isReady: () => scenario.ready });
  const activeOwners = new Map();
  const renderActiveNotes = () => sessionState.setActiveNotes(activeOwners.values());
  const inputController = Object.freeze({
    start(owner, note) {
      if (!scenario.ready) return false;
      activeOwners.set(owner, note);
      renderActiveNotes();
      return true;
    },
    stop(owner) {
      activeOwners.delete(owner);
      renderActiveNotes();
      return true;
    },
    stopAll() {
      activeOwners.clear();
      renderActiveNotes();
    },
  });

  const keyboard = createKeyboardFeature({
    audioEngine,
    getNoteName,
    inputController,
    instrumentState,
    onStopAllSound: inputController.stopAll,
    root: root.ownerDocument,
    sessionState,
  });
  const render = () => keyboard.render();
  sessionState.addEventListener("change", render);

  return disposeAll(
    { dispose: () => sessionState.removeEventListener("change", render) },
    keyboard,
    instrumentState,
  );
}

export const keyboardStory = defineStory({
  id: "keyboard",
  title: "Playable keyboard",
  group: "Instrument",
  description: "Reason about key layout, ready/disabled presentation, active notes, and octave labels in isolation.",
  source: "src/features/keyboard/keyboard.js",
  scenarios: [
    { id: "ready", title: "Ready", ready: true, activeNotes: [], octaveOffset: 0 },
    { id: "active-chord", title: "Active chord", ready: true, activeNotes: [48, 52, 55], octaveOffset: 0 },
    { id: "disabled", title: "Audio unavailable", ready: false, activeNotes: [], octaveOffset: 0 },
    { id: "octave-up", title: "Octave up", ready: true, activeNotes: [], octaveOffset: 1 },
  ],
  mount: mountKeyboard,
});
