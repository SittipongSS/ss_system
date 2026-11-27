// ── แผนงวดของใบสั่งขายเอง (mig 0441 · ปรับแผนงวดก่อนอนุมัติ · มติเจ้าของ 27/11/2026) ─────────────────────────────
// ⭐ ตรึงสี่เรื่อง: ตัวตัดสินแผนของใบ (ใบ > QT) · ด่านตรวจแผนใหม่ (เท่า QT = ล้าง · เหตุผล · แถวมีเงิน/เอกสารผูก) ·
//    ชุดคำสั่งตั้งงวดร่างตามแผน · และ "ทุกจุดที่คิดงวดของใบต้องผ่าน orderPaymentPlan" (ไม่งั้นแผนที่ปรับถูกทับกลับเป็นแผน QT
//    ตอนอนุมัติ) + รูปของ migration 0441
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORDER_PLAN_EDITABLE_STATUSES, orderHasOwnPlan, orderPaymentPlan, orderPlanChange, orderPlanEditBlocker, orderPlanSyncOps,
} from './salesOrderPaymentPlan.js';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';
import { salesOrderApprovalContent } from './salesOrderApprovalFingerprint.js';
import { stampOrderReplanned } from '../finance/paymentLedger.js';

const QT_PLAN = {
  type: 'installment',
  installments: [
    { no: 1, label: 'มัดจำ', percent: 50, amount: 5000, note: null },
    { no: 2, label: 'งวดสุดท้าย', percent: 50, amount: 5000, note: null },
  ],
};
const THREE = {
  type: 'installment',
  installments: [
    { label: 'มัดจำ', percent: 30, note: '' },
    { label: 'งวดที่ 2', percent: 30, note: '' },
    { label: 'งวดสุดท้าย', percent: 40, note: '' },
  ],
};
const REASON = 'ลูกค้าขอแบ่งเป็นสามงวด';
const row = (seq, extra = {}) => ({
  id: `SOI-${seq}`, seq, label: `งวด ${seq}`, percent: 50, amount: 5000, status: 'pending', evidence: [], ...extra,
});

test('orderPaymentPlan: แผนของใบชนะแผนของ QT · ไม่มี = แผนของ QT · ไม่มีทั้งคู่ = null', () => {
  const own = { type: 'full' };
  assert.equal(orderPaymentPlan({ paymentPlan: own, quotation: { paymentPlan: QT_PLAN } }), own);
  assert.equal(orderPaymentPlan({ paymentPlan: null, quotation: { paymentPlan: QT_PLAN } }), QT_PLAN);
  assert.equal(orderPaymentPlan({ paymentPlan: null }, { paymentPlan: QT_PLAN }), QT_PLAN, 'หน้ารายการส่ง QT แยกมา');
  assert.equal(orderPaymentPlan({}), null);
  assert.equal(orderHasOwnPlan({ paymentPlan: own }), true);
  assert.equal(orderHasOwnPlan({ paymentPlan: null }), false);
});

test('orderPlanChange: แผนเท่า QT = ล้าง (ไม่ต้องมีเหตุผล)', () => {
  const result = orderPlanChange({ plan: QT_PLAN, reason: '', total: 10000, quotePlan: QT_PLAN });
  assert.equal(result.error, undefined);
  assert.equal(result.plan, null);
  assert.equal(result.cleared, true);
  assert.equal(result.rows.length, 2);
});

test('orderPlanChange: แผนต่าง = บังคับเหตุผล 10 ตัวอักษรขึ้นไป', () => {
  assert.match(orderPlanChange({ plan: THREE, reason: 'สั้น', total: 10000, quotePlan: QT_PLAN }).error, /เหตุผล/);
  const ok = orderPlanChange({ plan: THREE, reason: REASON, total: 10000, quotePlan: QT_PLAN });
  assert.equal(ok.error, undefined);
  assert.equal(ok.cleared, false);
  assert.equal(ok.reason, REASON);
  assert.deepEqual(ok.rows.map((r) => r.amount), [3000, 3000, 4000]);
  assert.equal(ok.plan.type, 'installment');
  assert.equal(ok.plan.installments.length, 3);
});

test('orderPlanChange: สัดส่วนรวมไม่ถึง 100% ไม่ผ่าน', () => {
  const bad = { type: 'installment', installments: [{ label: 'ก', percent: 30 }, { label: 'ข', percent: 30 }] };
  assert.match(orderPlanChange({ plan: bad, reason: REASON, total: 10000, quotePlan: QT_PLAN }).error, /100/);
});

test('orderPlanChange: งวดที่มีเงิน/เอกสารผูกต้องอยู่ที่เลขเดิม ยอดเท่าเดิม', () => {
  const paid = [row(1, { paidOn: '2026-11-20', evidence: [{ fileName: 'slip.png' }] }), row(2)];
  // เปลี่ยนมัดจำจาก 5,000 เป็น 3,000 ทั้งที่งวด 1 มีสลิปแล้ว
  assert.match(orderPlanChange({ plan: THREE, reason: REASON, total: 10000, quotePlan: QT_PLAN, rows: paid }).error, /ยอดต้องเท่าเดิม/);
  // คงมัดจำ 50% แล้วแบ่งที่เหลือ — ผ่าน
  const keep = {
    type: 'installment',
    installments: [{ label: 'มัดจำ', percent: 50 }, { label: 'งวด 2', percent: 25 }, { label: 'งวด 3', percent: 25 }],
  };
  assert.equal(orderPlanChange({ plan: keep, reason: REASON, total: 10000, quotePlan: QT_PLAN, rows: paid }).error, undefined);
  // งวดที่ 2 ผูกใบกำกับ แต่ลดเหลือหนึ่งงวด
  const invoiced = [row(1), row(2, { taxInvoiceNo: 'INV-0001' })];
  const one = { type: 'full' };
  assert.match(orderPlanChange({ plan: one, reason: REASON, total: 10000, quotePlan: QT_PLAN, rows: invoiced }).error, /ตัดงวดนี้ทิ้งไม่ได้/);
});

test('orderPlanEditBlocker: ใบร่าง/ตีกลับเท่านั้น · ใบ Rev. ที่มีงวดตรึงแล้ว = โชว์แต่บอกเหตุ', () => {
  const draft = { status: 'draft', origin: 'pipeline', totalAmount: 10000 };
  assert.deepEqual(orderPlanEditBlocker(draft, [], { canEdit: true }), { visible: true, blocker: null });
  assert.equal(orderPlanEditBlocker(draft, [], { canEdit: false }).visible, false);
  assert.equal(orderPlanEditBlocker({ ...draft, status: 'rejected' }, [], { canEdit: true }).blocker, null);
  for (const status of ['pending_approval', 'approved', 'cancelled', 'revised']) {
    assert.equal(orderPlanEditBlocker({ ...draft, status }, [], { canEdit: true }).visible, false, status);
  }
  assert.equal(orderPlanEditBlocker({ ...draft, origin: 'historical' }, [], { canEdit: true }).visible, false);
  assert.equal(orderPlanEditBlocker({ ...draft, totalAmount: 0 }, [], { canEdit: true }).visible, false);
  const carried = orderPlanEditBlocker(draft, [row(1, { frozenAt: '2026-11-01T00:00:00Z' })], { canEdit: true });
  assert.equal(carried.visible, true);
  assert.match(carried.blocker, /Rev\./);
});

test('orderPlanSyncOps: งวดที่คงอยู่ทับป้าย/ยอด · เลขใหม่เพิ่ม · เลขที่หายไปลบ · หมายเหตุที่คนพิมพ์ชนะ', () => {
  const plan = orderPlanChange({ plan: THREE, reason: REASON, total: 10000, quotePlan: QT_PLAN }).rows;
  const ops = orderPlanSyncOps([row(1, { note: 'คนพิมพ์' }), row(2)], plan);
  assert.equal(ops.deletes.length, 0);
  assert.deepEqual(ops.inserts.map((r) => r.seq), [3]);
  assert.deepEqual(ops.updates.map((u) => u.seq), [1, 2]);
  assert.equal(ops.updates[0].patch.amount, 3000);
  assert.equal('note' in ops.updates[0].patch, false);

  const down = orderPlanSyncOps([row(1), row(2), row(3)], orderPlanChange({
    plan: { type: 'full' }, reason: REASON, total: 10000, quotePlan: QT_PLAN,
  }).rows);
  assert.deepEqual(down.deletes, ['SOI-2', 'SOI-3']);
  assert.equal(down.inserts.length, 0);
});

test('ลายนิ้วมืออนุมัติ: ใบที่ไม่มีแผนของตัวเองไม่มีคีย์ paymentPlan (ลายนิ้วมือใบเดิมไม่ขยับ)', () => {
  assert.equal('paymentPlan' in salesOrderApprovalContent({ paymentPlan: null }), false);
  assert.equal('paymentPlan' in salesOrderApprovalContent({}), false);
  assert.deepEqual(salesOrderApprovalContent({ paymentPlan: { type: 'full' } }).paymentPlan, { type: 'full' });
});

test('ทะเบียนบัญชี: ใบที่ปรับแผนก่อนอนุมัติไม่ขึ้น "ปรับแผนหลังอนุมัติ" — เทียบกับแผนของใบ ไม่ใช่แผน QT', () => {
  const own = orderPlanChange({ plan: THREE, reason: REASON, total: 10000, quotePlan: QT_PLAN }).plan;
  const ledger = [3000, 3000, 4000].map((amount, i) => ({
    orderId: 'SO-1', quotationId: 'QT-1', origin: 'pipeline', orderTotal: 10000, seq: i + 1, amount,
    label: own.installments[i].label,
  }));
  stampOrderReplanned(ledger, new Map([['QT-1', QT_PLAN]]));
  assert.equal(ledger[0].orderReplanned, true, 'ไม่ส่งแผนของใบ = เทียบ QT (ขึ้นป้าย)');
  stampOrderReplanned(ledger, new Map([['QT-1', QT_PLAN]]), new Map([['SO-1', own]]));
  assert.equal(ledger[0].orderReplanned, false);
});

/* ── ยามรูปโค้ด: จุดที่คิดงวดของใบห้ามอ่านแผนของ QT ตรง ๆ ───────────────────────────────────────────────
   🪤 พลาดจุดเดียว = แผนที่ปรับถูกทับกลับเป็นแผน QT (freezeInstallments) หรือจอโชว์ยอดของ QT ทับงวดร่าง (withLiveAmounts) */
const SRC = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, SRC), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('จุดคิดงวดของใบทุกจุดอ่านผ่าน orderPaymentPlan (ไม่อ่าน quotation.paymentPlan ตรง)', () => {
  const files = [
    'lib/sales/salesOrderInstallmentsStore.js',
    'lib/sales/customerRuleChange.js',
    'lib/sales/salesOrderPrint.js',
    'components/salesPlanning/SalesOrderPaymentPanel.js',
    'app/sales-planning/sales-orders/[id]/page.js',
    'app/api/sales-planning/sales-orders/[id]/installments/route.js',
  ];
  for (const file of files) {
    const code = stripComments(read(file));
    assert.equal(/quotation\??\.paymentPlan\s*,\s*order/.test(code), false, `${file} อ่านแผน QT ตรงเพื่อคิดงวด`);
    assert.equal(/withLiveAmounts\([^)]*quotation\??\.paymentPlan/.test(code), false, `${file}: withLiveAmounts ต้องใช้แผนของใบ`);
    assert.equal(/buildInstallmentsForOrder\(\s*order\.quotation/.test(code), false, `${file}: ตั้งงวดต้องใช้แผนของใบ`);
    assert.ok(code.includes('orderPaymentPlan('), `${file} ต้องเรียก orderPaymentPlan`);
  }
});

test('migration 0441: คอลัมน์ · CHECK · ด่านสถานะตรงกับ ORDER_PLAN_EDITABLE_STATUSES · ใบ Rev. ได้แผนของใบเดิม', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0441_so_draft_payment_plan.sql', import.meta.url), 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');
  for (const column of ['paymentPlan', 'paymentPlanReason', 'paymentPlanSetAt', 'paymentPlanSetById', 'paymentPlanSetByName']) {
    assert.ok(code.includes(`ADD COLUMN IF NOT EXISTS "${column}"`), column);
  }
  assert.ok(code.includes('BETWEEN 10 AND 500'), 'เหตุผล 10–500 ตัวอักษร');
  const statuses = ORDER_PLAN_EDITABLE_STATUSES.map((s) => `'${s}'`).join(', ');
  assert.ok(code.includes(`OLD.status NOT IN (${statuses})`), 'ด่านสถานะของ trigger = ORDER_PLAN_EDITABLE_STATUSES');
  assert.ok(code.includes("RAISE EXCEPTION 'sales_order_payment_plan_locked'"));
  assert.ok(WORKFLOW_ERROR_CODES.includes('sales_order_payment_plan_locked'), 'รหัสของฐานต้องมีข้อความไทย');
  assert.match(code, /BEFORE INSERT ON public\.sales_orders[\s\S]*sales_order_payment_plan_carry/);
  assert.match(code, /NEW\."revisedFromId" IS NOT NULL AND NEW\."paymentPlan" IS NULL/);
  assert.equal(/\b(INSERT INTO|DELETE FROM)\b/i.test(code), false, 'ไม่ backfill');
});
