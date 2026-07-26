import test from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_TOAST_QUEUE,
  normalizeToast,
  toastQueueReducer,
} from "./toastQueue.js";

const makeToast = (id, kind = "info") => normalizeToast(
  { id, kind, msg: `message ${id}` },
  {},
  () => id,
);

test("normalizeToast accepts legacy and provider message shapes", () => {
  assert.deepEqual(
    normalizeToast({ id: "legacy", kind: "success", msg: " บันทึกแล้ว " }),
    { id: "legacy", kind: "success", msg: "บันทึกแล้ว", duration: undefined },
  );
  assert.equal(normalizeToast("โหลดข้อมูลแล้ว", { kind: "success" }, () => "generated").id, "generated");
  assert.equal(normalizeToast(new Error("เชื่อมต่อไม่สำเร็จ"), { kind: "error" }).msg, "เชื่อมต่อไม่สำเร็จ");
  assert.equal(normalizeToast({ msg: "fallback", kind: "unknown" }).kind, "info");
  assert.throws(() => normalizeToast("   "), /non-empty message/);
});

test("toast queue is FIFO and advances after dismissing the active toast", () => {
  let state = INITIAL_TOAST_QUEUE;
  state = toastQueueReducer(state, { type: "enqueue", toast: makeToast("a") });
  state = toastQueueReducer(state, { type: "enqueue", toast: makeToast("b") });
  state = toastQueueReducer(state, { type: "enqueue", toast: makeToast("c") });

  assert.equal(state.active.id, "a");
  assert.deepEqual(state.pending.map((toast) => toast.id), ["b", "c"]);

  state = toastQueueReducer(state, { type: "dismiss", id: "a" });
  assert.equal(state.active.id, "b");
  assert.deepEqual(state.pending.map((toast) => toast.id), ["c"]);
});

test("toast queue bounds pending work and can dismiss queued items", () => {
  let state = INITIAL_TOAST_QUEUE;
  for (const id of ["a", "b", "c", "d"]) {
    state = toastQueueReducer(state, {
      type: "enqueue",
      toast: makeToast(id),
      maxQueue: 3,
    });
  }

  assert.equal(state.active.id, "a");
  assert.deepEqual(state.pending.map((toast) => toast.id), ["c", "d"]);

  state = toastQueueReducer(state, { type: "dismiss", id: "c" });
  assert.deepEqual(state.pending.map((toast) => toast.id), ["d"]);
  assert.equal(toastQueueReducer(state, { type: "clear" }), INITIAL_TOAST_QUEUE);
});
