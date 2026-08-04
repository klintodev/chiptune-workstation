const NOTE_NAMES = Object.freeze(["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]);

export function formatMidiPitch(pitch) {
  if (!Number.isInteger(pitch)) return "Unknown pitch";
  const name = NOTE_NAMES[((pitch % 12) + 12) % 12];
  return `${name}${Math.floor(pitch / 12) - 1}`;
}

export function formatTickPosition(tick, ppq = 96) {
  const barTicks = ppq * 4;
  const beat = Math.floor((tick % barTicks) / ppq) + 1;
  const bar = Math.floor(tick / barTicks) + 1;
  const withinBeat = tick % ppq;
  return withinBeat === 0
    ? `bar ${bar}, beat ${beat}`
    : `bar ${bar}, beat ${beat}, tick ${withinBeat}`;
}

export function formatDurationTicks(ticks, ppq = 96) {
  const beats = ticks / ppq;
  return Number.isInteger(beats) ? `${beats} beat${beats === 1 ? "" : "s"}` : `${ticks} ticks`;
}

export function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}
