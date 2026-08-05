// บรรทัดของ "พัฒนาผลิตภัณฑ์" (P4) — logic ล้วน
//
// ⭐ 1 บรรทัด = หมวดสินค้า × กลิ่น ซึ่งเป็น **ตัวตนของสูตรที่จะเกิด** พอดี
// (formulas_identity_uk ของ 0207) ⇒ ด่านที่นี่กับ index นั้นต้องพูดเรื่องเดียวกัน
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REQUEST_ITEMS, normalizeProductDevItems } from './lines.js';

const ok = { categoryCode: '01-002', scentId: 'SCT-1' };

test('ต้องมีอย่างน้อยหนึ่งบรรทัด และไม่เกินเพดาน', () => {
  assert.match(normalizeProductDevItems([]).error, /อย่างน้อย 1 รายการ/);
  const many = Array.from({ length: MAX_REQUEST_ITEMS + 1 }, (_, i) => ({
    categoryCode: '01-002', scentId: `SCT-${i}`,
  }));
  assert.match(normalizeProductDevItems(many).error, /มากเกินไป/);
});

test('⭐ หมวดกับกลิ่นบังคับทั้งคู่ — ขาดข้างใดข้างหนึ่งคือแถวที่ไม่มีทางเป็นสูตรได้', () => {
  // ไม่ใช่แค่กติกาของฟอร์ม — `dept_request_items_shape` ของ 0204 บังคับไว้ที่ DB ด้วย
  assert.match(normalizeProductDevItems([{ scentId: 'SCT-1' }]).error, /หมวดสินค้า/);
  assert.match(normalizeProductDevItems([{ categoryCode: '01-002' }]).error, /กลิ่น/);
  assert.match(normalizeProductDevItems([{ ...ok, categoryCode: '1-2' }]).error, /ไม่ถูกต้อง/);
  assert.equal(normalizeProductDevItems([ok]).error, null);
});

test('หมวด × กลิ่น ซ้ำในใบเดียว = ขอของชิ้นเดียวกันสองรอบ', () => {
  // ปล่อยผ่านแล้ว RD จะสร้างสูตรได้ตัวเดียว แถวที่สองค้างตลอดกาลเพราะชนตัวตนของสูตร
  assert.match(normalizeProductDevItems([ok, { ...ok }]).error, /ซ้ำกับรายการก่อนหน้า/);
  // หมวดเดียวกันคนละกลิ่น / กลิ่นเดียวกันคนละหมวด = คนละของ ไม่ซ้ำ
  assert.equal(normalizeProductDevItems([ok, { ...ok, scentId: 'SCT-2' }]).error, null);
  assert.equal(normalizeProductDevItems([ok, { ...ok, categoryCode: '01-003' }]).error, null);
});

test('จำนวนไม่บังคับ — ตอนขอตัวอย่างยังไม่รู้ยอดจริง', () => {
  // ยอดที่นับคือ confirmedQty ตอนลูกค้าตอบ ไม่ใช่ตอนขอ
  assert.equal(normalizeProductDevItems([ok]).items[0].qty, null);
  assert.equal(normalizeProductDevItems([{ ...ok, qty: '' }]).items[0].qty, null);
  assert.equal(normalizeProductDevItems([{ ...ok, qty: 12 }]).items[0].qty, 12);
  assert.match(normalizeProductDevItems([{ ...ok, qty: 0 }]).error, /มากกว่า 0/);
  assert.match(normalizeProductDevItems([{ ...ok, qty: 'สาม' }]).error, /ตัวเลข/);
});

test('ไม่รับ label จาก client — เป็น snapshot ที่ derive จากทะเบียน', () => {
  // ปล่อยให้พิมพ์เองเมื่อไร จะได้ป้ายที่ไม่ตรงกับหมวด/กลิ่นที่แถวชี้อยู่จริง
  const { items } = normalizeProductDevItems([{ ...ok, label: 'พิมพ์เอง' }]);
  assert.equal('label' in items[0], false);
  assert.equal(items[0].lineKind, 'product_dev');
  assert.equal(items[0].sortOrder, 1);
});
