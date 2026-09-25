// ── งวดชำระของใบสั่งขาย (mig 0245) — logic ล้วน ใช้ทั้ง client และ server ────
//
// ⭐ **สายงานยกมาจากมติ 2026-08-01** (`docs/service-business-system-plan.md` §5)
// *"SA ต้องกดว่าลูกค้าจ่ายแล้ว บัญชีต้องคอนเฟิร์ม"* — ไม่ได้คิดใหม่ เพราะสัญญาบริการ
// จะใช้รูปเดียวกันนี้ต่อ ถ้าคิดแยกจะได้สองชุดที่เพี้ยนหากัน
//
//   pending ──[SA/AC แจ้ง + หลักฐาน]──> reported ──[บัญชีคอนเฟิร์ม]──> confirmed
//                  ↑                        │
//                  └──[บัญชีตีกลับ+เหตุผล]──┘  (กลับไปให้ SA แจ้งใหม่)
//
// ⚠️ **`reported` ไม่นับว่าชำระแล้ว — นับเมื่อ `confirmed` เท่านั้น**
// ไม่งั้น SA แจ้งเองนับเอง = เท่ากับไม่มีด่าน
//
// 🔴 **งวดชำระไม่แตะยอด Actual เด็ดขาด** (ยืนยันกับผู้ใช้ 2026-08-13)
// SA ได้ยอด **เต็ม 100%** ตั้งแต่ใบอนุมัติ ต่อให้แบ่งจ่ายกี่งวดก็ตาม —
// `actualAmount` มาจาก `totalAmount - vatAmount` ตอนสร้างใบ (mig 0107) และ trigger
// ที่รวมเข้าดีลฟังเฉพาะ `status/actualAmount/orderDate/dealId` ของ `sales_orders`
// ⇒ ตารางงวดอยู่คนละแกน **ห้ามมีโค้ดไหนเอายอดที่เก็บได้ไปหัก Actual**
// ไฟล์นี้จึงไม่ export อะไรที่ชื่อ `actual*` เลย และมีเทสต์ล็อกไว้
import { fmtDate, fmtMoney } from '@/lib/format';
import { canConfirmPayment, canUser } from '@/lib/permissions';
import { computeInstallments, paymentScheduleRows } from '@/lib/sales/paymentPlan';
import { paidThrough } from '@/lib/sales/paymentCoverage';
import { taxInvoiceActionError } from '@/lib/sales/taxInvoice';
// งวดยกมาของใบสั่งขายย้อนหลัง (mig 0374) — ไฟล์ตัวตัดสิน import แค่ permissions.js ซึ่งไม่ import อะไร (ไม่มีวงวน · ฝั่ง client ใช้ได้)
import {
  HISTORICAL_APPROVER_LABEL, HISTORICAL_CORRECTION_PATH, OPENING_INSTALLMENT_LABEL, isHistoricalOrder, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
// เอกสารยืนยันคำสั่งซื้อของใบ (อ่านสองบ้าน) — ไฟล์นั้นไม่มี import (ไม่มีวงวน)
import { orderConfirmationOf } from '@/lib/sales/orderConfirmationDocs';

export const INSTALLMENT_STATUSES = ['pending', 'reported', 'confirmed', 'rejected'];

/* สถานะที่ **แสดงบนจอ** = สถานะใน DB + `prepaid` ที่คำนวณเอา (มติผู้ใช้ 2026-08-19)
   ⚠️ อย่าเติม `prepaid` เข้า `INSTALLMENT_STATUSES` — ตัวนั้นต้องตรงกับ CHECK ของ 0245
   เป๊ะ ๆ (แถวที่เขียนค่านี้ลง DB จะถูกปฏิเสธ) */
export const INSTALLMENT_DISPLAY_STATUSES = [...INSTALLMENT_STATUSES, 'prepaid', 'refunded'];

/* ⭐ `prepaid` **ไม่ใช่ค่าใน DB** — เป็นสถานะที่คำนวณจากงวดร่างที่มีวันจ่าย+หลักฐานแล้ว
   (มติผู้ใช้ 2026-08-19) เงินเข้าทะเบียนของบัญชี **ต่อเมื่อ AE Supervisor อนุมัติใบแล้ว
   เท่านั้น** งวดร่างจึงยังส่งให้บัญชีตรวจไม่ได้ แต่ต้องต่างจาก "รอชำระ" ให้เห็นด้วยตา
   ไม่งั้นคนดูจะไม่รู้ว่าเงินเข้าแล้ว · ดู `installmentDisplayStatus` */
export const INSTALLMENT_STATUS_LABELS = {
  pending: 'รอชำระ',
  prepaid: 'จ่ายแล้ว รอใบอนุมัติ',
  reported: 'รอบัญชีตรวจ',
  confirmed: 'ชำระแล้ว',
  rejected: 'บัญชีตีกลับ',
  /* PR3 (mig 0378): งวด confirmed ของใบที่ยกเลิกที่บัญชีบันทึกคืนเงินแล้ว — ค่าใน DB ยังเป็น confirmed (CHECK refund_shape) */
  refunded: 'คืนเงินแล้ว',
};

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (มาตรฐานเดียวกับ REQUEST_STATUS_TONES)
export const INSTALLMENT_STATUS_TONES = {
  pending: 'neutral',
  prepaid: 'info',
  reported: 'info',
  confirmed: 'success',
  rejected: 'danger',
  refunded: 'neutral',
};

export const MIN_REJECT_REASON = 10;

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
/* วันที่ ISO ที่ฐานรับ (ปี 2000–2100 · วันมีจริง) — กติกาเดียวกับ CHECK วันที่ของงวด */
const validIsoDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31'
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * แปลง `quotations.paymentPlan` เป็นแถวงวดพร้อม insert
 *
 * ⚠️ `type: 'full'` = **หนึ่งงวด 100%** ไม่ใช่ศูนย์งวด — ใบที่จ่ายครั้งเดียวก็ต้องมี
 * อะไรให้ติดตามว่าเก็บเงินได้หรือยัง (`paymentScheduleRows` คืนแถวเต็มจำนวนให้อยู่แล้ว)
 * ⚠️ ยอดคำนวณด้วย `computeInstallments` ตัวเดิม **ห้ามคำนวณเอง** — ตัวนั้นโยนเศษปัด
 * ไปงวดสุดท้ายให้ยอดรวมเท่ากับใบพอดี
 */
export function installmentsFromPaymentPlan(plan, total) {
  const rows = computeInstallments(total, paymentScheduleRows(plan));
  return rows.map((row, index) => ({
    seq: index + 1,
    label: String(row.label || '').trim() || `งวดที่ ${index + 1}`,
    percent: Math.round((Number(row.percent) || 0) * 100) / 100,
    amount: money(row.amount),
    note: String(row.note || '').trim() || null,
  }));
}

/**
 * งวดที่ **ยังไม่ถูกสร้างจริง** — คำนวณสดจากแผนของ QT ทุกครั้งที่เรนเดอร์ เพื่อโชว์ให้ดู
 * ตั้งแต่ใบยังเป็นร่าง (มติผู้ใช้ 2026-08-13: *"แค่สร้างก็โชว์งวดให้ดูได้แล้ว"*)
 *
 * ⚠️ **ห้ามนับ preview เป็นงวดจริง** — ไม่มี id ไม่มีสถานะ กดอะไรไม่ได้ทั้งสิ้น
 * ⭐ ตั้งแต่ B-4 นี่เป็นแค่จอเปล่าก่อนกด "เริ่มติดตามการชำระ" — กดแล้วได้ **แถวจริง**
 * ที่กรอกกำหนดชำระได้ทันทีตั้งแต่ใบยังเป็นร่าง (ดู `withLiveAmounts`)
 */
export function previewInstallments(plan, total) {
  if (paymentNotRequired(total)) return [];
  const rows = installmentsFromPaymentPlan(plan, total);
  return rows.map((row) => ({ ...row, preview: true, status: 'pending', id: null }));
}

/* ── ใบยอด 0 ไม่ต้องยืนยันการชำระ (มติผู้ใช้ 2026-08-18) ────────────────────
   ใบยอด 0 เดินได้ตลอดเส้นอยู่แล้ว (มติ 2026-08-03 · mig 0196/0197) แต่ยังสร้างงวด
   ยอด 0 ทิ้งไว้ให้ค้าง `pending` ตลอดกาล ⇒ ใบขึ้นว่า "ยังเก็บเงินไม่ครบ" ทั้งที่ไม่มี
   เงินให้เก็บ และคิวบัญชีมีของที่ไม่มีวันมีหลักฐานมาแนบ
   ⇒ **ยอด 0 = จบที่อนุมัติใบ** ไม่มีงวด ไม่มีการแจ้ง/ยืนยัน
   ⚠️ ตัดสินจาก "ยอดของใบ" ไม่ใช่ยอดรายงวด — งวดยอด 0 ในใบที่มียอดจริง (เช่นแถม)
   ยังต้องเดินตามปกติ เพราะมันเป็นส่วนหนึ่งของข้อตกลงที่เซ็นไปแล้ว */
// ⚠️ **ไม่รู้ยอด ≠ ยอด 0** — `undefined/null/''` ต้องคืน false
// 🐞 เขียนเป็น `money(total) <= 0` ตรง ๆ รอบแรกแล้วเทสต์เดิมแดงทันที: ผู้เรียกที่ไม่ได้
// ส่งยอดมา (fixture เก่า · แถวที่ยังโหลดไม่เสร็จ) จะถูกตัดสินว่าเป็นใบยอด 0 ทั้งหมด
// ⇒ ราง "เก็บเงิน" ของใบปกติกลายเป็น "ไม่ต้องเก็บเงิน" เงียบ ๆ
export function paymentNotRequired(total) {
  if (total === null || total === undefined || total === '') return false;
  const n = Number(total);
  return Number.isFinite(n) && money(n) <= 0;
}

// ── งวดร่าง vs งวดที่หยุดยอดแล้ว (B-4 · mig 0259) ────────────────────────
//
// ⭐ **ย้ายจุดที่หยุดยอด ไม่ใช่จุดที่สร้างแถว** — เหตุผลเดิมของ 0245 ("ยอดยังเปลี่ยน
// ได้จนกว่าจะอนุมัติ") ถูก แต่ปัญหาจริงคือ *snapshot ครั้งเดียวแล้วไม่มีใครมาทับ*
// ⇒ งวดเกิดได้ตั้งแต่ร่าง (SA กรอก `dueDate` ได้ตอนที่กำลังคุยเงื่อนไขกับลูกค้าพอดี)
// แล้วยอดถูกเขียนทับครั้งสุดท้าย + `frozenAt` ตอนอนุมัติ
export const isInstallmentFrozen = (row) => !!row?.frozenAt;

/* ── เงินที่เข้ามาก่อนใบอนุมัติ (มติผู้ใช้ 2026-08-19 — ทางเลือก ก.) ─────────
   ของจริง: ลูกค้าโอนมัดจำเพื่อ *ให้เริ่มงาน* ⇒ เงินเข้าก่อนการอนุมัติภายในเป็นเรื่องปกติ
   ก่อนหน้านี้ไม่มีที่ให้ลง SA ต้องถือสลิปไว้รอใบผ่านอนุมัติ — หลักฐานที่ค้างในมือคนคือ
   หลักฐานที่หายได้ (เหตุผลเดียวกับที่ด่าน "ไล่ลำดับงวด" เลือกแบบหลวม)

   ⭐ **บันทึกได้ แต่ยังไม่ใช่การแจ้ง** — งวดร่างเก็บ `paidOn` + หลักฐานได้เลย โดย
   `status` ยังถูกบังคับเป็น `pending` ตาม CHECK `sales_order_installments_draft_pending`
   ของ 0259 (ไม่ต้องมี migration ใหม่ — CHECK นั้นคุมแค่ `status` ไม่ได้คุมหลักฐาน)
   แล้ว `freezeInstallments` เลื่อนให้เป็น `reported` ตอนอนุมัติ ด้วยกลไกเดียวกับที่
   ยืมหลักฐานตอนปิด Won อยู่แล้ว

   🛑 **กติกาที่คุมเรื่องนี้จริง ๆ คือ "เงินเข้าบัญชีต่อเมื่อ AE Supervisor อนุมัติใบ"**
   (มติผู้ใช้ 2026-08-19) ไม่ใช่ "ยอดยังลอย" อย่างที่ 0259 เขียนไว้ — ของจริงยอดนิ่ง
   ตั้งแต่ออกใบ: QT ที่ออก SO แล้วเป็น `accepted` ⇒ แก้ไม่ได้ (`EDITABLE_STATUSES`)
   · `unaccept` ติด `sales_order_exists` ที่ระดับ DB (0138) · และ SO ร่างแก้ได้แค่
   `referenceDoc`/`notes` ⇒ **ระหว่างใบยังไม่อนุมัติ ยอดต่องวดเปลี่ยนไม่ได้ผ่านหน้าจอเลย**
   (หลังอนุมัติ AE Sup/admin ปรับได้ทาง "ปรับแผนงวด" — PR2 · mig 0377 · ตรึงยอดทุกแถวที่เขียน ⇒ ไม่เกี่ยวกับงวดร่าง)
   ⇒ อย่าย้อนกลับไปอธิบายด่านนี้ด้วยเหตุผลเรื่องยอดอีก ถ้าจะปลดต้องถามว่า
   "ให้บัญชีเห็นเงินก่อน AE Sup อนุมัติได้ไหม" ซึ่งคำตอบวันนี้คือไม่ */
export function installmentPrepaid(row) {
  return !isInstallmentFrozen(row)
    && !!row?.paidOn
    && Array.isArray(row?.evidence) && row.evidence.length > 0;
}

/** สถานะที่ **แสดงบนจอ** — ต่างจาก `status` ใน DB เฉพาะงวดร่างที่บันทึกเงินไว้แล้ว และงวดที่บัญชีบันทึกคืนเงินแล้ว (PR3) */
export function installmentDisplayStatus(row) {
  if (installmentRefunded(row)) return 'refunded';
  return installmentPrepaid(row) ? 'prepaid' : (row?.status || 'pending');
}

/* ── เงินค้างจากใบที่ยกเลิก (PR3 · mig 0378 · มติเจ้าของ 23/09 D4) ─────────────────────────────────────────
   ⭐ ยกเลิกใบแล้ว งวดที่มีเงิน (confirmed/reported) **อยู่กับใบเดิม** — ไม่หาย ไม่ต้องถอนคำรับรอง ⇒ "เงินค้าง" จนกว่าจะ
     ยกเข้าใบใหม่ของดีลเดียวกัน (0378 carry) หรือบัญชีบันทึกคืนเงินเต็มจำนวน · งวด pending/rejected = โมฆะ (PR0)
   ⚠️ ตัดสินจากสถานะใบ + ชนิดงวด (ไม่ดู origin) — ใบย้อนหลังยกเลิกได้เฉพาะตอนงวดปกติไม่มีเงินรับแล้ว/ไม่มีงวดรอตรวจ
     (historicalCancelBlock + trigger ของ 0387) จึงไม่มีเงินค้าง · ทางออกสองทาง (คืน/ยก) เปิดเฉพาะใบ pipeline
   ⭐ มติ 24/09 (mig 0387): **งวดยกมาไม่ใช่เงินค้าง** — ผู้จัดการฝ่ายขายยกเลิกใบย้อนหลังได้แม้งวดยกมารับรองแล้ว งวดนั้นเป็นโมฆะตามใบ
     (installmentVoid ข้างล่าง) · ใบที่คีย์ใหม่รับรองงวดยกมาอีกครั้ง ⇒ ไม่มีอะไรให้ยก/คืน
   ⚠️ `refundedAt` อ่านจาก `select('*')` — ก่อนรัน 0378 คอลัมน์ไม่มี (undefined) = ยังไม่คืน ⇒ จอ/ทะเบียนไม่พัง */
export const installmentRefunded = (row) => Boolean(String(row?.refundedAt ?? '').trim());

export function strandedInstallment(row, order) {
  if (!row || order?.status !== 'cancelled') return false;
  if (isOpeningInstallment(row)) return false;
  return ['confirmed', 'reported'].includes(row.status) && !installmentRefunded(row);
}

/* ── งวดโมฆะของใบที่ตายแล้ว (PR0 · review UI-3) ──────────────────────────────────────────────────────────────
   ใบยกเลิก/ถูกออก Rev. ทับ = ไม่มีงานให้เก็บเงินต่อ ⇒ งวดที่ยังไม่มีเงิน (pending/rejected) **ไม่ใช่ยอดค้างรับ ไม่ใช่เลยกำหนด**
   ⭐ ตัวตัดสินเดียวของทั้งระบบ — ทะเบียนบัญชี (`ledgerVoidInstallment`) · แผงงวด · ตารางรายการ SO ถามตัวนี้
     🐞 เดิมมีแต่ทะเบียนที่ตัด ⇒ โมดัลยกเลิกสัญญา "หลุดจากยอดค้างรับทันที" แต่แผงของใบเดียวกันยังขึ้น "ค้างรับ · เลยกำหนด"
   ⚠️ reported/confirmed ไม่ใช่โมฆะ — เงินเข้าแล้ว/รอบัญชีตรวจ (เงินค้างจากใบที่ยกเลิก · strandedInstallment)
   ⭐ **ยกเว้นงวดยกมา: โมฆะทุกสถานะ** (มติเจ้าของ 24/09 · mig 0387) — ผู้จัดการฝ่ายขายยกเลิกใบย้อนหลังเพื่อคีย์ใหม่ได้แม้บัญชี
     รับรองงวดยกมาแล้ว · แถวคงเป็น confirmed ในฐาน (ประวัติการรับรอง) แต่ไม่ใช่เงินของใบที่ตายแล้ว — ใบที่คีย์ใหม่มีงวดยกมาของตัวเอง
     ⇒ นับที่นี่ = เงินก้อนเดียวนับสองใบ
     · ตัดสินจาก `kind` ของแถวล้วน ไม่ถาม origin ของใบ — งวดยกมามีบนใบย้อนหลังเท่านั้น (ผู้เขียนมีแค่ RPC ของ 0374/0379 ·
       ใบย้อนหลังออก Rev./รับงวดย้ายเข้าไม่ได้ · ยามที่ historicalCancelSettleMigration.test.mjs) ⇒ ผู้เรียกที่ส่งแค่ `{ status }`
       (ตารางรายการ SO · ยอดบนหน้าใบ) ได้คำตอบเดียวกับผู้เรียกที่ส่งทั้งใบ (แผงงวด · ทะเบียนบัญชี) */
const DEAD_ORDER_STATUSES = Object.freeze(['cancelled', 'revised']);
export function installmentVoid(row, order) {
  if (!row || !DEAD_ORDER_STATUSES.includes(order?.status)) return false;
  if (isOpeningInstallment(row)) return true;
  return ['pending', 'rejected'].includes(row.status || 'pending');
}

/* ป้ายใต้สถานะของแถวงวดที่โมฆะ (แผงงวดบนใบ) — คืนข้อความ หรือ null (ไม่โมฆะ)
   ⭐ งวดยกมาบอกว่า "โมฆะตามใบ" — ป้ายสถานะยังเป็น "ชำระแล้ว"/"บัญชีตีกลับ" ตามค่าในฐาน ถ้าไม่บอก คนอ่านจะเข้าใจว่า
     เงินยังนับอยู่ หรือบัญชีเป็นคนตีกลับ (ฐานตีกลับให้ตอนยกเลิก · มติ 24/09) · รับรองไว้แล้ว = บอกวันที่บัญชีรับรอง */
export function installmentVoidNote(row, order) {
  if (!installmentVoid(row, order)) return null;
  if (!isOpeningInstallment(row)) return 'โมฆะ — ใบนี้ไม่ต้องตามเก็บแล้ว';
  const certified = row.status === 'confirmed' && row.confirmedAt ? ` (บัญชีรับรองไว้ ${fmtDate(row.confirmedAt)})` : '';
  return `โมฆะตามใบ — ยกเลิกเพื่อคีย์ใหม่${certified}`;
}

/** เลขที่ใบลดหนี้ยาวได้เท่าเลขใบกำกับ (ช่องเดียวกันใน Express) */
export const MAX_REFUND_CREDIT_NOTE_NO = 40;
export const MAX_REFUND_REASON = 500;

/**
 * ค่าที่กรอกของการบันทึกคืนเงิน — ด่านเดียวกับ CHECK sales_order_installments_refund_shape (0378)
 * ⭐ แยกจากด่านสิทธิ์/สถานะ (installmentActionError 'refund') เพื่อให้โมดัลบอกเหตุรายช่องได้โดยไม่ต้องรู้ว่าใครกด
 *   (คิวบนทะเบียนบัญชีไม่มีข้อมูลผู้ใช้ — API ตัดสินสิทธิ์เอง) · route ถามตัวนี้ผ่าน installmentActionError
 * @param options `{ refundedOn, reason, creditNoteNo }`
 */
export function refundValueError(row, options = {}) {
  const refundedOn = String(options.refundedOn || '').trim();
  if (!refundedOn) return 'ต้องระบุวันที่คืนเงิน';
  if (!validIsoDay(refundedOn)) return 'วันที่คืนเงินไม่ถูกต้อง (ปี ค.ศ. 2000–2100)';
  const reason = String(options.reason || '').trim();
  if (reason.length < MIN_REJECT_REASON) return `ต้องระบุเหตุผลที่คืนเงินอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`;
  if (reason.length > MAX_REFUND_REASON) return `เหตุผลต้องไม่เกิน ${MAX_REFUND_REASON} ตัวอักษร`;
  const creditNote = String(options.creditNoteNo || '').trim();
  const invoice = String(row?.taxInvoiceNo || '').trim();
  if (invoice && !creditNote) return `งวดนี้มีใบกำกับภาษี ${invoice} — ต้องระบุเลขที่ใบลดหนี้`;
  if (creditNote.length > MAX_REFUND_CREDIT_NOTE_NO) return `เลขที่ใบลดหนี้ยาวเกิน ${MAX_REFUND_CREDIT_NOTE_NO} ตัวอักษร`;
  return null;
}

/**
 * ยอดที่ควรแสดง — งวดร่างเดินตามแผนของ QT สด ๆ · งวดที่ freeze แล้วใช้ค่าที่เก็บไว้
 *
 * ⚠️ **จอต้องไม่โกหกแม้แผนเปลี่ยนระหว่างร่าง** — QT แก้ได้ ⇒ ยอดที่เขียนไว้ตอนกด
 * "เริ่มติดตาม" อาจไม่ตรงกับแผนวันนี้ · ที่นี่ทับให้ตอน *อ่าน* ส่วนการเขียนจริง
 * เกิดครั้งเดียวตอนอนุมัติ (`freezeInstallments`) ⇒ ไม่มี write-on-read
 *
 * ⚠️ จับคู่ด้วย `seq` — `dueDate`/`note`/สถานะเป็นของ SA ต้องรอดจากการทับเสมอ
 *
 * 🛑 **มีแถวตรึงยอดแล้วอย่างน้อยหนึ่งแถว = คืนรายการเดิมทั้งชุด** (PR0 · แผน so-payment-unlock-replan)
 *   ชุดแบบนี้คือแผนจริงของใบแล้ว (งวดที่ยกมากับใบ Rev. · แผนที่ปรับหลังอนุมัติ) ไม่ใช่ร่างที่รอแผนของ QT
 *   ⇒ ทับแถวร่างที่เหลือด้วยสัดส่วนของ QT เมื่อไร ยอดรวมทุกงวดไม่เท่ายอดใบทันที (จอโกหก ทั้งที่ฐานถูก)
 *   ⚠️ กติกาเดียวกับ `freezeInstallments` ที่ไม่ทับยอดจาก QT เมื่อชุดนั้นมีแถวตรึงแล้ว
 */
export function withLiveAmounts(rows = [], plan = null, total = 0) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length || list.some(isInstallmentFrozen)) return list;
  const live = new Map(installmentsFromPaymentPlan(plan, total).map((r) => [r.seq, r]));
  return list.map((row) => {
    const fresh = live.get(row.seq);
    if (!fresh) return row;
    return { ...row, percent: fresh.percent, amount: fresh.amount, label: fresh.label };
  });
}

/**
 * แผนใน QT ต่างจากงวดที่ตั้งไว้ไหม — คืน `{ planned, tracked }` หรือ null เมื่อตรงกัน
 *
 * ⭐ เกิดจริงเมื่อ QT ถูกแก้หลังกด "เริ่มติดตาม" · `withLiveAmounts` แก้ยอดให้ได้
 * แต่ **จำนวนงวดที่ต่างกันแก้ด้วยการทับยอดไม่ได้** ⇒ ต้องบอกผู้ใช้ตรง ๆ
 * ⚠️ ตอนอนุมัติ `freezeInstallments` จะตั้งงวดใหม่ทั้งชุดให้เอง — ข้อความบนจอต้อง
 * บอกแบบนั้น ไม่ใช่ปล่อยให้คนเดาว่าจะเกิดอะไรขึ้น
 */
export function installmentPlanDrift(rows = [], plan = null, total = 0) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  if (list.some(isInstallmentFrozen)) return null; // freeze แล้วไม่ตามแผนอีก
  const planned = installmentsFromPaymentPlan(plan, total).length;
  if (!planned || planned === list.length) return null;
  return { planned, tracked: list.length };
}

/**
 * งวดพร้อม insert — เท่ากับ `installmentsFromPaymentPlan` แต่ **ยืมเอกสารยืนยันคำสั่งซื้อ**
 * มาตั้งงวดแรกให้เมื่อใบนั้นยืนยันด้วยสลิปโอนเงิน (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ เหตุผล: `payment_slip` เป็นหนึ่งใน `CONFIRM_DOC_TYPES` ⇒ ใบที่ยืนยันด้วยสลิป
 * แปลว่า **จ่ายมาแล้ว** · ปล่อยให้ทุกงวดเป็น `pending` แล้วบังคับให้ SA ไปแนบสลิป
 * ใบเดิมซ้ำ = ให้คนกรอกของที่ระบบถืออยู่แล้ว
 * ⚠️ เอกสารชุดนี้อยู่ที่ **ใบสั่งขาย** ตั้งแต่ mig 0285 (ก่อนหน้านั้นอยู่ที่ใบเสนอราคา
 * ตอนปิด Won) — ผู้เรียกส่งผ่าน `orderConfirmationOf` ที่อ่านสองบ้านให้แล้ว
 *
 * ⚠️ **ยังต้องผ่านบัญชีเหมือนเดิม** — ตั้งให้แค่ `reported` ไม่ใช่ `confirmed`
 * ข้ามด่านบัญชีเมื่อไรก็เท่ากับไม่มีด่าน (กติกาเดิมของสายนี้)
 * ⚠️ ตั้งเฉพาะ **งวดแรก** — สลิปใบเดียวรู้แค่ว่ามีเงินเข้า ไม่รู้ว่าครอบคลุมกี่งวด
 *    ยอดจริงเป็นเรื่องที่บัญชีตรวจตอนคอนเฟิร์ม
 */
export function buildInstallmentsForOrder(plan, total, { confirmation = null, actor = null, now = null } = {}) {
  // ใบยอด 0 ไม่มีงวดเลย (มติผู้ใช้ 2026-08-18) — ดู paymentNotRequired
  if (paymentNotRequired(total)) return [];
  const rows = installmentsFromPaymentPlan(plan, total);
  const paidOn = confirmation?.docDate || null;
  const seeded = confirmation?.docType === 'payment_slip'
    && !!paidOn
    && Array.isArray(confirmation?.attachments)
    && confirmation.attachments.length > 0;

  if (!seeded || !rows.length) return rows;

  return rows.map((row, index) => (index === 0
    ? {
      ...row,
      status: 'reported',
      paidOn,
      reportedAt: now || new Date().toISOString(),
      reportedById: actor?.id || null,
      reportedByName: actor?.name || null,
      evidence: confirmation.attachments,
      note: row.note || 'หลักฐานจากเอกสารยืนยันคำสั่งซื้อ (สลิปโอนเงิน) — ระบบยกมาให้ รอบัญชีตรวจ',
    }
    : row));
}

/** สรุปว่า "ชำระครบยัง" — ตัวเลขทุกตัวที่หน้า SO และรางขวาต้องใช้ */
export function paymentRollup(rows = [], todayIso = null) {
  const list = Array.isArray(rows) ? rows : [];
  const count = list.length;
  /* ⭐ งวดที่บัญชีบันทึกคืนเงินแล้ว (PR3 · 0378) ค่าในฐานยังเป็น confirmed — **ไม่ใช่เงินที่เก็บได้** และไม่ใช่ยอดค้างรับ
     (review UI-2: เดิมแผงขึ้น "เก็บครบแล้ว" ทั้งที่คืนลูกค้าไปหมดแล้ว — ขัดกับทะเบียนบัญชีและโมดัลคืนเงิน) */
  const refunded = list.filter(installmentRefunded);
  const confirmed = list.filter((r) => r.status === 'confirmed' && !installmentRefunded(r));
  const reported = list.filter((r) => r.status === 'reported');
  const rejected = list.filter((r) => r.status === 'rejected');
  const open = list.filter((r) => r.status !== 'confirmed');

  const totalAmount = money(list.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));
  const confirmedAmount = money(confirmed.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));
  const refundedAmount = money(refunded.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));

  // เลยกำหนด = ยังไม่ confirmed และวันครบกำหนดผ่านไปแล้ว
  // ⚠️ `reported` ก็นับว่าเลยกำหนดได้ — แจ้งแล้วแต่บัญชียังไม่รับรอง เงินยังไม่เข้าจริง
  const overdue = todayIso
    ? open.filter((r) => r.dueDate && String(r.dueDate) < String(todayIso))
    : [];

  const upcoming = open
    .map((r) => r.dueDate)
    .filter(Boolean)
    .sort();

  const complete = count > 0 && confirmed.length === count;

  return {
    count,
    confirmedCount: confirmed.length,
    reportedCount: reported.length,
    rejectedCount: rejected.length,
    openCount: open.length,
    totalAmount,
    confirmedAmount,
    refundedCount: refunded.length,
    refundedAmount,
    // ค้างรับ = งวดที่ยังไม่ confirmed (ยอดรวม − เก็บได้ − คืนแล้ว) · ไม่มีงวดคืนเงิน = ค่าเดิมทุกตัว
    outstandingAmount: money(totalAmount - confirmedAmount - refundedAmount),
    overdueCount: overdue.length,
    nextDue: upcoming[0] || null,
    complete,
  };
}

/**
 * ภาพหลังบัญชีกดรับรองงวดนี้ — ป้อนโมดัลรับรองของใบสั่งขายย้อนหลัง (mock FnConfirm · มติ 22/09)
 *
 * ⭐ บัญชีกำลังรับรอง **ด่านเงินของนัดบริการ** ไม่ใช่แค่ยอดหนึ่งก้อน ⇒ โมดัลต้องบอกว่ากดแล้ว
 *   "จ่ายถึง" ขยับไปวันไหน · เก็บแล้วรวมเท่าไร · งวดถัดไปที่ต้องตามคืออะไร
 * ⚠️ "จ่ายถึง" คิดด้วย `paidThrough` ตัวเดียวของระบบ (สมมติว่างวดนี้รับรองแล้ว) — ไม่คิดเงื่อนไขซ้ำที่จอ
 * ⚠️ ส่ง **งวดทั้งหมดของใบ** มาเสมอ — ทะเบียนการชำระต้องคิดจากงวดก่อนกรอง (กติกาเดียวกับ orderPaidThrough)
 *   ไม่งั้นกรอง "รอบัญชีตรวจ" แล้วงวดถัดไป/งวดที่รับรองแล้วหลุด ตัวเลขในโมดัลจะเพี้ยนตามตัวกรอง
 * ⚠️ ไม่มียอด Actual ในนี้ — งวดชำระคนละแกนกับ Actual (หัวไฟล์)
 * @returns `{ paidThrough, collected, next }` — next = งวดถัดไป (seq มากกว่า) ที่ยังไม่รับรอง หรือ null
 */
export function installmentConfirmOutlook(row, rows = []) {
  if (!row) return { paidThrough: null, collected: 0, next: null };
  const others = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id !== row.id);
  const collected = money(others.filter((r) => r.status === 'confirmed')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0) + (Number(row.amount) || 0));
  const seq = Number(row.seq) || 0;
  const next = others
    .filter((r) => (Number(r.seq) || 0) > seq && r.status !== 'confirmed')
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0))[0] || null;
  return {
    paidThrough: paidThrough([...others, { ...row, status: 'confirmed' }]),
    collected,
    next: next ? { label: next.label || '', amount: Number(next.amount) || 0, dueDate: next.dueDate || null } : null,
  };
}

/** สถานะรวมหนึ่งบรรทัด — คืน { state, tone } ให้หน้าเว็บเลือกป้าย/ข้อความเอง */
export function paymentState(rollup, { notRequired = false } = {}) {
  // ใบยอด 0 — จบที่อนุมัติใบ ไม่ใช่ "ยังไม่เก็บเงิน" (มติผู้ใช้ 2026-08-18)
  if (notRequired) return { state: 'not_required', tone: 'neutral' };
  if (!rollup.count) return { state: 'none', tone: 'neutral' };
  if (rollup.complete) return { state: 'complete', tone: 'success' };
  if (rollup.overdueCount) return { state: 'overdue', tone: 'danger' };
  if (rollup.rejectedCount) return { state: 'rejected', tone: 'danger' };
  if (rollup.reportedCount) return { state: 'reviewing', tone: 'info' };
  return { state: 'open', tone: 'warning' };
}

/**
 * ด่านเดียวที่ทั้งปุ่มบนหน้าเว็บและ API ใช้ร่วมกัน — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 *
 * ⭐ เขียนที่เดียวเพราะปุ่มกับ API ขัดกันไม่ได้ (แพตเทิร์นเดียวกับ `scentDesignOrderError`)
 * ⚠️ ตัวนี้ตอบเฉพาะ "สถานะ + สิทธิ์" · ส่วน "ใบนี้อนุมัติแล้วหรือยัง" เป็นของผู้เรียก
 */
/* ── งวดต้องไล่ลำดับ ห้ามข้าม (มติผู้ใช้ 2026-08-18) ────────────────────────
   **แบบหลวม**: งวดก่อนหน้าต้อง "แจ้งแล้วขึ้นไป" (reported / confirmed) พอ —
   ไม่ต้องรอบัญชีคอนเฟิร์มครบ

   ⭐ เลือกหลวมเพราะแบบเข้ม (ต้อง confirmed ครบ) จะเอางานฝ่ายขายไปผูกกับคิวบัญชี:
   ลูกค้าโอนงวด 2 มาแล้วแต่บัญชียังไม่ว่างตรวจงวด 1 ⇒ แนบหลักฐานงวด 2 ไม่ได้ทั้งที่
   ของอยู่ในมือ · หลักฐานที่ค้างในมือคนคือหลักฐานที่หายได้

   ⚠️ `rejected` ของงวดก่อนหน้า **ไม่ผ่าน** — บัญชีตีกลับแปลว่างวดนั้นยังไม่จบ
   ⚠️ ไม่ส่ง `rows` มา = ข้ามด่านนี้ (ผู้เรียกที่ไม่มีบริบทงวดอื่น เช่นเช็คสิทธิ์ล้วน)
   ⚠️ **งวดร่างที่บันทึกเงินไว้แล้วผ่านด่านนี้ด้วย** (2026-08-19) — สถานะมันยังเป็น
   `pending` ตาม CHECK ของ 0259 ถ้านับเป็น "ยังไม่แจ้ง" งวดถัดไปจะกรอกไม่ได้ทั้งที่
   งวดก่อนหน้ามีสลิปอยู่แล้ว ⇒ ผู้ใช้เจอทางตันตั้งแต่งวด 2 ของทุกใบที่ยังไม่อนุมัติ */
export function installmentSequenceError(row, rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const seq = Number(row?.seq) || 0;
  const blocking = rows
    .filter((r) => (Number(r?.seq) || 0) < seq)
    .filter((r) => !['reported', 'confirmed'].includes(r?.status || 'pending'))
    .filter((r) => !installmentPrepaid(r))
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  if (!blocking.length) return null;
  const names = blocking.map((r) => `งวดที่ ${r.seq}`).join(', ');
  return `ต้องแจ้งงวดก่อนหน้าให้ครบก่อน (${names}) — งวดชำระไล่ตามลำดับ ข้ามไม่ได้`;
}

/* ปลายทางของการ "แจ้งชำระ" ขึ้นกับว่าใครกด (มติผู้ใช้ 2026-08-18 — ทางเลือก ก.)
   - ฝ่ายขายแจ้ง  → `reported` เข้าคิวให้บัญชีตรวจ
   - **บัญชีแจ้งเอง → `confirmed` เลย** เพราะบัญชีคือคนตัดสินอยู่แล้ว ให้แจ้งแล้วรอ
     ตัวเองมายืนยันคือพิธีกรรม

   ⭐ ผลพลอยได้ที่ตั้งใจ: คิว `reported` เหลือ **เฉพาะของที่ฝ่ายขายแจ้ง** ⇒ บัญชี
   แยกออกทันทีว่าอันไหนต้องมาตรวจ โดยไม่ต้องเพิ่มสถานะหรือฟิลด์ใหม่เลย
   (นี่คือคำตอบของคำถาม "จะให้บัญชีรู้ได้ยังไงว่าอันไหน SA แจ้งไว้")

   ⭐ **งวดร่างจอดที่ `pending` เสมอ ไม่ว่าใครกด** (มติผู้ใช้ 2026-08-19) — งานจะถึงมือ
   บัญชีต่อเมื่อ **AE Supervisor อนุมัติใบแล้ว** เท่านั้น (ดู `installmentPrepaid`)
   แม้แต่บัญชีกดเองก็ยังไม่ `confirmed`: ใบที่ยังไม่ผ่านด่านอนุมัติไม่ควรมีเงินรับรอง
   แขวนอยู่ ไม่งั้นเงินถึงทะเบียนบัญชีก่อนที่ AE Sup จะได้ตรวจใบสักคน (มติเดิม 2026-08-19 · PR1 ถอดเหตุผลเดิม
   ที่ว่า "คำรับรองล็อกการย้อน/ออก Rev." ออกแล้ว — ตั้งแต่ 0376 งวดที่รับรองแล้วย้ายไปกับใบ Rev.)
   ⇒ `freezeInstallments` เลื่อนให้เป็น `reported` ตอนอนุมัติ แล้วบัญชีค่อยกดรับรอง
   ⚠️ ไม่ส่ง `row` มา = ตัดสินแบบเดิม (ผู้เรียกที่ถามแค่ "คนนี้กดแล้วได้อะไร") */
export function installmentReportOutcome(user, row = null) {
  if (row && !isInstallmentFrozen(row)) return 'pending';
  return canConfirmPayment(user) ? 'confirmed' : 'reported';
}

/* วันสุดท้ายที่ **งวดอื่น** ของใบครอบถึง — ใช้แทนวันสิ้นสุดสัญญาเมื่อผู้เรียกไม่ได้ส่งช่วงสัญญามา
   (ช่วงครอบของใบย้อนหลังต่อเนื่องจนจบสัญญาตั้งแต่ตอน AE Sup อนุมัติ — RPC ของ 0374 บังคับ)
   ⚠️ ตัดงวดยกมาออกด้วย `isOpeningInstallment` ไม่ใช่ด้วย id — ใบละไม่เกิน 1 งวดยกมา และผู้เรียก
      บางทางส่งแถวที่ยังไม่มี id มา (แถว preview) */
const lastDayCoveredByOthers = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((r) => r && !isOpeningInstallment(r))
  .map((r) => String(r.coversTo || '').trim())
  .reduce((latest, day) => (day > latest ? day : latest), '');

/* ── ปลายช่วงที่งวดยกมาครอบได้ — **กติกาเดียว ปุ่มกับ API เรียกตัวนี้ตัวเดียว** ────────────────
   🐞 **review 23/09: สองฝั่งได้วันคนละวัน** — แผงงวดอ่านจากเอกสารแทนสัญญา
     (`order.serviceContract.expiryDate`) ส่วน route ของงวดไม่ได้โหลดสัญญามาเลย ⇒ ถอยไปอ่าน
     จากงวดอื่นของใบ · สองทางนี้ไม่เท่ากันเมื่อบัญชีเคยหดช่วงของงวดปกติงวดสุดท้ายลงมาก่อน
     (งวดปกติของใบย้อนหลังไม่มีกฎช่วง) ⇒ แถบบันทึกไม่ขึ้นเหตุ ปุ่มเปิดให้กด แล้ว API ตีกลับด้วย
     วันคนละวัน = คลาส "ปุ่มบอกอย่าง API บอกอีกอย่าง" ที่รอบนี้ตั้งใจล้างทิ้ง
   ⇒ **ทั้งสองฝั่งคิดวันนี้ที่นี่ที่เดียว** แล้วส่งเข้าด่านเป็น `contractEnd`
     (ด่านไม่มีทางถอยของตัวเองอีกแล้ว — มีสองสูตรเมื่อไรก็กลับมาเพี้ยนหากันเหมือนเดิม)
   ⭐ **สัญญามาก่อนเสมอ** — เป็นของจริงที่ RPC ของ 0374 ใช้กั้นตอนคีย์ใบ
   ⭐ ไม่มีสัญญาผูก (ถอดทีหลัง · ใบที่ยังไม่ได้ผูก) = ถอยไปอ่านจากงวดอื่นของใบ เพราะช่วงครอบที่
     AE Sup รับรองไว้ต่อเนื่องจนจบสัญญาพอดี
   ⚠️ ไม่ได้ทั้งสองทาง (ใบที่มีแต่งวดยกมางวดเดียว + ไม่มีสัญญา) = `null` ⇒ ด่านไม่ตัดสินข้อนี้
     — ล็อกเซลล์ทิ้งไว้โดยไม่มีวันจะบอกคือทางตัน
   ⚠️ ใบ pipeline คืน `null` เสมอ — กฎนี้เป็นของงวดยกมาเท่านั้น */
export function openingCoverageEnd(order, rows) {
  if (!isHistoricalOrder(order)) return null;
  const contractEnd = String(order?.serviceContract?.expiryDate || '').trim();
  return contractEnd || lastDayCoveredByOthers(rows) || null;
}

/* ── ล็อกทั้งใบของใบ pipeline (PR0 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09) ────────────────
   🐞 **ที่มา: PATCH งวดของใบ pipeline ไม่เคยดูสถานะใบเลย** — SO-26080039-0 (ร่างที่ถูกกู้คืน) มีงวด 1 ถูก
     รับรองด้วยสลิปใบเดียวกับ SO-26080043-0 ⇒ ทะเบียนบัญชีนับเงินก้อนเดียวสองครั้ง
   ⭐ **ใบยกเลิก** — งวดที่ยังค้างอยู่เหลือแต่ทางของบัญชี (รับรอง/ตีกลับ/ถอนคำรับรอง/ใบกำกับของเงินที่เข้าแล้ว)
     กับการดึงกลับของผู้แจ้ง · แจ้งงวดใหม่ · ตั้งวัน · ช่วงครอบ · ผูกคำร้อง = งานของใบที่ยังเดินอยู่ ⇒ บล็อก
     ⚠️ allowlist ไม่ใช่ blocklist — คำสั่งใหม่ที่จะเพิ่มวันหน้าต้องถูกตัดสินใหม่ว่าใช้กับใบยกเลิกได้ไหม
     ⭐ PR3 (mig 0378) เพิ่ม refund/refund-clear/carry — ทางออกของ "เงินค้างจากใบที่ยกเลิก" (บันทึกคืนเงิน · ยกเข้าใบใหม่)
   ⭐ **ใบที่ถูกออก Rev. ทับ** — งวดเป็นของใบ Rev. แล้ว ⇒ ทุกคำสั่งบล็อก พร้อมบอกเลขใบที่ต้องไปทำต่อ
   ⭐ **สถานะอื่นคืน null** — รวม `approval_revoked` ระหว่างรอ Rev. (มติ D3: ไม่หยุดรับเงินเพราะกำลังแก้เอกสาร)
   ⚠️ ใบย้อนหลังคืน null เสมอ — `historicalInstallmentLock` เป็นเจ้าของ (กติกาเดิมทุกข้อ)
   ⚠️ ผู้เรียกสองฝั่งต้องต่อด้วยรูปเดียวกัน: `historicalInstallmentLock(order) || pipelineInstallmentLock(order, action)`
     (route PATCH ของงวด · `gate` ของแผงงวด) ⇒ ปุ่มกับ API ตอบคำเดียวกัน
   ⚠️ ไม่ส่ง `action` = ถามระดับใบ ("ใบนี้มีล็อกไหม") — แผงงวดใช้ขึ้นข้อความบอกเหตุที่ปุ่มหาย */
const PIPELINE_CANCELLED_ACTIONS = Object.freeze([
  'confirm', 'reject', 'unconfirm', 'withdraw', 'tax-invoice', 'tax-invoice-clear',
  /* PR3 (mig 0378 · มติ D4): ทางออกของเงินค้าง — บัญชีบันทึกคืนเงิน/ถอนการบันทึก · ยกเข้าใบใหม่ของดีลเดียวกัน
     (`carry` ยิงที่ route ของใบปลายทาง — ใบต้นทางถูกถามด้วยตัวนี้เพื่อให้ allowlist ตอบครบทุกทางที่แตะงวดของใบยกเลิก) */
  'refund', 'refund-clear', 'carry',
]);
export const PIPELINE_CANCELLED_LOCK = 'ใบยกเลิกแล้ว — งวดของใบนี้เหลือให้บัญชีรับรอง/ตีกลับ/ถอนคำรับรอง/บันทึกคืนเงิน'
  + ' ยกเงินไปใบใหม่ของดีลเดียวกัน และผู้แจ้งดึงกลับการแจ้งเท่านั้น';

/* เลขของใบ Rev. ที่มาแทน — อ่านจาก `revisionHistory` (ใบทั้งสายโซ่ของเลขฐานเดียวกัน) ที่ทั้ง route ของหน้าใบ
   และ route ของงวดโหลดมารูปเดียวกัน ⇒ แผงกับ API ได้เลขเดียวกัน · หาไม่เจอ = คำกลาง (ห้ามหลุดเป็น "undefined") */
function supersedingOrderLabel(order) {
  const id = order?.supersededById;
  const number = id && Array.isArray(order?.revisionHistory)
    ? String(order.revisionHistory.find((r) => r?.id === id)?.orderNumber || '').trim()
    : '';
  return number ? ` ${number}` : 'ใบ Rev.';
}

export function pipelineInstallmentLock(order, action) {
  if (!order || isHistoricalOrder(order)) return null;
  if (order.status === 'revised') return `งวดของใบนี้ย้ายไป${supersedingOrderLabel(order)} แล้ว`;
  if (order.status === 'cancelled') {
    return action && PIPELINE_CANCELLED_ACTIONS.includes(action) ? null : PIPELINE_CANCELLED_LOCK;
  }
  const deadQuote = deadQuotationDraftLabel(order);
  if (deadQuote) {
    return action && PIPELINE_DEAD_QT_ACTIONS.includes(action) ? null
      : `${deadQuote} — ใบนี้เป็นร่างที่ใช้ต่อไม่ได้ งวดเหลือให้บัญชีถอนคำรับรอง/ตีกลับ และผู้แจ้งดึงกลับการแจ้งเท่านั้น`;
  }
  return null;
}

/* ── ร่างที่ QT ถูกถอด Won แล้ว (ร่างที่ถูกกู้คืนจากการยกเลิก) ─────────────────────────────────────────
   🐞 SO-26080039-0 (18/08): ยกเลิก → ถอด Won ของ QT-26080037-4 → ออก QT-5 → admin กู้คืนใบเดิมเป็นร่าง → ออก SO-26080043-0
     จาก QT-5 · งวดของร่างที่กู้คืนตรึงยอดมาตั้งแต่ตอนเคยอนุมัติ ⇒ บัญชีรับรองสลิปเดียวกันบนสองใบ (ทะเบียนนับเงินซ้ำ)
   ⭐ ร่างแบบนี้ยื่นอนุมัติไม่ได้อยู่แล้ว (ด่านยื่นบังคับ QT = accepted) ⇒ งวดของมันเหลือแค่ทางเก็บกวาด:
     บัญชีถอนคำรับรอง/ตีกลับ/ล้างใบกำกับ · ผู้แจ้งดึงกลับ — รับรองหรือแจ้งเงินก้อนใหม่ = เงินลงใบที่ไม่มีวันอนุมัติ
   ⭐ ถามเฉพาะใบที่ยังไม่อนุมัติ (ร่าง/รออนุมัติ/ตีกลับ) — ใบที่ยังมีชีวิตทำให้ QT ถอด Won ไม่ได้อยู่แล้ว
     (quotations unaccept → sales_order_exists) · ร่าง Rev. (มติ D3) ใช้ QT เดิมที่ยัง accepted ⇒ ไม่โดนตัวนี้
   ⚠️ ต้องมี `order.quotation.status` — route ของงวดกับหน้าใบโหลดมาทั้งคู่ (ยามต้นทางใน installmentPipelineGuards)
     ไม่มีค่า = ไม่ตัดสิน (ไม่เดาว่า QT ตาย) */
const PIPELINE_DEAD_QT_ACTIONS = Object.freeze(['reject', 'unconfirm', 'withdraw', 'tax-invoice-clear']);

function deadQuotationDraftLabel(order) {
  if (!order || isHistoricalOrder(order)) return null;
  if (!['draft', 'pending_approval', 'rejected'].includes(order.status)) return null;
  const status = order.quotation?.status;
  if (!status || status === 'accepted') return null;
  const number = String(order.quotation?.quoteNumber || '').trim() || 'ใบเสนอราคาของใบนี้';
  return `${number} ไม่ได้เป็น Won แล้ว`;
}

/* ── แผงงวดของใบที่ถูกออก Rev. ทับ (PR1 · mig 0376) ─────────────────────────────────────────────
   ⭐ ตั้งแต่ 0376 งวด **ย้ายทั้งแถว** ไปใบ Rev. ⇒ ใบ revised เหลือ 0 แถว — แผงต้องบอกว่าเงินไปอยู่ไหน
     ไม่ใช่ถอยไปวาดแผนจาก QT ("ยังไม่เริ่มติดตาม" ปลอม) · เลขใบมาจากตัวเดียวกับข้อความล็อก (`supersedingOrderLabel`)
   ⚠️ ใบย้อนหลังออก Rev. ไม่ได้ (CHECK ของ 0374) ⇒ null เสมอ */
export function revisedInstallmentsNote(order) {
  if (!order || isHistoricalOrder(order) || order.status !== 'revised') return null;
  return `งวดชำระทั้งหมดย้ายไป${supersedingOrderLabel(order)} แล้ว`;
}

/* ด่านของ POST "เริ่มติดตามการชำระ" — ปุ่มบนแผงกับ route ถามตัวเดียวกัน
   ⭐ ใบ `revised` (PR0) — งวดของใบนี้ไปอยู่กับใบ Rev. แล้ว สร้างงวดชุดที่สองให้ใบเก่า = เงินก้อนเดียวมีสองแถว
   ⚠️ ใบย้อนหลังถูกตีกลับก่อนถึงตัวนี้ (route) — งวดของมันมาจากฟอร์มคีย์ใบเท่านั้น */
export function installmentStartBlock(order) {
  if (order?.status === 'revised') return 'งวดของใบนี้ย้ายไปใบ Rev. แล้ว';
  if (['cancelled', 'rejected'].includes(order?.status)) return 'ใบสั่งขายนี้ถูกยกเลิก/ตีกลับแล้ว — ไม่มีอะไรให้ติดตาม';
  // ร่างที่ QT ถูกถอด Won แล้ว (ร่างที่ถูกกู้คืน) — สร้างงวดชุดใหม่ให้ใบที่ใช้ต่อไม่ได้ = ของผี
  const deadQuote = deadQuotationDraftLabel(order);
  if (deadQuote) return `${deadQuote} — ใบนี้เป็นร่างที่ใช้ต่อไม่ได้`;
  return null;
}

/* ── optimistic lock ของ PATCH งวด (PR0) ────────────────────────────────────────────────────
   🐞 เดิม `updateInstallment` เขียนโดยไม่มีเงื่อนไข ⇒ สองหน้าต่างเขียนแถวเดียวกันพร้อมกัน ตัวที่มาทีหลังชนะเงียบ ๆ
     (แจ้งชำระที่มาช้าเขียนทับแถวที่บัญชีเพิ่งตีกลับ · ถอนคำรับรองซ้อนการแก้ช่วงครอบ)
   ⭐ จอส่ง `updatedAt` ของแถวที่ **ตาเห็น** มาด้วย ⇒ ต่างจากแถวสดตอน route อ่าน = 409 ก่อนแตะอะไร
     แล้ว route ยังเขียนแบบมีเงื่อนไข `updatedAt` ของแถวที่อ่านมาอีกชั้น (กันช่วงระหว่างด่านกับการเขียน)
   ⚠️ ไม่ส่งค่ามา (แท็บเก่าก่อน deploy) = ไม่ตัดสินข้อนี้ — ชั้นที่สองยังกันอยู่
   ⚠️ เทียบสตริงก่อน แล้วค่อยเทียบเป็นเวลา — รูปแบบต่างกันแต่เวลาเดียวกันไม่ใช่ "เก่า" */
export const INSTALLMENT_STALE_MESSAGE = 'งวดนี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่';

export function installmentStale(row, expectedUpdatedAt) {
  const expected = String(expectedUpdatedAt ?? '').trim();
  if (!expected) return false;
  const actual = String(row?.updatedAt ?? '').trim();
  if (expected === actual) return false;
  const a = Date.parse(expected);
  const b = Date.parse(actual);
  return !(Number.isFinite(a) && Number.isFinite(b) && a === b);
}

/* คำบน toast หลัง "แจ้ง/บันทึกการชำระ" — ตามปลายทางจริงของแถว (installmentReportOutcome) ไม่ใช่ชื่อคำสั่ง
   🐞 เดิมขึ้น "ส่งให้บัญชีตรวจแล้ว" ทุกครั้ง ทั้งที่บัญชีบันทึกเองจบที่ "ชำระแล้ว" และงวดร่างยังไม่ถึงบัญชีเลย */
export function installmentReportDoneMessage(status) {
  if (status === 'confirmed') return 'บันทึกการรับชำระแล้ว — งวดนี้ขึ้น “ชำระแล้ว” ทันที';
  if (status === 'pending') return 'บันทึกการจ่ายไว้แล้ว — จะส่งให้บัญชีตรวจเองเมื่อใบสั่งขายอนุมัติ';
  return 'ส่งให้บัญชีตรวจแล้ว';
}

export function installmentActionError(row, action, user, options = {}) {
  /* ── ล็อกทั้งใบ (ผู้เรียกคำนวณมา = `historicalInstallmentLock(order) || pipelineInstallmentLock(order, action)`)
     — ชนะทุกคำสั่ง ─────────
     ใบสั่งขายย้อนหลังที่ยังไม่อนุมัติ: งวดยังไม่หยุดยอด บัญชียังไม่เห็น และทั้งชุดแก้ที่ฟอร์มคีย์ใบ
     ใบ pipeline ที่ยกเลิก/ถูกออก Rev. ทับ (PR0): เหลือทางของบัญชี / บล็อกทุกคำสั่ง — รายคำสั่ง
     ⇒ ปุ่มบนแผงงวดกับ API ต้องตอบคำเดียวกันก่อนดูอะไรในแถว (ไม่งั้นได้ "ยังไม่มีการแจ้งชำระ" ที่ชี้ทางผิด) */
  if (options.orderLock) return options.orderLock;
  if (!row) return 'ไม่พบงวดที่ระบุ';
  const status = row.status || 'pending';

  /* ── งวดที่บัญชีบันทึกคืนเงินแล้ว (PR3 · mig 0378) — ถอนคำรับรอง/แก้ใบกำกับไม่ได้จนกว่าจะถอนการบันทึกคืนเงิน ─────
     ⭐ เงินก้อนนั้นออกจากบริษัทไปแล้ว: ถอนคำรับรองทับ = ทะเบียนบอกว่ารอบัญชีตรวจเงินที่คืนไปแล้ว · แก้/ล้างใบกำกับทับ =
       เลขใบลดหนี้ที่บันทึกคู่ไว้ไม่มีใบให้ลดหนี้ ⇒ ต้องถอยการคืนก่อน (CHECK sales_order_installments_refund_shape กันซ้ำที่ฐาน) */
  if (installmentRefunded(row) && ['unconfirm', 'tax-invoice', 'tax-invoice-clear'].includes(action)) {
    return 'งวดนี้บันทึกคืนเงินแล้ว — ถอนการบันทึกคืนเงินก่อน (เมนูแถว)';
  }

  /* ── งวดของใบสั่งขายย้อนหลังที่อนุมัติแล้ว (มติ 22/09 · mig 0374) — `options.historical` ─────────
     ⭐ ช่วงครอบของใบนี้ **ถูกรับรองเป็นชุด** ตอน AE Sup อนุมัติ (ต่อเนื่องเต็มสัญญา · งวดยกมาเริ่มวันเริ่มสัญญา)
       ⇒ แก้รายงวดทีหลังได้เฉพาะฝ่ายบัญชี (คนเดียวกับที่ถือด่าน "จ่ายถึง") ไม่ใช่ฝ่ายขายที่ได้ประโยชน์
     ⭐ งวดยกมาไม่มีวันครบกำหนดและถอนไม่ได้ — ปล่อยไปถึงฐานจะชน CHECK sales_order_installments_opening_shape
       เป็น 500 ดิบ (ตั้งวันครบกำหนด · ล้างช่วงครอบ) หรือกลายเป็นงวดเปล่าที่ไม่มีใครแจ้งซ้ำได้ (ถอน)
     ⭐ ที่ฝ่ายบัญชีขยับได้จริงคือ **ปลายช่วงของงวดยกมา** เท่านั้น (วันเริ่มล็อกที่วันเริ่มสัญญา ·
       ห้ามล้างช่อง · ห้ามเลยวันสิ้นสุดสัญญา) — ยอดที่อนุมัติไปแล้วผิดยังไม่มีทางแก้รายงวด
     ⚠️ ทางแก้ของความผิดเชิงโครงสร้าง (ยอด · โซน · จำนวนงวด) ทางเดียวคือ HISTORICAL_CORRECTION_PATH
     ⚠️ ใบ pipeline (`historical` เป็นเท็จ) ไม่ผ่านกิ่งนี้เลย — พฤติกรรมเดิมทุกข้อ */
  if (options.historical) {
    const opening = isOpeningInstallment(row);
    if (opening && action === 'schedule') return `${OPENING_INSTALLMENT_LABEL}ไม่มีกำหนดชำระ`;
    if (opening && action === 'withdraw') {
      /* มติ 24/09 (mig 0387): ไม่ต้องให้บัญชีตีกลับก่อนแล้ว — ผู้จัดการฝ่ายขายยกเลิกใบได้ งวดยกมาเป็นโมฆะตามใบ */
      return `${OPENING_INSTALLMENT_LABEL}ถอนไม่ได้ — ${HISTORICAL_CORRECTION_PATH}`;
    }
    // แจ้งชำระที่พกช่วงครอบมาด้วย = แก้ช่วงครอบทางอ้อม (route เขียนช่วงลงแถวเมื่อส่งมา) ⇒ ด่านเดียวกัน
    const touchesCoverage = action === 'coverage'
      || (action === 'report' && Boolean(options.coversFrom || options.coversTo));
    if (touchesCoverage) {
      if (!canConfirmPayment(user)) {
        return opening
          ? `ช่วงครอบของ${OPENING_INSTALLMENT_LABEL}แก้ได้เฉพาะฝ่ายบัญชี`
          : `ช่วงครอบของใบย้อนหลังตรึงตอน${HISTORICAL_APPROVER_LABEL}อนุมัติ — แก้ได้เฉพาะฝ่ายบัญชี`;
      }
      if (opening) {
        /* 🐞 **"ใครแก้ได้" กับ "ค่านี้ผ่านไหม" เป็นคนละคำถาม** (review 23/09) — เซลล์บนแผงงวด
           ถามด่านแบบ **ไม่ส่งค่า** เพื่อรู้ว่าจะวาดช่องกรอกหรือข้อความล็อก (แพตเทิร์นเดียวกับ
           `tax-invoice` ที่ส่งค่าหลอก) · เดิมกิ่งนี้ตรวจค่าทันที ⇒ ค่าที่ไม่ได้ส่ง (`''`) ไม่เท่า
           วันเริ่มสัญญาเสมอ = ช่องครอบบริการของงวดยกมาล็อก **ทุกคนรวมฝ่ายบัญชี** ซึ่งเป็นฝ่าย
           เดียวที่กติกานี้เปิดให้ และไม่มีจออื่นในระบบแก้ค่านี้ได้เลย ⇒ ทางตันจริง
           !! เทียบ `undefined` เป๊ะ ๆ **ห้ามใช้ falsy** — `null` คือ "ล้างช่อง" ที่ต้องตีกลับตามเดิม
              (route ส่ง `body.coversFrom || null` เสมอ ⇒ คำขอจริงไม่มีทางเป็น undefined) */
        const proposed = options.coversFrom !== undefined || options.coversTo !== undefined;
        if (proposed) {
          const from = String(options.coversFrom || '').trim();
          const to = String(options.coversTo || '').trim();
          if (from !== String(row.coversFrom || '').trim()) return `ช่วงเริ่มของ${OPENING_INSTALLMENT_LABEL}ล็อกที่วันเริ่มสัญญา`;
          if (!to) return `${OPENING_INSTALLMENT_LABEL}ต้องมีวันสิ้นสุดช่วงครอบเสมอ — ล้างช่องไม่ได้`;
          /* ⭐ ปลายช่วงต้องอยู่ในอายุสัญญา — `coversTo` ของงวดยกมาคือค่าที่ดัน "จ่ายถึง" ⇒ เลื่อนเลย
             วันสิ้นสุดสัญญาเมื่อไร ด่านเข้าไซต์เปิดให้รอบที่ไม่มีใครจ่าย (อาการกลับด้านของทางตันข้างบน
             ที่เพิ่งปลดล็อกไป — ปลดแล้วต้องไม่เปิดกว้างกว่าตอนคีย์ใบ ซึ่ง RPC บังคับ `to` อยู่ในสัญญา)
             · `options.contractEnd` = ปลายช่วงที่ **`openingCoverageEnd` คิดให้** — ผู้เรียกทั้งสองฝั่ง
               (แผงงวดบนใบ · PATCH ของ route) เรียกตัวนั้นตัวเดียวแล้วส่งค่าเข้ามา
             🔴 **ด่านนี้ห้ามมีทางถอยของตัวเอง** — เดิมถอยไปอ่าน `lastDayCoveredByOthers(options.rows)`
               เองเมื่อไม่ได้ส่งค่ามา ⇒ ฝั่งที่ส่ง (จอ) กับฝั่งที่ไม่ส่ง (route) ได้คนละวัน = ปุ่มเปิดแล้ว
               API ตีกลับ · ทางถอยย้ายไปอยู่ใน `openingCoverageEnd` แล้ว มีสูตรเดียวทั้งระบบ
             ⚠️ ไม่มีค่าส่งมา = ไม่ตัดสินข้อนี้ (ใบที่ไม่มีสัญญาและมีแต่งวดยกมางวดเดียว)
             ⚠️ **บอกวันที่กั้นอยู่ในข้อความเสมอ** — วันอาจมาจากสัญญาหรือจากงวดอื่นของใบ ถ้าไม่บอกวัน
               คนอ่านจะเดาไม่ออกว่าติดที่ตรงไหน */
          const spanEnd = String(options.contractEnd || '').trim();
          if (spanEnd && to > spanEnd) {
            return `ช่วงครอบของ${OPENING_INSTALLMENT_LABEL}ครอบได้ถึง ${fmtDate(spanEnd)} (วันสิ้นสุดสัญญา) — เงินที่เก็บก่อนเข้าระบบครอบเกินอายุสัญญาไม่ได้`;
          }
        }
      }
    }
  }

  /* ใบยอด 0 ไม่มีขั้นยืนยันการชำระ (มติผู้ใช้ 2026-08-18) — อนุมัติใบแล้วจบ
     ⚠️ **ไม่ลบงวดเก่าทิ้ง** ใบที่ออกก่อนมตินี้ยังมีแถวอยู่ (prod 13 ใบ) พร้อมร่องรอย
     ของคนที่เคยกดไปแล้ว — ที่ทำคือ *ปิดปุ่ม* ไม่ใช่ลบประวัติ · แถวยังอ่านได้ตามเดิม
     ⚠️ ต้องส่ง `orderTotal` มาถึงจะรู้ ไม่ส่ง = ไม่ตัดสิน (ผู้เรียกที่ไม่มีบริบทใบ) */
  const orderTotal = options.orderTotal;
  if (orderTotal !== undefined && paymentNotRequired(orderTotal)
    && ['report', 'confirm', 'reject', 'withdraw', 'unconfirm'].includes(action)) {
    return 'ใบนี้ยอดรวม 0 บาท — ไม่มีขั้นยืนยันการชำระ จบที่การอนุมัติใบสั่งขาย';
  }

  // ตั้ง/แก้วันครบกำหนดรายงวด — QT ไม่มีวันมาให้ (มติผู้ใช้: SA กรอกเองทีละงวด)
  // แก้ได้เสมอแม้ใบอนุมัติแล้ว เพราะของจริงลูกค้าเลื่อนจ่ายบ่อย · แต่ยอด/% แก้รายงวดที่นี่ไม่ได้ —
  // ทางเดียวคือ "ปรับแผนงวด" ของ AE Sup/admin ทั้งใบ (PR2 · mig 0377 · lib/sales/installmentReplan.js)
  if (action === 'schedule') {
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์แก้กำหนดชำระ';
    if (status === 'confirmed') return 'งวดนี้บัญชีคอนเฟิร์มแล้ว แก้กำหนดชำระไม่ได้';
    return null;
  }

  /* ── ช่วงบริการที่งวดนี้ครอบ (mig 0320 · มติผู้ใช้ 2026-08-30) ──────────
     ⭐ **เจ้าของค่านี้เปลี่ยนมือตอนบัญชีรับรอง** (มติผู้ใช้ 2026-08-30):
       · ยังไม่ `confirmed` → ฝ่ายขายกรอกได้ (บัญชีก็ช่วยกรอกได้) — เป็นแค่แผน
       · `confirmed` แล้ว  → **ฝ่ายบัญชีเท่านั้น** เพราะ `coversTo` ของงวดที่รับรองแล้ว
         คือค่า "จ่ายถึง" ที่ด่านเข้าไซต์ใช้ตัดสิน ⇒ ถ้าฝ่ายขายเลื่อนเองได้ ก็เท่ากับ
         ฝ่ายขายปลดด่านเงินของตัวเอง ซึ่งเป็นรูรั่วเดียวกับที่ `canConfirmPayment`
         ตั้งใจปิด (ดูคอมเมนต์ 🔴 ที่ permissions.js — ห้ามใช้ isSuperuser เป็นด่านเงิน)
     ⚠️ ต่างจาก `schedule` ที่ล็อกตายเมื่อ confirmed — ที่นี่ยัง **แก้ได้** แต่เปลี่ยนคนแก้
     เพราะของจริงบนฐานวันนี้มีงวดที่รับรองไปแล้วก่อนคอลัมน์นี้เกิด (สาย SERVICE 8 ใบ
     ณ 2026-08-30) ถ้าล็อกตายจะไม่มีใครกรอกย้อนหลังได้ แล้วด่าน PR-C จะบล็อกงานจริง
     ⚠️ ทุกครั้งที่แก้ลง audit (route เก็บ before/after ทั้งแถวอยู่แล้ว) — เป็นร่องรอยเดียว
     ⚠️ ช่วงกลับหัวต้องตกที่นี่ ไม่ปล่อยไปตาย CHECK ของ DB — ปลายทางนั้นเด้งเป็น 500
     ที่ผู้ใช้อ่านไม่รู้เรื่อง (ดู sales_order_installments_covers_range) */
  if (action === 'coverage') {
    if (status === 'confirmed') {
      if (!canConfirmPayment(user)) {
        return 'งวดนี้บัญชีรับรองแล้ว — ช่วงครอบบริการแก้ได้เฉพาะฝ่ายบัญชี';
      }
    } else if (!canUser(user, 'salesplan:edit') && !canConfirmPayment(user)) {
      return 'ไม่มีสิทธิ์แก้ช่วงครอบบริการ';
    }
    const from = String(options.coversFrom || '').trim();
    const to = String(options.coversTo || '').trim();
    if (from && to && from > to) return 'วันเริ่มช่วงครอบต้องไม่เกินวันสิ้นสุด';
    /* ⚠️ ช่วงปีต้องตกที่นี่ด้วย ไม่ใช่แค่ช่วงกลับหัว — CHECK ของฐาน
       (`sales_order_installments_covers_range`) กันปี 2000–2100 ไว้ และถ้าปล่อยให้ไป
       ตายที่นั่น route จะ catch เป็น 500 พร้อมข้อความ Postgres ดิบภาษาอังกฤษ
       (ปีพิมพ์เกินเป็นเคสจริงที่ระบบนี้เจอมาแล้ว: `formulaDate = '2202-08-06'`) */
    const outOfRange = [from, to].filter(Boolean)
      .some((day) => day < '2000-01-01' || day > '2100-12-31');
    if (outOfRange) return 'ปีของช่วงครอบบริการไม่ถูกต้อง (รับปี ค.ศ. 2000–2100)';
    return null;
  }

  /* ── ใบงานบริการ: ไม่มีช่วงครอบ = เงินนับไม่ได้ (มติผู้ใช้ 2026-08-31) ────────
     🐞 **UAT 2026-09-01: ด่านนี้เคยข้ามได้ทั้งเส้น** — เดิมเช็กเฉพาะ `action === 'confirm'`
     และวางไว้ **ใต้** สาขา `report` ซึ่ง `return` ก่อนเสมอ ⇒ สองชั้นพร้อมกัน:
     บัญชี/แอดมินที่ "แจ้งชำระ" เองลง `confirmed` ตั้งแต่ก้าวแรก (`installmentReportOutcome`)
     แล้วไม่เคยเจอด่านเลย · "จ่ายถึง" ยังว่าง = กับดักที่ mig 0325 เพิ่งตามเก็บ กลับมาทันที
     ⇒ ตัดสินจาก **ปลายทางของคำสั่ง** ไม่ใช่ชื่อคำสั่ง และวางไว้เหนือทุกสาขา

     ⚠️ ตรวจเฉพาะใบที่มีรอบบริการ · ไม่ส่ง `serviceRounds` มา = ไม่บล็อก (fail-open
     โดยตั้งใจ — บล็อกทุกใบเมื่อผู้เรียกลืมส่ง = หยุดรับเงินทั้งบริษัท)
     ⚠️ ฝ่ายขายแจ้ง (ปลายทาง `reported`/`pending`) ไม่ติด — ยังไม่ใช่จังหวะที่เงินนับ
     ⚠️ ตีกลับ/ดึงกลับไม่ติด — งวดที่ข้อมูลไม่ครบยิ่งต้องถอยได้ */
  /* ⭐ ใบ pipeline ที่ยกเลิกแล้ว (`options.orderCancelled`) ไม่ติดข้อนี้ (review 23/09 · ทางตันคืนเงิน) — ไม่มีนัดช่างไหน
     อ่านใบที่ยกเลิก (ด่านเงินของนัดนับเฉพาะใบ approved) ⇒ ช่วงครอบไม่มีอะไรให้กันแล้ว · แต่เซลล์ช่วงครอบของใบยกเลิกถูกล็อก
     (PIPELINE_CANCELLED_LOCK) และคืนเงินรับเฉพาะงวด confirmed ⇒ ถ้ายังบังคับ งวด reported ที่ไม่มีช่วงครอบรับรองไม่ได้
     และคืนเงินไม่ได้เลย เหลือทางเดียวคือตีกลับ = บันทึกว่าเงินไม่เคยเข้า ทั้งที่เข้าแล้วและกำลังคืน */
  const landsConfirmed = action === 'confirm'
    || (action === 'report' && installmentReportOutcome(user, row) === 'confirmed');
  if (landsConfirmed && options.serviceRounds && !options.orderCancelled) {
    const coversFrom = options.coversFrom ?? row.coversFrom;
    const coversTo = options.coversTo ?? row.coversTo;
    if (!coversFrom || !coversTo) {
      return 'ใบนี้เป็นงานบริการ — ต้องระบุช่วงครอบบริการของงวดก่อน จึงจะรับรองได้'
        + ' (ฝ่ายขายกรอกที่คอลัมน์ “ครอบคลุมบริการ” บนแผงงวด)';
    }
  }

  if (action === 'report') {
    // ฝ่ายขายแจ้งเพื่อให้บัญชีตรวจ · **บัญชีแจ้งเองก็ได้** แล้วจบในก้าวเดียว
    // (มติผู้ใช้ 2026-08-18 — ดู installmentReportOutcome)
    if (!canUser(user, 'salesplan:edit') && !canConfirmPayment(user)) {
      return 'ไม่มีสิทธิ์แจ้งการชำระ';
    }
    /* ⭐ **งวดร่างบันทึกเงินได้แล้ว แต่ยังไม่ส่งให้บัญชี** (มติผู้ใช้ 2026-08-19)
       เดิมบล็อกทั้งก้าว โดยอ้างว่ายอดของงวดร่างยังเดินตามใบ · ข้ออ้างนั้นไม่ตรงกับของจริง
       (ยอดนิ่งตั้งแต่ออกใบ — ดู `installmentPrepaid`) และมันห้ามผิดอย่างด้วย: สิ่งที่ต้อง
       รอการอนุมัติคือ **การส่งให้บัญชีตรวจ** ไม่ใช่การบันทึกว่าเงินเข้า
       ⇒ ปลายทางไปจอดที่ `pending` แทน (ดู `installmentReportOutcome`) แล้วเลื่อนให้เอง
       ตอนอนุมัติ · กติกา "เงินถึงบัญชีหลัง AE Sup อนุมัติ" ไม่ถูกแตะสักนิด
       ⚠️ CHECK `sales_order_installments_draft_pending` ของ 0259 ยังอยู่ครบและยัง
       เป็นด่านสุดท้าย — มันคุมแค่ `status` จึงไม่ขวางการเก็บ `paidOn`/หลักฐาน */
    if (installmentPrepaid(row)) {
      return 'งวดนี้บันทึกการจ่ายไว้แล้ว — จะส่งให้บัญชีตรวจเองเมื่อใบสั่งขายอนุมัติ';
    }
    if (status === 'confirmed') return 'งวดนี้บัญชีคอนเฟิร์มแล้ว แจ้งซ้ำไม่ได้';
    if (status === 'reported') return 'งวดนี้แจ้งไปแล้ว รอบัญชีตรวจ';
    if (!options.paidOn) return 'ต้องระบุวันที่ลูกค้าชำระ';
    const sequence = installmentSequenceError(row, options.rows);
    if (sequence) return sequence;
    return null;
  }

  // ดึงกลับ — ของผู้แจ้งเองเท่านั้น และต้องยังไม่มีใครตัดสิน (รูปเดียวกับ "ดึงกลับ" ของ SO)
  // ⚠️ **งวดร่างที่บันทึกเงินไว้ก็ดึงกลับได้** (2026-08-19) — สถานะมันยัง `pending`
  // ถ้ายึดตาม status อย่างเดียว คนที่แนบสลิปผิดใบจะลบทิ้งไม่ได้จนกว่าใบจะอนุมัติ
  if (action === 'withdraw') {
    if (status !== 'reported' && !installmentPrepaid(row)) {
      return 'ดึงกลับได้เฉพาะงวดที่แจ้งแล้วและบัญชียังไม่ตรวจ';
    }
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์ดึงกลับ';
    if (row.reportedById && row.reportedById !== user?.id && user?.role !== 'admin') {
      return 'ดึงกลับได้เฉพาะผู้ที่แจ้งงวดนี้';
    }
    return null;
  }

  /* ── ถอนคำรับรองของบัญชี (มติผู้ใช้ 2026-08-13) ────────────────────────
     ปิดข้อค้างเดิมที่ยังไม่ตัดสิน: *"งวดที่คอนเฟิร์มแล้ว ให้บัญชีถอนได้"*

     ⭐ **ถอยไป `reported` ไม่ใช่ `pending`** — คำแจ้งของฝ่ายขายและหลักฐานยังอยู่ครบ
     สิ่งที่ถูกถอนคือ **คำรับรองของบัญชี** ไม่ใช่การแจ้งของ SA · ถอยไป pending เมื่อไร
     เท่ากับลบงานของฝ่ายขายทิ้งด้วย แล้วเขาต้องแนบหลักฐานใหม่ทั้งที่ไม่ได้ทำอะไรผิด

     ⚠️ **ของบัญชีเท่านั้น** — คนที่รับรองว่าเงินเข้าคือคนเดียวที่ถอนคำนั้นได้
     ⚠️ **ต้องมีเหตุผล** เท่ากับตอนตีกลับ: นี่คือการกลับคำเรื่องเงินที่เคยบอกว่ารับแล้ว
        และเป็นก้าวแรกของการปลดล็อกการยกเลิกใบย้อนหลังที่งวดปกติรับรองแล้ว (historicalCancelBlock — งวดกลับเป็นรอตรวจ
        ยังบล็อก บัญชีตีกลับต่อ · งวดยกมาไม่ล็อกการยกเลิกแล้ว มติ 24/09) · ย้อนการอนุมัติ/ออก Rev. ไม่ล็อกด้วยงวดที่รับรองแล้ว
        ตั้งแต่ PR1 · ยกเลิกใบ pipeline ตั้งแต่ PR3 · งวดที่บัญชีบันทึกคืนเงินแล้วถอนไม่ได้ (ถอนการบันทึกคืนเงินก่อน)
        ⇒ ต้องมีร่องรอยว่าทำไม ไม่ใช่กดแล้วหายไปเฉย ๆ */
  if (action === 'unconfirm') {
    if (!canConfirmPayment(user)) return 'ถอนคำรับรองได้เฉพาะฝ่ายบัญชี';
    if (status !== 'confirmed') return 'ถอนได้เฉพาะงวดที่บัญชีคอนเฟิร์มไปแล้ว';
    const reason = String(options.reason || '').trim();
    if (reason.length < MIN_REJECT_REASON) {
      return `ต้องระบุเหตุผลที่ถอนอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`;
    }
    return null;
  }

  /* ── ผูก/ถอดคำร้องขอเอกสารการเงิน (B-5 · mig 0260) ────────────────────
     ⭐ **ของฝ่ายขาย ไม่ใช่ของบัญชี** — คนที่รู้ว่าใบวางบิลใบไหนครอบงวดไหนคือคนที่
     เปิดคำร้องนั้น · บัญชีเห็นความเชื่อมโยงได้แต่ไม่ต้องมากดให้
     ⚠️ **แนบได้แม้งวดคอนเฟิร์มแล้ว** ต่างจาก `schedule` — ของจริงขอใบเสร็จ *หลัง*
     เงินเข้าเป็นเรื่องปกติ ปิดตรงนี้เมื่อไรใบเสร็จจะไม่มีที่ให้แขวน */
  if (action === 'link' || action === 'unlink') {
    if (!canUser(user, 'salesplan:edit')) return 'ไม่มีสิทธิ์แก้การผูกคำร้อง';
    if (action === 'link' && !String(options.billingRequestId || '').trim()) {
      return 'ต้องเลือกคำร้องที่จะผูก';
    }
    if (action === 'unlink' && !row.billingRequestId) return 'งวดนี้ยังไม่ได้ผูกคำร้อง';
    return null;
  }

  /* ── ใบกำกับภาษีของงวด (mig 0348 · มติผู้ใช้ 2026-09-07) ────────────────
     ด่านอยู่ในไฟล์ของตัวเอง (`lib/sales/taxInvoice.js`) เพราะเป็นความจริงคนละก้อน
     กับสถานะการชำระ และมีผู้เรียกสองทาง (ทะเบียนการชำระ + แผงงวดบนใบ SO)
     ⚠️ **ต้องอยู่เหนือ catch-all** ไม่งั้นได้ 'คำสั่งไม่ถูกต้อง' ทั้งที่ปุ่มเปิดอยู่ */
  if (action === 'tax-invoice' || action === 'tax-invoice-clear') {
    return taxInvoiceActionError(row, action, user, options);
  }

  /* ── บันทึกคืนเงิน / ถอนการบันทึก (PR3 · mig 0378 · มติเจ้าของ 23/09 D4) ──────────────────────────────────
     ⭐ ทางออกที่สองของ "เงินค้างจากใบที่ยกเลิก" (ทางแรก = ยกเข้าใบใหม่ของดีลเดียวกัน) — **ของบัญชีเท่านั้น**
       (คนที่รับรองว่าเงินเข้าคือคนที่บันทึกว่าเงินออก) · **คืนเต็มจำนวน** ไม่มีคืนบางส่วน (ยอดของแถวคือยอดที่คืน)
     ⭐ เฉพาะงวด `confirmed` ของใบ pipeline ที่ยกเลิก (`options.orderCancelled` — ผู้เรียกทั้งสองฝั่งคิดจากใบเดียวกัน)
       · งวดที่รอตรวจ (reported) ยังไม่ใช่เงินที่รับรอง ⇒ ตีกลับแทน · ใบที่ยังเดินอยู่ถอยเงินด้วย "ถอนคำรับรอง"
     ⭐ มีใบกำกับภาษีต้องมีเลขใบลดหนี้ (บริษัทเก็บ VAT — คืนเงินที่ออกใบไปแล้วต้องลดหนี้) · เกณฑ์เดียวกับ CHECK ของ 0378
     ⚠️ ใบย้อนหลังไม่ถึงกิ่งนี้ — ล็อกของใบย้อนหลังที่ยกเลิกแล้วชนะทุกคำสั่ง (orderLock ข้างบน) */
  if (action === 'refund' || action === 'refund-clear') {
    if (!canConfirmPayment(user)) return 'บันทึกคืนเงินได้เฉพาะฝ่ายบัญชี';
    if (!options.orderCancelled) {
      return 'บันทึกคืนเงินได้เฉพาะงวดของใบที่ยกเลิกแล้ว — ใบที่ยังเดินอยู่ใช้ "ถอนคำรับรอง"';
    }
    if (action === 'refund-clear') {
      return installmentRefunded(row) ? null : 'งวดนี้ยังไม่ได้บันทึกคืนเงิน';
    }
    if (installmentRefunded(row)) return 'งวดนี้บันทึกคืนเงินไปแล้ว';
    if (status !== 'confirmed') return 'บันทึกคืนเงินได้เฉพาะงวดที่บัญชีรับรองแล้ว — งวดที่รอตรวจให้ตีกลับแทน';
    return refundValueError(row, options);
  }

  if (action === 'confirm' || action === 'reject') {
    if (!canConfirmPayment(user)) return 'คอนเฟิร์มได้เฉพาะฝ่ายบัญชี';
    if (status !== 'reported') {
      return status === 'confirmed'
        ? 'งวดนี้คอนเฟิร์มไปแล้ว'
        : 'ยังไม่มีการแจ้งชำระให้ตรวจ';
    }
    /* ── ใบงานบริการ: ไม่มีช่วงครอบ = รับรองไม่ได้ (มติผู้ใช้ 2026-08-31) ────
       🔴 **นี่คือการปิดกับดัก ไม่ใช่การเพิ่มขั้นตอน** — เจ้าของช่องช่วงครอบเปลี่ยนมือ
       เป็นบัญชีทันทีที่รับรอง ⇒ ของเดิมรับรองงวดที่ช่วงครอบว่างได้ตามปกติ แล้ว
       ฝ่ายขายที่รู้ข้อมูลก็กรอกไม่ได้อีกเลย · วัดบนฐานจริง 31/08: **SO บริการ 8 ใบ
       มีงวดที่รับรองแล้วโดยไม่มีช่วงครอบสักใบ** — ตกร่องนี้กันหมด
       ⇒ กันที่ปากทาง แทนที่จะเปิดสิทธิ์ให้ฝ่ายขายแก้ของที่รับรองแล้ว (ซึ่งเท่ากับ
         ให้คนที่ได้ประโยชน์ปลดด่านเงินของตัวเอง)
       ⇒ ใบที่ตกร่องไปแล้ว แก้ด้วย "ถอนคำรับรอง" ของบัญชี → งวดกลับเป็น `reported`
         → ฝ่ายขายกรอกช่วงครอบ → บัญชีรับรองใหม่ (ทางนี้มีอยู่แล้ว ไม่ต้องทำเพิ่ม)

       ⚠️ **ตรวจเฉพาะใบที่มีรอบบริการ** — ใบสายสินค้าไม่มีช่วงครอบให้กรอกอยู่แล้ว
       ⚠️ ไม่ส่ง `serviceRounds` มา = **ไม่บล็อก** (ต่างจากด่านอื่นในระบบที่ fail-closed)
          เพราะบล็อกทุกใบเมื่อผู้เรียกลืมส่ง = หยุดการรับเงินทั้งบริษัท ซึ่งแย่กว่ามาก
          ⇒ มีเทสต์ยามบังคับให้ทั้ง route และแผงบนจอส่งค่านี้เสมอ
       ⚠️ ตีกลับ (`reject`) ไม่ติดข้อนี้ — งวดที่ข้อมูลไม่ครบยิ่งต้องตีกลับได้ */
    if (action === 'reject') {
      const reason = String(options.reason || '').trim();
      if (reason.length < MIN_REJECT_REASON) {
        return `ต้องระบุเหตุผลที่ตีกลับอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`;
      }
    }
    return null;
  }

  return 'คำสั่งไม่ถูกต้อง';
}

/* 🚫 `paymentLockReason` (งวดรับรองแล้วห้ามยกเลิกใบ — ทุกงวด) ถูกถอดแล้ว (มติเจ้าของ 24/09 · mig 0387)
   ผู้เรียกคนสุดท้ายคือการยกเลิกใบย้อนหลัง ซึ่งตอนนี้ถาม `historicalCancelBlock` ตัวเดียว (งวดยกมาโมฆะตามใบ · งวดปกติที่มีเงินยังบล็อก)
   · ย้อนการอนุมัติ/ออก Rev. ไม่ถามตั้งแต่ PR1 (งวดย้ายไปใบ Rev.) · ยกเลิกใบ pipeline ไม่ถามตั้งแต่ PR3 (เงินค้างอยู่กับใบ)
   ⚠️ อย่าเขียนด่าน "งวดรับรองแล้วห้าม…" ชุดใหม่ที่นี่ — สองชุดเพี้ยนหากันแน่นอน (ยามที่ salesOrderPayments.test.mjs) */

/* ══ PR1 · ย้อนการอนุมัติ + ออก Rev. ย้ายงวดทั้งแถว (mig 0376 · มติเจ้าของ 23/09) ═════════════════════════
   หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว" — ข้อความทุกบรรทัดข้างล่างพูดตามสิ่งที่ RPC 0376 ทำจริง */

/* Σ งวด ≠ ยอดใบ (เกณฑ์เดียวกับ RPC: |Σ − ยอด| ≥ 0.005) — คืนข้อความไทย หรือ null
   ⭐ route ถามตัวนี้ **ก่อนย้อนการอนุมัติ** ด้วยงวดที่อ่านสด: RPC ออก Rev. ของ 0376 จะ RAISE เมื่อยอดไม่ตรง
     ⇒ ถ้าปล่อยให้ย้อนก่อน ใบค้างที่ approval_revoked (ออก Rev. ไม่ได้ · ยกเลิกไม่ได้ถ้ามีเงินรับแล้ว) = ทางตัน
   ⚠️ ไม่มีงวด = ไม่ตัดสิน (ใบก่อน 0245 ย้ายศูนย์แถวได้) */
export function installmentsTotalMismatch(rows = [], total = 0) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  const sum = list.reduce((acc, r) => acc + (Number(r?.amount) || 0), 0);
  const orderTotal = Number(total) || 0;
  if (Math.abs(sum - orderTotal) < 0.005) return null;
  return `งวดชำระรวม ${fmtMoney(money(sum))} ไม่เท่ายอดใบ ${fmtMoney(orderTotal)} — ย้อนการอนุมัติแล้วจะออก Rev. ไม่ได้ ให้แอดมินตรวจงวดก่อน`;
}

const sumOf = (rows, pick) => money(rows.filter(pick).reduce((acc, r) => acc + (Number(r.amount) || 0), 0));

/* บรรทัดเรื่องเงินของโมดัลยกเลิก **ใบย้อนหลัง** (มติเจ้าของ 24/09 · mig 0387) — ผลที่เกิดจริงในทรานแซกชันเดียวกับการยกเลิก
   · งวดยกมารับรองแล้ว: แถวคงไว้ (ประวัติ) แต่โมฆะตามใบ (installmentVoid) — ไม่ใช่เงินค้าง ใบที่คีย์ใหม่รับรองอีกครั้ง · บอกผู้รับรอง
   · งวดยกมารอตรวจ: trigger ของ 0387 ตีกลับให้ พร้อมเหตุว่าเป็นการยกเลิก (ออกจากคิว + ป้ายเมนูของบัญชี)
   · งวดปกติที่ตรึงยอดแล้วแต่ยังไม่มีเงิน: หลุดจากยอดค้างรับ (กติกา PR0)
   ⚠️ งวดปกติที่มีเงิน/รอตรวจไม่มีบรรทัด — ด่านยกเลิก (historicalCancelBlock) ปิดปุ่มไว้ก่อนเปิดโมดัลแล้ว
   ⚠️ ห้ามมีคำว่าเงินค้าง/ยกเงิน/คืนเงิน — ทางออกชุดนั้นเปิดเฉพาะใบ pipeline (0378) */
function historicalCancelMoneyLines(list) {
  const opening = list.find((r) => isOpeningInstallment(r) && ['confirmed', 'reported'].includes(r.status));
  const open = list.filter((r) => !isOpeningInstallment(r) && isInstallmentFrozen(r)
    && (r.status === 'pending' || r.status === 'rejected'));
  let openingLine = null;
  if (opening?.status === 'confirmed') {
    const by = [String(opening.confirmedByName || '').trim(), opening.confirmedAt ? fmtDate(opening.confirmedAt) : '']
      .filter(Boolean).join(' · ');
    openingLine = `${OPENING_INSTALLMENT_LABEL} ${fmtMoney(opening.amount)} ที่บัญชีรับรองแล้ว${by ? ` (${by})` : ''} เป็นโมฆะตามใบ`
      + ' — ไม่ใช่เงินค้าง ไม่ต้องคืน/ยก · ใบที่คีย์ใหม่ต้องให้บัญชีรับรองงวดยกมาอีกครั้ง';
  } else if (opening) {
    openingLine = `${OPENING_INSTALLMENT_LABEL} ${fmtMoney(opening.amount)} ที่รอบัญชีรับรองออกจากคิวบัญชี`
      + ' (บันทึกว่ายกเลิกตามใบ ไม่ใช่บัญชีตีกลับ)';
  }
  return [
    openingLine,
    open.length ? `งวดที่ยังไม่ชำระ ${open.length} งวด ${fmtMoney(sumOf(open, () => true))} หลุดจากยอดค้างรับ` : null,
  ].filter(Boolean);
}

/**
 * บรรทัดเรื่องเงินของโมดัลบนหน้าใบสั่งขาย — คืน `string[]` (ว่าง = ไม่มีเรื่องเงินให้บอก)
 *
 * @param action 'revoke' (ReasonDialog ย้อนการอนุมัติ) · 'revise' (โมดัลออก Rev.) · 'approve' (บรรทัดเรื่องงวด/บัญชีของโมดัลอนุมัติ)
 *               · 'cancel' (StatusNotice ของโมดัลยกเลิก — เงินค้างจากใบที่ยกเลิก · PR3)
 * @param serviceRounds ใบมีรอบบริการ (`orderHasServiceRounds`) — ด่านเงินของนัดช่างผูกกับใบที่อนุมัติอยู่เท่านั้น
 * @param strandedSources (approve) ใบที่ยกเลิกของดีลเดียวกันที่มีเงินค้าง `[{ orderNumber, amount }]` — เตือนให้ยกเข้าหลังอนุมัติ
 *
 * ⭐ ใช้คำว่า "ย้อนการอนุมัติ" เท่านั้น (workflowVocabulary)
 */
export function salesOrderMoneyOutcome(order, rows = [], action, { serviceRounds = false, strandedSources = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const confirmed = list.filter((r) => r.status === 'confirmed');
  const reported = list.filter((r) => r.status === 'reported');
  if (action === 'revoke') {
    return [
      confirmed.length
        ? `เงินที่บัญชีรับรองแล้ว ${confirmed.length} งวด ${fmtMoney(sumOf(confirmed, () => true))} ยังนับว่ารับแล้ว ไม่ต้องถอนคำรับรอง`
          + ` — ตอนออก Rev. งวดทั้ง ${list.length} งวด (สลิป · ใบกำกับภาษี · ช่วงครอบ) ย้ายไปอยู่กับใบ Rev. บัญชีไม่ต้องรับรองซ้ำ`
        : null,
      reported.length ? `สลิปรอบัญชีตรวจ ${reported.length} งวดยังอยู่ในคิวบัญชีตามปกติ` : null,
      /* มติ D2: ใบที่บัญชีปิดแล้วย้อนได้ · ใบ Rev. ไม่สืบสถานะปิดจากใบเดิม (financeStatus เกิดเป็น NULL) */
      order?.financeStatus === 'approved' ? 'บัญชีปิดใบนี้แล้ว — ใบ Rev. จะกลับเข้าคิวให้บัญชีปิดใหม่' : null,
      /* รอบขายของโซนนับเฉพาะใบ approved ที่ยังไม่ถูกแทน (lib/service/terms.js) */
      serviceRounds ? 'ระหว่างรอ Rev. อนุมัติ ด่านเงินของนัดช่างปิด และต้องผูกโซนกับใบ Rev. ใหม่' : null,
    ].filter(Boolean);
  }
  if (action === 'cancel') {
    /* ⭐ PR3 (mig 0378 · มติ D4): ยกเลิกใบที่มีเงินรับแล้วได้ — เงินอยู่กับใบนี้ต่อ ("เงินค้างจากใบที่ยกเลิก") ไม่หาย
       ไม่ต้องถอนคำรับรอง · ทางออก: ยกเข้าใบใหม่ของดีลเดียวกัน (หลังใบใหม่อนุมัติ) หรือบัญชีบันทึกคืนเงิน
       ⚠️ ใบย้อนหลังพูดคนละชุด (historicalCancelMoneyLines) — ไม่มีเงินค้าง/ยก/คืน · งวดยกมาเป็นโมฆะตามใบ (มติ 24/09)
       ⚠️ "หลุดจากยอดค้างรับ" นับเฉพาะงวดที่ตรึงยอดแล้ว — งวดร่างไม่อยู่ในทะเบียนบัญชีอยู่แล้ว (พูดแล้วเป็นเท็จ) */
    if (isHistoricalOrder(order)) return historicalCancelMoneyLines(list);
    const open = list.filter((r) => isInstallmentFrozen(r) && (r.status === 'pending' || r.status === 'rejected'));
    const prepaid = list.filter(installmentPrepaid);
    const invoices = [...new Set([...confirmed, ...reported]
      .map((r) => String(r.taxInvoiceNo || '').trim()).filter(Boolean))];
    return [
      confirmed.length
        ? `ใบนี้มีเงินรับแล้ว ${fmtMoney(sumOf(confirmed, () => true))} (${confirmed.length} งวด) — ยกเลิกแล้วเงินยังบันทึกอยู่กับใบนี้`
          + ' ไม่หายและไม่ต้องถอนคำรับรอง · บัญชีเห็นในหัวข้อ “เงินค้างจากใบที่ยกเลิก”'
          + ' · ถ้าจะออกใบใหม่ให้ดีลนี้ กด “ยกเงินจากใบที่ยกเลิก” ที่ใบใหม่หลังอนุมัติ · ถ้าคืนเงินลูกค้า บัญชีกด “บันทึกคืนเงิน”'
        : null,
      reported.length ? `สลิปรอบัญชีตรวจ ${reported.length} งวด ${fmtMoney(sumOf(reported, () => true))} ยังอยู่ในคิวบัญชี` : null,
      open.length ? `งวดที่ยังไม่ชำระ ${open.length} งวด ${fmtMoney(sumOf(open, () => true))} หลุดจากยอดค้างรับทันที` : null,
      prepaid.length
        ? `บันทึกการจ่ายไว้ ${prepaid.length} งวด ${fmtMoney(sumOf(prepaid, () => true))} (ยังไม่ถึงบัญชี) — ยกเลิกแล้วงวดเป็นโมฆะ`
          + ' ถ้าลูกค้าจ่ายจริงให้แจ้งใหม่ที่ใบใหม่ของดีลนี้'
        : null,
      invoices.length ? `มีใบกำกับภาษี ${invoices.join(', ')} — ถ้าคืนเงินต้องออกใบลดหนี้` : null,
    ].filter(Boolean);
  }
  if (action === 'revise') {
    if (!list.length) return [];
    const open = sumOf(list, (r) => r.status === 'pending' || r.status === 'rejected');
    return [
      `งวดชำระ ${list.length} งวดย้ายไปใบ Rev. ทั้งชุด (รับแล้ว ${fmtMoney(sumOf(confirmed, () => true))}`
        + ` · รอบัญชีตรวจ ${fmtMoney(sumOf(reported, () => true))} · รอชำระ ${fmtMoney(open)})`
        + ' — ยอดต่องวดคงตามที่ใช้อยู่ รวมที่ปรับหลังอนุมัติ ไม่คำนวณใหม่จาก QT · ใบนี้จะไม่เหลืองวด',
    ];
  }
  if (action === 'approve') {
    /* ⭐ แถวที่ตรึงยอดแล้วบนใบที่ยังไม่อนุมัติ = งวดที่ยกมากับใบ Rev. (0376) ⇒ freezeInstallments ไม่สร้างใหม่ (PR0) */
    const carried = list.length && list.some(isInstallmentFrozen);
    const revisedFrom = String(order?.metadata?.revisedFrom || '').trim();
    const from = revisedFrom ? ` ${revisedFrom}` : 'ใบเดิม';
    const complete = list.length > 0 && confirmed.length === list.length;
    const stranded = (Array.isArray(strandedSources) ? strandedSources : []).filter((src) => src && Number(src.amount) > 0);
    /* 🐞 review MONEY-1: ดีลมีเงินค้าง ⇒ freeze ไม่ยืมสลิปจากเอกสารยืนยันคำสั่งซื้อมาตั้งงวดแรก (borrowConfirmation — route)
       สลิปนั้นมักเป็นมัดจำก้อนเดียวกับเงินค้าง ยืมแล้วยกเงินซ้ำ = นับสองครั้ง ⇒ บอกผลนั้นและทาง "ยกแทนการแจ้ง" ก่อนกด
       · เงินที่ฝ่ายขายบันทึกไว้เองตอนร่าง (prepaid) ยังเข้าคิวบัญชีตามเดิม (เป็นของที่คนบันทึก ไม่ใช่ระบบเดา) — ด่านยกซ้ำ
         (carryDuplicates · RPC 0378 installment_carry_duplicate) บังคับให้บัญชีตีกลับงวดที่ซ้ำก่อนยก */
    const confirmation = orderConfirmationOf(order, order?.quotation);
    const slipSkipped = stranded.length > 0 && !carried && confirmation?.docType === 'payment_slip';
    const prepaid = stranded.length ? list.filter(installmentPrepaid) : [];
    return [
      carried
        ? `ใช้งวดชำระ ${list.length} งวดที่ยกมาจาก${from} (รับแล้ว ${confirmed.length}/${list.length}) — ไม่สร้างใหม่จาก QT`
        : 'สร้างงวดชำระตามแผนการชำระที่ระบุไว้ใน QT',
      complete
        ? 'เก็บเงินครบแล้ว — ใบเข้าคิวปิดใบของบัญชีทันที'
        : 'เปิดขั้นของบัญชีบนใบนี้ — บัญชีปิดใบได้เมื่อเก็บเงินครบทุกงวด',
      /* PR3 (มติ D4): ดีลเดียวกันมีเงินค้างจากใบที่ยกเลิก — ยกเข้าได้หลังอนุมัติ (RPC 0378 รับเฉพาะใบ approved) */
      stranded.length
        ? `ดีลนี้มีเงินค้างจากใบที่ยกเลิก ${stranded.map((src) => `${src.orderNumber} ${fmtMoney(src.amount)}`).join(' · ')}`
          + ' — หลังอนุมัติกด ‘ยกเงินจากใบที่ยกเลิก’ ที่แท็บการชำระ'
        : null,
      slipSkipped
        ? 'ระบบไม่ยกสลิปจากเอกสารยืนยันคำสั่งซื้อมาตั้งเป็นงวดแรกให้ (ดีลนี้มีเงินค้าง — กันมัดจำก้อนเดียวนับสองใบ)'
          + ' — ถ้าสลิปนั้นคือเงินค้างก้อนเดียวกัน ให้ยกเงินแทนการแจ้งชำระ · ถ้าเป็นเงินใหม่ ฝ่ายขายแจ้งชำระงวดแรกเองหลังอนุมัติ'
        : null,
      prepaid.length
        ? `งวดที่บันทึกการจ่ายไว้ตอนร่าง ${prepaid.length} งวด ${fmtMoney(sumOf(prepaid, () => true))} เข้าคิวบัญชีตามเดิม`
          + ' — ถ้าเป็นสลิปเดียวกับเงินค้าง ให้บัญชีตีกลับงวดนั้นก่อนแล้วจึงยกเงิน (ระบบไม่ยอมให้ยกซ้ำกับงวดที่แจ้งไว้)'
        : null,
    ].filter(Boolean);
  }
  throw new Error(`salesOrderMoneyOutcome: ไม่รู้จัก action ${action}`);
}

/* คำอธิบายของโมดัล "ถอนคำรับรองการชำระ" — ผลที่ตรวจได้ ไม่ใช่คำปลอบ
   🐞 คำเดิมสัญญาว่า "ใบนี้จะย้อนการอนุมัติ/ออก Rev. ได้อีกครั้ง" — ตั้งแต่ PR1 งวดที่รับรองแล้วไม่ล็อกสองทางนั้นอีก
   ⭐ ใบบริการ: "จ่ายถึง" คิดด้วย `paidThrough` ตัวเดียวของระบบ (สมมติว่างวดนี้กลับเป็นรอตรวจ) — ขยับเมื่อไรต้องบอก
     เพราะนัดบริการหลังวันนั้นจะลงคิวไม่ได้ทันที · ไม่ขยับ = ไม่พูด */
export function installmentUnconfirmOutcome(row, rows = [], { serviceRounds = false } = {}) {
  const parts = [
    'งวดนี้จะกลับไปเป็น “รอบัญชีตรวจ” — หลักฐานยังอยู่ครบ',
    `ยอดเก็บแล้วของใบลดลง ${fmtMoney(row?.amount)}`,
  ];
  if (serviceRounds && row) {
    const list = Array.isArray(rows) ? rows : [];
    const before = paidThrough(list);
    const after = paidThrough(list.map((r) => (r?.id === row.id ? { ...r, status: 'reported' } : r)));
    if (before !== after) {
      parts.push(after
        ? `“จ่ายถึง” ถอยเป็น ${fmtDate(after)}`
        : '“จ่ายถึง” ว่าง — ยังไม่มีงวดที่รับรองแล้วครอบบริการ');
    }
  }
  return parts.join(' · ');
}

/* ── กู้คืนใบที่ยกเลิก / ลบถาวร เมื่อเงินของใบย้ายออกไปแล้ว (PR3 · mig 0378) ─────────────────────────────────────
   `movedOut` = แถวงวด (ที่ไหนก็ได้) ที่ movedFrom อ้างใบนี้ — `{ id, reason, orderNumber (ใบที่ถืองวดอยู่ตอนนี้) }`
   (store: loadMovedOut · ถามด้วย @> บนดัชนี GIN ของ 0378)
   ⭐ กู้คืน: เงินยกไปใบใหม่แล้ว หรือคืนลูกค้าแล้ว = ใบนี้ไม่ใช่เจ้าของเงินก้อนนั้นอีก ⇒ คืนเป็นร่างไม่ได้ ให้ออกใบใหม่
     (แถวที่ย้ายออกเพราะออก Rev. ไม่นับ — ใบ revised ไม่เคยอยู่ในสถานะยกเลิกให้กู้)
   ⭐ ลบถาวร: มีงวดที่ไหนอ้างใบนี้ (ออก Rev./ยกเงิน) = ลบไม่ได้ — ลบใบแล้ว purgePrivateEvidence กวาดโฟลเดอร์ของใบนี้ทิ้ง
     ซึ่งเป็นที่อยู่ของสลิป/ใบกำกับของงวดที่ย้ายไปแล้ว (หลักฐานเงินหาย — บทเรียน SO-26080125-0) */
export function cancelledMoneyRestoreBlock(rows = [], movedOut = []) {
  const carriedTo = [...new Set((Array.isArray(movedOut) ? movedOut : [])
    .filter((m) => m?.reason === 'carry').map((m) => String(m.orderNumber || '').trim() || 'ใบใหม่'))];
  const refunded = (Array.isArray(rows) ? rows : []).filter(installmentRefunded);
  if (!carriedTo.length && !refunded.length) return null;
  const parts = [
    carriedTo.length ? `ยกไป ${carriedTo.join(', ')} แล้ว` : null,
    refunded.length ? `คืนลูกค้าแล้ว ${refunded.length} งวด` : null,
  ].filter(Boolean).join(' · ');
  return `เงินของใบนี้${parts} — คืนสถานะไม่ได้ ให้ออกใบใหม่`;
}

/* @param subject ใบที่กำลังจะถูกลบ (ค่าตั้งต้น "ใบนี้" = ใบสั่งขาย) — ลบใบเสนอราคาส่ง "ใบสั่งขายของใบเสนอราคานี้" (ใบลูกหายตาม) */
export function movedOutDeleteBlock(movedOut = [], { subject = 'ใบนี้' } = {}) {
  const list = (Array.isArray(movedOut) ? movedOut : []).filter(Boolean);
  if (!list.length) return null;
  const holders = [...new Set(list.map((m) => String(m.orderNumber || '').trim() || 'ใบอื่น'))];
  return `ลบถาวรไม่ได้: งวดชำระ ${list.length} งวดของ ${holders.join(', ')} ย้ายไปจาก${subject} (ออก Rev./ยกเงิน)`
    + ` และยังใช้หลักฐาน (สลิป · ใบกำกับ) ในโฟลเดอร์ของ${subject} — ${subject}เป็นประวัติของเงินก้อนนั้น`;
}

/* สรุป audit ของการออก Rev. จากผล `moved` ของ RPC 0376 — คืน `{ summary, warning }`
   🛑 ไม่มี `moved` = ฐานยังเป็น RPC ตัวก๊อป (ยังไม่รัน 0376) ⇒ งวดถูกก๊อปเป็นแถวค้างรับบนใบ Rev. — ต้องดัง
     (route ใส่ warning ในคำตอบ + audit) · ปกติมาไม่ถึงเพราะ route ย้อนการอนุมัติถามคอลัมน์ movedFrom ก่อนแล้ว */
export const REVISION_MOVE_SCHEMA_MISSING = 'ฐานยังไม่ได้รัน 0376 — แจ้งผู้ดูแลระบบ';

export function revisionAuditSummary({ fromNumber, toNumber, reason, moved } = {}) {
  const base = `ออก Rev. ${fromNumber} → ${toNumber}: ${reason}`;
  if (!moved || typeof moved !== 'object') {
    return { summary: `${base} · ⚠️ ${REVISION_MOVE_SCHEMA_MISSING}`, warning: REVISION_MOVE_SCHEMA_MISSING };
  }
  const count = Number(moved.count) || 0;
  if (!count) return { summary: `${base} · ไม่มีงวดชำระให้ย้าย`, warning: null };
  return {
    summary: `${base} · ย้ายงวดชำระ ${count} งวด (รับแล้ว ${Number(moved.confirmedCount) || 0} งวด`
      + ` ${fmtMoney(moved.confirmedAmount)} · รอบัญชีตรวจ ${Number(moved.reportedCount) || 0} งวด)`,
    warning: null,
  };
}

/**
 * สรุปงวดพอให้ **ตารางรายการ SO** วาดคอลัมน์ "เก็บแล้ว x/y" ได้ (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ `y` มาจากงวดจริงถ้ามี · ถ้ายังไม่เริ่มติดตามใช้ **จำนวนงวดตามแผนของ QT** แทน
 * ไม่งั้นใบร่างจะขึ้นช่องว่างทั้งที่ใบเสนอราคาระบุไว้แล้วว่าแบ่งกี่งวด
 * ⚠️ `tracked:false` = ตัวเลขมาจากแผน ไม่ใช่ของจริง — หน้าเว็บต้องแยกให้ตาเห็น
 * ⚠️ คืนค่าเบา ๆ เท่าที่ตารางใช้ ไม่ใช่ rollup ทั้งก้อน (ลิสต์มีได้หลายร้อยแถว)
 */
export function salesOrderPaymentCell(rows = [], plan = null, todayIso = null, orderTotal = undefined, orderStatus = undefined) {
  // ใบยอด 0 ไม่มีอะไรให้เก็บ — คอลัมน์ว่างดีกว่าขึ้น `0/1` ที่อ่านเหมือนค้างเก็บเงิน
  if (orderTotal !== undefined && paymentNotRequired(orderTotal)) return null;
  /* ใบที่ถูกออก Rev. ทับ (PR1 · mig 0376) — งวดย้ายไปใบ Rev. ทั้งแถวแล้ว ⇒ ถอยไปอ่านแผน QT = "ยังไม่เริ่มติดตาม" ปลอม
     ⚠️ ผู้เรียก (ลิสต์ SO) ต้องส่ง `status` ของใบมา · ไม่ส่ง = พฤติกรรมเดิม */
  if (orderStatus === 'revised') return null;
  /* ใบที่ยกเลิก (review UI-3/UI-4): งวดโมฆะ (pending/rejected) ไม่ใช่ค้างรับ/เลยกำหนด — ตัดด้วยตัวตัดสินเดียวกับทะเบียนบัญชี
     · ไม่เหลืองวดจริง (ยกเงินออกไปหมด · มีแต่งวดโมฆะ) = ไม่มีคอลัมน์งวด — ถอยไปอ่านแผน QT = "ยังไม่เริ่มติดตาม" ปลอม */
  const dead = orderStatus === 'cancelled';
  const list = (Array.isArray(rows) ? rows : []).filter((r) => !installmentVoid(r, { status: orderStatus }));
  if (dead && !list.length) return null;
  if (list.length) {
    /* งวดที่คืนเงินแล้ว (0378) ไม่ใช่ "เก็บแล้ว" และไม่ต้องมีใบกำกับ (review UI-2 — ⚠️ ผู้เรียกต้องเลือก `refundedAt` มาด้วย) */
    const paid = list.filter((r) => r.status === 'confirmed' && !installmentRefunded(r)).length;
    const refunded = list.filter(installmentRefunded).length;
    const stranded = dead ? list.filter((r) => strandedInstallment(r, { status: orderStatus })).length : 0;
    const overdue = list.filter(
      (r) => r.status !== 'confirmed' && r.dueDate && todayIso && String(r.dueDate) < String(todayIso),
    ).length;
    /* ⭐ ใบกำกับภาษี (mig 0348) — **คนละแกนกับเงิน** จึงนับแยก ไม่ใช่ยัดรวมกับ `paid`
       ฐานคือ "งวดที่ต้องมีใบ" = งวดที่แจ้ง/รับรองแล้ว (บริษัทเก็บ VAT ⇒ จ่ายแล้วต้องมีใบ)
       ไม่ใช่จำนวนงวดทั้งใบ — งวดที่ยังไม่ถึงกำหนดจ่ายยังไม่มีเงินให้ออกใบ
       ⚠️ ต้องมี `taxInvoiceNo` ใน `.select()` ของผู้เรียก ไม่งั้นได้ 0 ทุกใบเงียบ ๆ
       ⭐ งวดยกมาของใบย้อนหลังไม่นับ — ใบกำกับของเงินก้อนนั้นออกในระบบเดิมแล้ว (กติกาเดียวกับ `taxInvoicePending`)
         ⚠️ ผู้เรียกต้องเลือก `kind` มาด้วย ไม่งั้นงวดยกมาถูกนับเป็น "ค้างใบกำกับ" ตลอดกาล */
    const needsInvoice = list.filter((r) => ['reported', 'confirmed'].includes(r.status) && !isOpeningInstallment(r)
      && !installmentRefunded(r));
    const invoiced = needsInvoice.filter((r) => String(r.taxInvoiceNo || '').trim()).length;
    return {
      tracked: true,
      paid,
      count: list.length,
      complete: paid === list.length,
      overdue,
      reviewing: list.filter((r) => r.status === 'reported').length,
      rejected: list.filter((r) => r.status === 'rejected').length,
      invoiceNeeded: needsInvoice.length,
      invoiced,
      stranded,
      refunded,
    };
  }
  const planned = paymentScheduleRows(plan).length;
  if (!planned) return null;
  return {
    tracked: false, paid: 0, count: planned, complete: false, overdue: 0, reviewing: 0, rejected: 0,
    invoiceNeeded: 0, invoiced: 0,
  };
}

/**
 * คำอธิบายสถานะการชำระของ **ทั้งใบ** สำหรับตารางรายการ SO (มติผู้ใช้ 2026-08-13)
 *
 * > *"อยากแก้สถานะที่แจ้งให้รายการ SO"* — เดิมคอลัมน์งวดชำระมีแต่ตัวเลข `x/y`
 * ซึ่งบอกว่าเก็บได้กี่งวด แต่ไม่บอกว่า **ตอนนี้ค้างอยู่ที่ใคร** · ใบที่ขึ้น `0/2`
 * เหมือนกันเป๊ะ อาจเป็นได้ทั้ง "ลูกค้ายังไม่จ่าย" กับ "จ่ายแล้วรอบัญชีรับรอง"
 * ซึ่งเป็นงานของคนละฝ่ายกัน
 *
 * ⭐ คืน **เรื่องเดียวที่ด่วนที่สุด** ไม่ใช่ทุกเรื่อง — ช่องในตารางมีที่บรรทัดเดียว
 * และการยัดสองเรื่องลงไปทำให้ไม่มีเรื่องไหนอ่านออก · ลำดับความด่วน:
 *   เลยกำหนด → บัญชีตีกลับ → รอบัญชีรับรอง → เก็บครบแล้ว
 *
 * @returns {{label: string, tone: 'danger'|'warning'|'success'|'idle'}|null}
 *          null = ไม่มีอะไรต้องบอกเพิ่ม (ตัวเลข x/y พอแล้ว)
 */
export function salesOrderPaymentNote(payment) {
  if (!payment) return null;
  // ยังไม่เริ่มติดตาม = ตัวเลขที่เห็นมาจาก **แผนใน QT** ไม่ใช่ของจริง ต้องบอกให้รู้
  if (!payment.tracked) return { label: 'ยังไม่เริ่มติดตาม', tone: 'idle' };
  /* ใบที่ยกเลิก (PR3 · review UI-2): เรื่องเดียวที่ต้องตามคือเงินค้าง · คืนลูกค้าครบแล้ว ≠ "เก็บครบแล้ว" (กติกาเดียวกับ groupNote ของทะเบียน) */
  if (payment.stranded) return { label: `เงินค้าง ${payment.stranded} งวด`, tone: 'warning' };
  if (payment.refunded && payment.refunded === payment.count) return { label: 'คืนเงินแล้ว', tone: 'idle' };
  if (payment.overdue) return { label: `เลยกำหนด ${payment.overdue} งวด`, tone: 'danger' };
  if (payment.rejected) return { label: `บัญชีตีกลับ ${payment.rejected} งวด`, tone: 'danger' };
  if (payment.reviewing) return { label: `รอบัญชีรับรอง ${payment.reviewing} งวด`, tone: 'warning' };
  if (payment.complete) return { label: 'เก็บครบแล้ว', tone: 'success' };
  return { label: 'รอลูกค้าชำระ', tone: 'idle' };
}

/**
 * ใบกำกับภาษีของใบนี้ออกครบหรือยัง — บรรทัดของตารางรายการ SO (มติผู้ใช้ 2026-09-07)
 *
 * > *"ฝั่ง SA จะดูจากระบบบริหารงานขาย รู้ได้ไงว่างวดไหนมีใบกำกับแล้ว"*
 *
 * ⭐ **แยกจาก `salesOrderPaymentNote`** — เงินกับเอกสารเป็นคนละแกนและเดินไม่พร้อมกัน
 * (กติกาเดียวกับที่หน้าทะเบียนของบัญชีแยกเป็นสองคิว) · ยัดรวมบรรทัดเดียวเมื่อไร
 * เรื่องที่ด่วนกว่าจะกลบอีกเรื่องหายทุกครั้ง
 *
 * ⚠️ **เงียบเมื่อยังไม่มีงวดที่ต้องมีใบ** — ใบที่ลูกค้ายังไม่จ่ายสักงวดไม่ใช่ของค้าง
 * เอกสาร · ขึ้นบรรทัดทุกแถวเมื่อไรคอลัมน์นี้จะกลายเป็นเสียงรบกวนทั้งหน้า
 *
 * @returns {{label: string, tone: 'warning'|'success'}|null}
 */
export function salesOrderTaxInvoiceNote(payment) {
  if (!payment?.tracked) return null;
  const needed = Number(payment.invoiceNeeded) || 0;
  if (!needed) return null;
  const invoiced = Number(payment.invoiced) || 0;
  if (invoiced >= needed) return { label: 'ใบกำกับครบ', tone: 'success' };
  return { label: `ใบกำกับ ${invoiced}/${needed}`, tone: 'warning' };
}
