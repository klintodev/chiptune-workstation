export const TRACK_COLOURS = Object.freeze([
  "var(--accent)",
  "#f2b8d8",
  "#b7a9ec",
  "#f2b48c",
  "#9fc6ed",
  "#d6a7ef",
  "#8fd3c8",
  "#ef9ca8",
]);

export const VOICE_LABELS = Object.freeze({
  pulse12: "pulse 12.5%",
  pulse25: "pulse 25%",
  square: "pulse 50%",
  triangle: "triangle",
  sawtooth: "saw",
  noise: "noise",
});

export function getTrackColour(trackIndex) {
  const safeIndex = Number.isInteger(trackIndex) ? trackIndex : 0;
  return TRACK_COLOURS[((safeIndex % TRACK_COLOURS.length) + TRACK_COLOURS.length) % TRACK_COLOURS.length];
}

export function getVoiceLabel(voiceType) {
  return VOICE_LABELS[voiceType] ?? String(voiceType || "voice");
}
