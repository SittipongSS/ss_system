import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtNumber, fmtPercent, formatMoneyInput, parseNumberInput } from "./format.js";

test("money input accepts raw and grouped values", () => {
  assert.equal(parseNumberInput("1,000,000.50"), 1000000.5);
  assert.equal(formatMoneyInput("1000000"), "1,000,000.00");
});

test("number input preserves valid zero and rejects incomplete input", () => {
  assert.equal(parseNumberInput("0"), 0);
  assert.equal(parseNumberInput("-"), null);
  assert.equal(parseNumberInput("abc"), null);
});

test("shared number and percent formatting is deterministic", () => {
  assert.equal(fmtNumber(25056), "25,056");
  assert.equal(fmtPercent(80), "80.00%");
});
