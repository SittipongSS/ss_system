// ตัวเลือกหมวดสินค้ากลาง — logic ล้วน ทดสอบได้โดยไม่แตะ React
//
// ⚠️ สองข้อที่เทสต์นี้มีไว้จับโดยเฉพาะ:
//   1) หมวดที่ **ชื่อว่างทั้งสองภาษา** ต้องถอยไปแสดงรหัส ห้ามขึ้นบรรทัดว่าง
//      (ซีด 0007 มีของจริง เช่น ('01','ODM','001','','','') · prod = 5 แถว)
//   2) ค้นด้วยภาษาอังกฤษต้องเจอหมวดที่โชว์ชื่อไทย — พิมพ์ `candle` ต้องเจอ "เทียนหอม"
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryName, categoryOptionLabel, findCategoryByCode,
  mainCategoryName, productCategoryOptions,
} from './productCategoryOptions.js';

const rows = [
  { mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '002', nameTh: 'เทียนหอม', nameEn: 'Scented candle' },
  { mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '001', nameTh: '', nameEn: '' },
  { mainCategoryCode: '02', mainCategoryName: 'ธุรกิจบริการ', typeCode: '010', nameTh: '', nameEn: 'Service fee' },
  { mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '003', nameTh: 'ก้านไม้หอม', nameEn: 'Reed diffuser', isActive: false },
];

test('ชื่อว่างทั้งสองภาษา → ถอยไปแสดงรหัส ห้ามขึ้นบรรทัดว่าง', () => {
  assert.equal(categoryName({ nameTh: '', nameEn: '' }), '');
  // ป้ายที่เอาไปโชว์ต้องไม่ว่าง — ผู้ใช้เห็นตัวเลือกเปล่า ๆ ที่กดได้แต่ไม่รู้ว่าคืออะไร
  const label = categoryOptionLabel({ mainCategoryCode: '01', typeCode: '001', nameTh: '', nameEn: '' });
  assert.equal(label, '01-001');
  assert.notEqual(label.trim(), '');
  // มีแค่ภาษาอังกฤษก็ใช้ได้ ไม่ต้องมีไทยครบ
  assert.equal(categoryName({ nameTh: '  ', nameEn: 'Service fee' }), 'Service fee');
});

test('หมวดที่พักใช้งานบอกไว้ในป้าย ไม่ใช่ปล่อยให้เลือกเงียบ ๆ', () => {
  assert.match(
    categoryOptionLabel({ mainCategoryCode: '01', typeCode: '003', nameTh: 'ก้านไม้หอม', isActive: false }),
    /พักใช้งาน/,
  );
});

test('ตัวเลือกจัดเป็นกลุ่มตามหมวดหลัก และเรียงตามรหัสทั้งสองชั้น', () => {
  const options = productCategoryOptions(rows);
  const heads = options.filter((o) => o.group).map((o) => o.label);
  assert.deepEqual(heads, ['01 ODM', '02 ธุรกิจบริการ']);

  // ในกลุ่ม 01 เรียง 001 → 002 (หมวดที่พักใช้งานถูกกรองออกเพราะไม่ใช่ค่าปัจจุบัน)
  const first = options.filter((o) => !o.group).map((o) => o.value);
  assert.deepEqual(first, ['01-001', '01-002', '02-010']);
});

test('หมวดที่พักใช้งานยังอยู่ในลิสต์ถ้าเป็นค่าปัจจุบัน — ไม่งั้นค่าเดิมหายตอนเปิดฟอร์มมาแก้', () => {
  const options = productCategoryOptions(rows, { currentCode: '01-003' });
  assert.ok(options.some((o) => o.value === '01-003'), 'ค่าปัจจุบันต้องยังเลือกได้');
});

test('ค้นได้ทั้งรหัส ไทย อังกฤษ และชื่อหมวดหลัก', () => {
  const options = productCategoryOptions(rows);
  const candle = options.find((o) => o.value === '01-002');
  // พิมพ์ `candle` ต้องเจอ "เทียนหอม" — ของจริงคนพิมพ์อังกฤษกันเยอะ
  assert.match(candle.search.toLowerCase(), /candle/);
  assert.match(candle.search, /เทียนหอม/);
  assert.match(candle.search, /01-002/);
  // ชื่อหมวดหลักอยู่ในสายค้นด้วย ⇒ พิมพ์ ODM ได้ลูกทั้งกลุ่ม
  assert.match(candle.search, /ODM/);
});

test('หัวกลุ่มไม่ใช่ตัวเลือก — ต้องแยกออกจากกันได้ชัด', () => {
  const options = productCategoryOptions(rows);
  for (const head of options.filter((o) => o.group)) {
    // ค่าของหัวกลุ่มต้องไม่ใช่รหัสหมวดที่บันทึกลง DB ได้ (ห้ามชนกับ "MM-TTT")
    assert.doesNotMatch(head.value, /^\d{2}-\d{3}$/);
    assert.equal(head.search, '', 'หัวกลุ่มไม่เข้าการค้น — ตัวควบคุมกันไว้เอง');
  }
});

test('แถวที่ไม่มีรหัสครบสองชั้นถูกทิ้ง — ไม่ปล่อยให้เกิดตัวเลือกที่บันทึกไม่ได้', () => {
  const options = productCategoryOptions([
    { mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '' },
    { mainCategoryCode: '', typeCode: '001' },
  ]);
  assert.deepEqual(options, []);
});

test('findCategoryByCode คืนแถวเต็ม — ผู้เรียกเอา nameTh/nameEn ไปเก็บเป็น snapshot', () => {
  assert.equal(findCategoryByCode(rows, '01-002')?.nameEn, 'Scented candle');
  assert.equal(findCategoryByCode(rows, '99-999'), null);
  assert.equal(findCategoryByCode(rows, ''), null);
});

test('ชื่อหมวดหลักรับได้ทั้งสามรูปแบบที่ของจริงส่งมา', () => {
  assert.equal(mainCategoryName({ mainCategoryName: 'ODM' }), 'ODM');
  assert.equal(mainCategoryName({ mainCategoryNameTh: 'โอดีเอ็ม' }), 'โอดีเอ็ม');
  assert.equal(mainCategoryName({}), '');
});
