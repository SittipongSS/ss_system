import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAcknowledgeInquiryMessage, canCloseInquiry, canDeleteInquiry,
  canEditInquiryRequest, canMutateInquiryMessage, canRespondInquiry,
  canTakeInquiry, canViewInquiry,
  compareInquiryUrgency, normalizeInquiryStatus, resolveInquiryContext, sanitizeInquiryAttachments,
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

// ── บริบท ลูกค้า › โครงการ › ดีล (บังคับครบ) ──
const stubSupabase = (deal) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: deal }) }),
    }),
  }),
});
const ae = { id: 'ae-1', role: 'ae', team: 'KA' };
const fullDeal = { id: 'D1', code: 'DL-1', title: 'ดีล', customerId: 'C1', projectId: 'P1', team: 'KA', ownerId: 'ae-1' };

test('resolveInquiryContext: ดีลครบบริบท → sync ลูกค้า/โครงการ/ทีม จากดีลจริง', async () => {
  const { error, context } = await resolveInquiryContext(stubSupabase(fullDeal), ae, { dealId: 'D1' });
  assert.equal(error, undefined);
  assert.deepEqual(context, { dealId: 'D1', projectId: 'P1', customerId: 'C1', team: 'KA' });
});

test('resolveInquiryContext: ต้องเลือกดีล และดีลต้องมีจริง', async () => {
  assert.match((await resolveInquiryContext(stubSupabase(fullDeal), ae, {})).error, /ต้องเลือกดีล/);
  assert.match((await resolveInquiryContext(stubSupabase(null), ae, { dealId: 'X' })).error, /ไม่พบดีล/);
});

test('resolveInquiryContext: ดีลไร้โครงการ/ไร้ลูกค้า สอบถามไม่ได้', async () => {
  const noProject = await resolveInquiryContext(stubSupabase({ ...fullDeal, projectId: null }), ae, { dealId: 'D1' });
  assert.match(noProject.error, /ยังไม่ได้เชื่อมโครงการ/);
  const noCustomer = await resolveInquiryContext(stubSupabase({ ...fullDeal, customerId: null }), ae, { dealId: 'D1' });
  assert.match(noCustomer.error, /ยังไม่ได้ระบุลูกค้า/);
});

test('resolveInquiryContext: ดีลนอก scope = 403 (AE คนอื่นสอบถามในนามดีลนี้ไม่ได้)', async () => {
  const other = { id: 'ae-2', role: 'ae', team: 'KA' };
  const result = await resolveInquiryContext(stubSupabase(fullDeal), other, { dealId: 'D1' });
  assert.equal(result.status, 403);
  assert.equal(result.context, undefined);
});

test('resolveInquiryContext: ค่าที่ client ส่งต้องตรงกับดีล ไม่งั้นตีกลับ', async () => {
  const sb = stubSupabase(fullDeal);
  assert.match((await resolveInquiryContext(sb, ae, { dealId: 'D1', projectId: 'P9' })).error, /โครงการที่เลือกไม่ตรง/);
  assert.match((await resolveInquiryContext(sb, ae, { dealId: 'D1', customerId: 'C9' })).error, /ลูกค้าที่เลือกไม่ตรง/);
  // ส่งครบและตรง → ผ่าน
  assert.equal((await resolveInquiryContext(sb, ae, { dealId: 'D1', projectId: 'P1', customerId: 'C1' })).error, undefined);
});

// ── ลำดับคิว: ไม่มี SLA แล้ว ยังไม่มีผู้รับต้องไม่ตกท้ายคิว ──
test('compareInquiryUrgency: ยังไม่มีผู้รับมาก่อน (รอนานสุดขึ้นก่อน)', () => {
  const untakenOld = { id: 'a', createdAt: '2026-07-01T00:00:00Z' };
  const untakenNew = { id: 'b', createdAt: '2026-07-10T00:00:00Z' };
  const taken = { id: 'c', assigneeId: 'r1', committedDueDate: '2026-07-02' };
  assert.deepEqual([taken, untakenNew, untakenOld].sort(compareInquiryUrgency).map((q) => q.id), ['a', 'b', 'c']);
});

test('compareInquiryUrgency: รับเรื่องแล้วเรียงตามวันที่รับปากไว้ (ไม่มีวัน = ท้ายกลุ่ม)', () => {
  const soon = { id: 'a', assigneeId: 'r1', committedDueDate: '2026-07-02' };
  const later = { id: 'b', assigneeId: 'r1', committedDueDate: '2026-07-20' };
  const noDate = { id: 'c', assigneeId: 'r1' };
  assert.deepEqual([noDate, later, soon].sort(compareInquiryUrgency).map((q) => q.id), ['a', 'b', 'c']);
});
