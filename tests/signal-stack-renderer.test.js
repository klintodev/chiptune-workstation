import assert from "node:assert/strict";
import test from "node:test";

import {
  getProjectedNoteGeometry,
  renderCompositionFrame,
} from "../src/visualiser/signal-stack-renderer.js";

function createContext() {
  const commands = [];
  return {
    commands,
    fillRect(...values) {
      commands.push(["rect", this.fillStyle, this.globalAlpha, ...values]);
    },
    fillText(...values) {
      commands.push(["text", this.fillStyle, this.globalAlpha, ...values]);
    },
    fillStyle: "",
    font: "",
    globalAlpha: 1,
    textAlign: "start",
    textBaseline: "alphabetic",
  };
}

const notes = Object.freeze([
  Object.freeze({
    active: true,
    colour: "#f0a6c8",
    depth: 0,
    life: 0.8,
    note: 60,
    noteLabel: "C4",
    pan: -0.75,
    pitch: 0.32,
    trackIndex: 0,
    trackName: "Lead",
    velocity: 0.8,
    voiceType: "square",
  }),
  Object.freeze({
    active: false,
    colour: "#f2b48c",
    depth: 0.32,
    life: 1,
    note: 48,
    noteLabel: "C3",
    pan: 0.7,
    pitch: 0.16,
    trackIndex: 1,
    trackName: "Drums",
    velocity: 0.7,
    voiceType: "noise",
  }),
]);

test("composition field renders deterministic, labelled note objects", () => {
  const first = createContext();
  const second = createContext();
  const projection = { notes };
  const options = { height: 300, ratio: 1, width: 520 };
  const layout = renderCompositionFrame(first, projection, options);
  renderCompositionFrame(second, projection, options);

  assert.equal(layout.noteCount, 2);
  assert.deepEqual(first.commands, second.commands);
  assert.ok(first.commands.some((command) => command[0] === "text" && command[3] === "LEAD"));
  assert.ok(first.commands.some((command) => command[0] === "text" && command[3] === "C4"));
  assert.ok(first.commands.filter((command) => command[0] === "rect").length > 100);
});

test("track pan maps directly to horizontal visual position", () => {
  const base = { depth: 0.2, pan: 0, pitch: 0.5, velocity: 0.7 };
  const options = { height: 300, width: 600 };
  const left = getProjectedNoteGeometry({ ...base, pan: -1 }, options);
  const centre = getProjectedNoteGeometry(base, options);
  const right = getProjectedNoteGeometry({ ...base, pan: 1 }, options);

  assert.ok(left.x < centre.x);
  assert.ok(centre.x < right.x);
  assert.equal(centre.y, left.y);
  assert.equal(centre.radius, right.radius);
});

test("composition field keeps an informative empty state", () => {
  const context = createContext();
  const layout = renderCompositionFrame(context, { notes: [] }, { height: 120, width: 320 });
  assert.equal(layout.noteCount, 0);
  assert.ok(context.commands.some((command) => command.includes("PROGRAM NOTES TO BUILD THE VISUAL FIELD")));
});
