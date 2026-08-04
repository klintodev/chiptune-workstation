import {
  assertBoolean,
  assertDomainId,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertInteger,
  deepFreeze,
} from "./domain-utils.js";

const WAVEFORMS = Object.freeze(["pulse12", "pulse25", "square", "triangle", "saw", "noise"]);
const DELAY_DIVISIONS = Object.freeze(["1/32", "1/16", "1/8", "1/4", "1/2"]);

function parameter(kind, options = {}) {
  return deepFreeze({ kind, ...options });
}

export const KLINTO_CHIP_CONTRACT = deepFreeze({
  type: "klinto-chip",
  version: 1,
  paramKeys: ["waveform", "octave", "attackSeconds", "releaseSeconds", "level"],
  defaults: {
    waveform: "square",
    octave: 0,
    attackSeconds: 0.008,
    releaseSeconds: 0.03,
    level: 0.35,
  },
  parameters: {
    waveform: parameter("enum", { values: WAVEFORMS }),
    octave: parameter("integer", { minimum: -2, maximum: 2 }),
    attackSeconds: parameter("number", { minimum: 0.001, maximum: 2 }),
    releaseSeconds: parameter("number", { minimum: 0.01, maximum: 3 }),
    level: parameter("number", { minimum: 0, maximum: 1 }),
  },
});

export const KLINTO_FILTER_CONTRACT = deepFreeze({
  type: "klinto-filter",
  version: 1,
  paramKeys: ["cutoffHz", "q"],
  defaults: { cutoffHz: 12_000, q: 0.7 },
  parameters: {
    cutoffHz: parameter("number", { minimum: 20, maximum: 20_000 }),
    q: parameter("number", { minimum: 0.1, maximum: 20 }),
  },
});

export const KLINTO_DELAY_CONTRACT = deepFreeze({
  type: "klinto-delay",
  version: 1,
  paramKeys: ["timeDivision", "feedback", "mix"],
  defaults: { timeDivision: "1/8", feedback: 0.3, mix: 0.2 },
  parameters: {
    timeDivision: parameter("enum", { values: DELAY_DIVISIONS }),
    feedback: parameter("number", { minimum: 0, maximum: 0.85 }),
    mix: parameter("number", { minimum: 0, maximum: 1 }),
  },
});

export const INSTRUMENT_CONTRACTS = deepFreeze({
  [KLINTO_CHIP_CONTRACT.type]: KLINTO_CHIP_CONTRACT,
});

export const EFFECT_CONTRACTS = deepFreeze({
  [KLINTO_FILTER_CONTRACT.type]: KLINTO_FILTER_CONTRACT,
  [KLINTO_DELAY_CONTRACT.type]: KLINTO_DELAY_CONTRACT,
});

export const KLINTO_CHIP_DEFAULT_PARAMS = KLINTO_CHIP_CONTRACT.defaults;
export const KLINTO_FILTER_DEFAULT_PARAMS = KLINTO_FILTER_CONTRACT.defaults;
export const KLINTO_DELAY_DEFAULT_PARAMS = KLINTO_DELAY_CONTRACT.defaults;
export const KLINTO_CHIP_WAVEFORMS = WAVEFORMS;
export const KLINTO_DELAY_DIVISIONS = DELAY_DIVISIONS;

export function getInstrumentContract(type) {
  const contract = INSTRUMENT_CONTRACTS[type];
  if (!contract) throw new RangeError(`Unknown Instrument type: ${type}.`);
  return contract;
}

export function getEffectContract(type) {
  const contract = EFFECT_CONTRACTS[type];
  if (!contract) throw new RangeError(`Unknown Effect type: ${type}.`);
  return contract;
}

function normalizeParams(candidate, contract, label) {
  assertExactKeys(candidate, contract.paramKeys, `${label} params`);
  const normalized = {};
  for (const key of contract.paramKeys) {
    const definition = contract.parameters[key];
    const value = candidate[key];
    if (definition.kind === "enum") assertEnum(value, definition.values, `${label} ${key}`);
    if (definition.kind === "integer") {
      assertInteger(value, `${label} ${key}`, definition.minimum, definition.maximum);
    }
    if (definition.kind === "number") {
      assertFiniteNumber(value, `${label} ${key}`, definition.minimum, definition.maximum);
    }
    normalized[key] = value;
  }
  return normalized;
}

function claimInstanceId(instanceId, usedInstanceIds, label) {
  assertDomainId(instanceId, `${label} instanceId`);
  if (usedInstanceIds?.has(instanceId)) {
    throw new RangeError(`Device instance identifier is duplicated: ${instanceId}.`);
  }
  usedInstanceIds?.add(instanceId);
}

export function normalizeInstrumentInstance(candidate, { usedInstanceIds, label = "Instrument" } = {}) {
  assertExactKeys(candidate, ["instanceId", "type", "version", "params"], label);
  const contract = getInstrumentContract(candidate.type);
  if (candidate.version !== contract.version) {
    throw new RangeError(`Unsupported ${candidate.type} version: ${candidate.version}.`);
  }
  const params = normalizeParams(candidate.params, contract, label);
  claimInstanceId(candidate.instanceId, usedInstanceIds, label);
  return deepFreeze({
    instanceId: candidate.instanceId,
    type: contract.type,
    version: contract.version,
    params,
  });
}

export function normalizeEffectInstance(candidate, { usedInstanceIds, label = "Effect" } = {}) {
  assertExactKeys(candidate, ["instanceId", "type", "version", "bypassed", "params"], label);
  const contract = getEffectContract(candidate.type);
  if (candidate.version !== contract.version) {
    throw new RangeError(`Unsupported ${candidate.type} version: ${candidate.version}.`);
  }
  assertBoolean(candidate.bypassed, `${label} bypassed`);
  const params = normalizeParams(candidate.params, contract, label);
  claimInstanceId(candidate.instanceId, usedInstanceIds, label);
  return deepFreeze({
    instanceId: candidate.instanceId,
    type: contract.type,
    version: contract.version,
    bypassed: candidate.bypassed,
    params,
  });
}

export function validateInstrumentInstance(candidate, options) {
  normalizeInstrumentInstance(candidate, options);
  return true;
}

export function validateEffectInstance(candidate, options) {
  normalizeEffectInstance(candidate, options);
  return true;
}

export function createDefaultInstrumentInstance(instanceId = "instrument-1") {
  return normalizeInstrumentInstance({
    instanceId,
    type: KLINTO_CHIP_CONTRACT.type,
    version: KLINTO_CHIP_CONTRACT.version,
    params: { ...KLINTO_CHIP_CONTRACT.defaults },
  });
}

export function createDefaultEffectInstance(type, instanceId = "effect-1") {
  const contract = getEffectContract(type);
  return normalizeEffectInstance({
    instanceId,
    type: contract.type,
    version: contract.version,
    bypassed: false,
    params: { ...contract.defaults },
  });
}
