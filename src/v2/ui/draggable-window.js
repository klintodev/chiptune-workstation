const INTERACTIVE_SELECTOR = "button, input, select, textarea, summary, a, [contenteditable='true']";
const KEYBOARD_STEP = 16;
const EDGE_GAP = 8;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function boundsFor(node, explicitBounds) {
  if (typeof explicitBounds === "function") return explicitBounds();
  if (explicitBounds) return explicitBounds;
  return node.closest?.(".v2-workspace-content") ?? node.ownerDocument?.documentElement;
}

export function createDraggableWindow({
  disabled = false,
  handle,
  node,
  bounds,
  onActivate,
} = {}) {
  if (!node || !handle) throw new TypeError("A draggable window requires a node and handle.");

  const lifecycle = new AbortController();
  let offsetX = 0;
  let offsetY = 0;
  let drag = null;
  let disposed = false;
  let isDisabled = Boolean(disabled);
  let suppliedAriaLabel = false;
  let suppliedTabIndex = false;

  function synchronizeHandle() {
    handle.classList.toggle("v2-window-drag-handle", !isDisabled);
    if (isDisabled) {
      delete handle.dataset.windowDragHandle;
      if (suppliedAriaLabel) handle.removeAttribute("aria-label");
      if (suppliedTabIndex) handle.removeAttribute("tabindex");
      handle.removeAttribute("title");
      suppliedAriaLabel = false;
      suppliedTabIndex = false;
      return;
    }
    handle.dataset.windowDragHandle = "true";
    if (handle.tabIndex < 0) {
      handle.tabIndex = 0;
      suppliedTabIndex = true;
    }
    if (!handle.getAttribute("aria-label")) {
      handle.setAttribute("aria-label", "Move window");
      suppliedAriaLabel = true;
    }
    handle.title = "Drag to move. Alt+Arrow keys also move this window.";
  }

  function applyPosition(nextX, nextY) {
    const boundary = boundsFor(node, bounds)?.getBoundingClientRect?.();
    const rect = node.getBoundingClientRect?.();
    if (boundary && rect) {
      const baseLeft = rect.left - offsetX;
      const baseTop = rect.top - offsetY;
      const minimumX = boundary.left + EDGE_GAP - baseLeft;
      const maximumX = boundary.right - EDGE_GAP - rect.width - baseLeft;
      const minimumY = boundary.top + EDGE_GAP - baseTop;
      const maximumY = boundary.bottom - EDGE_GAP - rect.height - baseTop;
      offsetX = clamp(nextX, Math.min(minimumX, maximumX), Math.max(minimumX, maximumX));
      offsetY = clamp(nextY, Math.min(minimumY, maximumY), Math.max(minimumY, maximumY));
    } else {
      offsetX = nextX;
      offsetY = nextY;
    }
    node.style.transform = `translate3d(${Math.round(offsetX)}px, ${Math.round(offsetY)}px, 0)`;
    return true;
  }

  function moveBy(deltaX, deltaY) {
    if (disposed || isDisabled) return false;
    return applyPosition(offsetX + deltaX, offsetY + deltaY);
  }

  function reset() {
    if (disposed) return false;
    const changed = offsetX !== 0 || offsetY !== 0 || Boolean(node.style.transform);
    offsetX = 0;
    offsetY = 0;
    node.style.removeProperty("transform");
    return changed;
  }

  function reclamp() {
    if (disposed || isDisabled) return false;
    return applyPosition(offsetX, offsetY);
  }

  function setDisabled(nextDisabled) {
    if (disposed) return false;
    const next = Boolean(nextDisabled);
    if (next === isDisabled) {
      if (!next) reclamp();
      return false;
    }
    isDisabled = next;
    if (next && drag) {
      try {
        handle.releasePointerCapture?.(drag.pointerId);
      } catch {
        // Capture may already have ended while the media query was changing.
      }
    }
    drag = null;
    delete node.dataset.dragging;
    if (isDisabled) reset();
    synchronizeHandle();
    if (!isDisabled) reclamp();
    return true;
  }

  handle.addEventListener("pointerdown", (event) => {
    if (isDisabled || event.button !== 0 || event.target.closest?.(INTERACTIVE_SELECTOR)) return;
    onActivate?.();
    drag = {
      offsetX,
      offsetY,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    node.dataset.dragging = "true";
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, { signal: lifecycle.signal });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    applyPosition(
      drag.offsetX + event.clientX - drag.x,
      drag.offsetY + event.clientY - drag.y,
    );
    event.preventDefault();
  }, { signal: lifecycle.signal });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    handle.releasePointerCapture?.(event.pointerId);
    drag = null;
    delete node.dataset.dragging;
  }
  handle.addEventListener("pointerup", finishDrag, { signal: lifecycle.signal });
  handle.addEventListener("pointercancel", finishDrag, { signal: lifecycle.signal });
  handle.addEventListener("lostpointercapture", () => {
    drag = null;
    delete node.dataset.dragging;
  }, { signal: lifecycle.signal });

  handle.addEventListener("keydown", (event) => {
    if (isDisabled || !event.altKey || !event.key.startsWith("Arrow")) return;
    onActivate?.();
    const deltas = {
      ArrowDown: [0, KEYBOARD_STEP],
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowUp: [0, -KEYBOARD_STEP],
    };
    const [deltaX, deltaY] = deltas[event.key] ?? [0, 0];
    moveBy(deltaX, deltaY);
    event.preventDefault();
    event.stopPropagation();
  }, { signal: lifecycle.signal });

  node.ownerDocument?.defaultView?.addEventListener?.("resize", reclamp, {
    signal: lifecycle.signal,
  });
  synchronizeHandle();

  return Object.freeze({
    dispose() {
      if (disposed) return false;
      disposed = true;
      lifecycle.abort();
      drag = null;
      delete node.dataset.dragging;
      node.style.removeProperty("transform");
      handle.classList.remove("v2-window-drag-handle");
      delete handle.dataset.windowDragHandle;
      if (suppliedAriaLabel) handle.removeAttribute("aria-label");
      if (suppliedTabIndex) handle.removeAttribute("tabindex");
      handle.removeAttribute("title");
      return true;
    },
    moveBy,
    reclamp,
    reset,
    setDisabled,
  });
}
