import assert from "node:assert/strict";
import test from "node:test";

import { createTrackChannel } from "../src/audio/track-channel.js";

test("a track channel is lazy and applies mixer changes through one stable destination", () => {
  let created = 0;
  let createdAnalysers = 0;
  const events = [];
  const connections = [];
  const context = {
    currentTime: 2,
    createAnalyser() {
      createdAnalysers += 1;
      return {
        connect: (destination) => connections.push(["analyser", destination]),
        disconnect() {},
        fftSize: 0,
        smoothingTimeConstant: 0,
      };
    },
    createGain() {
      created += 1;
      return {
        context,
        gain: {
          value: 0,
          cancelScheduledValues: (time) => events.push(["cancel", time]),
          linearRampToValueAtTime: (value, time) => events.push(["ramp", value, time]),
          setValueAtTime(value, time) {
            this.value = value;
            events.push(["set", value, time]);
          },
        },
        connect: (destination) => connections.push(["gain", destination]),
        disconnect() {},
      };
    },
  };
  const master = { context };
  const channel = createTrackChannel({
    getAudioTime: () => context.currentTime,
    getMasterOutputNode: () => master,
    trackId: "track-1",
  });

  channel.setVolume(0.5);
  assert.equal(created, 0);
  assert.equal(channel.getInputNode(), channel.getInputNode());
  assert.equal(created, 1);
  assert.equal(createdAnalysers, 1);
  assert.equal(channel.getObservationNode(), connections[0][1]);
  assert.equal(connections[1][1], master);
  assert.equal(channel.getObservationNode().fftSize, 256);
  assert.deepEqual(events[0], ["set", 0.5, 2]);

  channel.setMuted(true);
  assert.deepEqual(events.at(-1), ["ramp", 0, 2.015]);
});
