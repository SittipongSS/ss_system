import { cachedFetchJson } from './apiCache';
import { DOCUMENT_FORMS } from './documentBrand';

export const DOCUMENT_STANDARD_KEYS = Object.freeze(['quotation', 'salesOrder']);

export const DOCUMENT_STANDARD_LABELS = Object.freeze({
  quotation: 'ใบเสนอราคา',
  salesOrder: 'ใบสั่งขาย',
});

// เปิดให้เลือกเฉพาะสีที่มีเอกสารใช้จริงตอนนี้ (มติ 2026-07-25) — เครื่องยนต์เอกสาร
// (DOCUMENT_ACCENT_THEMES) รองรับมากกว่านี้ แต่ตัวเลือกที่ไม่มีเอกสารชนิดไหนใช้
// ก็เป็นปุ่มที่กดแล้วไม่เกิดอะไร · เพิ่มคีย์ที่นี่ตอนมีเอกสารชนิดใหม่จริง
export const DOCUMENT_ACCENT_KEYS = Object.freeze(['terracotta', 'steel']);

export const DOCUMENT_ACCENT_LABELS = Object.freeze({
  terracotta: 'Terracotta · ใบเสนอราคา',
  steel: 'Steel · ใบสั่งขาย',
});

// สีตั้งต้นต่อชนิดเอกสาร ใช้ทั้งตอนยังไม่มีมาตรฐานเผยแพร่ และตอนมาตรฐานถือคีย์เก่า
// ที่เลิกให้เลือกแล้ว (teal/amber/green/navy) — map ที่ resolver ไม่ต้องแตะข้อมูลใน DB
const DEFAULT_ACCENT_BY_KEY = Object.freeze({ quotation: 'terracotta', salesOrder: 'steel' });

export const DOCUMENT_STANDARD_LIMITS = Object.freeze({
  titleTh: 150,
  titleEn: 150,
  formCode: 40,
  revision: 20,
  numberingPattern: 120,
  changeNote: 500,
});

const NUMBERING_TOKENS = new Set([
  'YY', 'YYYY', 'MM', 'DD',
  'RUNNING:3', 'RUNNING:4', 'RUNNING:5',
  'REVISION',
]);

function normalizeText(value, max, field, errors, { required = false, upper = false } = {}) {
  let text = String(value ?? '').trim();
  if (upper) text = text.toUpperCase();
  if (required && !text) errors.push(`กรุณาระบุ${field}`);
  if (text.length > max) errors.push(`${field}ต้องไม่เกิน ${max} ตัวอักษร`);
  return text || null;
}

export function validateNumberingPattern(pattern) {
  const text = String(pattern ?? '').trim().toUpperCase();
  if (!text) return { ok: false, error: 'กรุณาระบุรูปแบบเลขที่เอกสาร' };
  if (text.length > DOCUMENT_STANDARD_LIMITS.numberingPattern) {
    return { ok: false, error: `รูปแบบเลขที่เอกสารต้องไม่เกิน ${DOCUMENT_STANDARD_LIMITS.numberingPattern} ตัวอักษร` };
  }

  const tokens = [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
  if (!tokens.length) return { ok: false, error: 'รูปแบบเลขที่เอกสารต้องมี token อย่างน้อยหนึ่งรายการ' };
  const unknown = tokens.find((token) => !NUMBERING_TOKENS.has(token));
  if (unknown) return { ok: false, error: `ไม่รองรับ token {${unknown}}` };

  const literal = text.replace(/\{[^{}]+\}/g, '');
  if (/[{}]/.test(literal) || !/^[A-Z0-9._/-]*$/.test(literal)) {
    return { ok: false, error: 'รูปแบบเลขที่ใช้ได้เฉพาะ A-Z, 0-9, จุด, ขีด, / และ token ที่กำหนด' };
  }
  if (!tokens.some((token) => token.startsWith('RUNNING:'))) {
    return { ok: false, error: 'รูปแบบเลขที่ต้องมี token เลขรัน {RUNNING:3}, {RUNNING:4} หรือ {RUNNING:5}' };
  }
  return { ok: true, value: text };
}

export function normalizeDocumentStandardInput(input = {}) {
  const errors = [];
  const value = {
    titleTh: normalizeText(input.titleTh, DOCUMENT_STANDARD_LIMITS.titleTh, 'ชื่อเอกสารภาษาไทย', errors, { required: true }),
    titleEn: normalizeText(input.titleEn, DOCUMENT_STANDARD_LIMITS.titleEn, 'ชื่อเอกสารภาษาอังกฤษ', errors, { upper: true }),
    formCode: normalizeText(input.formCode, DOCUMENT_STANDARD_LIMITS.formCode, 'รหัสแบบฟอร์ม', errors, { required: true, upper: true }),
    revision: normalizeText(input.revision, DOCUMENT_STANDARD_LIMITS.revision, 'Revision', errors, { required: true, upper: true }),
    effectiveDate: String(input.effectiveDate ?? '').trim(),
    accentKey: String(input.accentKey ?? '').trim(),
    numberingPattern: String(input.numberingPattern ?? '').trim().toUpperCase(),
    changeNote: normalizeText(input.changeNote, DOCUMENT_STANDARD_LIMITS.changeNote, 'หมายเหตุการเปลี่ยนแปลง', errors),
  };

  if (value.formCode && !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value.formCode)) {
    errors.push('รหัสแบบฟอร์มใช้ได้เฉพาะ A-Z, 0-9 และขีดกลาง เช่น FM-SA-01');
  }
  if (value.revision && !/^[A-Z0-9][A-Z0-9._-]*$/.test(value.revision)) {
    errors.push('Revision ใช้ได้เฉพาะ A-Z, 0-9, จุด ขีดกลาง และขีดล่าง');
  }
  const parsedEffectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(value.effectiveDate)
    ? new Date(`${value.effectiveDate}T00:00:00Z`)
    : null;
  if (!parsedEffectiveDate
      || Number.isNaN(parsedEffectiveDate.getTime())
      || parsedEffectiveDate.toISOString().slice(0, 10) !== value.effectiveDate) {
    errors.push('วันที่มีผลไม่ถูกต้อง');
  }
  if (!DOCUMENT_ACCENT_KEYS.includes(value.accentKey)) {
    errors.push('Accent ที่เลือกไม่ถูกต้อง');
  }
  const numbering = validateNumberingPattern(value.numberingPattern);
  if (!numbering.ok) errors.push(numbering.error);
  else value.numberingPattern = numbering.value;

  return { value, errors: [...new Set(errors)] };
}

export function documentStandardStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'ซ่อนแล้ว';
  return 'ฉบับร่าง';
}

export function hasDocumentStandardChangeNote(version) {
  return !!String(version?.changeNote || '').trim();
}

export function formatDocumentStandardEffectiveDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return '-';
  const [, year, month, day] = match;
  return `${day}/${month}/${String(Number(year) + 543).padStart(4, '0')}`;
}

export function documentStandardFormLine(version) {
  if (!version) return '-';
  return `${version.formCode}: Rev. No.${version.revision}. ${formatDocumentStandardEffectiveDate(version.effectiveDate)}`;
}

// ── มาตรฐานที่เผยแพร่ → ค่าที่เอกสารใช้ ────────────────────────────────────────
// documentBrand.DOCUMENT_FORMS เป็น "ค่าสำรองที่เดียว" เหมือน companyProfile —
// เอกสารต้องพิมพ์ได้เสมอแม้โหลดมาตรฐานไม่ได้ แต่ถ้ามีมาตรฐานเผยแพร่ต้องใช้ค่านั้น

// แถวเวอร์ชันที่เผยแพร่ → รูป form เดียวกับ DOCUMENT_FORMS ที่ตัวสร้างเอกสารกินอยู่แล้ว
export function documentStandardToForm(version) {
  if (!version) return null;
  const code = String(version.formCode || '').trim();
  const revision = String(version.revision || '').trim();
  if (!code || !revision) return null;
  return {
    code,
    revision,
    effectiveDate: formatDocumentStandardEffectiveDate(version.effectiveDate),
    title: String(version.titleEn || '').trim() || null,
  };
}

// เติมช่องที่ขาดจากค่าสำรองของเอกสารชนิดนั้น — คืนรูป form ที่ใช้ได้เสมอ
export function resolveDocumentForm(version, documentKey) {
  const fallback = DOCUMENT_FORMS[documentKey] || DOCUMENT_FORMS.quotation;
  const form = documentStandardToForm(version);
  if (!form) return fallback;
  return {
    code: form.code,
    revision: form.revision,
    effectiveDate: form.effectiveDate !== '-' ? form.effectiveDate : fallback.effectiveDate,
    title: form.title || fallback.title,
  };
}

export function resolveDocumentAccentKey(version, documentKey) {
  const fallback = DEFAULT_ACCENT_BY_KEY[documentKey] || 'terracotta';
  const accentKey = String(version?.accentKey || '').trim();
  return DOCUMENT_ACCENT_KEYS.includes(accentKey) ? accentKey : fallback;
}

// ชื่อไทยของเอกสารที่พิมพ์บนหัวใบ — มาตรฐานคุมได้ ไม่งั้นใช้ป้ายมาตรฐานของชนิดนั้น
export function resolveDocumentTitleTh(version, documentKey) {
  return String(version?.titleTh || '').trim() || DOCUMENT_STANDARD_LABELS[documentKey] || 'เอกสาร';
}

// ── client only ──────────────────────────────────────────────────────────────
// ดึงมาตรฐานที่เผยแพร่มาใช้ตอนพิมพ์สด (cache แบบ SWR ผ่าน apiCache) — ล้มเมื่อไร
// คืน {} ให้ resolveDocumentForm ตกไปใช้ค่าสำรอง เอกสารจะได้พิมพ์ได้เสมอ
export async function getDocumentStandardsForPrint() {
  try {
    const data = await cachedFetchJson('/api/document-standards/active');
    return data?.standards || {};
  } catch (error) {
    console.warn('[documentStandards] โหลด /api/document-standards/active ไม่สำเร็จ — ใช้ค่าสำรองจาก documentBrand', error);
    return {};
  }
}

export function numberingPatternExample(pattern, revision = '0') {
  const text = String(pattern || '');
  return text
    .replaceAll('{YYYY}', '2026')
    .replaceAll('{YY}', '26')
    .replaceAll('{MM}', '07')
    .replaceAll('{DD}', '20')
    .replaceAll('{RUNNING:3}', '001')
    .replaceAll('{RUNNING:4}', '0001')
    .replaceAll('{RUNNING:5}', '00001')
    .replaceAll('{REVISION}', String(revision || '0'));
}
