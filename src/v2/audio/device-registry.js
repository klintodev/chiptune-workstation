import {
  KLINTO_CHIP_CONTRACT,
  KLINTO_DELAY_CONTRACT,
  KLINTO_FILTER_CONTRACT,
  createDefaultEffectInstance,
  createDefaultInstrumentInstance,
  normalizeEffectInstance,
  normalizeInstrumentInstance,
} from "../domain/device-contracts.js";
import {
  adaptKlintoChipVoiceParameters,
  createKlintoChipOutputRuntime,
  createKlintoDelayRuntime,
  createKlintoFilterRuntime,
} from "./web-audio-runtime.js";
import { getDelayTimeSeconds, getEqualPowerGains } from "./effect-tail.js";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function createDefinition({
  adaptParameters = (params) => Object.freeze({ ...params }),
  contract,
  createDefault,
  createRuntime,
  kind,
  name,
  normalize,
  sections,
  uiParameters,
}) {
  const runtimeAdapters = Object.freeze({
    live: createRuntime,
    offline: createRuntime,
    public: createRuntime,
  });
  const parameterKeys = Object.keys(uiParameters);
  if (
    parameterKeys.length !== contract.paramKeys.length
    || contract.paramKeys.some((key) => !Object.hasOwn(uiParameters, key))
  ) {
    throw new TypeError(`${name} UI metadata must describe every parameter exactly once.`);
  }
  let definition;
  definition = {
    adaptParameters,
    contract,
    createDefault,
    createUI(options = {}) {
      if (typeof options.createEditor !== "function") {
        throw new TypeError(`${name} requires a registered device editor host.`);
      }
      const editor = options.createEditor({ ...options, definition });
      if (!editor || typeof editor.dispose !== "function") {
        throw new TypeError(`${name} UI factory must return an idempotently disposable editor.`);
      }
      return editor;
    },
    createRuntime,
    defaults: contract.defaults,
    disposeRuntime(runtime) {
      if (!runtime || typeof runtime.dispose !== "function") {
        throw new TypeError(`${name} runtime does not implement disposal.`);
      }
      return runtime.dispose();
    },
    disposeUI(editor) {
      if (!editor || typeof editor.dispose !== "function") {
        throw new TypeError(`${name} editor does not implement disposal.`);
      }
      return editor.dispose();
    },
    kind,
    migrate(instance, options) {
      return normalize(instance, options);
    },
    name,
    normalize,
    parameters: contract.parameters,
    paramKeys: contract.paramKeys,
    runtimeAdapters,
    type: contract.type,
    ui: {
      name,
      parameters: uiParameters,
      sections,
    },
    version: contract.version,
  };
  return deepFreeze(definition);
}

export const KLINTO_CHIP_DEFINITION = createDefinition({
  adaptParameters: adaptKlintoChipVoiceParameters,
  contract: KLINTO_CHIP_CONTRACT,
  createDefault: (instanceId) => createDefaultInstrumentInstance(instanceId),
  createRuntime: createKlintoChipOutputRuntime,
  kind: "instrument",
  name: "Klinto Chip",
  normalize: normalizeInstrumentInstance,
  sections: [
    { id: "oscillator", label: "Oscillator", params: ["waveform", "octave"] },
    { id: "envelope", label: "Envelope", params: ["attackSeconds", "releaseSeconds"] },
    { id: "output", label: "Output", params: ["level"] },
  ],
  uiParameters: {
    waveform: {
      label: "Waveform",
      options: [
        ["pulse12", "Pulse 12.5%"],
        ["pulse25", "Pulse 25%"],
        ["square", "Square"],
        ["triangle", "Triangle"],
        ["saw", "Saw"],
        ["noise", "Noise"],
      ],
      type: "select",
    },
    octave: {
      label: "Octave",
      step: 1,
      valueText: (value) => `${value > 0 ? "+" : ""}${value} octave${Math.abs(value) === 1 ? "" : "s"}`,
    },
    attackSeconds: {
      label: "Attack",
      step: 0.001,
      valueText: (value) => value < 1 ? `${Math.round(value * 1000)} milliseconds` : `${value} seconds`,
    },
    releaseSeconds: {
      label: "Release",
      step: 0.01,
      valueText: (value) => value < 1 ? `${Math.round(value * 1000)} milliseconds` : `${value} seconds`,
    },
    level: {
      label: "Instrument output",
      step: 0.01,
      valueText: (value) => `${Math.round(value * 100)}%`,
    },
  },
});

export const KLINTO_FILTER_DEFINITION = createDefinition({
  contract: KLINTO_FILTER_CONTRACT,
  createDefault: (instanceId) => createDefaultEffectInstance("klinto-filter", instanceId),
  createRuntime: createKlintoFilterRuntime,
  kind: "effect",
  name: "Klinto Filter",
  normalize: normalizeEffectInstance,
  sections: [
    { id: "filter", label: "Filter", params: ["cutoffHz", "q"] },
  ],
  uiParameters: {
    cutoffHz: {
      label: "Cutoff frequency",
      step: 1,
      valueText: (value) => `${Math.round(value)} hertz`,
    },
    q: {
      label: "Resonance Q",
      step: 0.1,
      valueText: (value) => Number(value).toFixed(1),
    },
  },
});

export const KLINTO_DELAY_DEFINITION = createDefinition({
  adaptParameters(params, { bpm = 120 } = {}) {
    const gains = getEqualPowerGains(params.mix);
    return Object.freeze({
      ...params,
      delaySeconds: getDelayTimeSeconds(bpm, params.timeDivision),
      ...gains,
    });
  },
  contract: KLINTO_DELAY_CONTRACT,
  createDefault: (instanceId) => createDefaultEffectInstance("klinto-delay", instanceId),
  createRuntime: createKlintoDelayRuntime,
  kind: "effect",
  name: "Klinto Delay",
  normalize: normalizeEffectInstance,
  sections: [
    { id: "delay", label: "Delay", params: ["timeDivision", "feedback", "mix"] },
  ],
  uiParameters: {
    timeDivision: {
      label: "Time division",
      options: ["1/32", "1/16", "1/8", "1/4", "1/2"].map((value) => [value, value]),
      type: "select",
    },
    feedback: {
      label: "Feedback",
      step: 0.01,
      valueText: (value) => `${Math.round(value * 100)}%`,
    },
    mix: {
      label: "Dry wet mix",
      step: 0.01,
      valueText: (value) => `${Math.round(value * 100)}%`,
    },
  },
});

function createClosedRegistry(kind, definitions) {
  const ordered = Object.freeze([...definitions]);
  const byType = new Map();
  for (const definition of ordered) {
    if (definition.kind !== kind) throw new TypeError(`Expected a ${kind} definition.`);
    if (byType.has(definition.type)) {
      throw new RangeError(`Duplicate ${kind} type: ${definition.type}`);
    }
    byType.set(definition.type, definition);
  }

  function get(type, version = 1) {
    const definition = byType.get(type);
    return definition?.version === version ? definition : null;
  }

  function requireDefinition(type, version = 1) {
    const definition = get(type, version);
    if (!definition) throw new RangeError(`Unknown ${kind} type/version: ${type}@${version}.`);
    return definition;
  }

  function resolve(instance, options) {
    if (!instance || typeof instance !== "object") {
      throw new TypeError(`${kind} instance must be an object.`);
    }
    const definition = requireDefinition(instance.type, instance.version);
    const normalized = definition.normalize(instance, options);
    return Object.freeze({ definition, instance: normalized });
  }

  function createDefault(type, instanceId) {
    return requireDefinition(type).createDefault(instanceId);
  }

  return Object.freeze({
    all: () => ordered,
    createDefault,
    get,
    getDefinition: get,
    has: (type, version = 1) => get(type, version) !== null,
    lookup: get,
    normalize: (instance, options) => resolve(instance, options).instance,
    require: requireDefinition,
    resolve,
  });
}

export const INSTRUMENT_DEFINITIONS = Object.freeze([KLINTO_CHIP_DEFINITION]);
export const EFFECT_DEFINITIONS = Object.freeze([
  KLINTO_FILTER_DEFINITION,
  KLINTO_DELAY_DEFINITION,
]);

export const instrumentRegistry = createClosedRegistry("instrument", INSTRUMENT_DEFINITIONS);
export const effectRegistry = createClosedRegistry("effect", EFFECT_DEFINITIONS);
export const INSTRUMENT_REGISTRY = instrumentRegistry;
export const EFFECT_REGISTRY = effectRegistry;

export const DEVICE_REGISTRY = Object.freeze({
  effects: effectRegistry,
  instruments: instrumentRegistry,
});
