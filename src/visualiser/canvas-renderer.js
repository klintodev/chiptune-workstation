const PALETTES = Object.freeze({
  arcade: Object.freeze({ background: "#080b08", primary: "#c8ff32", secondary: "#ff5f87", grid: "#24301f" }),
  ice: Object.freeze({ background: "#081016", primary: "#8ae8ff", secondary: "#b8a8ff", grid: "#19303a" }),
  sunset: Object.freeze({ background: "#160914", primary: "#ffb454", secondary: "#ff5f87", grid: "#3d1d36" }),
});

function clear(context, width, height, palette) {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = palette.grid;
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 24) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 24) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
}

function drawSpectrum(context, features, config, width, height) {
  const values = features.frequencies;
  const bars = Math.min(48, values.length || 24);
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
  context.fillStyle = PALETTES[config.palette].primary;
  for (let bar = 0; bar < bars; bar += 1) {
    const value = values.length ? values[Math.floor(bar * values.length / bars)] / 255 : 0.08;
    const barHeight = Math.max(3, value * height * config.intensity);
    context.fillRect(bar * (barWidth + gap), height - barHeight, barWidth, barHeight);
  }
}

function drawScope(context, features, config, width, height) {
  const values = features.waveform;
  const palette = PALETTES[config.palette];
  context.strokeStyle = palette.secondary;
  context.lineWidth = 2 + config.intensity * 3;
  context.shadowColor = palette.secondary;
  context.shadowBlur = 4 + config.intensity * 12;
  context.beginPath();
  const count = values.length || 64;
  for (let index = 0; index < count; index += 1) {
    const sample = values.length ? (values[index] - 128) / 128 : Math.sin(index * 0.3) * 0.05;
    const x = index / Math.max(1, count - 1) * width;
    const y = height / 2 + sample * height * 0.42 * config.intensity;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
  context.shadowBlur = 0;
}

function drawPixelPulse(context, features, config, width, height, time, reducedMotion) {
  const palette = PALETTES[config.palette];
  const pulse = 0.18 + features.amplitude * config.intensity * 0.82;
  const rotation = reducedMotion ? 0 : time * 0.0002 * config.motion;
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(rotation);
  for (let ring = 5; ring >= 1; ring -= 1) {
    const size = Math.min(width, height) * pulse * (0.25 + ring * 0.13);
    context.strokeStyle = ring % 2 ? palette.primary : palette.secondary;
    context.lineWidth = Math.max(2, config.intensity * 5);
    context.globalAlpha = 0.25 + ring * 0.12;
    context.strokeRect(-size / 2, -size / 2, size, size);
  }
  context.restore();
  context.globalAlpha = 1;
}

function layerDrive(features, mapping) {
  const source = features[mapping.signal] ?? 0;
  const directed = mapping.direction === -1 ? 1 - source : source;
  return Math.max(0.05, 1 + directed * mapping.amount);
}

function drawCustomBars(context, features, config, layer, width, height) {
  const values = features.frequencies;
  const bars = Math.min(48, values.length || 24);
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
  const drive = layerDrive(features, layer.mapping);
  context.save();
  context.globalAlpha = layer.opacity;
  context.fillStyle = PALETTES[config.palette][layer.colour];
  for (let bar = 0; bar < bars; bar += 1) {
    const value = values.length ? values[Math.floor(bar * values.length / bars)] / 255 : 0.08;
    const barHeight = Math.min(height, Math.max(3, value * height * config.intensity * layer.size * drive));
    context.fillRect(bar * (barWidth + gap), height - barHeight, barWidth, barHeight);
  }
  context.restore();
}

function drawCustomWaveform(context, features, config, layer, width, height) {
  const values = features.waveform;
  const colour = PALETTES[config.palette][layer.colour];
  const drive = layerDrive(features, layer.mapping);
  context.save();
  context.globalAlpha = layer.opacity;
  context.strokeStyle = colour;
  context.lineWidth = Math.max(1, 2 * layer.size + config.intensity * 2);
  context.shadowColor = colour;
  context.shadowBlur = 4 + config.intensity * 8;
  context.beginPath();
  const count = values.length || 64;
  for (let index = 0; index < count; index += 1) {
    const sample = values.length ? (values[index] - 128) / 128 : Math.sin(index * 0.3) * 0.05;
    const x = index / Math.max(1, count - 1) * width;
    const y = height / 2 + sample * height * 0.38 * layer.size * drive;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function drawCustomPulse(context, features, config, layer, width, height, time, reducedMotion) {
  const colour = PALETTES[config.palette][layer.colour];
  const drive = layerDrive(features, layer.mapping);
  const size = Math.min(width, height) * 0.2 * layer.size * drive;
  const rotation = reducedMotion ? 0 : time * 0.0002 * config.motion * layer.mapping.direction;
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(rotation);
  context.globalAlpha = layer.opacity;
  context.strokeStyle = colour;
  context.lineWidth = Math.max(2, config.intensity * 5);
  context.shadowColor = colour;
  context.shadowBlur = 5 + config.intensity * 10;
  for (let ring = 1; ring <= 4; ring += 1) {
    const ringSize = size * (0.45 + ring * 0.25);
    context.strokeRect(-ringSize / 2, -ringSize / 2, ringSize, ringSize);
  }
  context.restore();
}

function drawCustomLayers(context, features, config, width, height, time, reducedMotion) {
  for (const layer of config.layers) {
    if (!layer.visible) continue;
    if (layer.type === "bars") drawCustomBars(context, features, config, layer, width, height);
    else if (layer.type === "waveform") drawCustomWaveform(context, features, config, layer, width, height);
    else drawCustomPulse(context, features, config, layer, width, height, time, reducedMotion);
  }
}

export function renderVisualFrame(context, features, config, {
  height,
  reducedMotion = false,
  time = 0,
  width,
}) {
  const palette = PALETTES[config.palette] ?? PALETTES.arcade;
  clear(context, width, height, palette);
  if (!config.enabled) return;
  if (config.mode === "custom") {
    drawCustomLayers(context, features, config, width, height, time, reducedMotion);
    return;
  }
  if (config.preset === "scope") drawScope(context, features, config, width, height);
  else if (config.preset === "pixel-pulse") {
    drawPixelPulse(context, features, config, width, height, time, reducedMotion);
  } else drawSpectrum(context, features, config, width, height);
}

export function fitCanvas(canvas, pixelRatio = globalThis.devicePixelRatio || 1) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, Math.max(1, pixelRatio));
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return Object.freeze({ height, ratio, width });
}
