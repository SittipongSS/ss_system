// ── "ชุดเงินเข้า" ของงวด: แจ้งชำระ + สลิป · แนบสลิปเพิ่ม · ดึงการแจ้งกลับ (รื้อ SO + บัญชี PR-5 · มติเจ้าของ 09/11 ข้อ 3) ─────────────
//
// ⭐ ลิ้นชักรายงวดของหน้ารายการใบสั่งขายได้สามปุ่มนี้พร้อมกัน — งานวางแผนงวด (ช่วงบริการ · วันกำหนด · ผูกคำร้อง · ธงก่อนติดตั้ง ·
//   ยื่นนับ Actual) อยู่หน้าใบถาวร
// ⭐ **ด่านคิดที่ server ด้วยตัวเดียวกับ PATCH งวด** (`installmentActionError` + ตัวเลือกชุดเดียวกับ route) แล้วส่งมากับ GET งวด
//   (`moneyIn`) — จอรายการไม่มีใบเต็ม (บรรทัด · สัญญา · ดีล · สวิตช์ก่อนติดตั้ง) ให้คิดเอง · คิดเองที่จอ = ปุ่มบอกอย่าง API บอกอีกอย่าง
// ⚠️ ตัวเลือกของด่าน (`moneyInGateOptions`) ต้องเป็นชุดเดียวกับ literal ใน PATCH ของ `…/installments` — ยาม installmentMoneyIn.test
//   เทียบคีย์ทั้งสองฝั่ง (เพิ่มตัวเลือกใหม่ให้ PATCH แล้วลืมที่นี่ = ปุ่มเปิดแล้ว API ตีกลับ)
import {
  installmentActionError, installmentEvidenceRoom, installmentPrepaid, installmentReportOutcome,
  openingCoverageEnd, pipelineInstallmentLock,
} from '@/lib/sales/salesOrderPayments';
import { historicalInstallmentLock, isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { INSTALLMENT_ACTUAL_CONFIRM_BLOCKED, INSTALLMENT_ACTUAL_REPORT_BLOCKED } from '@/lib/sales/salesOrderActualMode';

export const MONEY_IN_ACTIONS = Object.freeze(['report', 'evidence-add', 'withdraw']);

/* เหตุของด่านที่ "ติดด่าน = โชว์แล้วบอกเหตุ" (กติกาการโชว์ UI) — ใบ Actual รายงวดที่งวดยังไม่อนุมัตินับ · เหตุอื่นของ `report`
   (ไม่มีสิทธิ์ · สถานะใบ · ลำดับงวด) = ไม่โชว์ปุ่ม (กติกาเดียวกับแผงงวดที่ซ่อนปุ่มตาม gate) */
export const MONEY_IN_SHOWN_LOCKS = Object.freeze([INSTALLMENT_ACTUAL_REPORT_BLOCKED, INSTALLMENT_ACTUAL_CONFIRM_BLOCKED]);

/**
 * ตัวเลือกของด่านงวด — ชุดเดียวกับที่ PATCH `…/installments` ส่งให้ `installmentActionError` (ไม่รวมค่าจาก body ของคำขอ)
 * `orderLock` คิดรายคำสั่ง (`historicalInstallmentLock(order) || pipelineInstallmentLock(order, action)`)
 */
/* ⚠️ `serviceRounds` มาจากผู้เรียก (route คิด `orderHasServiceRounds(order, order.lines)` แบบเดียวกับ PATCH) — ตัวตัดสินด่านเงินของใบบริการ
   มีทะเบียนผู้เรียกของมัน (serviceMoneySelectGuard) · ไม่ส่ง = false (ไม่บล็อกการรับรอง — ไม่เกี่ยวกับสามปุ่มนี้ แต่ต้องตรงกับ PATCH) */
export function moneyInGateOptions(order, rows, action, { installStepEnabled = false, serviceRounds = false } = {}) {
  const historical = isHistoricalOrder(order);
  return {
    rows, orderTotal: order?.totalAmount,
    serviceRounds: Boolean(serviceRounds),
    orderLock: historicalInstallmentLock(order) || pipelineInstallmentLock(order, action),
    historical,
    contractEnd: openingCoverageEnd(order, rows),
    orderCancelled: order?.status === 'cancelled' && !historical,
    order, dealOwnerId: order?.deal?.ownerId ?? null,
    installStepEnabled,
  };
}

/**
 * ด่านของสามปุ่มต่องวด สำหรับคนดูคนนี้ — `{ [installmentId]: { report, evidenceAdd, withdraw, outcome, room, prepaid } }`
 * · lock = ข้อความเหตุ (null = กดได้) · `report` ถามด้วยวันจ่าย = วันนี้ (ช่องในโมดัลเริ่มที่วันนี้) · `evidence-add` ถามด้วยไฟล์ 1 ใบ
 * · `outcome` = ปลายทางของการแจ้ง (pending = งวดร่างบันทึกไว้ · reported = ส่งบัญชีตรวจ · confirmed = คนดูรับรองเองในก้าวเดียว)
 */
export function moneyInLocks(order, rows = [], user, { todayIso, installStepEnabled = false, serviceRounds = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const gate = (row, action, extra = {}) => installmentActionError(row, action, user, {
    ...moneyInGateOptions(order, list, action, { installStepEnabled, serviceRounds }), ...extra,
  }) || null;
  return Object.fromEntries(list.map((row) => [row.id, {
    report: gate(row, 'report', { paidOn: todayIso || null }),
    evidenceAdd: gate(row, 'evidence-add', { evidenceCount: 1 }),
    withdraw: gate(row, 'withdraw'),
    outcome: installmentReportOutcome(user, row),
    room: Math.min(8, installmentEvidenceRoom(row)),
    prepaid: installmentPrepaid(row),
  }]));
}

/**
 * ปุ่มของงวดหนึ่งงวดในลิ้นชักฝ่ายขาย — `[{ action, label, tone, lock }]`
 * ⭐ ป้ายชุดเดียวกับแผงงวด: งวดร่าง "บันทึกว่าลูกค้าจ่ายแล้ว" · ตีกลับ "แจ้งใหม่" · ปกติ "แจ้งลูกค้าจ่ายแล้ว" · ดึงกลับของงวดร่าง "ลบบันทึกการจ่าย"
 * ⚠️ คนที่รับรองเองได้ (outcome 'confirmed' — บัญชี/แอดมิน) ไม่ได้ปุ่มแจ้งที่นี่ — นั่นคือ "บันทึกการรับชำระ" ขั้นเดียวซึ่งต้องโชว์ผลลัพธ์
 *   ของการรับรอง ⇒ ทำที่แผงงวดบนหน้าใบ / หน้างานบัญชี (ลิ้นชักนี้เป็นชุดเงินเข้าของฝ่ายขาย)
 * ⚠️ แนบเพิ่ม/ดึงกลับ ซ่อนเมื่อติดด่าน (แผงงวดซ่อนตาม gate เหมือนกัน) · แจ้งชำระที่ติดด่านนับ Actual = โชว์ดับพร้อมเหตุ
 */
export function moneyInButtons(row, entry) {
  if (!row || !entry || row.refunded) return [];
  const out = [];
  const reportable = ['pending', 'rejected'].includes(row.status) && !entry.prepaid;
  if (reportable && entry.outcome !== 'confirmed' && (!entry.report || MONEY_IN_SHOWN_LOCKS.includes(entry.report))) {
    out.push({
      action: 'report',
      label: entry.outcome === 'pending' ? 'บันทึกว่าลูกค้าจ่ายแล้ว' : row.status === 'rejected' ? 'แจ้งใหม่' : 'แจ้งลูกค้าจ่ายแล้ว',
      tone: 'primary',
      lock: entry.report || null,
    });
  }
  if (!entry.evidenceAdd && entry.room > 0) out.push({ action: 'evidence-add', label: 'แนบสลิปเพิ่ม', tone: 'quiet', lock: null });
  if (!entry.withdraw) {
    out.push({ action: 'withdraw', label: entry.prepaid ? 'ลบบันทึกการจ่าย' : 'ดึงกลับการแจ้งชำระ', tone: 'quiet', lock: null });
  }
  return out;
}
