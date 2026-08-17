import assert from "node:assert/strict";
import test from "node:test";

import { createSurfaceHost } from "../src/v2/ui/surface-host.js";

class MockElement extends EventTarget {
  constructor(name, focusLog = []) {
    super();
    this.name = name;
    this.attributes = new Map();
    this.children = [];
    this.disabled = false;
    this.hidden = false;
    this.inert = false;
    this.isConnected = false;
    this.parentElement = null;
    this.focusLog = focusLog;
  }

  focus() {
    this.focusLog.push(this.name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...children) {
    const setConnected = (element, connected) => {
      element.isConnected = connected;
      for (const child of element.children ?? []) setConnected(child, connected);
    };
    for (const child of this.children) {
      setConnected(child, false);
      child.parentElement = null;
    }
    this.children = children;
    for (const child of children) {
      child.parentElement = this;
      setConnected(child, this.isConnected);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  closest(selector) {
    if (selector === '[data-owns-escape="true"]' && this.getAttribute("data-owns-escape") === "true") {
      return this;
    }
    return this.parentElement?.closest?.(selector) ?? null;
  }
}

function primary(kind, id, name = `${id}, ${kind}`) {
  return kind === "piano-roll"
    ? { kind, patternId: id, name }
    : { kind, projectId: id, name };
}

function device(kind, id, name = `${id}, ${kind}`) {
  return { kind, instanceId: id, name };
}

function createHarness({ mobile = false, ownsEscape } = {}) {
  const focusLog = [];
  const disposalLog = [];
  const renderLog = [];
  const launcherByDevice = new Map();
  const primaryContainer = new MockElement("primary-container", focusLog);
  const deviceContainer = new MockElement("device-container", focusLog);
  primaryContainer.isConnected = true;
  deviceContainer.isConnected = true;
  const keyboardTarget = new EventTarget();

  function renderPrimary(surface, { signal }) {
    renderLog.push(`primary:${surface.kind}:${surface.id}`);
    const element = new MockElement(`primary-element:${surface.id}`, focusLog);
    const entry = new MockElement(`primary-entry:${surface.id}`, focusLog);
    entry.parentElement = element;
    element.replaceChildren(entry);
    const launchers = new Map();
    for (const instanceId of ["instrument-1", "effect-1", "effect-2"]) {
      const launcher = new MockElement(`launcher:${surface.id}:${instanceId}`, focusLog);
      launcher.parentElement = element;
      launcher.isConnected = true;
      launchers.set(instanceId, launcher);
      launcherByDevice.set(`${surface.id}:${instanceId}`, launcher);
    }
    return {
      element,
      focusEntry: entry,
      getLauncher(requestedDevice) {
        return launchers.get(requestedDevice.id);
      },
      dispose() {
        assert.equal(signal.aborted, true);
        disposalLog.push(`primary:${surface.kind}:${surface.id}`);
        for (const launcher of launchers.values()) launcher.isConnected = false;
      },
    };
  }

  function renderDevice(surface, { signal }) {
    renderLog.push(`device:${surface.kind}:${surface.id}`);
    const element = new MockElement(`device-element:${surface.id}`, focusLog);
    const entry = new MockElement(`device-entry:${surface.id}`, focusLog);
    entry.parentElement = element;
    element.replaceChildren(entry);
    return {
      element,
      focusEntry: entry,
      dispose() {
        assert.equal(signal.aborted, true);
        disposalLog.push(`device:${surface.kind}:${surface.id}`);
      },
    };
  }

  const focus = {
    focus(element) {
      element.focus();
      return true;
    },
    isConnected: (element) => element?.isConnected !== false,
    isVisible: (element) => {
      for (let current = element; current; current = current.parentElement) {
        if (current.hidden || current.inert || current.getAttribute?.("aria-hidden") === "true") return false;
      }
      return true;
    },
    isEnabled: (element) => element?.disabled !== true
      && element?.getAttribute?.("aria-disabled") !== "true",
  };
  const switcher = new MockElement("global-switcher", focusLog);
  switcher.isConnected = true;
  const host = createSurfaceHost({
    primaryContainer,
    deviceContainer,
    renderPrimary,
    renderDevice,
    focus,
    keyboardTarget,
    surfaceSwitcher: switcher,
    mobile,
    ownsEscape,
  });
  return {
    deviceContainer,
    disposalLog,
    focusLog,
    host,
    keyboardTarget,
    launcherByDevice,
    primaryContainer,
    renderLog,
    switcher,
  };
}

test("host mounts one named primary and disposes the replaced owner", () => {
  const harness = createHarness();
  harness.host.activatePrimary(primary("piano-roll", "pattern-1", "Pattern 1, Piano Roll"));

  assert.equal(harness.primaryContainer.children.length, 1);
  assert.equal(harness.primaryContainer.getAttribute("data-surface-kind"), "piano-roll");
  assert.equal(harness.host.getPrimaryOwner().focusEntry.getAttribute("aria-label"), "Pattern 1, Piano Roll");
  assert.deepEqual(harness.focusLog, ["primary-entry:pattern-1"]);

  assert.equal(
    harness.host.activatePrimary(primary("piano-roll", "pattern-1", "Renamed Pattern, Piano Roll")),
    false,
  );
  assert.equal(harness.renderLog.filter((value) => value.includes("pattern-1")).length, 1);
  assert.equal(harness.disposalLog.length, 0);

  harness.host.activatePrimary(primary("playlist", "project-1", "Project, Playlist"));
  assert.equal(harness.primaryContainer.children.length, 1);
  assert.equal(harness.primaryContainer.getAttribute("data-surface-kind"), "playlist");
  assert.deepEqual(harness.disposalLog, ["primary:piano-roll:pattern-1"]);
});

test("one modeless device is reused by identity, replaced cleanly, and never marked modal", () => {
  const harness = createHarness();
  harness.host.activatePrimary(primary("mixer", "project-1"));
  const opener = new MockElement("open-instrument", harness.focusLog);
  opener.isConnected = true;

  harness.host.openDevice(device("instrument", "instrument-1", "Track 1, Klinto Chip"), { opener });
  assert.equal(harness.deviceContainer.children.length, 1);
  assert.equal(harness.deviceContainer.getAttribute("role"), "region");
  assert.equal(harness.deviceContainer.getAttribute("aria-modal"), null);
  assert.equal(harness.host.getDeviceOwner().element.getAttribute("role"), "region");
  assert.equal(harness.host.getDeviceOwner().element.getAttribute("aria-modal"), null);

  assert.equal(harness.host.openDevice(device("instrument", "instrument-1"), { opener }), false);
  assert.equal(harness.renderLog.filter((value) => value.includes("instrument-1")).length, 1);
  harness.host.openDevice(device("effect", "effect-1", "Track 1, Filter"), { opener });
  assert.equal(harness.deviceContainer.children.length, 1);
  assert.deepEqual(harness.disposalLog, ["device:instrument:instrument-1"]);
  assert.equal(harness.host.getSnapshot().device.id, "effect-1");
});

test("current-primary interaction preserves a device while deliberate switching closes it", () => {
  const harness = createHarness();
  const pianoRoll = primary("piano-roll", "pattern-1");
  harness.host.activatePrimary(pianoRoll);
  harness.host.openDevice(device("instrument", "instrument-1"));

  harness.host.interactWithPrimary();
  harness.host.activatePrimary(pianoRoll, { interaction: true, focusEntry: false });
  assert.equal(harness.host.getSnapshot().device.id, "instrument-1");
  assert.equal(harness.disposalLog.length, 0);

  harness.host.activatePrimary(primary("playlist", "project-1"));
  assert.equal(harness.host.getSnapshot().device, null);
  assert.equal(harness.deviceContainer.children.length, 0);
  assert.ok(harness.disposalLog.includes("device:instrument:instrument-1"));
});

test("device close validates opener then follows launcher, primary heading, and switcher fallbacks", () => {
  const harness = createHarness();
  harness.host.activatePrimary(primary("piano-roll", "pattern-1"));
  const opener = new MockElement("opener", harness.focusLog);
  opener.isConnected = true;
  harness.host.openDevice(device("effect", "effect-1"), { opener });
  harness.host.closeDevice();
  assert.equal(harness.focusLog.at(-1), "opener");

  const disconnected = new MockElement("disconnected", harness.focusLog);
  harness.host.openDevice(device("effect", "effect-1"), { opener: disconnected });
  harness.host.closeDevice();
  assert.equal(harness.focusLog.at(-1), "launcher:pattern-1:effect-1");

  harness.host.openDevice(device("effect", "effect-2"), { opener: disconnected });
  harness.launcherByDevice.get("pattern-1:effect-2").disabled = true;
  harness.host.closeDevice();
  assert.equal(harness.focusLog.at(-1), "primary-entry:pattern-1");

  harness.host.openDevice(device("effect", "effect-2"), { opener: disconnected });
  harness.launcherByDevice.get("pattern-1:effect-2").disabled = true;
  harness.host.getPrimaryOwner().focusEntry.disabled = true;
  harness.host.closeDevice();
  assert.equal(harness.focusLog.at(-1), "global-switcher");
});

test("Escape respects subcontrol and injected ownership before closing the device", () => {
  let hookOwnsEscape = true;
  const harness = createHarness({ ownsEscape: () => hookOwnsEscape });
  harness.host.activatePrimary(primary("piano-roll", "pattern-1"));
  harness.host.openDevice(device("instrument", "instrument-1"));

  const ownedControl = new MockElement("owned-control", harness.focusLog);
  ownedControl.setAttribute("data-owns-escape", "true");
  const ownedEvent = new Event("keydown", { cancelable: true });
  Object.defineProperties(ownedEvent, {
    key: { value: "Escape" },
    target: { value: ownedControl },
  });
  assert.equal(harness.host.handleKeyDown(ownedEvent), false);
  assert.ok(harness.host.getSnapshot().device);

  hookOwnsEscape = false;
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: "Escape" });
  assert.equal(harness.host.handleKeyDown(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.host.getSnapshot().device, null);
});

test("mobile device becomes the only content view and remounts a launcher before focus restoration", () => {
  const harness = createHarness({ mobile: true });
  harness.host.activatePrimary(primary("mixer", "project-1"));
  const originalLauncher = harness.launcherByDevice.get("project-1:effect-1");
  harness.host.openDevice(device("effect", "effect-1"), { opener: originalLauncher });

  assert.equal(harness.primaryContainer.children.length, 0);
  assert.equal(harness.primaryContainer.hidden, true);
  assert.equal(harness.deviceContainer.children.length, 1);
  assert.deepEqual(harness.disposalLog, ["primary:mixer:project-1"]);

  harness.host.closeDevice();
  assert.equal(harness.deviceContainer.children.length, 0);
  assert.equal(harness.primaryContainer.children.length, 1);
  assert.equal(harness.primaryContainer.hidden, false);
  assert.equal(harness.renderLog.filter((value) => value === "primary:mixer:project-1").length, 2);
  assert.equal(harness.focusLog.at(-1), "launcher:project-1:effect-1");
});

test("explicit replacement disposes all old owners even when stable IDs collide across Projects", () => {
  const harness = createHarness();
  harness.host.activatePrimary(primary("piano-roll", "pattern-1"));
  harness.host.openDevice(device("instrument", "instrument-1"));
  harness.host.replacePrimary(primary("piano-roll", "pattern-1", "Replacement Pattern 1, Piano Roll"));

  assert.equal(harness.host.getSnapshot().device, null);
  assert.equal(harness.renderLog.filter((value) => value === "primary:piano-roll:pattern-1").length, 2);
  assert.ok(harness.disposalLog.includes("device:instrument:instrument-1"));
  assert.ok(harness.disposalLog.includes("primary:piano-roll:pattern-1"));
});

test("host disposal removes listeners and is idempotent", () => {
  const harness = createHarness();
  harness.host.activatePrimary(primary("piano-roll", "pattern-1"));
  harness.host.openDevice(device("instrument", "instrument-1"));

  assert.equal(harness.host.dispose(), true);
  assert.equal(harness.host.dispose(), false);
  assert.equal(harness.primaryContainer.children.length, 0);
  assert.equal(harness.deviceContainer.children.length, 0);
  assert.equal(harness.disposalLog.filter((entry) => entry === "primary:piano-roll:pattern-1").length, 1);
  assert.equal(harness.disposalLog.filter((entry) => entry === "device:instrument:instrument-1").length, 1);

  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: "Escape" });
  harness.keyboardTarget.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
});
