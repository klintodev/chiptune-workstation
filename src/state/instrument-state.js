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

function configsEqual(left, right) {
  return Object.keys(DEFAULTS).every((key) => left[key] === right[key]);
}

export function createInstrumentState(initial = {}, options = {}) {
  const events = new EventTarget();
  const {
    getTrackId = () => options.trackId ?? "track-1",
    projectState = null,
    sessionState = null,
  } = options;
  let localState = projectState ? null : { ...DEFAULTS, ...initial };

  function resolveTrackId() {
    const requested = getTrackId();
    if (!projectState) return requested;
    const tracks = projectState.getState().tracks;
    return tracks.some((track) => track.id === requested) ? requested : tracks[0].id;
  }

  function getState() {
    const state = projectState
      ? projectState.getTrack(resolveTrackId()).instrument
      : localState;
    return Object.freeze({ ...state });
  }

  let previousTrackId = resolveTrackId();
  let previousConfig = getState();

  function emitChange() {
    events.dispatchEvent(new CustomEvent("change", { detail: getState() }));
  }

  function setValue(key, value) {
    validateValue(key, value);
    const state = getState();
    if (state[key] === value) return false;

    if (projectState) {
      const trackId = resolveTrackId();
      projectState.updateTrack(
        trackId,
        (track) => ({ ...track, instrument: { ...track.instrument, [key]: value } }),
        { field: `instrument.${key}` },
      );
    } else {
      localState = { ...localState, [key]: value };
      previousConfig = getState();
      emitChange();
    }
    return true;
  }

  function reset() {
    if (configsEqual(getState(), DEFAULTS)) return false;
    if (projectState) {
      const trackId = resolveTrackId();
      projectState.updateTrack(
        trackId,
        (track) => ({ ...track, instrument: { ...DEFAULTS } }),
        { field: "instrument" },
      );
    } else {
      localState = { ...DEFAULTS };
      previousConfig = getState();
      emitChange();
    }
    return true;
  }

  function syncAndEmit() {
    const trackId = resolveTrackId();
    const config = getState();
    if (trackId === previousTrackId && configsEqual(config, previousConfig)) return false;
    previousTrackId = trackId;
    previousConfig = config;
    emitChange();
    return true;
  }

  function handleProjectChange() {
    syncAndEmit();
  }

  function handleSessionChange(event) {
    if (event.detail.slice === "workspace") syncAndEmit();
  }

  projectState?.addEventListener("change", handleProjectChange);
  sessionState?.addEventListener("change", handleSessionChange);

  function dispose() {
    projectState?.removeEventListener("change", handleProjectChange);
    sessionState?.removeEventListener("change", handleSessionChange);
  }

  return Object.freeze({
    addEventListener: events.addEventListener.bind(events),
    dispose,
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
