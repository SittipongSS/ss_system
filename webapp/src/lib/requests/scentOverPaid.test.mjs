// คอนเฟิร์มเกินจำนวนที่ลูกค้าจ่าย (ม-164 PR-3) — logic ล้วน + ด่านปิดใบ + ก้าวใหม่ใน hops
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OVER_PAID_CODE, freebieHopError, freebieNotNeededError, overPaidAfterConfirm, paidScentSlots, unexplainedOver,
} from './scentOverPaid.js';
import { soReconcile, soReconcileText, soReconcileTone } from './soReconcile.js';
import { cancelRequestError, closeRequestError } from './stages.js';
import { HOP_OWNER, hopLabel, hopPatch, hopStageError, hopUpdateKind, hopValuesError } from './hops.js';

const fg = (category, qty) => ({ fgCode: `FG-1-${category}`, qty: String(qty) });
const req = (over = {}) => ({
  id: 'R1', kind: 'scent_dev', status: 'answered', answeredAt: '2026-11-10',
  salesOrderLines: [fg('03-002', 2)], ...over,
});
const confirmed = (id, extra = {}) => ({ id, lineKind: 'scent_dev', outcome: 'confirmed', answerStatus: 'done', ...extra });
const sent = (id) => ({ id, lineKind: 'scent_dev', sentAt: '2026-11-01' });

test('จำนวนกลิ่นที่จ่าย: SO หลัก + SO แนบ · อ่านไม่ได้/ไม่ใช่พัฒนากลิ่น = ไม่มีด่าน', () => {
  assert.equal(paidScentSlots(req()), 2);
  assert.equal(paidScentSlots(req({ scentSlotLines: [fg('03-002', 2), fg('03-002', 1)] })), 3);
  assert.equal(paidScentSlots(req({ salesOrderLines: [fg('03-002', 1.5)] })), null);
  assert.equal(paidScentSlots(req({ salesOrderLines: [] })), null);
  assert.equal(paidScentSlots(req({ kind: 'billing_doc' })), null);
});

test('คอนเฟิร์มกลิ่นที่ 3 จาก 2 = ตีกลับ over_paid · แถมหรือแนบ SO แล้วผ่าน', () => {
  const items = [confirmed('A'), confirmed('B'), sent('C')];
  const over = overPaidAfterConfirm({ request: req(), items, rowId: 'C' });
  assert.equal(over.code, OVER_PAID_CODE);
  assert.equal(over.confirmedAfter, 3);
  assert.match(over.error, /คอนเฟิร์ม 3 จาก 2/);
  assert.equal(overPaidAfterConfirm({ request: req(), items, rowId: 'C', freebieReason: 'แถมลูกค้าประจำ' }), null);
  // แนบ SO ที่ซื้อเพิ่มแล้ว (03-002 ×1) = ไม่เกิน
  assert.equal(overPaidAfterConfirm({ request: req({ scentSlotLines: [fg('03-002', 3)] }), items, rowId: 'C' }), null);
  // คอนเฟิร์มกลิ่นที่ 2 จาก 2 = ไม่เกิน
  assert.equal(overPaidAfterConfirm({ request: req(), items: [confirmed('A'), sent('C')], rowId: 'C' }), null);
});

test('เหตุผลแถมตอนยังไม่เกิน = ตีกลับ (กันติดป้ายผิด)', () => {
  const items = [confirmed('A'), sent('C')];
  assert.match(freebieNotNeededError({ request: req(), items, rowId: 'C', freebieReason: 'x' }), /ยังไม่เกิน/);
  assert.equal(freebieNotNeededError({ request: req(), items, rowId: 'C' }), null);
});

test('ระบุแถมย้อนหลัง: ได้เฉพาะตอนใบเกินที่ยังไม่ระบุ (3 ใบบน prod ที่เกินอยู่ก่อนมีด่าน)', () => {
  const items = [confirmed('A'), confirmed('B'), confirmed('C')];
  assert.equal(unexplainedOver(req(), items), 1);
  assert.equal(freebieHopError(req(), items), null);
  const covered = [confirmed('A'), confirmed('B'), confirmed('C', { freebieReason: 'แถม' })];
  assert.equal(unexplainedOver(req(), covered), 0);
  assert.match(freebieHopError(req(), covered), /ยังไม่เกิน/);
  assert.match(freebieHopError(req({ salesOrderLines: [] }), items), /ไม่มีจำนวนกลิ่น/);
});

test('การ์ดกระทบยอด: แยกแถมกับเกินที่ยังไม่ระบุ · แถมครบ = เขียว', () => {
  const lines = [fg('03-002', 2)];
  const allFree = soReconcile({ lines, items: [confirmed('A'), confirmed('B'), confirmed('C', { freebieReason: 'x' })] });
  assert.equal(allFree.state, 'over');
  assert.equal(allFree.freebies, 1);
  assert.equal(allFree.unexplained, 0);
  assert.match(soReconcileText(allFree), /คอนเฟิร์ม 3 จาก 2 ในใบสั่งขาย — แถม 1$/);
  assert.equal(soReconcileTone(allFree), 'success');
  const legacy = soReconcile({ lines: [fg('03-002', 1)], items: [confirmed('A'), confirmed('B'), confirmed('C'), confirmed('D')] });
  assert.match(soReconcileText(legacy), /คอนเฟิร์ม 4 จาก 1 ในใบสั่งขาย — เกิน 3 ยังไม่ระบุ$/);
  assert.equal(soReconcileTone(legacy), 'warning');
  assert.equal(soReconcileTone(null), undefined);
});

test('ด่านปิดใบ: เกินที่ยังไม่ระบุ = ปิดไม่ได้ · ระบุแถมครบแล้วปิดได้', () => {
  const over = [confirmed('A'), confirmed('B'), confirmed('C')];
  assert.match(closeRequestError(req(), over), /เกินที่จ่าย 1 กลิ่น ยังไม่ระบุที่มา/);
  const covered = [confirmed('A'), confirmed('B'), confirmed('C', { freebieReason: 'แถม' })];
  assert.equal(closeRequestError(req(), covered), null);
});

test('ด่านปิดใหม่ไม่เปิดทางยกเลิกใบที่ตอบแล้ว — ทางออกอยู่บนแถว (แถม/แนบ SO)', () => {
  const over = [confirmed('A'), confirmed('B'), confirmed('C')];
  assert.match(cancelRequestError(req(), over), /ปิดเรื่องแทนการยกเลิก/);
});

test('ก้าวใหม่: เจ้าของก้าว · ป้าย · ชนิดในเธรด', () => {
  assert.equal(HOP_OWNER.reconfirm, 'requester');
  assert.equal(HOP_OWNER.freebie, 'requester');
  assert.equal(hopLabel('reconfirm'), 'เปลี่ยนเป็นคอนเฟิร์ม');
  assert.equal(hopLabel('freebie'), 'ระบุว่าเป็นของแถม');
  assert.equal(hopUpdateKind('reconfirm'), 'confirmed');
  assert.equal(hopUpdateKind('freebie'), 'freebie');
});

test('ด่านขั้น reconfirm: เฉพาะแถวพัฒนากลิ่นที่ลูกค้าไม่เอา', () => {
  const rejected = { lineKind: 'scent_dev', outcome: 'rejected', answerStatus: 'declined', declineReason: 'x' };
  assert.equal(hopStageError(rejected, 'reconfirm'), null);
  assert.match(hopStageError({ ...rejected, lineKind: 'product_dev' }, 'reconfirm'), /พัฒนากลิ่นเท่านั้น/);
  // ไม่ถูกเลือก (ฝ่ายปิด) ไม่ใช่ลูกค้าไม่เอา
  assert.match(hopStageError({ lineKind: 'scent_dev', answerStatus: 'declined', declineReason: 'x' }, 'reconfirm'), /ลูกค้าไม่เอา/);
  assert.ok(hopStageError({ lineKind: 'scent_dev', sentAt: '2026-11-01' }, 'reconfirm'));
});

test('ด่านขั้น freebie: แถวที่คอนเฟิร์มแล้ว ยังไม่แถม', () => {
  assert.equal(hopStageError(confirmed('A'), 'freebie'), null);
  assert.equal(hopStageError({ ...confirmed('A'), answerStatus: 'pending' }, 'freebie'), null);
  assert.match(hopStageError(confirmed('A', { freebieReason: 'x' }), 'freebie'), /ของแถมไปแล้ว/);
  assert.ok(hopStageError({ lineKind: 'scent_dev', sentAt: '2026-11-01' }, 'freebie'));
});

test('ค่าที่ส่งมา: เหตุผลบังคับ ≤ 500 · แถมมากับคอนเฟิร์มเท่านั้น', () => {
  assert.match(hopValuesError('reconfirm', {}), /เหตุผลที่เปลี่ยนเป็นคอนเฟิร์ม/);
  assert.match(hopValuesError('freebie', { note: ' ' }), /เหตุผลที่แถม/);
  assert.match(hopValuesError('freebie', { note: 'x'.repeat(501) }), /500/);
  assert.equal(hopValuesError('freebie', { note: 'แถมลูกค้าประจำ' }), null);
  assert.match(hopValuesError('outcome', { outcome: 'rejected', at: '2026-11-17', note: 'x', freebieReason: 'y' }), /เฉพาะตอนคอนเฟิร์ม/);
  assert.equal(hopValuesError('outcome', { outcome: 'confirmed', at: '2026-11-17', freebieReason: 'y' }), null);
});

test('patch: reconfirm เขียนผลคอนเฟิร์ม + ถอดตราไม่เอา · freebie เขียนสี่ช่อง', () => {
  const user = { id: 'U-SA', name: 'SA' };
  const re = hopPatch('reconfirm', { note: 'ลูกค้าซื้อเพิ่ม SO-26110385-0' }, user, '2026-11-17');
  assert.equal(re.outcome, 'confirmed');
  assert.equal(re.outcomeAt, '2026-11-17');
  assert.equal(re.outcomeNote, 'ลูกค้าซื้อเพิ่ม SO-26110385-0');
  assert.equal(re.confirmedQty, 1);
  assert.equal(re.answerStatus, 'pending');
  assert.equal(re.declineReason, null);
  assert.equal('freebieReason' in re, false);
  const reFree = hopPatch('reconfirm', { note: 'x', freebieReason: 'แถม' }, user, '2026-11-17');
  assert.equal(reFree.freebieReason, 'แถม');
  const fb = hopPatch('freebie', { note: ' แถมลูกค้าประจำ ' }, user, '2026-11-17');
  assert.deepEqual(Object.keys(fb).sort(), ['freebieAt', 'freebieById', 'freebieByName', 'freebieReason']);
  assert.equal(fb.freebieReason, 'แถมลูกค้าประจำ');
  const conf = hopPatch('outcome', { outcome: 'confirmed', at: '2026-11-17', freebieReason: 'แถม' }, user, '2026-11-17');
  assert.equal(conf.freebieReason, 'แถม');
  assert.equal(hopPatch('outcome', { outcome: 'confirmed', at: '2026-11-17' }, user).freebieReason, undefined);
});

test('🐞 ใบไม่มีบรรทัด SO = ไม่มีอะไรให้เทียบ ⇒ ด่านเกินไม่ทำงาน (ไม่ใช่ "เกินทุกแถว")', () => {
  const noSo = req({ salesOrderLines: [] });
  assert.equal(closeRequestError(noSo, [confirmed('A')]), null);
  assert.equal(overPaidAfterConfirm({ request: noSo, items: [sent('A')], rowId: 'A' }), null);
});
