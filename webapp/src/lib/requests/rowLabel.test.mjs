import test from 'node:test';
import assert from 'node:assert/strict';
import { productDevLabel, requestedLabel } from './rowLabel.js';
import { fmtDate, NA } from '../format.js';

test('ป้ายสิ่งที่ขอตัดหางลูกศรที่ต่อตอนส่งงาน — รวมลูกศรซ้อนจากรอบแก้', () => {
  assert.equal(requestedLabel('ระบบกระจายกลิ่น · PF9010103 FIRST PLATE → PF9010103-P1 → PF9010103-P1'), 'ระบบกระจายกลิ่น · PF9010103 FIRST PLATE');
  assert.equal(requestedLabel('เทียนหอม · SC-1 Amber'), 'เทียนหอม · SC-1 Amber');
  assert.equal(requestedLabel(null), '');
});

test('⭐ ป้ายพัฒนาสูตรใช้กลิ่นสดจากทะเบียน — รหัสกลิ่นเก่า "-" และรหัสสูตรเก่าหายไป', () => {
  const stale = 'ครีมทามือ · - CHAO PHRAYA THAI CONTEMPORARY 01 REV 3 → 6731108202601';
  assert.equal(
    productDevLabel(stale, { code: 'PF319010103', name: 'CHAO PHRAYA THAI CONTEMPORARY 01 REV 3', producedAt: '2026-09-01' }),
    `ครีมทามือ · PF319010103 · CHAO PHRAYA THAI CONTEMPORARY 01 REV 3 · ${fmtDate('2026-09-01')}`,
  );
  // กลิ่นไม่มีรหัส / รหัสเป็นขีด = "ไม่มี PF" · ไม่มีวันผลิต = ขีด (มติ 13/11: ครบสามท่อนเสมอ)
  assert.equal(productDevLabel('เทียนหอม · - Amber', { code: '-', name: 'Amber' }), `เทียนหอม · ไม่มี PF · Amber · ${NA}`);
  // ไม่มีกลิ่นสด = ป้ายเดิมตัดหาง
  assert.equal(productDevLabel(stale, null), 'ครีมทามือ · - CHAO PHRAYA THAI CONTEMPORARY 01 REV 3');
  assert.equal(productDevLabel('', null), '—');
});

// ⭐ มติเจ้าของ 18/11/2026: หมวดสินค้า = รหัส + ชื่อเสมอ — ป้ายเก่าในฐานมีแต่ชื่อหมวด เติมรหัสตอนอ่าน
test('requestedLabel เติมรหัสหมวดหน้าป้ายเก่า · ป้ายที่มีรหัสแล้วไม่ซ้อน', () => {
  assert.equal(requestedLabel('แชมพู · PF1 กลิ่น', '01-014'), '01-014 แชมพู · PF1 กลิ่น');
  assert.equal(requestedLabel('01-014 แชมพู · PF1 กลิ่น', '01-014'), '01-014 แชมพู · PF1 กลิ่น');
  // หมวดชื่อว่าง — ป้ายเก่าเป็นรหัสอยู่แล้ว
  assert.equal(requestedLabel('01-001 · PF1 กลิ่น', '01-001'), '01-001 · PF1 กลิ่น');
  assert.equal(requestedLabel('แชมพู · PF1 → PF154-P2', '01-014'), '01-014 แชมพู · PF1');
  // ไม่ส่งรหัส / ป้ายไม่ใช่ทรง "หมวด · กลิ่น" = เหมือนเดิม
  assert.equal(requestedLabel('แชมพู · PF1 กลิ่น'), 'แชมพู · PF1 กลิ่น');
  assert.equal(requestedLabel('ขอตัวอย่าง', '01-014'), 'ขอตัวอย่าง');
  assert.equal(productDevLabel('แชมพู · -', { code: 'PF1', name: 'RAIN' }, '01-014').startsWith('01-014 แชมพู · '), true);
});
