// ── รอบขายของโซน (mig 0297) ───────────────────────────────────────────────
//
// กติกาที่ชุดนี้ยึด: term ไม่มีคอลัมน์ status — "มีผลไหม" ต้องคำนวณจากใบสั่งขายแม่
// ที่ไฟล์เดียว ไม่งั้นระบบจะมีนาฬิกาสองเรือนแบบที่ "live visit" เคยมีห้าเรือน
import test from 'node:test';
import assert from 'node:assert/strict';
import * as termsModule from './terms.js';
import {
  ML_PER_PACK_HINT,
  allocatedByLine,
  fgSummary,
  isPackUnit,
  latestTermOfZone,
  orderPeriodPhase,
  serviceTermZoneCount,
  suggestStandardMl,
  termInWindow,
  termIsActive,
  termOrderActive,
  termPeriodOf,
  termPeriodPhase,
  termsSoldNow,
  withLinePeriods,
  zoneTermState,
} from './terms.js';

const order = (over = {}) => ({ id: 'SO1', status: 'approved', supersededById: null, ...over });
const term = (over = {}) => ({ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', ...over });

test('ใบที่อนุมัติและยังไม่ถูก Rev. เท่านั้นที่ทำให้รอบมีผล', () => {
  assert.equal(termOrderActive(order()), true);
  assert.equal(termOrderActive(order({ status: 'draft' })), false);
  assert.equal(termOrderActive(order({ supersededById: 'SO2' })), false);
  assert.equal(termOrderActive(null), false);
});

test('⭐ ไม่ส่งใบสั่งขายมา = ตอบว่าไม่มีผล ไม่ใช่เดาว่าใช่', () => {
  assert.equal(termIsActive(term(), undefined), false);
  assert.equal(termIsActive(term(), null), false);
});

test('ไม่ระบุช่วงวัน = ยังไม่รู้ ไม่ใช่หมดอายุ', () => {
  assert.equal(termInWindow(term(), '2026-08-28'), true);
});

test('วันนี้ต้องอยู่ในช่วงบริการของรอบ', () => {
  const t = term({ startDate: '2026-01-01', endDate: '2026-06-30' });
  assert.equal(termInWindow(t, '2026-03-15'), true);
  assert.equal(termInWindow(t, '2025-12-31'), false);
  assert.equal(termInWindow(t, '2026-07-01'), false);
  assert.equal(termIsActive(t, order(), '2026-07-01'), false);
});

test('⭐ ใบ Rev. ทับ = รอบเก่าตายเองโดยไม่ต้องแตะแถว term', () => {
  const t = term({ startDate: '2026-01-01' });
  assert.equal(termIsActive(t, order(), '2026-08-28'), true);
  assert.equal(termIsActive(t, order({ supersededById: 'SO2' }), '2026-08-28'), false);
});

test('⭐ มาตรฐานต่อเดือนเป็น "ข้อเสนอ" ไม่ใช่ค่าที่ระบบเขียนเอง', () => {
  assert.equal(ML_PER_PACK_HINT, 1000);
  assert.equal(suggestStandardMl(2, 'แพ็ค'), 2000);
  assert.equal(suggestStandardMl(0.5, 'Pack'), 500);
  // ไม่มีจำนวนแพ็ค = ไม่มีข้อเสนอ ไม่ใช่เดาเป็น 1000
  assert.equal(suggestStandardMl(null, 'แพ็ค'), null);
  assert.equal(suggestStandardMl('abc', 'แพ็ค'), null);
});

test('⭐ หน่วยที่ไม่ใช่แพ็ค ต้องไม่มีข้อเสนอ — "240 กิโลกรัม ⇒ 240,000 ml" ไม่มีความหมาย', () => {
  assert.equal(suggestStandardMl(240, 'กิโลกรัม'), null);
  assert.equal(suggestStandardMl(12, 'ขวด'), null);
  assert.equal(suggestStandardMl(3, null), null, 'ไม่รู้หน่วย = ไม่เดา');
  assert.equal(isPackUnit('แพ็ค'), true);
  assert.equal(isPackUnit('กิโลกรัม'), false);
});

test('รอบล่าสุดของโซนเรียงตามวันเริ่ม — รอบที่เพิ่งผูกยังไม่ระบุวันถือว่าใหม่สุด', () => {
  const rows = [
    term({ id: 'T1', startDate: '2025-01-01' }),
    term({ id: 'T2', startDate: '2026-01-01' }),
    term({ id: 'T3', startDate: null, createdAt: '2026-08-28T00:00:00Z' }),
  ];
  assert.equal(latestTermOfZone(rows).id, 'T3');
  assert.equal(latestTermOfZone(rows.slice(0, 2)).id, 'T2');
  assert.equal(latestTermOfZone([]), null);
});

test('⭐ สถานะของโซนแยก "ไม่เคยขาย" ออกจาก "ขายแล้วแต่รอบจบ" — คนละงานที่ต้องตามต่อ', () => {
  const orders = new Map([['SO1', order()], ['SO2', order({ supersededById: 'SO3' })]]);
  assert.equal(zoneTermState('Z9', [], orders).state, 'none');
  assert.equal(zoneTermState('Z1', [term({ startDate: '2026-01-01' })], orders, '2026-08-28').state, 'active');
  const ended = zoneTermState('Z1', [term({ startDate: '2025-01-01', endDate: '2025-12-31' })], orders, '2026-08-28');
  assert.equal(ended.state, 'ended');
  assert.equal(ended.term.id, 'T1');
});

test('⭐ ต่อสัญญา = รอบใหม่ผูกโซนเดิม ⇒ โซนกลับมา active โดยไม่เสียประวัติรอบเก่า', () => {
  const orders = new Map([['SO1', order()], ['SO9', order({ id: 'SO9' })]]);
  const rows = [
    term({ id: 'T-old', startDate: '2025-01-01', endDate: '2025-12-31' }),
    term({ id: 'T-new', salesOrderId: 'SO9', startDate: '2026-01-01', endDate: '2026-12-31' }),
  ];
  const state = zoneTermState('Z1', rows, orders, '2026-08-28');
  assert.equal(state.state, 'active');
  assert.equal(state.term.id, 'T-new');
  assert.equal(rows.length, 2, 'รอบเก่ายังอยู่ ไม่ถูกเขียนทับ');
});

/* ── จัดสรรบรรทัดขายลงหลายโซน (mig 0312 · มติผู้ใช้ 2026-08-29) — อ่านอย่างเดียวตั้งแต่ mig 0392 ──────────────
   > *"ไม่ต้องนับบรรทัดแล้ว นับแค่จำนวน FG พอ เพื่อให้ทาง TS จัดสรร ส่งโซนเอง"*
   ของจริงที่เป็นเหตุ: SO-26080077-0 มี **10 บรรทัด แต่เป็น FG แค่ 2 ชนิด รวม 13 หน่วย**
   🔄 ทางผูกของ TS ปิดแล้ว — "เหลือเท่าไร" อ่านผ่าน `fgSummary` (สรุปงานบริการของใบเดิม) ตัวเดียว */
const remainingOf = (line, terms = []) => fgSummary([line], allocatedByLine(terms))[0].remaining;

test('⭐ บรรทัดเดียวแบ่งลงหลายโซนได้ — เหลือเท่าไรคิดจากผลรวม', () => {
  const line = { id: 'L1', fgCode: 'FG-1', qty: 13, unit: 'แพ็คเกจ' };
  assert.equal(remainingOf(line, [
    { salesOrderLineId: 'L1', zoneId: 'Z1', packageQty: 5 },
    { salesOrderLineId: 'L1', zoneId: 'Z2', packageQty: 4 },
  ]), 4);
});

test('จัดสรรครบแล้ว = ไม่เหลือ', () => {
  assert.equal(remainingOf({ id: 'L1', qty: 13 }, [{ salesOrderLineId: 'L1', packageQty: 13 }]), 0);
});

/* ⚠️ แถวที่เกิดก่อน mig 0312 ไม่มี `packageQty` (ตอนนั้น 1 บรรทัด = 1 โซนเสมอ)
   นับเป็น 0 เมื่อไร ใบเก่าทุกใบจะโชว์ว่าค้างลงโซนพร้อมกันทั้งกอง */
test('⭐ term เก่าที่ไม่ระบุจำนวน = กินทั้งบรรทัด ไม่ใช่จัดสรร 0', () => {
  assert.equal(remainingOf({ id: 'L1', qty: 13 }, [{ salesOrderLineId: 'L1', packageQty: null }]), 0);
});

test('บรรทัดที่ไม่มีจำนวน (บริการ "1 งาน") จัดสรรได้โซนเดียวแล้วจบ', () => {
  const line = { id: 'L9', qty: null, unit: 'งาน' };
  assert.equal(remainingOf(line), 1, 'ยังไม่ผูก = ยังต้องจัดสรร');
  assert.equal(remainingOf(line, [{ salesOrderLineId: 'L9', packageQty: 1 }]), 0);
});

/* 🔄 mig 0392 (D14): ตัวช่วยของทางผูกโซนของ TS ถอดพร้อมทางผูก — กลับมา export เมื่อไร = มีคนเขียน term ฝั่ง JS อีก
   (term ที่ไม่ได้เกิดจาก 0392 ทำให้การเปิดงานบริการของใบนั้นถูกปฏิเสธ · D29) */
test('ตัวช่วยของทางผูกโซนของ TS ถอดแล้ว — ไม่มีใคร export กลับ', () => {
  for (const name of ['termSnapshotFromLine', 'lineNeedsAllocation', 'spreadAllocation', 'remainingOfLine', 'normalizeTermInput', 'STANDARD_ML_HINT_TEXT']) {
    assert.equal(name in termsModule, false, name);
  }
});

test('⭐ สรุปเป็น FG ไม่ใช่บรรทัด — 10 บรรทัด 2 ชนิด ต้องอ่านออกว่า 2 ชนิด', () => {
  const lines = [
    { id: 'L1', fgCode: 'FG-1', qty: 10, unit: 'แพ็คเกจ' },
    { id: 'L2', fgCode: 'FG-1', qty: 3, unit: 'แพ็คเกจ' },
    { id: 'L3', fgCode: null, description: 'ออกแบบกลิ่น', qty: 1, unit: 'งาน' },
  ];
  const rows = fgSummary(lines, allocatedByLine([{ salesOrderLineId: 'L1', packageQty: 4 }]));
  assert.equal(rows.length, 2, 'สองบรรทัดของ FG เดียวกันยุบเป็นแถวเดียว');
  assert.equal(rows[0].qty, 13);
  assert.equal(rows[0].remaining, 9);
  assert.equal(rows[0].lines.length, 2);
});

/* ⚠️ บรรทัดที่ไม่มีรหัส FG ห้ามยุบรวมกัน — ของคนละอย่างที่บังเอิญไม่มีรหัสเหมือนกัน */
test('บรรทัดไม่มีรหัส FG แยกกันตามคำบรรยาย ไม่ยุบรวม', () => {
  const rows = fgSummary([
    { id: 'A', fgCode: null, description: 'ออกแบบกลิ่น', qty: 1 },
    { id: 'B', fgCode: null, description: 'ติดตั้งเครื่อง', qty: 1 },
  ]);
  assert.equal(rows.length, 2);
});

test('หน่วยที่ปนกันในกลุ่มเดียวต้องบอกว่าปน ไม่ใช่เงียบแล้วบวกข้ามหน่วย', () => {
  const rows = fgSummary([
    { id: 'A', fgCode: 'FG-9', qty: 2, unit: 'กิโลกรัม' },
    { id: 'B', fgCode: 'FG-9', qty: 3, unit: 'ชิ้น' },
  ]);
  assert.equal(rows[0].unit, 'ปนหน่วย');
});

test('ของที่จัดสรรไปแล้วรอบก่อนไม่ถูกนับซ้ำ', () => {
  const lines = [{ id: 'L1', fgCode: 'FG-1', qty: 10 }];
  const already = allocatedByLine([{ salesOrderLineId: 'L1', zoneId: 'Z0', packageQty: 7 }]);
  assert.equal(fgSummary(lines, already)[0].remaining, 3);
});

/* ── จุดติดตั้งของใบสั่งขายย้อนหลัง (mig 0360 · มติข้อ 8 + 17) ──────────────────────────
   หนึ่งบรรทัดของใบย้อนหลัง = หนึ่งจุดติดตั้งตามชีต · FG เดียวกันอยู่คนละสาขาได้ ⇒ TS ต้องเห็นแยกจุด
   ⚠️ ใบปกติไม่มีจุดติดตั้ง — การยุบตาม FG ของมติ 2026-08-29 ต้องไม่ขยับ */
test('⭐ FG เดียวกันคนละจุดติดตั้ง = คนละกลุ่ม และแต่ละกลุ่มพกจุดของตัวเอง', () => {
  const rows = fgSummary([
    { id: 'L1', fgCode: 'FG-1', qty: 2, unit: 'แพ็คเกจ', installationPoint: 'Empire Tower · ล็อบบี้ ชั้น G' },
    { id: 'L2', fgCode: 'FG-1', qty: 1, unit: 'แพ็คเกจ', installationPoint: ' สาขาสีลม ' },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((g) => g.installationPoint), ['Empire Tower · ล็อบบี้ ชั้น G', 'สาขาสีลม']);
  assert.deepEqual(rows.map((g) => g.lines.map((l) => l.id)), [['L1'], ['L2']]);
  assert.notEqual(rows[0].key, rows[1].key);
});

test('ไม่มีจุดติดตั้ง (ใบปกติ) = จัดกลุ่มเหมือนเดิมเป๊ะ — คีย์เดิม ยุบตาม FG', () => {
  const rows = fgSummary([
    { id: 'L1', fgCode: 'FG-1', qty: 10, unit: 'แพ็คเกจ' },
    { id: 'L2', fgCode: 'FG-1', qty: 3, unit: 'แพ็คเกจ', installationPoint: '   ' },
    { id: 'L3', fgCode: null, description: 'ออกแบบกลิ่น', qty: 1, unit: 'งาน', installationPoint: null },
  ]);
  assert.deepEqual(rows.map((g) => g.key), ['FG-1', 'desc:ออกแบบกลิ่น']);
  assert.equal(rows[0].qty, 13);
  assert.equal(rows[0].lines.length, 2);
  assert.deepEqual(rows.map((g) => g.installationPoint), [null, null]);
});

/* ── PR-C C5 (C-D15): จำนวนโซนของรอบขายที่มีผลของใบ — บรรทัดด่านเงินในโมดัล FN รับรองงวด ──────────
   ⭐ นับ **โซนไม่ซ้ำ** — สองบรรทัดของใบลงโซนเดียวกัน (SO-26090247-0: 2 term บน Office) = 1 โซน
   ⚠️ ใบไม่มีผล (ออก Rev./ยกเลิก/ย้อนการอนุมัติ/ไม่ส่งใบ) = 0 — ตัดสินด้วย termOrderActive ตัวเดียวของระบบ */
test('serviceTermZoneCount: โซนไม่ซ้ำของรอบขายของใบที่มีผล · ใบไม่มีผล = 0', () => {
  const terms = [term({ id: 'T1', zoneId: 'Z1' }), term({ id: 'T2', zoneId: 'Z1' }), term({ id: 'T3', zoneId: 'Z2' }), term({ id: 'T4', zoneId: null })];
  assert.equal(serviceTermZoneCount(terms.slice(0, 2), order()), 1, 'สอง term โซนเดียวกัน = 1 โซน');
  assert.equal(serviceTermZoneCount(terms, order()), 2);
  assert.equal(serviceTermZoneCount(terms, order({ supersededById: 'SO2' })), 0);
  for (const status of ['approval_revoked', 'cancelled', 'revised', 'draft', 'pending_approval']) {
    assert.equal(serviceTermZoneCount(terms, order({ status })), 0, status);
  }
  assert.equal(serviceTermZoneCount(terms, null), 0, 'ไม่ส่งใบ = 0 ไม่ใช่เดาว่ามีผล');
  assert.equal(serviceTermZoneCount([], order()), 0);
  assert.equal(serviceTermZoneCount(undefined, order()), 0);
});

/* ── PR-C (review 29/09): ช่วงบริการของใบที่ประทับแล้วเป็นหน้าต่างของ "ขายอยู่ตอนนี้" ─────────────────────
   🐞 term ที่ 0392 เปิดไม่มี startDate/endDate (mig 0392 "⛔ ไม่เขียน startDate / endDate") ⇒ `termIsActive` ตอบ true
      ตราบที่ใบยังอนุมัติ แม้ช่วงบริการของใบจบไปแล้ว · ต่อสัญญา = ใบใหม่ผูกโซนเดิม ⇒ ใบเก่า + ใบต่อสัญญามีผลพร้อมกัน
      แล้วตัวรวม (มาตรฐาน มล. ของโซน · ป้าย "ขายแล้ว n แพ็ค/รอบ") นับซ้ำสองเท่า */
const STAMP = '2026-09-29T03:00:00Z';
const stampedOrder = (over = {}) => ({
  id: 'SO-CUR', orderNumber: 'SO-CUR', status: 'approved', supersededById: null,
  serviceTermsOpenedAt: STAMP, servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21', ...over,
});

test('orderPeriodPhase: ใบประทับ = ช่วงบริการของใบ · ใบไม่ประทับ/ไม่รู้วัน = current (ไม่เดาว่าจบ)', () => {
  const o = stampedOrder();
  assert.equal(orderPeriodPhase(o, '2026-10-21'), 'future');
  assert.equal(orderPeriodPhase(o, '2026-10-22'), 'current', 'วันเริ่มนับ');
  assert.equal(orderPeriodPhase(o, '2027-10-21'), 'current', 'วันจบนับ');
  assert.equal(orderPeriodPhase(o, '2027-10-22'), 'ended');
  assert.equal(orderPeriodPhase({ ...o, serviceTermsOpenedAt: null }, '2030-01-01'), 'current', 'ใบไม่ประทับ: ช่วงร่างไม่ใช่ข้อเท็จจริง');
  assert.equal(orderPeriodPhase({ ...o, servicePeriodTo: null }, '2030-01-01'), 'current', 'ไม่รู้วันจบ = ยังไม่จบ');
  assert.equal(orderPeriodPhase({ ...o, servicePeriodFrom: null }, '2026-01-01'), 'current', 'ไม่รู้วันเริ่ม = เริ่มแล้ว');
  assert.equal(orderPeriodPhase({ ...o, servicePeriodTo: '2027-10-21T00:00:00+07:00' }, '2027-10-22'), 'ended', 'ค่าที่มาเป็น timestamp ตัดเหลือวัน');
  assert.equal(orderPeriodPhase(null, '2026-10-01'), 'current');
});

test('🔴 termsSoldNow: ใบเก่าที่ช่วงจบแล้วไม่นับ · ใบต่อสัญญาที่ยังไม่เริ่มไม่นับ · ใบขายเพิ่มที่ซ้อนช่วงนับ', () => {
  const orders = new Map([
    ['SO-OLD', stampedOrder({ id: 'SO-OLD', servicePeriodFrom: '2025-10-22', servicePeriodTo: '2026-10-21' })],
    ['SO-CUR', stampedOrder()],
    ['SO-ADD', stampedOrder({ id: 'SO-ADD', servicePeriodFrom: '2026-12-01', servicePeriodTo: '2027-10-21' })],
    ['SO-REN', stampedOrder({ id: 'SO-REN', servicePeriodFrom: '2027-10-22', servicePeriodTo: '2028-10-21' })],
    ['SO-LEG', { id: 'SO-LEG', status: 'approved', supersededById: null, serviceTermsOpenedAt: null, servicePeriodTo: '2020-01-01' }],
    ['SO-DEAD', stampedOrder({ id: 'SO-DEAD', status: 'cancelled' })],
  ]);
  const t = (id, salesOrderId) => term({ id, zoneId: 'Z1', salesOrderId });
  const terms = [t('OLD', 'SO-OLD'), t('CUR1', 'SO-CUR'), t('CUR2', 'SO-CUR'), t('ADD', 'SO-ADD'), t('REN', 'SO-REN'), t('LEG', 'SO-LEG'), t('DEAD', 'SO-DEAD')];
  const ids = (today) => termsSoldNow(terms, orders, today).map((x) => x.id);

  // ก่อนใบปัจจุบันเริ่ม: ใบเก่ายังอยู่ในช่วง ⇒ ใบที่ยังไม่เริ่มทุกใบรอก่อน
  assert.deepEqual(ids('2026-10-01'), ['OLD', 'LEG']);
  // ใบเก่าจบ ใบปัจจุบันเริ่ม ⇒ ไม่นับซ้อน · ใบขายเพิ่มยังไม่เริ่ม
  assert.deepEqual(ids('2026-10-22'), ['CUR1', 'CUR2', 'LEG']);
  // ใบขายเพิ่มเริ่มแล้วและซ้อนช่วง ⇒ นับรวม · ใบต่อสัญญายังไม่เริ่ม
  assert.deepEqual(ids('2027-01-15'), ['CUR1', 'CUR2', 'ADD', 'LEG']);
  // หลังช่วงของใบปัจจุบัน ⇒ ใบต่อสัญญาเท่านั้น
  assert.deepEqual(ids('2027-10-22'), ['REN', 'LEG']);
});

test('termsSoldNow: ทุกใบยังไม่เริ่ม (ใบแรกของโซน) ⇒ ใบที่เริ่มก่อนสุด — "ขายแล้ว" ต้องไม่หายระหว่างรอวันเริ่ม', () => {
  const orders = new Map([
    ['SO-CUR', stampedOrder()],
    ['SO-REN', stampedOrder({ id: 'SO-REN', servicePeriodFrom: '2027-10-22', servicePeriodTo: '2028-10-21' })],
  ]);
  const terms = [term({ id: 'A', zoneId: 'Z1', salesOrderId: 'SO-CUR' }), term({ id: 'B', zoneId: 'Z1', salesOrderId: 'SO-CUR' }), term({ id: 'R', zoneId: 'Z1', salesOrderId: 'SO-REN' })];
  assert.deepEqual(termsSoldNow(terms, orders, '2026-09-29').map((x) => x.id), ['A', 'B'], 'SO-26090247-0 วันนี้ (เริ่ม 22/10)');
  assert.deepEqual(termsSoldNow(terms, Object.fromEntries(orders), '2026-09-29').map((x) => x.id), ['A', 'B'], 'รับออบเจกต์ได้เหมือน Map');
  // รอบที่ตัวเองไม่มีผล (ใบตาย / term หมดช่วงของตัวเอง) ไม่เข้าเลย
  assert.deepEqual(termsSoldNow([term({ id: 'X', zoneId: 'Z1', salesOrderId: 'SO-CUR', endDate: '2026-01-01' })], orders, '2026-09-29'), []);
  assert.deepEqual(termsSoldNow([], orders, '2026-09-29'), []);
  assert.deepEqual(termsSoldNow(undefined, orders, '2026-09-29'), []);
});

/* ── ช่วงบริการของรอบขาย (mig 0400 · ใบแยกรายรายการ) ──────────────────────────────────────────────────────
   ใบโหมด 'line': ช่วงของใบ = ช่วงรวม (เริ่มแรกสุด → จบสุดท้าย) · แต่ละรอบขายใช้ช่วงของรายการที่ตัวโหลดแนบมา
   (`linePeriodFrom/To` · `withLinePeriods`) — ไม่แนบ = ถอยไปช่วงรวม (ประมาณเกินอย่างปลอดภัย: ไม่ "จบแล้ว" ก่อนจริง) */
const lineOrder = (over = {}) => stampedOrder({
  id: 'SO-JT', orderNumber: 'SO-26090206-0', servicePeriodMode: 'line', servicePeriodFrom: '2026-09-02', servicePeriodTo: '2027-09-25', ...over,
});

test('0400 termPeriodOf: ใบ line + ช่วงที่แนบมา = ช่วงของรายการ · ไม่แนบ/ใบทั้งใบ/ไม่มีใบ = ช่วงของใบ', () => {
  const order = lineOrder();
  const attached = term({ id: 'T1', salesOrderId: 'SO-JT', linePeriodFrom: '2026-09-02', linePeriodTo: '2027-09-01' });
  assert.deepEqual(termPeriodOf(attached, order), { from: '2026-09-02', to: '2027-09-01' });
  assert.deepEqual(termPeriodOf(term({ id: 'T2', salesOrderId: 'SO-JT' }), order), { from: '2026-09-02', to: '2027-09-25' }, 'ตัวโหลดไม่ได้แนบ = ช่วงรวมของใบ');
  assert.deepEqual(termPeriodOf(term({ id: 'T3', linePeriodFrom: '2026-09-02', linePeriodTo: null }), order), { from: '2026-09-02', to: '2027-09-25' },
    'ช่วงที่แนบมาครึ่งเดียว = ไม่ใช้ (ถอยไปช่วงรวม)');
  assert.deepEqual(termPeriodOf(attached, stampedOrder()), { from: '2026-10-22', to: '2027-10-21' }, 'ใบโหมดทั้งใบไม่อ่านช่วงที่แนบ');
  assert.deepEqual(termPeriodOf(attached, { ...order, servicePeriodMode: 'whole' }), { from: '2026-09-02', to: '2027-09-25' });
  assert.deepEqual(termPeriodOf(null, order), { from: '2026-09-02', to: '2027-09-25' });
  assert.deepEqual(termPeriodOf(attached, null), { from: null, to: null });
  assert.deepEqual(termPeriodOf({ linePeriodFrom: '2026-09-02T00:00:00+07:00', linePeriodTo: '2027-09-01T00:00:00+07:00' }, order),
    { from: '2026-09-02', to: '2027-09-01' }, 'ค่าที่มาเป็น timestamp ตัดเหลือวัน');
});

test('0400 termPeriodPhase: ช่วงของรอบขายเอง (ใบ line) · ใบไม่ประทับ = current · orderPeriodPhase = แบบไม่มี term', () => {
  const order = lineOrder();
  const early = term({ id: 'T1', salesOrderId: 'SO-JT', linePeriodFrom: '2026-09-02', linePeriodTo: '2027-09-01' });
  const late = term({ id: 'T2', salesOrderId: 'SO-JT', linePeriodFrom: '2026-09-26', linePeriodTo: '2027-09-25' });
  assert.equal(termPeriodPhase(early, order, '2027-09-10'), 'ended', 'สาขานี้จบ 01/09 แม้ช่วงรวมของใบยังไม่จบ');
  assert.equal(termPeriodPhase(late, order, '2027-09-10'), 'current');
  assert.equal(orderPeriodPhase(order, '2027-09-10'), 'current', 'ช่วงรวมของใบ');
  assert.equal(termPeriodPhase(late, order, '2026-09-10'), 'future', 'สาขานี้ยังไม่เริ่ม แม้ช่วงรวมเริ่มแล้ว');
  assert.equal(termPeriodPhase(early, order, '2026-09-10'), 'current');
  assert.equal(termPeriodPhase(early, { ...order, serviceTermsOpenedAt: null }, '2030-01-01'), 'current', 'ใบไม่ประทับ: ช่วงร่างไม่ใช่ข้อเท็จจริง');
  assert.equal(termPeriodPhase(null, order, '2027-09-26'), 'ended');
  for (const day of ['2026-10-21', '2026-10-22', '2027-10-21', '2027-10-22']) {
    assert.equal(termPeriodPhase(early, stampedOrder(), day), orderPeriodPhase(stampedOrder(), day), `ใบทั้งใบ: เท่าของเดิม (${day})`);
  }
});

test('0400 withLinePeriods: แนบเฉพาะ term ของใบ line ที่รู้ช่วงของบรรทัด · term อื่นเป็นออบเจ็กต์เดิม · ไม่แก้ของผู้เรียก', () => {
  const orders = new Map([['SO-JT', lineOrder()], ['SO-CUR', stampedOrder()]]);
  const lines = new Map([
    ['L1', { id: 'L1', servicePeriodFrom: '2026-09-02', servicePeriodTo: '2027-09-01' }],
    ['L2', { id: 'L2', servicePeriodFrom: null, servicePeriodTo: null }],
    ['LW', { id: 'LW', servicePeriodFrom: '2026-01-01', servicePeriodTo: '2026-12-31' }],
  ]);
  const terms = [
    term({ id: 'A', salesOrderId: 'SO-JT', salesOrderLineId: 'L1' }),
    term({ id: 'B', salesOrderId: 'SO-JT', salesOrderLineId: 'L2' }),
    term({ id: 'C', salesOrderId: 'SO-JT', salesOrderLineId: 'L-MISSING' }),
    term({ id: 'D', salesOrderId: 'SO-CUR', salesOrderLineId: 'LW' }),
    term({ id: 'E', salesOrderId: 'SO-GONE', salesOrderLineId: 'L1' }),
  ];
  const out = withLinePeriods(terms, orders, lines);
  assert.notEqual(out, terms, 'อาร์เรย์ใหม่');
  assert.deepEqual(out.map((t) => [t.id, t.linePeriodFrom ?? null, t.linePeriodTo ?? null]), [
    ['A', '2026-09-02', '2027-09-01'], ['B', null, null], ['C', null, null], ['D', null, null], ['E', null, null],
  ]);
  assert.equal(terms[0].linePeriodFrom, undefined, 'ไม่แก้ term ของผู้เรียก');
  for (const index of [1, 2, 3, 4]) assert.equal(out[index], terms[index], `term ${terms[index].id} = ออบเจ็กต์เดิม`);
  /* รับออบเจ็กต์ธรรมดาได้เหมือน Map · ค่าว่าง = [] */
  assert.equal(withLinePeriods(terms, Object.fromEntries(orders), Object.fromEntries(lines))[0].linePeriodTo, '2027-09-01');
  assert.deepEqual(withLinePeriods(undefined, orders, lines), []);
  assert.deepEqual(withLinePeriods(terms).map((t) => t.id), ['A', 'B', 'C', 'D', 'E']);
  /* ใบทั้งใบล้วน = ทุกตัวเป็นออบเจ็กต์เดิม */
  const whole = [term({ id: 'W1', salesOrderId: 'SO-CUR', salesOrderLineId: 'LW' })];
  assert.equal(withLinePeriods(whole, orders, lines)[0], whole[0]);
});

test('🔴 0400 termsSoldNow: ต่อสัญญาสาขาเดียว — รายการของใบเก่าจบแล้วแม้ช่วงรวมของใบเก่ายังไม่จบ ⇒ ไม่นับซ้ำกับใบต่อสัญญา', () => {
  /* ใบเก่า (line): สาขา A จบ 01/09/2027 · ช่วงรวมของใบจบ 25/09/2027 · ใบต่อสัญญาของสาขา A เริ่ม 02/09/2027 */
  const orders = new Map([
    ['SO-JT', lineOrder()],
    ['SO-REN', stampedOrder({ id: 'SO-REN', servicePeriodFrom: '2027-09-02', servicePeriodTo: '2028-09-01' })],
  ]);
  const raw = [
    term({ id: 'OLD', zoneId: 'Z1', salesOrderId: 'SO-JT', salesOrderLineId: 'L1' }),
    term({ id: 'REN', zoneId: 'Z1', salesOrderId: 'SO-REN', salesOrderLineId: 'R1' }),
  ];
  const lines = new Map([['L1', { servicePeriodFrom: '2026-09-02', servicePeriodTo: '2027-09-01' }]]);
  const attached = withLinePeriods(raw, orders, lines);
  const ids = (list, day) => termsSoldNow(list, orders, day).map((t) => t.id);
  assert.deepEqual(ids(attached, '2027-09-10'), ['REN'], 'ช่วงของรายการ: ใบเก่าจบ 01/09 ⇒ เหลือใบต่อสัญญา');
  assert.deepEqual(ids(raw, '2027-09-10'), ['OLD', 'REN'], 'ตัวโหลดลืมแนบ = ถอยไปช่วงรวม (นับซ้อนจนช่วงรวมจบ — ยามตัวโหลดกันไว้)');
  assert.deepEqual(ids(attached, '2027-09-01'), ['OLD'], 'วันจบของรายการยังนับ · ใบต่อสัญญายังไม่เริ่ม');
  /* ทุกรอบยังไม่เริ่ม: เลือกรอบที่ "ช่วงของรายการ" เริ่มก่อนสุด ไม่ใช่ช่วงรวมของใบ */
  const future = withLinePeriods([
    term({ id: 'F-LATE', zoneId: 'Z1', salesOrderId: 'SO-JT', salesOrderLineId: 'L9' }),
    term({ id: 'F-CUR', zoneId: 'Z1', salesOrderId: 'SO-NEXT', salesOrderLineId: 'N1' }),
  ], new Map([['SO-JT', lineOrder()], ['SO-NEXT', stampedOrder({ id: 'SO-NEXT', servicePeriodFrom: '2026-09-10', servicePeriodTo: '2027-09-09' })]]),
  new Map([['L9', { servicePeriodFrom: '2026-09-26', servicePeriodTo: '2027-09-25' }]]));
  assert.deepEqual(termsSoldNow(future, new Map([['SO-JT', lineOrder()], ['SO-NEXT', stampedOrder({ id: 'SO-NEXT', servicePeriodFrom: '2026-09-10', servicePeriodTo: '2027-09-09' })]]), '2026-09-05').map((t) => t.id),
    ['F-CUR'], 'ช่วงรวมของ SO-JT เริ่ม 02/09 แต่รายการนี้เริ่ม 26/09 ⇒ ใบที่เริ่ม 10/09 มาก่อน');
});
