import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FILING_EDITABLE_STATUSES, FILING_TRANSITIONS, TRACKS, canTransitionFiling, filingTransitionError } from "./workflow.js";
import {
  FILING_SKIP_REASON_MIN, exciseOrderFilingLines, filingRecalcBlock, filingSourceOf, filingStartGateError, filingStartGates,
} from "./raFilingRules.js";

/* 🔴 ตรวจระบบ 2026-10-26 ข้อ 4 — route ใบยื่นเช็กสถานะต้นทางแค่ 3 ปลายทาง ⇒ RA ปิดงาน "ชำระแล้ว" จากร่างได้ ·
   ตีกลับใบที่ชำระแล้วได้ · เลขใบเสร็จบังคับแค่ในโมดัล ⇒ ตารางเดียว + ด่านที่ server
   ⭐ แผนรื้อสรรพสามิต PR5 (มติ 28/10): ใบยื่นเป็นของ RA ทั้งเส้น — ร่าง → กำลังยื่น → ชำระแล้ว → ส่งเอกสารแล้ว · ตีกลับ = RA ระหว่างยื่น
      ขั้น "รับเงิน" ของฝ่ายขายบนใบยื่นหายไป (เงินค่าภาษีเก็บด้วย SO ค่าสรรพสามิต · บัญชีปิดใบ) */
const SA = { sales: true, ra: false };
const RA = { sales: false, ra: true };
const ADMIN = { sales: true, ra: true };
const ALL = ["draft", "pending", "received", "filing", "complete", "delivered", "rejected"];
const ok = (args) => filingTransitionError(args) === null;

test("ทางเดินปกติครบเส้น (ใบเสียภาษี) — RA ทุกขั้น · ใบเสร็จกรมบังคับตอนปิด", () => {
  assert.ok(ok({ from: "draft", to: "filing", caps: RA }));
  assert.ok(ok({ from: "filing", to: "complete", caps: RA, fields: { exciseReceiptNumber: "ER-1" } }));
  assert.ok(ok({ from: "complete", to: "delivered", caps: RA }));
  assert.ok(ok({ from: "filing", to: "rejected", caps: RA, fields: { rejectionReason: "ยอดไม่ตรง" } }));
  assert.ok(ok({ from: "rejected", to: "filing", caps: RA }));
  assert.deepEqual(TRACKS.payment.stages.map((s) => s.key), ["draft", "rejected", "filing", "complete", "delivered"]);
  assert.ok(TRACKS.payment.stages.every((s) => s.done || s.owner === "RA"), "ทุกขั้นที่ยังไม่จบเป็นของ RA");
  assert.deepEqual(FILING_EDITABLE_STATUSES, ["draft", "rejected"]);
});

test("ข้ามขั้นไม่ได้ — ทุกคู่ที่ไม่อยู่ในตาราง ตอบ 400 แม้เป็นแอดมิน · ขั้นรับเงินของฝ่ายขายหายแล้ว", () => {
  const allowed = new Set(["draft>filing", "rejected>filing", "filing>complete", "complete>delivered", "filing>rejected"]);
  const fields = { exciseReceiptNumber: "x", rejectionReason: "x" };
  for (const from of ALL) {
    for (const to of Object.keys(FILING_TRANSITIONS)) {
      if (from === to) continue;
      const result = filingTransitionError({ from, to, caps: ADMIN, fields });
      if (allowed.has(`${from}>${to}`)) assert.equal(result, null, `${from} → ${to} ต้องผ่าน`);
      else assert.equal(result?.status, 400, `${from} → ${to} ต้องถูกปฏิเสธ`);
    }
  }
  for (const gone of ["pending", "received"]) {
    assert.equal(filingTransitionError({ from: "draft", to: gone, caps: ADMIN, fields }).status, 400, `${gone} ไม่ใช่ปลายทางแล้ว`);
  }
  // เคสจริงที่เคยหลุด: ปิดงานจากร่าง (ใบเสียภาษี) · ตีกลับใบที่ชำระแล้ว
  assert.match(filingTransitionError({ from: "draft", to: "complete", caps: RA, fields }).error, /ต้องมาจาก "กำลังยื่น"/);
  assert.equal(filingTransitionError({ from: "complete", to: "rejected", caps: RA, fields }).status, 400);
});

test("ใครทำ: ฝ่ายขายไม่มีขั้นไหนบนใบยื่นแล้ว (403)", () => {
  assert.equal(filingTransitionError({ from: "draft", to: "filing", caps: SA }).status, 403);
  assert.equal(filingTransitionError({ from: "filing", to: "complete", caps: SA, fields: { exciseReceiptNumber: "x" } }).status, 403);
  assert.equal(filingTransitionError({ from: "complete", to: "delivered", caps: SA }).status, 403);
  assert.equal(filingTransitionError({ from: "draft", to: "nonsense", caps: ADMIN }).status, 400);
});

test("เลขเอกสารบังคับที่ server — ว่าง/ช่องว่างล้วนไม่ผ่าน · ใบยกเว้นไม่ต้องมีเลขใบเสร็จ", () => {
  for (const blank of [undefined, null, "", "   "]) {
    assert.match(filingTransitionError({ from: "filing", to: "complete", caps: RA, fields: { exciseReceiptNumber: blank } }).error, /ใบเสร็จสรรพสามิต/);
    assert.match(filingTransitionError({ from: "filing", to: "rejected", caps: RA, fields: { rejectionReason: blank } }).error, /เหตุผลที่ตีกลับ/);
  }
  assert.ok(ok({ from: "draft", to: "complete", caps: RA, exempt: true }));
  assert.equal(filingTransitionError({ from: "filing", to: "rejected", caps: RA, exempt: true }).status, 400, "ตีกลับต้องมีเหตุผลเสมอ");
});

test("ใบยกเว้น: ร่าง → ชำระแล้วได้ตรง (ไม่มีขั้นยื่น) · ใบเสียภาษีทำแบบนั้นไม่ได้ · ใบยกเว้นเข้า 'กำลังยื่น' ไม่ได้", () => {
  assert.equal(filingTransitionError({ from: "draft", to: "complete", caps: RA, fields: { exciseReceiptNumber: "x" } }).status, 400);
  assert.match(filingTransitionError({ from: "draft", to: "filing", caps: RA, exempt: true }).error, /ยกเว้นภาษี/);
  assert.equal(canTransitionFiling("draft", "complete", { exempt: true }), true);
  assert.equal(canTransitionFiling("draft", "complete"), false);
  assert.equal(canTransitionFiling("draft", "filing", { exempt: true }), false);
});

/* ── ด่านเริ่มยื่น (แผน หมวด 3.6 · Q15): เงินปิดใบแล้ว · ทะเบียนครบ — ข้ามได้ใส่เหตุผล ───────────────────── */
const exciseFiling = (items) => ({ salesOrderId: "S1", exciseSalesOrderId: "SX1", items });
const reason = "ลูกค้าโอนแล้ว บัญชียังไม่ปิดใบ";

test("ด่านเงิน: ใบผูก SO ค่าสรรพสามิต ต้องให้บัญชีปิดใบก่อน (หรือเหตุผล) · ใบไม่เรียกเก็บผ่านเสมอ", () => {
  const items = [{ registrationId: "R1" }];
  const pending = filingStartGates({ order: exciseFiling(items), exciseOrder: { orderNumber: "SO-X", financeStatus: "pending" } });
  assert.equal(pending.money.ok, false);
  assert.match(pending.money.label, /บัญชียังไม่ปิดใบ.*SO-X.*รอปิดใบ/);
  assert.match(filingStartGateError(pending, {}), /ระบุเหตุผลที่เริ่มยื่นก่อนบัญชีปิดใบ/);
  assert.match(filingStartGateError(pending, { skipMoneyReason: "สั้น" }), /ระบุเหตุผล/);
  assert.equal(filingStartGateError(pending, { skipMoneyReason: reason }), null);
  const closed = filingStartGates({ order: exciseFiling(items), exciseOrder: { orderNumber: "SO-X", financeStatus: "approved" } });
  assert.equal(closed.money.ok, true);
  assert.equal(filingStartGateError(closed, {}), null);
  const notBilled = filingStartGates({ order: { salesOrderId: "S1", items }, notBilledKind: "collected_outside" });
  assert.equal(notBilled.money.ok, true);
  assert.match(notBilled.money.label, /เก็บนอกระบบแล้ว/);
  assert.ok(reason.length >= FILING_SKIP_REASON_MIN);
});

test("ด่านทะเบียน: รายการที่ไม่มีทะเบียนอนุมัติต้องมีเหตุผลข้าม · นับจำนวนให้เห็น", () => {
  const gates = filingStartGates({
    order: exciseFiling([{ registrationId: "R1" }, { registrationId: null }, { registrationId: null }]),
    exciseOrder: { financeStatus: "approved" },
  });
  assert.equal(gates.registration.ok, false);
  assert.equal(gates.registration.missing, 2);
  assert.match(filingStartGateError(gates, {}), /ยังไม่มีทะเบียนอนุมัติ 2 รายการ/);
  assert.equal(filingStartGateError(gates, { skipRegistrationReason: "ทะเบียนรอกรมอนุมัติ ยื่นภาษีก่อน" }), null);
});

test("แหล่งของใบ + คิดใหม่: ใบผูก SO ค่าสรรพสามิตคิดใหม่ไม่ได้ (ยอดที่ลูกค้าจ่ายแล้ว) · ใบไม่เรียกเก็บได้", () => {
  assert.equal(filingSourceOf({ salesOrderId: "S1", exciseSalesOrderId: "SX1" }), "excise_order");
  assert.equal(filingSourceOf({ salesOrderId: "S1" }), "not_billed");
  assert.equal(filingSourceOf({}), null);
  assert.match(filingRecalcBlock({ salesOrderId: "S1", exciseSalesOrderId: "SX1" }), /ยอดที่ลูกค้าจ่ายแล้ว/);
  assert.equal(filingRecalcBlock({ salesOrderId: "S1" }), null);
  assert.match(filingRecalcBlock({}), /ไม่ได้สร้างจากใบสั่งขาย/);
});

test("รายการจากใบค่าสรรพสามิต: FG ต้นทาง · ลิงก์บรรทัด SO ลูกค้า · ช่อง ภส. ตามใบ · ทะเบียนจากผล resolve ของ SO ลูกค้า", () => {
  const exciseLines = [
    { qty: 10, unitPrice: 9.42, metadata: { lineKind: "excise_charge", sourceSalesOrderLineId: "L1", sourceProductId: "P1", sourceFgCode: "FG-1", excisePerUnit: 8.56, localPerUnit: 0.86 } },
    { qty: 4, unitPrice: 5, metadata: { lineKind: "excise_charge", sourceSalesOrderLineId: "L2", sourceProductId: "P2", sourceFgCode: "FG-2", excisePerUnit: 3, localPerUnit: 1 } },
    { qty: 1, unitPrice: 1, metadata: { lineKind: "other" } },
  ];
  const customerLines = [{ salesOrderLineId: "L1", registrationId: "R1", registrationState: "approved", productId: "P1", fgCode: "FG-1", description: "น้ำหอม" }];
  const built = exciseOrderFilingLines({ exciseLines, customerLines });
  assert.equal(built.lines.length, 2, "บรรทัดที่ไม่ใช่ค่าสรรพสามิตไม่เข้าใบยื่น");
  const [a, b] = built.lines;
  assert.equal(a.productId, "P1");
  assert.equal(a.salesOrderLineId, "L1");
  assert.equal(a.registrationId, "R1");
  assert.equal(a.exciseRatePerUnit, 8.56);
  assert.equal(a.localTaxRatePerUnit, 0.86);
  assert.equal(a.totalTax, 94.2);
  assert.equal(b.registrationId, null, "ไม่มีบรรทัด SO ลูกค้าที่จับคู่ = ไม่มีทะเบียน");
  assert.equal(b.exciseRatePerUnit, 5, "ช่อง ภส. ไม่รวมเป็นราคา/ชิ้น ⇒ ยึดราคาบนใบทั้งก้อน");
  assert.equal(b.localTaxRatePerUnit, 0);
  assert.deepEqual(built.warnings.map((w) => w.code).sort(), ["registration_missing", "tax_split_mismatch"]);
  assert.equal(built.totalTax, 114.2);
});

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const route = codeOnly(read("../../app/api/orders/[id]/route.js"));
const page = codeOnly(read("../../app/tax/filings/[id]/page.js"));

test("route ตัดสินด้วยตารางกลาง + ด่านเริ่มยื่นตัวเดียวกับโมดัล · ยกเว้นตัดสินจากทะเบียน (stampExemptFlags) ไม่ใช่ยอด 0", () => {
  assert.match(route, /filingTransitionError\(\{\s*from: order\.status, to: target, caps: \{ sales: isSales, ra: isLegal \}, exempt, fields,/);
  assert.match(route, /stampExemptFlags\(supabase, \[\{ \.\.\.order, items \}\]\)/);
  assert.doesNotMatch(route, /salesTargets|legalTargets/, "รายการปลายทางแยกตามฝ่ายแบบเดิมห้ามกลับมา");
  assert.match(route, /exciseReceiptNumber: updates\.exciseReceiptNumber !== undefined \? updates\.exciseReceiptNumber : order\.exciseReceiptNumber/);
  assert.match(route, /const gateError = filingStartGateError\(gates, \{\s*skipMoneyReason: body\.skipMoneyReason, skipRegistrationReason: body\.skipRegistrationReason,/);
  assert.doesNotMatch(route, /collectedConfirmedAt/, "ขั้นรับเงินของฝ่ายขายหายแล้ว");
  // ปุ่มตีกลับบนจออ่านตารางเดียวกัน · ไม่มีปุ่มรับเงิน/พิมพ์ใบแจ้งชำระถึงลูกค้า
  assert.match(page, /visible: canApprove && canTransitionFiling\(o\.status, "rejected"\)/);
  assert.doesNotMatch(page, /ReceiveDialog|openBillPrintWindow|"sales:act"/);
});
