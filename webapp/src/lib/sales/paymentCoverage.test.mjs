// ── งวดครอบช่วงบริการ + "จ่ายถึง" (mig 0320) — logic ล้วน ทดสอบได้โดยไม่แตะ DB ──
//
// สิ่งที่ชุดนี้ล็อกไว้ คือกติกาที่ถ้าหลุดแล้วเงินกับงานจะเดินคนละทาง:
// `reported` ห้ามปลดด่าน · confirmed ที่ไม่มีช่วงครอบห้ามนับเป็นครอบตลอดกาล ·
// ใบที่ไม่มีงวดเลยต้องผ่าน (ใบยอด 0) · ช่วงซ้อน/เว้นเป็นคำเตือน ไม่ใช่ error
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  coverageRollup,
  coverageWarnings,
  coversDate,
  daysBetween,
  hasOverdueUnconfirmed,
  overdueUnconfirmed,
  paidThrough,
  splitCoverageEvenly,
} from './paymentCoverage.js';

const row = (over = {}) => ({ seq: 1, status: 'pending', ...over });
const paid = (seq, from, to, over = {}) =>
  row({ seq, status: 'confirmed', coversFrom: from, coversTo: to, ...over });

/* ── paidThrough ──────────────────────────────────────────────────────── */

test('ไม่มีงวดที่บัญชีรับรอง = ยังไม่ครอบอะไรเลย (null ไม่ใช่ค่าว่างที่แปลว่าผ่าน)', () => {
  assert.equal(paidThrough([]), null);
  assert.equal(paidThrough([row({ coversTo: '2569-12-31' })]), null);
  assert.equal(paidThrough(null), null);
});

test('⭐ "แจ้งแล้ว" ไม่ปลดด่าน — reported ไม่ขยับจ่ายถึง', () => {
  const rows = [row({ seq: 1, status: 'reported', coversFrom: '2026-09-01', coversTo: '2026-11-30' })];
  assert.equal(paidThrough(rows), null);
});

test('งวดที่ถูกตีกลับก็ยังไม่นับ — เงินยังไม่เข้า', () => {
  assert.equal(paidThrough([row({ status: 'rejected', coversTo: '2026-11-30' })]), null);
});

test('จ่ายถึง = วันสุดท้ายที่ไกลที่สุดของงวดที่รับรองแล้ว', () => {
  const rows = [
    paid(1, '2026-09-01', '2026-11-30'),
    paid(2, '2026-12-01', '2027-02-28'),
    row({ seq: 3, status: 'pending', coversFrom: '2027-03-01', coversTo: '2027-05-31' }),
  ];
  assert.equal(paidThrough(rows), '2027-02-28');
});

test('งวดรับรองแล้วแต่ไม่ได้กรอกช่วงครอบ ไม่นับ (ไม่ใช่ครอบตลอดกาล)', () => {
  const rows = [paid(1, '2026-09-01', '2026-11-30'), row({ seq: 2, status: 'confirmed' })];
  assert.equal(paidThrough(rows), '2026-11-30');
});

test('ลำดับในอาเรย์ไม่สำคัญ — เอาค่าที่ไกลที่สุดเสมอ', () => {
  const rows = [paid(2, '2026-12-01', '2027-02-28'), paid(1, '2026-09-01', '2026-11-30')];
  assert.equal(paidThrough(rows), '2027-02-28');
});

/* ── coversDate: ตัวที่ด่านเข้าไซต์เรียกจริง ───────────────────────────── */

test('⭐ ใบที่ไม่มีงวดเลย (ใบยอด 0) ผ่านด่านเงิน — ไม่มีอะไรให้จ่าย', () => {
  assert.equal(coversDate([], '2026-09-15'), true);
});

test('มีงวดแต่ยังไม่มีใบไหนรับรอง = ยังไปบริการไม่ได้', () => {
  const rows = [row({ coversFrom: '2026-09-01', coversTo: '2026-11-30' })];
  assert.equal(coversDate(rows, '2026-09-15'), false);
});

test('วันสุดท้ายที่เงินครอบยังเข้าได้ วันถัดไปเข้าไม่ได้', () => {
  const rows = [paid(1, '2026-09-01', '2026-11-30')];
  assert.equal(coversDate(rows, '2026-11-30'), true);
  assert.equal(coversDate(rows, '2026-12-01'), false);
});

test('ไม่รู้วันนัด = ตอบว่าไม่ผ่าน ไม่ใช่เดาว่าใช่', () => {
  assert.equal(coversDate([paid(1, '2026-09-01', '2026-11-30')], null), false);
  assert.equal(coversDate([paid(1, '2026-09-01', '2026-11-30')], '31/08/2569'), false);
});

/* ── งวดเลยกำหนดที่ยังไม่รับรอง ─────────────────────────────────────────── */

test('เลยกำหนดแล้วบัญชียังไม่รับรอง = ค้าง (รวมใบที่ถูกตีกลับ)', () => {
  const rows = [
    row({ seq: 1, status: 'confirmed', dueDate: '2026-09-05' }),
    row({ seq: 2, status: 'reported', dueDate: '2026-11-15' }),
    row({ seq: 3, status: 'rejected', dueDate: '2026-11-20' }),
  ];
  const late = overdueUnconfirmed(rows, '2026-12-01');
  assert.deepEqual(late.map((r) => r.seq), [2, 3]);
  assert.equal(hasOverdueUnconfirmed(rows, '2026-12-01'), true);
});

test('ถึงกำหนดวันนี้ยังไม่นับว่าเลยกำหนด', () => {
  const rows = [row({ dueDate: '2026-11-15', status: 'pending' })];
  assert.equal(hasOverdueUnconfirmed(rows, '2026-11-15'), false);
  assert.equal(hasOverdueUnconfirmed(rows, '2026-11-16'), true);
});

test('งวดที่ยังไม่กำหนดวัน ไม่ถือว่าเลยกำหนด', () => {
  assert.equal(hasOverdueUnconfirmed([row({ status: 'pending' })], '2026-12-01'), false);
});

/* ── สรุปสำหรับหัวการ์ด ─────────────────────────────────────────────────── */

test('สรุปบอกทั้งจ่ายถึง จำนวนค้าง และงวดที่รับรองแล้วแต่ไม่มีช่วงครอบ', () => {
  const rows = [
    paid(1, '2026-09-01', '2026-11-30'),
    row({ seq: 2, status: 'confirmed', reportedAt: 'x' }),
    row({ seq: 3, status: 'pending', dueDate: '2026-11-15' }),
  ];
  assert.deepEqual(coverageRollup(rows, '2026-12-01'), {
    total: 3,
    confirmedCount: 2,
    paidThrough: '2026-11-30',
    overdueCount: 1,
    confirmedWithoutCoverage: 1,
  });
});

/* ── คำเตือนช่วงครอบ (เตือน ไม่บล็อก) ───────────────────────────────────── */

test('ช่วงต่อกันสนิท = ไม่มีคำเตือน', () => {
  const rows = [paid(1, '2026-09-01', '2026-11-30'), paid(2, '2026-12-01', '2027-02-28')];
  assert.deepEqual(coverageWarnings(rows), []);
});

test('ช่วงซ้อนกันและช่วงที่เว้นว่าง ถูกรายงานคนละชนิด', () => {
  const overlap = coverageWarnings([
    paid(1, '2026-09-01', '2026-11-30'),
    paid(2, '2026-11-15', '2027-02-28'),
  ]);
  assert.equal(overlap[0].kind, 'overlap');

  const gap = coverageWarnings([
    paid(1, '2026-09-01', '2026-11-30'),
    paid(2, '2026-12-15', '2027-02-28'),
  ]);
  assert.equal(gap[0].kind, 'gap');
  assert.equal(gap[0].since, '2026-12-01');
  assert.equal(gap[0].until, '2026-12-14');
});

test('เทียบตาม seq ไม่ใช่ลำดับที่ API คืนมา', () => {
  const rows = [paid(2, '2026-12-01', '2027-02-28'), paid(1, '2026-09-01', '2026-11-30')];
  assert.deepEqual(coverageWarnings(rows), []);
});

test('กรอกมาข้างเดียว และงวดรับรองแล้วที่ไม่มีช่วงครอบ ต้องเตือน', () => {
  const half = coverageWarnings([row({ seq: 1, coversFrom: '2026-09-01' })]);
  assert.equal(half[0].kind, 'half_range');

  const blind = coverageWarnings([row({ seq: 1, status: 'confirmed' })]);
  assert.equal(blind[0].kind, 'confirmed_without_coverage');
});

/* ── เลขคณิตปฏิทิน ─────────────────────────────────────────────────────── */

test('บวกลบวันข้ามเดือน ข้ามปี และปีอธิกสุรทิน', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('ไม่ใช่วันที่', 1), null);
});

test('นับจำนวนวันระหว่างสองวัน', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-01'), 0);
  assert.equal(daysBetween('2026-09-01', '2026-11-30'), 90);
  assert.equal(daysBetween('2026-09-01', null), null);
});

/* ── ปุ่มแบ่งช่วงอัตโนมัติ ───────────────────────────────────────────────── */

test('แบ่งช่วงสัญญาเป็น 4 งวด ต่อกันสนิท ไม่ซ้อน ไม่เว้น', () => {
  const parts = splitCoverageEvenly({ startDate: '2026-09-01', endDate: '2027-08-31', count: 4 });
  assert.equal(parts.length, 4);
  assert.equal(parts[0].coversFrom, '2026-09-01');
  assert.equal(parts[3].coversTo, '2027-08-31');
  for (let i = 1; i < parts.length; i += 1) {
    assert.equal(parts[i].coversFrom, addDays(parts[i - 1].coversTo, 1));
  }
  assert.deepEqual(coverageWarnings(parts.map((p, i) => paid(i + 1, p.coversFrom, p.coversTo))), []);
});

test('⭐ งวดสุดท้ายกินเศษ — วันจบท่อนสุดท้ายต้องเท่ากับวันจบสัญญาเป๊ะ', () => {
  const parts = splitCoverageEvenly({ startDate: '2026-01-01', endDate: '2026-12-31', count: 5 });
  assert.equal(parts.at(-1).coversTo, '2026-12-31');
  assert.equal(daysBetween(parts[0].coversFrom, parts[0].coversTo) + 1, 73);
});

test('งวดเดียว = ครอบทั้งสัญญา', () => {
  assert.deepEqual(splitCoverageEvenly({ startDate: '2026-09-01', endDate: '2027-08-31', count: 1 }), [
    { coversFrom: '2026-09-01', coversTo: '2027-08-31' },
  ]);
});

test('ข้อมูลไม่ครบหรือช่วงสั้นกว่าจำนวนงวด = ไม่เดาให้', () => {
  assert.deepEqual(splitCoverageEvenly({ startDate: '2026-09-01', count: 4 }), []);
  assert.deepEqual(splitCoverageEvenly({ startDate: '2026-09-01', endDate: '2026-09-02', count: 4 }), []);
  assert.deepEqual(splitCoverageEvenly({ startDate: '2026-09-01', endDate: '2027-08-31', count: 0 }), []);
  assert.deepEqual(splitCoverageEvenly(), []);
});
