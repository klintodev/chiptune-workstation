import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { createProjectDocument } from "../../src/persistence/project-document.js";
import { createProjectState } from "../../src/state/project-state.js";
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
    for (const storage of [localStorage, sessionStorage]) storage.clear();
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
  await expect(page.locator(".v2-workspace[data-schema-version='7']")).toBeVisible();
  await expect(page.locator(".v2-beta-badge", { hasText: "V2 Beta" })).toHaveCount(1);
  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
  await expect(page.locator("#v2-editor-host")).toBeVisible();
  await expect(page.locator("#v2-editor-host .v2-piano-window"))
    .toHaveAttribute("data-surface-kind", "piano-roll");
}

async function waitForSaved(page) {
  await expect(page.locator("#project-save-status")).toHaveAttribute("data-state", "saved");
}

async function createCursorNote(page) {
  const editor = page.locator(".v2-piano-canvas");
  await editor.focus();
  await editor.press("Enter");
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add to Playlist" })).toBeEnabled();
}

async function createNewPattern(page) {
  const actions = page.locator(".v2-action-menu");
  await actions.getByText("Pattern actions", { exact: true }).click();
  await actions.getByRole("button", { name: "New Pattern", exact: true }).click();
  await expect(page.locator("#v2-piano-title")).toContainText("Pattern 2");
}

async function runGlobalHistory(page, action) {
  const menu = page.locator(".v2-secondary-menu");
  if (!await menu.evaluate((element) => element.open)) {
    await menu.getByLabel("Open Studio menu").click();
  }
  await menu.getByRole("button", { name: action, exact: true }).click();
}

async function readDownloadedJson(download) {
  const path = await download.path();
  return JSON.parse(await readFile(path, "utf8"));
}

test("first Pattern becomes a saved Song through the keyboard-first journey", async ({ page }) => {
  await openCleanStudio(page);
  await createCursorNote(page);
  await page.getByRole("button", { name: "Add to Playlist" }).click();

  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
  await expect(page.locator("#playback-mode")).toHaveValue("song");
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);
  await expect(page.locator(".v2-playlist-clip")).toHaveAttribute("aria-selected", "true");
  await waitForSaved(page);

  await page.reload();
  await dismissAudioSetup(page);
  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);
  await expect(page.locator(".v2-primary-surface")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollHeight <= window.innerHeight
    && document.body.scrollHeight <= window.innerHeight
  ))).toBe(true);
});

test("release suite 1: compose, commit, reload and switch Projects", async ({ page }) => {
  await openCleanStudio(page, { enableAudio: true });
  await expect.poll(() => page.locator(".v2-piano-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const editor = page.locator(".v2-piano-canvas");
  await createCursorNote(page);
  await editor.press("Control+ArrowRight");
  await editor.press("Control+ArrowUp");
  await editor.press("Control+Shift+ArrowRight");
  await editor.press("]");
  await expect(page.locator(".v2-piano-note")).toHaveAttribute(
    "aria-label",
    /bar 1, beat 1, tick 24.*48 ticks.*75%/,
  );
  await editor.press("Delete");
  await expect(page.locator(".v2-piano-note")).toHaveCount(0);
  await editor.press("Control+z");
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);

  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  const instrumentLauncher = page.locator(".v2-playlist-instrument").first();
  await expect(instrumentLauncher).toHaveAccessibleName("Open Pulse 1 Klinto Chip instrument");
  await instrumentLauncher.click();
  await expect(page.locator("#v2-primary-host")).toBeVisible();
  await expect(page.locator("#v2-editor-host")).toBeHidden();
  await expect(page.locator("#v2-device-host")).toHaveAttribute("data-surface-kind", "instrument");
  await page.locator('[data-device-param="waveform"]').selectOption("saw");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(instrumentLauncher).toBeFocused();
  await page.getByRole("button", { name: "Piano Roll", exact: true }).click();

  const playPattern = page.getByRole("button", { name: /Play pattern/i });
  await playPattern.click();
  await expect(page.getByRole("button", { name: /Pause pattern/i })).toBeVisible();
  await page.getByRole("button", { name: /Pause pattern/i }).click();

  await createNewPattern(page);
  await createCursorNote(page);
  await waitForSaved(page);
  await page.reload();
  await dismissAudioSetup(page);
  const patternSelect = page.getByLabel("Pattern", { exact: true });
  await expect(patternSelect.locator("option")).toHaveCount(2);
  await patternSelect.selectOption("pattern-2");
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  const patternActions = page.locator(".v2-action-menu");
  await patternActions.getByText("Pattern actions", { exact: true }).click();
  await patternActions.getByRole("button", { name: "Delete Pattern", exact: true }).click();
  await expect(patternSelect.locator("option")).toHaveCount(1);
  await expect(page.locator("#v2-piano-title")).toContainText("Pattern 1");
  await runGlobalHistory(page, "Undo");
  await expect(patternSelect.locator("option")).toHaveCount(2);

  const originalTitle = await page.locator("#project-title").textContent();
  await page.locator("#project-library-open").click();
  const library = page.getByRole("dialog", { name: "Projects" });
  await expect(library).toBeVisible();
  await library.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator("#project-title")).not.toHaveText(originalTitle);
  const copyTitle = await page.locator("#project-title").textContent();

  await page.locator("#project-library-open").click();
  await expect(library.locator('[data-action="open-project"]')).toHaveCount(2);
  await library.locator('[data-action="open-project"][aria-current="false"]').click();
  await expect(page.locator("#project-title")).toHaveText(originalTitle);
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);

  await page.locator("#project-library-open").click();
  await library.locator('[data-action="open-project"][aria-current="false"]').click();
  await expect(page.locator("#project-title")).toHaveText(copyTitle);
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);
});

test("release suite 2: arrange, edit, play and restore linked clips", async ({ page }) => {
  await openCleanStudio(page, { enableAudio: true });
  await createCursorNote(page);
  await page.getByRole("button", { name: "Add to Playlist" }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);

  const timeline = page.locator(".v2-playlist-timeline");
  await timeline.focus();
  await timeline.press("Escape");
  await timeline.press("ArrowRight");
  await timeline.press("s");
  await expect(page.locator("#transport-status")).toHaveText(/Song.*tick 24/i);
  await expect(timeline).toHaveAttribute("aria-activedescendant", "v2-playlist-cursor");

  await page.getByRole("button", { name: "Piano Roll", exact: true }).click();
  await createNewPattern(page);
  await createCursorNote(page);
  await page.getByRole("button", { name: "Add to Playlist" }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(2);
  await expect(page.locator(".v2-playlist-clip").nth(1)).toHaveAttribute(
    "aria-label",
    /Pattern 2.*bar 2, beat 1/,
  );

  await page.getByRole("button", { name: "Move later", exact: true }).click();
  await expect(page.locator(".v2-playlist-clip.is-selected")).toHaveAttribute(
    "aria-label",
    /bar 2, beat 1, tick 24/,
  );
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(3);
  await runGlobalHistory(page, "Undo");
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(2);

  const playSong = page.getByRole("button", { name: /Play song/i });
  await playSong.click();
  await expect(page.getByRole("button", { name: /Pause song/i })).toBeVisible();
  await page.getByRole("button", { name: /Pause song/i }).click();

  await page.locator(".v2-playlist-clip").first().click();
  await page.getByRole("button", { name: "Delete clip", exact: true }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);
  await page.locator(".v2-playlist-clip").click();
  await page.getByRole("button", { name: "Delete clip", exact: true }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(0);
  await expect(page.locator(".v2-playlist-track-focus")).toBeFocused();
  await runGlobalHistory(page, "Undo");
  await runGlobalHistory(page, "Undo");
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(2);

  await waitForSaved(page);
  await page.reload();
  await dismissAudioSetup(page);
  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(2);
});

test("Playlist, Piano and Instrument coexist with draggable, focus-safe windows", async ({ page }) => {
  await openCleanStudio(page);
  const primaryHost = page.locator("#v2-primary-host");
  const editorHost = page.locator("#v2-editor-host");
  const deviceHost = page.locator("#v2-device-host");
  const pianoHeader = page.locator(".v2-floating-window-header");

  await expect(primaryHost).toHaveAttribute("data-surface-kind", "playlist");
  await expect(primaryHost).toBeVisible();
  await expect(editorHost).toBeVisible();
  await expect(deviceHost).toBeHidden();
  await expect(pianoHeader).toHaveAccessibleName("Move window");

  const pianoHeaderBox = await pianoHeader.boundingBox();
  expect(pianoHeaderBox).not.toBeNull();
  await page.mouse.move(pianoHeaderBox.x + 80, pianoHeaderBox.y + pianoHeaderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pianoHeaderBox.x + 680, pianoHeaderBox.y + pianoHeaderBox.height / 2 + 24);
  await page.mouse.up();
  await expect.poll(() => editorHost.evaluate((element) => element.style.transform)).not.toBe("");

  const instrumentLauncher = page.locator(".v2-playlist-instrument").first();
  await instrumentLauncher.click();
  await expect(primaryHost).toBeVisible();
  await expect(editorHost).toBeVisible();
  await expect(deviceHost).toHaveAttribute("data-surface-kind", "instrument");
  await expect(deviceHost).toBeVisible();
  await expect(page.locator(".v2-primary-surface")).toHaveCount(2);
  await expect(page.locator(".v2-device-window-content")).toHaveCount(1);

  const deviceHeader = page.locator(".v2-device-header");
  await expect(deviceHeader).toHaveAccessibleName("Move window");
  await deviceHeader.focus();
  await deviceHeader.press("Alt+ArrowLeft");
  await expect.poll(() => deviceHost.evaluate((element) => element.style.transform)).not.toBe("");
  await deviceHeader.press("Escape");
  await expect(deviceHost).toBeHidden();
  await expect(editorHost).toBeVisible();
  await expect(primaryHost).toBeVisible();
  await expect(page.locator(".v2-piano-canvas")).toBeFocused();

  await pianoHeader.focus();
  await pianoHeader.press("Escape");
  await expect(editorHost).toBeHidden();
  await expect(primaryHost).toHaveAttribute("data-surface-kind", "playlist");
  await expect(page.getByRole("button", { name: "Playlist", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  await expect(primaryHost).toHaveAttribute("data-surface-kind", "mixer");
  await expect(page.locator(".v2-primary-surface")).toHaveCount(1);

  await page.getByLabel("Pulse 1 Effects").getByRole("button", { name: "Add Effect in slot 1" }).click();
  const effectLauncher = page.getByRole("button", {
    name: "Open Pulse 1 Klinto Filter in effect slot 1",
  });
  await effectLauncher.click();
  await expect(deviceHost).toHaveAttribute("data-surface-kind", "effect");
  await page.locator(".v2-device-title").press("Escape");
  await expect(deviceHost).toBeHidden();
  await expect(primaryHost).toHaveAttribute("data-surface-kind", "playlist");
  await expect(page.locator(".v2-playlist-timeline")).toBeFocused();

  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  await effectLauncher.click();
  await runGlobalHistory(page, "Undo");
  await expect(deviceHost).toBeHidden();
  await expect(primaryHost).toHaveAttribute("data-surface-kind", "playlist");
  await expect(page.locator(".v2-playlist-timeline")).toBeFocused();
});

test("release suite 3: migrate, recover, download and import without losing V7", async ({ page }) => {
  await clearAppStorage(page);
  const legacyState = createProjectState();
  legacyState.renameProject("Legacy migration E2E");
  legacyState.updatePattern("pattern-1", (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0
      ? { note: 60, gate: 0.75, volume: 0.8 }
      : step),
  }));
  legacyState.addClip("track-1", "pattern-1", 0);
  const legacyDocument = createProjectDocument(legacyState.getState(), {
    id: "project-v1-e2e",
    now: "2026-08-04T12:00:00.000Z",
  });
  const futureDocument = structuredClone(legacyDocument);
  futureDocument.id = "project-future-e2e";
  futureDocument.project.schemaVersion = 99;
  futureDocument.project.metadata.title = "Future Project";
  await page.evaluate(async ({ legacyDocument, futureDocument }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("chiptune-workstation", 1);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains("projects")) {
          request.result.createObjectStore("projects", { keyPath: "id" });
        }
      });
      request.addEventListener("error", () => reject(request.error), { once: true });
      request.addEventListener("success", () => {
        const database = request.result;
        const transaction = database.transaction("projects", "readwrite");
        const store = transaction.objectStore("projects");
        store.put(legacyDocument);
        store.put(futureDocument);
        transaction.addEventListener("complete", () => {
          database.close();
          localStorage.setItem("chiptune-workstation:last-project-id", legacyDocument.id);
          resolve();
        }, { once: true });
        transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      }, { once: true });
    });
  }, { legacyDocument, futureDocument });

  await page.goto("/");
  await dismissAudioSetup(page);
  await expect(page.locator("#project-title")).toHaveText("Legacy migration E2E");
  await expect(page.locator(".v2-piano-note")).toHaveCount(1);
  const migratedNote = page.locator(".v2-piano-note");
  const migratedEditor = page.locator(".v2-piano-canvas");
  await expect(migratedNote).toHaveAttribute("aria-label", /18 ticks/);
  await migratedNote.click();
  await migratedEditor.press("Control+Shift+ArrowRight");
  await expect(migratedNote).toHaveAttribute("aria-label", /42 ticks/);
  await migratedEditor.press("Escape");
  await migratedEditor.press("ArrowRight");
  await migratedEditor.press("Enter");
  await waitForSaved(page);

  const stored = await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open("chiptune-workstation", 1);
    request.addEventListener("error", () => reject(request.error), { once: true });
    request.addEventListener("success", () => {
      const database = request.result;
      const transaction = database.transaction("projects", "readonly");
      const read = transaction.objectStore("projects").get("project-v1-e2e");
      read.addEventListener("success", () => {
        database.close();
        resolve(read.result);
      }, { once: true });
      read.addEventListener("error", () => reject(read.error), { once: true });
    }, { once: true });
  }));
  expect(stored.project.schemaVersion).toBe(7);
  expect(stored.project.visualiser).toBeUndefined();
  expect(stored.project.patterns[0].rootOctave).toBeUndefined();

  await page.locator("#project-library-open").click();
  const library = page.getByRole("dialog", { name: "Projects" });
  const unavailable = library.locator('.project-list-row[data-availability="unavailable"]');
  await expect(unavailable).toContainText("Future Project");
  await expect(unavailable.locator('[data-action="open-project"]')).toHaveCount(0);
  await expect(unavailable.locator('[data-action="delete-project"]')).toHaveCount(0);

  const recoveryEvent = page.waitForEvent("download");
  await unavailable.getByRole("button", {
    name: "Download raw recovery copy for Future Project",
  }).click();
  const recovered = await readDownloadedJson(await recoveryEvent);
  expect(recovered.id).toBe("project-future-e2e");
  expect(recovered.project.schemaVersion).toBe(99);
  await expect(page.locator("#project-title")).toHaveText("Legacy migration E2E");

  const projectDownloadEvent = page.waitForEvent("download");
  await library.getByRole("button", { name: "Download", exact: true }).click();
  const projectDownload = await projectDownloadEvent;
  const downloaded = await readDownloadedJson(projectDownload);
  expect(downloaded.project.schemaVersion).toBe(7);
  expect(downloaded.project.patterns[0].notes).toHaveLength(2);

  const waveDownloadEvent = page.waitForEvent("download");
  await library.getByRole("button", { name: "Export WAV", exact: true }).click();
  const waveDownload = await waveDownloadEvent;
  expect(waveDownload.suggestedFilename()).toMatch(/\.wav$/);
  const wavePath = await waveDownload.path();
  const wave = await readFile(wavePath);
  expect(wave.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(wave.subarray(8, 12).toString("ascii")).toBe("WAVE");
  expect(wave.readUInt16LE(22)).toBe(2);
  expect(wave.readUInt32LE(24)).toBe(44_100);
  const frameCount = wave.readUInt32LE(40) / (2 * 2);
  expect(frameCount).toBeGreaterThan(2 * 44_100);
  expect(frameCount).toBeLessThanOrEqual(Math.ceil(2.04 * 44_100));
  await expect(page.locator("#audio-export-status")).toContainText("WAV ready");

  const downloadPath = await projectDownload.path();
  await page.locator("#project-import-file").setInputFiles(downloadPath);
  await expect(library).toBeHidden();
  await expect(page.locator("#project-title")).toContainText("imported");
  await expect(page.locator(".v2-piano-note")).toHaveCount(2);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("release suite 4: mobile note, transport, device, clip and reload smoke", async ({ page }) => {
    await openCleanStudio(page, { enableAudio: true });
    for (const label of ["Piano Roll", "Playlist", "Mixer"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    const visibleSurfaceLabels = await page.locator(".v2-surface-switcher button").evaluateAll((buttons) => (
      buttons.map((button) => getComputedStyle(button, "::before").content.replace(/[\"']/g, ""))
    ));
    expect(visibleSurfaceLabels).toEqual(["Roll", "List", "Mix"]);

    const pan = page.locator('[data-piano-tool="pan"]');
    const select = page.locator('[data-piano-tool="select"]');
    await expect(pan).toBeVisible();
    await expect(pan).toHaveAttribute("aria-pressed", "true");
    await expect(select).toBeVisible();
    await expect(page.locator('[data-piano-tool="draw"]')).toBeHidden();
    const pianoScroller = page.locator(".v2-piano-scroll");
    const scrollerBox = await pianoScroller.boundingBox();
    expect(scrollerBox).not.toBeNull();
    const scrollLeftBefore = await pianoScroller.evaluate((element) => element.scrollLeft);
    await page.mouse.move(scrollerBox.x + scrollerBox.width - 30, scrollerBox.y + scrollerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(scrollerBox.x + 80, scrollerBox.y + scrollerBox.height / 2);
    await page.mouse.up();
    await expect.poll(() => pianoScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(scrollLeftBefore);
    await expect(page.locator(".v2-piano-note")).toHaveCount(0);
    await expect.poll(() => page.locator(".v2-piano-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Create note here", exact: true }).click();
    await expect(page.locator(".v2-piano-note")).toHaveCount(1);
    await page.getByRole("button", { name: "Delete note", exact: true }).click();
    await expect(page.locator(".v2-piano-note")).toHaveCount(0);
    await page.getByRole("button", { name: "Create note here", exact: true }).click();
    await page.getByRole("button", { name: /Play pattern/i }).click();
    await expect(page.getByRole("button", { name: /Pause pattern/i })).toBeVisible();
    await page.getByRole("button", { name: /Pause pattern/i }).click();

    await page.getByRole("button", { name: "Playlist", exact: true }).click();
    const mobileInstrumentLauncher = page.locator(".v2-playlist-instrument").first();
    await mobileInstrumentLauncher.click();
    await expect(page.locator("#v2-device-host")).toBeVisible();
    await expect(page.locator("#v2-primary-host")).toBeHidden();
    await expect(page.locator(".v2-device-window-content")).toHaveCount(1);
    const attack = page.locator('[data-device-param="attackSeconds"]');
    await expect(attack).toHaveAttribute("aria-valuetext", "8 milliseconds");
    await attack.press("ArrowRight");
    await expect(attack).toHaveAttribute("aria-valuetext", "9 milliseconds");
    await page.locator('[data-device-param="waveform"]').selectOption("triangle");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.locator("#v2-device-host")).toBeHidden();
    await expect(page.locator("#v2-primary-host")).toBeVisible();
    await expect(mobileInstrumentLauncher).toBeFocused();
    await page.getByRole("button", { name: "Piano Roll", exact: true }).click();

    await page.getByRole("button", { name: "Add to Playlist" }).click();
    await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);
    await page.getByRole("button", { name: "Open Pattern", exact: true }).click();
    await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
    await expect(page.locator("#v2-editor-host .v2-piano-window")).toBeVisible();

    await page.getByRole("button", { name: "Mixer", exact: true }).click();
    await page.getByLabel("Pulse 1 Effects").getByRole("button", { name: "Add Effect in slot 1" }).click();
    await page.locator('[data-channel-id="track-1"][data-effect-action="open"]').click();
    const cutoff = page.locator('[data-device-param="cutoffHz"]');
    const cutoffBefore = Number(await cutoff.inputValue());
    await cutoff.press("ArrowDown");
    await expect(cutoff).toHaveValue(String(cutoffBefore - 1));
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
    await expect(page.locator(".v2-playlist-timeline")).toBeFocused();

    await waitForSaved(page);
    await page.reload();
    await dismissAudioSetup(page);
    await page.getByRole("button", { name: "Playlist", exact: true }).click();
    await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);
    await expect(page.locator(".v2-primary-surface")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => {
      const active = document.activeElement;
      return active && active !== document.body && !active.disabled;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => (
      document.documentElement.scrollWidth <= window.innerWidth
      && document.body.scrollWidth <= window.innerWidth
      && document.documentElement.scrollHeight <= window.innerHeight
    ))).toBe(true);
  });
});
