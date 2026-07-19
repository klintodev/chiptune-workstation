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