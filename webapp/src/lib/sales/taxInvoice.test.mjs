import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TAX_INVOICE_NO, hasTaxInvoice, taxInvoiceActionError, taxInvoiceClearPatch,
  taxInvoicePatch, taxInvoicePending, taxInvoiceValueError,
} from '@/lib/sales/taxInvoice';
import { installmentActionError } from '@/lib/sales/salesOrderPayments';

const FN = { id: 'U-FN', name: 'บัญชี ก', role: 'finance', department: 'FN', permissions: null };
const SA = { id: 'U-SA', name: 'ขาย ข', role: 'ae', permissions: null };
const ADMIN = { id: 'U-AD', name: 'แอดมิน', role: 'admin', permissions: null };

const row = (over = {}) => ({ id: 'SOI-1', seq: 1, status: 'confirmed', ...over });
const OK = { taxInvoiceNo: 'IV-6809001', taxInvoiceDate: '2026-09-07' };
// ⚠️ ด่านค่าใช้ชื่อ `no`/`date` ส่วนด่านคำสั่งรับ payload ของ route (`taxInvoiceNo`/`taxInvoiceDate`)
const VALUES = { no: 'IV-6809001', date: '2026-09-07' };

/* ── ค่าที่กรอก ต้องตายที่ด่านนี้ ไม่ใช่ที่ CHECK ของ DB ──────────────────
   ปลายทางนั้น route catch เป็น 500 พร้อมข้อความ Postgres ดิบภาษาอังกฤษ */
test('เลข/วันที่ต้องครบและอยู่ในช่วงที่ CHECK ของ 0348 ยอมรับ', () => {
  assert.equal(taxInvoiceValueError(VALUES), null);
  assert.match(taxInvoiceValueError({ ...VALUES, no: '' }), /เลขที่ใบกำกับ/);
  assert.match(taxInvoiceValueError({ no: 'IV-1', date: '' }), /วันที่/);
  assert.match(taxInvoiceValueError({ no: 'IV-1', date: '07/09/2026' }), /รูปแบบวันที่/);
  // ปีพิมพ์เกินเป็นเคสจริงของระบบนี้ (`formulaDate = '2202-08-06'`)
  assert.match(taxInvoiceValueError({ no: 'IV-1', date: '2202-09-07' }), /ปีของวันที่/);
  assert.match(
    taxInvoiceValueError({ no: 'x'.repeat(MAX_TAX_INVOICE_NO + 1), date: '2026-09-07' }),
    /ยาวเกิน/,
  );
});

test('ช่องว่างล้วนไม่นับว่ามีเลข (btrim เหมือน CHECK)', () => {
  assert.match(taxInvoiceValueError({ no: '   ', date: '2026-09-07' }), /เลขที่ใบกำกับ/);
  assert.equal(hasTaxInvoice({ taxInvoiceNo: '   ' }), false);
  assert.equal(hasTaxInvoice({ taxInvoiceNo: 'IV-1' }), true);
});

/* ── ด่านสิทธิ์: ของฝ่ายบัญชีล้วน ─────────────────────────────────────── */
test('🔴 บันทึกใบกำกับได้เฉพาะฝ่ายบัญชี — ฝ่ายขายไม่ได้', () => {
  assert.equal(taxInvoiceActionError(row(), 'tax-invoice', FN, OK), null);
  assert.equal(taxInvoiceActionError(row(), 'tax-invoice', ADMIN, OK), null);
  assert.match(taxInvoiceActionError(row(), 'tax-invoice', SA, OK), /เฉพาะฝ่ายบัญชี/);
});

/* ⭐ มติผู้ใช้ 2026-09-07: บางกรณีลูกค้าขอไฟล์ก่อนจ่าย ⇒ ออกใบกำกับก่อนเงินเข้าได้
   ⇒ ด่านนี้ต้องไม่ผูกกับสถานะงวด (ทรงเดียวกับ link/unlink ไม่ใช่ทรง schedule) */
test('⭐ กรอกได้ทุกสถานะของงวด — รวมงวดที่ยังไม่รับรอง', () => {
  for (const status of ['pending', 'reported', 'confirmed', 'rejected']) {
    assert.equal(taxInvoiceActionError(row({ status }), 'tax-invoice', FN, OK), null,
      `สถานะ ${status} ต้องบันทึกใบกำกับได้`);
  }
});

test('ลบใบกำกับ: ต้องมีของให้ลบก่อน', () => {
  assert.match(taxInvoiceActionError(row(), 'tax-invoice-clear', FN), /ยังไม่ได้บันทึก/);
  assert.equal(
    taxInvoiceActionError(row({ taxInvoiceNo: 'IV-1' }), 'tax-invoice-clear', FN),
    null,
  );
});

/* ── ด่านตัวเดียวกับที่ route ใช้ — ปุ่มกับ API ต้องขัดกันไม่ได้ ─────────── */
test('🔴 ด่านของงวดต้องรู้จักคำสั่งใบกำกับ ไม่งั้นตกที่ catch-all "คำสั่งไม่ถูกต้อง"', () => {
  assert.equal(
    installmentActionError(row({ status: 'reported' }), 'tax-invoice', FN, OK),
    null,
  );
  assert.match(
    installmentActionError(row(), 'tax-invoice', SA, OK),
    /เฉพาะฝ่ายบัญชี/,
  );
});

/* ── ของค้าง: บริษัทเก็บ VAT ⇒ ทุกงวดที่จ่ายแล้วต้องมีใบ ───────────────── */
test('ของค้าง = แจ้ง/รับรองแล้วแต่ยังไม่มีเลข', () => {
  assert.equal(taxInvoicePending(row({ status: 'confirmed' })), true);
  assert.equal(taxInvoicePending(row({ status: 'reported' })), true);
  assert.equal(taxInvoicePending(row({ status: 'confirmed', taxInvoiceNo: 'IV-1' })), false);
  // ยังไม่ถึงกำหนดจ่าย = ยังไม่มีเงิน ไม่ใช่ของค้าง
  assert.equal(taxInvoicePending(row({ status: 'pending' })), false);
  assert.equal(taxInvoicePending(row({ status: 'rejected' })), false);
});

/* 🔴 patch ต้องเป็น object จริงเสมอ — คืน null เมื่อไร route จะเขียนแต่ `updatedAt`
   แล้วตอบ 200 + toast สำเร็จโดยไม่เก็บค่า (บั๊กเดิมของ coversFrom/To · UAT 01/09) */
test('🔴 patch เก็บครบทุกช่อง และ trim เลขก่อนลงฐาน', () => {
  const patch = taxInvoicePatch({
    no: '  IV-6809001 ', date: '2026-09-07', file: { storagePath: 'p' },
    requestId: 'REQ-1', itemId: 'DRI-1', user: FN, now: '2026-09-07T03:00:00.000Z',
  });
  assert.equal(patch.taxInvoiceNo, 'IV-6809001');
  assert.equal(patch.taxInvoiceDate, '2026-09-07');
  assert.deepEqual(patch.taxInvoiceFile, { storagePath: 'p' });
  assert.equal(patch.taxInvoiceRequestId, 'REQ-1');
  assert.equal(patch.taxInvoiceItemId, 'DRI-1');
  assert.equal(patch.taxInvoiceById, 'U-FN');
  assert.equal(patch.taxInvoiceByName, 'บัญชี ก');
  assert.equal(patch.taxInvoiceAt, '2026-09-07T03:00:00.000Z');
});

/* ⚠️ CHECK `sales_order_installments_tax_invoice_sane` บังคับว่า วัน/ไฟล์ห้ามอยู่
   โดยไม่มีเลข ⇒ การล้างต้องล้างครบชุด ไม่งั้นล้างแล้วชน CHECK เป็น 500 */
test('🔴 ล้างใบกำกับต้องล้างครบทุกช่อง ไม่งั้นชน CHECK ของ 0348', () => {
  const patch = taxInvoiceClearPatch();
  for (const key of ['taxInvoiceNo', 'taxInvoiceDate', 'taxInvoiceFile', 'taxInvoiceRequestId',
    'taxInvoiceItemId', 'taxInvoiceById', 'taxInvoiceByName', 'taxInvoiceAt']) {
    assert.equal(patch[key], null, `${key} ต้องถูกล้าง`);
  }
});
