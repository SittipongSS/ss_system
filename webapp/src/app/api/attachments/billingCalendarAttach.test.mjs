// ── รูปปฏิทินวางบิลของลูกค้า (v5 ปฏิทินรายปี · มติเจ้าของ 29/09 · contract §8) ─────────────────────────────────────────
// 🐞 calendar-v3: FN ตั้งกำหนดวางบิลได้ (ช่องแคบ `canEditCustomerBillingRule`) แต่แนบรูปปฏิทินที่ใช้เทียบไม่ได้ — POST ไฟล์แนบถาม
//    `canEditAttachmentParent` (= แก้ทะเบียนลูกค้า · customers:edit) ⇒ 403
// ⭐ ตรึง: docType `billing_calendar` อยู่ในทะเบียนของลูกค้า (ไม่ตกเป็น 'other') แต่ไม่เป็นการ์ด · รับเฉพาะรูป/PDF ที่เปิดคู่ตารางได้ ·
//    ช่องแคบแนบ/ลบ/แก้ = ด่านเดียวกับแก้กำหนดวางบิล (ฝ่ายขายทีมที่ดูแล + FN) และแคบเฉพาะ entity ลูกค้า + docType นี้ ·
//    proxy ปล่อย FN ถึง handler · ไม่ต้องออก migration (ตารางไม่มี CHECK ของ docType)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ATTACHMENT_TYPES, BILLING_CALENDAR_DOC_TYPE, CUSTOMER_DOC_TYPES, attachmentFileRuleError, attachmentTypeLabel,
  customerDocTypes, docTypeFileRule, isPersonalDoc,
} from '@/lib/master/attachmentTypes';
import { canAttachBillingCalendar, canViewAttachmentRow } from '@/lib/master/attachmentAccess';
import { apiWriteAllowed } from '@/proxy';

const customer = (teams = ['ODM']) => ({ id: 'C-281', arCode: 'AR-281', name: 'บริษัท มีเมตตา จำกัด', teams });
const FN = { id: 'F1', role: 'finance', department: 'FN' };
const AE_ODM = { id: 'A1', role: 'ae', teams: ['ODM'] };
const AE_KA = { id: 'A2', role: 'ae', teams: ['KA'] };

test('docType อยู่ในทะเบียนของลูกค้า (ไม่ตกเป็น "other") · มีป้าย · ไม่เป็นการ์ดเอกสารของทะเบียนลูกค้า · ไม่ใช่เอกสารส่วนบุคคล', () => {
  assert.equal(BILLING_CALENDAR_DOC_TYPE, 'billing_calendar');
  assert.ok(ATTACHMENT_TYPES.customer.some((t) => t.key === BILLING_CALENDAR_DOC_TYPE), 'POST ตีคีย์ที่ไม่รู้จักเป็น other');
  assert.equal(attachmentTypeLabel('customer', BILLING_CALENDAR_DOC_TYPE), 'ปฏิทินวางบิลของลูกค้า');
  for (const type of ['company', 'individual']) {
    assert.equal(customerDocTypes(type).some((t) => t.key === BILLING_CALENDAR_DOC_TYPE), false, `${type}: ไม่ชวนแนบจากแผงเอกสาร (แนบที่นั่น = ไม่มีปี)`);
    assert.equal(CUSTOMER_DOC_TYPES[type].some((t) => t.key === BILLING_CALENDAR_DOC_TYPE), false);
  }
  assert.equal(ATTACHMENT_TYPES.customer.find((t) => t.key === BILLING_CALENDAR_DOC_TYPE).required, false);
  assert.equal(isPersonalDoc('customer', BILLING_CALENDAR_DOC_TYPE), false);
  assert.equal(canViewAttachmentRow({ entityType: 'customer', docType: BILLING_CALENDAR_DOC_TYPE }, customer(), AE_KA), true,
    'เปิดดูได้ทุกคนที่เห็นลูกค้า (เอกสารธุรกิจ)');
});

test('รับเฉพาะรูป/PDF ที่เบราว์เซอร์เปิดคู่กับตารางได้ — Excel/HEIC ไม่รับ', () => {
  const rule = docTypeFileRule(BILLING_CALENDAR_DOC_TYPE);
  assert.ok(rule);
  for (const [fileName, mimeType] of [['cal.jpg', 'image/jpeg'], ['cal.png', 'image/png'], ['cal.pdf', 'application/pdf'], ['cal.PDF', '']]) {
    assert.equal(attachmentFileRuleError(BILLING_CALENDAR_DOC_TYPE, { fileName, mimeType }), null, fileName);
  }
  for (const [fileName, mimeType] of [
    ['cal.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['cal.heic', 'image/heic'], ['cal.pdf', 'text/html'],
  ]) {
    assert.match(attachmentFileRuleError(BILLING_CALENDAR_DOC_TYPE, { fileName, mimeType }), /แนบได้เฉพาะรูปภาพหรือ PDF/, fileName);
  }
  assert.match(rule.accept, /application\/pdf/);
  assert.match(rule.accept, /\.pdf/);
});

test('⭐ ช่องแคบ = ด่านแก้กำหนดวางบิล: FN + ฝ่ายขายทีมที่ดูแลได้ · ทีมอื่น/ผู้ดูไม่ได้ · เฉพาะลูกค้า + docType นี้', () => {
  assert.equal(canAttachBillingCalendar('customer', BILLING_CALENDAR_DOC_TYPE, customer(), FN), true, 'FN (403 เดิมของ calendar-v3)');
  assert.equal(canAttachBillingCalendar('customer', BILLING_CALENDAR_DOC_TYPE, customer(), AE_ODM), true);
  assert.equal(canAttachBillingCalendar('customer', BILLING_CALENDAR_DOC_TYPE, customer(), AE_KA), false, 'ทีมอื่น');
  assert.equal(canAttachBillingCalendar('customer', BILLING_CALENDAR_DOC_TYPE, customer(), { role: 'viewer', teams: ['ODM'] }), false);
  assert.equal(canAttachBillingCalendar('customer', BILLING_CALENDAR_DOC_TYPE, customer(), { role: 'finance', department: 'RD' }), false,
    'role finance แต่ไม่ใช่ฝ่าย FN');
  // แคบเป๊ะ: เอกสารอื่นของลูกค้า / entity อื่น / ไม่มีแถวแม่ = ไม่ได้ช่องนี้
  assert.equal(canAttachBillingCalendar('customer', 'company_certificate', customer(), FN), false);
  assert.equal(canAttachBillingCalendar('customer', 'other', customer(), FN), false);
  assert.equal(canAttachBillingCalendar('product', BILLING_CALENDAR_DOC_TYPE, { id: 'P-1' }, FN), false);
  assert.equal(canAttachBillingCalendar('customer', BILLING_CALENDAR_DOC_TYPE, null, FN), false);
  assert.equal(canAttachBillingCalendar('customer', BILLING_CALENDAR_DOC_TYPE, customer(), null), false);
});

test('proxy ปล่อย FN ถึง handler (แนบ · ลบ · แก้รายละเอียด) — ด่านจริงอยู่ที่ handler', () => {
  for (const [method, path] of [['POST', '/api/attachments'], ['POST', '/api/master/attachments'], ['DELETE', '/api/attachments/ATT-1'], ['PATCH', '/api/master/attachments/ATT-1']]) {
    assert.equal(apiWriteAllowed(method, path, 'finance', []), true, `${method} ${path}`);
  }
});

const POST = readFileSync(fileURLToPath(new URL('./route.js', import.meta.url)), 'utf8');
const BY_ID = readFileSync(fileURLToPath(new URL('./[id]/route.js', import.meta.url)), 'utf8');

test('POST: ช่องแคบต่อท้ายด่านรวม (ไม่แทน) · มาก่อนคุยกับ Drive และก่อนกติกาไฟล์ · docType ที่ถามคือค่าที่ตรงทะเบียน', () => {
  const post = POST.slice(POST.indexOf('export async function POST'));
  assert.match(post, /const allowedEdit = await canEditAttachmentParent\(supabase, entityType, parent, user\)\s*\n\s*\|\| canAttachBillingCalendar\(entityType, docType, parent, user\);/);
  const gate = post.indexOf('canAttachBillingCalendar(');
  assert.ok(gate < post.indexOf('buildGoogleAttachment('), 'ด่านสิทธิ์ก่อนสร้างไฟล์บน Drive');
  assert.ok(gate < post.indexOf('.insert('), 'ด่านสิทธิ์ก่อนเขียนแถว');
  // เอกสาร Google เป็นรูปปฏิทินไม่ได้ — กติกาไฟล์ของ docType ตีกลับก่อนคุยกับ Drive
  assert.ok(post.indexOf('attachmentFileRuleError(safeDocType') < post.indexOf('buildGoogleAttachment('));
});

test('ลบ/แก้ (guardAttachmentWrite): ช่องแคบเดียวกัน อ่าน docType ของแถว ไม่ใช่ค่าจากคำขอ', () => {
  assert.match(BY_ID, /\|\| canAttachBillingCalendar\(att\.entityType, att\.docType, parent, user\);/);
  assert.match(BY_ID, /import \{ canAttachBillingCalendar \} from '@\/lib\/master\/attachmentAccess';/);
});

test('ไม่ต้องออก migration — ตาราง attachments ไม่มี CHECK ของ docType (ค่าตั้งแต่ mig 0028 เป็น text อิสระ)', () => {
  const mig = readFileSync(fileURLToPath(new URL('../../../../supabase/migrations/0028_attachments.sql', import.meta.url)), 'utf8');
  assert.match(mig, /"docType"\s+text not null default 'other'/);
  assert.doesNotMatch(mig, /check\s*\(\s*"docType"/i);
});
