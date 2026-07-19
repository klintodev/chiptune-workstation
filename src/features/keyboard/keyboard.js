import { queryRequired } from "../../shared/query-required.js";
import {
  LOWER_BLACK_KEYS,
  LOWER_WHITE_KEYS,
  UPPER_BLACK_KEYS,
  UPPER_WHITE_KEYS,
} from "./keyboard-layout.js";

export function createKeyboardFeature({
  audioEngine,
  getNoteName,
  inputController,
  instrumentState,
  onStopAllSound,
  root = document,
  sessionState,
}) {
  const keyButtons = new Map();
  const lifecycle = new AbortController();
  const stopSound = queryRequired(root, "#stop-sound");

  function createKeyButton(key, colour) {
    const button = root.createElement("button");
    button.type = "button";
    button.className = `music-key ${colour}`;
    button.dataset.note = String(key.note);
    button.disabled = true;
    const owner = (pointerId) => `pointer:${pointerId}:${key.note}`;
    button.addEventListener("pointerdown", (event) => {
      button.setPointerCapture(event.pointerId);
      inputController.start(owner(event.pointerId), key.note);
    }, { signal: lifecycle.signal });
    button.addEventListener("pointerup", (event) => {
      inputController.stop(owner(event.pointerId));
    }, { signal: lifecycle.signal });
    button.addEventListener("pointercancel", (event) => {
      inputController.stop(owner(event.pointerId));
    }, { signal: lifecycle.signal });

    const buttons = keyButtons.get(key.note) ?? [];
    buttons.push({ button, key });
    keyButtons.set(key.note, buttons);
    return button;
  }

  function renderKeyGroup(selector, keys, colour) {
    const container = queryRequired(root, selector);
    for (const key of keys) container.append(createKeyButton(key, colour));
  }

  function render() {
    const ready = audioEngine.isReady();
    const { octaveOffset } = instrumentState.getState();
    const activeNotes = new Set(sessionState.getState().activeNotes);
    stopSound.disabled = !ready;
    for (const [baseNote, entries] of keyButtons) {
      for (const { button, key } of entries) {
        const displayedName = getNoteName(baseNote + octaveOffset * 12);
        const active = activeNotes.has(baseNote);
        button.disabled = !ready;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-label", `${displayedName}, computer key ${key.label}`);
        button.innerHTML = `<span>${key.label}</span><small>${displayedName}</small>`;
      }
    }
  }

  stopSound.addEventListener("click", onStopAllSound, { signal: lifecycle.signal });

  renderKeyGroup("#upper-black-keys", UPPER_BLACK_KEYS, "black");
  renderKeyGroup("#upper-white-keys", UPPER_WHITE_KEYS, "white");
  renderKeyGroup("#lower-black-keys", LOWER_BLACK_KEYS, "black");
  renderKeyGroup("#lower-white-keys", LOWER_WHITE_KEYS, "white");

  return Object.freeze({
    dispose: () => lifecycle.abort(),
    render,
  });
}
