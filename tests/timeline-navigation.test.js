import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TIMELINE_STEP_WIDTH,
  MAX_TIMELINE_STEP_WIDTH,
  MIN_TIMELINE_STEP_WIDTH,
  clampTimelineStepWidth,
  getFitSongStepWidth,
  getOverviewScrollLeft,
  getTimelineViewport,
} from "../src/features/arranger/timeline-navigation.js";

test("timeline zoom is bounded and exposes a documented default", () => {
  assert.equal(DEFAULT_TIMELINE_STEP_WIDTH, 14);
  assert.equal(clampTimelineStepWidth(1), MIN_TIMELINE_STEP_WIDTH);
  assert.equal(clampTimelineStepWidth(99), MAX_TIMELINE_STEP_WIDTH);
  assert.equal(clampTimelineStepWidth(13.6), 14);
});

test("Fit song frames occupied content instead of the maximum timeline", () => {
  assert.equal(getFitSongStepWidth(16, 688, 224), 28);
  assert.equal(getFitSongStepWidth(64, 688, 224), 7);
  assert.equal(getFitSongStepWidth(256, 688, 224), MIN_TIMELINE_STEP_WIDTH);
});

test("overview viewport movement is deterministic and bounded", () => {
  const viewport = getTimelineViewport({
    maximumSteps: 256,
    scrollLeft: 896,
    stepWidth: 14,
    viewportWidth: 896,
  });
  assert.equal(viewport.start, 0.25);
  assert.equal(viewport.width, 0.25);
  assert.equal(getOverviewScrollLeft({
    clientRatio: 0,
    maximumSteps: 256,
    stepWidth: 14,
    viewportWidth: 896,
  }), 0);
  assert.equal(getOverviewScrollLeft({
    clientRatio: 1,
    maximumSteps: 256,
    stepWidth: 14,
    viewportWidth: 896,
  }), 2688);
});
