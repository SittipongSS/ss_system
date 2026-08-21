import test from 'node:test';
import assert from 'node:assert/strict';

import { brandDisplayFromList, brandLabel, clearedBrandFields, hasBrandField } from './brands.js';

test('system brand labels render one official language: EN before TH', () => {
  assert.equal(brandLabel('วันซ์อะพอนอะไทย', 'Once Upon A Thai'), 'Once Upon A Thai');
  assert.equal(brandLabel('แบรนด์ไทย', ''), 'แบรนด์ไทย');
  assert.equal(brandLabel('', 'English Brand'), 'English Brand');
});

test('legacy single-language values resolve through the customer brand master', () => {
  const brands = [{ th: 'วันซ์อะพอนอะไทย', en: 'Once Upon A Thai' }];
  assert.equal(brandDisplayFromList(brands, 'วันซ์อะพอนอะไทย'), 'Once Upon A Thai');
  assert.equal(brandDisplayFromList(brands, 'Once Upon A Thai'), 'Once Upon A Thai');
  assert.equal(brandDisplayFromList(brands, 'Legacy'), 'Legacy');
});

// ── กลุ่ม 03/04 ไม่มีแบรนด์ (มติผู้ใช้ 2026-08-21) ─────────────────────────
test('03 ค่าออกแบบ · 04 รายได้อื่นๆ ไม่มีช่องแบรนด์', () => {
  for (const categoryCode of ['03-002', '03-001', '04-001', '04-010']) {
    assert.equal(hasBrandField({ categoryCode }), false, categoryCode);
  }
});

test('01 ODM · 02 ธุรกิจบริการ ยังมีช่องแบรนด์เหมือนเดิม', () => {
  for (const categoryCode of ['01-002', '01-037', '02-020', '02-001']) {
    assert.equal(hasBrandField({ categoryCode }), true, categoryCode);
  }
});

test('อ่านหมวดไม่ออก = ถือว่ามีแบรนด์ ไม่ให้ช่องหายไปเงียบ ๆ', () => {
  for (const record of [null, {}, { categoryCode: '' }, { fgCode: 'LEGACY' }]) {
    assert.equal(hasBrandField(record), true, JSON.stringify(record));
  }
});

test('categoryCode ว่าง อ่านย้อนจาก fgCode ได้ · รับรหัสหมวดตรง ๆ ได้ด้วย', () => {
  assert.equal(hasBrandField({ fgCode: 'FG-890-03-002' }), false);
  assert.equal(hasBrandField({ fgCode: 'FG-657-01-002-2065' }), true);
  assert.equal(hasBrandField('03-002'), false);
  assert.equal(hasBrandField('01'), true);
});

test('ล้างชื่อแบรนด์เฉพาะกลุ่มที่ไม่มีแบรนด์ — ย้ายหมวดข้ามกลุ่มแล้วค่าเก่าต้องไม่ติดไป', () => {
  assert.deepEqual(clearedBrandFields('03-002'), { brandName: null, brandNameEn: null });
  assert.deepEqual(clearedBrandFields({ categoryCode: '04-001' }), { brandName: null, brandNameEn: null });
  assert.deepEqual(clearedBrandFields('01-002'), {});
  assert.deepEqual(clearedBrandFields({}), {});
});
