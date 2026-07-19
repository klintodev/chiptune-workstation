const NOTE_NAMES = Object.freeze([
  "C", "C\u266f", "D", "D\u266f", "E", "F",
  "F\u266f", "G", "G\u266f", "A", "A\u266f", "B",
]);

export function getNoteName(note) {
  const pitchClass = ((note % 12) + 12) % 12;
  return `${NOTE_NAMES[pitchClass]}${Math.floor(note / 12) - 1}`;
}
