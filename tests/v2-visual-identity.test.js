import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createV2ThemeController } from "../src/v2/ui/theme-controller.js";

const root = new URL("../", import.meta.url);

test("V2 reuses the established Klinto palette, typography, and framed shell", async () => {
  const css = await readFile(new URL("src/v2/styles/studio.css", root), "utf8");

  assert.match(css, /--v2-bg:\s*var\(--bg-0\)/);
  assert.match(css, /--v2-accent:\s*var\(--accent\)/);
  assert.match(css, /\.v2-workspace\s*{[^}]*margin:\s*14px;[^}]*font-family:\s*"VT323"/s);
  assert.match(css, /\.v2-workspace button,[\s\S]*font-family:\s*"Silkscreen"/);
  assert.doesNotMatch(css, /Atkinson Hyperlegible|#ffbd5b|#6ee7e0/i);
  assert.doesNotMatch(css, /var\(--v2-accent-bright\)/);
  assert.match(css, /\.v2-piano-note\.is-selected\s*{[^}]*var\(--v2-selection\) 42%/s);
  assert.match(css, /\.v2-playlist-marquee\s*{[^}]*var\(--v2-selection\)[^}]*pointer-events:\s*none/s);
});

test("V2 theme state changes the shared theme root and exposes its current state", () => {
  const values = new Map([["chiptune-workstation:theme", "dark"]]);
  const button = {
    attributes: new Map(),
    dataset: {},
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    textContent: "",
    title: "",
  };
  const documentLike = {
    documentElement: { dataset: {} },
    querySelector: (selector) => selector === "#theme-toggle" ? button : null,
  };
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  const controller = createV2ThemeController({ document: documentLike, storage });
  assert.equal(documentLike.documentElement.dataset.theme, "dark");
  assert.equal(button.textContent, "Theme: Dark");
  assert.equal(button.attributes.get("aria-label"), "Use light theme");

  assert.equal(controller.toggle(), "light");
  assert.equal(documentLike.documentElement.dataset.theme, "light");
  assert.equal(button.dataset.theme, "light");
  assert.equal(button.attributes.get("aria-pressed"), "true");
  assert.equal(button.textContent, "Theme: Light");
  assert.equal(values.get("chiptune-workstation:theme"), "light");
});

test("Piano Roll grid geometry and Mixer density remain visually bounded", async () => {
  const css = await readFile(new URL("src/v2/styles/studio.css", root), "utf8");

  assert.match(css, /--v2-piano-label-width:\s*88px/);
  assert.match(css, /background-position:\s*var\(--v2-piano-label-width\) 0,\s*var\(--v2-piano-label-width\) 0/);
  assert.match(css, /\.v2-pitch-label\s*{[^}]*width:\s*var\(--v2-piano-label-width\)/s);
  assert.match(css, /\.v2-mixer-channels\s*{[^}]*align-items:\s*flex-start/s);
  assert.match(css, /\.v2-insert-chain\s*{[^}]*margin-top:\s*6px/s);
  assert.match(css, /\.v2-playlist-add-instrument-row\s*{[^}]*position:\s*absolute[^}]*height:\s*44px/s);
  assert.match(css, /\.v2-playlist-add-instrument-cell\s*{[^}]*position:\s*sticky[^}]*left:\s*0[^}]*width:\s*310px/s);
  assert.match(css, /\.v2-playlist-track-header\s*{[^}]*grid-template-columns:\s*minmax\(94px, 1\.15fr\) minmax\(98px, 1fr\) 84px;[^}]*width:\s*310px/s);
  assert.match(css, /\.v2-playlist-track-actions\s*{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*repeat\(2, 26px\);[^}]*height:\s*55px;[^}]*gap:\s*3px;/s);
  assert.match(css, /\.v2-playlist-track-switches\s*{[^}]*grid-template-columns:\s*repeat\(2, 1fr\);/s);
  assert.match(css, /\.v2-playlist-track-management\s*{[^}]*grid-template-columns:\s*repeat\(3, 1fr\);/s);
  assert.match(css, /\.v2-playlist-track-switches button\[aria-pressed="true"\]\s*{[^}]*border-color:\s*var\(--v2-accent-strong\);[^}]*background:\s*var\(--v2-accent\);/s);
  assert.match(css, /\.v2-workspace \.v2-playlist-track-switches button\[aria-pressed="true"\]:hover:not\(:disabled\),[\s\S]*:focus-visible\s*{[^}]*background:\s*var\(--v2-accent\);/s);
  assert.match(css, /\.v2-playlist-track-context-menu\s*{[^}]*position:\s*fixed[^}]*z-index:\s*250[^}]*max-width:\s*calc\(100vw - 16px\)/s);
  assert.match(css, /\.v2-playlist-track-context-menu button\[role="menuitem"\]\s*{[^}]*width:\s*100%[^}]*text-align:\s*left/s);
  assert.match(css, /@media \(max-width:\s*1400px\)\s*{[\s\S]*\.v2-brand-name,[\s\S]*\.v2-master-readout\s*{\s*display:\s*none/s);
  assert.match(css, /@media \(max-width:\s*1040px\)\s*{[\s\S]*\.v2-global-shell\s*{[^}]*min-width:\s*0/s);
  assert.match(css, /@media \(max-width:\s*700px\)\s*{[\s\S]*grid-template-rows:\s*44px 44px/s);
  assert.match(css, /grid-template-areas:\s*"surfaces surfaces" "theme menu"/);
  assert.doesNotMatch(css, /\.v2-audio-status|\.v2-status-light/);
});
