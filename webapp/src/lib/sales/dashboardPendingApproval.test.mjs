// ── ยอด SO "รออนุมัติ" บนแดชบอร์ดขาย (มติผู้ใช้ 2026-09-11 · mig 0353) ─────────
//
// ผู้ใช้แจ้ง: "SO ที่รออนุมัติ มันกลายเป็น 0 อยากให้โชว์ยอดด้วย แต่แยกให้รู้ว่า
// รออนุมัติ กับ Actual" ⇒ GET /api/sales-planning/dashboard ส่ง `pendingApproval` +
// `pendingApprovalCount` เป็นช่องแยกใน totals / byOwner[] / byTeam[] / byType[]
//
// ล็อกไว้สี่เรื่อง:
//   1. นับเฉพาะดีล Won · เดือนของยอด = เดือนปัจจุบันเวลาไทยเท่านั้น
//   2. ลงถังคน/ทีมเดียวกับ Actual ของดีลนั้น และถังที่มีแต่ยอดนี้ต้องไม่ถูกตัดเป็นแถวผี
//   3. ไม่แตะ won / wonValue / wonCount ฯลฯ — ตัวเลขพวกนั้นถูกคัดลอกไปเก็บ sales_history ถาวร
//   4. cache รายปีต้องไม่ตอบยอดรออนุมัติของเดือนเก่าหลังข้ามเดือน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPendingApproval,
  hasPendingApproval,
  isEmptyDashboardBucket,
  pendingApprovalDealsOf,
  pendingApprovalFields,
  rollupPendingApproval,
} from './pendingApprovalRollup.js';
import { forecastAccuracyRollup, wonMonthOf } from './dashboardMetrics.js';
import { DASHBOARD_CACHE_PREFIX, dashboardCacheKey } from './dashboardStamp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const route = readFileSync(join(ROOT, 'src/app/api/sales-planning/dashboard/route.js'), 'utf8');
const modal = readFileSync(join(ROOT, 'src/components/salesPlanning/DealDrillDownModal.js'), 'utf8');

// 11 ก.ย. 2569 15:00 เวลาไทย
const SEP = new Date('2026-09-11T08:00:00Z');

// รูปจริงบน prod 2026-09-11 (DL-260900474): Won แล้ว · SO รออนุมัติ · Actual 0
const pendingOnlyDeal = (over = {}) => ({
  stage: 'won',
  ownerId: 'u-ka1',
  ownerName: 'KA หนึ่ง',
  team: 'KA',
  dealType: 'NPD',
  projectValue: 108000,
  wonValue: 0,
  confirmedAt: '2026-09-02T03:00:00+00:00',
  forecastMonth: '2026-09',
  metadata: { actualSource: 'sale_order', wonMonth: null, soPendingAmount: 108000, soPendingCount: 1 },
  ...over,
});

const bucket = (over = {}) => ({
  target: 0, won: 0, weighted: 0, fcTotal: 0, lost: 0, openCount: 0, wonCount: 0, ...pendingApprovalFields(), ...over,
});

test('นับเฉพาะดีล Won (รวม in_project) — ดีลเปิดมี FC อยู่ใน FC คงเหลือแล้ว', () => {
  const deals = [
    pendingOnlyDeal(),
    pendingOnlyDeal({ stage: 'in_project', metadata: { soPendingAmount: 7000, soPendingCount: 1 } }),
    pendingOnlyDeal({ stage: 'quotation', metadata: { soPendingAmount: 5000, soPendingCount: 1 } }),
    pendingOnlyDeal({ stage: 'lost', metadata: { soPendingAmount: 3000, soPendingCount: 1 } }),
  ];
  assert.deepEqual(pendingApprovalDealsOf(deals, '2026-09', SEP).map((d) => d.stage), ['won', 'in_project']);
  assert.deepEqual(rollupPendingApproval(deals, '2026-09', { now: SEP }), { pendingApproval: 115000, pendingApprovalCount: 2 });
});

test('เดือนของยอด = เดือนปัจจุบันเวลาไทยเท่านั้น — เดือนที่ปิดแล้ว/ปีก่อน/เดือนหน้า ได้ 0', () => {
  const deals = [pendingOnlyDeal()];
  for (const month of ['2026-08', '2026-10', '2025-09', '2026-01']) {
    assert.deepEqual(rollupPendingApproval(deals, month, { now: SEP }), pendingApprovalFields(), month);
  }
  assert.equal(rollupPendingApproval(deals, '2026-09', { now: SEP }).pendingApproval, 108000);
});

test('ข้ามเดือนตามนาฬิกาไทย: 2026-09-30T17:30Z คือ 1 ต.ค. แล้ว', () => {
  const deals = [pendingOnlyDeal()];
  const thaiOct1 = new Date('2026-09-30T17:30:00Z');
  assert.equal(rollupPendingApproval(deals, '2026-10', { now: thaiOct1 }).pendingApproval, 108000);
  assert.equal(rollupPendingApproval(deals, '2026-09', { now: thaiOct1 }).pendingApproval, 0,
    'UTC ยังเป็น 30 ก.ย. แต่ไทยข้ามเดือนแล้ว — ยอดต้องย้ายไป ต.ค.');
  const thaiSep30Late = new Date('2026-09-30T16:59:00Z');
  assert.equal(rollupPendingApproval(deals, '2026-09', { now: thaiSep30Late }).pendingApproval, 108000);
});

test('ไม่มีคีย์ใน metadata (JS ขึ้นก่อนรัน mig 0353) = 0 ทุกช่อง ไม่พัง', () => {
  const deals = [
    { stage: 'won', metadata: {} },
    { stage: 'won' },
    { stage: 'won', metadata: null },
    { stage: 'won', metadata: { soPendingAmount: null, soPendingCount: undefined } },
  ];
  const owner = bucket();
  assert.deepEqual(rollupPendingApproval(deals, '2026-09', { now: SEP, attribute: [() => owner] }), pendingApprovalFields());
  assert.deepEqual(owner, bucket(), 'ถังต้องไม่ถูกแตะเลย');
  // ถังเก่าที่ยังไม่มีสองช่องนี้ บวกแล้วต้องได้ตัวเลข ไม่ใช่ NaN
  const legacy = addPendingApproval({ won: 5 }, pendingOnlyDeal());
  assert.equal(legacy.pendingApproval, 108000);
  assert.equal(legacy.pendingApprovalCount, 1);
});

test('ลงถังคน/ทีม/หมวดของดีลนั้น — ถังอื่นไม่ได้ยอด และยอดรวมบริษัท = ผลรวมรายทีม', () => {
  const buckets = { owner: {}, team: {}, type: {} };
  const of = (map, key) => (map[key] ||= bucket());
  const deals = [
    pendingOnlyDeal(),
    pendingOnlyDeal({ ownerId: 'u-odm1', ownerName: 'ODM หนึ่ง', team: 'ODM', dealType: 'SCENT', metadata: { soPendingAmount: 50000, soPendingCount: 2 } }),
    // ดีลไร้ทีม (แอดมิน/AE Sup เปิดเอง) ต้องลงถัง "ไม่ระบุ" ไม่หายจากผลรวมรายทีม
    pendingOnlyDeal({ ownerId: 'u-admin', ownerName: 'แอดมิน', team: null, dealType: 'OTHER', metadata: { soPendingAmount: 1000, soPendingCount: 1 } }),
  ];
  const totals = rollupPendingApproval(deals, '2026-09', {
    now: SEP,
    attribute: [
      (d) => of(buckets.owner, d.ownerId),
      (d) => of(buckets.team, d.team || 'ไม่ระบุ'),
      (d) => of(buckets.type, d.dealType),
    ],
  });
  assert.deepEqual(totals, { pendingApproval: 159000, pendingApprovalCount: 4 });
  assert.equal(buckets.owner['u-ka1'].pendingApproval, 108000);
  assert.equal(buckets.owner['u-odm1'].pendingApprovalCount, 2);
  assert.equal(buckets.team.KA.pendingApproval, 108000);
  assert.equal(buckets.team.ODM.pendingApproval, 50000);
  assert.equal(buckets.team['ไม่ระบุ'].pendingApproval, 1000);
  assert.equal(buckets.type.NPD.pendingApproval, 108000);
  const teamSum = Object.values(buckets.team).reduce((s, b) => s + b.pendingApproval, 0);
  assert.equal(teamSum, totals.pendingApproval, 'ผลรวมรายทีมต้องกระทบกับยอดบริษัท');
});

test('ไม่แตะ won / wonCount / fcTotal / gap ของถัง และไม่ไหลเข้า Actual ของ rollup FC', () => {
  const owner = bucket({ target: 500000, won: 200000, wonCount: 3, fcTotal: 400000, gap: 300000 });
  rollupPendingApproval([pendingOnlyDeal()], '2026-09', { now: SEP, attribute: [() => owner] });
  assert.equal(owner.won, 200000);
  assert.equal(owner.wonCount, 3);
  assert.equal(owner.fcTotal, 400000);
  assert.equal(owner.gap, 300000);
  assert.equal(owner.target, 500000);
  assert.equal(owner.pendingApproval, 108000);
  // Actual ของเดือนยังเป็น 0 — ยอดรออนุมัติอยู่ช่องของตัวเองเท่านั้น
  assert.equal(forecastAccuracyRollup([], [pendingOnlyDeal()], []).wonValue, 0);
});

test('ดีลที่ Won เดือนก่อน + ใบใหม่รออนุมัติ: Actual อยู่เดือนเก่า รออนุมัติอยู่เดือนนี้ (รอบแยก)', () => {
  const deal = pendingOnlyDeal({
    wonValue: 200000,
    metadata: { actualSource: 'sale_order', wonMonth: '2026-08', soPendingAmount: 100000, soPendingCount: 1 },
  });
  assert.equal(wonMonthOf(deal), '2026-08');
  assert.equal(rollupPendingApproval([deal], '2026-08', { now: SEP }).pendingApproval, 0,
    'ถ้าขี่ลูป Won ยอดรออนุมัติจะไปตกเดือน ส.ค. ที่ปิดไปแล้ว');
  assert.equal(rollupPendingApproval([deal], '2026-09', { now: SEP }).pendingApproval, 100000);
});

test('ถังที่มีแต่ยอดรออนุมัติไม่ใช่แถวผี · ถังว่างจริงยังถูกตัด', () => {
  assert.equal(isEmptyDashboardBucket(bucket()), true);
  assert.equal(isEmptyDashboardBucket(bucket({ pendingApproval: 108000, pendingApprovalCount: 1 })), false);
  assert.equal(isEmptyDashboardBucket(bucket({ pendingApprovalCount: 1 })), false, 'ใบยอด 0 บาทที่รออนุมัติจริงก็ยังเป็นแถว');
  assert.equal(isEmptyDashboardBucket(bucket({ pendingApproval: 5 })), false);
  // กติกาเดิมไม่เปลี่ยน
  for (const key of ['target', 'won', 'weighted', 'lost', 'openCount', 'wonCount']) {
    assert.equal(isEmptyDashboardBucket(bucket({ [key]: 1 })), false, key);
  }
  // ถังเก่าไม่มีสองช่องนี้ = ไม่มียอดรออนุมัติ
  assert.equal(isEmptyDashboardBucket({ target: 0, won: 0 }), true);
  assert.equal(hasPendingApproval(null), false);
});

test('ใบรออนุมัติยอด 0 บาท (ถูกกฎตั้งแต่ mig 0197) นับจำนวนใบ — ตรงกับรายงานเป้า/หน้า SO', () => {
  // trigger mig 0353 เขียนทั้งสองคีย์เมื่อ count > 0 ⇒ ยอด 0 + 1 ใบ คือของจริงที่เกิดได้
  const zero = pendingOnlyDeal({ metadata: { actualSource: 'sale_order', soPendingAmount: 0, soPendingCount: 1 } });
  const owner = bucket();
  const totals = rollupPendingApproval([zero, pendingOnlyDeal()], '2026-09', { now: SEP, attribute: [() => owner] });
  assert.deepEqual(totals, { pendingApproval: 108000, pendingApprovalCount: 2 },
    'จำนวนใบบนแดชบอร์ดต้องเท่ารายงานเป้า (reportPendingApproval นับใบ 0 บาท) และหน้า SO (splitSalesOrderAmounts)');
  assert.equal(owner.pendingApprovalCount, 2);
  // ยังเป็นเดือนปัจจุบันเท่านั้น
  assert.deepEqual(rollupPendingApproval([zero], '2026-08', { now: SEP }), pendingApprovalFields());
  // ดีลเปิดที่มีคีย์ค้างก็ยังไม่นับ (กติกา Won-only ไม่เปลี่ยน)
  assert.deepEqual(rollupPendingApproval([{ ...zero, stage: 'quotation' }], '2026-09', { now: SEP }), pendingApprovalFields());
});

test('คีย์ cache ผูกเดือนปัจจุบันเวลาไทย — ข้ามเดือนแล้วต้องได้ก้อนใหม่ แม้สแตมป์ไม่ขยับ', () => {
  const before = dashboardCacheKey('year:2026', new Date('2026-09-30T16:59:00Z'));
  const after = dashboardCacheKey('year:2026', new Date('2026-09-30T17:00:00Z'));
  assert.notEqual(before, after);
  assert.equal(dashboardCacheKey('year:2026', SEP), dashboardCacheKey('year:2026', new Date('2026-09-01T00:00:00+07:00')),
    'เดือนเดียวกัน = ก้อนเดียวกัน (TTL ยังซื้อโควตา CPU ได้เหมือนเดิม)');
  // prefix เดิม ⇒ bumpStamp(DASHBOARD_CACHE_PREFIX) ยังล้างได้ครบ
  assert.ok(before.startsWith(`${DASHBOARD_CACHE_PREFIX}:`));
  assert.notEqual(dashboardCacheKey('year:2026', SEP), dashboardCacheKey('2026-09', SEP), 'โหมดปีกับโหมดเดือนต้องไม่ชนกัน');
});

// ── ยามระดับซอร์สของ route (route.js export ได้แค่ HTTP handler — เรียกตรงไม่ได้) ──
test('route: ไม่บวกยอดรออนุมัติเข้า won / wonValue / Actual / gap เด็ดขาด', () => {
  const lines = route.split('\n').filter((l) => /pending/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
  for (const line of lines) {
    assert.doesNotMatch(line, /\b(won|wonValue|wonCount|actual|gap|targetGap|wonVariance|fcTotal|wonForecastValue)\s*(\+=|=[^=>])/,
      `บรรทัดนี้เอายอดรออนุมัติไปปนช่อง Actual/FC: ${line.trim()}`);
  }
  assert.doesNotMatch(route, /wonValue:\s*[^,\n]*pending/i);
  assert.doesNotMatch(route, /won:\s*[^,\n]*pending/i);
  // สองช่องใหม่อยู่ใน totals แยกจาก wonValue
  assert.match(route, /pendingApproval: pendingApprovalTotals\.pendingApproval/);
  assert.match(route, /pendingApprovalCount: pendingApprovalTotals\.pendingApprovalCount/);
  assert.match(route, /targetGap: targetAmount - wonValue,/, 'ขาด/เกินเป้ายังคิดจาก Actual ล้วน');
});

test('route: ยอดรออนุมัติลงถังคน/ทีมด้วยตัวหาถังชุดเดียวกับลูป Won', () => {
  // ลูป Won
  assert.match(route, /const b = ownerBucket\(d\.ownerId, d\.ownerName, d\.team\);/);
  assert.match(route, /const b = teamBucket\(d\.team\);/);
  // รอบรออนุมัติ
  const at = route.indexOf('rollupPendingApproval(visibleDeals, month');
  assert.ok(at > 0, 'ต้องรวมจาก visibleDeals ทั้งหมด ไม่ใช่ wonDeals (เดือนคนละกติกา)');
  const call = route.slice(at, route.indexOf('});', at));
  assert.match(call, /\bnow\b/, 'ต้องส่งนาฬิกาของ request ลงมา');
  assert.match(call, /\(d\) => ownerBucket\(d\.ownerId, d\.ownerName, d\.team\)/);
  assert.match(call, /\(d\) => teamBucket\(d\.team\)/);
  assert.match(call, /\(d\) => typeMap\[dealTypeOf\(d\)\]/);
});

test('route: รอบรออนุมัติต้องมาก่อนกรองถังผี ไม่งั้นคนที่มีแต่ใบรออนุมัติหายจาก byOwner/byTeam', () => {
  const pass = route.indexOf('rollupPendingApproval(visibleDeals');
  const ownerFilter = route.indexOf('const byOwner = Object.values(ownerMap)');
  const teamFilter = route.indexOf('const byTeam = Object.values(teamMap)');
  assert.ok(pass > 0 && ownerFilter > pass && teamFilter > pass);
  assert.match(route, /const isEmptyBucket = isEmptyDashboardBucket;/);
  // ถังตั้งต้นทุกแบบมีสองช่องเป็น 0 เสมอ (สัญญากับจอ: ห้ามขาดช่อง)
  assert.equal((route.match(/\.\.\.pendingApprovalFields\(\)/g) || []).length, 3, 'ownerBucket · teamBucket · typeMap');
});

test('route: นาฬิกาเดียวต่อ request · เดือนไทย · ไม่ใช้ตัวช่วยเดือนผิดตัว', () => {
  assert.equal((route.match(/new Date\(\)/g) || []).length, 2, 'GET หนึ่งจุด + ค่าตั้งต้นของ aggregateMonth หนึ่งจุด');
  assert.match(route, /const now = new Date\(\);/);
  assert.match(route, /dashboardCacheKey\(`year:\$\{year\}`, now\)/);
  assert.match(route, /buildYearDashboards\(supabase, year, now\)/);
  assert.match(route, /buildDashboard\(supabase, month, now\)/);
  assert.match(route, /currentMonth\(now\)/);
  assert.doesNotMatch(route, /toISOString\(\)/, 'เดือนตั้งต้นต้องเป็นเดือนไทย ไม่ใช่เดือน UTC');
  assert.doesNotMatch(route, /businessMonthKey/, "businessMonthKey คืน 'YYMM' สำหรับเลขเอกสาร");
  assert.doesNotMatch(route, /sales-dashboard:year:/, 'คีย์ cache ต้องผ่าน dashboardCacheKey (มีเดือนปัจจุบัน)');
});

// ── ลิ้นชักรายดีล ──────────────────────────────────────────────────────────────
test('modal: metric pendingApproval กรองด้วยกติกาเดียวกับ API และยอดบนแถว = ยอดรออนุมัติ', () => {
  assert.match(modal, /const PENDING_APPROVAL_METRIC = "pendingApproval";/);
  const pendingBranch = modal.slice(modal.indexOf('filter.metric === PENDING_APPROVAL_METRIC) {'), modal.indexOf('filter.metric === "lost"'));
  assert.match(pendingBranch, /const pendingMonth = pendingApprovalMonthOf\(d, now\);/, 'เดือน/การมีใบ มาจากตัวช่วยกลางตัวเดียวกับ API');
  assert.match(pendingBranch, /return isWonDeal\(d\) && Boolean\(pendingMonth\) && inPeriod\(pendingMonth\);/,
    'งวด "ทุกงวด" ตอบ inPeriod(null) = true — ต้องกันดีลที่ไม่มีใบเอง');
  /* ใบยอด 0 บาทที่รออนุมัติจริง (mig 0197) ต้องอยู่ในลิ้นชักเหมือนที่ API นับ — ห้ามกลับไปกรองด้วยยอด > 0
     (เดิมกรองด้วยยอด ⇒ ช่อง "รออนุมัติ ฿0.00 · N ใบ" กดแล้วลิ้นชักว่าง) */
  assert.doesNotMatch(pendingBranch, /pendingApprovalAmountOf\(d\) > 0/);
  assert.match(modal, /if \(isPendingMetric\) return pendingApprovalAmountOf\(deal\);/);
  assert.match(modal, /\[PENDING_APPROVAL_METRIC\]: PENDING_APPROVAL_LABEL,/);
  assert.match(modal, /ยังไม่นับเป็น Actual · นับอยู่เดือนปัจจุบันจนกว่าจะอนุมัติ/);
  assert.doesNotMatch(modal, /wonMonthOf\(d\)\)\s*&& pending/, 'เดือนของยอดรออนุมัติห้ามใช้ wonMonthOf');
});

test('modal: metric ที่ไม่ได้ลงทะเบียนต้องได้รายการว่าง ไม่ใช่ดีลทุกใบทุกงวด', () => {
  const chain = modal.slice(modal.indexOf('if (filter.metric === "won")'), modal.indexOf('setDeals(filtered);'));
  assert.match(chain, /\} else \{[\s\S]*filtered = \[\];\s*\}\s*$/);
});

test('modal: รายการ "ยอด Won" ยอดรวมเป็น Actual ล้วน · รออนุมัติเป็นบรรทัดรองผ่านชิ้นกลาง', () => {
  assert.match(modal, /const totalValue = deals\.reduce\(\(sum, deal\) => sum \+ amountOf\(deal\), 0\);/);
  assert.match(modal, /isWonDeal\(deal\) && filter\.metric === "won" \? wonAmountOf\(deal\) : forecastAmount\(deal\)/);
  assert.match(modal, /<PendingApprovalAmount[\s\S]*amount=\{pendingApprovalAmountOf\(deal\)\}/);
  const subLine = modal.slice(modal.indexOf('const showPendingSubLine'), modal.indexOf('const statusCounts'));
  assert.match(subLine, /if \(filter\.metric !== "won" \|\| !pendingAsOf\) return false;/, 'บรรทัดรองมีเฉพาะรายการ "ยอด Won"');
  assert.match(subLine, /const pendingMonth = pendingApprovalMonthOf\(deal, pendingAsOf\);/, 'เดือนมาจากตัวช่วยกลาง ด้วยนาฬิกาตัวเดียวกับตอนกรอง');
  /* งวด "ทุกงวด" ตอบ inPeriod(null) = true — ถ้าไม่กันเดือนว่าง ดีลที่ API ไม่นับ
     (ดีลที่ไม่มีใบรออนุมัติ) จะถูกตัดสินว่ามีบรรทัดรออนุมัติ ขณะที่แดชบอร์ดกับลิ้นชักไม่มีดีลนี้ */
  assert.match(subLine, /return Boolean\(pendingMonth\) && inPeriod\(pendingMonth\);/);
  assert.doesNotMatch(subLine, /wonMonthOf/, 'เดือนของบรรทัดรองห้ามใช้เดือน Won');
});
