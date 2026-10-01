import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELIVERY_DUE_AMEND_TEXT, DELIVERY_DUE_INVALID, deliveryDueAmendError, parseDeliveryDueDate,
} from './salesOrderDeliveryDue.js';

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

/* ── แก้กำหนดส่งบนใบที่อนุมัติแล้ว (มติ 2026-09-29) ── */
const approved = { id: 'SOR-1', status: 'approved', origin: 'pipeline' };

test('ใบที่อนุมัติแล้ว + ฝ่ายขายที่ดูแลใบ = แก้กำหนดส่งได้ (ไม่ต้องออก Rev.)', () => {
  assert.equal(deliveryDueAmendError(approved, { canEdit: true }), null);
});

test('ไม่มีสิทธิ์แก้ใบ = ไม่ได้ แม้ใบอนุมัติแล้ว · ไม่ส่ง canEdit มา = ถือว่าไม่มีสิทธิ์', () => {
  assert.equal(deliveryDueAmendError(approved, { canEdit: false }), DELIVERY_DUE_AMEND_TEXT.noRight);
  assert.equal(deliveryDueAmendError(approved), DELIVERY_DUE_AMEND_TEXT.noRight);
});

test('ใบร่าง/ตีกลับไม่ใช้ทางนี้ — แก้ที่ฟอร์มของใบ (action save) ทางเดียว', () => {
  for (const status of ['draft', 'rejected']) {
    assert.equal(deliveryDueAmendError({ ...approved, status }, { canEdit: true }), DELIVERY_DUE_AMEND_TEXT.draft, status);
  }
});

test('รออนุมัติ / ย้อนการอนุมัติ / ปิดแล้ว ได้เหตุผลของตัวเอง', () => {
  assert.equal(deliveryDueAmendError({ ...approved, status: 'pending_approval' }, { canEdit: true }), DELIVERY_DUE_AMEND_TEXT.pending);
  assert.equal(deliveryDueAmendError({ ...approved, status: 'approval_revoked' }, { canEdit: true }), DELIVERY_DUE_AMEND_TEXT.revoked);
  for (const status of ['cancelled', 'revised', 'something_new']) {
    assert.equal(deliveryDueAmendError({ ...approved, status }, { canEdit: true }), DELIVERY_DUE_AMEND_TEXT.closed, status);
  }
});

test('ใบที่ถูกแทนด้วย Rev. แล้วแก้ไม่ได้ แม้สถานะยังค้างเป็น approved', () => {
  assert.equal(deliveryDueAmendError({ ...approved, supersededById: 'SOR-2' }, { canEdit: true }), DELIVERY_DUE_AMEND_TEXT.closed);
});

test('ใบย้อนหลังไม่มีช่องกำหนดส่ง (0363 ตั้งใจให้ว่าง) — แม้อนุมัติแล้ว', () => {
  assert.equal(deliveryDueAmendError({ ...approved, origin: 'historical' }, { canEdit: true }), DELIVERY_DUE_AMEND_TEXT.historical);
});

test('ไม่มีใบ = ไม่พบใบ', () => {
  assert.equal(deliveryDueAmendError(null, { canEdit: true }), DELIVERY_DUE_AMEND_TEXT.missing);
});
