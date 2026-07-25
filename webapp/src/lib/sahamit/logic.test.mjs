// Sanity tests for the ported SAHAMIT pure logic. Mirrors the user's worked
// example: FC round 1 covers months 1–4, round 2 covers 2–6 (a month dropped,
// later months added, some shifted). Run: npm test (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { snapshotForSku, snapshotSeriesForSku, snapshotTotal } from './snapshots.js';
import { diffSnapshots } from './diff.js';
import { computeSkuFcWarning } from './peak.js';
import { reconcileCell } from './reconcile.js';
import { compareRounds, roundTotal, roundSkuCount } from './forecastClient.js';
import { buildReconMatrix, cellDetail, posByRound } from './reconcileClient.js';
import { leadDaysFor, recommendedReadyDate, materialView, LEAD_IN_FC, LEAD_OUT_FC } from './material.js';
import { detectFlags } from './flags.js';
import { avgShiftForSku, predictShifts, suggestCoverage, suggestCoverageTargets, addMonths, urgencyOf } from './predict.js';
import { desiredRoundNumbers } from './roundOrder.js';

test('posByRound groups POs into the FC round active when received', () => {
  const rounds = [
    { roundNo: 1, receivedDate: '2026-01-01' },
    { roundNo: 2, receivedDate: '2026-03-01' },
  ];
  const pos = [
    { poNumber: 'PO-A', receivedDate: '2026-01-15' }, // in round 1 window
    { poNumber: 'PO-B', receivedDate: '2026-03-10' }, // in round 2 window (open end)
    { poNumber: 'PO-C', receivedDate: '2026-02-28' }, // still round 1 (before round 2)
    { poNumber: 'PO-D', receivedDate: '2025-12-20' }, // before first round → unassigned
    { poNumber: 'PO-E' },                              // no date → unassigned
  ];
  const { byRound, unassigned, windows } = posByRound(rounds, pos);
  assert.deepEqual(windows.map((w) => [w.roundNo, w.start, w.end]), [[1, '2026-01-01', '2026-03-01'], [2, '2026-03-01', null]]);
  assert.deepEqual(byRound.get(1).pos.map((p) => p.poNumber).sort(), ['PO-A', 'PO-C']);
  assert.deepEqual(byRound.get(2).pos.map((p) => p.poNumber), ['PO-B']);
  assert.deepEqual(unassigned.map((p) => p.poNumber).sort(), ['PO-D', 'PO-E']);
});

test('snapshotForSku aggregates one round, one SKU, sums same-month lines', () => {
  const lines = [
    { fgCode: 'A', month: '2026-01', qty: 100 },
    { fgCode: 'A', month: '2026-01', qty: 50 },   // same month → summed
    { fgCode: 'A', month: '2026-02', qty: 200 },
    { fgCode: 'B', month: '2026-01', qty: 999 },  // other SKU → ignored
  ];
  assert.deepEqual(snapshotForSku(lines, 'A'), { '2026-01': 150, '2026-02': 200 });
  assert.equal(snapshotTotal(snapshotForSku(lines, 'A')), 350);
});

test('snapshotSeriesForSku orders rounds ascending', () => {
  const rounds = [
    { roundNo: 2, lines: [{ fgCode: 'A', month: '2026-02', qty: 10 }] },
    { roundNo: 1, lines: [{ fgCode: 'A', month: '2026-01', qty: 5 }] },
  ];
  const series = snapshotSeriesForSku(rounds, 'A');
  assert.deepEqual(series.map((s) => s.roundNo), [1, 2]);
});

test('diffSnapshots classifies increase / decrease / add / remove', () => {
  const oldS = { '2026-01': 100, '2026-02': 200, '2026-03': 300 };
  const newS = { '2026-02': 250, '2026-03': 150, '2026-04': 400 };
  const d = diffSnapshots(oldS, newS);
  // 2026-01 removed(100), 2026-04 added(400); but shift-matching may pair them.
  assert.deepEqual(d.increases, [{ month: '2026-02', oldQty: 200, newQty: 250, diff: 50 }]);
  assert.deepEqual(d.decreases, [{ month: '2026-03', oldQty: 300, newQty: 150, diff: -150 }]);
});

test('diffSnapshots pairs a removed+added month of similar qty as a shift', () => {
  // Jun 1000 disappears, Jul 1000 appears → one shift, no add/remove left over.
  const d = diffSnapshots({ '2026-06': 1000 }, { '2026-07': 1000 });
  assert.equal(d.shifts.length, 1);
  assert.deepEqual(
    { from: d.shifts[0].fromMonth, to: d.shifts[0].toMonth, diff: d.shifts[0].diff },
    { from: '2026-06', to: '2026-07', diff: 0 },
  );
  assert.equal(d.added.length, 0);
  assert.equal(d.removed.length, 0);
});

test('diffSnapshots keeps far-apart qty as separate add/remove (not a shift)', () => {
  const d = diffSnapshots({ '2026-06': 1000 }, { '2026-07': 100 }); // 90% apart > 50%
  assert.equal(d.shifts.length, 0);
  assert.equal(d.removed.length, 1);
  assert.equal(d.added.length, 1);
});

test('diffSnapshots honors the isLocked predicate (lockedBreak vs change)', () => {
  const d = diffSnapshots({ '2026-01': 100 }, { '2026-01': 80 }, { isLocked: (m) => m === '2026-01' });
  assert.equal(d.decreases.length, 0);
  assert.deepEqual(d.lockedBreaks, [{ month: '2026-01', oldQty: 100, newQty: 80, diff: -20 }]);
});

test('computeSkuFcWarning flags a peak drop with a per-line breakdown', () => {
  // Round1 peak total 1000; round2 drops to 700 on the same active months.
  const series = [
    { roundNo: 1, snapshot: { '2026-03': 600, '2026-04': 400 } },
    { roundNo: 2, snapshot: { '2026-03': 600, '2026-04': 100 } },
  ];
  const w = computeSkuFcWarning(series);
  assert.equal(w.hasWarning, true);
  assert.equal(w.oldTotal, 1000);
  assert.equal(w.newTotal, 700);
  assert.ok(w.breakdown.some((b) => b.type === 'decrease' && b.month === '2026-04' && b.change === -300));
});

test('computeSkuFcWarning: no warning when total holds or rises; null under 2 rounds', () => {
  assert.equal(computeSkuFcWarning([{ roundNo: 1, snapshot: { '2026-01': 100 } }]), null);
  const up = computeSkuFcWarning([
    { roundNo: 1, snapshot: { '2026-01': 100 } },
    { roundNo: 2, snapshot: { '2026-01': 120 } },
  ]);
  assert.equal(up.hasWarning, false);
});

test('reconcileCell core statuses match ss-cj labels', () => {
  assert.deepEqual(pick(reconcileCell({ fcQty: 0, poQty: 0 })), { status: 'none', label: '' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 0, poQty: 0, hasHistory: true })), { status: 'cancelled', label: 'ยกเลิกแล้ว' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 100 })), { status: 'match', label: '✓ ครบ' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 150 })), { status: 'over', label: '◉ PO เกิน' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 0, poQty: 150 })), { status: 'unforecasted', label: 'นอก FC' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 60 })), { status: 'discrepancy', label: '◐ PO ไม่ครบ' });
  assert.deepEqual(pick(reconcileCell({ fcQty: 100, poQty: 0 })), { status: 'pending', label: '◌ รอ PO' });
});

function pick(r) { return { status: r.status, label: r.label }; }

// ── flag detection (shift/cut audit + PO-aware) ───────────────────────
const R1 = { roundNo: 1, receivedDate: '2026-05-01', lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 100 }] };

test('detectFlags: a decrease with NO PO → drop flag (peak ลดจริง)', () => {
  const rounds = [R1, { roundNo: 2, receivedDate: '2026-06-01', lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 60 }] }];
  const flags = detectFlags(rounds, [], []);
  const jul = flags.find((f) => f.month === '2026-07');
  assert.equal(jul.kind, 'drop');
  assert.equal(jul.drop, 40);
  assert.equal(jul.roundNo, 2);
});

test('detectFlags: FC ลดพอดีกับ PO ที่มาใหม่ → po_filled ไม่ใช่ drop (peak ไม่ลด)', () => {
  const rounds = [R1, { roundNo: 2, receivedDate: '2026-06-01', lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 60 }] }];
  // PO 40 ของ A รับเข้า 20 พ.ค. (หลังรอบ 1, ก่อนรอบ 2) — อธิบายยอดที่ลด 40
  const pos = [{ receivedDate: '2026-05-20', lines: [{ fgCode: 'A', qty: 40, status: 'open' }] }];
  const flags = detectFlags(rounds, pos, []);
  const jul = flags.filter((f) => f.month === '2026-07');
  assert.equal(jul.length, 1);
  assert.equal(jul[0].kind, 'po_filled');
  assert.equal(jul[0].drop, 40);
});

test('detectFlags: ลด 40 แต่ PO มาแค่ 30 → po_filled 30 + drop 10 (peak ลด 10)', () => {
  const rounds = [R1, { roundNo: 2, receivedDate: '2026-06-01', lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 60 }] }];
  const pos = [{ receivedDate: '2026-05-20', lines: [{ fgCode: 'A', qty: 30, status: 'open' }] }];
  const flags = detectFlags(rounds, pos, []);
  const jul = flags.filter((f) => f.month === '2026-07');
  assert.equal(jul.find((f) => f.kind === 'po_filled').drop, 30);
  assert.equal(jul.find((f) => f.kind === 'drop').drop, 10);
});

test('detectFlags: PO เก่า (ก่อนรอบก่อนหน้า) ไม่ถูกนับกลบ → ยังเป็น drop', () => {
  const rounds = [R1, { roundNo: 2, receivedDate: '2026-06-01', lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 60 }] }];
  const pos = [{ receivedDate: '2026-04-15', lines: [{ fgCode: 'A', qty: 40, status: 'open' }] }]; // ก่อนรอบ 1
  const flags = detectFlags(rounds, pos, []);
  assert.equal(flags.find((f) => f.month === '2026-07').kind, 'drop');
});

test('detectFlags: PO ที่ถูกยกเลิก ไม่ถูกนับกลบ', () => {
  const rounds = [R1, { roundNo: 2, receivedDate: '2026-06-01', lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 60 }] }];
  const pos = [{ receivedDate: '2026-05-20', lines: [{ fgCode: 'A', qty: 40, status: 'cancelled' }] }];
  assert.equal(detectFlags(rounds, pos, []).find((f) => f.month === '2026-07').kind, 'drop');
});

test('detectFlags: ทำทุกคู่รอบ (backfill รอบกลางแล้วออกธงของทรานสิชันที่เกี่ยว)', () => {
  const rounds = [
    { roundNo: 1, receivedDate: '2026-05-01', lines: [{ fgCode: 'A', month: '2026-07', qty: 100 }] },
    { roundNo: 2, receivedDate: '2026-06-01', lines: [{ fgCode: 'A', month: '2026-07', qty: 30 }] }, // ลด 70 (ไม่มี PO)
    { roundNo: 3, receivedDate: '2026-07-01', lines: [{ fgCode: 'A', month: '2026-07', qty: 40 }] }, // เพิ่ม
  ];
  const flags = detectFlags(rounds, [], []);
  const r2drop = flags.find((f) => f.roundNo === 2 && f.kind === 'drop');
  assert.equal(r2drop.drop, 70); // ทรานสิชัน 1→2 ออกธง (เดิมออกแค่รอบล่าสุด)
});

test('detectFlags: month vanished + reappeared elsewhere → shift_suspect', () => {
  const rounds = [
    { roundNo: 1, receivedDate: '2026-05-01', lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }] },
    { roundNo: 2, receivedDate: '2026-06-01', lines: [{ fgCode: 'A', month: '2026-07', qty: 100 }] },
  ];
  const flags = detectFlags(rounds, [], []);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].kind, 'shift_suspect');
  assert.deepEqual([flags[0].month, flags[0].shiftToMonth], ['2026-06', '2026-07']);
});

test('detectFlags: locked cell whose effective FC differs → lockedBreak', () => {
  const rounds = [{ roundNo: 1, coverMonths: ['2026-06'], lines: [{ fgCode: 'A', month: '2026-06', qty: 80 }] }];
  const flags = detectFlags(rounds, [], [{ fgCode: 'A', month: '2026-06', lockedQty: 100 }]);
  const lb = flags.find((f) => f.kind === 'lockedBreak');
  assert.equal(lb.prevQty, 100);
  assert.equal(lb.newQty, 80);
});

// ── material / lead-time ──────────────────────────────────────────────
const NO_HOLIDAYS = new Set(); // weekends still skipped by addBusinessDays

test('leadDaysFor: in-FC = 60, out-of-FC = 90 working days', () => {
  assert.equal(leadDaysFor(true), LEAD_IN_FC);
  assert.equal(leadDaysFor(false), LEAD_OUT_FC);
  assert.equal(LEAD_IN_FC, 60);
  assert.equal(LEAD_OUT_FC, 90);
});

test('recommendedReadyDate: null-safe, valid date, and 90d is later than 60d', () => {
  assert.equal(recommendedReadyDate(null, 60, NO_HOLIDAYS), null);
  const d60 = recommendedReadyDate('2026-01-01', 60, NO_HOLIDAYS);
  const d90 = recommendedReadyDate('2026-01-01', 90, NO_HOLIDAYS);
  assert.match(d60, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(d90 > d60); // more lead → later ready date
});

test('materialView: in-FC→60d, out-FC→90d; lateVsDue & ourSlip flags', () => {
  const inFc = materialView({ dueDate: '2026-12-31' }, 100, '2026-01-01', NO_HOLIDAYS);
  assert.equal(inFc.inForecast, true);
  assert.equal(inFc.leadDays, 60);
  assert.equal(inFc.lateVsDue, false); // ready (~Mar) before Dft Dec due

  const outFc = materialView({ dueDate: '2026-01-15' }, 0, '2026-01-01', NO_HOLIDAYS);
  assert.equal(outFc.inForecast, false);
  assert.equal(outFc.leadDays, 90);
  assert.equal(outFc.lateVsDue, true); // ready (~May) after Jan-15 due → late because PO/lead

  const slipped = materialView({ dueDate: '2026-12-31', actualDeliveredDate: '2026-12-31' }, 100, '2026-01-01', NO_HOLIDAYS);
  assert.equal(slipped.ourSlip, true); // delivered Dec-31, well after the ~Mar ready date
  const onTime = materialView({ dueDate: '2026-12-31', actualDeliveredDate: '2026-02-02' }, 100, '2026-01-01', NO_HOLIDAYS);
  assert.equal(onTime.ourSlip, false);
});

// ── forecastClient (the API-payload → comparison bridge) ──────────────
const ROUNDS = [
  { id: 'r1', roundNo: 1, lines: [
    { fgCode: 'A', month: '2026-01', qty: 100 },
    { fgCode: 'A', month: '2026-02', qty: 100 },
    { fgCode: 'B', month: '2026-01', qty: 500 },
  ] },
  { id: 'r2', roundNo: 2, lines: [
    { fgCode: 'A', month: '2026-02', qty: 120 }, // A grew
    { fgCode: 'B', month: '2026-01', qty: 300 }, // B dropped (peak warning)
  ] },
];

test('roundTotal / roundSkuCount aggregate a round', () => {
  assert.equal(roundTotal(ROUNDS[0]), 700);
  assert.equal(roundSkuCount(ROUNDS[0]), 2);
});

test('compareRounds: first round has no previous', () => {
  const c = compareRounds(ROUNDS, 0);
  assert.equal(c.hasPrev, false);
  assert.equal(c.targetRoundNo, 1);
});

test('compareRounds: round 2 vs 1 — B flagged as peak drop, sorted first', () => {
  const c = compareRounds(ROUNDS, 1);
  assert.equal(c.hasPrev, true);
  assert.deepEqual([c.prevRoundNo, c.targetRoundNo], [1, 2]);
  const b = c.perSku.find((s) => s.fgCode === 'B');
  assert.equal(b.peak.hasWarning, true);          // 500 → 300 on the same month
  assert.equal(b.net, -200);
  // peak-drop SKUs sort ahead of non-warning ones
  assert.equal(c.perSku[0].fgCode, 'B');
  const a = c.perSku.find((s) => s.fgCode === 'A');
  assert.equal(a.peak?.hasWarning ?? false, false); // A's active-month total grew
});

// ── reconcileClient (FC × PO matrix) ──────────────────────────────────
const RC_ROUNDS = [
  { roundNo: 1, receivedDate: '2026-05-01', lines: [
    { fgCode: 'A', month: '2026-06', qty: 100, productName: 'Alpha' },
    { fgCode: 'A', month: '2026-07', qty: 100, productName: 'Alpha' },
  ] },
  { roundNo: 2, receivedDate: '2026-06-01', lines: [
    { fgCode: 'A', month: '2026-07', qty: 150, productName: 'Alpha' }, // latest restates Jul
  ] },
];
const RC_POS = [
  { poNumber: 'PO-1', lines: [
    { fgCode: 'A', deliveryMonth: '2026-06', qty: 100, status: 'open' }, // matches Jun FC
    { fgCode: 'A', deliveryMonth: '2026-08', qty: 50, status: 'open' },  // นอก FC (no FC Aug)
    { fgCode: 'A', deliveryMonth: '2026-07', qty: 999, status: 'cancelled' }, // ignored
  ] },
];

test('buildReconMatrix: effective FC = latest round per month; PO matched by deliveryMonth', () => {
  const m = buildReconMatrix(RC_ROUNDS, RC_POS);
  assert.deepEqual(m.months, ['2026-06', '2026-07', '2026-08']);
  const a = m.rows.find((r) => r.fgCode === 'A');
  assert.equal(a.cells['2026-06'].fcQty, 100);
  assert.equal(a.cells['2026-06'].poQty, 100);
  assert.equal(a.cells['2026-06'].status, 'match');     // 100 = 100
  assert.equal(a.cells['2026-07'].fcQty, 150);          // round 2 restated Jul
  assert.equal(a.cells['2026-07'].status, 'pending');   // FC 150, no PO (cancelled ignored)
  assert.equal(a.cells['2026-08'].status, 'unforecasted'); // PO 50, no FC
});

// โมเดล peak-matching (มติ 2026-07-23): FC ไม่หายเองเพราะรอบใหม่ไม่พูดถึง —
// ยึด peak ที่เคยพยากรณ์ ให้ PO มาจับคู่; ลดเมื่อคนยืนยันตัด/เลื่อน (confirmedCuts).
test('buildReconMatrix peak: รอบใหม่ตัด SKU ออกจากเดือน → ยึด peak FC (รอ PO) ไม่ auto-cancel', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-04'], lines: [{ fgCode: 'A', month: '2026-04', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-04', '2026-05'], lines: [{ fgCode: 'A', month: '2026-05', qty: 100 }] },
  ];
  const a = buildReconMatrix(rounds, []).rows.find((r) => r.fgCode === 'A');
  assert.equal(a.cells['2026-04'].fcQty, 100);         // peak คงไว้ — ไม่หายเพราะรอบ2 ไม่พูดถึง
  assert.equal(a.cells['2026-04'].status, 'pending');  // FC100 PO0 → รอ PO
  assert.equal(a.cells['2026-05'].fcQty, 100);
});

test('buildReconMatrix peak: PO มาชน FC อดีตที่รอบใหม่ตัดออก → "ครบ" ไม่ใช่ "นอก FC"', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-04'], lines: [{ fgCode: 'A', month: '2026-04', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-05'], lines: [{ fgCode: 'A', month: '2026-05', qty: 50 }] }, // Apr หายเพราะ PO มา
  ];
  const pos = [{ poNumber: 'P1', lines: [{ fgCode: 'A', deliveryMonth: '2026-04', qty: 100, status: 'open' }] }];
  const a = buildReconMatrix(rounds, pos).rows.find((r) => r.fgCode === 'A');
  assert.equal(a.cells['2026-04'].fcQty, 100);       // ยึด FC เดิม (peak) ไม่ใช่ 0
  assert.equal(a.cells['2026-04'].poQty, 100);
  assert.equal(a.cells['2026-04'].status, 'match');  // ล็อกคู่ FC=PO → ครบ
});

test('buildReconMatrix peak: confirmedCuts ลด peak (คนยืนยันตัด/เลื่อน)', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-04'], lines: [{ fgCode: 'A', month: '2026-04', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-04', '2026-05'], lines: [{ fgCode: 'A', month: '2026-05', qty: 100 }] },
  ];
  // ยังไม่ยืนยัน: Apr ยึด peak 100 (รอ PO) → รวม 200
  assert.equal(buildReconMatrix(rounds, []).rows.find((r) => r.fgCode === 'A').fcTotal, 200);
  // ยืนยัน Apr ตัด/เลื่อนออก 100 → Apr=0, รวม=100
  const cuts = new Map([['A||2026-04', 100]]);
  const a = buildReconMatrix(rounds, [], [], cuts).rows.find((r) => r.fgCode === 'A');
  assert.equal(a.cells['2026-04'].fcQty, 0);
  assert.equal(a.fcTotal, 100);
});

test('buildReconMatrix coverage: move FC (PO fixed) — source becomes covered, target matches', () => {
  const rounds = [{ roundNo: 1, coverMonths: ['2026-06', '2026-07'], lines: [
    { fgCode: 'A', month: '2026-06', qty: 100 }, { fgCode: 'A', month: '2026-07', qty: 100 },
  ] }];
  const pos = [{ poNumber: 'P1', lines: [{ fgCode: 'A', deliveryMonth: '2026-07', qty: 200, status: 'open' }] }];

  // Without coverage: Jun pending (FC100/PO0), Jul over (FC100/PO200)
  const before = buildReconMatrix(rounds, pos).rows.find((r) => r.fgCode === 'A');
  assert.equal(before.cells['2026-06'].status, 'pending');
  assert.equal(before.cells['2026-07'].status, 'over');

  // ชดเชย = ย้าย FC 100 จาก Jun → Jul (PO อยู่กับที่ที่ Jul). Jul FC 200 = PO 200; Jun FC ถูกดึงออก
  const cov = [{ fgCode: 'A', sourceMonth: '2026-06', targetMonth: '2026-07', qty: 100 }];
  const after = buildReconMatrix(rounds, pos, cov).rows.find((r) => r.fgCode === 'A');
  assert.equal(after.cells['2026-06'].status, 'covered');   // FC moved out → ชดเชย
  assert.equal(after.cells['2026-06'].fcQty, 0);
  assert.equal(after.cells['2026-06'].originalFc, 100);     // ยอด FC เดิมเก็บไว้ตรวจ
  assert.equal(after.cells['2026-06'].coverageOut, 100);
  assert.equal(after.cells['2026-06'].poQty, 0);            // PO ไม่ขยับ
  assert.equal(after.cells['2026-07'].status, 'match');     // FC เท่ากับ PO แล้ว
  assert.equal(after.cells['2026-07'].fcQty, 200);
  assert.equal(after.cells['2026-07'].coverageIn, 100);
  assert.equal(after.cells['2026-07'].poQty, 200);          // PO ไม่ขยับ
});

test('buildReconMatrix: แบ่งส่ง — PO เดิมนับ shippedQty, PO ยอดเหลือนับเต็ม (ไม่นับซ้ำ)', () => {
  const rounds = [{ roundNo: 1, coverMonths: ['2026-07'], lines: [{ fgCode: 'A', month: '2026-07', qty: 1000 }] }];
  const pos = [
    { poNumber: 'A', lines: [{ fgCode: 'A', deliveryMonth: '2026-07', qty: 1000, shippedQty: 600 }] }, // เดิม ส่งจริง 600
    { poNumber: 'B', splitFromPoId: 'A', lines: [{ fgCode: 'A', deliveryMonth: '2026-07', qty: 400 }] },  // ยอดเหลือ 400
  ];
  const row = buildReconMatrix(rounds, pos).rows.find((r) => r.fgCode === 'A');
  assert.equal(row.cells['2026-07'].poQty, 1000); // 600 + 400 (ไม่ใช่ 1400)
  assert.equal(row.cells['2026-07'].status, 'match');
});

test('cellDetail lists contributing FC rounds and active PO lines', () => {
  const d = cellDetail(RC_ROUNDS, RC_POS, 'A', '2026-07');
  assert.deepEqual(d.fcs.map((f) => f.roundNo), [1, 2]); // both rounds had Jul
  assert.equal(d.poLines.length, 1);                      // cancelled excluded? no — detail shows all; but only 1 Jul PO exists
});

test('cellDetail poLines carry PO doc date + received date (for docs tab)', () => {
  const pos = [{ poNumber: 'PO-9', id: 'p9', docDate: '2026-06-20', receivedDate: '2026-06-25', lines: [
    { fgCode: 'A', deliveryMonth: '2026-07', qty: 100, status: 'open', dueDate: '2026-07-10' },
  ] }];
  const d = cellDetail([], pos, 'A', '2026-07');
  assert.equal(d.poLines.length, 1);
  assert.equal(d.poLines[0].docDate, '2026-06-20');
  assert.equal(d.poLines[0].receivedDate, '2026-06-25');
  assert.equal(d.poLines[0].poId, 'p9');
});

// ── predict.js (shift prediction & coverage suggestion) ─────────────────────

test('addMonths / urgencyOf helpers', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01'); // wraps the year
  assert.equal(addMonths('2026-03', 1), '2026-04');
  assert.equal(urgencyOf(10), 'high');
  assert.equal(urgencyOf(45), 'medium');
  assert.equal(urgencyOf(90), 'low');
});

test('avgShiftForSku learns the shift distance from round history, defaults +1', () => {
  // No history (one round) → default +1.
  const one = [{ roundNo: 1, lines: [{ fgCode: 'A', month: '2026-01', qty: 100 }] }];
  assert.equal(avgShiftForSku(one, 'A'), 1);

  // Two rounds: Jan(100) → Mar(100) is a +2 shift (qty within 50%).
  const two = [
    { roundNo: 1, coverMonths: ['2026-01', '2026-02', '2026-03'], lines: [{ fgCode: 'A', month: '2026-01', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-01', '2026-02', '2026-03'], lines: [{ fgCode: 'A', month: '2026-03', qty: 100 }] },
  ];
  assert.equal(avgShiftForSku(two, 'A'), 2);
});

test('predictShifts predicts ONLY for SKUs with real shift history (first round stays quiet)', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-06', '2026-07', '2026-08'], lines: [
      { fgCode: 'A', month: '2026-06', qty: 100, productName: 'Alpha' },
      { fgCode: 'A', month: '2026-07', qty: 100 },
      { fgCode: 'B', month: '2026-08', qty: 50, productName: 'Bravo' }, // B never moves
    ] },
    { roundNo: 2, coverMonths: ['2026-06', '2026-07', '2026-08'], lines: [
      { fgCode: 'A', month: '2026-07', qty: 100 },
      { fgCode: 'A', month: '2026-08', qty: 100 }, // A: Jun→Aug shift (+2)
      { fgCode: 'B', month: '2026-08', qty: 50 },
    ] },
  ];
  const preds = predictShifts(rounds, [], { today: '2026-07-01' });
  // A has shifted before → its still-pending month is predicted, target = +2.
  assert.ok(preds.has('A||2026-08'));
  assert.equal(preds.get('A||2026-08').toMonth, '2026-10');
  assert.equal(preds.get('A||2026-08').avgShift, 2);
  assert.equal(preds.get('A||2026-08').productName, 'Alpha');
  // B never shifted → NO prediction even though it's pending (this is the fix).
  assert.ok(!preds.has('B||2026-08'));

  // A single first round (no history at all) predicts nothing.
  assert.equal(predictShifts([rounds[0]], [], { today: '2026-07-01' }).size, 0);
});

test('predictShifts skips locked cells and returns empty without a clock', () => {
  const rounds = [
    { roundNo: 1, coverMonths: ['2026-06', '2026-07'], lines: [{ fgCode: 'A', month: '2026-06', qty: 100 }] },
    { roundNo: 2, coverMonths: ['2026-06', '2026-07'], lines: [{ fgCode: 'A', month: '2026-07', qty: 100 }] }, // Jun→Jul (+1)
  ];
  assert.ok(predictShifts(rounds, [], { today: '2026-06-15' }).has('A||2026-07')); // pending + history
  const locked = predictShifts(rounds, [], { today: '2026-06-15', locks: [{ fgCode: 'A', month: '2026-07' }] });
  assert.ok(!locked.has('A||2026-07')); // locked → skipped
  assert.equal(predictShifts(rounds, [], {}).size, 0); // no today → pure no-op
});

test('suggestCoverage: target needs FC (PO>FC) → pull FC from months with FC>PO, nearest first', () => {
  // Sep has PO 200 but no FC (need 200). Aug & Dec have FC without PO (spare) → sources.
  const rounds = [{
    roundNo: 1, coverMonths: ['2026-08', '2026-09', '2026-12'],
    lines: [
      { fgCode: 'A', month: '2026-08', qty: 100 }, // FC 100, no PO → spare 100
      { fgCode: 'A', month: '2026-12', qty: 100 }, // FC 100, no PO → spare 100
    ],
  }];
  const pos = [{ poNumber: 'PO1', lines: [{ fgCode: 'A', deliveryMonth: '2026-09', qty: 200 }] }]; // Sep need 200
  const matrix = buildReconMatrix(rounds, pos);
  const s = suggestCoverage(matrix, 'A', '2026-09');
  assert.deepEqual(s.map((x) => x.sourceMonth), ['2026-08', '2026-12']); // Aug (1mo) before Dec (3mo)
  assert.equal(s[0].canCover, 100);
});

test('suggestCoverageTargets: month has FC>PO (spare) → send FC to months with PO>FC, nearest+capped', () => {
  // Aug FC 300 / PO 100 → spare 200. Sep PO 200 no FC (need 200) → send 200 to Sep.
  const rounds = [{
    roundNo: 1, coverMonths: ['2026-08', '2026-09'],
    lines: [{ fgCode: 'A', month: '2026-08', qty: 300 }],
  }];
  const pos = [{ poNumber: 'PO1', lines: [
    { fgCode: 'A', deliveryMonth: '2026-08', qty: 100 }, // Aug FC300/PO100 → spare 200
    { fgCode: 'A', deliveryMonth: '2026-09', qty: 200 }, // Sep FC0/PO200 → need 200
  ] }];
  const matrix = buildReconMatrix(rounds, pos);
  const t = suggestCoverageTargets(matrix, 'A', '2026-08');
  assert.deepEqual(t, [{ targetMonth: '2026-09', use: 200 }]);
  // Sep has no spare FC → nothing to send.
  assert.deepEqual(suggestCoverageTargets(matrix, 'A', '2026-09'), []);
});

// roundOrder: roundNo must equal chronological order by receivedDate (backfill).
test('desiredRoundNumbers: already chronological → no changes', () => {
  const rounds = [
    { id: 'a', roundNo: 1, receivedDate: '2026-05-01' },
    { id: 'b', roundNo: 2, receivedDate: '2026-06-01' },
  ];
  assert.deepEqual(desiredRoundNumbers(rounds), []);
});

test('desiredRoundNumbers: backfilled older round slots in front, later rounds shift up', () => {
  const rounds = [
    { id: 'a', roundNo: 1, receivedDate: '2026-05-01' },
    { id: 'b', roundNo: 2, receivedDate: '2026-06-01' },
    { id: 'old', roundNo: 3, receivedDate: '2026-03-01' }, // typed in last, happened first
  ];
  assert.deepEqual(desiredRoundNumbers(rounds), [
    { id: 'old', from: 3, to: 1 },
    { id: 'a', from: 1, to: 2 },
    { id: 'b', from: 2, to: 3 },
  ]);
});

test('desiredRoundNumbers: same receivedDate keeps entry order (stable tie-break)', () => {
  const rounds = [
    { id: 'a', roundNo: 1, receivedDate: '2026-05-01' },
    { id: 'b', roundNo: 2, receivedDate: '2026-05-01' },
    { id: 'c', roundNo: 3, receivedDate: '2026-04-01' },
  ];
  assert.deepEqual(desiredRoundNumbers(rounds), [
    { id: 'c', from: 3, to: 1 },
    { id: 'a', from: 1, to: 2 },
    { id: 'b', from: 2, to: 3 },
  ]);
});

test('desiredRoundNumbers: closes the gap a deleted round leaves', () => {
  const rounds = [
    { id: 'a', roundNo: 1, receivedDate: '2026-04-01' },
    { id: 'c', roundNo: 4, receivedDate: '2026-06-01' }, // rounds 2–3 deleted
  ];
  assert.deepEqual(desiredRoundNumbers(rounds), [{ id: 'c', from: 4, to: 2 }]);
});

// ── unit toggle ชิ้น⇄ลัง: สลับหน่วยแล้วเลขต้องแปลงตาม (คงจำนวนชิ้นจริง) ──────
import { convertEntryUnit } from './units.js';

test('convertEntryUnit: piece→case หารชิ้นต่อลัง, case→piece คูณกลับ', () => {
  assert.equal(convertEntryUnit('120', 'piece', 'case', 12), '10');
  assert.equal(convertEntryUnit('10', 'case', 'piece', 12), '120');
});

test('convertEntryUnit: เศษลังเก็บทศนิยม แล้วสลับกลับได้จำนวนชิ้นเดิม (round-trip)', () => {
  const asCase = convertEntryUnit('100', 'piece', 'case', 12); // 8.3333
  assert.equal(asCase, '8.3333');
  assert.equal(convertEntryUnit(asCase, 'case', 'piece', 12), '100'); // กลับมาเท่าเดิม
});

test('convertEntryUnit: หน่วยเดิม/ค่าว่าง/ศูนย์/ไม่รู้ชิ้นต่อลัง → คงค่าเดิม', () => {
  assert.equal(convertEntryUnit('120', 'piece', 'piece', 12), '120');
  assert.equal(convertEntryUnit('', 'piece', 'case', 12), '');
  assert.equal(convertEntryUnit('0', 'piece', 'case', 12), '0');
  assert.equal(convertEntryUnit('120', 'piece', 'case', null), '120'); // ไม่รู้ ppc → ไม่แปลง
  assert.equal(convertEntryUnit('120', 'piece', 'case', 0), '120');
});

test('convertEntryUnit: round-trip กับ ppc หลายค่า ได้ชิ้นเดิมเสมอ', () => {
  for (const ppc of [3, 6, 7, 13, 24]) {
    for (const pieces of [100, 250, 1000, 999999]) {
      const back = convertEntryUnit(convertEntryUnit(String(pieces), 'piece', 'case', ppc), 'case', 'piece', ppc);
      assert.equal(back, String(pieces), `ppc=${ppc} pieces=${pieces}`);
    }
  }
});

// ── display unit toggle (Matrix/กระทบยอด) ─────────────────────────────
import { displayQty, counterpartText } from './units.js';

test('displayQty: ชิ้น=ตามเดิม, ลัง=หารชิ้นต่อลัง (เศษ 2 ตำแหน่ง)', () => {
  assert.equal(displayQty(1440, 12, 'piece'), '1,440');
  assert.equal(displayQty(1440, 12, 'case'), '120');
  assert.equal(displayQty(100, 12, 'case'), '8.33'); // เศษลัง
});

test('displayQty: ค่า 0/ว่าง → · เมื่อ dot, ไม่รู้ชิ้นต่อลัง → คงเป็นชิ้น', () => {
  assert.equal(displayQty(0, 12, 'case', { dot: true }), '·');
  assert.equal(displayQty(0, 12, 'piece'), '0');
  assert.equal(displayQty(500, null, 'case'), '500'); // ไม่มี ppc → โชว์ชิ้น
});

test('counterpartText: piece→ลัง, case→ชิ้น, null เมื่อแปลงไม่ได้/0', () => {
  assert.equal(counterpartText(1440, 12, 'piece'), '120 ลัง');
  assert.equal(counterpartText(1440, 12, 'case'), '1,440 ชิ้น');
  assert.equal(counterpartText(500, null, 'piece'), null);
  assert.equal(counterpartText(0, 12, 'piece'), null);
});
