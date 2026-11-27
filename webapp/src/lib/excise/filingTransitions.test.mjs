import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FILING_TRANSITIONS, TRACKS, canTransitionFiling, filingTransitionError } from "./workflow.js";
import {
  FILING_REASON_MAX, FILING_REASON_MIN, exciseOrderFilingLines, filingSourceOf, filingStartGateError, filingStartGates,
} from "./raFilingRules.js";

/* 🔴 ตรวจระบบ 2026-10-26 ข้อ 4 — route ใบยื่นเช็กสถานะต้นทางแค่ 3 ปลายทาง ⇒ RA ปิดงาน "ชำระแล้ว" จากร่างได้ ·
   เลขใบเสร็จบังคับแค่ในโมดัล ⇒ ตารางเดียว + ด่านที่ server
   ⭐ v3 (มติเจ้าของ 02/11): ไม่มีขั้นสร้างใบยื่น — RA กด "เริ่มยื่น" = ระบบเขียนบันทึกสถานะกำลังยื่น · อัปเดตสองขั้น
      กำลังยื่น → ชำระแล้ว · ไม่มีร่าง/ตีกลับ/ส่งเอกสาร · ด่านเริ่มยื่น = ทะเบียนเด็ดขาด · เงินแค่โชว์ */
const SA = { sales: true, ra: false };
const RA = { sales: false, ra: true };
const ADMIN = { sales: true, ra: true };
const ALL = ["draft", "pending", "received", "filing", "complete", "delivered", "rejected"];
const ok = (args) => filingTransitionError(args) === null;
// ช่องบังคับครบสี่ช่องของขั้นชำระแล้ว (มติเจ้าของ 27/11 — แบบ ภส. + ใบเสร็จกรม)
const PAID = { taxFormRef: "6900000001", exciseReceiptNumber: "N00000000/0000001", taxPaidDate: "2026-07-07", exciseTaxPaidAmount: 110000 };

test("v3: บันทึกมีสองขั้น กำลังยื่น → ชำระแล้ว · ปลายทางเดียวในตาราง · ใบเสร็จกรมบังคับตอนปิด", () => {
  assert.deepEqual(TRACKS.payment.stages.map((s) => s.key), ["filing", "complete"]);
  assert.equal(TRACKS.payment.stages.find((s) => s.key === "filing").owner, "RA");
  assert.equal(TRACKS.payment.stages.at(-1).done, true, "ชำระแล้ว = จบ (ไม่มีขั้นส่งเอกสาร)");
  assert.deepEqual(Object.keys(FILING_TRANSITIONS), ["complete"], "กำลังยื่นเกิดตอนเขียนบันทึก ไม่ใช่ปลายทางของ PATCH");
  assert.ok(ok({ from: "filing", to: "complete", caps: RA, fields: PAID }));
});

test("ข้ามขั้นไม่ได้ — ทุกคู่ที่ไม่อยู่ในตาราง ตอบ 400 แม้เป็นแอดมิน · ปลายทางเก่าของ PR5 ปิดหมด", () => {
  const fields = { ...PAID, rejectionReason: "x" };
  for (const from of ALL) {
    const result = filingTransitionError({ from, to: "complete", caps: ADMIN, fields });
    if (from === "filing") assert.equal(result, null);
    else assert.equal(result?.status, 400, `${from} → complete ต้องถูกปฏิเสธ`);
  }
  for (const gone of ["draft", "filing", "rejected", "delivered", "pending", "received"]) {
    assert.equal(filingTransitionError({ from: "filing", to: gone, caps: ADMIN, fields }).status, 400, `${gone} ไม่ใช่ปลายทางแล้ว`);
  }
  // เคสจริงที่เคยหลุด: ปิดงานจากร่าง
  assert.match(filingTransitionError({ from: "draft", to: "complete", caps: RA, fields }).error, /ต้องมาจาก "กำลังยื่น"/);
  assert.equal(canTransitionFiling("filing", "complete"), true);
  assert.equal(canTransitionFiling("complete", "complete"), false);
  assert.equal(canTransitionFiling("filing", "delivered"), false);
});

test("ใครทำ: ฝ่ายขายไม่มีขั้นไหนบนเส้นนี้ (403)", () => {
  assert.equal(filingTransitionError({ from: "filing", to: "complete", caps: SA, fields: PAID }).status, 403);
});

test("ช่องบังคับสี่ช่องที่ server — ว่าง/ช่องว่างล้วนไม่ผ่าน ทีละช่อง · ยกเว้นภาษีทั้งใบไม่ต้องมีอะไร", () => {
  const labels = { taxFormRef: /เลขที่รับแบบ ภส\./, exciseReceiptNumber: /ใบเสร็จสรรพสามิต/, taxPaidDate: /วันรับเงิน/, exciseTaxPaidAmount: /ยอดรวมตามใบเสร็จ/ };
  for (const [key, label] of Object.entries(labels)) {
    for (const blank of [undefined, null, "", "   "]) {
      assert.match(filingTransitionError({ from: "filing", to: "complete", caps: RA, fields: { ...PAID, [key]: blank } }).error, label, `${key}=${blank}`);
    }
  }
  assert.ok(ok({ from: "filing", to: "complete", caps: RA, exempt: true }));
});

/* ── ด่านเริ่มยื่น (v3 · V3–V4): ทะเบียนเด็ดขาด ไม่มีทางข้าม · เงินแค่ข้อมูล ───────────────────── */
const exciseFiling = (items) => ({ salesOrderId: "S1", exciseSalesOrderId: "SX1", items });

test("V3: เงินไม่ใช่ด่าน — บัญชียังไม่ปิดใบก็เริ่มยื่นได้ (ป้ายบอกสถานะให้รู้) · ใบไม่เรียกเก็บบอกชนิด", () => {
  const items = [{ registrationId: "R1" }];
  const pending = filingStartGates({ order: exciseFiling(items), exciseOrder: { orderNumber: "SO-X", financeStatus: "pending" } });
  assert.equal(pending.money.ok, false);
  assert.match(pending.money.label, /บัญชียังไม่ปิดใบ.*SO-X.*รอปิดใบ/);
  assert.equal(filingStartGateError(pending), null, "เงินยังไม่ปิดใบ ≠ เริ่มยื่นไม่ได้");
  const closed = filingStartGates({ order: exciseFiling(items), exciseOrder: { orderNumber: "SO-X", financeStatus: "approved" } });
  assert.equal(closed.money.ok, true);
  const notBilled = filingStartGates({ order: { salesOrderId: "S1", items }, notBilledKind: "collected_outside" });
  assert.match(notBilled.money.label, /เก็บเงินลูกค้านอกระบบแล้ว/);
});

test("V4: ทะเบียนไม่ครบ = เริ่มยื่นไม่ได้ เด็ดขาด — นับจำนวน + บอก FG · เหตุผลข้ามแบบเดิมไม่มีผล", () => {
  const gates = filingStartGates({
    order: exciseFiling([{ registrationId: "R1", fgCode: "FG-1" }, { registrationId: null, fgCode: "FG-2" }, { registrationId: null, fgCode: "FG-3" }]),
    exciseOrder: { financeStatus: "approved" },
  });
  assert.equal(gates.registration.ok, false);
  assert.equal(gates.registration.missing, 2);
  assert.deepEqual(gates.registration.codes, ["FG-2", "FG-3"]);
  assert.match(filingStartGateError(gates), /ยังไม่มีทะเบียนอนุมัติ 2 รายการ \(FG-2, FG-3\).*ต้องอนุมัติก่อนเริ่มยื่น/);
  // ทางข้ามของ PR5 ต้องไม่กลับมา — ส่งเหตุผลมาก็ยังไม่ผ่าน
  assert.notEqual(filingStartGateError(gates, { skipRegistrationReason: "ทะเบียนรอกรมอนุมัติ ยื่นภาษีก่อน" }), null);
  const full = filingStartGates({ order: exciseFiling([{ registrationId: "R1" }]), exciseOrder: null });
  assert.equal(filingStartGateError(full), null);
  assert.ok(FILING_REASON_MIN === 10 && FILING_REASON_MAX === 500, "เหตุผลยกเลิกการเริ่มยื่น 10–500 ตัว (D10)");
});

test("แหล่งของงาน: ผูก SO ค่าสรรพสามิต · ไม่เรียกเก็บ · ใบเก่าสร้างเอง", () => {
  assert.equal(filingSourceOf({ salesOrderId: "S1", exciseSalesOrderId: "SX1" }), "excise_order");
  assert.equal(filingSourceOf({ salesOrderId: "S1" }), "not_billed");
  assert.equal(filingSourceOf({}), null);
});

test("รายการจากใบค่าสรรพสามิต: FG ต้นทาง · ลิงก์บรรทัด SO ลูกค้า · ช่อง ภส. ตามใบ · ทะเบียนจากผล resolve ของ SO ลูกค้า", () => {
  const exciseLines = [
    { qty: 10, unitPrice: 9.42, metadata: { lineKind: "excise_charge", sourceSalesOrderLineId: "L1", sourceProductId: "P1", sourceFgCode: "FG-1", excisePerUnit: 8.56, localPerUnit: 0.86 } },
    { qty: 4, unitPrice: 5, metadata: { lineKind: "excise_charge", sourceSalesOrderLineId: "L2", sourceProductId: "P2", sourceFgCode: "FG-2", excisePerUnit: 3, localPerUnit: 1 } },
    { qty: 1, unitPrice: 1, metadata: { lineKind: "other" } },
  ];
  const customerLines = [{ salesOrderLineId: "L1", registrationId: "R1", registrationState: "approved", productId: "P1", fgCode: "FG-1", description: "น้ำหอม" }];
  const built = exciseOrderFilingLines({ exciseLines, customerLines });
  assert.equal(built.lines.length, 2, "บรรทัดที่ไม่ใช่ค่าสรรพสามิตไม่เข้างานยื่น");
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
const startRoute = codeOnly(read("../../app/api/tax/orders/from-sales-order/route.js"));
const page = codeOnly(read("../../app/tax/filings/[id]/page.js"));
const modal = codeOnly(read("../../components/excise/FilingWorkView.js")); // เดิมโมดัล · หน้าเต็มตั้งแต่ 25/11

test("route: ตารางกลางตัดสินขั้นชำระแล้ว · ยกเว้นจากทะเบียน (stampExemptFlags) · บันทึกตรึงรายการ ห้ามแก้/คิดใหม่", () => {
  assert.match(route, /filingTransitionError\(\{\s*from: order\.status, to: target, caps: \{ sales: isSales, ra: isLegal \}, exempt, fields,/);
  assert.match(route, /stampExemptFlags\(supabase, \[\{ \.\.\.order, items: exemptItems \|\| \[\] \}\]\)/);
  assert.match(route, /const fields = mergedPaidFields\(updates, order\);/, "ช่องบังคับนับค่าที่ส่งมา + ค่าที่เก็บไว้");
  assert.match(route, /if \(Array\.isArray\(body\.items\) \|\| body\.recalcFromSalesOrder === true\)/, "แก้รายการ/คิดใหม่ต้องถูกปฏิเสธ");
  assert.doesNotMatch(route, /insertOrderItems|filingItemRows|skipMoneyReason/, "ทางสลับรายการ + ด่านข้ามของ PR5 ต้องไม่กลับมา");
  // D11: แก้ข้อมูลการชำระหลังชำระแล้วได้ แต่ห้ามล้างช่องบังคับช่องไหนจนว่าง (ตารางเดียวกับด่านปิดงาน)
  assert.match(route, /if \(editingPaid\) \{\s*const cleared = FILING_TRANSITIONS\.complete\.requires/);
});

test("มติ 27/11: ปิดงานต้องมีไฟล์แบบ ภส. + ใบเสร็จบนบันทึก (อ่านพัง = 500) · ยอดไม่ตรงต้องมีเหตุผล · เหตุผลลงเธรด", () => {
  assert.match(route, /if \(target === 'complete' && !exempt\) \{\s*const docs = await paymentDocTypesOf\(supabase, id\);\s*if \(docs\.error\) return Response\.json\([^)]*\{ status: 500 \}\);/);
  assert.match(route, /filingPaymentError\(\{\s*fields, docTypes: docs\.types, totalTax: order\.totalTax, amountReason: body\.paidAmountReason, today: businessDate\(\),/);
  assert.match(route, /if \(editingPaid && amountTouched\) \{\s*const amountError = paidAmountError\(order\.totalTax, updates\.exciseTaxPaidAmount, body\.paidAmountReason\);/);
  assert.match(route, /if \(amountNote\) \{\s*await appendUpdate\(supabase, \{ entityType: 'excise_order', entityId: id, \.\.\.amountNote, user \}\);/);
});

test("D10 ยกเลิกการเริ่มยื่น: เฉพาะ RA · เฉพาะกำลังยื่น (แอดมินทุกสถานะ) · เหตุผล 10–500 ตัว · audit เก็บเหตุผล", () => {
  const del = route.slice(route.indexOf("export async function DELETE"));
  assert.match(del, /can\(user\?\.role, 'ra:approve'\)/);
  assert.match(del, /\['filing', 'draft'\]\.includes\(order\.status\) && user\?\.role !== 'admin'/);
  assert.match(del, /reason\.length < FILING_REASON_MIN \|\| reason\.length > FILING_REASON_MAX/);
  assert.match(del, /summary: `RA ยกเลิกการเริ่มยื่น \$\{order\.poReference \|\| id\} — \$\{reason\}`/);
  assert.match(page, /method: "DELETE", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ reason \}\)/);
});

test("เริ่มยื่น: route เขียนบันทึกสถานะกำลังยื่น + ด่านทะเบียนตัวเดียวกับโมดัล · ปุ่มโชว์เสมอ กดแล้วบอกเหตุ", () => {
  assert.match(startRoute, /status: "filing",\s*filingStartedAt: now,/);
  assert.doesNotMatch(startRoute, /status: "draft"/, "ขั้นร่างของ PR5 ห้ามกลับมา");
  assert.match(startRoute, /const gateError = filingStartGateError\(filingStartGates\(\{/);
  assert.match(modal, /filingStartGateError\(preview\.gates\)/, "โมดัลอ่านด่านจากตัวตัดสินเดียวกับ route");
  /* หน้าเต็มของงาน (25/11): ปุ่มอยู่การ์ดจัดการ — ติดด่าน = ปุ่มยังอยู่ (DocumentAction วาด aria-disabled) + เหตุเหนือปุ่ม (disabledReason) */
  const workPage = codeOnly(read("../../app/tax/filings/work/[key]/page.js"));
  assert.match(workPage, /disabled: Boolean\(startBlocker\) \|\| busy,\s*disabledReason: startBlocker \|\| undefined,/, "ติดด่าน = ปุ่มยังอยู่ บอกเหตุ");
  assert.match(workPage, /const record = await work\.start\(\);\s*if \(!record\) return;\s*await reload\(\);\s*router\.push\(`\/tax\/filings\/\$\{record\.id\}`\);/, "เริ่มยื่นสำเร็จ = ไปหน้าบันทึกการยื่น");
  assert.match(modal, /if \(startBlocker\) \{\s*setError\(startBlocker\);/);
  // หน้าบันทึก: ไม่มีปุ่มรับเงิน/พิมพ์ใบแจ้งชำระถึงลูกค้า/ตีกลับ/คิดใหม่
  assert.doesNotMatch(page, /ReceiveDialog|openBillPrintWindow|"sales:act"|recalcFromSalesOrder|"rejected"\)/);
  assert.match(page, /canTransitionFiling\(o\?\.status, "complete"\)/);
});
