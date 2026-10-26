// ── /sahamit/material: เลขบนการ์ด = แถวที่ตารางวาดหลังกดการ์ด (ตรวจตัวเลข L6 · 26/10/2026) ──────────────
// 🐞 การ์ดสี่ใบเคยเป็น <div> กดไม่ได้ นับจากทุกแถว ขณะที่ตารางกรองด้วยคำค้น/ตัวกรองที่ค้างอยู่
// ⭐ การ์ด = ตัวกรองทั้งชุด (MATERIAL_CARD_FILTERS) · ตารางกับการ์ดถาม materialRowMatches ตัวเดียวกัน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEAD_OUT_FC, MATERIAL_CARD_FILTERS, materialCardCounts, materialRowMatches } from './material.js';
import { lineStage } from './po.js';

// ทางเดียวกับ rowStage ของหน้า (stage ปัจจุบันจาก PM/RM + สถานะที่กดเดิน)
const stageOf = (r) => lineStage(r.status, !!r.tracking?.pmArrivedAt, !!r.tracking?.rmArrivedAt);

const row = (id, over = {}) => ({
  poLineId: id, fgCode: `01-${id}`, productName: `สินค้า ${id}`, poNumber: `PO-${id}`,
  status: 'open', inForecast: true, lateVsDue: false, ourSlip: false, tracking: {}, ...over,
});

const ROWS = [
  row('A', { inForecast: false }),
  row('B', { inForecast: false, lateVsDue: true }),
  row('C', { lateVsDue: true, tracking: { pmArrivedAt: '2026-10-01', rmArrivedAt: '2026-10-02' } }),
  row('D', { ourSlip: true, status: 'delivered' }),
  row('E', { inForecast: false, ourSlip: true, lateVsDue: true, status: 'delivered' }),
  row('F', { productName: 'ลาเวนเดอร์' }),
];

/* จำลองจอ: state ตัวกรองที่ค้าง → กดการ์ด (pickCard = ตั้งทั้งชุด + ล้างคำค้น) → แถวที่ตารางวาด */
const tableRows = (state) => ROWS.filter((r) => materialRowMatches(r, state, stageOf));
const afterCardClick = (key) => {
  const set = MATERIAL_CARD_FILTERS[key];
  return tableRows({ q: '', fc: [...set.fc], stages: [...set.stages], issues: [...set.issues] });
};

test('เลขบนการ์ดทุกใบ = จำนวนแถวหลังกดการ์ดใบนั้น', () => {
  const counts = materialCardCounts(ROWS, stageOf);
  assert.deepEqual(counts, { all: 6, outFc: 3, late: 3, slip: 2 });
  for (const key of Object.keys(MATERIAL_CARD_FILTERS)) {
    assert.equal(afterCardClick(key).length, counts[key], key);
  }
});

test('การ์ดนับไม่ขยับตามคำค้น/สถานะที่ค้างอยู่ — และกดแล้วล้างของที่ค้าง ตารางเท่าเลขเสมอ', () => {
  // ก่อนกด: ค้นหา "ลาเวนเดอร์" + สถานะ "ส่งแล้ว" ค้างไว้ ⇒ ตารางว่าง แต่การ์ดยังบอกยอดของชุดตัวเอง
  assert.equal(tableRows({ q: 'ลาเวนเดอร์', fc: [], stages: ['delivered'], issues: [] }).length, 0);
  const counts = materialCardCounts(ROWS, stageOf);
  assert.equal(counts.outFc, 3);
  // ถ้ากดการ์ดแล้ว "เพิ่ม" ตัวกรองเข้าไปแทนที่จะตั้งทั้งชุด ตารางจะไม่เท่าเลข — ยืนยันว่าชุดของการ์ดล้างช่องอื่นหมด
  for (const set of Object.values(MATERIAL_CARD_FILTERS)) {
    assert.deepEqual(Object.keys(set).sort(), ['fc', 'issues', 'stages']);
  }
  assert.equal(afterCardClick('outFc').length, counts.outFc);
});

test('ตัวตัดสินแถว — คำค้นจับรหัส/ชื่อ/เลข PO · ในแผน · สถานะ · ปัญหา (late หรือ slip)', () => {
  const ids = (state) => tableRows({ q: '', fc: [], stages: [], issues: [], ...state }).map((r) => r.poLineId);
  assert.deepEqual(ids({ q: 'po-c' }), ['C']);
  assert.deepEqual(ids({ q: '  ลาเวน ' }), ['F']);
  assert.deepEqual(ids({ fc: ['in'] }), ['C', 'D', 'F']);
  assert.deepEqual(ids({ stages: ['ready_produce'] }), ['C']);
  assert.deepEqual(ids({ issues: ['late', 'slip'] }), ['B', 'C', 'D', 'E']);
  // แถวที่ไม่มีชื่อสินค้า/รหัส ไม่พัง และไม่ถูกจับด้วยคำว่า "null"
  assert.equal(materialRowMatches({ fgCode: null, productName: null, poNumber: null }, { q: 'null' }), false);
});

/* ── ยามรูปโค้ดของหน้า — การ์ดเป็นปุ่มจริงที่ตั้งตัวกรองทั้งชุด · ตารางใช้ตัวตัดสินเดียวกัน ── */
const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const PAGE = live(readFileSync(new URL('../../app/sahamit/material/page.js', import.meta.url), 'utf8'));

test('หน้าวัสดุ: การ์ดสี่ใบเป็น KpiCard ที่กดได้ · ตารางกับการ์ดเรียก materialRowMatches/materialCardCounts', () => {
  assert.doesNotMatch(PAGE, /const Stat\b/, 'การ์ด <div> กดไม่ได้ต้องไม่กลับมา');
  const cards = PAGE.match(/<KpiCard\b(?:(?!\/>)[\s\S])*\/>/g) || [];
  assert.equal(cards.length, 4);
  for (const key of ['all', 'outFc', 'late', 'slip']) {
    assert.ok(cards.some((c) => c.includes(`pickCard("${key}")`) && c.includes(`stats.${key}`)), key);
  }
  assert.match(PAGE, /materialRowMatches\(r, \{ q, fc: fcSel, stages: stageSel, issues: issueSel \}, rowStage\)/);
  assert.match(PAGE, /materialCardCounts\(rows, rowStage\)/);
  // กดการ์ด = ตั้งทั้งชุดและล้างคำค้น
  const pick = PAGE.match(/const pickCard = [\s\S]*?\n {2}\};/)?.[0] || '';
  for (const call of ['setSearch("")', 'setFcSel(', 'setStageSel(', 'setIssueSel(']) assert.ok(pick.includes(call), call);
});

test('ป้าย "นอก FC" บอกหน่วยวันทำการ ไม่ใช่ "(90 วัน)" ที่อ่านเป็นช่วงย้อนหลัง', () => {
  assert.equal(LEAD_OUT_FC, 90);
  assert.match(PAGE, /`นอก FC \(lead \$\{LEAD_OUT_FC\} วันทำการ\)`/);
  assert.doesNotMatch(PAGE, /นอก FC \(90 วัน\)/);
});
