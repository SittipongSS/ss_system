// ── ป้ายของบรรทัด "หมวด × กลิ่น" (logic ล้วน) ───────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-09: แถวที่ยุบแล้วต้องโชว์ **รหัส+ชื่อหมวด · รหัส+ชื่อกลิ่น ·
// วันที่ของกลิ่น** — ไม่ใช่ "รายการที่ 2" ซึ่งไม่บอกว่าเป็นของชิ้นไหน
//
// ⚠️ แยกออกมาจาก component เพราะมันเป็น **กติกาการประกอบข้อความ** ที่ผิดได้เงียบ ๆ
// (หมวดหาไม่เจอ · กลิ่นถูกลบจากทะเบียน · เลือกยังไม่ครบ) และ CI มองไม่เห็นถ้าฝังใน JSX
//
// ⚠️ วันที่ของกลิ่น = `createdAt` (วันที่เข้าทะเบียน) — บอกว่ากลิ่นนี้เก่าแค่ไหน
// ซึ่งเป็นสิ่งที่ใช้แยกกลิ่นชื่อคล้ายกันของลูกค้าเดียวกัน
import { fmtDate } from '@/lib/format';

/** หาแถวหมวดจากรหัสที่บรรทัดเก็บไว้ — ทะเบียนใช้ `typeCode` ส่วนของเก่าบางแถวเก็บ id */
function findCategory(categories, code) {
  if (!code) return null;
  return categories.find((c) => c.typeCode === code || String(c.id) === String(code)) || null;
}

/**
 * ข้อความของแถว — `{ main, sub }`
 *
 * `main` = "รหัส ชื่อหมวด × รหัส ชื่อกลิ่น" (เท่าที่เลือกแล้ว) · ยังไม่เลือกอะไรเลย
 * ถอยไปใช้ "รายการที่ N"
 * `sub` = "วันที่ของกลิ่น · จำนวน+หน่วย" (มติผู้ใช้ 2026-08-09) — สองอย่างนี้เป็น
 * ของที่ต่างกันได้ทั้งที่หมวด×กลิ่นเหมือนกัน จึงต้องเห็นตอนแถวยุบ · ว่างได้ทั้งคู่
 */
export function productDevRowText(row = {}, index = 0, { categories = [], scents = [] } = {}) {
  const category = findCategory(categories, row.categoryCode);
  const scent = scents.find((s) => s.id === row.scentId) || null;
  const categoryText = category
    ? [category.typeCode, category.nameTh || category.nameEn].filter(Boolean).join(' ')
    : '';
  const scentText = scent ? [scent.code, scent.name].filter(Boolean).join(' ') : '';
  const main = [categoryText, scentText].filter(Boolean).join(' × ');

  // ⚠️ จำนวนไม่มีหน่วยก็ยังมีความหมาย (คนกรอก "3" ไว้ก่อน) — โชว์เท่าที่มี
  const qty = String(row.qty ?? '').trim();
  const unit = String(row.unit ?? '').trim();
  const qtyText = qty ? [qty, unit].filter(Boolean).join(' ') : '';

  return {
    main: main || `รายการที่ ${index + 1}`,
    sub: [scent?.createdAt ? fmtDate(scent.createdAt) : '', qtyText].filter(Boolean).join(' · '),
  };
}
