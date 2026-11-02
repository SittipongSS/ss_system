import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXCISE_REMAINDER_REASON_MAX, EXCISE_REMAINDER_REASON_MIN, exciseRemainderBlocker, exciseRemainderPatch, exciseRemainderReasonInput,
} from "./exciseRemainder.js";
import { exciseQuotationReference } from "./exciseQuotation.js";
import { roundsRemainingUnits } from "./exciseRounds.js";

/* ── ปิดยอดค้างค่าสรรพสามิต (แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11 V11 · D16–D17 · PR7b) ── */

const order = (over = {}) => ({ id: "SO-1", orderNumber: "SO-26100001-0", origin: "pipeline", status: "approved", supersededById: null, ...over });
const open = { liveCount: 1, hasRemaining: true };

test("เหตุผล 10–500 ตัวอักษร (ตัดช่องว่างหัวท้าย)", () => {
  assert.equal(exciseRemainderReasonInput({ reason: "  ลูกค้าลดจำนวนสั่งแล้ว  " }).value, "ลูกค้าลดจำนวนสั่งแล้ว");
  for (const reason of ["", "สั้นไป", "ก".repeat(EXCISE_REMAINDER_REASON_MAX + 1)]) {
    assert.match(exciseRemainderReasonInput({ reason }).error, new RegExp(`${EXCISE_REMAINDER_REASON_MIN}–${EXCISE_REMAINDER_REASON_MAX}`));
  }
});

test("ปิดยอดค้างได้เมื่อ: SO pipeline อนุมัติอยู่ · ออกแล้วอย่างน้อยหนึ่งรอบ · ยังค้าง · ยังไม่ปิด — เปิดกลับได้เมื่อปิดอยู่", () => {
  assert.equal(exciseRemainderBlocker(order(), { rounds: open }), null);
  assert.match(exciseRemainderBlocker(order(), { rounds: { liveCount: 0, hasRemaining: true } }), /ไม่เรียกเก็บในระบบ/, "D17: ยังไม่ออกสักรอบ");
  assert.match(exciseRemainderBlocker(order(), { rounds: { liveCount: 2, hasRemaining: false } }), /ครบทุกรายการแล้ว/);
  assert.match(exciseRemainderBlocker(order({ exciseRemainderClosedAt: "2026-11-02" }), { rounds: open }), /ปิดยอดค้างไปแล้ว/);
  assert.match(exciseRemainderBlocker(order({ status: "approval_revoked" }), { rounds: open }), /อนุมัติแล้ว/);
  assert.match(exciseRemainderBlocker(order({ origin: "excise" }), { rounds: open }), /ใบสั่งขายจากใบเสนอราคา/);
  assert.equal(exciseRemainderBlocker(order({ exciseRemainderClosedAt: "2026-11-02" }), { reopening: true }), null);
  assert.match(exciseRemainderBlocker(order(), { reopening: true }), /ยังไม่ได้ปิดยอดค้าง/);
  assert.equal(exciseRemainderBlocker(null), "ไม่พบใบสั่งขาย");
});

test("แพตช์: ปิด = ครบทั้งชุด (ใคร · เมื่อไร · เหตุผล) · เปิดกลับ = ว่างทั้งชุด", () => {
  assert.deepEqual(exciseRemainderPatch("ลูกค้าลดจำนวนสั่งแล้ว", { user: { id: "U1", name: "SA" }, at: "T" }), {
    exciseRemainderClosedAt: "T", exciseRemainderClosedById: "U1", exciseRemainderClosedByName: "SA", exciseRemainderClosedReason: "ลูกค้าลดจำนวนสั่งแล้ว",
  });
  assert.deepEqual(Object.values(exciseRemainderPatch(null)), [null, null, null, null]);
});

test("route SO: ปิด/เปิดยอดค้างใช้ตัวตัดสิน + เหตุผลชุดเดียวกับจอ · CAS updatedAt · audit พร้อมเหตุผล", () => {
  const route = readFileSync(new URL("../../app/api/sales-planning/sales-orders/[id]/route.js", import.meta.url), "utf8");
  assert.match(route, /if \(action === 'close_excise_remainder' \|\| action === 'reopen_excise_remainder'\) \{/);
  assert.match(route, /const input = exciseRemainderReasonInput\(body\);/);
  assert.match(route, /const blocker = exciseRemainderBlocker\(before, \{/);
  assert.match(route, /\.update\(\{ \.\.\.exciseRemainderPatch\(reopening \? null : input\.value, \{ user, at: now \}\), updatedAt: now \}\)\s*\.eq\('id', id\)\s*\.eq\('updatedAt', expected\.value\)/);
  assert.match(route, /ปิดยอดค้างค่าสรรพสามิต \$\{before\.orderNumber\}/);
  const page = readFileSync(new URL("../../app/sales-planning/sales-orders/[id]/page.js", import.meta.url), "utf8");
  assert.match(page, /const action = remainderMode === "reopen" \? "reopen_excise_remainder" : "close_excise_remainder";/);
  const track = readFileSync(new URL("../sales/salesOrderWorkTrack.js", import.meta.url), "utf8");
  assert.match(track, /label: 'ปิดยอดค้าง',\s*onClick: excise\.onCloseRemainder,/);
  assert.match(track, /label: 'เปิดยอดค้างกลับ',\s*onClick: excise\.onReopenRemainder,/);
});

test("D16: คำอ้างอิงรอบที่ 2 ขึ้นไปต่อท้าย \"· รอบที่ n\" · รอบแรกคงรูปเดิม", () => {
  assert.equal(exciseQuotationReference({ orderNumber: "SO-1" }, { quoteNumber: "QT-1" }), "SO-1 / QT-1");
  assert.equal(exciseQuotationReference({ orderNumber: "SO-1" }, { quoteNumber: "QT-1" }, 1), "SO-1 / QT-1");
  assert.equal(exciseQuotationReference({ orderNumber: "SO-1" }, { quoteNumber: "QT-1" }, 3), "SO-1 / QT-1 · รอบที่ 3");
  assert.equal(exciseQuotationReference(null, null, 2), "", "ไม่มีเลขอ้างอิง = ว่าง (ไม่ขึ้นแค่ 'รอบที่ 2')");
});

test("ยอดค้างจากยอดตรึงบนรอบล่าสุด − ผลรวมทุกรอบ · ไม่มียอดตรึง = null (ใบก่อนแบ่งรอบ)", () => {
  const round = (id, createdAt, qty, ordered) => ({
    id, createdAt, lines: [{ qty, metadata: { sourceSalesOrderLineId: "L1" } }],
    metadata: ordered ? { exciseSource: { orderedByLine: { L1: ordered } } } : {},
  });
  assert.equal(roundsRemainingUnits([round("A", "1", 4, 10), round("B", "2", 3, 10)]), 3);
  assert.equal(roundsRemainingUnits([round("A", "1", 10, 10)]), 0);
  assert.equal(roundsRemainingUnits([round("A", "1", 12, 10)]), 0, "ไม่ติดลบ");
  assert.equal(roundsRemainingUnits([round("A", "1", 4, null)]), null);
  assert.equal(roundsRemainingUnits([]), null);
});
