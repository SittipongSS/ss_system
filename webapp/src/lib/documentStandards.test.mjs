import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NUMBERING_PATTERNS,
  DOCUMENT_ACCENT_KEYS,
  DOCUMENT_STANDARD_KEYS,
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
test('รอบตัดรายปี (QT/SO) ไม่บังคับ {MM} — รายเดือน (ET/PT) ยังบังคับ', () => {
  assert.equal(validateNumberingPattern('QT-{YY}{RUNNING:4}-{REVISION}', 'quotation').ok, true);
  assert.equal(validateNumberingPattern('SO-{YY}{RUNNING:4}-{REVISION}', 'salesOrder').ok, true);
  assert.equal(validateNumberingPattern('QT-{YY}{MM}{RUNNING:4}-{REVISION}', 'quotation').ok, true);
  assert.match(
    validateNumberingPattern('ET-{YY}{RUNNING:4}-{REVISION}', 'exciseTaxNotice').error,
    /ต้องมี \{MM\}/,
  );
  assert.match(
    validateNumberingPattern('PT-{YY}{RUNNING:4}-{REVISION}', 'projectTimeline').error,
    /ต้องมี \{MM\}/,
  );
  // ไม่ส่งชนิดมา = ตรวจได้แค่กติกาที่จริงกับทุกชนิด (ปี) — ด่านจริงอยู่ที่
  // updateDocumentStandardDraft ซึ่งอ่าน documentKey จากแถวในฐาน
  assert.equal(validateNumberingPattern('ET-{YY}{RUNNING:4}-{REVISION}').ok, true);
  assert.equal(documentNumberCycle('quotation'), 'year');
  assert.equal(documentNumberCycle('exciseTaxNotice'), 'month');
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
  // teal/green ถูกถอดจากตัวเลือกแล้ว — มาตรฐานเก่าที่ยังถือค่าเหล่านี้ต้องไม่พา
  // เอกสารไปสีที่ไม่มีใครตั้งใจ
  assert.equal(resolveDocumentAccentKey({ accentKey: 'teal' }, 'salesOrder'), 'steel');
  assert.equal(resolveDocumentAccentKey({ accentKey: 'green' }, 'quotation'), 'terracotta');
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
