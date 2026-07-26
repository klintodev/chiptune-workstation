import assert from "node:assert/strict";
import test from "node:test";

import { createAudioEngine } from "../src/audio/audio-engine.js";

test("audio activation rejects a sample rate that cannot play the full pitch range", async () => {
  const originalAudioContext = globalThis.AudioContext;
  let closed = false;
  globalThis.AudioContext = class {
    sampleRate = 22_050;

    async close() {
      closed = true;
    }
  };
  const engine = createAudioEngine();
  try {
    await assert.rejects(engine.enable(), (error) => (
      error.code === "unsupported" && /below 44100 Hz/.test(error.message)
    ));
    assert.equal(engine.isReady(), false);
    assert.equal(closed, true);
  } finally {
    await engine.dispose();
    if (originalAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalAudioContext;
  }
});
