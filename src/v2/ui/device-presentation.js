import { DEVICE_REGISTRY } from "../audio/device-registry.js";

export function getInstrumentDefinitions() {
  return DEVICE_REGISTRY.instruments.all();
}

export function getDefaultInstrumentType() {
  return getInstrumentDefinitions()[0]?.type ?? "klinto-chip";
}

export function getInstrumentDefinition(instrument) {
  if (!instrument) throw new TypeError("Instrument presentation requires an Instrument instance.");
  return DEVICE_REGISTRY.instruments.require(instrument.type, instrument.version);
}

export function getInstrumentName(instrument) {
  return getInstrumentDefinition(instrument).name;
}

export function getInstrumentPitchEntries(instrument) {
  const pitchNames = getInstrumentDefinition(instrument).ui.pitchNames ?? {};
  return Object.freeze(Object.entries(pitchNames)
    .map(([pitch, name]) => [Number(pitch), String(name)])
    .filter(([pitch, name]) => Number.isInteger(pitch) && name.length > 0)
    .sort(([left], [right]) => left - right)
    .map((entry) => Object.freeze(entry)));
}

export function getInstrumentPitchName(instrument, pitch) {
  if (!Number.isInteger(pitch)) return null;
  const name = getInstrumentDefinition(instrument).ui.pitchNames?.[pitch];
  return typeof name === "string" && name.length > 0 ? name : null;
}
