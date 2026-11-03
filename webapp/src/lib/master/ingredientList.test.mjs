// ม-158 · Ingredient List ของสูตร (มติเจ้าของ 03/11/2026 · mig 0423)
//   ข้อความยาวช่องเดียวบนทะเบียนสูตร · แถวที่ผูกสูตรหมวด 01/02 (ยกเว้น 02-020 หัวน้ำหอม) ต้องมีถึงจบ
// ม-159 · แยกก้าวจากราคา (มาไม่พร้อมกัน) แต่ต้องครบทั้งสองอย่างถึงจบงาน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INGREDIENT_LIST_MAX_LENGTH, INGREDIENT_LIST_REQUIRED_REASON, formulaNeedsIngredientList, ingredientListInput,
  ingredientListMissing, normalizeIngredientList, rowIngredientPlan,
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

test('ม-159 ตัวตัดสิน: ขาด Ingredient List = ต้องมีแต่สูตรยังไม่มี · ค่าที่ส่งมาว่าง = ตีกลับเมื่อสูตรต้องมี', () => {
  assert.equal(ingredientListMissing({ required: true, current: null }), true);
  assert.equal(ingredientListMissing({ required: true, current: 'Aqua' }), false);
  assert.equal(ingredientListMissing({ required: false, current: null }), false);
  assert.equal(ingredientListMissing(null), false);
  assert.deepEqual(ingredientListInput(' Aqua '), { value: 'Aqua', error: null });
  assert.deepEqual(ingredientListInput('  '), { value: null, error: INGREDIENT_LIST_REQUIRED_REASON });
  // สูตรที่ไม่ต้องมี (02-020) ลบให้ว่างได้จากหน้าสูตร
  assert.deepEqual(ingredientListInput('', { required: false }), { value: null, error: null });
  assert.match(ingredientListInput('a'.repeat(INGREDIENT_LIST_MAX_LENGTH + 1)).error, /ยาวเกิน/);
});

test('🔴 ม-159 route ขั้นราคา: ไม่รับ Ingredient List แล้ว · สูตรยังขาด = ลงราคาแต่แถวไม่จบ (ทั้งใส่ราคาใหม่และ "ใช้ราคานี้")', () => {
  const route = src('../../app/api/sa/requests/[id]/items/[itemId]/price/route.js');
  assert.doesNotMatch(route, /body\.ingredientList|saveIngredientList|updateFormula/);
  assert.match(route, /const waitIngredients = ingredientListMissing\(ingredient\);/);
  assert.equal((route.match(/if \(waitIngredients\) await recordRowPrice\(supabase,/g) || []).length, 2);
  assert.equal((route.match(/else await settleRow\(supabase,/g) || []).length, 2);
});

test('🔴 ม-159 ทางใส่ Ingredient List: ตัวเขียนเดียว (แถวคำร้อง · หน้าสูตร) และปิดแถวที่ใส่ราคาไว้รออยู่', () => {
  const row = src('../../app/api/sa/requests/[id]/items/[itemId]/ingredients/route.js');
  // ด่านชุดเดียวกับขั้นราคา + แถวคอนเฟิร์มแล้วยังไม่จบ + สูตรต้องมี
  for (const gate of ['canReadRequestRow(user, before)', 'canAnswerRequest(user, before)',
    'REQUEST_OPEN_STATUSES.includes(before.status)', 'isConfirmedOpenRow(row)', 'rowIngredientPlan(formula).required']) {
    assert.ok(row.includes(gate), gate);
  }
  assert.match(row, /saveFormulaIngredientList\(supabase,/);
  const formula = src('../../app/api/master/formulas/[id]/route.js');
  const block = formula.slice(formula.indexOf("if (action === 'ingredients')"), formula.indexOf("if (action === 'edit')"));
  assert.match(block, /isFormulaRegistrar\(user\)/);
  assert.match(block, /ingredientListInput\(body\.ingredientList, \{ required: formulaNeedsIngredientList\(formula\) \}\)/);
  assert.match(block, /saveFormulaIngredientList\(supabase,/);
  // ตัวเขียน: ปิดเฉพาะแถวที่ "รอ Ingredient List" ของสูตรนี้ ในใบที่ยังเปิด ผ่าน settleRow ตัวกลาง
  const admin = src('./ingredientListAdmin.js');
  assert.match(admin, /\.eq\('producedFormulaId', formula\.id\)/);
  assert.match(admin, /REQUEST_OPEN_STATUSES\.includes\(ask\.status\)/);
  assert.match(admin, /rowStage\(i\) === 'awaiting_ingredients'/);
  assert.match(admin, /await settleRow\(supabase, \{ id: requestId, itemId: row\.id, revisionId: row\.answeredRevisionId/);
  assert.match(admin, /kind: 'ingredients'/);
});

test('🔴 แผนของแถวคิดจากสูตรสดตัวเดียวกับช่องราคา — GET หน้าใบ · หน้า "รอใส่ราคา" · POST เห็นด่านชุดเดียวกัน', () => {
  const admin = src('./scentFormulaAdmin.js');
  assert.match(admin, /ingredient: rowIngredientPlan\(formula\)/);
  assert.match(admin, /return \{ slots, blocker, ingredient \};/);
  const detail = src('../../app/api/sa/requests/[id]/route.js');
  assert.match(detail, /item\.ingredientPlan = plan\.ingredient/);
  assert.match(detail, /filter\(isConfirmedOpenRow\)/);
  const page = src('../../app/requests/[id]/page.js');
  // ม-159 — โมดัลราคาไม่รับแผนนี้แล้ว · ปุ่ม/โมดัล Ingredient List แยกของมันเอง
  assert.doesNotMatch(page, /ingredient=\{pricing/);
  assert.match(page, /onIngredients: \(row\) => setIngredientItem\(row\)/);
  assert.match(page, /current=\{ingredientItem\?\.ingredientPlan\?\.current \|\| null\}/);
});

test('API แก้สูตร: Ingredient List ไม่อยู่ในฟอร์มแก้ (ถูกใช้จากหน้าคำร้องด้วย — ค่าว่างทับเงียบ)', () => {
  assert.doesNotMatch(src('./formulas.js'), /ingredientList/);
  assert.doesNotMatch(src('../../components/database/FormulaForm.js'), /ingredientList/);
});
