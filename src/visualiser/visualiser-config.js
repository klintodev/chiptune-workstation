export const VISUALISER_PRESETS = Object.freeze(["spectrum", "scope", "pixel-pulse"]);
export const VISUALISER_PALETTES = Object.freeze(["arcade", "ice", "sunset"]);
export const VISUALISER_MODES = Object.freeze(["preset", "custom"]);
export const VISUALISER_LAYER_TYPES = Object.freeze(["bars", "waveform", "pulse"]);
export const VISUALISER_SIGNALS = Object.freeze(["amplitude", "bass", "mid", "treble"]);
export const VISUALISER_COLOURS = Object.freeze(["primary", "secondary"]);
export const VISUALISER_CONFIG_VERSION = 1;
export const MAX_VISUALISER_LAYERS = 8;

const TYPE_NAMES = Object.freeze({ bars: "Bars", waveform: "Waveform", pulse: "Pulse" });

function boundedNumber(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} is invalid.`);
  }
}

export function createVisualiserLayer(type, id = `layer-${Date.now()}`) {
  if (!VISUALISER_LAYER_TYPES.includes(type)) throw new RangeError("Visualiser layer type is invalid.");
  return {
    id,
    name: TYPE_NAMES[type],
    type,
    visible: true,
    colour: type === "waveform" ? "secondary" : "primary",
    opacity: 0.9,
    size: 1,
    mapping: {
      signal: type === "bars" ? "bass" : "amplitude",
      amount: 1,
      direction: 1,
    },
  };
}

export function createLayersFromPreset(preset) {
  if (!VISUALISER_PRESETS.includes(preset)) throw new RangeError("Visualiser preset is invalid.");
  if (preset === "scope") return [createVisualiserLayer("waveform", "layer-1")];
  if (preset === "pixel-pulse") return [createVisualiserLayer("pulse", "layer-1")];
  return [
    createVisualiserLayer("bars", "layer-1"),
    { ...createVisualiserLayer("pulse", "layer-2"), opacity: 0.35, size: 0.65 },
  ];
}

export function createDefaultVisualiser() {
  return {
    version: VISUALISER_CONFIG_VERSION,
    enabled: true,
    mode: "preset",
    preset: "spectrum",
    palette: "arcade",
    intensity: 0.75,
    sensitivity: 1,
    motion: 1,
    layers: [],
  };
}

function normalizeLayer(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("Visualiser layer is invalid.");
  const base = createVisualiserLayer(candidate.type, candidate.id);
  return {
    ...base,
    ...candidate,
    name: typeof candidate.name === "string" ? candidate.name.trim() : base.name,
    mapping: { ...base.mapping, ...candidate.mapping },
  };
}

function validateLayer(layer, ids) {
  if (typeof layer.id !== "string" || layer.id === "" || ids.has(layer.id)) {
    throw new RangeError("Every visualiser layer must have a unique identifier.");
  }
  ids.add(layer.id);
  if (typeof layer.name !== "string" || layer.name === "" || layer.name.length > 32) {
    throw new RangeError("Visualiser layer name is invalid.");
  }
  if (!VISUALISER_LAYER_TYPES.includes(layer.type)) throw new RangeError("Visualiser layer type is invalid.");
  if (typeof layer.visible !== "boolean") throw new TypeError("Visualiser layer visibility is invalid.");
  if (!VISUALISER_COLOURS.includes(layer.colour)) throw new RangeError("Visualiser layer colour is invalid.");
  boundedNumber(layer.opacity, 0.1, 1, "Visualiser layer opacity");
  boundedNumber(layer.size, 0.25, 2, "Visualiser layer size");
  if (!layer.mapping || !VISUALISER_SIGNALS.includes(layer.mapping.signal)) {
    throw new RangeError("Visualiser layer signal is invalid.");
  }
  boundedNumber(layer.mapping.amount, 0, 2, "Visualiser layer drive");
  if (![1, -1].includes(layer.mapping.direction)) throw new RangeError("Visualiser layer direction is invalid.");
}

export function validateVisualiser(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("A project must contain visualiser settings.");
  }
  const normalized = {
    ...createDefaultVisualiser(),
    ...candidate,
    layers: (candidate.layers ?? []).map(normalizeLayer),
  };
  if (normalized.version !== VISUALISER_CONFIG_VERSION) {
    throw new RangeError(`Unsupported visualiser version: ${normalized.version}.`);
  }
  if (typeof normalized.enabled !== "boolean") throw new TypeError("Visualiser enabled state is invalid.");
  if (!VISUALISER_MODES.includes(normalized.mode)) throw new RangeError("Visualiser mode is invalid.");
  if (!VISUALISER_PRESETS.includes(normalized.preset)) throw new RangeError("Visualiser preset is invalid.");
  if (!VISUALISER_PALETTES.includes(normalized.palette)) throw new RangeError("Visualiser palette is invalid.");
  boundedNumber(normalized.intensity, 0, 1, "Visualiser intensity");
  boundedNumber(normalized.sensitivity, 0.25, 2, "Visualiser sensitivity");
  boundedNumber(normalized.motion, 0, 2, "Visualiser motion");
  if (normalized.layers.length > MAX_VISUALISER_LAYERS) {
    throw new RangeError(`A visualiser can contain at most ${MAX_VISUALISER_LAYERS} layers.`);
  }
  const ids = new Set();
  for (const layer of normalized.layers) validateLayer(layer, ids);
  return true;
}

export function normalizeVisualiser(candidate = createDefaultVisualiser()) {
  const normalized = {
    ...createDefaultVisualiser(),
    ...candidate,
    layers: (candidate.layers ?? []).map(normalizeLayer),
  };
  validateVisualiser(normalized);
  return normalized;
}

export function nextVisualiserLayerId(layers) {
  const ids = new Set(layers.map((layer) => layer.id));
  let number = 1;
  while (ids.has(`layer-${number}`)) number += 1;
  return `layer-${number}`;
}
