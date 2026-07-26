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

function drawLabel(context, note, geometry, colours, ratio, showLabel = true) {
  const { radius, x, y } = geometry;
  if (!showLabel || radius < 10 * ratio) return;
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
  pitchMaximum = 96,
  pitchMinimum = 36,
  presentationMode = "stereo",
  ratio = 1,
  safeMargin = null,
  trackCount = 1,
  width,
  horizonY = height * (width / height > 1.5 ? 0.31 : 0.23),
  vanishingX = width * 0.5,
} = {}) {
  if (!note || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Projected note geometry requires a note and positive dimensions.");
  }
  const resolvedSafeMargin = safeMargin
    ?? Math.max(12 * ratio, Math.min(width, height) * 0.06);
  const depth = clamp(note.depth);
  const proximity = Math.pow(1 - depth, 1.45);
  const lane = trackCount <= 1 ? 0 : (note.trackIndex / (trackCount - 1)) * 2 - 1;
  const horizontalValue = presentationMode === "lanes" ? lane : clamp(note.pan, -1, 1);
  const horizontalRange = Math.max(0, width / 2 - resolvedSafeMargin);
  const nearX = vanishingX + horizontalValue * horizontalRange;
  const pitchSpan = Math.max(1, pitchMaximum - pitchMinimum);
  const normalizedPitch = clamp((note.note - pitchMinimum) / pitchSpan);
  const verticalRange = Math.max(0, height - horizonY - resolvedSafeMargin * 2);
  const nearY = horizonY + resolvedSafeMargin + (1 - normalizedPitch) * verticalRange;
  const radius = Math.max(3 * ratio, (5 + clamp(note.velocity) * 46) * ratio * (0.16 + proximity * 0.84));
  const objectMargin = Math.min(
    Math.min(width, height) / 2,
    resolvedSafeMargin + radius,
  );
  const x = clamp(
    vanishingX + (nearX - vanishingX) * proximity,
    objectMargin,
    width - objectMargin,
  );
  const y = clamp(
    horizonY + (nearY - horizonY) * proximity,
    objectMargin,
    height - objectMargin,
  );
  const pixel = Math.max(2 * ratio, Math.round((2 + proximity * 3.2) * ratio));
  return Object.freeze({ pixel, proximity, radius, x, y });
}

function boxesOverlap(left, right, gap = 3) {
  return left.left < right.right + gap
    && left.right + gap > right.left
    && left.top < right.bottom + gap
    && left.bottom + gap > right.top;
}

function getLabelBox(note, geometry, ratio) {
  const width = Math.max(note.trackName.length * 6, note.noteLabel.length * 8) * ratio;
  const height = 24 * ratio;
  return Object.freeze({
    bottom: geometry.y + height / 2,
    left: geometry.x - width / 2,
    right: geometry.x + width / 2,
    top: geometry.y - height / 2,
  });
}

export function getCompositionSceneLayout(projection, {
  height,
  motion = "full",
  presentationMode = "stereo",
  ratio = 1,
  width,
} = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Composition scene layout requires positive dimensions.");
  }
  const horizonY = height * (width / height > 1.5 ? 0.31 : 0.23);
  const vanishingX = width * 0.5;
  const trackCount = Math.max(1, projection.activity?.length
    ?? 1 + Math.max(-1, ...projection.notes.map((note) => note.trackIndex)));
  const pitchMinimum = Math.min(96, ...projection.notes.map((note) => note.note)) - 2;
  const pitchMaximum = Math.max(36, ...projection.notes.map((note) => note.note)) + 2;
  const prepared = projection.notes.map((original, index) => {
    const note = motion === "reduced" && !original.active
      ? { ...original, depth: clamp(Math.ceil(Math.max(0, original.stepsUntilStart)) / projection.horizonSteps) }
      : original;
    const geometry = getProjectedNoteGeometry(note, {
      height,
      horizonY,
      pitchMaximum,
      pitchMinimum,
      presentationMode,
      ratio,
      trackCount,
      vanishingX,
      width,
    });
    return { geometry, key: original.id ?? `projected-note-${index}`, note };
  });
  const priority = [...prepared].sort((left, right) => (
    Number(right.note.active) - Number(left.note.active)
    || left.note.depth - right.note.depth
    || left.note.trackIndex - right.note.trackIndex
    || left.note.note - right.note.note
    || left.key.localeCompare(right.key)
  ));
  const acceptedLabels = [];
  const visibility = new Map();
  for (const item of priority) {
    const box = getLabelBox(item.note, item.geometry, ratio);
    const collides = acceptedLabels.some((accepted) => boxesOverlap(box, accepted));
    const visible = item.note.active || (!collides && item.geometry.radius >= 10 * ratio);
    visibility.set(item.key, visible);
    if (visible) acceptedLabels.push(box);
  }
  return Object.freeze({
    horizonY,
    notes: Object.freeze(prepared.map(({ geometry, key, note }) => Object.freeze({
      geometry,
      key,
      labelVisible: visibility.get(key),
      note,
      tailLength: Math.max(
        0,
        Math.min(
          note.gate * geometry.radius * 1.8,
          height - (geometry.y + geometry.radius * 0.6),
        ),
      ),
    }))),
    pitchMaximum,
    pitchMinimum,
    presentationMode,
    vanishingX,
  });
}

function drawProjectedNote(context, item, options) {
  const { background, highContrast, ink, ratio } = options;
  const { geometry, labelVisible, note, tailLength } = item;
  const { pixel, proximity, radius, x, y } = geometry;
  const inactiveFactor = note.audible === false ? 0.34 : 1;
  const alpha = clamp((0.2 + proximity * 0.8) * (note.active ? 0.7 + note.life * 0.3 : 1))
    * inactiveFactor;

  context.fillStyle = note.active || highContrast ? ink : note.colour;
  context.globalAlpha = Math.max(0.32, alpha * 0.68);
  context.fillRect(x - pixel / 2, y + radius * 0.6, pixel, tailLength);
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
  drawLabel(context, note, geometry, { alpha: highContrast ? 1 : alpha, ink }, ratio, labelVisible);
}

export function renderCompositionFrame(context, projection, {
  background = "#211b28",
  grid = "#40374d",
  height,
  highContrast = false,
  ink = "#f3ecf7",
  motion = "full",
  muted = "#a99bbd",
  presentationMode = "stereo",
  ratio = 1,
  width,
} = {}) {
  const scene = getCompositionSceneLayout(projection, {
    height,
    motion,
    presentationMode,
    ratio,
    width,
  });
  const { horizonY, vanishingX } = scene;
  context.fillStyle = background;
  context.globalAlpha = 1;
  context.fillRect(0, 0, width, height);
  drawRoom(context, { grid, height, horizonY, ratio, vanishingX, width });

  const notes = [...scene.notes].sort((left, right) => right.note.depth - left.note.depth);
  notes.forEach((item) => drawProjectedNote(context, item, {
    background,
    highContrast,
    ink,
    ratio,
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
    noteTargets: Object.freeze(scene.notes.map(({ geometry, key, note }) => Object.freeze({
      id: note.id ?? key,
      radius: Math.max(14 * ratio, geometry.radius),
      x: geometry.x,
      y: geometry.y,
    }))),
    vanishingX,
  });
}
