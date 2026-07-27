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

test("computer note keys work from non-editable controls and stop across focus changes", () => {
  const root = new EventTarget();
  let blockingSurfaces = [];
  root.querySelectorAll = () => blockingSurfaces;
  const triggered = [];
  const stopped = [];
  const controller = createInputController({
    getInstrumentConfig: () => ({
      attackSeconds: 0.008,
      octaveOffset: 0,
      releaseSeconds: 0.03,
      voiceType: "square",
    }),
    getVoiceEngine: () => ({
      trigger(options) {
        triggered.push(options);
        return { stop: () => stopped.push(true) };
      },
    }),
    root,
  });
  const button = {
    closest: (selector) => selector.split(", ").includes("button") ? button : null,
  };
  const input = {
    closest: (selector) => selector.split(", ").includes("input") ? input : null,
  };
  const createEvent = (target, values = {}) => {
    let prevented = false;
    return {
      altKey: false,
      code: "KeyZ",
      ctrlKey: false,
      defaultPrevented: false,
      get prevented() { return prevented; },
      metaKey: false,
      preventDefault() { prevented = true; },
      repeat: false,
      target,
      ...values,
    };
  };

  const keyDown = createEvent(button);
  controller.handleKeyDown(keyDown);
  assert.equal(triggered.length, 1);
  assert.equal(keyDown.prevented, true);

  const keyUp = createEvent(input);
  controller.handleKeyUp(keyUp);
  assert.equal(stopped.length, 1);
  assert.equal(keyUp.prevented, true);

  controller.handleKeyDown(createEvent(input));
  controller.handleKeyDown(createEvent(button, { ctrlKey: true }));
  blockingSurfaces = [{ closest: () => null }];
  controller.handleKeyDown(createEvent(button));
  assert.equal(triggered.length, 1);
  controller.dispose();
});
