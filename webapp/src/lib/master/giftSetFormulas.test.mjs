// ชุดของขวัญ (01-037) ผูกได้หลายสูตร สูตรละหนึ่งหมวด — มติผู้ใช้ 2026-10-05 · mig 0403. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GIFT_SET_CATEGORY_CODE, giftSetComponentCategories, giftSetFormError, giftSetFormulaChoices, giftSetFormulasError,
  isGiftSetCategory, isGiftSetComponentCategory, normalizeGiftSetFormulas, sameGiftSetFormulas,
} from './giftSetFormulas.js';

const PERFUME = { id: 'FML-1', code: 'PF001', name: 'Midnight #1', categoryCode: '01-002', status: 'accepted' };
const REED = { id: 'FML-2', code: 'PF002', name: 'Midnight Reed', categoryCode: '01-006', status: 'accepted' };
const LOOSE = { id: 'FML-3', code: null, name: 'Secret Valley #1', categoryCode: null, status: 'draft' };
const OLD = { id: 'FML-4', code: 'PF004', name: 'Old Perfume', categoryCode: '01-002', status: 'archived' };
const FORMULAS = [PERFUME, REED, LOOSE, OLD];
const byId = new Map(FORMULAS.map((f) => [f.id, f]));

test('เฉพาะหมวด 01-037 เป็นชุดของขวัญ', () => {
  assert.equal(GIFT_SET_CATEGORY_CODE, '01-037');
  assert.equal(isGiftSetCategory('01-037'), true);
  assert.equal(isGiftSetCategory(' 01-037 '), true);
  for (const code of ['01-002', '02-037', '01-0370', '', null, undefined]) assert.equal(isGiftSetCategory(code), false, String(code));
});

test('หมวดของแถวสูตร = กลุ่ม 01 ยกเว้นตัวชุดเอง', () => {
  assert.equal(isGiftSetComponentCategory('01-002'), true);
  assert.equal(isGiftSetComponentCategory('01-051'), true);
  for (const code of ['01-037', '02-020', '03-001', '01', '01-', '', null]) {
    assert.equal(isGiftSetComponentCategory(code), false, String(code));
  }
  const types = [
    { mainCategoryCode: '01', typeCode: '002' }, { mainCategoryCode: '01', typeCode: '037' },
    { mainCategoryCode: '02', typeCode: '020' }, { mainCategoryCode: '01', typeCode: '006' },
  ];
  assert.deepEqual(giftSetComponentCategories(types).map((t) => t.typeCode), ['002', '006']);
});

test('ลิสต์สูตรกรองตามหมวด: หมวดเดียวกัน + สูตรที่ยังไม่ระบุหมวด · ไม่มีของกรุ · ยังไม่เลือกหมวด = ว่าง', () => {
  assert.deepEqual(giftSetFormulaChoices(FORMULAS, '01-002').map((f) => f.id), ['FML-1', 'FML-3']);
  assert.deepEqual(giftSetFormulaChoices(FORMULAS, '01-006').map((f) => f.id), ['FML-2', 'FML-3']);
  assert.deepEqual(giftSetFormulaChoices(FORMULAS, ''), []);
});

test('สูตรที่แถวถืออยู่คงอยู่ในลิสต์เสมอ — แม้เก็บเข้ากรุ หรือยังไม่เลือกหมวด (เปิดแก้แล้วไม่หลุดเงียบ)', () => {
  assert.ok(giftSetFormulaChoices(FORMULAS, '01-002', 'FML-4').some((f) => f.id === 'FML-4'));
  assert.deepEqual(giftSetFormulaChoices(FORMULAS, '', 'FML-2').map((f) => f.id), ['FML-2']);
});

test('normalize: แถวว่างทั้งสองช่องทิ้ง · ตัดช่องว่าง · คีย์อื่นของจอ (key/id/ชื่อ) ไม่ติดไป · ไม่ใช่อาเรย์ = ว่าง', () => {
  assert.deepEqual(normalizeGiftSetFormulas([
    { key: 'draft-1', categoryCode: ' 01-002 ', formulaId: ' FML-1 ' },
    { key: 'draft-2', categoryCode: '', formulaId: '' },
    { id: 'PFM-x', categoryCode: '01-006', formulaId: 'FML-2', categoryName: 'ก้านหอม' },
  ]), [
    { formulaId: 'FML-1', categoryCode: '01-002' },
    { formulaId: 'FML-2', categoryCode: '01-006' },
  ]);
  for (const raw of [undefined, null, '', {}, 'FML-1']) assert.deepEqual(normalizeGiftSetFormulas(raw), [], String(raw));
});

test('ตรวจรายการ: ทุกแถวมีหมวด (กลุ่ม 01) + สูตร · สูตรไม่ซ้ำ · บอกแถวที่ผิด', () => {
  assert.equal(giftSetFormulasError([]), '', 'ชุดที่ยังไม่ผูกสูตร = บันทึกได้ (สูตรไม่บังคับ เหมือน FG สูตรเดี่ยว)');
  assert.equal(giftSetFormulasError([{ formulaId: 'FML-1', categoryCode: '01-002' }, { formulaId: 'FML-2', categoryCode: '01-006' }]), '');
  assert.match(giftSetFormulasError([{ formulaId: 'FML-1', categoryCode: '' }]), /แถวที่ 1.*เลือกหมวด/);
  assert.match(giftSetFormulasError([{ formulaId: 'FML-1', categoryCode: '01-002' }, { formulaId: '', categoryCode: '01-006' }]), /แถวที่ 2.*ยังไม่ได้เลือกสูตร/);
  assert.match(giftSetFormulasError([{ formulaId: 'FML-1', categoryCode: '01-037' }]), /ใช้ในชุดของขวัญไม่ได้/);
  assert.match(giftSetFormulasError([{ formulaId: 'FML-1', categoryCode: '02-020' }]), /กลุ่ม 01/);
  assert.match(giftSetFormulasError([
    { formulaId: 'FML-3', categoryCode: '01-002' }, { formulaId: 'FML-3', categoryCode: '01-006' },
  ]), /แถวที่ 2.*ซ้ำ/);
});

test('ตรวจกับทะเบียน: สูตรต้องมีจริง · หมวดของสูตรต้องตรงกับแถว · สูตรไม่มีหมวดใส่ได้ทุกหมวด', () => {
  const ok = [{ formulaId: 'FML-1', categoryCode: '01-002' }, { formulaId: 'FML-3', categoryCode: '01-022' }];
  assert.equal(giftSetFormulasError(ok, { formulasById: byId }), '');
  assert.match(giftSetFormulasError([{ formulaId: 'FML-9', categoryCode: '01-002' }], { formulasById: byId }), /ไม่พบสูตร/);
  const wrong = giftSetFormulasError([{ formulaId: 'FML-1', categoryCode: '01-006' }], {
    formulasById: byId, categoryName: (code) => ({ '01-002': 'น้ำหอมสำหรับผิวกาย', '01-006': 'ก้านหอมปรับอากาศ' })[code],
  });
  assert.match(wrong, /PF001/);
  assert.match(wrong, /01-002 น้ำหอมสำหรับผิวกาย/);
  assert.match(wrong, /ไม่ใช่ 01-006 ก้านหอมปรับอากาศ/);
});

test('ด่านฝั่งจอ: หมวดอื่นผ่านเสมอ (API ล้างรายการเอง) · ชุดของขวัญใช้ตัวตรวจเดียวกับ API', () => {
  const broken = [{ key: 'a', categoryCode: '01-002', formulaId: '' }];
  assert.equal(giftSetFormError('01-002', broken, FORMULAS), '');
  assert.match(giftSetFormError('01-037', broken, FORMULAS), /ยังไม่ได้เลือกสูตร/);
  assert.match(giftSetFormError('01-037', [{ categoryCode: '01-006', formulaId: 'FML-1' }], FORMULAS), /PF001/);
  // ทะเบียนยังโหลดไม่เสร็จ (ลิสต์ว่าง) = ตรวจเฉพาะรูปของรายการ ไม่ฟ้องว่า "ไม่พบสูตร" ทุกแถว
  assert.equal(giftSetFormError('01-037', [{ categoryCode: '01-006', formulaId: 'FML-1' }], []), '');
});

test('เทียบรายการ: ลำดับนับด้วย (ลำดับ = ลำดับที่ใบสเปคพิมพ์)', () => {
  const a = [{ formulaId: 'FML-1', categoryCode: '01-002' }, { formulaId: 'FML-2', categoryCode: '01-006' }];
  assert.equal(sameGiftSetFormulas(a, a.map((r) => ({ ...r, id: 'PFM-x', sortOrder: 9 }))), true);
  assert.equal(sameGiftSetFormulas(a, [...a].reverse()), false);
  assert.equal(sameGiftSetFormulas(a, a.slice(0, 1)), false);
  assert.equal(sameGiftSetFormulas(a, [a[0], { ...a[1], categoryCode: '01-022' }]), false);
  assert.equal(sameGiftSetFormulas([], []), true);
});

test('migration 0403: ตาราง + RPC ทับทั้งชุด · anon/authenticated เรียก RPC ไม่ได้ · คีย์ของแถวตรงกับที่ store ส่ง', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0403_product_gift_set_formulas.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.product_formulas/);
  assert.match(sql, /"formulaId"\s+text NOT NULL REFERENCES public\.formulas\(id\) ON DELETE CASCADE/);
  assert.match(sql, /UNIQUE \("productId", "formulaId"\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.replace_product_formulas\(text, jsonb\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  // replaceProductFormulas (giftSetFormulasStore.js) ส่ง id · formulaId · categoryCode · sortOrder — คีย์ที่ไม่ได้ประกาศถูกทิ้งเงียบ
  const recordset = sql.slice(sql.indexOf('jsonb_to_recordset'), sql.indexOf(');', sql.indexOf('jsonb_to_recordset')));
  for (const key of ['id', '"formulaId"', '"categoryCode"', '"sortOrder"']) assert.ok(recordset.includes(key), key);
});

/* 🪤 ชุดของขวัญถือสูตรผ่าน `product_formulas` ไม่ใช่ `products.formulaId` — จุดไหนถามแค่คอลัมน์เดิม ชุดของขวัญหายจากด่านนั้นเงียบ ๆ
   (ลบสูตรที่ชุดใช้อยู่ได้ · เลิกแชร์ลูกค้าที่ใช้อยู่ได้ · ทะเบียนสูตรไม่บอกว่า FG ไหนใช้) ⇒ ล็อกด้วยรูปโค้ด เพราะ route/admin เรียกตรงในเทสต์ไม่ได้ */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const source = (path) => codeOnly(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('ทุกด่าน "ใครใช้สูตรนี้" นับชุดของขวัญด้วย — ทะเบียนสูตร · ด่านก่อนลบ · ด่านเลิกแชร์ · พรีวิวบังคับลบ', () => {
  const admin = source('./scentFormulaAdmin.js');
  assert.match(admin, /async function attachFormulaUsage[\s\S]*?giftSetsUsingFormulas\(/, 'ทะเบียนสูตร (usedByProducts)');
  assert.match(admin, /export async function countProductsUsingFormula[\s\S]*?countGiftSetsUsingFormula\(/, 'ด่านก่อนลบสูตร');
  assert.match(admin, /head\('product_formulas', 'formulaId'\)/, 'countRegistryDependents ฝั่งสูตร');
  const shares = source('./registrySharesAdmin.js');
  assert.equal((shares.match(/giftSetsUsingFormulas\(/g) || []).length, 2, 'ด่านเลิกแชร์ทั้งฝั่งกลิ่นและฝั่งสูตร');
  assert.match(source('../forceDelete.js'), /countBy\(supabase, 'product_formulas', 'formulaId', formula\.id\)/, 'พรีวิวบังคับลบสูตร');
});

test('route สินค้า: ตรวจรายการก่อนเขียน · เขียนรายการหลังแถวสินค้า · แก้สูตรในชุด = อนุมัติใหม่ · GET แนบรายการ', () => {
  const create = source('../../app/api/products/route.js');
  assert.ok(create.indexOf('planGiftSetFormulas(') < create.indexOf("from('products').insert("), 'POST ตรวจกับทะเบียนก่อน insert');
  assert.ok(create.indexOf("from('products').insert(") < create.indexOf('replaceProductFormulas('), 'POST เขียนรายการหลังได้ productId');
  const patch = source('../../app/api/products/[id]/route.js');
  const push = patch.indexOf("changedFields.push('formulaComponents')");
  assert.ok(push > 0 && push < patch.indexOf('resetApprovalOnEdit('), 'นับเข้า changedFields ก่อนตัดสินอนุมัติใหม่');
  assert.ok(patch.indexOf(".from('products')\n    .update(updated)") < patch.indexOf('replaceProductFormulas(supabase, id'),
    'PATCH เขียนรายการหลังแถวสินค้า (แถวตกกลับรออนุมัติก่อน)');
  assert.match(patch, /formulaComponents = await loadProductFormulas\(supabase, id\)/, 'GET แนบรายการให้หน้าสินค้า/โมดัลแก้');
});
