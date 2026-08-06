// ── รอบแก้ของสายพัฒนากลิ่น — เติมลงแถวเดิม ไม่สร้างแถวใหม่ ────────────────
//
// ⚠️ ทั้งไฟล์นี้เกิดจากทางตันที่ #1049 บันทึกไว้: แถวรอบแก้เกิดที่ `awaiting_ack`
// แล้วไม่มีทางไหนพามันไปถึงขั้นใส่ราคาได้เลย ⇒ ใบปิดไม่ลงทุกครั้งที่ลูกค้าขอแก้
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingReworkRows, reworkHopError, reworkSlotFrom, reworkSlots, reworkTargetError,
} from './rework.js';
import { normalizeDeliveryRows } from './delivery.js';

// แถวรอบแรกที่ลูกค้าขอให้แก้ + แถวรอบแก้ที่ระบบสร้างรอไว้
const source = {
  id: 'DRI-1', requestId: 'DR-1', lineKind: 'scent_dev', sortOrder: 1,
  label: 'SC-001 ทะเลเช้า', briefId: 'BRF-1', producedScentId: 'SCENT-1',
  answerStatus: 'pending', ackAt: '2026-08-01', readyAt: '2026-08-01',
  pickedUpAt: '2026-08-02', sentAt: '2026-08-03',
  outcome: 'revise', outcomeAt: '2026-08-05', outcomeNote: 'ขอให้หวานขึ้นอีกนิด',
};
const rework = {
  id: 'DRI-2', requestId: 'DR-1', lineKind: 'scent_dev', sortOrder: 2,
  label: 'SC-001 ทะเลเช้า', briefId: 'BRF-1',
  derivedFromItemId: 'DRI-1', answerStatus: 'pending',
};
const items = [source, rework];

test('แถวรอบแก้ที่ยังไม่มีใครส่งของลงไป = แถวที่รอเติม', () => {
  assert.deepEqual(pendingReworkRows(items).map((r) => r.id), ['DRI-2']);
  // แถวต้นทางไม่ใช่แถวรอเติม — มันเดินจบไปแล้ว
  assert.ok(!pendingReworkRows(items).some((r) => r.id === 'DRI-1'));
});

test('ส่งของลงไปแล้วต้องหลุดจากคิวรอเติม — ไม่งั้นจะเติมทับของที่ SA เห็นไปแล้ว', () => {
  const filled = { ...rework, ackAt: '2026-08-06', readyAt: '2026-08-06', producedScentId: 'SCENT-2' };
  assert.deepEqual(pendingReworkRows([source, filled]), []);
  assert.match(reworkTargetError('DRI-2', [source, filled]), /ส่งของไปแล้ว/);
});

test('⭐ ช่องเติมพาบรีฟและกลิ่นต้นทางมาให้ — RD ไม่ต้องกรอกซ้ำและผูกผิดไม่ได้', () => {
  const slot = reworkSlotFrom(rework, items);
  assert.equal(slot.targetItemId, 'DRI-2');
  assert.equal(slot.briefId, 'BRF-1');
  assert.equal(slot.derivedFromScentId, 'SCENT-1');
  assert.equal(slot.customerNote, 'ขอให้หวานขึ้นอีกนิด');
  assert.equal(slot.sourceLabel, 'SC-001 ทะเลเช้า');
  assert.deepEqual(reworkSlots(items).map((s) => s.targetItemId), ['DRI-2']);
});

test('แถวรอบแก้รุ่นเก่าที่ briefId ว่าง ยังถอยไปหาบรีฟของแถวต้นทางได้', () => {
  // แถวที่เกิดก่อน #1049 ไม่เคยได้ briefId ติดมา — ของพวกนี้อยู่บน prod แล้ว
  const legacy = { ...rework, briefId: null };
  assert.equal(reworkSlotFrom(legacy, [source, legacy]).briefId, 'BRF-1');
});

// ── ด่านฝั่ง server ──────────────────────────────────────────────────────
test('ห้ามเชื่อ targetItemId ที่ client ส่งมา', () => {
  assert.equal(reworkTargetError('', items), null);         // ไม่ระบุ = สร้างใหม่ตามปกติ
  assert.match(reworkTargetError('DRI-999', items), /ไม่พบรายการรอบแก้/);
  // แถวที่ไม่ใช่รอบแก้ — เติมทับได้เมื่อไรก็ลบของที่ส่งไปแล้วทิ้ง
  assert.match(reworkTargetError('DRI-1', items), /ไม่ใช่รอบแก้/);
});

// ── ประกอบกับฟอร์มส่งกลิ่น ───────────────────────────────────────────────
test('⭐ ส่งของลงรอบแก้: บรีฟกับกลิ่นต้นทางมาจากแถว ไม่ใช่จากที่ client ส่ง', () => {
  const { rows, error } = normalizeDeliveryRows([{
    targetItemId: 'DRI-2',
    name: 'ทะเลเช้า v2', code: 'SC-002', sentAt: '2026-08-10',
    // client แกล้งส่งของผิดมาทั้งสองช่อง — ต้องถูกทับด้วยของจริง
    briefId: 'BRF-9', derivedFromScentId: 'SCENT-9',
  }], { briefs: [{ id: 'BRF-1' }, { id: 'BRF-2' }], items });

  assert.equal(error, null);
  assert.equal(rows[0].targetItemId, 'DRI-2');
  assert.equal(rows[0].briefId, 'BRF-1');
  assert.equal(rows[0].derivedFromScentId, 'SCENT-1');
});

test('ส่งของใหม่ (ไม่ใช่รอบแก้) ยังทำงานเหมือนเดิมทุกอย่าง', () => {
  const { rows, error } = normalizeDeliveryRows([{
    name: 'ทะเลบ่าย', code: 'SC-003', sentAt: '2026-08-10', briefId: 'BRF-2',
  }], { briefs: [{ id: 'BRF-1' }, { id: 'BRF-2' }], items });

  assert.equal(error, null);
  assert.equal(rows[0].targetItemId, null);
  assert.equal(rows[0].briefId, 'BRF-2');
  assert.equal(rows[0].derivedFromScentId, null);
});

test('targetItemId ที่ใช้ไม่ได้ ต้องตีกลับพร้อมบอกว่ารายการที่เท่าไร', () => {
  const { error } = normalizeDeliveryRows([{
    targetItemId: 'DRI-1', name: 'x', code: 'SC-004',
  }], { briefs: [], items });
  assert.match(error, /รายการที่ 1: .*ไม่ใช่รอบแก้/);
});

// ── ปุ่ม "ส่งของ" บนรางคือทางที่พาไปตายมาก่อน ────────────────────────────
test('⭐ สายพัฒนากลิ่นเดินก้าว "ส่งของ" บนรางไม่ได้ — ต้องผ่านโมดัลส่งกลิ่น', () => {
  // ประทับ readyAt เฉย ๆ = แถวหลุดจากคิวรอเติมทั้งที่ producedScentId ยังว่าง
  // ⇒ ถึงขั้นใส่ราคาโดนตีกลับ 400 และไม่มีทางกลับมาเติมได้อีก
  assert.match(reworkHopError(rework, 'ready'), /ส่งกลิ่น/);
  assert.match(reworkHopError(source, 'ready'), /ส่งกลิ่น/);

  // ก้าวอื่นของสายเดียวกันยังเดินได้ตามปกติ
  for (const hop of ['ack', 'pickup', 'send', 'outcome']) {
    assert.equal(reworkHopError(rework, hop), null, hop);
  }
  // สายอื่นไม่ถูกแตะ — ขอราคา/พัฒนาผลิตภัณฑ์ยังส่งของบนรางเหมือนเดิม
  assert.equal(reworkHopError({ lineKind: 'product_dev' }, 'ready'), null);
  assert.equal(reworkHopError({ lineKind: 'material' }, 'ready'), null);
});
