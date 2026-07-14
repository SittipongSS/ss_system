import test from "node:test";
import assert from "node:assert/strict";
import {
  MINE_TASK_VIEWS,
  matchesMineTaskView,
  responsibleTaskUserId,
  taskRelationship,
} from "./taskViews.js";

const names = { me: "ฉัน", creator: "คุณเอ", teammate: "Sittipong K." };
const nameForId = (id) => names[id] || "";

test("mine task views separate current responsibility from delegated work", () => {
  const self = { ownerId: "me" };
  const incoming = { ownerId: "creator", assigneeId: "me", assignedBy: "creator" };
  const outgoing = { ownerId: "me", assigneeId: "teammate", assignedBy: "me" };

  assert.equal(responsibleTaskUserId(self), "me");
  assert.equal(matchesMineTaskView(self, "me", MINE_TASK_VIEWS.RESPONSIBLE), true);
  assert.equal(matchesMineTaskView(incoming, "me", MINE_TASK_VIEWS.RESPONSIBLE), true);
  assert.equal(matchesMineTaskView(outgoing, "me", MINE_TASK_VIEWS.RESPONSIBLE), false);
  assert.equal(matchesMineTaskView(outgoing, "me", MINE_TASK_VIEWS.DELEGATED), true);
});

test("task relationship explains self, incoming and outgoing work", () => {
  assert.equal(taskRelationship({ ownerId: "me" }, "me", nameForId).label, "สร้างเอง");
  assert.equal(
    taskRelationship({ ownerId: "creator", assigneeId: "me", assignedBy: "creator" }, "me", nameForId).label,
    "คุณเอ มอบหมายให้คุณ",
  );
  assert.equal(
    taskRelationship({ ownerId: "me", assigneeId: "teammate", assignedBy: "me" }, "me", nameForId).label,
    "คุณมอบหมายให้ Sittipong K.",
  );
});

test("a confirmed takeover still identifies the original creator", () => {
  const taken = { ownerId: "creator", assigneeId: "me", assignedBy: "me", proxyBy: null };
  assert.equal(taskRelationship(taken, "me", nameForId).label, "คุณเอ มอบหมายให้คุณ");
});
