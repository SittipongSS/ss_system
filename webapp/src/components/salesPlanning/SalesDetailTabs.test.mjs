import test from "node:test";
import assert from "node:assert/strict";
import {
  detailTabFromSearch, PROJECT_DETAIL_TABS, SALES_DETAIL_TABS,
} from "../../lib/salesDetailTabs.js";

test("แท็บของดีลเรียงตามที่ตกลงไว้ — เอกสารอยู่ท้ายสุด (มติผู้ใช้)", () => {
  assert.deepEqual(
    SALES_DETAIL_TABS.map((tab) => tab.key),
    ["overview", "timeline", "quotations", "tasks", "inquiries", "activities", "documents"],
  );
});

test("⚠️ `documents` ของสองชุดคนละความหมาย — ห้ามยุบเข้าหากัน", () => {
  // ดีล: รวมไฟล์ 6 แหล่ง (P5b) · โครงการ: ยุบใบเสนอราคา+SO (มติ 2026-08-05)
  // ทั้งคู่ชื่อเดียวกันโดยบังเอิญ — เทสต์นี้มีไว้กันคนเห็นชื่อซ้ำแล้วรวมโค้ดเข้าด้วยกัน
  assert.ok(SALES_DETAIL_TABS.some((t) => t.key === "documents"));
  assert.ok(PROJECT_DETAIL_TABS.some((t) => t.key === "documents"));
  // โครงการยังไม่มี `quotations` เพราะยุบเข้า documents ไปแล้ว · ดีลยังมีทั้งคู่
  assert.ok(!PROJECT_DETAIL_TABS.some((t) => t.key === "quotations"));
  assert.ok(SALES_DETAIL_TABS.some((t) => t.key === "quotations"));
});

test("detailTabFromSearch preserves valid tabs and falls back to overview", () => {
  assert.equal(detailTabFromSearch("?tab=timeline"), "timeline");
  assert.equal(detailTabFromSearch("?tab=quotations"), "quotations");
  assert.equal(detailTabFromSearch("?tab=unknown"), "overview");
  assert.equal(detailTabFromSearch(""), "overview");
});
