import { KEY_BY_CODE } from "./keyboard-layout.js";
import { midiNoteToFrequency } from "./voice-engine.js";

function isTextEntry(target) {
  return target instanceof Element && (target.matches("input, textarea") || target.isContentEditable);
}

export function createInputController({ voiceEngine, getVoiceType, onActiveNotesChange }) {
  const voicesByOwner = new Map();
  const ownersByNote = new Map();

  function emitActiveNotes() {
    onActiveNotesChange?.(new Set(ownersByNote.keys()));
  }

  function start(owner, note) {
    if (voicesByOwner.has(owner)) return false;

    let voice;
    try {
      voice = voiceEngine.trigger({ type: getVoiceType(), frequency: midiNoteToFrequency(note) });
    } catch (error) {
      if (error?.code === "not-ready") return false;
      throw error;
    }

    voicesByOwner.set(owner, { note, voice });
    const owners = ownersByNote.get(note) ?? new Set();
    owners.add(owner);
    ownersByNote.set(note, owners);
    emitActiveNotes();
    return true;
  }

  function stop(owner) {
    const active = voicesByOwner.get(owner);
    if (!active) return false;
    active.voice.stop();
    voicesByOwner.delete(owner);
    const owners = ownersByNote.get(active.note);
    owners?.delete(owner);
    if (owners?.size === 0) ownersByNote.delete(active.note);
    emitActiveNotes();
    return true;
  }

  function stopAll() {
    for (const owner of [...voicesByOwner.keys()]) stop(owner);
  }

  function handleKeyDown(event) {
    if (event.repeat || isTextEntry(event.target)) return;
    const key = KEY_BY_CODE.get(event.code);
    if (!key) return;
    if (event.target instanceof HTMLSelectElement) event.target.blur();
    event.preventDefault();
    start(`keyboard:${event.code}`, key.note);
  }

  function handleKeyUp(event) {
    const key = KEY_BY_CODE.get(event.code);
    if (!key) return;
    event.preventDefault();
    stop(`keyboard:${event.code}`);
  }

  function handleEditableControlPointerDown(event) {
    if (event.target instanceof Element && event.target.matches("input, textarea, select")) {
      stopAll();
    }
  }

  document.addEventListener("pointerdown", handleEditableControlPointerDown, true);

  return Object.freeze({ handleKeyDown, handleKeyUp, start, stop, stopAll });
}
