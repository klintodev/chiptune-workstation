import { midiNoteToFrequency } from "../../audio/voice-engine.js";
import { KEY_BY_CODE } from "./keyboard-layout.js";

function isTextEntry(target) {
  if (!(target instanceof Element)) return false;
  if (target.matches("textarea") || target.isContentEditable) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !["range", "button", "checkbox", "radio", "submit", "reset"].includes(target.type);
}

function releaseControlFocus(target) {
  if (target instanceof HTMLSelectElement) target.blur();
  if (target instanceof HTMLInputElement && target.type === "range") target.blur();
}

export function createInputController({
  getInstrumentConfig,
  getKeyboardNoteOffset = () => 0,
  getVoiceEngine,
  onActiveNotesChange,
  onNoteStart,
  root = document,
  voiceEngine,
}) {
  const resolveVoiceEngine = getVoiceEngine ?? (() => voiceEngine);
  const voicesByOwner = new Map();
  const ownersByNote = new Map();

  function emitActiveNotes() {
    onActiveNotesChange?.(new Set(ownersByNote.keys()));
  }

  function createVoice(baseNote) {
    const config = getInstrumentConfig();
    const patternNote = baseNote + getKeyboardNoteOffset() * 12;
    const playedNote = patternNote + config.octaveOffset * 12;
    const activeVoiceEngine = resolveVoiceEngine();
    const voice = activeVoiceEngine.trigger({
      type: config.voiceType,
      frequency: midiNoteToFrequency(playedNote),
      attackSeconds: config.attackSeconds,
      releaseSeconds: config.releaseSeconds,
    });
    return { patternNote, voice };
  }

  function start(owner, baseNote) {
    if (voicesByOwner.has(owner)) return false;
    let started;
    try {
      started = createVoice(baseNote);
    } catch (error) {
      if (error?.code === "not-ready") return false;
      throw error;
    }
    voicesByOwner.set(owner, { baseNote, voice: started.voice });
    const owners = ownersByNote.get(baseNote) ?? new Set();
    owners.add(owner);
    ownersByNote.set(baseNote, owners);
    emitActiveNotes();
    onNoteStart?.(started.patternNote);
    return true;
  }

  function stop(owner) {
    const active = voicesByOwner.get(owner);
    if (!active) return false;
    active.voice.stop();
    voicesByOwner.delete(owner);
    const owners = ownersByNote.get(active.baseNote);
    owners?.delete(owner);
    if (owners?.size === 0) ownersByNote.delete(active.baseNote);
    emitActiveNotes();
    return true;
  }

  function stopAll() {
    for (const owner of [...voicesByOwner.keys()]) stop(owner);
  }

  function refreshActiveVoices() {
    for (const [owner, active] of voicesByOwner) {
      active.voice.stop();
      voicesByOwner.set(owner, { baseNote: active.baseNote, voice: createVoice(active.baseNote).voice });
    }
  }

  function handleKeyDown(event) {
    if (event.repeat || isTextEntry(event.target)) return;
    const key = KEY_BY_CODE.get(event.code);
    if (!key) return;
    releaseControlFocus(event.target);
    event.preventDefault();
    start(`keyboard:${event.code}`, key.note);
  }

  function handleKeyUp(event) {
    const key = KEY_BY_CODE.get(event.code);
    if (!key) return;
    event.preventDefault();
    stop(`keyboard:${event.code}`);
  }

  function handlePointerDown(event) {
    if (!(event.target instanceof Element)) return;
    const isInterruptingControl =
      event.target.matches("textarea") ||
      (event.target instanceof HTMLInputElement && event.target.type !== "range");
    if (isInterruptingControl) stopAll();
  }

  root.addEventListener("pointerdown", handlePointerDown, true);

  function dispose() {
    root.removeEventListener("pointerdown", handlePointerDown, true);
    stopAll();
  }

  return Object.freeze({ dispose, handleKeyDown, handleKeyUp, refreshActiveVoices, start, stop, stopAll });
}
