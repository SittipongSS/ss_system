// ── ขั้นราคาเลือกชนิดวัสดุตามสิ่งที่แถวผูก (Q38 ก · 2026-08-07 · ม-148 2026-09-22) ─────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowPriceSlots, rowPriceTarget } from './rowPriceTarget.js';

const SRC = readFileSync('src/app/api/sa/requests/[id]/items/[itemId]/price/route.js', 'utf8');

test('🐞 แถวพัฒนาสูตรต้องใส่ราคาได้ — สูตร = FB ประทับ formulaId', () => {
  // เดิมบังคับ `producedScentId` อย่างเดียว ⇒ แถวที่ผูก `producedFormulaId`
  // (พัฒนาสูตร) ได้ 400 ตลอดกาล ⇒ ลูกค้าคอนเฟิร์มแล้วปิดใบไม่ได้
  const t = rowPriceTarget({ lineKind: 'product_dev', producedFormulaId: 'FML-1' });
  assert.equal(t.kind, 'RM_FB');
  assert.equal(t.stampColumn, 'formulaId');
  assert.equal(t.id, 'FML-1');
  assert.equal(t.short, 'FB');
});

test('แถวพัฒนากลิ่นที่ส่งเป็นหัวน้ำหอม = F ประทับ scentId', () => {
  const t = rowPriceTarget({ lineKind: 'scent_dev', producedScentId: 'SCT-1' });
  assert.equal(t.kind, 'RM_F');
  assert.equal(t.stampColumn, 'scentId');
  assert.equal(t.id, 'SCT-1');
});

test('⭐ ม-148 พัฒนากลิ่นที่ส่งเป็นสินค้า (มีทั้งกลิ่นและสูตร) = FB บนสูตร ไม่ใช่ F บนกลิ่น', () => {
  // 🐞 SB-26080011: ส่งเป็น EDP แต่ราคาเข้าเป็น RM_F ของกลิ่น
  const t = rowPriceTarget({ lineKind: 'scent_dev', producedScentId: 'SCT-1', producedFormulaId: 'FML-9' });
  assert.equal(t.kind, 'RM_FB');
  assert.equal(t.id, 'FML-9');
});

test('แถวที่ยังไม่ผูกทะเบียน = null (route ตอบ 400)', () => {
  assert.equal(rowPriceTarget({ lineKind: 'scent_dev' }), null);
  assert.equal(rowPriceTarget(null), null);
});

test('route ถามตัวตัดสินกลาง ไม่คิดชนิดราคาเอง', () => {
  // ตัวคิดช่องจากทะเบียนสด ตัวเดียวกับที่ GET ติดให้โมดัล (รีวิว ม-148 รอบสาม)
  assert.ok(SRC.includes('rowPriceSlotsLive(supabase, row)'));
  assert.match(readFileSync('src/app/api/sa/requests/[id]/route.js', 'utf8'), /item\.priceSlots = await rowPriceSlotsLive\(/);
  assert.ok(SRC.includes('normalizeSlotPrices('));
  assert.ok(!/kind: 'RM_F/.test(SRC), 'ชนิดราคาต้องไม่ถูกเขียนซ้ำใน route');
});

test('⭐ ม-148 แถวสูตรใส่ได้ F · B · FB · แถวกลิ่นใส่ได้ F ช่องเดียว', () => {
  const keys = (row) => rowPriceSlots(row).map((s) => `${s.key}:${s.id}`);
  // พัฒนากลิ่นที่ส่งเป็นสินค้า — F ลงกลิ่นที่เพิ่งเกิด
  assert.deepEqual(keys({ producedScentId: 'S1', producedFormulaId: 'F1' }), ['F:S1', 'B:F1', 'FB:F1']);
  // พัฒนาสูตร — F ลงกลิ่นที่แถวอ้าง
  assert.deepEqual(keys({ lineKind: 'product_dev', scentId: 'S9', producedFormulaId: 'F1' }), ['F:S9', 'B:F1', 'FB:F1']);
  // กลิ่น (หัวน้ำหอม) — F อย่างเดียว
  assert.deepEqual(keys({ producedScentId: 'S1' }), ['F:S1']);
  // พัฒนาสูตรที่ยังไม่ส่งสูตร — ไม่ถอยไปใช้กลิ่นที่แถวอ้าง (ไม่ใช่ของที่แถวส่ง)
  assert.deepEqual(keys({ lineKind: 'product_dev', scentId: 'S9' }), []);
});

test('🔴 ห้ามเหลือตัวแปร `scent` ที่ไม่มีอยู่แล้วในข้อความ audit/เธรด', () => {
  // ⚠️ build กับ lint จับไม่ได้ — มันพังตอน **รันจริงหลังบันทึกราคาสำเร็จไปแล้ว**
  // ซึ่งเป็นจังหวะที่แย่ที่สุด (ราคาเข้าทะเบียนแล้วแต่ API ตอบ 500)
  assert.ok(!/\bscent\.(code|name)/.test(SRC), 'ต้องใช้ `source` ตัวเดียวทั้งสองสาย');
});
