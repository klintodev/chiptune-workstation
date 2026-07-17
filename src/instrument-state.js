const DEFAULTS = Object.freeze({
  voiceType: "square",
  octaveOffset: 0,
  volume: 0.35,
  attackSeconds: 0.008,
  releaseSeconds: 0.03,
});

const LIMITS = Object.freeze({
  octaveOffset: [-2, 2],
  volume: [0, 1],
  attackSeconds: [0.001, 2],
  releaseSeconds: [0.01, 3],
});

const VOICE_TYPES = new Set(["square", "triangle", "sawtooth", "noise"]);

export function createInstrumentState(initial = {}) {
  const events = new EventTarget();
  let state = { ...DEFAULTS, ...initial };

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", { detail: getState() }));
  }

  function getState() {
    return Object.freeze({ ...state });
  }

  function setValue(key, value) {
    if (key === "voiceType") {
      if (!VOICE_TYPES.has(value)) throw new RangeError(`Unsupported voice type: ${value}`);
    } else {
      const [minimum, maximum] = LIMITS[key] ?? [];
      if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new RangeError(`${key} must be between ${minimum} and ${maximum}.`);
      }
    }
    if (state[key] === value) return;
    state = { ...state, [key]: value };
    emitChange();
  }

  function reset() {
    state = { ...DEFAULTS };
    emitChange();
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    getState,
    removeEventListener: events.removeEventListener.bind(events),
    reset,
    setAttackSeconds: (value) => setValue("attackSeconds", value),
    setOctaveOffset: (value) => setValue("octaveOffset", value),
    setReleaseSeconds: (value) => setValue("releaseSeconds", value),
    setVoiceType: (value) => setValue("voiceType", value),
    setVolume: (value) => setValue("volume", value),
  });
}

export const instrumentDefaults = DEFAULTS;
