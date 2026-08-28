// ── รอบขายของโซน (mig 0297) ───────────────────────────────────────────────
//
// กติกาที่ชุดนี้ยึด: term ไม่มีคอลัมน์ status — "มีผลไหม" ต้องคำนวณจากใบสั่งขายแม่
// ที่ไฟล์เดียว ไม่งั้นระบบจะมีนาฬิกาสองเรือนแบบที่ "live visit" เคยมีห้าเรือน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ML_PER_PACK_HINT,
  allocatedByLine,
  fgSummary,
  isPackUnit,
  latestTermOfZone,
  lineNeedsAllocation,
  normalizeTermInput,
  remainingOfLine,
  spreadAllocation,
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

/* ── จัดสรรบรรทัดขายลงหลายโซน (mig 0312 · มติผู้ใช้ 2026-08-29) ──────────────
   > *"ไม่ต้องนับบรรทัดแล้ว นับแค่จำนวน FG พอ เพื่อให้ทาง TS จัดสรร ส่งโซนเอง"*
   ของจริงที่เป็นเหตุ: SO-26080077-0 มี **10 บรรทัด แต่เป็น FG แค่ 2 ชนิด รวม 13 หน่วย** */
test('⭐ บรรทัดเดียวแบ่งลงหลายโซนได้ — เหลือเท่าไรคิดจากผลรวม', () => {
  const line = { id: 'L1', fgCode: 'FG-1', qty: 13, unit: 'แพ็คเกจ' };
  const alloc = allocatedByLine([
    { salesOrderLineId: 'L1', zoneId: 'Z1', packageQty: 5 },
    { salesOrderLineId: 'L1', zoneId: 'Z2', packageQty: 4 },
  ]);
  assert.equal(remainingOfLine(line, alloc.get('L1')), 4);
  assert.equal(lineNeedsAllocation(line, alloc), true);
});

test('จัดสรรครบแล้วหลุดจากคิว', () => {
  const line = { id: 'L1', qty: 13 };
  const alloc = allocatedByLine([{ salesOrderLineId: 'L1', packageQty: 13 }]);
  assert.equal(remainingOfLine(line, alloc.get('L1')), 0);
  assert.equal(lineNeedsAllocation(line, alloc), false);
});

/* ⚠️ แถวที่เกิดก่อน mig 0312 ไม่มี `packageQty` (ตอนนั้น 1 บรรทัด = 1 โซนเสมอ)
   นับเป็น 0 เมื่อไร ใบเก่าทุกใบจะเด้งกลับเข้าคิวพร้อมกันทั้งกอง */
test('⭐ term เก่าที่ไม่ระบุจำนวน = กินทั้งบรรทัด ไม่ใช่จัดสรร 0', () => {
  const line = { id: 'L1', qty: 13 };
  const alloc = allocatedByLine([{ salesOrderLineId: 'L1', packageQty: null }]);
  assert.equal(remainingOfLine(line, alloc.get('L1')), 0);
  assert.equal(lineNeedsAllocation(line, alloc), false);
});

test('บรรทัดที่ไม่มีจำนวน (บริการ "1 งาน") จัดสรรได้โซนเดียวแล้วจบ', () => {
  const line = { id: 'L9', qty: null, unit: 'งาน' };
  assert.equal(remainingOfLine(line, undefined), 1, 'ยังไม่ผูก = ยังต้องจัดสรร');
  assert.equal(remainingOfLine(line, allocatedByLine([{ salesOrderLineId: 'L9', packageQty: 1 }]).get('L9')), 0);
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

/* ── กระจายจัดสรรระดับ FG ลงบรรทัด ─────────────────────────────────────
   ⭐ คนทำงานคิดเป็น FG ระบบเก็บเป็นบรรทัด — TS ไม่ต้องรู้ว่าเอกสารขายแบ่งบรรทัดยังไง */
test('⭐ FG เดียวข้าม 2 บรรทัด แบ่งลง 3 โซน — ไล่ตัดจากบรรทัดแรกก่อน', () => {
  const group = fgSummary([
    { id: 'L1', fgCode: 'FG-1', qty: 10 },
    { id: 'L2', fgCode: 'FG-1', qty: 3 },
  ])[0];
  const out = spreadAllocation(group, [
    { zoneId: 'Z1', qty: 5 }, { zoneId: 'Z2', qty: 6 }, { zoneId: 'Z3', qty: 2 },
  ]);
  assert.deepEqual(out.map((r) => [r.salesOrderLineId, r.zoneId, r.packageQty]), [
    ['L1', 'Z1', 5],
    ['L1', 'Z2', 5],
    ['L2', 'Z2', 1],   // ล้นจากบรรทัดแรกไปบรรทัดถัดไปเอง
    ['L2', 'Z3', 2],
  ]);
  assert.equal(out.reduce((s, r) => s + r.packageQty, 0), 13, 'รวมแล้วต้องเท่าของทั้งกลุ่ม');
});

test('ไม่ระบุจำนวน = ยกที่เหลือทั้งกลุ่มลงโซนนั้น', () => {
  const group = fgSummary([{ id: 'L1', fgCode: 'FG-1', qty: 4 }])[0];
  const out = spreadAllocation(group, [{ zoneId: 'Z1' }]);
  assert.deepEqual(out.map((r) => r.packageQty), [4]);
});

test('ของที่จัดสรรไปแล้วรอบก่อนไม่ถูกนับซ้ำ', () => {
  const lines = [{ id: 'L1', fgCode: 'FG-1', qty: 10 }];
  const already = allocatedByLine([{ salesOrderLineId: 'L1', zoneId: 'Z0', packageQty: 7 }]);
  const group = fgSummary(lines, already)[0];
  assert.equal(group.remaining, 3);
  const out = spreadAllocation(group, [{ zoneId: 'Z1' }], already);
  assert.deepEqual(out.map((r) => r.packageQty), [3]);
});

test('โซนที่ยังไม่ได้เลือกถูกข้าม ไม่ใช่สร้างแถวเปล่า', () => {
  const group = fgSummary([{ id: 'L1', fgCode: 'FG-1', qty: 5 }])[0];
  assert.deepEqual(spreadAllocation(group, [{ zoneId: '', qty: 2 }]), []);
});
