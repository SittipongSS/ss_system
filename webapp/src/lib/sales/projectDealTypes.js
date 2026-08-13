// สรุป "โครงการนี้ผ่านงานชนิดไหนมาบ้าง กี่ครั้ง" — ใช้ที่คอลัมน์ดีลของหน้ารายการโครงการ
//
// ทำไมต้องมี: โครงการเป็นภาชนะที่สะสมดีลไปเรื่อย ๆ (พัฒนากลิ่น → พัฒนาสินค้า → สั่งซ้ำ
// อีกหลายรอบ) ของเดิมคอลัมน์นี้โชว์ **ชื่อดีลใบแรกใบเดียว** แล้วต่อท้ายว่า "5 ดีล" —
// โครงการที่สั่งซ้ำมา 3 รอบจึงดูเหมือนโครงการที่เพิ่งเริ่ม และไม่มีทางรู้จากตารางเลยว่า
// เคยทำอะไรไปแล้วบ้าง
//
// สรุปเป็นชิปชนิดละอันพร้อมจำนวน (`RE-ORDER ×3`) — มีชนิดแค่ 4 ชนิดจึงยาวสุด 4 ชิป
// ไม่มีทางรก ไม่ต้องมีกติกา "ตัดที่ N ตัวแรก" ให้ข้อมูลหายเงียบ
// (ในทางปฏิบัติเห็นได้ 3 — 'OTHER' ไม่ผูกโครงการจึงไม่มีทางโผล่ในสรุปของโครงการ)

import { DEAL_TYPES, dealTypeOf } from "@/lib/salesPlanning";

/**
 * @param deals  รายการดีลของโครงการ (จาก `project.deals`)
 * @returns [{ type, count, deals }] เรียงตามลำดับเส้นทางจริง (SCENT → NPD → RE-ORDER)
 *          ไม่ใช่เรียงตามจำนวนหรือตามที่เจอในอาร์เรย์ — คนอ่านตารางคาดหวังลำดับเดิมทุกแถว
 */
export function summarizeProjectDealTypes(deals = []) {
  const rows = Array.isArray(deals) ? deals : [];
  const byType = new Map();
  for (const deal of rows) {
    const type = dealTypeOf(deal);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(deal);
  }
  // ชนิดที่ไม่รู้จัก (ข้อมูลเก่า/เพี้ยน) ต่อท้าย — ห้ามทิ้ง ไม่งั้นผลรวมไม่ตรงกับจำนวนดีลจริง
  const known = DEAL_TYPES.filter((type) => byType.has(type));
  const unknown = [...byType.keys()].filter((type) => !DEAL_TYPES.includes(type));
  return [...known, ...unknown].map((type) => ({
    type,
    count: byType.get(type).length,
    deals: byType.get(type),
  }));
}

/** ข้อความสำหรับ tooltip ของชิปหนึ่งอัน — ชื่อดีลทุกใบในชนิดนั้น ไม่ตัดทิ้ง */
export function dealTypeTooltip({ type, deals = [] }) {
  const titles = deals.map((deal) => deal?.code || deal?.title).filter(Boolean);
  if (!titles.length) return `${type} ${deals.length} ดีล`;
  return `${type} · ${titles.join(" · ")}`;
}
