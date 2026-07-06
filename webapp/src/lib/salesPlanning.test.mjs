import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  requiredConfirmDateForNeedMonth,
  buildSahamitReverseRiskRows,
} from './salesPlanningReverse';

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
