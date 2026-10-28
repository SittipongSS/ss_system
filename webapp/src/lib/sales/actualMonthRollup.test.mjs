// ── Actual รายเดือน + กอง "รอนับรายงวด" บนแดชบอร์ดขาย (mig 0412 · มติเจ้าของ 26/10/2026) ──────────
//
// ล็อกไว้:
//   1. ใบทั้งใบล้วน (ทุกดีลวันนี้) — ตัวรวมใหม่ให้ตัวเลขเท่าลูป Won เดิม (wonDeals ที่ wonMonth + wonAmountOf) ทุกสตางค์
//      ทั้งยอดบริษัทและรายถัง (คน/ทีม/หมวด) · ดีลที่ยังไม่มีคีย์ actualByMonth = { wonMonth: wonValue }
//   2. ใบรายงวดแตกหลายเดือน — แต่ละเดือนได้เฉพาะส่วนของตัวเอง · รวมทุกเดือน = wonValue พอดี (ไม่ซ้ำ ไม่ตกหล่น)
//      งวดที่อนุมัติเดือนหลังลงถังของดีลแม้ดีลไม่อยู่ใน wonDeals ของเดือนนั้น
//   3. กอง "รอนับรายงวด": ลงเดือนครบกำหนด · 'none' และเดือนที่ผ่านมาแล้วพับเข้าเดือนปัจจุบัน · ดีลไม่ใช่ Won/ดีลย้อนหลังไม่นับ
//   4. ถังที่มีแต่กองนี้ไม่ใช่ถังผี · ยามซอร์สของ route (ตัวหาถังชุดเดียวกับลูป Won · ไม่ไหลเข้า Actual)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INST_REMAINING_KEYS,
  actualInPeriodOf,
  addInstRemaining,
  hasActualInPeriod,
  hasInstRemaining,
  instRemainingFields,
  instRemainingInMonthOf,
  instRemainingInPeriodOf,
  monthActualOf,
  rollupInstRemaining,
  rollupMonthActual,
} from './actualMonthRollup.js';
import { dealTypeOf } from '../salesPlanning.js';
import { isWonDeal, wonAmountOf, wonMonthOf } from './dashboardMetrics.js';
import { isEmptyDashboardBucket, pendingApprovalFields } from './pendingApprovalRollup.js';
import { wonAwaitingSoFields } from './wonAwaitingSoRollup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const route = readFileSync(join(ROOT, 'src/app/api/sales-planning/dashboard/route.js'), 'utf8');
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ต.ค. 2026 เวลาไทย — ตัวพับเดือนของกอง "รอนับรายงวด"
const NOW = new Date('2026-10-26T05:00:00Z');

/* ดีลใบทั้งใบ (รูปของทุกดีลวันนี้): trigger 0360 เขียน wonMonth + wonValue · ยังไม่มีคีย์ actualByMonth */
const orderDeal = (over = {}) => ({
  stage: 'won',
  ownerId: 'u1',
  ownerName: 'หนึ่ง',
  team: 'KA',
  dealType: 'NPD',
  projectValue: 120000,
  wonValue: 100000,
  confirmedAt: '2026-08-02T03:00:00Z',
  forecastMonth: '2026-08',
  metadata: { actualSource: 'sale_order', wonMonth: '2026-08', wonValueExVat: 100000 },
  ...over,
});

/* ดีลใบรายงวด: อนุมัติใบ ส.ค. (งวด 1) · งวด 2 อนุมัติ ต.ค. · งวด 3 รอนับ (ครบกำหนด ธ.ค.) */
const installmentDeal = (over = {}) => ({
  stage: 'won',
  ownerId: 'u2',
  ownerName: 'สอง',
  team: 'ODM',
  dealType: 'SCENT',
  projectValue: 93457.94,
  wonValue: 62304.94,
  confirmedAt: '2026-08-01T03:00:00Z',
  forecastMonth: '2026-08',
  metadata: {
    actualSource: 'sale_order',
    wonMonth: '2026-08',
    wonValueExVat: 62304.94,
    actualByMonth: { '2026-08': 31152.64, '2026-10': 31152.3 },
    soInstRemainingByDue: { '2026-12': 31153 },
  },
  ...over,
});

/* ── 1. ความเท่ากันของใบทั้งใบ ───────────────────────────────────────────────────────────────── */

/* จำลองลูป Won เดิมของ route (ก่อน 0412) — wonDeals ที่ wonMonth = เดือน · บวก wonAmountOf ลงถังคน/ทีม/หมวด */
function oldLoop(deals, month) {
  const wonDeals = deals.filter((d) => isWonDeal(d) && wonMonthOf(d) === month);
  const out = { total: 0, owner: {}, team: {}, type: {} };
  for (const d of wonDeals) {
    out.total += wonAmountOf(d);
    out.owner[d.ownerId] = (out.owner[d.ownerId] || 0) + wonAmountOf(d);
    out.team[d.team || 'ไม่ระบุ'] = (out.team[d.team || 'ไม่ระบุ'] || 0) + wonAmountOf(d);
    out.type[dealTypeOf(d)] = (out.type[dealTypeOf(d)] || 0) + wonAmountOf(d);
  }
  return out;
}
/* ตัวรวมใหม่ + ตัวบวกลงถังแบบเดียวกับ route (ถังสร้างเมื่อมีลูป Won เดิมหรือมียอด — ที่นี่สร้างเมื่อมียอด) */
function newLoop(deals, month) {
  const out = { total: 0, owner: {}, team: {}, type: {} };
  out.total = rollupMonthActual(deals, month, {
    attribute: [
      (d, amount) => { out.owner[d.ownerId] = (out.owner[d.ownerId] || 0) + amount; },
      (d, amount) => { out.team[d.team || 'ไม่ระบุ'] = (out.team[d.team || 'ไม่ระบุ'] || 0) + amount; },
      (d, amount) => { out.type[dealTypeOf(d)] = (out.type[dealTypeOf(d)] || 0) + amount; },
    ],
  });
  return out;
}
const dropZeros = (map) => Object.fromEntries(Object.entries(map).filter(([, v]) => v !== 0));

test('ใบทั้งใบล้วน: Actual ของทุกเดือน ทุกถัง เท่าลูป Won เดิมทุกสตางค์ (ไม่มีคีย์ / มีคีย์ actualByMonth)', () => {
  const deals = [
    orderDeal(),
    orderDeal({ ownerId: 'u2', team: 'ODM', dealType: 'SCENT', wonValue: 0.29, metadata: { actualSource: 'sale_order', wonMonth: '2026-08' } }),
    orderDeal({ ownerId: 'u3', team: null, wonValue: 4567.89, metadata: { actualSource: 'sale_order', wonMonth: '2026-09' } }),
    // หลังรัน 0412 trigger เขียน actualByMonth = { เดือนอนุมัติ: actualAmount } (ใบเดียว = ค่าเดียวกับ wonMonth/wonValue)
    orderDeal({ ownerId: 'u1', wonValue: 1234.5, metadata: { actualSource: 'sale_order', wonMonth: '2026-09', actualByMonth: { '2026-09': 1234.5 } } }),
    // ใบอนุมัติ 0 บาท (ส่วนลด 100%) — Actual 0 ไม่สร้างถังใหม่ (ลูปเดิมบวก 0)
    orderDeal({ ownerId: 'u4', wonValue: 0, metadata: { actualSource: 'sale_order', wonMonth: '2026-08', actualByMonth: { '2026-08': 0 } } }),
    // Won รอยื่น SO (ยังไม่มี Actual) · ยังไม่ยืนยัน actualSource · ดีลเปิด/แพ้ — Actual 0 ทั้งคู่
    orderDeal({ ownerId: 'u5', wonValue: 0, metadata: {} }),
    orderDeal({ ownerId: 'u6', wonValue: 180, metadata: { wonMonth: '2026-08' } }),
    orderDeal({ stage: 'quotation', wonValue: 999 }),
    orderDeal({ stage: 'lost', wonValue: 999 }),
  ];
  for (const month of ['2026-07', '2026-08', '2026-09', '2026-10']) {
    const before = oldLoop(deals, month);
    const after = newLoop(deals, month);
    assert.equal(after.total, before.total, `${month} ยอดบริษัท`);
    for (const key of ['owner', 'team', 'type']) {
      assert.deepEqual(after[key], dropZeros(before[key]), `${month} ถัง ${key}`);
    }
  }
});

test('ใบทั้งใบ: actualInPeriodOf ของงวดที่คลุม wonMonth = wonAmountOf · ไม่คลุม = 0', () => {
  const d = orderDeal();
  assert.equal(actualInPeriodOf(d, (m) => m === '2026-08'), wonAmountOf(d));
  assert.equal(actualInPeriodOf(d, (m) => m.startsWith('2026-')), 100000);
  assert.equal(actualInPeriodOf(d, (m) => m === '2026-09'), 0);
  assert.equal(actualInPeriodOf(d, () => true), 100000, 'งวด "ทุกงวด"');
  assert.equal(hasActualInPeriod(d, (m) => m === '2026-09'), false);
});

/* ── 2. ใบรายงวดแตกหลายเดือน ──────────────────────────────────────────────────────────────── */
test('ใบรายงวด: แต่ละเดือนได้แค่ส่วนของตัวเอง · ผลรวมทุกเดือน = wonValue พอดี · ไม่ลากงวดเก่าไปเดือนใหม่', () => {
  const d = installmentDeal();
  assert.equal(monthActualOf(d, '2026-08'), 31152.64);
  assert.equal(monthActualOf(d, '2026-10'), 31152.3);
  assert.equal(monthActualOf(d, '2026-09'), 0);
  assert.equal(monthActualOf(d, '2026-12'), 0, 'งวดที่ยังไม่นับไม่ใช่ Actual');
  const sum = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']
    .reduce((s, m) => s + monthActualOf(d, m), 0);
  assert.equal(Math.round(sum * 100) / 100, d.wonValue);
  // ลูปเดิมจะเอาทั้งก้อนไปลง ส.ค. (wonMonth) — นี่คือบั๊กที่ไฟล์นี้กัน
  assert.equal(oldLoop([d], '2026-08').total, 62304.94);
  assert.equal(newLoop([d], '2026-08').total, 31152.64);
  assert.equal(newLoop([d], '2026-10').total, 31152.3, 'เดือนที่อนุมัติงวด 2 ได้ยอดงวด 2 แม้ดีลไม่อยู่ใน wonDeals ของ ต.ค.');
  assert.deepEqual(newLoop([d], '2026-10').owner, { u2: 31152.3 }, 'ลงถังของเจ้าของดีล');
  // ไตรมาส/ทั้งปี/ทุกงวด ของลิ้นชัก
  assert.equal(actualInPeriodOf(d, (m) => ['2026-07', '2026-08', '2026-09'].includes(m)), 31152.64);
  assert.equal(actualInPeriodOf(d, (m) => ['2026-10', '2026-11', '2026-12'].includes(m)), 31152.3);
  assert.equal(actualInPeriodOf(d, (m) => m.startsWith('2026-')), 62304.94);
});

test('ใบรายงวดข้ามปี: แต่ละปีได้ส่วนของปีนั้น (ไม่ซ้ำสองปี)', () => {
  const d = installmentDeal({ metadata: { ...installmentDeal().metadata, actualByMonth: { '2026-12': 100, '2027-01': 50.5 } } });
  assert.equal(actualInPeriodOf(d, (m) => m.startsWith('2026-')), 100);
  assert.equal(actualInPeriodOf(d, (m) => m.startsWith('2027-')), 50.5);
});

test('ดีลไม่ใช่ Won / ดีลของใบสั่งขายย้อนหลัง / ยังไม่ยืนยัน actualSource ไม่มี Actual รายเดือน', () => {
  assert.equal(monthActualOf(installmentDeal({ stage: 'quotation' }), '2026-08'), 0);
  assert.equal(monthActualOf(installmentDeal({ origin: 'historical' }), '2026-08'), 0);
  assert.equal(monthActualOf(installmentDeal({ metadata: { actualByMonth: { '2026-08': 5 } } }), '2026-08'), 0);
  assert.equal(rollupMonthActual(null, '2026-08'), 0);
});

/* ── 3. กอง "รอนับรายงวด" ─────────────────────────────────────────────────────────────────── */
test('รอนับรายงวด: ลงเดือนครบกำหนด · none/เลยกำหนด พับเข้าเดือนปัจจุบัน · นับจำนวนดีล', () => {
  const d = installmentDeal({
    id: 'D-2',
    metadata: {
      ...installmentDeal().metadata,
      soInstRemainingByDue: { none: 100, '2026-08': 50, '2026-10': 25, '2026-12': 400, '2027-02': 7 },
    },
  });
  assert.equal(instRemainingInMonthOf(d, '2026-10', '2026-10'), 175, 'none + ส.ค. (เลยกำหนด) + ต.ค. = เดือนปัจจุบัน');
  assert.equal(instRemainingInMonthOf(d, '2026-08', '2026-10'), 0, 'เดือนที่จบแล้วไม่มีวันเห็นกองนี้');
  assert.equal(instRemainingInMonthOf(d, '2026-12', '2026-10'), 400);
  assert.equal(instRemainingInPeriodOf(d, (m) => m.startsWith('2026-'), '2026-10'), 575);
  assert.equal(instRemainingInPeriodOf(d, () => true, '2026-10'), 582);

  const other = installmentDeal({ id: 'D-9', ownerId: 'u9', team: 'KA', metadata: { ...installmentDeal().metadata, soInstRemainingByDue: { '2026-12': 10 } } });
  const buckets = { u2: { ...instRemainingFields() }, u9: { ...instRemainingFields() } };
  const totals = rollupInstRemaining([d, other, orderDeal()], '2026-12', {
    now: NOW,
    attribute: [(deal) => buckets[deal.ownerId]],
  });
  /* `instRemainingDealIds` = ดีลของเดือนนี้ (ไม่ซ้ำ) — ช่วงหลายเดือนนับดีลจากชุดนี้ (review 26/10) */
  assert.deepEqual(totals, { instRemaining: 410, instRemainingCount: 2, instRemainingDealIds: ['D-2', 'D-9'] });
  assert.deepEqual(buckets.u2, { instRemaining: 400, instRemainingCount: 1, instRemainingDealIds: ['D-2'] });
  assert.deepEqual(buckets.u9, { instRemaining: 10, instRemainingCount: 1, instRemainingDealIds: ['D-9'] });
  // เดือนปัจจุบันของคำขอ = ตัวพับ (ต.ค. เวลาไทย)
  assert.deepEqual(rollupInstRemaining([d], '2026-10', { now: NOW }), { instRemaining: 175, instRemainingCount: 1, instRemainingDealIds: ['D-2'] });
  assert.deepEqual(rollupInstRemaining([d], '2026-08', { now: NOW }), { instRemaining: 0, instRemainingCount: 0, instRemainingDealIds: [] });
  // ถังเดียวกันได้ดีลเดิมซ้ำ (ผู้เรียกบวกสองครั้ง) = id ไม่ซ้ำ · ดีลไม่มี id = ไม่เติมชุด (ตัวนับช่วงถอยไปใช้จำนวน)
  const bucket = instRemainingFields();
  addInstRemaining(bucket, 5, 'D-2');
  addInstRemaining(bucket, 5, 'D-2');
  addInstRemaining(bucket, 5);
  assert.deepEqual(bucket.instRemainingDealIds, ['D-2']);
});

test('รอนับรายงวด: ข้ามเดือนแล้วงวดที่เลยกำหนดย้ายมาเดือนใหม่เอง (คิดตอนอ่าน ไม่ใช่ตอนบันทึก)', () => {
  const d = installmentDeal({ metadata: { ...installmentDeal().metadata, soInstRemainingByDue: { '2026-10': 30 } } });
  assert.equal(rollupInstRemaining([d], '2026-10', { now: new Date('2026-10-31T16:59:00Z') }).instRemaining, 30, '23:59 31 ต.ค. เวลาไทย');
  assert.equal(rollupInstRemaining([d], '2026-10', { now: new Date('2026-10-31T17:00:00Z') }).instRemaining, 0, '00:00 1 พ.ย. เวลาไทย');
  assert.equal(rollupInstRemaining([d], '2026-11', { now: new Date('2026-10-31T17:00:00Z') }).instRemaining, 30);
});

test('รอนับรายงวด: ดีลไม่ใช่ Won / ดีลย้อนหลัง / ใบทั้งใบ ไม่มีกองนี้ · ยอด 0 ไม่นับเป็นดีล', () => {
  const meta = { ...installmentDeal().metadata, soInstRemainingByDue: { '2026-12': 10, '2027-01': 0 } };
  assert.deepEqual(rollupInstRemaining([installmentDeal({ stage: 'quotation', metadata: meta })], '2026-12', { now: NOW }), instRemainingFields());
  assert.deepEqual(rollupInstRemaining([installmentDeal({ origin: 'historical', metadata: meta })], '2026-12', { now: NOW }), instRemainingFields());
  assert.deepEqual(rollupInstRemaining([orderDeal()], '2026-10', { now: NOW }), instRemainingFields());
  assert.deepEqual(rollupInstRemaining([installmentDeal({ metadata: meta })], '2027-01', { now: NOW }), instRemainingFields());
  assert.equal(addInstRemaining(null, 5), null);
  const b = instRemainingFields();
  addInstRemaining(b, 0);
  assert.deepEqual(b, instRemainingFields(), 'ยอด 0 ไม่ถูกนับเป็นดีล');
});

test('ถังที่มีแต่กอง "รอนับรายงวด" ไม่ใช่ถังผี (คนต้องยังมีแถว)', () => {
  const bucket = {
    target: 0, won: 0, weighted: 0, lost: 0, openCount: 0, wonCount: 0,
    ...pendingApprovalFields(), ...wonAwaitingSoFields(), ...instRemainingFields(),
  };
  assert.equal(isEmptyDashboardBucket(bucket), true);
  addInstRemaining(bucket, 12);
  assert.equal(hasInstRemaining(bucket), true);
  assert.equal(isEmptyDashboardBucket(bucket), false);
  assert.deepEqual([...INST_REMAINING_KEYS], ['instRemaining', 'instRemainingCount']);
});

/* ── 4. ยามซอร์สของ route (route.js export ได้แค่ HTTP handler — เรียกตรงไม่ได้) ──────────────── */
test('route: Actual ของเดือนมาจาก rollupMonthActual ด้วยตัวหาถังชุดเดียวกับลูป Won · ลูป Won ไม่บวก Actual เอง', () => {
  const src = codeOnly(route);
  assert.match(src, /import \{ instRemainingFields, rollupInstRemaining, rollupMonthActual \} from '@\/lib\/sales\/actualMonthRollup';/);
  assert.doesNotMatch(src, /\bwonAmountOf\b|\bwonAmt\b/, 'ห้ามกลับไปบวก wonValue ทั้งก้อนที่ wonMonth');
  assert.doesNotMatch(src, /b\.(won|actual) \+=/, 'ลูป Won ไม่บวก Actual — มาจากรอบรายเดือนเท่านั้น');
  const at = src.indexOf('const wonValue = rollupMonthActual(visibleDeals, month, {');
  assert.ok(at > 0, 'totals.wonValue = ผลของรอบรายเดือน');
  const call = src.slice(at, src.indexOf('});', at));
  assert.match(call, /ownerBucket\(d\.ownerId, d\.ownerName, d\.team\)\.won \+= amount;/);
  assert.match(call, /teamBucket\(d\.team\)\.won \+= amount;/);
  assert.match(call, /typeMap\[dealTypeOf\(d\)\]\.actual \+= amount;/);
  // รอบ Actual ต้องมาก่อนกรองถังผี (ถังที่มีแต่ Actual ของงวด ไม่หาย)
  assert.ok(at < src.indexOf('const byOwner = Object.values(ownerMap)'));
  assert.match(src, /targetGap: targetAmount - wonValue,/);
});

test('route: กอง "รอนับรายงวด" เป็นรอบแยก · ทุกถังมีช่อง · ไม่ไหลเข้า Actual/เป้า/ขาด-เกิน', () => {
  const src = codeOnly(route);
  assert.equal((src.match(/\.\.\.wonAwaitingSoFields\(\), \.\.\.instRemainingFields\(\)/g) || []).length, 3, 'หมวด · คน · ทีม');
  const at = src.indexOf('rollupInstRemaining(visibleDeals, month, {');
  assert.ok(at > 0);
  const call = src.slice(at, src.indexOf('});', at));
  assert.match(call, /now,/, 'นาฬิกาเดียวกับคีย์ cache');
  assert.match(call, /\(d\) => ownerBucket\(d\.ownerId, d\.ownerName, d\.team\),/);
  assert.match(call, /\(d\) => teamBucket\(d\.team\),/);
  assert.match(call, /\(d\) => typeMap\[dealTypeOf\(d\)\],/);
  assert.ok(at < src.indexOf('const byOwner = Object.values(ownerMap)'), 'ก่อนกรองถังผี');
  assert.match(src, /instRemaining: instRemainingTotals\.instRemaining,/);
  assert.match(src, /instRemainingCount: instRemainingTotals\.instRemainingCount,/);
  // บรรทัดตั้งต้นของถัง (…instRemainingFields()) มีช่องอื่นเป็น 0 อยู่แล้ว — ไม่ใช่การบวก
  for (const line of src.split('\n').filter((l) => /instRemaining/.test(l) && !/\.\.\.instRemainingFields\(\)/.test(l))) {
    assert.doesNotMatch(line, /\b(won|wonValue|actual|target|gap|targetGap|fcTotal|weighted)\s*(\+=|:)/, line.trim());
  }
  // ส่วนต่างคาดการณ์ของดีล Won เทียบยอดปิดเต็ม ไม่ใช่ Actual ของเดือน
  assert.match(src, /const wonVariance = wonForecastValue - wonDeals\.reduce\(\(sum, d\) => sum \+ dealClosedValueOf\(d\), 0\);/);
});

/* ── 5. ลิ้นชักรายดีล + แดชบอร์ดของฉัน: กติกาเดียวกับ API ─────────────────────────────────────── */
const modal = readFileSync(join(ROOT, 'src/components/salesPlanning/DealDrillDownModal.js'), 'utf8');

test('ลิ้นชัก "ยอด Won": ดีลที่แตกหลายเดือนโผล่ทุกงวดที่มี Actual ด้วยส่วนของงวดนั้น · ผลรวม = ช่องของ API', () => {
  const deals = [orderDeal(), installmentDeal(), orderDeal({ ownerId: 'u7', wonValue: 0, metadata: {} })];
  // ตัวกรองของลิ้นชัก (ยามซอร์สข้างล่างตรึงว่าเป็นสูตรนี้) — Won + (wonMonth ในงวด หรือ มี Actual ในงวด)
  const wonInPeriod = (d, inPeriod) => isWonDeal(d) && (inPeriod(wonMonthOf(d)) || hasActualInPeriod(d, inPeriod));
  for (const months of [['2026-08'], ['2026-10'], ['2026-07', '2026-08', '2026-09'], ['2026-10', '2026-11', '2026-12']]) {
    const inPeriod = (mk) => months.includes(mk);
    const listed = deals.filter((d) => wonInPeriod(d, inPeriod));
    const drawerTotal = listed.reduce((s, d) => s + actualInPeriodOf(d, inPeriod), 0);
    const apiTotal = months.reduce((s, m) => s + rollupMonthActual(deals, m), 0);
    assert.equal(Math.round(drawerTotal * 100) / 100, Math.round(apiTotal * 100) / 100, months.join(','));
  }
  const oct = deals.filter((d) => wonInPeriod(d, (m) => m === '2026-10'));
  assert.deepEqual(oct.map((d) => d.ownerId), ['u2'], 'ดีลรายงวด (Won ส.ค.) โผล่ใน ต.ค. ด้วยงวด 2');
  const src = codeOnly(modal);
  assert.match(src, /const wonInPeriod = \(d, inPeriod\) => isWonDeal\(d\) && \(inPeriod\(wonMonthOf\(d\)\) \|\| hasActualInPeriod\(d, inPeriod\)\);/);
  assert.match(src, /filtered = filtered\.filter\(\(d\) => wonInPeriod\(d, inPeriod\)\);/);
});

test('ลิ้นชัก "รอนับรายงวด": ตัวพับเดือนเดียวกับ API (นาฬิกาตอนโหลด) · ยอดรวมของรายการไม่ปนเข้า Actual', () => {
  const src = codeOnly(modal);
  assert.match(src, /const INST_REMAINING_METRIC = "instRemaining";/);
  assert.match(src, /filtered = filtered\.filter\(\(d\) => instRemainingInPeriodOf\(d, inPeriod, currentMonth\(now\)\) > 0\);/);
  assert.match(src, /if \(isInstRemainingMetric\) return instRemainingOf\(deal\);/);
  assert.match(src, /const asOfMonth = pendingAsOf \? currentMonth\(pendingAsOf\) : null;/, 'นาฬิกาตอนโหลด ไม่ใช่ตอนเรนเดอร์');
  // รายการ "ยอด Won": บรรทัดรองรอนับรายงวดไม่ถูกบวกเข้ายอดรวม (ยอดรวม = amountOf ซึ่งเป็น Actual ของงวด)
  assert.match(src, /const showInstRemainingSubLine = \(deal\) => filter\.metric === "won" && instRemainingOf\(deal\) > 0;/);
  assert.match(src, /const totalValue = deals\.reduce\(\(sum, deal\) => sum \+ amountOf\(deal\), 0\);/);
  // ตัวเรียก (บอร์ดเช้า) เปิด metric นี้ด้วยงวดที่ดูอยู่
  const board = codeOnly(readFileSync(join(ROOT, 'src/components/salesPlanning/dashboard/performance/MorningBoard.js'), 'utf8'));
  assert.match(board, /onClick=\{\(\) => openMetricDeals\(row, isTeam, "instRemaining"\)\}/);
});

test('แดชบอร์ดของฉัน: Actual ของงวด = ส่วนของเดือนในงวด · ใบทั้งใบเท่าเดิม · กองรอนับรายงวดแยกช่อง', async () => {
  const { summarizeMyDeals } = await import('./myDashboardTotals.js');
  const deals = [orderDeal(), installmentDeal({ ownerId: 'u1' })];
  const oct = summarizeMyDeals(deals, { month: '2026-10', target: 100000, now: NOW });
  assert.equal(oct.wonValue, 31152.3, 'ต.ค. = งวด 2 ของใบรายงวดเท่านั้น');
  assert.equal(oct.targetGap, 100000 - 31152.3, 'ส่วนต่างเป้า = Actual ล้วน');
  assert.equal(oct.instRemaining, 0, 'งวด 3 ครบกำหนด ธ.ค.');
  const aug = summarizeMyDeals(deals, { month: '2026-08', now: NOW });
  assert.equal(aug.wonValue, 100000 + 31152.64);
  const dec = summarizeMyDeals(deals, { month: '2026-12', now: NOW });
  assert.deepEqual([dec.wonValue, dec.instRemaining, dec.instRemainingCount], [0, 31153, 1]);
  const year = summarizeMyDeals(deals, { month: '2026-10', year: '2026', now: NOW });
  assert.equal(year.wonValue, 100000 + 62304.94);
  assert.equal(year.instRemaining, 31153);
  // ใบทั้งใบล้วน = สูตรเดิม (ดีล Won ที่ wonMonth อยู่ในงวด · wonAmountOf)
  const only = [orderDeal(), orderDeal({ ownerId: 'u2', wonValue: 0.29, metadata: { actualSource: 'sale_order', wonMonth: '2026-09' } })];
  for (const month of ['2026-08', '2026-09', '2026-10']) {
    const legacy = only.filter((d) => isWonDeal(d) && wonMonthOf(d) === month).reduce((s, d) => s + wonAmountOf(d), 0);
    assert.equal(summarizeMyDeals(only, { month, now: NOW }).wonValue, legacy, month);
  }
});

/* ── 6. จอแท็บผลงานขาย: เส้นใหม่ถูกวาด + คำ "นับอะไร" (ยามซอร์ส — ไฟล์ JSX import ในเทสต์ไม่ได้) ───────── */
test('จอผลงานขาย: แถบนับ "รอนับรายงวด" ในสเกล · คำอธิบายยอดคาดพูดถึงกองนี้ · บอร์ดมีบรรทัดรอง', () => {
  const read = (rel) => codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
  const shared = read('src/components/salesPlanning/dashboard/performance/shared.js');
  assert.match(shared, /PROJECTION_BASIS =\s*`\$\{PROJECTION_LABEL\} = Actual \+ \$\{PENDING_APPROVAL_LABEL\} \+ \$\{INSTALLMENT_REMAINING_LABEL\} \+ \$\{WON_AWAITING_SO_LABEL\} \+ \$\{FC_REMAINING_LABEL\}/);
  assert.match(shared, /nonNegative\(stat\?\.instRemaining\)/, 'สเกลของแถบต้องครอบกองนี้');
  assert.match(shared, /\{stat\.instRemaining > 0 && <i className=\{instStyles\.seg\}/);
  assert.match(shared, /export function InstRemainingAmount\(/);
  const bar = read('src/components/salesPlanning/dashboard/performance/YearProgressBar.js');
  assert.match(bar, /"--perf-inst-w": w\(stat\.instRemaining\)/);
  assert.match(bar, /<InstRemainingAmount inline amount=\{stat\.instRemaining\} count=\{stat\.instRemainingCount\} \/>/);
  const board = read('src/components/salesPlanning/dashboard/performance/MorningBoard.js');
  assert.match(board, /\{pendingLine\}\{instRemainingLine\}\{wonAwaitingLine\}/);
  assert.match(board, /\$\{PENDING_APPROVAL_LABEL\} \+ \$\{INSTALLMENT_REMAINING_LABEL\} \+ \$\{WON_AWAITING_SO_LABEL\} \+ FC คงเหลือ/);
  const drill = read('src/components/salesPlanning/dashboard/performance/DrillSection.js');
  assert.match(drill, /instRemaining: Array\(12\)\.fill\(0\),\s*instRemainingCount: Array\(12\)\.fill\(0\),/);
});
