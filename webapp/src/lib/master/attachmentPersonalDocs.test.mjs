// Tests ด่านเอกสารส่วนบุคคลของลูกค้า (มติผู้ใช้ 2026-08-16). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { CUSTOMER_DOC_TYPES, PERSONAL_DOC_TYPES, isPersonalDoc } from './attachmentTypes.js';
import { canViewAttachmentRow } from './attachmentAccess.js';

// เอกสารธุรกิจ = ที่ฝ่ายอื่นต้องใช้จริง (สรรพสามิตดึงไปยื่นภาษี) จึงเปิดกว้างตามเดิม
const BUSINESS_DOC_TYPES = new Set([
  'company_certificate', 'vat_pp20', 'address_map', 'manufacturing_contract', 'other',
]);

const att = (docType, entityType = 'customer') => ({ id: 'ATT-1', entityType, docType });
const customer = (teams) => ({ id: 'CUS-1', name: 'ลูกค้าทดสอบ', teams });

test('ทุก docType ของลูกค้าถูกจัดกลุ่มไว้ชัดเจน — ของใหม่ที่ลืมจัดจะทำให้เทสต์นี้ตก', () => {
  const keys = Object.values(CUSTOMER_DOC_TYPES).flat().map((d) => d.key);
  const unclassified = [...new Set(keys)]
    .filter((k) => !PERSONAL_DOC_TYPES.has(k) && !BUSINESS_DOC_TYPES.has(k));
  assert.deepEqual(unclassified, [],
    `docType ที่ยังไม่ได้จัดกลุ่ม: ${unclassified.join(', ')} — เติมใน PERSONAL_DOC_TYPES หรือ BUSINESS_DOC_TYPES`);
});

test('isPersonalDoc: เฉพาะเอกสารของบุคคล และเฉพาะ entity ลูกค้า', () => {
  assert.equal(isPersonalDoc('customer', 'director_id_card'), true);
  assert.equal(isPersonalDoc('customer', 'id_card'), true);
  assert.equal(isPersonalDoc('customer', 'bank_book'), true);
  assert.equal(isPersonalDoc('customer', 'company_certificate'), false);
  assert.equal(isPersonalDoc('customer', 'address_map'), false);
  // ไฟล์ของ entity อื่นไม่เข้าเกณฑ์นี้ แม้ docType จะบังเอิญชื่อซ้ำ
  assert.equal(isPersonalDoc('registration', 'id_card'), false);
  assert.equal(isPersonalDoc('customer', undefined), false);
});

test('เอกสารธุรกิจ — ทุกคนที่ผ่านด่าน entity แม่ยังเปิดได้เหมือนเดิม', () => {
  const other = { role: 'ae', teams: ['ODM'] };
  assert.equal(canViewAttachmentRow(att('company_certificate'), customer(['Services']), other), true);
  assert.equal(canViewAttachmentRow(att('address_map'), customer(['Services']), other), true);
  // legal ไม่มีทีมเลย แต่ต้องเปิดเอกสารธุรกิจได้ (หน้าทะเบียนสรรพสามิตดึงไปใช้)
  assert.equal(canViewAttachmentRow(att('vat_pp20'), customer(['Services']), { role: 'legal' }), true);
});

test('เอกสารส่วนบุคคล — เห็นเฉพาะทีมผู้ดูแลลูกค้ารายนั้น', () => {
  const cus = customer(['Services']);
  assert.equal(canViewAttachmentRow(att('director_id_card'), cus, { role: 'ae', teams: ['Services'] }), true);
  assert.equal(canViewAttachmentRow(att('director_id_card'), cus, { role: 'ae', teams: ['ODM'] }), false);
  // อ่านอย่างเดียวแต่อยู่ในทีม = เปิดได้ (ไม่ต้องมีสิทธิ์แก้)
  assert.equal(canViewAttachmentRow(att('bank_book'), cus, { role: 'viewer', teams: ['Services'] }), true);
  // ไม่มีทีมเลย = ไม่ใช่คนของลูกค้ารายนี้
  assert.equal(canViewAttachmentRow(att('house_reg'), cus, { role: 'legal' }), false);
  assert.equal(canViewAttachmentRow(att('id_card'), cus, {}), false);
});

test('admin เปิดได้ทุกใบ', () => {
  assert.equal(canViewAttachmentRow(att('director_id_card'), customer(['Services']), { role: 'admin' }), true);
});

test('ลูกค้าที่ยังไม่มีทีมผู้ดูแล = ของกลาง ยังเปิดได้ (กติกาเดียวกับด่านแก้)', () => {
  assert.equal(canViewAttachmentRow(att('id_card'), customer([]), { role: 'ae', teams: ['ODM'] }), true);
  assert.equal(canViewAttachmentRow(att('id_card'), customer(undefined), { role: 'ae', teams: ['ODM'] }), true);
});

test('ไฟล์ของ entity อื่นไม่ถูกด่านนี้แตะ — ด่านของ entity แม่คุมเองตามเดิม', () => {
  const stranger = { role: 'ae', teams: ['ODM'] };
  assert.equal(canViewAttachmentRow(att('id_card', 'registration'), { teams: ['Services'] }, stranger), true);
  assert.equal(canViewAttachmentRow(att('other', 'personal_task'), {}, stranger), true);
});
