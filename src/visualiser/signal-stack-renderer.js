const TAU = Math.PI * 2;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashUnit(x, y, seed) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function drawRoom(context, {
  grid,
  height,
  horizonY,
  ratio,
  vanishingX,
  width,
}) {
  context.fillStyle = grid;
  context.globalAlpha = 0.42;
  const columns = 14;
  for (let column = 0; column <= columns; column += 1) {
    const nearX = column / columns * width;
    const steps = 34;
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const x = vanishingX + (nearX - vanishingX) * progress;
      const y = horizonY + (height - horizonY) * progress;
      const pixel = Math.max(1, Math.round((1 + progress * 2) * ratio));
      context.fillRect(x, y, pixel, pixel);
    }
  }
  for (let line = 1; line <= 12; line += 1) {
    const progress = Math.pow(line / 12, 2.05);
    const y = horizonY + (height - horizonY) * progress;
    const pixel = Math.max(1, Math.round((1 + progress * 2) * ratio));
    for (let x = 0; x < width; x += 12 * ratio) context.fillRect(x, y, 6 * ratio, pixel);
  }
  context.globalAlpha = 1;
}

function drawPixelDisc(context, x, y, radius, pixel, colour, alpha) {
  context.fillStyle = colour;
  context.globalAlpha = alpha;
  const snappedRadius = Math.max(pixel, Math.round(radius / pixel) * pixel);
  for (let row = -snappedRadius; row <= snappedRadius; row += pixel) {
    const span = Math.sqrt(Math.max(0, snappedRadius * snappedRadius - row * row));
    const snappedSpan = Math.floor(span / pixel) * pixel;
    context.fillRect(x - snappedSpan, y + row, snappedSpan * 2 + pixel, pixel);
  }
  context.globalAlpha = 1;
}

function drawPulse(context, note, geometry, colours) {
  const { pixel, radius, x, y } = geometry;
  context.fillStyle = note.colour;
  context.globalAlpha = colours.alpha;
  const size = Math.max(pixel * 3, Math.round(radius * 1.48 / pixel) * pixel);
  context.fillRect(x - size, y - size, size * 2, size * 2);
  context.fillStyle = colours.background;
  context.globalAlpha = colours.alpha * 0.22;
  context.fillRect(x - size + pixel * 2, y - size + pixel * 2, size * 2 - pixel * 4, size * 2 - pixel * 4);
  context.fillStyle = note.colour;
  context.globalAlpha = colours.alpha;
  context.fillRect(x - radius * 0.45, y - radius * 0.45, radius * 0.9, radius * 0.9);
  context.globalAlpha = 1;
}

function drawTriangle(context, note, geometry, colours) {
  const { pixel, radius, x, y } = geometry;
  context.fillStyle = note.colour;
  context.globalAlpha = colours.alpha;
  for (let row = 0; row <= radius * 2; row += pixel) {
    const progress = row / (radius * 2);
    const halfWidth = progress * radius;
    context.fillRect(x - halfWidth, y - radius + row, halfWidth * 2 + pixel, pixel);
  }
  context.globalAlpha = 1;
}

function drawSaw(context, note, geometry, colours) {
  const { pixel, radius, x, y } = geometry;
  context.fillStyle = note.colour;
  context.globalAlpha = colours.alpha;
  for (let row = -radius; row <= radius; row += pixel) {
    const progress = (row + radius) / (radius * 2);
    const left = x - radius + progress * radius * 0.55;
    const right = x + radius - Math.abs(progress - 0.55) * radius * 0.7;
    context.fillRect(left, y + row, Math.max(pixel, right - left), pixel);
  }
  context.globalAlpha = 1;
}

function drawNoise(context, note, geometry, colours) {
  const { pixel, radius, x, y } = geometry;
  const count = Math.max(12, Math.round(radius * radius / (pixel * pixel) * 0.62));
  context.fillStyle = note.colour;
  context.globalAlpha = colours.alpha;
  for (let index = 0; index < count; index += 1) {
    const angle = hashUnit(index, note.trackIndex, note.note) * TAU;
    const distance = Math.sqrt(hashUnit(note.note, index, note.trackIndex + 17)) * radius;
    context.fillRect(
      Math.round((x + Math.cos(angle) * distance) / pixel) * pixel,
      Math.round((y + Math.sin(angle) * distance) / pixel) * pixel,
      pixel,
      pixel,
    );
  }
  context.globalAlpha = 1;
}

function drawOrbShading(context, note, geometry, colours) {
  const { pixel, radius, x, y } = geometry;
  context.fillStyle = colours.ink;
  context.globalAlpha = colours.alpha * 0.25;
  context.fillRect(x - radius * 0.48, y - radius * 0.48, pixel * 2, pixel * 2);
  context.fillStyle = colours.background;
  context.globalAlpha = colours.alpha * 0.3;
  context.fillRect(x + radius * 0.18, y + radius * 0.34, radius * 0.58, pixel * 2);
  context.globalAlpha = 1;
}

function drawLabel(context, note, geometry, colours, ratio) {
  const { radius, x, y } = geometry;
  if (radius < 13 * ratio) return;
  const trackSize = Math.max(7 * ratio, Math.min(12 * ratio, radius * 0.2));
  const noteSize = Math.max(8 * ratio, Math.min(15 * ratio, radius * 0.27));
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = colours.ink;
  context.globalAlpha = colours.alpha;
  context.font = `700 ${trackSize}px Silkscreen, monospace`;
  context.fillText(note.trackName.toUpperCase(), x, y - noteSize * 0.55);
  context.font = `700 ${noteSize}px VT323, monospace`;
  context.fillText(note.noteLabel, x, y + trackSize * 0.75);
  context.globalAlpha = 1;
  context.textAlign = "start";
}

export function getProjectedNoteGeometry(note, {
  height,
  ratio = 1,
  width,
  horizonY = height * 0.31,
  vanishingX = width * 0.52,
} = {}) {
  if (!note || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Projected note geometry requires a note and positive dimensions.");
  }
  const depth = clamp(note.depth);
  const proximity = Math.pow(1 - depth, 1.45);
  const nearX = vanishingX + clamp(note.pan, -1, 1) * width * 0.38;
  const nearY = height * (0.79 - clamp(note.pitch) * 0.57);
  const x = vanishingX + (nearX - vanishingX) * proximity;
  const y = horizonY + (nearY - horizonY) * proximity;
  const radius = Math.max(3 * ratio, (5 + clamp(note.velocity) * 46) * ratio * (0.16 + proximity * 0.84));
  const pixel = Math.max(2 * ratio, Math.round((2 + proximity * 3.2) * ratio));
  return Object.freeze({ pixel, proximity, radius, x, y });
}

function drawProjectedNote(context, note, options) {
  const { background, height, horizonY, ink, ratio, vanishingX, width } = options;
  const geometry = getProjectedNoteGeometry(note, {
    height,
    horizonY,
    ratio,
    vanishingX,
    width,
  });
  const { pixel, proximity, radius, x, y } = geometry;
  const alpha = clamp((0.2 + proximity * 0.8) * (note.active ? 0.7 + note.life * 0.3 : 1));

  context.fillStyle = background;
  context.globalAlpha = alpha * 0.48;
  context.fillRect(x - radius * 0.62, y + radius * 0.78, radius * 1.5, pixel * 2);
  context.globalAlpha = 1;

  if (note.voiceType === "noise") drawNoise(context, note, geometry, { alpha });
  else if (note.voiceType === "triangle") drawTriangle(context, note, geometry, { alpha });
  else if (note.voiceType === "sawtooth") drawSaw(context, note, geometry, { alpha });
  else if (note.voiceType === "pulse12" || note.voiceType === "pulse25") {
    drawPulse(context, note, geometry, { alpha, background });
  } else drawPixelDisc(context, x, y, radius, pixel, note.colour, alpha);

  drawOrbShading(context, note, geometry, { alpha, background, ink });
  if (note.active) {
    context.fillStyle = ink;
    context.globalAlpha = 0.72 * note.life;
    const marker = pixel * 2;
    context.fillRect(x - radius - marker, y - marker / 2, marker, marker);
    context.fillRect(x + radius, y - marker / 2, marker, marker);
    context.globalAlpha = 1;
  }
  drawLabel(context, note, geometry, { alpha, ink }, ratio);
}

export function renderCompositionFrame(context, projection, {
  background = "#211b28",
  grid = "#40374d",
  height,
  ink = "#f3ecf7",
  muted = "#a99bbd",
  ratio = 1,
  width,
} = {}) {
  const vanishingX = width * 0.52;
  const horizonY = height * 0.31;
  context.fillStyle = background;
  context.globalAlpha = 1;
  context.fillRect(0, 0, width, height);
  drawRoom(context, { grid, height, horizonY, ratio, vanishingX, width });

  const notes = [...projection.notes].sort((left, right) => right.depth - left.depth);
  notes.forEach((note) => drawProjectedNote(context, note, {
    background,
    height,
    horizonY,
    ink,
    ratio,
    vanishingX,
    width,
  }));

  if (notes.length === 0) {
    context.font = `400 ${12 * ratio}px Silkscreen, monospace`;
    context.fillStyle = muted;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("PROGRAM NOTES TO BUILD THE VISUAL FIELD", width / 2, height / 2);
    context.textAlign = "start";
  }

  return Object.freeze({
    horizonY,
    noteCount: notes.length,
    vanishingX,
  });
}
