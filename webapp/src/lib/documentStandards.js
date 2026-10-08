import { cachedFetchJson } from './apiCache';
import { businessDate } from './businessDate';
import { DOCUMENT_FORMS } from './documentBrand';
import { DOCUMENT_AUDIENCES, documentAudienceAccentKey } from './documents/documentAudience';

// ⭐ `pdr` = แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (FM-RD-01) — ตัวแรกที่ไม่ใช่เอกสารฝั่งขาย
// แต่ใช้เปลือกเดียวกันเพราะมันคือกระดาษที่ลูกค้า/ฝ่ายผลิตอ่านเหมือนกัน
/* ⭐ `siteSurvey` = รายงานการประเมินพื้นที่ (FM-TS-01 · mig 0401 ⑦ seed แถวไว้แล้ว) — เอกสารของฝ่ายบริการ
   🔴 **คีย์ในลิสต์นี้ต้องมีแถวใน `document_standards` เสมอ** — `loadDocumentStandardsAdmin` ไล่ตามลิสต์นี้แล้วโยน
      `root_missing` เมื่อขาดแถว ซึ่งพา `/api/document-standards/active` ล้มสำหรับผู้ใช้ทุกคน (เอกสารทุกชนิดตกไปค่าสำรอง)
      ⇒ เพิ่มคีย์ = ต้องมี migration ที่ seed แถวขึ้น prod ก่อนโค้ด */
export const DOCUMENT_STANDARD_KEYS = Object.freeze(['quotation', 'salesOrder', 'exciseTaxNotice', 'projectTimeline', 'pdr', 'productSpec', 'siteSurvey']);

export const DOCUMENT_STANDARD_LABELS = Object.freeze({
  quotation: 'ใบเสนอราคา',
  salesOrder: 'ใบสั่งขาย',
  exciseTaxNotice: 'ใบแจ้งชำระค่าภาษีสรรพสามิต',
  projectTimeline: 'ไทม์ไลน์โครงการ',
  pdr: 'แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR)',
  /* ⭐ ชื่อเอกสาร FM-SA-04 (มติผู้ใช้ 2026-09-22 "ชื่อเอกสาร แสดงตามภาษา") — **ภาษาเดียวตามภาษาของใบ**
     แบบใบเสนอราคา: ใบไทย = ค่านี้ · ใบอังกฤษ = `DOCUMENT_FORMS.productSpec.title` ('PRODUCT SPEC')
     ⚠️ ค่าสำรองเมื่ออ่านมาตรฐานที่เผยแพร่ไม่ได้เท่านั้น · ตัวจริงอยู่ที่ document_standard_versions
        (v3: titleTh/titleEn คู่นี้ — เปลี่ยนชื่อผ่านเส้นมาตรฐานเอกสาร ไม่ใช่ UPDATE ทับ)
     🪤 อย่ารวมสองภาษาไว้ในสตริงเดียว ("… (Product Spec)") — หัวเอกสารเลือกภาษาเอง ใบไทยจะได้ชื่อสองภาษาซ้อน */
  productSpec: 'รายละเอียดผลิตภัณฑ์',
  // ป้ายของแท็บ/หัวข้อบนหน้าตั้งค่า — ชื่อบนกระดาษ FM-TS-01 ตรึงอยู่ในตัวเรนเดอร์ (ดู DOCUMENT_FORM_ONLY_KEYS)
  siteSurvey: 'รายงานการประเมินพื้นที่',
});

// เปิดให้เลือกเฉพาะสีที่มีเอกสารใช้จริงตอนนี้ (มติ 2026-07-25) — เครื่องยนต์เอกสาร
// (DOCUMENT_ACCENT_THEMES) รองรับมากกว่านี้ แต่ตัวเลือกที่ไม่มีเอกสารชนิดไหนใช้
// ก็เป็นปุ่มที่กดแล้วไม่เกิดอะไร · เพิ่มคีย์ที่นี่ตอนมีเอกสารชนิดใหม่จริง
/* ⭐ FM-SA-04 ใช้สีเดียวกับใบเสนอราคา (มติผู้ใช้ 2026-09-22 "ขอเปลี่ยน accent เป็นเหมือน QT") ⇒ teal ถูกถอดจากตัวเลือก
   ของชุดนี้ · แถวมาตรฐานเก่าที่ถือ teal ตกไปสีตั้งต้นของชนิดนั้นเอง (resolver ข้างล่าง) ไม่ต้องแก้ข้อมูล
   ⭐ **teal ไม่มีเอกสารชนิดไหนใช้แล้ว** (มติเจ้าของ 08/10/2026) — FM-TS-01 เคยจะพิมพ์ teal ตามกระดาน แต่มติเปลี่ยนเป็น
      "สีเดินตามผู้อ่าน" (ดู ACCENT_BY_AUDIENCE_DOCUMENT_KEYS ข้างล่าง) ⇒ ไม่มีป้าย teal ไม่มีชนิดไหนเลือกได้ และด่านรูปร่างของ body
      ตีกลับ · แถวในฐานที่ยังถือ teal (FM-SA-04 v1–v3 · แถว seed ของ siteSurvey) อ่านผ่าน resolver เป็นสีตั้งต้นของชนิดตัวเองเสมอ */
export const DOCUMENT_ACCENT_KEYS = Object.freeze(['terracotta', 'steel', 'amber', 'navy']);

export const DOCUMENT_ACCENT_LABELS = Object.freeze({
  terracotta: 'Terracotta · ใบเสนอราคา · รายละเอียดผลิตภัณฑ์',
  steel: 'Steel · ใบสั่งขาย',
  amber: 'Amber · ใบแจ้งชำระภาษี',
  navy: 'Navy · ไทม์ไลน์โครงการ',
});

// สีตั้งต้นต่อชนิดเอกสาร ใช้ทั้งตอนยังไม่มีมาตรฐานเผยแพร่ และตอนมาตรฐานถือคีย์เก่า
// ที่เลิกให้เลือกแล้ว (teal/amber/green/navy) — map ที่ resolver ไม่ต้องแตะข้อมูลใน DB
const DEFAULT_ACCENT_BY_KEY = Object.freeze({
  quotation: 'terracotta',
  salesOrder: 'steel',
  exciseTaxNotice: 'amber',
  projectTimeline: 'navy',
  productSpec: 'terracotta',
  /* สีของ FM-TS-01 เดินตามผู้อ่าน ไม่ใช่ค่าของแถวมาตรฐาน — ค่านี้คือสิ่งที่คอลัมน์ `accentKey` ของชนิดนี้ **ถือไว้เฉย ๆ**
     (ทะเบียนบังคับให้มีค่า) และคือค่าที่ resolver คืนให้แถวที่ยังถือ teal · เลือกสีของฉบับที่ออกนอกบริษัท = ฉบับที่เป็นหน้าตา
     ของเอกสารชนิดนี้ · ⚠️ กระดาษไม่อ่านค่านี้ (`surveyReportAccentKey` ถามจากฉบับเอง) */
  siteSurvey: documentAudienceAccentKey('external'),
});

/* ── ชนิดที่กระดาษอ่านจากมาตรฐานแค่ "บรรทัดแบบฟอร์ม" ──────────────────────────────
   กระดาษของชนิดนี้ใช้จากมาตรฐานแค่ รหัสแบบฟอร์ม · Revision · วันที่มีผล
   ชื่อเอกสาร · สี · รูปแบบเลขที่ กำหนดในระบบ (FM-TS-01: สีเดินตามผู้อ่านของฉบับ — ดูบล็อกถัดไป · เลขที่ SU-YYMMXXXX-R
   ออกจาก RPC `issue_survey_report`) — แก้ช่องพวกนั้นในหน้าตั้งค่าไม่เปลี่ยนกระดาษ

   🔑 คำถามเจ้าของข้อ 6 (ใครแก้มาตรฐาน FM-TS-01 ได้) — ตอบแล้ว 08/10/2026: "ด่านเดิม" คีย์นี้ใช้ `canManageDocumentStandards`
      (lib/permissions.js) ตัวเดียวกับทุกชนิด ไม่มีสิทธิ์รายคีย์ */
export const DOCUMENT_FORM_ONLY_KEYS = Object.freeze(['siteSurvey']);

/* ── ชนิดที่สีของกระดาษเดินตามผู้อ่าน (มติเจ้าของ 08/10/2026 ข้อ 5 — กติกาทั้งระบบ) ─────────────────
   กระดาษที่ออกนอกบริษัท = terracotta (สีของใบเสนอราคา) · กระดาษภายใน = steel (สีของใบสั่งขาย) — `lib/documents/documentAudience.js`
   ⇒ ชนิดในลิสต์นี้ **ไม่มีสีให้เลือก**: หน้าตั้งค่าไม่มีตัวเลือกสี โชว์บรรทัดอ่านอย่างเดียวพร้อมจุดสีของแต่ละฉบับแทน
      (`documentAudienceAccentMarks`) และทุกจุดที่เคยโชว์ "สีของมาตรฐาน" (หัวรายละเอียด · ประวัติ · ลิ้นชัก) โชว์จุดสองสีชุดเดียวกัน
   ⚠️ รอบนี้มี FM-TS-01 ชนิดเดียว — ชนิดอื่นยังเลือกสีจากมาตรฐานเหมือนเดิมทุกอย่าง · งานถัดไปจะย้ายเอกสารทุกชนิดมาที่กติกานี้
      (เติมคีย์ที่นี่ + ให้ตัวเรนเดอร์ของชนิดนั้นถามสีจาก `documentAudienceAccentKey`)
   🔴 **สีของกลุ่มผู้อ่านเป็นคีย์ตายตัว ไม่ได้อ่านมาตรฐานที่เผยแพร่ของใบเสนอราคา/ใบสั่งขาย** — และสองชนิดนั้น **ยังเลือกสีได้สี่สี**
      (`documentAccentKeysFor` ข้างล่าง · กระดาษของมันอ่านค่าที่เผยแพร่จริง — `lib/sales/quotePrint.js` · `salesOrderPrint.js`)
      ⇒ วันที่หัวหน้าเผยแพร่ใบเสนอราคาเป็น Navy ใบเสนอราคาพิมพ์ navy แต่ฉบับลูกค้าของ FM-TS-01 ยัง terracotta
      ⇒ **ข้อความบนจอห้ามบอกว่า "สีเดียวกับใบเสนอราคา / ใบสั่งขาย"** (จริงแค่ตราบที่ไม่มีใครแก้สองชนิดนั้น) — เอ่ย **ชื่อสี** แทน
      ทางที่ทำให้ประโยค "เหมือนใบเสนอราคา" จริงโดยโครงสร้าง = ล็อกสีของสองชนิดนั้น (`documentAccentKeysFor` คืนค่าเดียว)
      — **ยังไม่ได้ทำ รอมติเจ้าของ**: ตัวเลือกสีของใบเสนอราคา/ใบสั่งขายจะหายจากหน้าตั้งค่า (เรื่องของงานทั้งระบบ ไม่ใช่ของ FM-TS-01)
   ⚠️ คนละเรื่องกับ DOCUMENT_FORM_ONLY_KEYS (กระดาษอ่านแค่บรรทัดแบบฟอร์ม) — วันนี้สองลิสต์มีสมาชิกตัวเดียวกันโดยบังเอิญ */
export const ACCENT_BY_AUDIENCE_DOCUMENT_KEYS = Object.freeze(['siteSurvey']);

export const documentAccentFollowsAudience = (documentKey) => ACCENT_BY_AUDIENCE_DOCUMENT_KEYS.includes(documentKey);

// ชื่อที่ใช้เรียกฉบับของผู้อ่านแต่ละกลุ่มบนจอ
const AUDIENCE_COPIES = Object.freeze({
  external: 'ฉบับลูกค้า',
  internal: 'ฉบับภายใน',
});

// ชื่อสีล้วน = ท่อนหน้าของป้ายสี ("Terracotta · ใบเสนอราคา · …" → "Terracotta") — ท่อนหลังของป้ายคือชนิดเอกสารที่ใช้สีนั้นเป็นค่าตั้งต้น
const accentName = (accentKey) => String(DOCUMENT_ACCENT_LABELS[accentKey] || accentKey).split(' · ')[0];

/** หัวบรรทัดของ `documentAudienceAccentMarks` บนหน้าตั้งค่า */
export const DOCUMENT_AUDIENCE_ACCENT_LEAD = 'สีเดินตามผู้อ่าน';

/**
 * จุดสีของเอกสารที่สีเดินตามผู้อ่าน — สิ่งที่หน้าตั้งค่าวาดแทนตัวเลือกสี/ป้ายสีของมาตรฐาน
 * @returns `null` สำหรับชนิดที่สีมาจากมาตรฐาน (จอวาดตัวเลือกสีตามเดิม) · ไม่งั้น
 *   `[{ audience, accentKey, copy, text }]` ตามลำดับ DOCUMENT_AUDIENCES — `copy` = ชื่อฉบับ ("ฉบับลูกค้า") ·
 *   `text` = ประโยคเต็ม ("ฉบับลูกค้าใช้สี Terracotta") · `accentKey` = คีย์สีจริงของฉบับนั้น (ตัวเดียวกับที่กระดาษพิมพ์)
 *   ⚠️ `text` เอ่ย **ชื่อสีของ `accentKey` ตัวเดียวกัน** ไม่เอ่ยชื่อเอกสารชนิดอื่น (ดูบล็อกข้างบน) ⇒ ประโยคกับจุดสีไม่มีวันพูดคนละอย่าง
 */
export function documentAudienceAccentMarks(documentKey) {
  if (!documentAccentFollowsAudience(documentKey)) return null;
  return DOCUMENT_AUDIENCES.map((audience) => {
    const copy = AUDIENCE_COPIES[audience];
    const accentKey = documentAudienceAccentKey(audience);
    return { audience, accentKey, copy, text: `${copy}ใช้สี ${accentName(accentKey)}` };
  });
}

/* ── ใบตัวอย่างของชนิดที่มีสองฉบับตามผู้อ่าน: ฉบับไหน + ลิงก์หน้าเต็มจอ ─────────────────────────────
   หน้าตั้งค่ามีตัวสลับฉบับ (ลูกค้า | ภายใน) — ปุ่ม "เปิดเต็มจอ" ต้องพาฉบับที่กำลังดูไปด้วย ไม่งั้นเลือกฉบับภายในแล้วเปิดเต็มจอ
   ได้ฉบับลูกค้า (คนละสี คนละจำนวนหน้า) และ "พิมพ์ / Save PDF" ของหน้านั้นพิมพ์ได้แต่ฉบับลูกค้า
   🔑 ค่าใน URL เป็นของที่ผู้ใช้พิมพ์เองได้ ⇒ รับเฉพาะค่าใน DOCUMENT_AUDIENCES · ค่าอื่น/ไม่ส่ง = ฉบับที่ออกนอกบริษัท (ตัวแรกของลิสต์)
      — ไม่มีทางพาใบตัวอย่างไปฉบับภายในโดยไม่ตั้งใจ · ชนิดที่มีใบตัวอย่างใบเดียว = `null` (ไม่มีตัวสลับ ไม่มีพารามิเตอร์) */

/** ฉบับของใบตัวอย่างที่ใช้ได้จริงสำหรับชนิดเอกสารหนึ่ง — `'external' | 'internal'` หรือ `null` (ชนิดนั้นมีใบตัวอย่างใบเดียว) */
export function documentPreviewAudience(documentKey, value) {
  if (!documentAccentFollowsAudience(documentKey)) return null;
  return DOCUMENT_AUDIENCES.includes(value) ? value : DOCUMENT_AUDIENCES[0];
}

/** ลิงก์หน้าเต็มจอของใบตัวอย่าง — ชนิดที่มีสองฉบับพก `audience` ของฉบับที่กำลังดูไปด้วย
 *  ⚠️ ฝั่งรับ (`app/settings/document-standards/preview/page.js`) ต้องอ่านพารามิเตอร์นี้ผ่าน `documentPreviewAudience(documentKey, ค่าจาก URL)`
 *     แล้วส่งเป็น `{ audience }` ให้ `buildStandardPreviewHTML` — ไม่อ่าน = หน้าเต็มจอได้ฉบับที่ออกนอกบริษัทเสมอ */
export function documentStandardPreviewHref(documentKey, audience) {
  const copy = documentPreviewAudience(documentKey, audience);
  return `/settings/document-standards/preview?doc=${documentKey}${copy ? `&audience=${copy}` : ''}`;
}

/** สี accent ที่คอลัมน์ `accentKey` ของเอกสารชนิดหนึ่ง **รับได้** — ชนิดที่เลือกสีจากมาตรฐาน = ชุดกลางสี่สี ·
 *  ชนิดที่ไม่มีสีให้เลือก (กระดาษอ่านแค่บรรทัดแบบฟอร์ม หรือสีเดินตามผู้อ่าน) = ค่าเดียวคือสีตั้งต้นของชนิดนั้น */
export function documentAccentKeysFor(documentKey) {
  return DOCUMENT_FORM_ONLY_KEYS.includes(documentKey) || documentAccentFollowsAudience(documentKey)
    ? [DEFAULT_ACCENT_BY_KEY[documentKey]]
    : DOCUMENT_ACCENT_KEYS;
}

// สีที่เลือกได้ของ "อย่างน้อยหนึ่งชนิด" — ด่านรูปร่างของ body (normalizeDocumentStandardInput) ใช้ชุดนี้
// เพราะตอนนั้นยังไม่รู้ว่ากำลังแก้มาตรฐานของชนิดไหน
const SELECTABLE_ACCENT_KEYS = Object.freeze([...new Set(DOCUMENT_STANDARD_KEYS.flatMap(documentAccentKeysFor))]);

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

/* ── รอบตัดเลขรันของแต่ละชนิดเอกสาร (มติผู้ใช้ 2026-09-01 · mig 0328) ───────
   ⭐ ใบเสนอราคา/ใบสั่งขาย **ตัดรอบทุกปี** ส่วนใบแจ้งภาษี/ไทม์ไลน์ยัง **ตัดทุกเดือน**
   ⚠️ นี่ไม่ใช่ค่าตกแต่ง — มันคือกติกาว่ารูปแบบเลขต้องมี token อะไรบ้างถึงจะไม่ออกเลขซ้ำ
      · ตัดรายเดือน ⇒ เลขต้องมีทั้ง {MM} และปี ไม่งั้นเลขวนซ้ำข้ามเดือน
      · ตัดรายปี   ⇒ เลขต้องมีปี ({MM} มีก็ได้ ไม่มีก็ได้ — เดือนเป็นแค่ข้อมูลให้คนอ่าน)
   🪤 เปลี่ยนค่าที่นี่ไม่ได้เปลี่ยนรอบตัดจริง — รอบตัดจริงอยู่ที่ **คีย์ถังนับ** ฝั่ง
      SQL/แอป (`quoteCounterYear` ใน lib/salesPlanning.js · `v_year` ใน
      create_sales_order_draft) ⇒ แก้ที่นี่ที่เดียว = ด่านตรวจหลวมกว่าของจริง */
export const DOCUMENT_NUMBER_CYCLES = Object.freeze({
  quotation: 'year',
  salesOrder: 'year',
  // ใบแจ้งภาษีตามใบเสนอราคา/ใบสั่งขาย (มติผู้ใช้ 2026-09-01 "ET เอาแบบ QT" · mig 0329)
  exciseTaxNotice: 'year',
  // ไทม์ไลน์โครงการย้ายมารายปีพร้อมรหัสดีล/โครงการ (มติ 2026-09-01 · mig 0330) —
  // สามอย่างนี้เกิดคู่กัน ถ้ารอบตัดไม่ตรงกันโครงการหนึ่งใบจะถือเลขสองรอบคาบเกี่ยว
  projectTimeline: 'year',
  pdr: 'month',
  // SU ตัดรอบรายปี (ตัวนับ scope 'SU' คีย์ด้วย YY · mig 0401 ④) — `YYMM` ในเลขเป็นแค่เดือนที่ออกฉบับแรก
  // ไม่ใส่ = ตกไป 'month' แล้วหน้าตั้งค่าจะบอกว่าเลขรันรีเซ็ตทุกเดือน ซึ่งไม่จริง
  siteSurvey: 'year',
});

export const documentNumberCycle = (documentKey) => DOCUMENT_NUMBER_CYCLES[documentKey] || 'month';

export function validateNumberingPattern(pattern, documentKey) {
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
  // ตัวนับเลขรันใน DB รีเซ็ตตามรอบของเอกสารชนิดนั้น (DOCUMENT_NUMBER_CYCLES) — ถ้ารูปแบบ
  // ไม่มี token ของรอบ เลขจะวนซ้ำเมื่อขึ้นรอบใหม่แล้วไปชน UNIQUE ตอนบันทึกใบ
  //
  // ⚠️ **ไม่ส่ง documentKey มา = ข้ามด่านรายเดือน** (ตรวจแค่ปี) — ไม่ใช่ช่องโหว่:
  // ทางเขียนจริงมีทางเดียวคือ updateDocumentStandardDraft ซึ่งเรียกซ้ำอีกรอบด้วย
  // `documentKey` ที่อ่านจากแถวในฐาน (ไม่ใช่จาก body ที่ผู้ใช้ส่งมา) ⇒ ปลอมไม่ได้
  if (!tokens.some((token) => token === 'YY' || token === 'YYYY')) {
    return { ok: false, error: 'รูปแบบเลขที่ต้องมี {YY} หรือ {YYYY} — ตัวนับเลขรันรีเซ็ตทุกปี ถ้าไม่มีปีเลขจะซ้ำข้ามปี' };
  }
  if (documentKey && documentNumberCycle(documentKey) === 'month' && !tokens.includes('MM')) {
    return { ok: false, error: 'รูปแบบเลขที่ของเอกสารชนิดนี้ต้องมี {MM} — ตัวนับเลขรันรีเซ็ตทุกเดือน ถ้าไม่มีเดือนเลขจะซ้ำ' };
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
  /* ⚠️ ด่านนี้ **ไม่รู้ชนิดเอกสาร** (เราต์ส่งมาแค่ body) ⇒ รับสีที่เลือกได้ของอย่างน้อยหนึ่งชนิด
     ด่านจริงรายชนิดอยู่ที่ updateDocumentStandardDraft ซึ่งถาม `documentAccentKeysFor` ด้วยชนิดจากแถวในฐาน
     (แบบเดียวกับรอบตัดเลขรันของ validateNumberingPattern) · teal ไม่ผ่านด่านนี้แล้ว (ไม่มีชนิดไหนใช้ — มติ 08/10/2026):
     ร่างของ FM-TS-01 ที่คัดลอก teal มาจากแถวที่เผยแพร่ ฟอร์มส่งค่าที่ resolve แล้วมาแทน จึงบันทึกผ่าน */
  if (!SELECTABLE_ACCENT_KEYS.includes(value.accentKey)) {
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

/* ── ข้อความของหน้าตั้งค่าที่ต้อง "จริงรายชนิด / รายสถานะ" — อยู่ที่นี่ จอแค่วาด ─────────────────────────── */

// ช่องที่กระดาษของชนิด form-only อ่านจากมาตรฐาน (DOCUMENT_FORM_ONLY_KEYS) — ชื่อช่องตรงกับป้ายในฟอร์ม
const FORM_ONLY_FIELDS_TEXT = 'รหัสแบบฟอร์ม · Revision · วันที่มีผล';

/**
 * ข้อความของโหมดแก้ที่บอกว่า "แก้แล้วใบตัวอย่างขยับแค่ไหน" — หัวฟอร์ม (`formLead`) กับหัวการ์ดใบตัวอย่าง (`previewLead`)
 * 🐞 UAT PR-3 (D17): สองบรรทัดนี้เคยเป็นประโยคตายตัวของทุกชนิด ("ทุกช่องที่แก้จะเห็นผล…" · "ขยับตามที่พิมพ์อยู่ทันที")
 *    ขณะที่กล่องแจ้งของ FM-TS-01 ที่อยู่ถัดลงมาบอกว่าชื่อ/สี/รูปแบบเลขที่ "แก้ที่นี่ไม่เปลี่ยนกระดาษ" — จอเดียวพูดสองอย่าง
 *    และกล่องแจ้งคือตัวที่จริง (พิมพ์ชื่อใหม่ · รูปแบบเลขที่ใหม่ แล้วกระดาษไม่ขยับ) ⇒ ชนิด form-only ได้ประโยคที่เอ่ยเฉพาะช่องที่ขยับจริง
 */
export function documentStandardEditCopy(documentKey) {
  if (DOCUMENT_FORM_ONLY_KEYS.includes(documentKey)) {
    return {
      formLead: `ตัวอย่างเอกสารขยับตามเฉพาะ ${FORM_ONLY_FIELDS_TEXT} — กด “บันทึก” ที่แถบด้านบน`,
      previewLead: `ขยับตาม ${FORM_ONLY_FIELDS_TEXT} ที่พิมพ์อยู่ · เครื่องยนต์เดียวกับที่พิมพ์`,
    };
  }
  return {
    formLead: 'ทุกช่องที่แก้จะเห็นผลบนตัวอย่างเอกสารทันที — กด “บันทึก” ที่แถบด้านบน',
    previewLead: 'ขยับตามที่พิมพ์อยู่ทันที · เครื่องยนต์เดียวกับที่พิมพ์',
  };
}

/**
 * เหตุที่ปุ่ม "เผยแพร่" ยังกดไม่ได้ — `null` = กดได้
 * จอวาดปุ่มเสมอ (จาง · `aria-disabled`) แล้ววาดประโยคนี้เป็นบรรทัดใต้แถวปุ่ม — ไม่ฝากไว้ใน `title` ที่จอสัมผัสไม่มีทางเห็น
 * @param editing กำลังแก้ฟอร์มอยู่ (ค่าในฟอร์มยังไม่ใช่ค่าของร่างที่บันทึก)
 * @param draft   แถวร่างที่บันทึกไว้
 */
export function documentStandardPublishBlocker({ editing = false, draft = null } = {}) {
  if (editing) return 'บันทึกฉบับร่างก่อนจึงเผยแพร่ได้';
  if (!hasDocumentStandardChangeNote(draft)) return 'บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่';
  return null;
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

// ⚠️ ถามด้วย **ชนิดเอกสาร** เสมอ — สีที่คอลัมน์รับได้ไม่เท่ากันทุกชนิด
//    แถวที่ถือ teal (FM-SA-04 รุ่นเก่า · แถว seed ของ siteSurvey) ตกไปสีตั้งต้นของชนิดตัวเอง — ไม่มีชนิดไหนคืน teal
// ⚠️ ชนิดที่สีเดินตามผู้อ่าน (`documentAccentFollowsAudience`): ค่าที่คืนคือค่าที่ **ฟอร์มส่งกลับไปเก็บ** เท่านั้น
//    ไม่ใช่สีของกระดาษ (กระดาษมีสองสีตามฉบับ) — จอที่จะโชว์สีของชนิดนั้นให้ถาม `documentAudienceAccentMarks`
export function resolveDocumentAccentKey(version, documentKey) {
  const fallback = DEFAULT_ACCENT_BY_KEY[documentKey] || 'terracotta';
  const accentKey = String(version?.accentKey || '').trim();
  return documentAccentKeysFor(documentKey).includes(accentKey) ? accentKey : fallback;
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
  // ⚠️ **PDR ไม่ออกเลขของตัวเอง** — ช่อง "Document No." บนกระดาษเติมด้วยเลขที่คำร้อง
  // (SB-…) ที่ออกไปแล้วตอนกดส่ง · รูปแบบนี้มีไว้ให้ครบตามที่ทะเบียนมาตรฐานเอกสาร
  // บังคับเท่านั้น ไม่มีใครเรียกใช้ · ออกเลขซ้ำอีกชุดคือเลขที่สองที่ต้องคอยจับคู่กัน
  pdr: 'PDR-{YY}{MM}{RUNNING:4}-{REVISION}',
  /* ⚠️ **รายละเอียดผลิตภัณฑ์ (FM-SA-04) ไม่ออกเลขด้วยรูปแบบนี้** — เลขในฐานคือ `FM-SA-04-DDMMYY-XXX`
     (ปี พ.ศ. · ไม่มี Rev) ที่ออกจาก RPC `create_product_spec_document` (mig 0370) ตอน AC ออกเอกสารจากบรรทัด SO
     ตัดรอบรายเดือนเหมือน PDR · **เลขที่ที่พิมพ์/โชว์คือ `DDMMYY-XXX-RR`** (`formatSpecDocNo` — ตัดรหัสแบบฟอร์ม
     + Rev ของเอกสาร 2 หลัก · มติ 22/09) ⇒ ตัวอย่างเลขบนหน้าตั้งค่ามาตรฐานเอกสาร (ค.ศ. · Rev หลักเดียว ·
     มี FM นำหน้า) **ไม่ใช่เลขที่ออกจริง**
     รูปแบบนี้มีไว้ให้ครบตามที่ทะเบียนมาตรฐานเอกสารบังคับเท่านั้น ไม่มีใครเรียกใช้
     (เหตุผลเดียวกับ `pdr` ข้างบน — ออกเลขอีกชุดคือเลขที่สองที่ต้องคอยจับคู่กัน)
     ⚠️ ต้องตรงกับแถวที่ 0370 seed ลง `document_standard_versions` และผ่าน validateNumberingPattern
        (`{REVISION}` ปิดท้าย) — ค่าเดิมไม่มี `{REVISION}` จึงไม่ผ่านด่านของตัวเอง */
  productSpec: 'FM-SA-04-{DD}{MM}{YY}-{RUNNING:3}-{REVISION}',
  /* ⚠️ **รายงานการประเมินพื้นที่ (FM-TS-01) ไม่ออกเลขด้วยรูปแบบนี้** — เลข `SU-YYMMXXXX-R` ออกจาก RPC
     `issue_survey_report` (mig 0401 ④) ใต้ล็อกเดียวกับการเขียนแถว · รูปแบบนี้มีไว้ให้ครบตามที่ทะเบียนมาตรฐานเอกสาร
     บังคับเท่านั้น ไม่มีใครเรียกใช้ (เหตุผลเดียวกับ `pdr`) · ต้องตรงกับแถวที่ 0401 ⑦ seed และผ่าน validateNumberingPattern */
  siteSurvey: 'SU-{YY}{MM}{RUNNING:4}-{REVISION}',
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

// แตกรูปแบบเป็นชิ้นส่วนที่ "เติมเฉพาะเลขรัน" ได้ — ฟังก์ชัน SQL ที่ออกเลขพร้อมบันทึกแถว
// (mig 0242) รับสี่ค่านี้ไปประกอบ จึงไม่ต้องรู้จัก token เอง ⇒ ไฟล์นี้ยังเป็นที่เดียว
// ที่รู้ว่ารูปแบบเลขที่หน้าตาอย่างไร
//
// ประกอบกลับ: base = prefix + lpad(running, width) + tail · เลขเต็ม = base + separator + rev
// ต้องได้ผลเท่ากับ documentNumberParts(pattern, { date, running }) เสมอ (ล็อกไว้ใน test)
//
// ⚠️ รูปแบบที่ไม่มี {RUNNING:n} เลย (validator ไม่ควรปล่อยผ่าน แต่ published แก้ย้อนหลังไม่ได้)
// ถือความกว้าง 4 แล้วต่อเลขท้าย prefix — ดีกว่าออกเลขเดียวกันทุกใบจนชน unique
export function documentNumberSlots(pattern, { date = new Date() } = {}) {
  const text = String(pattern || '');
  const cut = text.indexOf(REVISION_TOKEN);
  const head = cut < 0 ? text : text.slice(0, cut);
  const run = /\{RUNNING:(\d+)\}/.exec(head);
  const width = run ? Number(run[1]) : 4;
  const prefix = formatDocumentNumber(run ? head.slice(0, run.index) : head, { date });
  const tail = run ? formatDocumentNumber(head.slice(run.index + run[0].length), { date }) : '';
  // ไม่มี {REVISION}: ทั้งก้อนคือเลขฐาน แล้วต่อ R ด้วย '-' (กติกาเดียวกับ documentNumberParts)
  if (cut < 0) return { prefix, width, tail, separator: '-' };
  // ตัวคั่นก่อน {REVISION} ไม่นับเป็นส่วนของเลขฐาน — ตัดจาก "ชิ้นที่อยู่ท้ายเลขรัน"
  // ⚠️ ต้องเป็น tail เสมอเมื่อมี {RUNNING:n} แม้ tail จะว่าง: ขีดที่อยู่ **หน้า** เลขรัน
  // (เช่น QT-{YY}{MM}-{RUNNING:4}{REVISION}) เป็นส่วนหนึ่งของเลขฐาน ตัดทิ้งไม่ได้
  if (run) {
    const sep = SEPARATOR_TAIL.exec(tail)?.[0] || '';
    return { prefix, width, tail: sep ? tail.slice(0, -sep.length) : tail, separator: sep };
  }
  // ไม่มี {RUNNING:n}: เลขไปต่อท้าย prefix ⇒ ตัวคั่นท้าย prefix คือตัวคั่นของ revision
  const sep = SEPARATOR_TAIL.exec(prefix)?.[0] || '';
  return { prefix: sep ? prefix.slice(0, -sep.length) : prefix, width, tail: '', separator: sep };
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
