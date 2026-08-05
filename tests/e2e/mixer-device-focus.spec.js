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
  await page.addInitScript(() => {
    const transportFrameListeners = new Set();
    const addEventListener = EventTarget.prototype.addEventListener;
    const removeEventListener = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function addTrackedEventListener(type, listener, options) {
      if (type === "transportframe" && listener) {
        transportFrameListeners.add(listener);
        options?.signal?.addEventListener("abort", () => {
          transportFrameListeners.delete(listener);
        }, { once: true });
      }
      return addEventListener.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function removeTrackedEventListener(type, listener, options) {
      if (type === "transportframe") transportFrameListeners.delete(listener);
      return removeEventListener.call(this, type, listener, options);
    };
    Object.defineProperty(globalThis, "__v2TransportFrameListenerCount", {
      value: () => transportFrameListeners.size,
    });
  });
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

async function expectMobileOwner(page, expected) {
  await expect.poll(() => page.evaluate(() => ({
    device: document.querySelector("#v2-device-host").childElementCount > 0,
    editor: document.querySelector("#v2-editor-host").childElementCount > 0,
    listeners: globalThis.__v2TransportFrameListenerCount(),
    primary: document.querySelector("#v2-primary-host").childElementCount > 0,
  }))).toEqual({
    device: expected === "device",
    editor: expected === "piano",
    listeners: expected === "playlist" || expected === "piano" ? 1 : 0,
    primary: expected === "playlist" || expected === "mixer",
  });
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
  await expect(page.getByRole("button", { name: "Playlist", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
  await page.locator('[data-device-param="timeDivision"]').selectOption("1/4");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expectFocused(page.locator(".v2-playlist-timeline"));

  await page.getByRole("button", { name: "Mixer", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Playlist", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
  await expect(page.locator('[data-device-param="timeDivision"]')).toHaveValue("1/4");
});

test("Device range cancellation closes only its owned history group and live state stays focused", async ({ page }) => {
  await page.getByLabel("Pulse 1 Effects").getByRole("button", { name: "Add Effect in slot 1" }).click();
  await page.locator('[data-channel-id="track-1"][data-effect-action="open"]').click();
  await expect(page.getByRole("button", { name: "Playlist", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
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

test("Mixer Open and Bypass keep separate mobile hit targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Pulse 1 Effects").getByRole("button", { name: "Add Effect in slot 1" }).click();

  const open = page.locator('[data-channel-id="track-1"][data-effect-action="open"]');
  const bypass = page.locator('[data-channel-id="track-1"][data-effect-action="bypass"]');
  await expect(open).toBeVisible();
  await expect(bypass).toBeVisible();

  const [openBox, bypassBox] = await Promise.all([open.boundingBox(), bypass.boundingBox()]);
  expect(openBox).not.toBeNull();
  expect(bypassBox).not.toBeNull();
  const horizontalOverlap = Math.min(openBox.x + openBox.width, bypassBox.x + bypassBox.width)
    - Math.max(openBox.x, bypassBox.x);
  const verticalOverlap = Math.min(openBox.y + openBox.height, bypassBox.y + bypassBox.height)
    - Math.max(openBox.y, bypassBox.y);
  expect(horizontalOverlap <= 0 || verticalOverlap <= 0).toBe(true);

  await open.click();
  await expect(page.locator("#v2-device-host")).toHaveAttribute("data-surface-kind", "effect");
  await expect(page.getByRole("button", { name: "Playlist", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectFocused(page.locator(".v2-playlist-timeline"));

  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  await bypass.click();
  await expect(bypass).toHaveText("Enable");
  await expectFocused(bypass);
});

test("mobile keeps exactly one mounted surface owner and releases inactive transport work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectMobileOwner(page, "mixer");

  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  await expectMobileOwner(page, "playlist");

  await page.getByRole("button", { name: "Piano Roll", exact: true }).click();
  await expectMobileOwner(page, "piano");

  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  await expectMobileOwner(page, "playlist");
  await page.getByRole("button", { name: "Open Pulse 1 Klinto Chip instrument" }).click();
  await expectMobileOwner(page, "device");

  await page.getByRole("button", { name: "Piano Roll", exact: true }).click();
  await expectMobileOwner(page, "device");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectMobileOwner(page, "piano");
  await expectFocused(page.locator(".v2-piano-canvas"));

  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  await expectMobileOwner(page, "playlist");
  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  await expectMobileOwner(page, "mixer");

  await page.getByLabel("Pulse 1 Effects").getByRole("button", { name: "Add Effect in slot 1" }).click();
  await page.locator('[data-channel-id="track-1"][data-effect-action="open"]').click();
  await expect(page.getByRole("button", { name: "Playlist", exact: true })).toHaveAttribute("aria-current", "page");
  await expectMobileOwner(page, "device");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectMobileOwner(page, "playlist");
  await expectFocused(page.locator(".v2-playlist-timeline"));
});

test("theme changes the rendered workspace palette and the responsive header stays contained", async ({ page }) => {
  const workspace = page.locator(".v2-workspace");
  const shell = page.locator(".v2-workspace-shell");
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 800, height: 700 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => shell.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByLabel("Open Studio menu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Piano Roll", exact: true })).toBeVisible();
    const overlappingGroups = await page.locator(".v2-global-shell").evaluate((header) => {
      const visibleGroups = [...header.children].filter((element) => {
        if (element.classList.contains("visually-hidden")) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && bounds.width > 0
          && bounds.height > 0;
      });
      const overlaps = [];
      for (let index = 0; index < visibleGroups.length; index += 1) {
        const left = visibleGroups[index].getBoundingClientRect();
        for (let compared = index + 1; compared < visibleGroups.length; compared += 1) {
          const right = visibleGroups[compared].getBoundingClientRect();
          const horizontal = Math.min(left.right, right.right) - Math.max(left.left, right.left);
          const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
          if (horizontal > 0.5 && vertical > 0.5) {
            overlaps.push([visibleGroups[index].className, visibleGroups[compared].className]);
          }
        }
      }
      return overlaps;
    });
    expect(overlappingGroups).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  const darkPalette = await workspace.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });

  await page.getByLabel("Open Studio menu").click();
  const themeToggle = page.locator("#theme-toggle");
  await expect(themeToggle).toHaveAttribute("data-theme", "dark");
  await expect(themeToggle).toHaveAccessibleName("Use light theme");
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(themeToggle).toHaveAccessibleName("Use dark theme");
  await expect.poll(() => workspace.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  })).not.toEqual(darkPalette);

  const lightPalette = await workspace.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(lightPalette.background).not.toBe(darkPalette.background);
  expect(lightPalette.color).not.toBe(darkPalette.color);
});

test("mobile chrome keeps project save and audio setup beside non-overlapping controls", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    const shell = page.locator(".v2-workspace-shell");
    const project = page.locator("#project-library-open");
    const saveStatus = page.locator("#project-save-status");
    const audio = page.locator("#audio-status-open");

    await expect(project).toBeVisible();
    await expect(saveStatus).toBeVisible();
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute("title", "Open audio setup");
    await expect(page.locator("#audio-state")).toBeVisible();
    await expect(page.locator("#theme-toggle")).toBeVisible();
    await expect(page.getByLabel("Open Studio menu")).toBeVisible();
    for (const label of ["Piano Roll", "Playlist", "Mixer"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    const geometry = await shell.evaluate((header) => {
      const shellBounds = header.getBoundingClientRect();
      const controls = [...header.querySelectorAll(
        "#project-library-open, .v2-arrangement-transport > button, .v2-surface-switcher > button, #audio-status-open, #theme-toggle, .v2-secondary-menu > summary",
      )].filter((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && bounds.width > 0
          && bounds.height > 0;
      });
      const boxes = controls.map((element) => ({
        label: element.getAttribute("aria-label") ?? element.id ?? element.textContent.trim(),
        bounds: element.getBoundingClientRect(),
      }));
      const outside = boxes.filter(({ bounds }) => (
        bounds.left < shellBounds.left - 0.5
        || bounds.right > shellBounds.right + 0.5
        || bounds.top < shellBounds.top - 0.5
        || bounds.bottom > shellBounds.bottom + 0.5
      )).map(({ label }) => label);
      const overlaps = [];
      for (let index = 0; index < boxes.length; index += 1) {
        for (let compared = index + 1; compared < boxes.length; compared += 1) {
          const left = boxes[index];
          const right = boxes[compared];
          const horizontal = Math.min(left.bounds.right, right.bounds.right)
            - Math.max(left.bounds.left, right.bounds.left);
          const vertical = Math.min(left.bounds.bottom, right.bounds.bottom)
            - Math.max(left.bounds.top, right.bounds.top);
          if (horizontal > 0.5 && vertical > 0.5) overlaps.push([left.label, right.label]);
        }
      }
      return { outside, overlaps };
    });
    expect(geometry.outside).toEqual([]);
    expect(geometry.overlaps).toEqual([]);

    const [projectBox, saveBox] = await Promise.all([
      project.boundingBox(),
      saveStatus.boundingBox(),
    ]);
    expect(projectBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    expect(saveBox.x).toBeGreaterThanOrEqual(projectBox.x);
    expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(projectBox.x + projectBox.width + 0.5);
  }

  await page.locator("#audio-status-open").click();
  const setup = page.getByRole("dialog", { name: "Klinto Studio" });
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "Continue without sound" }).click();
  await expect(setup).toBeHidden();
});
