// เหตุการณ์ของใบเสนอราคา / ใบสั่งขาย บนเธรดของ "ดีลแม่"
//
// ⭐ ตั้งแต่ใบไม่มีเธรดของตัวเองแล้ว (มติผู้ใช้ 2026-08-04) **ที่นี่คือที่เดียวที่
// เหตุผลของ QT/SO ถูกเก็บให้คนอ่าน** — คอลัมน์บนใบถูกเขียนทับทุกรอบ และ audit log
// เปิดได้เฉพาะ supervisor ⇒ ตกหล่นที่นี่ = หายถาวร เทสต์ชุดนี้จึงล็อกไว้ว่า:
//   1) **ทุก action ต้องมีเงาบนดีล ไม่มีตัวไหนเงียบ** (กฎใหม่ที่สำคัญที่สุด —
//      เดิม withdraw/restore ไม่ส่งขึ้นดีลได้เพราะยังอ่านได้ในเธรดของใบ)
//   2) ทุก kind ที่คืนต้องมีอยู่จริงในทะเบียน UPDATE_KINDS ของ 'deal'
//      (ตาราง entity_updates ไม่มี CHECK บน kind → พิมพ์ผิดจะเงียบสนิทจนขึ้นจอ
//       เป็นป้าย fallback แล้วไม่มีใครรู้ว่าเพราะอะไร)
//   3) ทุก action ที่บังคับกรอกเหตุผลต้องมีเหตุผลอยู่ในเนื้อข้อความ
//   4) คำศัพท์ล็อกตามมติผู้ใช้: ตีกลับ/ดึงกลับ/ออก Rev. — ห้ามมีคำว่า "ถอน/ถอด"
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dealDocumentUpdate } from './documentUpdates.js';
import { isKnownUpdateKind } from '@/lib/master/updateTypes';

const QUOTE = { id: 'QT-1', quoteNumber: 'QT-2569-001', revisionNo: 0 };
const ORDER = { id: 'SO-1', orderNumber: 'SO-2569-001', revisionNo: 0 };

// ชุด action ที่แต่ละใบยิงได้จริง (ตรงกับ route ที่เรียก appendDocumentEvent)
const QUOTE_ACTIONS = ['submit', 'approve', 'reject', 'withdraw', 'revise', 'accept', 'unaccept'];
const ORDER_ACTIONS = ['submit', 'approve', 'reject', 'withdraw', 'revoke', 'revise', 'cancel', 'restore'];

const onQuote = (action, opts = {}) => dealDocumentUpdate('quotation', action, QUOTE, opts);
const onOrder = (action, opts = {}) => dealDocumentUpdate('sales_order', action, ORDER, opts);

test('⭐ ทุก action ของใบต้องมีเงาบนดีล — ใบไม่มีเธรดแล้ว ตัวที่เงียบ = หายถาวร', () => {
  for (const action of QUOTE_ACTIONS) {
    assert.ok(onQuote(action, { reason: 'x' }), `quotation/${action}: ไม่มีเงาบนดีล`);
  }
  for (const action of ORDER_ACTIONS) {
    assert.ok(onOrder(action, { reason: 'x' }), `sales_order/${action}: ไม่มีเงาบนดีล`);
  }
});

test('ทุก kind ที่สร้างต้องมีในทะเบียนของดีล (ตารางไม่มี CHECK ให้พึ่ง)', () => {
  for (const action of QUOTE_ACTIONS) {
    const event = onQuote(action, { reason: 'x', note: 'x' });
    assert.ok(isKnownUpdateKind('deal', event.kind), `quotation/${action}: kind "${event.kind}" ไม่มีในทะเบียน`);
  }
  for (const action of ORDER_ACTIONS) {
    const event = onOrder(action, { reason: 'x', overrideReason: 'x' });
    assert.ok(isKnownUpdateKind('deal', event.kind), `sales_order/${action}: kind "${event.kind}" ไม่มีในทะเบียน`);
  }
});

test('⭐ action ที่บังคับกรอกเหตุผล ต้องมีเหตุผลอยู่ในข้อความที่คนอ่านเห็น', () => {
  const REASON = 'ราคาต่อหน่วยไม่ตรงกับที่ตกลงกับลูกค้า';
  for (const action of ['reject', 'withdraw', 'revise', 'unaccept']) {
    assert.ok(onQuote(action, { reason: REASON }).body.includes(REASON), `quotation/${action}: เหตุผลหาย`);
  }
  for (const action of ['reject', 'withdraw', 'revoke', 'revise', 'cancel']) {
    assert.ok(onOrder(action, { reason: REASON }).body.includes(REASON), `sales_order/${action}: เหตุผลหาย`);
  }
});

test('ไม่ได้กรอกเหตุผล = เขียนว่า "ไม่ระบุเหตุผล" ไม่ใช่ทิ้งท้ายค้าง', () => {
  assert.match(onQuote('reject').body, /ไม่ระบุเหตุผล$/);
  assert.match(onQuote('withdraw').body, /ไม่ระบุเหตุผล$/);
  assert.match(onOrder('cancel', { reason: '   ' }).body, /ไม่ระบุเหตุผล$/);
});

test('คำศัพท์ล็อก: ตีกลับ / ดึงกลับ / ออก Rev. — ห้าม "ถอน" หรือ "ถอด"', () => {
  assert.match(onQuote('reject').body, /ถูกตีกลับให้แก้ไข/);
  assert.match(onQuote('withdraw').body, /ถูกดึงกลับมาแก้ไข/);
  assert.match(onOrder('revise').body, /ออก Rev\. ใหม่/);
  const all = [
    ...QUOTE_ACTIONS.map((a) => onQuote(a, { reason: 'y' })),
    ...ORDER_ACTIONS.map((a) => onOrder(a, { reason: 'y' })),
  ];
  for (const event of all) {
    assert.doesNotMatch(event.body, /ถอน|ถอด/, `พบคำต้องห้ามใน: ${event.body}`);
  }
});

test('เลขที่ใบอยู่ในเนื้อความเสมอ — RichText แปลงเป็นลิงก์ /go/<รหัส> ให้เอง', () => {
  for (const action of QUOTE_ACTIONS) {
    assert.ok(onQuote(action, { reason: 'x' }).body.includes('QT-2569-001'), `quotation/${action}`);
  }
  for (const action of ORDER_ACTIONS) {
    assert.ok(onOrder(action, { reason: 'x' }).body.includes('SO-2569-001'), `sales_order/${action}`);
  }
});

test('ออก Rev. บอกเลขฉบับปลายทาง — ใบเดิมต้องไม่จบห้วนโดยไม่บอกว่าไปต่อที่ไหน', () => {
  assert.match(onQuote('revise', { toRevisionNo: 2 }).body, /\(Rev\.2\)/);
  assert.match(onOrder('revise', { toRevisionNo: 3 }).body, /\(Rev\.3\)/);
  // ไม่รู้เลขปลายทาง (RPC ไม่คืนมา) ก็ยังต้องลงเธรด ไม่ใช่เงียบไปเลย
  assert.match(onOrder('revise').body, /ออก Rev\. ใหม่/);
});

test('อนุมัติ: หมายเหตุผู้อนุมัติ + admin override ต้องไม่ตกหล่น', () => {
  const plain = onOrder('approve');
  assert.equal(plain.meta.override, false);
  assert.doesNotMatch(plain.body, /แอดมิน/);

  // หมายเหตุไม่บังคับกรอก — เดิมเก็บอยู่ในเธรดของใบเท่านั้น ต้องตามขึ้นมาด้วย
  assert.match(onQuote('approve', { note: 'ลูกค้ายืนยันทางโทรศัพท์แล้ว' }).body, /ลูกค้ายืนยันทางโทรศัพท์แล้ว/);

  const override = onOrder('approve', { overrideReason: 'หัวหน้าลาป่วย ใบต้องออกวันนี้' });
  assert.equal(override.meta.override, true);
  assert.match(override.body, /แอดมินอนุมัติแทน/);
  assert.match(override.body, /หัวหน้าลาป่วย/);
});

test('ของไม่ครบต้องคืน null ไม่ใช่โยน — ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว', () => {
  assert.equal(dealDocumentUpdate('quotation', 'reject', null, { reason: 'x' }), null);
  assert.equal(onQuote('ไม่มี action นี้'), null);
  assert.equal(dealDocumentUpdate('ไม่ใช่เอกสารที่รู้จัก', 'submit', QUOTE), null);
});

test('meta พกที่มาไว้ครบ — ย้อนได้ว่าแถวนี้มาจากใบไหน ทำอะไร', () => {
  assert.deepEqual(onQuote('submit').meta, {
    docType: 'quotation', docId: 'QT-1', docNumber: 'QT-2569-001', action: 'submit',
  });
  assert.equal(onOrder('cancel', { reason: 'x' }).meta.docNumber, 'SO-2569-001');
});
