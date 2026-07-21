import assert from "node:assert/strict";
import test from "node:test";

import { renderSignalStackFrame } from "../src/visualiser/signal-stack-renderer.js";

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

const tracks = Object.freeze([
  {
    audible: true,
    colour: "#f0a6c8",
    features: {
      amplitude: 0.5,
      frequencies: new Uint8Array([20, 100, 220, 60]),
      treble: 0.2,
      waveform: new Uint8Array([128, 190, 80, 140]),
    },
    gain: 0.8,
    name: "Lead",
    voiceLabel: "pulse 50%",
    voiceType: "square",
  },
  {
    audible: true,
    colour: "#f2b48c",
    features: {
      amplitude: 0.6,
      frequencies: new Uint8Array([30, 60, 180, 230]),
      treble: 0.8,
      waveform: new Uint8Array([128, 150, 110, 128]),
    },
    gain: 0.7,
    name: "Drums",
    voiceLabel: "noise",
    voiceType: "noise",
  },
]);

test("signal stack renders one deterministic, labelled lane per track", () => {
  const first = createContext();
  const second = createContext();
  const options = { height: 240, ratio: 1, reducedMotion: true, time: 900, width: 480 };
  const layout = renderSignalStackFrame(first, tracks, options);
  renderSignalStackFrame(second, tracks, options);

  assert.equal(layout.laneCount, 2);
  assert.equal(layout.laneHeight, 120);
  assert.deepEqual(first.commands, second.commands);
  assert.ok(first.commands.some((command) => command[0] === "text" && command[3] === "Lead"));
  assert.ok(first.commands.some((command) => command[0] === "text" && command[3] === "NOISE"));
  assert.ok(first.commands.filter((command) => command[0] === "rect").length > 20);
});

test("signal stack keeps an informative empty state", () => {
  const context = createContext();
  const layout = renderSignalStackFrame(context, [], { height: 120, width: 320 });
  assert.equal(layout.laneCount, 0);
  assert.ok(context.commands.some((command) => command.includes("ADD A TRACK TO BUILD A SIGNAL STACK")));
});
