import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINANCE_REVIEW_POINTS, FINANCE_STATUSES, FINANCE_STATUS_LABELS, FINANCE_STATUS_TONES,
  awaitsFinanceReview, financeActionError, financeStatusOf, financeWorkflowStep,
} from './salesOrderFinanceApproval.js';

const FN = { id: 'u-fn', role: 'finance', department: 'FN' };
const FN_STAFF = { id: 'u-fn2', role: 'staff', department: 'FN' };
const AE_SUP = { id: 'u-sup', role: 'ae_supervisor', department: 'SA' };
const AE = { id: 'u-ae', role: 'ae' };
const ADMIN = { id: 'u-admin', role: 'admin' };

const approved = (extra = {}) => ({ status: 'approved', financeStatus: 'pending', ...extra });

// ── ใบที่ยังไม่ถึงคิว ────────────────────────────────────────────────────
/* 🔴 ใบที่อนุมัติไปแล้ว **ก่อน** mig 0247 มี financeStatus = NULL ซึ่งแปลว่า
   "ออกก่อนมีขั้นนี้" ไม่ใช่ "รอบัญชี" — ถ้าอ่านผิดเป็น pending บัญชีจะเปิดมาเจอคิวค้าง
   ทั้งกองที่ไม่มีใครตั้งใจสร้าง */
test('ใบเก่าที่ไม่มี financeStatus = ยังไม่เข้าแกนบัญชี ไม่ใช่รอตรวจ', () => {
  assert.equal(financeStatusOf({ status: 'approved' }), null);
  assert.equal(awaitsFinanceReview({ status: 'approved' }), false);
  assert.equal(financeWorkflowStep({ status: 'approved' }), null);
});

test('ค่าที่ไม่รู้จักถูกปัดเป็น null ไม่ใช่ปล่อยผ่าน', () => {
  assert.equal(financeStatusOf({ financeStatus: 'มั่ว' }), null);
});

test('ใบที่ยังไม่ผ่าน AE Sup ไม่ถือว่ารอบัญชี แม้ธงจะเป็น pending', () => {
  assert.equal(awaitsFinanceReview({ status: 'pending_approval', financeStatus: 'pending' }), false);
});

// ── ด่านของบัญชี ────────────────────────────────────────────────────────
test('บัญชีอนุมัติได้ทั้ง role finance และผู้ใช้ FN เดิมที่ยังเป็น staff', () => {
  assert.equal(financeActionError(approved(), 'finance_approve', FN), null);
  assert.equal(financeActionError(approved(), 'finance_approve', FN_STAFF), null);
});

/* 🔴 แยกหน้าที่ — ฝ่ายขายตรวจแทนบัญชีไม่ได้ ไม่ว่าตำแหน่งอะไร
   `ae_supervisor` เป็นคนที่เพิ่งอนุมัติใบนี้เอง ถ้าตรวจซ้ำได้ก็เท่ากับไม่มีด่านที่สอง */
test('ฝ่ายขายตรวจใบแทนบัญชีไม่ได้ รวมถึงหัวหน้าฝ่ายขาย', () => {
  assert.match(financeActionError(approved(), 'finance_approve', AE_SUP), /เฉพาะฝ่ายบัญชี/);
  assert.match(financeActionError(approved(), 'finance_approve', AE), /เฉพาะฝ่ายบัญชี/);
});

test('ใบที่ยังไม่ผ่าน AE Sup บัญชีตรวจไม่ได้', () => {
  const row = { status: 'pending_approval', financeStatus: 'pending' };
  assert.match(financeActionError(row, 'finance_approve', FN), /ยังไม่ผ่าน AE Supervisor/);
});

test('อนุมัติซ้ำไม่ได้', () => {
  assert.match(financeActionError(approved({ financeStatus: 'approved' }), 'finance_approve', FN), /ไปแล้ว/);
});

test('ใบที่ยังไม่เข้าคิว (NULL) บัญชีกดไม่ได้', () => {
  assert.match(financeActionError({ status: 'approved' }, 'finance_approve', FN), /ยังไม่เข้าคิว/);
});

test('ตีกลับต้องมีเหตุผลอย่างน้อย 10 ตัวอักษร', () => {
  assert.match(financeActionError(approved(), 'finance_reject', FN, { reason: 'สั้น' }), /10 ตัวอักษร/);
  assert.equal(financeActionError(approved(), 'finance_reject', FN, { reason: 'ที่อยู่ออกบิลไม่ตรงกับทะเบียน' }), null);
});

// ── ส่งตรวจใหม่ ─────────────────────────────────────────────────────────
/* 🔴 ถ้าบัญชีกดส่งตรวจใหม่เองได้ = ตีกลับแล้วส่งเข้าคิวตัวเองครบวง ด่านไม่มีความหมาย */
test('ส่งตรวจใหม่เป็นของฝั่งขาย บัญชีกดเองไม่ได้', () => {
  const row = approved({ financeStatus: 'rejected' });
  assert.equal(financeActionError(row, 'finance_resubmit', AE_SUP), null);
  assert.equal(financeActionError(row, 'finance_resubmit', ADMIN), null);
  assert.match(financeActionError(row, 'finance_resubmit', FN), /AE Supervisor หรือ Admin/);
});

test('ส่งตรวจใหม่ได้เฉพาะใบที่ถูกตีกลับ', () => {
  assert.match(financeActionError(approved(), 'finance_resubmit', AE_SUP), /เฉพาะใบที่บัญชีตีกลับ/);
});

test('คำสั่งที่ไม่รู้จักถูกปฏิเสธ ไม่ใช่ผ่านเงียบ ๆ', () => {
  assert.match(financeActionError(approved(), 'approve', ADMIN), /ไม่ถูกต้อง/);
  assert.match(financeActionError(null, 'finance_approve', FN), /ไม่พบใบสั่งขาย/);
});

// ── ขั้นบนรางก้าว ───────────────────────────────────────────────────────
test('ขั้นบัญชีขึ้นเมื่อใบเข้าแกนแล้วเท่านั้น และบอกสถานะตรงตัว', () => {
  assert.equal(financeWorkflowStep(approved()).status, 'pending');
  assert.match(financeWorkflowStep(approved()).hint, /รอฝ่ายบัญชี/);
  const ok = financeWorkflowStep(approved({ financeStatus: 'approved', financeApprovedByName: 'บัญชี ก' }));
  assert.equal(ok.hint, 'บัญชี ก');
  assert.match(financeWorkflowStep(approved({ financeStatus: 'rejected' })).hint, /AE Supervisor/);
});

// ── ทะเบียนครบ ──────────────────────────────────────────────────────────
test('ทุกสถานะมีป้ายและโทนครบ', () => {
  for (const s of FINANCE_STATUSES) {
    assert.ok(FINANCE_STATUS_LABELS[s], `ขาดป้ายของ ${s}`);
    assert.ok(FINANCE_STATUS_TONES[s], `ขาดโทนของ ${s}`);
  }
  assert.deepEqual(Object.keys(FINANCE_STATUS_LABELS).sort(), [...FINANCE_STATUSES].sort());
});

test('เช็กลิสต์ที่บัญชีตรวจครบสี่ข้อตามมติ', () => {
  assert.equal(FINANCE_REVIEW_POINTS.length, 4);
  assert.ok(FINANCE_REVIEW_POINTS.some((p) => p.includes('เลขผู้เสียภาษี')));
  assert.ok(FINANCE_REVIEW_POINTS.some((p) => p.includes('เครดิต')));
});
