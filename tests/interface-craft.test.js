import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function collectCss(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...await collectCss(url));
    else if (entry.name.endsWith(".css")) files.push(url);
  }
  return files;
}

test("startup and audio setup reveal the workstation before asking for sound", async () => {
  const [html, audioStatus] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/features/audio-status/audio-status.js", root), "utf8"),
  ]);

  assert.doesNotMatch(html, /critical-reveal|visibility:\s*hidden/);
  assert.doesNotMatch(html, /<dialog id="audio-setup"[^>]*\sopen(?:\s|>)/);
  assert.match(audioStatus, /async function enable\(\)/);
  assert.match(audioStatus, /if \(error && !setupDismissed && !elements\.setup\.open\) openSetup\(\)/);
  assert.doesNotMatch(audioStatus, /needsSetup && !setupDismissed/);
});

test("beginner controls use one accessible source of truth and plain labels", async () => {
  const [html, instrument, pattern] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/features/instrument/instrument.js", root), "utf8"),
    readFile(new URL("src/features/pattern-editor/pattern-editor.js", root), "utf8"),
  ]);

  assert.doesNotMatch(html, /id="(?:voice-type|pattern-pitch|pattern-octave)"/);
  assert.match(html, />Note length\s*</);
  assert.match(html, />Loudness\s*</);
  assert.match(html, /<legend>Sound shape\s*</);
  assert.equal(html.match(/role="radio" data-voice=/g)?.length, 6);
  assert.doesNotMatch(html, /Note length \(gate\)|Loudness \(velocity\)|Sound shape \(voice\)/);
  assert.match(instrument, /event\.key === "ArrowRight"/);
  assert.doesNotMatch(instrument, /#voice-type/);
  assert.doesNotMatch(pattern, /pitchSelect|octaveSelect/);
});

test("pixel typography, semantic state colours, and timeline geometry stay intentional", async () => {
  const cssFiles = [
    new URL("player.css", root),
    ...await collectCss(new URL("src/", root)),
  ];
  const cssSources = await Promise.all(cssFiles.map((url) => readFile(url, "utf8")));
  for (const [index, css] of cssSources.entries()) {
    for (const match of css.matchAll(/[^{}]+\{([^{}]*)\}/g)) {
      const declarations = match[1];
      if (!/font-family:\s*"Silkscreen"/.test(declarations) || !/font-size:/.test(declarations)) continue;
      assert.match(
        declarations,
        /font-size:\s*var\(--font-pixel-(?:label|title)\)/,
        `${cssFiles[index].pathname} renders Silkscreen off its 8px grid`,
      );
    }
  }

  const [theme, arranger, pattern] = await Promise.all([
    readFile(new URL("src/features/theme/theme.css", root), "utf8"),
    readFile(new URL("src/features/arranger/arranger.css", root), "utf8"),
    readFile(new URL("src/features/pattern-editor/pattern-editor.css", root), "utf8"),
  ]);
  const combined = cssSources.join("\n");
  assert.doesNotMatch(combined, /--selection/);
  assert.match(theme, /--selected:/);
  assert.match(theme, /--playing:/);
  assert.doesNotMatch(arranger, /3584px|223px|224px/);
  assert.match(arranger, /--timeline-step-width/);
  assert.match(pattern, /\.pattern-step\.selected\.playback-step\s*{[^}]*--selected[^}]*--playing/);
  assert.doesNotMatch(pattern, /content:\s*"▶"|3px double/);
});

test("transport art and first-run hierarchy are app-owned", async () => {
  const [html, workspace, visualiser] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/features/workspace-tabs/workspace-tabs.js", root), "utf8"),
    readFile(new URL("src/features/visualiser/visualiser.css", root), "utf8"),
  ]);

  for (const id of ["transport-start", "transport-play", "transport-stop", "transport-loop"]) {
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]{0,400}<svg`));
  }
  assert.match(html, /class="pattern-menu"[\s\S]*<summary[^>]*>[\s\S]*<svg/);
  assert.match(workspace, /classList\.toggle\("awaiting-first-clip", !hasClips\)/);
  assert.match(visualiser, /\.daw-workspace\.awaiting-first-clip/);
  assert.match(html, /class="mobile-arrangement-note"/);
});
