// ── รอบขายของโซน (mig 0297) ───────────────────────────────────────────────
//
// กติกาที่ชุดนี้ยึด: term ไม่มีคอลัมน์ status — "มีผลไหม" ต้องคำนวณจากใบสั่งขายแม่
// ที่ไฟล์เดียว ไม่งั้นระบบจะมีนาฬิกาสองเรือนแบบที่ "live visit" เคยมีห้าเรือน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ML_PER_PACK_HINT,
  isPackUnit,
  latestTermOfZone,
  normalizeTermInput,
  suggestStandardMl,
  termInWindow,
  termIsActive,
  termOrderActive,
  termSnapshotFromLine,
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

test('snapshot ก๊อปจากบรรทัดขาย — qty คือจำนวนแพ็ค', () => {
  const snap = termSnapshotFromLine({ productId: 'P1', fgCode: 'FG-1', description: 'A Breath of Dream', qty: 2, unit: 'แพ็ค' });
  assert.deepEqual(snap, { productId: 'P1', fgCode: 'FG-1', description: 'A Breath of Dream', packageQty: 2, unit: 'แพ็ค' });
});

test('บรรทัดที่ไม่มีจำนวน = ปล่อยว่าง ไม่ใช่ 0 (0 แพ็ค/เดือน = ไม่มีวันเตือน)', () => {
  assert.equal(termSnapshotFromLine({ qty: 0 }).packageQty, null);
  assert.equal(termSnapshotFromLine({}).packageQty, null);
});

test('⭐ มาตรฐานต่อเดือนเป็น "ข้อเสนอ" ไม่ใช่ค่าที่ระบบเขียนเอง', () => {
  assert.equal(ML_PER_PACK_HINT, 1000);
  assert.equal(suggestStandardMl(2, 'แพ็ค'), 2000);
  assert.equal(suggestStandardMl(0.5, 'Pack'), 500);
  // ไม่มีจำนวนแพ็ค = ไม่มีข้อเสนอ ไม่ใช่เดาเป็น 1000
  assert.equal(suggestStandardMl(null, 'แพ็ค'), null);
  assert.equal(suggestStandardMl('abc', 'แพ็ค'), null);
  // และค่าที่เขียนลงแถวต้องมาจาก body เท่านั้น
  assert.equal(normalizeTermInput({ zoneId: 'Z1', salesOrderId: 'SO1', salesOrderLineId: 'L1', packageQty: 2 }).value.standardMlPerMonth, null);
});

test('⭐ หน่วยที่ไม่ใช่แพ็ค ต้องไม่มีข้อเสนอ — "240 กิโลกรัม ⇒ 240,000 ml" ไม่มีความหมาย', () => {
  assert.equal(suggestStandardMl(240, 'กิโลกรัม'), null);
  assert.equal(suggestStandardMl(12, 'ขวด'), null);
  assert.equal(suggestStandardMl(3, null), null, 'ไม่รู้หน่วย = ไม่เดา');
  assert.equal(isPackUnit('แพ็ค'), true);
  assert.equal(isPackUnit('กิโลกรัม'), false);
});

test('ตรวจข้อมูลก่อนเขียน: ต้องมีโซนและบรรทัดขายเสมอ', () => {
  assert.match(normalizeTermInput({}).error, /โซน/);
  assert.match(normalizeTermInput({ zoneId: 'Z1' }).error, /บรรทัด/);
  assert.equal(normalizeTermInput({ zoneId: 'Z1', salesOrderId: 'SO1', salesOrderLineId: 'L1' }).error, null);
});

test('ตัวเลขติดลบ/ศูนย์ และช่วงวันกลับหัว ต้องถูกปฏิเสธพร้อมบอกช่อง', () => {
  const base = { zoneId: 'Z1', salesOrderId: 'SO1', salesOrderLineId: 'L1' };
  assert.match(normalizeTermInput({ ...base, packageQty: -1 }).error, /แพ็ค/);
  assert.match(normalizeTermInput({ ...base, standardMlPerMonth: 0 }).error, /ml/);
  assert.match(normalizeTermInput({ ...base, startDate: '2026-06-01', endDate: '2026-01-01' }).error, /วันเริ่ม/);
  assert.match(normalizeTermInput({ ...base, startDate: '01/06/2026' }).error, /ไม่ถูกต้อง/);
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
