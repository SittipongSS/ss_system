// ชั้นฐานของชุดของขวัญ (mig 0403) — ตัวโหลดหลายสินค้าในคราวเดียว (ไฟล์ export) กับตัวโหลดรายสินค้า (หน้าสินค้า/ใบสเปค)
// ต้องได้ของชุดเดียวกัน · ใช้ supabase ปลอม ไม่แตะฐานจริง. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProductFormulas, loadProductFormulasMany } from './giftSetFormulasStore.js';

function fakeSupabase(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const q = {
        select: () => q,
        in: (col, values) => { rows = rows.filter((r) => values.includes(r[col])); return q; },
        eq: (col, value) => { rows = rows.filter((r) => r[col] === value); return q; },
        order: () => q,
        range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        then: (ok, fail) => Promise.resolve({ data: rows, error: null }).then(ok, fail),
      };
      return q;
    },
  };
}

const DB = {
  product_formulas: [
    { id: 'PFM-b', productId: 'P1', formulaId: 'F2', categoryCode: '01-006', sortOrder: 1 },
    { id: 'PFM-a', productId: 'P1', formulaId: 'F1', categoryCode: '01-002', sortOrder: 0 },
    { id: 'PFM-c', productId: 'P2', formulaId: 'F1', categoryCode: '01-002', sortOrder: 0 },
  ],
  formulas: [
    { id: 'F1', code: 'PF001', name: 'Midnight #1', formulaDate: '2026-09-10', categoryCode: '01-002', scentId: 'S1', status: 'accepted' },
    { id: 'F2', code: null, name: 'Midnight Reed', formulaDate: null, categoryCode: '01-006', scentId: null, status: 'draft' },
  ],
  scents: [{ id: 'S1', name: 'Midnight' }],
  product_types: [
    { mainCategoryCode: '01', typeCode: '002', nameTh: 'น้ำหอมสำหรับผิวกาย', nameEn: 'BODY PERFUME' },
    { mainCategoryCode: '01', typeCode: '006', nameTh: 'ก้านหอมปรับอากาศ', nameEn: 'REED DIFFUSER' },
  ],
};

test('หลายสินค้าในคราวเดียว: แยกรายสินค้า · เรียงตามลำดับในชุด · ชื่อหมวด/สูตร/กลิ่นจากทะเบียนสด', async () => {
  const map = await loadProductFormulasMany(fakeSupabase(DB), ['P1', 'P2', 'P3']);
  assert.deepEqual([...map.keys()].sort(), ['P1', 'P2'], 'สินค้าที่ไม่มีรายการไม่อยู่ใน Map');
  assert.deepEqual(map.get('P1').map((r) => [r.id, r.categoryCode, r.formulaCode]), [['PFM-a', '01-002', 'PF001'], ['PFM-b', '01-006', null]]);
  const [perfume, reed] = map.get('P1');
  assert.equal(perfume.categoryName, 'น้ำหอมสำหรับผิวกาย');
  assert.equal(perfume.categoryNameEn, 'BODY PERFUME');
  assert.equal(perfume.scentName, 'Midnight');
  assert.equal(reed.formulaName, 'Midnight Reed');
  assert.equal(reed.formulaStatus, 'draft');
  assert.equal(map.get('P2').length, 1, 'สูตรเดียวกันอยู่ได้หลายชุด');
});

test('ตัวโหลดรายสินค้าได้ของชุดเดียวกับตัวโหลดหลายสินค้า · ไม่มีรายการ = อาเรย์ว่าง', async () => {
  const supabase = fakeSupabase(DB);
  assert.deepEqual(await loadProductFormulas(supabase, 'P1'), (await loadProductFormulasMany(supabase, ['P1'])).get('P1'));
  assert.deepEqual(await loadProductFormulas(supabase, 'P9'), []);
  assert.equal((await loadProductFormulasMany(supabase, [])).size, 0);
});
