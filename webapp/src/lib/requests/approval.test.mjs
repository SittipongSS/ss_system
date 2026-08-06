// ── ประตูหัวหน้าฝ่ายขาย (mig 0216) ──────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveRequestError, canApproveRequest, deliveryApprovalError,
  isAwaitingApproval, requestNeedsApproval,
} from './approval.js';

const sup = { id: 'U-SUP', role: 'ae_supervisor' };
const ae = { id: 'U-AE2', role: 'ae' };
const acked = {
  kind: 'scent_dev', requestedById: 'U-AE', acknowledgedAt: '2026-08-05T00:00:00Z',
};

test('ประตูมีเฉพาะหัวข้อที่ประกาศ — สอบถาม/ขอเอกสารไม่ต้องผ่านหัวหน้า', () => {
  assert.ok(requestNeedsApproval({ kind: 'scent_dev' }));
  for (const kind of ['info', 'document', 'product_dev', 'price_pm']) {
    assert.ok(!requestNeedsApproval({ kind }), `${kind} ไม่ควรต้องผ่านหัวหน้า`);
  }
});

test('⭐ ประตูเปิดหลัง RD รับเรื่อง ไม่ใช่ก่อนส่ง', () => {
  // หัวหน้าต้องเห็นวันกำหนดส่งจริงก่อนตัดสิน
  assert.ok(!isAwaitingApproval({ kind: 'scent_dev' }), 'ยังไม่รับเรื่อง = ยังไม่ถึงตาหัวหน้า');
  assert.ok(isAwaitingApproval(acked));
  assert.ok(!isAwaitingApproval({ ...acked, approvedAt: '2026-08-06T00:00:00Z' }));
});

test('⚠️ หัวหน้ายืนยันใบที่ตัวเองเปิดไม่ได้ — admin เท่านั้นที่ break glass ได้', () => {
  // ประตูมีไว้ให้คนที่สองมองก่อน RD ลงแรง — เซ็นรับรองงานตัวเองแล้วไม่ได้กันอะไรเลย
  // 🐞 `isSuperuser` รวม ae_supervisor ⇒ ถ้าเช็ค role ก่อน กฎนี้จะถูกกลืนพอดีสำหรับ
  // ตำแหน่งที่ประตูนี้มีไว้เพื่อ (เทสต์จับได้ตอนเขียน)
  const supIsRequester = { ...acked, requestedById: 'U-SUP' };
  assert.ok(!canApproveRequest(sup, supIsRequester));
  assert.match(approveRequestError(supIsRequester, sup), /ใบของตัวเองไม่ได้/);
  // บริษัทเล็กมีเคสที่หัวหน้าเปิดเอง แล้วไม่มีใครยืนยันให้ ⇒ ต้องมีทางออก
  assert.ok(canApproveRequest({ id: 'U-SUP', role: 'admin' }, supIsRequester));
});

test('ยืนยันได้เฉพาะหัวหน้า + admin break-glass', () => {
  assert.equal(approveRequestError(acked, sup), null);
  assert.match(approveRequestError(acked, ae), /หัวหน้าสายงานขาย/);
  assert.equal(approveRequestError(acked, { id: 'A', role: 'admin' }), null);
});

test('ยืนยันซ้ำ · ยืนยันก่อนรับเรื่อง · หัวข้อที่ไม่ต้องผ่าน — ตีกลับทั้งหมด', () => {
  assert.match(approveRequestError({ ...acked, acknowledgedAt: null }, sup), /ยังไม่รับเรื่อง/);
  assert.match(approveRequestError({ ...acked, approvedAt: 'x' }, sup), /ยืนยันไปแล้ว/);
  assert.match(approveRequestError({ kind: 'info' }, sup), /ไม่ต้องผ่านการยืนยัน/);
});

test('RD ส่งของไม่ได้จนกว่าจะยืนยัน — และข้อความบอกว่ารอใคร', () => {
  assert.match(deliveryApprovalError(acked), /รอหัวหน้าสายงานขายยืนยัน/);
  assert.equal(deliveryApprovalError({ ...acked, approvedAt: 'x' }), null);
  // หัวข้ออื่นไม่ติดประตูนี้เลย
  assert.equal(deliveryApprovalError({ kind: 'product_dev', acknowledgedAt: 'x' }), null);
});
