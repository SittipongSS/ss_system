// ── ตัวกรอง "ทีมดูแล" ของหน้าภาพรวมฐานข้อมูล (/database) — ตัวตัดสินเดียวของสองสาย (ล้วน ไม่แตะ DB/React) ──
//
// ⭐ **สินค้าตามทีมดูแลของลูกค้าเจ้าของ ไม่ใช่ทีมของคนที่เปิดสินค้า** (ตรวจตัวเลข 26/10 · L17)
//    มติ 2026-07-20 (api/products/route.js): `product.team` บันทึก *ทีมของคนที่สร้างแถว* ไม่ใช่เจ้าของสินค้า —
//    **เจ้าของสินค้าคือลูกค้า** ⇒ ป้าย "ทีมดูแล" จะจริงก็ต่อเมื่อสินค้าใช้ทีมดูแลของลูกค้ามัน
//    🐞 เดิมกรองสินค้าด้วย `p.team` ⇒ เลือกทีม X ฝั่งลูกค้าได้ลูกค้าที่ X ดูแล แต่กราฟ/คิวฝั่งสินค้าได้
//       สินค้าที่คนของ X *เปิด* ซึ่งเป็นของลูกค้าทีมอื่นได้ และสินค้าของลูกค้า X ที่ทีมอื่นเปิดหายไป
//    ⚠️ หาลูกค้าไม่เจอ (ไม่อยู่ในทะเบียนที่โหลดมา) = ไม่มีทีม ⇒ ซ่อนระหว่างเลือกทีม (ไม่เดาจาก `p.team`)
//    ⚠️ **สิทธิ์อนุมัติไม่ได้ย้ายตาม** — `canApproveProduct` ของหน้ายังดู `p.team` (ด่านเขียนของ API เป็น editScope
//       ตามทีมผู้สร้าง) ไฟล์นี้ตัดสินแค่ "แถวไหนอยู่ในทีมที่เลือก"

/** ทีมดูแลของลูกค้า — `teams` (หลายทีม) ก่อน ถอยไป `team` เดี่ยวของแถวเก่า */
export const teamsOf = (customer) => (customer?.teams?.length
  ? customer.teams
  : customer?.team ? [customer.team] : []);

/** แผนที่ id → ลูกค้า สำหรับหาเจ้าของสินค้า */
export function customersById(customers = []) {
  return new Map((customers || []).filter((c) => c?.id != null).map((c) => [c.id, c]));
}

/**
 * ทีมที่แถวนี้ "อยู่" สำหรับตัวกรองทีมดูแล
 * @param kind 'customer' | 'product'
 * @param byId ผลของ `customersById` (ใช้กับสินค้า)
 */
export function overviewTeamsOf(item, kind, byId = new Map()) {
  if (kind === 'customer') return teamsOf(item);
  return teamsOf(byId.get(item?.customerId));
}

/** ผ่านตัวกรองทีมดูแลไหม — ว่าง = ทุกทีม (ไม่กรอง) */
export function matchesOverviewTeams(item, kind, teamFilter = [], byId = new Map()) {
  if (!teamFilter?.length) return true;
  return overviewTeamsOf(item, kind, byId).some((t) => teamFilter.includes(t));
}

/**
 * ตัวเลือกของตัวกรอง — ทีมดูแลของลูกค้าเท่านั้น (สินค้าใช้ทีมของลูกค้าอยู่แล้ว)
 * ⚠️ ไม่เก็บ `p.team` ของสินค้า — ทีมที่ไม่ได้ดูแลลูกค้าคนไหนเลยกดแล้วได้ว่างทั้งสองสายเสมอ
 */
export function overviewTeamOptions(customers = []) {
  const teams = new Set();
  for (const c of customers || []) teamsOf(c).forEach((t) => t && teams.add(t));
  return [...teams].sort();
}
