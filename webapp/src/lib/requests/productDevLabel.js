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
import { categoryRow } from '@/lib/master/categoryOf';

// 🐞 เดิมเทียบด้วย `typeCode` เดี่ยว ๆ ⇒ ไม่เคยเจอเลย เพราะรหัสที่เก็บคือ `MM-TTT`
// (ตัวกลางอยู่ที่ lib/master/categoryOf.js ที่เดียวแล้ว)

/**
 * ข้อความของแถว — `{ main, sub }`
 *
 * `main` = "รหัส ชื่อหมวด × รหัส ชื่อกลิ่น" (เท่าที่เลือกแล้ว) · ยังไม่เลือกอะไรเลย
 * ถอยไปใช้ "รายการที่ N"
 * `sub` = "วันที่ของกลิ่น · จำนวน+หน่วย" (มติผู้ใช้ 2026-08-09) — สองอย่างนี้เป็น
 * ของที่ต่างกันได้ทั้งที่หมวด×กลิ่นเหมือนกัน จึงต้องเห็นตอนแถวยุบ · ว่างได้ทั้งคู่
 */
export function productDevRowText(row = {}, index = 0, { categories = [], scents = [] } = {}) {
  const category = categoryRow(row.categoryCode, categories);
  const scent = scents.find((s) => s.id === row.scentId) || null;
  const categoryText = category
    ? [row.categoryCode, category.nameTh || category.nameEn].filter(Boolean).join(' ')
    : '';
  const scentText = scent ? [scent.code, scent.name].filter(Boolean).join(' ') : '';
  const main = [categoryText, scentText].filter(Boolean).join(' × ');

  // ⚠️ จำนวนไม่มีหน่วยก็ยังมีความหมาย (คนกรอก "3" ไว้ก่อน) — โชว์เท่าที่มี
  const qty = String(row.qty ?? '').trim();
  const unit = String(row.unit ?? '').trim();
  const qtyText = qty ? [qty, unit].filter(Boolean).join(' ') : '';

  /* ⭐ **`short` — ป้ายสำหรับ *ราง* (มติผู้ใช้ 2026-08-25)** ⇒ ชื่อหมวด × รหัสกลิ่น
   *
   * 🐞 วัดจริงหลังเปลี่ยนพัฒนาสูตรมาเป็นราง: `main` เต็ม ๆ
   * ("01-030 ครีมทามือ × 6732025 CHAO PHRAYA THAI CONTEMPORARY 01 REV 3")
   * ตัดคำลงรางกว้าง 208px ได้ **แถวละ 100px** ⇒ 5 รายการ = ราง 500px ของป้ายล้วน
   * ซึ่งเป็นเหตุผลเดียวกับที่มติ 2026-08-09 ไม่เอาราง
   *
   * ⭐ ที่ตัดออกคือ **รหัสหมวด** (ซ้ำกับชื่อหมวดที่อ่านออกกว่า) และ **ชื่อกลิ่น**
   * (ยาวที่สุดในสามก้อน · ของจริงคือ "CHAO PHRAYA THAI CONTEMPORARY 01 REV 3")
   * เหลือรหัสกลิ่นซึ่งสั้นและเป็นตัวแยกที่คนในระบบใช้จริง
   * ⚠️ **ยังไม่ซ้ำกันโดยโครงสร้าง** — ตัวตนของแถวคือ (หมวด × กลิ่น) และซ้ำกันไม่ได้
   * (`duplicatePair` + `formulas_identity_uk`) ⇒ ย่อแล้วยังแยกออกจากกันได้ทุกแถว
   * ⚠️ กลิ่นที่ไม่มีรหัสถอยไปใช้ชื่อ — ป้ายว่างแย่กว่าป้ายยาว
   * ⚠️ **ไม่ใช่ตัวแทน `main`** — `main` ยังใช้เป็น tooltip และที่อื่นที่มีที่พอ */
  const scentShort = scent ? (scent.code || scent.name || '') : '';
  const short = [category ? (category.nameTh || category.nameEn || row.categoryCode) : '', scentShort]
    .filter(Boolean).join(' × ');

  return {
    main: main || `รายการที่ ${index + 1}`,
    short: short || main || `รายการที่ ${index + 1}`,
    sub: [scent?.createdAt ? fmtDate(scent.createdAt) : '', qtyText].filter(Boolean).join(' · '),
  };
}
