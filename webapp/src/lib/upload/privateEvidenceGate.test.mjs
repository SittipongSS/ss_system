import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SO_PAYMENT_EVIDENCE_CLOSED,
  privateEvidenceStatusError,
} from '@/lib/upload/privateEvidence';
import { installmentActionError } from '@/lib/sales/salesOrderPayments';

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

test('ด่านอัปหลักฐานการชำระ: ใบที่ยังไม่อนุมัติแนบได้ (งวดร่างบันทึกเงินได้ตั้งแต่ B-4)', () => {
  for (const status of ['draft', 'pending_approval', 'approved', 'approval_revoked']) {
    assert.equal(
      privateEvidenceStatusError('sales_order_payment_evidence', { status }),
      null,
      `สถานะ ${status} ต้องแนบหลักฐานการชำระได้`,
    );
  }
});

test('ด่านอัปหลักฐานการชำระ: ใบที่ยกเลิก/ตีกลับ/ถูกออก Rev. ทับ แนบไม่ได้', () => {
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
