import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  handlePlaybackShortcut,
  hasPlayableArrangement,
} from "../src/features/arranger/transport-controls.js";
import { createOneShotPreview } from "../src/features/keyboard/keyboard.js";
import { getPatternBankRange } from "../src/features/pattern-editor/pattern-editor.js";
import { getAdjacentWorkspacePanel } from "../src/features/workspace-tabs/workspace-tabs.js";
import {
  hasOpenShortcutBlockingSurface,
  isGlobalShortcutEligible,
  isInteractiveShortcutTarget,
  isMusicalKeyboardEligible,
} from "../src/shared/keyboard-policy.js";
import { setTextIfChanged } from "../src/shared/status-announcer.js";
import {
  DEFAULT_PATTERN_ID,
  DEFAULT_TRACK_ID,
  createProjectState,
} from "../src/state/project-state.js";

const root = new URL("../", import.meta.url);

function relativeLuminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrast(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("global shortcuts leave focused controls and open dialogs alone", () => {
  const plainTarget = { closest: () => null };
  const interactiveTarget = {
    closest(selector) {
      assert.match(selector, /button/);
      assert.match(selector, /\[role='tab'\]/);
      return this;
    },
  };
  const closedRoot = { querySelector: () => null };
  let blockingSelector = "";
  const openRoot = {
    querySelector(selector) {
      blockingSelector = selector;
      return { open: true };
    },
  };

  assert.equal(isInteractiveShortcutTarget(interactiveTarget), true);
  assert.equal(isInteractiveShortcutTarget(plainTarget), false);
  assert.equal(isGlobalShortcutEligible({
    defaultPrevented: false,
    repeat: false,
    target: plainTarget,
  }, closedRoot), true);
  assert.equal(isGlobalShortcutEligible({
    defaultPrevented: false,
    repeat: false,
    target: interactiveTarget,
  }, closedRoot), false);
  assert.equal(isGlobalShortcutEligible({
    defaultPrevented: false,
    repeat: false,
    target: plainTarget,
  }, openRoot), false);
  assert.match(blockingSelector, /dialog\[open\]/);
  assert.match(blockingSelector, /details\[open\]/);
  assert.equal(isGlobalShortcutEligible({
    defaultPrevented: false,
    repeat: true,
    target: plainTarget,
  }, closedRoot), false);
});

test("Space starts playback, then stops and returns the playhead to step 1", () => {
  const root = { querySelector: () => null };
  const target = { closest: () => null };
  let status = "stopped";
  let playheadStep = 12;
  let startStep = 12;
  let playCount = 0;
  let stopCount = 0;
  const scheduler = {
    getState: () => ({ status }),
  };
  const createEvent = () => {
    let prevented = false;
    return {
      code: "Space",
      defaultPrevented: false,
      get prevented() { return prevented; },
      preventDefault() { prevented = true; },
      repeat: false,
      target,
    };
  };
  const options = {
    root,
    scheduler,
    startPlayback() {
      playCount += 1;
      status = "playing";
    },
    stopPlayback() {
      stopCount += 1;
      status = "stopped";
      playheadStep = 0;
      startStep = 0;
    },
  };

  const startEvent = createEvent();
  assert.equal(handlePlaybackShortcut(startEvent, options), true);
  assert.equal(startEvent.prevented, true);
  assert.equal(playCount, 1);
  assert.equal(status, "playing");

  const stopEvent = createEvent();
  assert.equal(handlePlaybackShortcut(stopEvent, options), true);
  assert.equal(stopEvent.prevented, true);
  assert.equal(stopCount, 1);
  assert.equal(status, "stopped");
  assert.equal(playheadStep, 0);
  assert.equal(startStep, 0);
});

test("hidden disclosure content does not disable musical keyboard input", () => {
  const buttonTarget = {
    closest(selector) {
      return selector.split(", ").includes("button") ? this : null;
    },
  };
  const editableTarget = {
    closest(selector) {
      return selector.split(", ").includes("input") ? this : null;
    },
  };
  const hiddenDisclosure = {
    closest(selector) {
      return selector.includes("dialog:not([open])") ? { open: false } : null;
    },
  };
  const visibleDialog = { closest: () => null };
  const hiddenRoot = { querySelectorAll: () => [hiddenDisclosure] };
  const dialogRoot = { querySelectorAll: () => [visibleDialog] };
  const closedRoot = { querySelectorAll: () => [] };
  const event = {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    repeat: false,
    target: buttonTarget,
  };

  assert.equal(hasOpenShortcutBlockingSurface(hiddenRoot), false);
  assert.equal(isMusicalKeyboardEligible(event, closedRoot), true);
  assert.equal(isMusicalKeyboardEligible({ ...event, target: editableTarget }, closedRoot), false);
  assert.equal(isMusicalKeyboardEligible({ ...event, ctrlKey: true }, closedRoot), false);
  assert.equal(isMusicalKeyboardEligible(event, dialogRoot), false);
});

test("responsive pattern banks clamp and describe the visible step range", () => {
  assert.deepEqual(getPatternBankRange(16, 0, 4), {
    count: 4, end: 4, index: 0, start: 0,
  });
  assert.deepEqual(getPatternBankRange(16, 2, 4), {
    count: 4, end: 12, index: 2, start: 8,
  });
  assert.deepEqual(getPatternBankRange(16, 99, 8), {
    count: 2, end: 16, index: 1, start: 8,
  });
  assert.deepEqual(getPatternBankRange(32, -1, 8), {
    count: 4, end: 8, index: 0, start: 0,
  });
});

test("workspace tabs wrap with arrows and support Home and End", () => {
  assert.equal(getAdjacentWorkspacePanel("sequencer", "ArrowLeft"), "keyboard");
  assert.equal(getAdjacentWorkspacePanel("keyboard", "ArrowRight"), "sequencer");
  assert.equal(getAdjacentWorkspacePanel("instrument", "Home"), "sequencer");
  assert.equal(getAdjacentWorkspacePanel("sequencer", "End"), "keyboard");
});

test("song playback requires a placed loop that contains a note", () => {
  const project = createProjectState();
  assert.equal(hasPlayableArrangement(project.getState()), false);

  project.addClip(DEFAULT_TRACK_ID, DEFAULT_PATTERN_ID, 0);
  assert.equal(hasPlayableArrangement(project.getState()), false);

  project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0
      ? { note: 60, gate: 0.75, volume: 0 }
      : step),
  }));
  assert.equal(hasPlayableArrangement(project.getState()), false);

  project.updatePattern(DEFAULT_PATTERN_ID, (pattern) => ({
    ...pattern,
    steps: pattern.steps.map((step, index) => index === 0
      ? { note: 60, gate: 0.75, volume: 0.7 }
      : step),
  }));
  assert.equal(hasPlayableArrangement(project.getState()), true);
});

test("visual status text is only written when it changes", () => {
  const element = { textContent: "Stopped" };
  assert.equal(setTextIfChanged(element, "Stopped"), false);
  assert.equal(element.textContent, "Stopped");
  assert.equal(setTextIfChanged(element, "Playing"), true);
  assert.equal(element.textContent, "Playing");
});

test("focused piano keys own one 250 millisecond preview and release it safely", () => {
  let scheduled;
  let starts = 0;
  let stops = 0;
  const preview = createOneShotPreview({
    clearTimer: () => {},
    scheduleTimer(callback, duration) {
      scheduled = callback;
      assert.equal(duration, 250);
      return 1;
    },
    start() {
      starts += 1;
      return true;
    },
    stop() {
      stops += 1;
    },
  });

  assert.equal(preview.preview(), true);
  assert.equal(preview.preview(), false);
  assert.equal(starts, 1);
  scheduled();
  assert.equal(stops, 1);
  assert.equal(preview.preview(), true);
  assert.equal(preview.cancel(), true);
  assert.equal(stops, 2);
});

test("beginner-facing markup exposes explicit tools and a guided first loop", async () => {
  const [html, helpSource] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/features/help/help.js", root), "utf8"),
  ]);

  assert.match(html, /class="workspace-tabs" role="tablist"/);
  assert.equal(html.match(/role="tab"/g)?.length, 3);
  assert.equal(html.match(/role="tabpanel"/g)?.length, 3);
  assert.match(html, />Pattern<\/button>/);
  assert.match(html, />Instrument<\/button>/);
  assert.match(html, />Keyboard<\/button>/);
  assert.match(html, /id="pattern-preview" type="checkbox" checked/);
  assert.match(html, /Add loop to song/);
  assert.match(html, /Keyboard octave/);
  assert.match(html, /<dialog id="selected-step-inspector"/);
  assert.match(html, /id="selected-clip-inspector"/);
  assert.match(html, /id="mobile-mix-dialog"/);
  assert.match(html, /id="song-play-next"/);
  assert.match(html, /id="audio-setup-close"[^>]*>Continue without sound/);
  assert.match(html, /tap an empty step to add C4/);
  assert.ok((html.match(/aria-details="help-/g) ?? []).length >= 7);
  assert.match(helpSource, /aria-controls", "help-dialog"/);
  assert.match(helpSource, /aria-details", `help-/);
  for (const term of ["Pattern", "Clip", "Gate", "Velocity", "Voice", "Attack", "Release"]) {
    assert.match(helpSource, new RegExp(`<dt>${term}`));
  }
});

test("high-frequency displays are visual-only and use event announcements", async () => {
  const [html, audioStatus, transport, visualiser, player] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/features/audio-status/audio-status.js", root), "utf8"),
    readFile(new URL("src/features/arranger/transport-controls.js", root), "utf8"),
    readFile(new URL("src/features/visualiser/visualiser.js", root), "utf8"),
    readFile(new URL("src/player.js", root), "utf8"),
  ]);

  assert.doesNotMatch(html, /id="transport-status"[^>]*aria-live/);
  assert.doesNotMatch(html, /id="audio-time"[^>]*aria-live/);
  assert.equal(html.match(/id="workstation-status"/g)?.length, 1);
  assert.match(audioStatus, /elements\.audioTime\.textContent/);
  assert.match(audioStatus, /announceStatus\(root, "Ready"\)/);
  assert.match(transport, /setTextIfChanged\(elements\.status/);
  assert.match(visualiser, /<output class="visualiser-status" data-status><\/output>/);
  assert.match(visualiser, /data-announcer role="status" aria-live="polite"/);
  assert.doesNotMatch(visualiser, /Announce current view/);
  assert.match(player, /setTextIfChanged\(elements\.position/);
});

test("keyboard and clip operations have non-pointer interaction paths", async () => {
  const [keyboard, arrangementView, clipCss] = await Promise.all([
    readFile(new URL("src/features/keyboard/keyboard.js", root), "utf8"),
    readFile(new URL("src/features/arranger/arrangement-view.js", root), "utf8"),
    readFile(new URL("src/features/arranger/clip-drag.css", root), "utf8"),
  ]);

  assert.match(keyboard, /addEventListener\("keydown"/);
  assert.match(keyboard, /addEventListener\("keyup"/);
  assert.match(keyboard, /durationMs = 250/);
  assert.match(keyboard, /addEventListener\("lostpointercapture"/);
  assert.match(keyboard, /setAttribute\("aria-pressed"/);
  assert.match(arrangementView, /event\.shiftKey \? 4 : 1/);
  assert.match(arrangementView, /selected-clip-back-four/);
  assert.match(arrangementView, /Add at least one note to this loop/);
  assert.doesNotMatch(arrangementView, /arrangement-clip-remove/);
  assert.doesNotMatch(clipCss, /arrangement-clip-remove/);
});

test("mobile controls reflow without fixed-width racks and respect motion preferences", async () => {
  const [baseCss, instrumentCss, audioCss] = await Promise.all([
    readFile(new URL("src/styles/base.css", root), "utf8"),
    readFile(new URL("src/features/instrument/instrument.css", root), "utf8"),
    readFile(new URL("src/features/audio-status/audio-status.css", root), "utf8"),
  ]);

  assert.match(instrumentCss, /@media \(max-width: 900px\)[\s\S]*\.device-rack\s*{[^}]*width:\s*100%[^}]*grid-template-columns:\s*1fr/);
  assert.match(baseCss, /@media \(pointer: coarse\)[\s\S]*min-height:\s*44px/);
  assert.match(baseCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.001ms/);
  assert.match(audioCss, /@media \(max-width: 600px\)[\s\S]*grid-template-areas:\s*"project status" "transport transport"/);
  assert.doesNotMatch(instrumentCss, /min-width:\s*820px/);
});

test("strengthened separators retain at least 3:1 contrast in both themes", async () => {
  const css = await readFile(new URL("src/features/theme/theme.css", root), "utf8");
  const darkTheme = css.match(/:root\s*{([^}]+)}/)[1];
  const lightTheme = css.match(/:root\[data-theme="light"\]\s*{([^}]+)}/)[1];
  const token = (theme, name) => (
    theme.match(new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, "i"))[1]
  );

  assert.ok(contrast(token(darkTheme, "line-strong"), token(darkTheme, "panel")) >= 3);
  assert.ok(contrast(token(darkTheme, "line-bright"), token(darkTheme, "panel")) >= 3);
  assert.ok(contrast(token(lightTheme, "line-strong"), token(lightTheme, "panel")) >= 3);
  assert.ok(contrast(token(lightTheme, "line-bright"), token(lightTheme, "panel")) >= 3);
});
