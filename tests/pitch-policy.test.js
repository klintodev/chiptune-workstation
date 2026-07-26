import assert from "node:assert/strict";
import test from "node:test";

import { createNotePreview } from "../src/audio/note-preview.js";
import {
  MAX_PLAYABLE_FREQUENCY,
  MAX_PLAYABLE_MIDI_NOTE,
  MIN_PLAYABLE_FREQUENCY,
  MIN_PLAYABLE_MIDI_NOTE,
  getEffectiveMidiNote,
  midiNoteToFrequency,
  validateAudioSampleRate,
  validatePlayableFrequency,
} from "../src/audio/pitch-policy.js";
import { createInputController } from "../src/features/keyboard/input-controller.js";

test("the shared pitch policy covers every editor note at every octave offset", () => {
  for (const note of [36, 112]) {
    for (const octaveOffset of [-2, -1, 0, 1, 2]) {
      const effective = getEffectiveMidiNote(note, octaveOffset);
      assert.ok(effective >= MIN_PLAYABLE_MIDI_NOTE);
      assert.ok(effective <= MAX_PLAYABLE_MIDI_NOTE);
      assert.ok(Number.isFinite(midiNoteToFrequency(effective)));
    }
  }
  assert.equal(getEffectiveMidiNote(36, -2), MIN_PLAYABLE_MIDI_NOTE);
  assert.equal(getEffectiveMidiNote(112, 2), MAX_PLAYABLE_MIDI_NOTE);
  assert.ok(Math.abs(MIN_PLAYABLE_FREQUENCY - 16.3516) < 0.001);
  assert.ok(Math.abs(MAX_PLAYABLE_FREQUENCY - 21_096.1636) < 0.001);
});

test("pitch and audio-context values outside the canonical boundaries are rejected", () => {
  for (const note of [11, 137, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => midiNoteToFrequency(note));
  }
  for (const frequency of [
    MIN_PLAYABLE_FREQUENCY - 0.001,
    MAX_PLAYABLE_FREQUENCY + 0.001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(() => validatePlayableFrequency(frequency));
  }
  assert.equal(validatePlayableFrequency(MIN_PLAYABLE_FREQUENCY), MIN_PLAYABLE_FREQUENCY);
  assert.equal(validatePlayableFrequency(MAX_PLAYABLE_FREQUENCY), MAX_PLAYABLE_FREQUENCY);
  assert.throws(() => validateAudioSampleRate(44_099));
  assert.equal(validateAudioSampleRate(44_100), 44_100);
});

test("preview and live input use the same effective boundary pitches", () => {
  const previewTriggers = [];
  let octaveOffset = -2;
  const engine = {
    trigger(options) {
      previewTriggers.push(options);
      return { stop: () => true };
    },
  };
  const getInstrumentConfig = () => ({
    attackSeconds: 0.008,
    octaveOffset,
    releaseSeconds: 0.03,
    voiceType: "square",
  });
  const preview = createNotePreview({
    getAudioTime: () => 1,
    getInstrumentConfig,
    voiceEngine: engine,
  });
  assert.equal(preview.play(36), true);
  octaveOffset = 2;
  assert.equal(preview.play(112), true);
  assert.equal(previewTriggers[0].frequency, MIN_PLAYABLE_FREQUENCY);
  assert.equal(previewTriggers[1].frequency, MAX_PLAYABLE_FREQUENCY);

  const inputTriggers = [];
  const controller = createInputController({
    getInstrumentConfig,
    root: new EventTarget(),
    voiceEngine: {
      trigger(options) {
        inputTriggers.push(options);
        return { stop() {} };
      },
    },
  });
  octaveOffset = -2;
  assert.equal(controller.start("low", 36), true);
  octaveOffset = 2;
  assert.equal(controller.start("high", 112), true);
  assert.equal(inputTriggers[0].frequency, MIN_PLAYABLE_FREQUENCY);
  assert.equal(inputTriggers[1].frequency, MAX_PLAYABLE_FREQUENCY);
  controller.dispose();
});
