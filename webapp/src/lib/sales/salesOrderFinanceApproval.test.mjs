import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINANCE_REVIEW_POINTS, FINANCE_STATUSES, FINANCE_STATUS_LABELS, FINANCE_STATUS_TONES,
  awaitsFinanceReview, financeActionError, financeSendLabel, financeStatusOf, financeWorkflowStep,
  salesOrderWorkflowIndex,
} from './salesOrderFinanceApproval.js';

const FN = { id: 'u-fn', role: 'finance', department: 'FN' };
const FN_STAFF = { id: 'u-fn2', role: 'staff', department: 'FN' };
const AE_SUP = { id: 'u-sup', role: 'ae_supervisor', department: 'SA' };
const AE = { id: 'u-ae', role: 'ae' };
const ADMIN = { id: 'u-admin', role: 'admin' };

const approved = (extra = {}) => ({ status: 'approved', financeStatus: 'pending', ...extra });

// ── ใบที่ยังไม่ถึงคิว ────────────────────────────────────────────────────
/* 🔴 ใบที่อนุมัติไปแล้ว **ก่อน** mig 0250 มี financeStatus = NULL ซึ่งแปลว่า
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

/* 🔴 ใบที่อนุมัติไปก่อนมีขั้นนี้ค้าง financeStatus = null · ถ้าไม่เปิดทางส่งเข้าคิว
   มันจะไม่มีวันถึงมือบัญชีเลย (ตอนเจอ: ทุกใบในระบบเป็นแบบนี้ทั้งหมด) */
test('ใบที่อนุมัติไปแล้วแต่ยังไม่เข้าแกน ส่งเข้าคิวบัญชีได้', () => {
  const legacy = approved({ financeStatus: null });
  assert.equal(financeActionError(legacy, 'finance_resubmit', AE_SUP), null);
  assert.equal(financeSendLabel(legacy), 'ส่งให้บัญชีตรวจ');
  assert.equal(financeSendLabel(approved({ financeStatus: 'rejected' })), 'ส่งให้บัญชีตรวจใหม่');
  // ยังต้องผ่าน AE Supervisor ก่อน — ใบร่างส่งข้ามหัวไปหาบัญชีไม่ได้
  assert.match(financeActionError({ status: 'draft' }, 'finance_resubmit', AE_SUP), /ยังไม่ผ่าน AE Supervisor/);
});

test('ส่งเข้าคิวซ้ำไม่ได้ ทั้งใบที่รอตรวจอยู่และใบที่ตรวจผ่านแล้ว', () => {
  assert.match(financeActionError(approved(), 'finance_resubmit', AE_SUP), /อยู่ในคิวของบัญชีอยู่แล้ว/);
  assert.match(financeActionError(approved({ financeStatus: 'approved' }), 'finance_resubmit', AE_SUP), /อนุมัติใบนี้ไปแล้ว/);
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

/* ═══════════════════════════════════════════════════════════════════════
   🔴 หมุดบนรางก้าว: **✓ = เรียบร้อย · ตัวเลข = อยู่ขั้นนั้น รอดำเนินการ**
   (feedback ผู้ใช้ 2026-08-13 — ทักว่าใบที่บัญชีอนุมัติแล้วยังขึ้นเลข 5)
   `workflowStepsFromIndex`: index < current = done · === current = current
   ⇒ ใบที่จบครบต้องชี้ **พ้นท้ายราง** ไม่งั้นขั้นสุดท้ายค้างเป็นเลขตลอด
   ═══════════════════════════════════════════════════════════════════════ */
test('ใบที่ยังไม่อนุมัติ ใช้ขั้นของสายเอกสารตามเดิม', () => {
  assert.equal(salesOrderWorkflowIndex({ status: 'draft' }, { baseIndex: 0, stepCount: 4 }), 0);
  assert.equal(salesOrderWorkflowIndex({ status: 'pending_approval' }, { baseIndex: 1, stepCount: 4 }), 1);
});

test('ใบเก่าที่อนุมัติแล้ว (ไม่มีขั้นบัญชี) = ✓ ทั้งราง ไม่มีเลขค้าง', () => {
  // ชี้พ้นท้าย ⇒ ทุก index < current ⇒ done ทั้งหมด
  assert.equal(salesOrderWorkflowIndex({ status: 'approved' }, { baseIndex: 3, stepCount: 4 }), 4);
});

test('รอบัญชีตรวจ / บัญชีตีกลับ = ขั้นก่อนหน้า ✓ ทั้งหมด และค้างที่ขั้นบัญชี', () => {
  for (const financeStatus of ['pending', 'rejected']) {
    assert.equal(
      salesOrderWorkflowIndex({ status: 'approved', financeStatus }, { baseIndex: 3, stepCount: 5 }),
      4,
      `${financeStatus} ต้องชี้ที่ขั้นบัญชี (index 4 จาก 5 ขั้น)`,
    );
  }
});

test('บัญชีอนุมัติแล้ว = ✓ ทั้งราง รวมขั้นบัญชี', () => {
  assert.equal(
    salesOrderWorkflowIndex({ status: 'approved', financeStatus: 'approved' }, { baseIndex: 3, stepCount: 5 }),
    5,
  );
});
