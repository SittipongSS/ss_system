import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSalesReport } from './reportSummary.js';
import { parseReportPeriod } from './reportPeriod.js';

/* ตัวคิดสรุปของรายงานยอดขาย — จอกับไฟล์ Excel ใช้ตัวเดียวกัน (2026-09-22)
   ล็อก: เดือนที่ยังไม่จบไม่เข้าผลรวม · %/ส่วนต่างเทียบเฉพาะเดือนที่มีเป้า (ทั้งบริษัทและรายแถว) ·
   เดือนเดียวทบยอดจากเดือนนำ · ช่วงวันนับทุกเดือน · รออนุมัติไม่ปนขายจริง */

const NOW = new Date('2026-09-22T05:00:00Z'); // 12:00 ไทย
const TODAY = '2026-09-22';

const row = (key, extra, target, actual, history) => ({
  key, scope: extra.scope || 'owner', ownerId: extra.ownerId || null, ownerName: extra.ownerName || null,
  team: extra.team || null, target, actual, history: history || target.map(() => 0),
});

test('เดือนเดียว (เดือนที่จบแล้ว): ทบยอดมาจากเดือนนำในปีเดียวกัน', () => {
  const period = parseReportPeriod({ mode: 'month', month: '2026-08' }, { today: TODAY });
  // แกน ม.ค.–ส.ค. · ก.ค. ขาด 100 ⇒ ส.ค. ต้องปิด 1,000 + 100
  const target = [100, 100, 100, 100, 100, 100, 1000, 1000];
  const actual = [100, 100, 100, 100, 100, 100, 900, 1200];
  const data = { period, axis: period.axis, lead: period.lead, company: row('company', { scope: 'company' }, target, actual), teams: [], people: [] };
  const s = summarizeSalesReport(data, { now: NOW });
  assert.deepEqual(s.months, ['2026-08']);
  assert.equal(s.monthRows.length, 1);
  assert.equal(s.monthRows[0].carry, 100);
  assert.equal(s.monthRows[0].mustClose, 1100);
  // แถบตัวเลขนับเฉพาะเดือนที่โชว์ — ไม่เอาเดือนนำมาบวก
  assert.equal(s.metrics.actual, 1200);
  assert.equal(s.metrics.target, 1000);
});

test('เดือนเดียวของเดือนนี้: ไม่เข้าผลรวม แต่มีตัวเลข "ระหว่างเดือน"', () => {
  const period = parseReportPeriod({ mode: 'month', month: '2026-09' }, { today: TODAY });
  const target = [...Array(8).fill(0), 1000];
  const actual = [...Array(8).fill(0), 400];
  const data = { period, axis: period.axis, lead: period.lead, company: row('company', { scope: 'company' }, target, actual), teams: [], people: [] };
  const s = summarizeSalesReport(data, { now: NOW });
  assert.equal(s.metrics.countedMonths, 0);
  assert.equal(s.metrics.pct, null);
  assert.deepEqual(s.metrics.open, { months: ['2026-09'], target: 1000, actual: 400 });
  assert.equal(s.monthRows[0].closed, false);
  assert.equal(s.monthRows[0].pct, null);
});

test('เดือนที่ยังวิ่งอยู่: ต้องปิด = เป้า + ยอดที่ขาดของเดือนที่จบแล้ว (ตรงกับแผงทบยอดของแท็บผลงานขาย)', () => {
  const period = parseReportPeriod({ mode: 'month', month: '2026-09' }, { today: TODAY });
  const target = [...Array(8).fill(100), 1000];
  const actual = [...Array(7).fill(100), 50, 400];   // ส.ค. ขาด 50
  const data = { period, axis: period.axis, lead: period.lead, company: row('company', { scope: 'company' }, target, actual), teams: [], people: [] };
  const [sep] = summarizeSalesReport(data, { now: NOW }).monthRows;
  assert.equal(sep.carry, 50);
  assert.equal(sep.mustClose, 1050);
  assert.equal(sep.diff, null);   // ยังไม่จบ ไม่คิดส่วนต่าง/%
});

test('ทั้งปี: %/ส่วนต่างเทียบเฉพาะเดือนที่มีเป้า', () => {
  const period = parseReportPeriod({ mode: 'year', year: '2025' }, { today: TODAY });
  const target = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000];
  const actual = Array(12).fill(1000);
  const data = { period, axis: period.axis, lead: 0, company: row('company', { scope: 'company' }, target, actual), teams: [], people: [] };
  const s = summarizeSalesReport(data, { now: NOW });
  assert.equal(s.metrics.actual, 12000);
  assert.equal(s.metrics.target, 1000);
  assert.equal(s.metrics.targetMonths, 1);
  assert.equal(s.metrics.pct, 100); // ไม่ใช่ 1,200%
  assert.equal(s.metrics.diff, 0);
});

test('ช่วงวัน: นับทุกเดือน (เป้าปันแล้ว) · ป้ายปันตามวัน · ไม่มีทบยอด', () => {
  const period = parseReportPeriod({ mode: 'range', from: '2026-08-15', to: '2026-09-30' }, { today: TODAY });
  const data = {
    period, axis: period.axis, lead: 0, targetFactor: [17 / 31, 22 / 30],
    company: row('company', { scope: 'company' }, [548.39, 733.33], [100, 900]),
    teams: [], people: [],
  };
  const s = summarizeSalesReport(data, { now: NOW });
  assert.equal(s.metrics.countedMonths, 2);
  assert.equal(s.monthRows[0].carry, 0);
  assert.deepEqual(s.monthRows[0].prorated, { days: 17, total: 31 });
  assert.deepEqual(s.monthRows[1].prorated, { days: 22, total: 30 });
  assert.equal(s.monthRows[1].closed, true);
});

test('🐞 รายคน: %/ส่วนต่างเทียบเฉพาะเดือนที่แถวนั้นมีเป้า · แถวรวมไม่เอาขายของแถวไม่มีเป้ามาหักเป้า', () => {
  const period = parseReportPeriod({ mode: 'year', year: '2026' }, { today: TODAY });
  const z = () => Array(12).fill(0);
  const tA = z(); const aA = z(); tA[7] = 1000; aA[6] = 500; aA[7] = 800; // ก.ค. ไม่มีเป้า · ส.ค. มีเป้า
  const tB = z(); const aB = z(); aB[7] = 300;                          // ไม่มีเป้าเลย
  const people = [
    row('KA:u1', { ownerId: 'u1', ownerName: 'A', team: 'KA' }, tA, aA),
    row('KA:u2', { ownerId: 'u2', ownerName: 'B', team: 'KA' }, tB, aB),
  ];
  const company = row('company', { scope: 'company' }, z(), aA.map((v, i) => v + aB[i]));
  const s = summarizeSalesReport({ period, axis: period.axis, lead: 0, company, teams: [], people }, { now: NOW });
  const a = s.people.rows.find((r) => r.ownerId === 'u1');
  assert.equal(a.actual, 1300);       // ขายจริงทุกเดือนที่แยกยอด
  assert.equal(a.cmpActual, 800);     // เทียบเฉพาะ ส.ค.
  assert.equal(a.pct, 80);            // ไม่ใช่ 130%
  assert.equal(a.diff, -200);
  const b = s.people.rows.find((r) => r.ownerId === 'u2');
  assert.equal(b.pct, null);
  assert.equal(b.diff, null);
  assert.equal(s.people.total.diff, -200); // ไม่ใช่ (1300 + 300) − 1000
  assert.equal(s.people.total.pct, 80);
  assert.equal(s.people.total.count, 2);
});

test('รออนุมัติ: จับเข้าแถว · ไม่ปนขายจริง · ส่วนที่ไม่มีแถวบอกแยก', () => {
  const period = parseReportPeriod({ mode: 'month', month: '2026-09' }, { today: TODAY });
  const z = () => Array(9).fill(0);
  const pendingApproval = {
    month: '2026-09', amount: 700, count: 3,
    byOwner: [{ key: 'KA:u1', ownerId: 'u1', ownerName: 'A', team: 'KA', amount: 500, count: 2 }],
    byTeam: [{ key: 'team:KA', team: 'KA', amount: 500, count: 2 }],
    noTeam: { key: 'team:-', team: null, amount: 0, count: 0 },
    unassigned: { amount: 200, count: 1 },
    orders: [],
  };
  const s = summarizeSalesReport({
    period, axis: period.axis, lead: period.lead,
    company: row('company', { scope: 'company' }, z(), z()), teams: [], people: [], pendingApproval,
  }, { now: NOW });
  assert.deepEqual(s.metrics.pendingApproval, { month: '2026-09', amount: 700, count: 3 });
  assert.equal(s.metrics.actual, 0);
  assert.deepEqual(s.monthRows[0].pending, { amount: 700, count: 3 });
  assert.equal(s.people.pendingOnly.length, 1);
  assert.deepEqual(s.people.pendingOutside, { count: 1, amount: 200 });
});

test('แถบเตือนยอดไม่ตรง: บริษัทเทียบผลรวมรายคนเฉพาะเดือนที่แยกยอด', () => {
  const period = parseReportPeriod({ mode: 'year', year: '2026' }, { today: TODAY });
  const z = () => Array(12).fill(0);
  const cA = z(); cA[6] = 1000; cA[5] = 999;
  const pA = z(); pA[6] = 900;
  const s = summarizeSalesReport({
    period, axis: period.axis, lead: 0,
    company: row('company', { scope: 'company' }, z(), cA),
    teams: [], people: [row('KA:u1', { ownerId: 'u1', team: 'KA' }, z(), pA)],
  }, { now: NOW });
  assert.deepEqual(s.splitMonths, ['2026-07']);
  assert.equal(s.reconciliation.gap, 100);
  assert.equal(s.reconciliation.mismatch, true);
});

test('🐞 ช่วงวันคลุมเดือนกรอกมือไม่ครบ: ขายจริงจากใบยังนับ แต่ไม่เทียบเป้า (ตัวโหลดตั้งเป้าเดือนนั้นเป็น 0)', () => {
  const period = parseReportPeriod({ mode: 'range', from: '2026-07-15', to: '2026-08-31' }, { today: TODAY });
  const data = {
    period, axis: period.axis, lead: 0, targetFactor: [0, 1], historyDropped: ['2026-07'],
    company: row('company', { scope: 'company' }, [0, 12000], [300, 15000]),
    teams: [], people: [],
  };
  const s = summarizeSalesReport(data, { now: NOW });
  assert.deepEqual(s.countedMonths, ['2026-07', '2026-08']);
  assert.equal(s.metrics.actual, 15300);
  assert.equal(s.metrics.target, 12000);
  assert.equal(s.metrics.pct, 125);          // เทียบเฉพาะ ส.ค. ที่มีเป้า
  assert.equal(s.monthRows[0].noDaily, true);
  assert.equal(s.monthRows[0].pct, null);
  assert.equal(s.monthRows[0].prorated, null);
});

test('ใบในเดือนที่ใช้ยอดกรอกมือ = ไม่นับ (overridden) · สมการที่มาของขายจริง · แถบเตือนรายเดือน', () => {
  const period = parseReportPeriod({ mode: 'year', year: '2026' }, { today: TODAY });
  const z = () => Array(12).fill(0);
  const cA = z(); cA[6] = 1000; cA[7] = 500;
  const hist = z(); hist[6] = 1;
  const pA = z(); pA[6] = 900; pA[7] = 500;
  const orders = [
    { id: 'a', month: '2026-07', amount: 40, ownerId: 'u1' },
    { id: 'b', month: '2026-08', amount: 500, ownerId: 'u1' },
  ];
  const s = summarizeSalesReport({
    period, axis: period.axis, lead: 0, orders,
    company: row('company', { scope: 'company' }, z(), cA, hist),
    teams: [], people: [row('KA:u1', { ownerId: 'u1', team: 'KA' }, z(), pA)],
  }, { now: NOW });
  const jul = s.monthRows[6];
  assert.equal(jul.source, 'history');
  assert.deepEqual(jul.overridden, { count: 1, amount: 40 });
  assert.equal(s.monthRows[7].orderCount, 1);
  assert.equal(s.monthRows[7].overridden, null);
  assert.deepEqual(s.sourceSplit, { history: { months: 1, amount: 1000 }, orders: { months: 1, amount: 500 } });
  const [julRec, augRec] = s.reconciliation.byMonth;
  assert.equal(julRec.mismatch, true);
  assert.equal(julRec.gap, 100);
  assert.equal(julRec.source, 'history');
  assert.equal(augRec.mismatch, false);
});
