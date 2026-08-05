import { DEVICE_REGISTRY } from "./device-registry.js";
import { getEffectTailSeconds } from "./effect-tail.js";
import { AUDIO_PARAM_SMOOTHING_SECONDS, EFFECT_REPLACEMENT_SECONDS, smoothAudioParam } from "./web-audio-runtime.js";
import { describeProjectAudioRoute, selectAudibleTrackIds } from "./route-descriptor.js";

function setInitial(param, value, context) {
  if (!param) return;
  if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, context.currentTime ?? 0);
  else param.value = value;
}

function safeDisconnect(source, destination) {
  if (!source) return;
  try {
    if (destination === undefined) source.disconnect();
    else source.disconnect(destination);
  } catch {}
}

function createMeter(context) {
  const meter = context.createAnalyser?.() ?? context.createGain();
  if ("fftSize" in meter) meter.fftSize = 256;
  if ("smoothingTimeConstant" in meter) meter.smoothingTimeConstant = 0.68;
  return meter;
}

function assertMixerScalar(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function createRouteSignature(normalized) {
  const tracks = normalized.tracks.map(({ effects, instrument, track }) => ([
    track.id,
    [instrument.instanceId, instrument.type, instrument.version],
    effects.map(({ instanceId, type, version }) => [instanceId, type, version]),
  ])).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({
    master: normalized.masterEffects.map(({ instanceId, type, version }) => [instanceId, type, version]),
    tracks,
  });
}

/**
 * Owns one stable runtime per serialized device instance. Construction is lazy:
 * no node is created until the first successful `sync(project)` call.
 */
export function createDeviceRuntimeRegistry({
  context,
  destination = context?.destination,
  deviceRegistry = DEVICE_REGISTRY,
  onRuntimeCreated = () => {},
  scheduleTransition,
  smoothingSeconds = AUDIO_PARAM_SMOOTHING_SECONDS,
} = {}) {
  if (!context?.createGain) throw new TypeError("An AudioContext-like object is required.");
  const activeInputsByTrack = new Map();
  const instrumentRuntimes = new Map();
  const effectRuntimes = new Map();
  const trackRuntimes = new Map();
  let masterRuntime = null;
  let routeEdges = [];
  let disposed = false;
  let lastProject = null;
  let routeSignature = null;
  let routeTransitionCancellation = null;
  let targetMasterVolume = 1;
  const routeTransitionSeconds = EFFECT_REPLACEMENT_SECONDS / 2;

  function resolveDestination() {
    const node = typeof destination === "function" ? destination() : destination;
    if (!node) throw new TypeError("An audio output destination is required.");
    return node;
  }

  function preflight(project) {
    if (!project || !Array.isArray(project.tracks) || !project.mixer?.master) {
      throw new TypeError("A normalized V2 Project is required.");
    }
    assertMixerScalar(project.mixer.master.volume, 0, 1, "Master volume");
    const usedInstanceIds = new Set();
    const tracks = project.tracks.map((track) => {
      assertMixerScalar(track.mixer?.volume, 0, 1, `Track ${track.id} volume`);
      assertMixerScalar(track.mixer?.pan, -1, 1, `Track ${track.id} pan`);
      if (typeof track.mixer?.muted !== "boolean" || typeof track.mixer?.solo !== "boolean") {
        throw new TypeError(`Track ${track.id} mute and solo values must be booleans.`);
      }
      const instrument = deviceRegistry.instruments.normalize(track.instrument, { usedInstanceIds });
      const effects = (track.mixer.effects ?? []).map((effect) => (
        deviceRegistry.effects.normalize(effect, { usedInstanceIds })
      ));
      return { effects, instrument, track };
    });
    const masterEffects = (project.mixer.master.effects ?? []).map((effect) => (
      deviceRegistry.effects.normalize(effect, { usedInstanceIds })
    ));
    return { masterEffects, tracks };
  }

  function notifyCreated(kind, instance, runtime, ownerId) {
    onRuntimeCreated(Object.freeze({
      instanceId: instance.instanceId,
      kind,
      ownerId,
      runtime,
      type: instance.type,
    }));
  }

  function ensureInstrument(instance, trackId) {
    const existing = instrumentRuntimes.get(instance.instanceId);
    if (existing) {
      if (existing.type !== instance.type || existing.version !== instance.version) {
        if (!existing.runtime.retire?.({ seconds: EFFECT_REPLACEMENT_SECONDS })) {
          existing.runtime.dispose();
        }
        instrumentRuntimes.delete(instance.instanceId);
      } else {
        existing.ownerId = trackId;
        existing.runtime.update(instance);
        return existing.runtime;
      }
    }
    const definition = deviceRegistry.instruments.require(instance.type, instance.version);
    const runtime = definition.runtimeAdapters.live({
      context,
      instance,
      ...(scheduleTransition ? { scheduleTransition } : {}),
      smoothingSeconds,
    });
    instrumentRuntimes.set(instance.instanceId, {
      ownerId: trackId,
      runtime,
      type: instance.type,
      version: instance.version,
    });
    notifyCreated("instrument", instance, runtime, trackId);
    return runtime;
  }

  function ensureEffect(instance, ownerId, slot, bpm) {
    const existing = effectRuntimes.get(instance.instanceId);
    if (existing) {
      if (existing.type !== instance.type || existing.version !== instance.version) {
        if (!existing.runtime.retire?.({ seconds: EFFECT_REPLACEMENT_SECONDS })) {
          existing.runtime.dispose();
        }
        effectRuntimes.delete(instance.instanceId);
      } else {
        const routingChanged = existing.ownerId !== ownerId || existing.slot !== slot;
        existing.runtime.update(instance, { bpm });
        if (routingChanged) existing.runtime.resetBufferedState?.({
          seconds: EFFECT_REPLACEMENT_SECONDS,
        });
        existing.ownerId = ownerId;
        existing.slot = slot;
        return existing.runtime;
      }
    }
    const definition = deviceRegistry.effects.require(instance.type, instance.version);
    const runtime = definition.runtimeAdapters.live({
      bpm,
      context,
      instance,
      ...(scheduleTransition ? { scheduleTransition } : {}),
      smoothingSeconds,
    });
    effectRuntimes.set(instance.instanceId, {
      ownerId,
      runtime,
      slot,
      type: instance.type,
      version: instance.version,
    });
    notifyCreated("effect", instance, runtime, ownerId);
    return runtime;
  }

  function createTrackNodes(track) {
    const channelGain = context.createGain();
    const panner = context.createStereoPanner?.() ?? context.createGain();
    const meter = createMeter(context);
    setInitial(channelGain.gain, track.mixer.volume, context);
    if (panner.pan) setInitial(panner.pan, track.mixer.pan, context);
    return { channelGain, instrumentInstanceId: null, meter, panner };
  }

  function ensureMasterNodes(volume) {
    if (masterRuntime) return masterRuntime;
    const bus = context.createGain();
    const volumeNode = context.createGain();
    const meter = createMeter(context);
    setInitial(bus.gain, 1, context);
    setInitial(volumeNode.gain, volume, context);
    masterRuntime = { bus, meter, volumeNode };
    return masterRuntime;
  }

  function clearRouteEdges() {
    for (const [source, target] of routeEdges) safeDisconnect(source, target);
    routeEdges = [];
  }

  function addRouteEdge(source, target) {
    source.connect(target);
    routeEdges.push([source, target]);
  }

  function connectRouteTopology(routeRecords, masterEffectRuntimes, master) {
    clearRouteEdges();
    for (const record of routeRecords) {
      let source = record.instrumentRuntime.output;
      for (const effectRuntime of record.effectRuntimeList) {
        addRouteEdge(source, effectRuntime.input);
        source = effectRuntime.output;
      }
      addRouteEdge(source, record.trackRuntime.channelGain);
      addRouteEdge(record.trackRuntime.channelGain, record.trackRuntime.panner);
      addRouteEdge(record.trackRuntime.panner, record.trackRuntime.meter);
      addRouteEdge(record.trackRuntime.meter, master.bus);
    }
    let masterSource = master.bus;
    for (const effectRuntime of masterEffectRuntimes) {
      addRouteEdge(masterSource, effectRuntime.input);
      masterSource = effectRuntime.output;
    }
    addRouteEdge(masterSource, master.volumeNode);
    addRouteEdge(master.volumeNode, master.meter);
    addRouteEdge(master.meter, resolveDestination());
  }

  function removeInactiveTracks(activeTrackIds) {
    for (const [trackId, runtime] of trackRuntimes) {
      if (activeTrackIds.has(trackId)) continue;
      safeDisconnect(runtime.channelGain);
      safeDisconnect(runtime.panner);
      safeDisconnect(runtime.meter);
      trackRuntimes.delete(trackId);
    }
  }

  function scheduleRouteTransition(callback) {
    const scheduler = scheduleTransition ?? ((seconds, run) => {
      const timer = setTimeout(run, seconds * 1000);
      return () => clearTimeout(timer);
    });
    const cancellation = scheduler(routeTransitionSeconds, callback);
    if (typeof cancellation === "function") return cancellation;
    return () => clearTimeout(cancellation);
  }

  function retireMissingDevices(activeInstrumentIds, activeEffectIds) {
    for (const [instanceId, record] of instrumentRuntimes) {
      if (activeInstrumentIds.has(instanceId)) continue;
      if (!record.runtime.retire?.({ seconds: EFFECT_REPLACEMENT_SECONDS })) {
        record.runtime.dispose();
      }
      instrumentRuntimes.delete(instanceId);
    }
    for (const [instanceId, record] of effectRuntimes) {
      if (activeEffectIds.has(instanceId)) continue;
      if (!record.runtime.retire?.({ seconds: EFFECT_REPLACEMENT_SECONDS })) {
        record.runtime.dispose();
      }
      effectRuntimes.delete(instanceId);
    }
  }

  function routeInputId(trackId, inputId) {
    return JSON.stringify([trackId, inputId]);
  }

  function addEffectTail(inputs, effect, project) {
    const tailSeconds = getEffectTailSeconds(effect, project.transport.bpm);
    if (tailSeconds === 0) return inputs;
    return inputs.map((input) => ({
      ...input,
      inputEndTime: input.inputEndTime + tailSeconds,
    }));
  }

  /** Seed every current route from exact held ownership after graph mutation. */
  function reconcileActiveInputRoutes(project) {
    const validTrackIds = new Set(project.tracks.map(({ id }) => id));
    for (const trackId of activeInputsByTrack.keys()) {
      if (!validTrackIds.has(trackId)) activeInputsByTrack.delete(trackId);
    }

    const masterInputs = [];
    for (const track of project.tracks) {
      let routedInputs = [...(activeInputsByTrack.get(track.id)?.values() ?? [])]
        .map((input) => ({
          inputEndTime: input.inputEndTime,
          inputId: routeInputId(track.id, input.inputId),
        }));
      for (const effect of track.mixer.effects) {
        effectRuntimes.get(effect.instanceId)?.runtime
          .reconcileNonSilentInputs?.(routedInputs);
        routedInputs = addEffectTail(routedInputs, effect, project);
      }
      masterInputs.push(...routedInputs);
    }

    let routedMasterInputs = masterInputs;
    for (const effect of project.mixer.master.effects) {
      effectRuntimes.get(effect.instanceId)?.runtime
        .reconcileNonSilentInputs?.(routedMasterInputs);
      routedMasterInputs = addEffectTail(routedMasterInputs, effect, project);
    }
  }

  function sync(project) {
    if (disposed) throw new Error("The audio runtime registry has been disposed.");
    const normalized = preflight(project);
    const audibleTrackIds = new Set(selectAudibleTrackIds(project.tracks));
    const activeTrackIds = new Set();
    const activeInstrumentIds = new Set();
    const activeEffectIds = new Set();
    const routeRecords = [];
    const master = ensureMasterNodes(project.mixer.master.volume);

    targetMasterVolume = project.mixer.master.volume;
    for (const record of normalized.tracks) {
      const { effects, instrument, track } = record;
      activeTrackIds.add(track.id);
      activeInstrumentIds.add(instrument.instanceId);
      let trackRuntime = trackRuntimes.get(track.id);
      if (!trackRuntime) {
        trackRuntime = createTrackNodes(track);
        trackRuntimes.set(track.id, trackRuntime);
      }
      const targetGain = audibleTrackIds.has(track.id) ? track.mixer.volume : 0;
      smoothAudioParam(trackRuntime.channelGain.gain, targetGain, context, smoothingSeconds);
      if (trackRuntime.panner.pan) {
        smoothAudioParam(trackRuntime.panner.pan, track.mixer.pan, context, smoothingSeconds);
      }
      const instrumentRuntime = ensureInstrument(instrument, track.id);
      trackRuntime.instrumentInstanceId = instrument.instanceId;
      const effectRuntimeList = effects.map((effect, slot) => {
        activeEffectIds.add(effect.instanceId);
        return ensureEffect(effect, track.id, slot, project.transport.bpm);
      });
      routeRecords.push({ effectRuntimeList, instrumentRuntime, track, trackRuntime });
    }

    const masterEffectRuntimes = normalized.masterEffects.map((effect, slot) => {
      activeEffectIds.add(effect.instanceId);
      return ensureEffect(effect, "master", slot, project.transport.bpm);
    });

    const nextRouteSignature = createRouteSignature(normalized);
    if (routeSignature === null) {
      connectRouteTopology(routeRecords, masterEffectRuntimes, master);
      routeSignature = nextRouteSignature;
      smoothAudioParam(master.volumeNode.gain, targetMasterVolume, context, smoothingSeconds);
    } else if (routeSignature !== nextRouteSignature) {
      routeTransitionCancellation?.();
      routeTransitionCancellation = null;
      smoothAudioParam(master.volumeNode.gain, 0, context, routeTransitionSeconds);
      retireMissingDevices(activeInstrumentIds, activeEffectIds);
      routeSignature = nextRouteSignature;
      let completedSynchronously = false;
      const cancellation = scheduleRouteTransition(() => {
        completedSynchronously = true;
        if (disposed || routeSignature !== nextRouteSignature) return;
        connectRouteTopology(routeRecords, masterEffectRuntimes, master);
        removeInactiveTracks(activeTrackIds);
        smoothAudioParam(
          master.volumeNode.gain,
          targetMasterVolume,
          context,
          routeTransitionSeconds,
        );
        routeTransitionCancellation = null;
      });
      routeTransitionCancellation = completedSynchronously ? null : cancellation;
    } else {
      smoothAudioParam(master.volumeNode.gain, targetMasterVolume, context, smoothingSeconds);
    }
    lastProject = project;
    reconcileActiveInputRoutes(project);
    return describeProjectAudioRoute(project);
  }

  function getInstrumentRuntime(instanceId) {
    return instrumentRuntimes.get(instanceId)?.runtime ?? null;
  }

  function getEffectRuntime(instanceId) {
    return effectRuntimes.get(instanceId)?.runtime ?? null;
  }

  function getTrackRuntime(trackId) {
    const runtime = trackRuntimes.get(trackId);
    if (!runtime) return null;
    return Object.freeze({
      channelGain: runtime.channelGain,
      instrument: getInstrumentRuntime(runtime.instrumentInstanceId),
      meter: runtime.meter,
      panner: runtime.panner,
    });
  }

  function markTrackInput(trackId, inputEndTime, inputLifecycle) {
    if (!lastProject) return false;
    const track = lastProject.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new RangeError(`Unknown Track: ${trackId}`);
    let routedLifecycle;
    if (inputLifecycle?.phase !== undefined) {
      if (!["start", "active", "end"].includes(inputLifecycle.phase)) {
        throw new RangeError(`Unknown routed input lifecycle phase: ${inputLifecycle.phase}.`);
      }
      if (typeof inputLifecycle.inputId !== "string" || inputLifecycle.inputId.length === 0) {
        throw new TypeError("Routed input lifecycle requires a non-empty inputId.");
      }
      const inputId = routeInputId(trackId, inputLifecycle.inputId);
      routedLifecycle = Object.freeze({
        inputId,
        phase: inputLifecycle.phase,
      });
    }
    let activeTrackInputs;
    let ownershipChanged = false;
    if (routedLifecycle) {
      if (!Number.isFinite(inputEndTime) || inputEndTime < 0) {
        throw new RangeError("Routed input end time must be a non-negative finite number.");
      }
      activeTrackInputs = activeInputsByTrack.get(trackId);
      if (inputLifecycle.phase === "start" || inputLifecycle.phase === "active") {
        if (!activeTrackInputs) {
          activeTrackInputs = new Map();
          activeInputsByTrack.set(trackId, activeTrackInputs);
        }
        ownershipChanged = !activeTrackInputs.has(inputLifecycle.inputId);
        activeTrackInputs.set(inputLifecycle.inputId, {
          inputEndTime,
          inputId: inputLifecycle.inputId,
        });
      } else {
        ownershipChanged = activeTrackInputs?.has(inputLifecycle.inputId) === true;
        if (!ownershipChanged) return false;
      }
    }
    let marked = false;
    let routedInputEndTime = inputEndTime;
    for (const effect of track.mixer.effects) {
      marked = effectRuntimes.get(effect.instanceId)?.runtime
        .markNonSilentInput?.(routedInputEndTime, routedLifecycle) || marked;
      if (Number.isFinite(routedInputEndTime)) {
        routedInputEndTime += getEffectTailSeconds(effect, lastProject.transport.bpm);
      }
    }
    for (const effect of lastProject.mixer.master.effects) {
      marked = effectRuntimes.get(effect.instanceId)?.runtime
        .markNonSilentInput?.(routedInputEndTime, routedLifecycle) || marked;
      if (Number.isFinite(routedInputEndTime)) {
        routedInputEndTime += getEffectTailSeconds(effect, lastProject.transport.bpm);
      }
    }
    if (inputLifecycle?.phase === "end") {
      activeTrackInputs.delete(inputLifecycle.inputId);
      if (activeTrackInputs.size === 0) activeInputsByTrack.delete(trackId);
    }
    return marked || ownershipChanged;
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    routeTransitionCancellation?.();
    routeTransitionCancellation = null;
    clearRouteEdges();
    for (const record of instrumentRuntimes.values()) record.runtime.dispose();
    for (const record of effectRuntimes.values()) record.runtime.dispose();
    instrumentRuntimes.clear();
    effectRuntimes.clear();
    activeInputsByTrack.clear();
    for (const runtime of trackRuntimes.values()) {
      safeDisconnect(runtime.channelGain);
      safeDisconnect(runtime.panner);
      safeDisconnect(runtime.meter);
    }
    trackRuntimes.clear();
    if (masterRuntime) {
      safeDisconnect(masterRuntime.bus);
      safeDisconnect(masterRuntime.volumeNode);
      safeDisconnect(masterRuntime.meter);
      masterRuntime = null;
    }
    lastProject = null;
    routeSignature = null;
    return true;
  }

  return Object.freeze({
    dispose,
    getEffectRuntime,
    getInstrumentRuntime,
    getMasterRuntime: () => masterRuntime,
    getStats: () => Object.freeze({
      effectCount: effectRuntimes.size,
      instrumentCount: instrumentRuntimes.size,
      masterCreated: masterRuntime !== null,
      routeEdgeCount: routeEdges.length,
      trackCount: trackRuntimes.size,
    }),
    getTrackInputNode: (trackId) => getTrackRuntime(trackId)?.instrument?.input ?? null,
    getTrackRuntime,
    markTrackInput,
    sync,
  });
}

export const createProjectAudioRuntimeRegistry = createDeviceRuntimeRegistry;
