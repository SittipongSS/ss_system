import assert from 'node:assert/strict';
import test from 'node:test';
import { DELIVERY_DUE_INVALID, parseDeliveryDueDate } from './salesOrderDeliveryDue.js';

test('ว่างทุกรูปแบบ = null ไม่ใช่ error — ใบที่ยังไม่ตกลงวันส่งต้องบันทึกได้', () => {
  for (const empty of [undefined, null, '', '   ']) {
    assert.deepEqual(parseDeliveryDueDate(empty), { ok: true, value: null });
  }
});

test('วันที่จริงผ่าน และคืนสตริงเดิม (ไม่แปลงรูป)', () => {
  assert.deepEqual(parseDeliveryDueDate('2026-10-30'), { ok: true, value: '2026-10-30' });
  assert.deepEqual(parseDeliveryDueDate(' 2026-10-30 '), { ok: true, value: '2026-10-30' });
  // ปีอธิกสุรทิน 29 ก.พ. มีจริง
  assert.deepEqual(parseDeliveryDueDate('2028-02-29'), { ok: true, value: '2028-02-29' });
});

test('รูปแบบผิดถูกตีกลับ', () => {
  for (const bad of ['30/10/2026', '2026-10-3', '2026/10/30', 'พรุ่งนี้', '2026-10-30T00:00:00Z']) {
    assert.deepEqual(parseDeliveryDueDate(bad), { ok: false, error: DELIVERY_DUE_INVALID });
  }
});

test('วันที่ไม่มีในปฏิทินถูกตีกลับ ไม่ใช่เลื่อนวันเงียบ ๆ', () => {
  // 🪤 new Date('2026-02-31') ไม่ throw แต่เลื่อนเป็น 2026-03-03
  for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '2027-02-29']) {
    assert.deepEqual(parseDeliveryDueDate(bad), { ok: false, error: DELIVERY_DUE_INVALID });
  }
});
