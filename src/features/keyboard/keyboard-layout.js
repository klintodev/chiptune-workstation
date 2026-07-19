export const LOWER_WHITE_KEYS = Object.freeze([
  { code: "KeyZ", label: "Z", note: 60, name: "C4" },
  { code: "KeyX", label: "X", note: 62, name: "D4" },
  { code: "KeyC", label: "C", note: 64, name: "E4" },
  { code: "KeyV", label: "V", note: 65, name: "F4" },
  { code: "KeyB", label: "B", note: 67, name: "G4" },
  { code: "KeyN", label: "N", note: 69, name: "A4" },
  { code: "KeyM", label: "M", note: 71, name: "B4" },
]);

export const LOWER_BLACK_KEYS = Object.freeze([
  { code: "KeyS", label: "S", note: 61, name: "C♯4" },
  { code: "KeyD", label: "D", note: 63, name: "D♯4" },
  { code: "KeyG", label: "G", note: 66, name: "F♯4" },
  { code: "KeyH", label: "H", note: 68, name: "G♯4" },
  { code: "KeyJ", label: "J", note: 70, name: "A♯4" },
]);

export const UPPER_WHITE_KEYS = Object.freeze([
  { code: "KeyQ", label: "Q", note: 72, name: "C5" },
  { code: "KeyW", label: "W", note: 74, name: "D5" },
  { code: "KeyE", label: "E", note: 76, name: "E5" },
  { code: "KeyR", label: "R", note: 77, name: "F5" },
  { code: "KeyT", label: "T", note: 79, name: "G5" },
  { code: "KeyY", label: "Y", note: 81, name: "A5" },
  { code: "KeyU", label: "U", note: 83, name: "B5" },
  { code: "KeyI", label: "I", note: 84, name: "C6" },
  { code: "KeyO", label: "O", note: 86, name: "D6" },
  { code: "KeyP", label: "P", note: 88, name: "E6" },
]);

export const UPPER_BLACK_KEYS = Object.freeze([
  { code: "Digit2", label: "2", note: 73, name: "C♯5" },
  { code: "Digit3", label: "3", note: 75, name: "D♯5" },
  { code: "Digit5", label: "5", note: 78, name: "F♯5" },
  { code: "Digit6", label: "6", note: 80, name: "G♯5" },
  { code: "Digit7", label: "7", note: 82, name: "A♯5" },
  { code: "Digit9", label: "9", note: 85, name: "C♯6" },
  { code: "Digit0", label: "0", note: 87, name: "D♯6" },
]);

export const KEYBOARD_KEYS = Object.freeze([
  ...LOWER_WHITE_KEYS,
  ...LOWER_BLACK_KEYS,
  ...UPPER_WHITE_KEYS,
  ...UPPER_BLACK_KEYS,
]);

export const KEY_BY_CODE = new Map(KEYBOARD_KEYS.map((key) => [key.code, key]));
