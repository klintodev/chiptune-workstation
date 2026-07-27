import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getPatternDeleteCopy } from "../src/features/arranger/pattern-library.js";

const root = new URL("../", import.meta.url);

test("pattern deletion copy covers unused and referenced patterns exactly", () => {
  assert.deepEqual(getPatternDeleteCopy("Unused bass", 0), {
    action: "Delete pattern and 0 clips",
    message: "Delete “Unused bass”? 0 arrangement clips will also be removed. This cannot be undone.",
  });
  assert.deepEqual(getPatternDeleteCopy("Busy lead", 3), {
    action: "Delete pattern and 3 clips",
    message: "Delete “Busy lead”? 3 arrangement clips will also be removed. This cannot be undone.",
  });
});

test("pattern deletion dialog has safe cancellation, confirmation, and focus paths", async () => {
  const [html, source] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/features/arranger/pattern-library.js", root), "utf8"),
  ]);

  assert.match(html, /<dialog id="pattern-delete-dialog"[^>]*aria-labelledby="pattern-delete-title"[^>]*aria-describedby="pattern-delete-message"/);
  assert.match(html, /id="pattern-delete-cancel"[^>]*>Cancel<\/button>/);
  assert.match(source, /elements\.deleteDialog\.showModal\(\);\s*elements\.deleteCancel\.focus\(\);/);
  assert.match(source, /addEventListener\("cancel",[\s\S]*?event\.preventDefault\(\);[\s\S]*?closeDeleteDialog\(\);/);
  assert.match(source, /event\.target === elements\.deleteDialog\) closeDeleteDialog\(\)/);
  assert.match(source, /deletePattern\(selectedPatternId, \{ removeReferences: true \}\)/);
  assert.match(source, /closeDeleteDialog\(false\);\s*elements\.select\.focus\(\);\s*announceStatus/);
  assert.match(source, /function closeDeleteDialog\(restoreFocus = true\)[\s\S]*?elements\.delete\.focus\(\)/);
});
