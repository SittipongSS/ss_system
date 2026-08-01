// ด่านเอกสารบังคับตอนอนุมัติ master data — ตัวช่วยที่ไม่มี I/O
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  docTypesFor, missingDocsMessage, overrideReasonError, MIN_OVERRIDE_REASON, requiredDocKeys,
} from './attachmentTypes.js';

test('ลูกค้านิติบุคคล/บุคคลธรรมดา ได้ชุดเอกสารบังคับคนละชุด', () => {
  const company = requiredDocKeys('customer', docTypesFor('customer', { customerType: 'company' }));
  const individual = requiredDocKeys('customer', docTypesFor('customer', { customerType: 'individual' }));

  assert.ok(company.includes('company_certificate'), 'นิติบุคคลต้องมีหนังสือรับรอง');
  assert.ok(company.includes('vat_pp20'));
  assert.ok(!individual.includes('company_certificate'), 'บุคคลธรรมดาต้องไม่ถูกขอหนังสือรับรองบริษัท');
  assert.ok(individual.includes('id_card'), 'บุคคลธรรมดาต้องมีสำเนาบัตรประชาชน');
  // สัญญาออกแบบกลิ่นบังคับทั้งสองประเภท
  assert.ok(company.includes('design_contract') && individual.includes('design_contract'));
});

test('ไม่ระบุประเภท = ใช้ชุดนิติบุคคล (ค่าตั้งต้นเดิมของระบบ)', () => {
  const fallback = requiredDocKeys('customer', docTypesFor('customer', {}));
  const company = requiredDocKeys('customer', docTypesFor('customer', { customerType: 'company' }));
  assert.deepEqual(fallback, company);
});

test('สินค้าบังคับ Artwork', () => {
  assert.deepEqual(requiredDocKeys('product', docTypesFor('product')), ['artwork']);
});

test('ข้อความบอกให้รู้ว่าขาดอะไรและต้องไปทำที่ไหน', () => {
  const msg = missingDocsMessage([{ key: 'artwork', label: 'Artwork สินค้า' }], 'สินค้า FG-1 ');
  assert.match(msg, /FG-1/);
  assert.match(msg, /Artwork สินค้า/);
  assert.match(msg, /แนบได้ที่/);
});

// ⭐ ทางยกเว้นต้องเขียนเหตุผลจริง — ระเบียนที่อนุมัติแล้วตกกลับเป็น "รออนุมัติ" ทุกครั้ง
// ที่มีคนแก้ ถ้าไม่มีทางออกเลย ลูกค้าที่ยังไม่มีเอกสารจะกลายเป็นระเบียนที่แก้แล้ว
// อนุมัติกลับไม่ได้ = ออกใบเสนอราคาให้ไม่ได้
test('ยกเว้นเอกสารต้องมีเหตุผลยาวพอ ไม่ใช่เคาะช่องว่าง', () => {
  assert.ok(overrideReasonError(''));
  assert.ok(overrideReasonError('   '));
  assert.ok(overrideReasonError('ขอก่อน'), 'สั้นเกินต้องไม่ผ่าน');
  assert.ok(overrideReasonError('          '), 'ช่องว่างล้วนต้องไม่ผ่าน');
  assert.equal(overrideReasonError('ลูกค้าเก่าจะส่งเอกสารตามภายในสัปดาห์นี้'), null);
  assert.equal(overrideReasonError('x'.repeat(MIN_OVERRIDE_REASON)), null);
});
