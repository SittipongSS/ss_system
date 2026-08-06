// ด่านเอกสารบังคับตอนอนุมัติ master data — ตัวช่วยที่ไม่มี I/O
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentTypeLabel, docTypesFor, missingDocsMessage, overrideReasonError,
  MIN_OVERRIDE_REASON, requiredDocKeys, unsatisfiedRequiredDocs,
} from './attachmentTypes.js';

test('ลูกค้านิติบุคคล/บุคคลธรรมดา ได้ชุดเอกสารบังคับคนละชุด', () => {
  const company = requiredDocKeys('customer', docTypesFor('customer', { customerType: 'company' }));
  const individual = requiredDocKeys('customer', docTypesFor('customer', { customerType: 'individual' }));

  assert.ok(company.includes('company_certificate'), 'นิติบุคคลต้องมีหนังสือรับรอง');
  assert.ok(company.includes('vat_pp20'));
  assert.ok(!individual.includes('company_certificate'), 'บุคคลธรรมดาต้องไม่ถูกขอหนังสือรับรองบริษัท');
  assert.ok(individual.includes('id_card'), 'บุคคลธรรมดาต้องมีสำเนาบัตรประชาชน');
  // แผนที่ที่อยู่บังคับทั้งสองประเภท (มติผู้ใช้ 2026-08-05) — ฝั่งสรรพสามิตดึงแผนที่จาก
  // ลูกค้าเจ้าของทะเบียน ไม่ได้แนบเองที่ทะเบียน ลูกค้าที่ไม่มีแผนที่จึงตันตั้งแต่ต้นทาง
  assert.ok(company.includes('address_map') && individual.includes('address_map'));
  // สัญญาออกแบบกลิ่นถอดออกจากชุดเอกสารลูกค้าแล้ว (มติผู้ใช้ 2026-08-05)
  assert.ok(!company.includes('design_contract') && !individual.includes('design_contract'));
});

// ไฟล์ที่แนบไว้ตอนที่ยังมีชนิดนี้ ยังอยู่ในฐานข้อมูล — ป้ายต้องยังอ่านออก ไม่ใช่คีย์ดิบ
test('ชนิดเอกสารที่เลิกใช้แล้ว ยังมีป้ายภาษาไทยให้ไฟล์เก่า', () => {
  assert.match(attachmentTypeLabel('customer', 'design_contract'), /สัญญาออกแบบกลิ่น/);
  assert.match(attachmentTypeLabel('customer', 'design_contract'), /เลิกใช้/);
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

// ── อายุเอกสาร: "มีแล้วแต่หมดอายุ" ต้องไม่ผ่านด่านอนุมัติ (2026-08-06) ──────

const CERT = (issuedDate) => ({ docType: 'company_certificate', metadata: issuedDate ? { issuedDate } : {} });
const COMPANY_DOCS = docTypesFor('customer', { customerType: 'company' });
// เอกสารบังคับอื่นของนิติบุคคลที่ไม่มีอายุกำกับ — ใส่ให้ครบเพื่อให้เหลือตัวแปรเดียว
const OTHERS = ['vat_pp20', 'director_id_card', 'address_map'].map((docType) => ({ docType, metadata: {} }));

test('หนังสือรับรองที่เกิน 6 เดือน = ไม่ครบ ถึงจะแนบไฟล์ไว้แล้วก็ตาม', () => {
  const out = unsatisfiedRequiredDocs('customer', COMPANY_DOCS, [CERT('2025-01-15'), ...OTHERS], '2026-08-06');
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'company_certificate');
  assert.equal(out[0].reason, 'expired');
  assert.equal(out[0].expiresAt, '2025-07-15');
});

test('หนังสือรับรองที่ยังไม่เกิน 6 เดือน = ผ่าน', () => {
  assert.deepEqual(unsatisfiedRequiredDocs('customer', COMPANY_DOCS, [CERT('2026-05-01'), ...OTHERS], '2026-08-06'), []);
});

test('แนบหลายใบ — มีใบที่ยังไม่หมดอายุใบเดียวก็ผ่าน', () => {
  const files = [CERT('2024-01-01'), CERT('2026-06-01'), ...OTHERS];
  assert.deepEqual(unsatisfiedRequiredDocs('customer', COMPANY_DOCS, files, '2026-08-06'), []);
});

test('ไฟล์เก่าที่ยังไม่ได้กรอกวันที่ ต้องไม่กลายเป็น "หมดอายุ" ข้ามคืน', () => {
  // ของจริงบน prod มีหนังสือรับรองที่แนบไว้ก่อนฟีเจอร์นี้ — ถ้านับเป็นหมดอายุทันที
  // ลูกค้ารายนั้นจะอนุมัติไม่ผ่านโดยที่ไม่มีใครเปลี่ยนอะไรเลย
  assert.deepEqual(unsatisfiedRequiredDocs('customer', COMPANY_DOCS, [CERT(''), ...OTHERS], '2026-08-06'), []);
});

test('ยังไม่แนบเลย = absent (คนละเหตุกับหมดอายุ — ข้อความที่ผู้ใช้เห็นต่างกัน)', () => {
  const out = unsatisfiedRequiredDocs('customer', COMPANY_DOCS, OTHERS, '2026-08-06');
  assert.deepEqual(out.map((m) => [m.key, m.reason]), [['company_certificate', 'absent']]);
});
