import { DEVICE_REGISTRY } from "./device-registry.js";

const RUNTIME_MODES = Object.freeze(["live", "offline", "public"]);

/**
 * Lazily dispatch immutable render events to the first-party synth registered
 * for their exact Instrument type and version.
 */
export function createInstrumentSynthRouter({
  context,
  deviceRegistry = DEVICE_REGISTRY,
  getOutputNode,
  mode = "live",
  random,
  runtimeRegistry,
} = {}) {
  if (typeof getOutputNode !== "function" && !runtimeRegistry?.getTrackInputNode) {
    throw new TypeError("Instrument synthesis requires an output-node provider.");
  }
  const resolveOutput = getOutputNode ?? ((trackId) => runtimeRegistry?.getTrackInputNode?.(trackId));
  if (!context) {
    throw new TypeError("Instrument synthesis requires an audio context.");
  }
  if (!RUNTIME_MODES.includes(mode)) {
    throw new RangeError(`Unsupported Instrument synthesis mode: ${mode}.`);
  }
  if (!deviceRegistry?.instruments?.require) {
    throw new TypeError("Instrument synthesis requires a closed Instrument registry.");
  }
  const runtimes = new Map();
  let disposed = false;

  function runtimeKey(type, version) {
    return `${type}@${version}`;
  }

  function getRuntime(type, version) {
    const key = runtimeKey(type, version);
    let runtime = runtimes.get(key);
    if (runtime) return runtime;
    const definition = deviceRegistry.instruments.require(type, version);
    const factory = definition.synthAdapters?.[mode];
    if (typeof factory !== "function") {
      throw new TypeError(`${definition.name} has no ${mode} synthesis adapter.`);
    }
    runtime = factory({
      context,
      getOutputNode: resolveOutput,
      ...(random ? { random } : {}),
    });
    if (!runtime || typeof runtime.trigger !== "function" || typeof runtime.dispose !== "function") {
      throw new TypeError(`${definition.name} ${mode} synth has an invalid lifecycle.`);
    }
    runtimes.set(key, runtime);
    return runtime;
  }

  function trigger(event) {
    if (disposed) throw new Error("The Instrument synth router has been disposed.");
    if (!event || typeof event !== "object") {
      throw new TypeError("Instrument synthesis requires a render event.");
    }
    const { instrumentType, instrumentVersion } = event;
    if (typeof instrumentType !== "string" || !Number.isInteger(instrumentVersion)) {
      throw new TypeError("Render events require Instrument type and version metadata.");
    }
    const voice = getRuntime(instrumentType, instrumentVersion).trigger(event);
    if (voice === null) return null;
    if (!voice || typeof voice.stop !== "function") {
      throw new TypeError(`${instrumentType} synthesis did not return a cancellable voice.`);
    }
    return voice;
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    for (const runtime of runtimes.values()) runtime.dispose();
    runtimes.clear();
    return true;
  }

  return Object.freeze({
    dispose,
    getActiveRuntimeCount: () => runtimes.size,
    getRuntime: (type, version = 1) => runtimes.get(runtimeKey(type, version)) ?? null,
    trigger,
  });
}

export const createFirstPartyInstrumentSynthRouter = createInstrumentSynthRouter;
