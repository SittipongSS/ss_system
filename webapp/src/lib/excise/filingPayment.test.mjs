import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PAYMENT_DOCS, PAYMENT_DOC_TYPES, PAID_FIELD_KEYS, filingPaymentError, mergedPaidFields, missingPaymentDocs,
  paidAmountCheck, paidAmountError, paidDateError, paymentAmountNote, paymentDocTypesOf,
} from "./filingPayment.js";
import { ATTACHMENT_TYPES } from "../master/attachmentTypes.js";

/* ⭐ มติเจ้าของ 27/11/2026 — เอกสารชำระสรรพสามิตมีสองชุด (แบบ ภส.03-07 + ใบเสร็จกรม) ต้องกรอก + แนบทั้งคู่ก่อนปิดงาน
   ตัวเลขจากเอกสารจริงของ LACANA รอบ มิ.ย. 2569: สรรพสามิต 670,656.00 + มหาดไทย 67,065.60 = 737,721.60
   ใบเสร็จแตกมหาดไทยเป็น 63,712.32 + 3,353.28 (95/5) — รวมแล้วเท่ากัน */
const TOTAL = 737721.6;
const FULL = { taxFormRef: "6920073720", exciseReceiptNumber: "N00030069/0072584", taxPaidDate: "2026-07-07", exciseTaxPaidAmount: "737721.60" };
const BOTH = ["tax_form", "tax_receipt"];
const TODAY = "2026-11-27";
const pass = (over = {}) => filingPaymentError({ fields: FULL, docTypes: BOTH, totalTax: TOTAL, today: TODAY, ...over });

test("ชุดจริงของ LACANA ผ่าน — ใบเสร็จแตกมหาดไทยสองบรรทัดแต่ยอดรวมตรงยอดยื่น", () => {
  assert.equal(670656 + 63712.32 + 3353.28, TOTAL);
  assert.equal(pass(), null);
  assert.deepEqual(paidAmountCheck(TOTAL, FULL.exciseTaxPaidAmount), { expected: TOTAL, paid: TOTAL, diff: 0, matches: true });
});

test("ขาดหลายอย่าง = ข้อความเดียวบอกครบ (ช่อง + ไฟล์) ตามลำดับบนจอ", () => {
  const error = filingPaymentError({ fields: { ...FULL, taxFormRef: " ", taxPaidDate: "" }, docTypes: ["tax_receipt"], totalTax: TOTAL });
  assert.equal(error, "ยังขาด: เลขที่รับแบบ ภส. · วันรับเงิน · ไฟล์แบบรายการภาษี ภส.03-07");
  assert.match(pass({ docTypes: [] }), /ไฟล์แบบรายการภาษี ภส\.03-07 · ไฟล์ใบเสร็จรับเงินกรมสรรพสามิต$/);
  assert.deepEqual(missingPaymentDocs(new Set(["tax_form", "other"])), ["ใบเสร็จรับเงินกรมสรรพสามิต"]);
});

test("ยกเว้นภาษีทั้งใบ = ไม่มีเอกสารจากกรม ผ่านเสมอ", () => {
  assert.equal(filingPaymentError({ exempt: true }), null);
});

test("ยอดไม่ตรงยอดยื่น = ไม่บล็อก แต่ต้องมีเหตุผล 10–500 ตัว · ยอด 0/ติดลบ/ไม่ใช่ตัวเลข = ไม่ผ่าน", () => {
  const withPenalty = { ...FULL, exciseTaxPaidAmount: "738721.60" };
  assert.match(pass({ fields: withPenalty }), /ยอดตามใบเสร็จ ฿738,721\.60 ไม่ตรงกับยอดยื่น ฿737,721\.60 — ระบุเหตุผล \(10–500/);
  assert.match(pass({ fields: withPenalty, amountReason: "ปรับ" }), /ระบุเหตุผล/);
  assert.equal(pass({ fields: withPenalty, amountReason: "เบี้ยปรับยื่นช้า 1 เดือน" }), null);
  assert.match(pass({ fields: withPenalty, amountReason: "x".repeat(501) }), /ระบุเหตุผล/);
  for (const bad of ["0", "-5", "abc"]) {
    assert.equal(paidAmountError(TOTAL, bad, "เหตุผลยาวพอแล้วครับ"), "ยอดรวมตามใบเสร็จต้องเป็นตัวเลขมากกว่า 0", bad);
  }
  // โหมดแก้ที่ไม่ได้แตะยอด: ไม่ถามเหตุผลซ้ำ
  assert.equal(pass({ fields: withPenalty, checkAmount: false }), null);
});

test("วันรับเงินในอนาคต = ไม่ผ่าน — จับการพิมพ์ปี พ.ศ. ลงช่อง ค.ศ. (2569-07-07)", () => {
  assert.match(pass({ fields: { ...FULL, taxPaidDate: "2569-07-07" } }), /อยู่ในอนาคต.*ค\.ศ\. 2026/);
  assert.equal(paidDateError("2026-11-27", TODAY), null, "วันนี้ผ่าน");
  assert.equal(paidDateError("2026-11-28", null), null, "ไม่ส่งวันนี้ = ไม่ตรวจ");
});

test("ค่าหลังรวม: ส่งมา (รวมค่าว่าง) ชนะค่าที่เก็บไว้ · ไม่ส่ง = ใช้ค่าที่เก็บไว้", () => {
  assert.deepEqual(PAID_FIELD_KEYS, ["taxFormRef", "exciseReceiptNumber", "taxPaidDate", "exciseTaxPaidAmount"]);
  const merged = mergedPaidFields({ taxFormRef: "", exciseReceiptNumber: "R2" }, { taxFormRef: "F1", exciseReceiptNumber: "R1", taxPaidDate: "2026-07-07" });
  assert.deepEqual(merged, { taxFormRef: "", exciseReceiptNumber: "R2", taxPaidDate: "2026-07-07", exciseTaxPaidAmount: undefined });
});

test("เหตุการณ์ลงเธรดบอกยอดทั้งสองฝั่ง + ส่วนต่างมีเครื่องหมาย + เหตุผล", () => {
  const note = paymentAmountNote({ ...paidAmountCheck(TOTAL, 738721.6), reason: "  เบี้ยปรับยื่นช้า  " });
  assert.equal(note.kind, "payment");
  assert.equal(note.body, "ยอดตามใบเสร็จ ฿738,721.60 ต่างจากยอดยื่น ฿737,721.60 (+฿1,000.00) — เบี้ยปรับยื่นช้า");
  assert.match(paymentAmountNote({ ...paidAmountCheck(TOTAL, 737000), reason: "x" }).body, /\(−฿721\.60\)/);
});

test("อ่านไฟล์แนบของบันทึก: กรองเฉพาะสองชนิด · ไม่นับแถวที่กำลังจะลบ · อ่านพัง = คืน error (ห้ามถือว่าไม่มี/มีครบ)", async () => {
  const calls = [];
  const fake = (result) => {
    const chain = {
      select: (cols) => { calls.push(["select", cols]); return chain; },
      eq: (col, value) => { calls.push(["eq", col, value]); return chain; },
      in: (col, values) => { calls.push(["in", col, values]); return chain; },
      neq: (col, value) => { calls.push(["neq", col, value]); return chain; },
      limit: async () => result,
    };
    return { from: (table) => { calls.push(["from", table]); return chain; } };
  };
  const ok = await paymentDocTypesOf(fake({ data: [{ docType: "tax_form" }, { docType: "tax_form" }], error: null }), "ET-1", { exceptId: "A9" });
  assert.deepEqual(ok, { error: null, types: ["tax_form"] });
  assert.deepEqual(calls, [
    ["from", "attachments"], ["select", "id, docType"], ["eq", "entityType", "order"], ["eq", "entityId", "ET-1"],
    ["in", "docType", PAYMENT_DOC_TYPES], ["neq", "id", "A9"],
  ]);
  const broken = await paymentDocTypesOf(fake({ data: null, error: { message: "timeout" } }), "ET-1");
  assert.deepEqual(broken, { error: "timeout", types: [] });
});

test("ป้ายชนิดไฟล์ของการ์ดเอกสารตรงกับโมดัล — คนเห็นคำเดียวกันทั้งสองที่", () => {
  for (const { docType, label } of PAYMENT_DOCS) {
    assert.equal(ATTACHMENT_TYPES.order.find((type) => type.key === docType)?.label, label, docType);
  }
});

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("โมดัล: แนบไฟล์เข้าบันทึกก่อน แล้วค่อยปิดงาน · ใช้ตัวแนบสองขั้น (ไม่มีไฟล์กำพร้า) · ด่านตัวเดียวกับ server", () => {
  const modal = codeOnly(read("../../components/excise/FileTaxDialog.js"));
  assert.doesNotMatch(modal, /uploadFileBytes/, "ไฟล์แนบปกติต้องผ่าน uploadAttachment (ขั้นสองทำให้ไฟล์มีอยู่จริง)");
  assert.match(modal, /await attachPicked\(\);[\s\S]{0,600}apiFetch\(`\/api\/orders\/\$\{order\.id\}`, \{ method: "PATCH"/, "แนบก่อน PATCH เสมอ");
  assert.match(modal, /filingPaymentError\(\{/);
  assert.doesNotMatch(modal, /businessDate\(\)\);\s*setPaidDate|setPaidDate\(editing && order\?\.taxPaidDate \? [^:]+: businessDate\(\)\)/, "วันรับเงินไม่มีค่าตั้งต้นเป็นวันนี้");
  assert.doesNotMatch(modal, /: order\?\.totalTax;\s*setPaidAmount/, "ยอดไม่มีค่าตั้งต้นเป็นยอดยื่น — ไม่งั้นด่านยอดไม่ตรงไม่มีวันทำงาน");
});

test("DELETE ไฟล์แนบ: บันทึกชำระแล้วลบไฟล์สุดท้ายของชนิดนั้นไม่ได้ (409) · อ่านพัง = 500", () => {
  const route = codeOnly(read("../../app/api/attachments/[id]/route.js"));
  const del = route.slice(route.indexOf("export async function DELETE"), route.indexOf("export async function PATCH"));
  assert.match(del, /att\.entityType === 'order' && PAYMENT_DOC_TYPES\.includes\(att\.docType\)/);
  assert.match(del, /if \(paidOrderError\) return Response\.json\([^)]*\{ status: 500 \}\)/);
  assert.match(del, /paymentDocTypesOf\(supabase, att\.entityId, \{ exceptId: att\.id \}\)/);
  assert.match(del, /if \(left\.error\) return Response\.json\([^)]*\{ status: 500 \}\)/);
  assert.match(del, /status: 409/);
  assert.ok(del.indexOf("paymentDocTypesOf") < del.indexOf(".from('attachments').delete()"), "ด่านต้องมาก่อนคำสั่งลบ");
});
