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
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "unexpected browser errors").toEqual([]);
});

async function createCursorNote(page) {
  const pianoRoll = page.locator(".v2-piano-canvas");
  await pianoRoll.focus();
  await pianoRoll.press("Enter");
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);
}

async function createNewPattern(page) {
  const actions = page.locator(".v2-action-menu");
  await actions.getByText("Pattern actions", { exact: true }).click();
  await actions.getByRole("button", { name: "New Pattern", exact: true }).click();
}

test("Playlist exposes Pattern adding, clear Track actions, instrument routes, playhead wording and Loop scope", async ({ page }) => {
  await createCursorNote(page);
  await createNewPattern(page);
  await createCursorNote(page);
  await page.getByRole("button", { name: "Playlist", exact: true }).click();

  const patternSelect = page.getByLabel("Pattern to add");
  await expect(patternSelect.locator("option")).toHaveCount(2);
  await patternSelect.selectOption("pattern-1");
  const addPattern1 = page.getByRole("button", { name: /Add Pattern 1 to Pulse 1/ });
  await expect(addPattern1).toBeEnabled();
  await addPattern1.click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);

  await patternSelect.selectOption("pattern-2");
  await page.getByRole("button", { name: /Add Pattern 2 to Pulse 1/ }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(2);
  await expect(page.locator("#playback-mode")).toHaveValue("song");

  await page.getByRole("button", { name: "Add Track", exact: true }).click();
  const destinations = page.locator(".v2-playlist-track-focus");
  await expect(destinations).toHaveCount(2);
  await expect(destinations.first()).toHaveAttribute("aria-pressed", "false");
  await expect(destinations.last()).toHaveAttribute("aria-pressed", "true");
  await destinations.first().click();
  await expect(destinations.first()).toHaveAttribute("aria-pressed", "true");
  await expect(destinations.last()).toHaveAttribute("aria-pressed", "false");

  await destinations.last().click();
  await patternSelect.selectOption("pattern-1");
  await page.getByRole("button", { name: /Add Pattern 1 to Track 2/ }).click();
  const routedClip = page.locator('.v2-playlist-lane[data-track-id="track-2"] .v2-playlist-clip');
  await expect(routedClip).toHaveCount(1);
  await expect(routedClip).toContainText("Pattern 1");
  await expect(routedClip).toHaveAccessibleName(/Pattern 1, Track 2/);
  await expect(routedClip).toHaveAttribute("aria-selected", "true");
  await expect(routedClip).toBeFocused();
  await destinations.first().click();

  const destination = destinations.first();
  await expect(destination).toHaveAccessibleName("Use Pulse 1 as the Playlist destination");
  await expect(destination).toHaveAttribute("aria-pressed", "true");
  await expect(destination.locator("span")).toHaveText("Pulse 1");
  await expect(destination.locator("small")).toHaveText("Destination");

  const playlistInstrument = page.locator(".v2-playlist-instrument").first();
  await expect(playlistInstrument).toHaveAccessibleName("Open Pulse 1 Klinto Chip instrument");
  await expect(playlistInstrument.locator("span")).toHaveText("Klinto Chip");
  await expect(playlistInstrument.locator("small")).toHaveText("Instrument");
  await expect.poll(() => playlistInstrument.locator("span").evaluate((label) => (
    label.scrollWidth <= label.clientWidth
  ))).toBe(true);
  await playlistInstrument.click();
  await expect(page.locator("#v2-device-host")).toHaveAttribute("data-surface-kind", "instrument");
  await expect(page.locator('[data-device-action="reset"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(playlistInstrument).toBeFocused();

  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  const mixerInstrument = page.locator('[data-channel-id="track-1"][data-mixer-control="instrument"]');
  await mixerInstrument.click();
  await expect(page.locator("#v2-device-host")).toHaveAttribute("data-surface-kind", "instrument");
  await expect(page.locator('[data-device-action="reset"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(mixerInstrument).toBeFocused();

  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  const selectedClip = page.locator(".v2-playlist-clip").last();
  await selectedClip.click();
  await expect(page.getByRole("button", { name: /Move Song playhead to the selected clip/ })).toBeVisible();
  await selectedClip.focus();
  await selectedClip.press("Escape");
  await expect(page.getByRole("button", { name: /Move Song playhead to the Playlist cursor/ })).toBeVisible();
  await expect(page.getByText("Seek Song here", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/seeks the Song/i)).toHaveCount(0);
  await expect(page.getByTitle(/Start Song playback/)).toHaveCount(0);

  const loopSummary = page.locator("#loop-summary");
  await expect(loopSummary).toHaveText("Song loop: Off");
  await loopSummary.click();
  await expect(page.getByText("Pattern playback always repeats. These settings control Song playback only.")).toBeVisible();
  await page.getByLabel("Enable Song loop").check();
  await expect(loopSummary).toHaveText("Song loop: On");
  await page.locator("#playback-mode").selectOption("pattern");
  await expect(loopSummary).toHaveText("Pattern repeats");
});
