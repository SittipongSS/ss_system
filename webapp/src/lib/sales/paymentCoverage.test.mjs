// ── งวดครอบช่วงบริการ + "จ่ายถึง" (mig 0320) — logic ล้วน ทดสอบได้โดยไม่แตะ DB ──
//
// สิ่งที่ชุดนี้ล็อกไว้ คือกติกาที่ถ้าหลุดแล้วเงินกับงานจะเดินคนละทาง:
// `reported` ห้ามปลดด่าน · confirmed ที่ไม่มีช่วงครอบห้ามนับเป็นครอบตลอดกาล ·
// ใบที่ไม่มีงวดเลยต้องผ่าน (ใบยอด 0) · ช่วงซ้อน/เว้นเป็นคำเตือน ไม่ใช่ error
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  coverageContinuityErrors,
  coverageIsContinuous,
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

/* ⭐ fail-closed ทุกทาง — เคยเขียนให้ "ไม่มีแถว = ผ่าน" แล้วพบว่ามันเป็นกติกาที่สอง
   ที่กว้างกว่า `paymentNotRequired` ของจริง: ใบเก่าที่ยอดไม่เป็นศูนย์แต่ยังไม่มีใครกด
   "เริ่มติดตามการชำระ" ก็ไม่มีแถวเหมือนกัน ⇒ ด่านจะเปิดให้ใบที่ยังไม่เคยเก็บเงินสักบาท */
test('⭐ ไม่มีงวด หรือยังไม่ได้โหลดงวดมา = ไม่ผ่าน (ห้าม fail-open)', () => {
  assert.equal(coversDate([], '2026-09-15'), false);
  assert.equal(coversDate(null, '2026-09-15'), false);
  assert.equal(coversDate(undefined, '2026-09-15'), false);
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

/* ── ช่วงครอบต่อเนื่องเต็มสัญญา — ด่านของใบย้อนหลัง (mig 0374) ─────────────────── */

const CONTRACT_2026 = { start: '2026-01-01', end: '2026-12-31' };
const span = (from, to, extra = {}) => ({ coversFrom: from, coversTo: to, ...extra });
const kinds = (errors) => errors.map((e) => e.kind);

test('⭐ ม็อก: ยกมา ม.ค.–ก.ย. + งวด ต.ค.–ธ.ค. = ครอบต่อเนื่องเต็มสัญญา 2026', () => {
  const rows = [span('2026-01-01', '2026-09-30'), span('2026-10-01', '2026-12-31')];
  assert.deepEqual(coverageContinuityErrors(rows, CONTRACT_2026), []);
  assert.equal(coverageIsContinuous(rows, CONTRACT_2026), true);
});

test('งวดเดียวครอบทั้งสัญญา = ต่อเนื่อง · ลำดับในอาเรย์ไม่สำคัญ (เรียงตามวันเริ่มครอบเหมือนฐาน)', () => {
  assert.equal(coverageIsContinuous([span('2026-01-01', '2026-12-31')], CONTRACT_2026), true);
  const shuffled = [span('2026-10-01', '2026-12-31'), span('2026-01-01', '2026-03-31'), span('2026-04-01', '2026-09-30')];
  assert.equal(coverageIsContinuous(shuffled, CONTRACT_2026), true);
});

test('ช่องโหว่ระหว่างงวด: บอกช่วงวันที่ขาดจริง + ชี้งวดที่เริ่มช้า', () => {
  const errors = coverageContinuityErrors(
    [span('2026-01-01', '2026-09-30'), span('2026-10-15', '2026-12-31', { seq: 2 })], CONTRACT_2026,
  );
  assert.deepEqual(errors, [{ kind: 'gap', seq: 2, index: 1, since: '2026-10-01', until: '2026-10-14' }]);
});

test('ช่วงซ้อน: บอกช่วงวันที่ซ้อน · งวดที่ซ้อนอยู่ข้างในงวดก่อนไม่ทำให้เกิดช่องโหว่ปลอมถัดไป', () => {
  const errors = coverageContinuityErrors([span('2026-01-01', '2026-09-30'), span('2026-09-01', '2026-12-31')], CONTRACT_2026);
  assert.deepEqual(errors, [{ kind: 'overlap', seq: null, index: 1, since: '2026-09-01', until: '2026-09-30' }]);
  const inside = coverageContinuityErrors(
    [span('2026-01-01', '2026-09-30'), span('2026-03-01', '2026-03-31'), span('2026-10-01', '2026-12-31')], CONTRACT_2026,
  );
  assert.deepEqual(kinds(inside), ['overlap'], 'ไม่มี gap ปลอมตามหลังงวดที่ซ้อน');
  assert.deepEqual([inside[0].since, inside[0].until], ['2026-03-01', '2026-03-31']);
});

test('เริ่มช้ากว่าวันเริ่มสัญญา / เริ่มก่อนสัญญา = start พร้อมช่วงวัน', () => {
  const late = coverageContinuityErrors([span('2026-02-01', '2026-12-31')], CONTRACT_2026);
  assert.deepEqual(late, [{ kind: 'start', seq: null, index: 0, since: '2026-01-01', until: '2026-01-31' }]);
  const early = coverageContinuityErrors([span('2025-12-01', '2026-12-31')], CONTRACT_2026);
  assert.deepEqual(early, [{ kind: 'start', seq: null, index: 0, since: '2025-12-01', until: '2025-12-31' }]);
});

test('จบก่อนวันสิ้นสุดสัญญา / เกินวันสิ้นสุด = end พร้อมช่วงวัน ชี้งวดสุดท้าย', () => {
  const short = coverageContinuityErrors([span('2026-01-01', '2026-09-30'), span('2026-10-01', '2026-11-30')], CONTRACT_2026);
  assert.deepEqual(short, [{ kind: 'end', seq: null, index: 1, since: '2026-12-01', until: '2026-12-31' }]);
  const over = coverageContinuityErrors([span('2026-01-01', '2027-01-15')], CONTRACT_2026);
  assert.deepEqual(over, [{ kind: 'end', seq: null, index: 0, since: '2027-01-01', until: '2027-01-15' }]);
});

test('งวดที่ไม่มีช่วงครอบที่ใช้ได้ = missing (ไม่กรอก · วันไม่มีจริง · เริ่มหลังสิ้นสุด) และไม่ไล่ต่อ', () => {
  const errors = coverageContinuityErrors([
    span('2026-01-01', '2026-09-30'),
    span('2026-10-01', null, { seq: 2 }),
    span('2026-02-30', '2026-12-31'),
    span('2026-12-31', '2026-10-01'),
  ], CONTRACT_2026);
  assert.deepEqual(errors.map((e) => [e.kind, e.index]), [['missing', 1], ['missing', 2], ['missing', 3]]);
  assert.equal(errors[0].seq, 2);
});

test('ไม่มีงวดเลย หรือช่วงสัญญาใช้ไม่ได้ = ไม่ครอบ (fail-closed) — ใบ ฿0 ผู้เรียกตัดสินเองก่อน', () => {
  assert.deepEqual(coverageContinuityErrors([], CONTRACT_2026), [
    { kind: 'missing', seq: null, index: null, since: '2026-01-01', until: '2026-12-31' },
  ]);
  assert.equal(coverageIsContinuous(null, CONTRACT_2026), false);
  assert.equal(coverageIsContinuous([span('2026-01-01', '2026-12-31')], { start: '2026-12-31', end: '2026-01-01' }), false);
  assert.equal(coverageIsContinuous([span('2026-01-01', '2026-12-31')], {}), false);
});

/* ⭐ ยามข้อ "ตัดสินเท่าฐานเป๊ะ" — แปลงลูปของ historical_so_check_installments มาตรง ๆ แล้วเทียบกับตัวจริง
   หลายพันชุดที่สุ่มแบบกำหนดเมล็ด (ทุกงวดมีช่วงที่ใช้ได้ — งวดที่ไม่มีช่วง ฐานตีกลับตั้งแต่ตรวจรายงวด) */
function sqlLoopPasses(rows, start, end) {
  const sorted = [...rows].sort((a, b) => (a.coversFrom === b.coversFrom
    ? (a.coversTo < b.coversTo ? -1 : a.coversTo > b.coversTo ? 1 : 0)
    : (a.coversFrom < b.coversFrom ? -1 : 1)));
  let expect = start;
  for (const row of sorted) {
    if (row.coversFrom !== expect) return false;
    expect = addDays(row.coversTo, 1);
  }
  return addDays(expect, -1) === end;
}

test('⭐ ผ่าน/ไม่ผ่าน เท่ากับลูปของฐานทุกชุด (สุ่ม 5,000 ชุด · เมล็ดตายตัว)', () => {
  let seed = 20260922;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const start = '2026-01-01';
  const end = '2026-03-31';
  let passes = 0;
  for (let round = 0; round < 5000; round += 1) {
    const count = 1 + rand(4);
    const rows = [];
    let cursor = addDays(start, rand(3) - 1);           // บางชุดเริ่มก่อน/ตรง/หลังวันเริ่มสัญญา
    for (let i = 0; i < count; i += 1) {
      const from = addDays(cursor, rand(5) === 0 ? rand(5) - 2 : 0); // ส่วนใหญ่ต่อสนิท บางงวดเว้น/ซ้อน
      const to = addDays(from, rand(60));
      rows.push(span(from, to));
      cursor = addDays(to, 1);
    }
    if (rand(2)) rows.push(span(start, addDays(start, rand(90)))); // บางชุดมีงวดซ้อนที่ต้นสัญญาเพิ่ม
    if (rand(3) === 0) rows[rows.length - 1].coversTo = end;      // บางชุดจบวันสิ้นสุดพอดี
    const valid = rows.every((r) => r.coversFrom <= r.coversTo);
    if (!valid) continue;
    const expected = sqlLoopPasses(rows, start, end);
    if (expected) passes += 1;
    assert.equal(coverageIsContinuous(rows, { start, end }), expected, JSON.stringify(rows));
  }
  assert.ok(passes > 20, `ชุดที่ผ่านต้องมีพอให้เทสต์มีความหมาย (ได้ ${passes})`);
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

/* ══ ใบสั่งขายบริการตั้งค่ารายบรรทัด (mig 0391 · PR-A) ══════════════════════════════════════════
   ช่วงครอบของงวดเทียบกับ "ช่วงบริการ" ของใบ — ช่องโหว่/เริ่มช้า/จบสั้น = บล็อกการยื่น · ซ้อน = เตือน
   ปุ่ม "แบ่งช่วงครอบตามช่วงบริการ…" = พรีวิวก่อนเขียนเสมอ งวดที่บัญชีรับรองแล้วไม่ถูกแตะ */
import {
  pipelineCoverageIssues, splitCoverageByPeriod, wholeMonthsIn,
} from './paymentCoverage.js';
import { OPENING_INSTALLMENT_KIND } from './historicalOrders.js';

const cov = (seq, from, to, over = {}) => ({ id: `I${seq}`, seq, status: 'pending', amount: 100, coversFrom: from, coversTo: to, ...over });
const monthsOf = (n) => Array.from({ length: n }, (_, i) => cov(i + 1, null, null));

test('wholeMonthsIn — นับเดือนเต็มแบบปฏิทิน + เศษวัน', () => {
  assert.deepEqual(wholeMonthsIn('2026-10-01', '2027-09-30'), { months: 12, remainderDays: 0 });
  assert.deepEqual(wholeMonthsIn('2026-09-02', '2027-09-25'), { months: 12, remainderDays: 24 });
  assert.deepEqual(wholeMonthsIn('2026-10-01', '2026-10-20'), { months: 0, remainderDays: 20 });
  assert.deepEqual(wholeMonthsIn('2026-01-31', '2026-02-28'), { months: 1, remainderDays: 0 });
  assert.deepEqual(wholeMonthsIn('2026-10-01', null), { months: 0, remainderDays: 0 });
  assert.deepEqual(wholeMonthsIn('2026-10-02', '2026-10-01'), { months: 0, remainderDays: 0 });
});

test('pipelineCoverageIssues — ต่อกันพอดีทั้งช่วง = ไม่มีอะไร', () => {
  const rows = [cov(1, '2026-10-01', '2027-03-31'), cov(2, '2027-04-01', '2027-09-30')];
  assert.deepEqual(pipelineCoverageIssues(rows, { from: '2026-10-01', to: '2027-09-30' }), { blocking: [], warnings: [] });
});

test('pipelineCoverageIssues — ช่องโหว่ / เริ่มช้า / จบสั้น บล็อก · ซ้อน เตือน (พร้อมงวดคู่ที่ซ้อน)', () => {
  const period = { from: '2026-10-01', to: '2027-09-30' };
  const gap = pipelineCoverageIssues([cov(1, '2026-10-01', '2027-02-28'), cov(2, '2027-04-01', '2027-09-30')], period);
  assert.deepEqual(gap.blocking, [{ kind: 'gap', seq: 2, index: 1, since: '2027-03-01', until: '2027-03-31' }]);
  assert.deepEqual(gap.warnings, []);

  const start = pipelineCoverageIssues([cov(1, '2026-10-15', '2027-09-30')], period);
  assert.deepEqual(start.blocking, [{ kind: 'start', seq: 1, index: 0, since: '2026-10-01', until: '2026-10-14' }]);

  const end = pipelineCoverageIssues([cov(1, '2026-10-01', '2027-08-31')], period);
  assert.deepEqual(end.blocking, [{ kind: 'end', seq: 1, index: 0, since: '2027-09-01', until: '2027-09-30' }]);

  const overlap = pipelineCoverageIssues([cov(1, '2026-10-01', '2027-04-15'), cov(2, '2027-04-01', '2027-09-30')], period);
  assert.deepEqual(overlap.blocking, []);
  assert.deepEqual(overlap.warnings, [{
    kind: 'overlap', seq: 2, index: 1, since: '2027-04-01', until: '2027-04-15', prevSeq: 1, prevIndex: 0,
  }]);
});

test('pipelineCoverageIssues — ไม่คืน "missing" (ผู้เรียกคัดแถวที่มีช่วงครอบมาเอง) · ไม่มีช่วงบริการ = ไม่ตัดสิน', () => {
  assert.deepEqual(pipelineCoverageIssues([], { from: '2026-10-01', to: '2027-09-30' }), { blocking: [], warnings: [] });
  assert.deepEqual(pipelineCoverageIssues([cov(1, '2026-10-01', '2027-09-30')], null), { blocking: [], warnings: [] });
  // แถวครึ่งช่วงหลุดมา = ไม่นับ (ไม่พาช่องโหว่ปลอมมาด้วย)
  const half = pipelineCoverageIssues([cov(1, '2026-10-01', '2027-09-30'), cov(2, '2027-01-01', null)],
    { from: '2026-10-01', to: '2027-09-30' });
  assert.deepEqual(half, { blocking: [], warnings: [] });
});

test('splitCoverageByPeriod — 12 งวด เท่ากันรายเดือน ตรงเดือนปฏิทิน', () => {
  const rows = monthsOf(12);
  const { rows: out, error } = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, rows, 'monthly');
  assert.equal(error, null);
  assert.equal(out.length, 12);
  assert.deepEqual(out[0], { id: 'I1', seq: 1, coversFrom: '2026-10-01', coversTo: '2026-10-31', prevFrom: null, prevTo: null, share: 1 / 12 });
  assert.equal(out[1].coversFrom, '2026-11-01');
  assert.equal(out[1].coversTo, '2026-11-30');
  assert.equal(out[11].coversFrom, '2027-09-01');
  assert.equal(out[11].coversTo, '2027-09-30');
});

test('splitCoverageByPeriod — ตามสัดส่วนงวด 50/50 บน 2 งวด = 6+6 เดือน', () => {
  const rows = [cov(1, null, null, { amount: 500 }), cov(2, null, null, { amount: 500 })];
  const { rows: out, error } = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, rows, 'proportional');
  assert.equal(error, null);
  assert.deepEqual(out.map((r) => [r.coversFrom, r.coversTo, r.share]), [
    ['2026-10-01', '2027-03-31', 0.5],
    ['2027-04-01', '2027-09-30', 0.5],
  ]);
  // monthly บน 12 งวดเท่ากับ proportional บน 12 งวดยอดเท่ากัน
  const twelve = monthsOf(12);
  const a = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, twelve, 'monthly').rows;
  const b = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, twelve, 'proportional').rows;
  assert.deepEqual(a.map((r) => [r.coversFrom, r.coversTo]), b.map((r) => [r.coversFrom, r.coversTo]));
});

test('splitCoverageByPeriod — สัดส่วนไม่เท่า: เศษมากสุดได้เดือนเพิ่ม · ทุกงวด ≥ 1 เดือน · รวม = เดือนของช่วง', () => {
  const rows = [cov(1, null, null, { amount: 7000 }), cov(2, null, null, { amount: 2000 }), cov(3, null, null, { amount: 1000 })];
  const { rows: out, error } = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, rows, 'proportional');
  assert.equal(error, null);
  // 12 × 0.7 = 8.4 · 12 × 0.2 = 2.4 · 12 × 0.1 = 1.2 ⇒ 8 + 2 + 1 = 11 · เศษมากสุด (0.4 งวดแรก) ได้เพิ่ม ⇒ 9 + 2 + 1
  assert.deepEqual(out.map((r) => [r.coversFrom, r.coversTo]), [
    ['2026-10-01', '2027-06-30'],
    ['2027-07-01', '2027-08-31'],
    ['2027-09-01', '2027-09-30'],
  ]);
  // งวดยอดจิ๋วยังได้อย่างน้อย 1 เดือน
  const tiny = [cov(1, null, null, { amount: 9999 }), cov(2, null, null, { amount: 1 })];
  const t = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, tiny, 'proportional').rows;
  assert.deepEqual(t.map((r) => r.coversTo), ['2027-08-31', '2027-09-30']);
});

test('splitCoverageByPeriod — ช่วงไม่ครบเดือน: งวดสุดท้ายยืดไปถึงวันสิ้นสุดบริการ', () => {
  const { rows: out, error } = splitCoverageByPeriod({ from: '2026-09-02', to: '2027-09-25' }, monthsOf(12), 'monthly');
  assert.equal(error, null);
  assert.equal(out[0].coversFrom, '2026-09-02');
  assert.equal(out[0].coversTo, '2026-10-01');
  assert.equal(out[11].coversFrom, '2027-08-02');
  assert.equal(out[11].coversTo, '2027-09-25');
});

test('splitCoverageByPeriod — 5 งวดบน 12 เดือน หารไม่ลงตัว = บอกให้กรอกเอง (ไม่เดา)', () => {
  const r = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, monthsOf(5), 'monthly');
  assert.deepEqual(r, { rows: [], error: 'แบ่งอัตโนมัติไม่ลงตัว — กรอกช่วงครอบรายงวดเอง' });
  // สัดส่วน: งวดมากกว่าเดือน = ให้ทุกงวด ≥ 1 เดือนไม่ได้
  const many = splitCoverageByPeriod({ from: '2026-10-01', to: '2026-12-31' }, monthsOf(5), 'proportional');
  assert.equal(many.error, 'แบ่งอัตโนมัติไม่ลงตัว — กรอกช่วงครอบรายงวดเอง');
});

test('splitCoverageByPeriod — งวดแรกบัญชีรับรองแล้วพร้อมช่วงครอบ: ไม่แตะ แล้วเริ่มแบ่งถัดจากวันสิ้นสุดของงวดนั้น', () => {
  const rows = [
    cov(1, '2026-10-01', '2026-12-31', { status: 'confirmed' }),
    cov(2, null, null), cov(3, null, null), cov(4, null, null),
  ];
  const { rows: out, error } = splitCoverageByPeriod({ from: '2026-10-01', to: '2027-09-30' }, rows, 'monthly');
  assert.equal(error, null);
  assert.deepEqual(out.map((r) => r.id), ['I2', 'I3', 'I4']);
  assert.deepEqual(out.map((r) => [r.coversFrom, r.coversTo]), [
    ['2027-01-01', '2027-03-31'],
    ['2027-04-01', '2027-06-30'],
    ['2027-07-01', '2027-09-30'],
  ]);
});

test('splitCoverageByPeriod — เดินบนตารางเดือนของวันเริ่มบริการ แม้เริ่มต่อจากงวดที่รับรองแล้ว (วันที่ 31)', () => {
  const rows = [cov(1, '2026-01-31', '2026-02-28', { status: 'confirmed' }), cov(2, null, null), cov(3, null, null)];
  const { rows: out, error } = splitCoverageByPeriod({ from: '2026-01-31', to: '2026-04-30' }, rows, 'monthly');
  assert.equal(error, null);
  assert.deepEqual(out.map((r) => [r.coversFrom, r.coversTo]), [
    ['2026-03-01', '2026-03-30'],
    ['2026-03-31', '2026-04-30'],
  ]);
});

test('splitCoverageByPeriod — งวดที่รับรองแล้วไม่มีช่วงครอบ หรืออยู่หลังงวดที่ยังไม่รับรอง = แบ่งเองไม่ได้', () => {
  const period = { from: '2026-10-01', to: '2027-09-30' };
  const noCover = [cov(1, null, null, { status: 'confirmed' }), cov(2, null, null)];
  assert.equal(splitCoverageByPeriod(period, noCover, 'monthly').error, 'แบ่งอัตโนมัติไม่ลงตัว — กรอกช่วงครอบรายงวดเอง');
  const after = [cov(1, null, null), cov(2, '2026-10-01', '2027-03-31', { status: 'confirmed' })];
  assert.equal(splitCoverageByPeriod(period, after, 'monthly').error, 'แบ่งอัตโนมัติไม่ลงตัว — กรอกช่วงครอบรายงวดเอง');
});

test('splitCoverageByPeriod — ไม่มีช่วงบริการ / ไม่มีงวดให้แบ่ง / งวดคืนเงินแล้วไม่นับ / เก็บช่วงเดิมไว้ให้พรีวิว', () => {
  assert.deepEqual(splitCoverageByPeriod(null, monthsOf(2), 'monthly'), { rows: [], error: 'ใส่ช่วงบริการก่อน' });
  assert.equal(splitCoverageByPeriod({ from: '2026-10-01', to: null }, monthsOf(2), 'monthly').error, 'ใส่ช่วงบริการก่อน');
  const period = { from: '2026-10-01', to: '2027-09-30' };
  assert.deepEqual(splitCoverageByPeriod(period, [], 'monthly'), { rows: [], error: 'ไม่มีงวดที่ยังไม่รับรองให้แบ่ง' });
  assert.equal(splitCoverageByPeriod(period, [cov(1, '2026-10-01', '2027-09-30', { status: 'confirmed' })], 'monthly').error,
    'ไม่มีงวดที่ยังไม่รับรองให้แบ่ง');
  const withRefund = [cov(1, null, null), cov(2, null, null, { refundedAt: '2026-10-05T03:00:00Z' }), cov(3, '2026-10-01', '2026-10-31')];
  const { rows: out, error } = splitCoverageByPeriod(period, withRefund, 'monthly');
  assert.equal(error, null);
  assert.deepEqual(out.map((r) => [r.id, r.prevFrom, r.prevTo, r.coversFrom, r.coversTo]), [
    ['I1', null, null, '2026-10-01', '2027-03-31'],
    ['I3', '2026-10-01', '2026-10-31', '2027-04-01', '2027-09-30'],
  ]);
  assert.equal(splitCoverageByPeriod(period, monthsOf(2), 'weekly').error, 'แบ่งอัตโนมัติไม่ลงตัว — กรอกช่วงครอบรายงวดเอง');
  // งวดยกมา (ใบย้อนหลัง) ไม่ใช่งวดให้แบ่ง
  const withOpening = [cov(1, null, null, { kind: OPENING_INSTALLMENT_KIND }), cov(2, null, null)];
  assert.deepEqual(splitCoverageByPeriod(period, withOpening, 'monthly').rows.map((r) => r.id), ['I2']);
});

test('splitCoverageByPeriod — งวดเดียว = ครอบทั้งช่วงที่เหลือ แม้ช่วงสั้นกว่าหนึ่งเดือน', () => {
  const { rows: out, error } = splitCoverageByPeriod({ from: '2026-10-01', to: '2026-10-20' }, monthsOf(1), 'monthly');
  assert.equal(error, null);
  assert.deepEqual(out.map((r) => [r.coversFrom, r.coversTo]), [['2026-10-01', '2026-10-20']]);
});
