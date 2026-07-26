import assert from "node:assert/strict";
import test from "node:test";

import { createBoundedUniqueName } from "../src/shared/bounded-name.js";

test("bounded names reserve readable suffixes before truncating", () => {
  const names = new Set();
  for (let index = 0; index < 12; index += 1) {
    const name = createBoundedUniqueName("A".repeat(32), names, {
      maximumLength: 32,
      suffix: "copy",
    });
    assert.ok(name.length <= 32);
    assert.match(name, / copy(?: \d+)?$/);
    names.add(name);
  }
  assert.equal(names.size, 12);
});

test("bounded names normalize whitespace and keep Unicode bases valid", () => {
  assert.equal(createBoundedUniqueName("   ", [], {
    fallback: "New layer",
    maximumLength: 12,
  }), "New layer");
  assert.equal(createBoundedUniqueName("  星   の   曲  ", [], {
    maximumLength: 12,
  }), "星 の 曲");
  assert.equal(createBoundedUniqueName("Tune", ["Tune"], {
    maximumLength: 8,
  }), "Tune 2");
});
