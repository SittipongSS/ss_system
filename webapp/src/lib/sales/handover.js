// ── ส่งต่องานบริหารงานขาย (มติเจ้าของ 27/11/2026 · docs/sales-handover.md) ─────────────────────────
//
// ตัวคิดกลางของ "ส่งต่องาน" ทั้งสามทางเข้า — หน้าโอนงานคนลาออก (/users/:id/handover) · ปุ่มใน Control Panel
// ของหน้าดีล · ปุ่มใน Control Panel ของหน้าลูกค้า · ทุกทางเรียก API เส้นเดียวกัน (/api/sales-planning/handover)
//
// ไฟล์นี้เป็น **ตรรกะล้วน** (ไม่แตะฐาน) — ตัดสินว่าดีลไหนต้องส่งต่อ · อะไรย้ายตาม · อะไรอยู่กับคนเดิม
// ตัวเขียนฐานอยู่ที่ `handoverWrite.js`
//
// ⭐ มติ 27/11 ข้อ 3 — ดีลที่อยู่ในรายการ = ดีลเปิด + ดีล Won ที่งานยังไม่จบ
//    "งานยังไม่จบ" (เจ้าของยืนยัน 27/11) = ข้อใดข้อหนึ่ง:
//      · ยังไม่มี SO ที่ยังใช้งานอยู่ · มี SO ที่ยังไม่อนุมัติ · มีสัญญาที่ยังไม่จบ (ร่าง/รอลงนาม/รอรับรอง)
//      · SO ที่อนุมัติแล้วยังมีงวดเงินที่บัญชียังไม่ยืนยัน
//    Won ที่จบหมดแล้ว + Lost อยู่กับคนเดิม · ดีลของใบสั่งขายย้อนหลัง (ภาชนะระบบ) ไม่อยู่ในรายการ — ย้ายทีละใบที่หน้าดีล
//    (UNIQUE ลูกค้า × AE ของ mig 0360 ต้องดูทีละใบ · กติกาเดียวกับปุ่มโอนงานเดิม)
//
// ⚠️ ยอดขาย (Actual) ไม่ย้ายเลย — `sales_orders.ownerId` ของใบที่อนุมัติแล้ว trigger 0294 แช่ไว้เป็น "เจ้าของยอด"
//    ส่วนใบที่ยังไม่อนุมัติยังว่าง ⇒ อนุมัติทีหลังจะได้เจ้าของดีลคนใหม่เอง ไม่ต้องแตะช่องนั้น
import { isClosedStage } from '@/lib/salesPlanning';
import { isSalesManager } from '@/lib/permissions';
import { fmtNumber } from '@/lib/format';
import { isHistoricalDeal } from '@/lib/sales/historicalOrders';

/* ⭐ มติ 27/11 ข้อ 2 — ปุ่มส่งต่องานบนหน้าดีล/ลูกค้า: AE Supervisor + Admin (หัวหน้าฝ่ายขายที่อยู่เหนือ Sup — CD/CM — ได้ด้วย)
   = ตัวเดียวกับ "ย้ายเจ้าของดีลของใบย้อนหลัง" (`canMoveHistoricalDealOwner` · ข้อความ "เฉพาะ AE Supervisor หรือ Admin")
   ⚠️ สิทธิ์ไม่ผ่าน = ไม่โชว์ปุ่มเลย (กฎ ui-visibility 30/08) · ติดเงื่อนไขของใบ = โชว์แล้วบอกเหตุ */
export const canHandoverSalesWork = (user) => isSalesManager(user?.role);

/* SO ที่ "ยังใช้อยู่" — ใบที่ถูกยกเลิก/ถูกแทนด้วย Rev. ไม่นับว่าดีลมี SO */
export const DEAD_ORDER_STATUSES = Object.freeze(['cancelled', 'revised']);
/* SO ที่ยังไม่อนุมัติ — ผู้สร้าง (createdBy) ย้ายตามเจ้าของดีลใหม่ ⇒ ใบที่ถูกตีกลับกลับไปหาคนรับ */
export const MOVABLE_ORDER_STATUSES = Object.freeze(['draft', 'pending_approval', 'rejected', 'approval_revoked']);
/* สัญญาที่ยังไม่จบ — ผู้ดูแล + ผู้สร้างย้ายตาม ⇒ กระดิ่ง/คิว "รอฉัน" ของสัญญาไปหาคนรับ (lib/sales/contracts isContractWaitingOnMe) */
export const OPEN_CONTRACT_STATUSES = Object.freeze(['draft', 'awaiting_signature', 'awaiting_approval']);
/* สัญญาที่ลงนามแล้ว — ย้ายแค่ผู้ดูแล (ownerId) ให้บันทึกเพิ่มเติม/Rev. ถัดไปเป็นของคนรับ · ผู้สร้างคือประวัติ ไม่แตะ */
export const SIGNED_CONTRACT_STATUSES = Object.freeze(['signed']);

/* เหตุที่ดีล Won ยังต้องส่งต่อ — คีย์คงที่ (เทสต์/จอใช้) + ป้ายไทยสั้นพอลงเซลล์ตาราง */
export const WON_OPEN_REASONS = Object.freeze({
  no_order: 'ยังไม่ออก SO',
  order_unapproved: 'SO ยังไม่อนุมัติ',
  contract_open: 'สัญญายังไม่จบ',
  payment_open: 'ค้างรับเงิน',
});

const liveOrders = (orders = []) => (orders || []).filter((o) => o && !DEAD_ORDER_STATUSES.includes(o.status));

/**
 * ดีลใบนี้อยู่กลุ่มไหนของการส่งต่อ
 * @param deal แถว `sales_deals` (ต้องมี stage · origin)
 * @param ctx `{ orders, contracts, installmentsByOrder }` — ของดีลใบนี้ · `installmentsByOrder` = Map/obj orderId → แถวงวด
 * @returns `{ group: 'open'|'won_open'|'won_done'|'lost'|'container', reasons: [{ key, label, detail }] }` — container = ดีลภาชนะของใบสั่งขายย้อนหลัง
 */
export function dealHandoverGroup(deal, { orders = [], contracts = [], installmentsByOrder = {} } = {}) {
  if (!deal) return { group: 'lost', reasons: [] };
  if (isHistoricalDeal(deal)) return { group: 'container', reasons: [] };
  if (deal.stage === 'lost') return { group: 'lost', reasons: [] };
  if (!isClosedStage(deal.stage)) return { group: 'open', reasons: [] };

  const reasons = [];
  const live = liveOrders(orders);
  if (!live.length) reasons.push({ key: 'no_order', label: WON_OPEN_REASONS.no_order });
  for (const order of live) {
    if (order.status !== 'approved') {
      reasons.push({ key: 'order_unapproved', label: WON_OPEN_REASONS.order_unapproved, detail: order.orderNumber || null });
      continue;
    }
    const rows = installmentsOf(installmentsByOrder, order.id);
    const unpaid = rows.filter((row) => row.status !== 'confirmed');
    if (unpaid.length) {
      reasons.push({
        key: 'payment_open',
        label: `${WON_OPEN_REASONS.payment_open} ${unpaid.length}/${rows.length} งวด`,
        detail: order.orderNumber || null,
      });
    }
  }
  if ((contracts || []).some((c) => OPEN_CONTRACT_STATUSES.includes(c?.status))) {
    reasons.push({ key: 'contract_open', label: WON_OPEN_REASONS.contract_open });
  }
  return { group: reasons.length ? 'won_open' : 'won_done', reasons };
}

function installmentsOf(byOrder, orderId) {
  if (!byOrder || !orderId) return [];
  const rows = byOrder instanceof Map ? byOrder.get(orderId) : byOrder[orderId];
  return Array.isArray(rows) ? rows : [];
}

/** ดีลกลุ่มนี้ต้องอยู่ในรายการส่งต่อไหม */
export const isHandoverEligible = (group) => group === 'open' || group === 'won_open';

/**
 * แผนการเขียนของดีลหนึ่งใบ — อะไรย้ายตามเจ้าของใหม่
 * @param ctx `{ orders, contracts }` ของดีลใบนี้
 * @param to `{ id, name }` คนรับ
 * @returns `{ orderIds, openContractIds, signedContractIds }` — id ของแถวที่ต้องเขียน
 */
export function planDealHandover({ orders = [], contracts = [] } = {}) {
  return {
    orderIds: (orders || []).filter((o) => MOVABLE_ORDER_STATUSES.includes(o?.status)).map((o) => o.id),
    openContractIds: (contracts || []).filter((c) => OPEN_CONTRACT_STATUSES.includes(c?.status)).map((c) => c.id),
    signedContractIds: (contracts || []).filter((c) => SIGNED_CONTRACT_STATUSES.includes(c?.status)).map((c) => c.id),
  };
}

/* ── ตัดกระดิ่งคนเดิม (มติ 27/11 ข้อ 6) ────────────────────────────────────────────────
   คนที่ส่งต่อดีลออกไปแล้วถูกจดไว้ใน `sales_deals.metadata.handedOffFrom` (อาร์เรย์ user id · ไม่ต้องมี migration)
   ⇒ `recipientsForUpdate` ตัดคนในรายการนี้ออกจากผู้รับเธรดของดีล — ยกเว้นถูก @ ถึงตรง ๆ
   ⚠️ คนที่ได้ดีลกลับมาเป็นเจ้าของอีกครั้งต้องหลุดจากรายการ ไม่งั้นเจ้าของตัวจริงไม่ได้กระดิ่งของดีลตัวเอง */
export const HANDED_OFF_KEY = 'handedOffFrom';

export function handedOffFrom(deal) {
  const list = deal?.metadata?.[HANDED_OFF_KEY];
  return Array.isArray(list) ? list.map(String).filter(Boolean) : [];
}

/** metadata ใหม่หลังส่งต่อจาก `fromId` → `toId` (merge ทับของเดิม ไม่แทนทั้งก้อน — กุญแจระบบอื่นอยู่ในก้อนเดียวกัน) */
export function handoverMetadata(metadata, fromId, toId) {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const list = new Set(handedOffFrom({ metadata: base }));
  if (fromId) list.add(String(fromId));
  if (toId) list.delete(String(toId));
  return { ...base, [HANDED_OFF_KEY]: [...list] };
}

/**
 * ผู้รับเธรดของดีลหลังตัดคนที่ส่งต่อออกไปแล้ว
 * @param ids ผู้รับที่คิดได้แล้ว (เจ้าของ + คนเคยโพสต์)
 * @param mentionIds คนที่ถูก @ ในข้อความนี้ — ไม่ตัดเด็ดขาด
 */
export function withoutHandedOff(ids = [], deal, mentionIds = []) {
  const muted = new Set(handedOffFrom(deal));
  if (!muted.size) return ids;
  const mentioned = new Set((mentionIds || []).map(String));
  return ids.filter((id) => !muted.has(String(id)) || mentioned.has(String(id)));
}

/* ── เป้า: แบ่งให้หลายคน (มติ 27/11 ข้อ 5) ───────────────────────────────────────────
   กรอกยอดรายเดือนต่อคน · ผลรวมของแต่ละแถวต้นทาง (เดือน × ทีม) ต้องเท่าเป้าเดิมพอดี */

/**
 * ตรวจการแบ่งเป้า
 * @param fromRows แถวเป้าต้นทาง `{ id, period, team, targetAmount }` (กรองเดือนแล้ว)
 * @param split `[{ sourceId, toUserId, amount }]`
 * @returns `{ ok: true, bySource: Map(sourceId → [{ toUserId, amount }]) } | { ok: false, error }`
 */
export function validateTargetSplit(fromRows = [], split = []) {
  const sources = new Map((fromRows || []).map((row) => [String(row.id), row]));
  const bySource = new Map();
  for (const item of split || []) {
    const sourceId = String(item?.sourceId || '');
    const source = sources.get(sourceId);
    if (!source) return { ok: false, error: 'มีแถวเป้าที่ไม่ใช่ของคนต้นทาง หรือเป็นเดือนที่ผ่านมาแล้ว — รีเฟรชหน้าแล้วลองใหม่' };
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'ยอดเป้าต้องเป็นตัวเลขไม่ติดลบ' };
    if (!item?.toUserId) return { ok: false, error: 'ต้องเลือกคนรับเป้า' };
    if (amount === 0) continue;
    const list = bySource.get(sourceId) || [];
    list.push({ toUserId: String(item.toUserId), amount });
    bySource.set(sourceId, list);
  }
  for (const [sourceId, source] of sources) {
    const target = Number(source.targetAmount || 0);
    if (target <= 0) continue;
    const sum = (bySource.get(sourceId) || []).reduce((s, x) => s + x.amount, 0);
    if (Math.round(sum * 100) !== Math.round(target * 100)) {
      const diff = target - sum;
      return {
        ok: false,
        error: `เป้าเดือน ${source.period} ทีม ${source.team || '—'} ${diff > 0 ? 'ขาด' : 'เกิน'} ${fmtNumber(Math.abs(diff))} บาท — ผลรวมต้องเท่าเป้าเดิม ${fmtNumber(target)} บาท`,
      };
    }
  }
  return { ok: true, bySource };
}
