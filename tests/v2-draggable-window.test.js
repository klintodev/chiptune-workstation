import assert from "node:assert/strict";
import test from "node:test";

import { createDraggableWindow } from "../src/v2/ui/draggable-window.js";

class MockClassList {
  #values = new Set();

  add(value) { this.#values.add(value); }
  contains(value) { return this.#values.has(value); }
  remove(value) { this.#values.delete(value); }
  toggle(value, force) {
    if (force) this.#values.add(value);
    else this.#values.delete(value);
    return Boolean(force);
  }
}

class MockStyle {
  transform = "";

  removeProperty(name) {
    if (name === "transform") this.transform = "";
  }
}

class MockHandle extends EventTarget {
  constructor() {
    super();
    this.attributes = new Map();
    this.classList = new MockClassList();
    this.dataset = {};
    this.tabIndex = -1;
    this.title = "";
  }

  closest() { return null; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "tabindex") this.tabIndex = -1;
    if (name === "title") this.title = "";
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

function translation(transform) {
  const match = /translate3d\((-?\d+)px, (-?\d+)px/.exec(transform);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

function createHarness() {
  const view = new EventTarget();
  const boundary = { bottom: 200, left: 0, right: 300, top: 0 };
  const bounds = { getBoundingClientRect: () => ({ ...boundary }) };
  const handle = new MockHandle();
  const node = {
    closest: () => bounds,
    dataset: {},
    ownerDocument: { defaultView: view },
    style: new MockStyle(),
    getBoundingClientRect() {
      const { x, y } = translation(this.style.transform);
      return { bottom: 80 + y, height: 80, left: x, right: 100 + x, top: y, width: 100 };
    },
  };
  return { boundary, handle, node, view };
}

test("draggable windows dynamically disable and re-clamp after ordinary viewport resize", () => {
  const { boundary, handle, node, view } = createHarness();
  let activations = 0;
  const draggable = createDraggableWindow({
    handle,
    node,
    onActivate: () => { activations += 1; },
  });

  assert.equal(handle.classList.contains("v2-window-drag-handle"), true);
  assert.equal(handle.dataset.windowDragHandle, "true");
  assert.equal(handle.tabIndex, 0);
  assert.equal(draggable.moveBy(500, 500), true);
  assert.equal(node.style.transform, "translate3d(192px, 112px, 0)");

  boundary.right = 180;
  boundary.bottom = 140;
  view.dispatchEvent(new Event("resize"));
  assert.equal(node.style.transform, "translate3d(72px, 52px, 0)");

  assert.equal(draggable.setDisabled(true), true);
  assert.equal(node.style.transform, "");
  assert.equal(handle.classList.contains("v2-window-drag-handle"), false);
  assert.equal(draggable.moveBy(16, 16), false);

  assert.equal(draggable.setDisabled(false), true);
  const key = new Event("keydown", { cancelable: true });
  Object.defineProperties(key, {
    altKey: { value: true },
    key: { value: "ArrowRight" },
  });
  handle.dispatchEvent(key);
  assert.equal(activations, 1);
  assert.equal(node.style.transform, "translate3d(24px, 8px, 0)");

  assert.equal(draggable.dispose(), true);
  assert.equal(handle.classList.contains("v2-window-drag-handle"), false);
  assert.equal(draggable.setDisabled(false), false);
});
