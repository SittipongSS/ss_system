// ── ขั้นราคาเลือกชนิดวัสดุตามสิ่งที่แถวผูก (Q38 ก · 2026-08-07 · ม-148 2026-09-22) ─────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowPriceTarget } from './rowPriceTarget.js';

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
  assert.ok(SRC.includes('rowPriceTarget(row)'));
  assert.ok(!/kind: 'RM_F'/.test(SRC), 'ชนิดราคาต้องไม่ถูกเขียนซ้ำใน route');
});

test('🔴 ห้ามเหลือตัวแปร `scent` ที่ไม่มีอยู่แล้วในข้อความ audit/เธรด', () => {
  // ⚠️ build กับ lint จับไม่ได้ — มันพังตอน **รันจริงหลังบันทึกราคาสำเร็จไปแล้ว**
  // ซึ่งเป็นจังหวะที่แย่ที่สุด (ราคาเข้าทะเบียนแล้วแต่ API ตอบ 500)
  assert.ok(!/\bscent\.(code|name)/.test(SRC), 'ต้องใช้ `source` ตัวเดียวทั้งสองสาย');
});
