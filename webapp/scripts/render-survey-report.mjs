#!/usr/bin/env node
/* ── ตัวเรนเดอร์ทดลองของรายงานการประเมินพื้นที่ (FM-TS-01) — เครื่องมือของนักพัฒนา ไม่ใช่โค้ดของแอป ─────────
 *
 * 🔴 **ไม่แตะฐาน ไม่แตะ Drive ไม่เรียก API** — dev DB = prod DB ⇒ ห้ามทดสอบเอกสารนี้ด้วยการกด "ส่งผล" ในแอป
 *   ทุกอย่างมาจากไฟล์: `fixture.json` (ของจริงที่ดึงแบบอ่านอย่างเดียว) + โฟลเดอร์รูปที่ย่อแล้ว แล้วเดินสายจริงทั้งเส้น
 *     อินพุต → `buildSurveyReportSnapshot` → `surveyReportView` (สองฉบับ) → `paginateSurveyReport` → `renderSurveyReportHTML`
 *     → Chrome ในเครื่อง → PDF + PNG ทีละหน้า + ผลวัดจริงของทุกแผ่น (`fit.json`)
 *
 * ใช้ทำอะไร:
 *   ① เทียบหน้าตากับกระดานที่อนุมัติ (`mockups/survey-report-doc/shots/R-*.png`) ทีละหน้า
 *   ② **สอบเทียบตัวจัดหน้า** — แผนหน้า (`surveyReportLayout.js`) ประเมินความสูงด้วยตัวเลข · ที่นี่วัดของจริงใน Chrome
 *      แล้วพิมพ์ตารางเทียบ (ขอบล่างตามแผน vs ที่วัดได้ · ตำแหน่งตารางหน้า 1 · ความสูงกล่องผัง) — ต่างกัน = แก้ค่าคงที่
 *   ③ `--assert` ล็อกผลของ fixture จริง: ลูกค้า 4 หน้า · ภายใน 6 หน้า · คอลัมน์ "หน้า" = 2, 3 · ยอดรวม · ไม่มีหน้าไหนล้น
 *      และล้มเมื่อ (ทุกชุดอินพุต): จุดอ้างอิงของแผน (ตารางบน · ความสูงผัง · การรับรอง · ลงนาม) ต่างจากที่วัดเกิน 8px ·
 *      ขอบล่างจริงเกินที่แผนคิด · แผนรายงานหน้าล้น (`overflow`) · PDF มีฟอนต์อื่นนอกจาก Sarabun (อักขระที่ฟอนต์ฝังไม่มี)
 *   ④ `--pipeline` (PR-2 §16 ข้อ 2) — **เดินสองขั้นของของจริงทั้งเส้น** ด้วยโค้ดชุดเดียวกับ production:
 *      ขั้นออกเลข (`issueSurveyReport`: ตัวโหลดอินพุต → ด่าน → ย่อรูปด้วย sharp จริง → วัดกระดาษใน Chrome → RPC) แล้ว
 *      ขั้นกระดาษ (`ensureSurveyReportPaper`: วัดสองฉบับ → ตรึง HTML → เก็บ PDF) · **ฐาน ที่เก็บไฟล์ และ Drive อยู่ในหน่วยความจำ**
 *      (`surveyPipelineWorld`) · ยามเขียนถาวรถูกเสียบเป็นเปิด (`storeAllowed: true`) เฉพาะกับของปลอมชุดนี้ · audit เป็นของปลอม
 *      ผลที่คาด: สถานะ `missing → issued → ready` · รอบสอง `reused` (เลขเดิม ไม่ดึงรูปซ้ำ ไม่พิมพ์ซ้ำ)
 *
 * รัน (จาก `webapp/`):
 *   PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node --import ./scripts/test-loader.mjs scripts/render-survey-report.mjs \
 *     --fixture ~/ss-team/mockups/survey-report-doc/real/fixture.json \
 *     --photos ~/ss-team/mockups/survey-report-doc/real/photos \
 *     --doc-no SU-26090001-0 --issued 2026-09-26 \
 *     --out ~/ss-team/mockups/survey-report-doc/render --assert
 *
 *   # ไปป์ไลน์ (เลขที่มาจาก RPC ปลอม — `--doc-no` ไม่ถูกใช้):
 *   PUPPETEER_EXECUTABLE_PATH="…" node --import ./scripts/test-loader.mjs scripts/render-survey-report.mjs \
 *     --fixture ~/ss-team/mockups/survey-report-doc/real/fixture.json \
 *     --photos ~/ss-team/mockups/survey-report-doc/real/photos \
 *     --pipeline --out ~/ss-team/mockups/survey-report-doc/render-pr2 --assert
 *
 * ตัวเลือกอื่น:
 *   --synthetic          ใช้แฝดสังเคราะห์ของ fixture (ไม่มีชื่อลูกค้าจริง) แทน `--fixture` · รูปเป็นกล่องเทา
 *                        (ใน `--pipeline` = JPEG สีพื้นที่สร้างด้วย sharp — ไฟล์ละสี sha จึงไม่ซ้ำ)
 *   --stress             ชุดสุดขอบทุกกรณีของ `surveyStressCases()` (12 พื้นที่ · รูปเยอะ/แนวตั้ง · หมายเหตุยาว · ประวัติ 14 แถว ·
 *                        ขนาดรวมสาม/สี่ขนาด · หน้า 1 ชิดเพดาน · ตีกลับ 10 × 300 · คำร้อง 4,000 ตัว · ไม่มีผัง) — กรณีแรกลง `--out`
 *                        กรณีที่เหลือลง `--out/cases/<ชื่อ>` · `--case <ชื่อ>` = กรณีเดียว (ใช้กับ `--pipeline` ไม่ได้)
 *   --no-spot-links      ไม่ผูกรูปจุดตามลำดับอัป (ของจริงของ RQ-AS-26090186 ไม่มี `metadata.spotId`) ⇒ ต้องติดด่านตรึง
 *   --scale 2            PNG คมขึ้นสองเท่า (ค่าตั้งต้น 1 = 794×1123 เท่ากระดาน)
 *   --via send           (`--pipeline`) เดินแบบเส้นส่งผล: ตรวจรูปก่อน (S3) → ออกเลขโดยไม่วัดกระดาษ → ขั้นกระดาษ
 *                        ค่าตั้งต้น `issue_only` = ปุ่ม "ออกเอกสาร" (วัดกระดาษใน Chrome ก่อนออกเลข · I5b)
 *   --issued YYYY-MM-DD  (`--pipeline`) ตรึงนาฬิกาของรอบไว้ที่เที่ยงวันนั้นตามเวลาไทย (เดือนในเลขที่ + วันที่ออก) · ไม่ส่ง = นาฬิกาจริง
 *
 * ชื่อไฟล์รูป: `<อะไรก็ได้>z<เลขพื้นที่>-<wide|plan|spot>[-<ลำดับ>].jpg` เช่น `rq186-z1-wide-2.jpg` · `rq186-z1-plan.jpg`
 * ⚠️ `fixture.json` กับผลลัพธ์มีชื่อลูกค้าและเบอร์โทรจริง — อยู่นอกรีโป อย่าย้ายเข้ามา
 * ⚠️ ไฟล์นี้ถูก import จากเทสต์ด้วย (`surveyReportTooling.test.mjs` เดินไปป์ไลน์ด้วยตัวพิมพ์ปลอม) — ส่วนที่รันจริงอยู่ใต้ `isMain`
 *   และ chromium (`htmlPdf.js`) โหลดแบบ lazy เท่านั้น
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pdfFonts, pdfPageCount } from '../src/lib/documents/pdfInspect.js';
import { listAttachments } from '../src/lib/master/attachments.js';
import { ROLE_LABELS } from '../src/lib/permissions.js';
import { renderSurveyReportHTML, resolveImageTokens, surveyReportImageShas } from '../src/lib/service/surveyReportDocument.js';
import { prepareSurveyReportImages, surveyReportImagePath } from '../src/lib/service/surveyReportImages.js';
import { SURVEY_REPORT_STANDARD_KEY } from '../src/lib/service/surveyReportInputs.js';
import { issueSurveyReport } from '../src/lib/service/surveyReportIssue.js';
import {
  SURVEY_REPORT_PX, paginateSurveyReport, surveyReportOverflowErrors,
} from '../src/lib/service/surveyReportLayout.js';
import {
  SURVEY_REPORT_VERSIONS, ensureSurveyReportPaper, measureSurveyReportPaper, surveyReportPdfPath, surveyReportPrintSession,
} from '../src/lib/service/surveyReportPaper.js';
import { SURVEY_REPORT_BUCKET, loadSurveyReports } from '../src/lib/service/surveyReportRows.js';
import { buildSurveyReportSnapshot, surveyReportImageFiles } from '../src/lib/service/surveyReportSnapshot.js';
import {
  SURVEY_REPORT_FIT_MARGIN, surveyReportCustomerHtmlIssues, surveyReportState,
} from '../src/lib/service/surveyReportState.js';
import {
  stressSurveyInputs, surveyReportInputsFromFixture, surveyStressCases, syntheticSurveyFixture,
} from '../src/lib/service/surveyReportTestKit.mjs';
import { surveyReportSendWarnings, surveyReportView } from '../src/lib/service/surveyReportView.js';
import { loadSurveyZones } from '../src/lib/service/surveyRepo.js';

/* ── อาร์กิวเมนต์ ─────────────────────────────────────────────────────── */

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

const expand = (p) => resolve(String(p).replace(/^~(?=\/|$)/, homedir()));

const USAGE = 'ใช้: render-survey-report.mjs (--fixture <json> [--photos <dir>] | --synthetic | --stress [--case <ชื่อ>]) --out <dir> '
  + '[--doc-no SU-…] [--issued YYYY-MM-DD] [--assert] [--scale 2] [--no-spot-links] [--pipeline [--via send|issue_only]]';

/* ── รูป ──────────────────────────────────────────────────────────────── */

/** ขนาดของ JPEG จากหัวไฟล์ (SOF) — ไม่ใช้ sharp: รูปของ harness ย่อมาแล้ว */
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * โฟลเดอร์รูป → `{ photos: { 'z1-wide-1': { sha, w, h, bytes } }, bySha: { sha: dataUri }, files: { 'z1-wide-1': Buffer } }`
 * · `files` = เนื้อไฟล์ดิบ — Drive ปลอมของ `--pipeline` คืนไบต์ชุดนี้ให้ตัวย่อรูปจริง
 */
function loadPhotos(dir) {
  const photos = {};
  const bySha = {};
  const files = {};
  for (const name of readdirSync(dir).sort()) {
    const match = name.match(/z(\d+)-(wide|plan|spot)(?:-(\d+))?\.jpe?g$/i);
    if (!match) continue;
    const buf = readFileSync(join(dir, name));
    const size = jpegSize(buf);
    if (!size) throw new Error(`อ่านขนาดรูปไม่ได้: ${name}`);
    const sha = createHash('sha256').update(buf).digest('hex');
    const key = `z${Number(match[1])}-${match[2].toLowerCase()}-${Number(match[3] || 1)}`;
    photos[key] = { sha, w: size.w, h: size.h, bytes: buf.length };
    bySha[sha] = `data:image/jpeg;base64,${buf.toString('base64')}`;
    files[key] = buf;
  }
  return { photos, bySha, files };
}

/** กล่องเทาบอกขนาด — รูปของชุดสังเคราะห์/สุดขอบ (ไม่มีไฟล์จริง) */
function placeholder(img) {
  const w = img.w || 1400;
  const h = img.h || 1051;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#dfe4e8"/>`
    + `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#b9c1c8" stroke-width="4"/>`
    + `<text x="50%" y="50%" font-family="Arial" font-size="${Math.round(h / 9)}" fill="#647080" text-anchor="middle" dominant-baseline="middle">${w}×${h}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/* ── เรนเดอร์ ─────────────────────────────────────────────────────────── */

const SHEET = { width: 794, height: 1123 };
const FIT_MARGIN = SURVEY_REPORT_FIT_MARGIN; // เนื้อหาต้องจบก่อนเส้นท้ายกระดาษอย่างน้อยเท่านี้ (กระดาน R-C-1:21-27) — ค่าเดียวกับขั้นกระดาษ
const MARK_TOLERANCE = 8; // จุดอ้างอิงของแผนต่างจากที่วัดได้ไม่เกินเท่านี้ (px)

/* `pdfPageCount` · `pdfFonts` ย้ายไป `lib/documents/pdfInspect.js` (PR-2 §4) — ขั้นกระดาษของ production กับ harness นับด้วยตัวเดียวกัน
   🔴 กระดาษฝัง Sarabun ชุด latin + thai เท่านั้น — อักขระนอกชุด ("≤" "⇒" อีโมจิ) ทำให้ Chrome หยิบฟอนต์ของเครื่องมาแทน
     (เครื่องนักพัฒนา: Tahoma / Hiragino เป็น Type3) และ chromium บน production มีแต่ Open Sans ⇒ กล่องสี่เหลี่ยมบนกระดาษที่ตรึงแล้ว */

async function renderVersion(browser, pdfLib, { version, snapshot, bySha, dir, docNo, issuedAt, scale }) {
  const view = surveyReportView(snapshot, { version });
  const layout = paginateSurveyReport(view);
  let placeholders = 0;
  const html = renderSurveyReportHTML({
    view, layout, docNo, issuedAt: issuedAt || snapshot.request?.answeredAt,
    imageSrc: (img) => {
      if (!img?.sha) return null;
      if (bySha[img.sha]) return bySha[img.sha];
      placeholders += 1;
      return placeholder(img);
    },
  });
  writeFileSync(join(dir, `${version}.html`), html);

  const { page, brokenImages } = await pdfLib.openHtmlPage(browser, html);
  await page.setViewport({ ...SHEET, deviceScaleFactor: scale });
  const fit = await pdfLib.measureSheets(page);
  const pdf = Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true }));
  writeFileSync(join(dir, `${version}.pdf`), pdf);

  // PNG ทีละแผ่น ใต้ media print (สิ่งเดียวกับ PDF) — ซ่อนแผ่นอื่นแล้วถ่ายที่ขอบบนซ้ายเสมอ (ไม่มีเศษพิกเซลจากแผ่นก่อนหน้า)
  const count = await page.evaluate(() => document.querySelectorAll('.sheet').length);
  for (let i = 0; i < count; i += 1) {
    await page.evaluate((index) => {
      document.querySelectorAll('.sheet').forEach((sheet, k) => { sheet.style.display = k === index ? '' : 'none'; });
      window.scrollTo(0, 0);
    }, i);
    await page.screenshot({ path: join(dir, `${version}-p${i + 1}.png`), clip: { x: 0, y: 0, ...SHEET } });
  }
  await page.close();
  return {
    version, view, layout, html, fit, brokenImages, placeholders, sheets: count,
    pdfPages: pdfPageCount(pdf), pdfFonts: pdfFonts(pdf), pdfBytes: pdf.length, htmlBytes: Buffer.byteLength(html),
  };
}

/* ── รายงาน ───────────────────────────────────────────────────────────── */

const pad = (v, n) => String(v ?? '').padEnd(n);
const num = (v) => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toString());
const mb = (bytes) => `${(Number(bytes || 0) / 1e6).toFixed(2)} MB`;

function report(result) {
  const { version, layout, fit } = result;
  const issues = [];
  console.log(`\n${version}: ${layout.pageCount} หน้า · HTML ${mb(result.htmlBytes)} · PDF ${mb(result.pdfBytes)} (${result.pdfPages ?? '?'} หน้า) · ฟอนต์ ${result.pdfFonts.names.join(' ') || '—'}`);
  console.log(`  ${pad('หน้า', 5)}${pad('ชนิด', 13)}${pad('แผน', 7)}${pad('วัดได้', 8)}${pad('ต่าง', 7)}${pad('เส้นท้าย', 9)}${pad('ล่างสุด', 9)}${pad('เหลือ', 7)}จุดอ้างอิง`);
  const rows = layout.pages.map((page, i) => {
    const m = fit[i] || {};
    const delta = m.body === undefined ? null : m.body - page.bottom;
    const room = m.rule === null || m.rule === undefined ? null : m.rule - m.last;
    /* จุดอ้างอิง: ค่าที่แผนคิด vs ที่วัดได้ — ต่างเกิน `MARK_TOLERANCE` = ค่าคงที่ของแผนเพี้ยนจากกระดาษ (แก้ CSS แล้วลืมแก้แผน) */
    const marks = [];
    const check = (label, measured, planned) => {
      if (measured === undefined || measured === null) return;
      marks.push(`${label} ${num(measured)}${planned === undefined ? '' : ` (แผน ${num(planned)})`}`);
      if (planned !== undefined && Math.abs(measured - planned) > MARK_TOLERANCE) {
        issues.push(`${version} หน้า ${page.no} (${page.kind}) ${label}: แผน ${num(planned)} วัดได้ ${num(measured)} — ต่างเกิน ${MARK_TOLERANCE}px`);
      }
    };
    check('ตารางบน', m.marks?.table?.top, page.tableTop);
    check('ผัง', m.marks?.plan?.height, page.planHeight);
    check('รับรอง', m.marks?.signoff?.height, m.marks?.signoff ? SURVEY_REPORT_PX.signoff.height : undefined);
    check('ลงนาม', m.marks?.signs?.height, m.marks?.signs ? SURVEY_REPORT_PX.appendix.signs : undefined);
    console.log(`  ${pad(page.no, 5)}${pad(page.kind, 13)}${pad(page.bottom, 7)}${pad(num(m.body), 8)}${pad(delta === null ? '—' : num(delta), 7)}${pad(num(m.rule), 9)}${pad(num(m.last), 9)}${pad(num(room), 7)}${marks.join(' · ')}`);
    if (room === null || room < FIT_MARGIN) issues.push(`${version} หน้า ${page.no} (${page.kind}) ล้นขอบล่าง — เหลือ ${num(room)}px ใต้ ${m.lastBlock}`);
    if (m.body !== undefined && m.body > page.limit + 0.5) issues.push(`${version} หน้า ${page.no} (${page.kind}) เนื้อหาจบที่ ${num(m.body)} เกินงบของแผน ${page.limit}`);
    // แผนประเมินต่ำกว่าจริง = วันหนึ่งล้นโดยแผนไม่รู้ (ประเมินสูงกว่าจริงจากการตัดบรรทัดของข้อความ = ฝั่งปลอดภัย รายงานในคอลัมน์ "ต่าง")
    if (delta !== null && delta > 1) issues.push(`${version} หน้า ${page.no} (${page.kind}) แผนประเมินต่ำกว่าจริง ${num(delta)}px (แผน ${page.bottom} วัดได้ ${num(m.body)})`);
    return { no: page.no, kind: page.kind, planned: page.bottom, limit: page.limit, planHeight: page.planHeight ?? null, tableTop: page.tableTop ?? null, cont: page.cont?.text ?? null, ...m, delta, room };
  });
  if (result.sheets !== layout.pageCount) issues.push(`${version}: HTML มี ${result.sheets} แผ่น แต่แผนมี ${layout.pageCount} หน้า`);
  if (result.pdfPages !== null && result.pdfPages !== layout.pageCount) issues.push(`${version}: PDF มี ${result.pdfPages} หน้า แต่แผนมี ${layout.pageCount} หน้า`);
  if (result.brokenImages) issues.push(`${version}: รูปถอดรหัสไม่ได้ ${result.brokenImages} รูป`);
  for (const error of surveyReportOverflowErrors(layout)) issues.push(`${version}: แผน — ${error}`);
  /* ฟอนต์: Sarabun เท่านั้น — รูปกล่องเทาของชุดสังเคราะห์เขียนขนาดด้วย Arial (ไม่ใช่ข้อความของกระดาษ) จึงยกเว้นเมื่อมีกล่องเทา */
  const allowed = (name) => /^Sarabun-/.test(name) || (result.placeholders > 0 && /^Arial/.test(name));
  const foreign = result.pdfFonts.names.filter((name) => !allowed(name));
  if (foreign.length || result.pdfFonts.type3) {
    issues.push(`${version}: PDF มีฟอนต์นอกจาก Sarabun — ${[...foreign, result.pdfFonts.type3 ? `Type3 × ${result.pdfFonts.type3}` : null].filter(Boolean).join(' · ')} (มีอักขระที่ฟอนต์ฝังไม่มี)`);
  }
  return { rows, issues };
}

/**
 * ผลของ fixture จริง RQ-AS-26090186 (และแฝดสังเคราะห์ ซึ่งตัวเลขเท่ากันทุกตัว) — มติเจ้าของ + กระดานที่อนุมัติ
 * @param results `[{ version, view, layout, html, fit? }]` — `fit` ไม่มี (ไปป์ไลน์: ผลวัดอยู่ในขั้นกระดาษ) = ข้ามข้อของตารางหน้า 1
 */
export function goldenFailures(results, docNo) {
  const failures = [];
  const expect = (ok, text) => { if (!ok) failures.push(text); };
  const customer = results.find((r) => r.version === 'customer');
  const internal = results.find((r) => r.version === 'internal');
  expect(customer.layout.pageCount === 4, `ฉบับลูกค้าต้อง 4 หน้า — ได้ ${customer.layout.pageCount}`);
  expect(internal.layout.pageCount === 6, `ฉบับภายในต้อง 6 หน้า — ได้ ${internal.layout.pageCount}`);
  expect(internal.layout.pages.map((p) => p.kind).join(',') === 'summary,zone,zone,signoff,appendix,appendix',
    `ลำดับหน้าฉบับภายในผิด — ${internal.layout.pages.map((p) => p.kind).join(',')}`);
  for (const r of results) {
    expect(JSON.stringify(Object.values(r.layout.zonePage)) === '[2,3]', `${r.version}: คอลัมน์ "หน้า" ต้องเป็น 2, 3 — ได้ ${JSON.stringify(r.layout.zonePage)}`);
    expect(r.view.table.total.sqm === '173.31', `${r.version}: รวม ตร.ม. ต้อง 173.31 — ได้ ${r.view.table.total.sqm}`);
    expect(r.view.table.total.cbm === '949.75', `${r.version}: รวม ลบ.ม. ต้อง 949.75 — ได้ ${r.view.table.total.cbm}`);
    expect(r.view.table.total.sizeMix === 'SM 1 · ST 1', `${r.version}: ขนาดรวมต้อง "SM 1 · ST 1" — ได้ ${r.view.table.total.sizeMix}`);
    expect(r.view.survey.timeText === '12:00 น. (ตามนัด)', `${r.version}: เวลาต้อง "12:00 น. (ตามนัด)" — ได้ ${r.view.survey.timeText}`);
    expect(r.html.includes(`<div class="rh-ref">${docNo}</div>`), `${r.version}: หัววิ่งต้องมีแค่เลขที่เอกสาร`);
  }
  // ตำแหน่งบนสุดของตารางหน้า 1 — ค่าคงที่ของตัวจัดหน้าต้องไม่ต่ำกว่าที่วัดได้ (ประเมินต่ำ = ล้นจริงโดยแผนไม่รู้)
  for (const r of results) {
    if (!r.fit) continue;
    const top = r.fit[0]?.marks?.table?.top;
    const planned = SURVEY_REPORT_PX.summary.tableTop[r.version];
    expect(top !== undefined && top <= planned + 0.5 && planned - top <= 4,
      `${r.version}: ตารางหน้า 1 เริ่มที่ ${num(top)} แต่ตัวจัดหน้าตั้งไว้ ${planned} — แก้ SURVEY_REPORT_PX.summary.tableTop`);
  }
  return failures;
}

/* ══ ไปป์ไลน์ (PR-2 §16 ข้อ 2) — โลกในหน่วยความจำ ═══════════════════════════════════════════════════ */

/* ช่องของแถวเอกสารที่เติมได้ครั้งเดียว (mig 0401 ② `v_once`) — ที่เหลือแก้ไม่ได้ ยกเว้น `status` · `updatedAt` */
const REPORT_WRITE_ONCE = new Set([
  'customerHtml', 'internalHtml', 'rendererVersion', 'frozenAt', 'customerPdfPath', 'internalPdfPath', 'supersededAt', 'supersededReason',
]);
/* ชนิดไฟล์ที่ถัง `survey-report` รับ (mig 0401 ⑥) */
const BUCKET_MIME = new Set(['image/jpeg', 'application/pdf']);

/** `.select('a, "b", c:x->y->>z')` → ตัวคัดคอลัมน์ · `*` = ทั้งแถว (คืน `null`) */
function projectorOf(select) {
  const text = String(select ?? '*').trim();
  if (text === '*') return null;
  return text.split(',').map((c) => c.trim()).filter(Boolean).map((c) => {
    const [alias, expr] = c.includes(':') ? c.split(':') : [null, c];
    const parts = expr.replace(/"/g, '').split(/->>?/);
    return [(alias || parts[0]).replace(/"/g, ''), (row) => parts.reduce((v, p) => (v == null ? null : v[p]), row) ?? null];
  });
}

/* "29/09/2569" (พ.ศ. — รูปที่ชุดทดสอบถือ) → "2026-09-29" (รูปที่ตาราง `document_standard_versions` เก็บ) */
function isoFromThaiDate(text) {
  const m = String(text ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${Number(m[3]) - 543}-${m[2]}-${m[1]}` : (text || null);
}

/** คนที่กดในไปป์ไลน์ (ผู้ออกเอกสาร `issued*`) — ผู้อนุมัติ (`approved*`) มาจากคำตอบของคำร้องใน fixture */
export const PIPELINE_USER = Object.freeze({ id: 'U-harness', name: 'Harness Presser', role: 'ts_manager', team: 'TS' });

/**
 * 🔑 **ฐาน + ที่เก็บไฟล์ + Drive ในหน่วยความจำ** จากอินพุตของชุดทดสอบ (`surveyReportInputsFromFixture(…, { withImages: false })`)
 *
 * · ตาราง: รูปเดียวกับที่ฐานเก็บ (แถวผลวัดไม่มี `zoneCode` — อ่านสดจากทะเบียน · ไฟล์แนบมี `driveFileId`) ⇒ ตัวโหลดอินพุตของจริง
 *   (`loadSurveyReportInputs`) อ่านได้ครบทุกชิ้น · ตารางที่ไม่รู้จัก = error (ชิ้นนั้นเข้า `unknown` ให้เห็น ไม่เงียบเป็น "ไม่มี")
 * · RPC `issue_survey_report` ทำตาม 0401 ④ ทีละขั้น: ตรวจหัวข้อ/ยกเลิก → คำตอบเดิม → ฉบับที่ใช้อยู่ → เลขฐานเดิม R ถัดไป
 *   หรือกินเลขรันของปี → insert (ตัวเดียวกับของเทสต์ขั้นออกเลข)
 * · **เขียนได้ตารางเดียว** `service_survey_reports` (update เท่านั้น) พร้อมยามเติมครั้งเดียวของ 0401 ② — ตารางอื่นถูกเขียน = โยน
 *   (ไปป์ไลน์ต้องไม่แตะคำร้อง เธรด หรือ audit: audit ถูกเสียบเป็นของปลอมจากผู้เรียก)
 * · ถัง: รับเฉพาะ `image/jpeg` · `application/pdf` · อัปซ้ำที่เดิม = "already exists" (แบบ `upsert: false` ของจริง)
 * · Drive: `getFileStream(driveFileId)` คืน Buffer ของไฟล์ต้นฉบับ (`files` = `Map<driveFileId, Buffer | () => Promise<Buffer>>`) ·
 *   นับจำนวนครั้งที่แต่ละไฟล์ถูกดึงไว้ใน `drive.fetched`
 *
 * @param source  อินพุตของชุดทดสอบ PR-1 (ไม่มี `imageByAttId` — รูปต้องผ่านตัวย่อรูปจริง)
 * @param opts.files  ไฟล์ต้นฉบับบน "Drive" · @param opts.clock `() => Date` นาฬิกาของฐาน (`issuedAt` ของแถว)
 * @returns `{ supabase, tables, objects, drive, rpcCalls, writes, request(), reports() }`
 */
export function surveyPipelineWorld(source, { files = new Map(), clock = () => new Date() } = {}) {
  const requestId = source.request.id;
  const helperIds = (source.helpers || []).map((_, i) => `U-helper-${i + 1}`);
  const assessorId = source.visit ? (source.visit.assigneeId || 'U-assessor') : null;
  const assessorRole = Object.keys(ROLE_LABELS).find((role) => ROLE_LABELS[role] === source.assigneeRoleLabel) || null;
  const users = Object.fromEntries([
    ...(assessorId ? [[assessorId, {
      id: assessorId, email: 'assessor@example.test', app_metadata: { role: assessorRole }, user_metadata: { name: source.visit.assigneeName },
    }]] : []),
    ...(source.helpers || []).map((h, i) => [helperIds[i], {
      id: helperIds[i], email: `helper${i + 1}@example.test`, app_metadata: { role: 'ts' }, user_metadata: { name: h.name },
    }]),
  ]);
  const company = source.company || {};
  const form = source.form || null;

  const tables = {
    dept_requests: [{
      ...source.request,
      siteId: source.site ? 'SITE-1' : null, customerId: source.customer ? 'CUS-1' : null, dealId: source.deal ? 'DEAL-1' : null,
    }],
    service_survey_reports: [],
    entity_number_counters: [],
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...zone }) => ({ ...zone, requestId })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id, driveFileId: `drv-${f.id}` }))),
    service_zones: (source.zoneRegistry || []).map((z) => ({ ...z })),
    service_sites: source.site ? [{ id: 'SITE-1', ...source.site }] : [],
    customers: source.customer ? [{ id: 'CUS-1', name: source.customer.name, nameEn: null, arCode: source.customer.arCode }] : [],
    sales_deals: source.deal ? [{ id: 'DEAL-1', code: source.deal.code }] : [],
    service_visits: [
      ...(source.visit ? [{
        id: 'SVV-1', requestId, createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
        ...source.visit, assigneeId: assessorId, assistantIds: helperIds,
      }] : []),
      ...(source.priorUnable || []).map((v, i) => ({
        id: `SVV-unable-${i + 1}`, requestId, code: `SV-UNABLE-${i + 1}`, status: 'unable',
        scheduledDate: v.date, actualDate: v.date, startTime: null, endTime: null,
        actualStartTime: null, actualEndTime: null, actualEndDate: null,
        assigneeId: null, assigneeName: null, assistantIds: [], unableReason: v.reason,
        createdAt: `2026-09-2${Math.min(i, 3)}T01:00:00.000+00:00`,
      })),
    ],
    entity_updates: (source.history || []).map((h) => ({ ...h, entityType: 'dept_request', entityId: String(requestId) })),
    service_package_sizes: (source.sizes || []).map((s) => ({ ...s })),
    organization_setting_versions: [{
      organizationId: 'primary', status: 'published', legalNameTh: company.name || null, legalNameEn: null,
      taxId: company.taxId || null, branchCode: '00000', registeredAddressTh: company.address || null, registeredAddressEn: null,
      phone: company.tel || null, email: null, lineId: company.line || null, website: company.website || null,
    }],
    document_standard_versions: form ? [{
      documentKey: SURVEY_REPORT_STANDARD_KEY, status: 'published', versionNumber: 1,
      formCode: form.code, revision: form.revision, effectiveDate: isoFromThaiDate(form.effectiveDate), titleEn: 'SITE SURVEY REPORT',
    }] : [],
  };

  const rpcCalls = [];
  const writes = [];
  const objects = new Map();
  const fetched = new Map();
  const sameInstant = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
  const raise = (message, extra = {}) => ({ data: null, error: { code: 'P0001', message, details: null, ...extra } });

  /* 0401 ④ — ทั้งก้อนเป็น synchronous = ทรานแซกชันเดียวใต้ล็อกแถวคำร้อง */
  function issueInDb(a) {
    if (!a.p_report_id) return raise('survey_report_id_required');
    if (!/^[0-9]{2}(0[1-9]|1[0-2])$/.test(String(a.p_yymm ?? ''))) return raise(`survey_report_month_invalid: ${a.p_yymm}`);
    const snap = a.p_row?.snapshot;
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return raise('survey_report_snapshot_required');
    const req = tables.dept_requests.find((r) => r.id === a.p_request_id);
    if (!req || req.kind !== 'site_survey' || req.cancelledAt) return raise(`survey_request_invalid: ${a.p_request_id}`);
    if (!req.answeredAt || !sameInstant(req.answeredAt, a.p_answered_at)) return raise(`survey_answer_changed: ${a.p_request_id}`);
    const rows = tables.service_survey_reports;
    const mine = rows.filter((r) => r.requestId === a.p_request_id);
    if (mine.some((r) => r.status === 'current')) return raise(`survey_report_already_current: ${a.p_request_id}`);
    const year = String(a.p_yymm).slice(0, 2);
    const latest = [...mine].sort((x, y) => y.rev - x.rev)[0];
    let base = latest?.baseNo ?? null;
    let rev = latest ? latest.rev + 1 : 0;
    if (!base) {
      const counters = tables.entity_number_counters;
      let counter = counters.find((c) => c.scope === 'SU' && c.month === year);
      if (!counter) {
        counter = { scope: 'SU', month: year, lastNo: 0 };
        counters.push(counter);
      }
      counter.lastNo += 1;
      if (counter.lastNo > 9999) return raise(`survey_report_sequence_exhausted: ${year}`);
      base = `SU-${a.p_yymm}${String(counter.lastNo).padStart(4, '0')}`;
      rev = 0;
    }
    if (rows.some((r) => r.id === a.p_report_id)) {
      return raise('duplicate key value violates unique constraint "service_survey_reports_pkey"', { code: '23505' });
    }
    const nowIso = clock().toISOString();
    rows.push({
      id: a.p_report_id, requestId: a.p_request_id, baseNo: base, rev, docNo: `${base}-${rev}`, status: 'current',
      supersededAt: null, supersededReason: null,
      snapshot: structuredClone(snap), images: structuredClone(a.p_row.images ?? []),
      customerHtml: null, internalHtml: null, rendererVersion: null, frozenAt: null,
      customerPdfPath: null, internalPdfPath: null,
      approvedById: req.answeredById ?? null, approvedByName: req.answeredByName ?? null, approvedAt: req.answeredAt,
      issuedById: a.p_row.issuedById ?? null, issuedByName: a.p_row.issuedByName ?? null,
      issuedAt: nowIso, updatedAt: nowIso,
    });
    return { data: `${base}-${rev}`, error: null };
  }

  function from(table) {
    const q = { table, op: 'select', select: '*', patch: null, filters: [], orders: [], limit: null };
    const matches = (row) => q.filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'in') return val.includes(row[col]);
      if (op === 'is') return (row[col] ?? null) === val;
      return true;
    });
    const run = () => {
      if (!Object.hasOwn(tables, table)) return { data: null, error: { message: `relation "${table}" does not exist` } };
      if (q.op !== 'select' && (q.op !== 'update' || table !== 'service_survey_reports')) {
        throw new Error(`ไปป์ไลน์ห้ามเขียนตาราง ${table} (${q.op}) — เขียนได้เฉพาะแถวเอกสารผ่าน RPC กับการตรึง/ที่อยู่ไฟล์`);
      }
      let rows = tables[table].filter(matches);
      if (q.op === 'update') {
        for (const target of rows) {
          for (const [key, value] of Object.entries(q.patch || {})) {
            if (key === 'status' || key === 'updatedAt') continue;
            const old = target[key] ?? null;
            if (old === value) continue;
            if (!REPORT_WRITE_ONCE.has(key) || old !== null) {
              return { data: null, error: { code: 'P0001', message: `survey_report_immutable: ${target.docNo} ${key}` } };
            }
          }
          Object.assign(target, q.patch);
          writes.push({ table, id: target.id, keys: Object.keys(q.patch || {}) });
        }
      }
      for (const [col, asc] of [...q.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = a[col]; const y = b[col];
          if (x === y) return 0;
          return (x < y ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (q.limit != null) rows = rows.slice(0, q.limit);
      const cols = projectorOf(q.select);
      return {
        data: rows.map((row) => (cols ? Object.fromEntries(cols.map(([key, get]) => [key, get(row)])) : structuredClone(row))),
        error: null,
      };
    };
    const chain = {
      select(cols) { q.select = cols ?? '*'; return chain; },
      update(patch) { q.op = 'update'; q.patch = patch; q.select = 'id'; return chain; },
      insert() { q.op = 'insert'; return chain; },
      upsert() { q.op = 'upsert'; return chain; },
      delete() { q.op = 'delete'; return chain; },
      eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
      in(col, val) { q.filters.push(['in', col, val]); return chain; },
      is(col, val) { q.filters.push(['is', col, val]); return chain; },
      order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
      limit(n) { q.limit = n; return chain; },
      maybeSingle() {
        return Promise.resolve().then(run).then(({ data, error }) => ({ data: error ? null : (data[0] || null), error }));
      },
      then(onOk, onFail) { return Promise.resolve().then(run).then(onOk, onFail); },
    };
    return chain;
  }

  const supabase = {
    from,
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name !== 'issue_survey_report') return raise(`function ${name} does not exist`, { code: 'PGRST202' });
      return issueInDb(args);
    },
    auth: {
      admin: {
        async getUserById(id) {
          const user = users[id];
          if (!user) return { data: { user: null }, error: { status: 404, message: 'User not found' } };
          return { data: { user }, error: null };
        },
      },
    },
    storage: {
      from: (bucket) => ({
        async download(path) {
          const hit = bucket === SURVEY_REPORT_BUCKET ? objects.get(path) : null;
          if (!hit) return { data: null, error: { message: 'Object not found', status: 400, statusCode: '404' } };
          return { data: new Blob([hit.body]), error: null };
        },
        async upload(path, body, options = {}) {
          if (bucket !== SURVEY_REPORT_BUCKET) return { data: null, error: { message: 'Bucket not found', statusCode: '404' } };
          if (!BUCKET_MIME.has(options.contentType)) return { data: null, error: { message: `mime type ${options.contentType} is not supported`, statusCode: '415' } };
          if (objects.has(path)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
          objects.set(path, { body: Buffer.from(body), contentType: options.contentType });
          return { data: { path }, error: null };
        },
      }),
    },
  };

  const drive = {
    fetched,
    /** ตัวดึงไฟล์ปลอมของ Drive — คืน Buffer (ตัวเตรียมรูปรับได้ทั้ง Buffer และ stream) · ไม่มีไฟล์ = 404 แบบ Drive */
    async getFileStream(driveFileId) {
      fetched.set(driveFileId, (fetched.get(driveFileId) || 0) + 1);
      const hit = files instanceof Map ? files.get(driveFileId) : files?.[driveFileId];
      if (!hit) throw Object.assign(new Error(`File not found: ${driveFileId}`), { status: 404 });
      return typeof hit === 'function' ? hit() : hit;
    },
  };

  return {
    supabase, tables, objects, drive, rpcCalls, writes,
    request: () => tables.dept_requests[0],
    reports: () => tables.service_survey_reports,
  };
}

/** `Map<driveFileId, Buffer>` ของ fixture — จับคู่ไฟล์แนบกับไฟล์ในโฟลเดอร์รูปด้วยคีย์เดียวกับชุดทดสอบ (`z<เลขพื้นที่>-<ชนิด>-<ลำดับ>`) */
function driveFilesOfFixture(fixture, photoFiles) {
  const out = new Map();
  for (const [index, z] of (fixture.zones || []).entries()) {
    for (const kind of ['wide', 'plan', 'spot']) {
      for (const [i, f] of (z.photos?.[kind] || []).entries()) {
        const bytes = photoFiles?.[`z${z.no ?? index + 1}-${kind}-${i + 1}`];
        if (bytes) out.set(`drv-${f.id}`, bytes);
      }
    }
  }
  return out;
}

/**
 * ไฟล์ต้นฉบับสังเคราะห์ของทุกไฟล์ที่กระดาษพิมพ์ — JPEG สีพื้น (สีจาก id ไฟล์ ⇒ sha ไม่ซ้ำกัน) ขนาดเท่ารูปของชุดทดสอบ
 * (ภาพกว้าง/จุด 1400×1051 · ผัง 1199×919) สร้างด้วย sharp ตอนถูกดึงครั้งแรก
 */
export function syntheticDriveFiles(source) {
  const out = new Map();
  for (const { attId, kind } of surveyReportImageFiles(source)) {
    out.set(`drv-${attId}`, async () => {
      const { default: sharp } = await import('sharp');
      const tint = createHash('sha256').update(String(attId)).digest();
      const [width, height] = kind === 'plan' ? [1199, 919] : [1400, 1051];
      return sharp({ create: { width, height, channels: 3, background: { r: 120 + (tint[0] % 100), g: 120 + (tint[1] % 100), b: 120 + (tint[2] % 100) } } })
        .jpeg({ quality: 80 }).toBuffer();
    });
  }
  return out;
}

const PIPELINE_BUDGET_MS = 270_000; // งบของหนึ่งคำขอ — เท่ากับของ route เอกสาร (เพดานฟังก์ชัน 300 วิ เผื่อ 30)
const PIPELINE_PREFLIGHT_MS = 60_000; // งบของรอบตรวจรูปก่อนส่งผล (S3)

const plainIssue = (r) => ({
  state: r?.state ?? null, code: r?.code ?? null, docNo: r?.docNo ?? null, rev: r?.rev ?? null, reused: r?.reused ?? null,
  reason: r?.reason ?? null, retry: r?.retry ?? null, warnings: Array.isArray(r?.warnings) ? r.warnings : [],
});

/**
 * 🔑 **เดินสองขั้นสองรอบบนโลกในหน่วยความจำ** — รอบแรกออกเลขและทำกระดาษ · รอบสองต้องใช้ซ้ำทั้งหมด
 *
 * @param world              `surveyPipelineWorld(…)`
 * @param opts.via           `'issue_only'` (ค่าตั้งต้น · ปุ่ม "ออกเอกสาร": วัดกระดาษก่อนออกเลข) | `'send'` (ตรวจรูปก่อน แล้วออกเลขไม่วัด)
 * @param opts.clock         `() => Date` นาฬิกาของขั้นออกเลขและขั้นกระดาษ
 * @param opts.loadRenderer  ตัวโหลดตัวพิมพ์ (เทสต์ส่งของปลอม) — ไม่ส่ง = `htmlPdf.js` + Chrome จาก `PUPPETEER_EXECUTABLE_PATH`
 * @returns `{ via, states, first, second, docNo, reportId, audits, lines }`
 *   · `states`  สถานะจากแถว (§1) ก่อนเริ่ม · หลังขั้นออกเลข · หลังขั้นกระดาษ — ที่คาด `['missing', 'issued', 'ready']`
 *   · `first` / `second`  `{ issue, paper }` ของแต่ละรอบ (`paper` เป็น `null` เมื่อขั้นออกเลขล้ม)
 *   · `audits`  แถวที่สองขั้นส่งให้ audit ปลอม · `lines` บรรทัด log ของตัวเตรียมรูปและขั้นกระดาษ (เวลาแต่ละขั้น)
 * 🔴 ยามเขียนถาวรถูกเสียบเป็น `true` ที่นี่ที่เดียว และ **เฉพาะกับ client ปลอม** — ห้ามส่ง client ของจริงเข้ามา
 */
export async function runSurveyPipeline(world, {
  via = 'issue_only', user = PIPELINE_USER, clock = () => new Date(), loadRenderer = null,
} = {}) {
  const { supabase } = world;
  const requestId = world.request().id;
  const audits = [];
  const audit = async (row) => { audits.push(row); };
  const lines = [];
  const log = (line) => { lines.push(line); };
  const imageOptions = { getFileStream: world.drive.getFileStream, log };
  const session = surveyReportPrintSession(loadRenderer ? { loadRenderer } : {});

  const stateOf = async () => {
    const { reports, error } = await loadSurveyReports(supabase, requestId);
    if (error) throw new Error(`อ่านแถวเอกสารของโลกปลอมไม่ได้: ${error.message || error}`);
    return surveyReportState(world.request(), reports, { now: clock(), issueAtSend: true });
  };

  const number = async (path) => {
    if (path === 'send') {
      /* S3 — รอบตรวจรูปก่อนเขียน: อ่านผลวัดกับไฟล์แบบเบา แล้วส่งแผนที่รูปให้ขั้นออกเลข (ไฟล์ที่มีแล้วไม่ถูกดึงซ้ำ) */
      const zones = await loadSurveyZones(supabase, requestId);
      const lists = await Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
      const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, lists[i] || []]));
      const prepared = await prepareSurveyReportImages(supabase, surveyReportImageFiles({ zones, filesByZone }), {
        ...imageOptions, deadline: PIPELINE_PREFLIGHT_MS, storeAllowed: true,
      });
      return issueSurveyReport(supabase, {
        request: world.request(), user, closedVisit: null, via: 'send', prepared,
        storeAllowed: true, audit, now: clock, imageOptions,
      });
    }
    return issueSurveyReport(supabase, {
      requestId, user, via: 'issue_only', storeAllowed: true, audit, now: clock, imageOptions,
      // งบของตัววัด = งบของทั้งคำขอ (แบบเดียวกับ route เอกสาร) ไม่ใช่งบเติมรูปที่ขั้นออกเลขส่งต่อมา
      measure: ({ customerHtml, internalHtml }) => measureSurveyReportPaper(supabase, {
        customerHtml, internalHtml, deadline: PIPELINE_BUDGET_MS, session, log,
      }),
    });
  };

  const paper = (reportId) => ensureSurveyReportPaper(supabase, {
    reportId, want: 'both', deadline: PIPELINE_BUDGET_MS, user, session,
    storeAllowed: true, audit, now: () => clock().getTime(), log,
  });

  const round = async (path, states) => {
    const issue = await number(path);
    states?.push(await stateOf());
    if (issue.state !== 'issued') return { issue: plainIssue(issue), paper: null, reportId: null };
    const done = await paper(issue.reportId);
    states?.push(await stateOf());
    return { issue: plainIssue(issue), paper: done, reportId: issue.reportId };
  };

  try {
    const states = [await stateOf()];
    const first = await round(via, states);
    /* รอบสอง = กดปุ่ม "ออกเอกสาร" ซ้ำ (เส้นส่งผลกดซ้ำไม่ได้ — ใบตอบแล้ว): ต้องไม่ออกเลขใหม่ ไม่ดึงรูปซ้ำ ไม่พิมพ์ซ้ำ
       — เดินต่อจากแถวล้วน ๆ (§11) */
    const second = first.reportId ? await round('issue_only', null) : null;
    return {
      via, states, docNo: first.issue.docNo, reportId: first.reportId, audits, lines,
      first: { issue: first.issue, paper: first.paper },
      second: second ? { issue: second.issue, paper: second.paper } : null,
    };
  } finally {
    await session.close();
  }
}

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  }
  return out;
}

/** กระดาษที่ตรึงไว้ของแถว → view + แผนหน้า + HTML ต่อฉบับ (รูปเดียวกับผลของ `renderVersion` ที่ `goldenFailures` อ่าน) */
export function pipelinePapers(world, run) {
  const row = world.reports().find((r) => r.id === run.reportId) || null;
  if (!row) return [];
  return SURVEY_REPORT_VERSIONS.map((version) => {
    const view = surveyReportView(row.snapshot, { version });
    const pdf = world.objects.get(surveyReportPdfPath(row.id, version))?.body || null;
    return {
      version, view, layout: paginateSurveyReport(view), html: String(row[version === 'internal' ? 'internalHtml' : 'customerHtml'] ?? ''),
      pdf, pdfPages: pdf ? pdfPageCount(pdf) : null, pdfFonts: pdf ? pdfFonts(pdf) : { names: [], type3: 0 },
    };
  });
}

/**
 * ข้อที่ไปป์ไลน์ต้องผ่าน (`--assert`) — คืนข้อความของทุกข้อที่ไม่ผ่าน · `[]` = ผ่าน
 * สถานะ `missing → issued → ready` · รอบสอง `reused` เลขเดิม · เลขรันถูกกินครั้งเดียว · ไฟล์ละหนึ่งครั้งจาก Drive ·
 * แถวตรึงแล้ว + ที่อยู่ไฟล์ของแต่ละฉบับเป็นของฉบับนั้น · ถังมีแต่ `img/` กับ PDF สองไฟล์ · HTML ที่ตรึงพก token ·
 * ยามกันรั่วของฉบับลูกค้าผ่าน · จำนวนหน้า PDF = แผนหน้า · ฟอนต์ Sarabun เท่านั้น · audit สองแถวไม่มีภาพนิ่ง/HTML
 */
export function pipelineFailures(world, run) {
  const failures = [];
  const expect = (ok, text) => { if (!ok) failures.push(text); };
  const { first, second } = run;

  expect(run.states.join(' → ') === 'missing → issued → ready', `สถานะต้องเป็น missing → issued → ready — ได้ ${run.states.join(' → ')}`);
  expect(first.issue.state === 'issued' && first.issue.reused === false,
    `รอบแรกต้องออกเลขใหม่ — ได้ ${first.issue.state}${first.issue.code ? ` (${first.issue.code}: ${first.issue.reason})` : ''}`);
  if (first.issue.state !== 'issued') return failures;
  expect(/^SU-\d{4}0001-0$/.test(String(first.issue.docNo)), `เลขแรกของโลกว่างต้องเป็น SU-YYMM0001-0 — ได้ ${first.issue.docNo}`);
  expect(first.paper?.code === null && first.paper?.state === 'ready',
    `ขั้นกระดาษรอบแรกต้องจบที่ ready — ได้ ${first.paper?.state} ${first.paper?.code || ''} ${(first.paper?.reasons || []).join(' | ')}`);
  expect(JSON.stringify(first.paper?.captured) === JSON.stringify([...SURVEY_REPORT_VERSIONS]),
    `รอบแรกต้องเก็บ PDF ทั้งสองฉบับ — ได้ ${JSON.stringify(first.paper?.captured)}`);
  expect(second?.issue.state === 'issued' && second.issue.reused === true && second.issue.docNo === first.issue.docNo,
    `รอบสองต้อง reused เลขเดิม — ได้ ${second?.issue.state} reused=${second?.issue.reused} ${second?.issue.docNo}`);
  expect(second?.paper?.code === null && second.paper.state === 'ready' && second.paper.captured.length === 0,
    `รอบสองต้องไม่พิมพ์ซ้ำ — ได้ ${second?.paper?.state} ${second?.paper?.code || ''} เก็บ ${JSON.stringify(second?.paper?.captured)}`);

  expect(world.rpcCalls.length === 1, `RPC ออกเลขต้องถูกเรียกครั้งเดียว — ${world.rpcCalls.length} ครั้ง`);
  const counter = world.tables.entity_number_counters.find((c) => c.scope === 'SU');
  expect(counter?.lastNo === 1, `เลขรันต้องถูกกินครั้งเดียว — ตัวนับ ${counter?.lastNo}`);
  expect(world.reports().length === 1, `ต้องมีแถวเอกสารแถวเดียว — ${world.reports().length} แถว`);

  const row = world.reports()[0];
  const images = Array.isArray(row?.images) ? row.images : [];
  const fetches = [...world.drive.fetched.values()];
  expect(fetches.length > 0 && fetches.every((n) => n === 1), `ไฟล์ต้นฉบับต้องถูกดึงจาก Drive ไฟล์ละครั้ง — ${JSON.stringify(fetches)}`);
  expect(row?.status === 'current' && !!row.frozenAt && !!row.rendererVersion, 'แถวต้องเป็นฉบับที่ใช้อยู่และตรึงแล้ว');

  const expected = new Set(images.map((img) => surveyReportImagePath(img.sha)));
  for (const version of SURVEY_REPORT_VERSIONS) {
    const path = surveyReportPdfPath(row.id, version);
    expected.add(path);
    expect(row[version === 'internal' ? 'internalPdfPath' : 'customerPdfPath'] === path, `ที่อยู่ PDF ของ${version}ต้องเป็น ${path}`);
    expect(world.objects.get(path)?.contentType === 'application/pdf', `ถังต้องมี ${path} ชนิด application/pdf`);
  }
  expect(images.length > 0 && images.every((img) => world.objects.get(surveyReportImagePath(img.sha))?.contentType === 'image/jpeg'),
    'รูปทุกตัวของภาพนิ่งต้องอยู่ในถังเป็น image/jpeg');
  const stray = [...world.objects.keys()].filter((path) => !expected.has(path));
  expect(stray.length === 0, `ถังมีไฟล์นอกเหนือจากรูปของภาพนิ่งกับ PDF สองฉบับ — ${stray.join(' · ')}`);

  const papers = pipelinePapers(world, run);
  for (const p of papers) {
    expect(p.html.includes(`<div class="rh-ref">${row.docNo}</div>`), `${p.version}: กระดาษที่ตรึงต้องพิมพ์เลขที่ ${row.docNo}`);
    // โลโก้ของหัวกระดาษเป็น SVG ฝังในแม่แบบ (data URI ได้) — รูปของใบต้องเป็น token เท่านั้น
    const shas = surveyReportImageShas(p.html);
    expect(shas.length > 0 && !/data:image\/jpeg/.test(p.html), `${p.version}: กระดาษที่ตรึงต้องพกรูปของใบเป็น token ไม่ใช่ data URI`);
    expect(shas.every((sha) => world.objects.has(surveyReportImagePath(sha))), `${p.version}: มี token ของรูปที่ไม่อยู่ในถัง`);
    expect(p.pdfPages === p.layout.pageCount, `${p.version}: PDF ${p.pdfPages} หน้า แต่แผนหน้า ${p.layout.pageCount} หน้า`);
    const foreign = p.pdfFonts.names.filter((name) => !/^Sarabun-/.test(name));
    expect(!foreign.length && !p.pdfFonts.type3,
      `${p.version}: PDF มีฟอนต์นอกจาก Sarabun — ${[...foreign, p.pdfFonts.type3 ? `Type3 × ${p.pdfFonts.type3}` : null].filter(Boolean).join(' · ')}`);
  }
  const customer = papers.find((p) => p.version === 'customer');
  const leaks = customer ? surveyReportCustomerHtmlIssues({ html: customer.html, snapshot: row.snapshot, layout: customer.layout }) : ['ไม่มีฉบับลูกค้า'];
  expect(leaks.length === 0, `ยามกันรั่วของฉบับลูกค้า — ${leaks.join(' | ')}`);

  expect(run.audits.map((a) => `${a.action}:${a.entityType}`).join(',') === 'create:service_survey_report,update:service_survey_report',
    `audit ต้องมีสองแถว (ออกเลข · เก็บกระดาษ) — ได้ ${run.audits.map((a) => `${a.action}:${a.entityType}`).join(',') || '—'}`);
  const auditKeys = keysDeep(run.audits.map((a) => ({ before: a.before, after: a.after })));
  expect(!['snapshot', 'customerHtml', 'internalHtml'].some((key) => auditKeys.has(key)), 'audit ต้องไม่พกภาพนิ่งหรือ HTML');
  expect(world.writes.every((w) => w.table === 'service_survey_reports'), 'ต้องไม่มีตารางอื่นถูกเขียน');
  return failures;
}

/* ── main ─────────────────────────────────────────────────────────────── */

/** ชุดที่จะเรนเดอร์ — `[{ label, inputs, bySha, mode, dir, golden }]` */
function loadRuns(args, outDir) {
  if (args.stress) {
    const wanted = typeof args.case === 'string' ? args.case : null;
    const cases = surveyStressCases().filter((c) => !wanted || c.name === wanted);
    if (!cases.length) throw new Error(`ไม่มีกรณี "${wanted}" — มี: ${surveyStressCases().map((c) => c.name).join(' · ')}`);
    return cases.map((c, i) => ({
      label: c.name, inputs: stressSurveyInputs(c.spec), bySha: {}, mode: c.mode,
      dir: i === 0 || wanted ? outDir : join(outDir, 'cases', c.name), golden: false,
    }));
  }
  if (args.synthetic) {
    return [{ label: 'synthetic', inputs: surveyReportInputsFromFixture(syntheticSurveyFixture()), bySha: {}, mode: 'freeze', dir: outDir, golden: true }];
  }
  const fixture = JSON.parse(readFileSync(expand(args.fixture), 'utf8'));
  const { photos, bySha } = typeof args.photos === 'string' ? loadPhotos(expand(args.photos)) : { photos: null, bySha: {} };
  const inputs = surveyReportInputsFromFixture(fixture, {
    photos, spotLinks: args['no-spot-links'] ? null : 'order',
  });
  return [{ label: fixture.request?.docNo || 'fixture', inputs, bySha, mode: 'freeze', dir: outDir, golden: true }];
}

async function mainRender(args, outDir) {
  const docNo = typeof args['doc-no'] === 'string' ? args['doc-no'] : 'SU-26090001-0';
  const issuedAt = typeof args.issued === 'string' ? args.issued : null;
  const scale = Number(args.scale) > 0 ? Number(args.scale) : 1;
  const runs = loadRuns(args, outDir);
  // chromium โหลดเฉพาะตอนเรนเดอร์จริง — เทสต์ที่ import ไฟล์นี้ไม่ลาก puppeteer มาด้วย
  const pdfLib = await import('../src/lib/documents/htmlPdf.js');
  const browser = await pdfLib.launchBrowser();
  const failures = [];
  try {
    for (const run of runs) {
      const built = buildSurveyReportSnapshot(run.inputs, { mode: run.mode });
      if (built.errors) {
        console.error(`ตรึงไม่ได้ (${run.label}):`);
        for (const error of built.errors) console.error(`  · ${error}`);
        process.exitCode = 1;
        failures.push(`${run.label}: ตรึงไม่ได้`);
        continue;
      }
      mkdirSync(run.dir, { recursive: true });
      writeFileSync(join(run.dir, 'snapshot.json'), JSON.stringify(built.snapshot, null, 2));

      const results = [];
      for (const version of ['customer', 'internal']) {
        results.push(await renderVersion(browser, pdfLib, { version, snapshot: built.snapshot, bySha: run.bySha, dir: run.dir, docNo, issuedAt, scale }));
      }

      console.log(`\nรายงานการประเมินพื้นที่ · ${run.label}${run.mode === 'draft' ? ' (โหมดร่าง)' : ''} · ${docNo} → ${run.dir}`);
      const fitReport = {};
      const issues = [];
      for (const result of results) {
        const { rows, issues: found } = report(result);
        fitReport[result.version] = { pageCount: result.layout.pageCount, zonePage: result.layout.zonePage, fonts: result.pdfFonts, pages: rows };
        issues.push(...found);
      }
      writeFileSync(join(run.dir, 'fit.json'), JSON.stringify(fitReport, null, 2));

      /* คำเตือนชุดเดียวกับที่เส้นส่งผลกางให้หัวหน้ารับทราบ (`seenWarnings` · §8): คำเครื่อง/จุดในหมายเหตุ + อักขระที่ฟอนต์ฝังไม่มี */
      const warnings = [...(built.warnings || []), ...surveyReportSendWarnings(results[0].view)];
      if (warnings.length) {
        console.log('\nคำเตือน (ไม่บล็อก):');
        for (const warning of warnings) console.log(`  · ${warning}`);
      }
      const found = [...issues, ...(args.assert && run.golden ? goldenFailures(results, docNo) : [])];
      failures.push(...found.map((text) => (runs.length > 1 ? `[${run.label}] ${text}` : text)));
    }
  } finally {
    await browser.close();
  }
  return failures;
}

async function mainPipeline(args, outDir) {
  if (args.stress) throw new Error('--pipeline ใช้กับ --fixture หรือ --synthetic เท่านั้น (ชุดสุดขอบไม่มีไฟล์ต้นฉบับให้ย่อ)');
  const via = args.via === 'send' ? 'send' : 'issue_only';
  const spotLinks = args['no-spot-links'] ? null : 'order';
  let label;
  let source;
  let files;
  if (args.synthetic) {
    label = 'synthetic';
    source = surveyReportInputsFromFixture(syntheticSurveyFixture(), { withImages: false, spotLinks });
    files = syntheticDriveFiles(source);
  } else {
    const fixture = JSON.parse(readFileSync(expand(args.fixture), 'utf8'));
    label = fixture.request?.docNo || 'fixture';
    source = surveyReportInputsFromFixture(fixture, { withImages: false, spotLinks });
    files = typeof args.photos === 'string' ? driveFilesOfFixture(fixture, loadPhotos(expand(args.photos)).files) : syntheticDriveFiles(source);
  }
  // เที่ยงตามเวลาไทยของวันที่ขอ — เดือนในเลขที่กับวันที่ออกบนกระดาษนิ่ง ไม่ขึ้นกับว่ารันกี่โมง
  const fixed = typeof args.issued === 'string' ? new Date(`${args.issued}T12:00:00+07:00`) : null;
  if (fixed && Number.isNaN(fixed.getTime())) throw new Error(`--issued ต้องเป็น YYYY-MM-DD — ได้ ${args.issued}`);
  const clock = fixed ? () => new Date(fixed) : () => new Date();

  const world = surveyPipelineWorld(source, { files, clock });
  const started = performance.now();
  const run = await runSurveyPipeline(world, { via, clock });
  const tookMs = Math.round(performance.now() - started);

  mkdirSync(outDir, { recursive: true });
  const papers = pipelinePapers(world, run);
  const row = world.reports().find((r) => r.id === run.reportId) || null;
  if (row) writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(row.snapshot, null, 2));
  for (const p of papers) {
    if (p.pdf) writeFileSync(join(outDir, `${p.version}.pdf`), p.pdf);
    // กระดาษที่ตรึงพก token — ไฟล์ที่เปิดดูได้คือตัวที่แปลง token เป็น data URI จากรูปในถัง (แบบเดียวกับที่ route เสิร์ฟ HTML)
    if (p.html) {
      writeFileSync(join(outDir, `${p.version}.html`), resolveImageTokens(p.html, (sha) => {
        const hit = world.objects.get(surveyReportImagePath(sha));
        return hit ? `data:image/jpeg;base64,${hit.body.toString('base64')}` : null;
      }));
    }
  }
  const sum = (step, key = 'ms') => run.lines.filter((l) => (step === 'image' ? 'attId' in l : l.step === step))
    .reduce((n, l) => n + (Number(l[key]) || 0), 0);
  const timing = {
    totalMs: tookMs,
    imageFetchMs: sum('image', 'fetchMs'), imageResizeMs: sum('image', 'resizeMs'), imageUploadMs: sum('image', 'uploadMs'),
    printMs: sum('print'), storeMs: sum('store'),
  };
  writeFileSync(join(outDir, 'pipeline.json'), JSON.stringify({
    label, via, docNo: run.docNo, states: run.states, first: run.first, second: run.second,
    pages: Object.fromEntries(papers.map((p) => [p.version, { planned: p.layout.pageCount, pdf: p.pdfPages, bytes: p.pdf?.length || 0, fonts: p.pdfFonts }])),
    images: (row?.images || []).map((img) => ({ sha: img.sha, w: img.w, h: img.h, bytes: img.bytes })),
    driveFetches: Object.fromEntries(world.drive.fetched),
    bucket: [...world.objects.keys()].sort(),
    audits: run.audits.map((a) => ({ action: a.action, entityType: a.entityType, summary: a.summary, after: a.after })),
    timing,
  }, null, 2));

  console.log(`\nไปป์ไลน์เอกสารประเมิน · ${label} · ทาง ${via} → ${outDir}`);
  console.log(`  สถานะ: ${run.states.join(' → ')}`);
  const say = (name, r) => {
    if (!r) { console.log(`  ${name}: (ไม่ได้เดิน — รอบแรกไม่ได้เลข)`); return; }
    const issue = r.issue.state === 'issued'
      ? `${r.issue.docNo} ${r.issue.reused ? 'reused (ใช้เลขเดิม)' : 'ออกเลขใหม่'}`
      : `ออกเลขไม่สำเร็จ — ${r.issue.code}: ${r.issue.reason}`;
    const paper = !r.paper ? '' : ` · กระดาษ ${r.paper.state}${r.paper.code ? ` (${r.paper.code}: ${r.paper.reasons.join(' | ')})` : ''}`
      + ` · เก็บ PDF รอบนี้ ${r.paper.captured.length ? r.paper.captured.join(' + ') : 'ไม่มี (มีอยู่แล้ว)'}`;
    console.log(`  ${name}: ${issue}${paper}`);
  };
  say('รอบ 1', run.first);
  say('รอบ 2', run.second);
  for (const p of papers) {
    console.log(`  ${p.version}: แผน ${p.layout.pageCount} หน้า · PDF ${p.pdfPages ?? '?'} หน้า ${mb(p.pdf?.length)} · ฟอนต์ ${p.pdfFonts.names.join(' ') || '—'}`);
  }
  console.log(`  รูป: ${world.drive.fetched.size} ไฟล์จาก Drive → ${(row?.images || []).length} รูปในถัง · RPC ${world.rpcCalls.length} ครั้ง`);
  console.log(`  เวลา: รวม ${timing.totalMs} ms · ดึงรูป ${timing.imageFetchMs} · ย่อ ${timing.imageResizeMs} · อัปรูป ${timing.imageUploadMs} · พิมพ์+วัด ${timing.printMs} · เก็บ PDF ${timing.storeMs}`);
  if (run.first.issue.warnings.length) {
    console.log('\nคำเตือน (ไม่บล็อก):');
    for (const warning of run.first.issue.warnings) console.log(`  · ${warning}`);
  }

  const failures = pipelineFailures(world, run);
  if (args.assert && papers.length === 2 && papers.every((p) => p.html)) failures.push(...goldenFailures(papers, run.docNo));
  return failures;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out || (!args.fixture && !args.synthetic && !args.stress)) {
    console.error(USAGE);
    process.exit(2);
  }
  const outDir = expand(args.out);
  const failures = await (args.pipeline ? mainPipeline(args, outDir) : mainRender(args, outDir));
  if (failures.length) {
    console.log(`\n${args.assert ? '❌' : '⚠️'} ${failures.length} ข้อ:`);
    for (const failure of failures) console.log(`  · ${failure}`);
    if (args.assert) process.exit(1);
  } else {
    console.log(`\n✅ ${args.assert ? 'ผ่านทุกข้อ' : 'ไม่มีหน้าไหนล้น'}`);
  }
}
