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
  await setup.getByRole("button", { name: "Continue without sound" }).click();

  const pianoRoll = page.locator(".v2-piano-canvas");
  await pianoRoll.focus();
  await pianoRoll.press("Enter");
  await page.getByRole("button", { name: "Add to Playlist" }).click();
  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "unexpected browser errors").toEqual([]);
});

test("Playlist is one managed grid Tab stop and Escape restores its navigation cursor", async ({ page }) => {
  const timeline = page.locator(".v2-playlist-timeline");
  const clip = page.locator(".v2-playlist-clip");

  await expect(timeline).toHaveAttribute("role", "grid");
  await expect(timeline).toHaveAttribute("tabindex", "0");
  await expect(clip).toHaveAttribute("tabindex", "-1");
  await clip.focus();
  await expect(clip).toBeFocused();
  await clip.press("Escape");
  await expect(timeline).toBeFocused();
  await expect(clip).toHaveAttribute("aria-selected", "false");
  await expect(timeline).toHaveAttribute("aria-activedescendant", "v2-playlist-cursor");

  await timeline.press("Enter");
  await expect(clip).toBeFocused();
  await expect(clip).toHaveAttribute("aria-selected", "true");
  await clip.press("Escape");
  await expect(timeline).toBeFocused();

  await expect.poll(() => timeline.evaluate((grid) => {
    const gridCells = [...grid.querySelectorAll('[role="gridcell"]')];
    return {
      directGridCells: [...grid.children].filter((child) => child.getAttribute("role") === "gridcell").length,
      everyCellOwnedByRow: gridCells.every((cell) => cell.closest('[role="row"]')?.parentElement === grid),
      rowCount: grid.querySelectorAll(':scope > [role="row"]').length,
    };
  })).toEqual({ directGridCells: 0, everyCellOwnedByRow: true, rowCount: 1 });

  await page.getByRole("button", { name: "+ Add Instrument" }).click();
  const trackFocus = page.locator(".v2-playlist-track-focus");
  await expect(trackFocus).toHaveCount(2);
  await expect(trackFocus.last()).toBeFocused();
  await expect.poll(() => timeline.locator("button").evaluateAll((buttons) => (
    buttons.filter((button) => button.tabIndex >= 0).length
  ))).toBe(0);

  await trackFocus.last().press("Escape");
  await expect(timeline).toBeFocused();
  await timeline.press("Home");
  await expect(trackFocus.last()).toBeFocused();

  const instruments = page.locator(".v2-playlist-instrument");
  await trackFocus.last().press("ArrowRight");
  await expect(instruments.last()).toBeFocused();
  await instruments.last().press("ArrowUp");
  await expect(instruments.first()).toBeFocused();
  await instruments.first().press("Escape");
  await expect(timeline).toBeFocused();
  await expect(page.locator(".v2-playlist-lane.is-destination")).toHaveAttribute("data-track-id", "track-1");

  await timeline.press("Tab");
  await expect.poll(() => timeline.evaluate((grid) => (
    document.activeElement !== grid && !grid.contains(document.activeElement)
  ))).toBe(true);
});
