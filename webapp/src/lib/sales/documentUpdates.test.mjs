// เหตุการณ์ระบบในเธรดของใบเสนอราคา / ใบสั่งขาย
//
// สิ่งที่เทสต์ชุดนี้ล็อกไว้:
//   1) ทุก kind ที่ builder คืนต้องมีอยู่จริงในทะเบียน UPDATE_KINDS ของ entity นั้น
//      (ตาราง entity_updates ไม่มี CHECK บน kind → พิมพ์ผิดจะเงียบสนิทจนขึ้นจอ
//       เป็นป้าย fallback แล้วไม่มีใครรู้ว่าเพราะอะไร)
//   2) **ทุก action ที่บังคับกรอกเหตุผลต้องมีเหตุผลอยู่ในเนื้อข้อความ** — นี่คือ
//      เหตุผลทั้งหมดที่ PR นี้มีอยู่ ถ้าหลุดข้อนี้เท่ากับไม่ได้ทำอะไรเลย
//   3) คำศัพท์ล็อกตามมติผู้ใช้: ตีกลับ/ดึงกลับ/ออก Rev. — ห้ามมีคำว่า "ถอน/ถอด"
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { quotationActionUpdate, salesOrderActionUpdate } from './documentUpdates.js';
import { isKnownUpdateKind } from '@/lib/master/updateTypes';

const QUOTE = { id: 'QT-1', quoteNumber: 'QT-2569-001', revisionNo: 0 };
const ORDER = { id: 'SO-1', orderNumber: 'SO-2569-001', revisionNo: 0 };

const QUOTE_ACTIONS = ['submit', 'approve', 'reject', 'withdraw', 'revise', 'accept', 'unaccept'];
const ORDER_ACTIONS = ['submit', 'approve', 'reject', 'withdraw', 'revoke', 'revise', 'cancel', 'restore'];

test('ทุก kind ที่สร้างต้องมีในทะเบียนของ entity นั้น (ตารางไม่มี CHECK ให้พึ่ง)', () => {
  for (const action of QUOTE_ACTIONS) {
    const event = quotationActionUpdate(action, QUOTE, { reason: 'x', note: 'x' });
    assert.ok(event, `quotation/${action}: ต้องคืนเหตุการณ์`);
    assert.ok(isKnownUpdateKind('quotation', event.kind), `quotation/${action}: kind "${event.kind}" ไม่มีในทะเบียน`);
  }
  for (const action of ORDER_ACTIONS) {
    const event = salesOrderActionUpdate(action, ORDER, { reason: 'x', overrideReason: 'x' });
    assert.ok(event, `sales_order/${action}: ต้องคืนเหตุการณ์`);
    assert.ok(isKnownUpdateKind('sales_order', event.kind), `sales_order/${action}: kind "${event.kind}" ไม่มีในทะเบียน`);
  }
});

test('⭐ action ที่บังคับกรอกเหตุผล ต้องมีเหตุผลอยู่ในข้อความที่คนอ่านเห็น', () => {
  const REASON = 'ราคาต่อหน่วยไม่ตรงกับที่ตกลงกับลูกค้า';
  for (const action of ['reject', 'withdraw', 'revise', 'unaccept']) {
    const event = quotationActionUpdate(action, QUOTE, { reason: REASON });
    assert.ok(event.body.includes(REASON), `quotation/${action}: เหตุผลหายจากเนื้อข้อความ`);
  }
  for (const action of ['reject', 'withdraw', 'revoke', 'revise', 'cancel']) {
    const event = salesOrderActionUpdate(action, ORDER, { reason: REASON });
    assert.ok(event.body.includes(REASON), `sales_order/${action}: เหตุผลหายจากเนื้อข้อความ`);
  }
});

test('ไม่ได้กรอกเหตุผล = เขียนว่า "ไม่ระบุเหตุผล" ไม่ใช่ทิ้งท้ายค้าง', () => {
  assert.match(quotationActionUpdate('reject', QUOTE, {}).body, /ไม่ระบุเหตุผล$/);
  assert.match(salesOrderActionUpdate('cancel', ORDER, { reason: '   ' }).body, /ไม่ระบุเหตุผล$/);
});

test('คำศัพท์ล็อก: ตีกลับ / ดึงกลับ / ออก Rev. — ห้าม "ถอน" หรือ "ถอด"', () => {
  assert.match(quotationActionUpdate('reject', QUOTE, {}).body, /^ตีกลับให้แก้ไข/);
  assert.match(quotationActionUpdate('withdraw', QUOTE, {}).body, /^ดึงกลับมาแก้ไข/);
  assert.match(salesOrderActionUpdate('revise', ORDER, {}).body, /^ออก Rev\. ใหม่/);
  const all = [
    ...QUOTE_ACTIONS.map((a) => quotationActionUpdate(a, QUOTE, { reason: 'y' })),
    ...ORDER_ACTIONS.map((a) => salesOrderActionUpdate(a, ORDER, { reason: 'y' })),
  ];
  for (const event of all) {
    assert.doesNotMatch(event.body, /ถอน|ถอด/, `พบคำต้องห้ามใน: ${event.body}`);
  }
});

test('ออก Rev. บอกเลขฉบับปลายทาง — ใบเดิมต้องไม่จบห้วนโดยไม่บอกว่าไปต่อที่ไหน', () => {
  assert.match(quotationActionUpdate('revise', QUOTE, { toRevisionNo: 2 }).body, /\(Rev\.2\)/);
  assert.match(salesOrderActionUpdate('revise', ORDER, { toRevisionNo: 3 }).body, /\(Rev\.3\)/);
  // ไม่รู้เลขปลายทาง (RPC ไม่คืนมา) ก็ยังต้องลงเธรด ไม่ใช่เงียบไปเลย
  assert.ok(salesOrderActionUpdate('revise', ORDER, {}).body.startsWith('ออก Rev. ใหม่'));
});

test('admin อนุมัติแทนต้องเห็นชัดในเธรด ไม่ใช่ซ่อนใน audit log', () => {
  const plain = salesOrderActionUpdate('approve', ORDER, {});
  assert.equal(plain.meta.override, false);
  assert.doesNotMatch(plain.body, /แอดมิน/);

  const override = salesOrderActionUpdate('approve', ORDER, { overrideReason: 'หัวหน้าลาป่วย ใบต้องออกวันนี้' });
  assert.equal(override.meta.override, true);
  assert.match(override.body, /แอดมินอนุมัติแทน/);
  assert.match(override.body, /หัวหน้าลาป่วย/);
});

test('ของไม่ครบต้องคืน null ไม่ใช่โยน — ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว', () => {
  assert.equal(quotationActionUpdate('reject', null, { reason: 'x' }), null);
  assert.equal(salesOrderActionUpdate('cancel', null, {}), null);
  assert.equal(quotationActionUpdate('ไม่มี action นี้', QUOTE, {}), null);
  assert.equal(salesOrderActionUpdate('ไม่มี action นี้', ORDER, {}), null);
});

test('meta พกเลขที่ใบ + Rev. ไว้ — เธรดต้องอ่านออกแม้ใบถูกออก Rev. แทนไปแล้ว', () => {
  assert.deepEqual(quotationActionUpdate('submit', QUOTE).meta, { quoteNumber: 'QT-2569-001', revisionNo: 0 });
  assert.equal(salesOrderActionUpdate('submit', ORDER).meta.orderNumber, 'SO-2569-001');
});
