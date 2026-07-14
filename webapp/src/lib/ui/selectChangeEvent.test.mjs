import { test } from "node:test";
import assert from "node:assert/strict";
import { createSelectChangeEvent } from "./selectChangeEvent.js";

test("custom select change event supports native-style event controls", () => {
  const event = createSelectChangeEvent("Completed", "status");

  assert.deepEqual(event.target, { value: "Completed", name: "status" });
  assert.equal(event.currentTarget, event.target);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.isPropagationStopped(), false);

  event.stopPropagation();
  event.preventDefault();

  assert.equal(event.isPropagationStopped(), true);
  assert.equal(event.defaultPrevented, true);
});
