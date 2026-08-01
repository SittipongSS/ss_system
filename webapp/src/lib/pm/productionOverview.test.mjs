import test from 'node:test';
import assert from 'node:assert/strict';
import {
  productionCounts,
  productionAttention,
  capacityGlance,
  runningToday,
} from './productionOverview.js';

const LINE = { id: 'L1', name: 'ไลน์ 1', code: 'PL-1', capacityPerDay: 100, unit: 'ขวด', isActive: true };

test('productionCounts ไม่นับใบที่ยกเลิก', () => {
  const counts = productionCounts([
    { status: 'draft' }, { status: 'draft' },
    { status: 'planned' }, { status: 'in_progress' },
    { status: 'done' }, { status: 'cancelled' },
  ]);
  assert.deepEqual(counts, { draft: 2, planned: 1, running: 1, done: 1 });
});

test('productionAttention ดันงานร่างขึ้นรายการเสมอ แม้ไม่มีปัญหาอื่น', () => {
  const rows = productionAttention([{ id: 'J1', code: 'PB-1', status: 'draft', qty: 10 }], []);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].reasons.map((r) => r.kind), ['unplanned']);
});

test('productionAttention ไม่แตะงานที่จบหรือยกเลิกแล้ว', () => {
  const rows = productionAttention([
    { id: 'J1', status: 'done', qty: 10 },
    { id: 'J2', status: 'cancelled', qty: 10 },
  ], []);
  assert.equal(rows.length, 0);
});

test('productionAttention คืนทุกเหตุผลของใบเดียว ไม่ใช่เหตุผลแรก', () => {
  // วางเริ่ม 10 ก.ค. แต่ของครบ 20 ก.ค. → materials · จบช้ากว่ากำหนดส่ง → due
  const job = {
    id: 'J1', code: 'PB-1', status: 'planned', lineId: 'L1', qty: 500,
    plannedStart: '2026-07-10', dueDate: '2026-07-11',
    readiness: { state: 'waiting', lastDue: '2026-07-20' },
  };
  const rows = productionAttention([job], [LINE]);
  const kinds = rows[0].reasons.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['due', 'materials']);
});

test('productionAttention เรียงใบที่มีหลายปัญหาขึ้นก่อน แล้วค่อยเรียงตามกำหนดส่ง', () => {
  const twoProblems = {
    id: 'A', code: 'PB-A', status: 'planned', lineId: 'L1', qty: 500,
    // จบ 2026-07-16 · กำหนดส่ง 07-15 → ช้า · แถมของครบหลังวันเริ่ม → 2 ปัญหา
    plannedStart: '2026-07-10', dueDate: '2026-07-15',
    readiness: { state: 'waiting', lastDue: '2026-07-20' },
  };
  const oneProblem = {
    id: 'B', code: 'PB-B', status: 'planned', lineId: 'L1', qty: 500,
    plannedStart: '2026-07-10', dueDate: '2026-07-11',
  };
  const rows = productionAttention([oneProblem, twoProblems], [LINE]);
  assert.deepEqual(rows.map((r) => r.job.id), ['A', 'B']);
});

test('productionAttention: งานที่ไม่มีกำหนดส่งไปท้าย ไม่ใช่ขึ้นหัวเพราะค่าว่างเรียงมาก่อน', () => {
  const noDue = { id: 'A', code: 'PB-A', status: 'draft', qty: 10 };
  const hasDue = { id: 'B', code: 'PB-B', status: 'draft', qty: 10, dueDate: '2026-07-05' };
  const rows = productionAttention([noDue, hasDue], []);
  assert.deepEqual(rows.map((r) => r.job.id), ['B', 'A']);
});

test('capacityGlance ไม่นับช่องที่ยังไม่กรอกกำลังเข้าตัวหาร', () => {
  const noCapLine = { id: 'L2', name: 'ไลน์ 2', code: 'PL-2', capacityPerDay: null, isActive: true };
  const jobs = [
    { id: 'J1', status: 'planned', lineId: 'L1', qty: 100, plannedStart: '2026-07-06' },
    { id: 'J2', status: 'planned', lineId: 'L2', qty: 100, plannedStart: '2026-07-06', ratePerDay: 100 },
  ];
  const g = capacityGlance(jobs, [LINE, noCapLine], { from: '2026-07-06', to: '2026-07-06' });
  // ไลน์ที่ไม่รู้กำลังถูกกันออกทั้งตัวตั้งและตัวหาร → 100/100 = 100%
  assert.equal(g.planned, 100);
  assert.equal(g.capacity, 100);
  assert.equal(g.pct, 100);
  assert.equal(g.unknownCells, 1);
});

test('capacityGlance คืน pct = null เมื่อไม่มีกำลังที่รู้เลย (ไม่ใช่ 0 หรือ Infinity)', () => {
  const noCapLine = { id: 'L2', name: 'ไลน์ 2', code: 'PL-2', capacityPerDay: null, isActive: true };
  const g = capacityGlance(
    [{ id: 'J1', status: 'planned', lineId: 'L2', qty: 50, plannedStart: '2026-07-06', ratePerDay: 50 }],
    [noCapLine],
    { from: '2026-07-06', to: '2026-07-06' },
  );
  assert.equal(g.pct, null);
});

test('capacityGlance ไม่นับงานร่าง — ร่างยังไม่กินกำลังผลิต', () => {
  const g = capacityGlance(
    [{ id: 'J1', status: 'draft', lineId: 'L1', qty: 100, plannedStart: '2026-07-06' }],
    [LINE],
    { from: '2026-07-06', to: '2026-07-06' },
  );
  assert.equal(g.planned, 0);
});

test('runningToday คืนไลน์ที่ว่างด้วย — ที่ว่างคือข้อมูล ไม่ใช่ช่องที่ควรหาย', () => {
  const idle = { id: 'L2', name: 'ไลน์ 2', code: 'PL-2', capacityPerDay: 80, isActive: true };
  const rows = runningToday(
    [{ id: 'J1', code: 'PB-1', status: 'in_progress', lineId: 'L1', qty: 40, plannedStart: '2026-07-06' }],
    [LINE, idle],
    { todayIso: '2026-07-06' },
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.line.id === 'L1').planned, 40);
  assert.equal(rows.find((r) => r.line.id === 'L2').planned, 0);
});

test('runningToday ตัดไลน์ที่ปิดใช้งานออก', () => {
  const off = { id: 'L3', name: 'ไลน์เก่า', code: 'PL-3', capacityPerDay: 50, isActive: false };
  const rows = runningToday([], [LINE, off], { todayIso: '2026-07-06' });
  assert.deepEqual(rows.map((r) => r.line.id), ['L1']);
});
