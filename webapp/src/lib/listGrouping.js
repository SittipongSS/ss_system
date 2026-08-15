/* ── จัดรายการเป็น "ถัง" ตามหัวข้อที่ผู้ใช้เลือก (ปุ่ม "จัดกลุ่ม" บน toolbar) ────
 *
 * ⭐ **ตรรกะชุดเดียวของทั้งเว็บ** — ทุกตารางที่มีปุ่มจัดกลุ่มเรียกตัวนี้ แล้วส่งแค่
 * "หน้าตาของถัง" ของตัวเองเข้ามา · เขียนแยกทีละหน้าเมื่อไร กติกาสองข้อข้างล่างจะ
 * เพี้ยนกันเองภายในไม่กี่เดือน (บทเรียนเดียวกับกฎ "ฟอร์มเดียวสองทางเรียก" ใน AGENTS.md)
 *
 * กติกาที่ตัดสินไว้ (มติผู้ใช้ 2026-08-15 — ทะเบียนการชำระเป็นหน้าแรกที่ใช้)
 * 1. **ลำดับถัง = ลำดับที่สมาชิกตัวแรกของถังโผล่ในรายการที่เรียงมาแล้ว**
 *    ผู้ใช้เพิ่งเลือกวิธีเรียงไป ถ้าจัดกลุ่มแล้วลำดับพลิกเป็นอย่างอื่น เท่ากับ
 *    ปุ่ม "เรียง" ถูกยกเลิกเงียบ ๆ · ในถังก็คงลำดับเดิมด้วยเหตุผลเดียวกัน
 * 2. **ถัง "ไม่ระบุ" ไปท้ายเสมอ** — ของที่ยังไม่ถูกกรอกไม่ใช่ของด่วน
 */

/**
 * @param {Array} items รายการที่ **กรองและเรียงมาแล้ว**
 * @param {(item) => {key, label, sub?, missing?, weight?}} describe หน้าตาของถังสำหรับรายการหนึ่งตัว
 *        · `key` กุญแจของถัง — ใช้ **id ก่อนชื่อเสมอ** ชื่อซ้ำกันได้ (AE สองคนชื่อเหมือนกัน)
 *        · `sub` บรรทัดรองบนหัวถัง (รหัสลูกค้า / ทีม)
 *        · `missing` ถังของ "ยังไม่ระบุ" — ไม่ส่งมาก็เดาจาก key ว่าง
 *        · `weight` ตัวเลขที่จะรวมเป็นยอดของถัง (ยอดค้างรับ / มูลค่า)
 * @returns {Array|null} ถังพร้อมใช้ · `null` เมื่อไม่มี `describe` (= ไม่จัดกลุ่ม)
 */
export function bucketList(items = [], describe) {
  if (typeof describe !== 'function') return null;
  const buckets = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const shape = describe(item) || {};
    const key = shape.key || '__none';
    const current = buckets.get(key) || {
      key,
      label: shape.label || 'ไม่ระบุ',
      sub: shape.sub || null,
      missing: shape.missing ?? (key === '__none'),
      items: [],
      total: 0,
    };
    // สมาชิกตัวแรกของถังอาจไม่มีบรรทัดรอง (เช่นดีลเก่าที่ผูกก่อนออกรหัส) — เอาค่าแรกที่มีจริง
    if (!current.sub && shape.sub) current.sub = shape.sub;
    current.items.push(item);
    current.total += Number(shape.weight) || 0;
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, count: bucket.items.length }))
    // Array.prototype.sort เสถียร ⇒ ถังที่ไม่ใช่ "ไม่ระบุ" คงลำดับที่โผล่มาไว้ทั้งหมด
    .sort((a, b) => (a.missing === b.missing ? 0 : a.missing ? 1 : -1));
}

/** ทุกอย่างในถังถูกย่ออยู่หรือยัง — ใช้กับปุ่ม "ย่อ/ขยายทุกกลุ่ม" */
export const allBucketsCollapsed = (buckets, collapsed) =>
  Boolean(buckets?.length) && buckets.every((bucket) => collapsed.has(bucket.key));

/** สลับสถานะย่อของถังเดียว — คืน Set ใหม่เสมอ (React state ต้องเปลี่ยน identity) */
export function toggleBucketKey(collapsed, key) {
  const next = new Set(collapsed);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}
