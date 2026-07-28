// ทะเบียนกลิ่น (mig 0171) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENT_USABLE_STATUSES,
  acceptScentError,
  archiveScentError,
  canEditScent,
  canProposeScent,
  canRecordScentFeedback,
  canViewScents,
  deleteScentError,
  findScentByIdentity,
  isScentRegistrar,
  isScentUsable,
  normalizeScentInput,
  scentIdentityKey,
  scentTransitionError,
} from './scents.js';
import {
  nextRevisionNo,
  normalizeRevisionInput,
  pendingRevision,
  recordFeedbackError,
  revisionSummary,
  scentStatusAfterFeedback,
  sendRevisionError,
} from './scentRevisions.js';

const rd = { id: 'u-rd', role: 'rd', department: 'RD' };
const sale = { id: 'u-sale', role: 'ae', team: 'KA' };
const admin = { id: 'u-admin', role: 'admin' };
const viewer = { id: 'u-viewer', role: 'viewer' };
const exec = { id: 'u-exec', role: 'executive' };

const scent = (over = {}) => ({
  id: 'SCT-1', name: 'Forest night', customerId: 'CUS-1',
  status: 'developing', currentRevisionNo: 0, createdById: 'u-sale', ...over,
});

// ── ตัวตน ────────────────────────────────────────────────────────────────
test('ตัวตนกลิ่น = ชื่อ + ลูกค้า (ไม่สนตัวพิมพ์/ช่องว่างซ้ำ)', () => {
  assert.equal(
    scentIdentityKey({ name: '  Forest   Night ', customerId: 'CUS-1' }),
    scentIdentityKey({ name: 'forest night', customerId: 'CUS-1' }),
  );
});

test('กลิ่นชื่อเดียวกันคนละลูกค้า = คนละตัว (มติ 9: ใช้ข้ามลูกค้าไม่ได้)', () => {
  const rows = [scent({ id: 'SCT-A', customerId: 'CUS-1' })];
  assert.equal(findScentByIdentity(rows, { name: 'Forest night', customerId: 'CUS-1' })?.id, 'SCT-A');
  assert.equal(findScentByIdentity(rows, { name: 'Forest night', customerId: 'CUS-2' }), null);
});

// ── ตรวจข้อมูลเข้า ───────────────────────────────────────────────────────
test('ต้องเลือกลูกค้าเสมอ — ไม่มี "กลิ่นกลาง" ในระบบนี้', () => {
  assert.match(normalizeScentInput({ name: 'A' }).error, /ลูกค้า/);
  assert.equal(normalizeScentInput({ name: 'A', customerId: 'CUS-1' }).error, null);
});

test('ชื่อกลิ่นถูกตัดช่องว่างซ้ำก่อนบันทึก', () => {
  assert.equal(normalizeScentInput({ name: ' Walk  on   beach ', customerId: 'C' }).value.name,
    'Walk on beach');
});

test('ไม่ระบุรหัสได้ (ร่างของฝ่ายขายยังไม่มีรหัส)', () => {
  assert.equal(normalizeScentInput({ name: 'A', customerId: 'C' }).value.code, null);
});

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
test('RD และ admin เป็นเจ้าของทะเบียน ฝ่ายขายไม่ใช่', () => {
  assert.equal(isScentRegistrar(rd), true);
  assert.equal(isScentRegistrar(admin), true);
  assert.equal(isScentRegistrar(sale), false);
});

test('ฝ่ายขายเสนอกลิ่นเป็นร่างได้ (มติ 10)', () => {
  assert.equal(canProposeScent(sale), true);
});

test('viewer/executive อ่านได้แต่เสนอไม่ได้ — read-only observer', () => {
  assert.equal(canViewScents(viewer), true);
  assert.equal(canViewScents(exec), true);
  assert.equal(canProposeScent(viewer), false);
  assert.equal(canProposeScent(exec), false);
});

test('ฝ่ายขายบันทึก feedback ลูกค้าได้ (คนที่คุยกับลูกค้าคือฝ่ายขาย)', () => {
  assert.equal(canRecordScentFeedback(sale), true);
  assert.equal(canRecordScentFeedback(viewer), false);
});

test('ฝ่ายขายแก้ได้เฉพาะร่างของตัวเอง — เข้าทะเบียนแล้วเป็นงาน RD', () => {
  assert.equal(canEditScent(sale, scent({ status: 'draft', createdById: 'u-sale' })), true);
  assert.equal(canEditScent(sale, scent({ status: 'draft', createdById: 'u-other' })), false);
  assert.equal(canEditScent(sale, scent({ status: 'active' })), false);
  assert.equal(canEditScent(rd, scent({ status: 'active' })), true);
});

// ── ด่าน action ──────────────────────────────────────────────────────────
test('รับเข้าทะเบียนต้องมีรหัส และทำได้ครั้งเดียว', () => {
  assert.match(acceptScentError(scent({ status: 'draft' }), { code: '' }), /รหัส/);
  assert.equal(acceptScentError(scent({ status: 'draft' }), { code: 'SC-01' }), null);
  assert.match(acceptScentError(scent({ status: 'active' }), { code: 'SC-01' }), /ไปแล้ว/);
});

test('ลบได้เฉพาะร่างที่ยังไม่มีประวัติการส่ง', () => {
  assert.equal(deleteScentError(scent({ status: 'draft' })), null);
  assert.match(deleteScentError(scent({ status: 'draft' }), { revisionCount: 1 }), /ลบไม่ได้/);
  assert.match(deleteScentError(scent({ status: 'active' })), /เฉพาะร่าง/);
});

test('ร่างเลิกใช้ไม่ได้ — ต้องลบทิ้ง', () => {
  assert.match(archiveScentError(scent({ status: 'draft' })), /ลบทิ้ง/);
  assert.equal(archiveScentError(scent({ status: 'active' })), null);
});

test('เปลี่ยนสถานะย้อนกลับไปเป็นร่างไม่ได้', () => {
  assert.match(scentTransitionError(scent({ status: 'active' }), 'draft'), /ไม่ได้/);
  assert.equal(scentTransitionError(scent({ status: 'active' }), 'archived'), null);
  assert.equal(scentTransitionError(scent({ status: 'archived' }), 'active'), null);
});

test('ร่างยังอ้างในคำร้องขอราคาไม่ได้', () => {
  assert.equal(isScentUsable(scent({ status: 'draft' })), false);
  assert.equal(isScentUsable(scent({ status: 'developing' })), true);
  assert.deepEqual(SCENT_USABLE_STATUSES, ['developing', 'active']);
});

// ── Rev + feedback ───────────────────────────────────────────────────────
test('เลข Rev ถัดไปนับจากตัวล่าสุด', () => {
  assert.equal(nextRevisionNo([]), 1);
  assert.equal(nextRevisionNo([{ revisionNo: 1 }, { revisionNo: 3 }]), 4);
});

test('ส่ง Rev ใหม่ทับตัวที่ยังรอผลไม่ได้', () => {
  const revs = [{ revisionNo: 1, feedbackStatus: 'pending' }];
  assert.equal(pendingRevision(revs)?.revisionNo, 1);
  assert.match(sendRevisionError(scent(), revs), /ยังรอผลตอบรับ/);
  assert.equal(sendRevisionError(scent(), [{ revisionNo: 1, feedbackStatus: 'approved' }]), null);
});

test('กลิ่นที่ยังเป็นร่างส่งไม่ได้ (RD ต้องรับก่อน)', () => {
  assert.match(sendRevisionError(scent({ status: 'draft' }), []), /ร่าง/);
  assert.match(sendRevisionError(scent({ status: 'archived' }), []), /เปิดใช้ก่อน/);
});

test('บันทึก feedback ต้องมีทั้งผลและวันที่', () => {
  const rev = { id: 'SREV-1', revisionNo: 1, feedbackStatus: 'pending' };
  assert.match(recordFeedbackError(rev, { status: 'pending', feedbackAt: '2026-07-28' }), /ต้องระบุผล/);
  assert.match(recordFeedbackError(rev, { status: 'approved' }), /วันที่/);
  assert.match(recordFeedbackError(rev, { status: 'approved', feedbackAt: '28/07/2026' }), /ไม่ถูกต้อง/);
  assert.equal(recordFeedbackError(rev, { status: 'approved', feedbackAt: '2026-07-28' }), null);
});

test('feedback ขยับสถานะกลิ่นให้เอง — rejected ไม่แตะ (ระบบเดาแทนคนไม่ได้)', () => {
  assert.equal(scentStatusAfterFeedback(scent({ status: 'developing' }), 'approved'), 'active');
  assert.equal(scentStatusAfterFeedback(scent({ status: 'active' }), 'approved'), null);
  assert.equal(scentStatusAfterFeedback(scent({ status: 'active' }), 'revise'), 'developing');
  assert.equal(scentStatusAfterFeedback(scent({ status: 'developing' }), 'rejected'), null);
  assert.equal(scentStatusAfterFeedback(scent({ status: 'archived' }), 'approved'), null);
});

test('สรุป Rev นับสดจากลูกเสมอ', () => {
  const s = revisionSummary([
    { revisionNo: 1, feedbackStatus: 'revise' },
    { revisionNo: 2, feedbackStatus: 'pending' },
  ]);
  assert.deepEqual(s, { total: 2, latestNo: 2, latestStatus: 'pending', approved: false, waiting: true });
});

test('วันที่ส่งกลิ่นบังคับและต้องเป็นรูปแบบ ISO', () => {
  assert.match(normalizeRevisionInput({}).error, /วันที่ส่ง/);
  assert.match(normalizeRevisionInput({ sentAt: '28-07-2026' }).error, /ไม่ถูกต้อง/);
  assert.equal(normalizeRevisionInput({ sentAt: '2026-07-28' }).error, null);
});
