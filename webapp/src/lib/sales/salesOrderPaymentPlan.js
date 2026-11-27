// ── แผนงวดชำระของใบสั่งขายเอง (mig 0441 · มติเจ้าของ 27/11/2026) — logic ล้วน ใช้ทั้งจอและ server ─────────────
//
// ⭐ คำขอ: ปรับแผนงวดได้ตั้งแต่หน้าสร้าง SO และตอนใบเป็นร่าง/ถูกตีกลับ (เดิมช่วง QT Won → SO อนุมัติ แก้ไม่ได้เลย)
//   มติสี่ข้อ: ① หน้าสร้าง + ใบร่าง/ตีกลับ · ยื่นอนุมัติแล้วล็อก ② คนที่แก้ใบร่างได้ (SA เจ้าของใบ + AE Sup/admin)
//   ③ กระดาษ SO พิมพ์แผนของใบ · QT ไม่แตะ · ป้าย "แผนต่างจาก QT" ④ บังคับเหตุผล
// ⭐ **ตัวตัดสิน "แผนของใบ" ตัวเดียว** = `orderPaymentPlan(order)` — แผนของใบ (`sales_orders.paymentPlan`) ถ้ามี ไม่งั้นแผนของ QT
//   ทุกจุดที่เคยอ่าน `order.quotation.paymentPlan` เพื่อคิดงวดของใบ (งวดร่างสด · ตั้งงวดตอนอนุมัติ · ป้ายปรับแผน · กระดาษ)
//   ต้องผ่านตัวนี้ ไม่งั้นงวดที่ปรับไว้ถูกทับกลับเป็นแผน QT ตอนอนุมัติ (freezeInstallments) — ยามอยู่ใน salesOrderPaymentPlan.test.mjs
// ⭐ แผนที่ปรับแล้ว "กลับมาเท่า QT" = ล้างเป็น NULL (ไม่ต้องมีเหตุผล · ป้ายหาย) — แผนของใบมีอยู่ก็ต่อเมื่อต่างจาก QT จริง
import { MAX_INSTALLMENTS, normalizePaymentPlan, validatePaymentPlan } from '@/lib/sales/paymentPlan';
import {
  installmentsFromPaymentPlan, isInstallmentFrozen, paymentNotRequired,
} from '@/lib/sales/salesOrderPayments';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { installmentReplanLock } from '@/lib/sales/installmentReplan';

export const ORDER_PLAN_REASON_MIN = 10;
export const ORDER_PLAN_REASON_MAX = 500;
/* สถานะที่แก้แผนได้ — ตัวเดียวกับ CHECK/trigger ของ 0441 (sales_order_payment_plan_guard) และด่าน "บันทึกร่าง" ของ route */
export const ORDER_PLAN_EDITABLE_STATUSES = Object.freeze(['draft', 'rejected']);

export const ORDER_PLAN_BADGE = 'แผนต่างจาก QT';
export const ORDER_PLAN_SCHEMA_MISSING = 'ฐานยังไม่ได้รัน 0441 (แผนงวดของใบสั่งขาย) — แจ้งผู้ดูแลระบบ';

const cents = (v) => Math.round((Number(v) || 0) * 100);
const text = (v) => String(v ?? '').trim();

/**
 * แผนงวดที่ใบนี้ใช้จริง — แผนของใบ (0441) ถ้ามี ไม่งั้นแผนของใบเสนอราคา
 * @param order      แถว sales_orders (ต้องมี `paymentPlan` — โหลดด้วย `*`)
 * @param quotation  ใบเสนอราคาต้นทาง (ค่าตั้งต้น `order.quotation`) — หน้ารายการที่โหลด QT แยกส่งมาเอง
 */
export function orderPaymentPlan(order, quotation = order?.quotation) {
  const own = order?.paymentPlan;
  if (own && typeof own === 'object') return own;
  return quotation?.paymentPlan ?? null;
}

/** ใบนี้ใช้แผนของตัวเอง (ต่างจาก QT) ไหม — ตัวตัดสินป้าย "แผนต่างจาก QT" */
export const orderHasOwnPlan = (order) => !!(order?.paymentPlan && typeof order.paymentPlan === 'object');

/* งวดสองชุดเท่ากันไหม (ป้าย · ยอด · สัดส่วน · หมายเหตุ) — ตัดสินว่าแผนที่ส่งมา "ยังเท่า QT" */
function sameRows(a, b) {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return text(row.label) === text(other.label)
      && cents(row.amount) === cents(other.amount)
      && Math.round(Number(row.percent) * 100) === Math.round(Number(other.percent) * 100)
      && text(row.note) === text(other.note);
  });
}

/**
 * ปุ่ม "ปรับแผนงวด" ของใบร่าง — `{ visible, blocker }` (กติกา ui-visibility: ไม่เกี่ยว = ซ่อน · ติดด่าน = โชว์แล้วบอกเหตุ)
 * ⭐ ซ่อน: แก้ใบไม่ได้ (`canEdit` จาก server) · ใบย้อนหลัง · ใบที่ไม่ใช่ร่าง/ตีกลับ (ใบอนุมัติแล้วใช้ปุ่มของ 0377) · ใบยอด 0
 * ⭐ โชว์แต่บอกเหตุ: ใบ Rev. ที่มีงวดยกมาจากใบเดิม (แถวตรึงยอดแล้ว = แผนจริงของใบ — ปรับได้หลังอนุมัติ)
 */
export function orderPlanEditBlocker(order, rows = [], { canEdit = false } = {}) {
  if (!canEdit) return { visible: false, blocker: 'ไม่มีสิทธิ์แก้ใบสั่งขายใบนี้' };
  if (isHistoricalOrder(order)) return { visible: false, blocker: 'ใบสั่งขายย้อนหลังแก้งวดที่ฟอร์มคีย์ใบ' };
  if (!ORDER_PLAN_EDITABLE_STATUSES.includes(order?.status)) {
    return { visible: false, blocker: 'ปรับแผนงวดก่อนอนุมัติได้เฉพาะใบร่างหรือใบที่ถูกตีกลับ' };
  }
  if (paymentNotRequired(order?.totalAmount) || !(Number(order?.totalAmount) > 0)) {
    return { visible: false, blocker: 'ใบนี้ยอดรวม 0 บาท — ไม่มีงวดชำระให้ปรับ' };
  }
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.some(isInstallmentFrozen)) {
    return {
      visible: true,
      blocker: 'งวดของใบนี้ยกมาจากใบก่อน Rev. (ตรึงยอดแล้ว) — ปรับได้หลังอนุมัติด้วยปุ่ม "ปรับแผนงวด"',
    };
  }
  return { visible: true, blocker: null };
}

/**
 * ตรวจแผนใหม่ของใบ (หน้าสร้าง + ใบร่าง) — คืน `{ error }` หรือ `{ plan, rows, cleared }`
 *   · `plan` = แผนที่ normalize แล้ว (เก็บลง `sales_orders.paymentPlan`) หรือ `null` เมื่อเท่าแผนของ QT (ล้าง · ไม่ต้องมีเหตุผล)
 *   · `rows` = งวดของแผนที่ได้ (`installmentsFromPaymentPlan`) — ตัวเดียวกับที่ตั้งงวดร่าง
 * ⚠️ งวดร่างที่ "มีเงินหรือมีเอกสารผูก" (installmentReplanLock: หลักฐานจ่าย · ใบกำกับ · คำร้องขอวางบิล) ต้องอยู่ที่เลขงวดเดิม
 *   ยอดเท่าเดิม — หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว" เดียวกับปรับแผนหลังอนุมัติ (0377)
 * @param input `{ plan, reason, total, quotePlan, rows }` — `rows` = งวดร่างที่มีอยู่ (หน้าสร้างส่ง [])
 */
export function orderPlanChange({ plan, reason, total, quotePlan, rows = [] } = {}) {
  const check = validatePaymentPlan(plan);
  if (!check.ok) return { error: check.error };
  const normalized = normalizePaymentPlan(plan, total);
  const nextRows = installmentsFromPaymentPlan(normalized, total);
  if (!nextRows.length) return { error: 'แผนงวดต้องมีอย่างน้อย 1 งวด' };
  if (nextRows.length > MAX_INSTALLMENTS) return { error: `แบ่งงวดได้ไม่เกิน ${MAX_INSTALLMENTS} งวด` };
  const sum = nextRows.reduce((acc, row) => acc + cents(row.amount), 0);
  if (sum !== cents(total)) return { error: 'ยอดรวมทุกงวดไม่เท่ายอดใบ — ตรวจสัดส่วนอีกครั้ง' };

  const bySeq = new Map(nextRows.map((row) => [row.seq, row]));
  for (const row of Array.isArray(rows) ? rows : []) {
    const lock = installmentReplanLock(row);
    if (!lock) continue;
    const next = bySeq.get(Number(row.seq));
    if (!next) return { error: `งวดที่ ${row.seq} ${lock} — ลดจำนวนงวดจนตัดงวดนี้ทิ้งไม่ได้` };
    if (cents(next.amount) !== cents(row.amount)) {
      return { error: `งวดที่ ${row.seq} ${lock} — ยอดต้องเท่าเดิม (${(cents(row.amount) / 100).toFixed(2)} บาท)` };
    }
  }

  const quoteRows = installmentsFromPaymentPlan(quotePlan, total);
  if (sameRows(nextRows, quoteRows)) return { plan: null, rows: nextRows, cleared: true };

  const why = text(reason);
  if (why.length < ORDER_PLAN_REASON_MIN) {
    return { error: `ระบุเหตุผลที่ปรับแผนงวดอย่างน้อย ${ORDER_PLAN_REASON_MIN} ตัวอักษร` };
  }
  if (why.length > ORDER_PLAN_REASON_MAX) return { error: `เหตุผลยาวได้ไม่เกิน ${ORDER_PLAN_REASON_MAX} ตัวอักษร` };
  return { plan: normalized, rows: nextRows, cleared: false, reason: why };
}

/**
 * ชุดคำสั่งให้งวดร่างของใบตรงกับแผนใหม่ — `{ updates, inserts, deletes }` (ผู้เรียกเขียนฐาน · ตัวนี้คำนวณอย่างเดียว)
 *   · แถวที่เลขงวดยังอยู่: ทับ ป้าย/สัดส่วน/ยอด (วัน · ช่วงครอบ · วันวางบิล · หลักฐาน ติดแถวไปตามเดิม)
 *     หมายเหตุ: เติมจากแผนเฉพาะแถวที่ยังว่าง (ของที่คนพิมพ์ไว้ชนะ — กติกาเดียวกับการตั้งใหม่ตอนอนุมัติ)
 *   · เลขงวดใหม่: เพิ่มแถว pending · เลขงวดที่หายไป: ลบ (orderPlanChange กันแถวล็อกไว้ก่อนแล้ว)
 * ⚠️ แถวตรึงยอดแล้วไม่อยู่ในชุดคำสั่ง — orderPlanEditBlocker บล็อกใบแบบนั้นตั้งแต่แรก
 */
export function orderPlanSyncOps(rows = [], planRows = []) {
  const draft = (Array.isArray(rows) ? rows : []).filter((row) => !isInstallmentFrozen(row));
  const bySeq = new Map(draft.map((row) => [Number(row.seq), row]));
  const planSeqs = new Set(planRows.map((row) => row.seq));
  const updates = [];
  const inserts = [];
  for (const next of planRows) {
    const row = bySeq.get(next.seq);
    if (!row) { inserts.push(next); continue; }
    const patch = {};
    if (text(row.label) !== text(next.label)) patch.label = next.label;
    if (Math.round(Number(row.percent) * 100) !== Math.round(Number(next.percent) * 100)) patch.percent = next.percent;
    if (cents(row.amount) !== cents(next.amount)) patch.amount = next.amount;
    if (!text(row.note) && text(next.note)) patch.note = next.note;
    if (Object.keys(patch).length) updates.push({ id: row.id, seq: next.seq, patch });
  }
  const deletes = draft.filter((row) => !planSeqs.has(Number(row.seq))).map((row) => row.id);
  return { updates, inserts, deletes };
}

/** สรุปลง audit/เธรด — "ปรับแผนงวดก่อนอนุมัติ SO-…: 2→3 งวด: เหตุผล" */
export function orderPlanAuditSummary(orderNumber, { beforeCount, afterCount, reason, cleared }) {
  if (cleared) return `กลับไปใช้แผนงวดตามใบเสนอราคา ${orderNumber || ''}`.trim();
  return `ปรับแผนงวดก่อนอนุมัติ ${orderNumber || ''}: ${beforeCount}→${afterCount} งวด: ${text(reason)}`;
}
