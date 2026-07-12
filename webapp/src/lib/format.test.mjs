import { test } from "node:test";
import assert from "node:assert/strict";
import { displayDateToIso, fmtDateNumeric, fmtNumber, fmtPercent, formatMoneyInput, formatMoneyInputWhileTyping, formatNationalIdInput, formatPhoneInput, isoDateToDisplay, parseNumberInput } from "./format.js";

test("money input accepts raw and grouped values", () => {
  assert.equal(parseNumberInput("1,000,000.50"), 1000000.5);
  assert.equal(formatMoneyInput("1000000"), "1,000,000.00");
  assert.equal(formatMoneyInputWhileTyping("1000000"), "1,000,000");
  assert.equal(formatMoneyInputWhileTyping("1000000.5"), "1,000,000.5");
});

test("date input converts display format and ISO payload without timezone", () => {
  assert.equal(isoDateToDisplay("2026-07-12"), "12/07/2026");
  assert.equal(displayDateToIso("12/07/2026"), "2026-07-12");
  assert.equal(displayDateToIso("31/02/2026"), null);
});

test("phone and national ID inputs format progressively", () => {
  assert.equal(formatPhoneInput("0812345678"), "081-234-5678");
  assert.equal(formatPhoneInput("021234567"), "02-123-4567");
  assert.equal(formatPhoneInput("08123"), "081-23");
  assert.equal(formatNationalIdInput("1234567890123"), "1-2345-67890-12-3");
  assert.equal(formatNationalIdInput("123456"), "1-2345-6");
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
