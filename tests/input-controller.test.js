import assert from "node:assert/strict";
import test from "node:test";

import { midiNoteToFrequency } from "../src/audio/voice-engine.js";
import { createInputController } from "../src/features/keyboard/input-controller.js";

test("pattern root octave shifts captured notes before instrument transposition", () => {
  const triggers = [];
  const captured = [];
  const controller = createInputController({
    getInstrumentConfig: () => ({
      attackSeconds: 0.008,
      octaveOffset: 1,
      releaseSeconds: 0.03,
      voiceType: "square",
    }),
    getKeyboardNoteOffset: () => -2,
    getVoiceEngine: () => ({
      trigger(options) {
        triggers.push(options);
        return { stop() {} };
      },
    }),
    onNoteStart: (note) => captured.push(note),
    root: new EventTarget(),
  });

  controller.start("test", 60);

  assert.deepEqual(captured, [36]);
  assert.equal(triggers[0].frequency, midiNoteToFrequency(48));
  controller.dispose();
});

test("scale resolution previews the snapped key and captures the same pattern note", () => {
  const captured = [];
  const active = [];
  const controller = createInputController({
    getInstrumentConfig: () => ({
      attackSeconds: 0.008,
      octaveOffset: 0,
      releaseSeconds: 0.03,
      voiceType: "square",
    }),
    getVoiceEngine: () => ({
      trigger() {
        return { stop() {} };
      },
    }),
    onActiveNotesChange: (notes) => active.push([...notes]),
    onNoteStart: (note) => captured.push(note),
    resolvePatternNote: () => 60,
    root: new EventTarget(),
  });

  controller.start("keyboard:KeyS", 61);
  assert.deepEqual(captured, [60]);
  assert.deepEqual(active, [[60]]);
  controller.stop("keyboard:KeyS");
  assert.deepEqual(active.at(-1), []);
  controller.dispose();
});

test("a note that cannot start does not consume the one-note scale bypass", () => {
  let bypassArmed = true;
  const controller = createInputController({
    getInstrumentConfig: () => ({
      attackSeconds: 0.008,
      octaveOffset: 0,
      releaseSeconds: 0.03,
      voiceType: "square",
    }),
    getVoiceEngine: () => ({
      trigger() {
        const error = new Error("Audio not ready");
        error.code = "not-ready";
        throw error;
      },
    }),
    resolvePatternNote: (note, { consumeBypass }) => {
      if (consumeBypass) bypassArmed = false;
      return note;
    },
    root: new EventTarget(),
  });

  assert.equal(controller.start("keyboard:KeyS", 61), false);
  assert.equal(bypassArmed, true);
  controller.dispose();
});
