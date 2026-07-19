import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPublishableChangeNote,
  normalizeOrganizationSettingsInput,
  organizationSettingStatusLabel,
} from './organizationSettings';

const validInput = {
  legalNameTh: ' บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด ',
  legalNameEn: ' SCENT & SENSE LABORATORY CO., LTD. ',
  taxId: '010-5557-08166-5',
  branchCode: '00000',
  registeredAddressTh: ' กรุงเทพมหานคร ',
  registeredAddressEn: '',
  phone: '02-000-7722',
  email: 'admin@example.com',
  lineId: '@perfumefactory',
  website: 'www.scentandsense.co.th',
  changeNote: ' ปรับข้อมูลติดต่อ ',
};

test('organization settings normalize whitespace and numeric identity fields', () => {
  const { value, errors } = normalizeOrganizationSettingsInput(validInput);
  assert.deepEqual(errors, []);
  assert.equal(value.legalNameTh, 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด');
  assert.equal(value.taxId, '0105557081665');
  assert.equal(value.registeredAddressEn, null);
  assert.equal(value.changeNote, 'ปรับข้อมูลติดต่อ');
});

test('organization settings require Thai legal identity and fixed tax/branch codes', () => {
  const { errors } = normalizeOrganizationSettingsInput({
    ...validInput,
    legalNameTh: '',
    taxId: '123',
    branchCode: '0',
    registeredAddressTh: '',
  });
  assert.ok(errors.includes('กรุณาระบุชื่อนิติบุคคลภาษาไทย'));
  assert.ok(errors.includes('กรุณาระบุที่อยู่จดทะเบียนภาษาไทย'));
  assert.ok(errors.includes('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก'));
  assert.ok(errors.includes('รหัสสาขาต้องเป็นตัวเลข 5 หลัก'));
});

test('organization settings reject invalid email and require a note before publish', () => {
  const { errors } = normalizeOrganizationSettingsInput({ ...validInput, email: 'not-an-email' });
  assert.ok(errors.includes('รูปแบบอีเมลไม่ถูกต้อง'));
  assert.equal(hasPublishableChangeNote({ changeNote: '  ' }), false);
  assert.equal(hasPublishableChangeNote({ changeNote: 'แก้ที่อยู่' }), true);
  assert.equal(organizationSettingStatusLabel('published'), 'เผยแพร่แล้ว');
});
