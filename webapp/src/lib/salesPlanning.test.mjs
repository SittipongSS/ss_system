import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  requiredConfirmDateForNeedMonth,
  buildSahamitReverseRiskRows,
} from './salesPlanningReverse';
import { inSalesEditScope, inSalesViewScope, salesPlanningEditScope, salesPlanningViewScope } from './salesPlanning';

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
});

test('AE sees only own sales plan projects, including PM backfill by owner name', () => {
  const ae = { id: 'u-ae-1', role: 'ae', name: 'Sittipong SS', team: 'KA' };

  assert.equal(inSalesViewScope(ae, { ownerId: 'u-ae-1', ownerName: 'Someone', team: 'ODM' }), true);
  assert.equal(inSalesViewScope(ae, { ownerId: 'other-user', ownerName: 'Sittipong SS', team: 'KA', metadata: { source: 'manual' } }), false);
  assert.equal(inSalesViewScope(ae, { ownerId: null, ownerName: 'sittipong ss', team: null, metadata: { source: 'pm-backfill' } }), true);
});
