// ม-158 · Ingredient List ของสูตร (มติเจ้าของ 03/11/2026 · mig 0423)
//   ข้อความยาวช่องเดียวบนทะเบียนสูตร · บังคับตอนใส่ราคาแถวที่ผูกสูตรหมวด 01/02 (ยกเว้น 02-020 หัวน้ำหอม)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INGREDIENT_LIST_MAX_LENGTH, INGREDIENT_LIST_REQUIRED_REASON, formulaNeedsIngredientList, ingredientListGate,
  normalizeIngredientList, rowIngredientPlan,
} from './ingredientList.js';

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('normalize: ตัดช่องว่างหัวท้าย · ขึ้นบรรทัด Windows เป็น \\n · ว่าง = null (ไม่ใช่สตริงว่าง)', () => {
  assert.deepEqual(normalizeIngredientList('  Aqua, Parfum \r\n Limonene  '), { value: 'Aqua, Parfum \n Limonene', error: null });
  assert.deepEqual(normalizeIngredientList('   '), { value: null, error: null });
  assert.deepEqual(normalizeIngredientList(null), { value: null, error: null });
  assert.deepEqual(normalizeIngredientList(undefined), { value: null, error: null });
});

test('normalize: ยาวเกินเพดาน = ตีกลับเป็นภาษาไทย · พอดีเพดานผ่าน', () => {
  assert.equal(normalizeIngredientList('a'.repeat(INGREDIENT_LIST_MAX_LENGTH)).error, null);
  const over = normalizeIngredientList('a'.repeat(INGREDIENT_LIST_MAX_LENGTH + 1));
  assert.equal(over.value, null);
  assert.match(over.error, /ยาวเกิน 5,000 ตัวอักษร/);
});

test('🔴 เพดานความยาวต้องเท่ากับ CHECK ของ mig 0423 — ต่างกัน = จอยอมแต่ฐานตีกลับ (หรือกลับกัน)', () => {
  const sql = src('../../../supabase/migrations/0423_formula_ingredient_list.sql');
  const m = sql.match(/length\(btrim\("ingredientList"\)\) BETWEEN 1 AND (\d+)/);
  assert.ok(m, 'หา CHECK ของคอลัมน์ไม่เจอ');
  assert.equal(Number(m[1]), INGREDIENT_LIST_MAX_LENGTH);
});

test('สูตรไหนต้องมี: หมวด 01/02 ทุกตัว ยกเว้น 02-020 (หัวน้ำหอม) — ไม่ดูว่ามีกลิ่นไหม (มติข้อ 4)', () => {
  assert.equal(formulaNeedsIngredientList({ id: 'F', categoryCode: '01-002' }), true);
  assert.equal(formulaNeedsIngredientList({ id: 'F', categoryCode: '02-001' }), true);
  assert.equal(formulaNeedsIngredientList({ id: 'F', categoryCode: '02-037' }), true);
  assert.equal(formulaNeedsIngredientList({ id: 'F', categoryCode: '02-020', scentId: 'S' }), false);
  // 02-020 ที่ไม่มีกลิ่น (ราคาตกไปช่องของสูตร) — ยังเป็นหัวน้ำหอม ไม่บังคับ
  assert.equal(formulaNeedsIngredientList({ id: 'F', categoryCode: '02-020', scentId: null }), false);
  assert.equal(formulaNeedsIngredientList({ id: 'F', categoryCode: '03-001' }), false);
  // สูตรก่อนมีหมวด (ก่อน 0207) — ราคาที่ใส่คือราคาเนื้อ ⇒ ถือว่าเป็นสินค้า
  assert.equal(formulaNeedsIngredientList({ id: 'F', categoryCode: null }), true);
  // แถวกลิ่นล้วน (ไม่มีสูตร) — ไม่มีที่ให้เก็บ
  assert.equal(formulaNeedsIngredientList(null), false);
});

test('แผนของแถว: ไม่บังคับ = ไม่มี formulaId · บังคับ = ติดค่าที่สูตรมีอยู่ (เติมให้ RD ตรวจ)', () => {
  assert.deepEqual(rowIngredientPlan(null), { required: false, formulaId: null, current: null });
  assert.deepEqual(rowIngredientPlan({ id: 'F', categoryCode: '02-020', scentId: 'S', ingredientList: 'x' }),
    { required: false, formulaId: null, current: null });
  assert.deepEqual(rowIngredientPlan({ id: 'F', categoryCode: '01-002', ingredientList: ' Aqua ' }),
    { required: true, formulaId: 'F', current: 'Aqua' });
  assert.deepEqual(rowIngredientPlan({ id: 'F', categoryCode: '01-002', ingredientList: null }),
    { required: true, formulaId: 'F', current: null });
});

test('🔴 ด่านขั้นราคา: ต้องมีก่อนปิดแถว · ไม่ส่ง + สูตรมีแล้ว = ผ่าน · ส่งค่าใหม่ = เขียน · ส่งค่าเดิม = ไม่เขียนซ้ำ', () => {
  const none = { required: true, formulaId: 'F', current: null };
  const has = { required: true, formulaId: 'F', current: 'Aqua, Parfum' };
  // ไม่บังคับ = ไม่ยุ่งกับสูตรเลย แม้ส่งค่ามา
  assert.deepEqual(ingredientListGate({ required: false }, { ingredientList: 'x' }), { error: null, write: null });
  assert.deepEqual(ingredientListGate(null, {}), { error: null, write: null });
  // สูตรยังไม่มี
  assert.deepEqual(ingredientListGate(none, {}), { error: INGREDIENT_LIST_REQUIRED_REASON, write: null });
  assert.deepEqual(ingredientListGate(none, { ingredientList: '  ' }), { error: INGREDIENT_LIST_REQUIRED_REASON, write: null });
  assert.deepEqual(ingredientListGate(none, { ingredientList: ' Aqua ' }), { error: null, write: 'Aqua' });
  // สูตรมีแล้ว
  assert.deepEqual(ingredientListGate(has, {}), { error: null, write: null });
  assert.deepEqual(ingredientListGate(has, { ingredientList: 'Aqua, Parfum' }), { error: null, write: null });
  assert.deepEqual(ingredientListGate(has, { ingredientList: 'Aqua, Parfum, Linalool' }), { error: null, write: 'Aqua, Parfum, Linalool' });
  // ลบทิ้งระหว่างใส่ราคาไม่ได้ — ต้องแก้ที่หน้าสูตร
  assert.deepEqual(ingredientListGate(has, { ingredientList: '' }), { error: INGREDIENT_LIST_REQUIRED_REASON, write: null });
  // ยาวเกิน = เหตุเรื่องความยาว ไม่ใช่ "ต้องใส่"
  assert.match(ingredientListGate(none, { ingredientList: 'a'.repeat(INGREDIENT_LIST_MAX_LENGTH + 1) }).error, /ยาวเกิน/);
});

test('🔴 route ขั้นราคา: ด่าน Ingredient List ก่อนเขียนอะไร · ใช้กับทั้งใส่ราคาใหม่และ "ใช้ราคานี้" · ลงทะเบียนสูตร', () => {
  const route = src('../../app/api/sa/requests/[id]/items/[itemId]/price/route.js');
  const gate = route.indexOf('ingredientListGate(ingredient, body)');
  assert.ok(gate > 0, 'ต้องเรียกด่านตัวกลาง');
  // ด่านอยู่ก่อนแยกทาง useCurrent และก่อนเขียนราคา
  assert.ok(gate < route.indexOf('if (body?.useCurrent)'));
  assert.ok(gate < route.indexOf('await priceRegistrySlots('));
  // ทั้งสองทางเขียน Ingredient List ก่อนปิดแถว
  assert.equal((route.match(/await saveIngredientList\(supabase,/g) || []).length, 2);
  const useFn = route.slice(route.indexOf('async function linkCurrentPrice'), route.indexOf('async function saveIngredientList'));
  assert.ok(useFn.indexOf('saveIngredientList') < useFn.indexOf('settleRow'), '"ใช้ราคานี้" ต้องเขียนสูตรก่อนปิดแถว');
  // ค่าไปลงทะเบียนสูตร (ตัวเขียนเดียวกับหน้าทะเบียน) + audit ของสูตร
  const save = route.slice(route.indexOf('async function saveIngredientList'));
  assert.match(save, /updateFormula\(supabase, write\.formulaId, \{ ingredientList: write\.value \}\)/);
  assert.match(save, /entityType: 'formula'/);
});

test('🔴 แผนของแถวคิดจากสูตรสดตัวเดียวกับช่องราคา — GET หน้าใบ · หน้า "รอใส่ราคา" · POST เห็นด่านชุดเดียวกัน', () => {
  const admin = src('./scentFormulaAdmin.js');
  assert.match(admin, /ingredient: rowIngredientPlan\(formula\)/);
  assert.match(admin, /return \{ slots, blocker, ingredient \};/);
  const detail = src('../../app/api/sa/requests/[id]/route.js');
  assert.match(detail, /item\.ingredientPlan = plan\.ingredient/);
  const page = src('../../app/requests/[id]/page.js');
  assert.match(page, /ingredient=\{pricing\?\.item\.ingredientPlan \|\| null\}/);
});

test('API แก้สูตร: action แยก `ingredients` (ไม่อยู่ในฟอร์มแก้) · RD เท่านั้น · สูตรที่ต้องมีลบทิ้งไม่ได้', () => {
  const route = src('../../app/api/master/formulas/[id]/route.js');
  const block = route.slice(route.indexOf("if (action === 'ingredients')"), route.indexOf("if (action === 'edit')"));
  assert.match(block, /isFormulaRegistrar\(user\)/);
  assert.match(block, /!value && formulaNeedsIngredientList\(formula\)/);
  assert.match(block, /recordAudit\(/);
  // ฟอร์มแก้สูตรต้องไม่ส่ง/รับช่องนี้ — ถูกใช้จากหน้าคำร้องด้วย (ค่าว่างทับเงียบ)
  assert.doesNotMatch(src('./formulas.js'), /ingredientList/);
  assert.doesNotMatch(src('../../components/database/FormulaForm.js'), /ingredientList/);
});
