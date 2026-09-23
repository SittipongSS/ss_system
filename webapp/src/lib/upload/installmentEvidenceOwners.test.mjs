import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installmentEvidenceOwners, isInstallmentEvidencePath } from '@/lib/upload/privateEvidence';

/* ── ด่านอ่านไฟล์หลักฐานของงวดที่ย้ายมากับใบ Rev. (PR1 · mig 0376) ─────────────────────────────
 *
 * ⭐ 0376 ย้ายแถวงวดไปใบ Rev. ทั้งแถว — สลิป/ใบกำกับยังชี้ไฟล์ใต้โฟลเดอร์ของ **ใบเดิม**
 *   (`sales-orders/<ใบเดิม>/payments/` · `.../tax-invoices/`) และเอกสารยืนยันคำสั่งซื้อใต้ QT ของใบเดิม
 *   ⇒ ด่านอ่านเดิม (ผูก id ของใบที่ถืองวดอยู่) จะตอบ "ไม่พบไฟล์แนบ" กับทุกไฟล์ของงวดที่ย้ายมา
 *   (โรคเดียวกับ #1391 ที่ด่านอ่านตกโฟลเดอร์ที่สาม — วัดบน prod ได้ 6 งวดเปิดไม่ได้)
 * ⭐ ทางแก้: ยอมรับเฉพาะใบ/QT ที่แถว **เคยอยู่จริง** ตาม `movedFrom` — ไม่ใช่เปิดกว้างทั้ง bucket
 */
const REV = { id: 'SOR-R1', quotationId: 'QT-1' };
const MOVED_ROW = {
  id: 'SOI-1',
  salesOrderId: 'SOR-R1',
  movedFrom: [{ salesOrderId: 'SOR-P1', orderNumber: 'SO-26090001-0', quotationId: 'QT-0', reason: 'revision' }],
};

test('เจ้าของไฟล์ = ใบที่ถืองวดอยู่ + ทุกใบ/QT ใน movedFrom (ไม่ซ้ำ ไม่มีค่าว่าง)', () => {
  assert.deepEqual(installmentEvidenceOwners(MOVED_ROW, REV), {
    salesOrderIds: ['SOR-R1', 'SOR-P1'],
    quotationIds: ['QT-1', 'QT-0'],
  });
  // Rev. ซ้อน Rev. — ต่อท้ายทุกทอด · QT เดียวกันไม่ซ้ำ
  const twice = {
    ...MOVED_ROW,
    movedFrom: [...MOVED_ROW.movedFrom, { salesOrderId: 'SOR-R0', quotationId: 'QT-1', reason: 'revision' }],
  };
  assert.deepEqual(installmentEvidenceOwners(twice, REV), {
    salesOrderIds: ['SOR-R1', 'SOR-P1', 'SOR-R0'],
    quotationIds: ['QT-1', 'QT-0'],
  });
  // แถวที่ไม่เคยย้าย / ยังไม่มีคอลัมน์ = ใบของตัวเองเท่านั้น (พฤติกรรมเดิม)
  assert.deepEqual(installmentEvidenceOwners({ id: 'SOI-2' }, REV), { salesOrderIds: ['SOR-R1'], quotationIds: ['QT-1'] });
});

test('path ใต้โฟลเดอร์ของใบเดิม (payments และ tax-invoices) อ่านได้', () => {
  assert.equal(isInstallmentEvidencePath('sales-orders/SOR-P1/payments/1_slip.pdf', MOVED_ROW, REV), true);
  assert.equal(isInstallmentEvidencePath('sales-orders/SOR-P1/tax-invoices/1_iv.pdf', MOVED_ROW, REV), true);
  assert.equal(isInstallmentEvidencePath('sales-orders/SOR-R1/payments/2_slip.pdf', MOVED_ROW, REV), true,
    'ไฟล์ที่แนบหลังย้ายมาอยู่ใต้โฟลเดอร์ของใบ Rev. เอง');
});

test('path ใต้ QT ของใบเดิม (เอกสารยืนยันคำสั่งซื้อ/หลักฐาน Won ที่งวดแรกยืมมา) อ่านได้', () => {
  assert.equal(isInstallmentEvidencePath('quotations/QT-0/order-confirmation/po.pdf', MOVED_ROW, REV), true);
  assert.equal(isInstallmentEvidencePath('quotations/QT-0/won/slip.jpg', MOVED_ROW, REV), true);
  assert.equal(isInstallmentEvidencePath('quotations/QT-1/order-confirmation/po.pdf', MOVED_ROW, REV), true);
});

test('🔴 ใบ/QT อื่นที่แถวไม่เคยอยู่ = ไม่ผ่าน (route ตอบ 404)', () => {
  for (const path of [
    'sales-orders/SOR-OTHER/payments/x.pdf',
    'sales-orders/SOR-OTHER/tax-invoices/x.pdf',
    'quotations/QT-OTHER/order-confirmation/x.pdf',
    'sales-orders/SOR-P1/other/x.pdf',
    'sales-orders/SOR-P1x/payments/x.pdf',
    '',
  ]) {
    assert.equal(isInstallmentEvidencePath(path, MOVED_ROW, REV), false, path);
  }
});

/* 🔴 id ว่างทำให้ตัวตรวจ path ถอยเป็นตัวจับทุกใบ (`[a-zA-Z0-9_-]+`) — ใบย้อนหลังไม่มี QT และรายการ movedFrom
   ที่เพี้ยน (ไม่มี id · id ไม่ใช่สตริง) ต้องไม่เปิดประตูนั้น */
test('🔴 id ว่าง/เพี้ยนไม่กลายเป็นตัวจับทุกใบ', () => {
  const historical = { id: 'SOR-H1', quotationId: null };
  assert.deepEqual(installmentEvidenceOwners({ id: 'SOI-H' }, historical), { salesOrderIds: ['SOR-H1'], quotationIds: [] });
  assert.equal(isInstallmentEvidencePath('quotations/QT-ANY/order-confirmation/x.pdf', { id: 'SOI-H' }, historical), false);
  const junk = { movedFrom: [{}, null, 'x', { salesOrderId: '', quotationId: '  ' }, { salesOrderId: 42 }] };
  assert.deepEqual(installmentEvidenceOwners(junk, REV), { salesOrderIds: ['SOR-R1'], quotationIds: ['QT-1'] });
  assert.equal(isInstallmentEvidencePath('sales-orders/ANY/payments/x.pdf', junk, REV), false);
  assert.equal(isInstallmentEvidencePath('sales-orders/SOR-R1/payments/x.pdf', { movedFrom: 'ไม่ใช่อาเรย์' }, REV), true);
  assert.deepEqual(installmentEvidenceOwners(null, null), { salesOrderIds: [], quotationIds: [] });
  assert.equal(isInstallmentEvidencePath('sales-orders/SOR-R1/payments/x.pdf', null, null), false);
});
