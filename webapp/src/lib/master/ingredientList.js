// ── Ingredient List ของสูตร (ม-158 · มติเจ้าของ 03/11/2026 · mig 0423) ─────────────────────────────
//
// ⭐ **ข้อความยาวช่องเดียวบนทะเบียนสูตร** (`formulas.ingredientList`) — รายชื่อสาร INCI เรียงตามสัดส่วน
//   หนึ่งสูตร = หนึ่ง Ingredient List · หน้าสูตร · หน้า FG · คำร้อง · Excel ทะเบียนสูตร อ่านตัวเดียวกัน (ไม่มีสำเนา)
//
// ⭐ **บังคับตอนใส่ราคา** แถวที่ลูกค้าคอนเฟิร์มแล้ว ที่ผูกสูตรหมวด 01/02 — ยกเว้น 02-020 (หัวน้ำหอม · ราคา F ลงที่กลิ่น)
//   · ปุ่ม "ใส่ราคา" และ "ใช้ราคานี้" ถามตัวเดียวกัน (`ingredientListGate`) · สูตรที่มีอยู่แล้ว = เติมให้ แค่ตรวจ
//   · แถวกลิ่นล้วน (ไม่มีสูตร) ไม่มีที่ให้เก็บ ⇒ ไม่บังคับ
//
// ⚠️ ไฟล์นี้ไม่แตะ DB — API ขั้นราคา · route แก้สูตร · โมดัลบนจอ ถามตัวเดียวกัน (จอกับด่านพูดคนละเรื่องไม่ได้)
import { PDR_FRAGRANCE_OIL_CODE } from '@/lib/requests/pdrFields';
import { fmtNumber } from '@/lib/format';

/** ความยาวสูงสุด — ตรงกับ CHECK ของ mig 0423 (เทสต์ยึดให้เท่ากัน) */
export const INGREDIENT_LIST_MAX_LENGTH = 5000;

/** ป้ายเดียวทุกจอ — คำที่ RD/ฝ่ายขายใช้จริง (ไม่แปล) */
export const INGREDIENT_LIST_LABEL = 'Ingredient List';

export const INGREDIENT_LIST_REQUIRED_REASON =
  'ต้องใส่ Ingredient List ของสูตรก่อน — สูตรหมวด 01/02 (ยกเว้น 02-020 หัวน้ำหอม) ต้องมีทุกตัวที่ใส่ราคา';

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
 * สูตรนี้ต้องมี Ingredient List ก่อนปิดขั้นราคาไหม — หมวด 01/02 ยกเว้น 02-020
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

/**
 * ด่านของขั้นราคา — `plan` จาก `rowIngredientPlan` · `body` = คำขอ (`ingredientList` ไม่ส่ง = ใช้ของเดิมในสูตร)
 * คืน `{ error, write }` — `write` = ค่าใหม่ที่ต้องเขียนลงสูตร (null = ไม่ต้องเขียน)
 * · ส่งค่าว่างมาทั้งที่สูตรมีอยู่แล้ว = ตีกลับ (ลบทิ้งระหว่างใส่ราคาไม่ได้ — แก้ที่หน้าสูตร)
 */
export function ingredientListGate(plan, body = {}) {
  if (!plan?.required) return { error: null, write: null };
  const given = Object.prototype.hasOwnProperty.call(body || {}, 'ingredientList');
  if (!given) return plan.current ? { error: null, write: null } : { error: INGREDIENT_LIST_REQUIRED_REASON, write: null };
  const { value, error } = normalizeIngredientList(body.ingredientList);
  if (error) return { error, write: null };
  if (!value) return { error: INGREDIENT_LIST_REQUIRED_REASON, write: null };
  return { error: null, write: value === plan.current ? null : value };
}
