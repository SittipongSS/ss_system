import test from 'node:test';
import assert from 'node:assert/strict';

import { canSwitchQuotationDocLanguage } from '@/lib/sales/quotationWorkflow';
import { QUOTATION_APPROVAL_INVALIDATING_FIELDS, QUOTATION_NON_CONTENT_FIELDS } from '@/lib/sales/quotationDocumentFields';

const q = (over) => ({ status: 'sent', approvalStatus: 'approved', ...over });

// ⭐ มติผู้ใช้ 2026-08-27 — ใบที่อนุมัติแล้วเปลี่ยนภาษาได้ ไม่ต้องออก Rev.
test('ใบที่อนุมัติแล้วเปลี่ยนภาษาได้', () => {
  assert.equal(canSwitchQuotationDocLanguage(q()), true);
  assert.equal(canSwitchQuotationDocLanguage(q({ approvalStatus: 'not_required' })), true);
  assert.equal(canSwitchQuotationDocLanguage(q({ status: 'draft', approvalStatus: 'not_submitted' })), true);
});

// ผู้อนุมัติกำลังเปิดใบนั้นอยู่ — เปลี่ยนใต้เท้าเขาไม่ได้
test('ใบที่ยื่นอนุมัติค้างอยู่ เปลี่ยนไม่ได้', () => {
  assert.equal(canSwitchQuotationDocLanguage(q({ approvalStatus: 'pending' })), false);
});

test('ใบที่ปิด/ยกเลิก เปลี่ยนไม่ได้', () => {
  assert.equal(canSwitchQuotationDocLanguage(q({ status: 'closed' })), false);
  assert.equal(canSwitchQuotationDocLanguage(q({ status: 'cancelled' })), false);
  assert.equal(canSwitchQuotationDocLanguage(null), false);
});

// ถ้าหลุดกลับเข้าลิสต์นี้ เปลี่ยนภาษาจะล้างการอนุมัติทิ้งอีกครั้ง
test('docLanguage ต้องไม่อยู่ในลิสต์ที่ล้างการอนุมัติ', () => {
  assert.equal(QUOTATION_APPROVAL_INVALIDATING_FIELDS.includes('docLanguage'), false);
  assert.equal(typeof QUOTATION_NON_CONTENT_FIELDS.docLanguage, 'string');
});
