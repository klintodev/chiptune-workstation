const VOICE_TYPES = new Set(["square", "triangle", "sawtooth", "noise"]);
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20_000;
const SILENCE = 0.0001;
const VOLUME_RAMP_SECONDS = 0.015;

export function midiNoteToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

export function createVoiceEngine({ getAudioTime, getOutputNode }) {
  const events = new EventTarget();
  const activeVoices = new Map();
  let nextId = 1;
  let noiseBuffer = null;
  let instrumentOutput = null;
  let volume = 0.35;

  function emitChange() {
    events.dispatchEvent(new CustomEvent("voiceschange", { detail: { count: activeVoices.size } }));
  }

  function getInstrumentOutput() {
    if (instrumentOutput) return instrumentOutput;
    const masterOutput = getOutputNode();
    instrumentOutput = masterOutput.context.createGain();
    instrumentOutput.gain.setValueAtTime(volume, masterOutput.context.currentTime);
    instrumentOutput.connect(masterOutput);
    return instrumentOutput;
  }

  function setVolume(nextVolume) {
    if (!Number.isFinite(nextVolume) || nextVolume < 0 || nextVolume > 1) {
      throw new RangeError("Volume must be between 0 and 1.");
    }
    volume = nextVolume;
    if (!instrumentOutput) return;
    const now = instrumentOutput.context.currentTime;
    instrumentOutput.gain.cancelScheduledValues(now);
    instrumentOutput.gain.setValueAtTime(instrumentOutput.gain.value, now);
    instrumentOutput.gain.linearRampToValueAtTime(volume, now + VOLUME_RAMP_SECONDS);
  }

  function createSource(context, type, frequency) {
    if (type !== "noise") {
      const source = context.createOscillator();
      source.type = type;
      source.frequency.value = frequency;
      return source;
    }
    if (noiseBuffer?.sampleRate !== context.sampleRate) {
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    return source;
  }

  function stop(id, requestedTime = getAudioTime()) {
    const voice = activeVoices.get(id);
    if (!voice) return false;
    const stopTime = Math.max(requestedTime, getAudioTime());
    if (voice.stopTime !== null && stopTime >= voice.stopTime) return false;
    voice.stopTime = stopTime;
    const attackProgress = Math.min(
      1,
      Math.max(0, (stopTime - voice.startTime) / voice.attackSeconds),
    );
    const heldGain = SILENCE * (voice.peakGain / SILENCE) ** attackProgress;
    voice.gain.gain.cancelScheduledValues(stopTime);
    voice.gain.gain.setValueAtTime(heldGain, stopTime);
    voice.gain.gain.exponentialRampToValueAtTime(SILENCE, stopTime + voice.releaseSeconds);
    voice.source.stop(stopTime + voice.releaseSeconds + 0.01);
    return true;
  }

  function trigger({
    type = "square",
    frequency = midiNoteToFrequency(60),
    startTime = getAudioTime(),
    duration,
    intensity = 1,
    attackSeconds = 0.008,
    releaseSeconds = 0.03,
  } = {}) {
    if (!VOICE_TYPES.has(type)) throw new RangeError(`Unsupported voice type: ${type}`);
    if (!Number.isFinite(startTime) || startTime < getAudioTime()) throw new RangeError("Start time must use the current or future audio clock.");
    if (type !== "noise" && (!Number.isFinite(frequency) || frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY)) throw new RangeError(`Frequency must be between ${MIN_FREQUENCY} and ${MAX_FREQUENCY} Hz.`);
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) throw new RangeError("Duration must be greater than zero.");
    if (!Number.isFinite(intensity) || intensity <= 0 || intensity > 1) throw new RangeError("Intensity must be greater than zero and no more than one.");
    if (!Number.isFinite(attackSeconds) || attackSeconds < 0.001 || attackSeconds > 2) throw new RangeError("Attack must be between 0.001 and 2 seconds.");
    if (!Number.isFinite(releaseSeconds) || releaseSeconds < 0.01 || releaseSeconds > 3) throw new RangeError("Release must be between 0.01 and 3 seconds.");

    const output = getInstrumentOutput();
    const context = output.context;
    const source = createSource(context, type, frequency);
    const gain = context.createGain();
    const id = nextId++;

    gain.gain.setValueAtTime(SILENCE, startTime);
    gain.gain.exponentialRampToValueAtTime(intensity, startTime + attackSeconds);
    source.connect(gain);
    gain.connect(output);
    activeVoices.set(id, { source, gain, startTime, attackSeconds, releaseSeconds, peakGain: intensity, stopTime: null });
    source.addEventListener("ended", () => {
      source.disconnect();
      gain.disconnect();
      activeVoices.delete(id);
      emitChange();
    }, { once: true });
    source.start(startTime);
    if (duration !== undefined) stop(id, startTime + duration);
    emitChange();
    return Object.freeze({ id, stop: (time) => stop(id, time) });
  }

  function stopAll(time = getAudioTime()) {
    for (const id of activeVoices.keys()) stop(id, time);
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    getActiveVoiceCount: () => activeVoices.size,
    removeEventListener: events.removeEventListener.bind(events),
    setVolume,
    stopAll,
    trigger,
  });
}
