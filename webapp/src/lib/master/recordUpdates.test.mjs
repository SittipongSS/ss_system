// เหตุการณ์ระบบในเธรดของ master data + สายภาษี + PO สหมิตร
//
// สิ่งที่ล็อกไว้:
//   1) ทุก kind ที่ builder คืนต้องมีอยู่จริงในทะเบียนของ entity นั้น
//      (entity_updates ไม่มี CHECK บน kind → พิมพ์ผิดเงียบจนขึ้นจอเป็นป้าย fallback)
//   2) **ทุก action ที่บังคับกรอกเหตุผลต้องมีเหตุผลอยู่ในเนื้อข้อความ** — เหตุผลที่ทำ
//      PR นี้ทั้งอัน คือ `rejectionReason` ถูกล้างเป็น null ทุกครั้งที่อนุมัติ/แก้/ยื่นใหม่
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  masterApprovalUpdate, masterReapprovalUpdate, orderStatusUpdate,
  registrationRevokeUpdate, registrationStatusUpdate, sahamitPoSettleUpdate,
} from './recordUpdates.js';
import { isKnownUpdateKind } from '@/lib/master/updateTypes';

const REASON = 'เลขประจำตัวผู้เสียภาษีไม่ตรงกับ ภ.พ.20';

test('ทุก kind ที่สร้างต้องมีในทะเบียนของ entity นั้น (ตารางไม่มี CHECK ให้พึ่ง)', () => {
  for (const status of ['approved', 'rejected', 'pending']) {
    for (const entity of ['customer', 'product']) {
      const e = masterApprovalUpdate(status, { reason: REASON });
      assert.ok(isKnownUpdateKind(entity, e.kind), `${entity}/${status}: ${e.kind}`);
    }
  }
  assert.ok(isKnownUpdateKind('customer', masterReapprovalUpdate(['name']).kind));

  for (const status of ['pending_legal', 'approved', 'rejected']) {
    const e = registrationStatusUpdate(status, { reason: REASON });
    assert.ok(isKnownUpdateKind('excise_registration', e.kind), `registration/${status}: ${e.kind}`);
  }
  assert.ok(isKnownUpdateKind('excise_registration', registrationRevokeUpdate({}).kind));

  for (const status of ['pending', 'received', 'filing', 'complete', 'delivered', 'rejected']) {
    const e = orderStatusUpdate(status, { reason: REASON });
    assert.ok(isKnownUpdateKind('excise_order', e.kind), `order/${status}: ${e.kind}`);
  }
  assert.ok(isKnownUpdateKind('sahamit_po', sahamitPoSettleUpdate({}).kind));
});

test('⭐ ทุกจุดที่บังคับกรอกเหตุผล ต้องมีเหตุผลอยู่ในข้อความที่คนอ่านเห็น', () => {
  assert.ok(masterApprovalUpdate('rejected', { reason: REASON }).body.includes(REASON));
  assert.ok(registrationStatusUpdate('rejected', { reason: REASON }).body.includes(REASON));
  assert.ok(registrationRevokeUpdate({ reason: REASON }).body.includes(REASON));
  assert.ok(orderStatusUpdate('rejected', { reason: REASON }).body.includes(REASON));
});

test('ไม่ได้กรอกเหตุผล = เขียนว่า "ไม่ระบุเหตุผล" ไม่ใช่ทิ้งท้ายค้าง', () => {
  assert.match(masterApprovalUpdate('rejected', {}).body, /ไม่ระบุเหตุผล$/);
  assert.match(orderStatusUpdate('rejected', { reason: '  ' }).body, /ไม่ระบุเหตุผล$/);
});

test('อนุมัติแล้วไม่ต้องพกเหตุผลเก่ามาด้วย (เหตุผลเป็นของรอบที่ถูกตีกลับ)', () => {
  const e = masterApprovalUpdate('approved', { reason: REASON });
  assert.equal(e.body, 'อนุมัติแล้ว');
  assert.doesNotMatch(e.body, /ภ\.พ\.20/);
});

test('แก้ของที่อนุมัติแล้ว = เล่าว่าแก้อะไรจนต้องอนุมัติใหม่', () => {
  const e = masterReapprovalUpdate(['name', 'taxId', 'address']);
  assert.match(e.body, /ต้องอนุมัติใหม่/);
  assert.match(e.body, /name, taxId, address/);
  assert.deepEqual(e.meta.changedFields, ['name', 'taxId', 'address']);
  // ฟิลด์เยอะเกินไปต้องตัด ไม่ใช่ยัดทั้งแถวจนอ่านไม่ออก
  const many = masterReapprovalUpdate(Array.from({ length: 12 }, (_, i) => `f${i}`));
  assert.match(many.body, /\+4\)/);
  assert.equal(many.meta.changedFields.length, 12);   // meta เก็บครบ ตัดแค่ที่แสดง
  // ไม่มีอะไรเปลี่ยน = ไม่ต้องมีแถว (กันเธรดรกด้วยข้อความว่างเปล่า)
  assert.equal(masterReapprovalUpdate([]), null);
  assert.equal(masterReapprovalUpdate(), null);
});

test('ใบยื่น: ป้ายสถานะต้องพูดคำเดียวกับ STATUS บนหน้าจอ ไม่ใช่ชื่อ enum ดิบ', () => {
  assert.match(orderStatusUpdate('received').body, /"รอยื่น"/);
  assert.match(orderStatusUpdate('complete').body, /"ชำระแล้ว"/);
  assert.equal(orderStatusUpdate('received', { fromStatus: 'pending' }).meta.fromStatus, 'pending');
  // สถานะที่ไม่รู้จัก = ไม่สร้างแถว ดีกว่าขึ้น id ดิบบนจอ
  assert.equal(orderStatusUpdate('สถานะไม่มีจริง'), null);
  assert.equal(orderStatusUpdate('draft').body.includes('ฉบับร่าง'), true);
});

test('PO สหมิตร: แถว settle บอกดีลปลายทาง + จำนวนบรรทัด', () => {
  const e = sahamitPoSettleUpdate({ dealCode: 'DL-2569-001', lineCount: 5 });
  assert.match(e.body, /DL-2569-001/);
  assert.match(e.body, /5 บรรทัด/);
  // ไม่รู้เลขดีล/จำนวน ก็ยังต้องลงเธรด ไม่ใช่เงียบไปเลย
  assert.equal(sahamitPoSettleUpdate({}).body, 'แปลงเป็นดีลแล้ว');
});

test('สถานะที่ไม่ใช่ action จริง ต้องคืน null ไม่ใช่สร้างแถวเปล่า', () => {
  assert.equal(masterApprovalUpdate('ไม่มีสถานะนี้'), null);
  assert.equal(masterApprovalUpdate(undefined), null);
  assert.equal(registrationStatusUpdate('draft'), null);   // กลับเป็นร่างมาทางปลดอนุมัติแทน
});
