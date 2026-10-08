// ── กระดาษของรายงานการประเมินพื้นที่ (FM-TS-01) — HTML ที่ออกจริง ──────────────────────────────
//
// ⭐ ล็อกหกเรื่อง:
//   ① 🔴 ฉบับลูกค้าไม่รั่ว — grep **ทั้งไฟล์ HTML** (รวม CSS) หาเครื่องหมายของทุกช่องภายใน + คำต้องห้าม (สเปก PR-1 §7)
//   ② ฉบับภายใน: แถบ "ฉบับภายใน" ทุกแผ่น · จุดที่ไม่เลือกไม่โผล่
//   ③ ทองคำ (แฝดสังเคราะห์ของ RQ-AS-26090186): 4 / 6 แผ่น · คอลัมน์ "หน้า" 2, 3 · หัววิ่งมีแค่เลขที่เอกสาร · "หน้า x / N"
//   ④ รูป: token `su-img:<sha>` ตั้งต้น · แปลงครบ · ไม่มี `/api/` ในกระดาษ
//   ⑤ กระดาษเดินตามแผนหน้า — หนึ่งแผ่นต่อหนึ่งหน้าของแผน ชนิดตรงกัน (หน้า "(ต่อ)" · ตารางแบ่ง · ภาคผนวกหลายหน้า)
//   ⑥ 🔴 สีชื่อเอกสารเดินตามฉบับ (มติเจ้าของ 08/10/2026): ลูกค้า = สีใบเสนอราคา · ภายใน = สีใบสั่งขาย · ไม่มี teal
//
// ⚠️ ความสูงจริง (ไม่ล้นขอบล่าง · ตรงกับแผน) วัดได้ใน Chrome เท่านั้น — เทสต์ท้ายไฟล์รันเมื่อมี `PUPPETEER_EXECUTABLE_PATH`
//   (เครื่องนักพัฒนา) และข้ามเองใน CI · ของจริงพร้อมรูปใช้ `scripts/render-survey-report.mjs --assert`
import test from 'node:test';
import assert from 'node:assert/strict';
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
import {
  markedSurveyInputs, stressSurveyInputs, surveyReportInputsFromFixture, surveyStressCases, syntheticSurveyFixture, thaiText,
} from './surveyReportTestKit.mjs';
import { surveyReportView } from './surveyReportView.js';

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
  // ผู้อ่านของ `--doc-accent` ใน CSS ของกระดาษ = `--accent` ตัวเดียว และผู้อ่านของ `--accent` = ชื่อเอกสารตัวเดียว
  assert.equal(count(SURVEY_REPORT_CSS, 'var(--doc-accent)'), 1);
  assert.equal(count(SURVEY_REPORT_CSS, 'var(--accent)'), 1);
  assert.match(SURVEY_REPORT_CSS, /\.surveyReport \.sheet \.dh-title\{[^}]*color:var\(--accent\);\}/);
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
          if (m.marks.signoff) assert.ok(Math.abs(m.marks.signoff.height - SURVEY_REPORT_PX.signoff.height) <= TOLERANCE, `${at}: รับรอง ${m.marks.signoff.height}`);
          if (m.marks.signs) assert.ok(Math.abs(m.marks.signs.height - SURVEY_REPORT_PX.appendix.signs) <= TOLERANCE, `${at}: ลงนาม ${m.marks.signs.height}`);
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
