// ยอด SO "รออนุมัติ" (มติผู้ใช้ 2026-09-11 · mig 0353) — โชว์ได้ แต่แยกจาก Actual เสมอ
// ล็อกนิยามของตัวช่วยกลางทุกตัวที่จอต่าง ๆ เรียก — จอไหนคิดเองจะหลุดจากกติกานี้
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_APPROVAL_LABEL,
  dealActualFromSalesOrders,
  dealPendingApprovalAmount,
  dealPendingApprovalCount,
  salesOrderActual,
  salesOrderAmountKind,
  salesOrderPendingApprovalAmount,
  splitSalesOrderAmounts,
} from './salesOrderWorkflow.js';
import {
  forecastAccuracyRollup,
  pendingApprovalAmountOf,
  pendingApprovalCountOf,
  pendingApprovalMonthOf,
  wonAmountOf,
} from './dashboardMetrics.js';
import { rollupDeals } from './projectRollup.js';

const ALL_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'revised', 'approval_revoked', 'cancelled'];

test('ป้ายเดียวกับสถานะ SO — "รออนุมัติ"', () => {
  assert.equal(PENDING_APPROVAL_LABEL, 'รออนุมัติ');
});

test('แถว SO: รออนุมัติ = pending_approval เท่านั้น · ยอดก่อน VAT (actualAmount)', () => {
  for (const status of ALL_STATUSES) {
    const order = { status, actualAmount: 1000, totalAmount: 1070 };
    assert.equal(salesOrderPendingApprovalAmount(order), status === 'pending_approval' ? 1000 : 0, status);
    // สองกองไม่ซ้อนกัน — ใบเดียวอยู่ได้กองเดียว
    assert.ok(!(salesOrderPendingApprovalAmount(order) && salesOrderActual(order)), status);
  }
  assert.equal(salesOrderPendingApprovalAmount({ status: 'pending_approval', actualAmount: -5 }), 0);
  assert.equal(salesOrderPendingApprovalAmount(null), 0);
});

test('แถว SO: สามสถานะของยอด', () => {
  assert.equal(salesOrderAmountKind({ status: 'approved' }), 'actual');
  assert.equal(salesOrderAmountKind({ status: 'pending_approval' }), 'pending_approval');
  for (const status of ['draft', 'rejected', 'revised', 'approval_revoked', 'cancelled', undefined]) {
    assert.equal(salesOrderAmountKind({ status }), 'excluded', String(status));
  }
});

test('รวมยอดจากแถว SO: Actual กับรออนุมัติแยกกอง ร่าง/ตีกลับ/ย้อนอนุมัติไม่นับ', () => {
  const rows = ALL_STATUSES.map((status, i) => ({ status, actualAmount: (i + 1) * 100 }));
  assert.deepEqual(splitSalesOrderAmounts(rows), {
    actual: 300, actualCount: 1, pendingApproval: 200, pendingApprovalCount: 1,
  });
  assert.deepEqual(splitSalesOrderAmounts([]), { actual: 0, actualCount: 0, pendingApproval: 0, pendingApprovalCount: 0 });
});

test('ดีล: อ่าน cache ที่ DB เขียน — ไม่มีคีย์ = 0 (JS ขึ้นก่อนรัน migration ได้)', () => {
  assert.equal(dealPendingApprovalAmount({ metadata: { soPendingAmount: 993000, soPendingCount: 8 } }), 993000);
  assert.equal(dealPendingApprovalCount({ metadata: { soPendingAmount: 993000, soPendingCount: 8 } }), 8);
  assert.equal(dealPendingApprovalAmount({ metadata: {} }), 0);
  assert.equal(dealPendingApprovalAmount({}), 0);
  assert.equal(dealPendingApprovalAmount(null), 0);
  assert.equal(dealPendingApprovalAmount({ metadata: { soPendingAmount: -1 } }), 0);
  assert.equal(dealPendingApprovalCount({ metadata: { soPendingCount: '2' } }), 2);
});

test('ดีล Won ที่ SO ยังรออนุมัติ: Actual 0 · รออนุมัติ = ยอดใบ · ไม่ปนกัน', () => {
  // รูปจริงบน prod 2026-09-11 (DL-260900474): trigger เขียน wonValue 0 + สองคีย์ใหม่
  const deal = {
    stage: 'won', projectValue: 108000, wonValue: 0,
    metadata: { actualSource: 'sale_order', wonMonth: null, wonValueExVat: 0, soPendingAmount: 108000, soPendingCount: 1 },
  };
  assert.equal(dealActualFromSalesOrders(deal), 0);
  assert.equal(wonAmountOf(deal), 0);
  assert.equal(pendingApprovalAmountOf(deal), 108000);
  assert.equal(pendingApprovalCountOf(deal), 1);
  // Actual ของ rollup FC ไม่เปลี่ยน — ยอดรออนุมัติไม่ไหลเข้า wonValue/variance
  const r = forecastAccuracyRollup([], [deal], []);
  assert.equal(r.wonValue, 0);
  assert.equal(r.fullForecast, 108000);
});

test('ดีลที่มีทั้งใบอนุมัติแล้วและใบรออนุมัติ — โชว์ทั้งสองกองแยกกัน', () => {
  const deal = {
    stage: 'won', projectValue: 300000, wonValue: 200000,
    metadata: { actualSource: 'sale_order', wonMonth: '2026-08', soPendingAmount: 100000, soPendingCount: 1 },
  };
  assert.equal(wonAmountOf(deal), 200000);
  assert.equal(pendingApprovalAmountOf(deal), 100000);
});

test('นับรออนุมัติเฉพาะดีล Won — ดีลเปิดมี FC ใน FC คงเหลือแล้ว', () => {
  const open = { stage: 'quotation', metadata: { soPendingAmount: 5000, soPendingCount: 1 } };
  assert.equal(pendingApprovalAmountOf(open), 0);
  assert.equal(pendingApprovalCountOf(open), 0);
  assert.equal(pendingApprovalMonthOf(open), null);
  assert.equal(pendingApprovalAmountOf({ stage: 'in_project', metadata: { soPendingAmount: 7 } }), 7);
});

test('เดือนของยอดรออนุมัติ = เดือนปัจจุบันเวลาไทยเสมอ (มติผู้ใช้ 2026-09-11)', () => {
  const deal = { stage: 'won', confirmedAt: '2026-08-01T20:00:00Z', forecastMonth: '2026-07', metadata: { soPendingAmount: 1 } };
  assert.equal(pendingApprovalMonthOf(deal, new Date('2026-09-11T08:00:00Z')), '2026-09');
  // เที่ยงคืนต้นเดือนเวลาไทย = ยังเป็นวันสุดท้ายของเดือนก่อนตาม UTC → ต้องได้เดือนใหม่
  assert.equal(pendingApprovalMonthOf(deal, new Date('2026-09-30T17:30:00Z')), '2026-10');
  // ไม่มียอด = ไม่มีเดือน
  assert.equal(pendingApprovalMonthOf({ stage: 'won', metadata: {} }, new Date('2026-09-11T08:00:00Z')), null);
});

test('rollup โครงการ: รออนุมัติแยกช่อง ไม่อยู่ใน actual / totalValue / variance', () => {
  const r = rollupDeals([
    { stage: 'won', dealType: 'NPD', projectValue: 108000, wonValue: 0, metadata: { actualSource: 'sale_order', soPendingAmount: 108000, soPendingCount: 1 } },
    { stage: 'won', dealType: 'SCENT', projectValue: 50000, wonValue: 50000, metadata: { actualSource: 'sale_order' } },
    { stage: 'qualified', dealType: 'RE-ORDER', projectValue: 20000, metadata: { soPendingAmount: 999, soPendingCount: 1 } },
  ]);
  assert.equal(r.actual, 50000);
  assert.equal(r.pendingApproval, 108000);
  assert.equal(r.pendingApprovalCount, 1);
  assert.equal(r.totalValue, 50000 + 20000);
  assert.equal(r.variance, 50000 - (108000 + 50000));
  assert.equal(r.byType.find((b) => b.type === 'NPD').pendingApproval, 108000);
  assert.equal(r.byType.find((b) => b.type === 'RE-ORDER').pendingApproval, 0);
});
