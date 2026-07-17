import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  requiredConfirmDateForNeedMonth,
  buildSahamitReverseRiskRows,
} from './salesPlanningReverse';
import { canSeeDealValues, inSalesEditScope, inSalesViewScope, redactDealMoney, salesPlanningEditScope, salesPlanningViewScope } from './salesPlanning';

test('requiredConfirmDateForNeedMonth subtracts working days from first day of need month', () => {
  assert.equal(requiredConfirmDateForNeedMonth('2026-08', 1, new Set()), '2026-07-31');
  assert.equal(requiredConfirmDateForNeedMonth('2026-08', 2, new Set()), '2026-07-30');
});

test('buildSahamitReverseRiskRows uses latest covering FC round and flags late FC', () => {
  const rows = buildSahamitReverseRiskRows([
    {
      roundNo: 1,
      receivedDate: '2026-01-01',
      coverMonths: ['2026-08'],
      lines: [{ fgCode: 'A', productName: 'Alpha', month: '2026-08', qty: 100 }],
    },
    {
      roundNo: 2,
      receivedDate: '2026-07-15',
      coverMonths: ['2026-08'],
      lines: [{ fgCode: 'A', productName: 'Alpha', month: '2026-08', qty: 80 }],
    },
  ], new Set(), 30);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].qty, 80);
  assert.equal(rows[0].latestRoundNo, 2);
  assert.equal(rows[0].warehouseNeedMonth, '2026-08');
  assert.equal(rows[0].risk, true);
});

test('AE can edit PM-backfilled sales deal when PM owner name matches', () => {
  const ae = { id: 'u-ae-1', role: 'ae', name: 'Sittipong SS', team: 'SA' };

  assert.equal(inSalesEditScope(ae, {
    ownerId: null,
    ownerName: '  sittipong   ss ',
    team: null,
    metadata: { source: 'pm-backfill' },
  }), true);

  assert.equal(inSalesEditScope(ae, {
    ownerId: 'other-user',
    ownerName: 'Sittipong SS',
    team: 'SA',
    metadata: { source: 'manual' },
  }), false);
});

test('sales plan project auth scopes by sales role', () => {
  assert.equal(salesPlanningViewScope('ae'), 'own');
  assert.equal(salesPlanningEditScope('ae'), 'own');
  assert.equal(salesPlanningViewScope('senior_ae'), 'team');
  assert.equal(salesPlanningEditScope('senior_ae'), 'team');
  assert.equal(salesPlanningViewScope('ac'), 'team');
  assert.equal(salesPlanningEditScope('ac'), 'team');
  assert.equal(salesPlanningViewScope('ae_supervisor'), 'all');
  assert.equal(salesPlanningEditScope('ae_supervisor'), 'all');
  assert.equal(salesPlanningViewScope('admin'), 'all');
  assert.equal(salesPlanningEditScope('admin'), 'all');
  // viewer = read-only observer: sees every team's deals ('all') but edits none.
  assert.equal(salesPlanningViewScope('viewer'), 'all');
  assert.equal(salesPlanningEditScope('viewer'), 'none');
  // rd = ฝ่ายวิจัยและพัฒนา: sees every team's deals for inquiry context, edits none.
  assert.equal(salesPlanningViewScope('rd'), 'all');
  assert.equal(salesPlanningEditScope('rd'), 'none');
});

test('AE sees only own sales plan projects, including PM backfill by owner name', () => {
  const ae = { id: 'u-ae-1', role: 'ae', name: 'Sittipong SS', team: 'KA' };

  assert.equal(inSalesViewScope(ae, { ownerId: 'u-ae-1', ownerName: 'Someone', team: 'ODM' }), true);
  assert.equal(inSalesViewScope(ae, { ownerId: 'other-user', ownerName: 'Sittipong SS', team: 'KA', metadata: { source: 'manual' } }), false);
  assert.equal(inSalesViewScope(ae, { ownerId: null, ownerName: 'sittipong ss', team: null, metadata: { source: 'pm-backfill' } }), true);
});

test('canSeeDealValues: only rd is blind to money — sales roles and executive viewer keep it', () => {
  for (const role of ['admin', 'ae_supervisor', 'senior_ae', 'ac', 'ae', 'viewer']) {
    assert.equal(canSeeDealValues({ role }), true, role);
  }
  assert.equal(canSeeDealValues({ role: 'rd' }), false);
  assert.equal(canSeeDealValues(null), false);
});

test('redactDealMoney strips money fields at every depth and keeps the rest', () => {
  const redacted = redactDealMoney({
    id: 'DL-1',
    title: 'ดีลทดสอบ',
    projectValue: 100000,
    wonValue: 90000,
    budget: 50000,
    forecastDrift: { forecastAmount: 120000, month: '2026-07' },
    quotations: [{
      quoteNumber: 'QT2607-001',
      totalAmount: 107000,
      vatAmount: 7000,
      subtotal: 100000,
      lines: [{ description: 'FG-A', qty: 2, unitPrice: 50000, lineTotal: 100000 }],
    }],
    salesOrders: [{ orderNumber: 'SO2607-001', actualAmount: 100000, status: 'approved' }],
    metadata: { source: 'lead', depositAmount: 30000 },
  });

  // เนื้องานยังครบ
  assert.equal(redacted.id, 'DL-1');
  assert.equal(redacted.title, 'ดีลทดสอบ');
  assert.equal(redacted.quotations[0].quoteNumber, 'QT2607-001');
  assert.equal(redacted.quotations[0].lines[0].qty, 2);
  assert.equal(redacted.salesOrders[0].status, 'approved');
  assert.equal(redacted.forecastDrift.month, '2026-07');

  // เงินหายทุกชั้น (ต้อง "ไม่มี key" ไม่ใช่ null — ให้ fmtMoney โชว์ — ได้ถูกต้อง)
  for (const [obj, key] of [
    [redacted, 'projectValue'], [redacted, 'wonValue'], [redacted, 'budget'],
    [redacted.forecastDrift, 'forecastAmount'],
    [redacted.quotations[0], 'totalAmount'], [redacted.quotations[0], 'vatAmount'], [redacted.quotations[0], 'subtotal'],
    [redacted.quotations[0].lines[0], 'unitPrice'], [redacted.quotations[0].lines[0], 'lineTotal'],
    [redacted.salesOrders[0], 'actualAmount'],
    [redacted.metadata, 'depositAmount'],
  ]) {
    assert.equal(Object.hasOwn(obj, key), false, key);
  }
});
