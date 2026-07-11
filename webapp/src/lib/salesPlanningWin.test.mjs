// Tests for win-value semantics (แผน merge เฟส 3): wonValue = ยอดปิดจริง,
// projectValue = คาดการณ์ (freeze หลัง won). buildWinPatch ต้องไม่ทับ projectValue
// เว้นแต่ผู้เรียกส่งมาโดยตรง (ดีลลูก/stub ที่คาดการณ์=จริง).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildWinPatch } from './salesPlanningWin.js';

test('buildWinPatch sets wonValue and leaves projectValue (forecast) untouched', () => {
  const deal = { projectValue: 1000, stage: 'deposit_pending', metadata: {} };
  const patch = buildWinPatch({ deal, wonValue: 850, now: '2026-07-08T00:00:00.000Z' });
  assert.equal(patch.wonValue, 850);
  assert.equal(patch.stage, 'won');
  assert.equal('projectValue' in patch, false); // forecast frozen — not overwritten
});

test('buildWinPatch overwrites projectValue only when caller passes it (stub/child)', () => {
  const patch = buildWinPatch({ deal: { metadata: {} }, wonValue: 500, projectValue: 500 });
  assert.equal(patch.wonValue, 500);
  assert.equal(patch.projectValue, 500);
});

test('buildWinPatch falls back to deal value when no wonValue given (idempotent re-win)', () => {
  const patch = buildWinPatch({ deal: { wonValue: 700, projectValue: 1000, metadata: {} } });
  assert.equal(patch.wonValue, 700); // keeps existing actual, not the forecast
});

test('buildWinPatch coerces invalid wonValue to 0 via toMoney', () => {
  const patch = buildWinPatch({ deal: { metadata: {} }, wonValue: -5 });
  assert.equal(patch.wonValue, 0);
});

test('buildWinPatch stores the won month (AT) in metadata but never moves forecastMonth (FC)', () => {
  const patch = buildWinPatch({ deal: { forecastMonth: '2026-03', metadata: {} }, wonValue: 100, wonMonth: '2026-06' });
  assert.equal(patch.metadata.wonMonth, '2026-06'); // AT books to the chosen month
  assert.equal('forecastMonth' in patch, false);     // FC stays put — measures forecast accuracy
  // an invalid month is dropped, not stored
  const bad = buildWinPatch({ deal: { forecastMonth: '2026-03', metadata: {} }, wonValue: 100, wonMonth: 'nope' });
  assert.equal('wonMonth' in bad.metadata, false);
  assert.equal('forecastMonth' in bad, false);
  // omitted → not stored (dashboard falls back to confirmedAt)
  const none = buildWinPatch({ deal: { forecastMonth: '2026-03', metadata: {} }, wonValue: 100 });
  assert.equal('wonMonth' in none.metadata, false);
  assert.equal('forecastMonth' in none, false);
});
