import { midiPitchToFrequency } from "./render-plan.js";
import { toWebAudioWaveform } from "./web-audio-runtime.js";

export const SYNTH_SILENCE_GAIN = 0.0001;
export const VOICE_RETIRE_RAMP_SECONDS = 0.005;
const NOISE_REFERENCE_FREQUENCY = 440;

function disconnect(node) {
  try { node?.disconnect(); } catch {}
}

function assertFiniteRange(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

/**
 * Web Audio voice adapter shared by live, OfflineAudioContext and public
 * playback. Voice arbitration deliberately belongs to occurrence-scheduler.
 */
export function createKlintoChipSynthRuntime({
  context,
  getOutputNode,
  random = Math.random,
} = {}) {
  if (!context?.createGain || !context?.createOscillator || typeof getOutputNode !== "function") {
    throw new TypeError("Klinto Chip synthesis requires a context and output-node provider.");
  }
  const activeVoices = new Set();
  const voiceFinalizers = new Map();
  const pulseWaves = new Map();
  let noiseBuffer = null;
  let disposed = false;

  function getPulseWave(dutyCycle) {
    if (pulseWaves.has(dutyCycle)) return pulseWaves.get(dutyCycle);
    const harmonicCount = 64;
    const real = new Float32Array(harmonicCount + 1);
    const imaginary = new Float32Array(harmonicCount + 1);
    for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
      const phase = 2 * Math.PI * harmonic * dutyCycle;
      real[harmonic] = (2 * Math.sin(phase)) / (Math.PI * harmonic);
      imaginary[harmonic] = (2 * (1 - Math.cos(phase))) / (Math.PI * harmonic);
    }
    const wave = context.createPeriodicWave(real, imaginary);
    pulseWaves.set(dutyCycle, wave);
    return wave;
  }

  function getNoiseBuffer() {
    if (noiseBuffer?.sampleRate === context.sampleRate) return noiseBuffer;
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    const holdSamples = Math.max(1, Math.round(context.sampleRate / NOISE_REFERENCE_FREQUENCY));
    let value = 0;
    for (let index = 0; index < samples.length; index += 1) {
      if (index % holdSamples === 0) value = random() < 0.5 ? -1 : 1;
      samples[index] = value;
    }
    return noiseBuffer;
  }

  function createSource(waveform, frequencyHz) {
    if (waveform === "noise") {
      const source = context.createBufferSource();
      source.buffer = getNoiseBuffer();
      source.loop = true;
      source.playbackRate.value = frequencyHz / NOISE_REFERENCE_FREQUENCY;
      return source;
    }
    const source = context.createOscillator();
    if (waveform === "pulse12" || waveform === "pulse25") {
      source.setPeriodicWave(getPulseWave(waveform === "pulse12" ? 0.125 : 0.25));
    } else {
      source.type = toWebAudioWaveform(waveform);
    }
    source.frequency.value = frequencyHz;
    return source;
  }

  function trigger(event) {
    if (disposed) throw new Error("The Klinto Chip synth runtime has been disposed.");
    const startTime = event.startTime ?? event.startSeconds;
    const durationSeconds = event.durationSeconds;
    const velocity = event.velocity;
    const attackSeconds = event.attackSeconds;
    const releaseSeconds = event.releaseSeconds;
    const frequencyHz = event.frequencyHz ?? midiPitchToFrequency(event.effectivePitch);
    assertFiniteRange(startTime, 0, Number.MAX_VALUE, "Voice start time");
    assertFiniteRange(durationSeconds, Number.EPSILON, Number.MAX_VALUE, "Voice duration");
    assertFiniteRange(velocity, Number.EPSILON, 1, "Voice velocity");
    assertFiniteRange(attackSeconds, 0.001, 2, "Voice attack");
    assertFiniteRange(releaseSeconds, 0.01, 3, "Voice release");
    assertFiniteRange(frequencyHz, Number.EPSILON, context.sampleRate / 2, "Voice frequency");

    const source = createSource(event.waveform, frequencyHz);
    const gain = context.createGain();
    let ended = false;
    let stopTime = null;
    const endedListeners = new Set();
    gain.gain.setValueAtTime(SYNTH_SILENCE_GAIN, startTime);
    gain.gain.exponentialRampToValueAtTime(velocity, startTime + attackSeconds);
    source.connect(gain);
    gain.connect(getOutputNode(event.trackId));

    const voice = {
      addEndedListener(listener) {
        if (ended) listener();
        else endedListeners.add(listener);
        return () => endedListeners.delete(listener);
      },
      dispose(time = context.currentTime) {
        return voice.retire(time);
      },
      get ended() { return ended; },
      get ownership() { return event.ownership; },
      retire(time = context.currentTime) {
        if (ended) return false;
        const retireTime = Math.max(context.currentTime, time);
        stopTime = retireTime;
        gain.gain.cancelScheduledValues(retireTime);
        gain.gain.setValueAtTime(
          Number.isFinite(gain.gain.value) ? Math.max(SYNTH_SILENCE_GAIN, gain.gain.value) : SYNTH_SILENCE_GAIN,
          retireTime,
        );
        gain.gain.linearRampToValueAtTime(SYNTH_SILENCE_GAIN, retireTime + VOICE_RETIRE_RAMP_SECONDS);
        try { source.stop(retireTime + VOICE_RETIRE_RAMP_SECONDS); } catch {}
        return true;
      },
      stop(time = context.currentTime) {
        if (ended) return false;
        const gateTime = Math.max(startTime, time);
        if (stopTime !== null && gateTime >= stopTime) return false;
        stopTime = gateTime;
        const attackProgress = Math.min(1, Math.max(0, (gateTime - startTime) / attackSeconds));
        const heldGain = SYNTH_SILENCE_GAIN
          * (velocity / SYNTH_SILENCE_GAIN) ** attackProgress;
        gain.gain.cancelScheduledValues(gateTime);
        gain.gain.setValueAtTime(heldGain, gateTime);
        gain.gain.exponentialRampToValueAtTime(SYNTH_SILENCE_GAIN, gateTime + releaseSeconds);
        try { source.stop(gateTime + releaseSeconds + 0.01); } catch {}
        return true;
      },
      source,
      gain,
    };

    function finish() {
      if (ended) return;
      ended = true;
      activeVoices.delete(voice);
      voiceFinalizers.delete(voice);
      disconnect(source);
      disconnect(gain);
      for (const listener of endedListeners) listener();
      endedListeners.clear();
    }

    source.addEventListener?.("ended", finish, { once: true });
    activeVoices.add(voice);
    voiceFinalizers.set(voice, finish);
    source.start(startTime);
    voice.stop(startTime + durationSeconds);
    return Object.freeze(voice);
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    for (const voice of [...activeVoices]) {
      voice.retire(context.currentTime);
      voiceFinalizers.get(voice)?.();
    }
    activeVoices.clear();
    voiceFinalizers.clear();
    pulseWaves.clear();
    noiseBuffer = null;
    return true;
  }

  return Object.freeze({
    dispose,
    getActiveVoiceCount: () => activeVoices.size,
    trigger,
  });
}

export const klintoChipSynthAdapters = Object.freeze({
  live: createKlintoChipSynthRuntime,
  offline: createKlintoChipSynthRuntime,
  public: createKlintoChipSynthRuntime,
});
export const KLINTO_CHIP_SYNTH_ADAPTERS = klintoChipSynthAdapters;
