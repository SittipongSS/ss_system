import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FINANCE_REVIEW_POINTS, FINANCE_STATUSES, FINANCE_STATUS_LABELS, FINANCE_STATUS_TONES,
  awaitsFinanceReview, financeActionError, financeStatusOf, financeWorkflowStep,
  salesOrderFullyPaid, salesOrderPaymentProgress, salesOrderWorkflowIndex,
} from './salesOrderFinanceApproval.js';

/* ⭐ **มติผู้ใช้ 2026-08-30 — บัญชีย้ายมาอยู่ท้ายวง**: AE Sup → เก็บเงินครบ → บัญชีปิดใบ
   ⇒ ทุกด่านของบัญชีต้องได้ `installments` ด้วย · ไม่ส่ง = ปฏิเสธ ไม่ใช่ปล่อยผ่าน
   ⇒ `finance_reject` / `finance_resubmit` ถอดออกแล้ว (ตีกลับเหลือรายงวด) */
const PAID = [{ status: 'confirmed' }];
const HALF = [{ status: 'confirmed' }, { status: 'pending' }];

const FN = { id: 'u-fn', role: 'finance', department: 'FN' };
const FN_STAFF = { id: 'u-fn2', role: 'finance', department: 'FN' };
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
  assert.equal(awaitsFinanceReview({ status: 'approved', financeStatus: 'pending', totalAmount: 53500 }, PAID), true);
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
  assert.equal(financeActionError(approved(), 'finance_approve', FN, { installments: PAID }), null);
  assert.equal(financeActionError(approved(), 'finance_approve', FN_STAFF, { installments: PAID }), null);
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

/* 🔴 หัวใจของมติใหม่ — ปิดใบได้ต่อเมื่อเก็บครบทุกงวด */
test('⭐ ยังเก็บเงินไม่ครบ ปิดใบไม่ได้ และบอกว่าเหลือกี่งวด', () => {
  const err = financeActionError(approved(), 'finance_approve', FN, { installments: HALF });
  assert.match(err, /ยังเก็บเงินไม่ครบ \(1\/2 งวด\)/);
  assert.equal(financeActionError(approved(), 'finance_approve', FN, { installments: PAID }), null);
});

/* ⚠️ ไม่ส่งงวดมา = ปฏิเสธ ไม่ใช่ปล่อยผ่าน — ผู้เรียกที่ไม่มีบริบทงวดไม่ควรตัดสินใจปิดใบ */
test('ไม่ส่งงวดเข้าด่าน = ปิดใบไม่ได้ (fail-closed)', () => {
  assert.match(financeActionError(approved(), 'finance_approve', FN), /ยังไม่มีงวดชำระ/);
  assert.match(financeActionError(approved(), 'finance_approve', FN, { installments: [] }), /ยังไม่มีงวดชำระ/);
});

/* งวดที่แค่ "แจ้งแล้ว" หรือถูกตีกลับ ยังไม่นับว่าเก็บได้ — ลายเซ็นบัญชีคือเส้นแบ่งเสมอ */
test('งวดที่ยังไม่ confirmed ไม่นับว่าเก็บครบ', () => {
  assert.equal(salesOrderFullyPaid({ totalAmount: 100 }, [{ status: 'reported' }]), false);
  assert.equal(salesOrderFullyPaid({ totalAmount: 100 }, [{ status: 'rejected' }]), false);
  assert.equal(salesOrderFullyPaid({ totalAmount: 100 }, PAID), true);
  // ใบยอด 0 = ครบโดยปริยาย (ไม่มีเงินให้เก็บ)
  assert.equal(salesOrderFullyPaid({ totalAmount: 0 }, []), true);
  // ยอดไม่เป็นศูนย์แต่ไม่มีงวดเลย = ยังไม่ครบ (ใบเก่าที่ยังไม่เริ่มติดตาม)
  assert.equal(salesOrderFullyPaid({ totalAmount: 100 }, []), false);
  assert.deepEqual(salesOrderPaymentProgress(HALF), { done: 1, total: 2 });
});

/* คำสั่งเก่าถูกถอดออกแล้ว — ต้องตกเป็น "คำสั่งไม่ถูกต้อง" ไม่ใช่ยังทำงานเงียบ ๆ */
test('⭐ ตีกลับทั้งใบและส่งตรวจใหม่ถูกถอดออกแล้ว', () => {
  assert.match(financeActionError(approved(), 'finance_reject', FN, { reason: 'x'.repeat(20) }), /ไม่ถูกต้อง/);
  assert.match(financeActionError(approved({ financeStatus: 'rejected' }), 'finance_resubmit', AE_SUP), /ไม่ถูกต้อง/);
});

test('คำสั่งที่ไม่รู้จักถูกปฏิเสธ ไม่ใช่ผ่านเงียบ ๆ', () => {
  assert.match(financeActionError(approved(), 'approve', ADMIN), /ไม่ถูกต้อง/);
  assert.match(financeActionError(null, 'finance_approve', FN), /ไม่พบใบสั่งขาย/);
});

// ── ขั้นบนรางก้าว ───────────────────────────────────────────────────────
test('ขั้นบัญชีขึ้นเมื่อใบเข้าแกนแล้วเท่านั้น และบอกสถานะตรงตัว', () => {
  assert.equal(financeWorkflowStep(approved()).status, 'pending');
  assert.match(financeWorkflowStep(approved()).hint, /รอเก็บเงินครบ/);
  const ok = financeWorkflowStep(approved({ financeStatus: 'approved', financeApprovedByName: 'บัญชี ก' }));
  assert.equal(ok.hint, 'บัญชี ก');
  // ค่า rejected เขียนใหม่ไม่ได้แล้ว แต่ของเก่าต้องยังอ่านออก
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

/* 🪤 **ใบยอด 0 ไม่เข้าคิวบัญชี** (ผู้ใช้เจอบน production 2026-08-26: SO ยอด ฿0.00
   นั่งอยู่ในคิว "ใบที่รอบัญชีตรวจ") — สิ่งที่บัญชีตรวจคือเงื่อนไขชำระ ยอด/VAT เครดิต
   ซึ่งใบยอด 0 ไม่มีสักข้อ · กติกาเดียวกับงวดชำระที่ตัดใบยอด 0 ออกตั้งแต่ 2026-08-18 */
test('ใบยอด 0 ไม่ต้องให้บัญชีตรวจ — ทั้งที่ธงเคยถูกประทับไว้แล้ว', () => {
  const zero = { status: 'approved', financeStatus: 'pending', totalAmount: 0 };
  assert.equal(awaitsFinanceReview(zero, PAID), false);
  // ใบยอดปกติที่เก็บครบแล้วยังเข้าคิวเหมือนเดิม
  assert.equal(awaitsFinanceReview({ ...zero, totalAmount: 1 }, PAID), true);
  // ⚠️ "ไม่รู้ยอด" ≠ "ยอด 0" — แถวที่ยังโหลดไม่ครบต้องไม่ถูกตัดออกจากคิวเงียบ ๆ
  assert.equal(awaitsFinanceReview({ ...zero, totalAmount: null }, PAID), true);
  assert.equal(awaitsFinanceReview({ ...zero, totalAmount: undefined }, PAID), true);
  // ⭐ เก็บไม่ครบ = ยังไม่ใช่งานของบัญชีวันนี้ (มติ 2026-08-30)
  assert.equal(awaitsFinanceReview({ ...zero, totalAmount: 1 }, HALF), false);
});

test('ต้นทางไม่ประทับ pending ให้ใบยอด 0 ตอนอนุมัติ', () => {
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /if \(!paymentNotRequired\(before\.totalAmount\)\) \{[\s\S]{0,220}financeStatus: 'pending'/);
});

/* ⭐ ตั้งแต่มติ 2026-08-30 คิวบัญชีขึ้นกับ **งวดชำระ** ซึ่งจอไม่ได้โหลดมาด้วย
   ⇒ ธงย้ายไปคิดที่ server (`_awaitingFinanceReview`) แล้วจอแค่กรองตามธง
   ⚠️ ห้ามจอกลับไปคิดเองด้วย `awaitsFinanceReview(o)` มือเปล่า — จะได้ false ทุกใบ */
test('หน้าภาพรวมบัญชีกรองตามธงจาก server ไม่คิดเงื่อนไขเอง', () => {
  const page = readFileSync(new URL('../../app/finance/page.js', import.meta.url), 'utf8');
  assert.match(page, /_awaitingFinanceReview/);
  assert.doesNotMatch(page, /awaitsFinanceReview\(/, 'จอไม่มีงวดในมือ คิดเองได้ false เสมอ');
  assert.doesNotMatch(page, /financeStatus === "pending"/, 'ห้ามมีนิยามที่สอง');
});

/* ต้นทางของธง: ทะเบียน SO ต้องโหลดงวดมาป้อนด่านเดียวกัน ไม่ใช่เดา */
test('ทะเบียน SO คิดธงคิวบัญชีจากงวดจริง', () => {
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/route.js', import.meta.url), 'utf8');
  assert.match(route, /_awaitingFinanceReview:[\s\S]{0,120}awaitsFinanceReview\(row,/);
});
