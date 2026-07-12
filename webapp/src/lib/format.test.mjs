import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDateNumeric, fmtNumber, fmtPercent, formatMoneyInput, parseNumberInput } from "./format.js";

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

test("date-only formatting preserves the calendar date without timezone parsing", () => {
  assert.equal(fmtDateNumeric("2026-07-12"), "12/07/2026");
  assert.equal(fmtDateNumeric("2026-07-12", { short: true }), "12/07/26");
  assert.equal(fmtDateNumeric("2026-07-12T00:00:00.000Z"), "12/07/2026");
});
