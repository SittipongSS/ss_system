import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDealOrder, reindexTasksByDealOrder, sortDealsByOrder } from "./dealOrder.js";

test("normalizeDealOrder keeps valid preferred ids and appends new deals", () => {
  const deals = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(normalizeDealOrder(deals, ["c", "missing", "c", "a"]), ["c", "a", "b"]);
});

test("sortDealsByOrder follows the project order", () => {
  const deals = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(sortDealsByOrder(deals, ["b", "c", "a"]).map((deal) => deal.id), ["b", "c", "a"]);
});

test("reindexTasksByDealOrder keeps central work first and preserves order inside each deal", () => {
  const tasks = [
    { id: "a2", dealId: "a", stepOrder: 3 },
    { id: "central", dealId: null, stepOrder: 9 },
    { id: "b1", dealId: "b", stepOrder: 2 },
    { id: "a1", dealId: "a", stepOrder: 1 },
  ];
  const result = reindexTasksByDealOrder(tasks, ["b", "a"]);
  assert.deepEqual(result.map((task) => task.id), ["central", "b1", "a1", "a2"]);
  assert.deepEqual(result.map((task) => task.stepOrder), [0, 1, 2, 3]);
});
