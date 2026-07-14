import test from "node:test";
import assert from "node:assert/strict";
import { summarizeOpenTasks } from "./taskSummary.js";

test("dashboard task summary hides completed work and separates overdue from urgent", () => {
  const result = summarizeOpenTasks([
    { status: "Pending", dueDate: "2026-07-14" },
    { status: "In Progress", dueDate: "2026-07-13" },
    { status: "Pending", dueDate: "2026-07-16" },
    { status: "Pending", urgent: true },
    { status: "Completed", dueDate: "2026-07-14", urgent: true },
  ], "2026-07-14");

  assert.deepEqual(result, { total: 4, today: 1, overdue: 1, urgent: 3 });
});

