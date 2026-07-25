import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SALE_UNIT,
  SALE_UNITS,
  SALE_UNIT_MAX,
  VOLUME_UNITS,
  formatVolume,
  saleUnitOf,
  unitOptions,
} from './units.js';

test('หน่วยตั้งต้นต้องอยู่ในลิสต์จริง (กันตัวเลือกที่เลือกไม่ได้)', () => {
  assert.ok(SALE_UNITS.includes(DEFAULT_SALE_UNIT));
  assert.ok(VOLUME_UNITS.includes('ml'));
});

test('saleUnitOf: ว่าง/ช่องว่างล้วน → ค่าตั้งต้น, ยาวเกินเพดาน → ตัด', () => {
  assert.equal(saleUnitOf(''), 'ชิ้น');
  assert.equal(saleUnitOf('   '), 'ชิ้น');
  assert.equal(saleUnitOf(null), 'ชิ้น');
  assert.equal(saleUnitOf(' ขวด '), 'ขวด');
  // หน่วยที่ผู้ใช้พิมพ์เองยาวผิดปกติต้องไม่ไปดันคอลัมน์บนเอกสาร A4 เสียรูป
  assert.equal(saleUnitOf('ก'.repeat(80)).length, SALE_UNIT_MAX);
});

test('unitOptions: พ่วงค่าเดิมที่ถูกตัดออกจากลิสต์ไว้เสมอ', () => {
  // สินค้าที่เคยตั้ง 'แพ็ค' ไว้ก่อนลิสต์ถูกตัด — ถ้าไม่พ่วง ช่องจะเด้งเป็นค่าแรกแล้ว
  // หน่วยเปลี่ยนเงียบ ๆ ตอนกดบันทึกเรื่องอื่น
  const options = unitOptions(SALE_UNITS, 'แพ็ค');
  assert.equal(options.length, SALE_UNITS.length + 1);
  assert.deepEqual(options.at(-1), { value: 'แพ็ค', label: 'แพ็ค (ค่าเดิม)' });
});

test('unitOptions: ค่าที่อยู่ในลิสต์อยู่แล้ว/ค่าว่าง ไม่พ่วงซ้ำ', () => {
  assert.equal(unitOptions(SALE_UNITS, 'ขวด').length, SALE_UNITS.length);
  assert.equal(unitOptions(SALE_UNITS, '').length, SALE_UNITS.length);
  assert.equal(unitOptions(VOLUME_UNITS, 'oz').length, VOLUME_UNITS.length + 1);
});

test('formatVolume: เติมหน่วยตั้งต้นเมื่อไม่ได้ตั้งไว้', () => {
  assert.equal(formatVolume({ volume: 30, volumeUnit: 'ml' }), '30 ml');
  assert.equal(formatVolume({ volume: 30 }), '30 ml');
  assert.equal(formatVolume({ volume: 500, volumeUnit: 'g' }), '500 g');
  assert.equal(formatVolume({}), '-');
  assert.equal(formatVolume(null), '-');
});
