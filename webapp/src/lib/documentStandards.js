import { cachedFetchJson } from './apiCache';
import { businessDate } from './businessDate';
import { DOCUMENT_FORMS } from './documentBrand';

export const DOCUMENT_STANDARD_KEYS = Object.freeze(['quotation', 'salesOrder', 'exciseTaxNotice', 'projectTimeline']);

export const DOCUMENT_STANDARD_LABELS = Object.freeze({
  quotation: 'ใบเสนอราคา',
  salesOrder: 'ใบสั่งขาย',
  exciseTaxNotice: 'ใบแจ้งชำระค่าภาษีสรรพสามิต',
  projectTimeline: 'เอกสารไทม์ไลน์โครงการ',
});

// เปิดให้เลือกเฉพาะสีที่มีเอกสารใช้จริงตอนนี้ (มติ 2026-07-25) — เครื่องยนต์เอกสาร
// (DOCUMENT_ACCENT_THEMES) รองรับมากกว่านี้ แต่ตัวเลือกที่ไม่มีเอกสารชนิดไหนใช้
// ก็เป็นปุ่มที่กดแล้วไม่เกิดอะไร · เพิ่มคีย์ที่นี่ตอนมีเอกสารชนิดใหม่จริง
export const DOCUMENT_ACCENT_KEYS = Object.freeze(['terracotta', 'steel', 'amber', 'navy']);

export const DOCUMENT_ACCENT_LABELS = Object.freeze({
  terracotta: 'Terracotta · ใบเสนอราคา',
  steel: 'Steel · ใบสั่งขาย',
  amber: 'Amber · ใบแจ้งชำระภาษี',
  navy: 'Navy · เอกสารไทม์ไลน์โครงการ',
});

// สีตั้งต้นต่อชนิดเอกสาร ใช้ทั้งตอนยังไม่มีมาตรฐานเผยแพร่ และตอนมาตรฐานถือคีย์เก่า
// ที่เลิกให้เลือกแล้ว (teal/amber/green/navy) — map ที่ resolver ไม่ต้องแตะข้อมูลใน DB
const DEFAULT_ACCENT_BY_KEY = Object.freeze({
  quotation: 'terracotta',
  salesOrder: 'steel',
  exciseTaxNotice: 'amber',
  projectTimeline: 'navy',
});

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
  // {REVISION} ต้องปิดท้าย — ระบบตัดตรงนี้เพื่อเอาส่วนหน้าเป็น "เลขฐาน" ของสายฉบับแก้ไข
  // (quotations.baseNumber) ถ้าอยู่กลางสตริงจะแยกเลขฐานไม่ได้ แล้ว Revise จะออกเลขมั่ว
  if (!text.endsWith('{REVISION}')) {
    return { ok: false, error: 'รูปแบบเลขที่ต้องปิดท้ายด้วย {REVISION} — ระบบใช้ส่วนหน้าเป็นเลขฐานของฉบับแก้ไข' };
  }
  // ตัวนับเลขรันใน DB รีเซ็ตทุกเดือน (quote_number_counters.month = 'YYMM') — ถ้ารูปแบบ
  // ไม่มีเดือน+ปี เลขจะวนซ้ำข้ามเดือน/ข้ามปีแล้วไปชน UNIQUE ตอนบันทึกใบ
  if (!tokens.includes('MM') || !tokens.some((token) => token === 'YY' || token === 'YYYY')) {
    return { ok: false, error: 'รูปแบบเลขที่ต้องมี {MM} และ {YY} หรือ {YYYY} — ตัวนับเลขรันรีเซ็ตทุกเดือน ถ้าไม่มีเดือน/ปีเลขจะซ้ำ' };
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

// ── รูปแบบเลขที่ → เลขเอกสารจริง ─────────────────────────────────────────────
// ตัวจัดรูปแบบตัวกลางที่ใบเสนอราคา (JS) และตัวอย่างในหน้าตั้งค่าใช้ร่วมกัน
// ⚠ ใบสั่งขายประกอบเลขใน SQL (create_sales_order_draft — mig 0155) เพราะตัวนับกับ
//   การ INSERT ต้องอยู่ทรานแซกชันเดียวกัน · ใบแจ้งชำระภาษี (mig 0162) และเอกสาร
//   ไทม์ไลน์โครงการ (mig 0198) ก็ประกอบใน trigger ด้วยเหตุผลเดียวกัน
//   เพิ่ม/แก้ token ที่นี่ต้องแก้ที่นั่นคู่กันเสมอ

export const DEFAULT_NUMBERING_PATTERNS = Object.freeze({
  quotation: 'QT-{YY}{MM}{RUNNING:4}-{REVISION}',
  salesOrder: 'SO-{YY}{MM}{RUNNING:4}-{REVISION}',
  exciseTaxNotice: 'ET-{YY}{MM}{RUNNING:4}-{REVISION}',
  projectTimeline: 'PT-{YY}{MM}{RUNNING:4}-{REVISION}',
});

const REVISION_TOKEN = '{REVISION}';
// ตัวคั่นระหว่างเลขฐานกับเลข revision — จำกัดชุดเดียวกับที่ validator ยอมให้เป็น literal
const SEPARATOR_TAIL = /[-._/]+$/;

// วันที่ของเลขตัวอย่างในหน้าตั้งค่า — ตรงกับวันที่บนเอกสารตัวอย่าง (20/07/2569)
const EXAMPLE_DATE = new Date('2026-07-20T12:00:00+07:00');

export function formatDocumentNumber(pattern, { date = new Date(), running = 0, revision = 0 } = {}) {
  // เดือน/ปีต้องเป็นเวลาไทยให้ตรงกับตัวนับใน DB (to_char(timezone('Asia/Bangkok', …)))
  const [year, month, day] = businessDate(date).split('-');
  const values = { YYYY: year, YY: year.slice(-2), MM: month, DD: day };
  const runningNo = Math.max(0, Math.trunc(Number(running) || 0));
  return String(pattern || '').replace(/\{([^{}]+)\}/g, (token, name) => {
    if (name === 'REVISION') return String(revision ?? 0);
    const width = /^RUNNING:(\d+)$/.exec(name);
    // pad อย่างเดียว ห้ามตัด — เลขรันที่ยาวเกินความกว้างต้องยาวขึ้น ไม่ใช่ทับเลขเดิม
    if (width) return String(runningNo).padStart(Number(width[1]), '0');
    return values[name] ?? token; // token ที่ไม่รู้จักปล่อยไว้ ดีกว่าออกเลขไม่ได้
  });
}

// แยก "เลขฐาน" (ส่วนหน้า {REVISION}) กับตัวคั่น — เลขฐานใช้ผูกสายฉบับแก้ไข
export function documentNumberParts(pattern, { date = new Date(), running = 0 } = {}) {
  const text = String(pattern || '');
  const cut = text.indexOf(REVISION_TOKEN);
  // รูปแบบที่ไม่มี {REVISION} (เผยแพร่ไว้ก่อนกฎใหม่ — published แก้ย้อนหลังไม่ได้):
  // ทั้งก้อนคือเลขฐาน แล้วต่อ R ด้วย '-' ตามรูปแบบเดิมของระบบ
  if (cut < 0) return { base: formatDocumentNumber(text, { date, running }), separator: '-' };
  const head = formatDocumentNumber(text.slice(0, cut), { date, running });
  const separator = SEPARATOR_TAIL.exec(head)?.[0] || '';
  return { base: separator ? head.slice(0, -separator.length) : head, separator };
}

// ตัวคั่นก่อนเลข revision ของ "ใบต้นทางเอง" — ใบที่ออกด้วยรูปแบบเก่าต้องต่อ R ด้วย
// ตัวคั่นของตัวเอง ไม่ใช่ของรูปแบบปัจจุบันที่อาจถูกเปลี่ยนไปแล้วหลังใบนั้นออก
// เลขที่ของ "ฉบับที่กำลังพิมพ์" สำหรับเอกสารที่เดิน Rev อยู่บนแถวเดิม (เอกสารไทม์ไลน์
// โครงการ — projects."currentRev" mig 0040/0198) ต่างจาก QT ที่ฉบับแก้ไขแตกแถวใหม่
// พร้อมเลขใหม่ · ต่อเลข Rev ด้วยตัวคั่นของใบตัวเอง ไม่ใช่ของรูปแบบปัจจุบัน
export function documentNumberWithRevision(baseNumber, issuedNumber, revision) {
  const base = String(baseNumber || '').trim();
  if (!base) return String(issuedNumber || '').trim();
  const rev = Math.max(0, Math.trunc(Number(revision) || 0));
  return `${base}${revisionSeparatorOf(issuedNumber, base)}${rev}`;
}

export function revisionSeparatorOf(fullNumber, baseNumber) {
  const full = String(fullNumber || '');
  const base = String(baseNumber || '');
  if (!base || !full.startsWith(base)) return '-';
  const tail = full.slice(base.length).replace(/\d+$/, '');
  return /^[-._/]*$/.test(tail) ? tail : '-';
}

// รูปแบบที่เผยแพร่อยู่ (ฝั่ง server — ผู้เรียกส่ง supabase client เข้ามา) · ล้มเมื่อไร
// คืนค่าสำรอง ไม่ throw: ตารางตั้งค่าล่มต้องไม่ทำให้ออกเอกสารไม่ได้
export async function publishedNumberingPattern(supabase, documentKey) {
  const fallback = DEFAULT_NUMBERING_PATTERNS[documentKey] || DEFAULT_NUMBERING_PATTERNS.quotation;
  try {
    const { data, error } = await supabase
      .from('document_standard_versions')
      .select('numberingPattern')
      .eq('documentKey', documentKey)
      .eq('status', 'published')
      .maybeSingle();
    if (error) throw error;
    return String(data?.numberingPattern || '').trim() || fallback;
  } catch (error) {
    console.warn('[documentStandards] อ่านรูปแบบเลขที่ที่เผยแพร่ไม่สำเร็จ — ใช้รูปแบบสำรอง', error);
    return fallback;
  }
}

export function numberingPatternExample(pattern, revision = '0') {
  if (!String(pattern || '').trim()) return '';
  return formatDocumentNumber(pattern, { date: EXAMPLE_DATE, running: 1, revision: revision || '0' });
}
