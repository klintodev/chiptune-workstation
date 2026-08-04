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
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "Continue without sound" }).click();
  await expect(setup).toBeHidden();
  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "mixer");
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "unexpected browser errors").toEqual([]);
});

async function expectFocused(locator) {
  await expect(locator).toBeFocused();
  await expect.poll(() => locator.evaluate((element) => element === document.activeElement)).toBe(true);
}

test("Mixer preserves live controls and stable effect focus through every insert mutation", async ({ page }) => {
  const volume = page.locator('[data-channel-id="track-1"][data-mixer-control="volume"]');
  await volume.focus();
  await volume.press("ArrowLeft");
  await expect(volume).toHaveValue("0.99");
  await expectFocused(volume);
  await volume.press("ArrowLeft");
  await expect(volume).toHaveValue("0.98");
  await expectFocused(volume);

  await volume.dispatchEvent("pointerdown", { buttons: 1, pointerId: 1, pointerType: "mouse" });
  await expect(volume).toHaveAttribute("data-history-owner", "true");
  await volume.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse" });
  await expect(volume).not.toHaveAttribute("data-history-owner");

  await expect(page.locator('[data-channel-id="track-1"][data-mixer-control="instrument"]'))
    .toHaveAccessibleName("Open Pulse 1 Klinto Chip instrument");
  await expect(page.locator('[data-channel-id="track-1"][data-mixer-control="mute"]'))
    .toHaveAccessibleName("Mute Pulse 1 Mixer channel");
  await expect(page.locator('[data-channel-id="track-1"][data-mixer-control="solo"]'))
    .toHaveAccessibleName("Solo Pulse 1 Mixer channel");
  await expect(page.locator('[data-channel-id="track-1"][data-empty-action="picker"]'))
    .toHaveAccessibleName("Insert 1 Effect type for Pulse 1");
  await expect(page.locator('[data-channel-id="track-1"][data-empty-action="add"]'))
    .toHaveAccessibleName("Add Effect in slot 1 for Pulse 1");
  await expect(page.locator('[data-channel-id="master"][data-empty-action="add"]'))
    .toHaveAccessibleName("Add Effect in slot 1 for Master");

  const pulseEffects = page.getByLabel("Pulse 1 Effects");
  await pulseEffects.getByRole("button", { name: "Add Effect in slot 1" }).click();
  await expect(page.locator("#v2-device-host")).toBeHidden();
  let activeEffect = page.locator('[data-channel-id="track-1"][data-effect-action="open"]');
  await expectFocused(activeEffect);
  await expect(activeEffect).toHaveAccessibleName("Open Pulse 1 Klinto Filter in effect slot 1");
  const filterId = await activeEffect.getAttribute("data-effect-id");

  const filterBypass = page.locator(`[data-effect-id="${filterId}"][data-effect-action="bypass"]`);
  await expect(filterBypass).toHaveAccessibleName("Bypass Pulse 1 Klinto Filter in effect slot 1");
  expect(await filterBypass.getAttribute("aria-pressed")).toBeNull();
  await filterBypass.click();
  await expect(filterBypass).toHaveText("Enable");
  await expect(filterBypass).toHaveAccessibleName("Enable Pulse 1 Klinto Filter in effect slot 1");
  expect(await filterBypass.getAttribute("aria-pressed")).toBeNull();
  await expectFocused(filterBypass);
  await filterBypass.click();
  await expect(filterBypass).toHaveText("Bypass");
  await expect(filterBypass).toHaveAccessibleName("Bypass Pulse 1 Klinto Filter in effect slot 1");
  expect(await filterBypass.getAttribute("aria-pressed")).toBeNull();
  await expectFocused(filterBypass);

  await page.locator('[data-channel-id="track-1"][data-empty-action="picker"]').selectOption("klinto-delay");
  await page.locator('[data-channel-id="track-1"][data-empty-action="add"]').click();
  activeEffect = page.locator('[data-channel-id="track-1"][data-effect-action="open"]:focus');
  await expect(activeEffect).toHaveCount(1);
  const delayId = await activeEffect.getAttribute("data-effect-id");
  expect(delayId).not.toBe(filterId);
  await expect(activeEffect).toHaveAccessibleName("Open Pulse 1 Klinto Delay in effect slot 2");
  await expect(page.locator(`[data-effect-id="${delayId}"][data-effect-action="earlier"]`))
    .toHaveAccessibleName("Move Pulse 1 Klinto Delay in effect slot 2 earlier");
  await expect(page.locator(`[data-effect-id="${delayId}"][data-effect-action="later"]`))
    .toHaveAccessibleName("Move Pulse 1 Klinto Delay in effect slot 2 later");
  await expect(page.locator(`[data-effect-id="${delayId}"][data-effect-action="remove"]`))
    .toHaveAccessibleName("Remove Pulse 1 Klinto Delay in effect slot 2");

  await page.locator(`[data-effect-id="${delayId}"][data-effect-action="earlier"]`).click();
  await expect(page.locator(`:focus[data-effect-id="${delayId}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-effect-id="${delayId}"][data-effect-action="open"]`))
    .toHaveAccessibleName("Open Pulse 1 Klinto Delay in effect slot 1");
  await expect(page.locator(`[data-effect-id="${filterId}"][data-effect-action="open"]`))
    .toHaveAccessibleName("Open Pulse 1 Klinto Filter in effect slot 2");

  await page.locator(`[data-effect-id="${delayId}"][data-effect-action="remove"]`).click();
  await expectFocused(page.locator('[data-channel-id="track-1"][data-empty-action="add"]'));

  await page.getByLabel("Open Studio menu").click();
  await page.locator("#global-undo").click();
  await expect(page.locator(`[data-effect-id="${delayId}"][data-effect-action="open"]`)).toBeVisible();
  await expect(page.locator("#v2-device-host")).toBeHidden();
  await page.locator(`[data-effect-id="${delayId}"][data-effect-action="open"]`).click();
  await page.locator('[data-device-param="timeDivision"]').selectOption("1/4");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expectFocused(page.locator(`[data-effect-id="${delayId}"][data-effect-action="open"]`));

  await page.locator('[data-mixer-control="add-track"]').click();
  const selectedTrack = page.locator('[data-mixer-control="heading"]:focus');
  await expect(selectedTrack).toHaveText("Track 2");
  await expect(page.locator('[data-mixer-control="channel-selector"]')).toHaveValue("track-2");
  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  await page.getByRole("button", { name: "Remove Track 2" }).click();
  await expect(page.locator(".v2-playlist-track-focus")).toHaveCount(1);
  await expect(page.locator(".v2-playlist-track-focus")).toBeFocused();

  await expect(page.locator("#project-save-status")).toHaveAttribute("data-state", "saved");
  await page.reload();
  const setup = page.getByRole("dialog", { name: "Klinto Studio" });
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "Continue without sound" }).click();
  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  await expect(page.locator('[data-effect-action="open"]')).toHaveCount(2);
  await expect(page.locator(`[data-effect-id="${filterId}"][data-effect-action="open"]`)).toBeVisible();
  await page.locator(`[data-effect-id="${delayId}"][data-effect-action="open"]`).click();
  await expect(page.locator('[data-device-param="timeDivision"]')).toHaveValue("1/4");
});

test("Device range cancellation closes only its owned history group and live state stays focused", async ({ page }) => {
  await page.getByLabel("Pulse 1 Effects").getByRole("button", { name: "Add Effect in slot 1" }).click();
  await page.locator('[data-channel-id="track-1"][data-effect-action="open"]').click();
  await expect(page.locator("#v2-device-host")).toHaveAttribute("data-surface-kind", "effect");

  const cutoff = page.locator('[data-device-param="cutoffHz"]');
  const initial = Number(await cutoff.inputValue());
  await cutoff.focus();
  await cutoff.press("ArrowDown");
  await expect(cutoff).toHaveValue(String(initial - 1));
  await expectFocused(cutoff);
  await cutoff.press("ArrowDown");
  await expect(cutoff).toHaveValue(String(initial - 2));
  await expectFocused(cutoff);

  await cutoff.dispatchEvent("pointerdown", { buttons: 1, pointerId: 2, pointerType: "mouse" });
  await expect(cutoff).toHaveAttribute("data-history-owner", "true");
  await cutoff.dispatchEvent("pointercancel", { pointerId: 2, pointerType: "mouse" });
  await expect(cutoff).not.toHaveAttribute("data-history-owner");

  const bypass = page.locator('[data-device-action="bypass"]');
  await expect(bypass).toHaveAccessibleName("Pulse 1 Klinto Filter bypass");
  await bypass.click();
  await expect(bypass).toHaveAttribute("aria-pressed", "true");
  await expect(bypass).toHaveAccessibleName("Pulse 1 Klinto Filter bypass");
  await expect(bypass).toHaveText("Enable Effect");
  await expectFocused(bypass);
  await bypass.click();
  await expect(bypass).toHaveAttribute("aria-pressed", "false");
  await expect(bypass).toHaveAccessibleName("Pulse 1 Klinto Filter bypass");
  await expect(bypass).toHaveText("Bypass Effect");
  await expectFocused(bypass);
});
