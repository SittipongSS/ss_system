// ── Ingredient List ของสูตร (ม-158 · มติเจ้าของ 03/11/2026 · mig 0423) ─────────────────────────────
//
// ⭐ **ข้อความยาวช่องเดียวบนทะเบียนสูตร** (`formulas.ingredientList`) — รายชื่อสาร INCI เรียงตามสัดส่วน
//   หนึ่งสูตร = หนึ่ง Ingredient List · หน้าสูตร · หน้า FG · คำร้อง · Excel ทะเบียนสูตร อ่านตัวเดียวกัน (ไม่มีสำเนา)
//
// ⭐ **แยกก้าวจากราคา แต่ต้องครบทั้งสองอย่างถึงจบแถว** (ม-159 · มติเจ้าของ 03/11/2026 · ทับ ม-158 ข้อ 3) —
//   *"ingredient list กับ ราคา RD จะได้มาไม่พร้อมกัน ผมว่า แยกส่วนกันดีกว่า แต่ค่อยว่า ต้องใส่ครบถึงจะจบงาน"*
//   · ใส่ราคาก่อน (สูตรยังไม่มี) = แถว "รอ Ingredient List" · ใส่ Ingredient List ก่อน = ขั้นราคาปิดแถวทันที
//   · ใส่ได้สามที่ (หน้า "รอใส่ราคา" · หน้าคำร้อง · หน้าสูตร) ลงสูตรตัวเดียวกัน และปิดแถวที่รออยู่ให้เอง
//   · บังคับเฉพาะสูตรหมวด 01/02 ยกเว้น 02-020 (หัวน้ำหอม) · แถวกลิ่นล้วน (ไม่มีสูตร) ไม่มีที่ให้เก็บ ⇒ ไม่บังคับ
//
// ⚠️ ไฟล์นี้ไม่แตะ DB — API ขั้นราคา · route Ingredient List · route แก้สูตร · จอ ถามตัวเดียวกัน
import { PDR_FRAGRANCE_OIL_CODE } from '@/lib/requests/pdrFields';
import { fmtNumber } from '@/lib/format';

/** ความยาวสูงสุด — ตรงกับ CHECK ของ mig 0423 (เทสต์ยึดให้เท่ากัน) */
export const INGREDIENT_LIST_MAX_LENGTH = 5000;

/** ป้ายเดียวทุกจอ — คำที่ RD/ฝ่ายขายใช้จริง (ไม่แปล) */
export const INGREDIENT_LIST_LABEL = 'Ingredient List';

export const INGREDIENT_LIST_REQUIRED_REASON =
  'ต้องใส่ Ingredient List — สูตรหมวด 01/02 (ยกเว้น 02-020 หัวน้ำหอม) ต้องมีก่อนจบงาน · ลบทิ้งไม่ได้';

/**
 * ตัดช่องว่างหัวท้าย · แปลงขึ้นบรรทัดเป็น \n · ว่าง = null
 * คืน `{ value, error }` — `value === null` คือ "ไม่มี" (ไม่ใช่สตริงว่าง) ตามกฎค่าว่างของระบบ
 */
export function normalizeIngredientList(raw) {
  if (raw == null) return { value: null, error: null };
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return { value: null, error: null };
  if (text.length > INGREDIENT_LIST_MAX_LENGTH) {
    return { value: null, error: `${INGREDIENT_LIST_LABEL} ยาวเกิน ${fmtNumber(INGREDIENT_LIST_MAX_LENGTH)} ตัวอักษร` };
  }
  return { value: text, error: null };
}

/**
 * สูตรนี้ต้องมี Ingredient List ก่อนแถวที่ใช้สูตรนี้จะจบไหม — หมวด 01/02 ยกเว้น 02-020
 * ⚠️ สูตรที่ยังไม่มีหมวด (ข้อมูลก่อน mig 0207) ถือว่าต้องมี — ราคาที่ใส่ให้มันคือราคาเนื้อ (B/FB) ซึ่งคือสินค้า
 * ⚠️ ตัดสินจาก **หมวดของสูตร** อย่างเดียว ไม่ดูว่ามีกลิ่นไหม — 02-020 ที่ไม่มีกลิ่นก็ยังเป็นหัวน้ำหอม (มติข้อ 4)
 */
export function formulaNeedsIngredientList(formula) {
  if (!formula?.id) return false;
  const category = String(formula.categoryCode || '').trim();
  if (category === PDR_FRAGRANCE_OIL_CODE) return false;
  if (!category) return true;
  return /^0[12]-/.test(category);
}

/**
 * แผน Ingredient List ของแถวที่รอใส่ราคา — `formula` = สูตรสดที่แถวผูก (null = แถวกลิ่นล้วน)
 * คืน `{ required, formulaId, current }` — จอเปิดช่อง (เติม `current` ให้) · API ใช้ตัดสินด่าน
 */
export function rowIngredientPlan(formula) {
  if (!formulaNeedsIngredientList(formula)) return { required: false, formulaId: null, current: null };
  return { required: true, formulaId: formula.id, current: normalizeIngredientList(formula.ingredientList).value };
}

/** แผนนี้ยังขาด Ingredient List — ขั้นราคาใช้ตัดสินว่าจะปิดแถวเลย หรือประทับราคาไว้รอ (ม-159) */
export const ingredientListMissing = (plan) => !!plan?.required && !plan.current;

/**
 * ตรวจค่าที่ส่งมาใส่ — คืน `{ value, error }` · ว่าง = ตีกลับเมื่อสูตรต้องมี (ลบทิ้งไม่ได้ — ขั้นราคาอ่านค่านี้อยู่)
 * ⚠️ ทางใส่จากแถวคำร้อง/หน้า "รอใส่ราคา" ส่ง `required: true` เสมอ (มาถึงได้เฉพาะแถวที่ต้องมี)
 */
export function ingredientListInput(raw, { required = true } = {}) {
  const { value, error } = normalizeIngredientList(raw);
  if (error) return { value: null, error };
  if (!value && required) return { value: null, error: INGREDIENT_LIST_REQUIRED_REASON };
  return { value, error: null };
}
