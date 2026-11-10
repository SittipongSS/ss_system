/* ── ก้อนเงินรายใบสั่งขาย (รื้อหน้ารายการ SO + โมดูลบัญชี · มติเจ้าของ 09/11/2026 · PR-1) ─────────────────────────
   แถวเดียวที่ฝ่ายขายกับบัญชีเห็นเหมือนกัน: ยอดจ่าย (รวม VAT / ก่อน VAT) · เก็บแล้ว · รอบัญชีตรวจ · ค้าง · ชิปรายงวด · งวดถัดไป
   (ม็อก mockups/so-finance-list · แผน PLAN.md) — ไฟล์นี้คิดตัวเลขอย่างเดียว ไม่แตะจอ

   ⭐ ใช้กติกาชุดเดียวกับ `salesOrderPaymentCell` (ตัวนับ "x/y งวด" เดิม) ทุกข้อ ไม่ตั้งกติกาใหม่:
     · งวดโมฆะของใบที่ตายแล้ว (`installmentVoid`) ไม่อยู่ในชิป/ยอด
     · ใบยกเลิก: เงินที่ยังอยู่กับใบ = "เงินค้าง" (`strandedInstallment`) ไม่ใช่ "เก็บแล้ว" ของใบ
     · งวดที่บัญชีบันทึกคืนเงินแล้ว (`installmentRefunded`) ไม่นับเก็บแล้ว
     · ใบยอด 0 (`paymentNotRequired`) และใบที่ถูกออก Rev. ทับ (`revised`) = ไม่มีก้อนเงิน (null)
   ⭐ "เก็บแล้ว" = เฉพาะงวดที่บัญชีรับรอง (มติข้อ 1 · 09/11) · งวดที่ฝ่ายขายแจ้งแล้วรอบัญชีตรวจแยกไว้ใน `reviewing`
   ⭐ ยอดจ่ายก่อน VAT = `totalAmount − vatAmount` (คอลัมน์ของใบเอง · ไม่คูณ/หาร 1.07 เดา) — คนละตัวกับ Actual
     (`actualAmount` · ใบสรรพสามิต/ย้อนหลังไม่นับ Actual แต่ยังมียอดจ่ายที่ต้องตามเก็บ)
   ⚠️ ผู้เรียกต้องเลือกคอลัมน์งวด `id, seq, status, kind, amount, "dueDate", "paidOn", "taxInvoiceNo", "refundedAt", "frozenAt",
     "updatedAt"` มาด้วย — ขาด `amount` = ยอดเป็น 0 เงียบ ๆ · ขาด `frozenAt` = งวดของใบที่อนุมัติแล้วกลายเป็น "ตามแผน" ทั้งหมด */
import { INSTALLMENT_STATUS_LABELS, installmentRefunded, installmentVoid, paymentNotRequired, strandedInstallment } from '@/lib/sales/salesOrderPayments';
import { computeInstallments, paymentScheduleRows } from '@/lib/sales/paymentPlan';
import { isOpeningInstallment } from '@/lib/sales/historicalOrders';

/* ชนิดของชิปงวด — สถานะในฐาน + สองชนิดที่คิดจากบริบท (เลยกำหนด · ตามแผน) */
export const INSTALLMENT_CHIP_KINDS = Object.freeze([
  'confirmed', 'reported', 'pending', 'overdue', 'rejected', 'plan', 'prepaid', 'refunded',
]);

/* คำบนชิป/ทูลทิป — ห้าตัวยืมป้ายกลางของงวด (INSTALLMENT_STATUS_LABELS) ไม่ตั้งคำใหม่ */
export const INSTALLMENT_CHIP_LABELS = Object.freeze({
  confirmed: INSTALLMENT_STATUS_LABELS.confirmed,
  reported: INSTALLMENT_STATUS_LABELS.reported,
  pending: INSTALLMENT_STATUS_LABELS.pending,
  overdue: 'เลยกำหนด',
  rejected: INSTALLMENT_STATUS_LABELS.rejected,
  plan: 'ตามแผน (ใบยังไม่อนุมัติ)',
  prepaid: INSTALLMENT_STATUS_LABELS.prepaid,
  refunded: INSTALLMENT_STATUS_LABELS.refunded,
});

const cents = (v) => Math.round((Number(v) || 0) * 100);
const baht = (c) => c / 100;
const text = (v) => String(v ?? '').trim();

/* วันระหว่างสองวัน (YYYY-MM-DD) — นับแบบปฏิทิน ไม่สนเวลา/เขตเวลา (ทั้งสองค่าเป็นวันไทยอยู่แล้ว) */
function daysBetween(fromIso, toIso) {
  const a = Date.UTC(...text(fromIso).slice(0, 10).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...text(toIso).slice(0, 10).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

/**
 * ชนิดชิปของงวดหนึ่งแถว
 * · คืนเงินแล้ว > ยังไม่ตรึง (ใบยังไม่อนุมัติ: จ่ายมาแล้ว = prepaid · ยังไม่จ่าย = plan) > สถานะในฐาน
 * · `pending` ที่เลยกำหนด (dueDate < วันนี้) = overdue — ขอบเดียวกับตัวนับ `overdue` ของ salesOrderPaymentCell
 * ⚠️ prepaid ที่นี่ตัดสินจาก `paidOn` อย่างเดียว (ลิสต์ไม่ลาก evidence มา) — งวดร่างที่มีวันจ่ายแต่ไม่มีสลิปเกิดไม่ได้จากปุ่ม
 *   (แจ้งชำระต้องแนบหลักฐาน) · ตัวเต็มที่ดูสลิปด้วยคือ `installmentDisplayStatus` ของแผงงวด
 */
export function installmentChipKind(row, { todayIso = null } = {}) {
  if (!row) return 'pending';
  if (installmentRefunded(row)) return 'refunded';
  if (!row.frozenAt) return text(row.paidOn) ? 'prepaid' : 'plan';
  const status = row.status || 'pending';
  if (status === 'pending' && text(row.dueDate) && todayIso && text(row.dueDate) < text(todayIso)) return 'overdue';
  return INSTALLMENT_CHIP_KINDS.includes(status) ? status : 'pending';
}

/**
 * ก้อนเงินของหนึ่งใบสำหรับแถวในรายการ SO / งานบัญชี
 * @param rows  งวดของใบ (ทุกแถว รวมโมฆะ — ตัดเองข้างใน)
 * @param order แถวใบ: `status` `totalAmount` `vatAmount`
 * @param opts  `plan` = paymentPlan ของ QT (ใช้เมื่อใบยังไม่มีงวดเลย) · `todayIso` = วันไทย YYYY-MM-DD
 * @returns null (ใบไม่มีเรื่องเงินให้ติดตาม) หรือ
 *   { payable, payableNet, collected, reviewing, stranded, outstanding, overdue: { count, amount }, next, installments, tracked }
 *   · `outstanding` = null เมื่อใบยังไม่อนุมัติ/ยกเลิก (ยังไม่ใช่หนี้ที่ต้องตาม)
 *   · `next` = { seq, dueDate, overdueDays } งวดที่เลยกำหนดเก่าสุด หรือ { seq, dueDate } งวดรอชำระถัดไป · null = ไม่มี
 */
export function salesOrderMoneyCell(rows = [], order = {}, { plan = null, todayIso = null } = {}) {
  const status = order?.status;
  if (status === 'revised') return null;
  if (order?.totalAmount !== undefined && order?.totalAmount !== null && paymentNotRequired(order.totalAmount)) return null;

  const payableC = cents(order?.totalAmount);
  const vatC = cents(order?.vatAmount);
  const dead = status === 'cancelled';
  const live = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && !installmentVoid(r, { status }))
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  if (dead && !live.length) return null;

  let installments;
  let tracked = true;
  if (live.length) {
    installments = live.map((r) => ({
      id: r.id ?? null,
      seq: Number(r.seq) || null,
      kind: installmentChipKind(r, { todayIso }),
      status: r.status || 'pending',
      amount: baht(cents(r.amount)),
      dueDate: text(r.dueDate) || null,
      paidOn: text(r.paidOn) || null,
      taxInvoiceNo: text(r.taxInvoiceNo) || null,
      opening: isOpeningInstallment(r),
      updatedAt: r.updatedAt ?? null,
    }));
  } else {
    /* ใบที่ยังไม่มีแถวงวดเลย — ชิปตามแผนใน QT (ยอดแบ่งด้วยตัวคำนวณเดียวกับตอนสร้างงวดจริง) */
    const schedule = paymentScheduleRows(plan);
    if (!schedule.length) return null;
    tracked = false;
    installments = computeInstallments(baht(payableC), schedule).map((r) => ({
      id: null, seq: r.no, kind: 'plan', status: 'pending', amount: r.amount, dueDate: null, paidOn: null,
      taxInvoiceNo: null, opening: false, updatedAt: null, label: r.label || null,
    }));
  }

  const sumC = (list) => list.reduce((s, r) => s + cents(r.amount), 0);
  const confirmed = live.filter((r) => r.status === 'confirmed' && !installmentRefunded(r));
  const reported = live.filter((r) => r.status === 'reported' && !installmentRefunded(r));
  const collectedC = dead ? 0 : sumC(confirmed);
  const reviewingC = dead ? 0 : sumC(reported);
  const strandedC = dead ? sumC(live.filter((r) => strandedInstallment(r, { status }))) : 0;

  const overdueRows = installments.filter((i) => i.kind === 'overdue');
  const oldestOverdue = overdueRows.slice().sort((a, b) => text(a.dueDate).localeCompare(text(b.dueDate)))[0];
  const nextPending = installments
    .filter((i) => i.kind === 'pending')
    .sort((a, b) => (text(a.dueDate) || '9999').localeCompare(text(b.dueDate) || '9999') || (a.seq || 0) - (b.seq || 0))[0];
  let next = null;
  if (oldestOverdue) next = { seq: oldestOverdue.seq, dueDate: oldestOverdue.dueDate, overdueDays: daysBetween(oldestOverdue.dueDate, todayIso) };
  else if (nextPending) next = { seq: nextPending.seq, dueDate: nextPending.dueDate };

  return {
    tracked,
    payable: baht(payableC),
    payableNet: baht(payableC - vatC),
    collected: baht(collectedC),
    reviewing: baht(reviewingC),
    stranded: baht(strandedC),
    outstanding: status === 'approved' ? baht(Math.max(0, payableC - collectedC)) : null,
    overdue: { count: overdueRows.length, amount: baht(sumC(overdueRows)) },
    next,
    installments,
  };
}
