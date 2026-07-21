const EMPTY_BYTES = new Uint8Array(0);

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashUnit(x, y, seed) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function featureValue(values, column, columns) {
  if (!values?.length) return 0;
  const index = Math.min(values.length - 1, Math.floor(column * values.length / columns));
  return values[index] / 255;
}

function drawDivider(context, y, width, colour, cell) {
  context.fillStyle = colour;
  context.globalAlpha = 0.55;
  for (let x = 0; x < width; x += cell * 3) context.fillRect(x, y, cell, 1);
  context.globalAlpha = 1;
}

function drawTonalLane(context, track, lane, options) {
  const { cell, columns, laneHeight, laneIndex, laneTop, time } = options;
  const frequencies = track.features?.frequencies ?? EMPTY_BYTES;
  const waveform = track.features?.waveform ?? EMPTY_BYTES;
  const center = laneTop + laneHeight * 0.58;
  const maximumStack = Math.max(2, Math.floor(laneHeight * 0.29 / cell));
  const idleStrength = track.audible === false ? 0.025 : 0.08;
  const timeOffset = options.reducedMotion ? 0 : time * 0.0011;
  context.fillStyle = track.colour;
  context.globalAlpha = track.audible === false ? 0.28 : 0.88;

  for (let column = 0; column < columns; column += 1) {
    const spectral = featureValue(frequencies, column, columns);
    const waveIndex = waveform.length
      ? Math.min(waveform.length - 1, Math.floor(column * waveform.length / columns))
      : -1;
    const signedWaveform = waveIndex === -1 ? 0 : (waveform[waveIndex] - 128) / 128;
    const waveformValue = Math.abs(signedWaveform);
    const idlePhase = Math.sin(column * 0.22 + laneIndex * 1.7 + timeOffset);
    const idle = Math.abs(idlePhase) * idleStrength;
    const energy = clamp(Math.max(spectral * 0.82, waveformValue * 0.9, idle) * (0.45 + track.gain * 0.75));
    const blocks = Math.max(1, Math.ceil(energy * maximumStack));
    const x = column * cell;
    const trace = Math.abs(signedWaveform) > 0.018
      ? signedWaveform
      : idlePhase * (track.audible === false ? 0.18 : 0.48);
    const traceCenter = center + trace * laneHeight * 0.22;
    for (let block = 0; block < blocks; block += 1) {
      const offset = block * cell;
      context.fillRect(x, traceCenter - offset, Math.max(1, cell - 1), Math.max(1, cell - 1));
      if (block > 0 || energy > 0.16) {
        context.fillRect(x, traceCenter + offset, Math.max(1, cell - 1), Math.max(1, cell - 1));
      }
    }
  }
  context.globalAlpha = 1;
}

function drawNoiseLane(context, track, lane, options) {
  const { cell, columns, laneHeight, laneIndex, laneTop, time } = options;
  const signal = clamp(Math.max(
    track.features?.amplitude ?? 0,
    track.features?.treble ?? 0,
  ));
  const idle = track.audible === false ? 0.012 : 0.04;
  const density = clamp(idle + signal * 0.42);
  const rows = Math.max(2, Math.floor(laneHeight * 0.54 / cell));
  const top = laneTop + laneHeight * 0.31;
  const frameSeed = options.reducedMotion ? 0 : Math.floor(time / 95);
  context.fillStyle = track.colour;
  context.globalAlpha = track.audible === false ? 0.25 : 0.85;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (hashUnit(column, row, laneIndex * 97 + frameSeed) > density) continue;
      context.fillRect(
        column * cell,
        top + row * cell,
        Math.max(1, cell - 1),
        Math.max(1, cell - 1),
      );
    }
  }
  context.globalAlpha = 1;
}

function drawLaneLabel(context, track, laneTop, laneHeight, options) {
  const { ink, muted, ratio } = options;
  const nameSize = Math.max(12 * ratio, Math.min(18 * ratio, laneHeight * 0.14));
  const voiceSize = Math.max(8 * ratio, Math.min(11 * ratio, laneHeight * 0.09));
  const x = 16 * ratio;
  context.textBaseline = "top";
  context.font = `700 ${nameSize}px Silkscreen, monospace`;
  context.fillStyle = track.colour;
  context.globalAlpha = track.audible === false ? 0.48 : 1;
  context.fillText(track.name, x, laneTop + 14 * ratio);
  context.font = `400 ${voiceSize}px Silkscreen, monospace`;
  context.fillStyle = track.audible === false ? muted : ink;
  context.fillText(track.voiceLabel.toUpperCase(), x, laneTop + 17 * ratio + nameSize);
  context.globalAlpha = 1;
}

export function renderSignalStackFrame(context, tracks, {
  background = "#211b28",
  grid = "#40374d",
  height,
  ink = "#f3ecf7",
  muted = "#a99bbd",
  ratio = 1,
  reducedMotion = false,
  time = 0,
  width,
} = {}) {
  const laneCount = Math.max(1, tracks.length);
  const laneHeight = height / laneCount;
  const cell = Math.max(3 * ratio, Math.round(width / 176));
  const columns = Math.max(1, Math.ceil(width / cell));
  context.fillStyle = background;
  context.globalAlpha = 1;
  context.fillRect(0, 0, width, height);

  tracks.forEach((track, laneIndex) => {
    const laneTop = laneIndex * laneHeight;
    if (laneIndex > 0) drawDivider(context, laneTop, width, grid, cell);
    const options = {
      cell,
      columns,
      laneHeight,
      laneIndex,
      laneTop,
      reducedMotion,
      time,
    };
    if (track.voiceType === "noise") drawNoiseLane(context, track, laneIndex, options);
    else drawTonalLane(context, track, laneIndex, options);
    drawLaneLabel(context, track, laneTop, laneHeight, { ink, muted, ratio });
  });

  if (tracks.length === 0) {
    const fontSize = 12 * ratio;
    context.font = `400 ${fontSize}px Silkscreen, monospace`;
    context.fillStyle = muted;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("ADD A TRACK TO BUILD A SIGNAL STACK", width / 2, height / 2);
    context.textAlign = "start";
  }

  return Object.freeze({ cell, laneCount: tracks.length, laneHeight });
}
