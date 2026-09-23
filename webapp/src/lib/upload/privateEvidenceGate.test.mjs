import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SO_PAYMENT_EVIDENCE_CLOSED,
  SO_TAX_INVOICE_CLOSED,
  isSalesOrderEvidencePath,
  privateEvidenceAllows,
  privateEvidenceStatusError,
} from '@/lib/upload/privateEvidence';
import { installmentActionError, pipelineInstallmentLock } from '@/lib/sales/salesOrderPayments';

/* ── ด่านของไฟล์ต้องไม่แคบกว่าด่านของคำสั่ง ────────────────────────────────
 *
 * 🐞 ผู้ใช้แจ้ง 2026-08-27: กด "บันทึกว่าลูกค้าจ่ายแล้ว" บนใบที่ยังไม่อนุมัติแล้วโมดัล
 * ค้างเงียบ · ต้นเหตุคือด่านอัปหลักฐาน (`sales_order_payment_evidence`) ยังบังคับ
 * `status === 'approved'` ตามกติกาแรกของ 0245 ทั้งที่ B-4 (#1328 · 2026-08-19)
 * เปิดให้งวดร่างบันทึกเงินได้แล้ว ⇒ ปุ่มขึ้นให้กด แต่ไฟล์ขึ้นไม่ได้ทุกครั้ง
 * (วัดบน prod: งวดร่างที่มี `paidOn` = 0 แถว ตลอด 8 วันที่ฟีเจอร์อยู่บนระบบ)
 *
 * เทสต์นี้ล็อกความสัมพันธ์ ไม่ใช่ล็อกรายชื่อสถานะ: **ถ้าคำสั่งแจ้งชำระผ่าน
 * ไฟล์ก็ต้องอัปได้** ⇒ ใครย้ายด่านฝั่งไหนก่อน อีกฝั่งจะแดงทันที
 */

const DRAFT_ROW = { id: 'SOI-1', seq: 1, status: 'pending', evidence: [] };
const SA = { id: 'U-1', role: 'ae', permissions: null };

/* ⚠️ แก้โดยตั้งใจ (review 23/09 · มติ D3): 'rejected' แนบได้แล้ว — ใบที่ถูกตีกลับกลับเข้ารอบแก้ และใบ Rev. ที่ถูกตีกลับถืองวดเงิน (0376) */
test('ด่านอัปหลักฐานการชำระ: ใบที่ยังไม่อนุมัติ/ถูกตีกลับแนบได้ (งวดร่างบันทึกเงินได้ตั้งแต่ B-4 · D3)', () => {
  for (const status of ['draft', 'pending_approval', 'approved', 'approval_revoked', 'rejected']) {
    assert.equal(
      privateEvidenceStatusError('sales_order_payment_evidence', { status }),
      null,
      `สถานะ ${status} ต้องแนบหลักฐานการชำระได้`,
    );
  }
});

test('ด่านอัปหลักฐานการชำระ: ใบที่ยกเลิก/ถูกออก Rev. ทับ แนบไม่ได้', () => {
  assert.deepEqual([...SO_PAYMENT_EVIDENCE_CLOSED].sort(), ['cancelled', 'revised']);
  for (const status of SO_PAYMENT_EVIDENCE_CLOSED) {
    const error = privateEvidenceStatusError('sales_order_payment_evidence', { status });
    assert.ok(error, `สถานะ ${status} ต้องถูกปฏิเสธ`);
    assert.match(error, /แนบหลักฐานการชำระไม่ได้/);
  }
});

test('ปุ่มกับไฟล์ต้องเดินทางเดียวกัน — งวดที่ `report` ผ่าน ต้องอัปหลักฐานได้ด้วย', () => {
  const gate = installmentActionError(DRAFT_ROW, 'report', SA, {
    paidOn: '2026-08-27', rows: [DRAFT_ROW], orderTotal: 100000,
  });
  assert.equal(gate, null, 'ด่านคำสั่งต้องยอมให้งวดร่างแจ้งชำระ');
  assert.equal(
    privateEvidenceStatusError('sales_order_payment_evidence', { status: 'draft' }),
    null,
    'ด่านไฟล์ต้องยอมตามด่านคำสั่ง ไม่งั้นปุ่มขึ้นแต่กดไม่ผ่าน',
  );
});

test('entityType ที่ไม่รู้จักไม่ผ่านด่าน', () => {
  assert.equal(privateEvidenceStatusError('made_up_type', { status: 'draft' }), 'forbidden');
});

/* ── ใบกำกับภาษีของงวด (mig 0348) — โฟลเดอร์แรกที่เจ้าของไม่ใช่ฝ่ายขาย ────────
 *
 * ⭐ FN เป็นคนออกใบกำกับ ⇒ ต้องอัปไฟล์ได้ · แต่ role `finance` **ไม่มี** `salesplan:edit`
 * ⇒ ด่านตั้งต้นของ `privateEvidence` ปฏิเสธเขาทุกครั้ง (403 จาก /api/upload/session
 * ที่ไปโผล่ใต้โมดัล มองไม่เห็น — อาการเดียวกับ IS-26080026)
 * ⚠️ และต้อง **ไม่กว้างเกินไป**: FN ยังอัปสลิปการชำระไม่ได้ เพราะคนรับรองเงินต้องไม่ใช่
 * คนส่งหลักฐานเงิน (ด่านนี้คือสิ่งที่กันไม่ให้ปุ่มกับไฟล์เดินคนละทางในทิศตรงข้าม)
 */
const FN = { id: 'U-FN', role: 'finance', department: 'FN', permissions: null };
const DEAL = { id: 'D-1', ownerId: 'U-1', team: 'A' };

test('ใบกำกับภาษี: ฝ่ายบัญชี (FN) อัปไฟล์ได้', () => {
  assert.equal(privateEvidenceAllows('sales_order_tax_invoice', FN, { deal: DEAL }), true);
});

test('🔴 ใบกำกับภาษี: FN อัปได้เฉพาะโฟลเดอร์ของตัวเอง — สลิปการชำระยังอัปไม่ได้', () => {
  assert.equal(privateEvidenceAllows('sales_order_payment_evidence', FN, { deal: DEAL }), false);
});

/* ⚠️ แก้โดยตั้งใจ (PR0 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09): ใบ pipeline ที่ยกเลิกแล้ว บัญชียัง
   บันทึกใบกำกับของเงินที่เข้าแล้วได้ (`pipelineInstallmentLock` ปล่อย `tax-invoice`) ⇒ ไฟล์ใบกำกับต้องอัปได้ด้วย
   (ด่านของไฟล์ต้องไม่แคบกว่าด่านของคำสั่ง — ยามความสัมพันธ์อยู่ข้างล่าง) · ตีกลับ/ถูกออก Rev. ทับยังปิดเหมือนเดิม */
/* ⚠️ แก้โดยตั้งใจรอบสอง (review 23/09 · มติ D3): ใบที่ถูกตีกลับแนบใบกำกับได้ — ใบ Rev. ที่ถูกตีกลับถืองวดที่รับเงินแล้ว (0376) */
test('ใบกำกับภาษี: ใบที่ถูกออก Rev. ทับ แนบไม่ได้ · ใบยกเลิก/ตีกลับแนบได้ (บัญชียังบันทึกใบกำกับของเงินที่เข้าแล้ว)', () => {
  assert.deepEqual([...SO_TAX_INVOICE_CLOSED].sort(), ['revised']);
  assert.equal(privateEvidenceStatusError('sales_order_tax_invoice', { status: 'rejected' }), null);
  for (const status of SO_TAX_INVOICE_CLOSED) {
    const error = privateEvidenceStatusError('sales_order_tax_invoice', { status });
    assert.ok(error, `สถานะ ${status} ต้องถูกปฏิเสธ`);
  }
  assert.equal(privateEvidenceStatusError('sales_order_tax_invoice', { status: 'cancelled' }), null);
  assert.equal(privateEvidenceStatusError('sales_order_tax_invoice', { status: 'approved' }), null);
});

/* 🔴 ความสัมพันธ์ "คำสั่งผ่าน ⇒ ไฟล์ต้องอัปได้" ของล็อกทั้งใบ (PR0) — คิดจากตัวตัดสินตัวเดียวกับ route/ปุ่ม
   ไม่ใช่รายชื่อสถานะที่เขียนซ้ำ ⇒ ใครขยับล็อกฝั่งไหนก่อน อีกฝั่งแดงทันที
   🐞 review (rejected-so-button-upload-mismatch / F1): รายชื่อสถานะของยามนี้เคยข้าม 'rejected' — สถานะเดียวที่สองด่านขัดกัน
     (ใบ Rev. ที่ AE Sup ตีกลับถืองวดเงินที่ย้ายมา · มติ D3 รับเงินต่อ) ⇒ ไล่ **ทุกสถานะของ CHECK 0166** ไม่ใช่รายชื่อที่เลือกเอง */
const ALL_SO_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'revised', 'approval_revoked'];
test('🔴 ล็อกทั้งใบของใบ pipeline: คำสั่งที่ล็อกปล่อย ไฟล์ของคำสั่งนั้นต้องอัปได้ (ทุกสถานะของใบ)', () => {
  const FOLDER = { report: 'sales_order_payment_evidence', 'tax-invoice': 'sales_order_tax_invoice' };
  for (const status of ALL_SO_STATUSES) {
    for (const [action, folder] of Object.entries(FOLDER)) {
      const order = { origin: 'pipeline', status };
      if (pipelineInstallmentLock(order, action)) continue;
      assert.equal(privateEvidenceStatusError(folder, order), null, `${status}/${action} — ปุ่มเปิดแต่ไฟล์ขึ้นไม่ได้`);
    }
  }
});

/* 🐞 #1391 ซ้ำ: เพิ่มโฟลเดอร์ใหม่แล้วลืมด่าน **อ่าน** ⇒ อัปสำเร็จแต่กดดูได้ 404
   ยามนี้ผูกด่านอ่านเข้ากับทะเบียนโฟลเดอร์ตัวเดียวกับตอนเขียน */
test('🔴 ด่านอ่านต้องรู้จักโฟลเดอร์ใบกำกับ ไม่งั้นอัปได้แต่เปิดไม่ได้', () => {
  assert.equal(isSalesOrderEvidencePath('sales-orders/SO-1/tax-invoices/a.pdf', 'SO-1'), true);
  assert.equal(isSalesOrderEvidencePath('sales-orders/SO-1/payments/a.pdf', 'SO-1'), true);
  // ผูกกับใบ — ก๊อป ref ข้ามใบแล้วเปิดไฟล์ของใบอื่นไม่ได้
  assert.equal(isSalesOrderEvidencePath('sales-orders/SO-2/tax-invoices/a.pdf', 'SO-1'), false);
  assert.equal(isSalesOrderEvidencePath('sales-orders/SO-1/somewhere/a.pdf', 'SO-1'), false);
});
