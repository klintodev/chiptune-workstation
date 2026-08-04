import {
  DELAY_TAIL_FADE_SECONDS,
  MAX_DELAY_TAIL_SECONDS,
  getDelayTimeSeconds,
  getEqualPowerGains,
} from "./effect-tail.js";

export const AUDIO_PARAM_SMOOTHING_SECONDS = 0.015;
export const EFFECT_BYPASS_SECONDS = 0.02;
export const EFFECT_REPLACEMENT_SECONDS = 0.05;

function defaultScheduleTransition(delaySeconds, callback) {
  const timer = setTimeout(callback, delaySeconds * 1000);
  return () => clearTimeout(timer);
}

function scheduleCallback(scheduleTransition, delaySeconds, callback) {
  const cancellation = scheduleTransition(delaySeconds, callback);
  if (typeof cancellation === "function") return cancellation;
  return () => clearTimeout(cancellation);
}

function currentTime(context) {
  return Number.isFinite(context?.currentTime) ? context.currentTime : 0;
}

function setParam(param, value, time) {
  if (!param) throw new TypeError("A Web Audio AudioParam is required.");
  if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, time);
  else param.value = value;
}

export function smoothAudioParam(
  param,
  value,
  context,
  durationSeconds = AUDIO_PARAM_SMOOTHING_SECONDS,
) {
  if (!Number.isFinite(value)) throw new RangeError("AudioParam values must be finite.");
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 0.05) {
    throw new RangeError("AudioParam smoothing must be between 0 and 50 milliseconds.");
  }
  const now = currentTime(context);
  const heldValue = Number.isFinite(param.value) ? param.value : value;
  if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
  else {
    param.cancelScheduledValues?.(now);
    setParam(param, heldValue, now);
  }
  if (durationSeconds === 0 || typeof param.linearRampToValueAtTime !== "function") {
    setParam(param, value, now);
  } else {
    param.linearRampToValueAtTime(value, now + durationSeconds);
  }
}

function initializeParam(param, value, context) {
  setParam(param, value, currentTime(context));
}

function connect(source, destination) {
  if (!source || !destination) throw new TypeError("Audio graph connections require two nodes.");
  source.connect(destination);
  return destination;
}

function disconnect(source, destination) {
  if (!source) return;
  try {
    if (destination === undefined) source.disconnect();
    else source.disconnect(destination);
  } catch {}
}

function createExternalConnector(output) {
  const destinations = new Set();
  return Object.freeze({
    connect(destination) {
      if (destinations.has(destination)) return destination;
      connect(output, destination);
      destinations.add(destination);
      return destination;
    },
    disconnect(destination) {
      if (destination !== undefined) {
        if (!destinations.delete(destination)) return false;
        disconnect(output, destination);
        return true;
      }
      for (const candidate of destinations) disconnect(output, candidate);
      destinations.clear();
      return true;
    },
  });
}

function resolveParams(value, fallback) {
  const params = value?.params ?? value ?? fallback;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new TypeError("Device parameters must be an object.");
  }
  return params;
}

function assertRange(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

export function toWebAudioWaveform(waveform) {
  if (waveform === "saw") return "sawtooth";
  if (["pulse12", "pulse25", "square", "triangle", "noise"].includes(waveform)) {
    return waveform;
  }
  throw new RangeError(`Unsupported Klinto Chip waveform: ${waveform}`);
}

export const adaptWaveformForWebAudio = toWebAudioWaveform;

export function adaptKlintoChipVoiceParameters(params) {
  const state = resolveParams(params);
  return Object.freeze({
    attackSeconds: state.attackSeconds,
    octave: state.octave,
    releaseSeconds: state.releaseSeconds,
    waveform: state.waveform,
    webAudioWaveform: toWebAudioWaveform(state.waveform),
  });
}

/** Stable per-Instrument output. Voice-specific values are captured on demand. */
export function createKlintoChipOutputRuntime({
  context,
  destination,
  instance,
  params,
  scheduleTransition = defaultScheduleTransition,
  smoothingSeconds = AUDIO_PARAM_SMOOTHING_SECONDS,
} = {}) {
  if (!context?.createGain) throw new TypeError("Klinto Chip requires an AudioContext-like object.");
  let state = { ...resolveParams(instance ?? params) };
  assertRange(state.level, 0, 1, "Instrument level");
  const output = context.createGain();
  const external = createExternalConnector(output);
  let disposed = false;
  let retireCancellation = null;
  initializeParam(output.gain, state.level, context);
  if (destination) external.connect(destination);

  function update(next) {
    if (disposed) return false;
    const nextParams = { ...resolveParams(next, state) };
    assertRange(nextParams.level, 0, 1, "Instrument level");
    toWebAudioWaveform(nextParams.waveform);
    const changed = Object.keys(nextParams).some((key) => nextParams[key] !== state[key]);
    if (!changed) return false;
    if (nextParams.level !== state.level) {
      smoothAudioParam(output.gain, nextParams.level, context, smoothingSeconds);
    }
    state = nextParams;
    return true;
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    retireCancellation?.();
    retireCancellation = null;
    external.disconnect();
    disconnect(output);
    return true;
  }

  function retire({ seconds = EFFECT_BYPASS_SECONDS } = {}) {
    if (disposed || retireCancellation) return false;
    smoothAudioParam(output.gain, 0, context, Math.min(EFFECT_BYPASS_SECONDS, seconds));
    retireCancellation = scheduleCallback(scheduleTransition, seconds, dispose);
    return true;
  }

  return Object.freeze({
    connect: external.connect,
    disconnect: external.disconnect,
    dispose,
    get input() { return output; },
    get output() { return output; },
    getState: () => Object.freeze({ ...state }),
    getVoiceParameters: () => adaptKlintoChipVoiceParameters(state),
    retire,
    update,
  });
}

function clampFilterCutoff(context, cutoffHz) {
  const nyquist = context.sampleRate / 2;
  return Math.min(cutoffHz, Math.max(20, nyquist - 1));
}

export function createKlintoFilterRuntime({
  bypassed = false,
  context,
  destination,
  instance,
  params,
  scheduleTransition = defaultScheduleTransition,
  smoothingSeconds = AUDIO_PARAM_SMOOTHING_SECONDS,
} = {}) {
  if (!context?.createGain || !context?.createBiquadFilter) {
    throw new TypeError("Klinto Filter requires Gain and BiquadFilter factories.");
  }
  let state = { ...resolveParams(instance ?? params) };
  let isBypassed = instance?.bypassed ?? bypassed;
  assertRange(state.cutoffHz, 20, 20_000, "Filter cutoff");
  assertRange(state.q, 0.1, 20, "Filter Q");
  const input = context.createGain();
  const filter = context.createBiquadFilter();
  const output = context.createGain();
  const external = createExternalConnector(output);
  const transitionNodes = new Set();
  let transition = null;
  let disposed = false;
  let retireCancellation = null;
  filter.type = "lowpass";
  initializeParam(filter.frequency, clampFilterCutoff(context, state.cutoffHz), context);
  initializeParam(filter.Q, state.q, context);
  initializeParam(input.gain, 1, context);
  initializeParam(output.gain, 1, context);
  if (isBypassed) connect(input, output);
  else {
    connect(input, filter);
    connect(filter, output);
  }
  if (destination) external.connect(destination);

  function clearTransitionNodes() {
    for (const node of transitionNodes) disconnect(node);
    transitionNodes.clear();
  }

  function finishTransition() {
    if (!transition) return;
    const active = transition;
    transition = null;
    active.cancel?.();
    active.complete();
  }

  function setBypassed(nextBypassed) {
    if (typeof nextBypassed !== "boolean") throw new TypeError("Effect bypass must be a boolean.");
    if (disposed) return false;
    finishTransition();
    if (isBypassed === nextBypassed) return false;

    const dryGate = context.createGain();
    const filteredGate = context.createGain();
    transitionNodes.add(dryGate);
    transitionNodes.add(filteredGate);
    if (nextBypassed) {
      disconnect(filter, output);
      connect(filter, filteredGate);
      connect(filteredGate, output);
      connect(input, dryGate);
      connect(dryGate, output);
      initializeParam(filteredGate.gain, 1, context);
      initializeParam(dryGate.gain, 0, context);
      smoothAudioParam(filteredGate.gain, 0, context, EFFECT_BYPASS_SECONDS);
      smoothAudioParam(dryGate.gain, 1, context, EFFECT_BYPASS_SECONDS);
    } else {
      disconnect(input, output);
      connect(input, dryGate);
      connect(dryGate, output);
      connect(input, filter);
      connect(filter, filteredGate);
      connect(filteredGate, output);
      initializeParam(dryGate.gain, 1, context);
      initializeParam(filteredGate.gain, 0, context);
      smoothAudioParam(dryGate.gain, 0, context, EFFECT_BYPASS_SECONDS);
      smoothAudioParam(filteredGate.gain, 1, context, EFFECT_BYPASS_SECONDS);
    }
    isBypassed = nextBypassed;
    const complete = () => {
      disconnect(input, dryGate);
      disconnect(dryGate, output);
      disconnect(filter, filteredGate);
      disconnect(filteredGate, output);
      clearTransitionNodes();
      if (isBypassed) {
        disconnect(input, filter);
        connect(input, output);
      } else {
        disconnect(input, output);
        connect(input, filter);
        connect(filter, output);
      }
    };
    transition = { cancel: null, complete };
    transition.cancel = scheduleCallback(scheduleTransition, EFFECT_BYPASS_SECONDS, () => {
      if (!transition || transition.complete !== complete) return;
      transition = null;
      complete();
    });
    return true;
  }

  function update(next, options = {}) {
    if (disposed) return false;
    const nextParams = { ...resolveParams(next, state) };
    assertRange(nextParams.cutoffHz, 20, 20_000, "Filter cutoff");
    assertRange(nextParams.q, 0.1, 20, "Filter Q");
    let changed = false;
    if (nextParams.cutoffHz !== state.cutoffHz) {
      smoothAudioParam(
        filter.frequency,
        clampFilterCutoff(context, nextParams.cutoffHz),
        context,
        smoothingSeconds,
      );
      changed = true;
    }
    if (nextParams.q !== state.q) {
      smoothAudioParam(filter.Q, nextParams.q, context, smoothingSeconds);
      changed = true;
    }
    state = nextParams;
    const requestedBypass = next?.bypassed ?? options.bypassed;
    if (requestedBypass !== undefined) changed = setBypassed(requestedBypass) || changed;
    return changed;
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    retireCancellation?.();
    transition?.cancel?.();
    transition = null;
    clearTransitionNodes();
    external.disconnect();
    disconnect(input);
    disconnect(filter);
    disconnect(output);
    return true;
  }

  function retire({ seconds = EFFECT_BYPASS_SECONDS } = {}) {
    if (disposed || retireCancellation) return false;
    smoothAudioParam(output.gain, 0, context, Math.min(EFFECT_BYPASS_SECONDS, seconds));
    retireCancellation = scheduleCallback(scheduleTransition, seconds, dispose);
    return true;
  }

  return Object.freeze({
    connect: external.connect,
    disconnect: external.disconnect,
    dispose,
    get filterNode() { return filter; },
    get input() { return input; },
    get output() { return output; },
    getState: () => Object.freeze({ bypassed: isBypassed, params: Object.freeze({ ...state }) }),
    retire,
    setBypassed,
    update,
  });
}

export function createKlintoDelayRuntime({
  bpm = 120,
  bypassed = false,
  context,
  destination,
  instance,
  params,
  scheduleTransition = defaultScheduleTransition,
  smoothingSeconds = AUDIO_PARAM_SMOOTHING_SECONDS,
} = {}) {
  if (!context?.createGain || !context?.createDelay) {
    throw new TypeError("Klinto Delay requires Gain and Delay factories.");
  }
  let state = { ...resolveParams(instance ?? params) };
  let tempo = bpm;
  let isBypassed = instance?.bypassed ?? bypassed;
  const input = context.createGain();
  const dryGain = context.createGain();
  const output = context.createGain();
  const external = createExternalConnector(output);
  const retiringCores = new Map();
  let currentCore = null;
  let disposed = false;
  let retireCancellation = null;
  let tailCancellations = [];
  let lastNonSilentInputEndTime = null;

  assertRange(state.feedback, 0, 0.85, "Delay feedback");
  getEqualPowerGains(state.mix);
  getDelayTimeSeconds(tempo, state.timeDivision);
  initializeParam(input.gain, 1, context);
  initializeParam(output.gain, 1, context);
  initializeParam(dryGain.gain, isBypassed ? 1 : getEqualPowerGains(state.mix).dryGain, context);
  connect(input, dryGain);
  connect(dryGain, output);
  if (destination) external.connect(destination);

  function createCore(initialWetGain) {
    const delay = context.createDelay(MAX_DELAY_TAIL_SECONDS);
    const feedbackGain = context.createGain();
    const wetGain = context.createGain();
    initializeParam(delay.delayTime, getDelayTimeSeconds(tempo, state.timeDivision), context);
    initializeParam(feedbackGain.gain, state.feedback, context);
    initializeParam(wetGain.gain, initialWetGain, context);
    connect(input, delay);
    connect(delay, feedbackGain);
    connect(feedbackGain, delay);
    connect(delay, wetGain);
    connect(wetGain, output);
    return { delay, feedbackGain, wetGain };
  }

  function destroyCore(core) {
    if (!core) return;
    disconnect(input, core.delay);
    disconnect(core.delay);
    disconnect(core.feedbackGain);
    disconnect(core.wetGain);
  }

  function cancelTailLimit({ restoreWet = false } = {}) {
    for (const cancel of tailCancellations) cancel();
    tailCancellations = [];
    if (restoreWet && currentCore && !isBypassed) {
      smoothAudioParam(
        currentCore.wetGain.gain,
        getEqualPowerGains(state.mix).wetGain,
        context,
        DELAY_TAIL_FADE_SECONDS,
      );
    }
  }

  function scheduleTailLimit(inputEndTime) {
    if (!Number.isFinite(inputEndTime) || inputEndTime < 0) {
      throw new RangeError("Delay input end time must be a non-negative finite number.");
    }
    if (disposed || isBypassed || !currentCore) return false;
    const wetTarget = getEqualPowerGains(state.mix).wetGain;
    if (wetTarget === 0) return false;
    const now = currentTime(context);
    const resolvedInputEndTime = Math.max(now, inputEndTime, lastNonSilentInputEndTime ?? 0);
    const fadeEndTime = resolvedInputEndTime + MAX_DELAY_TAIL_SECONDS;
    const fadeStartTime = fadeEndTime - DELAY_TAIL_FADE_SECONDS;
    lastNonSilentInputEndTime = resolvedInputEndTime;
    cancelTailLimit({ restoreWet: true });
    const observedCore = currentCore;
    const wetParam = observedCore.wetGain.gain;
    const heldValue = Number.isFinite(wetParam.value) ? wetParam.value : wetTarget;
    if (typeof wetParam.cancelAndHoldAtTime === "function") wetParam.cancelAndHoldAtTime(now);
    else {
      wetParam.cancelScheduledValues?.(now);
      setParam(wetParam, heldValue, now);
    }
    const restoreEndTime = Math.min(fadeStartTime, now + DELAY_TAIL_FADE_SECONDS);
    if (restoreEndTime > now && typeof wetParam.linearRampToValueAtTime === "function") {
      wetParam.linearRampToValueAtTime(wetTarget, restoreEndTime);
    } else setParam(wetParam, wetTarget, now);
    setParam(wetParam, wetTarget, fadeStartTime);
    if (typeof wetParam.linearRampToValueAtTime === "function") {
      wetParam.linearRampToValueAtTime(0, fadeEndTime);
    } else setParam(wetParam, 0, fadeEndTime);
    const finish = scheduleCallback(
      scheduleTransition,
      Math.max(0, fadeEndTime - now),
      () => {
        if (disposed || currentCore !== observedCore) return;
        currentCore = null;
        destroyCore(observedCore);
        lastNonSilentInputEndTime = null;
        if (!isBypassed && getEqualPowerGains(state.mix).wetGain > 0) {
          currentCore = createCore(getEqualPowerGains(state.mix).wetGain);
        }
        tailCancellations = [];
      },
    );
    tailCancellations.push(finish);
    return true;
  }

  function retireCore(core, seconds) {
    if (!core || retiringCores.has(core)) return;
    const cancel = scheduleCallback(scheduleTransition, seconds, () => {
      retiringCores.delete(core);
      destroyCore(core);
    });
    retiringCores.set(core, cancel);
  }

  function replaceCore(seconds = EFFECT_REPLACEMENT_SECONDS) {
    if (disposed || isBypassed) return false;
    const gains = getEqualPowerGains(state.mix);
    if (gains.wetGain === 0) return false;
    const oldCore = currentCore;
    const nextCore = createCore(0);
    currentCore = nextCore;
    smoothAudioParam(nextCore.wetGain.gain, gains.wetGain, context, seconds);
    if (oldCore) {
      smoothAudioParam(oldCore.wetGain.gain, 0, context, seconds);
      retireCore(oldCore, seconds);
    }
    return true;
  }

  if (!isBypassed && getEqualPowerGains(state.mix).wetGain > 0) {
    currentCore = createCore(getEqualPowerGains(state.mix).wetGain);
  }

  function setBypassed(nextBypassed) {
    if (typeof nextBypassed !== "boolean") throw new TypeError("Effect bypass must be a boolean.");
    if (disposed || isBypassed === nextBypassed) return false;
    cancelTailLimit();
    isBypassed = nextBypassed;
    if (isBypassed) {
      lastNonSilentInputEndTime = null;
      smoothAudioParam(dryGain.gain, 1, context, EFFECT_BYPASS_SECONDS);
      if (currentCore) {
        const oldCore = currentCore;
        currentCore = null;
        smoothAudioParam(oldCore.wetGain.gain, 0, context, EFFECT_BYPASS_SECONDS);
        retireCore(oldCore, EFFECT_BYPASS_SECONDS);
      }
    } else {
      const gains = getEqualPowerGains(state.mix);
      smoothAudioParam(dryGain.gain, gains.dryGain, context, EFFECT_BYPASS_SECONDS);
      if (gains.wetGain > 0) replaceCore(EFFECT_BYPASS_SECONDS);
    }
    return true;
  }

  function update(next, options = {}) {
    if (disposed) return false;
    const nextParams = { ...resolveParams(next, state) };
    const nextTempo = options.bpm ?? next?.bpm ?? tempo;
    assertRange(nextParams.feedback, 0, 0.85, "Delay feedback");
    const gains = getEqualPowerGains(nextParams.mix);
    getDelayTimeSeconds(nextTempo, nextParams.timeDivision);
    const timeChanged = nextTempo !== tempo || nextParams.timeDivision !== state.timeDivision;
    const mixChanged = nextParams.mix !== state.mix;
    const feedbackChanged = nextParams.feedback !== state.feedback;
    const paramsChanged = timeChanged || mixChanged || feedbackChanged;
    state = nextParams;
    tempo = nextTempo;

    const requestedBypass = next?.bypassed ?? options.bypassed;
    let changed = paramsChanged;
    if (requestedBypass !== undefined && requestedBypass !== isBypassed) {
      changed = setBypassed(requestedBypass) || changed;
    }
    if (isBypassed) return changed;

    if (mixChanged) smoothAudioParam(dryGain.gain, gains.dryGain, context, smoothingSeconds);
    if (gains.wetGain === 0) {
      if (currentCore) {
        const oldCore = currentCore;
        currentCore = null;
        smoothAudioParam(oldCore.wetGain.gain, 0, context, EFFECT_BYPASS_SECONDS);
        retireCore(oldCore, EFFECT_BYPASS_SECONDS);
      }
      cancelTailLimit();
      lastNonSilentInputEndTime = null;
      return changed;
    }
    if (timeChanged) {
      cancelTailLimit();
      replaceCore(EFFECT_REPLACEMENT_SECONDS);
      if (lastNonSilentInputEndTime !== null) scheduleTailLimit(lastNonSilentInputEndTime);
      return changed;
    }
    if (!currentCore) replaceCore(EFFECT_BYPASS_SECONDS);
    else {
      if (feedbackChanged) {
        smoothAudioParam(currentCore.feedbackGain.gain, state.feedback, context, smoothingSeconds);
      }
      if (mixChanged) {
        smoothAudioParam(currentCore.wetGain.gain, gains.wetGain, context, smoothingSeconds);
      }
    }
    if (lastNonSilentInputEndTime !== null) scheduleTailLimit(lastNonSilentInputEndTime);
    return changed;
  }

  /** Clear only this Delay's buffer while retaining the runtime identity. */
  function resetBufferedState({ seconds = EFFECT_REPLACEMENT_SECONDS } = {}) {
    if (disposed || isBypassed || !currentCore) return false;
    cancelTailLimit();
    const replaced = replaceCore(Math.min(EFFECT_REPLACEMENT_SECONDS, seconds));
    if (replaced && lastNonSilentInputEndTime !== null) {
      scheduleTailLimit(lastNonSilentInputEndTime);
    }
    return replaced;
  }

  /**
   * Called by the occurrence scheduler when this Effect receives non-silent
   * input. The cap starts at the actual end of Instrument output, rather than
   * at look-ahead submission time, and AudioParam automation also works in an
   * OfflineAudioContext where wall-clock callbacks deliberately do not run.
   */
  function markNonSilentInput(inputEndTime = currentTime(context)) {
    if (disposed || isBypassed || !currentCore || getEqualPowerGains(state.mix).wetGain === 0) {
      return false;
    }
    return scheduleTailLimit(inputEndTime);
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    retireCancellation?.();
    retireCancellation = null;
    cancelTailLimit();
    lastNonSilentInputEndTime = null;
    if (currentCore) destroyCore(currentCore);
    currentCore = null;
    for (const [core, cancel] of retiringCores) {
      cancel();
      destroyCore(core);
    }
    retiringCores.clear();
    external.disconnect();
    disconnect(input);
    disconnect(dryGain);
    disconnect(output);
    return true;
  }

  function retire({ seconds = EFFECT_BYPASS_SECONDS } = {}) {
    if (disposed || retireCancellation) return false;
    smoothAudioParam(output.gain, 0, context, Math.min(EFFECT_BYPASS_SECONDS, seconds));
    retireCancellation = scheduleCallback(scheduleTransition, seconds, dispose);
    return true;
  }

  return Object.freeze({
    connect: external.connect,
    disconnect: external.disconnect,
    dispose,
    get delayNode() { return currentCore?.delay ?? null; },
    get dryGainNode() { return dryGain; },
    get feedbackGainNode() { return currentCore?.feedbackGain ?? null; },
    get input() { return input; },
    get output() { return output; },
    get wetGainNode() { return currentCore?.wetGain ?? null; },
    getState: () => Object.freeze({
      bpm: tempo,
      bypassed: isBypassed,
      params: Object.freeze({ ...state }),
    }),
    markNonSilentInput,
    resetBufferedState,
    retire,
    setBypassed,
    update,
  });
}

export const createKlintoChipRuntime = createKlintoChipOutputRuntime;
export const createKlintoFilterProcessor = createKlintoFilterRuntime;
export const createKlintoDelayProcessor = createKlintoDelayRuntime;
