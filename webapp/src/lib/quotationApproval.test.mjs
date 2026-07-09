// Tests for quotation approval gating (N2): เพดานอนุมัติเป็นค่าคงที่ฝั่ง server —
// client "ลดเพดาน" ผ่าน metadata.approvalThreshold ไม่ได้ (กันข้ามการอนุมัติ),
// แต่ "บังคับเข้ม" (requiresApproval:true) ได้.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { quoteApprovalRequirement, quoteCanBeAccepted, QUOTE_APPROVAL_AMOUNT_THRESHOLD } from './quotationApproval.js';

test('ยอด >= เพดาน → ต้องอนุมัติ', () => {
  const r = quoteApprovalRequirement({ totalAmount: QUOTE_APPROVAL_AMOUNT_THRESHOLD });
  assert.equal(r.required, true);
  assert.equal(r.threshold, QUOTE_APPROVAL_AMOUNT_THRESHOLD);
});

test('ยอดต่ำกว่าเพดาน → ไม่ต้องอนุมัติ', () => {
  const r = quoteApprovalRequirement({ totalAmount: 1000 });
  assert.equal(r.required, false);
});

test('N2: client ตั้ง approvalThreshold สูงลิ่ว ต้องถูกเพิกเฉย (ยังบังคับอนุมัติ)', () => {
  const r = quoteApprovalRequirement({ totalAmount: 2_000_000 }, { approvalThreshold: 999_999_999 });
  assert.equal(r.required, true); // ข้ามไม่ได้
  assert.equal(r.threshold, QUOTE_APPROVAL_AMOUNT_THRESHOLD);
});

test('N2: approvalThreshold ใน metadata ของ quote เองก็ลดเพดานไม่ได้', () => {
  const r = quoteApprovalRequirement({ totalAmount: 2_000_000, metadata: { approvalThreshold: 999_999_999 } });
  assert.equal(r.required, true);
});

test('requiresApproval:true บังคับอนุมัติได้แม้ยอดต่ำ (เข้มขึ้นได้)', () => {
  const r = quoteApprovalRequirement({ totalAmount: 1 }, { requiresApproval: true });
  assert.equal(r.required, true);
});

test('quoteCanBeAccepted: รับได้เฉพาะ not_required / approved', () => {
  assert.equal(quoteCanBeAccepted({ approvalStatus: 'not_required' }), true);
  assert.equal(quoteCanBeAccepted({ approvalStatus: 'approved' }), true);
  assert.equal(quoteCanBeAccepted({ approvalStatus: 'pending' }), false);
  assert.equal(quoteCanBeAccepted({ approvalStatus: 'rejected' }), false);
});
