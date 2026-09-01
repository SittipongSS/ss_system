import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProductCategorySelectable,
  normalizeProductCategoryInput,
  PROTECTED_PRODUCT_CATEGORY_CODES,
  productCategoryCode,
  productCategoryDeleteBlocker,
} from './productCategory';

test('product category codes are normalized and strictly shaped', () => {
  const { value, errors } = normalizeProductCategoryInput({
    mainCategoryCode: ' 05 ', typeCode: ' 007 ', mainCategoryName: ' บริการ ',
    nameTh: ' ค่าบริการ ', nameEn: '', note: '',
  });
  assert.deepEqual(errors, []);
  assert.equal(productCategoryCode(value), '05-007');
  assert.equal(value.mainCategoryName, 'บริการ');
  assert.equal(value.nameTh, 'ค่าบริการ');
  assert.equal(value.nameEn, null);
});

test('product category requires fixed codes and at least one item name', () => {
  const { errors } = normalizeProductCategoryInput({
    mainCategoryCode: '5', typeCode: '7A', mainCategoryName: '', nameTh: '', nameEn: '',
  });
  assert.ok(errors.includes('รหัสหมวดหลักต้องเป็นตัวเลข 2 หลัก'));
  assert.ok(errors.includes('รหัสหมวดรองต้องเป็นตัวเลข 3 หลัก'));
  assert.ok(errors.includes('กรุณาระบุชื่อหมวดหลัก'));
  assert.ok(errors.includes('กรุณาระบุชื่อหมวดสินค้าอย่างน้อย 1 ภาษา'));
});

test('ช่องติ๊กกำกับดูแล (mig 0131): default false, รับเฉพาะ boolean, partial ไม่แตะค่าเดิม', () => {
  // สร้างใหม่ไม่ส่งธง → default false ทั้งคู่ (ตรงกับ DB DEFAULT false)
  const created = normalizeProductCategoryInput({
    mainCategoryCode: '05', typeCode: '007', mainCategoryName: 'บริการ', nameTh: 'ค่าบริการ',
  });
  assert.equal(created.value.isExcise, false);
  assert.equal(created.value.requiresFdaNotice, false);

  const flagged = normalizeProductCategoryInput({
    mainCategoryCode: '05', typeCode: '007', mainCategoryName: 'บริการ', nameTh: 'ค่าบริการ',
    isExcise: true, requiresFdaNotice: true,
  });
  assert.equal(flagged.value.isExcise, true);
  assert.equal(flagged.value.requiresFdaNotice, true);

  // partial (PATCH) ไม่ส่งธง → ไม่อยู่ใน value (ไม่ทับค่าเดิมใน DB)
  const partial = normalizeProductCategoryInput({ nameTh: 'ชื่อใหม่' }, { partial: true });
  assert.ok(!('isExcise' in partial.value));
  assert.ok(!('requiresFdaNotice' in partial.value));

  // ค่าที่ไม่ใช่ boolean ถูกปฏิเสธ — กัน "true"/1 หลุดมาจาก client อื่น
  const invalid = normalizeProductCategoryInput({ isExcise: 'true' }, { partial: true });
  assert.ok(invalid.errors.some((error) => error.includes('isExcise')));
});

test('inactive category remains selectable only for its current historic value', () => {
  const row = { mainCategoryCode: '01', typeCode: '002', isActive: false };
  assert.equal(isProductCategorySelectable(row), false);
  assert.equal(isProductCategorySelectable(row, '01-002'), true);
});


// ── ลบหมวดสินค้า (มติผู้ใช้ 2026-09-01) ──────────────────────────────────
test('หมวดที่ยังไม่มีใครใช้และไม่ถูกโค้ดอ้าง ลบได้ (คืนสตริงว่าง)', () => {
  const row = { mainCategoryCode: '05', typeCode: '007' };
  assert.equal(productCategoryDeleteBlocker(row, { usage: { total: 0 }, protectedCode: false }), '');
});

test('หมวดที่โค้ดอ้างตรง ๆ ลบไม่ได้แม้ยังไม่มีใครใช้เลย (usage 0)', () => {
  const row = { mainCategoryCode: '02', typeCode: '001' };
  const why = productCategoryDeleteBlocker(row, { usage: { total: 0 }, protectedCode: true });
  assert.match(why, /โค้ด/);
  assert.match(why, /พักใช้/);
});

test('หมวดที่มีสินค้า/ดีล/โครงการผูกอยู่ ลบไม่ได้ พร้อมบอกจำนวนแยกประเภท', () => {
  const row = { mainCategoryCode: '01', typeCode: '002' };
  const why = productCategoryDeleteBlocker(row, {
    usage: { total: 5, products: 3, deals: 2 }, protectedCode: false,
  });
  assert.match(why, /3 สินค้า/);
  assert.match(why, /2 ดีล/);
  assert.doesNotMatch(why, /โครงการ/);   // projects เป็น 0 — ไม่โผล่ในรายละเอียด
});

test('ไม่มีแถว = ปฏิเสธก่อนดูเงื่อนไขอื่น', () => {
  assert.match(productCategoryDeleteBlocker(null, { usage: { total: 0 } }), /ไม่พบหมวด/);
});

test('รหัสที่โค้ดอ้างครบตามที่ประกาศไว้ — ห้ามลดจำนวนโดยไม่แก้ไฟล์ที่อ้างจริง', () => {
  for (const code of [
    '02-001', // SERVICE_ROUND_CATEGORY
    '02-020', // PDR_FRAGRANCE_OIL_CODE
    '03-001', '03-002', '03-005', '03-008', '03-009', '03-010', // SCENT_DESIGN_CATEGORIES
    '01-001', '02-010', // standardPreview.js
  ]) {
    assert.ok(PROTECTED_PRODUCT_CATEGORY_CODES.includes(code), `${code} หายจากลิสต์กันลบ`);
  }
  assert.equal(PROTECTED_PRODUCT_CATEGORY_CODES.length, 10);
});
