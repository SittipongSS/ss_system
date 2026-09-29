// ── มาตรฐาน มล./เดือนของรอบขาย (PR-C · C-D8/C-D9/C-D10) ─────────────────────────────────────
//
// กติกาที่ชุดนี้ล็อก:
//   · เส้นแก้รับ **คีย์เดียว** (`standardMlPerMonth`) — จำนวนเต็ม 1–1,000,000 มล. หรือว่าง (ล้าง) · คีย์อื่น = 400
//   · ข้อเสนอเป็น **อัตราต่อเดือน** (แพ็คต่อรอบ × รอบ ÷ เดือน × 1 ลิตร) และขึ้นเฉพาะรอบขายของใบที่ฝ่ายขายตั้งโซนแล้ว
//     (packageQty ของใบที่ไม่ประทับ = จำนวนที่ขายทั้งบรรทัด ไม่ใช่แพ็คต่อรอบ ⇒ สูตรนี้ใช้ไม่ได้)
//   · หน้าโซนเทียบยอดใช้กับ **ผลรวม** ของรอบขายที่มีผลทุกรอบของโซน ไม่ใช่รอบแรกที่เจอ
//     (SO-26090247-0 มีสองรอบขายบนโซน Office เดียวกัน)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_ML_MAX,
  STANDARD_ML_MESSAGES,
  STANDARD_ML_RANGE_ERROR,
  ZONE_STANDARD_PARTIAL,
  ZONE_STANDARD_SUM,
  normalizeStandardMlPatch,
  sameStandardMl,
  standardMlAuditSummary,
  standardMlDraft,
  standardMlSuggestion,
  standardMlText,
  zoneStandardMl,
} from './termStandardMl.js';

const SHAPE = 'แก้ได้เฉพาะมาตรฐาน มล./เดือน';
const RANGE = 'มาตรฐานต้องเป็นจำนวนเต็ม 1–1,000,000 มล. หรือเว้นว่าง';
const patch = (v) => normalizeStandardMlPatch({ standardMlPerMonth: v });

test('เพดานมาตรฐาน = 1,000,000 มล. · ข้อความช่วงค่าเป็นตัวเดียวกับที่ช่องบนจอใช้', () => {
  assert.equal(STANDARD_ML_MAX, 1000000);
  assert.equal(STANDARD_ML_RANGE_ERROR, RANGE);
});

test('⭐ รับค่าที่ถูก: จำนวนเต็ม 1–1,000,000 · สตริงตัวเลขล้วน · ว่าง/null = ล้าง', () => {
  assert.deepEqual(patch(2000), { value: 2000, error: null });
  assert.deepEqual(patch(1), { value: 1, error: null });
  assert.deepEqual(patch(1000000), { value: 1000000, error: null });
  assert.deepEqual(patch('2000'), { value: 2000, error: null });
  assert.deepEqual(patch(' 2000 '), { value: 2000, error: null }, 'ช่องว่างหัวท้ายไม่ใช่ความผิด');
  assert.deepEqual(patch(null), { value: null, error: null });
  assert.deepEqual(patch(''), { value: null, error: null });
  assert.deepEqual(patch('   '), { value: null, error: null }, 'ช่องที่ลบจนเหลือแต่ช่องว่าง = ล้าง');
});

test('🔴 ค่าที่ไม่ใช่จำนวนเต็มในช่วง = 400 พร้อมข้อความเดียว (ไม่ปัด ไม่ตัด)', () => {
  for (const bad of [0, -1, 1.5, 1000001, '1.5', '0', '-5', '2,000', 'abc', '1e3', Number.NaN, Infinity, true, false, [], {}]) {
    assert.deepEqual(patch(bad), { value: null, error: RANGE }, `ต้องไม่รับ ${JSON.stringify(bad)}`);
  }
});

test('🔴 เส้นนี้แก้ได้คีย์เดียว — ก้อนที่ไม่ใช่ออบเจกต์ · ไม่มีคีย์ · มีคีย์อื่นติดมา = 400', () => {
  for (const body of [null, undefined, 'x', 5, [], [2000]]) {
    assert.deepEqual(normalizeStandardMlPatch(body), { value: null, error: SHAPE }, `body ${JSON.stringify(body)}`);
  }
  assert.deepEqual(normalizeStandardMlPatch({}), { value: null, error: SHAPE }, 'ไม่มีคีย์ = ไม่รู้ว่าจะตั้งหรือล้าง');
  // คีย์อื่นติดมาด้วย — แม้ค่ามาตรฐานถูก ก็ไม่รับ (ห้ามมีทางแอบเขียน packageQty/วันที่ผ่านเส้นนี้)
  for (const extra of ['packageQty', 'startDate', 'updatedAt', 'zoneId', 'salesOrderId', 'note']) {
    assert.deepEqual(normalizeStandardMlPatch({ standardMlPerMonth: 2000, [extra]: 1 }), { value: null, error: SHAPE }, extra);
  }
});

test('ค่าเดิมเทียบค่าใหม่ — ตัวเลขเดียวกันต่างชนิด (numeric จากฐานเป็นสตริง) = ไม่เปลี่ยน', () => {
  assert.equal(sameStandardMl(null, null), true);
  assert.equal(sameStandardMl(undefined, null), true);
  assert.equal(sameStandardMl(2000, 2000), true);
  assert.equal(sameStandardMl('2000', 2000), true);
  assert.equal(sameStandardMl(2000, null), false);
  assert.equal(sameStandardMl(null, 2000), false);
  assert.equal(sameStandardMl(2000, 2001), false);
});

test('ร่างในช่อง: ว่าง = ล้าง · ตรงค่าเดิม = ไม่มีอะไรให้บันทึก · ผิดรูป = บันทึกไม่ได้พร้อมเหตุ', () => {
  assert.deepEqual(standardMlDraft('2000', 2000), { value: 2000, error: null, dirty: false });
  assert.deepEqual(standardMlDraft('2000', '2000'), { value: 2000, error: null, dirty: false });
  assert.deepEqual(standardMlDraft('2500', 2000), { value: 2500, error: null, dirty: true });
  assert.deepEqual(standardMlDraft('', 2000), { value: null, error: null, dirty: true }, 'ลบตัวเลขทิ้ง = ขอล้าง');
  assert.deepEqual(standardMlDraft('', null), { value: null, error: null, dirty: false });
  assert.deepEqual(standardMlDraft('1.5', null), { value: null, error: RANGE, dirty: true });
  assert.deepEqual(standardMlDraft('0', 2000), { value: null, error: RANGE, dirty: true });
});

/* ── ข้อเสนอ = อัตราต่อเดือน (C-D9) ────────────────────────────────────────────────────── */
const stampedTerm = (over = {}) => ({ packageQty: 1, unit: 'แพ็ค', rounds: 12, periodMonths: 12, ...over });

test('⭐ รอบเท่าจำนวนเดือน (บริการรายเดือน) — ข้อความตาม r2 T1 เป๊ะ', () => {
  assert.deepEqual(standardMlSuggestion(stampedTerm(), { stamped: true }),
    { value: 1000, label: '1,000 มล. (1 แพ็ค/รอบ × 1 ลิตร)' });
  assert.deepEqual(standardMlSuggestion(stampedTerm({ packageQty: 2 }), { stamped: true }),
    { value: 2000, label: '2,000 มล. (2 แพ็ค/รอบ × 1 ลิตร)' });
});

test('⭐ SO-26090247-0 (2 แพ็ค/รอบ × 1 รอบ ตลอด 12 เดือน) → 167 มล./เดือน พร้อมเลขที่มา — ไม่ใช่ 2,000', () => {
  assert.deepEqual(standardMlSuggestion(stampedTerm({ packageQty: 2, rounds: 1, periodMonths: 12 }), { stamped: true }),
    { value: 167, label: '167 มล. (2 แพ็ค/รอบ × 1 รอบ ÷ 12 เดือน × 1 ลิตร)' });
});

test('รอบถี่กว่าเดือน (26 รอบใน 12 เดือน) → 2,167 มล./เดือน', () => {
  assert.deepEqual(standardMlSuggestion(stampedTerm({ rounds: 26 }), { stamped: true }),
    { value: 2167, label: '2,167 มล. (1 แพ็ค/รอบ × 26 รอบ ÷ 12 เดือน × 1 ลิตร)' });
});

test('🔴 ไม่มีข้อเสนอเมื่อขาดข้อมูล · หน่วยไม่ใช่แพ็ค · ใบที่ฝ่ายขายยังไม่ได้ตั้งโซน · ผลต่ำกว่า 1 มล.', () => {
  const cases = [
    ['ไม่ประทับ', stampedTerm(), {}],
    ['stamped: false', stampedTerm(), { stamped: false }],
    ['ไม่มีรอบ', stampedTerm({ rounds: null }), { stamped: true }],
    ['รอบ 0', stampedTerm({ rounds: 0 }), { stamped: true }],
    ['รอบไม่เต็ม', stampedTerm({ rounds: 1.5 }), { stamped: true }],
    ['ไม่มีเดือน', stampedTerm({ periodMonths: null }), { stamped: true }],
    ['เดือน 0', stampedTerm({ periodMonths: 0 }), { stamped: true }],
    ['กิโลกรัม', stampedTerm({ unit: 'กิโลกรัม' }), { stamped: true }],
    ['ไม่รู้หน่วย', stampedTerm({ unit: null }), { stamped: true }],
    ['แพ็ค 0', stampedTerm({ packageQty: 0 }), { stamped: true }],
    ['ไม่มีแพ็ค', stampedTerm({ packageQty: null }), { stamped: true }],
    ['ต่ำกว่า 1 มล.', stampedTerm({ packageQty: 0.001, rounds: 1, periodMonths: 12 }), { stamped: true }],
  ];
  for (const [label, term, opts] of cases) {
    assert.equal(standardMlSuggestion(term, opts), null, label);
  }
  assert.equal(standardMlSuggestion(null, { stamped: true }), null);
});

/* ── ตัวอ่านของหน้าโซน (C-D10) ─────────────────────────────────────────────────────────── */
const TODAY = '2026-10-15';
const orders = new Map([
  ['SO-A', { id: 'SO-A', status: 'approved', supersededById: null }],
  ['SO-B', { id: 'SO-B', status: 'approved', supersededById: null }],
  ['SO-OLD', { id: 'SO-OLD', status: 'approved', supersededById: 'SO-A' }],
  ['SO-X', { id: 'SO-X', status: 'cancelled', supersededById: null }],
]);
const term = (id, salesOrderId, standardMlPerMonth, over = {}) => ({ id, zoneId: 'Z1', salesOrderId, standardMlPerMonth, ...over });

test('⭐ สองรอบขายที่มีผลบนโซนเดียว — ตั้งแล้วหนึ่ง ยังไม่ตั้งหนึ่ง → ยอดจากที่ตั้ง + บอกว่าขาด 1 จาก 2', () => {
  assert.deepEqual(zoneStandardMl([term('T1', 'SO-A', 1000), term('T2', 'SO-B', null)], orders, TODAY),
    { value: 1000, live: 2, missing: 1 });
});

test('⭐ ตั้งครบทุกรอบ → ผลรวม · รอบของใบที่ถูกแทน/ยกเลิก/หมดช่วงไม่นับ', () => {
  assert.deepEqual(zoneStandardMl([
    term('T1', 'SO-A', 1000),
    term('T2', 'SO-B', '500'),
    term('T3', 'SO-OLD', 5000),
    term('T4', 'SO-X', 7000),
    term('T5', 'SO-A', 9000, { endDate: '2026-09-30' }),
  ], orders, TODAY), { value: 1500, live: 2, missing: 0 });
});

test('ยังไม่ตั้งสักรอบ → ไม่มียอด (ไม่ใช่ 0) · ไม่มีรอบที่มีผล → live 0', () => {
  assert.deepEqual(zoneStandardMl([term('T1', 'SO-A', null), term('T2', 'SO-B', null)], orders, TODAY),
    { value: null, live: 2, missing: 2 });
  assert.deepEqual(zoneStandardMl([term('T3', 'SO-OLD', 5000)], orders, TODAY), { value: null, live: 0, missing: 0 });
  assert.deepEqual(zoneStandardMl([], orders, TODAY), { value: null, live: 0, missing: 0 });
  assert.deepEqual(zoneStandardMl(undefined, orders, TODAY), { value: null, live: 0, missing: 0 });
});

/* 🐞 review 29/09: ต่อสัญญา = ใบใหม่ผูกโซนเดิม · term ของ 0392 ไม่มีวัน ⇒ ใบเก่าที่ช่วงบริการจบแล้วยัง "มีผล" ตามใบ
   ⇒ มาตรฐานของโซนต้องนับเฉพาะใบที่ช่วงบริการครอบวันนี้ (terms.js `termsSoldNow`) ไม่งั้นเทียบกับสองเท่าของที่ส่งจริง */
const STAMP = '2026-09-29T03:00:00Z';
const periodOrders = new Map([
  ['SO-OLD', { id: 'SO-OLD', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP, servicePeriodFrom: '2025-10-15', servicePeriodTo: '2026-10-14' }],
  ['SO-NEW', { id: 'SO-NEW', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP, servicePeriodFrom: '2026-10-15', servicePeriodTo: '2027-10-14' }],
  ['SO-ADD', { id: 'SO-ADD', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP, servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-10-14' }],
  ['SO-REN', { id: 'SO-REN', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP, servicePeriodFrom: '2027-10-15', servicePeriodTo: '2028-10-14' }],
]);

test('🔴 ใบเก่าช่วงจบแล้ว + ใบต่อสัญญาบนโซนเดียว → มาตรฐานของใบปัจจุบันใบเดียว (ไม่ใช่ผลรวมสองใบ)', () => {
  assert.deepEqual(zoneStandardMl([term('T-OLD', 'SO-OLD', 2000), term('T-NEW', 'SO-NEW', 2000)], periodOrders, TODAY),
    { value: 2000, live: 1, missing: 0 });
});

test('ใบขายเพิ่มที่ช่วงซ้อนกัน → ยังรวม · ใบต่อสัญญาที่ยังไม่เริ่ม → ยังไม่รวม', () => {
  assert.deepEqual(zoneStandardMl([term('T-NEW', 'SO-NEW', 2000), term('T-ADD', 'SO-ADD', 500), term('T-REN', 'SO-REN', 3000)], periodOrders, TODAY),
    { value: 2500, live: 2, missing: 0 });
});

/* ── ข้อความ ─────────────────────────────────────────────────────────────────────────── */
test('ข้อความของหน้าโซน · ค่าในช่อง · บรรทัดประวัติ', () => {
  assert.equal(ZONE_STANDARD_PARTIAL(1, 2), 'ยังไม่ตั้งมาตรฐาน 1 จาก 2 รอบขาย — ยอดเทียบยังไม่ครบ');
  assert.equal(ZONE_STANDARD_SUM(2), 'รวม 2 รอบขายที่มีผล');
  assert.equal(standardMlText(2000), '2,000 มล.');
  assert.equal(standardMlText('1500'), '1,500 มล.');
  for (const empty of [null, undefined, '']) assert.equal(standardMlText(empty), '—');
  assert.equal(
    standardMlAuditSummary({ before: null, after: 2000, zoneLabel: 'ZN-1120-10210', orderNumber: 'SO-26090247-0' }),
    'ตั้งมาตรฐาน 2,000 มล./เดือน · โซน ZN-1120-10210 · SO-26090247-0',
  );
  assert.equal(
    standardMlAuditSummary({ before: 2000, after: null, zoneLabel: 'ZN-1120-10210', orderNumber: 'SO-26090247-0' }),
    'ล้างมาตรฐาน มล./เดือน · โซน ZN-1120-10210 · SO-26090247-0',
  );
  assert.equal(
    standardMlAuditSummary({ before: 1000, after: 1500, zoneLabel: 'ZN-1', orderNumber: null }),
    'ตั้งมาตรฐาน 1,500 มล./เดือน · โซน ZN-1',
    'ไม่รู้เลขใบ = ไม่ต่อท้าย (ไม่เขียน "null")',
  );
  assert.deepEqual(STANDARD_ML_MESSAGES, {
    notFound: 'ไม่พบรอบขายของโซนนี้',
    orderDead: 'ใบสั่งขายของรอบขายนี้ไม่มีผลแล้ว (ออก Rev./ยกเลิก/ย้อนการอนุมัติ) — ตั้งมาตรฐานที่รอบขายของใบที่มีผล',
    saved: 'บันทึกมาตรฐาน มล./เดือน แล้ว',
    hint: 'ระบบไม่เติมมาตรฐานให้เอง — กด “ใช้” หรือพิมพ์เอง',
  });
});
