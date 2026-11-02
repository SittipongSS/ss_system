// FG หมวดหัวน้ำหอม (02-020) ผูกกลิ่นจากทะเบียน ไม่ผูกสูตร — มติผู้ใช้ 2026-11-02. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRAGRANCE_OIL_CATEGORY_CODE, fragranceOilScentChoices, fragranceOilScentError, isFragranceOilCategory,
} from './fragranceOilScent.js';
import { DELIVERED_FRAGRANCE_CODE } from '../requests/deliveredCategory.js';
import { productScentSnapshot } from './scentFormulaAdmin.js';

const ACTIVE = { id: 'SCT-1', code: 'PF859010103', name: 'THE MOMENT OF TEA TIME #3', status: 'active' };
const DEVELOPING = { id: 'SCT-2', code: 'PF154030101', name: 'GREEN REFRESH', status: 'developing' };
const DRAFT = { id: 'SCT-3', code: null, name: 'Secret Valley', status: 'draft' };
const RETIRED = { id: 'SCT-4', code: 'PF001', name: 'Old Oil', status: 'archived' };
const SCENTS = [ACTIVE, DEVELOPING, DRAFT, RETIRED];

test('หมวดหัวน้ำหอมของ FG = ตัวเดียวกับที่สายขอ RD นับเป็น "ส่งเป็นหัวน้ำหอม"', () => {
  assert.equal(FRAGRANCE_OIL_CATEGORY_CODE, '02-020');
  assert.equal(FRAGRANCE_OIL_CATEGORY_CODE, DELIVERED_FRAGRANCE_CODE);
  assert.equal(isFragranceOilCategory('02-020'), true);
  assert.equal(isFragranceOilCategory(' 02-020 '), true);
  for (const code of ['02-001', '01-020', '01-037', '02-0200', '', null, undefined]) {
    assert.equal(isFragranceOilCategory(code), false, String(code));
  }
});

test('ตัวเลือกกลิ่น = ใช้งานได้ (กำลังพัฒนา · ใช้งานได้) · ตัวที่ FG ถืออยู่คงอยู่เสมอ', () => {
  assert.deepEqual(fragranceOilScentChoices(SCENTS).map((s) => s.id), ['SCT-1', 'SCT-2']);
  // ตัวเดิมเลิกใช้ไปแล้ว — ต้องยังอยู่ ไม่งั้นเปิดแก้ชื่อสินค้าแล้วบันทึก กลิ่นหลุดเงียบ ๆ
  assert.deepEqual(fragranceOilScentChoices(SCENTS, 'SCT-4').map((s) => s.id), ['SCT-1', 'SCT-2', 'SCT-4']);
  assert.deepEqual(fragranceOilScentChoices(SCENTS, 'SCT-3').map((s) => s.id), ['SCT-1', 'SCT-2', 'SCT-3']);
  assert.deepEqual(fragranceOilScentChoices(null), []);
});

test('ด่านผูกกลิ่น: ไม่พบ · ร่าง · เลิกใช้ = ปฏิเสธ · ตัวเดิมผ่านเสมอ', () => {
  assert.equal(fragranceOilScentError(ACTIVE), null);
  assert.equal(fragranceOilScentError(DEVELOPING), null);
  assert.match(fragranceOilScentError(null), /ไม่พบกลิ่น/);
  assert.match(fragranceOilScentError(DRAFT), /Secret Valley.*รอเข้าทะเบียน/);
  assert.match(fragranceOilScentError(RETIRED), /เลิกใช้/);
  assert.equal(fragranceOilScentError(RETIRED, { currentScentId: 'SCT-4' }), null);
  assert.match(fragranceOilScentError(RETIRED, { currentScentId: 'SCT-1' }), /เลิกใช้/);
});

function fakeSupabase(rows) {
  return {
    from(table) {
      assert.equal(table, 'scents');
      let id = null;
      const chain = {
        select: () => chain,
        eq: (column, value) => { assert.equal(column, 'id'); id = value; return chain; },
        maybeSingle: async () => ({ data: rows.find((r) => r.id === id) || null, error: null }),
      };
      return chain;
    },
  };
}

test('productScentSnapshot: สูตรถูกล้างเสมอ · scentId จากทะเบียน · ว่าง = ถอดกลิ่น', async () => {
  const supabase = fakeSupabase(SCENTS);
  const cleared = { formulaId: null, formulaCode: null, formulaName: null, formulaDate: null };
  assert.deepEqual(await productScentSnapshot(supabase, 'SCT-1'), { ...cleared, scentId: 'SCT-1' });
  assert.deepEqual(await productScentSnapshot(supabase, ''), { ...cleared, scentId: null });
  assert.deepEqual(await productScentSnapshot(supabase, null), { ...cleared, scentId: null });
  await assert.rejects(productScentSnapshot(supabase, 'SCT-3'), /รอเข้าทะเบียน/);
  await assert.rejects(productScentSnapshot(supabase, 'NOPE'), /ไม่พบกลิ่น/);
  assert.deepEqual(
    await productScentSnapshot(supabase, 'SCT-4', { currentScentId: 'SCT-4' }), { ...cleared, scentId: 'SCT-4' },
  );
});

/* 🪤 route เรียกตรงในเทสต์ไม่ได้ ⇒ ล็อกรูปโค้ดสองจุดที่พังเงียบได้
   · PATCH: ช่องสูตรด้านบนล้าง scentId ตอนถอดสูตร (FG เดิมที่ผูกสูตร 02-020) — บล็อกหัวน้ำหอมต้องอยู่ **หลัง** มันถึงจะเขียนกลิ่นคืน
   · PATCH: ไม่ส่ง scentId (ปุ่มอนุมัติ/พักใช้) ต้องไม่แตะสูตร — ไม่งั้นปุ่มอนุมัติดึงสินค้ากลับไปรออนุมัติ */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const source = (path) => codeOnly(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('PATCH สินค้า: บล็อกหัวน้ำหอมอยู่หลังช่องสูตร · อ่าน scentId เฉพาะเมื่อส่งมา', () => {
  const patch = source('../../app/api/products/[id]/route.js');
  const formulaAt = patch.indexOf('productFormulaSnapshot(supabase, body.formulaId');
  const oilAt = patch.indexOf('isFragranceOilCategory(updated.categoryCode)');
  assert.ok(formulaAt > 0 && oilAt > formulaAt, 'บล็อกหัวน้ำหอมต้องตามหลังช่องสูตร');
  const oilBlock = patch.slice(oilAt, patch.indexOf('changedFieldsAgainst', oilAt));
  assert.match(oilBlock, /if \(body\.scentId !== undefined\) \{[\s\S]*?productScentSnapshot\(supabase, body\.scentId, \{ currentScentId: product\.scentId \}\)/);
  assert.doesNotMatch(oilBlock.slice(0, oilBlock.indexOf('} else if')), /formulaId: null/, 'ไม่ส่ง scentId ต้องไม่ล้างสูตร');
  assert.match(oilBlock, /else if \(isFragranceOilCategory\(product\.categoryCode\) && !updated\.formulaId\) \{\s*updated\.scentId = null;/);
});

test('POST สินค้า: หมวดหัวน้ำหอมผูกกลิ่นจาก scentId แทนสูตร', () => {
  const post = source('../../app/api/products/route.js');
  assert.match(post, /isFragranceOilCategory\(categoryCode\)\s*\?\s*await productScentSnapshot\(supabase, body\.scentId\)\s*:\s*await productFormulaSnapshot/);
});
