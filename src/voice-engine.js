const VOICE_TYPES = new Set(["square", "triangle", "sawtooth", "noise"]);
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20_000;
const ATTACK_SECONDS = 0.008;
const RELEASE_SECONDS = 0.03;
const SILENCE = 0.0001;

export function midiNoteToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

export function createVoiceEngine({ getAudioTime, getOutputNode }) {
  const events = new EventTarget();
  const activeVoices = new Map();
  let nextId = 1;
  let noiseBuffer = null;

  function emitChange() {
    events.dispatchEvent(new CustomEvent("voiceschange", { detail: { count: activeVoices.size } }));
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
    if (!voice || voice.stopping) return false;

    const stopTime = Math.max(requestedTime, getAudioTime());
    voice.stopping = true;
    if (voice.gain.gain.cancelAndHoldAtTime) voice.gain.gain.cancelAndHoldAtTime(stopTime);
    else {
      voice.gain.gain.cancelScheduledValues(stopTime);
      voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, SILENCE), stopTime);
    }
    voice.gain.gain.exponentialRampToValueAtTime(SILENCE, stopTime + RELEASE_SECONDS);
    voice.source.stop(stopTime + RELEASE_SECONDS + 0.01);
    return true;
  }

  function trigger({ type = "square", frequency = midiNoteToFrequency(60), startTime = getAudioTime(), duration } = {}) {
    if (!VOICE_TYPES.has(type)) throw new RangeError(`Unsupported voice type: ${type}`);
    if (!Number.isFinite(startTime) || startTime < getAudioTime()) throw new RangeError("Start time must use the current or future audio clock.");
    if (type !== "noise" && (!Number.isFinite(frequency) || frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY)) throw new RangeError(`Frequency must be between ${MIN_FREQUENCY} and ${MAX_FREQUENCY} Hz.`);
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) throw new RangeError("Duration must be greater than zero.");

    const output = getOutputNode();
    const context = output.context;
    const source = createSource(context, type, frequency);
    const gain = context.createGain();
    const id = nextId++;

    gain.gain.setValueAtTime(SILENCE, startTime);
    gain.gain.exponentialRampToValueAtTime(1, startTime + ATTACK_SECONDS);
    source.connect(gain);
    gain.connect(output);
    activeVoices.set(id, { source, gain, stopping: false });
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
    stopAll,
    trigger,
  });
}
