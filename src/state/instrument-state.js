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

function validateValue(key, value) {
  if (key === "voiceType") {
    if (!VOICE_TYPES.has(value)) throw new RangeError(`Unsupported voice type: ${value}`);
    return;
  }
  const [minimum, maximum] = LIMITS[key] ?? [];
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${key} must be between ${minimum} and ${maximum}.`);
  }
}

export function createInstrumentState(initial = {}, options = {}) {
  const events = new EventTarget();
  const { projectState = null, trackId = "track-1" } = options;
  let localState = projectState ? null : { ...DEFAULTS, ...initial };
  let previousProjectConfig = projectState ? getState() : null;

  function getState() {
    const state = projectState ? projectState.getTrack(trackId).instrument : localState;
    return Object.freeze({ ...state });
  }

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", { detail: getState() }));
  }

  function setValue(key, value) {
    validateValue(key, value);
    const state = getState();
    if (state[key] === value) return false;

    if (projectState) {
      projectState.updateTrack(
        trackId,
        (track) => ({ ...track, instrument: { ...track.instrument, [key]: value } }),
        { field: `instrument.${key}` },
      );
    } else {
      localState = { ...localState, [key]: value };
    }
    if (!projectState) emitChange();
    return true;
  }

  function reset() {
    if (projectState) {
      projectState.updateTrack(
        trackId,
        (track) => ({ ...track, instrument: { ...DEFAULTS } }),
        { field: "instrument" },
      );
    } else {
      localState = { ...DEFAULTS };
    }
    if (!projectState) emitChange();
    return true;
  }

  function handleProjectChange() {
    const config = getState();
    const changed = Object.keys(config).some((key) => config[key] !== previousProjectConfig[key]);
    if (!changed) return;
    previousProjectConfig = config;
    emitChange();
  }

  projectState?.addEventListener("change", handleProjectChange);

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    dispose: () => projectState?.removeEventListener("change", handleProjectChange),
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
