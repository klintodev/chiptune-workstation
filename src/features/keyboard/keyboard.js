import { queryRequired } from "../../shared/query-required.js";
import { KEYBOARD_KEYS } from "./keyboard-layout.js";

const WHITE_SEMITONES = new Set([0, 2, 4, 5, 7, 9, 11]);

function isWhiteKey(note) {
  return WHITE_SEMITONES.has(note % 12);
}

export function createKeyboardFeature({
  audioEngine,
  getNoteName,
  getKeyboardNoteOffset = () => 0,
  inputController,
  instrumentState,
  onStopAllSound,
  root = document,
  sessionState,
}) {
  const keyButtons = new Map();
  const lifecycle = new AbortController();
  const keybed = queryRequired(root, "#keyboard-keybed");
  const stopSound = queryRequired(root, "#stop-sound");

  function createKeyButton(key, colour) {
    const button = root.createElement("button");
    const computerKey = root.createElement("span");
    const noteName = root.createElement("small");
    button.type = "button";
    button.className = `music-key ${colour}`;
    button.dataset.note = String(key.note);
    button.disabled = true;
    computerKey.textContent = key.label;
    button.append(computerKey, noteName);

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

    keyButtons.set(key.note, { button, key, noteName });
    return button;
  }

  function renderKeybed() {
    const sortedKeys = [...KEYBOARD_KEYS].sort((left, right) => left.note - right.note);
    const whiteKeys = sortedKeys.filter((key) => isWhiteKey(key.note));
    const blackKeys = sortedKeys.filter((key) => !isWhiteKey(key.note));
    const surface = root.createElement("div");
    const whiteLayer = root.createElement("div");
    surface.className = "keyboard-keybed-surface";
    surface.style.setProperty("--white-key-count", String(whiteKeys.length));
    whiteLayer.className = "keyboard-white-keys";

    for (const key of whiteKeys) whiteLayer.append(createKeyButton(key, "white"));
    surface.append(whiteLayer);

    for (const key of blackKeys) {
      const boundaryIndex = whiteKeys.findIndex((whiteKey) => whiteKey.note > key.note);
      const button = createKeyButton(key, "black");
      button.style.left = `calc(${boundaryIndex} * var(--white-key-width))`;
      surface.append(button);
    }

    keybed.classList.add("keyboard-keybed");
    keybed.replaceChildren(surface);
  }

  function render() {
    const ready = audioEngine.isReady();
    const { octaveOffset } = instrumentState.getState();
    const activeNotes = new Set(sessionState.getState().activeNotes);
    stopSound.disabled = !ready;
    for (const [baseNote, { button, key, noteName }] of keyButtons) {
      const displayedName = getNoteName(baseNote + (getKeyboardNoteOffset() + octaveOffset) * 12);
      const active = activeNotes.has(baseNote);
      button.disabled = !ready;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", `${displayedName}, computer key ${key.label}`);
      noteName.textContent = displayedName;
    }
  }

  stopSound.addEventListener("click", onStopAllSound, { signal: lifecycle.signal });

  renderKeybed();
  render();

  return Object.freeze({
    dispose: () => lifecycle.abort(),
    render,
  });
}
