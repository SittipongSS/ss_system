// ── ตัวติดป้าย "ใบที่ถือโซนไว้แต่ยังไม่เปิดงานบริการ" (PR-C · C-D17) — ตรรกะล้วน ฝั่ง server ─────────────
//
// ⭐ **ตัวติดป้ายตัวเดียว สามผิว** — ป้ายบนแถวโซน (R1) · คำเตือนตอนปิดใช้งานโซน · ชิปใบสั่งขายบนด่านนัด (D15)
//   ถามสถานะจากที่นี่ที่เดียว · ข้อความมาจาก `zoneSetupOrderText.js` (ไฟล์ไม่มี import — จอ import ไฟล์นั้นตรง)
//
// 🔑 **ลำดับการตรวจ: สถานะก่อน ตราประทับทีหลัง** (critique M4) — ย้อนการอนุมัติไม่ล้าง `serviceTermsOpenedAt`
//   (มีแค่คืนร่างที่ล้าง · sales-orders/[id]/route.js) ⇒ ถามตราก่อน = ใบที่ย้อนแล้วหลุดป้ายเงียบ ๆ
//   ทั้งที่โซนยังถูกใบนั้นถืออยู่และจะยื่นใหม่ได้
//   (1) ร่าง · รออนุมัติ · ตีกลับ · ย้อนการอนุมัติแล้ว → กลุ่ม "ยังไม่อนุมัติ" (ป้ายสถานะของระบบ `SALES_ORDER_STATUS_LABELS`)
//   (2) อนุมัติแล้ว · ไม่ถูก Rev. ทับ · ยังไม่ประทับ · ไม่ใช่ใบย้อนหลัง → กลุ่ม "ตั้งย้อนหลัง" (สถานะการตั้งย้อนหลัง)
//       · ใบที่เปิดแก้งานบริการหลังอนุมัติ (mig 0396 · `serviceSetupReopened`) → กลุ่ม "แก้หลังอนุมัติ" (ป้าย "ฝ่ายขายกำลังแก้" ฯลฯ)
//         คำเดียวกับแท็บ TS "รอฝ่ายขายตั้งงานบริการ (ใบเดิม)" — ใบเดียวกันต้องไม่ถูกเล่าสองแบบ (ตรวจทาน ui-zone-chip-reopened-label)
//   (3) ที่เหลือ (ยกเลิก · ออก Rev. แล้ว · ประทับแล้ว · ใบย้อนหลังที่อนุมัติแล้ว) → ไม่มีป้าย
import { SALES_ORDER_STATUS_LABELS } from '@/lib/sales/salesOrderWorkflow';
import { SERVICE_BACKFILL_STATE_LABELS, SERVICE_REOPENED_TEXT, serviceBackfillState, serviceSetupReopened } from '@/lib/sales/serviceSetup';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { SETUP_ORDER_GROUP } from '@/lib/service/zoneSetupOrderText';

export { pendingOrderTagText, setupOrderChipText, zoneDeactivateWarning } from '@/lib/service/zoneSetupOrderText';

/* สถานะของใบที่ยังไม่ผ่านการอนุมัติ — ใบพวกนี้ยังแก้/ยื่นใหม่ได้ ⇒ โซนที่มันเลือกไว้ยังถูกถืออยู่ */
const UNAPPROVED_STATUSES = ['draft', 'pending_approval', 'rejected', 'approval_revoked'];

/**
 * สถานะการตั้งงานบริการของใบที่ถือโซนไว้ — `{ group, key, label } | null`
 * @param order แถว sales_orders ที่มี `status, supersededById, serviceTermsOpenedAt, serviceSetupState, origin, serviceSetupReopenedAt`
 */
export function setupOrderState(order) {
  if (!order) return null;
  if (UNAPPROVED_STATUSES.includes(order.status)) {
    return { group: SETUP_ORDER_GROUP.unapproved, key: order.status, label: SALES_ORDER_STATUS_LABELS[order.status] };
  }
  if (order.status === 'approved' && !order.supersededById && !order.serviceTermsOpenedAt && !isHistoricalOrder(order)) {
    /* มีรายการโซนของใบนี้อยู่แล้ว (เราเจอมันจาก sales_order_line_zones) = ฝ่ายขายเริ่มตั้งแล้ว ⇒ ไม่มีวัน "ยังไม่เริ่ม" */
    const key = serviceBackfillState(order, { hasDraftData: true });
    if (serviceSetupReopened(order)) return { group: SETUP_ORDER_GROUP.reopened, key, label: SERVICE_REOPENED_TEXT.stateLabel(key) };
    return { group: SETUP_ORDER_GROUP.backfill, key, label: SERVICE_BACKFILL_STATE_LABELS[key] };
  }
  return null;
}

const GROUP_RANK = { [SETUP_ORDER_GROUP.unapproved]: 0, [SETUP_ORDER_GROUP.backfill]: 1, [SETUP_ORDER_GROUP.reopened]: 2 };
const lookup = (source, id) => (source instanceof Map ? source.get(id) : source?.[id]);

/**
 * ใบที่ถือแต่ละโซนไว้ — `Map<zoneId, Chip[]>` (มีคีย์เฉพาะโซนที่มีใบค้าง)
 *   Chip = `{ orderId, orderNumber, status, group, stateLabel, ownerName | null }`
 * ⚠️ หนึ่งชิปต่อ (โซน × ใบ) — ใบหนึ่งเลือกโซนเดียวกันได้หลายบรรทัด
 * ⚠️ เรียงกลุ่ม "ยังไม่อนุมัติ" ก่อน แล้วตามเลขที่ใบ — ลำดับเดียวกันทุกผิว
 * @param allocations แถว sales_order_line_zones (`salesOrderId`, `zoneId`)
 * @param ordersById  Map/อ็อบเจกต์ของใบ · dealsById (ไม่บังคับ) = ชื่อ AE เจ้าของดีล (`ownerName`)
 */
export function pendingSetupOrdersByZone({ allocations = [], ordersById = new Map(), dealsById = null } = {}) {
  const byZone = new Map();
  const seen = new Set();
  for (const row of Array.isArray(allocations) ? allocations : []) {
    if (!row?.zoneId || !row.salesOrderId) continue;
    const key = `${row.zoneId}|${row.salesOrderId}`;
    if (seen.has(key)) continue;
    const order = lookup(ordersById, row.salesOrderId);
    const state = setupOrderState(order);
    if (!state) continue;
    seen.add(key);
    const list = byZone.get(row.zoneId) || [];
    list.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      group: state.group,
      stateLabel: state.label,
      ownerName: (order.dealId && lookup(dealsById, order.dealId)?.ownerName) || null,
    });
    byZone.set(row.zoneId, list);
  }
  for (const list of byZone.values()) {
    list.sort((a, b) => (GROUP_RANK[a.group] - GROUP_RANK[b.group])
      || String(a.orderNumber || '').localeCompare(String(b.orderNumber || '')));
  }
  return byZone;
}
