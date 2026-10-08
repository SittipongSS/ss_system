// ── ใบตัวอย่างของรายงานการประเมินพื้นที่ (FM-TS-01) บนหน้า "มาตรฐานเอกสาร" ────────────────────────
//
// ⭐ ล็อกหกเรื่อง (สเปก PR-3 §2 · ส่วน A + มติเจ้าของ 08/10/2026 ข้อ 5 เรื่องสี):
//   ① กระดาษตัวอย่างพิมพ์บรรทัดแบบฟอร์มจากมาตรฐานที่ส่งมา (วันที่มีผลเป็น พ.ศ.) · เลขที่ตายตัว · ลายน้ำทุกแผ่น
//   ② ช่องที่กระดาษจริงไม่อ่านจากมาตรฐาน (รูปแบบเลขที่ · สี · ชื่อ) แก้แล้วพรีวิวไม่ขยับ — พรีวิวต้องไม่โกหก
//   ⑥ 🔴 สีเดินตามฉบับ: ใบตัวอย่างฉบับลูกค้า = สีใบเสนอราคา · ฉบับภายใน = สีใบสั่งขาย · teal ของแถว seed ไม่ถึงกระดาษ
//      และตัวสลับฉบับของหน้าตั้งค่า (`audience`) พาไปฉบับที่ถูก — ค่าแปลก ๆ ไม่มีทางพาไปฉบับภายใน
//   ③ รูปเป็น data URI ล้วน — ไม่มี token `su-img:` ไม่มีลิงก์ `/api/` (พรีวิวอยู่ใน iframe srcDoc ไม่มีไฟล์จริงให้ชี้)
//   ④ ชุดตัวอย่างเป็นใบที่ออกเอกสารได้จริง: ไม่มีคำเตือน ไม่มีหน้าล้น — ตัวสร้างภาพนิ่งเพิ่มช่องบังคับเมื่อไรเทสต์นี้ล้ม
//      และลงวันที่ไม่ก่อนวันที่มีผลของแบบฟอร์มที่ seed ไว้ (ใบของแบบฟอร์มที่ยังไม่มีผล = ใบที่มีจริงไม่ได้)
//   ⑤ `buildStandardPreviewHTML('siteSurvey', …)` ไปเครื่องยนต์ของ FM-TS-01 ไม่ตกไปเครื่องยนต์ใบเสนอราคา
//      และสาย import ทั้งสายใช้ฝั่ง client ได้ (ไม่มี node: / server-only / แพ็กเกจนอก src / ชุดทดสอบ · ไม่มีกิ่งที่ถูกข้าม)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { businessDate } from '../businessDate.js';
import { DOCUMENT_FORMS, documentFormLine } from '../documentBrand.js';
import { documentAudienceAccentMarks, resolveDocumentAccentKey } from '../documentStandards.js';
import { DOCUMENT_AUDIENCES, documentAudienceAccentKey } from '../documents/documentAudience.js';
import { DOCUMENT_ACCENT_THEMES } from '../documents/documentShell.js';
import { buildStandardPreviewHTML } from '../documents/standardPreview.js';
import { surveyReportAudience } from './surveyReportDocument.js';
import { surveyReportOverflowErrors } from './surveyReportLayout.js';
import {
  SURVEY_REPORT_PREVIEW_DOC_NO, SURVEY_REPORT_PREVIEW_IMAGE, SURVEY_REPORT_PREVIEW_WATERMARK,
  buildSurveyReportPreview, buildSurveyReportPreviewHTML, surveyReportPreviewInputs,
} from './surveyReportPreview.js';
import { surveyReportFreezeIssues } from './surveyReportSnapshot.js';
import { surveyReportSendWarnings } from './surveyReportView.js';

// แถวที่ mig 0401 ⑦ seed ไว้ (รูปของแถว `document_standard_versions`) — วันที่มีผลเป็น ISO ค.ศ.
// ⚠️ `accentKey: 'teal'` คือค่าจริงของแถวที่เผยแพร่ (แก้ไม่ได้) — ใบตัวอย่างต้องไม่พิมพ์สีนี้ (ข้อ ⑥)
const SEEDED = Object.freeze({
  documentKey: 'siteSurvey', titleTh: 'รายงานการประเมินพื้นที่', titleEn: 'SITE SURVEY REPORT',
  formCode: 'FM-TS-01', revision: '00', effectiveDate: '2026-09-29', accentKey: 'teal',
  numberingPattern: 'SU-{YY}{MM}{RUNNING:4}-{REVISION}',
});

const count = (html, needle) => html.split(needle).length - 1;
const sheetCount = (html) => count(html, '<article class="sheet su-page"');
const imageSources = (html) => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
/** สีที่เปลือกประกาศให้กระดาษทั้งใบ (`--doc-accent` บนกล่อง `.document`) */
const shellAccent = (html) => html.match(/<div class="document surveyReport" style="--doc-accent:(#[0-9a-f]{6});">/)?.[1] ?? null;
const QUOTATION_ACCENT = '#ad5d43';
const SALES_ORDER_ACCENT = '#1e6091';
const BOARD_TEAL = '#0f766e';

/* ══ ① บรรทัดแบบฟอร์ม · เลขที่ · ลายน้ำ ═══════════════════════════════════════ */

test('ใบตัวอย่าง: FM-TS-01 · วันที่มีผลเป็น พ.ศ. · เลขที่ตายตัว · ลายน้ำ "ตัวอย่าง" ทุกแผ่น', () => {
  const { html, layout } = buildSurveyReportPreview(SEEDED);
  assert.ok(html.includes('FM-TS-01: Rev. No.00. 29/09/2569'), 'บรรทัดแบบฟอร์มต้องพิมพ์วันที่มีผลเป็น พ.ศ.');
  assert.ok(!html.includes('2026-09-29'), 'วันที่ ISO ของมาตรฐานต้องไม่หลุดขึ้นกระดาษ');
  assert.equal(SURVEY_REPORT_PREVIEW_DOC_NO, 'SU-26090001-0');
  assert.ok(html.includes(`<dd class="dh-no">${SURVEY_REPORT_PREVIEW_DOC_NO}</dd>`));

  const sheets = sheetCount(html);
  assert.equal(sheets, layout.pageCount);
  assert.ok(sheets >= 3, 'อย่างน้อย หน้า 1 · หน้าพื้นที่ · การรับรองผล');
  assert.equal(SURVEY_REPORT_PREVIEW_WATERMARK, 'ตัวอย่าง');
  assert.equal(count(html, '<div class="watermark">ตัวอย่าง</div>'), sheets);
  // ท้ายกระดาษทุกแผ่นพกบรรทัดแบบฟอร์มกับเลขที่ (หัวหน้า 1 อีกหนึ่ง)
  assert.equal(count(html, 'FM-TS-01: Rev. No.00. 29/09/2569'), sheets + 1);
  assert.equal(buildSurveyReportPreviewHTML(SEEDED), html, 'เรียกซ้ำด้วยอินพุตเดิมต้องได้ไฟล์เดิมทุกไบต์ (ไม่อ่านนาฬิกา)');
});

test('ใบตัวอย่างขยับตามบรรทัดแบบฟอร์มที่กำลังแก้ · ไม่มีมาตรฐาน/กรอกไม่ครบ = ค่าสำรองของ FM-TS-01', () => {
  // ค่าในฟอร์มของหน้าตั้งค่าตอนกำลังแก้ (ไม่มี documentKey · วันที่เป็น ISO)
  const editing = { ...SEEDED, documentKey: undefined, formCode: 'FM-TS-01', revision: '01', effectiveDate: '2026-12-01' };
  assert.ok(buildSurveyReportPreviewHTML(editing).includes('FM-TS-01: Rev. No.01. 01/12/2569'));

  const fallbackLine = documentFormLine(DOCUMENT_FORMS.siteSurvey);
  assert.equal(fallbackLine, 'FM-TS-01: Rev. No.00. 29/09/2569');
  for (const standard of [null, undefined, {}, { ...SEEDED, formCode: '' }, { ...SEEDED, revision: '  ' }]) {
    const html = buildSurveyReportPreviewHTML(standard);
    assert.ok(html.includes(fallbackLine), JSON.stringify(standard));
    assert.ok(!html.includes('FM-SA-01'), 'ต้องไม่ตกไปค่าสำรองของใบเสนอราคา');
  }
  // วันที่ยังพิมพ์ไม่ครบ (กำลังกรอก) = วันที่ของค่าสำรอง ไม่ใช่ขีดหรือ undefined
  const noDate = buildSurveyReportPreviewHTML({ ...SEEDED, revision: '02', effectiveDate: '' });
  assert.ok(noDate.includes('FM-TS-01: Rev. No.02. 29/09/2569'));
  assert.ok(!noDate.includes('undefined'));
});

/* ══ ② ช่องที่กระดาษจริงไม่อ่าน — แก้แล้วพรีวิวต้องไม่ขยับ ═══════════════════════ */

test('รูปแบบเลขที่ · สี · ชื่อเอกสาร ของมาตรฐานไม่มีผลกับใบตัวอย่าง (กระดาษจริงก็ไม่อ่าน)', () => {
  const base = buildSurveyReportPreviewHTML(SEEDED);
  const edited = buildSurveyReportPreviewHTML({
    ...SEEDED, numberingPattern: 'XX-{YYYY}{RUNNING:5}-{REVISION}', accentKey: 'navy',
    titleTh: 'ชื่อที่แก้ในหน้าตั้งค่า', titleEn: 'EDITED TITLE',
  });
  assert.equal(edited, base);
  assert.ok(!edited.includes('XX-2026'), 'เลขที่ต้องไม่ถูกประกอบจากรูปแบบที่แก้ได้');
  // สีมาจากฉบับ (ใบตัวอย่างตั้งต้น = ฉบับลูกค้า = สีใบเสนอราคา) ไม่ใช่จากช่องสีของมาตรฐาน — ตัวเรนเดอร์ไม่ได้รับ accentKey จากพรีวิว
  assert.equal(shellAccent(base), QUOTATION_ACCENT);
  assert.ok(base.includes(`<div class="document surveyReport" style="--doc-accent:${QUOTATION_ACCENT};">`));
  assert.ok(base.includes('<h1 class="dh-title">รายงานการประเมินพื้นที่</h1>'));
  // ช่องสีของมาตรฐานจะถืออะไรก็ตาม (teal ของแถว seed · สีอื่น · ค่าว่าง) กระดาษสองฉบับไม่ขยับสักไบต์
  for (const audience of DOCUMENT_AUDIENCES) {
    const paper = buildSurveyReportPreviewHTML(SEEDED, { audience });
    for (const accentKey of [...Object.keys(DOCUMENT_ACCENT_THEMES), '', null, undefined, 'ไม่มีสีนี้']) {
      assert.equal(buildSurveyReportPreviewHTML({ ...SEEDED, accentKey }, { audience }), paper, `${audience}: ${accentKey}`);
    }
  }
  const source = readFileSync(new URL('./surveyReportPreview.js', import.meta.url), 'utf8');
  const call = source.slice(source.indexOf('renderSurveyReportHTML({'), source.indexOf('return { html, view, layout'));
  assert.doesNotMatch(call, /accentKey/);
  assert.match(call, /docNo: SURVEY_REPORT_PREVIEW_DOC_NO,/);
  // ไม่มีทางประกอบเลขจากรูปแบบ: ไฟล์พรีวิวไม่อ่าน `.numberingPattern` และไม่เรียกตัวประกอบเลขของหน้าตั้งค่า
  assert.doesNotMatch(source, /\.numberingPattern\b|numberingPatternExample|formatDocumentNumber/);
});

/* ══ ③ รูป ═══════════════════════════════════════════════════════════════ */

test('รูปในใบตัวอย่างเป็น data URI ล้วน — ไม่มี su-img: ไม่มี /api/', () => {
  const { html, view } = buildSurveyReportPreview(SEEDED);
  assert.match(SURVEY_REPORT_PREVIEW_IMAGE, /^data:image\/svg\+xml,/);
  assert.ok(SURVEY_REPORT_PREVIEW_IMAGE.length < 600, 'รูปตัวอย่างต้องเล็ก — ฝังซ้ำทุกกล่องรูป');
  assert.ok(!html.includes('su-img:'));
  // ดูที่ค่าของ src/href (ไม่ grep ทั้งไฟล์ — ฟอนต์ที่ฝังเป็น base64 มี "/" ปนได้)
  assert.doesNotMatch(html, /\b(?:src|href)="[^"]*\/api\//);
  const sources = imageSources(html);
  assert.ok(sources.length > 0);
  for (const src of sources) assert.match(src, /^data:image\//, src.slice(0, 60));
  // ทุกกล่องรูปมีรูป: ภาพกว้างทุกรูป + ผังทุกพื้นที่ — ไม่มีกล่อง "ไม่มีภาพ/ไม่มีผัง" บนใบตัวอย่าง
  const boxes = view.zones.reduce((sum, zone) => sum + zone.wide.length + (zone.plan ? 1 : 0), 0);
  assert.equal(count(html, `src="${SURVEY_REPORT_PREVIEW_IMAGE}"`), boxes);
  assert.equal(boxes, 6);
  assert.equal(count(html, '<span class="ph-none">'), 0);
});

/* ══ ④ ชุดตัวอย่างออกเอกสารได้จริง ═══════════════════════════════════════════ */

test('ชุดตัวอย่าง: สองพื้นที่ · ไม่มีเหตุที่ตรึงไม่ได้ · ไม่มีคำเตือนก่อนส่ง · ไม่มีหน้าล้น', () => {
  const inputs = surveyReportPreviewInputs(SEEDED);
  assert.equal(inputs.zones.length, 2);
  assert.deepEqual(inputs.form, { code: 'FM-TS-01', revision: '00', effectiveDate: '29/09/2569' });
  // ⭐ ตัวสร้างภาพนิ่งเพิ่มช่องบังคับเมื่อไร ข้อนี้ล้ม — เติมช่องในชุดตัวอย่าง (อย่าปล่อยใบตัวอย่างพิมพ์ขีด)
  assert.deepEqual(surveyReportFreezeIssues(inputs), []);

  const { view, layout, warnings } = buildSurveyReportPreview(SEEDED);
  assert.deepEqual(warnings, []);
  assert.deepEqual(surveyReportOverflowErrors(layout), []);
  assert.deepEqual(layout.overflow, []);
  // ตัวอย่างต้องไม่สอนให้พิมพ์คำที่ระบบเตือนในฉบับลูกค้า (เครื่อง · รุ่น · ราคา · จุดติดตั้ง · อักขระที่ฟอนต์ไม่มี)
  assert.deepEqual(surveyReportSendWarnings(view), []);

  assert.equal(view.version, 'customer');
  assert.equal(view.zones.length, 2);
  assert.equal(view.table.total.label, 'รวม 2 พื้นที่');
  // สองทรงของหน้ารายพื้นที่: ส่วนเดียว (ขนาดอยู่ในหัวพื้นที่) กับสองส่วน (ตารางส่วนข้างผัง)
  assert.equal(view.zones[0].parts, null);
  assert.equal(view.zones[1].parts.rows.length, 2);
  assert.notEqual(view.table.total.sizeMix, '—', 'ใช้สองขนาดแพ็คเกจ — แถวรวมโชว์ช่องขนาดแพ็ค');
});

/* ══ ⑥ สีเดินตามฉบับ + ตัวสลับฉบับของหน้าตั้งค่า (มติเจ้าของ 08/10/2026) ═════════════════════ */

test('🔴 ใบตัวอย่างสองฉบับ: ลูกค้า = สีใบเสนอราคา · ภายใน = สีใบสั่งขาย · teal ของแถว seed ไม่อยู่ในกระดาษฉบับไหน', () => {
  assert.equal(SEEDED.accentKey, 'teal', 'แถวที่เผยแพร่ถือ teal จริง — เทสต์นี้ยืนยันว่าค่านั้นไม่ถึงกระดาษ');
  const want = { external: QUOTATION_ACCENT, internal: SALES_ORDER_ACCENT };
  const seen = {};
  for (const audience of DOCUMENT_AUDIENCES) {
    const { html, view, layout, warnings } = buildSurveyReportPreview(SEEDED, { audience });
    seen[audience] = html;
    // ตัวสลับของจอพูดเป็น "ผู้อ่าน" · กระดาษพูดเป็น "ฉบับ" — สองทางต้องไปกลับกันได้
    assert.equal(surveyReportAudience(view.version), audience);
    assert.equal(shellAccent(html), want[audience], audience);
    assert.equal(shellAccent(html), DOCUMENT_ACCENT_THEMES[documentAudienceAccentKey(audience)].accent, audience);
    assert.equal(html.toLowerCase().includes(BOARD_TEAL), false, `${audience}: ใบตัวอย่างยังมี teal`);
    // ทั้งสองฉบับเป็นใบที่ออกได้จริง: ไม่มีหน้าล้น ไม่มีคำเตือน ลายน้ำทุกแผ่น รูปเป็น data URI ล้วน
    assert.deepEqual(surveyReportOverflowErrors(layout), [], audience);
    assert.deepEqual(warnings, [], audience);
    assert.equal(sheetCount(html), layout.pageCount);
    assert.equal(count(html, '<div class="watermark">ตัวอย่าง</div>'), layout.pageCount);
    assert.ok(!html.includes('su-img:'));
    for (const src of imageSources(html)) assert.match(src, /^data:image\//, src.slice(0, 60));
    assert.equal(buildSurveyReportPreviewHTML(SEEDED, { audience }), html, 'นิ่งทุกครั้งที่เรียก');
  }
  // ที่มาของสองสีคือ "สีของ QT / สีของ SO" — เทียบกับ **สีตั้งต้น** ของสองชนิดนั้น ไม่ใช่แค่ค่าสีที่เขียนไว้ข้างบน
  assert.equal(shellAccent(seen.external), DOCUMENT_ACCENT_THEMES[resolveDocumentAccentKey(null, 'quotation')].accent);
  assert.equal(shellAccent(seen.internal), DOCUMENT_ACCENT_THEMES[resolveDocumentAccentKey(null, 'salesOrder')].accent);
  assert.notEqual(seen.external, seen.internal);

  // ฉบับภายในของใบตัวอย่าง: แถบ "ฉบับภายใน" ทุกแผ่น · จุดที่เลือกพื้นที่ละหนึ่งจุดพร้อมรูป (ไม่ขึ้น "จุดที่ติดตั้งได้ 0") · ภาคผนวก
  const internal = buildSurveyReportPreview(SEEDED, { audience: 'internal' });
  assert.equal(internal.view.version, 'internal');
  assert.equal(count(internal.html, '<span class="band-t">ฉบับภายใน — ห้ามส่งลูกค้า</span>'), internal.layout.pageCount);
  assert.ok(internal.html.includes('ผนังข้างเคาน์เตอร์ต้อนรับ') && internal.html.includes('มุมห้องด้านประตูทางเข้า'));
  assert.ok(internal.layout.pages.some((page) => page.kind === 'appendix'));
  const boxes = (view) => view.zones.reduce((sum, zone) => sum + zone.wide.length + (zone.plan ? 1 : 0), 0);
  assert.equal(count(internal.html, `src="${SURVEY_REPORT_PREVIEW_IMAGE}"`), boxes(internal.view) + 2, 'รูปพื้นที่ + รูปจุดสองรูป');
  assert.equal(count(internal.html, '<span class="ph-none">'), 0);
  // ฉบับลูกค้าไม่ขยับเพราะชุดตัวอย่างมีจุด: รูปยังเท่าภาพกว้าง + ผัง
  const customer = buildSurveyReportPreview(SEEDED, { audience: 'external' });
  assert.equal(count(customer.html, `src="${SURVEY_REPORT_PREVIEW_IMAGE}"`), boxes(customer.view));
});

test('ตัวสลับฉบับ: ไม่ส่ง/ค่าแปลก = ฉบับลูกค้าเสมอ (ไม่มีทางพาใบตัวอย่างไปฉบับภายในโดยไม่ตั้งใจ) · ตัวเลือกบนจอตรงกับลิสต์ผู้อ่าน', () => {
  const customer = buildSurveyReportPreviewHTML(SEEDED);
  const internal = buildSurveyReportPreviewHTML(SEEDED, { audience: 'internal' });
  assert.equal(buildSurveyReportPreviewHTML(SEEDED, { audience: 'external' }), customer);
  for (const odd of [undefined, null, '', 'customer', 'INTERNAL', 'Internal', 0, true, {}]) {
    assert.equal(buildSurveyReportPreviewHTML(SEEDED, { audience: odd }), customer, String(odd));
    assert.equal(buildStandardPreviewHTML('siteSurvey', SEEDED, { audience: odd }), customer, String(odd));
  }
  assert.equal(buildSurveyReportPreviewHTML(SEEDED, {}), customer);
  assert.equal(buildStandardPreviewHTML('siteSurvey', SEEDED, { audience: 'internal' }), internal);

  // ตัวเลือกของแถบบนจอ = `documentAudienceAccentMarks('siteSurvey')` — ครบทุกผู้อ่าน เรียงเหมือนลิสต์กลาง ฉบับลูกค้ามาก่อน
  const marks = documentAudienceAccentMarks('siteSurvey');
  assert.deepEqual(marks.map((mark) => mark.audience), [...DOCUMENT_AUDIENCES]);
  assert.deepEqual(marks.map((mark) => mark.copy), ['ฉบับลูกค้า', 'ฉบับภายใน']);
  // จุดสีข้างตัวเลือก = สีที่ใบตัวอย่างของฉบับนั้นพิมพ์จริง
  for (const mark of marks) {
    assert.equal(
      shellAccent(buildSurveyReportPreviewHTML(SEEDED, { audience: mark.audience })), DOCUMENT_ACCENT_THEMES[mark.accentKey].accent, mark.audience,
    );
  }
  // ชนิดอื่นไม่อ่าน `audience` — ใบตัวอย่างใบเดียวเหมือนเดิม
  assert.equal(buildStandardPreviewHTML('quotation', SEEDED, { audience: 'internal' }), buildStandardPreviewHTML('quotation', SEEDED));
  assert.equal(buildStandardPreviewHTML('pdr', SEEDED, { audience: 'internal' }), buildStandardPreviewHTML('pdr', SEEDED));

  // หน้าตั้งค่า: แถบสองตัวเลือกที่เห็นตรง ๆ (ไม่ใช่ dropdown) · ค่าที่เลือกไปถึงเครื่องยนต์ · กลับเป็นฉบับลูกค้าเมื่อเปลี่ยนแท็บ
  const page = readFileSync(new URL('../../app/settings/document-standards/page.js', import.meta.url), 'utf8');
  const control = page.slice(page.indexOf('function PreviewAudienceSwitch('), page.indexOf('// พรีวิวเอกสารจริง'));
  assert.match(control, /documentAudienceAccentMarks\(documentKey\)/);
  assert.match(control, /if \(!marks\) return null;/);
  assert.match(control, /<Segmented\b/);
  assert.match(control, /options=\{marks\.map\(\(mark\) => \(\{ value: mark\.audience, label: mark\.copy \}\)\)\}/);
  assert.doesNotMatch(control, /<select|MenuSelect|<Select\b/);
  assert.match(page, /buildStandardPreviewHTML\(documentKey, standard, \{ audience \}\)/);
  assert.match(page, /\[documentKey, standard, audience\]/);
  assert.match(page, /useState\(DOCUMENT_AUDIENCES\[0\]\)/);
  assert.match(page, /setSelectedKey\(key\); setEditRow\(null\); setViewRow\(null\); setPreviewAudience\(DOCUMENT_AUDIENCES\[0\]\);/);
  // ทุกที่ที่วาดใบตัวอย่าง (ดูเฉย ๆ · คอลัมน์ขวาตอนแก้ · ลิ้นชัก) มีตัวสลับคู่กัน และส่งค่าเดียวกันให้พรีวิว
  assert.equal(count(page, '<PreviewAudienceSwitch '), 3);
  assert.equal(count(page, '<LiveDocumentPreview '), 3);
  assert.equal(count(page, 'audience={previewAudience}'), 3);
});

/* แบบฟอร์มควบคุมมีผล 29/09/2569 — ใบที่ประเมิน/ออกก่อนวันนั้นคือใบที่มีจริงไม่ได้ (ชุดตัวอย่างเคยลงวันที่ 25–26/09/2026)
   ⚠️ เทียบกับวันที่มีผลของ **แถว seed** เท่านั้น: ร่างที่พิมพ์วันที่มีผลช้ากว่านี้ ชุดตัวอย่างตายตัวไม่ขยับตาม */
test('ใบตัวอย่างลงวันที่ไม่ก่อนวันที่มีผลของแบบฟอร์ม · เดือนตรงกับเลขที่ · วันประเมินเป็นวันที่เข้าพื้นที่ได้', () => {
  const inputs = surveyReportPreviewInputs(SEEDED);
  const [day, month, buddhistYear] = inputs.form.effectiveDate.split('/');
  const effective = `${Number(buddhistYear) - 543}-${month}-${day}`;
  assert.equal(effective, SEEDED.effectiveDate);

  // ทุกวันที่ที่พิมพ์เป็นข้อความบนกระดาษ (ค.ศ.) — ตัด <style> (ฟอนต์ base64) กับแท็กออกก่อนจับ
  const { html } = buildSurveyReportPreview(SEEDED);
  const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, '\n');
  const printed = [...text.matchAll(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/g)].map(([, d, m, y]) => `${y}-${m}-${d}`);
  // หัวหน้า 1 (วันที่ประเมิน · วันที่ออก) · บล็อกการประเมิน · ลายเซ็นผู้ประเมิน/ผู้อนุมัติ
  assert.ok(printed.length >= 5, `จับวันที่บนกระดาษได้ ${printed.length} จุด`);
  for (const date of printed) assert.ok(date >= effective, `ใบตัวอย่างพิมพ์ ${date} ก่อนวันที่มีผลของแบบฟอร์ม (${effective})`);

  const headDay = (label) => {
    const match = new RegExp(`<dt>${label}</dt><dd>(\\d{2})/(\\d{2})/(\\d{4})</dd>`).exec(html);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  };
  const surveyed = headDay('วันที่ประเมิน');
  const issued = headDay('วันที่ออก');
  assert.equal(surveyed, inputs.visit.actualDate);
  assert.ok(surveyed <= issued, 'ประเมินก่อนออกเอกสาร');
  // เลขที่ SU-YYMM… พกเดือนที่ออก — วันที่ขยับข้ามเดือนโดยไม่แก้เลขที่ = หัวกระดาษขัดกันเอง
  assert.equal(SURVEY_REPORT_PREVIEW_DOC_NO.slice(3, 7), `${issued.slice(2, 4)}${issued.slice(5, 7)}`);
  assert.equal(businessDate(inputs.request.answeredAt), issued, 'วันที่ออก = วันที่ส่งผล (เวลาไทย)');
  // วันประเมินต้องเป็นวันที่ไซต์ตัวอย่างเปิดให้เข้า (0 = อาทิตย์ … 6 = เสาร์)
  assert.ok(inputs.site.accessDays.includes(new Date(`${surveyed}T00:00:00Z`).getUTCDay()), `${surveyed} ไม่ใช่วันเข้าพื้นที่`);
  // จุดเวลาหน้างานทั้งชุด (บันทึกพื้นที่ · รูป) ตกในวันประเมินตามเวลาไทย — วันที่ตั้งที่เดียว ไม่มีตัวไหนค้างวันเก่า
  // (สองพื้นที่ + รูปพื้นที่ละสี่: ภาพกว้างสอง · ผัง · รูปจุด)
  const stamps = [...inputs.zones.map((zone) => zone.surveyedAt), ...Object.values(inputs.filesByZone).flat().map((file) => file.createdAt)];
  assert.equal(stamps.length, 10);
  for (const stamp of stamps) assert.equal(businessDate(stamp), surveyed, stamp);
  assert.ok(businessDate(inputs.request.submittedAt) <= surveyed, 'คำร้องต้องส่งก่อนวันประเมิน');
});

test('ใบตัวอย่างตั้งต้นเป็นฉบับลูกค้า และไม่มีข้อมูลจริง — ชื่อสมมติทั้งชุด · จุดติดตั้งของชุดตัวอย่างไม่ขึ้นฉบับลูกค้า', () => {
  const { html, view } = buildSurveyReportPreview(SEEDED);
  assert.equal(view.version, 'customer');
  const spots = surveyReportPreviewInputs(SEEDED).zones.flatMap((zone) => zone.spots);
  assert.equal(spots.length, 2, 'ชุดตัวอย่างมีจุดที่เลือกพื้นที่ละหนึ่งจุด (สำหรับฉบับภายใน)');
  const spotWords = spots.flatMap((spot) => [spot.label, spot.note]).filter(Boolean);
  assert.equal(spotWords.length, 3);
  for (const word of ['ฉบับภายใน', 'ห้ามส่งลูกค้า', 'ภาคผนวก', 'RQ-', 'DL-', 'จุดที่ติดตั้งได้', 'จุดที่เลือก', ...spotWords]) {
    assert.ok(!html.includes(word), `ฉบับลูกค้าต้องไม่มี "${word}"`);
  }
  assert.ok(html.includes('บริษัท ตัวอย่าง จำกัด'));
  const inputs = surveyReportPreviewInputs(SEEDED);
  for (const name of [inputs.customer.name, inputs.site.name, inputs.site.contactName, inputs.visit.assigneeName, inputs.request.answeredByName]) {
    assert.match(name, /ตัวอย่าง/, name);
  }
});

/* ══ ⑤ ทางเข้าจากหน้าตั้งค่า + ฝั่ง client ════════════════════════════════════ */

test('buildStandardPreviewHTML("siteSurvey") ใช้เครื่องยนต์ของ FM-TS-01 ไม่ใช่เครื่องยนต์ใบเสนอราคา', () => {
  const html = buildStandardPreviewHTML('siteSurvey', SEEDED);
  assert.equal(html, buildSurveyReportPreviewHTML(SEEDED));
  assert.ok(html.includes('class="document surveyReport"'));
  assert.ok(sheetCount(html) >= 3);

  // เครื่องยนต์ใบเสนอราคากับมาตรฐานเดียวกัน = ใบเสนอราคาที่หัวเขียน FM-TS-01 — สิ่งที่กิ่งนี้กันไว้
  const quotation = buildStandardPreviewHTML('quotation', SEEDED);
  assert.notEqual(html, quotation);
  assert.equal(sheetCount(quotation), 0);
  // ตัวเลือกของเครื่องยนต์ใบเสนอราคา (ขาวดำ · กรณีทดสอบ · สถานะ) ไม่มีผลกับชนิดนี้
  assert.equal(buildStandardPreviewHTML('siteSurvey', SEEDED, { grayscale: true, scenarioId: 'long', documentState: 'draft' }), html);

  // กิ่ง siteSurvey ต้องมาก่อนทางตกไปเครื่องยนต์ใบเสนอราคา
  const source = readFileSync(new URL('../documents/standardPreview.js', import.meta.url), 'utf8');
  const branch = source.indexOf("if (documentKey === 'siteSurvey') return buildSurveyReportPreviewHTML(standard, { audience });");
  assert.ok(branch > 0);
  assert.ok(branch < source.indexOf('const model = buildQuotationMasterPreview(scenarioId, documentState'));
});

/* สายเรนเดอร์ถูก bundle ลงจอตั้งค่า (client) — โมดูลของ Node หรือ `server-only` ตรงไหนในสาย = หน้าตั้งค่า build ไม่ผ่าน
   เดินตาม import ของทุกไฟล์ในสาย (`@/…` และทางสัมพัทธ์) เริ่มจากไฟล์พรีวิว — ทั้ง static · `import()` · `require()`

   ⭐ สองช่องที่เคยปล่อยผ่านเงียบ (สายนี้ 73 ไฟล์ และอีกส่วนงานแก้ไฟล์ในสายอยู่):
     · **แพ็กเกจเปล่า** (`crypto` · `sharp` · `@supabase/supabase-js` …) — ไม่ขึ้นต้น `node:` ก็คือโมดูลของ Node/ฝั่ง server ได้
       ⇒ สายนี้ต้องเป็นไฟล์ใน `src` ล้วน · แพ็กเกจที่ตรวจแล้วว่าใช้ฝั่ง client ได้ให้เติมชื่อใน `CLIENT_SAFE_PACKAGES`
     · **ทางที่หาไฟล์ไม่เจอ** — ข้ามไป = ทั้งกิ่งใต้ไฟล์นั้นไม่ถูกตรวจ ⇒ ถือว่าล้ม ให้มาเติมกติกาใน `locate` */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// แพ็กเกจนอก `src` ที่สายของใบตัวอย่าง import ได้ — วันนี้ไม่มีสักตัว
const CLIENT_SAFE_PACKAGES = Object.freeze([]);
const isLocalSpec = (spec) => spec.startsWith('@/') || spec.startsWith('.');

/**
 * เดินตาม import ตั้งแต่ `entry` · ทางของไฟล์ที่คืนเป็นทางสัมพัทธ์จาก `root`
 * @returns `{ files, specs, bare, unresolved }` — `specs` = Map(specifier → ไฟล์แรกที่ import)
 *   `bare` = `[specifier, ไฟล์]` ของ specifier ที่ไม่ใช่ `@/…`/ทางสัมพัทธ์ · `unresolved` = `[specifier, ไฟล์]` ที่หาไฟล์ไม่เจอ
 */
function walkImports(entry, { root = SRC, read = (path) => readFileSync(path, 'utf8'), exists = existsSync } = {}) {
  const rel = (file) => file.slice(root.length + 1);
  const locate = (spec, from) => {
    const base = spec.startsWith('@/') ? join(root, spec.slice(2)) : resolve(dirname(from), spec);
    return [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')].find((path) => /\.m?js$/.test(path) && exists(path)) || null;
  };
  const seen = new Set();
  const specs = new Map();
  const unresolved = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = read(file);
    const found = [
      ...source.matchAll(/^\s*(?:import|export)\s[^'"]*?\sfrom\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]/g),
    ].map((m) => m[1]);
    for (const spec of found) {
      if (!specs.has(spec)) specs.set(spec, rel(file));
      if (!isLocalSpec(spec)) continue;
      const next = locate(spec, file);
      if (next) walk(next);
      else unresolved.push([spec, rel(file)]);
    }
  };
  walk(entry);
  return { files: [...seen].map(rel), specs, bare: [...specs].filter(([spec]) => !isLocalSpec(spec)), unresolved };
}

test('สาย import ของใบตัวอย่างใช้ฝั่ง client ได้: ไม่มี node: · server-only · แพ็กเกจเปล่า · ชุดทดสอบ · ตัวโหลดฝั่ง server', () => {
  const { files, specs, bare, unresolved } = walkImports(join(SRC, 'lib/service/surveyReportPreview.js'));
  // เดินถึงตัวเรนเดอร์และเปลือกเอกสารจริง (กันเทสต์ผ่านเพราะ regex จับ import ไม่ได้สักบรรทัด)
  for (const must of ['lib/service/surveyReportDocument.js', 'lib/service/surveyReportSnapshot.js', 'lib/service/surveyReportView.js',
    'lib/service/surveyReportLayout.js', 'lib/documents/documentShell.js', 'lib/documents/documentAudience.js', 'lib/documentStandards.js']) {
    assert.ok(files.includes(must), `สายไม่ถึง ${must}`);
  }
  for (const [spec, from] of specs) {
    assert.ok(!spec.startsWith('node:') && spec !== 'server-only', `${from} import ${spec}`);
  }
  // ทุกไฟล์ในสายถูกเปิดอ่านจริง — ไม่มีกิ่งไหนถูกข้ามเพราะหาไฟล์ไม่เจอ
  assert.deepEqual(
    unresolved, [],
    `import ที่หาไฟล์ไม่เจอ = กิ่งนั้นไม่ถูกตรวจ — เติมกติกาใน locate ของ walkImports: ${JSON.stringify(unresolved)}`,
  );
  const packages = bare.filter(([spec]) => !CLIENT_SAFE_PACKAGES.includes(spec));
  assert.deepEqual(
    packages, [],
    `สายนี้ถูก bundle ลงจอตั้งค่า — แพ็กเกจนอก src ต้องตรวจว่าใช้ฝั่ง client ได้ก่อน แล้วเติมใน CLIENT_SAFE_PACKAGES: ${JSON.stringify(packages)}`,
  );
  for (const file of files) {
    assert.doesNotMatch(
      file,
      /surveyReportTestKit|surveyReport(State|Rows|Inputs|Issue|Paper|Images)\.js$|pdfInspect|supabaseAdmin|\.mjs$/,
      `สายของใบตัวอย่างไม่ควรถึง ${file}`,
    );
  }
});

/* สายจริงวันนี้สะอาด (ไม่มีแพ็กเกจเปล่า ไม่มีกิ่งที่หาไม่เจอ) ⇒ เทสต์ข้างบนผ่านทั้งที่ตัวเดินจับไม่ได้ก็ได้
   ข้อนี้ยืนยันกับสายจำลองว่าตัวเดิน **จับได้จริง** ทุกทรงที่กติกาอ้าง */
test('ตัวเดินสาย import จับได้จริง: แพ็กเกจเปล่า (crypto · sharp · @supabase/…) · import() · require() · ทางที่หาไฟล์ไม่เจอ', () => {
  const tree = {
    '/v/lib/entry.js': "import { a } from './a';\nimport {\n  b,\n} from '@/lib/b';\nexport { gone } from './gone';\n",
    '/v/lib/a.js': "import { createHash } from 'crypto';\nimport sharp from 'sharp';\nimport 'server-only';\nimport { d } from './deep';\n",
    '/v/lib/b.js': "import { createClient } from '@supabase/supabase-js';\nexport * from '@/lib/missing';\n"
      + "export async function late() {\n  const fs = await import('node:fs');\n  return [fs, require('path')];\n}\n",
    '/v/lib/deep/index.js': "export const d = 1;\n",
  };
  const found = walkImports('/v/lib/entry.js', { root: '/v', read: (path) => tree[path], exists: (path) => path in tree });
  assert.deepEqual(found.files, ['lib/entry.js', 'lib/a.js', 'lib/deep/index.js', 'lib/b.js']);
  assert.deepEqual(found.bare, [
    ['crypto', 'lib/a.js'], ['sharp', 'lib/a.js'], ['server-only', 'lib/a.js'],
    ['@supabase/supabase-js', 'lib/b.js'], ['node:fs', 'lib/b.js'], ['path', 'lib/b.js'],
  ]);
  assert.deepEqual(found.unresolved, [['@/lib/missing', 'lib/b.js'], ['./gone', 'lib/entry.js']]);
  // สายจำลองที่สะอาด = ว่างทั้งสองช่อง (กันตัวเดินรายงานของที่ไม่มี)
  const clean = walkImports('/v/lib/deep/index.js', { root: '/v', read: (path) => tree[path], exists: (path) => path in tree });
  assert.deepEqual([clean.files, clean.bare, clean.unresolved], [['lib/deep/index.js'], [], []]);
});
