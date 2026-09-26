import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTALLMENT_DISPLAY_STATUSES,
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_TONES,
  INSTALLMENT_STATUSES,
  buildInstallmentsForOrder,
  installmentActionError,
  installmentConfirmOutlook,
  installmentDisplayStatus,
  installmentPlanDrift,
  installmentPrepaid,
  installmentReportDoneMessage,
  installmentReportOutcome,
  installmentStale,
  installmentStartBlock,
  installmentUnconfirmOutcome,
  installmentsFromPaymentPlan,
  installmentsTotalMismatch,
  REVISION_MOVE_SCHEMA_MISSING,
  revisedInstallmentsNote,
  revisionAuditSummary,
  salesOrderMoneyOutcome,
  INSTALLMENT_STALE_MESSAGE,
  isInstallmentFrozen,
  openingCoverageEnd,
  paymentNotRequired,
  pipelineInstallmentLock,
  paymentRollup,
  salesOrderPaymentCell,
  salesOrderPaymentNote,
  salesOrderTaxInvoiceNote,
  paymentState,
  previewInstallments,
  withLiveAmounts,
  installmentRefunded,
  strandedInstallment,
  cancelledMoneyRestoreBlock,
  movedOutDeleteBlock,
  installmentVoid,
  installmentVoidNote,
  MAX_REFUND_CREDIT_NOTE_NO,
  MIN_REJECT_REASON,
} from './salesOrderPayments.js';
import * as payments from './salesOrderPayments.js';
import { HISTORICAL_CORRECTION_PATH } from './historicalOrders.js';

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
  /* กำหนดวางบิล · มติเจ้าของ 26/09 ข้อ 4 "แก้ได้" — ฝ่ายบัญชีแก้วันงวดได้แล้ว (เดิมบรรทัดนี้ยืนยันว่า FN แก้ไม่ได้)
     ⇒ ทดสอบเต็มชุดอยู่ที่ installmentBillingSchedule.test.mjs */
  assert.equal(installmentActionError({ status: 'pending' }, 'schedule', FN_ROLE), null);
  assert.match(installmentActionError({ status: 'pending' }, 'schedule', PC_STAFF), /ไม่มีสิทธิ์/);
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

// ── ล็อกใบเมื่อบัญชีรับรองเงินแล้ว — ถอดแล้ว (มติ 24/09 · mig 0387) ─────────────────────────────
/* 🚫 `paymentLockReason` ถูกถอด: ผู้เรียกคนสุดท้ายคือการยกเลิกใบย้อนหลัง ซึ่งตอนนี้ถาม `historicalCancelBlock` ตัวเดียว
   (งวดยกมาเป็นโมฆะตามใบ · งวดปกติที่มีเงินยังบล็อก) · ย้อนการอนุมัติ/ออก Rev. ไม่ถามตั้งแต่ PR1 · ใบ pipeline ตั้งแต่ PR3
   ⇒ ถ้าชื่อนี้กลับมา แปลว่ามีด่าน "งวดรับรองแล้วห้ามยกเลิก" ชุดที่สองโผล่ขึ้น (สองชุดเพี้ยนหากันแน่นอน) */
test('ไม่มี paymentLockReason แล้ว — ด่านยกเลิกของใบย้อนหลังอยู่ที่ historicalCancelBlock ตัวเดียว', () => {
  assert.equal(payments.paymentLockReason, undefined);
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

/* ⚠️ กลับคำเรื่องเงินที่เคยรับรองแล้ว และปลดล็อกการยกเลิกใบด้วย (ย้อนการอนุมัติ/ออก Rev. ไม่ล็อกด้วยงวดตั้งแต่ PR1)
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
test('ถอนแล้วงวดกลับเข้าคิวตรวจของบัญชีเอง', () => {
  // หลังถอน (สถานะที่ route เขียน): กลับเป็น reported
  const afterUnconfirm = confirmedRow({ status: 'reported', confirmedById: null, confirmedAt: null });
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

/* ── ใบกำกับภาษีในตารางรายการ SO (mig 0348 · มติผู้ใช้ 2026-09-07) ────────
   > *"ฝั่ง SA จะดูจากระบบบริหารงานขาย รู้ได้ไงว่างวดไหนมีใบกำกับแล้ว"* */

const inst = (over = {}) => ({ status: 'confirmed', dueDate: '2026-08-01', ...over });

test('ตัวนับใบกำกับคิดจากงวดที่ "ต้องมีใบ" ไม่ใช่งวดทั้งใบ', () => {
  const cell = salesOrderPaymentCell([
    inst({ taxInvoiceNo: 'IV-1' }),
    inst({ status: 'reported' }),
    inst({ status: 'pending' }),   // ยังไม่จ่าย = ยังไม่มีเงินให้ออกใบ ⇒ ไม่นับ
  ], null, '2026-09-07', 100000);
  assert.equal(cell.invoiceNeeded, 2);
  assert.equal(cell.invoiced, 1);
});

test('🔴 ช่องว่างล้วนไม่นับว่ามีใบ (btrim เหมือน CHECK ของ 0348)', () => {
  const cell = salesOrderPaymentCell([inst({ taxInvoiceNo: '   ' })], null, '2026-09-07', 100000);
  assert.equal(cell.invoiced, 0);
  assert.equal(cell.invoiceNeeded, 1);
});

test('บรรทัดใบกำกับ: ครบ / ค้าง / เงียบ', () => {
  assert.deepEqual(
    salesOrderTaxInvoiceNote({ tracked: true, invoiceNeeded: 2, invoiced: 2 }),
    { label: 'ใบกำกับครบ', tone: 'success' },
  );
  assert.deepEqual(
    salesOrderTaxInvoiceNote({ tracked: true, invoiceNeeded: 2, invoiced: 1 }),
    { label: 'ใบกำกับ 1/2', tone: 'warning' },
  );
  /* ⚠️ ยังไม่มีงวดที่ลูกค้าจ่าย = ไม่ใช่ของค้างเอกสาร ⇒ ต้องเงียบ
     ไม่งั้นคอลัมน์นี้มีสามบรรทัดทุกแถวทั้งหน้า */
  assert.equal(salesOrderTaxInvoiceNote({ tracked: true, invoiceNeeded: 0, invoiced: 0 }), null);
  // ใบที่ยังไม่เริ่มติดตาม ตัวเลขมาจากแผนใน QT ไม่ใช่ของจริง ⇒ พูดเรื่องเอกสารไม่ได้
  assert.equal(salesOrderTaxInvoiceNote({ tracked: false, invoiceNeeded: 0, invoiced: 0 }), null);
  assert.equal(salesOrderTaxInvoiceNote(null), null);
});

/* ── ใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) — ล็อกทั้งใบ + งวดยกมา + ช่วงครอบที่รับรองเป็นชุด ────────
   ⭐ ปุ่มบนแผงงวดกับ route PATCH ถามตัวเดียวกันนี้ ⇒ ที่นี่คือด่านจริงของทั้งสองทาง
   🐞 ถ้าไม่กั้นที่นี่: ตั้งวันครบกำหนดของงวดยกมา / ล้างช่วงครอบ = ชน CHECK opening_shape เป็น 500 ดิบ
     · ถอนงวดยกมา = งวดเปล่าที่ไม่มีใครแจ้งซ้ำได้ · ฝ่ายขายขยับช่วงครอบ = ปลดด่านเงินตัวเอง */
const OPENING = frozen({
  id: 'SOI-OPEN', seq: 1, kind: 'opening', status: 'reported', amount: 196452,
  dueDate: null, coversFrom: '2026-01-01', coversTo: '2026-09-30', paidOn: '2026-09-15',
  evidence: [{ storagePath: 'sales-orders/SOR-H1/payments/a.pdf' }], reportedById: SA.id,
});
const REGULAR = frozen({
  id: 'SOI-2', seq: 2, kind: 'regular', status: 'pending', amount: 65484,
  dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31',
});
const HIST = { historical: true, serviceRounds: true, orderTotal: 261936 };
const LOCK = 'งวดของใบย้อนหลังขยับได้หลัง AE Sup อนุมัติ';

test('🔴 ล็อกทั้งใบ (orderLock) ชนะทุกคำสั่ง — ก่อนดูอะไรในแถว แม้แถวจะไม่มี', () => {
  const actions = ['report', 'confirm', 'reject', 'withdraw', 'unconfirm', 'schedule', 'coverage', 'link', 'unlink',
    'tax-invoice', 'tax-invoice-clear', 'ไม่รู้จัก'];
  for (const action of actions) {
    for (const user of [SA, FN_STAFF, ADMIN]) {
      assert.equal(installmentActionError(REGULAR, action, user, { ...HIST, orderLock: LOCK }), LOCK, `${action}/${user.role}`);
    }
  }
  assert.equal(installmentActionError(null, 'report', SA, { orderLock: LOCK }), LOCK);
  // ไม่มีล็อก = ด่านเดิม
  assert.equal(installmentActionError(null, 'report', SA, {}), 'ไม่พบงวดที่ระบุ');
  assert.equal(installmentActionError(REGULAR, 'schedule', SA, { orderLock: null }), null);
});

test('งวดยกมา: ไม่มีกำหนดชำระ · ถอนไม่ได้ทั้งฝ่ายขายและบัญชี (ชี้ทางแก้ของใบย้อนหลัง)', () => {
  for (const user of [SA, FN_STAFF, ADMIN]) {
    assert.match(installmentActionError(OPENING, 'schedule', user, HIST), /งวดยกมาไม่มีกำหนดชำระ/);
    const withdraw = installmentActionError(OPENING, 'withdraw', user, HIST);
    assert.match(withdraw, /งวดยกมาถอนไม่ได้/);
    // มติ 24/09: ไม่ต้องให้บัญชีตีกลับก่อนแล้ว — ชี้ทางแก้ประโยคเดียวของทั้งระบบ
    assert.equal(withdraw, `งวดยกมาถอนไม่ได้ — ${HISTORICAL_CORRECTION_PATH}`);
  }
});

test('งวดยกมา: ช่วงครอบแก้ได้เฉพาะบัญชี · วันเริ่มล็อกที่วันเริ่มสัญญา · ล้างวันสิ้นสุดไม่ได้', () => {
  const keep = { coversFrom: '2026-01-01', coversTo: '2026-08-31' };
  assert.match(installmentActionError(OPENING, 'coverage', SA, { ...HIST, ...keep }), /แก้ได้เฉพาะฝ่ายบัญชี/);
  assert.match(installmentActionError(OPENING, 'coverage', AE_SUP, { ...HIST, ...keep }), /แก้ได้เฉพาะฝ่ายบัญชี/);
  assert.equal(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, ...keep }), null, 'บัญชีเลื่อนปลายช่วงได้');
  assert.equal(installmentActionError(OPENING, 'coverage', ADMIN, { ...HIST, ...keep }), null);
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, coversFrom: '2026-02-01', coversTo: '2026-09-30' }),
    /ช่วงเริ่มของงวดยกมาล็อกที่วันเริ่มสัญญา/);
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, coversFrom: null, coversTo: '2026-09-30' }),
    /ล็อกที่วันเริ่มสัญญา/);
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, coversFrom: '2026-01-01', coversTo: null }),
    /ล้างช่องไม่ได้/);
  // ด่านเดิมของช่วงครอบยังทำงานต่อหลังกิ่งนี้ (ช่วงกลับหัว)
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, coversFrom: '2026-01-01', coversTo: '2025-12-31' }),
    /ไม่เกินวันสิ้นสุด/);
});

/* 🐞 **UAT/review 23/09: ช่องครอบบริการของงวดยกมาล็อกทุกคน รวมฝ่ายบัญชี** — แผงงวดถามด่านว่า
   "เซลล์นี้ใครแก้ได้" แบบ **ไม่ส่งค่า** (SalesOrderPaymentPanel.js) แต่กิ่งนี้ตรวจค่าทันที
   ⇒ ค่าที่ไม่ได้ส่ง (`''`) ไม่เท่าวันเริ่มสัญญาเสมอ = ตอบ "ล็อกที่วันเริ่มสัญญา" ให้ทุกคน
   ⇒ เซลล์วาดเป็นข้อความ ไม่มี DateInput ⇒ บัญชีซึ่งเป็นฝ่ายเดียวที่แก้ได้ตามกติกา แก้ไม่ได้เลย
   และไม่มีจออื่นในระบบแก้ `coversTo` ของงวดยกมาได้ (ทะเบียนการชำระมีแค่รับรอง/ตีกลับ/ใบกำกับ)
   ⇒ ทางออกเดียวคือ HISTORICAL_CORRECTION_PATH ทั้งที่เป็นแค่การเลื่อนวันหนึ่งช่อง */
test('🔴 ถามด่านแบบไม่ส่งค่า = ถามว่า "ใครแก้ได้" ไม่ใช่ "ค่านี้ผ่านไหม" — งวดยกมาต้องไม่ล็อกบัญชี', () => {
  // ไม่ส่ง coversFrom/coversTo เลย (เซลล์บนจอถามแบบนี้) ⇒ ตอบเรื่องสิทธิ์อย่างเดียว
  assert.equal(installmentActionError(OPENING, 'coverage', FN_STAFF, HIST), null, 'บัญชีต้องได้ช่องกรอก');
  assert.equal(installmentActionError(OPENING, 'coverage', ADMIN, HIST), null);
  assert.match(installmentActionError(OPENING, 'coverage', SA, HIST), /แก้ได้เฉพาะฝ่ายบัญชี/,
    'ฝ่ายขายยังล็อกเหมือนเดิม — ถามไม่ส่งค่าไม่ได้แปลว่าปล่อยผ่าน');
  assert.equal(installmentActionError(REGULAR, 'coverage', FN_STAFF, HIST), null);
  /* !! ส่งค่ามาจริง = ตรวจค่าตามเดิมทุกข้อ — `null` คือ "ล้างช่อง" ไม่ใช่ "ไม่ได้ส่ง"
     (route ส่ง `body.coversFrom || null` เสมอ ⇒ คำขอจริงไม่มีทางเลี่ยงด่านด้วยการไม่ส่งคีย์) */
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, coversFrom: null, coversTo: '2026-09-30' }),
    /ล็อกที่วันเริ่มสัญญา/);
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, coversFrom: '2026-01-01', coversTo: null }),
    /ล้างช่องไม่ได้/);
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, coversFrom: '2026-02-01', coversTo: '2026-09-30' }),
    /ล็อกที่วันเริ่มสัญญา/);
});

/* ⭐ ปลดล็อกแล้วต้องไม่เปิดกว้างกว่าตอนคีย์ใบ — RPC ของ 0374 บังคับ `coversTo` ของงวดยกมาอยู่ในสัญญา
   ⇒ ถ้าเลื่อนเลยวันสิ้นสุดสัญญาได้ทีหลัง "จ่ายถึง" จะเปิดด่านเข้าไซต์ให้รอบที่ไม่มีใครจ่าย */
test('งวดยกมา: ปลายช่วงต้องไม่เลยอายุสัญญา — วันที่กั้นมาจาก openingCoverageEnd เท่านั้น', () => {
  const keep = { coversFrom: '2026-01-01' };
  const END = '2026-12-31';
  assert.equal(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, ...keep, coversTo: END, contractEnd: END }), null,
    'ถึงวันสุดท้ายของสัญญาพอดี = ได้');
  assert.match(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, ...keep, coversTo: '2027-01-01', contractEnd: END }),
    /ครอบได้ถึง 31\/12\/2026/);
  /* 🔴 **ด่านไม่มีสูตรของตัวเอง** — เดิมถอยไปอ่าน `rows` เองเมื่อไม่ได้ส่ง `contractEnd` มา ซึ่งทำให้
     ฝั่งที่ส่ง (แผงงวด) กับฝั่งที่ไม่ส่ง (route) กั้นคนละวัน · ทางถอยอยู่ที่ `openingCoverageEnd` แล้ว */
  assert.equal(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, ...keep, coversTo: '2027-06-30', rows: [OPENING, REGULAR] }), null,
    'ส่ง rows มาเฉย ๆ ต้องไม่ทำให้ด่านคิดวันเอง');
  // ไม่มีวันให้กั้น = ไม่ตัดสินข้อนี้ (ใบที่ไม่มีสัญญาและมีแต่งวดยกมางวดเดียว) — ล็อกเซลล์ทิ้งไว้คือทางตัน
  assert.equal(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, ...keep, coversTo: '2027-06-30', contractEnd: null }), null);
  // ถามเฉย ๆ ว่าใครแก้ได้ ยังต้องไม่ถูกข้อนี้ล็อก แม้ค่าที่เก็บไว้จะเลยสัญญาไปแล้ว
  assert.equal(installmentActionError(OPENING, 'coverage', FN_STAFF, { ...HIST, contractEnd: '2026-06-30' }), null);
});

/* ── 🔴 ปุ่มบนแผงงวดกับ API ต้องกั้นด้วย **วันเดียวกัน** (review-fix 23/09) ──────────────────────
   🐞 อาการที่ปิดอยู่: แผงงวดอ่านวันจาก `order.serviceContract.expiryDate` ส่วน route ของงวดไม่เคย
     โหลดสัญญา ⇒ ด่านถอยไปอ่านจากงวดอื่นของใบ · สองทางนี้ไม่เท่ากันทันทีที่บัญชีหดช่วงของงวดปกติ
     งวดสุดท้ายลงมา (งวดปกติของใบย้อนหลังไม่มีกฎช่วง) ⇒ แถบบันทึกเงียบ ปุ่มเปิด แล้ว API ตีกลับ
     ด้วยวันคนละวัน = คลาสเดียวกับที่รอบนี้ตั้งใจล้าง
   ⇒ ทั้งสองฝั่งคิดวันด้วย `openingCoverageEnd(order, rows)` ตัวเดียว · ที่นี่จำลองสองฝั่งด้วยค่าที่
     แต่ละฝั่งมีจริง (จอ = งวดที่โหลดมากับใบ · API = งวดที่อ่านสดจากฐาน) แล้วเทียบคำตอบ */
const HIST_ORDER = (expiryDate) => ({
  origin: 'historical', serviceContract: expiryDate ? { id: 'CT-1', expiryDate } : null,
});
const askPanel = (order, rows, options) => installmentActionError(OPENING, 'coverage', FN_STAFF, {
  ...HIST, ...options, rows, contractEnd: openingCoverageEnd(order, rows),
});
const askApi = (order, siblings, options) => installmentActionError(OPENING, 'coverage', FN_STAFF, {
  ...HIST, ...options, rows: siblings, contractEnd: openingCoverageEnd(order, siblings),
});

test('🔴 openingCoverageEnd = สูตรเดียวของ "ครอบได้ถึงวันไหน" — สัญญามาก่อน แล้วค่อยถอยไปงวดอื่นของใบ', () => {
  /* ของจริงจากรีวิว: สัญญาถึง 31/12 แต่บัญชีเคยหดงวดปกติงวดสุดท้ายลงมาจบ 30/11 */
  const SHORTENED = frozen({ ...REGULAR, coversTo: '2026-11-30' });
  const rows = [OPENING, SHORTENED];
  assert.equal(openingCoverageEnd(HIST_ORDER('2026-12-31'), rows), '2026-12-31', 'สัญญาชนะงวดอื่นเสมอ');
  assert.equal(openingCoverageEnd(HIST_ORDER(null), rows), '2026-11-30', 'ไม่มีสัญญา = ถอยไปอ่านจากงวดอื่น');
  assert.equal(openingCoverageEnd(HIST_ORDER(null), [OPENING]), null, 'ไม่มีทั้งสองทาง = ไม่มีวันให้กั้น');
  assert.equal(openingCoverageEnd(HIST_ORDER(null), null), null);
  // งวดยกมาต้องไม่นับตัวเองเข้าเป็นขอบ (ไม่งั้นค่าที่เพิ่งเลยสัญญาไปจะกลายเป็นขอบของตัวมันเอง)
  assert.equal(openingCoverageEnd(HIST_ORDER(null), [{ ...OPENING, coversTo: '2099-12-31' }, SHORTENED]), '2026-11-30');
  // ใบ pipeline ไม่มีกฎนี้ — ต้องไม่ไปกั้นช่วงครอบของใบปกติด้วยงวดของมันเอง
  assert.equal(openingCoverageEnd({ origin: 'pipeline' }, rows), null);
  assert.equal(openingCoverageEnd(null, rows), null);
});

test('🔴 ปุ่มกับ API ตอบเหมือนกันทั้งสี่เคส — ในสัญญา · ตรงวันสุดท้าย · เลยสัญญา · ไม่มีสัญญาผูก', () => {
  const keep = { coversFrom: '2026-01-01' };
  /* ฝั่งจอเห็นงวดที่โหลดมากับใบ ฝั่ง API อ่านงวดสดจากฐาน — ที่นี่ให้เป็นชุดเดียวกันโดยตั้งใจ
     เพราะสิ่งที่ทดสอบคือ **กติกา** ไม่ใช่ความสดของข้อมูล · ตัวแปรเดียวที่ต่างกันคือสัญญา */
  const SHORTENED = frozen({ ...REGULAR, coversTo: '2026-11-30' });
  const rows = [OPENING, SHORTENED];

  // 1. ในช่วงสัญญา (และเลยงวดปกติงวดสุดท้ายที่บัญชีหดลงมา — เคสที่เคยแตกเป็นสองคำตอบ)
  const withContract = HIST_ORDER('2026-12-31');
  const inside = { ...keep, coversTo: '2026-12-15' };
  assert.equal(askPanel(withContract, rows, inside), null);
  assert.equal(askApi(withContract, rows, inside), null, 'API ต้องไม่ตีกลับสิ่งที่ปุ่มเปิดให้กด');

  // 2. ตรงวันสุดท้ายของสัญญาพอดี
  const onEnd = { ...keep, coversTo: '2026-12-31' };
  assert.equal(askPanel(withContract, rows, onEnd), null);
  assert.equal(askApi(withContract, rows, onEnd), null);

  // 3. เลยวันสิ้นสุดสัญญา — ทั้งสองฝั่งต้องตีกลับด้วย **ประโยคและวันเดียวกัน**
  const past = { ...keep, coversTo: '2027-01-01' };
  const panelPast = askPanel(withContract, rows, past);
  const apiPast = askApi(withContract, rows, past);
  assert.match(panelPast, /ครอบได้ถึง 31\/12\/2026/);
  assert.equal(apiPast, panelPast, 'ข้อความ + วันที่กั้นต้องเป็นประโยคเดียวกัน');

  // 4. ไม่มีสัญญาผูก — ทั้งสองฝั่งถอยไปอ่านจากงวดอื่นของใบเหมือนกัน (30/11 ไม่ใช่ 31/12)
  const noContract = HIST_ORDER(null);
  assert.equal(askPanel(noContract, rows, inside), askApi(noContract, rows, inside));
  assert.match(askApi(noContract, rows, inside), /ครอบได้ถึง 30\/11\/2026/);
  assert.equal(askPanel(noContract, rows, { ...keep, coversTo: '2026-11-30' }), null);
  assert.equal(askApi(noContract, rows, { ...keep, coversTo: '2026-11-30' }), null);
});

/* ── ใบ pipeline: เซลล์ "ครอบบริการ" หลังรอบ 23/09 ────────────────────────────────────────────
   รอบนั้นเปลี่ยนสองอย่างให้ **ทุกใบ ไม่ใช่เฉพาะใบย้อนหลัง**: เซลล์ที่ล็อกกลายเป็นปุ่มที่บอกเหตุตอนกด
   และแถบบันทึกถามด่านเต็มแทนเงื่อนไข "ช่วงกลับหัว" ที่จอเขียนเอง
   ⇒ ต้องพิสูจน์สองข้อสำหรับใบ pipeline: (ก) ด่านมี "เหตุ" ให้ปุ่มพูดเสมอเมื่อเซลล์ล็อก —
     ไม่มีสถานะไหนที่เซลล์ล็อกแล้วปุ่มไม่มีอะไรจะพูด · (ข) ด่านไม่กั้นแคบไปกว่า API
     (เป็นฟังก์ชันตัวเดียวกัน) และไม่กว้างกว่า CHECK ของฐาน */
test('ใบ pipeline: เซลล์ช่วงครอบ — ถามไม่ส่งค่าได้ช่องกรอก · ล็อกมีเหตุให้พูดเสมอ · ร่างที่ผิดได้เหตุจากด่าน', () => {
  const PIPE = { historical: false, orderLock: null, contractEnd: null, serviceRounds: true, orderTotal: 261936 };
  const PENDING = frozen({ id: 'SOI-P1', seq: 1, status: 'pending', amount: 1000, coversFrom: '2026-01-01', coversTo: '2026-03-31' });
  const CONFIRMED = frozen({ ...PENDING, id: 'SOI-P2', status: 'confirmed' });

  // (ก) ถามแบบไม่ส่งค่า = "ใครแก้เซลล์นี้ได้" — ฝ่ายขายได้ช่องกรอก
  assert.equal(installmentActionError(PENDING, 'coverage', SA, PIPE), null, 'ฝ่ายขายกรอกช่วงของงวดที่ยังไม่รับรองได้');
  assert.equal(installmentActionError(PENDING, 'coverage', FN_STAFF, PIPE), null);
  // เซลล์ล็อกเมื่อไร ต้องมีประโยคให้ปุ่มพูด — ห้ามเป็น true/ว่าง (ปุ่มที่กดแล้วเงียบ = อ่านเหมือนระบบพัง)
  for (const [row, user, re] of [
    [CONFIRMED, SA, /บัญชีรับรองแล้ว/],          // ฝ่ายขายเลื่อน "จ่ายถึง" ของงวดที่รับรองแล้วเองไม่ได้
    [PENDING, PC_STAFF, /ไม่มีสิทธิ์แก้ช่วงครอบบริการ/], // คนนอกสายขาย/บัญชีเห็นใบได้ แต่แก้ไม่ได้
  ]) {
    const lock = installmentActionError(row, 'coverage', user, PIPE);
    assert.equal(typeof lock, 'string');
    assert.ok(lock.trim().length > 10, `เหตุผลของล็อกต้องเป็นประโยคไทยที่อ่านรู้เรื่อง: ${lock}`);
    assert.match(lock, re);
  }
  assert.equal(installmentActionError(CONFIRMED, 'coverage', FN_STAFF, PIPE), null, 'บัญชียังแก้งวดที่รับรองแล้วได้');

  /* (ข) แถบบันทึกถามด่านเต็มด้วยค่าที่จะยิงจริง — กว้างกว่าเงื่อนไข "ช่วงกลับหัว" เดิมสองข้อ
     และสองข้อนั้นคือสิ่งที่ API/ฐานตีกลับอยู่แล้ว ⇒ ปุ่มไม่ได้เปิดให้กดสิ่งที่จะเด้ง */
  assert.match(installmentActionError(PENDING, 'coverage', SA, { ...PIPE, coversFrom: '2026-04-01', coversTo: '2026-03-31' }),
    /ไม่เกินวันสิ้นสุด/, 'ช่วงกลับหัว = เงื่อนไขเดิมที่จอเคยเขียนเอง');
  assert.match(installmentActionError(PENDING, 'coverage', SA, { ...PIPE, coversFrom: '2026-01-01', coversTo: '2202-08-06' }),
    /ปีของช่วงครอบบริการไม่ถูกต้อง/, 'ปีเกิน = CHECK ของฐาน ซึ่งเงื่อนไขเดิมปล่อยผ่านแล้วไปเด้งเป็น 500');
  // ล้างช่องทั้งคู่ได้ตามเดิม (ใบที่ไม่ใช่สายบริการไม่ควรถูกบังคับให้มีค่าค้าง)
  assert.equal(installmentActionError(PENDING, 'coverage', SA, { ...PIPE, coversFrom: null, coversTo: null }), null);
  // กฎของงวดยกมาต้องไม่รั่วมาใบ pipeline แม้แถวจะมี kind มาด้วย
  const OPENING_SHAPED = frozen({ ...OPENING, status: 'pending' });
  assert.equal(installmentActionError(OPENING_SHAPED, 'coverage', SA, { ...PIPE, coversFrom: '2026-02-01', coversTo: '2099-12-31' }), null);
});

test('งวดปกติของใบย้อนหลัง: ช่วงครอบตรึงตอนอนุมัติ — แก้ได้เฉพาะบัญชี · กำหนดชำระฝ่ายขายยังเลื่อนได้', () => {
  const range = { coversFrom: '2026-10-01', coversTo: '2026-11-30' };
  assert.match(installmentActionError(REGULAR, 'coverage', SA, { ...HIST, ...range }), /ตรึงตอนผู้จัดการฝ่ายขายอนุมัติ/);
  assert.equal(installmentActionError(REGULAR, 'coverage', FN_STAFF, { ...HIST, ...range }), null);
  assert.equal(installmentActionError(REGULAR, 'schedule', SA, HIST), null, 'ลูกค้าเลื่อนจ่ายเป็นเรื่องปกติ');
  // แจ้งชำระที่พกช่วงครอบมาด้วย = แก้ช่วงทางอ้อม ⇒ ด่านเดียวกัน · ไม่พกมา = แจ้งได้ตามปกติ
  assert.match(installmentActionError(REGULAR, 'report', SA, { ...HIST, paidOn: '2026-10-01', ...range }), /ตรึงตอนผู้จัดการฝ่ายขายอนุมัติ/);
  assert.equal(installmentActionError(REGULAR, 'report', SA, { ...HIST, paidOn: '2026-10-01', coversFrom: null, coversTo: null }), null);
  assert.equal(installmentActionError(REGULAR, 'withdraw', SA, HIST), 'ดึงกลับได้เฉพาะงวดที่แจ้งแล้วและบัญชียังไม่ตรวจ',
    'งวดปกติถอนตามกติกาเดิม (ยังไม่แจ้ง = ถอนไม่ได้ ด้วยเหตุผลเดิม)');
});

test('บัญชีรับรอง/ตีกลับงวดยกมาได้ตามทางเดิม — ช่วงครอบมีครบตั้งแต่คีย์', () => {
  assert.equal(installmentActionError(OPENING, 'confirm', FN_STAFF, HIST), null);
  assert.equal(installmentActionError(OPENING, 'reject', FN_STAFF, { ...HIST, reason: 'ยอดไม่ตรงกับใบกำกับ Express' }), null);
  assert.match(installmentActionError(OPENING, 'confirm', SA, HIST), /เฉพาะฝ่ายบัญชี/);
});

test('ใบ pipeline (historical ไม่ส่ง/เป็นเท็จ) ได้ด่านเดิมทุกข้อ — แม้แถวจะมี kind', () => {
  const plainOpeningShape = { ...OPENING, status: 'pending' };
  assert.equal(installmentActionError(plainOpeningShape, 'schedule', SA, {}), null);
  assert.equal(installmentActionError({ status: 'reported', reportedById: SA.id }, 'withdraw', SA, { historical: false }), null);
  assert.equal(installmentActionError({ status: 'pending' }, 'coverage', SA, { coversFrom: '2026-09-01', coversTo: '2026-09-30' }), null);
  assert.equal(installmentActionError({ status: 'pending' }, 'coverage', SA, { historical: false, coversFrom: '2026-09-02' }), null);
});

test('คอลัมน์ "ใบกำกับ x/y": งวดยกมาไม่นับเป็นงวดที่ต้องมีใบ (ออกในระบบเดิมแล้ว)', () => {
  const cell = salesOrderPaymentCell([
    { ...OPENING, status: 'confirmed' },
    { ...REGULAR, status: 'confirmed', taxInvoiceNo: 'IV-6810001' },
  ], null, '2026-10-05', 261936);
  assert.equal(cell.invoiceNeeded, 1);
  assert.equal(cell.invoiced, 1);
  assert.deepEqual(salesOrderTaxInvoiceNote(cell), { label: 'ใบกำกับครบ', tone: 'success' });
});

/* ── ภาพหลังบัญชีรับรองงวด (โมดัลรับรองของใบย้อนหลัง · mock FnConfirm) ─────────────────────────
   ⭐ ตัวเลขของ mock: ยกมา 196,452 ครอบถึง 30 ก.ย. · งวดถัดไป 65,484 ครบกำหนด 1 ต.ค. */
test('ภาพหลังรับรองงวดยกมา: จ่ายถึงปลายช่วงยกมา · เก็บแล้ว = ยอดยกมา · งวดถัดไป = งวดปกติแรก', () => {
  const outlook = installmentConfirmOutlook(OPENING, [OPENING, REGULAR]);
  assert.equal(outlook.paidThrough, '2026-09-30');
  assert.equal(outlook.collected, 196452);
  assert.deepEqual(outlook.next, { label: '', amount: 65484, dueDate: '2026-10-01' });
});

test('ภาพหลังรับรองงวดปกติ: เก็บแล้วรวมงวดที่รับรองไปแล้ว · จ่ายถึงขยับไปปลายช่วงงวดนี้ · ไม่มีงวดถัดไป', () => {
  const rows = [{ ...OPENING, status: 'confirmed' }, { ...REGULAR, status: 'reported', label: 'งวด ต.ค.–ธ.ค.' }];
  const outlook = installmentConfirmOutlook(rows[1], rows);
  assert.equal(outlook.paidThrough, '2026-12-31');
  assert.equal(outlook.collected, 261936);
  assert.equal(outlook.next, null);
});

test('ภาพหลังรับรอง: งวดที่รับรองแล้วครอบไกลกว่าไม่ถอยหลัง · งวดก่อนหน้าที่ยังค้างไม่ใช่ "งวดถัดไป"', () => {
  const rows = [
    { id: 'a', seq: 1, status: 'pending', amount: 100, coversFrom: '2026-01-01', coversTo: '2026-03-31' },
    { id: 'b', seq: 2, status: 'reported', amount: 100, coversFrom: '2026-04-01', coversTo: '2026-06-30' },
    { id: 'c', seq: 3, status: 'confirmed', amount: 100, coversFrom: '2026-07-01', coversTo: '2026-09-30' },
    { id: 'd', seq: 4, status: 'confirmed', amount: 100, coversFrom: '2026-10-01', coversTo: '2026-12-31' },
  ];
  const outlook = installmentConfirmOutlook(rows[1], rows);
  assert.equal(outlook.paidThrough, '2026-12-31', 'ค่าเดียวกับ paidThrough ของทั้งใบ');
  assert.equal(outlook.collected, 300);
  assert.equal(outlook.next, null, 'งวด 1 ที่ยังไม่จ่ายอยู่ก่อนงวดนี้ — ไม่ใช่งวดถัดไป');
  // ไม่มีช่วงครอบเลย = จ่ายถึงยังว่าง (ไม่ใช่เดาเอง) · ไม่มีแถว = ค่าว่างที่ปลอดภัย
  assert.equal(installmentConfirmOutlook({ id: 'x', seq: 1, amount: 50 }, []).paidThrough, null);
  assert.deepEqual(installmentConfirmOutlook(null, rows), { paidThrough: null, collected: 0, next: null });
});

/* ══ PR0 · วางพื้นกันพัง (แผน so-payment-unlock-replan · มติเจ้าของ 23/09) ══════════════════════
   หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว" — ก่อนปลดล็อกย้อน/Rev./ยกเลิก (PR1–PR3) ต้องมีพื้นสี่ข้อนี้:
   ตัวทับยอดตามแผนไม่แตะชุดที่ตรึงแล้ว · ใบยกเลิก/ถูกออก Rev. ขยับงวดไม่ได้ (ยกเว้นทางของบัญชี) ·
   POST ไม่สร้างงวดให้ใบที่ถูกแทนแล้ว · PATCH ไม่เขียนทับแถวที่เพิ่งถูกแก้จากอีกหน้าต่าง */

// ── withLiveAmounts: ชุดที่มีแถวตรึงแล้วคือแผนจริง ไม่ใช่ร่าง ─────────────────────────────────
test('withLiveAmounts: มีแถวตรึงยอดแล้วอย่างน้อยหนึ่งแถว = คืนรายการเดิมทั้งชุด (แถวร่างไม่ถูกทับยอดตาม QT)', () => {
  const stored = [
    frozen({ id: 'a', seq: 1, label: 'มัดจำ (ยกมา)', percent: 25, amount: 5000 }),
    { id: 'b', seq: 2, label: 'งวดกลาง', percent: 75, amount: 15000 },
  ];
  const live = withLiveAmounts(stored, DRAFT_PLAN, 20000);
  assert.equal(live, stored, 'คืนรายการเดิม ไม่ใช่สำเนาที่ถูกทับ');
  assert.deepEqual(live.map((r) => r.amount), [5000, 15000], 'แผน QT 30/70 ต้องไม่ทับแถวร่างของชุดที่ตรึงแล้ว');
  assert.equal(live[1].label, 'งวดกลาง');
  // ไม่มีแถวตรึงเลย = งวดร่างเดินตามแผนของ QT เหมือนเดิม
  const drafts = [{ id: 'a', seq: 1, amount: 1 }, { id: 'b', seq: 2, amount: 1 }];
  assert.deepEqual(withLiveAmounts(drafts, DRAFT_PLAN, 20000).map((r) => r.amount), [6000, 14000]);
});

// ── pipelineInstallmentLock: ล็อกทั้งใบของใบ pipeline ────────────────────────────────────────
const ALL_ACTIONS = ['report', 'confirm', 'reject', 'withdraw', 'unconfirm', 'schedule', 'coverage', 'link', 'unlink',
  'tax-invoice', 'tax-invoice-clear'];
const PIPE = (status, extra = {}) => ({ id: 'SOR-P', origin: 'pipeline', status, orderNumber: 'SO-26090001-0', ...extra });

test('ใบ pipeline ยกเลิกแล้ว: บล็อกแจ้ง/ตั้งวัน/ช่วงครอบ/ผูกคำร้อง · ปล่อยทางของบัญชีและการดึงกลับของผู้แจ้ง', () => {
  const order = PIPE('cancelled');
  for (const action of ['report', 'schedule', 'coverage', 'link', 'unlink']) {
    assert.match(pipelineInstallmentLock(order, action) || '', /^ใบยกเลิกแล้ว — งวดของใบนี้เหลือให้/, action);
  }
  /* PR3 (mig 0378 · มติ D4): เงินค้างของใบยกเลิกมีทางออกสองทาง — บัญชีบันทึกคืนเงิน/ถอนการบันทึก · ยกเข้าใบใหม่ของดีลเดียวกัน */
  for (const action of ['confirm', 'reject', 'unconfirm', 'withdraw', 'tax-invoice', 'tax-invoice-clear',
    'refund', 'refund-clear', 'carry']) {
    assert.equal(pipelineInstallmentLock(order, action), null, action);
  }
  assert.equal(pipelineInstallmentLock(order, 'report'),
    'ใบยกเลิกแล้ว — งวดของใบนี้เหลือให้บัญชีรับรอง/ตีกลับ/ถอนคำรับรอง/บันทึกคืนเงิน ยกเงินไปใบใหม่ของดีลเดียวกัน'
      + ' และผู้แจ้งดึงกลับการแจ้งเท่านั้น');
  // คำสั่งที่ไม่รู้จักไม่ถูกปล่อยผ่านด่านใบ (allowlist ไม่ใช่ blocklist)
  assert.ok(pipelineInstallmentLock(order, 'ไม่รู้จัก'));
  // ไม่ส่ง action = ถามระดับใบ (ข้อความบนแผงงวด) ⇒ ได้ข้อความล็อก
  assert.match(pipelineInstallmentLock(order) || '', /ใบยกเลิกแล้ว/);
});

test('ใบ pipeline ถูกออก Rev. ทับแล้ว: บล็อกทุกคำสั่ง · บอกเลข Rev. ที่งวดย้ายไป (ปุ่มกับ API ได้ประโยคเดียวกัน)', () => {
  // route ของหน้าใบและ route ของงวดโหลด revisionHistory รูปเดียวกัน (สายโซ่ของเลขฐาน) ⇒ เลขเดียวกันทั้งสองฝั่ง
  const order = PIPE('revised', {
    supersededById: 'SOR-R1',
    revisionHistory: [{ id: 'SOR-R1', orderNumber: 'SO-26090001-1' }, { id: 'SOR-P', orderNumber: 'SO-26090001-0' }],
  });
  for (const action of [...ALL_ACTIONS, undefined]) {
    assert.equal(pipelineInstallmentLock(order, action), 'งวดของใบนี้ย้ายไป SO-26090001-1 แล้ว', String(action));
  }
  // หาเลขไม่เจอ = ยังล็อก พร้อมคำกลาง ไม่ใช่ "undefined"
  assert.equal(pipelineInstallmentLock(PIPE('revised'), 'confirm'), 'งวดของใบนี้ย้ายไปใบ Rev. แล้ว');
  assert.equal(pipelineInstallmentLock(PIPE('revised', { supersededById: 'SOR-X', revisionHistory: [] }), 'report'),
    'งวดของใบนี้ย้ายไปใบ Rev. แล้ว');
});

test('ใบ pipeline สถานะอื่น (รวม approval_revoked ระหว่างรอ Rev. — มติ D3) ไม่ล็อกที่ระดับใบ', () => {
  for (const status of ['draft', 'pending_approval', 'approved', 'approval_revoked', 'rejected']) {
    for (const action of [...ALL_ACTIONS, undefined]) {
      assert.equal(pipelineInstallmentLock(PIPE(status), action), null, `${status}/${action}`);
    }
  }
  assert.equal(pipelineInstallmentLock(null, 'report'), null);
});

test('ใบย้อนหลังไม่ผ่านตัวนี้ — historicalInstallmentLock เป็นเจ้าของ (กติกาเดิมทุกข้อ)', () => {
  for (const status of ['cancelled', 'approved', 'draft']) {
    for (const action of [...ALL_ACTIONS, undefined]) {
      assert.equal(pipelineInstallmentLock({ origin: 'historical', status }, action), null, `${status}/${action}`);
    }
  }
});

test('ล็อกของใบยกเลิกผ่านด่านเดียวกับปุ่ม: บัญชีรับรองงวดที่แจ้งไว้ได้ · ฝ่ายขายแจ้งงวดใหม่ไม่ได้', () => {
  const order = PIPE('cancelled');
  const reported = frozen({ id: 'r', seq: 1, status: 'reported', amount: 100 });
  const pending = frozen({ id: 'p', seq: 2, status: 'pending', amount: 100 });
  const rows = [reported, pending];
  const opts = (action) => ({ rows, orderTotal: 200, orderLock: pipelineInstallmentLock(order, action) });
  assert.equal(installmentActionError(reported, 'confirm', FN_STAFF, opts('confirm')), null);
  assert.equal(installmentActionError(reported, 'reject', FN_STAFF, { ...opts('reject'), reason: 'สลิปไม่ตรงยอดของงวด' }), null);
  assert.match(installmentActionError(pending, 'report', SA, { ...opts('report'), paidOn: '2026-09-23' }), /ใบยกเลิกแล้ว/);
  assert.match(installmentActionError(pending, 'report', FN_STAFF, { ...opts('report'), paidOn: '2026-09-23' }), /ใบยกเลิกแล้ว/);
});

// ── ร่างที่ QT ถูกถอด Won แล้ว (ร่างที่ถูกกู้คืนจากการยกเลิก) ─────────────────────────────────
/* 🐞 SO-26080039-0 (18/08): ยกเลิก → ถอด Won ของ QT-26080037-4 → ออก QT-5 → admin กู้คืนใบเดิมเป็นร่าง → ออก SO-26080043-0
   จาก QT-5 · งวดของร่างที่กู้คืนตรึงยอดมาตั้งแต่ตอนเคยอนุมัติ ⇒ บัญชีรับรองสลิปเดียวกันได้บนสองใบ
   ⭐ ร่างแบบนี้ยื่นอนุมัติไม่ได้อยู่แล้ว (ด่านยื่นบังคับ QT = accepted) ⇒ งวดของมันเหลือแค่ทางเก็บกวาดของบัญชี */
const DEAD_QT = (status, extra = {}) => PIPE(status, { quotation: { quoteNumber: 'QT-26080037-4', status: 'revised' }, ...extra });

test('ร่าง/รออนุมัติ/ตีกลับ ที่ QT ไม่ใช่ Won แล้ว: เหลือถอนคำรับรอง/ตีกลับ/ดึงกลับ/ล้างใบกำกับ · ที่เหลือบล็อกพร้อมบอกเลข QT', () => {
  for (const status of ['draft', 'pending_approval', 'rejected']) {
    for (const action of ['reject', 'unconfirm', 'withdraw', 'tax-invoice-clear']) {
      assert.equal(pipelineInstallmentLock(DEAD_QT(status), action), null, `${status}/${action}`);
    }
    for (const action of ['report', 'confirm', 'schedule', 'coverage', 'link', 'unlink', 'tax-invoice', 'refund', 'carry', 'ไม่รู้จัก', undefined]) {
      assert.equal(pipelineInstallmentLock(DEAD_QT(status), action),
        'QT-26080037-4 ไม่ได้เป็น Won แล้ว — ใบนี้เป็นร่างที่ใช้ต่อไม่ได้ งวดเหลือให้บัญชีถอนคำรับรอง/ตีกลับ และผู้แจ้งดึงกลับการแจ้งเท่านั้น',
        `${status}/${action}`);
    }
  }
  // QT ยัง Won (ร่างปกติ · ร่าง Rev. ตามมติ D3) = ไม่ล็อก
  for (const status of ['draft', 'pending_approval', 'rejected']) {
    assert.equal(pipelineInstallmentLock(PIPE(status, { quotation: { quoteNumber: 'QT-1', status: 'accepted' } }), 'report'), null, status);
  }
  // ใบที่อนุมัติแล้ว/ย้อนการอนุมัติ ไม่ถูกตัดสินด้วย QT (QT ของใบที่ยังมีชีวิตถอด Won ไม่ได้อยู่แล้ว)
  for (const status of ['approved', 'approval_revoked']) {
    assert.equal(pipelineInstallmentLock(DEAD_QT(status), 'report'), null, status);
  }
  // ใบยกเลิกยังใช้กติกาของใบยกเลิก (ไม่ถูกคำนี้ทับ)
  assert.match(pipelineInstallmentLock(DEAD_QT('cancelled'), 'report') || '', /^ใบยกเลิกแล้ว/);
  assert.equal(pipelineInstallmentLock(DEAD_QT('cancelled'), 'confirm'), null);
  // ใบย้อนหลังไม่ผ่านตัวนี้
  assert.equal(pipelineInstallmentLock({ origin: 'historical', status: 'draft', quotation: { status: 'revised' } }, 'report'), null);
});

test('ร่างที่ QT ไม่ใช่ Won: บัญชีรับรองเงินบนร่างนี้ไม่ได้ แต่ถอนคำรับรองที่รับรองไปแล้วได้ (ทางเก็บกวาด SO-26080039-0)', () => {
  const order = DEAD_QT('draft');
  const reported = frozen({ id: 'r', seq: 1, status: 'reported', amount: 100 });
  const confirmed = frozen({ id: 'c', seq: 2, status: 'confirmed', amount: 100, confirmedAt: '2026-08-18T06:53:36Z' });
  const rows = [reported, confirmed];
  const opts = (action) => ({ rows, orderTotal: 200, orderLock: pipelineInstallmentLock(order, action) });
  assert.match(installmentActionError(reported, 'confirm', FN_STAFF, opts('confirm')), /ไม่ได้เป็น Won แล้ว/);
  assert.equal(installmentActionError(reported, 'reject', FN_STAFF, { ...opts('reject'), reason: 'ซ้ำกับ SO-26080043-0 งวด 1' }), null);
  assert.equal(installmentActionError(confirmed, 'unconfirm', FN_STAFF, { ...opts('unconfirm'), reason: 'ซ้ำกับ SO-26080043-0 งวด 1' }), null);
});

// ── POST เริ่มติดตาม: ใบที่ถูกแทน/ยกเลิก/ตีกลับไม่มีอะไรให้ติดตาม ─────────────────────────────────
test('installmentStartBlock: ใบ revised ถูกปฏิเสธด้วยคำของตัวเอง · ยกเลิก/ตีกลับคงคำเดิม · ใบที่ยังเดินได้ผ่าน', () => {
  assert.equal(installmentStartBlock({ status: 'revised' }), 'งวดของใบนี้ย้ายไปใบ Rev. แล้ว');
  for (const status of ['cancelled', 'rejected']) {
    assert.equal(installmentStartBlock({ status }), 'ใบสั่งขายนี้ถูกยกเลิก/ตีกลับแล้ว — ไม่มีอะไรให้ติดตาม');
  }
  for (const status of ['draft', 'pending_approval', 'approved', 'approval_revoked']) {
    assert.equal(installmentStartBlock({ status }), null, status);
  }
  // ร่างที่ QT ถูกถอด Won แล้ว — สร้างงวดชุดใหม่ให้ใบที่ใช้ต่อไม่ได้ = ของผี
  assert.equal(installmentStartBlock(DEAD_QT('draft')), 'QT-26080037-4 ไม่ได้เป็น Won แล้ว — ใบนี้เป็นร่างที่ใช้ต่อไม่ได้');
  assert.equal(installmentStartBlock(PIPE('draft', { quotation: { status: 'accepted' } })), null);
});

// ── optimistic lock ของ PATCH งวด ────────────────────────────────────────────────────────
test('installmentStale: ไม่ส่งค่ามา = ไม่ตัดสิน · ตรงกัน = สด · ต่างกัน = เก่า (409)', () => {
  const row = { id: 'i', updatedAt: '2026-09-23T03:12:45.123456+00:00' };
  assert.equal(installmentStale(row, undefined), false);
  assert.equal(installmentStale(row, ''), false);
  assert.equal(installmentStale(row, '2026-09-23T03:12:45.123456+00:00'), false);
  assert.equal(installmentStale(row, '2026-09-23T03:12:44.000000+00:00'), true);
  assert.equal(installmentStale(row, 'ไม่ใช่วันที่'), true);
  // รูปแบบต่างกันแต่เป็นเวลาเดียวกัน (ms) ไม่นับว่าเก่า — ตัวกันจริงคือเงื่อนไข updatedAt ตอนเขียน
  assert.equal(installmentStale({ updatedAt: '2026-09-23T03:12:45.123+00:00' }, '2026-09-23T03:12:45.123Z'), false);
  assert.equal(INSTALLMENT_STALE_MESSAGE, 'งวดนี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่');
});

// ── คำบน toast หลังแจ้ง/บันทึกการชำระต้องตรงปลายทางจริง ────────────────────────────────────────
test('installmentReportDoneMessage: บัญชีบันทึกเอง = ชำระแล้วทันที · งวดร่าง = เก็บไว้ · ฝ่ายขาย = ส่งให้บัญชีตรวจ', () => {
  assert.match(installmentReportDoneMessage('confirmed'), /ชำระแล้ว/);
  assert.doesNotMatch(installmentReportDoneMessage('confirmed'), /ส่งให้บัญชีตรวจ/);
  assert.match(installmentReportDoneMessage('pending'), /เมื่อใบสั่งขายอนุมัติ/);
  assert.equal(installmentReportDoneMessage('reported'), 'ส่งให้บัญชีตรวจแล้ว');
  assert.equal(installmentReportDoneMessage(undefined), 'ส่งให้บัญชีตรวจแล้ว');
});

// ══ PR1 · ย้อนการอนุมัติ + ออก Rev. ย้ายงวดทั้งแถว (mig 0376 · แผน so-payment-unlock-replan) ══════════════
/* ชุดงวดตัวอย่างของใบ 107,000: รับแล้ว (มีใบกำกับ+คำร้อง+ช่วงครอบ) · รอบัญชีตรวจ · รอชำระ */
const MONEY_ROWS = [
  frozen({ id: 'SOI-1', seq: 1, status: 'confirmed', amount: 53500, taxInvoiceNo: 'IV-1', billingRequestId: 'RQ-1',
    coversFrom: '2026-01-01', coversTo: '2026-06-30' }),
  frozen({ id: 'SOI-2', seq: 2, status: 'reported', amount: 32100, coversFrom: '2026-07-01', coversTo: '2026-10-31' }),
  frozen({ id: 'SOI-3', seq: 3, status: 'pending', amount: 21400 }),
];
const APPROVED_SO = { id: 'SOR-P', origin: 'pipeline', status: 'approved', orderNumber: 'SO-26090001-0', totalAmount: 107000 };

test('ตารางรายการ SO: ใบ revised ไม่มีคอลัมน์งวด (เงินอยู่กับใบ Rev.) — ไม่ใช่ "ยังไม่เริ่มติดตาม" จากแผน QT', () => {
  const plan = { type: 'installment', installments: [{ label: 'ก', percent: 50 }, { label: 'ข', percent: 50 }] };
  assert.equal(salesOrderPaymentCell([], plan, '2026-09-23', 107000, 'revised'), null,
    'ใบ revised เหลือ 0 แถวหลัง 0376 ⇒ ถอยไปอ่านแผน QT = บรรทัด "ยังไม่เริ่มติดตาม" ปลอม');
  assert.equal(salesOrderPaymentCell(MONEY_ROWS, plan, '2026-09-23', 107000, 'revised'), null);
  // สถานะอื่นเหมือนเดิม
  assert.equal(salesOrderPaymentCell([], plan, '2026-09-23', 107000, 'approved').tracked, false);
  assert.equal(salesOrderPaymentCell(MONEY_ROWS, plan, '2026-09-23', 107000, 'approval_revoked').paid, 1);
  assert.equal(salesOrderPaymentCell(MONEY_ROWS, plan, '2026-09-23', 107000).paid, 1, 'ไม่ส่งสถานะ = พฤติกรรมเดิม');
});

test('revisedInstallmentsNote: ใบ revised บอกเลขใบ Rev. ที่งวดย้ายไป · สถานะอื่น/ใบย้อนหลังไม่พูด', () => {
  const revised = {
    ...APPROVED_SO, status: 'revised', supersededById: 'SOR-R1',
    revisionHistory: [{ id: 'SOR-R1', orderNumber: 'SO-26090001-1' }, { id: 'SOR-P', orderNumber: 'SO-26090001-0' }],
  };
  assert.equal(revisedInstallmentsNote(revised), 'งวดชำระทั้งหมดย้ายไป SO-26090001-1 แล้ว');
  assert.equal(revisedInstallmentsNote({ ...revised, revisionHistory: [] }), 'งวดชำระทั้งหมดย้ายไปใบ Rev. แล้ว');
  for (const status of ['approved', 'approval_revoked', 'draft', 'cancelled']) {
    assert.equal(revisedInstallmentsNote({ ...APPROVED_SO, status }), null, status);
  }
  assert.equal(revisedInstallmentsNote({ origin: 'historical', status: 'revised' }), null);
  assert.equal(revisedInstallmentsNote(null), null);
});

/* Σ งวด ≠ ยอดใบ = RPC 0376 ออก Rev. ไม่ได้ ⇒ ต้องบอกตั้งแต่ขั้นย้อนการอนุมัติ ไม่งั้นใบค้างที่ approval_revoked (ทางตัน) */
test('installmentsTotalMismatch: ตรงถึงสตางค์ (±0.005) = ผ่าน · ต่าง ≥ 0.005 = บอกยอดทั้งสองฝั่ง · ไม่มีงวด = ไม่ตัดสิน', () => {
  assert.equal(installmentsTotalMismatch(MONEY_ROWS, 107000), null);
  assert.equal(installmentsTotalMismatch([{ amount: 33.333 }, { amount: 66.663 }], 100), null, 'ต่าง 0.004 ยังผ่าน (เกณฑ์เดียวกับ SQL)');
  assert.equal(installmentsTotalMismatch([], 107000), null);
  assert.equal(installmentsTotalMismatch(null, 107000), null);
  const why = installmentsTotalMismatch([{ amount: 53500 }, { amount: 53499.99 }], 107000);
  assert.match(why, /^งวดชำระรวม ฿106,999\.99 ไม่เท่ายอดใบ ฿107,000\.00 — /);
  assert.match(why, /ออก Rev\. ไม่ได้/);
  assert.match(why, /แอดมินตรวจงวดก่อน/);
});

test('โมดัลย้อนการอนุมัติ: เงินรับแล้วยังนับว่ารับแล้ว + ย้ายไปใบ Rev. ทั้งชุด · สลิปรอตรวจยังอยู่ในคิว · ไม่มีเงิน = ไม่พูดเรื่องเงิน', () => {
  const lines = salesOrderMoneyOutcome(APPROVED_SO, MONEY_ROWS, 'revoke');
  assert.equal(lines[0], 'เงินที่บัญชีรับรองแล้ว 1 งวด ฿53,500.00 ยังนับว่ารับแล้ว ไม่ต้องถอนคำรับรอง — ตอนออก Rev. งวดทั้ง 3 งวด'
    + ' (สลิป · ใบกำกับภาษี · ช่วงครอบ) ย้ายไปอยู่กับใบ Rev. บัญชีไม่ต้องรับรองซ้ำ');
  assert.ok(lines.includes('สลิปรอบัญชีตรวจ 1 งวดยังอยู่ในคิวบัญชีตามปกติ'));
  /* ⚠️ แก้ยามโดยตั้งใจใน PR3 (mig 0378): บรรทัดชั่วคราว "การยกเลิกเปิดในรอบถัดไป" ถอดออกแล้ว — ยกเลิกใบที่มีเงินรับแล้วได้
     (เงินค้างอยู่กับใบ → ยกเข้าใบใหม่/บันทึกคืนเงิน) ⇒ บรรทัดสุดท้ายคือสลิปรอตรวจ */
  assert.equal(lines[lines.length - 1], 'สลิปรอบัญชีตรวจ 1 งวดยังอยู่ในคิวบัญชีตามปกติ');
  assert.ok(!lines.some((l) => /รอบถัดไป/.test(l)), 'คำชั่วคราวของ PR1 ต้องหายไปแล้ว');
  assert.ok(!lines.some((l) => /บัญชีปิดใบนี้แล้ว|นัดช่าง/.test(l)), 'ไม่ใช่ใบที่บัญชีปิดแล้ว/ใบบริการ');
  // ใช้คำ "ย้อนการอนุมัติ" เท่านั้น
  assert.ok(!lines.some((l) => /ยกเลิกอนุมัติ|ถอดอนุมัติ/.test(l)));

  const pendingOnly = salesOrderMoneyOutcome(APPROVED_SO, [MONEY_ROWS[2]], 'revoke');
  assert.deepEqual(pendingOnly, []);
  assert.deepEqual(salesOrderMoneyOutcome(APPROVED_SO, [], 'revoke'), []);
});

test('โมดัลย้อนการอนุมัติ: ใบที่บัญชีปิดแล้ว (มติ D2) · ใบบริการ (ด่านนัดช่าง + ผูกโซนใหม่)', () => {
  const closed = salesOrderMoneyOutcome({ ...APPROVED_SO, financeStatus: 'approved' },
    MONEY_ROWS.map((r) => ({ ...r, status: 'confirmed' })), 'revoke');
  assert.ok(closed.includes('บัญชีปิดใบนี้แล้ว — ใบ Rev. จะกลับเข้าคิวให้บัญชีปิดใหม่'));
  assert.ok(!closed.some((l) => l.startsWith('สลิปรอบัญชีตรวจ')), 'ไม่มีงวดรอตรวจ = ไม่พูด');
  const service = salesOrderMoneyOutcome(APPROVED_SO, [], 'revoke', { serviceRounds: true });
  assert.deepEqual(service, ['ระหว่างรอ Rev. อนุมัติ ด่านเงินของนัดช่างปิด และต้องผูกโซนกับใบ Rev. ใหม่']);
});

test('โมดัลออก Rev.: บอกว่างวดทั้งชุดย้ายไป (แยกยอดรับแล้ว/รอตรวจ/รอชำระ) · ใบที่ไม่มีงวด = ไม่พูด', () => {
  const revoked = { ...APPROVED_SO, status: 'approval_revoked' };
  assert.deepEqual(salesOrderMoneyOutcome(revoked, MONEY_ROWS, 'revise'), [
    'งวดชำระ 3 งวดย้ายไปใบ Rev. ทั้งชุด (รับแล้ว ฿53,500.00 · รอบัญชีตรวจ ฿32,100.00 · รอชำระ ฿21,400.00)'
      + ' — ยอดต่องวดคงตามที่ใช้อยู่ รวมที่ปรับหลังอนุมัติ ไม่คำนวณใหม่จาก QT · ใบนี้จะไม่เหลืองวด',
  ]);
  // งวดที่บัญชีตีกลับยังไม่มีเงิน ⇒ นับเป็น "รอชำระ"
  const withRejected = [...MONEY_ROWS.slice(0, 2), { ...MONEY_ROWS[2], status: 'rejected' }];
  assert.match(salesOrderMoneyOutcome(revoked, withRejected, 'revise')[0], /รอชำระ ฿21,400\.00/);
  assert.deepEqual(salesOrderMoneyOutcome(revoked, [], 'revise'), []);
});

test('โมดัลอนุมัติ: ใบ Rev. ที่ยกงวดมา = ใช้งวดเดิม ไม่สร้างจาก QT · เก็บครบ = เข้าคิวปิดใบทันที · ใบปกติคงคำเดิม', () => {
  const rev = { ...APPROVED_SO, status: 'pending_approval', orderNumber: 'SO-26090001-1', metadata: { revisedFrom: 'SO-26090001-0' } };
  assert.deepEqual(salesOrderMoneyOutcome(rev, MONEY_ROWS, 'approve'), [
    'ใช้งวดชำระ 3 งวดที่ยกมาจาก SO-26090001-0 (รับแล้ว 1/3) — ไม่สร้างใหม่จาก QT',
    'เปิดขั้นของบัญชีบนใบนี้ — บัญชีปิดใบได้เมื่อเก็บเงินครบทุกงวด',
  ]);
  const paid = MONEY_ROWS.map((r) => ({ ...r, status: 'confirmed' }));
  assert.deepEqual(salesOrderMoneyOutcome(rev, paid, 'approve'), [
    'ใช้งวดชำระ 3 งวดที่ยกมาจาก SO-26090001-0 (รับแล้ว 3/3) — ไม่สร้างใหม่จาก QT',
    'เก็บเงินครบแล้ว — ใบเข้าคิวปิดใบของบัญชีทันที',
  ]);
  // ใบปกติ (งวดร่าง/ไม่มีงวด) = คำเดิมของโมดัล
  const drafts = MONEY_ROWS.map(({ frozenAt, ...r }) => ({ ...r, status: 'pending' }));
  for (const rows of [drafts, []]) {
    assert.deepEqual(salesOrderMoneyOutcome({ ...rev, metadata: {} }, rows, 'approve'), [
      'สร้างงวดชำระตามแผนการชำระที่ระบุไว้ใน QT',
      'เปิดขั้นของบัญชีบนใบนี้ — บัญชีปิดใบได้เมื่อเก็บเงินครบทุกงวด',
    ]);
  }
  // หาเลขใบเดิมไม่เจอ = คำกลาง ไม่ใช่ "undefined"
  assert.match(salesOrderMoneyOutcome({ ...rev, metadata: null }, MONEY_ROWS, 'approve')[0], /ที่ยกมาจากใบเดิม \(/);
  assert.throws(() => salesOrderMoneyOutcome(rev, MONEY_ROWS, 'ไม่รู้จัก'), /action/);
});

test('โมดัลถอนคำรับรอง: บอกยอดเก็บแล้วที่ลดลง · ใบบริการบอก "จ่ายถึง" ที่ถอย · ไม่ถอย = ไม่พูด', () => {
  const [paidRow] = MONEY_ROWS;
  assert.equal(installmentUnconfirmOutcome(paidRow, MONEY_ROWS),
    'งวดนี้จะกลับไปเป็น “รอบัญชีตรวจ” — หลักฐานยังอยู่ครบ · ยอดเก็บแล้วของใบลดลง ฿53,500.00');
  // ใบบริการ: งวดเดียวที่รับรองแล้ว ⇒ "จ่ายถึง" ว่าง
  assert.match(installmentUnconfirmOutcome(paidRow, MONEY_ROWS, { serviceRounds: true }),
    / · “จ่ายถึง” ว่าง — ยังไม่มีงวดที่รับรองแล้วครอบบริการ$/);
  // มีงวดที่รับรองแล้วครอบถึงก่อนหน้า ⇒ ถอยไปวันนั้น
  const twoPaid = [paidRow, { ...MONEY_ROWS[1], status: 'confirmed' }];
  assert.match(installmentUnconfirmOutcome(twoPaid[1], twoPaid, { serviceRounds: true }), / · “จ่ายถึง” ถอยเป็น 30\/06\/2026$/);
  // ถอนงวดที่ไม่ได้เป็นปลายช่วง ⇒ "จ่ายถึง" ไม่ขยับ ⇒ ไม่พูด
  assert.doesNotMatch(installmentUnconfirmOutcome(twoPaid[0], twoPaid, { serviceRounds: true }), /จ่ายถึง/);
  // ไม่มีคำเก่าที่ว่าใบ "ย้อนการอนุมัติ/ออก Rev. ได้อีกครั้ง" (ด่านนั้นถอดแล้ว)
  assert.doesNotMatch(installmentUnconfirmOutcome(paidRow, MONEY_ROWS), /Rev\./);
});

test('สรุป audit ของการออก Rev.: บอกจำนวนงวดที่ย้าย · ไม่มีงวด · ฐานยังไม่ได้รัน 0376 = warning', () => {
  const base = { fromNumber: 'SO-26090001-0', toNumber: 'SO-26090001-1', reason: 'แก้ที่อยู่ส่งของตามลูกค้าแจ้ง' };
  assert.deepEqual(revisionAuditSummary({
    ...base,
    moved: { count: 3, confirmedCount: 1, confirmedAmount: 53500, reportedCount: 1, reportedAmount: 32100, openAmount: 21400 },
  }), {
    summary: 'ออก Rev. SO-26090001-0 → SO-26090001-1: แก้ที่อยู่ส่งของตามลูกค้าแจ้ง · ย้ายงวดชำระ 3 งวด (รับแล้ว 1 งวด ฿53,500.00 · รอบัญชีตรวจ 1 งวด)',
    warning: null,
  });
  assert.deepEqual(revisionAuditSummary({ ...base, moved: { count: 0 } }), {
    summary: 'ออก Rev. SO-26090001-0 → SO-26090001-1: แก้ที่อยู่ส่งของตามลูกค้าแจ้ง · ไม่มีงวดชำระให้ย้าย',
    warning: null,
  });
  const legacy = revisionAuditSummary({ ...base, moved: undefined });
  assert.equal(legacy.warning, REVISION_MOVE_SCHEMA_MISSING);
  assert.equal(REVISION_MOVE_SCHEMA_MISSING, 'ฐานยังไม่ได้รัน 0376 — แจ้งผู้ดูแลระบบ');
  assert.match(legacy.summary, /^ออก Rev\. SO-26090001-0 → SO-26090001-1: แก้ที่อยู่ส่งของตามลูกค้าแจ้ง · ⚠️ ฐานยังไม่ได้รัน 0376/);
});


/* ══ PR3 · ยกเลิกใบที่มีเงินรับแล้ว + เงินค้าง (mig 0378 · มติเจ้าของ 23/09 D4) ═════════════════════════════════ */
const CANCELLED_SO = { ...APPROVED_SO, status: 'cancelled' };
const REFUND_OK = { refundedOn: '2026-09-20', reason: 'ลูกค้ายกเลิกงาน ขอคืนมัดจำทั้งหมด', creditNoteNo: 'CN-0001' };
const refundOpts = (order, extra = {}) => ({
  rows: MONEY_ROWS, orderTotal: 107000,
  orderLock: pipelineInstallmentLock(order, extra.action || 'refund'),
  orderCancelled: order.status === 'cancelled' && order.origin !== 'historical',
  ...REFUND_OK, ...extra,
});
const refundedRow = (over = {}) => ({
  ...MONEY_ROWS[0], refundedAt: '2026-09-21T03:00:00Z', refundedOn: '2026-09-20',
  refundReason: 'ลูกค้ายกเลิกงาน ขอคืนมัดจำทั้งหมด', refundCreditNoteNo: 'CN-0001', ...over,
});

test('เงินค้างจากใบที่ยกเลิก = งวด confirmed/reported ที่ยังไม่คืนเงินของใบที่ยกเลิก (ใบอื่น/งวดไม่มีเงิน/คืนแล้ว ไม่ใช่)', () => {
  assert.equal(strandedInstallment(MONEY_ROWS[0], CANCELLED_SO), true, 'confirmed');
  assert.equal(strandedInstallment(MONEY_ROWS[1], CANCELLED_SO), true, 'reported — รอบัญชีรับรอง/ตีกลับ');
  assert.equal(strandedInstallment(MONEY_ROWS[2], CANCELLED_SO), false, 'pending = โมฆะ ไม่ใช่เงิน');
  assert.equal(strandedInstallment({ ...MONEY_ROWS[2], status: 'rejected' }, CANCELLED_SO), false);
  assert.equal(strandedInstallment(refundedRow(), CANCELLED_SO), false, 'คืนลูกค้าแล้ว = ไม่ค้าง');
  for (const status of ['approved', 'approval_revoked', 'draft', 'revised']) {
    assert.equal(strandedInstallment(MONEY_ROWS[0], { ...APPROVED_SO, status }), false, status);
  }
  assert.equal(strandedInstallment(null, CANCELLED_SO), false);
  assert.equal(strandedInstallment(MONEY_ROWS[0], null), false);
  assert.equal(installmentRefunded(refundedRow()), true);
  assert.equal(installmentRefunded(MONEY_ROWS[0]), false);
  assert.equal(installmentRefunded({ refundedAt: '  ' }), false, 'ช่องว่างล้วนไม่ใช่การคืนเงิน');
});

test('บันทึกคืนเงิน: ฝ่ายบัญชี · งวด confirmed ของใบ pipeline ที่ยกเลิก · เต็มจำนวน — ครบข้อมูลแล้วผ่าน', () => {
  assert.equal(installmentActionError(MONEY_ROWS[0], 'refund', FN_STAFF, refundOpts(CANCELLED_SO)), null);
  assert.equal(installmentActionError(MONEY_ROWS[0], 'refund', { id: 'u-admin', role: 'admin' }, refundOpts(CANCELLED_SO)), null);
  assert.match(installmentActionError(MONEY_ROWS[0], 'refund', AE_SUP, refundOpts(CANCELLED_SO)), /เฉพาะฝ่ายบัญชี/);
  assert.match(installmentActionError(MONEY_ROWS[0], 'refund', SA, refundOpts(CANCELLED_SO)), /เฉพาะฝ่ายบัญชี/);
  // ใบที่ยังเดินอยู่ไม่มีทางคืนเงินรายงวด — ใช้ถอนคำรับรอง
  assert.match(installmentActionError(MONEY_ROWS[0], 'refund', FN_STAFF, refundOpts(APPROVED_SO)),
    /เฉพาะงวดของใบที่ยกเลิกแล้ว/);
  // งวดที่ยังไม่มีเงินรับรอง
  assert.match(installmentActionError(MONEY_ROWS[1], 'refund', FN_STAFF, refundOpts(CANCELLED_SO)),
    /เฉพาะงวดที่บัญชีรับรองแล้ว — งวดที่รอตรวจให้ตีกลับแทน/);
  assert.match(installmentActionError(MONEY_ROWS[2], 'refund', FN_STAFF, refundOpts(CANCELLED_SO)), /เฉพาะงวดที่บัญชีรับรองแล้ว/);
  assert.match(installmentActionError(refundedRow(), 'refund', FN_STAFF, refundOpts(CANCELLED_SO)), /บันทึกคืนเงินไปแล้ว/);
});

test('บันทึกคืนเงิน: วันที่คืนบังคับ · เหตุผล 10–500 · มีใบกำกับภาษีต้องมีเลขใบลดหนี้ (กติกาเดียวกับ CHECK ของ 0378)', () => {
  const at = (extra) => installmentActionError(MONEY_ROWS[0], 'refund', FN_STAFF, refundOpts(CANCELLED_SO, extra));
  assert.match(at({ refundedOn: '' }), /ต้องระบุวันที่คืนเงิน/);
  assert.match(at({ refundedOn: '2026-02-30' }), /วันที่คืนเงินไม่ถูกต้อง/);
  assert.match(at({ refundedOn: '1999-12-31' }), /วันที่คืนเงินไม่ถูกต้อง/);
  assert.match(at({ reason: 'คืนเงิน' }), /เหตุผลที่คืนเงินอย่างน้อย 10 ตัวอักษร/);
  assert.match(at({ reason: 'ก'.repeat(501) }), /ไม่เกิน 500/);
  // MONEY_ROWS[0] มีใบกำกับ IV-1 ⇒ ต้องมีเลขใบลดหนี้
  assert.match(at({ creditNoteNo: '  ' }), /มีใบกำกับภาษี IV-1 — ต้องระบุเลขที่ใบลดหนี้/);
  assert.match(at({ creditNoteNo: 'C'.repeat(MAX_REFUND_CREDIT_NOTE_NO + 1) }), /เลขที่ใบลดหนี้ยาวเกิน/);
  // ไม่มีใบกำกับ = เลขใบลดหนี้ไม่บังคับ
  const noInvoice = { ...MONEY_ROWS[0], taxInvoiceNo: null };
  assert.equal(installmentActionError(noInvoice, 'refund', FN_STAFF, refundOpts(CANCELLED_SO, { creditNoteNo: '' })), null);
});

test('ถอนการบันทึกคืนเงิน: ฝ่ายบัญชี · เฉพาะงวดที่บันทึกคืนไว้ · ใบยกเลิกเท่านั้น', () => {
  const opts = (order) => refundOpts(order, { action: 'refund-clear' });
  assert.equal(installmentActionError(refundedRow(), 'refund-clear', FN_STAFF, opts(CANCELLED_SO)), null);
  assert.match(installmentActionError(MONEY_ROWS[0], 'refund-clear', FN_STAFF, opts(CANCELLED_SO)), /ยังไม่ได้บันทึกคืนเงิน/);
  assert.match(installmentActionError(refundedRow(), 'refund-clear', SA, opts(CANCELLED_SO)), /เฉพาะฝ่ายบัญชี/);
});

test('🔴 งวดที่คืนเงินแล้ว: ถอนคำรับรอง/แก้ใบกำกับไม่ได้ — ถอนการบันทึกคืนเงินก่อน (CHECK ของ 0378 กันซ้ำที่ฐาน)', () => {
  const row = refundedRow();
  const base = { rows: [row], orderTotal: 107000, orderCancelled: true };
  for (const action of ['unconfirm', 'tax-invoice', 'tax-invoice-clear']) {
    const why = installmentActionError(row, action, FN_STAFF, {
      ...base, orderLock: pipelineInstallmentLock(CANCELLED_SO, action),
      reason: 'x'.repeat(MIN_REJECT_REASON), taxInvoiceNo: 'IV-9', taxInvoiceDate: '2026-09-20',
    });
    assert.match(why || '', /งวดนี้บันทึกคืนเงินแล้ว — ถอนการบันทึกคืนเงินก่อน/, action);
  }
  // งวดที่ยังไม่คืน ถอนคำรับรองบนใบยกเลิกได้ตามเดิม (PR0)
  assert.equal(installmentActionError(MONEY_ROWS[0], 'unconfirm', FN_STAFF, {
    rows: MONEY_ROWS, orderTotal: 107000, orderLock: pipelineInstallmentLock(CANCELLED_SO, 'unconfirm'),
    reason: 'x'.repeat(MIN_REJECT_REASON),
  }), null);
});

test('ใบย้อนหลังที่ยกเลิก: คืนเงิน/ยกเงินไม่มี — ล็อกของใบย้อนหลังชนะ (กติกาเดิมทุกข้อ)', () => {
  const historical = { origin: 'historical', status: 'cancelled' };
  assert.equal(pipelineInstallmentLock(historical, 'refund'), null, 'ใบย้อนหลังไม่ผ่านตัวนี้');
  // ผู้เรียกส่ง historicalInstallmentLock(order) || … — ใบย้อนหลังยกเลิกแล้ว = ล็อกทั้งใบ
  assert.match(installmentActionError(MONEY_ROWS[0], 'refund', FN_STAFF, {
    ...refundOpts(historical), orderLock: 'ใบยกเลิกแล้ว — งวดของใบนี้ขยับไม่ได้', orderCancelled: false,
  }), /ขยับไม่ได้/);
});

test('สถานะที่แสดงของงวดที่คืนเงินแล้ว = "คืนเงินแล้ว" (ไม่ใช่ "ชำระแล้ว")', () => {
  assert.equal(installmentDisplayStatus(refundedRow()), 'refunded');
  assert.equal(INSTALLMENT_STATUS_LABELS.refunded, 'คืนเงินแล้ว');
  assert.equal(INSTALLMENT_STATUS_TONES.refunded, 'neutral');
  assert.ok(INSTALLMENT_DISPLAY_STATUSES.includes('refunded'));
  assert.ok(!INSTALLMENT_STATUSES.includes('refunded'), 'ไม่ใช่ค่าใน DB — CHECK ของ 0245 ไม่มีสถานะนี้');
  assert.equal(installmentDisplayStatus(MONEY_ROWS[0]), 'confirmed');
});

test('โมดัลยกเลิก (ใบ pipeline): เงินรับแล้วอยู่กับใบ ไม่หาย · สลิปรอตรวจยังอยู่ในคิว · งวดไม่มีเงินหลุดจากค้างรับ · ใบกำกับต้องลดหนี้ถ้าคืน', () => {
  const lines = salesOrderMoneyOutcome(APPROVED_SO, MONEY_ROWS, 'cancel');
  assert.deepEqual(lines, [
    'ใบนี้มีเงินรับแล้ว ฿53,500.00 (1 งวด) — ยกเลิกแล้วเงินยังบันทึกอยู่กับใบนี้ ไม่หายและไม่ต้องถอนคำรับรอง'
      + ' · บัญชีเห็นในหัวข้อ “เงินค้างจากใบที่ยกเลิก” · ถ้าจะออกใบใหม่ให้ดีลนี้ กด “ยกเงินจากใบที่ยกเลิก” ที่ใบใหม่หลังอนุมัติ'
      + ' · ถ้าคืนเงินลูกค้า บัญชีกด “บันทึกคืนเงิน”',
    'สลิปรอบัญชีตรวจ 1 งวด ฿32,100.00 ยังอยู่ในคิวบัญชี',
    'งวดที่ยังไม่ชำระ 1 งวด ฿21,400.00 หลุดจากยอดค้างรับทันที',
    'มีใบกำกับภาษี IV-1 — ถ้าคืนเงินต้องออกใบลดหนี้',
  ]);
  // ไม่มีเงินเลย = บอกแค่ส่วนที่มี · ไม่มีงวด = ไม่พูดเรื่องเงิน
  assert.deepEqual(salesOrderMoneyOutcome(APPROVED_SO, [MONEY_ROWS[2]], 'cancel'),
    ['งวดที่ยังไม่ชำระ 1 งวด ฿21,400.00 หลุดจากยอดค้างรับทันที']);
  assert.deepEqual(salesOrderMoneyOutcome(APPROVED_SO, [], 'cancel'), []);
  // ใบร่าง: งวดยังไม่ตรึงยอด = ไม่อยู่ในทะเบียนบัญชีอยู่แล้ว (ไม่พูดว่า "หลุดจากค้างรับ") · เงินที่บันทึกไว้ก่อนอนุมัติต้องบอก
  const draft = { ...APPROVED_SO, status: 'draft' };
  const draftRows = [
    { id: 'd1', seq: 1, status: 'pending', amount: 1000, paidOn: '2026-09-01', evidence: [{ fileName: 's.jpg' }] },
    { id: 'd2', seq: 2, status: 'pending', amount: 2000 },
  ];
  assert.deepEqual(salesOrderMoneyOutcome(draft, draftRows, 'cancel'), [
    'บันทึกการจ่ายไว้ 1 งวด ฿1,000.00 (ยังไม่ถึงบัญชี) — ยกเลิกแล้วงวดเป็นโมฆะ ถ้าลูกค้าจ่ายจริงให้แจ้งใหม่ที่ใบใหม่ของดีลนี้',
  ]);
  // ใบย้อนหลังพูดคนละชุด (งวดยกมาเป็นโมฆะตามใบ) — ไม่มีคำว่าเงินค้าง/ยกเงิน/คืนเงินของใบ pipeline (เทสต์ของชุดนั้นอยู่ข้างล่าง)
  const hist = salesOrderMoneyOutcome({ origin: 'historical', status: 'approved' }, MONEY_ROWS, 'cancel');
  assert.doesNotMatch(hist.join('\n'), /เงินค้าง|ยกเงิน|บันทึกคืนเงิน/);
});

/* ══ มติเจ้าของ 24/09 · ยกเลิกใบย้อนหลังที่อนุมัติแล้ว = งวดยกมาเป็นโมฆะตามใบ (mig 0387) ═════════════════════════════
   ⭐ งวดยกมามีบนใบย้อนหลังเท่านั้น (ผู้เขียนมีแค่ RPC ใบย้อนหลังของ 0374/0379 · ใบย้อนหลังออก Rev./รับงวดย้ายเข้าไม่ได้)
     ⇒ ตัดสินจาก `kind` ของแถวล้วน ไม่ต้องส่ง origin ของใบมา — ผู้เรียกที่ส่งแค่ `{ status }` (ตารางรายการ SO · ยอดบนหน้าใบ)
       ถูกไปด้วยทุกตัว
   ⭐ งวดยกมาของใบที่ตายแล้ว = โมฆะทุกสถานะ (รับรองแล้วก็ตาม) — ไม่ใช่เงินค้าง ไม่ต้องยก/คืน · ใบที่คีย์ใหม่รับรองอีกครั้ง */
const HIST_OPENING = frozen({
  id: 'SOI-H1', seq: 1, kind: 'opening', status: 'confirmed', amount: 196452,
  coversFrom: '2026-01-01', coversTo: '2026-09-30', paidOn: '2026-01-05',
  confirmedByName: 'บัญชี ก', confirmedAt: '2026-09-23T03:00:00Z', reportedAt: '2026-09-22T03:00:00Z',
});
const HIST_REGULAR = frozen({
  id: 'SOI-H2', seq: 2, kind: 'regular', status: 'pending', amount: 65484, dueDate: '2026-10-01',
});
const HIST_APPROVED = { id: 'SOR-H1', origin: 'historical', status: 'approved', orderNumber: 'SO-26090010-0', totalAmount: 261936 };

test('🔴 งวดยกมาของใบที่ยกเลิก = โมฆะทุกสถานะ · ไม่ใช่เงินค้าง · ใบที่ยังเดิน/งวดปกติ = กติกาเดิม', () => {
  for (const status of ['confirmed', 'reported', 'rejected', 'pending']) {
    const row = { ...HIST_OPENING, status };
    assert.equal(installmentVoid(row, { status: 'cancelled' }), true, `opening ${status} บนใบยกเลิก`);
    assert.equal(strandedInstallment(row, { status: 'cancelled' }), false, `opening ${status} ไม่ใช่เงินค้าง`);
    assert.equal(installmentVoid(row, { status: 'approved' }), false, `opening ${status} บนใบที่อนุมัติอยู่`);
    // ผู้เรียกที่ส่งทั้งใบ (แผงงวด · ทะเบียนบัญชี) ได้คำตอบเดียวกับผู้เรียกที่ส่งแค่ { status }
    assert.equal(installmentVoid(row, { ...HIST_APPROVED, status: 'cancelled' }), true);
  }
  // งวดปกติของใบย้อนหลังที่ยกเลิก: กติกาเดิม (pending/rejected โมฆะ · มีเงิน = ไม่โมฆะ — แต่ด่านยกเลิกกันไว้ไม่ให้เกิด)
  assert.equal(installmentVoid(HIST_REGULAR, { status: 'cancelled' }), true);
  assert.equal(installmentVoid({ ...HIST_REGULAR, status: 'confirmed' }, { status: 'cancelled' }), false);
  assert.equal(strandedInstallment({ ...HIST_REGULAR, status: 'confirmed' }, { status: 'cancelled' }), true);
});

test('🔴 ตารางรายการ SO + ยอดบนหน้าใบ: ใบย้อนหลังที่ยกเลิกทั้งที่งวดยกมารับรองแล้ว — ไม่นับเก็บแล้ว · ไม่ขึ้นเงินค้าง', () => {
  const rows = [HIST_OPENING, HIST_REGULAR];
  assert.equal(salesOrderPaymentCell(rows, null, '2026-10-05', 261936, 'cancelled'), null,
    'เหลือแต่งวดโมฆะ = ไม่มีคอลัมน์งวด');
  // ใบเดียวกันตอนยังอนุมัติอยู่: งวดยกมายังนับว่าเก็บแล้ว
  const live = salesOrderPaymentCell(rows, null, '2026-10-05', 261936, 'approved');
  assert.equal(live.paid, 1);
  assert.equal(live.count, 2);
  // ยอดบนหน้าใบ (page.js กรองด้วย installmentVoid ก่อน paymentRollup)
  const kept = rows.filter((row) => !installmentVoid(row, { status: 'cancelled' }));
  assert.deepEqual(kept, []);
});

test('ป้ายโมฆะบนแถวงวด: งวดยกมาบอกว่าโมฆะตามใบ (+ วันที่บัญชีรับรองไว้) · งวดอื่นคำเดิม · ไม่โมฆะ = null', () => {
  assert.equal(installmentVoidNote(HIST_OPENING, { status: 'cancelled' }),
    'โมฆะตามใบ — ยกเลิกเพื่อคีย์ใหม่ (บัญชีรับรองไว้ 23/09/2026)');
  assert.equal(installmentVoidNote({ ...HIST_OPENING, status: 'rejected', confirmedAt: null }, { status: 'cancelled' }),
    'โมฆะตามใบ — ยกเลิกเพื่อคีย์ใหม่');
  assert.equal(installmentVoidNote(HIST_REGULAR, { status: 'cancelled' }), 'โมฆะ — ใบนี้ไม่ต้องตามเก็บแล้ว');
  assert.equal(installmentVoidNote(HIST_OPENING, { status: 'approved' }), null);
  assert.equal(installmentVoidNote({ ...HIST_REGULAR, status: 'confirmed' }, { status: 'cancelled' }), null);
});

test('โมดัลยกเลิกใบย้อนหลัง: งวดยกมาที่รับรองแล้ว/รอรับรองเป็นโมฆะตามใบ (บอกผู้รับรอง · ไม่ใช่เงินค้าง) · งวดค้างรับหลุด', () => {
  const approved = HIST_APPROVED;
  assert.deepEqual(salesOrderMoneyOutcome(approved, [HIST_OPENING, HIST_REGULAR], 'cancel'), [
    'งวดยกมา ฿196,452.00 ที่บัญชีรับรองแล้ว (บัญชี ก · 23/09/2026) เป็นโมฆะตามใบ — ไม่ใช่เงินค้าง ไม่ต้องคืน/ยก'
      + ' · ใบที่คีย์ใหม่ต้องให้บัญชีรับรองงวดยกมาอีกครั้ง',
    'งวดที่ยังไม่ชำระ 1 งวด ฿65,484.00 หลุดจากยอดค้างรับ',
  ]);
  const reported = { ...HIST_OPENING, status: 'reported', confirmedByName: null, confirmedAt: null };
  assert.deepEqual(salesOrderMoneyOutcome(approved, [reported], 'cancel'), [
    'งวดยกมา ฿196,452.00 ที่รอบัญชีรับรองออกจากคิวบัญชี (บันทึกว่ายกเลิกตามใบ ไม่ใช่บัญชีตีกลับ)',
  ]);
  // ใบร่าง/รออนุมัติ: งวดยังไม่ตรึงยอด ไม่อยู่ในทะเบียนบัญชี = ไม่มีเรื่องเงินให้บอก
  const draftRows = [{ ...HIST_OPENING, status: 'pending', frozenAt: null }, { ...HIST_REGULAR, frozenAt: null }];
  assert.deepEqual(salesOrderMoneyOutcome({ ...approved, status: 'pending_approval' }, draftRows, 'cancel'), []);
  assert.deepEqual(salesOrderMoneyOutcome(approved, [], 'cancel'), []);
  // ไม่มีคำว่า Actual ในโมดัลของใบย้อนหลัง
  assert.doesNotMatch(salesOrderMoneyOutcome(approved, [HIST_OPENING, HIST_REGULAR], 'cancel').join('\n'), /Actual/);
});

test('โมดัลอนุมัติ: ดีลนี้มีเงินค้างจากใบที่ยกเลิก = เตือนให้กด "ยกเงินจากใบที่ยกเลิก" หลังอนุมัติ', () => {
  const draft = { ...APPROVED_SO, status: 'pending_approval' };
  const sources = [
    { id: 'SOR-X', orderNumber: 'SO-26080039-0', amount: 7639.8 },
    { id: 'SOR-Y', orderNumber: 'SO-26080041-0', amount: 1000 },
  ];
  const lines = salesOrderMoneyOutcome(draft, [], 'approve', { strandedSources: sources });
  assert.equal(lines[lines.length - 1],
    'ดีลนี้มีเงินค้างจากใบที่ยกเลิก SO-26080039-0 ฿7,639.80 · SO-26080041-0 ฿1,000.00 — หลังอนุมัติกด ‘ยกเงินจากใบที่ยกเลิก’ ที่แท็บการชำระ');
  assert.equal(salesOrderMoneyOutcome(draft, [], 'approve').length, 2, 'ไม่มีเงินค้าง = คำเดิมสองบรรทัด');
  assert.equal(salesOrderMoneyOutcome(draft, [], 'approve', { strandedSources: [] }).length, 2);
});

test('กู้คืนใบที่ยกเลิก: เงินยกไปใบใหม่แล้ว หรือคืนลูกค้าแล้ว = คืนสถานะไม่ได้ (ให้ออกใบใหม่)', () => {
  assert.equal(cancelledMoneyRestoreBlock(MONEY_ROWS, []), null, 'เงินค้างที่ยังอยู่กับใบ = กู้คืนได้ตามเดิม');
  assert.equal(cancelledMoneyRestoreBlock([], []), null);
  const carried = [
    { id: 'SOI-1', reason: 'carry', salesOrderId: 'SOR-N', orderNumber: 'SO-26090002-0' },
    { id: 'SOI-2', reason: 'carry', salesOrderId: 'SOR-N', orderNumber: 'SO-26090002-0' },
  ];
  assert.equal(cancelledMoneyRestoreBlock([], carried), 'เงินของใบนี้ยกไป SO-26090002-0 แล้ว — คืนสถานะไม่ได้ ให้ออกใบใหม่');
  assert.equal(cancelledMoneyRestoreBlock([refundedRow()], []), 'เงินของใบนี้คืนลูกค้าแล้ว 1 งวด — คืนสถานะไม่ได้ ให้ออกใบใหม่');
  assert.equal(cancelledMoneyRestoreBlock([refundedRow()], carried),
    'เงินของใบนี้ยกไป SO-26090002-0 แล้ว · คืนลูกค้าแล้ว 1 งวด — คืนสถานะไม่ได้ ให้ออกใบใหม่');
  // แถวที่ย้ายออกเพราะออก Rev. ไม่ใช่เงินที่ยก (ใบ revised กู้คืนไม่ได้อยู่แล้ว)
  assert.equal(cancelledMoneyRestoreBlock([], [{ id: 'x', reason: 'revision', orderNumber: 'SO-1-1' }]), null);
});

test('ลบถาวร: มีงวดที่ไหนอ้างใบนี้ใน movedFrom (ออก Rev./ยกเงิน) = ลบไม่ได้ — ไฟล์หลักฐานยังอยู่ในโฟลเดอร์ของใบนี้', () => {
  assert.equal(movedOutDeleteBlock([]), null);
  assert.equal(movedOutDeleteBlock(null), null);
  const why = movedOutDeleteBlock([
    { id: 'SOI-1', reason: 'carry', orderNumber: 'SO-26090002-0' },
    { id: 'SOI-2', reason: 'revision', orderNumber: 'SO-26090001-1' },
    { id: 'SOI-3', reason: 'carry', orderNumber: 'SO-26090002-0' },
  ]);
  assert.equal(why, 'ลบถาวรไม่ได้: งวดชำระ 3 งวดของ SO-26090002-0, SO-26090001-1 ย้ายไปจากใบนี้ (ออก Rev./ยกเงิน)'
    + ' และยังใช้หลักฐาน (สลิป · ใบกำกับ) ในโฟลเดอร์ของใบนี้ — ใบนี้เป็นประวัติของเงินก้อนนั้น');
});


/* ══ review รอบ PR0–PR3 (แผน so-payment-unlock-replan) ══════════════════════════════════════════════════════════ */

/* 🐞 cancelled-service-so-refund-deadend: ใบบริการที่ยกเลิก — งวด reported ที่ไม่มีช่วงครอบ รับรองไม่ได้ (ด่านช่วงครอบ)
   แต่เซลล์ช่วงครอบของใบยกเลิกถูกล็อก (PIPELINE_CANCELLED_LOCK) และคืนเงินรับเฉพาะ confirmed ⇒ คืนเงินไม่ได้เลย (ทางตัน)
   ⭐ ไม่มีนัดช่างไหนอ่านใบที่ยกเลิก ⇒ ด่าน "ต้องมีช่วงครอบก่อนรับรอง" ไม่มีอะไรให้กัน — ข้ามเมื่อใบยกเลิกแล้ว */
test('🔴 ใบบริการที่ยกเลิก: บัญชีรับรองงวด reported ที่ไม่มีช่วงครอบได้ แล้วบันทึกคืนเงินต่อได้ (ไม่ใช่ทางตัน)', () => {
  const reported = frozen({ id: 'SV-1', seq: 1, status: 'reported', amount: 10000, reportedAt: 'x', coversFrom: null, coversTo: null });
  const cancelledOpts = (action, extra = {}) => ({
    rows: [reported], orderTotal: 10000, serviceRounds: true,
    orderLock: pipelineInstallmentLock(CANCELLED_SO, action), orderCancelled: true, ...extra,
  });
  assert.equal(installmentActionError(reported, 'confirm', FN_STAFF, cancelledOpts('confirm')), null,
    'ใบยกเลิก — ด่านช่วงครอบไม่มีนัดช่างให้กันแล้ว');
  const confirmed = { ...reported, status: 'confirmed', confirmedAt: 'y' };
  assert.equal(installmentActionError(confirmed, 'refund', FN_STAFF, cancelledOpts('refund', { ...REFUND_OK, rows: [confirmed] })), null);
  // ใบบริการที่ยังเดินอยู่: ด่านเดิมทุกข้อ
  assert.match(installmentActionError(reported, 'confirm', FN_STAFF, {
    rows: [reported], orderTotal: 10000, serviceRounds: true,
    orderLock: pipelineInstallmentLock(APPROVED_SO, 'confirm'), orderCancelled: false,
  }), /ต้องระบุช่วงครอบบริการของงวดก่อน/);
});

/* 🐞 UI-2: งวดที่คืนเงินแล้วยังเป็น confirmed ในฐาน — แผง/ตารางรายการ SO นับเป็นเงินที่เก็บได้ ("เก็บครบแล้ว") */
test('🔴 paymentRollup: งวดที่คืนเงินแล้วไม่นับเป็นเงินที่เก็บได้ · ไม่ใช่ค้างรับ · ใบที่คืนครบไม่ใช่ "เก็บครบ"', () => {
  const r1 = frozen({ id: 'R1', seq: 1, status: 'confirmed', amount: 500, refundedAt: '2026-09-21T00:00:00Z' });
  const r2 = frozen({ id: 'R2', seq: 2, status: 'confirmed', amount: 500, refundedAt: '2026-09-21T00:00:00Z' });
  const all = paymentRollup([r1, r2], '2026-09-23');
  assert.equal(all.complete, false);
  assert.equal(all.confirmedCount, 0);
  assert.equal(all.confirmedAmount, 0);
  assert.equal(all.refundedCount, 2);
  assert.equal(all.refundedAmount, 1000);
  assert.equal(all.outstandingAmount, 0, 'เงินที่คืนไปแล้วไม่ใช่ยอดที่ต้องตามเก็บ');
  const mixed = paymentRollup([r1, frozen({ id: 'C2', seq: 2, status: 'confirmed', amount: 500 })], '2026-09-23');
  assert.equal(mixed.confirmedAmount, 500);
  assert.equal(mixed.complete, false);
  // ไม่มีงวดคืนเงิน = ผลเดิมทุกตัว
  const plain = paymentRollup(MONEY_ROWS, '2026-09-23');
  assert.equal(plain.confirmedAmount, 53500);
  assert.equal(plain.outstandingAmount, 53500);
  assert.equal(plain.refundedCount, 0);
});

test('🔴 salesOrderPaymentCell: งวดที่คืนเงินแล้วไม่นับ "เก็บแล้ว"/"ต้องมีใบกำกับ" · ป้ายบอก "คืนเงินแล้ว" · ใบยกเลิกที่มีเงินค้างบอก "เงินค้าง"', () => {
  const refunded = (id, seq) => ({ id, seq, status: 'confirmed', amount: 500, refundedAt: '2026-09-21T00:00:00Z', taxInvoiceNo: null });
  const cell = salesOrderPaymentCell([refunded('a', 1), refunded('b', 2)], null, '2026-09-23', 1000, 'cancelled');
  assert.equal(cell.paid, 0);
  assert.equal(cell.complete, false);
  assert.equal(cell.invoiceNeeded, 0);
  assert.equal(cell.refunded, 2);
  assert.deepEqual(salesOrderPaymentNote(cell), { label: 'คืนเงินแล้ว', tone: 'idle' });
  assert.equal(salesOrderTaxInvoiceNote(cell), null, 'ไม่ขึ้น "ใบกำกับ 0/2" ของเงินที่คืนไปแล้ว');
  // ใบยกเลิกที่ยังมีเงินรับแล้วอยู่ = เงินค้าง (ไม่ใช่ "เก็บครบแล้ว")
  const stranded = salesOrderPaymentCell([{ id: 's', seq: 1, status: 'confirmed', amount: 500, taxInvoiceNo: 'IV-1' }],
    null, '2026-09-23', 500, 'cancelled');
  assert.equal(stranded.stranded, 1);
  assert.deepEqual(salesOrderPaymentNote(stranded), { label: 'เงินค้าง 1 งวด', tone: 'warning' });
});

/* 🐞 UI-3: ใบ pipeline ที่ยกเลิก — งวดที่ยังไม่ชำระ (pending/rejected) เป็นโมฆะ (ทะเบียนตัดทิ้งตั้งแต่ PR0 · โมดัลยกเลิกสัญญา
   "หลุดจากยอดค้างรับทันที") แต่แผง/ตารางยังนับเป็นค้างรับ/เลยกำหนด */
test('🔴 installmentVoid: งวดที่ยังไม่ชำระของใบที่ยกเลิก/ถูกแทน = โมฆะ (กติกาเดียวกับทะเบียนบัญชี)', () => {
  const pending = { id: 'p', seq: 3, status: 'pending', amount: 500, dueDate: '2026-09-01' };
  const rejected = { ...pending, status: 'rejected' };
  for (const status of ['cancelled', 'revised']) {
    assert.equal(installmentVoid(pending, { status }), true, status);
    assert.equal(installmentVoid(rejected, { status }), true, status);
    assert.equal(installmentVoid({ ...pending, status: 'reported' }, { status }), false);
    assert.equal(installmentVoid({ ...pending, status: 'confirmed' }, { status }), false);
  }
  for (const status of ['approved', 'approval_revoked', 'draft', 'rejected']) {
    assert.equal(installmentVoid(pending, { status }), false, status);
  }
  assert.equal(installmentVoid(null, { status: 'cancelled' }), false);
});

test('🔴 salesOrderPaymentCell ของใบที่ยกเลิก: งวดโมฆะไม่นับ (ไม่ขึ้น "เลยกำหนด") · ไม่เหลืองวดจริง = ไม่มีคอลัมน์งวด (ไม่ใช่แผน QT)', () => {
  const plan = { type: 'installment', installments: [{ label: 'ก', percent: 50 }, { label: 'ข', percent: 50 }] };
  const rows = [
    { id: 'c', seq: 1, status: 'confirmed', amount: 500, taxInvoiceNo: 'IV-1' },
    { id: 'p', seq: 2, status: 'pending', amount: 500, dueDate: '2026-09-01' },
  ];
  const cell = salesOrderPaymentCell(rows, plan, '2026-09-23', 1000, 'cancelled');
  assert.equal(cell.overdue, 0, 'งวดโมฆะไม่ใช่ "เลยกำหนด"');
  assert.equal(cell.count, 1);
  assert.equal(cell.paid, 1);
  // ใบเดิมที่ยังเดิน: เลยกำหนดตามเดิม
  assert.equal(salesOrderPaymentCell(rows, plan, '2026-09-23', 1000, 'approved').overdue, 1);
  // UI-4: ยกเงินออกไปหมดแล้ว (0 แถว) / เหลือแต่งวดโมฆะ = ไม่มีคอลัมน์งวด — ไม่ถอยไปวาด "ยังไม่เริ่มติดตาม" จากแผน QT
  assert.equal(salesOrderPaymentCell([], plan, '2026-09-23', 1000, 'cancelled'), null);
  assert.equal(salesOrderPaymentCell([rows[1]], plan, '2026-09-23', 1000, 'cancelled'), null);
});

/* 🐞 MONEY-1: ดีลมีเงินค้าง — ตอนอนุมัติระบบไม่ยกสลิปจากเอกสารยืนยันคำสั่งซื้อมาตั้งงวดแรกให้ (freeze · borrowConfirmation)
   ⇒ โมดัลอนุมัติต้องบอกผลนั้น + ทาง "ยกแทนการแจ้ง" ก่อนกด */
test('🔴 โมดัลอนุมัติ: ดีลมีเงินค้าง + ยืนยันด้วยสลิป = บอกว่าไม่ยกสลิปมาตั้งงวดแรก · มีเงินที่บันทึกไว้ตอนร่าง = บอกว่าเข้าคิวบัญชีตามเดิม', () => {
  const draft = {
    ...APPROVED_SO, status: 'pending_approval',
    confirmDocType: 'payment_slip', confirmDocDate: '2026-08-20', confirmAttachments: [{ fileName: 'slip.jpg' }],
  };
  const sources = [{ id: 'SOR-X', orderNumber: 'SO-26080039-0', amount: 32100 }];
  const rows = [
    { id: 'd1', seq: 1, status: 'pending', amount: 32100 },
    { id: 'd2', seq: 2, status: 'pending', amount: 74900 },
  ];
  const lines = salesOrderMoneyOutcome(draft, rows, 'approve', { strandedSources: sources });
  assert.ok(lines.some((l) => /^ดีลนี้มีเงินค้างจากใบที่ยกเลิก SO-26080039-0 ฿32,100\.00/.test(l)));
  const slip = lines.find((l) => l.startsWith('ระบบไม่ยกสลิป'));
  assert.ok(slip, lines.join('\n'));
  assert.match(slip, /ถ้าสลิปนั้นคือเงินค้างก้อนเดียวกัน ให้ยกเงินแทนการแจ้งชำระ/);
  // ไม่มีเงินค้าง = ระบบยืมสลิปตามปกติ ⇒ ไม่มีบรรทัดนี้
  assert.ok(!salesOrderMoneyOutcome(draft, rows, 'approve').some((l) => l.startsWith('ระบบไม่ยกสลิป')));
  // เงินที่ SA บันทึกไว้ตอนร่าง (prepaid) ยังเข้าคิวบัญชี — ต้องบอกทางถ้าเป็นสลิปเดียวกับเงินค้าง
  const prepaid = [{ ...rows[0], paidOn: '2026-08-20', evidence: [{ fileName: 's.jpg' }] }, rows[1]];
  const withPrepaid = salesOrderMoneyOutcome({ ...draft, confirmDocType: 'po' }, prepaid, 'approve', { strandedSources: sources });
  const line = withPrepaid.find((l) => l.startsWith('งวดที่บันทึกการจ่ายไว้ตอนร่าง'));
  assert.ok(line, withPrepaid.join('\n'));
  assert.match(line, /1 งวด ฿32,100\.00 เข้าคิวบัญชีตามเดิม — ถ้าเป็นสลิปเดียวกับเงินค้าง ให้บัญชีตีกลับงวดนั้นก่อนแล้วจึงยกเงิน/);
});
