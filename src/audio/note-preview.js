import { DEFAULT_PATTERN_VOLUME } from "../state/pattern-state.js";
import { midiNoteToFrequency } from "./voice-engine.js";

export function createNotePreview({ getAudioTime, getInstrumentConfig, voiceEngine }) {
  let activeVoice = null;

  function stop() {
    if (!activeVoice) return false;
    const stopped = activeVoice.stop();
    activeVoice = null;
    return stopped;
  }

  function play(note, volume = DEFAULT_PATTERN_VOLUME) {
    stop();
    if (volume === 0) return false;
    const config = getInstrumentConfig();
    try {
      activeVoice = voiceEngine.trigger({
        type: config.voiceType,
        frequency: midiNoteToFrequency(note),
        startTime: getAudioTime(),
        duration: 0.14,
        intensity: volume,
        attackSeconds: config.attackSeconds,
        releaseSeconds: config.releaseSeconds,
      });
      return true;
    } catch (error) {
      if (error?.code === "not-ready") return false;
      throw error;
    }
  }

  return Object.freeze({ play, stop });
}
