export const KLINTO_DRUMS_SILENCE_GAIN = 0.0001;
export const KLINTO_DRUMS_RETIRE_RAMP_SECONDS = 0.005;
export const KLINTO_DRUMS_SOURCE_PADDING_SECONDS = 0.005;

const DRUM_ATTACK_SECONDS = 0.002;
const NOISE_BUFFER_SECONDS = 1;
const NOISE_SEED = 0x4b1d_5eed;

function piece(pitch, id, name, family, decayScale, baseFrequencyHz = null) {
  return Object.freeze({ baseFrequencyHz, decayScale, family, id, name, pitch });
}

export const KLINTO_DRUM_PIECES = Object.freeze([
  piece(60, "kick", "Kick", "kick", 1, 50),
  piece(61, "short-kick", "Short Kick", "kick", 0.45, 50),
  piece(62, "snare", "Snare", "snare", 1, 150),
  piece(63, "tight-snare", "Tight Snare", "snare", 0.55, 150),
  piece(64, "closed-hat", "Closed Hat", "hat", 0.18),
  piece(65, "pedal-hat", "Pedal Hat", "hat", 0.3),
  piece(66, "open-hat", "Open Hat", "hat", 1),
  piece(67, "low-tom", "Low Tom", "tom", 0.85, 73.42),
  piece(68, "low-mid-tom", "Low-mid Tom", "tom", 0.85, 87.31),
  piece(69, "mid-tom", "Mid Tom", "tom", 0.85, 103.83),
  piece(70, "high-mid-tom", "High-mid Tom", "tom", 0.85, 123.47),
  piece(71, "high-tom", "High Tom", "tom", 0.85, 146.83),
]);

export const KLINTO_DRUM_PITCH_NAMES = Object.freeze(Object.fromEntries(
  KLINTO_DRUM_PIECES.map(({ name, pitch }) => [pitch, name]),
));
export const KLINTO_DRUMS_PITCH_NAMES = KLINTO_DRUM_PITCH_NAMES;

const PIECE_BY_PITCH = new Map(KLINTO_DRUM_PIECES.map((definition) => (
  [definition.pitch, definition]
)));
const PIECE_BY_ID = new Map(KLINTO_DRUM_PIECES.map((definition) => (
  [definition.id, definition]
)));

function assertFiniteRange(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function disconnect(node) {
  try { node?.disconnect(); } catch {}
}

function setParam(param, value, time) {
  if (typeof param?.setValueAtTime === "function") param.setValueAtTime(value, time);
  else if (param) param.value = value;
}

function exponentialRamp(param, value, time) {
  if (typeof param?.exponentialRampToValueAtTime === "function") {
    param.exponentialRampToValueAtTime(value, time);
  } else if (typeof param?.linearRampToValueAtTime === "function") {
    param.linearRampToValueAtTime(value, time);
  } else setParam(param, value, time);
}

function linearRamp(param, value, time) {
  if (typeof param?.linearRampToValueAtTime === "function") {
    param.linearRampToValueAtTime(value, time);
  } else setParam(param, value, time);
}

function resolveEventPiece(event) {
  if (typeof event?.drumPiece === "string") return PIECE_BY_ID.get(event.drumPiece) ?? null;
  return resolveKlintoDrumPiece(event?.pitch);
}

export function resolveKlintoDrumPiece(pitch) {
  return Number.isInteger(pitch) ? (PIECE_BY_PITCH.get(pitch) ?? null) : null;
}

export function getKlintoDrumsTailSeconds(params) {
  assertFiniteRange(params?.decaySeconds, 0.05, 2, "Drum decay");
  return params.decaySeconds + KLINTO_DRUMS_SOURCE_PADDING_SECONDS;
}

export function adaptKlintoDrumsVoice({ noteDurationSeconds, params, pitch } = {}) {
  const selectedPiece = resolveKlintoDrumPiece(pitch);
  if (!selectedPiece) return null;
  assertFiniteRange(noteDurationSeconds, Number.EPSILON, Number.MAX_VALUE, "Note duration");
  assertFiniteRange(params?.tone, 0, 1, "Drum tone");
  assertFiniteRange(params?.decaySeconds, 0.05, 2, "Drum decay");
  const durationSeconds = Math.max(0.01, params.decaySeconds * selectedPiece.decayScale);
  return Object.freeze({
    drumPiece: selectedPiece.id,
    drumPieceName: selectedPiece.name,
    durationSeconds,
    oneShot: true,
    releaseSeconds: 0,
    tone: params.tone,
    voiceEndOffsetSeconds: durationSeconds + KLINTO_DRUMS_SOURCE_PADDING_SECONDS,
  });
}

/**
 * Deterministic first-party drum synthesis shared by live, offline and public
 * playback. Notes outside the fixed MIDI 60..71 kit map produce no voice.
 */
export function createKlintoDrumsSynthRuntime({ context, getOutputNode } = {}) {
  if (
    !context?.createBuffer
    || !context?.createBufferSource
    || !context?.createGain
    || !context?.createOscillator
    || typeof getOutputNode !== "function"
  ) {
    throw new TypeError("Klinto Drums requires an AudioContext-like object and output-node provider.");
  }
  const activeVoices = new Set();
  const voiceFinalizers = new Map();
  let noiseBuffer = null;
  let disposed = false;

  function getNoiseBuffer() {
    if (noiseBuffer?.sampleRate === context.sampleRate) return noiseBuffer;
    const length = Math.max(1, Math.round(context.sampleRate * NOISE_BUFFER_SECONDS));
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let state = NOISE_SEED;
    for (let index = 0; index < samples.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      samples[index] = (state / 0xffff_ffff) * 2 - 1;
    }
    return noiseBuffer;
  }

  function createNoiseSource(playbackRate) {
    const source = context.createBufferSource();
    source.buffer = getNoiseBuffer();
    source.loop = true;
    if (source.playbackRate) source.playbackRate.value = playbackRate;
    return source;
  }

  function createOscillator(type, startFrequencyHz, targetFrequencyHz, startTime, sweepSeconds) {
    const source = context.createOscillator();
    source.type = type;
    setParam(source.frequency, startFrequencyHz, startTime);
    exponentialRamp(source.frequency, targetFrequencyHz, startTime + sweepSeconds);
    return source;
  }

  function createEnvelope(startTime, durationSeconds, peak) {
    const gain = context.createGain();
    const attackSeconds = Math.min(DRUM_ATTACK_SECONDS, durationSeconds / 4);
    setParam(gain.gain, KLINTO_DRUMS_SILENCE_GAIN, startTime);
    exponentialRamp(gain.gain, Math.max(KLINTO_DRUMS_SILENCE_GAIN, peak), startTime + attackSeconds);
    exponentialRamp(gain.gain, KLINTO_DRUMS_SILENCE_GAIN, startTime + durationSeconds);
    return gain;
  }

  function trigger(event) {
    if (disposed) throw new Error("The Klinto Drums synth runtime has been disposed.");
    const selectedPiece = resolveEventPiece(event);
    if (!selectedPiece) return null;
    const startTime = event.startTime ?? event.startSeconds;
    const durationSeconds = event.durationSeconds;
    const velocity = event.velocity;
    const tone = event.tone;
    assertFiniteRange(startTime, 0, Number.MAX_VALUE, "Drum start time");
    assertFiniteRange(durationSeconds, 0.01, 2, "Drum duration");
    assertFiniteRange(velocity, Number.EPSILON, 1, "Drum velocity");
    assertFiniteRange(tone, 0, 1, "Drum tone");
    const toneScale = 0.75 + 0.75 * tone;
    const sources = [];
    const gains = [];
    const output = getOutputNode(event.trackId);
    if (!output) throw new RangeError(`No Instrument runtime exists for Track ${event.trackId}.`);

    function addComponent(source, componentDuration, peak) {
      const gain = createEnvelope(startTime, componentDuration, velocity * peak);
      source.connect(gain);
      gain.connect(output);
      sources.push(source);
      gains.push(gain);
    }

    if (selectedPiece.family === "kick") {
      const target = selectedPiece.baseFrequencyHz * toneScale;
      const sweepSeconds = Math.min(0.11, durationSeconds / 2);
      addComponent(
        createOscillator("sine", target * 3, target, startTime, sweepSeconds),
        durationSeconds,
        1,
      );
    } else if (selectedPiece.family === "snare") {
      const bodyFrequency = selectedPiece.baseFrequencyHz * toneScale;
      addComponent(createNoiseSource(0.75 + 1.5 * tone), durationSeconds, 0.85);
      addComponent(
        createOscillator(
          "triangle",
          bodyFrequency * 1.15,
          bodyFrequency,
          startTime,
          Math.min(0.04, durationSeconds / 3),
        ),
        Math.max(0.01, durationSeconds * 0.65),
        0.28,
      );
    } else if (selectedPiece.family === "hat") {
      addComponent(createNoiseSource(1 + 2 * tone), durationSeconds, 0.6);
    } else {
      const target = selectedPiece.baseFrequencyHz * toneScale;
      addComponent(
        createOscillator(
          "sine",
          target * 1.5,
          target,
          startTime,
          Math.min(durationSeconds * 0.2, 0.08),
        ),
        durationSeconds,
        0.9,
      );
    }

    let ended = false;
    let remainingSources = sources.length;
    const endedListeners = new Set();
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
      gains: Object.freeze([...gains]),
      retire(time = context.currentTime) {
        if (ended) return false;
        const retireTime = Math.max(context.currentTime ?? 0, time);
        for (const gain of gains) {
          gain.gain.cancelScheduledValues?.(retireTime);
          const held = Number.isFinite(gain.gain.value)
            ? Math.max(KLINTO_DRUMS_SILENCE_GAIN, gain.gain.value)
            : KLINTO_DRUMS_SILENCE_GAIN;
          setParam(gain.gain, held, retireTime);
          linearRamp(
            gain.gain,
            KLINTO_DRUMS_SILENCE_GAIN,
            retireTime + KLINTO_DRUMS_RETIRE_RAMP_SECONDS,
          );
        }
        for (const source of sources) {
          try { source.stop(retireTime + KLINTO_DRUMS_RETIRE_RAMP_SECONDS); } catch {}
        }
        return true;
      },
      sources: Object.freeze([...sources]),
      stop(time = context.currentTime) {
        return voice.retire(time);
      },
    };

    function finish() {
      if (ended) return;
      ended = true;
      activeVoices.delete(voice);
      voiceFinalizers.delete(voice);
      for (const source of sources) disconnect(source);
      for (const gain of gains) disconnect(gain);
      for (const listener of endedListeners) listener();
      endedListeners.clear();
    }

    for (const source of sources) {
      source.addEventListener?.("ended", () => {
        remainingSources -= 1;
        if (remainingSources === 0) finish();
      }, { once: true });
    }
    activeVoices.add(voice);
    voiceFinalizers.set(voice, finish);
    for (const source of sources) {
      source.start(startTime);
      try { source.stop(startTime + durationSeconds + KLINTO_DRUMS_SOURCE_PADDING_SECONDS); } catch {}
    }
    return Object.freeze(voice);
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    for (const voice of [...activeVoices]) {
      voice.retire(context.currentTime ?? 0);
      voiceFinalizers.get(voice)?.();
    }
    activeVoices.clear();
    voiceFinalizers.clear();
    noiseBuffer = null;
    return true;
  }

  return Object.freeze({
    dispose,
    getActiveVoiceCount: () => activeVoices.size,
    trigger,
  });
}

export const klintoDrumsSynthAdapters = Object.freeze({
  live: createKlintoDrumsSynthRuntime,
  offline: createKlintoDrumsSynthRuntime,
  public: createKlintoDrumsSynthRuntime,
});

export const KLINTO_DRUMS_SYNTH_ADAPTERS = klintoDrumsSynthAdapters;
