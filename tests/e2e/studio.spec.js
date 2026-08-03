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
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "unexpected browser errors").toEqual([]);
});

async function clearAppStorage(page) {
  await page.goto("/robots.txt");
  await page.evaluate(async () => {
    const ownsKey = (key) => (
      key.startsWith("chiptune-workstation:")
      || key === "klinto-visual-learning-preferences"
    );
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key && ownsKey(key)) storage.removeItem(key);
      }
    }
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
}

async function dismissAudioSetup(page, { enableAudio = false } = {}) {
  const setup = page.getByRole("dialog", { name: "Klinto Studio" });
  await expect(setup).toBeVisible();
  await setup.getByRole("button", {
    name: enableAudio ? "Start making music" : "Continue without sound",
  }).click();
  await expect(setup).toBeHidden();
  if (enableAudio) await expect(page.locator("#audio-state")).toHaveText("Ready");
}

async function openCleanStudio(page, options) {
  await clearAppStorage(page);
  await page.goto("/");
  await dismissAudioSetup(page, options);
  await expect(page.getByRole("tab", { name: "Pattern" })).toHaveAttribute("aria-selected", "true");
}

async function createNewProject(page) {
  await page.locator("#project-library-open").click();
  const library = page.getByRole("dialog", { name: "Projects" });
  await expect(library).toBeVisible();
  await library.getByRole("button", { name: "New", exact: true }).click();
  await expect(library).toBeHidden();
  await expect(page.getByRole("tab", { name: "Pattern" })).toHaveAttribute("aria-selected", "true");
}

async function waitForSaved(page) {
  await expect(page.locator("#project-save-status")).toHaveAttribute("data-state", "saved");
}

async function nameCurrentProject(page, name) {
  await page.locator("#project-library-open").click();
  const library = page.getByRole("dialog", { name: "Projects" });
  await expect(library).toBeVisible();
  await library.getByLabel("Project name").fill(name);
  await library.getByLabel("Project name").press("Enter");
  await library.getByRole("button", { name: "Close project library" }).click();
  await expect(page.locator("#project-title")).toHaveText(name);
  await waitForSaved(page);
}

async function openSavedProject(page, name) {
  await page.locator("#project-library-open").click();
  const library = page.getByRole("dialog", { name: "Projects" });
  await expect(library).toBeVisible();
  await library.getByRole("button", { name: new RegExp(`^${name}\\b`) }).click();
  await expect(library).toBeHidden();
  await expect(page.locator("#project-title")).toHaveText(name);
}

async function addFirstNote(page) {
  await page.getByRole("button", { name: /^Step 1, rest\.$/ }).click();
  await expect(page.getByRole("button", { name: /^Step 1, C4,/ })).toHaveAttribute("aria-pressed", "true");
}

async function addLoopToSong(page) {
  const addLoop = page.getByRole("button", { name: /Add loop to song/ });
  await expect(addLoop).toBeEnabled();
  await addLoop.click();
  await expect(page.getByRole("region", { name: "Arrangement" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pattern 1, 16 steps, starts at step 1$/ })).toHaveAttribute("aria-pressed", "true");
}

async function expectEditorOnly(page) {
  await expect(page.locator(".arrangement-section")).toBeHidden();
  await expect(page.locator("#arrangement-empty")).toBeHidden();
  await expect(page.getByRole("region", { name: "Editing workspace" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Pattern" })).toBeVisible();
  await expect(page.locator("#editor-dock")).not.toHaveClass(/collapsed/);
  await expect(page.locator("#dock-context-locate")).toBeHidden();
  await expect(page.locator("#workspace-collapse")).toBeHidden();
  await expect(page.getByRole("button", { name: /Locate in arrangement/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Collapse/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add loop to song/ })).toBeVisible();
}

async function expectArranged(page) {
  await expect(page.getByRole("region", { name: "Arrangement" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Locate in arrangement/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Collapse/ })).toBeVisible();
}

test("editor-only project becomes arranged and returns after its final clip is removed", async ({ page }) => {
  await openCleanStudio(page);
  await createNewProject(page);
  await expectEditorOnly(page);
  await expect(page.getByRole("button", { name: /Add loop to song/ })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollHeight <= window.innerHeight
    && document.body.scrollHeight <= window.innerHeight
  ))).toBe(true);

  await addFirstNote(page);
  await addLoopToSong(page);
  await expectArranged(page);
  await waitForSaved(page);

  await page.reload();
  await dismissAudioSetup(page);
  await expectArranged(page);
  const reloadedClip = page.getByRole("button", { name: /^Pattern 1, 16 steps, starts at step 1$/ });
  await expect(reloadedClip).toBeVisible();
  await reloadedClip.click();
  await expect(reloadedClip).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Remove clip" }).click();
  await expectEditorOnly(page);
  await expect(page.locator("#pattern-select")).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body || active.disabled) return false;
    const style = getComputedStyle(active);
    return active.getClientRects().length > 0
      && style.display !== "none"
      && style.visibility !== "hidden";
  })).toBe(true);
});

test("switching between empty and arranged projects updates the workspace", async ({ page }) => {
  await openCleanStudio(page);
  await nameCurrentProject(page, "Empty E2E");
  await expectEditorOnly(page);

  await createNewProject(page);
  await nameCurrentProject(page, "Arranged E2E");
  await addFirstNote(page);
  await addLoopToSong(page);
  await waitForSaved(page);

  await openSavedProject(page, "Empty E2E");
  await expectEditorOnly(page);
  await openSavedProject(page, "Arranged E2E");
  await expectArranged(page);
});

test("pausing a now-empty playing pattern moves focus to Stop", async ({ page }) => {
  await openCleanStudio(page, { enableAudio: true });
  await addFirstNote(page);
  const play = page.getByRole("button", { name: "Play pattern" });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.locator("#transport-status")).toContainText("Pattern");
  await expect(page.locator("#transport-status")).toContainText("Playing");

  await page.locator('summary[aria-label="More pattern actions"]').click();
  await page.getByRole("button", { name: "Clear pattern" }).click();
  await page.getByRole("button", { name: "Confirm clear" }).click();
  const pause = page.getByRole("button", { name: "Pause pattern" });
  await expect(pause).toBeEnabled();
  await pause.focus();
  await expect(pause).toBeFocused();
  await pause.press("Enter");

  const resume = page.getByRole("button", { name: "Resume pattern" });
  const stop = page.getByRole("button", { name: "Stop" });
  await expect(page.locator("#transport-status")).toContainText("Pattern");
  await expect(page.locator("#transport-status")).toContainText("Paused");
  await expect(resume).toBeDisabled();
  await expect(stop).toBeEnabled();
  await expect(stop).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("empty projects expose the mobile transport without hidden focus targets", async ({ page }) => {
    await openCleanStudio(page);
    await createNewProject(page);
    await expectEditorOnly(page);

    await expect(page.getByRole("button", { name: "Return to start" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play pattern" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    const mix = page.getByRole("button", { name: "Mix", exact: true });
    await expect(mix).toBeVisible();
    await expect(mix).toBeEnabled();
    await expect(page.locator("#tempo")).toBeHidden();

    await mix.click();
    const dialog = page.getByRole("dialog", { name: "Playback and mix" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Mobile tempo in BPM")).toBeVisible();
    await expect(dialog.getByLabel("Mobile tempo in BPM")).toBeFocused();
    await dialog.getByRole("button", { name: "Close playback and mix controls" }).click();
    await expect(dialog).toBeHidden();
    await expect(mix).toBeFocused();
    await expect(page.locator("#tempo")).not.toBeFocused();
    await expect(page.locator("#playback-mode")).not.toBeFocused();
  });
});
