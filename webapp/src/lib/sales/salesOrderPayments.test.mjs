import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTALLMENT_DISPLAY_STATUSES,
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_TONES,
  INSTALLMENT_STATUSES,
  buildInstallmentsForOrder,
  installmentActionError,
  installmentDisplayStatus,
  installmentPlanDrift,
  installmentPrepaid,
  installmentReportOutcome,
  installmentsFromPaymentPlan,
  isInstallmentFrozen,
  paymentNotRequired,
  paymentLockReason,
  paymentRollup,
  salesOrderPaymentNote,
  paymentState,
  previewInstallments,
  withLiveAmounts,
} from './salesOrderPayments.js';

/* ⭐ งวดที่ **ยอดหยุดแล้ว** (B-4 · mig 0259) — ทุกแถวที่เดินสายแจ้ง/คอนเฟิร์มได้
   ต้องผ่านจุดนี้มาก่อนเสมอ · fixture ที่ลืมใส่จะติดด่าน "ใบยังไม่อนุมัติ" ซึ่งถูกแล้ว */
const FROZEN = '2026-08-14T03:00:00.000Z';
const frozen = (row) => ({ frozenAt: FROZEN, ...row });

const SA = { id: 'u-sa', role: 'ae' };
const SA_OTHER = { id: 'u-sa2', role: 'ae' };
const AE_SUP = { id: 'u-sup', role: 'ae_supervisor', department: 'SA' };
const FN_STAFF = { id: 'u-fn', role: 'finance', department: 'FN' };
const FN_ROLE = { id: 'u-fn2', role: 'finance', department: 'FN' };
const PC_STAFF = { id: 'u-pc', role: 'pc', department: 'PC' };
const ADMIN = { id: 'u-admin', role: 'admin' };

// ── สร้างงวดจากแผนของ QT ────────────────────────────────────────────────
test('ชำระเต็มจำนวนได้หนึ่งงวด 100% ไม่ใช่ศูนย์งวด', () => {
  const rows = installmentsFromPaymentPlan({ type: 'full' }, 64200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].percent, 100);
  assert.equal(rows[0].amount, 64200);
});

test('แบ่งงวดแล้วยอดรวมต้องเท่ายอดใบพอดี (เศษปัดไปงวดสุดท้าย)', () => {
  const plan = {
    type: 'installment',
    installments: [
      { label: 'มัดจำ', percent: 33.33 },
      { label: 'ระหว่างผลิต', percent: 33.33 },
      { label: 'ก่อนส่งมอบ', percent: 33.34 },
    ],
  };
  const rows = installmentsFromPaymentPlan(plan, 100000);
  const sum = rows.reduce((acc, r) => acc + r.amount, 0);
  assert.equal(Math.round(sum * 100) / 100, 100000);
  assert.deepEqual(rows.map((r) => r.seq), [1, 2, 3]);
});

test('งวดที่ไม่ตั้งชื่อได้ชื่อสำรอง ไม่ปล่อยว่าง', () => {
  const rows = installmentsFromPaymentPlan(
    { type: 'installment', installments: [{ percent: 50 }, { percent: 50 }] },
    1000,
  );
  assert.deepEqual(rows.map((r) => r.label), ['งวดที่ 1', 'งวดที่ 2']);
});

// ── ยืมหลักฐานจากตอนปิด Won ─────────────────────────────────────────────
const SLIP_EVIDENCE = {
  docType: 'payment_slip',
  docDate: '2026-08-05',
  attachments: [{ fileName: 'slip.jpg', storagePath: 'x/slip.jpg' }],
};
const PO_EVIDENCE = {
  docType: 'po',
  docDate: '2026-08-05',
  attachments: [{ fileName: 'po.pdf', storagePath: 'x/po.pdf' }],
};
const NOW = '2026-08-13T03:00:00.000Z';

test('ปิด Won ด้วยสลิป — งวดแรกขึ้นรอบัญชีตรวจพร้อมหลักฐานที่ยืมมา', () => {
  const rows = buildInstallmentsForOrder(
    { type: 'installment', installments: [{ label: 'มัดจำ', percent: 30 }, { label: 'ที่เหลือ', percent: 70 }] },
    100000,
    { confirmation: SLIP_EVIDENCE, actor: { id: 'u1', name: 'สมชาย' }, now: NOW },
  );
  assert.equal(rows[0].status, 'reported');
  assert.equal(rows[0].paidOn, '2026-08-05');
  assert.equal(rows[0].reportedAt, NOW);
  assert.equal(rows[0].reportedByName, 'สมชาย');
  assert.equal(rows[0].evidence.length, 1);
});

/* 🔴 ยืมหลักฐานมาให้ ≠ ข้ามด่านบัญชี — ตั้งได้แค่ reported เท่านั้น */
test('งวดที่ยืมหลักฐานมายังต้องรอบัญชี ไม่ใช่ confirmed', () => {
  const rows = buildInstallmentsForOrder({ type: 'full' }, 64200, {
    confirmation: SLIP_EVIDENCE, actor: { id: 'u1', name: 'สมชาย' }, now: NOW,
  });
  assert.equal(rows[0].status, 'reported');
  assert.notEqual(rows[0].status, 'confirmed');
  assert.equal(paymentRollup(rows, '2026-08-13').confirmedAmount, 0);
});

test('ตั้งให้เฉพาะงวดแรก — สลิปใบเดียวไม่รู้ว่าครอบคลุมกี่งวด', () => {
  const rows = buildInstallmentsForOrder(
    { type: 'installment', installments: [{ percent: 30 }, { percent: 30 }, { percent: 40 }] },
    100000,
    { confirmation: SLIP_EVIDENCE, actor: { id: 'u1', name: 'สมชาย' }, now: NOW },
  );
  assert.deepEqual(rows.map((r) => r.status || 'pending'), ['reported', 'pending', 'pending']);
});

test('ปิด Won ด้วย PO ไม่ใช่หลักฐานว่าจ่ายเงิน — ทุกงวดยัง pending', () => {
  const rows = buildInstallmentsForOrder({ type: 'full' }, 64200, {
    confirmation: PO_EVIDENCE, actor: { id: 'u1', name: 'สมชาย' }, now: NOW,
  });
  assert.equal(rows[0].status, undefined);
});

test('สลิปที่ไม่มีไฟล์แนบหรือไม่มีวันที่ ไม่ตั้งงวดให้', () => {
  const noFiles = buildInstallmentsForOrder({ type: 'full' }, 100, {
    confirmation: { ...SLIP_EVIDENCE, attachments: [] }, now: NOW,
  });
  const noDate = buildInstallmentsForOrder({ type: 'full' }, 100, {
    confirmation: { ...SLIP_EVIDENCE, docDate: null }, now: NOW,
  });
  assert.equal(noFiles[0].status, undefined);
  assert.equal(noDate[0].status, undefined);
});

test('ไม่มีหลักฐาน Won เลย ได้งวดเปล่าเหมือนเดิม', () => {
  assert.deepEqual(
    buildInstallmentsForOrder({ type: 'full' }, 500),
    installmentsFromPaymentPlan({ type: 'full' }, 500),
  );
});

// ── สรุปว่าชำระครบยัง ───────────────────────────────────────────────────
const rowsFixture = [
  { seq: 1, amount: 20000, status: 'confirmed', dueDate: '2026-07-01' },
  { seq: 2, amount: 20000, status: 'reported', dueDate: '2026-08-01' },
  { seq: 3, amount: 24200, status: 'pending', dueDate: '2026-09-30' },
];

test('รวมยอดและนับงวดถูกต้อง', () => {
  const r = paymentRollup(rowsFixture, '2026-08-13');
  assert.equal(r.count, 3);
  assert.equal(r.confirmedCount, 1);
  assert.equal(r.confirmedAmount, 20000);
  assert.equal(r.totalAmount, 64200);
  assert.equal(r.outstandingAmount, 44200);
  assert.equal(r.complete, false);
  assert.equal(r.nextDue, '2026-08-01');
});

/* 🔴 หัวใจของด่านนี้ — ถ้า reported ถูกนับว่าชำระแล้ว SA จะแจ้งเองนับเองครบวงจร
   (กติกาเดียวกับที่แผนสัญญาบริการห้าม reported ปลดด่านเข้าไซต์) */
test('reported ไม่ถูกนับเป็นชำระแล้ว', () => {
  const r = paymentRollup(rowsFixture, '2026-08-13');
  assert.equal(r.confirmedAmount, 20000, 'งวดที่แจ้งแล้วแต่ยังไม่คอนเฟิร์มต้องไม่ถูกนับ');
  assert.equal(r.outstandingAmount, 44200);
});

test('เลยกำหนดนับงวดที่แจ้งแล้วแต่บัญชียังไม่รับรองด้วย', () => {
  const r = paymentRollup(rowsFixture, '2026-08-13');
  assert.equal(r.overdueCount, 1, 'งวด 2 ครบ 01/08 แล้วยังไม่ confirmed');
});

test('ครบทุกงวดถึงจะเรียกว่าชำระครบ', () => {
  const all = rowsFixture.map((r) => ({ ...r, status: 'confirmed' }));
  const r = paymentRollup(all, '2026-10-01');
  assert.equal(r.complete, true);
  assert.equal(r.outstandingAmount, 0);
  assert.equal(r.overdueCount, 0);
});

test('ใบที่ยังไม่มีงวดไม่ใช่ "ชำระครบ"', () => {
  const r = paymentRollup([], '2026-08-13');
  assert.equal(r.complete, false);
  assert.equal(paymentState(r).state, 'none');
});

test('สถานะรวมเรียงความสำคัญ: เลยกำหนดมาก่อนรอตรวจ', () => {
  assert.equal(paymentState(paymentRollup(rowsFixture, '2026-08-13')).state, 'overdue');
  assert.equal(paymentState(paymentRollup(rowsFixture, '2026-07-15')).state, 'reviewing');
});

// ── งวดร่าง vs งวดที่ยอดหยุดแล้ว (B-4 · mig 0259) ───────────────────────
const DRAFT_PLAN = {
  type: 'installment',
  installments: [{ label: 'มัดจำ', percent: 30 }, { label: 'ที่เหลือ', percent: 70 }],
};

test('งวดร่างเดินตามแผนของ QT — กำหนดชำระที่ SA กรอกไว้ต้องรอด', () => {
  const stored = [
    { id: 'a', seq: 1, label: 'มัดจำ', percent: 30, amount: 3000, dueDate: '2026-09-01', note: 'โอนก่อน' },
    { id: 'b', seq: 2, label: 'ที่เหลือ', percent: 70, amount: 7000, dueDate: '2026-10-01' },
  ];
  // ยอดใบเปลี่ยนจาก 10,000 เป็น 20,000 หลังกด "เริ่มติดตาม"
  const live = withLiveAmounts(stored, DRAFT_PLAN, 20000);
  assert.deepEqual(live.map((r) => r.amount), [6000, 14000]);
  // ⭐ ของที่ SA กรอกห้ามหาย
  assert.deepEqual(live.map((r) => r.dueDate), ['2026-09-01', '2026-10-01']);
  assert.equal(live[0].note, 'โอนก่อน');
});

test('งวดที่ freeze แล้วห้ามขยับตามใบอีก — ยอดที่เซ็นไปแล้วคือของจริง', () => {
  const stored = [frozen({ id: 'a', seq: 1, percent: 30, amount: 3000 })];
  assert.equal(withLiveAmounts(stored, DRAFT_PLAN, 20000)[0].amount, 3000);
  assert.equal(isInstallmentFrozen(stored[0]), true);
  assert.equal(isInstallmentFrozen({ id: 'b' }), false);
});

test('จำนวนงวดไม่ตรงแผน = เรื่องที่ทับยอดอย่างเดียวแก้ไม่ได้ ต้องบอกผู้ใช้', () => {
  const two = [{ seq: 1, amount: 1 }, { seq: 2, amount: 1 }];
  assert.equal(installmentPlanDrift(two, DRAFT_PLAN, 10000), null);
  assert.deepEqual(
    installmentPlanDrift([{ seq: 1, amount: 1 }], DRAFT_PLAN, 10000),
    { planned: 2, tracked: 1 },
  );
  // freeze แล้วไม่ตามแผนอีก — ใบที่อนุมัติไปแล้วไม่ใช่เรื่องของแผนวันนี้
  assert.equal(installmentPlanDrift([frozen({ seq: 1, amount: 1 })], DRAFT_PLAN, 10000), null);
  // ยังไม่มีงวด = ไม่มีอะไรให้เตือน
  assert.equal(installmentPlanDrift([], DRAFT_PLAN, 10000), null);
  /* ⚠️ QT ที่ไม่มีแผนชำระ = **หนึ่งงวดเต็มจำนวน** ไม่ใช่ศูนย์งวด (กติกาของ
     `installmentsFromPaymentPlan`) ⇒ ใบที่ตั้งไว้ 2 งวดแล้วแผนหายไปก็ยังเป็น drift จริง */
  assert.deepEqual(installmentPlanDrift(two, null, 10000), { planned: 1, tracked: 2 });
});

/* 🔴 หัวใจของ B-4 + มติ 2026-08-19 — งวดร่างกรอกกำหนดชำระได้ **และบันทึกเงินได้**
   สิ่งที่ต้องรอยอดนิ่งคือการส่งให้บัญชีตรวจ ไม่ใช่การบันทึกว่าเงินเข้า */
test('งวดร่างบันทึกการจ่ายได้ แต่ปลายทางจอดที่ pending ไม่เข้าคิวบัญชี', () => {
  const draft = { status: 'pending' };
  assert.equal(installmentActionError(draft, 'report', SA, { paidOn: '2026-08-10' }), null);
  assert.equal(installmentReportOutcome(SA, draft), 'pending');
  // แม้แต่บัญชีกดเอง ก็ยังไม่ confirmed — คำรับรองต้องอยู่บนยอดที่นิ่งแล้ว
  assert.equal(installmentReportOutcome(FN_ROLE, draft), 'pending');
  // ⭐ ตั้งกำหนดชำระได้เหมือนเดิม
  assert.equal(installmentActionError(draft, 'schedule', SA), null);
});

test('งวดร่างที่บันทึกเงินไว้แล้ว บันทึกซ้ำไม่ได้ แต่ลบทิ้งได้', () => {
  const prepaid = { status: 'pending', paidOn: '2026-08-10', evidence: [{ name: 'slip.pdf' }] };
  assert.equal(installmentPrepaid(prepaid), true);
  assert.equal(installmentDisplayStatus(prepaid), 'prepaid');
  assert.match(installmentActionError(prepaid, 'report', SA, { paidOn: '2026-08-11' }), /บันทึกการจ่ายไว้แล้ว/);
  // ⚠️ สถานะยัง pending ⇒ ถ้ายึด status อย่างเดียว คนแนบสลิปผิดจะลบไม่ได้
  assert.equal(installmentActionError(prepaid, 'withdraw', SA), null);
});

test('งวดร่างที่บันทึกเงินไว้ นับเป็น "แจ้งแล้ว" ของด่านไล่ลำดับ', () => {
  const rows = [
    { seq: 1, status: 'pending', paidOn: '2026-08-10', evidence: [{ name: 'slip.pdf' }] },
    { seq: 2, status: 'pending' },
  ];
  // ไม่งั้นใบที่ยังไม่อนุมัติจะตันตั้งแต่งวด 2 ทั้งที่งวด 1 มีสลิปแล้ว
  assert.equal(installmentActionError(rows[1], 'report', SA, { paidOn: '2026-08-12', rows }), null);
});

test('งวดที่ freeze แล้วไม่ใช่ prepaid — ปลายทางกลับไปตามสิทธิ์ของคนกด', () => {
  const row = frozen({ status: 'pending', paidOn: '2026-08-10', evidence: [{ name: 'slip.pdf' }] });
  assert.equal(installmentPrepaid(row), false);
  assert.equal(installmentReportOutcome(SA, row), 'reported');
  assert.equal(installmentReportOutcome(FN_ROLE, row), 'confirmed');
});

// ── ด่านของแต่ละคำสั่ง ──────────────────────────────────────────────────
test('SA แจ้งชำระได้ แต่ต้องระบุวันที่ลูกค้าจ่าย', () => {
  const row = frozen({ status: 'pending' });
  assert.match(installmentActionError(row, 'report', SA, {}), /วันที่ลูกค้าชำระ/);
  assert.equal(installmentActionError(row, 'report', SA, { paidOn: '2026-08-10' }), null);
});

test('แจ้งซ้ำงวดที่คอนเฟิร์มแล้วไม่ได้', () => {
  const row = frozen({ status: 'confirmed' });
  assert.match(installmentActionError(row, 'report', SA, { paidOn: '2026-08-10' }), /คอนเฟิร์มแล้ว/);
});

test('ฝ่ายบัญชีคอนเฟิร์มได้ทั้ง role finance และผู้ใช้ FN เดิมที่ยังเป็น staff', () => {
  const row = { status: 'reported' };
  assert.equal(installmentActionError(row, 'confirm', FN_ROLE), null);
  assert.equal(installmentActionError(row, 'confirm', FN_STAFF), null);
});

/* 🔴 แยกหน้าที่ — ฝ่ายขายคอนเฟิร์มเงินเข้าเองไม่ได้ ไม่ว่าจะตำแหน่งอะไร
   ⚠️ `ae_supervisor` อยู่ใน isSuperuser ⇒ ถ้าเผลอ gate ด้วย isSuperuser ด่านนี้จะหายไปทั้งใบ */
test('ฝ่ายขายคอนเฟิร์มงวดเองไม่ได้ รวมถึงหัวหน้าฝ่ายขาย', () => {
  const row = { status: 'reported' };
  assert.match(installmentActionError(row, 'confirm', SA), /เฉพาะฝ่ายบัญชี/);
  assert.match(installmentActionError(row, 'confirm', AE_SUP), /เฉพาะฝ่ายบัญชี/);
});

test('staff ฝ่ายอื่นถือ cap แต่ไปไม่ถึง', () => {
  assert.match(installmentActionError({ status: 'reported' }, 'confirm', PC_STAFF), /เฉพาะฝ่ายบัญชี/);
});

test('admin คอนเฟิร์มแทนได้ (break-glass)', () => {
  assert.equal(installmentActionError({ status: 'reported' }, 'confirm', ADMIN), null);
});

test('คอนเฟิร์มงวดที่ยังไม่มีใครแจ้งไม่ได้', () => {
  assert.match(installmentActionError({ status: 'pending' }, 'confirm', FN_ROLE), /ยังไม่มีการแจ้ง/);
});

test('ตีกลับต้องมีเหตุผลอย่างน้อย 10 ตัวอักษร', () => {
  const row = { status: 'reported' };
  assert.match(installmentActionError(row, 'reject', FN_ROLE, { reason: 'สั้น' }), /10 ตัวอักษร/);
  assert.equal(installmentActionError(row, 'reject', FN_ROLE, { reason: 'ยอดไม่ตรงกับสลิปที่แนบมา' }), null);
});

test('งวดที่ถูกตีกลับกลับมาแจ้งใหม่ได้', () => {
  assert.equal(installmentActionError(frozen({ status: 'rejected' }), 'report', SA, { paidOn: '2026-08-12' }), null);
});

test('ดึงกลับได้เฉพาะผู้แจ้งเอง และเฉพาะตอนบัญชียังไม่ตัดสิน', () => {
  const row = { status: 'reported', reportedById: 'u-sa' };
  assert.equal(installmentActionError(row, 'withdraw', SA), null);
  assert.match(installmentActionError(row, 'withdraw', SA_OTHER), /เฉพาะผู้ที่แจ้ง/);
  assert.equal(installmentActionError(row, 'withdraw', ADMIN), null);
  assert.match(
    installmentActionError({ ...row, status: 'confirmed' }, 'withdraw', SA),
    /เฉพาะงวดที่แจ้งแล้ว/,
  );
});

test('แก้กำหนดชำระได้เสมอ ยกเว้นงวดที่บัญชีคอนเฟิร์มแล้ว', () => {
  assert.equal(installmentActionError({ status: 'pending' }, 'schedule', SA), null);
  assert.equal(installmentActionError({ status: 'reported' }, 'schedule', SA), null);
  assert.match(installmentActionError({ status: 'confirmed' }, 'schedule', SA), /คอนเฟิร์มแล้ว/);
  assert.match(installmentActionError({ status: 'pending' }, 'schedule', FN_ROLE), /ไม่มีสิทธิ์/);
});

// ── ผูก/ถอดคำร้องขอเอกสารการเงิน (B-5 · mig 0260) ───────────────────────
test('ผูกคำร้องเป็นงานของฝ่ายขาย และต้องเลือกคำร้องจริง', () => {
  const row = frozen({ status: 'pending' });
  assert.match(installmentActionError(row, 'link', SA, {}), /ต้องเลือกคำร้อง/);
  assert.equal(installmentActionError(row, 'link', SA, { billingRequestId: 'DR-1' }), null);
  // บัญชีเห็นความเชื่อมโยงได้ แต่ไม่ใช่คนกด — เขาไม่มี salesplan:edit
  assert.match(installmentActionError(row, 'link', FN_ROLE, { billingRequestId: 'DR-1' }), /ไม่มีสิทธิ์/);
});

/* ⭐ ของจริงขอใบเสร็จ **หลัง** เงินเข้าเป็นเรื่องปกติ — ปิดตรงนี้เมื่อไร
   ใบเสร็จจะไม่มีที่ให้แขวน (ต่างจาก `schedule` ที่ล็อกเมื่อคอนเฟิร์มแล้ว) */
test('แนบคำร้องได้แม้งวดคอนเฟิร์มไปแล้ว', () => {
  const done = frozen({ status: 'confirmed' });
  assert.equal(installmentActionError(done, 'link', SA, { billingRequestId: 'DR-1' }), null);
  assert.match(installmentActionError(done, 'schedule', SA), /คอนเฟิร์มแล้ว/);
});

test('ถอดคำร้องได้เฉพาะงวดที่ผูกไว้แล้ว', () => {
  assert.match(installmentActionError(frozen({ status: 'pending' }), 'unlink', SA), /ยังไม่ได้ผูก/);
  assert.equal(
    installmentActionError(frozen({ status: 'pending', billingRequestId: 'DR-1' }), 'unlink', SA),
    null,
  );
});

/* ⚠️ งวดร่างก็แนบคำร้องได้ — คำร้องเกิดตั้งแต่ตอนมีแค่ QT ("50% ก่อนผลิต")
   ซึ่งมักเกิด**ก่อน**ใบสั่งขายอนุมัติด้วยซ้ำ · บล็อกตรงนี้ = บังคับให้รอโดยไม่มีเหตุผล */
test('งวดร่างแนบคำร้องได้ และบันทึกการจ่ายได้ — ต่างกันที่ปลายทางของสถานะ', () => {
  const draft = { status: 'pending' };
  assert.equal(installmentActionError(draft, 'link', SA, { billingRequestId: 'DR-1' }), null);
  assert.equal(installmentActionError(draft, 'report', SA, { paidOn: '2026-08-10' }), null);
  assert.equal(installmentReportOutcome(SA, draft), 'pending');
});

test('คำสั่งที่ไม่รู้จักถูกปฏิเสธ ไม่ใช่ผ่านเงียบ ๆ', () => {
  assert.match(installmentActionError({ status: 'reported' }, 'approve', ADMIN), /ไม่ถูกต้อง/);
  assert.match(installmentActionError(null, 'confirm', ADMIN), /ไม่พบงวด/);
});

/* ═══════════════════════════════════════════════════════════════════════
   🔴 Actual = ยอดเต็มของใบ **ไม่ใช่ยอดที่เก็บเงินได้** (มติผู้ใช้ 2026-08-13)

   SA ได้ยอดเต็ม 100% ตั้งแต่ใบอนุมัติ ต่อให้แบ่งจ่ายกี่งวดก็ตาม — งวดชำระเป็น
   **คนละแกน** ใช้ติดตามการเก็บเงินเท่านั้น ห้ามมีใครเอามาหักยอด Actual
   เทสต์ชุดนี้ล็อกไว้ว่าตัวเลขสองฝั่งไม่ผูกกัน ถ้าวันหน้ามีคนต่อสายให้มันคุยกัน
   จะพังตรงนี้ก่อนขึ้น prod
   ═══════════════════════════════════════════════════════════════════════ */
test('ยอดที่เก็บได้ไม่เท่ากับยอดใบ และไม่ใช่เรื่องเดียวกัน', () => {
  const r = paymentRollup(rowsFixture, '2026-08-13');
  // ใบนี้ยอดเต็ม 64,200 แต่เก็บเงินได้จริงแค่ 20,000
  assert.equal(r.totalAmount, 64200);
  assert.equal(r.confirmedAmount, 20000);
  assert.notEqual(r.confirmedAmount, r.totalAmount, 'ยอดเก็บได้ต้องเป็นคนละตัวกับยอดใบ');
});

test('ใบที่ยังไม่เก็บเงินได้สักบาท rollup ต้องไม่คืนอะไรที่ตีความเป็นยอดใบได้', () => {
  const unpaid = rowsFixture.map((r) => ({ ...r, status: 'pending' }));
  const r = paymentRollup(unpaid, '2026-08-13');
  assert.equal(r.confirmedAmount, 0);
  assert.equal(r.outstandingAmount, 64200);
  // ไม่มีคีย์ชื่อ actual/wonValue หลุดออกจาก rollup — กันคนหยิบไปใช้ผิดที่
  assert.deepEqual(
    Object.keys(r).filter((k) => /actual|won/i.test(k)),
    [],
    'rollup ของงวดห้ามมีคีย์ที่ชื่อชวนให้เข้าใจว่าเป็นยอด Actual',
  );
});

// ── ล็อกใบเมื่อบัญชีรับรองเงินแล้ว ──────────────────────────────────────
test('มีงวดที่คอนเฟิร์มแล้ว = ล็อกการถอยใบ', () => {
  assert.equal(paymentLockReason([{ status: 'pending' }, { status: 'reported' }]), null);
  assert.match(paymentLockReason([{ status: 'confirmed' }]), /บัญชีคอนเฟิร์มแล้ว 1 งวด/);
});

// ── ทะเบียนสถานะครบ ─────────────────────────────────────────────────────
test('ทุกสถานะมีป้ายและโทนครบ', () => {
  for (const status of INSTALLMENT_DISPLAY_STATUSES) {
    assert.ok(INSTALLMENT_STATUS_LABELS[status], `ขาดป้ายของ ${status}`);
    assert.ok(INSTALLMENT_STATUS_TONES[status], `ขาดโทนของ ${status}`);
  }
  assert.deepEqual(
    Object.keys(INSTALLMENT_STATUS_LABELS).sort(),
    [...INSTALLMENT_DISPLAY_STATUSES].sort(),
  );
  // ⚠️ `prepaid` เป็นของจอเท่านั้น — หลุดเข้ารายการสถานะจริงเมื่อไร DB ปฏิเสธแถวนั้น
  assert.ok(!INSTALLMENT_STATUSES.includes('prepaid'));
});

/* ── preview: โชว์งวดตั้งแต่ใบยังเป็นร่าง (มติผู้ใช้ 2026-08-13) ─────────── */
test('preview คำนวณสดจากแผน QT และตรงกับงวดจริงที่จะถูกสร้าง', () => {
  const plan = { type: 'installment', installments: [{ label: 'มัดจำ', percent: 30 }, { label: 'ที่เหลือ', percent: 70 }] };
  const rows = previewInstallments(plan, 100000);
  assert.deepEqual(rows.map((r) => r.amount), installmentsFromPaymentPlan(plan, 100000).map((r) => r.amount));
});

/* 🔴 preview ต้องกดอะไรไม่ได้ — ยังไม่มีแถวใน DB ให้อ้างถึง
   ไม่มี id = หน้าเว็บซ่อนปุ่มได้ · และถึงหลุดไปยิง API ก็ไม่มี installmentId ให้ส่ง */
test('preview ไม่มี id และถูกทำเครื่องหมายไว้ชัดเจน', () => {
  for (const row of previewInstallments({ type: 'full' }, 500)) {
    assert.equal(row.id, null);
    assert.equal(row.preview, true);
    assert.equal(row.status, 'pending');
  }
});

test('ใบเสนอราคาไม่มีแผนชำระ = preview ยังได้หนึ่งงวดเต็มจำนวน ไม่ใช่ศูนย์', () => {
  assert.equal(previewInstallments(null, 1000).length, 1);
  assert.equal(previewInstallments(undefined, 1000)[0].percent, 100);
});

// ── คำอธิบายสถานะการชำระในตารางรายการ SO (มติผู้ใช้ 2026-08-13) ──────────
/* 🔴 ใบที่ขึ้น 0/2 เหมือนกันเป๊ะ อาจเป็น "ลูกค้ายังไม่จ่าย" หรือ "จ่ายแล้วรอบัญชี
   รับรอง" ซึ่งเป็นงานคนละฝ่าย — ตัวเลขอย่างเดียวจึงไม่พอ */
test('บอกเรื่องที่ด่วนที่สุดเรื่องเดียว ตามลำดับ เลยกำหนด > ตีกลับ > รอรับรอง', () => {
  const cell = (extra) => salesOrderPaymentNote({ tracked: true, paid: 0, count: 2, complete: false, overdue: 0, reviewing: 0, rejected: 0, ...extra });
  assert.equal(cell({ overdue: 1, rejected: 1, reviewing: 1 }).label, 'เลยกำหนด 1 งวด');
  assert.equal(cell({ rejected: 1, reviewing: 1 }).label, 'บัญชีตีกลับ 1 งวด');
  assert.equal(cell({ reviewing: 2 }).label, 'รอบัญชีรับรอง 2 งวด');
  assert.equal(cell({ paid: 2, complete: true }).label, 'เก็บครบแล้ว');
  assert.equal(cell({}).label, 'รอลูกค้าชำระ');
});

test('โทนสีบอกเรื่องเดียว — แดงคือมีคนต้องลงมือแล้ว', () => {
  const cell = (extra) => salesOrderPaymentNote({ tracked: true, count: 1, ...extra });
  assert.equal(cell({ overdue: 1 }).tone, 'danger');
  assert.equal(cell({ rejected: 1 }).tone, 'danger');
  assert.equal(cell({ reviewing: 1 }).tone, 'warning');
  assert.equal(cell({ complete: true }).tone, 'success');
});

/* ⚠️ ใบที่ยังไม่เริ่มติดตาม ตัวเลขมาจาก **แผนใน QT** ไม่ใช่งวดจริง — ต้องบอกให้รู้
   ไม่งั้น "0/2" อ่านเหมือนติดตามแล้วแต่เก็บไม่ได้เลย */
test('ใบที่ยังไม่เริ่มติดตามต้องบอกว่าเลขมาจากแผน ไม่ใช่ของจริง', () => {
  assert.deepEqual(
    salesOrderPaymentNote({ tracked: false, paid: 0, count: 2, complete: false, overdue: 0, reviewing: 0, rejected: 0 }),
    { label: 'ยังไม่เริ่มติดตาม', tone: 'idle' },
  );
  assert.equal(salesOrderPaymentNote(null), null);
});

// ── ถอนคำรับรองของบัญชี (มติผู้ใช้ 2026-08-13) ───────────────────────────
const confirmedRow = (extra = {}) => ({
  id: 'SOI-1', seq: 1, status: 'confirmed',
  reportedById: 'u-ae', reportedAt: '2026-08-10T00:00:00Z',
  confirmedById: 'u-fn', confirmedAt: '2026-08-12T00:00:00Z', ...extra,
});
const FN_USER = { id: 'u-fn', role: 'finance', department: 'FN' };
const AE_USER = { id: 'u-ae', role: 'ae' };
const SUP_USER = { id: 'u-sup', role: 'ae_supervisor', department: 'SA' };
const OK_REASON = 'ธนาคารแจ้งว่ารายการโอนถูกตีกลับ';

test('ถอนคำรับรองได้เฉพาะฝ่ายบัญชี — ฝ่ายขายและหัวหน้าขายถอนแทนไม่ได้', () => {
  assert.equal(installmentActionError(confirmedRow(), 'unconfirm', FN_USER, { reason: OK_REASON }), null);
  assert.match(installmentActionError(confirmedRow(), 'unconfirm', AE_USER, { reason: OK_REASON }), /เฉพาะฝ่ายบัญชี/);
  assert.match(installmentActionError(confirmedRow(), 'unconfirm', SUP_USER, { reason: OK_REASON }), /เฉพาะฝ่ายบัญชี/);
});

/* ⚠️ กลับคำเรื่องเงินที่เคยรับรองแล้ว และปลดล็อกใบให้ย้อนการอนุมัติ/ออก Rev. ได้ด้วย
   ⇒ ต้องมีร่องรอยว่าทำไม ไม่ใช่กดแล้วหายไปเฉย ๆ */
test('ถอนคำรับรองต้องมีเหตุผลเท่ากับตอนตีกลับ', () => {
  assert.match(installmentActionError(confirmedRow(), 'unconfirm', FN_USER, {}), /อย่างน้อย 10 ตัวอักษร/);
  assert.match(installmentActionError(confirmedRow(), 'unconfirm', FN_USER, { reason: 'สั้นไป' }), /อย่างน้อย 10 ตัวอักษร/);
});

test('ถอนได้เฉพาะงวดที่คอนเฟิร์มไปแล้ว', () => {
  for (const status of ['pending', 'reported', 'rejected']) {
    assert.match(
      installmentActionError(confirmedRow({ status }), 'unconfirm', FN_USER, { reason: OK_REASON }),
      /เฉพาะงวดที่บัญชีคอนเฟิร์มไปแล้ว/, status,
    );
  }
});

/* 🔴 หัวใจของคำสั่งนี้: ถอนแล้วกลับไป **`reported`** ไม่ใช่ `pending` — คำแจ้งของ
   ฝ่ายขายและหลักฐานยังอยู่ครบ สิ่งที่ถูกถอนคือคำรับรองของบัญชีเท่านั้น
   ถอยไป pending เมื่อไรเท่ากับลบงานของฝ่ายขายทิ้ง แล้วเขาต้องแนบหลักฐานใหม่
   ทั้งที่ไม่ได้ทำอะไรผิด */
test('ถอนแล้วงวดกลับเข้าคิวตรวจของบัญชีเอง และใบปลดล็อก', () => {
  // ก่อนถอน: ใบถูกล็อกเพราะมีงวดที่คอนเฟิร์มแล้ว
  assert.match(paymentLockReason([confirmedRow()]), /คอนเฟิร์มแล้ว 1 งวด/);
  // หลังถอน (สถานะที่ route เขียน): กลับเป็น reported ⇒ ไม่ล็อกแล้ว
  const afterUnconfirm = confirmedRow({ status: 'reported', confirmedById: null, confirmedAt: null });
  assert.equal(paymentLockReason([afterUnconfirm]), null);
  // และงวดกลับมาให้บัญชีคอนเฟิร์มใหม่ได้
  assert.equal(installmentActionError(afterUnconfirm, 'confirm', FN_USER), null);
  // ยอด "เก็บแล้ว" ต้องลดลงตาม — ไม่ค้างนับงวดที่ถอนไปแล้ว
  assert.equal(paymentRollup([afterUnconfirm]).confirmedCount, 0);
});

// ── มติผู้ใช้ 2026-08-18: บัญชีแจ้งเอง · งวดไล่ลำดับ · ยอด 0 ไม่ต้องยืนยัน ────
const salesUser = { id: 'u-ae', role: 'ae' };
const financeUser = { id: 'u-fn', role: 'finance' };
const seqRow = (over = {}) => ({ seq: 1, status: 'pending', frozenAt: '2026-08-18T00:00:00Z', ...over });

test('บัญชีแจ้งชำระเองได้ และจบในก้าวเดียว (ทางเลือก ก.)', () => {
  assert.equal(installmentActionError(seqRow(), 'report', financeUser, { paidOn: '2026-08-18' }), null);
  assert.equal(installmentReportOutcome(financeUser), 'confirmed');
  // ฝ่ายขายแจ้ง → เข้าคิวบัญชี ⇒ คิว reported เหลือเฉพาะของฝ่ายขาย
  assert.equal(installmentReportOutcome(salesUser), 'reported');
});

test('งวดต้องไล่ลำดับ — ข้ามงวดที่ยังไม่แจ้งไม่ได้', () => {
  const rows = [seqRow({ seq: 1 }), seqRow({ seq: 2 })];
  const err = installmentActionError(rows[1], 'report', salesUser, { paidOn: '2026-08-18', rows });
  assert.match(err, /งวดที่ 1/);
});

// แบบ "หลวม" — งวดก่อนหน้าแค่ **แจ้งแล้ว** ก็พอ ไม่ต้องรอบัญชีคอนเฟิร์ม
// (เข้มกว่านี้จะเอางานฝ่ายขายไปผูกกับคิวบัญชี ดูเหตุผลเต็มที่ installmentSequenceError)
test('งวดก่อนหน้าแค่ reported ก็แจ้งงวดถัดไปได้', () => {
  const rows = [seqRow({ seq: 1, status: 'reported' }), seqRow({ seq: 2 })];
  assert.equal(installmentActionError(rows[1], 'report', salesUser, { paidOn: '2026-08-18', rows }), null);
});

test('งวดก่อนหน้าถูกตีกลับ = ยังไม่จบ ข้ามไม่ได้', () => {
  const rows = [seqRow({ seq: 1, status: 'rejected' }), seqRow({ seq: 2 })];
  assert.match(installmentActionError(rows[1], 'report', salesUser, { paidOn: '2026-08-18', rows }), /งวดที่ 1/);
});

test('ใบยอด 0 ไม่มีงวดเลย — จบที่อนุมัติใบ', () => {
  assert.equal(paymentNotRequired(0), true);
  assert.equal(paymentNotRequired(1), false);
  assert.deepEqual(buildInstallmentsForOrder({ type: 'full' }, 0), []);
  assert.deepEqual(previewInstallments({ type: 'full' }, 0), []);
  assert.equal(paymentState(paymentRollup([]), { notRequired: true }).state, 'not_required');
});

// งวดยอด 0 ใน **ใบที่มียอดจริง** (ของแถม) ยังต้องเดินตามปกติ
test('งวดยอด 0 ในใบที่มียอด ยังสร้างตามแผนเดิม', () => {
  const rows = buildInstallmentsForOrder({ type: 'installment', installments: [{ percent: 100 }, { percent: 0 }] }, 1000);
  assert.equal(rows.length, 2);
});

/* ── ช่วงบริการที่งวดครอบ (mig 0320 · มติ 2026-08-30 "จ่ายก่อนบริการเสมอ") ────
   ⭐ ต่างจาก `schedule` ตรงที่ **แก้ได้แม้บัญชีคอนเฟิร์มแล้ว** — ใบเก่าทุกใบในระบบ
   มีงวด confirmed ที่ยังไม่มีช่วงครอบ (คอลัมน์เพิ่งเกิด) ถ้าปิดตรงนี้ รอบเปลี่ยนผ่าน
   ที่ต้องไล่กรอกให้ใบที่วิ่งอยู่จะทำไม่ได้ แล้วด่านเข้าไซต์จะบล็อกงานจริงทั้งกอง */
test('⭐ งวดที่บัญชีรับรองแล้ว — ช่วงครอบเป็นของบัญชี ฝ่ายขายแตะไม่ได้', () => {
  const done = { status: 'confirmed' };
  const range = { coversFrom: '2026-09-01', coversTo: '2026-11-30' };
  // ฝ่ายขายเลื่อน coversTo เอง = ปลดด่านเงินของตัวเอง ⇒ ต้องปิด
  assert.match(installmentActionError(done, 'coverage', SA, range), /เฉพาะฝ่ายบัญชี/);
  // แต่ยัง **แก้ได้** โดยบัญชี — ต่างจาก schedule ที่ล็อกตาย (ของเก่าต้องกรอกย้อนหลังได้)
  assert.equal(installmentActionError(done, 'coverage', FN_ROLE, range), null);
  assert.match(installmentActionError(done, 'schedule', SA), /คอนเฟิร์มแล้ว/);
});

test('งวดที่ยังไม่รับรอง — ทั้งฝ่ายขายและบัญชีกรอกช่วงครอบได้', () => {
  const range = { coversFrom: '2026-09-01', coversTo: '2026-11-30' };
  assert.equal(installmentActionError({ status: 'pending' }, 'coverage', SA, range), null);
  assert.equal(installmentActionError({ status: 'reported' }, 'coverage', FN_ROLE, range), null);
});

test('คนที่ไม่มีสิทธิ์ทั้งสองฝั่ง แก้ช่วงครอบไม่ได้', () => {
  const outsider = { id: 'u-x', role: 'viewer' };
  assert.match(installmentActionError({ status: 'pending' }, 'coverage', outsider, {}), /ไม่มีสิทธิ์/);
});

test('ช่วงครอบกลับหัวต้องตกที่ด่าน ไม่ใช่ปล่อยไปตาย CHECK ของฐาน', () => {
  assert.match(installmentActionError({ status: 'pending' }, 'coverage', SA, {
    coversFrom: '2026-12-31', coversTo: '2026-09-01',
  }), /ต้องไม่เกินวันสิ้นสุด/);
});

test('ล้างช่วงครอบ หรือกรอกมาข้างเดียว ยังผ่านด่าน (จอเป็นคนเตือน ไม่ใช่บล็อก)', () => {
  const row = { status: 'pending' };
  assert.equal(installmentActionError(row, 'coverage', SA, {}), null);
  assert.equal(installmentActionError(row, 'coverage', SA, { coversFrom: '2026-09-01' }), null);
  assert.equal(installmentActionError(row, 'coverage', SA, { coversTo: '2026-11-30' }), null);
});

/* ═══════════════════════════════════════════════════════════════════════
   ใบงานบริการ: ไม่มีช่วงครอบ = รับรองไม่ได้ (มติผู้ใช้ 2026-08-31)
   ═══════════════════════════════════════════════════════════════════════ */
// `FN_USER` ประกาศไว้ข้างบนแล้ว — ใช้ตัวเดิม
const svcReported = (extra = {}) => ({ status: 'reported', frozenAt: 'x', amount: 100, ...extra });

/* 🔴 **ปิดกับดัก ไม่ใช่เพิ่มขั้นตอน** — เจ้าของช่องช่วงครอบเปลี่ยนมือเป็นบัญชีทันทีที่
   รับรอง ⇒ ของเดิมรับรองงวดที่ช่วงครอบว่างได้ แล้วฝ่ายขายที่รู้ข้อมูลกรอกไม่ได้อีกเลย
   วัดบนฐานจริง 31/08: SO บริการ 8 ใบตกร่องนี้กันหมด */
test('⭐ ใบงานบริการ: งวดที่ยังไม่มีช่วงครอบ บัญชีรับรองไม่ได้', () => {
  const err = installmentActionError(svcReported(), 'confirm', FN_USER, { serviceRounds: true });
  assert.match(err, /ต้องระบุช่วงครอบบริการของงวดก่อน/);
  // ครบทั้งสองด้านถึงผ่าน
  assert.match(
    installmentActionError(svcReported({ coversFrom: '2026-09-01' }), 'confirm', FN_USER, { serviceRounds: true }),
    /ช่วงครอบ/,
  );
  assert.equal(
    installmentActionError(
      svcReported({ coversFrom: '2026-09-01', coversTo: '2026-09-30' }), 'confirm', FN_USER, { serviceRounds: true },
    ),
    null,
  );
});

/* ⚠️ ค่าที่กำลังกรอกในคำขอเดียวกันต้องนับด้วย — บัญชีกรอกช่วงครอบพร้อมกดรับรองได้ */
test('ส่งช่วงครอบมาในคำขอเดียวกับที่กดรับรอง = ผ่าน', () => {
  assert.equal(
    installmentActionError(svcReported(), 'confirm', FN_USER, {
      serviceRounds: true, coversFrom: '2026-09-01', coversTo: '2026-09-30',
    }),
    null,
  );
});

/* ⚠️ ใบสายสินค้าไม่มีช่วงครอบให้กรอก — ห้ามพลอยโดนบล็อก */
test('ใบที่ไม่ใช่งานบริการ รับรองได้ตามเดิม', () => {
  assert.equal(installmentActionError(svcReported(), 'confirm', FN_USER, { serviceRounds: false }), null);
});

/* 🪤 **ไม่ส่ง `serviceRounds` = ไม่บล็อก** (fail-open โดยตั้งใจ) — ต่างจากด่านอื่นใน
   ระบบที่ fail-closed เพราะบล็อกทุกใบเมื่อผู้เรียกลืมส่ง = หยุดการรับเงินทั้งบริษัท */
test('🪤 ผู้เรียกที่ไม่ส่งบริบทใบ ต้องไม่ทำให้ทั้งระบบรับเงินไม่ได้', () => {
  assert.equal(installmentActionError(svcReported(), 'confirm', FN_USER, {}), null);
});

/* ⚠️ ตีกลับไม่ติดข้อนี้ — งวดที่ข้อมูลไม่ครบยิ่งต้องตีกลับได้ */
test('ตีกลับยังทำได้แม้ยังไม่มีช่วงครอบ', () => {
  assert.equal(
    installmentActionError(svcReported(), 'reject', FN_USER, { serviceRounds: true, reason: 'x'.repeat(12) }),
    null,
  );
});

/* ทางออกของใบที่ตกร่องไปแล้ว — บัญชีถอนคำรับรอง แล้วฝ่ายขายกรอกช่วงครอบได้อีกครั้ง */
test('⭐ ถอนคำรับรองแล้วฝ่ายขายกลับมากรอกช่วงครอบได้', () => {
  const SA = { id: 'U-AC', role: 'ac', department: 'SA' };
  const confirmed = { status: 'confirmed', frozenAt: 'x', amount: 100 };
  // ตอนยังรับรองอยู่ — ฝ่ายขายแตะไม่ได้
  assert.match(installmentActionError(confirmed, 'coverage', SA, {}), /เฉพาะฝ่ายบัญชี/);
  // บัญชีถอนได้ (ต้องมีเหตุผล)
  assert.equal(installmentActionError(confirmed, 'unconfirm', FN_USER, { reason: 'x'.repeat(12) }), null);
  // ถอยเป็น reported แล้วฝ่ายขายกรอกได้
  assert.equal(installmentActionError(svcReported(), 'coverage', SA, { coversFrom: '2026-09-01', coversTo: '2026-09-30' }), null);
});

/* ── 🐞 UAT 2026-09-01: ด่านช่วงครอบเคยข้ามได้ทั้งเส้น ────────────────────────
   เดิมด่านเช็กเฉพาะ `action === 'confirm'` แต่ `report` ของคนที่รับรองได้
   (บัญชี/แอดมิน) ลง `confirmed` ตั้งแต่ก้าวแรก ⇒ ผู้ใช้ที่กรอกเงินบ่อยที่สุด
   ข้ามด่านได้ทุกครั้ง และ "จ่ายถึง" ยังว่าง = กับดักเดิมที่ mig 0325 เพิ่งตามเก็บ กลับมาทันที
   เจอตอน UAT เส้นเต็ม: SO-26090001-0 งวดเดียวกลายเป็น confirmed โดย coversFrom/To เป็น null */
test('ใบงานบริการ: บัญชีแจ้งชำระเอง (ลง confirmed ตั้งแต่ก้าวแรก) ก็ต้องติดด่านช่วงครอบ', () => {
  const frozenPending = { id: 'i-1', seq: 1, status: 'pending', amount: 1000, frozenAt: '2026-09-01T00:00:00Z' };
  const opts = { paidOn: '2026-09-01', evidence: [{}], serviceRounds: true };
  // บัญชี = ปลายทาง confirmed ⇒ ต้องติด
  assert.match(
    installmentActionError(frozenPending, 'report', FN_USER, opts) || '',
    /ช่วงครอบบริการ/,
  );
  // ส่งช่วงครอบมาด้วย = ผ่าน
  assert.equal(
    installmentActionError(frozenPending, 'report', FN_USER, {
      ...opts, coversFrom: '2026-09-01', coversTo: '2026-09-30',
    }),
    null,
  );
});

test('ฝ่ายขายแจ้งชำระ (ปลายทาง reported) ไม่ติดด่านช่วงครอบ — ยังไม่ใช่จังหวะที่เงินนับ', () => {
  /* ⚠️ ด่านอยู่ที่ "เงินถูกนับเมื่อไร" ไม่ใช่ "ใครกด" — ของที่ยังรอบัญชีตรวจ
     ฝ่ายขายกรอกช่วงครอบทีหลังได้ และบัญชีจะติดด่านเองตอนกดรับรอง */
  const sales = { id: 'u-ae', role: 'ae', department: 'SALES' };
  const frozenPending = { id: 'i-1', seq: 1, status: 'pending', amount: 1000, frozenAt: '2026-09-01T00:00:00Z' };
  assert.equal(
    installmentActionError(frozenPending, 'report', sales, { paidOn: '2026-09-01', evidence: [{}], serviceRounds: true }),
    null,
  );
});
