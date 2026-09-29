// ── "งวดที่วันจะเปลี่ยน" เมื่อกติกาวางบิลของลูกค้าเปลี่ยน (รุ่นสี่ · system-design §7.1–7.2 · ม็อก recommended.js redateModal) ──
//
// สองขาของจอเดียว:
//   1. `customerRuleChange` — PATCH กติกาลูกค้าตอบ `ruleChange` = งวดเปิดของทุกใบที่ยังมีชีวิตที่วันจะเปลี่ยนตามกติกาใหม่
//      (`planRuleChange` ของ billingRule.js) · **ระบบเสนอ ไม่ย้ายวันเอง** (ไม่มีอะไรเปลี่ยนเงียบ — system-design §5.3)
//   2. `customerRedateCheck` — POST `/billing-rule/redate` ตรวจงวดที่คนเลือก "ใช้วันใหม่" ด้วยด่านของ `schedule-many` ทุกข้อ
//      (ล็อก · `updatedAt` · ด่าน schedule ทีละงวด · validateInstallmentDates กับกติกา **ใหม่**) ครบทุกงวดทุกใบก่อนเขียนงวดแรก
// ⭐ งวดที่ redate จะตีกลับอยู่แล้ว (ล็อกทั้งใบ · ด่าน schedule · ล็อกโหมดตั้งวัน) ย้ายไป `kept` เหตุ 'locked' ตั้งแต่ขา 1
//   ⇒ จอไม่เสนองวดที่กดแล้วได้ 400/409 แน่นอน (ปุ่มกับ API ตอบคำเดียวกัน)
// ⚠️ ตรรกะล้วน — ไม่แตะฐาน (ตัวอ่านอยู่ที่ installmentScheduleServer.js) · ไม่อ่านนาฬิกา
import { planRuleChange } from '@/lib/sales/billingRule';
import { installmentActionError, pipelineInstallmentLock, withLiveAmounts } from '@/lib/sales/salesOrderPayments';
import { historicalInstallmentLock, isHistoricalOrder } from '@/lib/sales/historicalOrders';
import {
  installmentDateLock, scheduleManyCheck, scheduleManyConflictMessage, scheduleManyShapeError,
} from '@/lib/sales/installmentScheduleMany';

/* ล็อกทั้งใบของคำสั่งตั้งวัน — รูปเดียวกับ route งวด (`historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'schedule')`) */
export const orderScheduleLock = (order) => historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'schedule');

/* ตัวเลือกของด่าน `schedule` — ด่านนี้อ่านแค่ล็อกทั้งใบ · งวดยกมาของใบย้อนหลัง · สิทธิ์ · สถานะ
   ⚠️ ไม่ส่ง `serviceRounds`/`contractEnd` โดยตั้งใจ — สองค่านั้นเป็นของด่านรับรอง/ช่วงครอบ ไม่ใช่ของ `schedule` */
export const scheduleGateOptions = (order, rows) => ({
  rows,
  orderTotal: order?.totalAmount,
  orderLock: orderScheduleLock(order),
  historical: isHistoricalOrder(order),
  orderCancelled: order?.status === 'cancelled' && !isHistoricalOrder(order),
});

/* งวดของใบในรูปที่จอเห็น — งวดร่างของใบ pipeline เดินตามแผน QT สด ๆ (ตัวเดียวกับ route งวด · ใบย้อนหลังไม่ทับ) */
export const installmentsForScreen = (order, rows) => (isHistoricalOrder(order)
  ? rows
  : withLiveAmounts(rows, order?.quotation?.paymentPlan, order?.totalAmount));

const orderCode = (order) => String(order?.orderNumber || '').trim() || String(order?.id || '');
const rowFacts = (row, order) => ({
  salesOrderId: order.id,
  salesOrderCode: orderCode(order),
  label: row?.label ?? null,
  amount: Number(row?.amount) || 0,
});

/**
 * ขา 1 — งวดที่วันจะเปลี่ยนเมื่อกติกาเปลี่ยนจาก `before` เป็น `after` (ค่าดิบ · ทุกรุ่น)
 * @param bundle ผลของ `loadCustomerOrdersBundle` — `{ orders, hidden, installments, requestedIds }`
 * @param user   คนที่บันทึกกติกา (ด่าน schedule ทีละงวด — งวดที่เขากดใช้วันใหม่ไม่ได้ไปอยู่ `kept`)
 * @param holidays วันหยุดในระบบ (Set/Map · `holidaySet`) — วันวางบิลที่เสนอของเครดิต N ถอยข้ามวันหยุดชุดเดียวกับชิปบนใบ/การ์ด/กระดิ่ง
 * @returns `{ rows, kept, same, hiddenOrders }`
 *   rows: `planRuleChange().rows` + `{ salesOrderId, salesOrderCode, label, amount, updatedAt }` (ป้อน redate ตรง ๆ)
 *   kept: `planRuleChange().kept` + ใบ + `'locked'` (`lock` = เหตุ) · same: งวดเปิดที่วันเท่าเดิม (ป้าย "วันเท่าเดิม N งวด")
 *   hiddenOrders: ใบของลูกค้าที่คนนี้มองไม่เห็น (ไม่อ่านงวด)
 */
export function customerRuleChange(before, after, bundle, user, { holidays = null } = {}) {
  const rows = [];
  const kept = [];
  const same = [];
  const byOrder = groupByOrder(bundle?.installments);
  const requestedIds = bundle?.requestedIds || new Set();
  for (const order of sortedOrders(bundle?.orders)) {
    const live = byOrder.get(order.id) || [];
    if (!live.length) continue;
    const plan = planRuleChange(before, after, live, { requestedIds, holidays });
    const byId = new Map(live.map((row) => [row.id, row]));
    const options = scheduleGateOptions(order, live);
    const touched = new Set();
    for (const change of plan.rows) {
      const row = byId.get(change.id);
      touched.add(change.id);
      const lock = options.orderLock
        || installmentActionError(row, 'schedule', user, options)
        || installmentDateLock(row, { order, requested: requestedIds.has(row.id) });
      if (lock) {
        kept.push({ id: row.id, seq: row.seq, reason: 'locked', lock, ...rowFacts(row, order) });
        continue;
      }
      rows.push({ ...change, ...rowFacts(row, order), updatedAt: row.updatedAt ?? null });
    }
    for (const hold of plan.kept) {
      touched.add(hold.id);
      kept.push({ ...hold, ...rowFacts(byId.get(hold.id), order) });
    }
    for (const row of live) {
      if (touched.has(row.id) || installmentDateLock(row, { order, requested: requestedIds.has(row.id) })) continue;
      same.push({
        id: row.id, seq: row.seq, ...rowFacts(row, order),
        billingDate: row.billingDate ?? null, billingEvent: row.billingEvent ?? null, dueDate: row.dueDate ?? null,
        billingSkip: row.billingSkip === true,
      });
    }
  }
  return { rows, kept, same, hiddenOrders: Number(bundle?.hidden) || 0 };
}

/* รูปคำขอของ redate — แถวละ `{ id, billingDate, dueDate, updatedAt }` (ตัวตรวจรูปของ schedule-many + ต้องมีคีย์วันอย่างน้อยหนึ่ง)
   ⚠️ รับแค่สองช่องวัน — ติ๊ก/รอเหตุการณ์/ยืนยันข้อยกเว้นไม่ใช่เรื่องของจอนี้ (มีทางของมันบนใบ) · คีย์อื่นถูกทิ้ง ไม่ส่งต่อ */
export function redateShapeError(sent) {
  const shape = scheduleManyShapeError(sent);
  if (shape) return shape;
  for (const item of sent) {
    if (!Object.hasOwn(item, 'billingDate') && !Object.hasOwn(item, 'dueDate')) return 'ไม่ได้ส่งวันใหม่ของงวดมา — โหลดหน้าใหม่แล้วลองอีกครั้ง';
  }
  return null;
}
const redateItem = (item) => {
  const out = { id: item.id.trim(), updatedAt: item.updatedAt };
  if (Object.hasOwn(item, 'billingDate')) out.billingDate = item.billingDate ?? null;
  if (Object.hasOwn(item, 'dueDate')) out.dueDate = item.dueDate ?? null;
  return out;
};

/**
 * ขา 2 — ตรวจงวดที่คนเลือก "ใช้วันใหม่" ทุกใบก่อนเขียนงวดแรก (ทั้งหมดหรือไม่มีเลยในขั้นตรวจ)
 * @param customerId ลูกค้าของ route — งวดของใบลูกค้าอื่น (ใบถูกย้ายลูกค้าระหว่างเปิดจอ) = 409
 * @param bundle ผลของ `loadRedateBundle` (มี `sentRows`)
 * @param rule   กติกา **ใหม่** ของลูกค้า (อ่านสดหลังบันทึก) · `ruleUnavailable` · `skipReady`
 * @returns `{ plans: [{ order, live, rows }] }` (เรียงตามเลขใบ · rows = ของ scheduleManyCheck)
 *   | `{ error, status, conflicts? }` — 403 งวดของใบที่มองไม่เห็น · 409 `conflicts: [{ id, seq, salesOrderId, salesOrderCode, reason }]` ·
 *     400/503 ข้อความแรกที่เจอ นำหน้าด้วยเลขใบ
 */
export function customerRedateCheck({ customerId, bundle, sent, user, rule = null, ruleUnavailable = false, skipReady = false }) {
  const shape = redateShapeError(sent);
  if (shape) return { error: shape, status: 400 };
  const orderById = new Map((bundle?.orders || []).map((order) => [order.id, order]));
  const byOrder = groupByOrder(bundle?.installments);
  const sentRows = bundle?.sentRows || new Map();

  const conflicts = [];
  const groups = new Map();
  for (const raw of sent) {
    const item = redateItem(raw);
    const row = sentRows.get(item.id);
    if (!row) {
      conflicts.push({ id: item.id, seq: null, salesOrderId: null, salesOrderCode: '', reason: 'มีงวดที่ไม่อยู่แล้ว (อาจถูกปรับแผนงวด)' });
      continue;
    }
    const order = orderById.get(row.salesOrderId);
    if (!order) return { error: 'มีงวดของใบสั่งขายที่คุณไม่มีสิทธิ์ดู — จัดวันใหม่ได้เฉพาะใบที่เห็น', status: 403 };
    if (String(order.customerId || '') !== String(customerId || '')) {
      conflicts.push({ id: row.id, seq: row.seq, salesOrderId: order.id, salesOrderCode: orderCode(order), reason: 'ใบนี้ไม่ใช่ของลูกค้ารายนี้แล้ว' });
      continue;
    }
    if (!groups.has(order.id)) groups.set(order.id, []);
    groups.get(order.id).push(item);
  }

  const plans = [];
  let firstError = null;
  for (const order of sortedOrders([...groups.keys()].map((id) => orderById.get(id)))) {
    const live = byOrder.get(order.id) || [];
    const options = scheduleGateOptions(order, live);
    const items = groups.get(order.id);
    const tag = (c) => ({ ...c, salesOrderId: order.id, salesOrderCode: orderCode(order) });
    if (options.orderLock) {
      for (const item of items) conflicts.push(tag({ id: item.id, seq: sentRows.get(item.id)?.seq ?? null, reason: options.orderLock }));
      continue;
    }
    const built = scheduleManyCheck(live, items, {
      order, requestedIds: bundle?.requestedIds || new Set(), rule, ruleUnavailable, skipReady,
      gate: (row) => installmentActionError(row, 'schedule', user, options),
    });
    if (built.status === 409) {
      for (const c of built.conflicts || []) conflicts.push(tag(c));
      continue;
    }
    if (built.error) {
      if (!firstError) firstError = { error: `${orderCode(order)} ${built.error}`, status: built.status };
      continue;
    }
    if (built.rows.length) plans.push({ order, live, rows: built.rows });
  }
  /* ของเปลี่ยนใต้มือตอบก่อน (คนต้องโหลดใหม่ก่อน) — ลำดับเดียวกับ scheduleManyCheck · บอกทุกงวดไม่ใช่แค่งวดแรก */
  if (conflicts.length) {
    /* ประโยคเดียวกับ schedule-many + เลขใบในวงเล็บ (จอนี้รวมหลายใบ — "งวดที่ 2" เฉย ๆ ไม่รู้ว่าใบไหน) */
    const withOrder = conflicts.map((c) => ({
      seq: c.seq == null ? null : `${c.seq}${c.salesOrderCode ? ` (${c.salesOrderCode})` : ''}`,
      reason: c.reason,
    }));
    return { error: scheduleManyConflictMessage(withOrder), status: 409, conflicts };
  }
  if (firstError) return firstError;
  return { plans };
}

function groupByOrder(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.salesOrderId) continue;
    if (!map.has(row.salesOrderId)) map.set(row.salesOrderId, []);
    map.get(row.salesOrderId).push(row);
  }
  for (const list of map.values()) list.sort((a, b) => Number(a.seq) - Number(b.seq));
  return map;
}
const sortedOrders = (orders = []) => [...(orders || [])].filter(Boolean)
  .sort((a, b) => orderCode(a).localeCompare(orderCode(b)));
