// ช่องเลขทะเบียนผู้ว่าจ้างของสัญญาต้องเป็นชนิด taxId (คำขอเจ้าของ 27/11/2026)
// ⇒ ฟอร์ม (ContractFormFields) ใช้ NationalIdInput: ขีดขึ้นเองตอนพิมพ์ ตรงกับกระดาษที่จัดด้วย fmtTaxId
// ประกาศเป็น 'text' เมื่อไร จอตอนกรอกกลับไปโชว์ตัวเลขล้วน ขณะที่กระดาษมีขีด — สองรูปในใบเดียว
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { contractTemplate, contractTemplateFields } from './contractTemplates.js';

test('แม่แบบสัญญาทุกชนิดที่มีช่อง clientRegNo ประกาศเป็นชนิด taxId', () => {
  const kinds = ['scent_design', 'service'].filter((kind) => contractTemplate(kind));
  assert.ok(kinds.length >= 2);
  for (const kind of kinds) {
    const field = contractTemplateFields(kind).find((f) => f.key === 'clientRegNo');
    assert.ok(field, `${kind}: ไม่มีช่อง clientRegNo`);
    assert.equal(field.type, 'taxId', kind);
  }
});

test('ฟอร์มสัญญามีทางของชนิด taxId — ตัวเลขใช้ NationalIdInput · ค่าที่มีตัวอักษรใช้ช่องข้อความ (ไม่ทิ้งเลขพาสปอร์ต)', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '../../components/salesPlanning/ContractFormFields.js'), 'utf8');
  assert.match(src, /field\.type === "taxId"/);
  assert.match(src, /<NationalIdInput value=\{text\.replace\(\/\\D\/g, ""\)\}/);
  assert.match(src, /\/\[\^\\d\\s-\]\/\.test\(text\)/);
});

test('หน้ารายละเอียดสัญญา (โหมดอ่าน) จัดช่องชนิด taxId ด้วย fmtTaxId — ไม่โชว์ตัวเลขล้วนข้างกระดาษที่มีขีด', () => {
  const page = fs.readFileSync(path.resolve(import.meta.dirname, '../../app/sales-planning/contracts/[id]/page.js'), 'utf8');
  assert.match(page, /field\.type === "taxId" \? fmtTaxId\(contract\.fields\?\.\[field\.key\]\)/);
});
