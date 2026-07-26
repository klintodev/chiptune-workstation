import assert from "node:assert/strict";
import test from "node:test";

import {
  getCompositionSceneLayout,
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

test("Track lanes separate project order while Stereo uses authoritative pan", () => {
  const projection = {
    activity: [{}, {}],
    horizonSteps: 16,
    notes: [
      { ...notes[0], id: "lead", pan: 0.8, trackIndex: 0 },
      { ...notes[1], depth: notes[0].depth, id: "bass", pan: 0.8, trackIndex: 1 },
    ],
  };
  const lanes = getCompositionSceneLayout(projection, {
    height: 300,
    presentationMode: "lanes",
    width: 600,
  });
  const stereo = getCompositionSceneLayout(projection, {
    height: 300,
    presentationMode: "stereo",
    width: 600,
  });
  assert.ok(lanes.notes[0].geometry.x < lanes.notes[1].geometry.x);
  assert.equal(stereo.notes[0].geometry.x, stereo.notes[1].geometry.x);
});

test("adaptive camera keeps notes inside safe margins for wide, tall and narrow views", () => {
  const projection = {
    activity: [{}, {}],
    horizonSteps: 16,
    notes: [
      { ...notes[0], id: "low-left", note: 36, pan: -1 },
      { ...notes[1], id: "high-right", note: 96, pan: 1 },
    ],
  };
  for (const [width, height] of [[960, 300], [320, 640], [320, 180]]) {
    const scene = getCompositionSceneLayout(projection, { height, width });
    for (const { geometry } of scene.notes) {
      assert.ok(geometry.x >= 10 && geometry.x <= width - 10);
      assert.ok(geometry.y >= scene.horizonY && geometry.y <= height);
    }
  }
});

test("label collision is deterministic and never hides active note labels", () => {
  const crowded = {
    activity: [{}, {}],
    horizonSteps: 16,
    notes: Array.from({ length: 8 }, (_, index) => ({
      ...notes[index % 2],
      active: index === 7,
      depth: 0.1,
      id: `note-${index}`,
      note: 60,
      pan: 0,
      trackIndex: 0,
    })),
  };
  const first = getCompositionSceneLayout(crowded, { height: 180, width: 320 });
  const second = getCompositionSceneLayout(crowded, { height: 180, width: 320 });
  assert.deepEqual(first, second);
  assert.equal(first.notes.find(({ note }) => note.id === "note-7").labelVisible, true);
  assert.ok(first.notes.some(({ labelVisible, note }) => !labelVisible && !note.active));
});

test("duration tails follow gate and reduced motion quantises depth without changing order", () => {
  const projection = {
    activity: [{}],
    horizonSteps: 16,
    notes: [
      { ...notes[0], active: false, depth: 0.11, gate: 0.25, id: "short", stepsUntilStart: 1.2 },
      { ...notes[0], active: false, depth: 0.21, gate: 1, id: "long", stepsUntilStart: 3.2 },
    ],
  };
  const full = getCompositionSceneLayout(projection, { height: 300, width: 600 });
  const reduced = getCompositionSceneLayout(projection, { height: 300, motion: "reduced", width: 600 });
  assert.ok(full.notes[1].tailLength > full.notes[0].tailLength);
  assert.equal(reduced.notes[0].note.depth, 2 / 16);
  assert.equal(reduced.notes[1].note.depth, 4 / 16);
  assert.deepEqual(reduced.notes.map(({ note }) => note.id), ["short", "long"]);
});
