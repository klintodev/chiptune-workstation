export const DEFAULT_VISUALISER_PALETTE = "arcade";

const DEFINITIONS = [
  {
    id: "arcade",
    name: "Studio",
    description: "Klinto violet with candy-pink track colours.",
    background: "#211b28",
    grid: "#40374d",
    ink: "#f3ecf7",
    muted: "#a99bbd",
    tracks: ["#f39bc4", "#f2b8d8", "#b7a9ec", "#f2b48c", "#9fc6ed", "#d6a7ef", "#8fd3c8", "#ef9ca8"],
  },
  {
    id: "ice",
    name: "Ice cave",
    description: "Cool cyan, lilac and frozen blue.",
    background: "#081016",
    grid: "#19303a",
    ink: "#effcff",
    muted: "#9dbbc4",
    tracks: ["#8ae8ff", "#b8a8ff", "#72c7ff", "#d2f7ff", "#9ef0df", "#d4c8ff", "#79b5d8", "#c6f6ff"],
  },
  {
    id: "sunset",
    name: "Sunset drive",
    description: "Amber, coral and rose against deep plum.",
    background: "#160914",
    grid: "#3d1d36",
    ink: "#fff2e7",
    muted: "#c7a3aa",
    tracks: ["#ffb454", "#ff5f87", "#ff7a59", "#ffd166", "#f58fca", "#d59cff", "#ff9e64", "#f26a8d"],
  },
  {
    id: "neon",
    name: "Neon circuit",
    description: "Electric lime and magenta on CRT black.",
    background: "#080b08",
    grid: "#24301f",
    ink: "#f4ffd0",
    muted: "#9eaf91",
    tracks: ["#c8ff32", "#ff5f87", "#58f8d2", "#ffcc4d", "#8ca8ff", "#f07bff", "#7dff68", "#ff876f"],
  },
  {
    id: "ocean",
    name: "Deep ocean",
    description: "Aqua, sea-glass green and clear blue.",
    background: "#06171d",
    grid: "#17404a",
    ink: "#eaffff",
    muted: "#8db8bf",
    tracks: ["#4be4d6", "#65a8ff", "#9ee87a", "#70d6ff", "#b8f2e6", "#7bdff2", "#a8c7ff", "#59d6b9"],
  },
  {
    id: "ember",
    name: "Ember",
    description: "Copper, gold and red with a warm glow.",
    background: "#190a07",
    grid: "#4a2116",
    ink: "#fff1df",
    muted: "#c7a28c",
    tracks: ["#ff763b", "#ffc145", "#ff4d6d", "#f79d65", "#ffe169", "#e85d75", "#ff9f1c", "#f28482"],
  },
  {
    id: "candy",
    name: "Candy pop",
    description: "Bubblegum brights with playful contrast.",
    background: "#190e1f",
    grid: "#482850",
    ink: "#fff4ff",
    muted: "#c6a6ca",
    tracks: ["#ff7bd5", "#8ce7ff", "#c6ff73", "#ffc66d", "#b8a1ff", "#ff8fa3", "#76f2c5", "#f6a6ff"],
  },
  {
    id: "handheld",
    name: "Handheld",
    description: "Four-shade greens from a pocket console.",
    background: "#0f380f",
    grid: "#306230",
    ink: "#e7f5c5",
    muted: "#9bbc76",
    tracks: ["#9bbc0f", "#8bac0f", "#cadc9f", "#6c9c3a", "#d6e86e", "#a8c851", "#f0f4bf", "#77b255"],
  },
];

export const VISUALISER_PALETTE_DEFINITIONS = Object.freeze(DEFINITIONS.map((definition) => Object.freeze({
  ...definition,
  tracks: Object.freeze([...definition.tracks]),
})));

export const VISUALISER_PALETTE_IDS = Object.freeze(
  VISUALISER_PALETTE_DEFINITIONS.map(({ id }) => id),
);

const PALETTE_BY_ID = new Map(
  VISUALISER_PALETTE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getVisualiserPalette(id = DEFAULT_VISUALISER_PALETTE) {
  return PALETTE_BY_ID.get(id) ?? PALETTE_BY_ID.get(DEFAULT_VISUALISER_PALETTE);
}

export function getVisualiserTrackColour(paletteId, trackIndex) {
  const palette = getVisualiserPalette(paletteId);
  const safeIndex = Number.isInteger(trackIndex) ? trackIndex : 0;
  return palette.tracks[
    ((safeIndex % palette.tracks.length) + palette.tracks.length) % palette.tracks.length
  ];
}
