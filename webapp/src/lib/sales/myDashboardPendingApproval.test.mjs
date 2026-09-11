// แดชบอร์ดของฉัน + ตัวช่วยวางเป้า × ยอด SO "รออนุมัติ" (มติผู้ใช้ 2026-09-11 · mig 0353)
//
// ผู้ใช้แจ้ง: "SO ที่รออนุมัติ มันกลายเป็น 0 อยากให้โชว์ยอดด้วย แต่แยกให้รู้ว่า รออนุมัติ
// กับ Actual แล้ว ทั้งระบบ" ⇒ การ์ด "ยอดปิดได้" โชว์ยอดรออนุมัติเป็นบรรทัดแยก
// ⛔ ยอดปิดได้ · ขาดอีก/เกินเป้า · % ที่ปิดได้ ยังเป็น Actual ล้วน
// ⛔ systemActuals ของ /api/sales-planning/history ถูกตัวช่วยวางเป้าเขียนลง sales_history
//    **ถาวร** — ยอดรออนุมัติหลุดเข้าไปเมื่อไร มันกลายเป็น "ยอดจริง" ตลอดกาล
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthInPeriod, summarizeMyDeals } from './myDashboardTotals.js';

// 2026-09-11 15:00 เวลาไทย
const NOW = new Date('2026-09-11T08:00:00Z');
const opts = (extra = {}) => ({ month: '2026-09', year: null, target: 0, now: NOW, ...extra });

// รูปจริงบน prod (DL-260900474): trigger เขียน wonValue 0 + สองคีย์ cache ของ mig 0353
const pendingOnlyWon = (amount = 108000, extra = {}) => ({
  id: 'D-PENDING', stage: 'won', projectValue: amount, wonValue: 0,
  confirmedAt: '2026-08-31T20:00:00Z', // UTC ส.ค. = ไทย 1 ก.ย. — ต้องไม่มีผลกับยอดรออนุมัติ
  metadata: { actualSource: 'sale_order', wonMonth: null, soPendingAmount: amount, soPendingCount: 1 },
  ...extra,
});

test('ดีล Won ที่ SO ยังรออนุมัติล้วน: ยอดปิดได้ 0 · รออนุมัติ = ยอดใบ · ไม่อยู่ในดีลที่เปิด', () => {
  const r = summarizeMyDeals([pendingOnlyWon()], opts({ target: 500000 }));
  assert.equal(r.wonValue, 0);
  assert.equal(r.pendingApproval, 108000);
  assert.equal(r.pendingApprovalCount, 1);
  // ปิดแล้ว (Won) ⇒ ไม่กลับไปอยู่ในท่อ — ไม่งั้นนับซ้ำกับบรรทัดรออนุมัติ
  assert.equal(r.pipelineValue, 0);
  assert.equal(r.openDealsCount, 0);
  assert.equal(r.weightedForecast, 0);
  assert.ok(r.byForecast.every((b) => b.count === 0 && b.value === 0));
  // ขาดอีก = เป้า − Actual ล้วน (ไม่หักยอดที่ยังไม่มีใครอนุมัติ)
  assert.equal(r.targetGap, 500000);
});

test('ดีลเดียวมีทั้งใบอนุมัติแล้วและใบรออนุมัติ — สองกองแยกกัน ไม่บวกรวม', () => {
  const deal = {
    stage: 'won', projectValue: 300000, wonValue: 200000,
    metadata: { actualSource: 'sale_order', wonMonth: '2026-09', soPendingAmount: 100000, soPendingCount: 2 },
  };
  const r = summarizeMyDeals([deal], opts({ target: 250000 }));
  assert.equal(r.wonValue, 200000);
  assert.equal(r.pendingApproval, 100000);
  assert.equal(r.pendingApprovalCount, 2);
  // ถ้ายอดรออนุมัติไหลเข้า targetGap การ์ดจะขึ้นเขียว "เกินเป้า" ทั้งที่ Actual ยังไม่ถึงเป้า
  assert.equal(r.targetGap, 50000);
});

test('ดูเดือนที่ผ่านไปแล้ว — ยอดรออนุมัติเป็น 0 เสมอ (เดือนของมัน = เดือนปัจจุบันเวลาไทย)', () => {
  const approvedInAugust = {
    stage: 'won', wonValue: 70000,
    metadata: { actualSource: 'sale_order', wonMonth: '2026-08', soPendingAmount: 30000, soPendingCount: 1 },
  };
  const deals = [pendingOnlyWon(), approvedInAugust];
  const aug = summarizeMyDeals(deals, opts({ month: '2026-08' }));
  assert.equal(aug.wonValue, 70000, 'Actual ของ ส.ค. ยังอยู่ ส.ค.');
  assert.equal(aug.pendingApproval, 0);
  assert.equal(aug.pendingApprovalCount, 0);
  // เดือนปัจจุบัน: Actual ของใบ ส.ค. ไม่ตามมา แต่ยอดรออนุมัติของทั้งสองดีลอยู่ที่นี่
  const sep = summarizeMyDeals(deals, opts());
  assert.equal(sep.wonValue, 0);
  assert.equal(sep.pendingApproval, 138000);
  assert.equal(sep.pendingApprovalCount, 2);
  // เดือนหน้าก็ไม่เห็น — ยังไม่ถึงเดือนนั้น
  assert.equal(summarizeMyDeals(deals, opts({ month: '2026-10' })).pendingApproval, 0);
});

test('โหมดทั้งปี (ติ๊ก "ทุกเดือน") — ปีปัจจุบันรวมยอดรออนุมัติ · ปีก่อนไม่รวม', () => {
  const approvedMarch = { stage: 'won', wonValue: 40000, metadata: { actualSource: 'sale_order', wonMonth: '2026-03' } };
  const deals = [pendingOnlyWon(), approvedMarch];
  const thisYear = summarizeMyDeals(deals, opts({ year: '2026' }));
  assert.equal(thisYear.wonValue, 40000);
  assert.equal(thisYear.pendingApproval, 108000);
  const lastYear = summarizeMyDeals(deals, opts({ month: '2025-09', year: '2025' }));
  assert.equal(lastYear.pendingApproval, 0);
  assert.equal(lastYear.pendingApprovalCount, 0);
});

test('ไม่มีคีย์ cache (JS ขึ้นก่อนรัน mig 0353 / ดีลไม่มี SO รออนุมัติ) = 0', () => {
  const deals = [
    { stage: 'won', wonValue: 0 },
    { stage: 'won', wonValue: 0, metadata: {} },
    { stage: 'won', wonValue: 0, metadata: null },
  ];
  const r = summarizeMyDeals(deals, opts());
  assert.equal(r.pendingApproval, 0);
  assert.equal(r.pendingApprovalCount, 0);
  assert.equal(summarizeMyDeals([], opts()).pendingApproval, 0);
  assert.equal(summarizeMyDeals(undefined, opts()).pendingApproval, 0);
});

test('นับรออนุมัติเฉพาะดีล Won — ดีลเปิดอยู่ในท่อ (FC) อยู่แล้ว ไม่นับสองที่', () => {
  const open = { stage: 'quotation', projectValue: 20000, probability: 50, metadata: { soPendingAmount: 999, soPendingCount: 1 } };
  const r = summarizeMyDeals([open], opts());
  assert.equal(r.pendingApproval, 0);
  assert.equal(r.pendingApprovalCount, 0);
  assert.equal(r.pipelineValue, 20000);
  assert.equal(r.openDealsCount, 1);
  // ดีลเก่า in_project นับเป็น Won (isWonDeal)
  const legacy = summarizeMyDeals([{ stage: 'in_project', metadata: { soPendingAmount: 7, soPendingCount: 1 } }], opts());
  assert.equal(legacy.pendingApproval, 7);
});

test('เดือนตัดที่นาฬิกาไทย — ตี 0:30 วันที่ 1 ต.ค. (ยัง 30 ก.ย. ตาม UTC) ยอดรออนุมัติอยู่ ต.ค.', () => {
  const now = new Date('2026-09-30T17:30:00Z');
  assert.equal(summarizeMyDeals([pendingOnlyWon()], opts({ month: '2026-10', now })).pendingApproval, 108000);
  assert.equal(summarizeMyDeals([pendingOnlyWon()], opts({ month: '2026-09', now })).pendingApproval, 0);
});

test('เดือนของยอดปิดได้มาจาก wonMonthOf ตัวกลาง (ลำดับ fallback เดิมทุกขั้น)', () => {
  const at = ({ metadata = {}, ...rest }) => ({
    stage: 'won', wonValue: 10, ...rest, metadata: { actualSource: 'legacy', ...metadata },
  });
  const deals = [
    at({ metadata: { wonMonth: '2026-09' }, confirmedAt: '2026-07-01' }), // wonMonth ชนะ
    at({ confirmedAt: '2026-09-05T03:00:00Z', forecastMonth: '2026-01' }), // confirmedAt
    at({ metadata: { poReceivedDate: '2026-09-20' }, forecastMonth: '2026-02' }), // poReceivedDate
    at({ forecastMonth: '2026-09' }), // forecastMonth
    at({ metadata: { wonMonth: '2026-08' } }), // เดือนอื่น
    { stage: 'lost', wonValue: 999, metadata: { actualSource: 'legacy', wonMonth: '2026-09' } }, // ไม่ใช่ Won
  ];
  assert.equal(summarizeMyDeals(deals, opts()).wonValue, 40);
  assert.equal(summarizeMyDeals(deals, opts({ year: '2026' })).wonValue, 50);
});

test('monthInPeriod — เดือนเดียว / ทั้งปี / ไม่มีเดือน', () => {
  assert.equal(monthInPeriod('2026-09', { month: '2026-09' }), true);
  assert.equal(monthInPeriod('2026-08', { month: '2026-09' }), false);
  assert.equal(monthInPeriod('2026-03', { month: '2026-09', year: '2026' }), true);
  assert.equal(monthInPeriod('2025-12', { month: '2026-09', year: '2026' }), false);
  assert.equal(monthInPeriod(null, { month: '2026-09' }), false);
  assert.equal(monthInPeriod(null, { month: '2026-09', year: '2026' }), false);
});

/* ── ด่านระดับซอร์ส — กันคนมาบวกยอดรออนุมัติเข้าเลขที่ห้ามแตะ ─────────────────── */

// ลอกคอมเมนต์ออกก่อน — คอมเมนต์ที่ *อธิบาย* ว่าห้ามรวมยอดรออนุมัติไม่ใช่โค้ดที่รวม
const code = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const HISTORY = '../../app/api/sales-planning/history/route.js';
const MY_DASHBOARD = '../../app/api/sales-planning/my-dashboard/route.js';
const TOTALS = './myDashboardTotals.js';
const MY_TAB = '../../components/salesPlanning/dashboard/MyDashboardTab.js';

test('history route (systemActuals → sales_history ถาวร) ต้องไม่อ่านยอดรออนุมัติเลย', () => {
  const src = code(HISTORY);
  for (const banned of [/pendingApproval/i, /soPending/, /pending_approval/, /splitSalesOrderAmounts/]) {
    assert.doesNotMatch(src, banned, `history route ห้ามอ้าง ${banned} — ตัวช่วยวางเป้าจะแช่ยอดนั้นเป็น Actual`);
  }
  // เดือน Won มาจากตัวกลาง ไม่ใช่สำเนาลำดับ fallback ของตัวเอง
  assert.match(src, /import \{ wonMonthOf \} from '@\/lib\/sales\/dashboardMetrics'/);
  assert.doesNotMatch(src, /monthKey\(d\.metadata\?\.wonMonth\)/, 'สำเนาลำดับเดือน Won กลับมาแล้ว');
  assert.match(src, /const wonAmt = dealActualFromSalesOrders;/, 'ยอดต้องเป็น Actual จาก SO อนุมัติแล้วเท่านั้น');
});

test('my-dashboard route: targetGap / wonValue มาจากตัวสรุปตัวเดียว · ไม่มีสำเนาเดือน Won · นาฬิกาไทย', () => {
  const src = code(MY_DASHBOARD);
  assert.match(src, /summarizeMyDeals\(myDeals, \{ month, year, target, now \}\)/);
  assert.match(src, /wonValue: totals\.wonValue,/);
  assert.match(src, /targetGap: totals\.targetGap,/);
  assert.match(src, /pendingApproval: totals\.pendingApproval,/);
  assert.match(src, /pendingApprovalCount: totals\.pendingApprovalCount,/);
  // บรรทัดที่ประกอบ wonValue/targetGap ต้องไม่มียอดรออนุมัติปน
  for (const line of src.split('\n').filter((l) => /\b(?:wonValue|targetGap)\s*:/.test(l))) {
    assert.doesNotMatch(line, /pending/i, `ยอดรออนุมัติปนเข้า Actual/ส่วนต่างเป้า: ${line.trim()}`);
  }
  assert.doesNotMatch(src, /monthKey\(d\.metadata\?\.wonMonth\)/, 'สำเนาลำดับเดือน Won กลับมาแล้ว');
  assert.doesNotMatch(src, /monthKey\(new Date\(\)\.toISOString\(\)\)/, 'ค่าถอยของเดือนต้องเป็นเดือนไทย ไม่ใช่ UTC');
  // วันนัดของลีด (timestamptz) ต้องเป็นวันไทย — ตัด ISO = วัน UTC ⇒ นัดก่อน 7 โมงหลุดในวันนัด
  assert.doesNotMatch(src, /meetingAt\)?\.slice\(0,\s*10\)/, 'วันนัดต้องมาจาก businessDayKey ไม่ใช่ตัดสตริง ISO');
  assert.match(src, /businessDayKey\(l\.meetingAt\)/);
});

test('ตัวสรุป: targetGap = เป้า − Actual ล้วน · wonValue รวมจาก wonAmountOf เท่านั้น', () => {
  const src = code(TOTALS);
  assert.match(src, /targetGap: Number\(target \|\| 0\) - wonValue,/);
  assert.match(src, /const wonValue = wonDeals\.reduce\(\(sum, d\) => sum \+ wonAmountOf\(d\), 0\);/);
  // เดือนของยอดรออนุมัติต้องมาจาก pendingApprovalMonthOf (เดือนไทยปัจจุบัน) ไม่ใช่ wonMonthOf
  assert.match(src, /monthInPeriod\(pendingApprovalMonthOf\(d, now\), period\)/);
  assert.doesNotMatch(src, /businessMonthKey|toISOString/, 'เดือนต้องมาจาก currentMonth (เวลาไทย) ผ่านตัวกลาง');
});

test('การ์ดยอดปิดได้: % และ ขาดอีก ยังเป็น Actual ล้วน · ยอดรออนุมัติผ่านชิ้นกลาง · แถบยังมี 4 ช่อง', () => {
  const src = code(MY_TAB);
  assert.match(src, /const actual = Number\(data\?\.wonValue \|\| 0\);/);
  assert.match(src, /const targetGap = Number\(data\?\.targetGap \|\| 0\);/);
  assert.match(src, /const targetPct = target > 0 \? \(actual \/ target\) \* 100 : 0;/);
  assert.doesNotMatch(src, /(?:actual|targetGap|target)\s*[-+]\s*pendingApproval|pendingApproval\s*[-+]\s*(?:actual|targetGap|target)\b/,
    'ห้ามบวก/หักยอดรออนุมัติกับ Actual หรือเป้า');
  assert.match(src, /<PendingApprovalAmount\s+amount=\{pendingApproval\} count=\{pendingApprovalCount\}/);
  const strip = src.match(/<MetricStrip[\s\S]*?<\/MetricStrip>/);
  assert.ok(strip, 'หาแถบยอดไม่เจอ');
  assert.equal([...strip[0].matchAll(/<Metric\b/g)].length, 4, 'แถบยอดต้องมี 4 ช่องเท่าเดิม (รออนุมัติเป็นบรรทัดในหมายเหตุ)');
});

/* 🐞 รอบตรวจ 2026-09-11: ฉบับแรกตั้งบรรทัดรออนุมัติเป็น nowrap + ellipsis แล้วเขียนว่า
   "ตัวเลขเต็มอ่านได้จาก title" — แต่ title ของชิ้นกลางเป็นคำอธิบาย ไม่มีตัวเลข ⇒ การ์ดแคบ
   (มือถือ 2 คอลัมน์ · แล็ปท็อปที่มีแถบข้าง) ยอดเงินโดนตัดเหลือ "฿993,0…" แบบกู้คืนไม่ได้ */
test('บรรทัดรออนุมัติบนการ์ดต้องตัดบรรทัด ไม่ตัด … — ยอดเงินที่ถูกตัดอ่านต่อจากที่ไหนไม่ได้', () => {
  const css = readFileSync(new URL('../../components/salesPlanning/dashboard/MyDashboardTab.module.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/\.metricPending[^{]*\{([^}]*)\}/);
  assert.ok(rule, 'หากฎ .metricPending ไม่เจอ');
  assert.match(rule[1], /white-space:\s*normal/);
  assert.doesNotMatch(rule[1], /text-overflow|nowrap/);
});
