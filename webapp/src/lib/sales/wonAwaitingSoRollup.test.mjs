// ── "Won รอยื่น SO" บน API แดชบอร์ด + ลิ้นชักรายดีล (มติผู้ใช้ 2026-09-14) ──────────
//
// ดีล Won ที่ยังไม่มี SO อนุมัติและไม่มี SO รออนุมัติ ⇒ ยอดคาดการณ์นับด้วยมูลค่าดีล (กองที่สาม)
// GET /api/sales-planning/dashboard ส่ง `wonAwaitingSo` + `wonAwaitingSoCount` ใน totals /
// byOwner[] / byTeam[] / byType[] · ลิ้นชัก metric 'wonAwaitingSo' ต้องได้ดีลชุดเดียวกัน
//
// ล็อกไว้:
//   1. ถัง: สองช่องตั้งต้น 0 · บวกแค่ช่องของตัวเอง · ดีลที่ไม่ใช่รอยื่นได้ +0
//   2. ยอดรวม = ผลรวมของ wonDeals ชุดเดียวกับลูป Won (รออนุมัติ/อนุมัติแล้ว/เปิด/แพ้ ไม่นับ)
//   3. ตัวกรองลิ้นชัก = ถังเดือนของ API (ดีลไม่มีเดือนไม่นับ แม้งวด "ทุกงวด")
//   4. ยามซอร์สของ route (ขี่กิ่ง Won ทั้งสามลูป · ไม่แตะ Actual/FC/รออนุมัติ) และของลิ้นชัก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addWonAwaitingSo,
  hasWonAwaitingSo,
  rollupWonAwaitingSo,
  wonAwaitingSoFields,
  wonAwaitingSoInPeriod,
} from './wonAwaitingSoRollup.js';
import { isWonDeal, wonMonthOf } from './dashboardMetrics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const route = readFileSync(join(ROOT, 'src/app/api/sales-planning/dashboard/route.js'), 'utf8');
const modal = readFileSync(join(ROOT, 'src/components/salesPlanning/DealDrillDownModal.js'), 'utf8');
const modalCss = readFileSync(join(ROOT, 'src/components/salesPlanning/DealDrillDownModal.module.css'), 'utf8');

// คอมเมนต์บล็อกแทนด้วยช่องว่าง (คงบรรทัด) — ยามรายบรรทัดต้องไม่สะดุดคำอธิบายกติกา
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// รูปจริงบน prod 2026-09-14: รับใบเสนอราคาแล้ว (Won) · SO ยังเป็นร่าง · Actual 0 · ไม่มีใบรออนุมัติ
const awaiting = (over = {}) => ({
  stage: 'won',
  ownerId: 'u-ka1',
  ownerName: 'KA หนึ่ง',
  team: 'KA',
  dealType: 'NPD',
  projectValue: 120000,
  wonValue: 0,
  confirmedAt: '2026-09-02T03:00:00Z',
  forecastMonth: '2026-09',
  metadata: { actualSource: 'sale_order', wonMonth: null, wonValueExVat: 0 },
  ...over,
});
const pendingOnly = (over = {}) => awaiting({
  metadata: { actualSource: 'sale_order', wonMonth: null, soPendingAmount: 120000, soPendingCount: 1 },
  ...over,
});
const approved = (over = {}) => awaiting({
  wonValue: 90000,
  metadata: { actualSource: 'sale_order', wonMonth: '2026-09', wonValueExVat: 90000 },
  ...over,
});

const byMonth = (month) => (mk) => mk === month;
const byYear = (year) => (mk) => String(mk || '').startsWith(`${year}-`);
const allPeriods = () => true;

// ── ถัง ──────────────────────────────────────────────────────────────────────────
test('ช่องตั้งต้นเป็น 0 ทั้งคู่ และได้ออบเจกต์ใหม่ทุกครั้ง (ถังไม่แชร์ช่องกัน)', () => {
  assert.deepEqual(wonAwaitingSoFields(), { wonAwaitingSo: 0, wonAwaitingSoCount: 0 });
  assert.notEqual(wonAwaitingSoFields(), wonAwaitingSoFields());
});

test('บวกลงถังแตะแค่สองช่องของตัวเอง — won/wonCount/fcTotal/gap/รออนุมัติ ไม่ขยับ', () => {
  const b = {
    target: 500000, won: 200000, wonCount: 3, fcTotal: 400000, weighted: 10, gap: 300000,
    pendingApproval: 7000, pendingApprovalCount: 1, ...wonAwaitingSoFields(),
  };
  const before = { ...b };
  addWonAwaitingSo(b, awaiting());
  assert.equal(b.wonAwaitingSo, 120000);
  assert.equal(b.wonAwaitingSoCount, 1);
  for (const key of ['target', 'won', 'wonCount', 'fcTotal', 'weighted', 'gap', 'pendingApproval', 'pendingApprovalCount']) {
    assert.equal(b[key], before[key], key);
  }
});

test('ดีลที่ไม่ใช่รอยื่น SO ได้ +0 · ถังเก่าที่ไม่มีช่องได้ตัวเลข ไม่ใช่ NaN · ถังว่างไม่พัง', () => {
  for (const d of [pendingOnly(), approved(), awaiting({ stage: 'quotation' }), awaiting({ stage: 'lost' })]) {
    const b = wonAwaitingSoFields();
    addWonAwaitingSo(b, d);
    assert.deepEqual(b, wonAwaitingSoFields(), JSON.stringify(d.metadata) + d.stage);
  }
  const legacy = addWonAwaitingSo({ won: 5 }, awaiting());
  assert.equal(legacy.wonAwaitingSo, 120000);
  assert.equal(legacy.wonAwaitingSoCount, 1);
  assert.equal(addWonAwaitingSo(null, awaiting()), null);
});

// ── ยอดรวม ──────────────────────────────────────────────────────────────────────
test('ยอดรวม: รอยื่นเท่านั้น — รออนุมัติ (รวมใบ 0 บาท) / อนุมัติแล้ว (รวมใบ 0 บาท) / เปิด / แพ้ ไม่นับ', () => {
  const deals = [
    awaiting(),
    awaiting({ stage: 'in_project', projectValue: 30000 }),
    awaiting({ projectValue: null }), // มูลค่าว่าง = ฿0 แต่ยังเป็นหนึ่งดีล
    pendingOnly(),
    pendingOnly({ metadata: { actualSource: 'sale_order', soPendingAmount: 0, soPendingCount: 1 } }),
    approved(),
    approved({ wonValue: 0, metadata: { actualSource: 'sale_order', wonMonth: '2026-09', wonValueExVat: 0 } }),
    awaiting({ stage: 'quotation' }),
    awaiting({ stage: 'lost' }),
  ];
  assert.deepEqual(rollupWonAwaitingSo(deals), { wonAwaitingSo: 150000, wonAwaitingSoCount: 3 });
  assert.deepEqual(rollupWonAwaitingSo([]), wonAwaitingSoFields());
  assert.deepEqual(rollupWonAwaitingSo(null), wonAwaitingSoFields());
  assert.equal(hasWonAwaitingSo(awaiting({ projectValue: null })), true);
  assert.equal(hasWonAwaitingSo(pendingOnly()), false);
});

// ── ลิ้นชัก = ถังเดือนของ API ─────────────────────────────────────────────────────
test('ลิ้นชัก: เดือน = wonMonthOf (ไม่ใช่เดือน FC ไม่ใช่เดือนปัจจุบัน) · ทั้งปี · ทุกงวด', () => {
  const d = awaiting({ confirmedAt: '2026-08-20T03:00:00Z', forecastMonth: '2026-10' });
  assert.equal(wonAwaitingSoInPeriod(d, byMonth('2026-08')), true);
  assert.equal(wonAwaitingSoInPeriod(d, byMonth('2026-10')), false, 'เดือน FC เดิมไม่ใช่ถังของดีล Won');
  assert.equal(wonAwaitingSoInPeriod(d, byMonth('2026-09')), false);
  assert.equal(wonAwaitingSoInPeriod(d, byYear(2026)), true);
  assert.equal(wonAwaitingSoInPeriod(d, byYear(2025)), false);
  assert.equal(wonAwaitingSoInPeriod(d, allPeriods), true);
});

test('ลิ้นชัก: ดีลไม่มีเดือนเลย = API ไม่เคยนับ ⇒ งวด "ทุกงวด" ต้องไม่โชว์ · ดีลที่ไม่ใช่รอยื่นไม่โชว์', () => {
  const noMonth = awaiting({ confirmedAt: null, forecastMonth: null });
  assert.equal(wonMonthOf(noMonth), null);
  assert.equal(wonAwaitingSoInPeriod(noMonth, allPeriods), false);
  for (const d of [pendingOnly(), approved(), awaiting({ stage: 'quotation' })]) {
    assert.equal(wonAwaitingSoInPeriod(d, allPeriods), false);
  }
});

test('ลิ้นชักกับ API ได้ดีลชุดเดียวกันทุกเดือน และทั้งปี = ผลรวม 12 เดือน', () => {
  const deals = [
    awaiting(),
    awaiting({ confirmedAt: '2026-03-10T03:00:00Z' }),
    awaiting({ confirmedAt: null, forecastMonth: '2026-11', projectValue: 45000 }),
    awaiting({ confirmedAt: '2025-12-15T03:00:00Z', projectValue: 9000 }), // ปีก่อน — ไม่อยู่ในปีนี้
    awaiting({ confirmedAt: null, forecastMonth: null, projectValue: 77000 }),
    pendingOnly(),
    approved(),
    awaiting({ stage: 'quotation' }),
  ];
  let yearSum = 0;
  let yearCount = 0;
  for (let m = 1; m <= 12; m += 1) {
    const month = `2026-${String(m).padStart(2, '0')}`;
    // ถังเดือนของ route: wonDeals = isWonDeal && wonMonthOf === month
    const api = rollupWonAwaitingSo(deals.filter((d) => isWonDeal(d) && wonMonthOf(d) === month));
    const drill = deals.filter((d) => wonAwaitingSoInPeriod(d, byMonth(month)));
    assert.equal(drill.length, api.wonAwaitingSoCount, month);
    assert.deepEqual(rollupWonAwaitingSo(drill), api, month);
    yearSum += api.wonAwaitingSo;
    yearCount += api.wonAwaitingSoCount;
  }
  const yearDrill = rollupWonAwaitingSo(deals.filter((d) => wonAwaitingSoInPeriod(d, byYear(2026))));
  assert.deepEqual(yearDrill, { wonAwaitingSo: yearSum, wonAwaitingSoCount: yearCount });
  assert.deepEqual(yearDrill, { wonAwaitingSo: 285000, wonAwaitingSoCount: 3 });
});

// ── ยามซอร์สของ route (route.js export ได้แค่ HTTP handler — เรียกตรงไม่ได้) ──────
test('route: ทุกถัง (หมวด · คน · ทีม รวมถังที่มีแต่เป้า) ตั้งต้นสองช่องเป็น 0', () => {
  assert.match(route, /import \{ addWonAwaitingSo, rollupWonAwaitingSo, wonAwaitingSoFields \} from '@\/lib\/sales\/wonAwaitingSoRollup';/);
  assert.equal((route.match(/\.\.\.pendingApprovalFields\(\), \.\.\.wonAwaitingSoFields\(\)/g) || []).length, 3,
    'typeMap · ownerBucket · teamBucket — ถังที่เกิดจากเป้าก็ผ่านตัวสร้างถังชุดเดียวกัน');
  assert.equal((route.match(/\.\.\.wonAwaitingSoFields\(\)/g) || []).length, 3);
});

test('route: บวกยอดในกิ่ง Won ของทั้งสามลูป ด้วยถัง `b` ตัวเดียวกับ wonCount (ถังไม่ใช่ชุดใหม่)', () => {
  const src = codeOnly(route);
  const heads = [
    'const b = typeMap[dealTypeOf(d)];',
    'const b = ownerBucket(d.ownerId, d.ownerName, d.team);',
    'const b = teamBucket(d.team);',
  ];
  for (const head of heads) {
    const at = src.indexOf(head);
    assert.ok(at > 0, head);
    const loop = src.slice(at, src.indexOf('\n  }\n', at));
    assert.match(loop, /if \(isWon\(d\)\) \{[^}]*\.wonCount \+= 1;[^}]*addWonAwaitingSo\(b, d\);\s*\}/, head);
    assert.equal((loop.match(/addWonAwaitingSo\(/g) || []).length, 1, `${head} — บวกครั้งเดียวต่อดีล`);
  }
  assert.equal((src.match(/addWonAwaitingSo\(b, d\);/g) || []).length, 3);
  // ลูปคน/ทีม: ดีลชุดเดียวกับ Won (open + won + lost ของเดือน) · ลูปหมวด: monthDeals
  assert.match(src, /const wonDeals = visibleDeals\.filter\(\(d\) => isWon\(d\) && wonMonth\(d\) === month\);/);
});

test('route: ยอดรวมบริษัทมาจาก wonDeals (ถังเดือนเดียวกับลูป) ไม่ใช่ visibleDeals ทั้งก้อน', () => {
  const src = codeOnly(route);
  assert.match(src, /const wonAwaitingSoTotals = rollupWonAwaitingSo\(wonDeals\);/);
  assert.doesNotMatch(src, /rollupWonAwaitingSo\(visibleDeals/);
  assert.match(src, /wonAwaitingSo: wonAwaitingSoTotals\.wonAwaitingSo,/);
  assert.match(src, /wonAwaitingSoCount: wonAwaitingSoTotals\.wonAwaitingSoCount,/);
  // บวกลงถังก่อนกรองถังผี (ถังที่มียอดนี้มี wonCount ≥ 1 อยู่แล้ว แต่ลำดับต้องไม่กลับ)
  assert.ok(src.lastIndexOf('addWonAwaitingSo(b, d);') < src.indexOf('const byOwner = Object.values(ownerMap)'));
});

test('route: ยอดรอยื่น SO ไม่ไหลเข้า Actual / FC / เป้า / ขาด-เกิน / รออนุมัติ', () => {
  const lines = codeOnly(route).split('\n').filter((l) => /wonAwaitingSo/i.test(l) && !/^\s*\/\//.test(l));
  assert.ok(lines.length >= 8);
  for (const line of lines) {
    assert.doesNotMatch(line,
      /\b(won|wonValue|wonCount|actual|gap|targetGap|wonVariance|fcTotal|wonForecastValue|weighted|fcRemaining|pendingApproval|pendingApprovalCount|remainingForecast|fullForecast|targetAmount)\s*(\+=|=[^=>])/,
      `บรรทัดนี้เอายอดรอยื่น SO ไปปนช่องอื่น: ${line.trim()}`);
  }
  assert.doesNotMatch(route, /(wonValue|won|pendingApproval|targetGap|weightedForecast|remainingForecast):\s*[^,\n]*wonAwaitingSo/);
  assert.match(route, /targetGap: targetAmount - wonValue,/);
  assert.equal((route.match(/gap: b\.target - b\.won/g) || []).length, 2, 'ขาด/เกินรายคน/ทีมยังคิดจาก Actual ล้วน');
});

// ── ลิ้นชักรายดีล ──────────────────────────────────────────────────────────────
test('modal: metric wonAwaitingSo กรองด้วยตัวจับคู่กลาง · ป้าย/คำอธิบาย/หัวคอลัมน์ · ยอดแถว = มูลค่าดีล', () => {
  assert.match(modal, /const WON_AWAITING_SO_METRIC = "wonAwaitingSo";/);
  const branch = modal.slice(modal.indexOf('filter.metric === WON_AWAITING_SO_METRIC) {'), modal.indexOf('filter.metric === PENDING_APPROVAL_METRIC) {'));
  assert.ok(branch.length > 0, 'ต้องมีกิ่ง wonAwaitingSo ในสายกรอง');
  assert.match(branch, /filtered = filtered\.filter\(\(d\) => wonAwaitingSoInPeriod\(d, inPeriod\)\);/);
  // อยู่ก่อน else สุดท้าย (metric ที่ไม่ลงทะเบียน = รายการว่าง) — ลงทะเบียนจริง ไม่ใช่หลุดไปกิ่งว่าง
  const chain = modal.slice(modal.indexOf('if (filter.metric === "won")'), modal.indexOf('setDeals(filtered);'));
  assert.ok(chain.indexOf('WON_AWAITING_SO_METRIC') < chain.lastIndexOf('filtered = [];'));
  assert.match(modal, /\[WON_AWAITING_SO_METRIC\]: WON_AWAITING_SO_LABEL,/);
  assert.match(modal, /\[WON_AWAITING_SO_METRIC\]: "ดีลปิด Won แล้ว แต่ยังไม่มีใบสั่งขายที่อนุมัติหรือรออนุมัติ — นับในยอดคาดการณ์ด้วยมูลค่าดีล ยังไม่ใช่ Actual",/);
  assert.match(modal, /amountHeader = "มูลค่าดีล \(บาท\)";/);
  assert.match(modal, /<th className="num">\{amountHeader\}<\/th>/);
  assert.match(modal, /if \(isWonAwaitingSoMetric\) return wonAwaitingSoAmountOf\(deal\);/);
  // ป้ายมาจากตัวกลางเท่านั้น — ห้ามสะกดเองในโค้ด (คอมเมนต์อ้างถึงคำนี้ได้)
  assert.doesNotMatch(codeOnly(modal), /["']Won รอยื่น SO["']/);
});

test('modal: รายการ "ยอด Won" ได้บรรทัดรอง "Won รอยื่น SO" ผ่านคลาส CSS module · ยอดรวมยังเป็น Actual ล้วน', () => {
  // งวดผ่านตัวจับคู่กลาง — ดีล Won ไม่มีเดือน (API ไม่นับ) ในรายการ Won "ทุกงวด" ต้องไม่ได้บรรทัดยอด
  assert.match(modal, /const showAwaitingSoSubLine = \(deal\) => filter\.metric === "won" && wonAwaitingSoInPeriod\(deal, inPeriod\);/);
  assert.equal(wonAwaitingSoInPeriod(awaiting({ confirmedAt: null, forecastMonth: null }), allPeriods), false);
  assert.equal((codeOnly(modal).match(/wonAwaitingSoInPeriod\(d(eal)?, inPeriod\)/g) || []).length, 2,
    'ลิ้นชัก metric wonAwaitingSo กับบรรทัดรองในรายการ Won ใช้กติกางวดชุดเดียวกัน');
  const at = modal.indexOf('{showAwaitingSoSubLine(deal) && (');
  assert.ok(at > 0);
  const subLine = modal.slice(at, modal.indexOf('</span>', at));
  assert.match(subLine, /className=\{styles\.awaitingSoSubLine\}/);
  assert.match(subLine, /\{WON_AWAITING_SO_LABEL\} \{money\(wonAwaitingSoAmountOf\(deal\)\)\}/);
  assert.doesNotMatch(subLine, /style=\{\{/, 'audit:ui — เพดาน inline style ของโมดูลขาย');
  assert.match(codeOnly(modalCss), /\.awaitingSoSubLine \{[^}]*line-height: var\(--lh-thai\);/);
  // ยอดรวมของรายการไม่รวมบรรทัดรอง
  assert.match(modal, /const totalValue = deals\.reduce\(\(sum, deal\) => sum \+ amountOf\(deal\), 0\);/);
  assert.match(modal, /isWonDeal\(deal\) && filter\.metric === "won" \? wonAmountOf\(deal\) : forecastAmount\(deal\)/);
});
