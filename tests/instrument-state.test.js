import assert from "node:assert/strict";
import test from "node:test";

import { createInstrumentState, instrumentDefaults } from "../src/state/instrument-state.js";

test("instrument settings are validated and reset together", () => {
  const instrument = createInstrumentState();

  instrument.setVoiceType("pulse25");
  instrument.setOctaveOffset(2);
  instrument.setVolume(0.8);
  instrument.setAttackSeconds(0.5);
  instrument.setReleaseSeconds(1.5);

  assert.deepEqual(instrument.getState(), {
    voiceType: "pulse25",
    octaveOffset: 2,
    volume: 0.8,
    attackSeconds: 0.5,
    releaseSeconds: 1.5,
  });
  assert.throws(() => instrument.setOctaveOffset(3), RangeError);

  instrument.reset();
  assert.deepEqual(instrument.getState(), { ...instrumentDefaults });
});
