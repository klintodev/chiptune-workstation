export const DEFAULT_TIMELINE_STEP_WIDTH = 14;
export const MIN_TIMELINE_STEP_WIDTH = 7;
export const MAX_TIMELINE_STEP_WIDTH = 28;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampTimelineStepWidth(value) {
  if (!Number.isFinite(value)) throw new TypeError("Timeline density must be a number.");
  return clamp(Math.round(value), MIN_TIMELINE_STEP_WIDTH, MAX_TIMELINE_STEP_WIDTH);
}

export function getFitSongStepWidth(occupiedSteps, viewportWidth, headerWidth = 224) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= headerWidth) {
    return MIN_TIMELINE_STEP_WIDTH;
  }
  return clampTimelineStepWidth((viewportWidth - headerWidth - 16) / Math.max(1, occupiedSteps));
}

export function getTimelineViewport({
  maximumSteps,
  scrollLeft,
  stepWidth,
  viewportWidth,
}) {
  const totalWidth = maximumSteps * stepWidth;
  const width = clamp(viewportWidth / Math.max(1, totalWidth), 0, 1);
  const start = clamp(scrollLeft / Math.max(1, totalWidth), 0, Math.max(0, 1 - width));
  return Object.freeze({ start, width });
}

export function getOverviewScrollLeft({
  clientRatio,
  maximumSteps,
  stepWidth,
  viewportWidth,
}) {
  const totalWidth = maximumSteps * stepWidth;
  const maximumScroll = Math.max(0, totalWidth - viewportWidth);
  return clamp(clientRatio * totalWidth - viewportWidth / 2, 0, maximumScroll);
}
