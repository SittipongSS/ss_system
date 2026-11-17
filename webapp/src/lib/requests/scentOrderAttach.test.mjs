// แนบ / ถอด SO ที่ลูกค้าซื้อเพิ่ม (ม-164 · PR-2) — logic ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachAdds, attachOrderError, attachPreview, attachPreviewText, attachRequestError, canActOnScentOrders,
  detachOrderError, scentOrderLinesText, slotsAfterDetach,
} from './scentOrderAttach.js';

const fg = (category, qty) => ({ fgCode: `FG-100-${category}`, qty: String(qty) });
const request = { id: 'R1', kind: 'scent_dev', status: 'acknowledged', salesOrderId: 'SO-MAIN', requestedById: 'U-SA', team: 'T1' };
const order = { id: 'SO-ADD', status: 'approved' };
const ok = { request, order, lines: [fg('03-002', 1)], owner: null, sameTaxEntity: true, allowed: true };

test('สิทธิ์: ผู้ขอ · ทีม · หัวหน้าฝ่ายขาย · แอดมิน · เจ้าของดีลของ SO — RD ไม่ได้', () => {
  assert.equal(canActOnScentOrders({ id: 'U-SA', role: 'senior_ae' }, request), true);
  assert.equal(canActOnScentOrders({ id: 'U-T', role: 'senior_ae', teams: ['T1'] }, request), true);
  assert.equal(canActOnScentOrders({ id: 'U-AD', role: 'admin' }, request), true);
  assert.equal(canActOnScentOrders({ id: 'U-SUP', role: 'ac_supervisor' }, request), true);
  assert.equal(canActOnScentOrders({ id: 'U-OWN', role: 'senior_ae' }, request, { dealOwnerId: 'U-OWN' }), true);
  assert.equal(canActOnScentOrders({ id: 'U-RD', role: 'rd', department: 'RD' }, request), false);
  assert.equal(canActOnScentOrders(null, request), false);
  assert.equal(canActOnScentOrders({ id: 'U-X', role: 'senior_ae' }, request, { dealOwnerId: 'U-OWN' }), false);
});

test('ใบที่รับ SO แนบ: เฉพาะพัฒนากลิ่นที่ยังไม่ปิด · ใบปิดบอกทางไปเปิดใบใหม่ต่อจาก', () => {
  assert.equal(attachRequestError(request), null);
  assert.match(attachRequestError({ ...request, status: 'closed' }), /เปิดคำร้องใหม่ "ต่อจากคำร้อง"/);
  assert.match(attachRequestError({ ...request, status: 'cancelled' }), /ยกเลิกแล้ว/);
  assert.match(attachRequestError({ ...request, kind: 'billing_doc' }), /เฉพาะคำร้องพัฒนากลิ่น/);
  assert.match(attachRequestError(null), /ไม่พบคำร้อง/);
  // ใบตอบแล้ว (รอผู้ขอปิด) ยังแนบได้ — ลูกค้าซื้อเพิ่มตอนนี้เกิดได้จริง
  assert.equal(attachRequestError({ ...request, status: 'answered' }), null);
});

test('ด่านแนบ: ผ่านเมื่อครบทุกข้อ · สิทธิ์มาก่อนทุกอย่าง', () => {
  assert.equal(attachOrderError(ok), null);
  assert.match(attachOrderError({ ...ok, allowed: false, request: { ...request, status: 'closed' } }), /เฉพาะฝ่ายขาย/);
});

test('ด่านแนบ: ใบหลักตัวเอง · ยังไม่อนุมัติ · ไม่มีบรรทัดพัฒนากลิ่น · จำนวนอ่านไม่ได้ · ลูกค้าอื่น', () => {
  assert.match(attachOrderError({ ...ok, order: { id: 'SO-MAIN', status: 'approved' } }), /ใบหลักของคำร้องนี้/);
  assert.match(attachOrderError({ ...ok, order: { ...order, status: 'pending_approval' } }), /อนุมัติแล้ว/);
  assert.match(attachOrderError({ ...ok, lines: [fg('01-001', 500)] }), /ไม่มีบรรทัดออกแบบหรือแก้กลิ่น/);
  assert.match(attachOrderError({ ...ok, lines: [fg('03-002', 1.5)] }), /จำนวนเต็มบวก/);
  assert.match(attachOrderError({ ...ok, sameTaxEntity: false }), /ลูกค้ารายอื่น/);
  assert.match(attachOrderError({ ...ok, order: { ...order, origin: 'historical' } }), /ย้อนหลังหรือใบค่าสรรพสามิต/);
  assert.equal(attachOrderError({ ...ok, order: { ...order, origin: 'pipeline' } }), null);
});

test('ด่านแนบ: SO มีเจ้าของแล้ว — แนบซ้ำใบเดิม · เป็นของคำร้องอื่น · เป็น Rev. ของใบที่มีคำร้อง', () => {
  assert.match(attachOrderError({ ...ok, owner: { requestId: 'R1', role: 'attached' } }), /แนบอยู่กับคำร้องนี้แล้ว/);
  assert.equal(
    attachOrderError({ ...ok, owner: { requestId: 'R9', docNo: 'RQ-9', role: 'attached' } }),
    'ใบสั่งขายนี้แนบอยู่กับคำร้อง RQ-9 แล้ว',
  );
  assert.match(attachOrderError({ ...ok, owner: { requestId: 'R9', docNo: 'RQ-9', role: 'main' } }), /เปิดคำร้องไปแล้ว \(RQ-9\)/);
});

test('ตัวเลขก่อน/หลังแนบ — ทิพย์นที: 03-002 เพิ่มกลิ่น · 03-010 เพิ่มรอบแก้ ไม่เพิ่มกลิ่น', () => {
  const slots = { slots: 2, paidRevisions: 0 };
  const add = attachPreview(slots, [fg('03-002', 1)]);
  assert.deepEqual(add.after, { slots: 3, revisions: 0 });
  assert.equal(attachPreviewText(add), 'จำนวนกลิ่น 2 เป็น 3');
  const rev = attachPreview({ slots: 3, paidRevisions: 0 }, [fg('03-010', 1)]);
  assert.deepEqual(rev.after, { slots: 3, revisions: 1 });
  assert.equal(attachPreviewText(rev), 'รอบแก้ที่ซื้อ 0 เป็น 1');
  assert.deepEqual(attachAdds([fg('03-002', 2), fg('03-010', 1), fg('01-001', 9)]), { slots: 2, revisions: 1 });
  assert.equal(attachPreviewText(null), '');
});

test('สิ่งที่ SO ขาย — รวมรายหมวดเฉพาะงานพัฒนากลิ่น', () => {
  assert.equal(scentOrderLinesText([fg('03-002', 1), fg('03-002', 2), fg('03-010', 1), fg('01-001', 500)]), '03-002 ×3 · 03-010 ×1');
  assert.equal(scentOrderLinesText([]), '');
});

test('ด่านถอด: ถอดแล้วคอนเฟิร์มเกินโดยไม่มีแถม = บล็อก · มีแถมรองรับ = ผ่าน', () => {
  const link = { salesOrderId: 'SO-ADD' };
  const three = Array.from({ length: 3 }, () => ({ outcome: 'confirmed' }));
  assert.match(
    detachOrderError({ request, link, items: three, slotsAfter: 2, allowed: true }),
    /เกินที่จ่าย 1 กลิ่น \(คอนเฟิร์ม 3 จาก 2\)/,
  );
  const withFreebie = [...three.slice(0, 2), { outcome: 'confirmed', freebieReason: 'แถมลูกค้าประจำ' }];
  assert.equal(detachOrderError({ request, link, items: withFreebie, slotsAfter: 2, allowed: true }), null);
  assert.equal(detachOrderError({ request, link, items: three.slice(0, 2), slotsAfter: 2, allowed: true }), null);
});

test('ด่านถอด: สิทธิ์ · ไม่ได้แนบ · ใบปิด/ยกเลิก', () => {
  const link = { salesOrderId: 'SO-ADD' };
  assert.match(detachOrderError({ request, link, allowed: false }), /เฉพาะฝ่ายขาย/);
  assert.match(detachOrderError({ request, link: null, allowed: true }), /ไม่ได้แนบอยู่/);
  assert.match(detachOrderError({ request: { ...request, status: 'closed' }, link, allowed: true }), /ปิดหรือยกเลิกแล้ว/);
});

test('จำนวนกลิ่นหลังถอด — ตัดเฉพาะใบที่ถอด', () => {
  const req = {
    salesOrderLines: [fg('03-002', 2)],
    attachedOrders: [
      { salesOrderId: 'SO-ADD', lines: [fg('03-002', 1)] },
      { salesOrderId: 'SO-REV', lines: [fg('03-010', 1)] },
    ],
  };
  assert.equal(slotsAfterDetach(req, 'SO-ADD'), 2);
  assert.equal(slotsAfterDetach(req, 'SO-REV'), 3);
});
