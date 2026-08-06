import { expect, test } from "@playwright/test";

import { startProductionServer } from "./serve-dist.mjs";

let productionServer;
const browserErrors = new WeakMap();

test.beforeAll(async () => {
  productionServer = await startProductionServer();
});

test.afterAll(async () => {
  await productionServer?.close();
});

test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto("/robots.txt");
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await Promise.all([
      "chiptune-workstation",
      "chiptune-workstation-cloud",
    ].map((name) => new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.addEventListener("success", resolve, { once: true });
      request.addEventListener("error", resolve, { once: true });
      request.addEventListener("blocked", resolve, { once: true });
    })));
  });
  await page.goto("/");
  const setup = page.getByRole("dialog", { name: "Klinto Studio" });
  await setup.getByRole("button", { name: "Start making music" }).click();
  await expect(setup).toBeHidden();
  await expect(page.locator("#audio-state")).toHaveText("Ready");
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "unexpected browser errors").toEqual([]);
});

test("Piano Roll owns transport, note drag labels, deletion, geometry, and keyboard audition", async ({ page }) => {
  const editor = page.locator(".v2-piano-canvas");
  const scroller = page.locator(".v2-piano-scroll");
  await editor.focus();
  await editor.press("Enter");
  let note = page.locator(".v2-piano-note");
  await expect(note).toHaveCount(1);

  const geometry = await editor.evaluate((canvas) => {
    const noteElement = canvas.querySelector(".v2-piano-note");
    return {
      backgroundOrigins: getComputedStyle(canvas).backgroundPositionX
        .split(",")
        .map((value) => value.trim()),
      labelWidth: canvas.style.getPropertyValue("--v2-piano-label-width"),
      noteLeft: noteElement.offsetLeft,
    };
  });
  expect(geometry).toEqual({
    backgroundOrigins: ["88px", "88px"], labelWidth: "88px", noteLeft: 88,
  });

  await page.locator(".v2-action-menu").getByText("Pattern actions", { exact: true }).click();
  await expect(page.getByLabel("Pattern length")).toHaveCount(0);

  await editor.focus();
  await editor.press("Escape");
  for (let index = 0; index < 4; index += 1) await editor.press("ArrowRight");
  await editor.press("Enter");
  await expect(page.locator(".v2-piano-note")).toHaveCount(2);
  await expect(page.locator(".v2-pattern-library-drag small")).toHaveText("120 ticks");
  await editor.press("Delete");
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);
  await expect(page.locator(".v2-pattern-library-drag small")).toHaveText("24 ticks");

  await expect(page.getByRole("button", { name: "Open Instrument" })).toHaveCount(0);
  await expect(page.locator("#v2-editor-host").getByRole("button", { name: "Zoom in" })).toHaveCount(0);
  await expect(page.locator("#v2-editor-host").getByRole("button", { name: "Zoom out" })).toHaveCount(0);

  const zoom = await scroller.evaluate((element) => {
    const canvas = element.querySelector(".v2-piano-canvas");
    const rect = element.getBoundingClientRect();
    const anchorClientX = rect.left + element.clientWidth * 0.75;
    const anchorWithinViewport = anchorClientX - rect.left;
    const beforePixelsPerTick = Number(
      canvas.style.getPropertyValue("--v2-pixels-per-tick"),
    );
    const beforeScrollLeft = element.scrollLeft;
    const ordinaryEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: anchorClientX,
      ctrlKey: false,
      deltaY: -100,
    });
    canvas.dispatchEvent(ordinaryEvent);
    const ownedEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: anchorClientX,
      ctrlKey: true,
      deltaY: -100,
    });
    canvas.dispatchEvent(ownedEvent);
    return {
      afterPixelsPerTick: Number(canvas.style.getPropertyValue("--v2-pixels-per-tick")),
      afterScrollLeft: element.scrollLeft,
      anchorWithinViewport,
      beforePixelsPerTick,
      beforeScrollLeft,
      scrollable: element.scrollWidth > element.clientWidth,
      ordinaryDefaultPrevented: ordinaryEvent.defaultPrevented,
      ownedDefaultPrevented: ownedEvent.defaultPrevented,
    };
  });
  expect(zoom.ordinaryDefaultPrevented).toBe(false);
  expect(zoom.ownedDefaultPrevented).toBe(true);
  expect(zoom.afterPixelsPerTick).toBeGreaterThan(zoom.beforePixelsPerTick);
  if (zoom.scrollable) {
    const anchorTickBefore = (
      zoom.beforeScrollLeft + zoom.anchorWithinViewport - 88
    ) / zoom.beforePixelsPerTick;
    const anchorTickAfter = (
      zoom.afterScrollLeft + zoom.anchorWithinViewport - 88
    ) / zoom.afterPixelsPerTick;
    expect(Math.abs(anchorTickAfter - anchorTickBefore)).toBeLessThan(0.5);
  }
  await editor.focus();
  await editor.press("Control+-");
  await expect(editor).toBeFocused();

  const scrollTop = await scroller.evaluate((element) => element.scrollTop);
  await editor.press("Space");
  await expect(page.getByRole("button", { name: /Pause pattern/i })).toBeVisible();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(scrollTop);
  const repeatedSpacePrevented = await editor.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      bubbles: true, cancelable: true, code: "Space", key: " ", repeat: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(repeatedSpacePrevented).toBe(true);
  await expect(page.getByRole("button", { name: /Pause pattern/i })).toBeVisible();
  await editor.press("Space");
  await expect(page.getByRole("button", { name: /Play pattern/i })).toBeVisible();

  const originalPitch = await note.locator(".v2-piano-note-label").textContent();
  await note.scrollIntoViewIfNeeded();
  const noteBox = await note.boundingBox();
  expect(noteBox).not.toBeNull();
  await page.mouse.move(noteBox.x + 6, noteBox.y + noteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(noteBox.x + 6, noteBox.y + noteBox.height / 2 - 26);
  await expect(note.locator(".v2-piano-note-label")).not.toHaveText(originalPitch);
  const draggedPitch = await note.locator(".v2-piano-note-label").textContent();
  await expect(note).toHaveAttribute("aria-label", new RegExp(`^${draggedPitch}`));
  await page.mouse.up();
  note = page.locator(".v2-piano-note");
  await expect(note.locator(".v2-piano-note-label")).toHaveText(draggedPitch);
  await expect(note).toHaveAttribute("aria-label", new RegExp(`^${draggedPitch}`));

  const emptyContextMenuPrevented = await editor.evaluate((canvas) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, button: 2,
    });
    canvas.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(emptyContextMenuPrevented).toBe(true);
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);
  await note.click({ button: "right" });
  await expect(page.locator(".v2-piano-note")).toHaveCount(0);
  await expect(editor).toBeFocused();
  await editor.press("Control+z");
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);

  await editor.focus();
  await page.keyboard.down("z");
  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  const trackMeter = page.locator('[data-channel-id="track-1"] .v2-channel-meter');
  await expect.poll(() => trackMeter.evaluate((meter) => meter.value)).toBeGreaterThan(0);
  await page.keyboard.up("z");
});
