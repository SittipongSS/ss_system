// ── กระดาษของรายงานการประเมินพื้นที่ (FM-TS-01) — HTML ที่ออกจริง ──────────────────────────────
//
// ⭐ ล็อกหกเรื่อง:
//   ① 🔴 ฉบับลูกค้าไม่รั่ว — grep **ทั้งไฟล์ HTML** (รวม CSS) หาเครื่องหมายของทุกช่องภายใน + คำต้องห้าม (สเปก PR-1 §7)
//   ② ฉบับภายใน: แถบ "ฉบับภายใน" ทุกแผ่น · จุดที่ไม่เลือกไม่โผล่
//   ③ ทองคำ (แฝดสังเคราะห์ของ RQ-AS-26090186): 4 / 6 แผ่น · คอลัมน์ "หน้า" 2, 3 · หัววิ่งมีแค่เลขที่เอกสาร · "หน้า x / N"
//   ④ รูป: token `su-img:<sha>` ตั้งต้น · แปลงครบ · ไม่มี `/api/` ในกระดาษ
//   ⑤ กระดาษเดินตามแผนหน้า — หนึ่งแผ่นต่อหนึ่งหน้าของแผน ชนิดตรงกัน (หน้า "(ต่อ)" · ตารางแบ่ง · ภาคผนวกหลายหน้า)
//   ⑥ 🔴 สีชื่อเอกสารเดินตามฉบับ (มติเจ้าของ 08/10/2026): ลูกค้า = สีใบเสนอราคา · ภายใน = สีใบสั่งขาย · ไม่มี teal
//   ⑨ 🔴 งวด S3 (ประเมินจากแบบ): ใบลงหน้างานพิมพ์กระดาษของ main ทุกไบต์ (ทองคำ sha256) · ข้อความใหม่อยู่ในฉบับ/โหมดของมันเท่านั้น
//
// ⚠️ ความสูงจริง (ไม่ล้นขอบล่าง · ตรงกับแผน) วัดได้ใน Chrome เท่านั้น — เทสต์ท้ายไฟล์รันเมื่อมี `PUPPETEER_EXECUTABLE_PATH`
//   (เครื่องนักพัฒนา) และข้ามเองใน CI · ของจริงพร้อมรูปใช้ `scripts/render-survey-report.mjs --assert`
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDocumentAccentKey } from '../documentStandards.js';
import { DOCUMENT_AUDIENCES, documentAudienceAccentKey } from '../documents/documentAudience.js';
import { uncoveredChars } from '../documents/documentFontRanges.js';
import { DOCUMENT_ACCENT_THEMES, stampWatermark } from '../documents/documentShell.js';
import { DOCUMENT_FONT_FACE_CSS } from '../sales/quotationDocumentFonts.js';
import {
  SURVEY_REPORT_CSS, SURVEY_REPORT_INTERNAL_CSS, SURVEY_REPORT_RENDERER_VERSION,
  renderSurveyReportHTML, resolveImageTokens, surveyReportAccentKey, surveyReportAudience, surveyReportImageShas, surveyReportImageToken,
} from './surveyReportDocument.js';
import { SURVEY_REPORT_PX, paginateSurveyReport } from './surveyReportLayout.js';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import { surveyReportCustomerHtmlIssues, surveyReportSignatureHtmlIssues } from './surveyReportState.js';
import {
  CONFIRM_ORIGINAL, confirmSurveyFixture,
  drawingSurveyFixture, fakeSha, fakeSignatureVersion, markedSurveyInputs, mixedSurveyFixture, signedSurveyInputs,
  stressSurveyInputs, surveyReportInputsFromFixture, surveySignCases, surveyStressCases, syntheticSurveyFixture, thaiText,
} from './surveyReportTestKit.mjs';
import { surveyReportView } from './surveyReportView.js';
import { SURVEY_CONFIRM_GOLDEN, SURVEY_GOLDEN, confirmRowFailures, goldenFailures, syntheticOf } from '../../../scripts/render-survey-report.mjs';

const DOC_NO = 'SU-26090001-0';

/* `opts.mode: 'draft'` = อินพุตที่ตรึงไม่ได้โดยตั้งใจ (พื้นที่ไม่มีภาพผัง) — กระดาษตัวอย่างยังต้องออกได้ */
function paper(inputs, version, { mode = 'freeze', ...opts } = {}) {
  const built = buildSurveyReportSnapshot(inputs, { mode });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  const view = surveyReportView(built.snapshot, { version });
  const layout = paginateSurveyReport(view);
  const html = renderSurveyReportHTML({ view, layout, docNo: DOC_NO, issuedAt: '2026-09-26', ...opts });
  return { snapshot: built.snapshot, view, layout, html };
}
const twin = () => surveyReportInputsFromFixture(syntheticSurveyFixture());
const count = (html, needle) => html.split(needle).length - 1;
const sheets = (html) => [...html.matchAll(/<article class="sheet su-page" data-page="(\d+)" data-kind="(\w+)"/g)]
  .map((m) => ({ no: Number(m[1]), kind: m[2] }));
/** HTML ของแผ่นที่ n (ตั้งแต่แท็กเปิดถึงแท็กปิด) */
const sheetHtml = (html, no) => {
  const from = html.indexOf(`<article class="sheet su-page" data-page="${no}"`);
  return html.slice(from, html.indexOf('</article>', from));
};

/* ══ ① ฉบับลูกค้าไม่รั่ว ═══════════════════════════════════════════════ */

// คำที่ฉบับลูกค้าต้องไม่มีไม่ว่ากรณีใด (สเปก PR-1 §7) — ทั้งในเนื้อและใน CSS/คอมเมนต์ที่ฝังไปกับไฟล์
const CUSTOMER_FORBIDDEN = [
  'จุดที่ติดตั้งได้', 'POSSIBLE INSTALL SPOTS', 'จุดที่เลือก', 'RQ-', 'DL-', 'packageSizeSuggested', 'packageNote',
  'ระบบเสนอ', 'สูตร', 'ฉบับภายใน', 'ตำแหน่ง', 'INTERNAL', 'ภาคผนวก', 'ข้อมูลภายใน', 'เหตุผลที่ตัด', 'ยอดก่อนหน้า',
  'ห้ามส่งลูกค้า', 'ผู้ช่วย', 'ผู้ขอ', 'ดึงผลกลับ', 'ตีกลับ',
];
// ชิ้นของฉบับภายในที่ต้องไม่มีทั้ง markup และกฎ CSS
const CUSTOMER_FORBIDDEN_MARKUP = ['class="band"', 'ipanel', 'igrid', 'istrip', 'sp-b', 'sp-note', 'leadrow', 'sign-last', 'table class="kv"', 'data-m="signs"'];

test('🔴 ฉบับลูกค้า (HTML ทั้งไฟล์): ไม่มีเครื่องหมายของช่องภายในสักตัว ไม่มีคำต้องห้าม ไม่มีชิ้นส่วนของฉบับภายใน', () => {
  const { inputs, leak, allowed } = markedSurveyInputs();
  const { html } = paper(inputs, 'customer');
  for (const [key, marker] of Object.entries(leak)) {
    assert.equal(html.includes(marker), false, `ฉบับลูกค้ารั่ว ${key} (${marker})`);
  }
  for (const word of [...CUSTOMER_FORBIDDEN, ...CUSTOMER_FORBIDDEN_MARKUP]) {
    assert.equal(html.includes(word), false, `ฉบับลูกค้ามีคำ/ชิ้นส่วนต้องห้าม: ${word}`);
  }
  // กันผ่านเพราะกระดาษว่าง — ของที่ลูกค้าต้องเห็นอยู่ครบ
  for (const [key, marker] of Object.entries(allowed)) {
    assert.equal(html.includes(marker), true, `ฉบับลูกค้าขาด ${key} (${marker})`);
  }
});

test('🔴 ฉบับลูกค้าไม่มีทางได้ของภายในแม้ถูกเรียกผิด — view ฉบับลูกค้า + แผนหน้าของฉบับภายใน ก็ยังไม่พิมพ์จุด/ภาคผนวก', () => {
  const { inputs, leak } = markedSurveyInputs();
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  const customer = surveyReportView(built.snapshot, { version: 'customer' });
  const internalLayout = paginateSurveyReport(surveyReportView(built.snapshot, { version: 'internal' }));
  const html = renderSurveyReportHTML({ view: customer, layout: internalLayout, docNo: DOC_NO });
  for (const key of ['spotSelected', 'spotSelectedNote', 'spotThree', 'spotPhotoSelectedSha', 'requestDocNo', 'packageNote', 'recallReason']) {
    assert.equal(html.includes(leak[key]), false, `รั่ว ${key}`);
  }
  for (const word of ['จุดที่ติดตั้งได้', 'POSSIBLE INSTALL SPOTS', 'ฉบับภายใน', 'ภาคผนวก']) assert.equal(html.includes(word), false, word);
});

test('🔴 CSS ของกระดาษ: ไม่มีคอมเมนต์ (เทสต์รั่ว grep ทั้งไฟล์) · ทุกกฎอยู่ใต้ .surveyReport .sheet · ไม่ชนชื่อของเปลือก', () => {
  for (const css of [SURVEY_REPORT_CSS, SURVEY_REPORT_INTERNAL_CSS]) {
    assert.equal(css.includes('/*'), false, 'CSS ต้องไม่มีคอมเมนต์');
    assert.equal(css.includes('.frame'), false, 'ยังเหลือตัวนำของกระดาน');
    const selectors = css.replace(/\{[^}]*\}/g, '\n').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    for (const selector of selectors) assert.match(selector, /^\.surveyReport \.sheet/, `กฎหลุดขอบเขต: ${selector}`);
    for (const clash of ['.sectionLead', '.signed{', '.signed ', '.footer', '.signatures']) assert.equal(css.includes(clash), false, clash);
  }
  // ก้อนของฉบับภายในไม่อยู่ในก้อนร่วม
  for (const rule of ['.band', '.ipanel', '.sp-b', '.leadrow', 'table.kv']) assert.equal(SURVEY_REPORT_CSS.includes(rule), false, rule);
  assert.match(SURVEY_REPORT_RENDERER_VERSION, /^fm-ts-01@\d{4}-\d{2}-\d{2}[a-z]$/);
});

/* ══ ② ฉบับภายใน ═══════════════════════════════════════════════════════ */

test('🔴 ฉบับภายใน: แถบ "ฉบับภายใน — ห้ามส่งลูกค้า" + ท้ายกระดาษ "ฉบับภายใน" ทุกแผ่น · จุดที่ไม่เลือกไม่โผล่ จุดที่เลือกโผล่', () => {
  const { inputs, leak } = markedSurveyInputs();
  const { html, layout } = paper(inputs, 'internal');
  assert.equal(count(html, '<div class="band">'), layout.pageCount);
  assert.equal(count(html, '<span class="band-t">ฉบับภายใน — ห้ามส่งลูกค้า</span>'), layout.pageCount);
  assert.equal(count(html, '<b>ฉบับภายใน</b> · หน้า '), layout.pageCount);
  for (const no of layout.pages.map((p) => p.no)) {
    assert.ok(sheetHtml(html, no).includes('<div class="band">'), `แผ่น ${no} ไม่มีแถบ`);
  }
  assert.equal(html.includes(leak.spotUnselected), false, 'จุดที่ไม่เลือกโผล่');
  assert.equal(html.includes(leak.spotUnselectedNote), false);
  assert.equal(html.includes(leak.spotPhotoUnselectedSha), false, 'รูปของจุดที่ไม่เลือกโผล่');
  assert.equal(html.includes(leak.spotSelected), true);
  assert.equal(html.includes(leak.spotSelectedNote), true);
  assert.equal(html.includes(`su-img:${leak.spotPhotoSelectedSha}`), true);
  assert.equal(html.includes('จุดที่ติดตั้งได้<span> / POSSIBLE INSTALL SPOTS</span>'), true);
  // พื้นที่ที่ตัดออก: อยู่ในภาคผนวก ข เท่านั้น — ไม่มีหน้าพื้นที่ ไม่มีรูป
  assert.equal(html.includes(leak.cutZoneName), true);
  assert.equal(html.includes(leak.cutReason), true);
  assert.equal(html.includes(leak.cutZonePhotoSha), false);
  assert.equal(count(html, 'data-kind="zone"'), 2);
});

/* ══ ③ ทองคำ ═══════════════════════════════════════════════════════════ */

test('🔴 ทองคำ (แฝดสังเคราะห์): ลูกค้า 4 แผ่น · ภายใน 6 แผ่น · คอลัมน์ "หน้า" 2, 3 · หัววิ่งมีแค่เลขที่ · "หน้า x / N"', () => {
  const customer = paper(twin(), 'customer');
  const internal = paper(twin(), 'internal');
  assert.deepEqual(sheets(customer.html).map((s) => s.kind), ['summary', 'zone', 'zone', 'signoff']);
  assert.deepEqual(sheets(internal.html).map((s) => s.kind), ['summary', 'zone', 'zone', 'signoff', 'appendix', 'appendix']);

  for (const { html, layout, view } of [customer, internal]) {
    // คอลัมน์ "หน้า" = ช่องสุดท้ายของแต่ละแถวในตารางหน้า 1
    const table = sheetHtml(html, 1).split('data-m="table"')[1];
    const lastCells = [...table.matchAll(/<td class="ctr">(\d+)<\/td>\s*<\/tr>/g)].map((m) => Number(m[1]));
    assert.deepEqual(lastCells, [2, 3]);
    // หัววิ่ง: หน้า 2+ ทุกหน้า ขวามือ = เลขที่เอกสารอย่างเดียว (ไม่มีชื่อลูกค้า ไม่มีเลขคำร้อง)
    assert.equal(count(html, `<div class="rh-ref">${DOC_NO}</div>`), layout.pageCount - 1);
    assert.equal(count(html, '<header class="dh">'), 1);
    for (let no = 2; no <= layout.pageCount; no += 1) {
      const header = sheetHtml(html, no).split('<header class="rh">')[1].split('</header>')[0];
      assert.equal(header.includes(view.party.customerName), false, `หัววิ่งหน้า ${no} มีชื่อลูกค้า`);
      assert.equal(/RQ-|DL-/.test(header), false);
    }
    for (let no = 1; no <= layout.pageCount; no += 1) {
      assert.ok(sheetHtml(html, no).includes(`หน้า ${no} / ${layout.pageCount}</span>`), `ท้ายกระดาษหน้า ${no}`);
      assert.ok(sheetHtml(html, no).includes(`เลขที่ <span class="df-no">${DOC_NO}</span>`));
    }
    assert.ok(html.includes('FM-TS-01: Rev. No.00.'), 'บรรทัดแบบฟอร์ม');
    assert.ok(html.includes('<dt>เลขที่</dt><dd class="dh-no">SU-26090001-0</dd>'));
    assert.ok(html.includes('<dt>วันที่ออก</dt><dd>26/09/2026</dd>'));
    assert.ok(html.includes('173.31') && html.includes('949.75'));
    // ช่องขนาดของแถวรวม: บรรทัดเดียวห้ามตัด (แผนเป็นคนตัดบรรทัด — `page.mix`)
    assert.ok(html.includes('<td class="ctr"><span class="nw">SM 1 · ST 1</span></td>'));
    assert.ok(html.includes('12:00 น. <span class="nw">(ตามนัด)</span>'));
    // บรรทัด "ต่อหน้า" ของหน้าพื้นที่ — หน้าสุดท้ายของพื้นที่ชี้ไปหน้าการรับรองผล
    assert.ok(sheetHtml(html, 3).includes('<p class="cont">ต่อหน้า 4 · การรับรองผลประเมิน</p>'));
  }
  // ฉบับลูกค้า: หน้าสุดท้าย = การรับรองผลอย่างเดียว · ฉบับภายใน: ภาคผนวกสองหน้า หน้าแรกชี้ไป ง + จ
  assert.ok(sheetHtml(internal.html, 5).includes('<p class="cont">ต่อหน้า 6 · ง. หมายเหตุภายใน · จ. การลงนามภายใน</p>'));
  assert.ok(sheetHtml(internal.html, 6).includes('ภาคผนวก — ข้อมูลภายใน (ต่อ)<span> / INTERNAL APPENDIX (CONT.)</span>'));
});

test('หน้า 1: กล่องการประเมินไม่มีผู้อนุมัติ · ไม่มีการ์ดสรุป/วัตถุประสงค์/ขอบเขต · ไม่มีเครื่อง รุ่น ราคา ในเนื้อกระดาษ', () => {
  for (const version of ['customer', 'internal']) {
    const { html } = paper(twin(), version);
    const first = sheetHtml(html, 1);
    const surveyBox = first.split('การประเมิน<span> / SURVEY</span>')[1].split('</dl>')[0];
    assert.deepEqual([...surveyBox.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]), ['วันที่', 'เวลา', 'ผู้ประเมิน']);
    const body = html.slice(html.indexOf('<body>'));
    for (const word of ['วัตถุประสงค์', 'ขอบเขตและวิธีการ', 'class="stat', 'รุ่นเครื่อง', 'ราคา', 'บาท']) {
      assert.equal(body.includes(word), false, `${version}: ${word}`);
    }
  }
});

test('การรับรองผล: ที่นั่งลูกค้า = ลงชื่อ · ( ) · วันที่ + คำบรรยาย เท่านั้น · สองที่นั่งแรกประทับชื่อและวันที่', () => {
  const { html, view } = paper(twin(), 'customer');
  const page = sheetHtml(html, 4);
  assert.equal(count(page, '<div class="sig su-signed">'), 2);
  assert.ok(page.includes(`<div class="sig-name">${view.signoff.assessor.name}</div>`));
  assert.ok(page.includes(`<div class="sig-name">${view.signoff.approver.name}</div>`));
  assert.ok(page.includes('ยืนยันข้อมูลหน้างาน <span class="nw">ไม่ใช่การสั่งซื้อ</span>'));
  const form = page.split('<div class="sig-form">')[1].split('</div>')[0];
  assert.deepEqual([...form.matchAll(/<span class="lb">([^<]+)<\/span>/g)].map((m) => m[1]), ['ลงชื่อ', '(', 'วันที่']);
  assert.equal(page.includes('ตำแหน่ง'), false);
  // หน้านี้มีแค่การรับรองผล — ไม่มีตาราง ไม่มีบรรทัดอื่น
  assert.equal(page.includes('<table'), false);
});

/* ══ ④ รูป ═════════════════════════════════════════════════════════════ */

test('รูป: ตั้งต้นเป็น token su-img:<sha> · แปลงครบแล้วไม่เหลือ token · กระดาษไม่มี /api/', () => {
  const { html, view } = paper(twin(), 'internal');
  const shas = surveyReportImageShas(html);
  const expected = new Set(view.zones.flatMap((z) => [
    ...z.wide.map((w) => w.img.sha), z.plan?.sha, ...z.spots.map((s) => s.img?.sha),
  ]).filter(Boolean));
  assert.deepEqual(new Set(shas), expected);
  assert.equal(html.includes('/api/'), false);

  const resolved = resolveImageTokens(html, (sha) => `data:image/jpeg;base64,${sha.slice(0, 8)}`);
  assert.equal(resolved.includes('su-img:'), false);
  assert.equal(surveyReportImageShas(resolved).length, 0);
  // ตัวแปลงที่หารูปไม่เจอ = token ค้างไว้ให้ผู้เรียกเห็น (ไม่เงียบเป็นกล่องว่าง)
  const partial = resolveImageTokens(html, (sha) => (sha === shas[0] ? 'data:x' : null));
  assert.deepEqual(surveyReportImageShas(partial), shas.slice(1));
  assert.equal(surveyReportImageToken({ sha: null }), null);
  assert.equal(resolveImageTokens(null, () => 'x'), '');
});

test('รูปที่ไม่มี src (ร่างก่อนเตรียมรูป) = กล่อง "ไม่มีภาพ" · ไม่มีรูปกว้าง/ไม่มีผัง = กล่องบอกว่าไม่มี — หน้ายังทรงเดิม', () => {
  const none = paper(twin(), 'internal', { imageSrc: () => null });
  assert.equal(none.html.includes('<img src="su-img:'), false);
  assert.ok(count(none.html, '<span class="ph-none">ไม่มีภาพ</span>') >= 5);
  assert.equal(count(none.html, '<span class="sp-b">'), 3, 'เลขจุดยังอยู่บนกล่องว่าง');

  // ผังที่มีในภาพนิ่งแต่ยังไม่มี src = กล่องผังเต็มขนาดตามแผน (ไม่ใช่กล่องเตี้ยของ "ไม่มีผัง")
  assert.ok(none.html.includes('<div class="ph-box zp-plan" data-m="plan"><span class="ph-none">ไม่มีผัง</span></div>'));
  assert.equal(none.html.includes('zp-plan none'), false);

  // ไม่มีภาพผังเลย (โหมดร่าง — ด่านตรึงบังคับผัง): กล่องเตี้ยไม่ยืด ทั้งส่วนไม่ยืด
  const bare = paper(stressSurveyInputs({ zones: [{ wide: 0, plan: 0, spots: 0 }] }), 'customer', { mode: 'draft' });
  const page = sheetHtml(bare.html, 2);
  assert.ok(page.includes('<span class="ph-none">ไม่มีภาพกว้าง</span>'));
  assert.ok(page.includes('<section class="zs zs-plan none">'));
  assert.ok(page.includes('<div class="ph-box zp-plan none" data-m="plan"><span class="ph-none">ไม่มีผัง</span></div>'));
  assert.equal(bare.layout.pages[1].planHeight, SURVEY_REPORT_PX.zone.planNone);
});

test('รูปในกล่อง 226×170: เติมเต็มกล่อง (cover) เฉพาะรูปแนวนอนใกล้ 4:3 — รูปแนวตั้ง/16:9/ไม่รู้ขนาด เห็นครบทั้งรูป (contain)', () => {
  const boxOf = (w, h) => {
    const inputs = stressSurveyInputs({ zones: [{ wide: 1, spots: 1 }] });
    for (const key of Object.keys(inputs.imageByAttId)) if (!/-p\d+$/.test(key)) inputs.imageByAttId[key] = { ...inputs.imageByAttId[key], w, h };
    const { html } = paper(inputs, 'internal');
    return [...html.matchAll(/<div class="ph-box( cover)? shot"><img/g)].map((m) => Boolean(m[1]));
  };
  assert.deepEqual(boxOf(1400, 1051), [true, true]);   // 4:3 (ของจริงทุกรูป) — หน้าตาเท่ากระดาน
  assert.deepEqual(boxOf(1500, 1000), [true, true]);   // 3:2 ตัดขอบข้าง 11%
  assert.deepEqual(boxOf(1051, 1400), [false, false]); // แนวตั้ง — เดิมเสียบนล่างรวม 43%
  assert.deepEqual(boxOf(1000, 1000), [false, false]);
  assert.deepEqual(boxOf(1920, 1080), [false, false]); // 16:9 — cover จะตัดขอบข้าง 25%
  assert.deepEqual(boxOf(null, null), [false, false]);
});

/* ══ ⑤ กระดาษเดินตามแผนหน้า ═══════════════════════════════════════════ */

const STRESS = {
  helpers: 2, history: 14,
  body: Array.from({ length: 5 }, (_, i) => `บรรทัดที่ ${i + 1} ${thaiText(80)}`).join('\n'),
  zones: [
    { name: 'โถงต้อนรับ', floor: 'G', wide: 7, spots: 5, spotNotes: true, note: thaiText(300) },
    { name: 'ห้องประชุม', floor: '2', parts: 3, wide: 2, spots: 2 },
    { name: 'ร้านค้าที่ยกเลิก', floor: '1', status: 'cut' },
    ...Array.from({ length: 10 }, (_, i) => ({ name: `ห้องทำงาน ${i + 1}`, floor: String(3 + i), wide: 1, spots: i % 3 })),
  ],
};

test('กระดาษเดินตามแผนหน้า: หนึ่งแผ่นต่อหนึ่งหน้าของแผน ชนิดตรงกัน เลขหน้าเรียง — ทั้งสองฉบับ (ชุดสุดขอบ)', () => {
  for (const version of ['customer', 'internal']) {
    const { html, layout } = paper(stressSurveyInputs(STRESS), version);
    assert.deepEqual(sheets(html), layout.pages.map((p) => ({ no: p.no, kind: p.kind })));
    assert.equal(count(html, '<article'), layout.pageCount, 'แผ่นเป็น <article> ตัวเดียว — ข้างในไม่มี <article> ซ้อน');
    assert.equal(count(html, '</article>'), layout.pageCount);
    // บรรทัด "ต่อหน้า n" ของทุกหน้าที่แผนสั่ง พิมพ์ครั้งเดียวบนหน้านั้น
    for (const page of layout.pages) {
      if (page.cont) assert.equal(count(sheetHtml(html, page.no), `>${page.cont.text}</p>`), 1, `หน้า ${page.no}`);
      else assert.equal(/class="cont(-in)?"/.test(sheetHtml(html, page.no)), false, `หน้า ${page.no} ไม่ควรมีบรรทัดต่อ`);
    }
  }
});

test('ตารางหน้า 1 ที่ล้น: หน้า 1 ไม่มีแถวรวม + บรรทัดต่อใต้ตาราง · หน้า (ต่อ) ซ้ำหัวข้อกับหัวตาราง · แถวครบ ไม่ซ้ำ · เลขสองหลักไม่ตัดบรรทัด', () => {
  const { html, layout, view } = paper(stressSurveyInputs(STRESS), 'customer');
  const tablePages = layout.pages.filter((p) => p.kind === 'summary' || p.kind === 'summaryCont');
  assert.ok(tablePages.length >= 2);
  const first = sheetHtml(html, 1);
  assert.equal(first.includes('<tr class="tot">'), false);
  assert.match(first, /<p class="cont-in">ต่อหน้า 2 · พื้นที่ \d+–12 และยอดรวม<\/p>/);
  const cont = sheetHtml(html, 2);
  assert.ok(cont.includes('1. พื้นที่ที่ประเมินและข้อเสนอ (ต่อ)<span> / ZONES &amp; RECOMMENDATION (CONT.)</span>'));
  assert.ok(cont.includes('<th class="ctr no" style="width:30px;">#</th>'));
  const numbers = tablePages.flatMap((p) => [...sheetHtml(html, p.no).matchAll(/<td class="ctr no">(\d+)<\/td>/g)].map((m) => Number(m[1])));
  assert.deepEqual(numbers, view.table.rows.map((r) => r.no));
  assert.equal(count(html, '<tr class="tot">'), 1 + count(html, '<table class="t cp">'), 'แถวรวมของตารางหน้า 1 พิมพ์ครั้งเดียว');
});

test('หน้า (ต่อ) ของพื้นที่: หัวข้อและชื่อพื้นที่มี "(ต่อ)" · ไม่มีผัง · พื้นที่หลายส่วนมีตารางส่วนข้างผัง', () => {
  const { html, layout } = paper(stressSurveyInputs(STRESS), 'internal');
  const contPage = layout.pages.find((p) => p.kind === 'zoneCont');
  assert.ok(contPage, 'ชุดสุดขอบต้องมีหน้า (ต่อ)');
  const page = sheetHtml(html, contPage.no);
  assert.ok(page.includes('2. รายละเอียดรายพื้นที่ (ต่อ)<span> / ZONE DETAILS (CONT.)</span>'));
  // ชื่อ + ท่อนท้ายที่ห้ามตัด ("· ชั้น G (ต่อ)") เกาะคำสุดท้ายของชื่อ — เลขชั้นไม่ตกบรรทัดใหม่ตัวเดียว
  assert.match(page, /<h4 class="zh-t">[^<]+<span class="nw">&nbsp;· ชั้น G \(ต่อ\)<\/span><\/h4>/);
  assert.ok(sheetHtml(html, layout.zonePage[1]).includes('<span class="nw">&nbsp;· ชั้น G</span></h4>'));
  assert.equal(page.includes('zp-plan'), false);
  // หน้าพื้นที่หน้าแรกของเล่มเท่านั้นที่หัวข้อไม่มี "(ต่อ)"
  assert.equal(count(html, '2. รายละเอียดรายพื้นที่<span> / ZONE DETAILS</span>'), 1);
  const parts = sheetHtml(html, layout.zonePage[2]);
  assert.ok(parts.includes('<div class="zp-plan-row">') && parts.includes('<table class="t cp">'));
  assert.ok(parts.includes('<td>ส่วน A</td>') && parts.includes('<tr class="tot"><td>รวม</td>'));
  // หัวพื้นที่ของพื้นที่หลายส่วน: ยอดรวมอย่างเดียว ไม่มีขนาด ก×ย×ส
  assert.equal(/<span class="zh-m"><span class="zh-d">/.test(parts), false);
});

test('ภาคผนวกหลายหน้า: ตารางที่ต่อซ้ำหัวข้อ "(ต่อ)" + หัวตาราง · แถวรวม/เชิงอรรถ/ผู้เคาะ พิมพ์ครั้งเดียว · จ อยู่หน้าสุดท้าย', () => {
  const { html, layout, view } = paper(stressSurveyInputs(STRESS), 'internal');
  const pages = layout.pages.filter((p) => p.kind === 'appendix');
  assert.ok(pages.length >= 3);
  assert.equal(count(html, '<p class="hmeta">ผู้เคาะและส่งผล:'), 1);
  assert.equal(count(html, '<p class="fn">'), 1);
  assert.equal(count(html, '<p class="count">'), 1);
  assert.equal(count(html, 'data-m="signs"'), 1);
  assert.ok(sheetHtml(html, layout.pageCount).includes('data-m="signs"'));
  const continued = pages.flatMap((p) => p.blocks).filter((b) => b.continued);
  assert.ok(continued.length >= 1);
  assert.ok(html.includes('(ต่อ)<span> / SEND-BACK &amp; RECALL (CONT.)</span>'));
  // ทุกแถวของ ก และ ค พิมพ์ครบ ไม่ซ้ำ
  assert.equal(count(html, '<td class="ctr no">') , view.table.rows.length + view.appendix.decisions.rows.length);
  assert.equal([...html.matchAll(/<td>\d{2}\/\d{2}\/\d{4} <span class="nw">\d{2}:\d{2}<\/span><\/td>/g)].length, view.appendix.history.length);
});

test('ภาคผนวกว่าง (ไม่มีพื้นที่ตัด/เพิ่ม ไม่มีประวัติ) = แถวบอกว่าไม่มี — หัวข้อกับหัวตารางไม่หาย', () => {
  const { html } = paper(stressSurveyInputs({ zones: [{ spots: 1 }] }), 'internal');
  assert.ok(html.includes('<td class="empty" colspan="3">ไม่มีพื้นที่ที่ตัดออกหรือเพิ่มในรอบนี้</td>'));
  assert.ok(html.includes('<td class="empty" colspan="5">ไม่มีการตีกลับหรือดึงกลับ</td>'));
  assert.ok(html.includes('ค. ประวัติตีกลับและดึงกลับ<span> / SEND-BACK &amp; RECALL</span>'));
});

/* ══ ⑥ ของที่แผนตัดเอง — ตัวเรนเดอร์พิมพ์ตามแผนทุกตัวอักษร ═══════════════ */

test('🔴 ช่องขนาดของแถวรวม: พิมพ์ทีละบรรทัดตามแผน แบบห้ามตัด — ตัวคั่นค้างท้ายบรรทัดบน (ตารางหน้า 1 และภาคผนวก ก)', () => {
  const zones = Array.from({ length: 9 }, (_, i) => ({ size: ['XS', 'XL', 'ST'][i] }));
  const customer = paper(stressSurveyInputs({ zones }), 'customer');
  assert.deepEqual(customer.layout.pages[0].mix, ['XS 1 · SM 6 ·', 'ST 1 · XL 1']);
  assert.ok(sheetHtml(customer.html, 1).includes(
    '<td class="ctr"><span class="ln nw">XS 1 · SM 6 ·</span><span class="ln nw">ST 1 · XL 1</span></td>',
  ));
  const internal = paper(stressSurveyInputs({ zones }), 'internal');
  assert.ok(internal.html.includes(
    '<td class="ctr"><span class="ln nw">XS 1 ·</span><span class="ln nw">SM 6 · ST 1 ·</span><span class="ln nw">XL 1</span></td>',
  ), 'แถวรวมของภาคผนวก ก (ช่องแคบกว่า)');
  // ไม่มีบรรทัดไหนขึ้นต้นด้วยตัวคั่น และเชิงอรรถของ ก พิมพ์ตามบรรทัดของแผน
  assert.equal(/<span class="ln nw">·/.test(internal.html), false);
  assert.ok(internal.html.includes('<p class="fn"><span class="ln nw">ขนาดที่ระบบเสนอ: ไม่เกิน 300 ลบ.ม. = SM · '));
});

test('🔴 หน้า 1 ที่แถวแรกไม่พอ: ไม่มีหัวข้อ/หัวตารางเปล่า · บรรทัด "ต่อหน้า 2" ชิดล่าง · หน้า 2 เริ่มตารางโดยหัวข้อไม่มี "(ต่อ)"', () => {
  const { html, layout } = paper(stressSurveyInputs({ zones: [{ parts: 20 }, {}, {}] }), 'internal');
  assert.equal(layout.pages[0].table, false);
  const first = sheetHtml(html, 1);
  assert.equal(first.includes('data-m="table"'), false);
  assert.equal(first.includes('1. พื้นที่ที่ประเมินและข้อเสนอ'), false);
  assert.ok(first.includes('<p class="cont">ต่อหน้า 2 · พื้นที่ 1–3 และยอดรวม</p>'));
  assert.ok(first.includes('<section class="party">') && first.includes('<div class="ipanel">'));
  const second = sheetHtml(html, 2);
  assert.ok(second.includes('1. พื้นที่ที่ประเมินและข้อเสนอ<span> / ZONES &amp; RECOMMENDATION</span>'));
  assert.ok(second.includes('<tr class="tot">'));
  assert.equal(count(html, 'data-m="table"'), 1);
});

/** ข้อความของช่องเหตุผล/ค่าที่ถูกพิมพ์ ต่อกันทุกหน้า (ถอด escape แล้ว) */
const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

test('🔴 ภาคผนวก ค: เหตุผลที่ยาวเกินหน้าพิมพ์ต่อหน้าถัดไปในแถว "เหตุการณ์ (ต่อ)" — ทุกตัวอักษรพิมพ์ครั้งเดียว ไม่มีท่อนหาย', () => {
  const inputs = stressSurveyInputs({ zones: [{}, {}], history: 3, sendBack: { items: 10, length: 300 } });
  const { html, layout, view } = paper(inputs, 'internal');
  assert.deepEqual(layout.overflow, []);
  const reason = view.appendix.history[1].reason;
  assert.ok(reason.length > 3000);
  // แถวแรกพิมพ์ครบทุกช่อง · ท่อนที่ต่อมาเหลือ "เหตุการณ์ (ต่อ)" กับเหตุผล
  const cont = [...html.matchAll(/<tr>\s*<td><\/td>\s*<td>ตีกลับให้ช่างแก้ \(ต่อ\)<\/td>\s*<td><\/td>\s*<td>([^<]*)<\/td>\s*<td><\/td>\s*<\/tr>/g)].map((m) => unescape(m[1]));
  assert.ok(cont.length >= 2, `แถวต่อ ${cont.length}`);
  const head = unescape(html.match(/<td>ตีกลับให้ช่างแก้<\/td>\s*<td>Head Approver<\/td>\s*<td>([^<]*)<\/td>/)[1]);
  const squash = (text) => text.replace(/\s+/g, '');
  assert.equal(squash([head, ...cont].join('')), squash(reason));
  // วันเวลาของแถวพิมพ์ครั้งเดียวต่อแถว (ท่อนที่ต่อไม่พิมพ์ซ้ำ)
  assert.equal([...html.matchAll(/<td>\d{2}\/\d{2}\/\d{4} <span class="nw">\d{2}:\d{2}<\/span><\/td>/g)].length, view.appendix.history.length);
});

test('🔴 ภาคผนวก ง: ย่อหน้า 4,000 ตัวพิมพ์ต่อหน้าถัดไปในแถว "(ต่อ)" — ทุกตัวอักษรพิมพ์ครั้งเดียว', () => {
  const body = thaiText(4000);
  const { html, layout } = paper(stressSurveyInputs({ zones: [{}, {}], body }), 'internal');
  assert.deepEqual(layout.overflow, []);
  const cells = [...html.matchAll(/<tr><th>รายละเอียดคำร้อง <span class="nw">\(ฝ่ายขาย\)<\/span>(?: \(ต่อ\))?<\/th><td>([^<]*)<\/td><\/tr>/g)].map((m) => unescape(m[1]));
  assert.ok(cells.length >= 2, `ท่อน ${cells.length}`);
  assert.equal(count(html, '<th>รายละเอียดคำร้อง <span class="nw">(ฝ่ายขาย)</span></th>'), 1);
  const squash = (text) => text.replace(/\s+/g, '');
  assert.equal(squash(cells.join('')), squash(body));
});

/* ══ ⑦ อักขระทุกตัวอยู่ในฟอนต์ที่ฝัง ════════════════════════════════════ */

/** ช่วงอักขระที่ฟอนต์ Sarabun ซึ่งฝังในกระดาษประกาศไว้ (`unicode-range` ของทุก @font-face) */
function embeddedRanges() {
  const ranges = [];
  for (const m of DOCUMENT_FONT_FACE_CSS.matchAll(/unicode-range:([^;}]+)/g)) {
    for (const part of m[1].split(',')) {
      const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
      ranges.push([parseInt(from, 16), parseInt(to || from, 16)]);
    }
  }
  return ranges;
}

/** ข้อความที่ถูกวาดด้วยฟอนต์ของกระดาษ — ตัด <style>/<script>/<svg>/<title> แท็ก และถอด entity */
function renderedText(html) {
  return unescape(html
    .replace(/<(style|script|svg|title)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, '\u00a0'));
}

const REAL_FIXTURE = process.env.SURVEY_REPORT_FIXTURE
  || join(homedir(), 'ss-team', 'mockups', 'survey-report-doc', 'real', 'fixture.json');

test('🔴 ทุกอักขระของกระดาษอยู่ในช่วงของฟอนต์ที่ฝัง (ของจริง · แฝดสังเคราะห์ · ชุดสุดขอบ · สองฉบับ) — ไม่มี "≤" "⇒" ที่ตกไปฟอนต์ของเครื่อง', () => {
  const ranges = embeddedRanges();
  assert.ok(ranges.length >= 20 && ranges.some(([a, b]) => a <= 0x0e01 && b >= 0x0e5b), 'อ่าน unicode-range ของฟอนต์ไม่ได้');
  const inRange = (code) => code === 0x0a || code === 0x0d || code === 0x09 || ranges.some(([a, b]) => code >= a && code <= b);
  const sets = [
    ['twin', twin(), 'freeze'],
    ...surveyStressCases().map((c) => [c.name, stressSurveyInputs(c.spec), c.mode]),
    ['marked', markedSurveyInputs().inputs, 'freeze'],
    // งวด S5 — ป้ายและเลขของแถว "ยืนยันผลจากแบบของ" (ฉบับภายใน)
    ['confirm', surveyReportInputsFromFixture(confirmSurveyFixture()), 'freeze'],
  ];
  // ไฟล์ของจริงอยู่นอกรีโป (ชื่อลูกค้าจริง) — มีก็ตรวจด้วย ไม่มีก็ข้ามเฉพาะชุดนั้น
  if (existsSync(REAL_FIXTURE)) sets.push(['real', surveyReportInputsFromFixture(JSON.parse(readFileSync(REAL_FIXTURE, 'utf8'))), 'freeze']);
  for (const [label, inputs, mode] of sets) {
    for (const version of ['customer', 'internal']) {
      const { html } = paper(inputs, version, { mode });
      const bad = new Set();
      for (const ch of renderedText(html)) if (!inRange(ch.codePointAt(0))) bad.add(`${ch} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
      assert.deepEqual([...bad], [], `${label}/${version}: อักขระนอกฟอนต์ที่ฝัง`);
    }
  }
  // กันเทสต์ผ่านเพราะตัวตรวจไม่เห็นอะไร — สองตัวที่เคยหลุดต้องถูกจับ
  assert.equal(inRange('≤'.codePointAt(0)), false);
  assert.equal(inRange('⇒'.codePointAt(0)), false);
  assert.equal(inRange('×'.codePointAt(0)) && inRange('—'.codePointAt(0)) && inRange('·'.codePointAt(0)), true);
});

/* ══ อื่น ๆ ═════════════════════════════════════════════════════════════ */

test('ข้อความจากผู้ใช้ถูก escape · ไม่มีเลขที่/วันที่ออก = ขีด · ชื่อไฟล์ตามฉบับ', () => {
  const inputs = stressSurveyInputs({ zones: [{ name: '<script>alert(1)</script> & "ห้อง"', note: '<b>หนา</b>' }] });
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  const view = surveyReportView(built.snapshot, { version: 'customer' });
  const html = renderSurveyReportHTML({ view, layout: paginateSurveyReport(view) });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;ห้อง&quot;'));
  assert.ok(html.includes('&lt;b&gt;หนา&lt;/b&gt;'));
  assert.ok(html.includes('<dt>เลขที่</dt><dd class="dh-no">—</dd>'));
  assert.ok(html.includes('<dt>วันที่ออก</dt><dd>—</dd>'));
  assert.equal(html.includes('<script'), false, 'กระดาษไม่มีสคริปต์');

  const customer = paper(twin(), 'customer');
  const internal = paper(twin(), 'internal');
  // ชื่อลูกค้าของแฝดสังเคราะห์ยาวเท่าของจริง (เกินเพดานไบต์ของชื่อไฟล์) — ป้ายฉบับต้องรอด ชื่อลูกค้าเป็นฝ่ายถูกตัด
  assert.match(customer.html, /<title>SU-26090001-0_[^<]*_ประเมินพื้นที่<\/title>/);
  assert.match(internal.html, /<title>SU-26090001-0_[^<]*_ประเมินพื้นที่_ภายใน<\/title>/);
  // ชื่อลูกค้าถูกตัดที่เดียวกันทั้งสองฉบับ — สองชื่อไฟล์ต่างกันแค่ป้าย `_ภายใน`
  const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(titleOf(internal.html), `${titleOf(customer.html)}_ภายใน`);
  assert.throws(() => renderSurveyReportHTML({ view: customer.view }), /view and layout/);
});

test('ลายน้ำ: ส่งข้อความ = ทุกแผ่น · ไม่ส่ง = ไม่มี แล้วประทับทีหลังด้วย stampWatermark ของเปลือกได้ (ไม่ซ้อนสองชั้น)', () => {
  const clean = paper(twin(), 'customer');
  assert.equal(clean.html.includes('<div class="watermark">'), false);
  const draft = paper(twin(), 'customer', { watermark: 'ฉบับร่าง' });
  assert.equal(count(draft.html, '<div class="watermark">ฉบับร่าง</div>'), 4);
  const stamped = stampWatermark(clean.html, 'ถูกแทนที่ด้วย SU-26090001-1');
  assert.equal(count(stamped, '<div class="watermark">'), 4);
  assert.equal(stampWatermark(draft.html, 'อื่น'), draft.html);
});

test('สองฉบับจากภาพนิ่งเดียว: ส่วนที่ใช้ร่วมกัน (กล่องลูกค้า · หัวพื้นที่ · หมายเหตุพื้นที่ · ที่นั่งรับรอง) พิมพ์ตรงกันทุกตัวอักษร', () => {
  const customer = paper(twin(), 'customer');
  const internal = paper(twin(), 'internal');
  const pick = (html, open, close) => html.split(open)[1].split(close)[0];
  assert.equal(pick(customer.html, '<section class="party">', '</section>'), pick(internal.html, '<section class="party">', '</section>'));
  assert.equal(pick(customer.html, '<section class="signoff"', '</section>'), pick(internal.html, '<section class="signoff"', '</section>'));
  for (const zone of [1, 2]) {
    const head = (html) => pick(html, `<div class="zp" data-zone="${zone}">`, '<section class="zs">');
    assert.equal(head(customer.html), head(internal.html));
  }
  assert.deepEqual(
    [...customer.html.matchAll(/<p class="note">.*?<\/p>/g)].map((m) => m[0]),
    [...internal.html.matchAll(/<p class="note">.*?<\/p>/g)].map((m) => m[0]),
  );
});

/* ══ ⑥ สีชื่อเอกสารเดินตามฉบับ (มติเจ้าของ 08/10/2026) ═════════════════════
   กระดาษที่ออกนอกบริษัทใช้สีใบเสนอราคา · กระดาษภายในใช้สีใบสั่งขาย — แทน teal ตายตัวของกระดานที่อนุมัติ
   ค่าสีเขียนตายตัวที่นี่โดยเจตนา (ตัวเลขของมติ): คีย์ถูกแต่เฉดในเครื่องยนต์ถูกแก้ ก็ต้องล้ม */

const QUOTATION_ACCENT = '#ad5d43';
const SALES_ORDER_ACCENT = '#1e6091';
const BOARD_TEAL = '#0f766e';
/** สีที่เปลือกประกาศให้กระดาษทั้งใบ (`--doc-accent` บนกล่อง `.document`) */
const shellAccent = (html) => html.match(/<div class="document surveyReport" style="--doc-accent:(#[0-9a-f]{6});">/)?.[1] ?? null;

test('🔴 สีชื่อเอกสาร: ฉบับลูกค้า = สีใบเสนอราคา · ฉบับภายใน = สีใบสั่งขาย — เลือกจากฉบับของ view เอง · ไม่มี teal ทั้งไฟล์', () => {
  const customer = paper(twin(), 'customer');
  const internal = paper(twin(), 'internal');
  assert.equal(shellAccent(customer.html), QUOTATION_ACCENT);
  assert.equal(shellAccent(internal.html), SALES_ORDER_ACCENT);

  // ที่มาของสองสีคือ "สีของ QT / สีของ SO" — เทียบกับ **สีตั้งต้น** ของสองชนิดนั้น และกับตัวกลางของกติกา
  // (คีย์ตายตัว: มาตรฐานที่เผยแพร่ของ QT/SO เปลี่ยนสีได้โดยกระดาษนี้ไม่ตาม — `documentAudience.test.mjs`)
  assert.equal(surveyReportAccentKey('customer'), resolveDocumentAccentKey(null, 'quotation'));
  assert.equal(surveyReportAccentKey('internal'), resolveDocumentAccentKey(null, 'salesOrder'));
  assert.deepEqual(DOCUMENT_AUDIENCES, ['external', 'internal']);
  assert.equal(surveyReportAudience('customer'), 'external');
  assert.equal(surveyReportAudience('internal'), 'internal');
  for (const version of ['customer', 'internal']) {
    assert.equal(surveyReportAccentKey(version), documentAudienceAccentKey(surveyReportAudience(version)), version);
  }
  // ฉบับที่ไม่ใช่ `internal` = กระดาษที่ออกนอกบริษัท (เกณฑ์เดียวกับที่ตัวเรนเดอร์ใช้เลือกฝัง CSS ของฉบับภายใน)
  for (const odd of [undefined, null, '', 'INTERNAL', 'draft']) assert.equal(surveyReportAudience(odd), 'external', String(odd));

  // ทุกทรงของกระดาษได้สีตามฉบับ: ลายน้ำ (ใบร่าง/ใบตัวอย่าง) · ไม่มีเลขที่ · ชุดสุดขอบ · โหมดร่าง
  const want = { customer: QUOTATION_ACCENT, internal: SALES_ORDER_ACCENT };
  const papers = [];
  for (const version of ['customer', 'internal']) {
    papers.push([version, paper(twin(), version, { watermark: 'ฉบับร่าง', docNo: null }).html]);
    papers.push([version, paper(markedSurveyInputs().inputs, version).html]);
    for (const c of surveyStressCases()) papers.push([version, paper(stressSurveyInputs(c.spec), version, { mode: c.mode }).html]);
  }
  assert.ok(papers.length > 6);
  for (const [version, html] of [['customer', customer.html], ['internal', internal.html], ...papers]) {
    assert.equal(shellAccent(html), want[version], version);
    // ประกาศสีที่เดียวต่อไฟล์ — ไม่มีชิ้นไหนของกระดาษตั้งสีทับเอง
    assert.equal(count(html, 'style="--doc-accent:'), 1, version);
    // 🔴 teal ของกระดานเดิมต้องไม่เหลือทั้งไฟล์ (รวม CSS ที่ฝัง) — "#" ไม่อยู่ในชุดอักขระ base64 ของฟอนต์ จึง grep ทั้งไฟล์ได้
    assert.equal(html.toLowerCase().includes(BOARD_TEAL), false, `${version}: ยังมี teal ในกระดาษ`);
    /* สีของอีกฉบับต้องไม่ปนมา: ฉบับลูกค้าไม่มีสีใบสั่งขายสักที่ · ฉบับภายในมีสีใบเสนอราคาที่เดียวคือค่าตั้งต้นใน CSS ของเปลือก
       (`.document { --doc-accent: … }` — เอกสารทุกชนิดพกบรรทัดนี้) ซึ่งแพ้ `style` บนกล่อง `.document` เสมอ */
    assert.equal(count(html, SALES_ORDER_ACCENT), version === 'internal' ? 1 : 0, `${version}: สีใบสั่งขาย`);
    assert.equal(count(html, QUOTATION_ACCENT), version === 'internal' ? 1 : 2, `${version}: สีใบเสนอราคา`);
    assert.equal(count(html, `--doc-accent: ${QUOTATION_ACCENT};`), 1, `${version}: ค่าตั้งต้นของเปลือก`);
  }
});

test('สีไปถึงกระดาษที่เดียวคือชื่อเอกสารหน้า 1 · รุ่นตัวเรนเดอร์ขยับแล้ว', () => {
  // ผู้อ่านของ `--doc-accent` ใน CSS ของกระดาษ = `--accent` ตัวเดียว และผู้อ่านของ `--accent` = ชื่อเอกสาร + เส้นซ้ายของกล่องหมายเหตุ
  // (งวด S3 · กระดาน C1 — กล่องหมายเหตุมีเฉพาะใบที่มีพื้นที่จากแบบ ⇒ บนใบลงหน้างานสียังไปถึงชื่อเอกสารที่เดียว)
  assert.equal(count(SURVEY_REPORT_CSS, 'var(--doc-accent)'), 1);
  assert.equal(count(SURVEY_REPORT_CSS, 'var(--accent)'), 2);
  assert.deepEqual([...SURVEY_REPORT_CSS.matchAll(/^([^{\n]+)\{[^}]*var\(--accent\)[^}]*\}/gm)].map((m) => m[1]), [
    '.surveyReport .sheet .dh-title', '.surveyReport .sheet .dnote',
  ]);
  assert.match(SURVEY_REPORT_CSS, /\.surveyReport \.sheet \.dh-title\{[^}]*color:var\(--accent\);\}/);
  assert.match(SURVEY_REPORT_CSS, /\.surveyReport \.sheet \.dnote\{[^}]*border-left:2px solid var\(--accent\);[^}]*\}/);
  assert.equal(SURVEY_REPORT_INTERNAL_CSS.includes('--accent'), false, 'ชิ้นของฉบับภายในไม่ใช้สีชื่อเอกสาร');
  // ไม่มีค่าสีของเอกสารเขียนตายตัวใน CSS ของกระดาษ — สีมาจากเปลือกทางเดียว
  for (const css of [SURVEY_REPORT_CSS, SURVEY_REPORT_INTERNAL_CSS]) {
    for (const [key, theme] of Object.entries(DOCUMENT_ACCENT_THEMES)) {
      if (key === 'navy') continue; // กรมท่าเป็นสีหมึกของกระดาษเอง (`--navy`) ไม่ใช่สีชื่อเอกสาร
      assert.equal(css.toLowerCase().includes(theme.accent), false, `CSS ของกระดาษเขียนสี ${key} ตายตัว`);
    }
  }
  const sheet = sheetHtml(paper(twin(), 'customer').html, 1);
  assert.equal(count(sheet, '<h1 class="dh-title">รายงานการประเมินพื้นที่</h1>'), 1);


  // กระดาษที่ตรึงพก CSS กับสีของวันที่ออก — สีเปลี่ยน = รุ่นของตัวเรนเดอร์ต้องไม่ใช่รุ่นของยุค teal
  assert.notEqual(SURVEY_REPORT_RENDERER_VERSION, 'fm-ts-01@2026-10-01b');
  assert.ok(SURVEY_REPORT_RENDERER_VERSION.slice('fm-ts-01@'.length) >= '2026-10-08a', SURVEY_REPORT_RENDERER_VERSION);
});

/* 🔴 ตัวเรนเดอร์ **ไม่มีตัวเลือกสี** — ฉบับหนึ่งพิมพ์สีของอีกฉบับไม่ได้ ไม่ว่าผู้เรียกจะส่งอะไรมา (กันด้วยโครงสร้าง ไม่ใช่ grep)
   เดิมรับ `accentKey` ไว้เป็นจุดเสียบของเทสต์: `{ view: ฉบับลูกค้า, accentKey: 'steel' }` ได้ฉบับลูกค้าสีของฉบับภายใน และคีย์ที่
   ไม่มีธีมบนฉบับภายใน ตกไป terracotta (= สีของฉบับลูกค้า) ผ่านค่าตั้งต้นของเปลือก — ด่านเดียวที่กันคือเทสต์สแกนซอร์สข้างล่าง */
test('🔴 `accentKey` ที่ส่งให้ตัวเรนเดอร์ไม่มีผล — ทุกค่าได้กระดาษตัวเดียวกับที่ไม่ส่ง (สีตามฉบับ) ทั้งสองฉบับ', () => {
  const want = { customer: QUOTATION_ACCENT, internal: SALES_ORDER_ACCENT };
  for (const version of ['customer', 'internal']) {
    const plain = paper(twin(), version).html;
    assert.equal(shellAccent(plain), want[version], version);
    // ทุกคีย์ที่เปลือกมีธีม (รวมสีของอีกฉบับ · teal ของกระดานเดิม) + ค่าที่ไม่มีธีม + ค่าว่าง
    for (const accentKey of [...Object.keys(DOCUMENT_ACCENT_THEMES), 'ไม่มีสีนี้', '', null, undefined, 0, {}]) {
      const html = paper(twin(), version, { accentKey }).html;
      assert.equal(shellAccent(html), want[version], `${version} ← accentKey ${String(accentKey)}`);
      assert.equal(html, plain, `${version} ← accentKey ${String(accentKey)}: กระดาษต้องเหมือนตอนไม่ส่งทุกไบต์`);
    }
  }
  // ตัวที่เคยพิมพ์ผิดสีตรง ๆ (ชื่อไว้ให้อ่านออก): ฉบับลูกค้า + steel · ฉบับภายใน + คีย์ที่ไม่มีธีม (เคยตกไป terracotta)
  assert.equal(shellAccent(paper(twin(), 'customer', { accentKey: 'steel' }).html), QUOTATION_ACCENT);
  assert.equal(shellAccent(paper(twin(), 'internal', { accentKey: 'ไม่มีสีนี้' }).html), SALES_ORDER_ACCENT);
  assert.equal(shellAccent(paper(twin(), 'internal', { accentKey: 'terracotta' }).html), SALES_ORDER_ACCENT);
});

/* ด่านที่สอง (ซอร์ส): ไม่มีผู้เรียกของแอปเขียน `accentKey` ใส่ตัวเรนเดอร์ — ส่งไปก็ถูกทิ้ง (เทสต์ข้างบน) แต่คนอ่านโค้ดจะเข้าใจว่ามีผล
   (ขั้นกระดาษ · เรนเดอร์แห้งของขั้นออกเลข · ใบร่างของ route · ใบตัวอย่างของหน้าตั้งค่า · harness) */
test('🔴 ผู้เรียกตัวเรนเดอร์ทุกตัวในแอปและ harness ไม่ส่ง accentKey — สีมาจากฉบับของ view ทางเดียว', () => {
  const WEBAPP = fileURLToPath(new URL('../../..', import.meta.url));
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.m?js$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w\\])\/\/[^\n]*/g, '$1');
  const callers = [...walk(join(WEBAPP, 'src')), ...walk(join(WEBAPP, 'scripts'))]
    .map((file) => ({ file: file.slice(WEBAPP.length).replace(/^\//, ''), code: strip(readFileSync(file, 'utf8')) }))
    .filter(({ file, code }) => code.includes('renderSurveyReportHTML') && !file.endsWith('lib/service/surveyReportDocument.js'));
  const names = callers.map((c) => c.file);
  // กันเทสต์ผ่านเพราะหาผู้เรียกไม่เจอ — ผู้เรียกที่รู้จักต้องอยู่ครบ
  for (const must of [
    'src/lib/service/surveyReportPaper.js', 'src/lib/service/surveyReportIssue.js', 'src/lib/service/surveyReportPreview.js',
    'src/app/api/service/surveys/[id]/document/route.js', 'scripts/render-survey-report.mjs',
  ]) assert.ok(names.includes(must), `หาผู้เรียก ${must} ไม่เจอ (ได้ ${names.join(' · ')})`);
  for (const { file, code } of callers) assert.doesNotMatch(code, /\baccentKey\b/, `${file} ส่ง accentKey ให้ตัวเรนเดอร์`);
  // ตัวเรนเดอร์เอง: `accentKey` โผล่ที่เดียวคือค่าที่ส่งให้เปลือก ซึ่งถามจากฉบับของ view — ไม่มีพารามิเตอร์ ไม่มีค่าตั้งต้นเป็นชื่อสี
  const renderer = strip(readFileSync(join(WEBAPP, 'src/lib/service/surveyReportDocument.js'), 'utf8'));
  assert.deepEqual(
    renderer.split('\n').filter((row) => /\baccentKey\b/.test(row)).map((row) => row.trim()),
    ['accentKey: surveyReportAccentKey(view.version),'],
  );
  assert.doesNotMatch(renderer, /['"]teal['"]|SURVEY_REPORT_DEFAULT_ACCENT/);
});

/* ══ วัดจริงใน Chrome (เครื่องนักพัฒนา) ════════════════════════════════ */

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH;
const hasChrome = Boolean(CHROME && existsSync(CHROME));

/* งวด S3: ใบจากแบบล้วนที่หัวหน้าหลายคนประเมินคนละพื้นที่ (ชื่อสมมติ) — ชื่อยาว ~220px ตกสองบรรทัดทั้งในกล่องการประเมินและที่นั่ง */
const S3_LONG_HEADS = ['นายสมมติชัย ศรีสุวรรณวัฒนากุลพิพัฒน์', 'นางสาวสมมติพร เจริญรุ่งเรืองกิจไพศาล', 'นายทดสอบ ยาวมากมายหลายพยางค์ดีเยี่ยม'];
function s3HeadsInputs(names) {
  const inputs = stressSurveyInputs({ zones: names.map(() => ({})) });
  inputs.zones.forEach((zone, i) => Object.assign(zone, {
    method: 'drawing', methodChangedAt: '2026-09-26T02:50:00.000+00:00', methodChangedByName: names[i], methodReason: 'ลูกค้าส่งแบบมาแล้ว',
  }));
  inputs.visit = null;
  inputs.request = { ...inputs.request, surveyConfirm: 'needed' };
  return inputs;
}

test('🔴 วัดจริงใน Chrome (แฝดสังเคราะห์ + ชุดสุดขอบทุกกรณี): ไม่มีแผ่นไหนล้น · ขอบล่างจริงไม่เกินแผน · จุดอ้างอิงตรงแผน ±8px', {
  skip: hasChrome ? false : 'ไม่มี PUPPETEER_EXECUTABLE_PATH — ข้าม (CI) · ใช้ scripts/render-survey-report.mjs --assert บนเครื่อง',
}, async () => {
  const { launchBrowser, renderHtmlPdf } = await import('../documents/htmlPdf.js');
  const box = (img) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${img.w} ${img.h}"><rect width="100%" height="100%" fill="#ccc"/></svg>`)}`;
  const TOLERANCE = 8;
  const sets = [
    ['twin', twin(), 'freeze'],
    ['stress-local', stressSurveyInputs(STRESS), 'freeze'],
    // สามขนาด · สี่ขนาด · จำนวนสองหลัก · หน้า 1 ชิดเพดาน · ตีกลับ 10 × 300 · คำร้อง 4,000 ตัว · ตารางเริ่มหน้า 2 · ไม่มีผัง · รูปแนวตั้ง
    ...surveyStressCases().map((c) => [c.name, stressSurveyInputs(c.spec), c.mode]),
    /* ลายเซ็นจริง (PR-SIG): ช่องรูปสูงตายตัวต้องไม่ขยับความสูงของการรับรองผล (217) กับภาคผนวก จ (161) — แฝดสังเคราะห์ ·
       ชุดสุดขอบ · กรณีของลายเซ็นที่ไม่มีข้อจำกัดที่รู้ (ชื่อสองบรรทัด `sign-wrap` เกินแผนโดยรู้อยู่แล้ว — harness วัดและรายงานเอง) */
    ['twin-signed', signedSurveyInputs(twin()), 'freeze'],
    ['stress-signed', signedSurveyInputs(stressSurveyInputs(STRESS)), 'freeze'],
    ...surveySignCases().filter((c) => !c.known.length).map((c) => [c.name, signedSurveyInputs(c.inputs(), c.sign), c.mode]),
    /* งวด S3 — ใบผสม / จากแบบล้วนของแฝด (กล่องการประเมินหลายบรรทัด · กล่องหมายเหตุ · บรรทัดย่อย · ป้ายหัวพื้นที่ · ไม่มีภาพกว้าง ·
       ที่นั่งผู้ประเมินจากแบบหลายชื่อ ทั้งบรรทัดคำและรูป · ชื่อยาวที่ตกบรรทัด) + fixture ของ BRIEF §B */
    ['s3-mixed', s3Inputs(), 'freeze'],
    ['s3-mixed-nn', s3Inputs({ confirm: 'not_needed' }), 'freeze'],
    ['s3-drawing', s3Inputs({ which: [0, 1] }), 'freeze'],
    ['s3-drawing-signed', signedSurveyInputs(s3Inputs({ which: [0, 1] })), 'freeze'],
    ['s3-drawing-other', signedSurveyInputs(s3Inputs({ which: [0, 1], switcher: 'หัวหน้า อีกคน' })), 'freeze'],
    ['s3-heads-words', s3HeadsInputs(S3_LONG_HEADS), 'freeze'],
    ['s3-heads-signed', signedSurveyInputs(s3HeadsInputs(S3_LONG_HEADS)), 'freeze'],
    ['s3-heads5-signed', signedSurveyInputs(s3HeadsInputs(['Head Approver', 'หัวหน้า ข', 'หัวหน้า ค', 'หัวหน้า ง', 'หัวหน้า จ'])), 'freeze'],
    ['fx-mixed', surveyReportInputsFromFixture(mixedSurveyFixture()), 'freeze'],
    ['fx-drawing', surveyReportInputsFromFixture(drawingSurveyFixture()), 'freeze'],
    // งวด S5 กลุ่ม F — ใบยืนยันหน้างาน (แถว "ยืนยันผลจากแบบของ" ในภาคผนวก ง ของฉบับภายใน) ทั้งสองรูป
    ['fx-confirm', surveyReportInputsFromFixture(confirmSurveyFixture()), 'freeze'],
    ['fx-confirm-rq', surveyReportInputsFromFixture(confirmSurveyFixture({ reportDocNo: null })), 'freeze'],
  ];
  const browser = await launchBrowser();
  try {
    for (const [label, inputs, mode] of sets) {
      for (const version of ['customer', 'internal']) {
        const { html, layout } = paper(inputs, version, { imageSrc: box, mode });
        const { buffer, fit, brokenImages } = await renderHtmlPdf(html, { measure: true, browser });
        assert.equal(brokenImages, 0);
        assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
        assert.equal(fit.length, layout.pageCount, `${label}/${version}: จำนวนแผ่น`);
        assert.deepEqual(layout.overflow, [], `${label}/${version}`);
        // ฟอนต์ใน PDF: Sarabun เท่านั้น (กล่องเทาไม่มีข้อความ) — ไม่มี Type3
        const pdf = buffer.toString('latin1');
        const fonts = [...new Set([...pdf.matchAll(/\/BaseFont\s*\/([^\s/[\]<>()]+)/g)].map((m) => m[1].replace(/^[A-Z]{6}\+/, '')))];
        assert.deepEqual(fonts.filter((name) => !/^Sarabun-/.test(name)), [], `${label}/${version}: ฟอนต์นอกจาก Sarabun`);
        assert.equal(/\/Subtype\s*\/Type3/.test(pdf), false, `${label}/${version}: มีฟอนต์ Type3`);
        layout.pages.forEach((page, i) => {
          const m = fit[i];
          const at = `${label}/${version} หน้า ${page.no} (${page.kind})`;
          assert.ok(m.rule - m.last >= 8, `${at} ล้น: เหลือ ${m.rule - m.last}px ใต้ ${m.lastBlock}`);
          assert.ok(m.body <= page.bottom + 1, `${at}: วัดได้ ${m.body} แผน ${page.bottom}`);
          if (m.marks.table) assert.ok(Math.abs(m.marks.table.top - page.tableTop) <= TOLERANCE, `${at}: ตารางบน ${m.marks.table.top} แผน ${page.tableTop}`);
          else assert.ok(page.table !== true, `${at}: แผนสั่งตารางแต่กระดาษไม่มี`);
          if (m.marks.plan) assert.ok(Math.abs(m.marks.plan.height - page.planHeight) <= TOLERANCE, `${at}: ผัง ${m.marks.plan.height} แผน ${page.planHeight}`);
          // งวด S3: ที่นั่งผู้ประเมินจากแบบหลายชื่อ — แผนพก `height` ของหน้าการรับรองผล / `height` ของบล็อก จ (ใบอื่นไม่มีคีย์ = ค่าเดิม)
          const signoffPlan = page.height ?? SURVEY_REPORT_PX.signoff.height;
          const signsPlan = (page.blocks || []).find((block) => block.type === 'signs')?.height ?? SURVEY_REPORT_PX.appendix.signs;
          if (m.marks.signoff) assert.ok(Math.abs(m.marks.signoff.height - signoffPlan) <= TOLERANCE, `${at}: รับรอง ${m.marks.signoff.height} แผน ${signoffPlan}`);
          if (m.marks.signs) assert.ok(Math.abs(m.marks.signs.height - signsPlan) <= TOLERANCE, `${at}: ลงนาม ${m.marks.signs.height} แผน ${signsPlan}`);
          // งวด S3: กล่องหมายเหตุ = padding + บรรทัดของแผน · หัวพื้นที่ที่มีป้าย = หัวบรรทัดเดียว + ป้าย (ชื่อพื้นที่ของชุดนี้สั้น)
          if (m.marks.notice) {
            const s = SURVEY_REPORT_PX.summary;
            assert.ok(Math.abs(m.marks.notice.height - (s.noticePad + page.notice.length * s.noticeLine)) <= 1.5, `${at}: หมายเหตุ ${m.marks.notice.height}`);
          } else assert.ok(!page.notice, `${at}: แผนสั่งกล่องหมายเหตุแต่กระดาษไม่มี`);
          if (m.marks.zhead) {
            const z = SURVEY_REPORT_PX.zone;
            /* แผนพก `headHeight` ของหัวที่มีป้าย (ชื่อหลายบรรทัดด้วย — กรณี `drawing-longname` 97 / 73) · ไม่มีคีย์ = หัวบรรทัดเดียว + ป้าย
               (เดิมเทียบกับหัวบรรทัดเดียวเสมอ ⇒ ล้มที่ `drawing-longname` บนเครื่องที่มี Chrome — harness เทียบกับ `headHeight` อยู่แล้ว) */
            const headPlan = page.headHeight ?? (z.head + z.tagLine);
            assert.ok(Math.abs(m.marks.zhead.height - headPlan) <= 1.5, `${at}: หัวพื้นที่ ${m.marks.zhead.height} แผน ${headPlan}`);
          }
        });
        if (label === 'twin') {
          const top = fit[0].marks.table.top;
          const planned = SURVEY_REPORT_PX.summary.tableTop[version];
          assert.ok(top <= planned + 0.5 && planned - top <= 4, `${version}: ตารางหน้า 1 วัดได้ ${top} ค่าคงที่ ${planned}`);
          const plan = fit[1].marks.plan.height;
          assert.ok(Math.abs(plan - layout.pages[1].planHeight) <= 1.5, `${version}: ผังสูง ${plan} แผน ${layout.pages[1].planHeight}`);
        }
        // 🔴 แถวรวมหลายบรรทัดบนหน้า 1 ที่ชิดเพดาน (เดิมเลยขอบโดยแผนไม่รู้) — ต้องอยู่ในเพดานจริง
        if (label === 'limit9' && version === 'customer') {
          assert.equal(layout.pages[0].total, true);
          assert.equal(layout.pages[0].mix.length, 2);
          assert.ok(fit[0].body <= SURVEY_REPORT_PX.limit, `หน้า 1 จบที่ ${fit[0].body}`);
          assert.ok(layout.pages[0].bottom >= SURVEY_REPORT_PX.limit - 8, `ต้องชิดเพดาน — แผน ${layout.pages[0].bottom}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
});

/* ══ ⑦ข อักขระทุกตัวมี glyph จริง (PR-2 §8) ═════════════════════════════
 * เทสต์ช่วงอักขระข้างบนอ่าน `unicode-range` ของ CSS ซึ่ง **กว้างกว่า glyph ที่ฟอนต์มีจริง** (U+2000–206F ประกาศทั้งช่วง
 * 112 ตัว มี glyph 15 ตัว — ขีด U+2010–2012 "‰" "※" ผ่านเทสต์นั้นทั้งที่พิมพ์เป็นกล่อง) · ตัวนี้ถามตัวตรวจของ PR-2
 * (`uncoveredChars` = cmap ∩ unicode-range · lib/documents/documentFontRanges.js) กับข้อความของกระดาษชุดเดียวกัน */
test('🔴 ทุกอักขระของกระดาษมี glyph จริงในฟอนต์ที่ฝัง (cmap ∩ unicode-range) — ข้อความของแม่แบบเองต้องไม่ขึ้นกล่อง', () => {
  const sets = [
    ['twin', twin(), 'freeze'],
    ...surveyStressCases().map((c) => [c.name, stressSurveyInputs(c.spec), c.mode]),
    ['marked', markedSurveyInputs().inputs, 'freeze'],
  ];
  if (existsSync(REAL_FIXTURE)) sets.push(['real', surveyReportInputsFromFixture(JSON.parse(readFileSync(REAL_FIXTURE, 'utf8'))), 'freeze']);
  for (const [label, inputs, mode] of sets) {
    for (const version of ['customer', 'internal']) {
      const { html } = paper(inputs, version, { mode });
      const bad = uncoveredChars(renderedText(html)).map((ch) => `${ch} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
      assert.deepEqual(bad, [], `${label}/${version}: อักขระที่ฟอนต์ฝังไม่มี glyph`);
    }
  }
  // กันเทสต์ผ่านเพราะตัวตรวจไม่เห็นอะไร — ตัวที่ `unicode-range` ปล่อยผ่านต้องถูกจับที่นี่
  assert.deepEqual(uncoveredChars('ก\u2010ข ‰ ≤'), ['\u2010', '‰', '≤']);
  assert.deepEqual(uncoveredChars('กว้าง × ยาว — 12.5 ม. · “คำ”'), []);
});

/* ══ ⑧ ลายเซ็นจริงของผู้ลงนาม (PR-SIG §4 · มติเจ้าของ 09/10/2026) ═══════════════════════════ */

const SIG_WORDS = '<div class="sig-e">ลายเซ็นอิเล็กทรอนิกส์</div>';
const SIG_IMG = '<img class="sig-img"';
const SIG_WAIT = '<div class="sig-img wait">';
const signSha = (userId) => fakeSha(`sign-image-${fakeSignatureVersion(userId).versionId}`);
const signedTwin = (opts) => signedSurveyInputs(twin(), opts);
/** HTML ของบล็อกลงนามภายใน (ภาคผนวก จ) */
const signsHtml = (html) => {
  const from = html.indexOf('<section class="sign-last" data-m="signs">');
  return from === -1 ? '' : html.slice(from, html.indexOf('</section>', from));
};

test('🔴 ภาพนิ่งที่ไม่มีคีย์ `signatures`: กระดาษพิมพ์คำเดิม — ไม่มีช่องรูปลายเซ็นสักช่อง (ฉบับที่ออกแล้วและสวิตช์ปิดไม่ขยับ)', () => {
  for (const [version, words] of [['customer', 2], ['internal', 4]]) {
    const { html } = paper(twin(), version);
    assert.equal(count(html, SIG_WORDS), words, version);
    assert.equal(count(html, 'class="sig-img'), 0, version);
    // ตัวเรนเดอร์ถามว่า "มีคีย์ไหม" จาก view — กระดาษของ view เดิมเท่ากันทุกไบต์ไม่ว่าจะมีกฎ CSS ใหม่หรือไม่
    assert.equal(count(html, '<div class="sig su-signed">'), words, version);
  }
});

test('⭐ การรับรองผล: สองที่นั่งเป็นรูปลายเซ็น (token ของที่นั่งนั้น) — ชื่อ วันที่ ตำแหน่งยังอยู่ · ที่นั่งลูกค้าเป็นแบบฟอร์มเดิม · ยังนับ su-signed ได้ 2', () => {
  const plain = sheetHtml(paper(twin(), 'customer').html, 4);
  const { html, view } = paper(signedTwin(), 'customer');
  const page = sheetHtml(html, 4);
  assert.equal(count(page, '<div class="sig su-signed">'), 2);
  assert.equal(count(page, SIG_IMG), 2);
  assert.equal(count(page, 'class="sig-e"'), 0, 'ไม่มีบรรทัดคำเดิมปนกับรูป');
  assert.ok(page.includes(`<img class="sig-img" src="su-img:${signSha('U-lead')}" alt="ลายเซ็น Lead Assessor">`));
  assert.ok(page.includes(`<img class="sig-img" src="su-img:${signSha('U-head')}" alt="ลายเซ็น Head Approver">`));
  // ลำดับในที่นั่ง: หัว → ตำแหน่ง → รูป → ชื่อ → วันที่
  const seat = page.split('<div class="sig su-signed">')[1];
  const order = ['<h4>ผู้ประเมิน</h4>', '<div class="sig-role">', SIG_IMG, `<div class="sig-name">${view.signoff.assessor.name}</div>`, `<div class="sig-date">${view.signoff.assessor.date}</div>`]
    .map((piece) => seat.indexOf(piece));
  assert.ok(order.every((at, i) => at !== -1 && (i === 0 || at > order[i - 1])), JSON.stringify(order));
  // ที่นั่งลูกค้าไม่ขยับสักตัวอักษร
  const customerSeat = (text) => text.slice(text.lastIndexOf('<div class="sig">'));
  assert.equal(customerSeat(page), customerSeat(plain));
  assert.equal(count(customerSeat(page), SIG_IMG), 0);
  // ทั้งกระดาษของฉบับลูกค้ามีรูปลายเซ็นสองที่เท่านั้น · ส่วนที่เหลือของกระดาษเท่าเดิม
  assert.equal(count(html, SIG_IMG), 2);
  assert.deepEqual(sheets(html), sheets(paper(twin(), 'customer').html));
  for (const no of [1, 2, 3]) assert.equal(sheetHtml(html, no), sheetHtml(paper(twin(), 'customer').html, no), `หน้า ${no}`);
});

test('ภาคผนวก จ (ฉบับภายใน): สองที่นั่งแรกเป็นรูป · ที่นั่งฝ่ายขายไม่ขยับ — ยังไม่ปิดเรื่อง = ช่องว่างเดิม · ปิดแล้ว = บรรทัดคำเดิม', () => {
  const plain = signsHtml(paper(twin(), 'internal').html);
  const { html } = paper(signedTwin(), 'internal');
  const block = signsHtml(html);
  assert.equal(count(html, SIG_IMG), 4, 'การรับรองผล 2 + ภาคผนวก จ 2');
  assert.equal(count(block, SIG_IMG), 2);
  assert.ok(block.includes(`src="su-img:${signSha('U-lead')}" alt="ลายเซ็น Lead Assessor"`));
  assert.ok(block.includes(`src="su-img:${signSha('U-head')}" alt="ลายเซ็น Head Approver"`));
  assert.equal(count(block, '<div class="sig-sp" aria-hidden="true"></div>'), 1);
  const salesSeat = (text) => text.slice(text.lastIndexOf('<div class="sig">'));
  assert.equal(salesSeat(block), salesSeat(plain));

  const closed = surveySignCases().find((c) => c.name === 'sign-closed');
  const done = signsHtml(paper(signedSurveyInputs(closed.inputs(), closed.sign), 'internal').html);
  assert.equal(count(done, '<div class="sig su-signed">'), 3);
  assert.equal(count(done, SIG_IMG), 2);
  assert.equal(count(done, SIG_WORDS), 1, 'ที่นั่งฝ่ายขายที่ปิดเรื่องแล้วยังเป็นคำ (ลายเซ็นของฝ่ายขายไม่อยู่ในงวดนี้)');
});

test('สามสภาพของช่องลายเซ็น: รูป · กรอบประ "จะขึ้นเมื่อออกเอกสาร" (มีลายเซ็น ยังไม่มีรูป) · กรอบประ "ยังไม่มีลายเซ็น" — ไม่มีสภาพไหนตกไปพิมพ์คำเดิม', () => {
  // ฉบับร่างก่อนออกเอกสาร: ผู้ส่งผลมีลายเซ็น (ยังไม่เตรียมรูป) · ผู้ประเมินยังไม่มี
  const draft = paper(signedTwin({ have: ['approver'], prepared: false }), 'internal', { mode: 'draft' });
  assert.equal(count(draft.html, SIG_IMG), 0);
  assert.equal(count(draft.html, `${SIG_WAIT}ยังไม่มีลายเซ็น</div>`), 2);
  assert.equal(count(draft.html, `${SIG_WAIT}ลายเซ็นจะขึ้นเมื่อออกเอกสาร</div>`), 2);
  assert.equal(count(draft.html, SIG_WORDS), 0);
  assert.deepEqual(uncoveredChars('ลายเซ็นจะขึ้นเมื่อออกเอกสาร ยังไม่มีลายเซ็น'), [], 'คำของช่องต้องอยู่ในฟอนต์ที่ฝัง');

  // ตัวตอบ src ของฉบับร่าง (route เอกสาร) รู้จักแต่ไฟล์แนบ — ลายเซ็นที่เตรียมแล้วก็ยังเป็นกรอบประ: รูปจริงไม่ขึ้นก่อนออกเอกสาร
  const draftSrc = (img) => (img?.attId ? `/api/master/attachments/${img.attId}/file` : null);
  const preview = paper(signedTwin(), 'customer', { imageSrc: draftSrc });
  assert.equal(count(preview.html, SIG_IMG), 0);
  assert.equal(count(preview.html, `${SIG_WAIT}ลายเซ็นจะขึ้นเมื่อออกเอกสาร</div>`), 2);

  // ผู้เรียกส่ง src ตรง ๆ (harness · ใบตัวอย่าง): รูปขึ้น และตัวตอบได้รู้ว่าเป็นลายเซ็นของที่นั่งไหน
  const asked = [];
  const direct = paper(signedTwin(), 'customer', { imageSrc: (img) => { if (img.sign) asked.push(img.sign); return 'data:image/png;base64,AAAA'; } });
  assert.deepEqual(asked, ['assessor', 'approver']);
  assert.equal(count(direct.html, '<img class="sig-img" src="data:image/png;base64,AAAA"'), 2);
});

test('คนเดียวสองที่นั่ง = รูปเดียวกันสองช่อง · ชื่อใน alt ถูก escape', () => {
  const { html } = paper(signedTwin({ same: true }), 'customer');
  assert.equal(count(html, `<img class="sig-img" src="su-img:${signSha('U-lead')}" alt="ลายเซ็น Lead Assessor">`), 2);
  assert.deepEqual(surveyReportImageShas(sheetHtml(html, 4)), [signSha('U-lead')]);

  const hostile = signedTwin();
  hostile.visit = { ...hostile.visit, assigneeName: 'A" onerror="x<b>' };
  const page = sheetHtml(paper(hostile, 'customer').html, 4);
  assert.ok(page.includes('alt="ลายเซ็น A&quot; onerror=&quot;x&lt;b&gt;">'));
  assert.equal(page.includes('onerror="x'), false);
});

test('🔴 CSS ของช่องลายเซ็น: สามกฎในก้อนร่วม (ฉบับลูกค้าพิมพ์ด้วย) · สูงตายตัว วางแบบ contain · ไม่เอ่ยชิ้นของฉบับภายใน · รุ่นตัวเรนเดอร์ขยับ', () => {
  const rules = [...SURVEY_REPORT_CSS.matchAll(/^([^{\n]*sig-img[^{]*)\{([^}]*)\}/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(rules.map(([selector]) => selector), [
    '.surveyReport .sheet .sig-img', '.surveyReport .sheet .sig-img.wait', '.surveyReport .sheet .signoff .sig-img',
  ]);
  assert.match(rules[0][1], /height:28px;/);
  assert.match(rules[0][1], /width:100%;/);
  assert.match(rules[0][1], /object-fit:contain;/);
  assert.match(rules[0][1], /margin:auto 0 4px;/);
  assert.match(rules[0][1], /flex:none;/);
  assert.equal(rules[2][1], 'height:45px;');
  assert.equal(SURVEY_REPORT_INTERNAL_CSS.includes('sig-img'), false);
  assert.equal(SURVEY_REPORT_CSS.includes('sign-last'), false, 'ก้อนร่วมห้ามเอ่ยชิ้นของฉบับภายใน — เทสต์รั่ว grep ทั้งไฟล์ของฉบับลูกค้า');
  assert.equal(SURVEY_REPORT_RENDERER_VERSION, 'fm-ts-01@2026-10-27a');
});

test('🔴 ไม่รั่ว: กระดาษสองฉบับไม่มีชื่อคลัง · ที่อยู่ไฟล์ · id ของฉบับลายเซ็น · sha ต้นฉบับ · id ของผู้ใช้ — ฉบับลูกค้ามีแค่ sha ของสองที่นั่งเพิ่มจากรูปของตัวเอง', () => {
  const { inputs, leak, allowed } = markedSurveyInputs();
  const signedInputs = signedSurveyInputs(inputs);
  const before = new Set(surveyReportImageShas(paper(inputs, 'customer').html));
  for (const version of ['customer', 'internal']) {
    const { html, snapshot } = paper(signedInputs, version);
    assert.ok(JSON.stringify(snapshot.signatures).includes('U-MK-LEAD'), 'กันเทสต์ผ่านเพราะภาพนิ่งไม่มีของให้รั่ว');
    for (const banned of [
      'signature-assets', 'users/', 'versionId', 'versionNumber', 'sourceSha256', 'signature-version', 'storagePath',
      'U-MK-LEAD', 'U-MK-HEAD', fakeSha('sign-source-U-MK-LEAD'), fakeSha('sign-source-U-MK-HEAD'),
    ]) assert.equal(html.includes(banned), false, `${version}: ${banned}`);
  }
  const customer = paper(signedInputs, 'customer').html;
  const extra = surveyReportImageShas(customer).filter((sha) => !before.has(sha));
  assert.deepEqual(extra.sort(), [signSha('U-MK-LEAD'), signSha('U-MK-HEAD')].sort());
  // ฉบับลูกค้าที่มีลายเซ็นยังผ่านชุดคำ/ชิ้นส่วนต้องห้ามเดิมทั้งชุด
  for (const [key, marker] of Object.entries(leak)) assert.equal(customer.includes(marker), false, `ฉบับลูกค้ารั่ว ${key}`);
  for (const word of [...CUSTOMER_FORBIDDEN, ...CUSTOMER_FORBIDDEN_MARKUP]) assert.equal(customer.includes(word), false, word);
  for (const marker of Object.values(allowed)) assert.equal(customer.includes(marker), true);
});

test('ทองคำ (แฝดสังเคราะห์ + ลายเซ็น): ยัง 4 / 6 แผ่น คอลัมน์ "หน้า" 2, 3 — ลายเซ็นไม่เปลี่ยนแผนหน้า (ตัวจัดหน้าไม่อ่านช่องลายเซ็น)', () => {
  for (const [version, pages] of [['customer', 4], ['internal', 6]]) {
    const plain = paper(twin(), version);
    const withSign = paper(signedTwin(), version);
    assert.equal(withSign.layout.pageCount, pages);
    assert.deepEqual(withSign.layout, plain.layout, version);
    assert.equal(sheets(withSign.html).length, pages);
  }
  // กรณีของลายเซ็นทุกกรณีจัดหน้าได้ ไม่มีหน้าล้น · ชื่อยาว (sign-wrap) ก็ไม่เปลี่ยนจำนวนหน้า
  for (const c of surveySignCases()) {
    for (const version of ['customer', 'internal']) {
      const got = paper(signedSurveyInputs(c.inputs(), c.sign), version, { mode: c.mode });
      assert.deepEqual(got.layout.overflow, [], `${c.name}/${version}`);
      assert.equal(count(got.html, SIG_IMG) + count(got.html, SIG_WAIT), (version === 'internal' ? 2 : 1) * (c.seats.images + c.seats.waits), `${c.name}/${version}`);
    }
  }
});


/* ══ ⑨ งวด S3 — ใบที่มีพื้นที่ประเมินจากแบบ (สเปก S3 §2.9 · §3 กลุ่ม B) ═══════════════════════════════
 * 🔴 ใบลงหน้างานล้วนพิมพ์กระดาษของ main ทุกตัวอักษร (มติ O3 = ข) — ครึ่ง CI ของการพิสูจน์ (ครึ่ง harness = same-paper.mjs §5.3)
 * ใบผสม / จากแบบล้วน: ทุกข้อความใหม่ของ §2.7 อยู่ในฉบับและโหมดของมันเท่านั้น · ฉบับลูกค้ามีคำว่า "จุด" ได้ที่กล่องหมายเหตุที่เดียว */

/* sha256 ของ markup ของแผ่น (ตั้งแต่ `<article class="sheet su-page"` แรกถึง `</article>` สุดท้าย) ของแฝดสังเคราะห์
   เลขที่ SU-26090001-0 · ออก 2026-09-26 · รูปเป็น token ตั้งต้น — **เรนเดอร์บน main `954861d8` ก่อนแก้ไฟล์แรกของงวด S3**
   (สวิตช์ลายเซ็นปิด = แฝดล้วน · เปิด = อินพุตลงนามของกรณี `sign-closed` ของชุดทดสอบ)
   ⚠️ ห้ามแก้ตัวเลขเพื่อให้เทสต์ผ่าน — ล้ม = กิ่งของงวด S3 รั่วเข้าทางของใบลงหน้างาน ต้องแก้กิ่งนั้น */
const MAIN_ONSITE_PAGES_SHA256 = Object.freeze({
  'customer-off': '9f16adcd4c39c72ed80372131d6c6d85637326004061e764b5bb833b504483f1',
  'internal-off': '0649058609610c32cd71a3a8d6e9213d1f1e6e6933853eada74359d62984a439',
  'customer-on': '6fd2d2b532aeebe09276b6a7253f28115c222db33888c1754e4abdee00466765',
  'internal-on': '68f22e0b547799bebd906528aca5a9926cff6faa543cc669dbcb7b83ff6627ff',
});
const pagesMarkup = (html) => {
  const open = '<article class="sheet su-page"';
  const close = '</article>';
  return html.slice(html.indexOf(open), html.lastIndexOf(close) + close.length);
};
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const S3_SWITCH = '2026-09-26T02:50:00.000+00:00';   // หลังช่างบันทึกพื้นที่ทั้งสองของแฝด
/** แฝดที่พื้นที่ `which` เป็นจากแบบ (หัวหน้าสลับหลังช่างบันทึก ไม่บันทึกใหม่) · ทุกพื้นที่จากแบบ = ไม่มีนัด */
function s3Inputs({ which = [1], confirm = 'needed', switcher = 'Head Approver', reason = 'ลูกค้าส่งแบบมาแล้ว' } = {}) {
  const inputs = twin();
  for (const i of which) {
    Object.assign(inputs.zones[i], { method: 'drawing', methodChangedAt: S3_SWITCH, methodChangedByName: switcher, methodReason: reason });
  }
  if (which.length === inputs.zones.length) inputs.visit = null;
  inputs.request = { ...inputs.request, surveyConfirm: confirm };
  return inputs;
}
const NOTICE_1 = 'พื้นที่ที่ระบุ “ประเมินจากแบบ” ประเมินจากแบบที่ได้รับ ยังไม่ได้วัดและตรวจจุดติดตั้งจากพื้นที่จริง';
const NOTICE_2 = '· ขนาดและจำนวนอาจปรับเมื่อวัดหน้างาน';
const S3_KEYS_ZONE = ['method', 'methodReason', 'methodChangedByName', 'methodChangedAt', 'drawingBy', 'drawingAt'];
const zonePages = (html, layout, zoneIndex) => layout.pages
  .filter((page) => page.zoneIndex === zoneIndex).map((page) => sheetHtml(html, page.no));

test('🔴 S3 ทองคำใบลงหน้างาน (O3 = ข): markup ของแผ่นแฝดสังเคราะห์เท่ากับของ main 954861d8 ทุกไบต์ — สวิตช์ลายเซ็นปิด/เปิด × สองฉบับ', () => {
  const closed = surveySignCases().find((c) => c.name === 'sign-closed');
  const sets = { off: twin(), on: signedSurveyInputs(closed.inputs(), closed.sign) };
  for (const [rule, inputs] of Object.entries(sets)) {
    for (const version of ['customer', 'internal']) {
      const { html } = paper(inputs, version);
      assert.equal(sha256(pagesMarkup(html)), MAIN_ONSITE_PAGES_SHA256[`${version}-${rule}`], `${version} · ลายเซ็น${rule === 'on' ? 'เปิด' : 'ปิด'}`);
    }
  }
});

test('🔴 S3 ใบลงหน้างาน: ภาพนิ่งก่อนงวด S3 (ไม่มีคีย์ §2.5) · ใบที่สลับไปจากแบบแล้วกลับ — กระดาษเท่ากับใบลงหน้างานของงวด S3 ทุกตัวอักษร', () => {
  for (const version of ['customer', 'internal']) {
    // ภาพนิ่งที่ออกก่อนงวด S3: ไม่มี assessment · otherVisits · request.surveyConfirm · คีย์วิธีของพื้นที่
    const built = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
    const pre = structuredClone(built.snapshot);
    delete pre.assessment;
    delete pre.otherVisits;
    delete pre.request.surveyConfirm;
    for (const zone of pre.zones) for (const key of S3_KEYS_ZONE) delete zone[key];
    const render = (snapshot) => {
      const view = surveyReportView(snapshot, { version });
      return renderSurveyReportHTML({ view, layout: paginateSurveyReport(view), docNo: DOC_NO, issuedAt: '2026-09-26' });
    };
    assert.equal(pagesMarkup(render(pre)), pagesMarkup(render(built.snapshot)), `${version}: ภาพนิ่งก่อนงวด S3`);

    // พื้นที่ที่สลับไปจากแบบแล้วกลับเป็นลงหน้างาน = ใบเดียวกับที่ไม่มีคอลัมน์ method* เลย (ทั้งไฟล์ ไม่ใช่แค่แผ่น)
    const back = twin();
    Object.assign(back.zones[1], { method: 'onsite', methodChangedAt: S3_SWITCH, methodChangedByName: 'Head Approver', methodReason: 'ลูกค้าให้วัดจริง' });
    assert.equal(paper(back, version).html, paper(twin(), version).html, `${version}: สลับแล้วกลับ`);
  }
});

test('🔴 S3 ใบลงหน้างานทุกชุดที่มีบน main: ไม่มีแถว "วิธีประเมิน" ไม่มีแถว "วิธีประเมินรายพื้นที่" ไม่มีชิ้นใหม่ของงวด S3 สักชิ้น', () => {
  const back = twin();
  Object.assign(back.zones[0], { method: 'onsite', methodChangedAt: S3_SWITCH, methodChangedByName: 'Head Approver', methodReason: null });
  const sets = [
    ['แฝด', twin(), 'freeze'], ['สลับแล้วกลับ', back, 'freeze'], ['marked', markedSurveyInputs().inputs, 'freeze'],
    ...surveyStressCases().map((c) => [c.name, stressSurveyInputs(c.spec), c.mode]),
    ...surveySignCases().map((c) => [c.name, signedSurveyInputs(c.inputs(), c.sign), c.mode]),
  ];
  let onsite = 0;
  for (const [label, inputs, mode] of sets) {
    for (const version of ['customer', 'internal']) {
      const got = paper(inputs, version, { mode });
      if (['mixed', 'drawing'].includes(got.snapshot.assessment?.mode)) continue; // ชุดใหม่ของงวด S3 (กลุ่ม C) — ไม่ใช่ใบลงหน้างาน
      onsite += 1;
      const body = got.html.slice(got.html.indexOf('<body>'));
      // markup กับคำของระบบเท่านั้น — ข้อความที่คนพิมพ์ (ข้อความเติมของชุดสุดขอบ) มีคำว่า "ประเมินจากแบบ" ได้ตามจริง
      for (const piece of [
        '<dt>วิธีประเมิน</dt>', '<th>วิธีประเมินรายพื้นที่</th>', '<th>ยืนยันหน้างานภายหลัง</th>', '<th>ผู้กรอกผลจากแบบ</th>',
        '<th>นัดหน้างานของใบนี้</th>', 'class="dnote"', 'data-m="notice"', 'class="zsub"', 'class="zh-tag"', 'zh-tagged', 'class="zh-row"', 'data-m="zhead"',
        'class="sp-list"', 'แบบที่ใช้ประเมิน<span> / DRAWING</span>', '<span class="ln">ประเมินจากแบบ', '<span class="ln">ลงหน้างาน',
        '<h4>ผู้ประเมินจากแบบ</h4>', 'รับทราบผลประเมิน', 'เพิ่มโดย TS',
      ]) assert.equal(body.includes(piece), false, `${label}/${version}: ${piece}`);
    }
  }
  assert.ok(onsite >= 30, `ต้องตรวจใบลงหน้างานจริง ๆ (${onsite})`);
});

/* กระดาษสามสภาพของแฝด: ลงหน้างาน · ผสม (พื้นที่ 2 จากแบบ · ช่างบันทึกก่อนสลับ) · จากแบบล้วน */
const s3Papers = () => ({
  onsite: { customer: paper(twin(), 'customer'), internal: paper(twin(), 'internal') },
  mixed: { customer: paper(s3Inputs(), 'customer'), internal: paper(s3Inputs(), 'internal') },
  drawing: { customer: paper(s3Inputs({ which: [0, 1] }), 'customer'), internal: paper(s3Inputs({ which: [0, 1] }), 'internal') },
});

test('S3 ทุกข้อความใหม่ของ §2.7 อยู่ในฉบับและโหมดของมันเท่านั้น', () => {
  const papers = s3Papers();
  const ALL = ['onsite', 'mixed', 'drawing'];
  const BOTH = ['customer', 'internal'];
  // [ชิ้นที่พิมพ์, โหมดที่มี, ฉบับที่มี]
  const table = [
    ['<dt>วิธีประเมิน</dt>', ['mixed', 'drawing'], BOTH],
    ['<dt>วิธีประเมิน</dt><dd><span class="ln">ลงหน้างาน 1 พื้นที่ ·</span><span class="ln">ประเมินจากแบบ 1 พื้นที่</span></dd>', ['mixed'], BOTH],
    ['<dt>วิธีประเมิน</dt><dd><span class="ln">ประเมินจากแบบ</span></dd>', ['drawing'], BOTH],
    ['<dt>ผู้ประเมิน</dt><dd><span class="ln">Lead Assessor</span><span class="ln">ประเมินจากแบบโดย</span><span class="ln">Head Approver</span></dd>', ['mixed'], BOTH],
    ['<dt>ผู้ประเมิน</dt><dd><span class="ln">Head Approver</span></dd>', ['drawing'], BOTH],
    ['<dt>เวลา</dt><dd>—</dd>', ['drawing'], BOTH],
    [`<div class="dnote" data-m="notice"><span class="ln">${NOTICE_1}</span><span class="ln">${NOTICE_2}</span></div>`, ['mixed', 'drawing'], BOTH],
    ['<div class="zsub"><span class="zsub-f">ชั้น GF</span> · <b>ประเมินจากแบบ</b></div>', ['mixed', 'drawing'], BOTH],
    ['<div class="zh zh-tagged" data-m="zhead">', ['mixed', 'drawing'], BOTH],
    // แถวของหัวลงหน้างานห่อใน `.zh-row` — ป้ายอยู่นอกแถว flex (ชื่อยาวไม่ดันชิปให้อยู่แถวโดด · แผนนับหัว + tagLine ได้ตรง)
    ['<div class="zh zh-tagged" data-m="zhead">\n              <div class="zh-row">\n              <span class="chip-n">', ['mixed', 'drawing'], BOTH],
    ['</span>\n              </div>\n              <div class="zh-tag" data-m="ztag">', ['mixed', 'drawing'], BOTH],
    ['<div class="zh-tag" data-m="ztag"><b>ประเมินจากแบบ</b> · Head Approver · 26/09/2026</div>', ['mixed', 'drawing'], BOTH],
    ['<h5 class="zs-h">แบบที่ใช้ประเมิน<span> / DRAWING</span></h5>', ['mixed', 'drawing'], BOTH],
    ['alt="แบบที่ใช้ประเมิน ', ['mixed', 'drawing'], BOTH],
    ['<h5 class="zs-h">ผังพื้นที่<span> / PLAN</span></h5>', ['onsite', 'mixed'], BOTH],
    ['<h5 class="zs-h">ภาพกว้าง<span> / WIDE PHOTOS</span></h5>', ['onsite', 'mixed'], BOTH],
    ['<h4>ผู้ประเมินจากแบบ</h4>', ['drawing'], BOTH],
    ['ยืนยันข้อมูลหน้างาน <span class="nw">ไม่ใช่การสั่งซื้อ</span>', ['onsite'], BOTH],
    ['รับทราบผลประเมิน <span class="nw">ไม่ใช่การสั่งซื้อ</span>', ['mixed'], BOTH],
    ['รับทราบผลประเมินจากแบบ <span class="nw">ไม่ใช่การสั่งซื้อ</span>', ['drawing'], BOTH],
    // ฉบับภายในเท่านั้น
    ['<ul class="sp-list">', ['mixed', 'drawing'], ['internal']],
    ['<h5 class="zs-h">จุดติดตั้งโดยประมาณจากแบบ — ยังไม่ยืนยันหน้างาน</h5>', ['mixed', 'drawing'], ['internal']],
    ['<b>จุดที่ติดตั้งได้</b> คือตำแหน่งที่หน้างานรองรับการติดตั้ง · ตำแหน่งติดตั้งจริงกำหนดอีกครั้งตอนเข้าติดตั้ง · พื้นที่จากแบบ: ตำแหน่งโดยประมาณ ยังไม่ยืนยันหน้างาน</p>', ['mixed'], ['internal']],
    ['<b>จุดที่ติดตั้งได้</b> พื้นที่จากแบบ: ตำแหน่งโดยประมาณ ยังไม่ยืนยันหน้างาน</p>', ['drawing'], ['internal']],
    ['<dd>ประเมินจากแบบทั้งใบ</dd>', ['drawing'], ['internal']],
    ['<dd>ผู้ประเมินจากแบบ Head Approver</dd>', ['drawing'], ['internal']],
    ['<th>วิธีประเมินรายพื้นที่</th>', ['mixed', 'drawing'], ['internal']],
    ['<tr><th>ยืนยันหน้างานภายหลัง</th><td>ต้องยืนยันหน้างาน</td></tr>', ['mixed', 'drawing'], ['internal']],
    ['<th>ผู้กรอกผลจากแบบ</th>', ['mixed', 'drawing'], ['internal']],
    ['ก่อนเปลี่ยนเป็นประเมินจากแบบ', ['mixed', 'drawing'], ['internal']],
    ['<div class="sig-role">ประเมินจากแบบ</div>', ['drawing'], ['internal']],
  ];
  for (const [piece, modes, versions] of table) {
    for (const mode of ALL) {
      for (const version of BOTH) {
        const want = modes.includes(mode) && versions.includes(version);
        assert.equal(papers[mode][version].html.includes(piece), want, `${mode}/${version}: ${piece}`);
      }
    }
  }
  // ไม่ต้องยืนยันหน้างาน = กล่องหมายเหตุบรรทัดเดียว · แถวยืนยันพูดตามนั้น
  const nn = paper(s3Inputs({ confirm: 'not_needed' }), 'internal').html;
  assert.ok(nn.includes(`<div class="dnote" data-m="notice"><span class="ln">${NOTICE_1}</span></div>`));
  assert.ok(nn.includes('<tr><th>ยืนยันหน้างานภายหลัง</th><td>ไม่ต้องยืนยันหน้างาน</td></tr>'));
  assert.equal(nn.includes(NOTICE_2), false);
});

test('🔴 S3 ไม่มีกระดาษไหนพูด "ไม่ได้เข้าพื้นที่" · ฉบับลูกค้าไม่สัญญาว่า "จะเข้ายืนยัน" · หน้าพื้นที่จากแบบไม่มีส่วนภาพกว้าง', () => {
  const sets = [
    ['ผสม', s3Inputs()], ['จากแบบล้วน', s3Inputs({ which: [0, 1] })], ['ไม่ต้องยืนยัน', s3Inputs({ which: [0, 1], confirm: 'not_needed' })],
    ['fixture ผสม', surveyReportInputsFromFixture(mixedSurveyFixture())],
    ['fixture จากแบบ', surveyReportInputsFromFixture(drawingSurveyFixture())],
  ];
  for (const [label, inputs] of sets) {
    for (const version of ['customer', 'internal']) {
      const { html, layout, view } = paper(inputs, version);
      assert.equal(html.includes('ไม่ได้เข้าพื้นที่'), false, `${label}/${version}`);
      if (version === 'customer') assert.equal(html.includes('จะเข้ายืนยัน'), false, `${label}/${version}`);
      view.zones.forEach((zone, i) => {
        if (zone.method !== 'drawing') return;
        const pages = zonePages(html, layout, i);
        assert.ok(pages.length >= 1, `${label}/${version}: พื้นที่ ${zone.no}`);
        for (const page of pages) {
          for (const word of ['ภาพกว้าง', 'WIDE PHOTOS', 'ไม่มีภาพกว้าง', 'class="ph sp"']) {
            assert.equal(page.includes(word), false, `${label}/${version} พื้นที่ ${zone.no}: ${word}`);
          }
        }
        for (const page of layout.pages.filter((p) => p.zoneIndex === i)) assert.equal(page.wide, null);
      });
    }
  }
});

test('🔴 S3 กันรั่วของฉบับลูกค้า: กล่องหมายเหตุไม่เกินหนึ่งกล่อง เนื้อความตรงประโยคที่อนุมัติทุกตัว — ตัดกล่องออกแล้วไม่มี "จุด" ไม่มีเครื่อง รุ่น ราคา ไม่มีชิ้นภายใน', () => {
  const neutral = (inputs) => ({ ...inputs, zones: inputs.zones.map((zone) => ({ ...zone, note: zone.note ? 'หมายเหตุทดสอบของพื้นที่' : zone.note })) });
  const sets = [
    ['ลงหน้างาน', twin(), false], ['ผสม', s3Inputs(), true], ['ผสม ไม่ต้องยืนยัน', s3Inputs({ confirm: 'not_needed' }), true],
    ['จากแบบล้วน', s3Inputs({ which: [0, 1] }), true], ['ร่างก่อนเลือก', s3Inputs({ which: [0, 1], confirm: null }), true],
    ['fixture ผสม', surveyReportInputsFromFixture(mixedSurveyFixture()), true],
    ['fixture จากแบบ', surveyReportInputsFromFixture(drawingSurveyFixture()), true],
  ];
  for (const [label, raw, drawing] of sets) {
    const mode = raw.request?.surveyConfirm === null ? 'draft' : 'freeze';
    const { html, snapshot, layout } = paper(neutral(raw), 'customer', { mode });
    const blocks = [...html.matchAll(/<div class="dnote"[^>]*>(.*?)<\/div>/g)];
    assert.equal(blocks.length, drawing ? 1 : 0, `${label}: จำนวนกล่องหมายเหตุ`);
    assert.equal(count(html, 'class="dnote"'), drawing ? 1 : 0, `${label}: ไม่มีกล่องที่สองซ่อนรูปอื่น`);
    let rest = html.slice(html.indexOf('<body>'));
    if (blocks.length) {
      const text = unescape(blocks[0][1].replace(/<[^>]+>/g, ''));
      assert.ok(text === NOTICE_1 || text === `${NOTICE_1}${NOTICE_2}`, `${label}: ${text}`);
      rest = rest.replace(blocks[0][0], '');
    }
    assert.equal(rest.includes('จุด'), false, `${label}: "จุด" นอกกล่องหมายเหตุ`);
    for (const word of [...CUSTOMER_FORBIDDEN, ...CUSTOMER_FORBIDDEN_MARKUP, 'รุ่นเครื่อง', 'เครื่องกระจายกลิ่น', 'ราคา', 'บาท', 'sp-list']) {
      assert.equal(rest.includes(word), false, `${label}: ${word}`);
    }
    assert.deepEqual(surveyReportCustomerHtmlIssues({ html, snapshot, layout }), [], label);
  }
});

test('S3 พื้นที่ที่หัวหน้าเพิ่มบนใบงานโต๊ะ = "เพิ่มโดย TS" ไม่ใช่ "เพิ่มหน้างาน" · นัดของใบจากแบบล้วนอยู่ภาคผนวก ง เท่านั้น', () => {
  const added = s3Inputs();
  added.zones[1].status = 'added';
  const { html } = paper(added, 'internal');
  const scope = html.split('ข. ขอบเขตเทียบคำร้อง')[1].split('</table>')[0];
  assert.ok(scope.includes('<td>เพิ่มโดย TS</td>'));
  assert.equal(scope.includes('เพิ่มหน้างาน'), false);
  assert.equal(paper(added, 'customer').html.includes('เพิ่มโดย TS'), false);

  const desk = s3Inputs({ which: [0, 1] });
  desk.otherVisits = [{ code: 'SV-26100011', status: 'done', date: '2026-10-13', planned: false }];
  const internal = paper(desk, 'internal').html;
  assert.ok(internal.includes('<tr><th>นัดหน้างานของใบนี้</th><td>นัด SV-26100011 เข้าแล้ว 13/10/2026 — ผลในเอกสารนี้ประเมินจากแบบ</td></tr>'));
  const customer = paper(desk, 'customer').html;
  for (const word of ['SV-26100011', 'นัดหน้างานของใบนี้']) assert.equal(customer.includes(word), false, word);
});

test('S3 จากแบบล้วน ฉบับร่างก่อนส่ง (answeredAt ว่าง · ยังไม่เลือก): ขีดที่หัวกระดาษ กล่องการประเมิน ที่นั่งที่ 1 · กล่องหมายเหตุบรรทัดเดียว · ภาคผนวกแถว 4 ขีด', () => {
  const inputs = s3Inputs({ which: [0, 1], confirm: null });
  inputs.request = { ...inputs.request, answeredAt: null };
  for (const version of ['customer', 'internal']) {
    const { html } = paper(inputs, version, { mode: 'draft', docNo: null, issuedAt: null });
    assert.ok(html.includes('<dt>วันที่ประเมิน</dt><dd>—</dd>'), version);
    assert.ok(html.includes('<dt>วันที่</dt><dd>—</dd>'), version);
    const seat = html.split('<h4>ผู้ประเมินจากแบบ</h4>')[1].split('</div>\n            <div')[0];
    assert.ok(seat.includes('<div class="sig-date">—</div>'), version);
    assert.ok(html.includes(`<div class="dnote" data-m="notice"><span class="ln">${NOTICE_1}</span></div>`), version);
    assert.equal(html.includes('1970'), false, version);
    if (version === 'internal') assert.ok(html.includes('<tr><th>ยืนยันหน้างานภายหลัง</th><td>—</td></tr>'));
  }
});

test('S3 ชื่อผู้ประเมินจากแบบหลายคน: กล่องการประเมินบรรทัดละชื่อตามแผน · ที่นั่งที่ 1 ชื่อละบรรทัด · ภาคผนวก จ ต่อกันบรรทัดเดียว', () => {
  const inputs = s3Inputs({ which: [0, 1] });
  inputs.zones[0].methodChangedByName = 'หัวหน้า ก';
  for (const version of ['customer', 'internal']) {
    const { html, layout, view } = paper(inputs, version);
    assert.deepEqual(view.signoff.assessor.names, ['หัวหน้า ก', 'Head Approver']);
    const box = html.split('<dt>ผู้ประเมิน</dt><dd>')[1].split('</dd>')[0];
    assert.equal(box, layout.pages[0].survey.names.map((line) => `<span class="ln">${line}</span>`).join(''));
    const seat = html.split('<h4>ผู้ประเมินจากแบบ</h4>')[1].split('<div class="sig-date">')[0];
    assert.deepEqual([...seat.matchAll(/<div class="sig-name">([^<]*)<\/div>/g)].map((m) => m[1]), ['หัวหน้า ก', 'Head Approver']);
    if (version === 'internal') {
      const signs = signsHtml(html);
      assert.ok(signs.includes('<div class="sig-name">หัวหน้า ก · Head Approver</div>'));
    }
  }
  // สามชื่อ = ที่นั่งที่ 1 สามบรรทัด (แผนหน้านับความสูงของที่นั่งเอง — surveyReportLayout.test.mjs)
  const three = structuredClone(paper(s3Inputs({ which: [0, 1] }), 'customer').view);
  three.signoff.assessor.names = ['ก', 'ข', 'ค'];
  const html3 = renderSurveyReportHTML({ view: three, layout: paginateSurveyReport(three) });
  assert.equal(count(html3.split('<h4>ผู้ประเมินจากแบบ</h4>')[1].split('<div class="sig-date">')[0], '<div class="sig-name">'), 3);
});

test('S3 รายการจุดโดยประมาณ (ฉบับภายใน): 0 จุด = ประโยคว่างแถวเดียว · 1 จุด · 8 จุดข้ามหน้าได้ครบไม่ซ้ำ — ไม่มีการ์ดรูป ไม่มีกล่องรูป', () => {
  const zoneSpots = (n) => {
    const inputs = s3Inputs({ which: [0, 1] });
    inputs.zones[1].spots = Array.from({ length: n }, (_, i) => ({
      id: `S3-${i}`, label: `จุดโดยประมาณ ${i + 1}`, note: i % 2 ? `ข้างเคาน์เตอร์ ${i + 1}` : null, selected: true,
    }));
    if (n >= 8) inputs.zones[1].note = thaiText(900);
    return paper(inputs, 'internal');
  };
  const listOf = (pages) => pages.flatMap((page) => [...page.matchAll(/<li( class="none")?>(.*?)<\/li>/g)].map((m) => [Boolean(m[1]), m[2]]));
  const none = zoneSpots(0);
  assert.deepEqual(listOf(zonePages(none.html, none.layout, 1)), [[true, 'ยังไม่ระบุจุดติดตั้ง — กำหนดเมื่อเข้าหน้างาน']]);
  const one = zoneSpots(1);
  assert.deepEqual(listOf(zonePages(one.html, one.layout, 1)), [[false, `<b>${one.view.zones[1].spots[0].no}</b> · จุดโดยประมาณ 1`]]);
  const eight = zoneSpots(8);
  const items = listOf(zonePages(eight.html, eight.layout, 1));
  assert.equal(items.length, 8);
  assert.deepEqual(items.map(([, text]) => text.split('</b> · ')[1]), eight.view.zones[1].spots.map((spot) => [spot.label, spot.note].filter(Boolean).join(' — ')));
  assert.deepEqual(eight.layout.overflow, []);
  for (const got of [none, one, eight]) {
    for (const page of zonePages(got.html, got.layout, 1)) {
      for (const piece of ['class="ph sp"', 'class="sp-b"', 'class="sp-note"', 'POSSIBLE INSTALL SPOTS']) assert.equal(page.includes(piece), false, piece);
    }
  }
  // ฉบับลูกค้าไม่มีรายการ
  assert.equal(paper(s3Inputs({ which: [0, 1] }), 'customer').html.includes('จุดติดตั้งโดยประมาณ'), false);
});

test('S3 สองฉบับจากภาพนิ่งเดียว: กล่องคู่ · กล่องหมายเหตุ · หัวพื้นที่ (พร้อมป้าย) · ที่นั่งรับรอง พิมพ์ตรงกันทุกตัวอักษร', () => {
  for (const inputs of [s3Inputs(), s3Inputs({ which: [0, 1] }), surveyReportInputsFromFixture(drawingSurveyFixture())]) {
    const customer = paper(inputs, 'customer').html;
    const internal = paper(inputs, 'internal').html;
    const pick = (html, open, close) => html.split(open)[1].split(close)[0];
    assert.equal(pick(customer, '<section class="party">', '</section>'), pick(internal, '<section class="party">', '</section>'));
    assert.equal(pick(customer, '<div class="dnote"', '</div>'), pick(internal, '<div class="dnote"', '</div>'));
    assert.equal(pick(customer, '<section class="signoff"', '</section>'), pick(internal, '<section class="signoff"', '</section>'));
    // หัวพื้นที่ (ชิป · ชื่อ · รหัส · ขนาด · ป้าย) ถึงส่วนแรกของพื้นที่ — พื้นที่จากแบบไม่มีส่วนภาพกว้าง ส่วนแรกคือส่วนผัง
    const heads = (html) => [...html.matchAll(/<div class="zp" data-zone="\d+">([\s\S]*?)<section class="zs/g)].map((m) => m[1]);
    assert.ok(heads(customer).some((head) => head.includes('data-m="ztag"')));
    assert.deepEqual(heads(customer), heads(internal));
  }
});

test('🔴 S3 ลายเซ็นของใบจากแบบล้วน: ที่นั่งที่ 1 คัดลอก = รูปเดียวกันสองช่อง (2 / 4) · ผู้ประเมินคนอื่น = บรรทัดคำข้างรูปที่นั่งที่ 2 (1 / 2) · ใบผสมลงนามครบ (2 / 4) — ยามลายเซ็นผ่าน', () => {
  const copied = signedSurveyInputs(s3Inputs({ which: [0, 1] }));
  const other = signedSurveyInputs(s3Inputs({ which: [0, 1], switcher: 'หัวหน้า อีกคน' }));
  const mixed = signedSurveyInputs(s3Inputs());
  for (const [label, inputs, images, words] of [['คัดลอก', copied, 2, 0], ['คนอื่น', other, 1, 1], ['ผสม', mixed, 2, 0]]) {
    for (const [version, times] of [['customer', 1], ['internal', 2]]) {
      const got = paper(inputs, version);
      assert.equal(count(got.html, SIG_IMG), images * times, `${label}/${version}: รูป`);
      assert.equal(count(got.html, SIG_WAIT), 0, `${label}/${version}: ไม่มีกรอบประบนกระดาษที่ออก`);
      assert.equal(count(got.html, SIG_WORDS), words * times, `${label}/${version}: บรรทัดคำ`);
      assert.deepEqual(surveyReportSignatureHtmlIssues({ html: got.html, snapshot: got.snapshot, version }), [], `${label}/${version}`);
    }
  }
  // ที่นั่งที่ 1 กับ 2 ของใบที่คัดลอก = token เดียวกัน
  const page = sheetHtml(paper(copied, 'customer').html, paper(copied, 'customer').layout.pageCount);
  const tokens = [...page.matchAll(/<img class="sig-img" src="(su-img:[0-9a-f]{64})"/g)].map((m) => m[1]);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0], tokens[1]);
  // ที่นั่งที่ 1 ของ "คนอื่น" = ชื่อหัวหน้าที่ประเมิน + บรรทัดคำ · ที่นั่งที่ 2 = รูปของผู้ส่งผล
  const seat1 = paper(other, 'customer').html.split('<h4>ผู้ประเมินจากแบบ</h4>')[1].split('<h4>')[0];
  assert.ok(seat1.includes(SIG_WORDS));
  assert.ok(seat1.includes('<div class="sig-name">หัวหน้า อีกคน</div>'));
});

test('S3 บรรทัดย่อยของแถวจากแบบ: ไม่มีชั้น · ชั้นอยู่ในชื่อแล้ว = "ประเมินจากแบบ" อย่างเดียว · พื้นที่หลายส่วน = ตารางส่วนข้างภาพแบบ', () => {
  // ชั้นมาได้สองทาง (แถวของใบ · ทะเบียนพื้นที่) — ล้างทั้งสอง
  const noFloor = s3Inputs();
  noFloor.zones[1].floor = null;
  noFloor.zoneRegistry = noFloor.zoneRegistry.map((z) => (z.id === noFloor.zones[1].zoneId ? { ...z, floor: null } : z));
  const inName = s3Inputs();
  // ชั้นอยู่กลางชื่อ (ชื่อที่ลงท้ายด้วยชั้นถูกจัดเป็นหางชั้นของระบบ — บรรทัดย่อยได้ "ชั้น GF ·" ตามปกติ)
  inName.zones[1].zoneName = 'ห้องชั้น GF ฝั่งทิศเหนือ';
  for (const [label, inputs] of [['ไม่มีชั้น', noFloor], ['ชั้นในชื่อ', inName]]) {
    const { html, view } = paper(inputs, 'customer');
    assert.equal(view.table.rows[1].methodLine.floor, null, label);
    assert.ok(html.includes('<div class="zsub"><b>ประเมินจากแบบ</b></div>'), label);
    assert.equal(html.includes('zsub-f'), false, label);
  }
  const parts = stressSurveyInputs({ zones: [{ parts: 2, floor: '3' }, {}] });
  Object.assign(parts.zones[0], { method: 'drawing', methodChangedAt: S3_SWITCH, methodChangedByName: 'Head Approver', methodReason: 'ลูกค้าส่งแบบมาแล้ว' });
  parts.request = { ...parts.request, surveyConfirm: 'needed' };
  for (const version of ['customer', 'internal']) {
    const { html, layout } = paper(parts, version);
    const [page] = zonePages(html, layout, 0);
    const plan = page.split('<h5 class="zs-h">แบบที่ใช้ประเมิน<span> / DRAWING</span></h5>')[1];
    assert.ok(plan && plan.trimStart().startsWith('<div class="zp-plan-row">'), version);
    assert.ok(plan.includes('<table class="t cp">'), version);
    assert.equal(page.includes('ภาพกว้าง'), false, version);
  }
});

/* ══ ⑩ งวด S5 กลุ่ม F — ใบยืนยันหน้างาน: แถว "ยืนยันผลจากแบบของ" ในภาคผนวก ง ของฉบับภายใน ═══════════════════
 * 🔴 ฉบับลูกค้าของใบยืนยัน = ฉบับลูกค้าของแฝดทุกไบต์ (ไม่มีป้าย ไม่มีเลข RQ/SU ของใบต้นทาง)
 * ฉบับภายใน = ของแฝด + แถวเดียว · แผนหน้าของ fixture ใหม่ = ของแฝด (ลูกค้า 4 · ภายใน 6 · พื้นที่หน้า 2, 3) — บันทึกไว้ที่นี่และใน
 * harness (`--synthetic confirm` ตรวจด้วยผลที่ล็อกของ `onsite`) */

const CONFIRM_FULL = `${CONFIRM_ORIGINAL.requestDocNo} (${CONFIRM_ORIGINAL.reportDocNo})`;
const CONFIRM_TH = '<th>ยืนยันผลจากแบบของ</th>';
const confirmInputs = (opts) => surveyReportInputsFromFixture(confirmSurveyFixture(opts));

test('🔴 S5 F สองฉบับของใบยืนยัน: ฉบับลูกค้าไม่มีป้าย/เลข RQ/เลข SU ของใบต้นทาง (เท่าแฝดทุกไบต์) · ฉบับภายในมีป้ายครั้งเดียวพร้อมเลข', () => {
  for (const [label, opts, value] of [['RQ (SU)', {}, `${CONFIRM_ORIGINAL.requestDocNo} <span class="nw">(${CONFIRM_ORIGINAL.reportDocNo})</span>`], ['RQ อย่างเดียว', { reportDocNo: null }, CONFIRM_ORIGINAL.requestDocNo]]) {
    const customer = paper(confirmInputs(opts), 'customer');
    for (const needle of ['ยืนยันผลจากแบบของ', CONFIRM_ORIGINAL.requestDocNo, CONFIRM_ORIGINAL.reportDocNo]) {
      assert.equal(customer.html.includes(needle), false, `${label}: ฉบับลูกค้ารั่ว ${needle}`);
    }
    assert.equal(customer.html, paper(twin(), 'customer').html, `${label}: ฉบับลูกค้าเท่าแฝดทุกไบต์`);
    // ยามกันรั่วของ production (ตัวเดียวกับขั้นกระดาษ) ผ่านบนฉบับลูกค้าของใบยืนยัน
    assert.deepEqual(surveyReportCustomerHtmlIssues({ html: customer.html, snapshot: customer.snapshot, layout: customer.layout }), [], label);

    const internal = paper(confirmInputs(opts), 'internal');
    assert.equal(count(internal.html, 'ยืนยันผลจากแบบของ'), 1, `${label}: ป้ายครั้งเดียว`);
    assert.equal(count(internal.html, `${CONFIRM_TH}<td>${value}</td></tr>`), 1, `${label}: แถว kv ของภาคผนวก ง`);
    // ถอดแถวออก = ฉบับภายในของแฝดทุกไบต์ (แถวเดียวไม่ดันหน้า — แผนหน้าเท่าเดิม)
    const row = `\n              <tr>${CONFIRM_TH}<td>${value}</td></tr>`;
    assert.equal(internal.html.replace(row, ''), paper(twin(), 'internal').html, `${label}: ต่างจากแฝดแค่แถวเดียว`);
  }
});

test('S5 F แผนหน้าของใบยืนยัน (บันทึก): ลูกค้า 4 แผ่น · ภายใน 6 แผ่น · พื้นที่หน้า 2, 3 · แถวอยู่ในภาคผนวก ง หน้า 6 — เท่าแฝด', () => {
  const customer = paper(confirmInputs(), 'customer');
  const internal = paper(confirmInputs(), 'internal');
  assert.deepEqual(sheets(customer.html).map((s) => s.kind), ['summary', 'zone', 'zone', 'signoff']);
  assert.deepEqual(sheets(internal.html).map((s) => s.kind), ['summary', 'zone', 'zone', 'signoff', 'appendix', 'appendix']);
  assert.deepEqual(Object.values(customer.layout.zonePage), [2, 3]);
  assert.deepEqual(Object.values(internal.layout.zonePage), [2, 3]);
  assert.deepEqual(customer.layout.overflow, []);
  assert.deepEqual(internal.layout.overflow, []);
  assert.ok(sheetHtml(internal.html, 6).includes(CONFIRM_TH), 'แถวอยู่หน้าภาคผนวก ง');
  assert.equal(sheetHtml(internal.html, 5).includes(CONFIRM_TH), false);
});

test('🔴 S5 F ไม่ผูก / ใบต้นทางหาย (ตัวโหลดคืน null) และภาพนิ่งทุกฉบับก่อนกลุ่มนี้ (ไม่มีคีย์): ไม่มีแถวทั้งสองฉบับ · กระดาษเท่าเดิม', () => {
  const built = buildSurveyReportSnapshot(confirmInputs(), { mode: 'freeze' });
  const old = structuredClone(built.snapshot);
  delete old.request.confirmsDocNo;
  for (const version of ['customer', 'internal']) {
    const plain = paper(twin(), version);
    assert.equal(plain.html.includes('ยืนยันผลจากแบบของ'), false, version);
    const view = surveyReportView(old, { version });
    const html = renderSurveyReportHTML({ view, layout: paginateSurveyReport(view), docNo: DOC_NO, issuedAt: '2026-09-26' });
    assert.equal(html, plain.html, `${version}: ภาพนิ่งที่ไม่มีคีย์ = กระดาษของแฝด`);
  }
});

test('S5 F รุ่นตัวเรนเดอร์ขยับจาก 2026-10-15a (กระดาษที่ตรึงหลังกลุ่มนี้พกแถวใหม่ได้ — แถวของตารางเก็บรุ่น)', () => {
  assert.equal(SURVEY_REPORT_RENDERER_VERSION, 'fm-ts-01@2026-10-27a');
  assert.ok(SURVEY_REPORT_RENDERER_VERSION.slice('fm-ts-01@'.length) > '2026-10-15a');
});

test('S5 F harness: `--synthetic confirm|confirm-rq` ตรวจด้วยผลที่ล็อกของ onsite + confirmRowFailures — จับแถวหาย/แถวซ้ำ/รั่วลงฉบับลูกค้าได้จริง', () => {
  assert.deepEqual(Object.keys(SURVEY_CONFIRM_GOLDEN), ['confirm', 'confirm-rq']);
  assert.equal(syntheticOf('confirm').fixture, confirmSurveyFixture);
  assert.deepEqual([syntheticOf('confirm').golden, syntheticOf('confirm-rq').golden, syntheticOf('mixed').golden], ['onsite', 'onsite', 'mixed']);
  assert.deepEqual(Object.keys(SURVEY_GOLDEN), ['onsite', 'mixed', 'drawing'], 'ตารางทองคำของ S3 ไม่เพิ่มแถว');
  assert.throws(() => syntheticOf('confirmed'), /--synthetic ไม่รู้จักชุด "confirmed" — มี: onsite · mixed · drawing · confirm · confirm-rq/);

  const papersOf = (inputs) => ['customer', 'internal'].map((version) => ({ version, ...paper(inputs, version) }));
  for (const [name, opts, value] of [['confirm', {}, CONFIRM_FULL], ['confirm-rq', { reportDocNo: null }, CONFIRM_ORIGINAL.requestDocNo]]) {
    const inputs = surveyReportInputsFromFixture(syntheticOf(name).fixture());
    assert.equal(inputs.confirmsDocNo, value, name);
    const papers = papersOf(confirmInputs(opts));
    assert.deepEqual(goldenFailures(papers, DOC_NO, syntheticOf(name).golden), [], `${name}: ผลที่ล็อกของ onsite ทุกข้อ`);
    assert.deepEqual(confirmRowFailures(papers, value), [], name);
  }
  const papers = papersOf(confirmInputs());
  const plain = papersOf(twin());
  assert.deepEqual(confirmRowFailures(plain, null), [], 'ชุดที่ไม่ผูก: ไม่มีแถวทั้งสองฉบับ');
  // แถวหาย (กระดาษของแฝดแต่อินพุตพกเลข) · แถวโผล่ในชุดที่ไม่ผูก · แถวซ้ำ · ฉบับลูกค้ารั่วป้ายและเลข
  assert.deepEqual(confirmRowFailures(plain, CONFIRM_FULL), [
    'internal: แถว "ยืนยันผลจากแบบของ" ต้องมี 1 แถว — พบ 0',
    'internal: แถว "ยืนยันผลจากแบบของ" ต้องพิมพ์ RQ-AS-26100345',
    'internal: แถว "ยืนยันผลจากแบบของ" ต้องพิมพ์ SU-26100003-0',
  ]);
  assert.deepEqual(confirmRowFailures(papers, null), ['internal: แถว "ยืนยันผลจากแบบของ" ต้องมี 0 แถว — พบ 1']);
  const internal = papers.find((p) => p.version === 'internal');
  const doubled = { ...internal, html: internal.html.replace('</tbody>', `<tr>${CONFIRM_TH}<td>x</td></tr></tbody>`) };
  assert.deepEqual(confirmRowFailures([doubled], CONFIRM_FULL), ['internal: แถว "ยืนยันผลจากแบบของ" ต้องมี 1 แถว — พบ 2']);
  const leaked = { version: 'customer', html: `${papers[0].html}<p>ยืนยันผลจากแบบของ ${CONFIRM_FULL}</p>` };
  assert.deepEqual(confirmRowFailures([leaked], CONFIRM_FULL), [
    'customer: ฉบับลูกค้าต้องไม่มี "ยืนยันผลจากแบบของ"',
    'customer: ฉบับลูกค้าต้องไม่มีเลข RQ-AS-26100345 ของใบต้นทาง',
    'customer: ฉบับลูกค้าต้องไม่มีเลข SU-26100003-0 ของใบต้นทาง',
  ]);
});
