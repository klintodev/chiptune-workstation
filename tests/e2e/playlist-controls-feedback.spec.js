import { expect, test } from "@playwright/test";

import { createV2ProjectState } from "../../src/v2/domain/project-state.js";
import { createV2ProjectDocument } from "../../src/v2/persistence/project-document.js";
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

test("Playlist exposes Pattern adding, instrument routes, direct Song loop and master volume", async ({ page }) => {
  await createCursorNote(page);
  await createNewPattern(page);
  await createCursorNote(page);
  await page.getByRole("button", { name: "Playlist", exact: true }).click();

  const library = page.locator(".v2-playlist-pattern-library");
  await expect(library).toHaveAttribute("open", "");
  await expect(page.getByLabel("Pattern to add")).toHaveCount(0);
  const patternPicker = library.getByLabel("Playlist Pattern", { exact: true });
  await expect(patternPicker.locator("option")).toHaveCount(2);
  await expect(patternPicker).toHaveValue("pattern-2");
  await expect(library.locator(".v2-pattern-library-item")).toHaveCount(1);
  await expect(library.locator(".v2-pattern-library-item")).toHaveAttribute("data-pattern-library-id", "pattern-2");
  await patternPicker.selectOption("pattern-1");
  await expect(library.locator(".v2-pattern-library-item")).toHaveAttribute("data-pattern-library-id", "pattern-1");
  const patternItems = library.locator(".v2-pattern-library-drag");
  await expect(patternItems).toHaveCount(1);
  await expect(patternItems.first()).toHaveAttribute("draggable", "true");
  await patternItems.first().dblclick();
  await expect(page.locator("#v2-editor-host .v2-floating-window-title")).toHaveText("Pattern 1, Piano Roll");
  await expect(page.locator("#v2-editor-host .v2-piano-window")).toBeVisible();
  await page.getByRole("button", { name: "Close Piano Roll", exact: true }).click();

  const patternActions = library.locator(".v2-pattern-library-actions").first();
  await patternActions.getByLabel("Actions for Pattern 1").click();
  await expect(patternActions.getByRole("button", { name: "Open Pattern", exact: true })).toBeVisible();
  await expect(patternActions.getByRole("button", { name: "Duplicate Pattern", exact: true })).toBeVisible();
  await expect(patternActions.getByRole("button", { name: "Rename Pattern", exact: true })).toBeVisible();
  await expect(patternActions.getByRole("button", { name: "Delete Pattern", exact: true })).toBeVisible();
  const patternMenu = patternActions.locator(".v2-action-menu-panel");
  await expect(patternMenu).toHaveCSS("position", "fixed");
  const patternMenuBounds = await patternMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(patternMenuBounds).not.toBeNull();
  expect(patternMenuBounds.x).toBeGreaterThanOrEqual(0);
  expect(patternMenuBounds.y).toBeGreaterThanOrEqual(0);
  expect(patternMenuBounds.x + patternMenuBounds.width).toBeLessThanOrEqual(viewport.width);
  expect(patternMenuBounds.y + patternMenuBounds.height).toBeLessThanOrEqual(viewport.height);

  const addPattern1 = page.getByRole("button", { name: /Add Pattern 1 to Pulse 1/ });
  await expect(addPattern1).toBeEnabled();
  await addPattern1.click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(1);

  await patternPicker.selectOption("pattern-2");
  await page.getByRole("button", { name: /Add Pattern 2 to Pulse 1/ }).click();
  await expect(page.locator(".v2-playlist-clip")).toHaveCount(2);
  await expect(page.locator("#playback-mode")).toHaveValue("song");
  await patternPicker.selectOption("pattern-1");
  await page.locator(".v2-playlist-clip", { hasText: "Pattern 2" }).dblclick();
  await expect(page.locator("#v2-editor-host .v2-floating-window-title")).toHaveText("Pattern 2, Piano Roll");
  await expect(patternPicker).toHaveValue("pattern-2");
  await page.getByRole("button", { name: "Close Piano Roll", exact: true }).click();

  await page.getByRole("button", { name: "+ Add Instrument", exact: true }).click();
  const destinations = page.locator(".v2-playlist-track-focus");
  await expect(destinations).toHaveCount(2);
  await expect(destinations.first()).toHaveAttribute("aria-pressed", "false");
  await expect(destinations.last()).toHaveAttribute("aria-pressed", "true");
  await destinations.first().click();
  await expect(destinations.first()).toHaveAttribute("aria-pressed", "true");
  await expect(destinations.last()).toHaveAttribute("aria-pressed", "false");

  await destinations.last().click();
  await patternPicker.selectOption("pattern-1");
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
  await expect(page.locator("#v2-primary-host")).toHaveAttribute("data-surface-kind", "playlist");
  const restoredPlaylistInstrument = page.locator(".v2-playlist-instrument").first();
  await expect(restoredPlaylistInstrument).toBeFocused();

  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  const selectedClip = page.locator(".v2-playlist-clip").last();
  await selectedClip.click();
  await expect(page.getByRole("button", { name: /Move Song playhead/ })).toHaveCount(0);
  await expect(page.getByText(/Move playhead/i)).toHaveCount(0);
  await selectedClip.focus();
  await selectedClip.press("Escape");
  await expect(page.getByRole("button", { name: /Move Song playhead/ })).toHaveCount(0);
  await expect(page.getByText(/Move playhead/i)).toHaveCount(0);
  await expect(page.getByText("Seek Song here", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/seeks the Song/i)).toHaveCount(0);
  await expect(page.getByTitle(/Start Song playback/)).toHaveCount(0);

  const loopToggle = page.locator("#transport-loop");
  await expect(loopToggle).toHaveText("↻");
  await expect(loopToggle).toHaveAttribute("aria-pressed", "false");
  await expect(loopToggle).toHaveAccessibleName("Song loop off");
  await expect(loopToggle).toBeEnabled();
  await loopToggle.click();
  await expect(loopToggle).toHaveAttribute("aria-pressed", "true");
  await expect(loopToggle).toHaveAccessibleName("Song loop on");

  const loopSummary = page.locator("#loop-summary");
  await page.getByLabel("Open Studio menu").click();
  await expect(loopSummary).toHaveText("Song loop range");
  await loopSummary.click();
  await expect(page.getByText("Pattern playback always repeats. These settings control Song playback only.")).toBeVisible();
  const loopEnabled = page.getByLabel("Enable Song loop");
  await expect(loopEnabled).toBeChecked();
  await loopEnabled.uncheck();
  await expect(loopToggle).toHaveAttribute("aria-pressed", "false");
  await expect(loopToggle).toHaveAccessibleName("Song loop off");
  await page.getByLabel("Open Studio menu").click();
  await page.locator("#playback-mode").selectOption("pattern");
  await expect(loopSummary).toHaveText("Song loop range");

  const masterVolume = page.getByLabel("Master output volume");
  await expect(masterVolume).toHaveValue("35");
  await expect(page.locator("#master-volume-value")).toHaveText("35%");
  await masterVolume.focus();
  await masterVolume.press("ArrowRight");
  await expect(masterVolume).toHaveValue("36");
  await expect(page.locator("#master-volume-value")).toHaveText("36%");
  await expect(masterVolume).toBeFocused();
});

test("Space toggles transport from controls anywhere in Studio without activating them", async ({ page }) => {
  await page.getByRole("button", { name: "Open audio setup" }).click();
  const setup = page.getByRole("dialog", { name: "Klinto Studio" });
  await setup.getByRole("button", { name: "Start making music" }).click();
  await expect(setup).toBeHidden();
  await expect(page.locator("#audio-state")).toHaveText("Ready");
  await createCursorNote(page);
  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  await page.locator("#playback-mode").selectOption("pattern");

  const patternPicker = page.getByLabel("Playlist Pattern", { exact: true });
  const newPattern = page.locator(".v2-playlist-pattern-library").getByRole("button", { name: "New Pattern", exact: true });
  const mixer = page.getByRole("button", { name: "Mixer", exact: true });
  const playlist = page.getByRole("button", { name: "Playlist", exact: true });
  const initialPatternId = await patternPicker.inputValue();
  const initialScroll = await page.evaluate(() => ({
    page: window.scrollY,
    workspace: document.querySelector(".v2-workspace-content")?.scrollTop ?? 0,
  }));

  await mixer.focus();
  await mixer.press("Space");
  await expect(page.getByRole("button", { name: /Pause pattern/i })).toBeVisible();
  await expect(mixer).toHaveAttribute("aria-pressed", "false");
  await expect(playlist).toHaveAttribute("aria-pressed", "true");
  await mixer.press("Space");
  await expect(page.getByRole("button", { name: /Play pattern/i })).toBeVisible();

  await patternPicker.focus();
  await patternPicker.press("Space");
  await expect(page.getByRole("button", { name: /Pause pattern/i })).toBeVisible();
  await expect(patternPicker).toHaveValue(initialPatternId);
  await patternPicker.press("Space");
  await expect(page.getByRole("button", { name: /Play pattern/i })).toBeVisible();

  await newPattern.focus();
  await newPattern.press("Space");
  await expect(page.getByRole("button", { name: /Pause pattern/i })).toBeVisible();
  await expect(patternPicker.locator("option")).toHaveCount(1);
  await newPattern.press("Space");
  await expect(page.getByRole("button", { name: /Play pattern/i })).toBeVisible();
  await expect(patternPicker.locator("option")).toHaveCount(1);

  await expect.poll(() => page.evaluate(() => ({
    page: window.scrollY,
    workspace: document.querySelector(".v2-workspace-content")?.scrollTop ?? 0,
  }))).toEqual(initialScroll);
});

test("Control-wheel scrolls the Playlist timeline instead of the browser", async ({ page }) => {
  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  const scroller = page.locator(".v2-playlist-scroll");
  await expect(scroller).toBeVisible();
  await expect.poll(() => scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  const synthetic = await scroller.evaluate((element) => {
    element.scrollLeft = 0;
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 180,
    });
    element.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      scrollLeft: element.scrollLeft,
    };
  });
  expect(synthetic.defaultPrevented).toBe(true);
  expect(synthetic.scrollLeft).toBe(180);

  await scroller.evaluate((element) => { element.scrollLeft = 0; });
  const bounds = await scroller.boundingBox();
  expect(bounds).not.toBeNull();
  const browserBefore = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }));
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 240);
  await page.keyboard.up("Control");

  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }))).toEqual(browserBefore);
});

test("Pattern Library stays compact with 25 Patterns", async ({ page }) => {
  const projectState = createV2ProjectState();
  for (let index = 1; index < 25; index += 1) {
    projectState.createPattern();
  }
  const projectDocument = createV2ProjectDocument(projectState.getState(), {
    id: "project-pattern-library-scale",
    now: "2026-08-06T09:00:00.000Z",
  });
  await page.goto("/robots.txt");
  await page.evaluate(async (document) => new Promise((resolve, reject) => {
    const request = indexedDB.open("chiptune-workstation", 1);
    request.addEventListener("error", () => reject(request.error), { once: true });
    request.addEventListener("success", () => {
      const database = request.result;
      const transaction = database.transaction("projects", "readwrite");
      transaction.objectStore("projects").put(document);
      transaction.addEventListener("complete", () => {
        database.close();
        localStorage.setItem("chiptune-workstation:last-project-id", document.id);
        resolve();
      }, { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    }, { once: true });
  }), projectDocument);
  await page.goto("/");
  const setup = page.getByRole("dialog", { name: "Klinto Studio" });
  if (await setup.isVisible()) await setup.getByRole("button", { name: "Continue without sound" }).click();
  await page.getByRole("button", { name: "Playlist", exact: true }).click();
  const closePiano = page.getByRole("button", { name: "Close Piano Roll", exact: true });
  if (await closePiano.isVisible()) await closePiano.click();

  const library = page.locator(".v2-playlist-pattern-library");
  const picker = library.getByLabel("Playlist Pattern", { exact: true });
  const selectedCard = library.locator(".v2-pattern-library-item");
  await expect(picker.locator("option")).toHaveCount(25);
  await expect(picker).toHaveValue("pattern-1");
  await expect(selectedCard).toHaveCount(1);
  await expect(selectedCard).toHaveAttribute("data-pattern-library-id", "pattern-1");
  expect(await library.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(170);

  await picker.selectOption("pattern-25");
  await expect(selectedCard).toHaveAttribute("data-pattern-library-id", "pattern-25");
  await expect(library.locator(".v2-pattern-library-drag")).toHaveCount(1);
});

test("Playlist Pattern Library drag-drop snaps exactly and right-click deletes with undo-safe focus", async ({ page }) => {
  await createCursorNote(page);
  await page.getByRole("button", { name: "Playlist", exact: true }).click();

  const libraryPattern = page.locator('.v2-pattern-library-drag[data-pattern-id="pattern-1"]');
  const lane = page.locator('.v2-playlist-lane[data-track-id="track-1"]');
  const timeline = page.locator(".v2-playlist-timeline");
  const bounds = await timeline.boundingBox();
  expect(bounds).not.toBeNull();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const clientX = bounds.x + 320 + 192 * 0.36;
  const clientY = bounds.y + 46 + 33;

  await libraryPattern.dispatchEvent("dragstart", { dataTransfer });
  await lane.dispatchEvent("dragover", {
    clientX,
    clientY,
    dataTransfer,
  });
  await expect(lane).toHaveClass(/is-pattern-drop-target/);
  await lane.dispatchEvent("drop", {
    clientX,
    clientY,
    dataTransfer,
  });

  const clip = lane.locator(".v2-playlist-clip");
  await expect(clip).toHaveCount(1);
  await expect(clip).toHaveAccessibleName(/Pattern 1, Pulse 1, starts bar 1, beat 3/);
  expect(await clip.evaluate((element) => Number.parseFloat(element.style.left))).toBeCloseTo(389.12, 2);
  await expect(clip).toBeFocused();

  const occupiedDropTransfer = await page.evaluateHandle(() => new DataTransfer());
  await libraryPattern.dispatchEvent("dragstart", { dataTransfer: occupiedDropTransfer });
  await lane.dispatchEvent("dragover", {
    clientX,
    clientY,
    dataTransfer: occupiedDropTransfer,
  });
  await lane.dispatchEvent("drop", {
    clientX,
    clientY,
    dataTransfer: occupiedDropTransfer,
  });
  await expect(lane.locator(".v2-playlist-clip")).toHaveCount(1);
  await expect(lane.locator(".v2-playlist-clip")).toHaveAccessibleName(/starts bar 1, beat 3/);

  const contextMenuPrevented = await clip.evaluate((element) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(contextMenuPrevented).toBe(true);
  await expect(lane.locator(".v2-playlist-clip")).toHaveCount(0);
  await expect(page.locator('.v2-playlist-track-focus[data-track-id="track-1"]')).toBeFocused();

  await page.keyboard.press("Control+z");
  await expect(lane.locator(".v2-playlist-clip")).toHaveCount(1);
  await expect(lane.locator(".v2-playlist-clip")).toHaveAccessibleName(/starts bar 1, beat 3/);
});

test("clicking an empty Playlist lane adds the selected Pattern at the snapped position", async ({ page }) => {
  await createCursorNote(page);
  await page.getByRole("button", { name: "Playlist", exact: true }).click();

  const closePiano = page.getByRole("button", { name: "Close Piano Roll", exact: true });
  if (await closePiano.isVisible()) await closePiano.click();

  await page.locator(".v2-playlist-pattern-library").getByRole("button", { name: "New Pattern", exact: true }).click();
  await expect(page.locator("#v2-editor-host .v2-floating-window-title")).toHaveText("Pattern 2, Piano Roll");
  await createCursorNote(page);
  await closePiano.click();

  const pattern1 = page.locator('.v2-pattern-library-drag[data-pattern-id="pattern-1"]');
  const pattern2 = page.locator('.v2-pattern-library-drag[data-pattern-id="pattern-2"]');
  const patternPicker = page.locator(".v2-playlist-pattern-library").getByLabel("Playlist Pattern", { exact: true });
  const lane = page.locator('.v2-playlist-lane[data-track-id="track-1"]');
  const timeline = page.locator(".v2-playlist-timeline");
  const bounds = await timeline.boundingBox();
  expect(bounds).not.toBeNull();
  const laneY = bounds.y + 46 + 33;

  await patternPicker.selectOption("pattern-1");
  await pattern1.click();
  await page.mouse.click(bounds.x + 320 + 192 * 0.36, laneY);

  const clips = lane.locator(".v2-playlist-clip");
  await expect(clips).toHaveCount(1);
  await expect(clips.first()).toHaveAccessibleName(/Pattern 1, Pulse 1, starts bar 1, beat 3/);
  await expect(clips.first()).toBeFocused();
  await expect(page.locator("#playback-mode")).toHaveValue("song");

  await patternPicker.selectOption("pattern-2");
  await pattern2.click();
  await page.mouse.click(bounds.x + 323, laneY);
  await expect(clips).toHaveCount(1);
  await expect(page.locator("#workstation-status")).toContainText("Pattern 2 does not fit at bar 1, beat 1 on Pulse 1");

  await page.mouse.click(bounds.x + 320 + 768 * 0.36, laneY);
  await expect(clips).toHaveCount(2);
  await expect(clips.last()).toHaveAccessibleName(/Pattern 2, Pulse 1, starts bar 3, beat 1/);
  await expect(clips.last()).toBeFocused();

  await clips.first().click();
  await expect(clips).toHaveCount(2);
  await expect(clips.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#v2-playlist-help")).toHaveCount(0);
  await expect(page.locator(".v2-playlist > .v2-editor-help")).toHaveCount(0);

  const contextMenuPrevented = await lane.evaluate((element) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(contextMenuPrevented).toBe(true);
  await expect(clips).toHaveCount(2);
});

test("default desktop keeps the Pattern Library actionable beneath the raised Piano", async ({ page }) => {
  const content = page.locator(".v2-workspace-content");
  const editor = page.locator("#v2-editor-host");
  const library = page.locator(".v2-playlist-pattern-library");
  const addInstrument = page.getByRole("button", { name: "+ Add Instrument", exact: true });
  const patternCard = library.locator(".v2-pattern-library-item").first();
  const patternActions = patternCard.locator(".v2-pattern-library-actions");

  await expect(editor).toBeVisible();
  await expect(editor).toHaveCSS("z-index", "11");
  await expect(library).toHaveCSS("z-index", "auto");
  await expect(addInstrument).toBeVisible();
  await expect(patternCard).toBeVisible();

  const [contentBox, editorBox, addInstrumentBox, cardBox] = await Promise.all([
    content.boundingBox(),
    editor.boundingBox(),
    addInstrument.boundingBox(),
    patternCard.boundingBox(),
  ]);
  expect(contentBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(addInstrumentBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(editorBox.x).toBeGreaterThanOrEqual(contentBox.x);
  expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(contentBox.x + contentBox.width + 0.5);
  expect(addInstrumentBox.x + addInstrumentBox.width).toBeLessThanOrEqual(editorBox.x + 0.5);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(editorBox.x + 0.5);
  expect(await addInstrument.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    ) === button;
  })).toBe(true);
  expect(await patternCard.evaluate((item) => {
    const bounds = item.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return hit?.closest(".v2-pattern-library-item") === item;
  })).toBe(true);

  await addInstrument.click();
  await expect(page.locator(".v2-playlist-instrument")).toHaveCount(2);

  await patternActions.getByLabel("Actions for Pattern 1").click();
  await expect(patternActions).toHaveCSS("z-index", "60");
  const panel = patternActions.locator(".v2-action-menu-panel");
  const firstAction = panel.getByRole("button", { name: "Open Pattern", exact: true });
  await expect(panel).toHaveCSS("position", "fixed");
  await expect(panel).toHaveCSS("z-index", "120");
  await expect(firstAction).toBeVisible();

  await editor.evaluate((element) => {
    element.style.transform = "translate(-280px, 0px)";
  });
  const [raisedEditorBox, actionBox] = await Promise.all([
    editor.boundingBox(),
    firstAction.boundingBox(),
  ]);
  expect(raisedEditorBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  const overlapWidth = Math.min(raisedEditorBox.x + raisedEditorBox.width, actionBox.x + actionBox.width)
    - Math.max(raisedEditorBox.x, actionBox.x);
  const overlapHeight = Math.min(raisedEditorBox.y + raisedEditorBox.height, actionBox.y + actionBox.height)
    - Math.max(raisedEditorBox.y, actionBox.y);
  expect(overlapWidth).toBeGreaterThan(0);
  expect(overlapHeight).toBeGreaterThan(0);
  expect(await firstAction.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    ) === button;
  })).toBe(true);
});
