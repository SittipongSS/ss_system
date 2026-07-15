import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAcknowledgeInquiryMessage, canCloseInquiry, canDeleteInquiry,
  canEditInquiryRequest, canMutateInquiryMessage, canRespondInquiry,
  canTakeInquiry, canViewInquiry,
  normalizeInquiryStatus, sanitizeInquiryAttachments,
} from './inquiries';

const inquiry = {
  id: 'IQ1', targetDept: 'RD', status: 'open',
  requesterId: 'ae-1', requesterName: 'AE One', team: 'KA',
};

test('canRespondInquiry: ฝ่ายเป้าหมาย (rd) + superuser เท่านั้น', () => {
  assert.equal(canRespondInquiry({ id: 'r1', role: 'rd', department: 'RD' }, inquiry), true);
  // rd ต้องอยู่ฝ่ายเดียวกับ targetDept จริง (กันเคสอนาคตมีหลายฝ่ายรับคำถาม)
  assert.equal(canRespondInquiry({ id: 'r9', role: 'rd', department: 'QC' }, inquiry), false);
  assert.equal(canRespondInquiry({ id: 'a', role: 'admin' }, inquiry), true);
  assert.equal(canRespondInquiry({ id: 's', role: 'ae_supervisor' }, inquiry), true);
  // ฝ่ายขาย/viewer/staff ตอบไม่ได้ (ไม่มี cap inquiries:respond)
  assert.equal(canRespondInquiry({ id: 'ae-1', role: 'ae', team: 'KA' }, inquiry), false);
  assert.equal(canRespondInquiry({ id: 'v', role: 'viewer' }, inquiry), false);
  assert.equal(canRespondInquiry({ id: 'st', role: 'staff', department: 'RD' }, inquiry), false);
});

test('canCloseInquiry: ผู้ถาม/ทีมผู้ถาม (ฝั่งขาย) เป็นคนปิด — RD ปิดเองไม่ได้', () => {
  assert.equal(canCloseInquiry({ id: 'ae-1', role: 'ae', team: 'KA' }, inquiry), true);
  // AE คนอื่น (แม้ทีมเดียวกัน) ปิดไม่ได้ — edit scope ของ ae คือ own
  assert.equal(canCloseInquiry({ id: 'ae-2', role: 'ae', team: 'KA' }, inquiry), false);
  // Senior/AC ทีมเดียวกันปิดแทนได้ (team scope), ต่างทีมไม่ได้
  assert.equal(canCloseInquiry({ id: 'sr', role: 'senior_ae', team: 'KA' }, inquiry), true);
  assert.equal(canCloseInquiry({ id: 'sr2', role: 'senior_ae', team: 'ODM' }, inquiry), false);
  assert.equal(canCloseInquiry({ id: 'adm', role: 'admin' }, inquiry), true);
  // ฝั่งผู้ตอบไม่มีสิทธิ์ปิด — คนถามคือคนตัดสินว่าคำตอบพอ
  assert.equal(canCloseInquiry({ id: 'r1', role: 'rd', department: 'RD' }, inquiry), false);
});

test('canViewInquiry: rd เห็นของฝ่ายตน, ฝั่งขายเห็นตาม scope ดีลเดิม', () => {
  assert.equal(canViewInquiry({ id: 'r1', role: 'rd', department: 'RD' }, inquiry), true);
  assert.equal(canViewInquiry({ id: 'ae-1', role: 'ae', team: 'KA' }, inquiry), true);   // ผู้ถามเอง
  assert.equal(canViewInquiry({ id: 'ae-2', role: 'ae', team: 'KA' }, inquiry), false);  // ae อื่น (own scope)
  assert.equal(canViewInquiry({ id: 'ac1', role: 'ac', team: 'KA' }, inquiry), true);    // ทีมเดียวกัน
  assert.equal(canViewInquiry({ id: 'ac2', role: 'ac', team: 'ODM' }, inquiry), false);  // ต่างทีม
  assert.equal(canViewInquiry({ id: 'v', role: 'viewer' }, inquiry), true);              // observer ทั้งระบบ
});

test('normalizeInquiryStatus + sanitizeInquiryAttachments กันค่าแปลกปลอม', () => {
  assert.equal(normalizeInquiryStatus('answered'), 'answered');
  assert.equal(normalizeInquiryStatus('hacked'), 'open');
  assert.deepEqual(sanitizeInquiryAttachments(null), []);
  assert.deepEqual(sanitizeInquiryAttachments([{ evil: true }]), []);
  const clean = sanitizeInquiryAttachments([{ fileUrl: 'https://x/y.pdf', fileName: 'y.pdf', mimeType: 'application/pdf', sizeBytes: 10, extra: 'strip-me' }]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].fileUrl, 'https://x/y.pdf');
  assert.equal('extra' in clean[0], false);
});

test('inquiry locks: requester edits/deletes only before RD accepts; take is RD only', () => {
  const ae = { id: 'ae-1', role: 'ae', team: 'KA' };
  const rd = { id: 'r1', role: 'rd', department: 'RD' };
  assert.equal(canTakeInquiry(rd, inquiry), true);
  assert.equal(canTakeInquiry({ id: 'a', role: 'admin' }, inquiry), false);
  assert.equal(canEditInquiryRequest(ae, inquiry), true);
  assert.equal(canDeleteInquiry(ae, inquiry), true);
  const accepted = { ...inquiry, acceptedAt: '2026-07-15T00:00:00Z' };
  assert.equal(canEditInquiryRequest(ae, accepted), false);
  assert.equal(canDeleteInquiry(ae, accepted), false);
  assert.equal(canDeleteInquiry({ id: 'a', role: 'admin' }, accepted), true);
});

test('message locks: owner mutates until opposite side acknowledges', () => {
  const ae = { id: 'ae-1', role: 'ae', team: 'KA' };
  const rd = { id: 'r1', role: 'rd', department: 'RD' };
  const saleMessage = { id: 'm1', kind: 'comment', authorId: ae.id, authorDept: 'SA' };
  assert.equal(canMutateInquiryMessage(ae, inquiry, saleMessage), true);
  const accepted = { ...inquiry, acceptedAt: '2026-07-15T00:00:00Z', assigneeId: rd.id };
  assert.equal(canAcknowledgeInquiryMessage(rd, accepted, saleMessage), true);
  assert.equal(canAcknowledgeInquiryMessage(ae, inquiry, saleMessage), false);
  const locked = { ...saleMessage, acknowledgedAt: '2026-07-15T00:00:00Z' };
  assert.equal(canMutateInquiryMessage(ae, inquiry, locked), false);
});
