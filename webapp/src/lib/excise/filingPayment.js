// ── ข้อมูลการชำระของบันทึกการยื่น: ตัวตัดสินเดียวของโมดัล "บันทึกผลชำระ" และ PATCH /api/orders/[id] ──────
//
// ⭐ มติเจ้าของ 27/11/2026 — กรมสรรพสามิตออกเอกสารการชำระ **สองชุด** และ RA ต้องกรอก + แนบทั้งสองก่อนปิดงาน
//    1) แบบรายการภาษี ภส.03-07 — เลขที่ควรเก็บคือ **"เลขที่รับ"** ตรงกรอบ "สำหรับเจ้าหน้าที่" (เช่น 6920073720)
//       ⚠️ "ภส.03-07" คือชื่อแบบ ไม่ใช่เลขที่ — ช่องเดิมเขียนตัวอย่างไว้แบบนั้นจึงชวนกรอกผิด
//    2) ใบเสร็จรับเงินกรมสรรพสามิต — เลขที่ใบเสร็จ (เช่น N00030069/0072584) · ยอดรวม · วันรับเงิน
//       ⚠️ ใบเสร็จมีสองวัน: วันที่ออกใบ (มุมขวาบน) กับ "รับเงินผ่านระบบเครือข่ายอินเทอร์เน็ต วันที่ …" —
//          วันที่เก็บคือ **วันรับเงิน** (วันที่เงินออกจริง · ตัวอย่าง 7 ก.ค. ส่วนใบออก 8 ก.ค.)
//    ยอดรวมตามใบเสร็จ = ภาษีสรรพสามิต + ภาษีมหาดไทย = `totalTax` ของบันทึก (ใบเสร็จแตกมหาดไทยเป็นสองบรรทัด 95/5
//    แต่รวมแล้วเท่ากับช่อง ภส. ⇒ เทียบยอดรวมพอ) · ต่างจากยอดยื่น = ไม่บล็อก (เบี้ยปรับ/เงินเพิ่มเป็นของจริง)
//    แต่ต้องมีเหตุผล — เก็บลงเธรดของบันทึก (`paymentAmountNote`)
//
// ⚠️ ใบ "ยกเว้นภาษี" ทั้งใบ (`isExemptFiling` — จากทะเบียน ไม่ใช่ยอด 0) ไม่มีเอกสารจากกรม ⇒ ไม่ต้องมีอะไรเลย
import { FILING_TRANSITIONS } from "@/lib/excise/workflow";
import { FILING_REASON_MAX, FILING_REASON_MIN } from "@/lib/excise/raFilingRules";
import { round2 } from "@/lib/tax/exciseBilling";
import { fmtMoney } from "@/lib/format";

/** เอกสารสองชุดจากกรม — ลำดับนี้คือลำดับบนจอ (ยื่นแบบก่อน แล้วได้ใบเสร็จ) */
export const PAYMENT_DOCS = [
  { docType: "tax_form", label: "แบบรายการภาษี ภส.03-07" },
  { docType: "tax_receipt", label: "ใบเสร็จรับเงินกรมสรรพสามิต" },
];
export const PAYMENT_DOC_TYPES = PAYMENT_DOCS.map((doc) => doc.docType);
export const paymentDocLabel = (docType) => PAYMENT_DOCS.find((doc) => doc.docType === docType)?.label || docType;

/** ช่องบังคับของขั้นชำระแล้ว — อ่านจากตารางทางเดินสถานะ (ที่เดียวที่ประกาศ "ต้องมีอะไร") */
export const PAID_FIELD_KEYS = FILING_TRANSITIONS.complete.requires.map(([key]) => key);

const filled = (value) => String(value ?? "").trim() !== "";

/** ค่าหลังรวมของที่ส่งมากับที่เก็บไว้บนบันทึก — ส่งมารอบก่อนแล้วก็นับ */
export function mergedPaidFields(updates = {}, stored = {}) {
  return Object.fromEntries(PAID_FIELD_KEYS.map((key) => [key, updates[key] !== undefined ? updates[key] : stored?.[key]]));
}

/**
 * เทียบยอดตามใบเสร็จกับยอดยื่น (`totalTax` = สรรพสามิต + มหาดไทย)
 * @returns `{ expected, paid, diff, matches }` — `paid` = null เมื่อยังไม่ได้กรอกหรือไม่ใช่ตัวเลข
 */
export function paidAmountCheck(totalTax, paidAmount) {
  const expected = round2(Number(totalTax) || 0);
  const raw = typeof paidAmount === "string" ? paidAmount.trim() : paidAmount;
  const number = raw === "" || raw == null ? NaN : Number(raw);
  const paid = Number.isFinite(number) ? round2(number) : null;
  const diff = paid == null ? null : round2(paid - expected);
  return { expected, paid, diff, matches: paid != null && diff === 0 };
}

/** ชื่อเอกสารที่ยังไม่มีไฟล์ — `docTypes` = ชนิดไฟล์ที่แนบอยู่บนบันทึก (array หรือ Set) */
export function missingPaymentDocs(docTypes = []) {
  const have = new Set(docTypes);
  return PAYMENT_DOCS.filter((doc) => !have.has(doc.docType)).map((doc) => doc.label);
}

/**
 * ด่านเดียวของการปิดงาน "ชำระแล้ว" (และการแก้ข้อมูลการชำระ) — คืนข้อความเดียวที่บอกทุกอย่างที่ขาด หรือ null เมื่อผ่าน
 * @param exempt        ยกเว้นภาษีทั้งใบ ⇒ ผ่านเสมอ
 * @param fields        `mergedPaidFields(...)`
 * @param docTypes      ชนิดไฟล์ที่แนบอยู่บนบันทึก (นับไฟล์ที่กำลังจะแนบด้วยเมื่อเรียกจากโมดัล)
 * @param totalTax      ยอดยื่นของบันทึก
 * @param amountReason  เหตุผลเมื่อยอดไม่ตรง
 * @param checkAmount   false = ไม่ตรวจยอด (แก้ข้อมูลโดยไม่ได้แตะยอด — ยอดเดิมผ่านด่านมาแล้ว)
 * @param today         วันนี้เวลาไทย (ISO · `businessDate()`) — ใช้ตรวจวันรับเงินที่อยู่ในอนาคต
 */
export function filingPaymentError({
  exempt = false, fields = {}, docTypes = [], totalTax = 0, amountReason = "", checkAmount = true, today = null,
} = {}) {
  if (exempt) return null;
  const missing = [
    ...FILING_TRANSITIONS.complete.requires.filter(([key]) => !filled(fields[key])).map(([, label]) => label),
    ...missingPaymentDocs(docTypes).map((label) => `ไฟล์${label}`),
  ];
  if (missing.length) return `ยังขาด: ${missing.join(" · ")}`;
  const dateError = paidDateError(fields.taxPaidDate, today);
  if (dateError) return dateError;
  return checkAmount ? paidAmountError(totalTax, fields.exciseTaxPaidAmount, amountReason) : null;
}

/** วันรับเงินต้องไม่อยู่ในอนาคต — ⚠️ ช่องวันที่ทั้งระบบเป็น ค.ศ. แต่ใบเสร็จกรมพิมพ์ พ.ศ. (2569)
    พิมพ์ปีตามใบตรง ๆ = ปี 2569 ค.ศ. ⇒ ด่านนี้คือที่เดียวที่จับได้ · `today` = วันนี้เวลาไทย (ISO) · ไม่ส่ง = ไม่ตรวจ */
export function paidDateError(paidDate, today) {
  const iso = String(paidDate ?? "").slice(0, 10);
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  if (iso > today) return "วันรับเงินอยู่ในอนาคต — ช่องวันที่เป็นปี ค.ศ. (ใบเสร็จพิมพ์ปี พ.ศ. 2569 = ค.ศ. 2026)";
  return null;
}

/** ด่านยอดตามใบเสร็จอย่างเดียว — ใช้ตรงเมื่อแก้ยอดของบันทึกที่ชำระแล้ว (ช่องอื่นผ่านด่านไปแล้วตอนปิดงาน) */
export function paidAmountError(totalTax, paidAmount, amountReason = "") {
  const amount = paidAmountCheck(totalTax, paidAmount);
  if (amount.paid == null || amount.paid <= 0) return "ยอดรวมตามใบเสร็จต้องเป็นตัวเลขมากกว่า 0";
  if (amount.matches) return null;
  const reason = String(amountReason ?? "").trim();
  if (reason.length >= FILING_REASON_MIN && reason.length <= FILING_REASON_MAX) return null;
  return `ยอดตามใบเสร็จ ${fmtMoney(amount.paid)} ไม่ตรงกับยอดยื่น ${fmtMoney(amount.expected)} — ระบุเหตุผล (${FILING_REASON_MIN}–${FILING_REASON_MAX} ตัวอักษร) เช่น เบี้ยปรับ หรือเงินเพิ่ม`;
}

/**
 * ชนิดเอกสารการชำระที่แนบอยู่บนบันทึก (server) — ด่านปิดงานและด่านลบไฟล์ใช้ตัวนี้ตัวเดียว
 * ⚠️ อ่านพัง = คืน `error` ให้ผู้เรียกหยุดที่ 500 (supabase ไม่ throw · ห้ามถือว่า "ไม่มีไฟล์" หรือ "มีครบ")
 * @param exceptId  ไม่นับแถวนี้ (ถามว่า "ลบแถวนี้แล้วยังเหลือไหม")
 */
export async function paymentDocTypesOf(supabase, orderId, { exceptId = null } = {}) {
  let query = supabase.from("attachments").select("id, docType")
    .eq("entityType", "order").eq("entityId", orderId).in("docType", PAYMENT_DOC_TYPES);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query.limit(1000);
  if (error) return { error: error.message, types: [] };
  return { error: null, types: [...new Set((data || []).map((row) => row.docType))] };
}

/** เหตุการณ์ลงเธรดของบันทึกเมื่อยอดตามใบเสร็จไม่ตรงยอดยื่น — ประวัติที่ตอบได้ว่า "ทำไมจ่ายไม่เท่าที่ยื่น" */
export function paymentAmountNote({ expected, paid, diff, reason }) {
  const sign = diff > 0 ? "+" : "−";
  return {
    kind: "payment",
    body: `ยอดตามใบเสร็จ ${fmtMoney(paid)} ต่างจากยอดยื่น ${fmtMoney(expected)} (${sign}${fmtMoney(Math.abs(diff))}) — ${String(reason).trim()}`,
    meta: { expected, paid, diff },
  };
}
