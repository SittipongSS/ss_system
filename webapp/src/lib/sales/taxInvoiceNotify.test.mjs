import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TAX_INVOICE_CLEARED_KIND, TAX_INVOICE_KIND, taxInvoiceDedupeKey, taxInvoiceNotice,
} from '@/lib/sales/taxInvoiceNotify';

/* ── กระดิ่งแจ้งฝ่ายขายตอนบัญชีออก/ถอนใบกำกับ (มติผู้ใช้ 2026-09-09) ────────
   ตัวเลือกผู้รับเป็นฟังก์ชันบริสุทธิ์เพราะจุดที่พลาดง่ายที่สุดคือ **การกันแจ้งตัวเอง**
   ซึ่ง `notifyUsers` ไม่ทำให้ (ไม่มีพารามิเตอร์ actorId เลย) */

const ORDER = {
  id: 'SOR-1',
  orderNumber: 'SO-26090001-0',
  customerName: 'บริษัท ทดสอบ จำกัด',
  ownerId: 'U-AE',
  deal: { id: 'D-1', ownerId: 'U-AE' },
};
const INST = {
  id: 'SOI-1', seq: 1, label: 'มัดจำ',
  taxInvoiceNo: 'IV-6809001', taxInvoiceDate: '2026-09-01',
};

test('ส่งถึงเจ้าของใบ + เจ้าของดีล และไม่ซ้ำเมื่อเป็นคนเดียวกัน', () => {
  const notice = taxInvoiceNotice({ order: ORDER, installment: INST, actorId: 'U-FN' });
  assert.deepEqual(notice.userIds, ['U-AE']);
  assert.equal(notice.kind, TAX_INVOICE_KIND);
  assert.equal(notice.entityType, 'sales_order');
  assert.equal(notice.entityId, 'SOR-1');
});

/* ⚠️ ดีลถูกย้ายมือหลังใบอนุมัติ — `ownerId` บนใบถูกตรึงไว้ตอนอนุมัติ (mig 0294)
   ส่วนเจ้าของดีลวันนี้คือคนที่ลงมือต่อได้จริง ⇒ ต้องรู้ทั้งคู่ */
test('ดีลย้ายมือแล้ว ส่งถึงทั้งสองคน', () => {
  const notice = taxInvoiceNotice({
    order: { ...ORDER, deal: { id: 'D-1', ownerId: 'U-AE2' } },
    installment: INST, actorId: 'U-FN',
  });
  assert.deepEqual(notice.userIds.sort(), ['U-AE', 'U-AE2']);
});

/* 🔴 จุดที่พลาดง่ายที่สุด — `canConfirmPayment` คืน true ให้ admin ตั้งแต่บรรทัดแรก
   ⇒ แอดมินที่เป็นเจ้าของดีลเองกดบันทึกใบกำกับ แล้วเด้งใส่ตัวเอง */
test('🔴 คนกดเป็นเจ้าของเอง ⇒ ไม่ยิง', () => {
  assert.equal(taxInvoiceNotice({ order: ORDER, installment: INST, actorId: 'U-AE' }), null);
});

test('ไม่มีเจ้าของทั้งสองช่อง ⇒ ไม่ยิง (ยิงเปล่าคือเสียงรบกวน)', () => {
  const notice = taxInvoiceNotice({
    order: { ...ORDER, ownerId: null, deal: null }, installment: INST, actorId: 'U-FN',
  });
  assert.equal(notice, null);
});

/* หัวข้อต้องไม่ว่างหลัง btrim — CHECK ของ 0185 ปฏิเสธ แล้ว insert ล้ม **ทั้ง batch**
   เงียบ ๆ (ร่องรอยเดียวคือ console.error) ⇒ ประกอบจากเลขที่ใบซึ่งมีเสมอ */
test('หัวข้อไม่ว่าง และลิงก์พาไปแท็บการชำระเสมอ', () => {
  const notice = taxInvoiceNotice({ order: ORDER, installment: INST, actorId: 'U-FN' });
  assert.ok(notice.title.trim().length > 0);
  assert.match(notice.title, /SO-26090001-0/);
  assert.match(notice.body, /IV-6809001/);
  // ปลายทางต้องเป็นที่ที่กดโหลดไฟล์ได้ในคลิกเดียว ไม่ใช่หน้ารวมของบัญชี
  assert.equal(notice.href, '/sa/sales-orders/SOR-1?tab=payment');
});

test('ไม่มีเลขใบกำกับ ⇒ ไม่ยิง (ยังไม่มีอะไรให้ AE เอาไปทำ)', () => {
  const notice = taxInvoiceNotice({
    order: ORDER, installment: { ...INST, taxInvoiceNo: '  ' }, actorId: 'U-FN',
  });
  assert.equal(notice, null);
});

/* กุญแจกันยิงซ้ำต้องมี **ทั้งงวดและเลขใบ** — คีย์ที่มีแต่ installmentId จะกลืน
   การแจ้งรอบสองหลังถอนใบแล้วออกใบใหม่ ซึ่งเป็นเรื่องที่ AE ต้องรู้จริง ๆ */
test('🔴 กุญแจกันยิงซ้ำเปลี่ยนตามเลขใบกำกับ', () => {
  assert.equal(taxInvoiceDedupeKey('SOI-1', 'IV-1'), 'taxinv:SOI-1:IV-1');
  assert.notEqual(taxInvoiceDedupeKey('SOI-1', 'IV-1'), taxInvoiceDedupeKey('SOI-1', 'IV-2'));
  const notice = taxInvoiceNotice({ order: ORDER, installment: INST, actorId: 'U-FN' });
  assert.equal(notice.dedupeKey, 'taxinv:SOI-1:IV-6809001');
});

test('ถอนใบกำกับ: คนละ kind · ไม่ dedupe · ข้อความบอกให้แจ้งลูกค้ากลับ', () => {
  const notice = taxInvoiceNotice({
    order: ORDER, installment: { id: 'SOI-1', seq: 1, label: 'มัดจำ' },
    actorId: 'U-FN', cleared: true,
  });
  assert.equal(notice.kind, TAX_INVOICE_CLEARED_KIND);
  // ถอนแล้วออกใหม่แล้วถอนอีก = ลำดับเหตุการณ์ที่ต้องเห็นครบ ⇒ ห้ามมีกุญแจกันซ้ำ
  assert.equal(notice.dedupeKey, undefined);
  assert.match(notice.title, /ถูกถอนคืน/);
  assert.match(notice.body, /แจ้งกลับ/);
});

test('ข้อมูลใบไม่ครบ ⇒ ไม่ยิง แทนที่จะได้หัวข้อพิกล', () => {
  assert.equal(taxInvoiceNotice({ order: { id: 'SOR-1' }, installment: INST }), null);
  assert.equal(taxInvoiceNotice({ order: ORDER, installment: null }), null);
  assert.equal(taxInvoiceNotice(), null);
});
