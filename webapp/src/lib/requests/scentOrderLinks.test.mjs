// SO ของคำร้องพัฒนากลิ่น: SO หลัก + SO แนบ (ม-163) — logic ล้วน
//
// ⭐ สองตัวนับห้ามปน: จำนวนกลิ่น (ด่านปิดใบ) กับรอบแก้ที่ซื้อ (03-010 ของ SO แนบ)
// ⭐ SO หนึ่งใบมีเจ้าของคำร้องเดียว และเจ้าของเดินตามสาย Rev.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentRevisionOf, paidRevisionLines, revisionAncestorIds, scentOrderOwner, scentOrderOwnerOf,
  scentOrderTakenText, scentRequestRef, scentSlotLines, scentSlotLinesOf, scentSlotNote, scentSlotSummary,
  usedRevisionCount,
} from './scentOrderLinks.js';
import { scentDesignOrderError, scentDesignOrderOptions } from './scentDesignOrders.js';
import { soReconcile } from './soReconcile.js';

const fg = (category, qty) => ({ fgCode: `FG-100-${category}`, qty: String(qty) });
const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

test('จำนวนกลิ่น: SO หลักนับแบบเดิม (รวม 03-010) · SO แนบนับเฉพาะงานออกแบบที่ไม่ใช่ 03-010', () => {
  const mainLines = [fg('03-002', 2), fg('01-001', 500)];
  const attached = [{ lines: [fg('03-002', 1)] }, { lines: [fg('03-010', 1)] }];
  const slots = scentSlotLines({ mainLines, attached });
  assert.deepEqual(slots.map((l) => l.fgCode), ['FG-100-03-002', 'FG-100-03-002']);
  // 🐞 ทิพย์นที: จ่าย 2 + ซื้อเพิ่ม 03-002 ×1 + 03-010 ×1 ⇒ 3 กลิ่น · 1 รอบแก้ ไม่ใช่ 4 กลิ่น
  const s = scentSlotSummary({ mainLines, attached, items: [] });
  assert.equal(s.slots, 3);
  assert.equal(s.mainSlots, 2);
  assert.equal(s.attachedSlots, 1);
  assert.equal(s.paidRevisions, 1);
  assert.equal(s.attachedCount, 2);
});

test('SO หลักที่ขายแก้ไขกลิ่นล้วนยังมีจำนวนกลิ่น (ม-38 ไม่เปลี่ยน)', () => {
  const s = scentSlotSummary({ mainLines: [fg('03-010', 2)] });
  assert.equal(s.slots, 2);
  assert.equal(s.paidRevisions, 0);
});

test('รอบแก้ที่ซื้อมาจาก SO แนบเท่านั้น', () => {
  assert.equal(paidRevisionLines({ attached: [{ lines: [fg('03-010', 2), fg('03-002', 1)] }] }).length, 1);
  assert.deepEqual(paidRevisionLines({}), []);
});

test('รอบแก้ที่ใช้ = แถวรอบแก้ของสายพัฒนากลิ่น', () => {
  const items = [
    { lineKind: 'scent_dev', derivedFromItemId: null },
    { lineKind: 'scent_dev', derivedFromItemId: 'I1' },
    { lineKind: 'product_dev', derivedFromItemId: 'I2' },
  ];
  assert.equal(usedRevisionCount(items), 1);
});

test('ด่านปิดใบเห็นจำนวนกลิ่นรวม SO แนบ — คอนเฟิร์ม 3 จาก 3 ปิดได้', () => {
  const request = { scentSlotLines: scentSlotLines({ mainLines: [fg('03-002', 2)], attached: [{ lines: [fg('03-002', 1)] }] }) };
  const items = Array.from({ length: 3 }, () => ({ outcome: 'confirmed' }));
  assert.equal(soReconcile({ lines: scentSlotLinesOf(request), items }).state, 'match');
});

test('ตัวโหลดไม่ได้เติม scentSlotLines = ถอยไปบรรทัดออกแบบกลิ่นของ SO หลักแบบเดิม', () => {
  const request = { salesOrderLines: [fg('03-002', 2), fg('01-001', 500)] };
  assert.equal(scentSlotLinesOf(request).length, 1);
  assert.deepEqual(scentSlotLinesOf(null), []);
});

test('ข้อความเสริม: ไม่มี SO แนบ = เงียบ (จอเหมือนเดิมเป๊ะ)', () => {
  assert.equal(scentSlotNote(scentSlotSummary({ mainLines: [fg('03-002', 2)] })), null);
  assert.equal(scentSlotNote(null), null);
  const note = scentSlotNote(scentSlotSummary({
    mainLines: [fg('03-002', 2)],
    attached: [{ lines: [fg('03-002', 1)] }, { lines: [fg('03-010', 1)] }],
    items: [{ lineKind: 'scent_dev', derivedFromItemId: 'X' }],
  }));
  assert.equal(note, 'จำนวนกลิ่น 3 (SO หลัก 2 + แนบ 1) · รอบแก้: ซื้อ 1 · ใช้ 1');
});

test('ใบ Rev. ที่ใช้นับ: ใบล่าสุดที่อนุมัติ · ไม่มีก็ใบล่าสุดที่ถูกแทน · ไม่มีทั้งคู่ก็ใบที่ผูกไว้', () => {
  const a = { id: 'A', status: 'revised', supersededById: 'B' };
  const b = { id: 'B', status: 'approved', supersededById: null };
  assert.equal(currentRevisionOf(a, byId([a, b])).id, 'B');
  // Rev. ใหม่ยังรออนุมัติ ⇒ บรรทัดที่ลูกค้าตกลงไว้ล่าสุดคือใบที่ถูกแทน
  const b2 = { id: 'B', status: 'pending_approval', supersededById: null };
  assert.equal(currentRevisionOf(a, byId([a, b2])).id, 'A');
  const lone = { id: 'X', status: 'approved' };
  assert.equal(currentRevisionOf(lone, new Map()).id, 'X');
  // ใบถัดไปตามไม่เจอ = หยุดที่ใบเดิม ไม่เดา
  assert.equal(currentRevisionOf({ id: 'C', status: 'approved', supersededById: 'gone' }, new Map()).id, 'C');
  assert.equal(currentRevisionOf(null), null);
});

test('สาย Rev. ที่วนกลับหากันไม่ทำให้ค้าง', () => {
  const a = { id: 'A', status: 'revised', supersededById: 'B', revisedFromId: 'B' };
  const b = { id: 'B', status: 'revised', supersededById: 'A', revisedFromId: 'A' };
  assert.equal(currentRevisionOf(a, byId([a, b])).id, 'B');
  assert.deepEqual(revisionAncestorIds(a, byId([a, b])), ['A', 'B']);
});

test('เจ้าของ: SO หลัก · SO แนบ · ไม่มี', () => {
  const order = { id: 'SO1', revisedFromId: null };
  const mainBySo = new Map([['SO1', { id: 'R1', docNo: 'RQ-1', status: 'acknowledged' }]]);
  assert.deepEqual(scentOrderOwnerOf(order, { mainBySo }), {
    requestId: 'R1', docNo: 'RQ-1', status: 'acknowledged', role: 'main', viaOrderId: 'SO1',
  });
  const linkBySo = new Map([['SO1', { requestId: 'R2', request: { id: 'R2', docNo: 'RQ-2', status: 'answered' } }]]);
  assert.equal(scentOrderOwnerOf(order, { linkBySo }).role, 'attached');
  assert.equal(scentOrderOwnerOf(order, {}), null);
});

test('เจ้าของที่ยกเลิกแล้วไม่นับ — ทั้งหลักและแนบ', () => {
  const order = { id: 'SO1' };
  assert.equal(scentOrderOwnerOf(order, { mainBySo: new Map([['SO1', { id: 'R1', status: 'cancelled' }]]) }), null);
  assert.equal(scentOrderOwnerOf(order, {
    linkBySo: new Map([['SO1', { requestId: 'R2', request: { id: 'R2', status: 'cancelled' } }]]),
  }), null);
  // ลิงก์ที่ตามคำร้องไม่เจอ = ไม่นับ
  assert.equal(scentOrderOwnerOf(order, { linkBySo: new Map([['SO1', { requestId: 'R3', request: null }]]) }), null);
});

test('เจ้าของเดินตามสาย Rev. — ใบ Rev. ของ SO ที่มีคำร้องแล้ว เปิดซ้ำไม่ได้', () => {
  const old = { id: 'SO1', revisedFromId: null };
  const rev = { id: 'SO1R', revisedFromId: 'SO1' };
  const mainBySo = new Map([['SO1', { id: 'R1', docNo: 'RQ-1', status: 'acknowledged' }]]);
  const owner = scentOrderOwner(rev, { ordersById: byId([old, rev]), mainBySo });
  assert.equal(owner.requestId, 'R1');
  assert.equal(owner.viaOrderId, 'SO1');
  assert.equal(owner.viaRevision, true);
  assert.match(
    scentOrderTakenText(owner, { orderNumberOf: (id) => (id === 'SO1' ? 'SO-26080001-0' : null) }),
    /เป็น Rev\. ของ SO-26080001-0 ซึ่งมีคำร้อง RQ-1 อยู่แล้ว/,
  );
  // ใบก่อนหน้าที่ไม่อยู่ใน Map ยังถูกถาม (id มาจาก revisedFromId ของใบเอง)
  assert.equal(scentOrderOwner(rev, { mainBySo }).requestId, 'R1');
});

test('ข้อความ "มีเจ้าของแล้ว" บอกทางออกตามบทบาท', () => {
  assert.equal(scentOrderTakenText(null), null);
  assert.match(scentOrderTakenText({ role: 'main', docNo: 'RQ-1' }), /เปิดคำร้องไปแล้ว \(RQ-1\) — ขอเพิ่มต้องออกใบสั่งขายใหม่/);
  assert.equal(scentOrderTakenText({ role: 'attached', docNo: 'RQ-2' }), 'ใบสั่งขายนี้แนบอยู่กับคำร้อง RQ-2 แล้ว');
  // ไม่มีเลขที่ (ร่าง) ถอยไปใช้ id
  assert.match(scentOrderTakenText({ role: 'main', requestId: 'DR-1' }), /DR-1/);
});

test('ก้อน scentRequest ของ API ฝั่ง SO คงสามคีย์เดิม + บทบาท + ข้อความด่าน', () => {
  assert.equal(scentRequestRef(null), null);
  const ref = scentRequestRef({ requestId: 'R2', docNo: 'RQ-2', status: 'answered', role: 'attached', viaOrderId: 'SO1', viaRevision: false });
  assert.deepEqual(ref, {
    id: 'R2', docNo: 'RQ-2', status: 'answered', role: 'attached', viaRevision: false,
    takenText: 'ใบสั่งขายนี้แนบอยู่กับคำร้อง RQ-2 แล้ว',
  });
});

test('ด่านเปิดคำร้อง: ข้อความตามบทบาทชนะข้อความเดิม · ฟอร์มกรอง SO แนบออกจากลิสต์', () => {
  const order = { id: 'SO1', status: 'approved' };
  const lines = [fg('03-002', 1)];
  assert.equal(
    scentDesignOrderError(order, lines, { usedByRequestNo: 'RQ-2', usedByText: 'ใบสั่งขายนี้แนบอยู่กับคำร้อง RQ-2 แล้ว' }),
    'ใบสั่งขายนี้แนบอยู่กับคำร้อง RQ-2 แล้ว',
  );
  // ไม่ส่งข้อความมา = ข้อความเดิมของ SO หลัก (ผู้เรียกรุ่นเก่ายังได้ผลเดิม)
  assert.match(scentDesignOrderError(order, lines, { usedByRequestNo: 'RQ-1' }), /เปิดคำร้องไปแล้ว \(RQ-1\)/);
  const attached = { ...order, lines, scentRequest: scentRequestRef({ requestId: 'R2', docNo: 'RQ-2', status: 'answered', role: 'attached' }) };
  const free = { id: 'SO2', status: 'approved', lines, scentRequest: null };
  assert.deepEqual(scentDesignOrderOptions([attached, free]).map((o) => o.id), ['SO2']);
});
