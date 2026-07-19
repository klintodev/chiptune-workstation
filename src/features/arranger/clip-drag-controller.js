const DRAG_THRESHOLD = 5;
const EDGE_SCROLL_ZONE = 42;
const EDGE_SCROLL_AMOUNT = 18;

export function getTimelineStep({
  clientX,
  laneLeft,
  maxStep = Number.POSITIVE_INFINITY,
  pointerOffset = 0,
  rounding = "floor",
  stepWidth,
}) {
  if (![clientX, laneLeft, pointerOffset, stepWidth].every(Number.isFinite) || stepWidth <= 0) {
    throw new TypeError("Timeline coordinates and step width must be finite numbers.");
  }
  const round = rounding === "nearest" ? Math.round : Math.floor;
  const rawStep = round((clientX - laneLeft - pointerOffset) / stepWidth);
  return Math.min(maxStep, Math.max(0, rawStep));
}

export function createClipDragController({
  canvas,
  maxArrangementSteps,
  onDrop,
  onError = () => {},
  projectState,
  root = document,
  scrollElement,
  stepWidth,
}) {
  const lifecycle = new AbortController();
  let drag = null;
  let suppressNextClick = false;

  function clearLaneTargets() {
    for (const lane of canvas.querySelectorAll(".track-lane.drag-target")) {
      lane.classList.remove("drag-target", "invalid-drop");
    }
  }

  function cleanupDrag() {
    if (!drag) return;
    drag.sourceElement.classList.remove("drag-source");
    drag.sourceElement.removeAttribute("aria-grabbed");
    drag.ghost?.remove();
    clearLaneTargets();
    drag = null;
  }

  function createGhost() {
    const ghost = drag.sourceElement.cloneNode(true);
    ghost.classList.add("arrangement-clip-drag-ghost");
    ghost.classList.remove("selected");
    ghost.removeAttribute("aria-pressed");
    ghost.style.width = `${drag.sourceRect.width}px`;
    ghost.style.height = `${drag.sourceRect.height}px`;
    root.body.append(ghost);
    drag.sourceElement.classList.add("drag-source");
    drag.sourceElement.setAttribute("aria-grabbed", "true");
    drag.ghost = ghost;
  }

  function getTargetLane(clientY) {
    return [...canvas.querySelectorAll(".track-lane")].find((lane) => {
      const rect = lane.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    }) ?? null;
  }

  function getTimelineBounds() {
    const scrollRect = scrollElement.getBoundingClientRect();
    const headerRight = canvas.querySelector(".track-header")?.getBoundingClientRect().right
      ?? scrollRect.left;
    return {
      left: Math.max(scrollRect.left, headerRight),
      right: scrollRect.right,
      scrollRect,
    };
  }

  function autoScroll(clientX, clientY) {
    const { left, right, scrollRect } = getTimelineBounds();
    if (clientX < left + EDGE_SCROLL_ZONE) scrollElement.scrollLeft -= EDGE_SCROLL_AMOUNT;
    else if (clientX > right - EDGE_SCROLL_ZONE) scrollElement.scrollLeft += EDGE_SCROLL_AMOUNT;
    if (clientY < scrollRect.top + EDGE_SCROLL_ZONE) scrollElement.scrollTop -= EDGE_SCROLL_AMOUNT;
    else if (clientY > scrollRect.bottom - EDGE_SCROLL_ZONE) scrollElement.scrollTop += EDGE_SCROLL_AMOUNT;
  }

  function showOutsidePreview(clientX, clientY) {
    drag.candidate = null;
    drag.ghost.classList.add("invalid-drop");
    drag.ghost.style.left = `${clientX - drag.pointerOffset}px`;
    drag.ghost.style.top = `${clientY - drag.pointerOffsetY}px`;
  }

  function updateDrag(clientX, clientY) {
    autoScroll(clientX, clientY);
    const { left, right } = getTimelineBounds();
    const lane = clientX >= left && clientX <= right ? getTargetLane(clientY) : null;
    clearLaneTargets();
    if (!lane) {
      showOutsidePreview(clientX, clientY);
      return;
    }

    const laneRect = lane.getBoundingClientRect();
    const startStep = getTimelineStep({
      clientX,
      laneLeft: laneRect.left,
      maxStep: maxArrangementSteps - drag.patternLength,
      pointerOffset: drag.pointerOffset,
      rounding: "nearest",
      stepWidth,
    });
    const trackId = lane.dataset.trackId;
    const valid = projectState.canMoveClip(drag.clipId, trackId, startStep);
    drag.candidate = { startStep, trackId, valid };
    lane.classList.add("drag-target");
    lane.classList.toggle("invalid-drop", !valid);
    drag.ghost.classList.toggle("invalid-drop", !valid);
    drag.ghost.style.left = `${laneRect.left + startStep * stepWidth}px`;
    drag.ghost.style.top = `${laneRect.top + drag.sourceTopOffset}px`;
    const detail = drag.ghost.querySelector("small");
    if (detail) detail.textContent = `${startStep + 1}-${startStep + drag.patternLength}`;
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || event.target.closest('[data-action="remove-clip"]')) return;
    const sourceElement = event.target.closest(".arrangement-clip");
    if (!sourceElement || !canvas.contains(sourceElement)) return;
    const { clip } = projectState.getClip(sourceElement.dataset.clipId);
    const pattern = projectState.getPattern(clip.patternId);
    const sourceRect = sourceElement.getBoundingClientRect();
    const sourceLane = sourceElement.closest(".track-lane");
    drag = {
      candidate: null,
      clipId: clip.id,
      ghost: null,
      originX: event.clientX,
      originY: event.clientY,
      patternLength: pattern.steps.length,
      pointerId: event.pointerId,
      pointerOffset: event.clientX - sourceRect.left,
      pointerOffsetY: event.clientY - sourceRect.top,
      sourceElement,
      sourceRect,
      sourceTopOffset: sourceRect.top - sourceLane.getBoundingClientRect().top,
    };
    sourceElement.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
      if (distance < DRAG_THRESHOLD) return;
      createGhost();
    }
    event.preventDefault();
    updateDrag(event.clientX, event.clientY);
  }

  function handlePointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const completedDrag = drag.ghost !== null;
    const candidate = drag.candidate;
    const clipId = drag.clipId;
    drag.sourceElement.releasePointerCapture?.(event.pointerId);
    cleanupDrag();
    if (!completedDrag) return;

    event.preventDefault();
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 0);
    if (!candidate?.valid) {
      onError("That clip does not fit at the selected track position.");
      return;
    }
    try {
      projectState.moveClip(clipId, candidate.trackId, candidate.startStep);
      onDrop({ clipId, startStep: candidate.startStep, trackId: candidate.trackId });
      onError("");
    } catch (error) {
      onError(error.message);
    }
  }

  function handlePointerCancel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    cleanupDrag();
  }

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !drag) return;
    event.preventDefault();
    const wasDragging = drag.ghost !== null;
    drag.sourceElement.releasePointerCapture?.(drag.pointerId);
    cleanupDrag();
    if (wasDragging) {
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 0);
    }
  }, { signal: lifecycle.signal });
  canvas.addEventListener("pointerdown", handlePointerDown, { signal: lifecycle.signal });
  canvas.addEventListener("pointermove", handlePointerMove, { signal: lifecycle.signal });
  canvas.addEventListener("pointerup", handlePointerUp, { signal: lifecycle.signal });
  canvas.addEventListener("pointercancel", handlePointerCancel, { signal: lifecycle.signal });

  return Object.freeze({
    consumeClick(event) {
      if (!suppressNextClick || !event.target.closest(".arrangement-clip")) return false;
      suppressNextClick = false;
      event.preventDefault();
      return true;
    },
    dispose() {
      lifecycle.abort();
      cleanupDrag();
    },
  });
}
