import test from "node:test";
import assert from "node:assert/strict";
import { compactPersonName } from "./personName.js";

test("compactPersonName keeps the first name and last-name initial", () => {
  assert.equal(compactPersonName("Sittipong Kittipong"), "Sittipong K.");
  assert.equal(compactPersonName("Sittipong Middle Kittipong"), "Sittipong K.");
});

test("compactPersonName preserves single names and emails", () => {
  assert.equal(compactPersonName("Sittipong"), "Sittipong");
  assert.equal(compactPersonName("user@example.com"), "user@example.com");
  assert.equal(compactPersonName(""), "");
});
