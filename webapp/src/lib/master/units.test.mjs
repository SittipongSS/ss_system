import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SALE_UNIT,
  SALE_UNITS,
  SALE_UNIT_EN,
  SALE_UNIT_MAX,
  VOLUME_UNITS,
  formatVolume,
  packagingSummary,
  saleUnitLabel,
  saleUnitOf,
  unitOptions,
} from './units.js';

// ── หน่วยขายบนใบภาษาอังกฤษ (มติผู้ใช้ 2026-08-13 · IS-26080025) ───────────
test('ทุกหน่วยในลิสต์ต้องมีคำอังกฤษ — ลืมเติมคู่ = ใบอังกฤษมีไทยโผล่กลางตาราง', () => {
  const missing = SALE_UNITS.filter((unit) => !SALE_UNIT_EN[unit]);
  assert.deepEqual(missing, [], `หน่วยที่ยังไม่มีคำอังกฤษ: ${missing.join(', ')}`);
});

// ── ลิสต์รื้อใหม่ 2026-08-20 (mig 0274) ──────────────────────────────────
test('ลิสต์หน่วยขายเหลือ 6 ตัวตามที่ตกลง — ไม่มากไม่น้อยกว่านี้', () => {
  assert.deepEqual([...SALE_UNITS], ['ชิ้น', 'กิโลกรัม', 'เดือน', 'แพ็คเกจ', 'งาน', 'ชุด']);
});

test('คำที่เลิกใช้ต้องหลุดจากลิสต์จริง ไม่ใช่แค่ไม่มีใครเลือก', () => {
  for (const unit of ['ขวด', 'หลอด', 'กล่อง', 'Kg', 'ครั้ง']) {
    assert.ok(!SALE_UNITS.includes(unit), `'${unit}' ต้องไม่อยู่ในลิสต์แล้ว`);
  }
});

test('คำที่เปลี่ยนชื่อ อยู่ในลิสต์แล้วพร้อมคำอังกฤษ', () => {
  assert.ok(SALE_UNITS.includes('กิโลกรัม'));   // เดิม 'Kg'
  assert.ok(SALE_UNITS.includes('งาน'));        // เดิม 'ครั้ง'
  assert.equal(SALE_UNIT_EN['กิโลกรัม'], 'Kilogram');
  assert.equal(SALE_UNIT_EN['งาน'], 'Job');
  assert.equal(SALE_UNIT_EN['เดือน'], 'Month');
});

// ตารางแปลทำหน้าที่ *แปล* ไม่ใช่ *จำกัดตัวเลือก* — แถวที่ migration ไล่ไม่ถึงต้องยังแปลได้
// ไม่งั้นใบอังกฤษจะมีคำไทยโผล่กลางตารางในวันที่เจอแถวตกหล่น
test('คำที่เลิกใช้แล้วยังแปลเป็นอังกฤษได้ (เผื่อแถวเก่าตกหล่น)', () => {
  assert.equal(saleUnitLabel('ขวด', 'en'), 'Bottle');
  assert.equal(saleUnitLabel('หลอด', 'en'), 'Tube');
  assert.equal(saleUnitLabel('กล่อง', 'en'), 'Box');
  assert.equal(saleUnitLabel('ครั้ง', 'en'), 'Time');
  assert.equal(saleUnitLabel('Kg', 'en'), 'Kg');
});

test('ลิสต์หน่วยบรรจุเหลือ 5 ตัว — ตัด L, เก็บ pcs ไว้', () => {
  assert.deepEqual([...VOLUME_UNITS], ['ml', 'g', 'kg', 'package', 'pcs']);
  // 'pcs' ไม่ใช่ค่าขยะ: กิฟต์เซ็ตใช้บอกว่า "1 ชุดมีของ 2 ชิ้น" ไม่มีหน่วยอื่นพูดแทนได้
  assert.ok(VOLUME_UNITS.includes('pcs'));
  assert.ok(!VOLUME_UNITS.includes('L'));
});

test('saleUnitLabel: แปลเฉพาะใบอังกฤษ · ใบไทยคืนค่าเดิมไม่แตะ', () => {
  assert.equal(saleUnitLabel('ชิ้น', 'en'), 'Piece');
  assert.equal(saleUnitLabel('เดือน', 'en'), 'Month');
  assert.equal(saleUnitLabel('ชิ้น', 'th'), 'ชิ้น');
  assert.equal(saleUnitLabel('ชิ้น'), 'ชิ้น');          // ไม่ระบุภาษา = ไทย
  assert.equal(saleUnitLabel('Kg', 'en'), 'Kg');        // อังกฤษอยู่แล้ว ไม่เปลี่ยน
});

// ค่าเก่าที่หลุดลิสต์ ('แพ็ค'/'โหล') หรือคนพิมพ์เอง — เดาคำแปลแล้วผิดบนเอกสารลูกค้า
// แย่กว่าปล่อยเป็นไทย
test('saleUnitLabel: หน่วยนอกลิสต์พิมพ์ตามเดิม ไม่เดาคำแปล', () => {
  assert.equal(saleUnitLabel('โหล', 'en'), 'โหล');
  assert.equal(saleUnitLabel('แพ็ค', 'en'), 'แพ็ค');
  assert.equal(saleUnitLabel('', 'en'), '');
  assert.equal(saleUnitLabel(null, 'en'), '');
});

test('หน่วยตั้งต้นต้องอยู่ในลิสต์จริง (กันตัวเลือกที่เลือกไม่ได้)', () => {
  assert.ok(SALE_UNITS.includes(DEFAULT_SALE_UNIT));
  assert.ok(VOLUME_UNITS.includes('ml'));
});

test('saleUnitOf: ว่าง/ช่องว่างล้วน → ค่าตั้งต้น, ยาวเกินเพดาน → ตัด', () => {
  assert.equal(saleUnitOf(''), 'ชิ้น');
  assert.equal(saleUnitOf('   '), 'ชิ้น');
  assert.equal(saleUnitOf(null), 'ชิ้น');
  assert.equal(saleUnitOf(' ชุด '), 'ชุด');
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
  assert.equal(unitOptions(SALE_UNITS, 'ชุด').length, SALE_UNITS.length);
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

// ประโยคสรุปบรรจุภัณฑ์ — ตัวช่วยแยก "หน่วยขาย" ออกจาก "หน่วยปริมาตร" บนฟอร์ม
test('packagingSummary: ประกอบเป็นประโยคที่อ่านแล้วรู้ทันทีว่าช่องไหนคืออะไร', () => {
  assert.equal(
    packagingSummary({ volume: 50, volumeUnit: 'ml', saleUnit: 'ชิ้น', piecesPerCase: 12 }),
    '1 ชิ้น = 50 ml · 1 ลัง = 12 ชิ้น',
  );
});

test('packagingSummary: ไม่มีจำนวนต่อลัง ก็เหลือแค่ท่อนขนาด', () => {
  assert.equal(packagingSummary({ volume: 30, volumeUnit: 'g', saleUnit: 'ชุด' }), '1 ชุด = 30 g');
});

test('packagingSummary: ยังไม่กรอกอะไรเลย = ไม่มีประโยค (ไม่โชว์กล่องเปล่า)', () => {
  assert.equal(packagingSummary({}), '');
  assert.equal(packagingSummary(), '');
});

test('packagingSummary: ไม่ระบุหน่วย ใช้ค่าตั้งต้นเดียวกับที่ระบบบันทึกจริง', () => {
  assert.equal(packagingSummary({ volume: 50 }), '1 ชิ้น = 50 ml');
});
