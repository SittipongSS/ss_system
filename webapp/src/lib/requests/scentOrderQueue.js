// ── คิว "SO ออกแบบกลิ่นรอเปิดคำร้อง" (ม-164 PR-5 · มติเจ้าของ 13/11 ข้อ 5–6) — logic ล้วน ไม่แตะ DB ──
//
// ⭐ **ทุก SO ออกแบบ/แก้กลิ่นที่อนุมัติแล้วต้องมีคำร้องรับหนึ่งใบ** (ทาง C) — คิวนี้คือที่จับใบที่ยังไม่มี
//   วัด prod 13/11: 73 ใบ ไม่มีคำร้องรับ 17 ใบ (10 ใบค้างตั้งแต่ ส.ค.)
// ⭐ สามทางออกของแต่ละใบ: **เปิดคำร้องใหม่** · **แนบเข้าคำร้องเดิม** (ไม่ต้องมีบรีฟใหม่ + ใบเดิมยังไม่ปิด) ·
//   **ไม่ต้องมีคำร้อง** (ทำนอกระบบไปแล้ว — เหตุผลบังคับ · บันทึกคนปัด/เวลา · มติข้อ 6)
// ⭐ ใครเห็น (มติข้อ 5): เจ้าของดีลเห็นใบของตัวเอง · หัวหน้าฝ่ายขายเห็นทั้งหมด (ในขอบเขตทีม) · แอดมินทั้งหมด
// ⚠️ ใบย้อนหลัง/ใบค่าสรรพสามิตไม่เข้าคิว (ผู้เรียกกรอง `pipelineRowsOnly` ที่ query) — งานจบแล้ว/ไม่มีงานออกแบบ
import { isSalesRole, isSuperuser } from '@/lib/permissions';
import { scentDesignLines } from '@/lib/requests/scentDesignOrders';
import { attachAdds, scentOrderLinesText } from '@/lib/requests/scentOrderAttach';

const DAY = 24 * 60 * 60 * 1000;
const dayDiff = (from, today) => {
  const a = Date.parse(String(from || '').slice(0, 10));
  const b = Date.parse(String(today || '').slice(0, 10));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / DAY)) : null;
};

/**
 * แถวของคิว — SO ที่อนุมัติแล้ว มีงานพัฒนากลิ่น และยังไม่มีคำร้องเป็นเจ้าของ
 *
 * @param orders     SO (อนุมัติแล้ว · สายขายปกติ) `{ id, orderNumber, customerId, customerName, dealId, approvedAt, orderDate }`
 * @param linesBySo  Map(salesOrderId → บรรทัด)
 * @param ownerById  Map(salesOrderId → เจ้าของ | null) จาก `loadScentOrderOwners`
 * @param dismissals Map(salesOrderId → การปัดออก)
 * @param dealsById  Map(dealId → `{ id, code, title, ownerId, ownerName, team }`)
 * @param latestRequestByCustomer Map(customerId → คำร้องพัฒนากลิ่นใบล่าสุด) — ค่าตั้งต้นของ "ต่อจากคำร้อง"
 * @returns `{ pending, dismissed }` — เรียงค้างนานสุดก่อน
 */
export function scentOrderQueueRows({
  orders = [], linesBySo = new Map(), ownerById = new Map(), dismissals = new Map(), dealsById = new Map(),
  latestRequestByCustomer = new Map(), today = null, productTypes = [],
} = {}) {
  const pending = [];
  const dismissed = [];
  for (const order of orders || []) {
    const lines = linesBySo.get(order.id) || [];
    if (!scentDesignLines(lines).length) continue;
    if (ownerById.get(order.id)) continue;
    const deal = dealsById.get(order.dealId) || null;
    const since = order.approvedAt || order.orderDate || null;
    const row = {
      id: order.id,
      orderNumber: order.orderNumber || order.id,
      customerId: order.customerId || null,
      customerName: order.customerName || null,
      dealId: order.dealId || null,
      dealCode: deal?.code || null,
      dealTitle: deal?.title || null,
      dealOwnerId: deal?.ownerId || null,
      dealOwnerName: deal?.ownerName || null,
      team: deal?.team || null,
      // หมวด = รหัส + ชื่อ (มติเจ้าของ 18/11/2026) — "03-010 แก้ไขกลิ่น ×1" · ทะเบียนว่าง = รหัสดิบ
      linesText: scentOrderLinesText(lines, productTypes),
      adds: attachAdds(lines),
      since,
      waitingDays: dayDiff(since, today),
      latestRequest: latestRequestByCustomer.get(order.customerId) || null,
      dismissal: dismissals.get(order.id) || null,
    };
    (row.dismissal ? dismissed : pending).push(row);
  }
  const byAge = (a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1) || String(a.orderNumber).localeCompare(String(b.orderNumber));
  return { pending: pending.sort(byAge), dismissed: dismissed.sort(byAge) };
}

/**
 * ใช้คิวได้ไหม — ฝ่ายขายทุกตำแหน่ง (เจ้าของดีลอยู่ในนี้) + แอดมิน
 * ⚠️ คนอื่น (RD/PC/บัญชี) ไม่มีวันเป็นเจ้าของดีล ⇒ server ตอบลิสต์ว่างโดยไม่อ่านทะเบียน SO —
 *    หน้า /requests เป็นหน้าประจำของ RD · ไม่งั้นทุกครั้งที่ RD เปิดหน้าคือการอ่าน SO อนุมัติทั้งทะเบียนทิ้ง
 */
export const canUseScentOrderQueue = (user) => isSuperuser(user?.role) || isSalesRole(user?.role);

/** เห็นภาพรวม ("ทั้งหมด") ได้ไหม — หัวหน้าฝ่ายขาย (CD · CM · AE Sup · AC Sup) + แอดมิน */
export const canSeeAllScentOrders = (user) => isSuperuser(user?.role);

/**
 * กรองตามขอบเขต — `mine` = ดีลของฉัน · `all` = ทั้งหมดที่ `inScope` ปล่อย (เฉพาะคนที่เห็นภาพรวมได้)
 * @param inScope  `(row) => boolean` ด่านขอบเขตทีมของผู้เรียก (`inSalesDocScope`)
 */
export function scentOrderQueueScope(rows = [], { user, scope = 'mine', inScope = () => true } = {}) {
  if (scope === 'all' && canSeeAllScentOrders(user)) return (rows || []).filter(inScope);
  return (rows || []).filter((row) => user?.id && String(row.dealOwnerId) === String(user.id));
}

/** ใครปัดออก/คืนเข้าคิวได้ — เจ้าของดีลของ SO · หัวหน้าฝ่ายขาย · แอดมิน (คืนเข้าคิว: + คนที่ปัดเอง) */
export function canDismissScentOrder(user, { dealOwnerId = null } = {}) {
  if (!user?.id) return false;
  if (isSuperuser(user.role)) return true;
  return !!dealOwnerId && String(dealOwnerId) === String(user.id);
}

/**
 * ปัดออกจากคิว ("ไม่ต้องมีคำร้อง") — คืนข้อความไทย หรือ null
 * @param row  แถวของคิว (ต้องอยู่ในคิวจริง — มีงานพัฒนากลิ่น · ยังไม่มีเจ้าของ · ยังไม่ถูกปัด)
 */
export function dismissScentOrderError({ user, row = null, reason = '' } = {}) {
  if (!row) return 'ใบสั่งขายนี้ไม่อยู่ในคิวรอเปิดคำร้อง (มีคำร้องรับแล้ว หรือไม่ใช่งานพัฒนากลิ่น)';
  if (!canDismissScentOrder(user, { dealOwnerId: row.dealOwnerId })) {
    return 'ปัดออกได้เฉพาะเจ้าของดีลของใบสั่งขายนี้ หัวหน้าฝ่ายขาย หรือผู้ดูแลระบบ';
  }
  if (row.dismissal) return 'ใบสั่งขายนี้ถูกปัดออกจากคิวไปแล้ว';
  const text = String(reason ?? '').trim();
  if (!text) return 'ต้องบอกเหตุผลที่ไม่ต้องมีคำร้อง';
  if (text.length > 500) return 'เหตุผลยาวเกิน 500 ตัวอักษร';
  return null;
}

/** คืนเข้าคิว — คนที่ปัดเอง · เจ้าของดีล · หัวหน้าฝ่ายขาย · แอดมิน */
export function undismissScentOrderError({ user, row = null } = {}) {
  if (!row?.dismissal) return 'ใบสั่งขายนี้ไม่ได้ถูกปัดออกจากคิว';
  const byMe = user?.id && String(row.dismissal.dismissedById) === String(user.id);
  if (!byMe && !canDismissScentOrder(user, { dealOwnerId: row.dealOwnerId })) {
    return 'คืนเข้าคิวได้เฉพาะคนที่ปัดออก เจ้าของดีล หัวหน้าฝ่ายขาย หรือผู้ดูแลระบบ';
  }
  return null;
}

/** ลิงก์ "เปิดคำร้องใหม่" — พา SO มา + ตั้งต้น "ต่อจากคำร้อง" เป็นใบล่าสุดของลูกค้า (แก้ได้ในฟอร์ม) · กลับมาที่คิว */
export function scentOrderNewRequestHref(row, { returnTo = '/requests' } = {}) {
  const q = new URLSearchParams({ kind: 'scent_dev', salesOrderId: row.id, returnTo });
  if (row.latestRequest?.id) q.set('continues', row.latestRequest.id);
  return `/requests/new?${q}`;
}
