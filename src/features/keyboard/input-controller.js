import { midiNoteToFrequency } from "../../audio/voice-engine.js?v=20260721-1";
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
  resolvePatternNote = (note) => note,
  root = document,
  voiceEngine,
}) {
  const resolveVoiceEngine = getVoiceEngine ?? (() => voiceEngine);
  const voicesByOwner = new Map();
  const ownersByNote = new Map();

  function emitActiveNotes() {
    onActiveNotesChange?.(new Set(ownersByNote.keys()));
  }

  function createVoice(baseNote, { consumeBypass = true } = {}) {
    const config = getInstrumentConfig();
    const keyboardNoteOffset = getKeyboardNoteOffset();
    const proposedNote = baseNote + keyboardNoteOffset * 12;
    const previewPatternNote = resolvePatternNote(proposedNote, { consumeBypass: false });
    const playedNote = previewPatternNote + config.octaveOffset * 12;
    const activeVoiceEngine = resolveVoiceEngine();
    const voice = activeVoiceEngine.trigger({
      type: config.voiceType,
      frequency: midiNoteToFrequency(playedNote),
      attackSeconds: config.attackSeconds,
      releaseSeconds: config.releaseSeconds,
    });
    const patternNote = consumeBypass
      ? resolvePatternNote(proposedNote, { consumeBypass: true })
      : previewPatternNote;
    return {
      activeNote: patternNote - keyboardNoteOffset * 12,
      patternNote,
      voice,
    };
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
    voicesByOwner.set(owner, {
      activeNote: started.activeNote,
      baseNote,
      voice: started.voice,
    });
    const owners = ownersByNote.get(started.activeNote) ?? new Set();
    owners.add(owner);
    ownersByNote.set(started.activeNote, owners);
    emitActiveNotes();
    onNoteStart?.(started.patternNote);
    return true;
  }

  function stop(owner) {
    const active = voicesByOwner.get(owner);
    if (!active) return false;
    active.voice.stop();
    voicesByOwner.delete(owner);
    const owners = ownersByNote.get(active.activeNote);
    owners?.delete(owner);
    if (owners?.size === 0) ownersByNote.delete(active.activeNote);
    emitActiveNotes();
    return true;
  }

  function stopAll() {
    for (const owner of [...voicesByOwner.keys()]) stop(owner);
  }

  function refreshActiveVoices() {
    ownersByNote.clear();
    for (const [owner, active] of voicesByOwner) {
      active.voice.stop();
      const refreshed = createVoice(active.baseNote, { consumeBypass: false });
      voicesByOwner.set(owner, {
        activeNote: refreshed.activeNote,
        baseNote: active.baseNote,
        voice: refreshed.voice,
      });
      const owners = ownersByNote.get(refreshed.activeNote) ?? new Set();
      owners.add(owner);
      ownersByNote.set(refreshed.activeNote, owners);
    }
    emitActiveNotes();
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
