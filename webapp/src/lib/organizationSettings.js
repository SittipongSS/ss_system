export const ORGANIZATION_SETTING_LIMITS = Object.freeze({
  legalNameTh: 200,
  legalNameEn: 200,
  registeredAddressTh: 1000,
  registeredAddressEn: 1000,
  phone: 50,
  email: 254,
  lineId: 100,
  website: 255,
  changeNote: 500,
});

export const ORGANIZATION_SETTING_FIELDS = Object.freeze([
  'legalNameTh',
  'legalNameEn',
  'taxId',
  'branchCode',
  'registeredAddressTh',
  'registeredAddressEn',
  'phone',
  'email',
  'lineId',
  'website',
  'changeNote',
]);

const REQUIRED_LABELS = Object.freeze({
  legalNameTh: 'ชื่อนิติบุคคลภาษาไทย',
  taxId: 'เลขประจำตัวผู้เสียภาษี',
  branchCode: 'รหัสสาขา',
  registeredAddressTh: 'ที่อยู่จดทะเบียนภาษาไทย',
});

export function normalizeOrganizationSettingsInput(input = {}) {
  const value = {};
  const errors = [];

  for (const field of ORGANIZATION_SETTING_FIELDS) {
    const text = String(input[field] ?? '').trim();
    const max = ORGANIZATION_SETTING_LIMITS[field];
    if (max && text.length > max) errors.push(`${field} ต้องไม่เกิน ${max} ตัวอักษร`);
    if (REQUIRED_LABELS[field] && !text) errors.push(`กรุณาระบุ${REQUIRED_LABELS[field]}`);
    value[field] = text || null;
  }

  value.taxId = String(input.taxId ?? '').replace(/\D/g, '');
  value.branchCode = String(input.branchCode ?? '').replace(/\D/g, '');
  if (!/^\d{13}$/.test(value.taxId)) errors.push('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก');
  if (!/^\d{5}$/.test(value.branchCode)) errors.push('รหัสสาขาต้องเป็นตัวเลข 5 หลัก');

  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
    errors.push('รูปแบบอีเมลไม่ถูกต้อง');
  }

  return { value, errors: [...new Set(errors)] };
}

export function organizationSettingStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'ซ่อนแล้ว';
  return 'ฉบับร่าง';
}

export function hasPublishableChangeNote(version) {
  return !!String(version?.changeNote || '').trim();
}
