import test from "node:test";
import assert from "node:assert/strict";

import { enabledIndexes, nextEnabledIndex } from "./selectionNavigation.js";

const items = [
  { key: "one" },
  { key: "two", disabled: true },
  { key: "three" },
];

test("selection navigation skips disabled options and wraps", () => {
  assert.deepEqual(enabledIndexes(items), [0, 2]);
  assert.equal(nextEnabledIndex(items, 0, "ArrowRight"), 2);
  assert.equal(nextEnabledIndex(items, 2, "ArrowRight"), 0);
  assert.equal(nextEnabledIndex(items, 0, "ArrowLeft"), 2);
});

test("selection navigation supports boundaries and vertical controls", () => {
  assert.equal(nextEnabledIndex(items, 2, "Home"), 0);
  assert.equal(nextEnabledIndex(items, 0, "End"), 2);
  assert.equal(nextEnabledIndex(items, 0, "ArrowDown", "vertical"), 2);
  assert.equal(nextEnabledIndex(items, 0, "ArrowRight", "vertical"), -1);
});
