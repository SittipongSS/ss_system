import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCENT_BY_AUDIENCE_DOCUMENT_KEYS,
  DEFAULT_NUMBERING_PATTERNS,
  DOCUMENT_ACCENT_KEYS,
  DOCUMENT_ACCENT_LABELS,
  DOCUMENT_AUDIENCE_ACCENT_LEAD,
  DOCUMENT_FORM_ONLY_KEYS,
  DOCUMENT_STANDARD_KEYS,
  DOCUMENT_STANDARD_LABELS,
  documentAccentFollowsAudience,
  documentAccentKeysFor,
  documentAudienceAccentMarks,
  documentPreviewAudience,
  documentStandardEditCopy,
  documentStandardPreviewHref,
  documentStandardPublishBlocker,
  documentNumberParts,
  documentNumberSlots,
  documentNumberWithRevision,
  documentStandardFormLine,
  formatDocumentNumber,
  revisionSeparatorOf,
  documentStandardToForm,
  formatDocumentStandardEffectiveDate,
  normalizeDocumentStandardInput,
  numberingPatternExample,
  resolveDocumentAccentKey,
  resolveDocumentForm,
  resolveDocumentTitleTh,
  validateNumberingPattern,
  documentNumberCycle,
} from './documentStandards.js';
import { DOCUMENT_FORMS } from './documentBrand.js';
import { DOCUMENT_AUDIENCES, documentAudienceAccentKey } from './documents/documentAudience.js';
import { DOCUMENT_ACCENT_THEMES } from './sales/quotationMasterDocument.js';

const valid = {
  titleTh: 'ใบเสนอราคา',
  titleEn: 'Quotation',
  formCode: 'fm-sa-01',
  revision: '00',
  effectiveDate: '2025-05-08',
  accentKey: 'terracotta',
  numberingPattern: 'qt-{yy}{mm}{running:4}-{revision}',
  changeNote: 'ปรับมาตรฐาน',
};

test('normalizes a controlled document standard and guarded numbering pattern', () => {
  const result = normalizeDocumentStandardInput(valid);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.formCode, 'FM-SA-01');
  assert.equal(result.value.titleEn, 'QUOTATION');
  assert.equal(result.value.numberingPattern, 'QT-{YY}{MM}{RUNNING:4}-{REVISION}');
});

test('rejects invalid form identity, date, accent and numbering tokens', () => {
  const result = normalizeDocumentStandardInput({
    ...valid,
    formCode: 'FM SA 01',
    revision: '#1',
    effectiveDate: '2025-02-31',
    accentKey: 'pink',
    numberingPattern: 'QT-{TEAM}-{YY}',
  });
  assert.match(result.errors.join(' | '), /รหัสแบบฟอร์ม/);
  assert.match(result.errors.join(' | '), /Revision/);
  assert.match(result.errors.join(' | '), /วันที่มีผล/);
  assert.match(result.errors.join(' | '), /Accent/);
  assert.match(result.errors.join(' | '), /TEAM/);
});

test('numbering patterns require an approved running token', () => {
  assert.equal(validateNumberingPattern('QT-{YY}{MM}').ok, false);
  assert.equal(validateNumberingPattern('QT-{YY}{MM}{RUNNING:4}-{REVISION}').ok, true);
});

test('numbering patterns must end with {REVISION} so the base number stays separable', () => {
  assert.match(validateNumberingPattern('QT-{YY}{MM}-{REVISION}-{RUNNING:4}').error, /ปิดท้ายด้วย/);
  assert.match(validateNumberingPattern('QT-{YY}{MM}{RUNNING:4}').error, /ปิดท้ายด้วย/);
});

test('numbering patterns must carry a year — every counter resets at least yearly', () => {
  assert.match(validateNumberingPattern('QT-{MM}{RUNNING:4}-{REVISION}').error, /ตัวนับเลขรันรีเซ็ตทุกปี/);
  assert.equal(validateNumberingPattern('QT-{YYYY}{MM}{RUNNING:5}.{REVISION}').ok, true);
});

/* mig 0328 — รอบตัดไม่เท่ากันทุกชนิด: ใบเสนอราคา/ใบสั่งขายตัดรายปี ⇒ {MM} เป็นของ
   ประดับให้คนอ่านรู้เดือนที่ออกใบ ไม่ใช่ตัวบังคับ · ใบแจ้งภาษี/ไทม์ไลน์ยังรายเดือน
   ⇒ ไม่มี {MM} เมื่อไร เลขวนซ้ำข้ามเดือนแล้วชน UNIQUE */
test('รอบตัดรายปี (QT/SO/ET/PT) ไม่บังคับ {MM} — รายเดือน (PDR) ยังบังคับ', () => {
  assert.equal(validateNumberingPattern('QT-{YY}{RUNNING:4}-{REVISION}', 'quotation').ok, true);
  assert.equal(validateNumberingPattern('SO-{YY}{RUNNING:4}-{REVISION}', 'salesOrder').ok, true);
  assert.equal(validateNumberingPattern('QT-{YY}{MM}{RUNNING:4}-{REVISION}', 'quotation').ok, true);
  // ET ย้ายมารายปีตามมติ 2026-09-01 (mig 0329) — "ET เอาแบบ QT"
  assert.equal(validateNumberingPattern('ET-{YY}{RUNNING:4}-{REVISION}', 'exciseTaxNotice').ok, true);
  // PT ย้ายมารายปีพร้อม DL/PJ (mig 0330) — สามอย่างนี้เกิดคู่กัน รอบตัดต้องตรงกัน
  assert.equal(validateNumberingPattern('PT-{YY}{RUNNING:4}-{REVISION}', 'projectTimeline').ok, true);
  assert.match(
    validateNumberingPattern('PDR-{YY}{RUNNING:4}-{REVISION}', 'pdr').error,
    /ต้องมี \{MM\}/,
  );
  // ไม่ส่งชนิดมา = ตรวจได้แค่กติกาที่จริงกับทุกชนิด (ปี) — ด่านจริงอยู่ที่
  // updateDocumentStandardDraft ซึ่งอ่าน documentKey จากแถวในฐาน
  assert.equal(validateNumberingPattern('PT-{YY}{RUNNING:4}-{REVISION}').ok, true);
  assert.equal(documentNumberCycle('quotation'), 'year');
  assert.equal(documentNumberCycle('exciseTaxNotice'), 'year');
  assert.equal(documentNumberCycle('projectTimeline'), 'year');
  assert.equal(documentNumberCycle('pdr'), 'month');
  // ชนิดที่ไม่รู้จัก = เข้มไว้ก่อน (รายเดือน)
  assert.equal(documentNumberCycle('somethingNew'), 'month');
});

test('builds stable preview and controlled form line', () => {
  assert.equal(numberingPatternExample('QT-{YY}{MM}{RUNNING:4}-{REVISION}', '2'), 'QT-26070001-2');
  assert.equal(formatDocumentStandardEffectiveDate('2025-05-08'), '08/05/2568');
  assert.equal(formatDocumentStandardEffectiveDate(''), '-');
  assert.equal(documentStandardFormLine({ formCode: 'FM-SA-01', revision: '00', effectiveDate: '2025-05-08' }), 'FM-SA-01: Rev. No.00. 08/05/2568');
});

// ── มาตรฐานที่เผยแพร่ → ค่าที่เอกสารใช้จริง ──────────────────────────────────

const publishedQuotation = {
  formCode: 'FM-SA-09',
  revision: '02',
  effectiveDate: '2026-01-15',
  titleTh: 'ใบเสนอราคา (ฉบับใหม่)',
  titleEn: 'QUOTATION',
  accentKey: 'terracotta',
};

test('มาตรฐานที่เผยแพร่ → รูป form ที่ตัวสร้างเอกสารกินได้', () => {
  assert.deepEqual(documentStandardToForm(publishedQuotation), {
    code: 'FM-SA-09',
    revision: '02',
    effectiveDate: '15/01/2569', // แปลงเป็น พ.ศ. แบบเดียวกับที่พิมพ์บนหัวเอกสาร
    title: 'QUOTATION',
  });
  assert.equal(documentStandardToForm(null), null);
  // ขาดช่องบังคับ = ใช้ไม่ได้ ต้องให้ resolver ตกไปใช้ค่าสำรอง
  assert.equal(documentStandardToForm({ formCode: 'FM-SA-09' }), null);
});

test('ไม่มีมาตรฐานเผยแพร่ → ตกไปใช้ค่าสำรองของเอกสารชนิดนั้น', () => {
  assert.deepEqual(resolveDocumentForm(null, 'quotation'), DOCUMENT_FORMS.quotation);
  assert.deepEqual(resolveDocumentForm(null, 'salesOrder'), DOCUMENT_FORMS.salesOrder);
  // ชนิดที่ไม่รู้จักต้องไม่ระเบิด
  assert.deepEqual(resolveDocumentForm(null, 'unknown'), DOCUMENT_FORMS.quotation);
});

test('มีมาตรฐานเผยแพร่ → ใช้ค่านั้น และเติมช่องที่ขาดจากค่าสำรอง', () => {
  assert.equal(resolveDocumentForm(publishedQuotation, 'quotation').code, 'FM-SA-09');
  const noTitle = resolveDocumentForm({ ...publishedQuotation, titleEn: '' }, 'quotation');
  assert.equal(noTitle.code, 'FM-SA-09');
  assert.equal(noTitle.title, DOCUMENT_FORMS.quotation.title);
});

test('accent: ใช้ค่าที่ตั้งไว้ ส่วนคีย์เก่าที่เลิกให้เลือกแล้วตกไปใช้สีของชนิดเอกสาร', () => {
  assert.equal(resolveDocumentAccentKey({ accentKey: 'steel' }, 'salesOrder'), 'steel');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'terracotta' }, 'quotation'), 'terracotta');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'amber' }, 'exciseTaxNotice'), 'amber');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'navy' }, 'projectTimeline'), 'navy');
  // ⭐ FM-SA-04 ใช้สีเดียวกับใบเสนอราคา (มติผู้ใช้ 2026-09-22) ⇒ teal ถูกถอดจากตัวเลือก
  //    มาตรฐานเก่า (v1–v3) ที่ถือ teal ต้องตกไป terracotta ของชนิดนี้ ไม่ใช่ค้างสีเดิม
  assert.equal(resolveDocumentAccentKey({ accentKey: 'teal' }, 'productSpec'), 'terracotta');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'terracotta' }, 'productSpec'), 'terracotta');
  assert.equal(resolveDocumentAccentKey(null, 'productSpec'), 'terracotta');
  // green ยังถูกถอดจากตัวเลือก — มาตรฐานเก่าที่ยังถือค่านี้ต้องไม่พาเอกสารไปสีที่ไม่มีใครตั้งใจ
  assert.equal(resolveDocumentAccentKey({ accentKey: 'green' }, 'quotation'), 'terracotta');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'ไม่มีสีนี้' }, 'salesOrder'), 'steel');
  assert.equal(resolveDocumentAccentKey(null, 'salesOrder'), 'steel');
  assert.equal(resolveDocumentAccentKey(null, 'quotation'), 'terracotta');
  assert.equal(resolveDocumentAccentKey(null, 'exciseTaxNotice'), 'amber');
  assert.equal(resolveDocumentAccentKey(null, 'projectTimeline'), 'navy');
});

test('เอกสารไทม์ไลน์โครงการเป็นเอกสารควบคุมเต็มรูปแบบเหมือนอีกสามใบ (mig 0198)', () => {
  assert.ok(DOCUMENT_STANDARD_KEYS.includes('projectTimeline'));
  // ทุกชนิดต้องมีค่าสำรองครบ ไม่งั้นโหลดมาตรฐานไม่ได้แล้วหัวใบจะพิมพ์ undefined
  for (const key of DOCUMENT_STANDARD_KEYS) {
    assert.ok(DEFAULT_NUMBERING_PATTERNS[key], `${key} ไม่มีรูปแบบเลขที่สำรอง`);
    const form = resolveDocumentForm(null, key);
    assert.ok(form.code && form.revision && form.effectiveDate, `${key} ค่าสำรองของฟอร์มไม่ครบ`);
  }
  assert.equal(resolveDocumentForm(null, 'projectTimeline').code, 'FM-PD-05');
  assert.equal(documentStandardFormLine({ formCode: 'FM-PD-05', revision: '00', effectiveDate: '2025-05-08' }),
    'FM-PD-05: Rev. No.00. 08/05/2568');
});

test('เอกสารที่เดิน Rev บนแถวเดิม: ต่อเลข Rev ปัจจุบันเข้ากับเลขฐานที่ออกไว้', () => {
  // ออกไว้ PT-26080001-0 แล้วโครงการเดินถึง Rev 2 → เอกสารต้องเป็น -2
  assert.equal(documentNumberWithRevision('PT-26080001', 'PT-26080001-0', 2), 'PT-26080001-2');
  assert.equal(documentNumberWithRevision('PT-26080001', 'PT-26080001-0', 0), 'PT-26080001-0');
  // ยังไม่ออก Rev (ฉบับร่าง/ไทม์ไลน์ของดีล) → นับเป็น 0 เหมือน entityCodeDisplay
  assert.equal(documentNumberWithRevision('PT-26080001', 'PT-26080001-0', null), 'PT-26080001-0');
  // ตัวคั่นมาจากใบตัวเอง ไม่ใช่รูปแบบปัจจุบัน
  assert.equal(documentNumberWithRevision('PT-26080001', 'PT-26080001.0', 3), 'PT-26080001.3');
  assert.equal(documentNumberWithRevision('PT-26080001', 'PT-260800010', 3), 'PT-260800013');
  // โครงการเก่าที่ยังไม่มีเลขที่เอกสาร → ไม่มีอะไรให้พิมพ์ (หัวใบตกไปใช้รหัสโครงการ)
  assert.equal(documentNumberWithRevision(null, null, 1), '');
  assert.equal(documentNumberWithRevision('', 'PT-26080001-0', 1), 'PT-26080001-0');
});

test('ทุกสีที่เลือกได้ต้องมีธีมจริงในเครื่องยนต์เอกสาร (กันเลือกแล้วไม่มีผล)', () => {
  for (const key of DOCUMENT_ACCENT_KEYS) {
    assert.ok(DOCUMENT_ACCENT_THEMES[key], `${key} ไม่มีธีมสีในเอกสาร`);
  }
  // ใบสั่งขายใช้ steel จริง — ต้องอยู่ในตัวเลือกเสมอ
  assert.ok(DOCUMENT_ACCENT_KEYS.includes('steel'));
});

test('ชื่อไทยบนหัวเอกสาร: มาตรฐานคุมได้ ไม่มีก็ใช้ป้ายมาตรฐานของชนิดนั้น', () => {
  assert.equal(resolveDocumentTitleTh(publishedQuotation, 'quotation'), 'ใบเสนอราคา (ฉบับใหม่)');
  assert.equal(resolveDocumentTitleTh(null, 'salesOrder'), 'ใบสั่งขาย');
  assert.equal(resolveDocumentTitleTh({ titleTh: '  ' }, 'quotation'), 'ใบเสนอราคา');
});

// ── รูปแบบเลขที่ → เลขเอกสารจริง ─────────────────────────────────────────────

const JULY_2026 = new Date('2026-07-20T12:00:00+07:00');

test('เลขที่ที่ประกอบจากรูปแบบตั้งต้น ต้องเท่ากับสตริงที่ระบบเคยต่อเองเป๊ะ ๆ', () => {
  // กันงานนี้เปลี่ยนเลขของใบที่ออกใหม่โดยไม่ตั้งใจ — รูปแบบตั้งต้น = พฤติกรรมเดิม
  assert.equal(
    formatDocumentNumber(DEFAULT_NUMBERING_PATTERNS.quotation, { date: JULY_2026, running: 1, revision: 0 }),
    'QT-26070001-0',
  );
  assert.equal(
    formatDocumentNumber(DEFAULT_NUMBERING_PATTERNS.salesOrder, { date: JULY_2026, running: 28, revision: 0 }),
    'SO-26070028-0',
  );
  assert.equal(
    formatDocumentNumber(DEFAULT_NUMBERING_PATTERNS.exciseTaxNotice, { date: JULY_2026, running: 9, revision: 0 }),
    'ET-26070009-0',
  );
});

test('แทน token ครบทุกตัว และเลขรัน pad อย่างเดียว ห้ามตัด', () => {
  assert.equal(
    formatDocumentNumber('{YYYY}{YY}{MM}{DD}-{RUNNING:5}.{REVISION}', { date: JULY_2026, running: 7, revision: 3 }),
    '2026260720-00007.3',
  );
  // เลขรันยาวเกินความกว้าง = เลขต้องยาวขึ้น ไม่ใช่ถูกตัดจนไปซ้ำกับใบอื่น
  assert.equal(formatDocumentNumber('X{RUNNING:3}', { running: 12345, date: JULY_2026 }), 'X12345');
  // token ที่ไม่รู้จักปล่อยไว้ ดีกว่าออกเลขไม่ได้
  assert.equal(formatDocumentNumber('X{TEAM}{RUNNING:3}', { running: 1, date: JULY_2026 }), 'X{TEAM}001');
});

test('เดือน/ปีของเลขที่ยึดเวลาไทย ไม่ใช่เวลาเครื่อง', () => {
  // 2026-07-31 19:00 UTC = 1 ส.ค. 02:00 ที่กรุงเทพ → ต้องเป็นเดือน 08
  assert.equal(
    formatDocumentNumber('{YY}{MM}{RUNNING:3}-{REVISION}', { date: new Date('2026-07-31T19:00:00Z'), running: 1 }),
    '2608001-0',
  );
});

test('แยกเลขฐานกับตัวคั่นจากรูปแบบ', () => {
  assert.deepEqual(
    documentNumberParts(DEFAULT_NUMBERING_PATTERNS.quotation, { date: JULY_2026, running: 28 }),
    { base: 'QT-26070028', separator: '-' },
  );
  assert.deepEqual(
    documentNumberParts('QT-{YY}{MM}{RUNNING:4}.{REVISION}', { date: JULY_2026, running: 2 }),
    { base: 'QT-26070002', separator: '.' },
  );
  // รูปแบบที่ติดเลขฉบับแก้ไขไว้เลย (ไม่มีตัวคั่น)
  assert.deepEqual(
    documentNumberParts('QT-{YY}{MM}{RUNNING:4}{REVISION}', { date: JULY_2026, running: 2 }),
    { base: 'QT-26070002', separator: '' },
  );
});

// ชิ้นส่วนที่ส่งให้ฟังก์ชัน SQL ไปเติมเลขเอง (mig 0240) — ถ้าประกอบกลับแล้วไม่ตรงกับ
// documentNumberParts เมื่อไร เลขบนใบจริงจะต่างจากที่ระบบคำนวณไว้ทุกที่อื่น
test('ชิ้นส่วนรูปแบบเลขที่: ประกอบกลับต้องได้ผลเท่า documentNumberParts', () => {
  const patterns = [
    DEFAULT_NUMBERING_PATTERNS.quotation,
    'QT-{YY}{MM}{RUNNING:4}.{REVISION}',
    'QT-{YY}{MM}{RUNNING:4}{REVISION}',
    'QT-{YY}{MM}{RUNNING:4}',                 // ไม่มี {REVISION}
    'SO/{YYYY}/{RUNNING:5}-{REVISION}',
    'X{DD}{MM}{RUNNING:3}A-{REVISION}',       // มีตัวอักษรคั่นหลังเลขรัน
    'QT-{YY}{MM}-{RUNNING:4}{REVISION}',      // 🐞 ขีดอยู่ "หน้า" เลขรัน = ส่วนหนึ่งของเลขฐาน
    'QT-{YY}{MM}-{RUNNING:4}-{REVISION}',     // ขีดทั้งหน้าและหลังเลขรัน
  ];
  for (const pattern of patterns) {
    const slots = documentNumberSlots(pattern, { date: JULY_2026 });
    for (const running of [1, 28, 9999]) {
      const parts = documentNumberParts(pattern, { date: JULY_2026, running });
      const base = slots.prefix + String(running).padStart(slots.width, '0') + slots.tail;
      assert.equal(base, parts.base, `base ไม่ตรง: ${pattern} @ ${running}`);
      assert.equal(slots.separator, parts.separator, `separator ไม่ตรง: ${pattern}`);
    }
  }
});

test('ชิ้นส่วนรูปแบบเลขที่: ความกว้างมาจาก {RUNNING:n} จริง', () => {
  assert.deepEqual(
    documentNumberSlots(DEFAULT_NUMBERING_PATTERNS.quotation, { date: JULY_2026 }),
    { prefix: 'QT-2607', width: 4, tail: '', separator: '-' },
  );
  assert.equal(documentNumberSlots('SO/{YYYY}/{RUNNING:5}-{REVISION}', { date: JULY_2026 }).width, 5);
  // ไม่มี {RUNNING:n} เลย = ถือ 4 หลักแล้วต่อท้าย prefix (ดีกว่าออกเลขซ้ำทุกใบ)
  assert.deepEqual(
    documentNumberSlots('QT-{YY}{MM}-{REVISION}', { date: JULY_2026 }),
    { prefix: 'QT-2607', width: 4, tail: '', separator: '-' },
  );
});

test('รูปแบบที่ไม่มี {REVISION} ต้องยังออกเลขได้ (มาตรฐานที่เผยแพร่ไว้ก่อนกฎใหม่แก้ย้อนหลังไม่ได้)', () => {
  assert.deepEqual(
    documentNumberParts('QT-{YY}{MM}{RUNNING:4}', { date: JULY_2026, running: 9 }),
    { base: 'QT-26070009', separator: '-' },
  );
  assert.deepEqual(documentNumberParts('', { date: JULY_2026, running: 1 }), { base: '', separator: '-' });
});

test('ฉบับแก้ไขต่อเลขด้วยตัวคั่นของใบต้นทางเอง ไม่ใช่ของรูปแบบปัจจุบัน', () => {
  assert.equal(revisionSeparatorOf('QT-26070028-0', 'QT-26070028'), '-');
  assert.equal(revisionSeparatorOf('QT-26070028.2', 'QT-26070028'), '.');
  assert.equal(revisionSeparatorOf('QT-260700280', 'QT-26070028'), '');
  // ใบเก่าที่เลขไม่เข้ารูป/ไม่มีเลขฐาน → ตกกลับตัวคั่นเดิมของระบบ
  assert.equal(revisionSeparatorOf('LEGACY-001', 'QT-26070028'), '-');
  assert.equal(revisionSeparatorOf('QT-26070028', ''), '-');
});

// ── คีย์ siteSurvey — รายงานการประเมินพื้นที่ FM-TS-01 (PR-3 ส่วน A + มติเจ้าของ 08/10/2026 ข้อ 5) ──────────
//
// ⭐ คีย์นี้ต่างจากชนิดอื่นสองเรื่อง — เทสต์ชุดนี้ล็อกทั้งคู่:
//   · กระดาษอ่านจากมาตรฐานแค่บรรทัดแบบฟอร์ม (DOCUMENT_FORM_ONLY_KEYS)
//   · **สีเดินตามผู้อ่านของฉบับ** (ACCENT_BY_AUDIENCE_DOCUMENT_KEYS): ฉบับลูกค้า = terracotta · ฉบับภายใน = steel (คีย์ตายตัว —
//     เท่ากับสีตั้งต้นของใบเสนอราคา/ใบสั่งขาย แต่ไม่ตามมาตรฐานที่เผยแพร่ของสองชนิดนั้น ⇒ จอเอ่ยชื่อสี ไม่เอ่ยชื่อเอกสาร)
//     ⇒ ไม่มีสีให้เลือก · teal (สีของกระดานเดิม และค่าที่แถว seed ยังถืออยู่) ไม่ขึ้นจอและไม่ผ่านด่านไหนอีก

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
// โค้ดล้วน ไม่นับคอมเมนต์ (JS และ JSX `{/* … */}`) — คอมเมนต์ของจออธิบายที่มาด้วยชื่อสี/ชื่อฉบับได้ โค้ดที่เรนเดอร์ห้ามมี
const stripJsComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w\\])\/\/[^\n]*/g, '$1');

/* จุดสีบนหน้าตั้งค่า (ตัวเลือกสี · AccentMark) หยิบคลาสจาก page.module.css ด้วย `styles[สี] || styles.terracotta`
   ⇒ คลาสของสีไหนหาย จุดขึ้น terracotta เงียบ ๆ ข้างป้ายของอีกสี ไม่มีอะไรพัง
   คืนค่าสีจริงของคลาส `.<สี>` (ไล่ `var(--document-accent-…)` ไปถึง globals.css) · ไม่มีกฎ = null */
function settingsSwatchColor(accent) {
  const css = read('../app/settings/document-standards/page.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = new RegExp(`\\.${accent}\\s*\\{[^}]*?--doc-accent\\s*:\\s*([^;}]+)`).exec(css);
  if (!rule) return null;
  const token = /^var\((--[\w-]+)\)$/.exec(rule[1].trim());
  if (!token) return rule[1].trim().toLowerCase();
  const defined = new RegExp(`${token[1]}\\s*:\\s*([^;}]+)`).exec(read('../app/globals.css'));
  return defined ? defined[1].trim().toLowerCase() : null;
}

test('siteSurvey ลงทะเบียนครบ: ป้าย · ค่าสำรองของฟอร์ม · รอบตัดเลขรัน · รูปแบบเลขที่', () => {
  assert.ok(DOCUMENT_STANDARD_KEYS.includes('siteSurvey'));
  assert.equal(DOCUMENT_STANDARD_LABELS.siteSurvey, 'รายงานการประเมินพื้นที่');
  // ทุกคีย์ต้องมีป้าย — แท็บ/หัวข้อ/toast ของหน้าตั้งค่าอ่านจากตารางนี้ ขาด = ขึ้น undefined
  for (const key of DOCUMENT_STANDARD_KEYS) assert.ok(DOCUMENT_STANDARD_LABELS[key], `${key} ไม่มีป้าย`);

  // ไม่มีค่าสำรอง = resolveDocumentForm ตกไป FM-SA-01 ของใบเสนอราคา แล้วกระดาษประเมินพิมพ์รหัสฟอร์มผิดใบ
  assert.equal(resolveDocumentForm(null, 'siteSurvey').code, 'FM-TS-01');
  assert.deepEqual(resolveDocumentForm(null, 'siteSurvey'), DOCUMENT_FORMS.siteSurvey);
  assert.deepEqual(
    resolveDocumentForm({ formCode: 'FM-TS-01', revision: '01', effectiveDate: '2026-12-01', titleEn: '' }, 'siteSurvey'),
    { code: 'FM-TS-01', revision: '01', effectiveDate: '01/12/2569', title: 'SITE SURVEY REPORT' },
  );

  // SU ตัดรอบรายปี (ตัวนับคีย์ด้วย YY · mig 0401) — ตกไป 'month' = หน้าตั้งค่าบอกว่าเลขรีเซ็ตทุกเดือน ซึ่งไม่จริง
  assert.equal(documentNumberCycle('siteSurvey'), 'year');
  const pattern = DEFAULT_NUMBERING_PATTERNS.siteSurvey;
  assert.equal(pattern, 'SU-{YY}{MM}{RUNNING:4}-{REVISION}');
  assert.deepEqual(validateNumberingPattern(pattern, 'siteSurvey'), { ok: true, value: pattern });
  // รายปี ⇒ {MM} ไม่บังคับ (เดือนในเลข SU เป็นแค่เดือนที่ออกฉบับแรก)
  assert.equal(validateNumberingPattern('SU-{YY}{RUNNING:4}-{REVISION}', 'siteSurvey').ok, true);
  assert.equal(numberingPatternExample(pattern, '0'), 'SU-26070001-0');
});

test('ค่าสำรองของ siteSurvey เท่ากับแถวที่ migration 0401 seed ไว้ (ต่างกัน = หน้าตั้งค่ากับกระดาษพูดคนละอย่าง)', () => {
  const sql = read('../../supabase/migrations/0401_survey_report_documents.sql');
  const seed = sql.slice(sql.indexOf("'document-standard-siteSurvey-v1'"));
  const row = /'([^']+)', '([^']+)',\s+'(FM-[A-Z0-9-]+)', '(\d+)', DATE '(\d{4}-\d{2}-\d{2})', '([a-z]+)',\s+'([^']+)'/.exec(seed);
  assert.ok(row, 'อ่านแถว seed ของ siteSurvey ไม่ออก');
  const [, titleTh, titleEn, formCode, revision, effectiveDate, accentKey, numberingPattern] = row;
  assert.equal(titleTh, DOCUMENT_STANDARD_LABELS.siteSurvey);
  assert.deepEqual(
    { code: formCode, revision, effectiveDate: formatDocumentStandardEffectiveDate(effectiveDate), title: titleEn },
    { ...DOCUMENT_FORMS.siteSurvey },
  );
  assert.equal(numberingPattern, DEFAULT_NUMBERING_PATTERNS.siteSurvey);
  /* ⭐ สีของแถว seed คือ teal (สีของกระดานเดิม) — migration แก้ไม่ได้ และแถวที่เผยแพร่แล้วก็แก้ไม่ได้
     มติ 08/10/2026 เลิกใช้ teal: ค่านี้ต้อง **ไม่ขึ้นจอและไม่ถูกส่งกลับ** — resolver พาไปค่าเดียวที่คอลัมน์ของชนิดนี้รับ
     ⇒ ร่างที่คัดลอกจากแถวนี้เปิดฟอร์มแล้วบันทึกผ่านได้ โดยไม่มีปุ่มสีให้เลือกและไม่มีใครเห็น teal */
  assert.equal(accentKey, 'teal');
  const resolved = resolveDocumentAccentKey({ accentKey }, 'siteSurvey');
  assert.notEqual(resolved, 'teal');
  assert.deepEqual(documentAccentKeysFor('siteSurvey'), [resolved]);
  // ค่าที่ฟอร์มส่ง (ช่องของแถว seed + สีที่ resolve แล้ว) ผ่านด่านรูปร่างของ body · ค่าดิบของแถวไม่ผ่าน
  const seedForm = { titleTh, titleEn, formCode, revision, effectiveDate, numberingPattern, changeNote: 'ขึ้น Rev. ใหม่' };
  assert.deepEqual(normalizeDocumentStandardInput({ ...seedForm, accentKey: resolved }).errors, []);
  assert.match(normalizeDocumentStandardInput({ ...seedForm, accentKey }).errors.join(' | '), /Accent/);
});

test('สีรายชนิด: siteSurvey ไม่มีให้เลือก (คอลัมน์รับค่าเดียว) · ชนิดอื่นยังเป็นสี่สีเดิม · ไม่มีชนิดไหนได้ teal', () => {
  assert.deepEqual(DOCUMENT_FORM_ONLY_KEYS, ['siteSurvey']);
  assert.deepEqual(documentAccentKeysFor('siteSurvey'), [documentAudienceAccentKey('external')]);
  // ลิสต์กลางต้องยังเป็นสี่สี — เติม teal ที่นั่น = FM-SA-04 รุ่นเก่าที่ถือ teal กลับไปพิมพ์ teal เงียบ ๆ
  assert.deepEqual(DOCUMENT_ACCENT_KEYS, ['terracotta', 'steel', 'amber', 'navy']);
  for (const key of DOCUMENT_STANDARD_KEYS) {
    const options = documentAccentKeysFor(key);
    assert.ok(options.length >= 1, `${key} ไม่มีสีที่คอลัมน์รับได้`);
    assert.ok(!options.includes('teal'), `${key}: teal เลิกใช้แล้ว (มติ 08/10/2026)`);
    const single = DOCUMENT_FORM_ONLY_KEYS.includes(key) || documentAccentFollowsAudience(key);
    if (single) assert.equal(options.length, 1, key);
    else assert.deepEqual(options, DOCUMENT_ACCENT_KEYS, key);
    for (const accent of options) {
      assert.ok(DOCUMENT_ACCENT_LABELS[accent], `${key}: สี ${accent} ไม่มีป้าย`);
      assert.ok(DOCUMENT_ACCENT_THEMES[accent], `${key}: สี ${accent} ไม่มีธีมในเครื่องยนต์เอกสาร`);
      // จุดสีของหน้าตั้งค่าต้องเป็นเฉดเดียวกับที่เครื่องยนต์พิมพ์ — คลาสหาย = จุดขึ้น terracotta เงียบ ๆ ข้างป้ายของอีกสี
      assert.equal(
        settingsSwatchColor(accent), DOCUMENT_ACCENT_THEMES[accent].accent,
        `${key}: จุดสี ${accent} ของหน้าตั้งค่า (คลาส .${accent} ใน page.module.css) หายหรือคนละเฉดกับกระดาษ`,
      );
    }
    // สีตั้งต้นของชนิด (ที่ resolver ตกไปใช้) ต้องเป็นสีที่คอลัมน์ของชนิดนั้นรับได้เอง
    assert.ok(options.includes(resolveDocumentAccentKey(null, key)), `${key}: สีตั้งต้นไม่อยู่ในชุดที่รับได้`);
  }
  // teal ไม่มีป้ายแล้ว — ไม่มีจอไหนเขียนคำว่า Teal ข้างเอกสารชนิดใดได้อีก
  assert.equal(DOCUMENT_ACCENT_LABELS.teal, undefined);
  assert.deepEqual(Object.keys(DOCUMENT_ACCENT_LABELS), [...DOCUMENT_ACCENT_KEYS]);
  // ตัวอ่านคลาสจับ "ไม่มีกฎ" ได้จริง (สีที่ไม่มีคลาส = null ไม่ใช่ค่าของคลาสอื่น) · และจอยังหยิบคลาสด้วยชื่อสี
  assert.equal(settingsSwatchColor('pink'), null);
  const page = read('../app/settings/document-standards/page.js');
  assert.ok(page.includes('${styles.swatch} ${styles[accentKey] || styles.terracotta}'), 'AccentMark');
  assert.ok(page.includes('${styles.accentOption} ${styles[key] || styles.terracotta}'), 'ตัวเลือกสี');
  assert.ok(page.includes('${styles.swatch} ${styles[mark.accentKey] || styles.terracotta}'), 'จุดสีตามผู้อ่าน');
  // ชนิดที่ไม่รู้จัก = ชุดกลาง (ไม่ระเบิด)
  assert.deepEqual(documentAccentKeysFor('somethingNew'), DOCUMENT_ACCENT_KEYS);
  assert.deepEqual(documentAccentKeysFor(undefined), DOCUMENT_ACCENT_KEYS);
});

/* ⭐ มติเจ้าของ 08/10/2026 ข้อ 5 — สีเดินตามผู้อ่าน: กระดาษที่ออกนอกบริษัท = terracotta (สีของใบเสนอราคา) · กระดาษภายใน = steel (สีของใบสั่งขาย)
   รอบนี้ใช้กับ FM-TS-01 ชนิดเดียว (ชนิดอื่นยังเลือกสีจากมาตรฐาน) · หน้าตั้งค่าวาดจุดสองสีจากผลของฟังก์ชันนี้ */
test('⭐ สีเดินตามผู้อ่าน: siteSurvey ได้จุดสองสี (ฉบับลูกค้า = Terracotta · ฉบับภายใน = Steel) · ชนิดอื่นได้ null', () => {
  assert.deepEqual(ACCENT_BY_AUDIENCE_DOCUMENT_KEYS, ['siteSurvey']);
  for (const key of DOCUMENT_STANDARD_KEYS) {
    assert.equal(documentAccentFollowsAudience(key), key === 'siteSurvey', key);
    if (key !== 'siteSurvey') assert.equal(documentAudienceAccentMarks(key), null, key);
  }
  for (const odd of [undefined, null, '', 'somethingNew']) {
    assert.equal(documentAccentFollowsAudience(odd), false);
    assert.equal(documentAudienceAccentMarks(odd), null);
  }

  const marks = documentAudienceAccentMarks('siteSurvey');
  assert.deepEqual(marks, [
    { audience: 'external', accentKey: 'terracotta', copy: 'ฉบับลูกค้า', text: 'ฉบับลูกค้าใช้สี Terracotta' },
    { audience: 'internal', accentKey: 'steel', copy: 'ฉบับภายใน', text: 'ฉบับภายในใช้สี Steel' },
  ]);
  assert.equal(DOCUMENT_AUDIENCE_ACCENT_LEAD, 'สีเดินตามผู้อ่าน');
  // ครบทุกผู้อ่าน เรียงตามลิสต์กลาง · สีของจุด = ตัวกลางของกติกา = สีตั้งต้นของใบเสนอราคา/ใบสั่งขาย (ที่มาของค่า — มติเจ้าของ)
  assert.deepEqual(marks.map((mark) => mark.audience), [...DOCUMENT_AUDIENCES]);
  const source = { external: 'quotation', internal: 'salesOrder' };
  for (const mark of marks) {
    assert.equal(mark.accentKey, documentAudienceAccentKey(mark.audience), mark.audience);
    assert.equal(mark.accentKey, resolveDocumentAccentKey(null, source[mark.audience]), mark.audience);
    assert.ok(mark.text.startsWith(mark.copy), mark.text);
    // ประโยคเอ่ยชื่อสีของจุดตัวเดียวกัน (ท่อนหน้าของป้ายสี) — ประโยคกับจุดสีพูดอย่างเดียวกันเสมอ
    const name = DOCUMENT_ACCENT_LABELS[mark.accentKey].split(' · ')[0];
    assert.match(name, /^[A-Z][a-z]+$/, name);
    assert.ok(mark.text.endsWith(`ใช้สี ${name}`), mark.text);
    // จุดสีบนหน้าตั้งค่าเป็นเฉดเดียวกับที่กระดาษของฉบับนั้นพิมพ์
    assert.equal(settingsSwatchColor(mark.accentKey), DOCUMENT_ACCENT_THEMES[mark.accentKey].accent, mark.audience);
    assert.notEqual(mark.accentKey, 'teal');
  }
  assert.deepEqual(marks.map((mark) => DOCUMENT_ACCENT_THEMES[mark.accentKey].accent), ['#ad5d43', '#1e6091']);
  // ค่าที่ฟอร์มของชนิดนี้ส่งกลับไปเก็บ = สีของฉบับลูกค้า (ฉบับที่เป็นหน้าตาของเอกสาร)
  assert.equal(resolveDocumentAccentKey(null, 'siteSurvey'), marks[0].accentKey);
});

/* 🔴 บรรทัด "สีเดินตามผู้อ่าน" ต้องจริงเสมอ — ไม่อ้างเอกสารที่สียังแก้ได้
   เดิมเขียนว่า "ฉบับลูกค้าใช้สีเดียวกับใบเสนอราคา" ทั้งที่สีของฉบับลูกค้าเป็นคีย์ตายตัว และใบเสนอราคา/ใบสั่งขาย **ยังเลือกได้สี่สี**:
   หัวหน้าเผยแพร่ใบเสนอราคาเป็น Navy ⇒ ใบเสนอราคาพิมพ์ navy (`quotePrint.js` อ่านค่าที่เผยแพร่) แต่ FM-TS-01 ฉบับลูกค้ายัง terracotta
   และแท็บของมันยังโชว์จุด terracotta ข้างประโยค "…สีเดียวกับใบเสนอราคา" ⇒ ประโยคเอ่ยชื่อสีแทน */
test('🔴 บรรทัดสีตามผู้อ่านเอ่ยชื่อสี ไม่อ้างใบเสนอราคา/ใบสั่งขาย — สองชนิดนั้นเปลี่ยนสีได้โดยที่ FM-TS-01 ไม่ตาม', () => {
  const marks = documentAudienceAccentMarks('siteSurvey');
  const source = { external: 'quotation', internal: 'salesOrder' };
  for (const mark of marks) {
    const sourceKey = source[mark.audience];
    // ข้อเท็จจริงที่ทำให้ประโยคเดิมผิดได้: ชนิดต้นสียังมีตัวเลือกสีอื่น และ resolver คืนสีที่เผยแพร่ตามนั้น
    const changed = documentAccentKeysFor(sourceKey).find((accent) => accent !== mark.accentKey);
    assert.ok(changed, `${sourceKey}: ไม่มีสีอื่นให้เลือกแล้ว — ถ้าล็อกสีของชนิดนี้แล้ว ทบทวนเทสต์นี้กับข้อความของบรรทัด`);
    assert.equal(resolveDocumentAccentKey({ accentKey: changed }, sourceKey), changed);
    // … ขณะที่สีของฉบับไม่ขึ้นกับมาตรฐานของชนิดต้นสี (ฟังก์ชันไม่รับมาตรฐานเลย)
    assert.equal(documentAudienceAccentMarks('siteSurvey').find((m) => m.audience === mark.audience).accentKey, mark.accentKey);
    // ⇒ ประโยคต้องไม่เอ่ยชื่อเอกสารชนิดไหน (รวมชนิดของตัวเอง) และไม่มีคำว่า "สีเดียวกับ"
    for (const [key, label] of Object.entries(DOCUMENT_STANDARD_LABELS)) {
      assert.equal(mark.text.includes(label), false, `"${mark.text}" อ้างเอกสาร ${key}`);
    }
    assert.doesNotMatch(mark.text, /สีเดียวกับ|เหมือน/);
  }
  assert.equal(documentAudienceAccentMarks.length, 1, 'รับแค่ชนิดเอกสาร — ไม่มีช่องให้ส่งมาตรฐานของชนิดอื่นเข้ามา');
});

/* 🔴 "เปิดเต็มจอ" ต้องพาฉบับที่กำลังดูไปด้วย — เดิมลิงก์มีแค่ `?doc=siteSurvey`: เลือกฉบับภายใน (steel · 6 หน้า) แล้วเปิดเต็มจอ
   ได้ฉบับลูกค้า (terracotta · 4 หน้า) ไม่มีตัวสลับ และ "พิมพ์ / Save PDF" พิมพ์ได้แต่ใบตัวอย่างของฉบับลูกค้า */
test('🔴 ใบตัวอย่างสองฉบับ: ลิงก์หน้าเต็มจอพกฉบับที่กำลังดู · ค่าจาก URL รับเฉพาะที่อยู่ในลิสต์ผู้อ่าน', () => {
  const base = '/settings/document-standards/preview?doc=';
  assert.equal(documentStandardPreviewHref('siteSurvey', 'internal'), `${base}siteSurvey&audience=internal`);
  assert.equal(documentStandardPreviewHref('siteSurvey', 'external'), `${base}siteSurvey&audience=external`);
  // ค่าแปลก/ไม่ส่ง = ฉบับที่ออกนอกบริษัท — ลิงก์บอกตรง ๆ ว่าจะได้ฉบับไหน ไม่ปล่อยให้หน้าเต็มจอเดา
  for (const odd of [undefined, null, '', 'customer', 'INTERNAL', 'internal ', '__proto__', 0, {}]) {
    assert.equal(documentStandardPreviewHref('siteSurvey', odd), `${base}siteSurvey&audience=external`, String(odd));
    assert.equal(documentPreviewAudience('siteSurvey', odd), 'external', String(odd));
  }
  for (const audience of DOCUMENT_AUDIENCES) assert.equal(documentPreviewAudience('siteSurvey', audience), audience);
  // ชนิดที่มีใบตัวอย่างใบเดียว: ไม่มีฉบับให้เลือก ⇒ ลิงก์เดิมทุกตัวอักษร (ไม่มีพารามิเตอร์ที่หน้าเต็มจอไม่อ่าน)
  for (const key of DOCUMENT_STANDARD_KEYS.filter((k) => !documentAccentFollowsAudience(k))) {
    for (const audience of [...DOCUMENT_AUDIENCES, undefined]) {
      assert.equal(documentPreviewAudience(key, audience), null, key);
      assert.equal(documentStandardPreviewHref(key, audience), `${base}${key}`, key);
    }
  }
  // ตัวเลือกของตัวสลับ (จุดสีตามผู้อ่าน) กับค่าที่ลิงก์รับ เป็นชุดเดียวกัน
  assert.deepEqual(
    documentAudienceAccentMarks('siteSurvey').map((mark) => documentPreviewAudience('siteSurvey', mark.audience)),
    [...DOCUMENT_AUDIENCES],
  );

  // จอ: ปุ่ม "เปิดเต็มจอ" ประกอบลิงก์จากตัวนี้ด้วยฉบับที่กำลังดู — ไม่เขียน URL เองในจอ
  const page = read('../app/settings/document-standards/page.js');
  assert.match(page, /<Link className="btn ghost sm" href=\{documentStandardPreviewHref\(selectedKey, previewAudience\)\}>/);
  assert.doesNotMatch(stripJsComments(page), /document-standards\/preview/);
});

test('accent ของ siteSurvey: แถวจะถือสีอะไรก็ resolve เป็นค่าเดียว ไม่ใช่ teal · teal กับชนิดอื่นยังตกไปสีของชนิดนั้น', () => {
  const stored = documentAudienceAccentKey('external');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'teal' }, 'siteSurvey'), stored);
  assert.equal(resolveDocumentAccentKey(null, 'siteSurvey'), stored);
  // สีที่ชนิดอื่นเลือกได้ ไม่ได้แปลว่าชนิดนี้เลือกได้ — สีของ FM-TS-01 ไม่ได้มาจากมาตรฐาน จอต้องไม่บอกอย่างอื่น
  for (const accent of ['navy', 'terracotta', 'steel', 'amber', 'green', 'teal', 'ไม่มีสีนี้']) {
    assert.equal(resolveDocumentAccentKey({ accentKey: accent }, 'siteSurvey'), stored, accent);
  }
  // ⭐ FM-SA-04 รุ่นเก่าที่ถือ teal ต้องยังอ่านเป็น terracotta (ผลรีวิว A10) — และไม่มีชนิดไหน resolve ออกมาเป็น teal
  assert.equal(resolveDocumentAccentKey({ accentKey: 'teal' }, 'productSpec'), 'terracotta');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'teal' }, 'quotation'), 'terracotta');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'teal' }, 'salesOrder'), 'steel');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'teal' }, 'pdr'), 'terracotta');
  for (const key of [...DOCUMENT_STANDARD_KEYS, 'somethingNew']) {
    for (const accent of [...Object.keys(DOCUMENT_ACCENT_THEMES), null]) {
      assert.notEqual(resolveDocumentAccentKey(accent ? { accentKey: accent } : null, key), 'teal', `${key} ← ${accent}`);
    }
  }
});

test('ด่านรูปร่างของ body รับสีที่เลือกได้ของอย่างน้อยหนึ่งชนิด (ไม่รู้ชนิด — ด่านรายชนิดอยู่ที่ updateDocumentStandardDraft)', () => {
  // ฟอร์มของ FM-TS-01 ส่งค่าที่ resolve แล้ว (ไม่ใช่ teal ของแถว seed) — ต้องผ่าน
  const surveyBody = {
    ...valid, titleTh: 'รายงานการประเมินพื้นที่', titleEn: 'Site Survey Report', formCode: 'fm-ts-01',
    effectiveDate: '2026-09-29', accentKey: resolveDocumentAccentKey({ accentKey: 'teal' }, 'siteSurvey'),
    numberingPattern: DEFAULT_NUMBERING_PATTERNS.siteSurvey,
  };
  const ok = normalizeDocumentStandardInput(surveyBody);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.accentKey, documentAudienceAccentKey('external'));
  assert.equal(ok.value.formCode, 'FM-TS-01');
  for (const accent of DOCUMENT_ACCENT_KEYS) {
    assert.deepEqual(normalizeDocumentStandardInput({ ...valid, accentKey: accent }).errors, [], accent);
  }
  // สีที่ไม่มีชนิดไหนใช้ยังถูกตีกลับ — teal/green มีธีมในเครื่องยนต์แต่ไม่มีเอกสารชนิดไหนใช้ (teal เลิก 08/10/2026)
  for (const accent of ['teal', 'green', 'pink', '', undefined, null]) {
    const bad = normalizeDocumentStandardInput({ ...valid, accentKey: accent });
    assert.match(bad.errors.join(' | '), /Accent/, JSON.stringify(accent));
  }
  assert.match(normalizeDocumentStandardInput({ ...surveyBody, accentKey: 'teal' }).errors.join(' | '), /Accent/);
});

// ── หน้าตั้งค่า: เดินสายถึงจอจริงไหม (อ่านซอร์ส — จอไม่มีเทสต์เรนเดอร์) ────────────────────────
test('หน้ามาตรฐานเอกสาร: ตัวเลือกสีถาม documentAccentKeysFor · ทุกจุดที่โชว์สี resolve ด้วยชนิดเอกสารก่อน', () => {
  const page = read('../app/settings/document-standards/page.js');
  // ตัวเลือกสีไล่ตามชนิดเอกสารที่กำลังแก้ ไม่ใช่ลิสต์กลาง — และยังเป็นกลุ่มปุ่ม ไม่ใช่ dropdown
  assert.match(page, /documentAccentKeysFor\(documentKey\)\.map\(/);
  assert.doesNotMatch(page, /DOCUMENT_ACCENT_KEYS/);
  const picker = page.slice(page.indexOf('className={styles.accentPicker}'), page.indexOf('<h4>รูปแบบเลขที่เอกสาร</h4>'));
  assert.match(picker, /role="group"/);
  assert.match(picker, /<button[\s\S]*aria-pressed=\{form\.accentKey === key\}/);
  assert.doesNotMatch(picker, /<select/);

  /* ⭐ ผลรีวิว A10 + มติ 08/10/2026: ไม่มีจอไหนหยิบ `accentKey` ดิบของแถวไปวาด — แถวเก่าของ FM-SA-04 และแถวที่เผยแพร่ของ
     FM-TS-01 ถือ teal อยู่ในฐาน ⇒ `AccentMark` ถูกเรียกที่เดียวคือใน `StandardAccent` ด้วยสีที่ resolve แล้ว
     และสามจอ (หัวรายละเอียด · ตารางประวัติ · ลิ้นชัก) เรียก `StandardAccent` ด้วยแถว + ชนิดเอกสาร */
  const marks = [...page.matchAll(/<AccentMark accentKey=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.deepEqual(marks, ['resolveDocumentAccentKey(row, documentKey)']);
  const standardAccent = page.slice(page.indexOf('function StandardAccent('), page.indexOf('function PreviewAudienceSwitch('));
  assert.ok(standardAccent.includes('<AccentMark accentKey={resolveDocumentAccentKey(row, documentKey)}'));
  // ชนิดที่สีเดินตามผู้อ่านถูกถามก่อนเสมอ — ถึง `AccentMark` ไม่ได้ (จุดเดียวของมาตรฐานไม่มีความหมายกับชนิดนั้น)
  const audienceFirst = standardAccent.indexOf('const marks = documentAudienceAccentMarks(documentKey);');
  const audienceReturn = standardAccent.indexOf('if (marks) return <AudienceAccentMarks marks={marks}');
  assert.ok(audienceFirst > 0 && audienceReturn > audienceFirst && audienceReturn < standardAccent.indexOf('<AccentMark '));
  const uses = [...page.matchAll(/<StandardAccent row=\{([^}]*)\} documentKey=\{([^}]*)\}/g)].map((m) => `${m[1]} | ${m[2]}`);
  assert.deepEqual(uses, [
    'shown | selectedKey',
    'row | row.documentKey || selectedKey',
    'row | row.documentKey || selectedKey',
    'viewRow | viewRow.documentKey || selectedKey',
  ], 'หัวรายละเอียด · ตารางประวัติ · การ์ดประวัติ (จอแคบ) · ลิ้นชัก');
  /* 🐞 UAT PR-3 (D15 · 360px): ที่จอ ≤768 ประวัติเป็นการ์ด (ตารางถูกซ่อน) และการ์ดไม่วาดสีเลย — FM-TS-01 ไม่มีจุดสองสี
     เวอร์ชันเก่าของ FM-SA-04 ไม่บอกว่าอ่านเป็น Terracotta ต้องเปิดลิ้นชักถึงจะรู้ ⇒ การ์ดเรียกตัวเดียวกับตาราง (resolve ด้วยชนิดก่อน) */
  const cards = page.slice(page.indexOf('<div className={styles.historyCards}>'), page.indexOf('<RecordDrawer'));
  assert.match(cards, /<article key=\{row\.id\} className=\{styles\.historyCard\}>[\s\S]*<StandardAccent row=\{row\} documentKey=\{row\.documentKey \|\| selectedKey\} \/>[\s\S]*<\/article>/);
  const table = page.slice(page.indexOf('<table className={`premium-table ${styles.historyTable}`}>'), page.indexOf('</table>'));
  assert.match(table, /<StandardAccent row=\{row\} documentKey=\{row\.documentKey \|\| selectedKey\} label=\{false\} \/>/);
  const drawer = page.slice(page.indexOf('<RecordDrawer'), page.indexOf('</RecordDrawer>'));
  assert.match(drawer, /<StandardAccent row=\{viewRow\} documentKey=\{viewRow\.documentKey \|\| selectedKey\} \/>/);
  // ไม่มีที่ไหนอ่าน `.accentKey` ของแถวมาวาดตรง ๆ — เหลือแค่ค่าของฟอร์ม (ตัวเลือกสี) กับของจุดสีที่คำนวณแล้ว
  const rawReads = [...page.matchAll(/(\w+)\??\.accentKey\b/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rawReads)].sort(), ['form', 'mark']);
  // ฟอร์มแก้ก็ resolve ด้วยชนิดของแถว — ร่างที่ถือสีที่คอลัมน์ไม่รับ (teal) ต้องเปิดมาแล้วบันทึกผ่าน
  assert.match(page, /form\.accentKey = resolveDocumentAccentKey\(row, row\?\.documentKey\)/);
});

/* มติเจ้าของ 08/10/2026 ข้อ 5 บนจอ: FM-TS-01 ไม่มีตัวเลือกสี — บรรทัดอ่านอย่างเดียวบอกว่าสีเดินตามผู้อ่าน พร้อมจุดสีของสองฉบับ
   และไม่มีจุดไหนของหน้านี้เขียนชื่อสี teal หรือหยิบคลาส .teal */
test('หน้ามาตรฐานเอกสาร: ชนิดที่สีเดินตามผู้อ่านไม่มีตัวเลือกสี — บรรทัดอ่านอย่างเดียว + จุดสองสี · ไม่มี teal บนจอ', () => {
  const page = read('../app/settings/document-standards/page.js');
  const fields = page.slice(page.indexOf('function DocumentStandardFields('), page.indexOf('export default function'));
  const section = fields.slice(fields.indexOf('<h4>สี Accent ของเอกสาร</h4>'), fields.indexOf('<h4>รูปแบบเลขที่เอกสาร</h4>'));
  // กิ่งเดียวตัดสิน: มีจุดสีตามผู้อ่าน = บรรทัดอ่านอย่างเดียว · ไม่มี = ตัวเลือกสีเดิม (กลุ่มปุ่ม)
  assert.match(fields, /const audienceMarks = documentAudienceAccentMarks\(documentKey\);/);
  const branch = section.indexOf('{audienceMarks ? (');
  const readOnly = section.indexOf('<p className={styles.audienceAccent}>');
  const otherwise = section.indexOf(') : (');
  const picker = section.indexOf('className={styles.accentPicker}');
  assert.ok(branch > 0 && readOnly > branch && otherwise > readOnly && picker > otherwise, 'ลำดับ: อ่านอย่างเดียว | ตัวเลือกสี');
  const line = section.slice(readOnly, otherwise);
  assert.match(line, /\{DOCUMENT_AUDIENCE_ACCENT_LEAD\}/);
  assert.match(line, /<AudienceAccentMarks marks=\{audienceMarks\} label="text" \/>/);
  // บรรทัดอ่านอย่างเดียวจริง: ไม่มีปุ่ม ไม่มีช่องกรอก ไม่มีตัวจับคลิก
  assert.doesNotMatch(line, /<button|<input|<select|onClick|onChange|aria-pressed/);
  // ตัวเลือกสีอยู่ในกิ่ง "ไม่ใช่" เท่านั้น — ชนิดที่สีเดินตามผู้อ่านไม่มีทางได้ปุ่มสี
  assert.equal(section.split('className={styles.accentPicker}').length - 1, 1);

  // จุดสีตามผู้อ่าน: วาดจาก `marks` ทุกตัวตามลำดับ · ข้อความมาจาก lib (ชื่อฉบับ | ประโยคเต็ม) ไม่เขียนซ้ำในจอ
  const audience = page.slice(page.indexOf('function AudienceAccentMarks('), page.indexOf('function StandardAccent('));
  assert.match(audience, /marks\.map\(\(mark\) => \(/);
  assert.match(audience, /label === "text" \? mark\.text : mark\.copy/);
  assert.match(audience, /aria-label=\{label \? undefined : summary\}/);
  for (const text of ['ฉบับลูกค้า', 'ฉบับภายใน', 'ใบเสนอราคา', 'ใบสั่งขาย', 'สีเดินตามผู้อ่าน']) {
    assert.equal(stripJsComments(page).includes(text), false, `"${text}" ต้องมาจาก lib/documentStandards ไม่ใช่เขียนในจอ`);
  }

  // 🔴 ไม่มี teal บนจอ: โค้ดของหน้า (ไม่นับคอมเมนต์) ไม่เอ่ยชื่อสีนี้ · ไม่มีป้าย · resolver ไม่คืน · จุดสีตามผู้อ่านไม่ใช้
  assert.doesNotMatch(stripJsComments(page), /teal/i);
  assert.equal(DOCUMENT_ACCENT_LABELS.teal, undefined);
  const css = read('../app/settings/document-standards/page.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const cls of ['audienceMarks', 'audienceDots', 'audienceAccent', 'audienceLead', 'previewTools', 'drawerSwitch']) {
    assert.match(css, new RegExp(`\\.${cls}\\s*\\{`), `page.module.css ไม่มี .${cls}`);
    assert.ok(page.includes(`styles.${cls}`), `จอไม่ได้ใช้ styles.${cls}`);
  }
  // กฎใหม่ไม่เขียนค่าสีเอง (ไม่มีโทเคนสีใหม่) — สีของจุดมาจากคลาสสีชุดเดิม
  const added = css.split('\n').filter((row) => /^\.(audience\w+|previewTools|drawerSwitch)\b/.test(row)).join('\n');
  assert.doesNotMatch(added, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(|--document-accent-/i);
});

test('หน้ามาตรฐานเอกสาร: ชนิดที่กระดาษอ่านแค่บรรทัดแบบฟอร์ม บอกไว้ที่หัวฟอร์ม · แท็บ/ลิงก์เต็มจอเดินตามลิสต์คีย์', () => {
  const page = read('../app/settings/document-standards/page.js');
  const fields = page.slice(page.indexOf('function DocumentStandardFields('), page.indexOf('export default function'));
  const notice = fields.indexOf('DOCUMENT_FORM_ONLY_KEYS.includes(documentKey) ? <StatusNotice tone="info">');
  assert.ok(notice > 0, 'ไม่มีกล่องแจ้งของชนิด form-only');
  assert.ok(notice < fields.indexOf('<h4>ตัวตนของเอกสารควบคุม</h4>'), 'กล่องแจ้งต้องอยู่บนสุดของฟอร์ม');
  assert.ok(page.includes(
    'กระดาษ FM-TS-01 ใช้จากมาตรฐานนี้เฉพาะ รหัสแบบฟอร์ม · Revision · วันที่มีผล — ชื่อเอกสาร สี และรูปแบบเลขที่กำหนดในระบบ (เลขที่ SU-YYMMXXXX-R) แก้ที่นี่ไม่เปลี่ยนกระดาษ',
  ));
  assert.match(page, /tabs=\{DOCUMENT_STANDARD_KEYS\.map\(/);
  assert.match(page, /href=\{documentStandardPreviewHref\(selectedKey, previewAudience\)\}/);
  // หน้าเต็มจอรับคีย์จากลิสต์เดียวกัน — คีย์ที่ไม่อยู่ในลิสต์ตกไปใบเสนอราคา
  const preview = read('../app/settings/document-standards/preview/page.js');
  assert.match(preview, /DOCUMENT_STANDARD_KEYS\.includes\(requested\)/);
  /* 🐞 ฝั่งรับของลิงก์เต็มจอ — ลิงก์พก `&audience=internal` แต่หน้าเต็มจอไม่อ่าน = เลือกฉบับภายในแล้วเปิดเต็มจอได้ฉบับลูกค้า
     (คนละสี คนละจำนวนหน้า) และ "พิมพ์ / Save PDF" พิมพ์ได้แต่ฉบับลูกค้า · ค่าจาก URL ต้องผ่าน documentPreviewAudience เสมอ */
  assert.match(preview, /const \[pickedAudience, setPickedAudience\] = useState\(\(\) => searchParams\.get\('audience'\)\);/);
  assert.match(preview, /const audience = documentPreviewAudience\(documentKey, pickedAudience\);/);
  assert.match(preview, /buildStandardPreviewHTML\(documentKey, standard, \{ grayscale, scenarioId, documentState, audience \}\),\s*\[documentKey, standard, grayscale, scenarioId, documentState, audience\],/);
  // ตัวสลับฉบับบนหน้าเต็มจอ = ชุดตัวเลือกเดียวกับหน้าตั้งค่า (จาก documentAudienceAccentMarks) · ชนิดที่มีใบเดียวไม่มีตัวสลับ
  assert.match(preview, /const audienceMarks = documentAudienceAccentMarks\(documentKey\);/);
  assert.match(preview, /\{audienceMarks \? \(\s*<div className="form-group">\s*<span>ฉบับ<\/span>\s*<Segmented\s+ariaLabel="ฉบับของใบตัวอย่าง"\s+value=\{audience\}\s+onChange=\{setPickedAudience\}\s+options=\{audienceMarks\.map\(\(mark\) => \(\{ value: mark\.audience, label: mark\.copy \}\)\)\}/);
  assert.equal((preview.match(/searchParams\.get\('audience'\)/g) || []).length, 1, 'ค่าดิบจาก URL อ่านที่เดียว (ค่าเริ่มของตัวสลับ) — ไม่ไปถึงเครื่องยนต์โดยไม่ผ่านตัวกรอง');
  assert.equal((preview.match(/\bpickedAudience\b/g) || []).length, 2, 'ค่าที่ยังไม่กรองถูกอ่านที่เดียวคือใน documentPreviewAudience');
  // ลิงก์ที่หน้าตั้งค่าสร้าง กับค่าที่หน้าเต็มจอรับ เดินวงเดียวกัน: ฉบับภายใน → ภายใน · ค่าแปลก/ไม่ส่ง → ฉบับลูกค้า · ชนิดอื่นไม่มีฉบับ
  const hrefAudience = (href) => new URL(href, 'http://x').searchParams.get('audience');
  assert.equal(documentPreviewAudience('siteSurvey', hrefAudience(documentStandardPreviewHref('siteSurvey', 'internal'))), 'internal');
  assert.equal(documentPreviewAudience('siteSurvey', hrefAudience(documentStandardPreviewHref('siteSurvey', 'external'))), 'external');
  assert.equal(documentPreviewAudience('siteSurvey', hrefAudience(documentStandardPreviewHref('siteSurvey', 'อะไรก็ได้'))), 'external');
  assert.equal(documentPreviewAudience('quotation', hrefAudience(documentStandardPreviewHref('quotation', 'internal'))), null);
});

// ── ผล UAT ด้วยภาพของหน้าตั้งค่า (PR-3 · D01–D19) ───────────────────────────────────────────────

/* 🔴 D09/D19 — กด "แก้ไข" ตอนมีร่างอยู่แล้ว **ฟอร์มถูกส่งเอง** (มีมาก่อน PR-3)
   ชุดปุ่มของโหมดดูกับโหมดแก้เคยเป็น fragment เปล่าสองก้อนในช่องเดียวกัน ⇒ React ใช้ปุ่มเดิมซ้ำตามลำดับ: ปุ่ม "แก้ไข" กลายเป็น
   ปุ่ม "บันทึก" (`type="submit" form="document-standard-form"`) กลางการกดครั้งเดียวกัน แล้วเบราว์เซอร์ส่งฟอร์มทันที
   · ร่างที่มีหมายเหตุ: PATCH ยิงเอง แล้วหน้ากลับโหมดดู = เปิดแก้ร่างที่บันทึกแล้วไม่ได้อีกเลย
   · ร่างใหม่: จอเด้งไปท้ายฟอร์มพร้อมฟอง "โปรดกรอกฟิลด์นี้" ก่อนพิมพ์อะไร
   ทางแก้ = `key` คนละค่า (ชุดเก่าถูกถอด ชุดใหม่ถูกสร้าง) — เทสต์นี้ล็อกไม่ให้ใครถอด key หรือยุบกลับเป็น fragment เปล่า */
test('🔴 หน้ามาตรฐานเอกสาร: ชุดปุ่มของโหมดดูกับโหมดแก้มี key คนละค่า — ปุ่ม "แก้ไข" ไม่มีวันกลายเป็นปุ่มส่งฟอร์ม', () => {
  const page = read('../app/settings/document-standards/page.js');
  const code = stripJsComments(page);
  const actions = code.slice(code.indexOf('<div className={styles.controlActions}>'), code.indexOf('{detailsOpen ? ('));
  assert.ok(actions.length > 0, 'หาแถวปุ่มของแถบควบคุมไม่เจอ');
  const groups = [...actions.matchAll(/<Fragment key="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(groups, ['edit-actions', 'view-actions']);
  assert.equal(new Set(groups).size, 2, 'สองชุดต้องใช้ key คนละค่า');
  assert.match(actions, /\{editing \? \(\s*<Fragment key="edit-actions">/);
  assert.match(actions, /\) : \(\s*<Fragment key="view-actions">/);
  // ไม่มี fragment เปล่าเหลือในแถวปุ่ม (ตัวที่ทำให้ปุ่มถูกใช้ซ้ำ)
  assert.doesNotMatch(actions, /<>|<\/>/);
  // ปุ่มส่งฟอร์มมีตัวเดียว อยู่ในชุดของโหมดแก้ · ปุ่ม "แก้ไข" อยู่ในชุดของโหมดดู และไม่ได้เป็น submit
  const [editGroup, viewGroup] = [
    actions.slice(actions.indexOf('<Fragment key="edit-actions">'), actions.indexOf('<Fragment key="view-actions">')),
    actions.slice(actions.indexOf('<Fragment key="view-actions">')),
  ];
  assert.equal((code.match(/type="submit"/g) || []).length, 1);
  assert.match(editGroup, /type="submit" form="document-standard-form"/);
  assert.doesNotMatch(viewGroup, /type="submit"|form="document-standard-form"/);
  assert.match(viewGroup, /onClick=\{\(\) => draft \? openEdit\(draft\) : createDraft\(\)\} disabled=\{busy\}>แก้ไข<\/Button>/);
  // เปิดโหมดแก้แล้ว: โฟกัสไปหัวฟอร์ม (ปุ่มที่กดถูกถอดไปแล้ว) และจอถูกพากลับขึ้นมาที่แถบควบคุม — ไม่ใช่ไปตกท้ายฟอร์ม
  assert.match(code, /<h2 ref=\{editTitleRef\} tabIndex=\{-1\}>แก้ไขฉบับร่าง Version/);
  assert.match(code, /if \(focusLost\) editTitleRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*scrollToTopOf\(controlBarRef\.current\);/);
  assert.match(code, /<section ref=\{controlBarRef\} className=\{`glass-panel \$\{styles\.controlBar\}`\}>/);
  const css = read('../app/settings/document-standards/page.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.controlBar\s*\{[^}]*scroll-margin-top:\s*var\(--scroll-anchor-top\)/);
  /* ญาติของบั๊กเดียวกัน (วัดจริงที่ 360px): จอแคบปุ่ม "บันทึก" อยู่ตรงตำแหน่งของปุ่ม "แก้ไข" ⇒ ทีที่สองของดับเบิลแท็ปตกบน "บันทึก"
     แล้วร่างที่บันทึกแล้วถูก PATCH ซ้ำ — ทางเขียนเดียวของฟอร์ม (saveDraft) ไม่ส่งอะไรในช่วงที่ฟอร์มเพิ่งเปิด */
  assert.match(code, /const EDIT_SETTLE_MS = 500;/);
  const openEdit = code.slice(code.indexOf('const openEdit = (row) => {'), code.indexOf('const createDraft = async'));
  assert.match(openEdit, /setEditRow\(row\);\s*editOpenedAtRef\.current = Date\.now\(\);/);
  const saveDraft = code.slice(code.indexOf('const saveDraft = async (event) => {'), code.indexOf('const transitionDraft = async'));
  const guard = saveDraft.indexOf('if (Date.now() - editOpenedAtRef.current < EDIT_SETTLE_MS) return;');
  assert.ok(guard > saveDraft.indexOf('event.preventDefault();'), 'ต้องกันการส่งแบบ native ก่อน แล้วค่อยออก');
  assert.ok(guard > 0 && guard < saveDraft.indexOf('setBusy(true);') && guard < saveDraft.indexOf('await request('), 'ด่านต้องอยู่ก่อนคำขอ');
  assert.equal((code.match(/method: "PATCH"/g) || []).length, 1, 'ฟอร์มมีทางเขียนเดียว — ด่านเดียวครอบทั้งหมด');
});

/* D17 — โหมดแก้ของ FM-TS-01 เคยพูดสองอย่าง: หัวฟอร์ม "ทุกช่องที่แก้จะเห็นผลบนตัวอย่างเอกสารทันที" + หัวการ์ดใบตัวอย่าง
   "ขยับตามที่พิมพ์อยู่ทันที" ขณะที่กล่องแจ้งข้างล่างบอกว่าชื่อ/สี/รูปแบบเลขที่ "แก้ที่นี่ไม่เปลี่ยนกระดาษ" (ตัวที่จริง) */
test('โหมดแก้: ชนิดที่กระดาษอ่านแค่บรรทัดแบบฟอร์มไม่สัญญาว่าทุกช่องขึ้นใบตัวอย่าง · ชนิดอื่นได้ประโยคเดิม', () => {
  for (const key of DOCUMENT_STANDARD_KEYS) {
    const copy = documentStandardEditCopy(key);
    assert.deepEqual(Object.keys(copy), ['formLead', 'previewLead'], key);
    assert.match(copy.formLead, /กด “บันทึก” ที่แถบด้านบน$/, key);
    assert.match(copy.previewLead, /เครื่องยนต์เดียวกับที่พิมพ์$/, key);
    if (DOCUMENT_FORM_ONLY_KEYS.includes(key)) {
      // เอ่ยเฉพาะสามช่องที่กระดาษอ่านจริง (ชื่อเดียวกับป้ายในฟอร์ม) — ไม่มีคำว่า "ทุกช่อง" และไม่มี "ทันที" แบบเหมารวม
      for (const text of [copy.formLead, copy.previewLead]) {
        assert.ok(text.includes('รหัสแบบฟอร์ม · Revision · วันที่มีผล'), text);
        assert.doesNotMatch(text, /ทุกช่อง|ขยับตามที่พิมพ์อยู่ทันที/, text);
      }
      assert.match(copy.formLead, /เฉพาะ/);
    } else {
      assert.equal(copy.formLead, 'ทุกช่องที่แก้จะเห็นผลบนตัวอย่างเอกสารทันที — กด “บันทึก” ที่แถบด้านบน', key);
      assert.equal(copy.previewLead, 'ขยับตามที่พิมพ์อยู่ทันที · เครื่องยนต์เดียวกับที่พิมพ์', key);
    }
  }
  assert.deepEqual(documentStandardEditCopy('somethingNew'), documentStandardEditCopy('quotation'));
  // สามช่องนั้นคือช่องที่ใบตัวอย่างอ่านจริง: แก้แล้วบรรทัดแบบฟอร์มเปลี่ยน · ชื่อ/รูปแบบเลขที่ไม่ได้ถูกอ่าน
  const base = { formCode: 'FM-TS-01', revision: '00', effectiveDate: '2026-09-29', titleTh: 'ก', titleEn: 'A', numberingPattern: 'X-{YY}{RUNNING:4}-{REVISION}' };
  const formOf = (patch) => resolveDocumentForm({ ...base, ...patch }, 'siteSurvey');
  assert.notDeepEqual(formOf({ formCode: 'FM-TS-99' }), formOf({}));
  assert.notDeepEqual(formOf({ revision: '01' }), formOf({}));
  assert.notDeepEqual(formOf({ effectiveDate: '2026-12-01' }), formOf({}));
  assert.deepEqual(formOf({ titleTh: 'ชื่อใหม่', numberingPattern: 'SV-{YY}{RUNNING:4}-{REVISION}' }), formOf({}));

  // จอ: สองบรรทัดมาจาก lib ตามชนิดที่กำลังแก้ — ไม่มีประโยคตายตัวของทุกชนิดเหลือในจอ
  const page = read('../app/settings/document-standards/page.js');
  const code = stripJsComments(page);
  assert.match(code, /const editCopy = documentStandardEditCopy\(selectedKey\);/);
  assert.match(code, /<p>\{editCopy\.formLead\}<\/p>/);
  assert.match(code, /<p>\{editCopy\.previewLead\}<\/p>/);
  for (const text of ['ทุกช่องที่แก้จะเห็นผล', 'ขยับตามที่พิมพ์อยู่ทันที']) {
    assert.equal(code.includes(text), false, `"${text}" ต้องมาจาก lib/documentStandards (จริงรายชนิด) ไม่ใช่เขียนตายในจอ`);
  }
});

/* D03/D17 ที่ 360px — ปุ่ม "เผยแพร่" ที่ติดด่านเคยเป็น `disabled` + `title` (จอสัมผัสไม่เห็นเหตุ · หลุดจากลำดับ Tab)
   กติกา: ติดด่าน = วาดปุ่มไว้แล้วบอกเหตุ ⇒ `aria-disabled` + บรรทัดเหตุที่เห็นบนจอ ผูกด้วย `aria-describedby` */
test('ปุ่มเผยแพร่ที่ติดด่าน: เหตุมาจาก lib และวาดเป็นบรรทัดบนจอ — ไม่ใช่ title ของปุ่ม disabled', () => {
  assert.equal(documentStandardPublishBlocker({ editing: true, draft: { changeNote: 'มีแล้ว' } }), 'บันทึกฉบับร่างก่อนจึงเผยแพร่ได้');
  assert.equal(documentStandardPublishBlocker({ editing: true, draft: null }), 'บันทึกฉบับร่างก่อนจึงเผยแพร่ได้');
  for (const note of ['', '   ', null, undefined]) {
    assert.equal(documentStandardPublishBlocker({ editing: false, draft: { changeNote: note } }), 'บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', JSON.stringify(note));
  }
  assert.equal(documentStandardPublishBlocker({ draft: null }), 'บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่');
  assert.equal(documentStandardPublishBlocker(), 'บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่');
  assert.equal(documentStandardPublishBlocker({ editing: false, draft: { changeNote: 'ขึ้น Rev. ใหม่' } }), null);

  const page = read('../app/settings/document-standards/page.js');
  const code = stripJsComments(page);
  // ไม่มีปุ่มเผยแพร่ (ไม่มีร่าง และไม่ได้แก้อยู่) = ไม่มีเหตุให้วาด
  assert.match(code, /const publishBlocker = editing \|\| draft \? documentStandardPublishBlocker\(\{ editing, draft \}\) : null;/);
  assert.match(code, /\? \{ "aria-disabled": true, "aria-describedby": "standard-publish-blocked", onClick: \(event\) => event\.preventDefault\(\) \}/);
  assert.match(code, /\{publishBlocker \? <p id="standard-publish-blocked" className=\{styles\.blockedReason\}>\{publishBlocker\}<\/p> : null\}/);
  // ปุ่มเผยแพร่ทั้งสองโหมดรับชุด props ของด่าน **หลัง** onClick ของตัวเอง (ติดด่าน = กดแล้วไม่เปิดโมดัลยืนยัน)
  assert.equal((code.match(/\{\.\.\.publishBlockedProps\}/g) || []).length, 2);
  assert.match(code, /onClick=\{\(\) => setConfirm\(\{ action: "publish" \}\)\}\s*disabled=\{busy\}\s*\{\.\.\.publishBlockedProps\}/);
  // เหตุไม่ได้ซ่อนอยู่ใน title และไม่มีปุ่มที่ `disabled` ตายตัว (ปุ่มที่หลุดจากลำดับ Tab โดยไม่มีทางรู้เหตุ)
  assert.doesNotMatch(code, /<Button[^>]*\stitle=/);
  assert.doesNotMatch(code, /<Button[^>]*\sdisabled(\s|>)/);
  for (const text of ['บันทึกฉบับร่างก่อนจึงเผยแพร่ได้', 'บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่']) {
    assert.equal(code.includes(text), false, `"${text}" ต้องมาจาก lib/documentStandards ไม่ใช่เขียนในจอ`);
  }
  const css = read('../app/settings/document-standards/page.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.controlActions > \[aria-disabled="true"\]\s*\{[^}]*opacity:\s*var\(--op-disabled\)/);
  assert.match(css, /\.blockedReason\s*\{/);
  // ป้ายปุ่มไม่ตัดกลางคำ ("เผย / แพร่" ที่ 360px) และปุ่มในแถวสูงเท่าเป้านิ้วบนจอแคบ
  assert.match(css, /\.controlActions > \*\s*\{[^}]*white-space:\s*nowrap/);
  const phone = css.slice(css.indexOf('@media (max-width: 560px)'));
  assert.match(phone, /\.controlActions > \*\s*\{[^}]*min-height:\s*var\(--ctl-h-touch\)/);
});

/* D01/D06 — ตารางประวัติเคยพิมพ์ id ดิบของแถวใต้เลขเวอร์ชัน (`document-standard-siteSurvey-v1` · id ยาวถูกเซลล์ตัดกลางตัว) */
test('ตารางประวัติไม่พิมพ์ id ดิบของแถว — id ใช้เป็น key ของ React เท่านั้น', () => {
  const page = read('../app/settings/document-standards/page.js');
  const code = stripJsComments(page);
  // ส่วนประวัติ (ตาราง + การ์ดของจอแคบ): `row.id` โผล่ได้แค่ใน key ของแถว/การ์ด
  const history = code.slice(code.indexOf('aria-labelledby="version-history-title"'), code.indexOf('<RecordDrawer'));
  assert.ok(history.includes('styles.historyTable') && history.includes('styles.historyCards'), 'ตัดส่วนประวัติไม่ครบ');
  const uses = [...history.matchAll(/\brow\.id\b/g)].map((m) => history.slice(Math.max(0, m.index - 5), m.index + m[0].length));
  assert.deepEqual(uses, ['key={row.id', 'key={row.id'], 'แถวของตาราง · การ์ดของจอแคบ');
  // ทั้งหน้า: ไม่มี id ของแถวไหนถูกวาดเป็นตัวหนังสือ
  assert.doesNotMatch(code, />\s*\{\w+\??\.id\}|\{\w+\??\.id\}\s*</);
  assert.match(code, /<td><strong>Version \{row\.versionNumber\}<\/strong><\/td>/);
});

/* D16 — แท็บที่เจ็ดดันแถวแท็บเป็น 1525px ในกรอบ 1384px ที่จอ 1440: ป้ายแท็บใหม่ขาด และรหัส FM-TS-01 ไม่เคยขึ้นจอ
   ชื่อบน · รหัสล่าง ⇒ แท็บกว้างเท่าตัวที่ยาวกว่า (เจ็ดแท็บ ~1050px) · จอแคบกว่านั้นแถวเลื่อน และ Tabs พาแท็บที่เลือกเข้ากรอบ
   (lib/ui/rowReveal.test.mjs ล็อกฝั่ง Tabs) */
test('แท็บชนิดเอกสาร: ชื่ออยู่บน รหัสแบบฟอร์มอยู่ใต้ชื่อ — เจ็ดแท็บพอดีจอ 1440 โดยไม่ตัดรหัส', () => {
  const page = read('../app/settings/document-standards/page.js');
  const tab = page.slice(page.indexOf('<span className={`${styles.docTab}'), page.indexOf('{loading ? <SkeletonRows rows={7} />'));
  assert.match(tab, /<span className=\{styles\.tabName\}>\{DOCUMENT_STANDARD_LABELS\[key\]\}<\/span>/);
  assert.match(tab, /<span className=\{styles\.tabCode\}>\{standard\.published\.formCode\}<\/span>/);
  assert.match(tab, /<span className=\{styles\.draftDot\}/);
  const css = read('../app/settings/document-standards/page.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector) => {
    const found = [...css.matchAll(new RegExp(`(^|\\n)\\${selector}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[2]).join(';');
    assert.ok(found, `page.module.css ไม่มีกฎ ${selector}`);
    return found;
  };
  assert.match(rule('.docTab'), /display:\s*inline-grid/);
  assert.match(rule('.tabName'), /grid-row:\s*1/);
  assert.match(rule('.tabCode'), /grid-row:\s*2/);
  assert.match(rule('.tabCode'), /grid-column:\s*1(;|\s|$)/);
  // จุดร่างอยู่ข้างชื่อ (แถวบน คอลัมน์ที่สอง) ไม่ได้ไปเพิ่มความกว้างให้แถวของรหัส
  assert.match(rule('.draftDot'), /grid-column:\s*2/);
  assert.match(rule('.draftDot'), /grid-row:\s*1/);
  // จอแคบยังตัดรหัสออกเหมือนเดิม (ชื่อบรรทัดเดียว)
  const narrow = css.slice(css.indexOf('@media (max-width: 1000px)'), css.indexOf('@media (max-width: 768px)'));
  assert.match(narrow, /\.tabCode\s*\{\s*display:\s*none;?\s*\}/);
  // ความกว้างของแถวเมื่อซ้อนสองบรรทัด: ผลรวมของตัวที่ยาวกว่าในแต่ละแท็บ ต้องพอกรอบของจอ 1440 (1384px) — ตัวเลขวัดจากจอจริง
  //   [ชื่อ, รหัส] px ต่อแท็บ ที่ 1440px (08/10/2026) · padding ของ .tab-btn ข้างละ 14px · ช่องไฟระหว่างแท็บ 2px · จุดร่าง 7px + ช่อง 8px
  const measured = [[69, 59], [49, 59], [160, 67], [89, 60], [209, 60], [114, 59], [130, 59]];
  assert.equal(measured.length, DOCUMENT_STANDARD_KEYS.length);
  const stacked = measured.reduce((sum, [name, code]) => sum + Math.max(name, code) + 28, 0) + 2 * (measured.length - 1) + 15 * measured.length;
  const inline = measured.reduce((sum, [name, code]) => sum + name + 8 + code + 28, 0) + 2 * (measured.length - 1);
  assert.ok(stacked <= 1384, `ซ้อนสองบรรทัด + ทุกแท็บมีจุดร่าง = ${stacked}px ต้องพอกรอบ 1384px`);
  assert.ok(inline > 1384, `เรียงแถวเดียว = ${inline}px — เหตุที่ต้องซ้อน (ถ้าพอแล้ว ทบทวนเทสต์นี้)`);
});

/* D02/D04/D10 — ตัวสลับฉบับ (ตัวควบคุมใหม่ของ PR-3) สูง 30px บนจอสัมผัส · D10 ที่ 1440 แถบสองปุ่มถูกยืดเป็นแถบยาวเต็มการ์ด
   D03/D04 ที่ 1024 — จุดสองสีในตารางประวัติซ้อนบน-ล่าง */
test('ตัวสลับฉบับสูงเท่าเป้านิ้วบนจอ ≤1050 (ทั้งหน้าตั้งค่าและหน้าเต็มจอ) · แถบไม่ถูกยืด · จุดสองสีไม่ตัดบรรทัด', () => {
  const page = read('../app/settings/document-standards/page.js');
  // ทุกที่ที่วาดตัวสลับ (หัวการ์ด · โหมดแก้ · ลิ้นชัก) ผ่าน PreviewAudienceSwitch ตัวเดียว ซึ่งใส่คลาสขนาดให้เสมอ
  const sw = page.slice(page.indexOf('function PreviewAudienceSwitch('), page.indexOf('function LiveDocumentPreview('));
  assert.match(sw, /className=\{`\$\{styles\.audienceSwitch\} \$\{className\}`\.trim\(\)\}/);
  assert.equal((stripJsComments(page).match(/<Segmented\b/g) || []).length, 1, 'ตัวสลับฉบับวาดที่เดียว (PreviewAudienceSwitch)');
  const css = read('../app/settings/document-standards/page.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const touch = /@media \(max-width: 1050px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] || '';
  assert.match(touch, /\.audienceSwitch:global\(\.segmented\) > button\s*\{[^}]*min-height:\s*var\(--ctl-h-touch\)/);
  assert.match(css, /\.audienceDots\s*\{[^}]*flex-wrap:\s*nowrap/);

  const preview = read('../app/settings/document-standards/preview/page.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const previewTouch = /@media \(max-width: 1050px\)\s*\{([\s\S]*?)\n\}/.exec(preview)?.[1] || '';
  assert.match(previewTouch, /\.controls :global\(\.segmented button\)\s*\{[^}]*min-height:\s*var\(--ctl-h-touch\)/);
  // ไม่มีความสูงปุ่มที่เขียนเป็นเลขต่ำกว่าเป้านิ้วเหลือในแถบตัวเลือกของหน้าเต็มจอ
  assert.doesNotMatch(preview, /\.segmented button\)\s*\{[^}]*min-height:\s*\d+px/);
  // แถบกว้างเท่าตัวเลือก (`.form-group` เป็น flex แนวตั้ง — ไม่ตรึงไว้ซ้าย แถบถูกยืดเต็มคอลัมน์ 1fr)
  const wide = preview.slice(0, preview.indexOf('@media'));
  assert.match(wide, /\.controls :global\(\.form-group\) > :global\(\.segmented\)\s*\{\s*align-self:\s*flex-start;?\s*\}/);
  assert.match(read('../app/globals.css'), /\.form-group\s*\{[^}]*flex-direction:\s*column/);
});
