// ── ฝั่ง route ของ "นับ Actual ทั้งใบ / Actual รายงวด" (mig 0412 · docs/so-installment-actual.md) ──────────────
//
// ⭐ ตรรกะล้วนที่ route ของใบสั่งขายใช้ (เทสต์ได้โดยไม่ต้องมีฐาน) — กติกาตัวจริงของแบบการนับอยู่ที่ salesOrderActualMode.js
//   ไฟล์นี้แค่ต่อสายให้ route: แปลงแบบจากคำขอ · จำนวนงวดหลังหยุดยอด (คู่กับ freezeInstallments) · ด่านปุ่มระดับใบ ·
//   สรุปงวดที่ RPC เพิ่งนับ · สถานะ HTTP ของข้อความด่าน · ข้อความ audit
// ⚠️ ไฟล์นี้ไม่แตะฐาน — RPC/การอ่านอยู่ที่ route
import { fmtMoney } from '@/lib/format';
import { isSalesManager } from '@/lib/permissions';
import { isActualOrder } from '@/lib/sales/historicalOrders';
import { documentWorkflowError, workflowErrorMessage } from '@/lib/sales/documentWorkflowErrors';
import {
  ACTUAL_MODE_INSTALLMENT, ACTUAL_MODE_ORDER, INSTALLMENT_ACTUAL_AFTER_COUNT_REST, INSTALLMENT_ACTUAL_START_LEFT_LABEL,
  actualModeEligibility, actualModeOf, installmentActualAutoCounted, installmentActualCountRestDone, installmentActualStartPending,
  isActualMode, isInstallmentActualOrder, salesOrderCountedActual,
} from '@/lib/sales/salesOrderActualMode';
import {
  installmentPrepaid, installmentsFromPaymentPlan, isInstallmentFrozen, paymentNotRequired,
} from '@/lib/sales/salesOrderPayments';

const msg = (code) => workflowErrorMessage(code);
const toCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/**
 * แบบการนับ Actual ที่ส่งมากับคำขออนุมัติ — `{ ok, mode }` หรือ `{ ok: false, error }`
 * ⭐ ไม่ส่ง / ค่าว่าง = 'order' (ค่าตั้งต้นของตัวเลือกในโมดัล — จอรุ่นก่อนฟีเจอร์นี้ส่งมาแบบไม่มีคีย์)
 * ⛔ ค่าอื่นที่ไม่ใช่สองค่านี้ = ปฏิเสธ (ไม่เดาเป็นทั้งใบเงียบ ๆ — ข้อความเดียวกับรหัสของฐาน)
 */
export function parseActualModeInput(value) {
  if (value === undefined || value === null || value === '') return { ok: true, mode: ACTUAL_MODE_ORDER };
  const mode = typeof value === 'string' ? value.trim() : '';
  return isActualMode(mode)
    ? { ok: true, mode }
    : { ok: false, error: msg('sales_order_actual_mode_invalid') };
}

/**
 * จำนวนงวดของใบ **หลัง** `freezeInstallments` ตอนอนุมัติ — คู่กับกิ่งของตัวนั้นทุกกิ่ง (salesOrderInstallmentsStore)
 * ⭐ ด่าน "รายงวดต้องมีอย่างน้อย 2 งวด" ตัดสินก่อนยิง RPC อนุมัติ ⇒ ต้องรู้ว่าตัวหยุดยอดจะทิ้งใบไว้กี่งวด:
 *   · มีแถวตรึงแล้วสักแถว (ทั้งชุด = อนุมัติซ้ำ · บางแถว = งวดที่ยกมากับใบ Rev./แผนที่ปรับแล้ว) = แถวที่มีอยู่ ไม่ตั้งใหม่
 *   · ไม่มีแถวเลย = ตั้งจากแผนของ QT (ใบยอด 0 = ไม่มีงวด)
 *   · แถวร่างจำนวนไม่ตรงแผน + ไม่มีเงินบันทึกไว้ + ไม่มีใบกำกับ = ลบแล้วตั้งใหม่ตามแผน
 *   · ที่เหลือ (จำนวนตรง · หรือมีเงิน/ใบกำกับค้าง) = แถวที่มีอยู่ (ทับยอดรายแถว ไม่เพิ่ม/ลด)
 * ⚠️ แก้กิ่งของ freezeInstallments เมื่อไร ต้องแก้ที่นี่ด้วย (เทสต์ของไฟล์นี้ไล่ทุกกิ่ง)
 */
export function installmentCountAtFreeze(existing = [], { plan = null, totalAmount = null } = {}) {
  const rows = (Array.isArray(existing) ? existing : []).filter(Boolean);
  if (rows.some(isInstallmentFrozen)) return rows.length;
  const planLength = installmentsFromPaymentPlan(plan, totalAmount).length;
  // ensureInstallments → buildInstallmentsForOrder: ใบยอด 0 ไม่มีงวด
  const seeded = paymentNotRequired(totalAmount) ? 0 : planLength;
  if (!rows.length) return seeded;
  const reseed = planLength > 0 && rows.length !== planLength
    && !rows.some(installmentPrepaid) && !rows.some((row) => !!row.taxInvoiceNo);
  return reseed ? seeded : rows.length;
}

/* ด่านเลือก "Actual รายงวด" ตอนอนุมัติ — ข้อความไทยของเหตุ หรือ null (ใบทั้งใบผ่านเสมอ)
   ⭐ ตัวตัดสินคือ actualModeEligibility ตัวเดียวกับตัวเลือกในโมดัล · จำนวนงวดจาก installmentCountAtFreeze
   ⚠️ ฐานตรวจซ้ำแค่ pipeline + ยอด > 0 (sales_order_actual_mode_ineligible) — จำนวนงวดตรวจได้ที่นี่ที่เดียว */
export function actualModeApproveBlock(order, mode, { installmentCount = 0 } = {}) {
  if (mode !== ACTUAL_MODE_INSTALLMENT) return null;
  const { eligible, reason } = actualModeEligibility(order, installmentCount);
  return eligible ? null : reason;
}

/* แบบการนับของใบก่อนหน้า (ใบที่ใบนี้ออก Rev. แทน) — ค่าตั้งต้นของตัวเลือกในโมดัลอนุมัติใบ Rev. (docs: "Rev. = แบบของใบก่อนหน้า")
   ⭐ หาจากสายโซ่ของเลขฐานเดียวกัน (`revisionHistory` ของ GET) — ใบที่ `supersededById` ชี้มาที่ใบนี้ · ไม่มี = null (ไม่ใช่ Rev.) */
export function previousActualModeOf(order, history = []) {
  if (!order?.id) return null;
  const previous = (Array.isArray(history) ? history : [])
    .find((row) => row && row.id !== order.id && row.supersededById === order.id);
  return previous ? actualModeOf(previous) : null;
}

/* ด่านปุ่ม "นับงวด 1" (ทางกู้ของขั้นนับงวดตอนคลิกอนุมัติ · RPC start_sales_order_installment_actual)
   ⭐ ลำดับเดียวกับ RPC: ผู้อนุมัติ → ใบ pipeline ที่อนุมัติอยู่และไม่ถูกแทน → แบบรายงวด · คืน `{ status, error }` หรือ null */
export function actualStartBlocker(order, user) {
  if (!isSalesManager(user?.role)) return { status: 403, error: msg('installment_actual_forbidden') };
  if (!order || !isActualOrder(order) || order.status !== 'approved' || order.supersededById) {
    return { status: 409, error: msg('installment_actual_order_not_approved') };
  }
  if (!isInstallmentActualOrder(order)) return { status: 409, error: msg('installment_actual_order_not_installment') };
  return null;
}

/* สถานะ HTTP ของข้อความด่าน (installmentActionError / countRestBlocker คืนข้อความไทย) — ตรงกับที่ฐานตอบรหัสเดียวกัน
   (documentWorkflowErrors) ⇒ ด่าน JS กับ RPC ตอบสถานะเดียวกัน: ไม่มีสิทธิ์ 403 · ไม่พบ 404 · เหตุผล 400 · ที่เหลือ 409
   ⚠️ ข้อความที่ไม่ใช่ของ 0412 (ล็อกทั้งใบ · ด่านเดิมของงวด) = 400 ตามพฤติกรรมเดิมของ PATCH งวด */
const ACTUAL_CODES = Object.freeze([
  'installment_actual_not_approved', 'installment_actual_order_not_installment', 'installment_actual_order_not_approved',
  'installment_actual_bad_state', 'installment_actual_previous_unconfirmed', 'installment_actual_forbidden',
  'installment_actual_self_approval', 'installment_actual_reason_required', 'installment_actual_stale',
  'installment_actual_not_found', 'installment_actual_unfrozen',
]);
const STATUS_BY_MESSAGE = new Map([
  ...ACTUAL_CODES.map((code) => [msg(code), documentWorkflowError(code).status]),
  // มติข้อ 10: ยื่นงวดบนใบที่กด "นับที่เหลือทั้งหมด" แล้ว (ด่าน JS อย่างเดียว — สถานะของใบไม่ใช่สิทธิ์) = 409
  [INSTALLMENT_ACTUAL_AFTER_COUNT_REST, 409],
]);
export function actualGateStatus(message) {
  return STATUS_BY_MESSAGE.get(message) || 400;
}

/**
 * งวดที่ RPC เพิ่งนับ (start / count_rest) — เทียบ `before` กับ `after` ที่ RPC คืน · `{ count, amount, seqs }`
 * ⭐ ยอด = Σ `actualAmount` (ก่อน VAT) ของงวดที่เพิ่งกลายเป็น approved · บวกเป็นสตางค์ (ไม่มีเศษ float)
 */
export function installmentActualCounted(result) {
  const before = new Map((Array.isArray(result?.before) ? result.before : []).map((row) => [row?.id, row]));
  const rows = (Array.isArray(result?.after) ? result.after : [])
    .filter((row) => row?.actualStatus === 'approved' && before.get(row.id)?.actualStatus !== 'approved')
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  const cents = rows.reduce((sum, row) => sum + Math.max(0, toCents(row.actualAmount)), 0);
  return { count: rows.length, amount: cents / 100, seqs: rows.map((row) => Number(row.seq) || 0) };
}

/**
 * งวดที่ฐานนับให้เอง **ตอน COMMIT** หลังปรับแผน/ยกเงินเข้า (มติข้อ 10 · constraint trigger แบบเลื่อน §5f ของ 0412) — `{ count, amount, seqs }`
 * 🐞 review รอบห้า 27/10: trigger ทำงานตอน COMMIT ⇒ `after` ที่ RPC 0377/0378 คืนถ่าย **ก่อน** นับ — audit ที่ลงภาพนั้นบอกงวดใหม่/งวดที่ยกมา
 *   ว่า "ยังไม่นับ" ทั้งที่ฐาน commit เป็น approved via count_rest (บางครั้งมียอด — ใบ Rev. ที่ยอดสูงกว่าที่นับไว้) โดยไม่มีบรรทัดไหนบอก
 *   ⇒ route อ่านงวดสดหลัง RPC (สถานะที่ commit จริง) แล้วเทียบกับภาพของ RPC ด้วยตัวนับตัวเดียวกับ start/count_rest
 * 🐞 review รอบห้า (ตัวแก้รอบห้า) 27/10: การอ่านสดเป็นคำขอแยกหลัง COMMIT ⇒ ผู้เขียนคนอื่นที่รอล็อกใบอยู่ commit แทรกได้ก่อนอ่าน
 *   (AE Sup อีกคนกด "อนุมัติงวดและนับ Actual" งวดที่ยื่นค้าง — งวดที่ยื่นล็อกจากปรับแผน updatedAt ไม่ขยับ CAS จึงผ่าน · "นับที่เหลือทั้งหมด")
 *   ตัวเทียบเดิมนับ **ทุกแถว** ที่กลายเป็น approved ⇒ สรุป audit ยกการอนุมัติของคนให้ "ระบบนับ Actual อัตโนมัติ (มติข้อ 10)" บนใบที่ไม่เคยกด
 *   นับที่เหลือทั้งหมดเลย ⇒ นับเฉพาะแถวรูปที่ trigger เขียนได้ (installmentActualAutoCounted: approved · via count_rest · ข้อความอัตโนมัติ)
 *   และใบที่ภาพของ RPC ไม่มีงวด via count_rest = ว่างเสมอ (trigger ไม่มีผู้ตัดสินให้ยืม — ผู้เขียนคนอื่นสร้างสัญญาณแทรกไม่ได้
 *   ระหว่างที่ RPC ถือล็อกใบ) · แถวที่คนอื่นเปลี่ยนยังอยู่ครบใน after.installments (ภาพที่ commit) แค่ไม่ถูกยกให้ระบบในสรุป
 * ⚠️ ที่ยังแยกไม่ได้: "นับงวดที่ค้าง" (start บนใบที่มีงวด via count_rest · §6②) เขียนรูปเดียวกับ trigger ทุกช่อง — ถ้ากดแทรกช่องเดียวกันพอดี
 *   สรุปยังยกให้ระบบ (เกิดยาก: ต้องมีขั้นนับตอนอนุมัติ Rev. ค้างอยู่ด้วย · ยอด/สถานะใน after.installments ถูกเสมอ)
 * @param rpcAfter  `result.after` ของ RPC (ก่อน COMMIT)
 * @param committed งวดที่อ่านสดหลัง RPC คืน (loadInstallments)
 */
export function installmentActualAutoCountedAtCommit(rpcAfter, committed) {
  if (!installmentActualCountRestDone(rpcAfter)) return { count: 0, amount: 0, seqs: [] };
  const autoRows = (Array.isArray(committed) ? committed : []).filter(installmentActualAutoCounted);
  return installmentActualCounted({ before: rpcAfter, after: autoRows });
}

/* ท้ายสรุป audit ของปรับแผน/ยกเงินเข้า เมื่อฐานนับงวดให้เองตอน COMMIT (มติข้อ 10) — ไม่มี = '' (สรุปคำเดิมทุกตัวอักษร) */
export function installmentActualAutoCountAuditText(auto) {
  if (!auto?.count) return '';
  return ` · ระบบนับ Actual อัตโนมัติ (มติข้อ 10) ${seqText(auto.seqs)} ${fmtMoney(auto.amount)} (ก่อน VAT)`;
}

/**
 * ผลของขั้น "นับงวด 1" ตอนอนุมัติใบรายงวด (RPC start คืนสำเร็จแล้ว) — `{ counted, startFailed, noRows }`
 * ⭐ ตัดสินจาก `after` (ทุกงวดของใบหลังนับ) **ไม่ใช่จาก count**: ใบ Rev. ที่งวดยกมานับไว้แล้ว start นับ 0 งวดได้ตามจริง
 *   (งวด 1 นับอยู่แล้ว = สำเร็จ) · ไม่มีงวดไหนนับเลยหลังขั้นนี้ = ยังไม่ได้นับงวด 1 ⇒ `startFailed` (จอทักเตือน ไม่ใช่ "นับงวด 1 แล้ว")
 * ⭐ `noRows` = ใบยังไม่มีงวดสักแถว (ตัวหยุดยอดล้มหลังอนุมัติ — best-effort) ⇒ RPC นับ 0 โดยไม่ error · ทางกู้คือ
 *   "เริ่มติดตามการชำระ" ก่อน แล้วค่อย "นับงวด 1" (ปุ่มนั้นโชว์เมื่อใบมีงวดแล้ว) — review 26/10
 */
export function installmentActualStartOutcome(started) {
  const after = Array.isArray(started?.after) ? started.after : [];
  return {
    counted: installmentActualCounted(started),
    startFailed: !after.some((row) => row?.actualStatus === 'approved'),
    noRows: after.length === 0,
  };
}

/**
 * ขั้น "นับงวด 1" **throw** (RPC ล้ม/เน็ตสะดุด) — ตัดสินจากงวดที่อ่านสดหลังล้ม `{ startFailed, noRows, alreadyCounted, leftToCount, counted }`
 * ⭐ review รอบสอง 26/10: ล้ม ≠ ยังไม่มีอะไรนับ — ใบ Rev. ที่งวดยกมานับไว้แล้วไม่เหลืออะไรให้ขั้นนี้นับ ⇒ ตอบสำเร็จ (นับ 0 งวด)
 *   ไม่ทัก "กด ‘นับงวด 1’" ที่ไม่มีปุ่มให้กด · ยังเหลือ = ล้มจริง (`alreadyCounted` = มีงวดนับแล้ว ⇒ จอบอกปุ่ม "นับงวดที่ค้าง")
 * ⚠️ อ่านไม่ขึ้น (`rows` = null) = ถือว่าล้ม (ทางที่ปลอดภัย) · กติกา "งวดที่ค้าง" ตัวเดียวกับปุ่มกู้ (installmentActualStartPending)
 */
export function installmentActualStartRecovery(rows) {
  if (!Array.isArray(rows)) {
    return { startFailed: true, noRows: false, alreadyCounted: false, leftToCount: null, counted: null };
  }
  const list = rows.filter(Boolean);
  const left = installmentActualStartPending(list).length;
  const alreadyCounted = list.some((row) => row?.actualStatus === 'approved');
  if (!list.length) return { startFailed: true, noRows: true, alreadyCounted: false, leftToCount: 0, counted: null };
  if (left > 0 || !alreadyCounted) {
    return { startFailed: true, noRows: false, alreadyCounted, leftToCount: left, counted: null };
  }
  return { startFailed: false, noRows: false, alreadyCounted: true, leftToCount: 0, counted: { count: 0, amount: 0, seqs: [] } };
}

/* ยอด Actual ที่ "หลุดจากยอด" ตอนย้อนการอนุมัติ (ท้ายสรุป audit) — ใบทั้งใบ = ยอดเต็ม (คำเดิมทุกตัวอักษร)
   · ใบรายงวด = เฉพาะที่นับแล้ว (ที่เหลือไม่เคยเข้า Actual) พร้อมยอดเต็มกำกับ — review รอบสอง 26/10 */
export function revokeActualDropText(order) {
  const full = `${fmtMoney(order?.actualAmount)} บาท`;
  return isInstallmentActualOrder(order)
    ? `รายงวด นับแล้ว ${fmtMoney(salesOrderCountedActual(order))} จาก ${fmtMoney(order?.actualAmount)}`
    : full;
}

const seqText = (seqs = []) => (seqs.length ? `งวดที่ ${seqs.join(', ')}` : 'ไม่มีงวดให้นับ');

/* ทางกู้ "นับงวด 1" ตรึงงวดที่ยังไม่ตรึงก่อนนับ (review รอบสาม 26/10) — ตรึงล้ม = ไม่นับ (route ตอบ 500 · กดใหม่ได้) */
export const INSTALLMENT_ACTUAL_FREEZE_FAILED = 'ตรึงงวดชำระไม่สำเร็จ — ยังไม่ได้นับ Actual (กดใหม่อีกครั้ง)';

/* ท้ายสรุป audit ของการอนุมัติใบ — บอกแบบการนับเสมอ (หลักฐานว่าใครเลือกอะไร: ไม่ตรึงลงกระดาษ · ไม่มีคอลัมน์ประวัติ)
   · รายงวด: งวดที่นับทันที (ยอดก่อน VAT) · ขั้นนับล้ม = บอกทางกู้ · ใบยังไม่มีงวด = บอกทางกู้สองขั้น
   · ตัวหยุดยอดล้ม (`freezeFailed` · review รอบสาม 26/10) = ไม่ได้นับ (route ข้ามขั้นนับ) — ทางกู้ "นับงวด 1" ตรึงงวดก่อนนับ */
export function actualModeAuditText(mode, {
  counted = null, startFailed = false, noRows = false, alreadyCounted = false, freezeFailed = false,
} = {}) {
  if (mode !== ACTUAL_MODE_INSTALLMENT) return ' · นับ Actual ทั้งใบ';
  if (startFailed && noRows) {
    return ' · นับ Actual รายงวด — ใบยังไม่มีงวด ยังไม่ได้นับงวดแรก (กด “เริ่มติดตามการชำระ” แล้ว “นับงวด 1” ที่หน้าใบ)';
  }
  if (startFailed && freezeFailed) {
    return ` · นับ Actual รายงวด — ตรึงงวดชำระไม่สำเร็จ ยังไม่ได้นับ (กด “${alreadyCounted ? INSTALLMENT_ACTUAL_START_LEFT_LABEL : 'นับงวด 1'}”`
      + ' ที่หน้าใบ — ตรึงงวดแล้วนับ)';
  }
  if (startFailed && alreadyCounted) {
    return ` · นับ Actual รายงวด — นับงวดที่ค้างตอนอนุมัติไม่สำเร็จ (กด “${INSTALLMENT_ACTUAL_START_LEFT_LABEL}” ที่หน้าใบ)`;
  }
  if (startFailed) return ' · นับ Actual รายงวด — นับงวดแรกไม่สำเร็จ (กด “นับงวด 1” ที่หน้าใบ)';
  if (!counted?.count) return ' · นับ Actual รายงวด — ไม่มีงวดให้นับทันที';
  return ` · นับ Actual รายงวด — นับทันที ${seqText(counted.seqs)} ${fmtMoney(counted.amount)} (ก่อน VAT)`;
}

const ACTION_AUDIT_WORDS = Object.freeze({
  actual_submit: 'ยื่นขอนับ Actual',
  actual_withdraw: 'ดึงคำขอนับ Actual กลับ',
  actual_approve: 'อนุมัตินับ Actual',
  actual_reject: 'ตีกลับคำขอนับ Actual',
});

/* สรุป audit ของงานรายงวด (PATCH /installments) — "<คำ> งวด <n> ของ <SO> [฿ยอด] [: เหตุผล]" */
export function installmentActualAuditSummary(action, { order, row, after = null, reason = '' } = {}) {
  const word = ACTION_AUDIT_WORDS[action] || action;
  const head = `${word} งวด ${row?.seq ?? '?'} ของ ${order?.orderNumber || order?.id || ''}`.trim();
  const amount = action === 'actual_approve' && after
    ? ` ${fmtMoney(after.actualAmount)} (ก่อน VAT)`
    : '';
  const why = action === 'actual_reject' && String(reason || '').trim() ? `: ${String(reason).trim()}` : '';
  return `${head}${amount}${why}`;
}

/* สรุป audit ของปุ่มระดับใบ — "นับงวด 1" (start) · "นับที่เหลือทั้งหมด" (count_rest) */
export function installmentActualOrderAuditSummary(action, { order, counted, reason = '' } = {}) {
  const number = order?.orderNumber || order?.id || '';
  const what = `${seqText(counted?.seqs)} ${fmtMoney(counted?.amount)} (ก่อน VAT)`;
  if (action === 'actual_count_rest') {
    return `นับ Actual ที่เหลือทั้งหมดของ ${number} — ${what}: ${String(reason || '').trim()}`;
  }
  // "งวดที่ค้าง" ไม่ใช่ "งวดแรก" — ปุ่มกู้นับงวดใดก็ได้ที่ขั้นนับตอนอนุมัติยังค้าง (งวด 3 ที่รับรองเงินแล้วบนใบ Rev. · review รอบสาม 26/10)
  return `นับ Actual งวดที่ค้างของ ${number} (ทางกู้หลังอนุมัติ) — ${what}`;
}
