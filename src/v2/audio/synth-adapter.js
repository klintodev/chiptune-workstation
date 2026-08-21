import { createKlintoChipSynthRuntime } from "./klinto-chip-synth.js";
import { createInstrumentSynthRouter } from "./instrument-synth-router.js";

/** Bind every registered first-party synth to stable per-Track Instrument inputs. */
export function createInstrumentScheduleVoice({
  context,
  deviceRegistry,
  mode = "live",
  random,
  runtimeRegistry,
} = {}) {
  if (!runtimeRegistry?.getTrackInputNode) {
    throw new TypeError("A device runtime registry with Track Instrument inputs is required.");
  }
  const synth = createInstrumentSynthRouter({
    context,
    ...(deviceRegistry ? { deviceRegistry } : {}),
    mode,
    ...(random ? { random } : {}),
    runtimeRegistry,
  });
  return Object.freeze({
    dispose: synth.dispose,
    getAudioTime: () => context.currentTime,
    scheduleVoice: synth.trigger,
    synth,
  });
}

/** Bind the production Chip synth to the stable Instrument inputs in a runtime registry. */
export function createKlintoChipScheduleVoice({ context, random, runtimeRegistry } = {}) {
  if (!runtimeRegistry?.getTrackInputNode) {
    throw new TypeError("A device runtime registry with Track Instrument inputs is required.");
  }
  const synth = createKlintoChipSynthRuntime({
    context,
    getOutputNode: (trackId) => {
      const output = runtimeRegistry.getTrackInputNode(trackId);
      if (!output) throw new RangeError(`No Instrument runtime exists for Track ${trackId}.`);
      return output;
    },
    ...(random ? { random } : {}),
  });
  return Object.freeze({
    dispose: synth.dispose,
    getAudioTime: () => context.currentTime,
    scheduleVoice: synth.trigger,
    synth,
  });
}
