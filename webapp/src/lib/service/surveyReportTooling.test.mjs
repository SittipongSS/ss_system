// ── เครื่องมือของรายงานการประเมินพื้นที่ (PR-2 §14 · §15 Gates · §16 ข้อ 2–3) ───────────────────────────
//
// สามสคริปต์ใน `webapp/scripts/` ที่ไม่มีเทสต์ของตัวเอง (โฟลเดอร์นั้นอยู่นอก `npm test`) — ยามอยู่ที่นี่:
//   ① `check-doc-tracing.mjs`           ด่านหลัง build: route เอกสารพก chromium + sharp · route เบาไม่ลากของหนัก
//   ② `check-survey-report-inputs.mjs`  ตรวจของจริงแบบอ่านอย่างเดียว — เทสต์ล็อกว่า **เขียนอะไรไม่ได้เลย**
//   ③ `render-survey-report.mjs --pipeline`  เดินขั้นออกเลข + ขั้นกระดาษของจริงบนฐาน/ถัง/Drive ในหน่วยความจำ
//      (ที่นี่ใช้ตัวพิมพ์ปลอม + sharp จริง · รอบที่ใช้ Chrome จริงคือการรัน harness เอง — docs/survey-report-doc.md)
//
// 🔴 ทุกอย่างในไฟล์นี้เป็นของปลอมในหน่วยความจำ — ไม่มี client ของจริง ไม่มี RPC ไม่มี Drive (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  CHROMIUM_BR_FALLBACK, DOC_TRACING_RULES, checkDocTracing, docTracingIssues, nftPathOf, tracingKey,
} from '../../../scripts/check-doc-tracing.mjs';
import {
  OPEN_SURVEY_LIMIT, R0_DEFAULT_REFS, R0_REPORT_LIMIT, checkSurveyReportInputs, findSurveyRequest, loadAnsweredSurveyRequests,
  loadOpenSurveyRequests, main as checkMain, r0Lines, readOnlyClient, releaseCheckR0, reportLines, signerBarred, signerStuck, summaryLines,
} from '../../../scripts/check-survey-report-inputs.mjs';
import {
  PIPELINE_USER, SIGN_BOX_HEIGHT, SURVEY_GOLDEN, drawingMethodOf, goldenFailures, harnessSignatures, parseArgs, pipelineFailures,
  pipelinePapers, pipelineSignCase, runSurveyPipeline, signFailures, surveyPipelineWorld, syntheticDriveFiles, syntheticOf,
} from '../../../scripts/render-survey-report.mjs';
import { SURVEY_REPORT_CSS, renderSurveyReportHTML } from './surveyReportDocument.js';
import { SURVEY_REPORT_STANDARD_KEY } from './surveyReportInputs.js';
import { paginateSurveyReport } from './surveyReportLayout.js';
import { buildSurveyReportSnapshot, surveyReportFreezeIssues } from './surveyReportSnapshot.js';
import { surveyReportSignatureHtmlIssues } from './surveyReportState.js';
import {
  DRAWING_HEAD, drawingSurveyFixture, mixedSurveyFixture, stressSurveyInputs, surveyReportInputsFromFixture, surveySignCases,
  surveyStressCases, syntheticSurveyFixture,
} from './surveyReportTestKit.mjs';
import { surveyReportView } from './surveyReportView.js';

const WEBAPP = process.cwd();
const raw = (p) => readFileSync(join(WEBAPP, p), 'utf8');
/* ตัดคอมเมนต์ก่อนตรวจซอร์ส — หัวไฟล์ของสคริปต์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ══ ① ด่าน trace หลัง build ═══════════════════════════════════════════ */

const UP = '../../../../../../../../';
const nm = (path) => `${UP}node_modules/${path}`;
const BASE_FILES = [nm('next/dist/server/app-render/app-render.js'), '../../../../../../chunks/[root-of-the-server]__abc._.js'];
const CHROMIUM = [...CHROMIUM_BR_FALLBACK.map((name) => nm(`@sparticuz/chromium/bin/${name}`)), nm('@sparticuz/chromium/package.json')];
const PUPPETEER = [nm('puppeteer-core/package.json'), nm('puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js')];
const SHARP = [
  nm('sharp/lib/index.js'), nm('sharp/package.json'),
  nm('@img/sharp-linux-x64/lib/sharp-linux-x64.node'), nm('@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.3'),
];
const ruleOf = (route) => DOC_TRACING_RULES.find((rule) => rule.route === route);
const DOCUMENT = ruleOf('api/service/surveys/[id]/document');
const SEND = ruleOf('api/service/surveys/[id]/send');

test('ด่าน trace: ห้า route ตามสเปก §15 + เส้นสลับวิธีประเมิน (งวด S2a) — และทุก route มีไฟล์จริงในแอป (เปลี่ยนชื่อ route แล้วด่านต้องไม่ว่างเปล่า)', () => {
  assert.deepEqual(DOC_TRACING_RULES.map((rule) => rule.route), [
    'api/service/surveys/[id]/document', 'api/service/surveys/[id]/send', 'api/service/surveys/[id]',
    'api/service/surveys/[id]/recall', 'api/service/surveys/[id]/method', 'api/sa/requests/[id]',
  ]);
  for (const rule of DOC_TRACING_RULES) assert.ok(existsSync(join(WEBAPP, 'src/app', rule.route, 'route.js')), rule.route);
  assert.deepEqual(DOCUMENT.need, ['chromiumBin', 'puppeteer', 'sharpBinary']);
  assert.deepEqual(DOCUMENT.forbid, []);
  assert.deepEqual(SEND.need, ['sharpBinary']);
  assert.deepEqual(SEND.forbid, ['puppeteer', 'chromium']);
  for (const rule of DOC_TRACING_RULES.slice(2)) {
    assert.deepEqual(rule.need, [], rule.route);
    assert.deepEqual([...rule.forbid].sort(), ['chromium', 'puppeteer', 'sharp'], rule.route);
  }
});

test('ด่าน trace: trace ที่ถูกต้องของทุก route ผ่าน — รวมไบนารี sharp ของเครื่องนักพัฒนา (darwin-arm64)', () => {
  assert.deepEqual(docTracingIssues(DOCUMENT, [...BASE_FILES, ...CHROMIUM, ...PUPPETEER, ...SHARP]), []);
  assert.deepEqual(docTracingIssues(SEND, [...BASE_FILES, ...SHARP]), []);
  for (const rule of DOC_TRACING_RULES.slice(2)) assert.deepEqual(docTracingIssues(rule, BASE_FILES), [], rule.route);
  const mac = [nm('@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node'), nm('@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.8.17.3.dylib')];
  assert.deepEqual(docTracingIssues(SEND, [...BASE_FILES, ...mac]), []);
});

test('🔴 ด่าน trace: route เอกสารขาด `.br` สักไฟล์ · ขาด puppeteer-core · ขาดไบนารี sharp = ล้ม พร้อมบรรทัดที่ต้องเพิ่มใน next.config', () => {
  const full = [...BASE_FILES, ...CHROMIUM, ...PUPPETEER, ...SHARP];
  const noFonts = docTracingIssues(DOCUMENT, full.filter((f) => !f.endsWith('fonts.tar.br')));
  assert.equal(noFonts.length, 1);
  assert.match(noFonts[0], /fonts\.tar\.br/);
  assert.match(noFonts[0], /1\/4 ไฟล์/);
  assert.ok(noFonts[0].includes("'/api/service/surveys/\\\\[id\\\\]/document': ['node_modules/@sparticuz/chromium/bin/**/*']"), noFonts[0]);

  const noBin = docTracingIssues(DOCUMENT, [...BASE_FILES, ...PUPPETEER, ...SHARP]);
  assert.match(noBin[0], /4\/4 ไฟล์/);
  assert.match(docTracingIssues(DOCUMENT, [...BASE_FILES, ...CHROMIUM, ...SHARP])[0], /puppeteer-core/);

  // มีแต่ตัวแพ็คเกจ JS ของ sharp ไม่มี addon/libvips = โหลดไม่ขึ้นบน Lambda
  const jsOnly = docTracingIssues(DOCUMENT, [...BASE_FILES, ...CHROMIUM, ...PUPPETEER, nm('sharp/lib/index.js')]);
  assert.equal(jsOnly.length, 1);
  assert.match(jsOnly[0], /addon/);
  assert.match(jsOnly[0], /libvips/);
  assert.ok(jsOnly[0].includes("'node_modules/sharp/**/*', 'node_modules/@img/**/*'"));
  // มี addon แต่ไม่มี libvips ก็ยังล้ม (libvips เป็นคนละแพ็คเกจ)
  const addonOnly = docTracingIssues(SEND, [...BASE_FILES, nm('@img/sharp-linux-x64/lib/sharp-linux-x64.node')]);
  assert.equal(addonOnly.length, 1);
  assert.doesNotMatch(addonOnly[0], /addon/);
  assert.match(addonOnly[0], /libvips/);
  // ชุดไฟล์ `.br` ที่ส่งมาเอง (chromium รุ่นใหม่เปลี่ยนชุดไฟล์) ถูกใช้แทนค่าสำรอง
  assert.match(docTracingIssues(DOCUMENT, full, { chromiumBr: [...CHROMIUM_BR_FALLBACK, 'new.tar.br'] })[0], /new\.tar\.br/);
});

test('🔴 ด่าน trace: route ส่งผลห้ามลาก puppeteer-core / chromium (มติ 3) · ต้องมี sharp', () => {
  const withPdf = docTracingIssues(SEND, [...BASE_FILES, ...SHARP, ...PUPPETEER, ...CHROMIUM]);
  assert.equal(withPdf.length, 2);
  assert.match(withPdf[0], /puppeteer-core/);
  assert.match(withPdf[1], /@sparticuz\/chromium/);
  assert.match(docTracingIssues(SEND, BASE_FILES)[0], /ขาดไบนารีของ sharp/);
});

test('🔴 ด่าน trace: GET ใบประเมิน · ดึงผลกลับ · สลับวิธีประเมิน · GET/PATCH คำร้อง ห้ามมี sharp / puppeteer-core / chromium แม้ไฟล์เดียว', () => {
  for (const rule of DOC_TRACING_RULES.slice(2)) {
    assert.match(docTracingIssues(rule, [...BASE_FILES, nm('sharp/lib/index.js')])[0], /ลาก sharp/, rule.route);
    assert.match(docTracingIssues(rule, [...BASE_FILES, nm('@img/sharp-linux-x64/package.json')])[0], /ลาก sharp/, rule.route);
    assert.match(docTracingIssues(rule, [...BASE_FILES, PUPPETEER[0]])[0], /ลาก puppeteer-core/, rule.route);
    assert.match(docTracingIssues(rule, [...BASE_FILES, CHROMIUM[0]])[0], /ลาก @sparticuz\/chromium/, rule.route);
    assert.equal(docTracingIssues(rule, [...BASE_FILES, ...SHARP, ...PUPPETEER, ...CHROMIUM]).length, 3, rule.route);
  }
  // แพ็คเกจที่ชื่อขึ้นต้นคล้ายกันไม่ถูกนับ
  assert.deepEqual(docTracingIssues(DOC_TRACING_RULES[2], [...BASE_FILES, nm('sharpen/index.js'), nm('puppeteer-core-utils/a.js'), nm('@img/colour/index.cjs')]), []);
  // รายการว่าง/ไม่ใช่ลิสต์ = route เบาผ่าน แต่ route ที่ต้องมีของล้มครบทุกข้อ
  assert.equal(docTracingIssues(DOCUMENT, null).length, 3);
});

test('ด่าน trace: อ่านไฟล์ `route.js.nft.json` ของ build จริง — ครบ = ผ่าน · ไฟล์หาย/อ่านไม่ได้ = ล้ม (ยังไม่ build หรือ route เปลี่ยนชื่อ)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'doc-tracing-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const put = (route, files) => {
    const file = nftPathOf(dir, route);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof files === 'string' ? files : JSON.stringify({ version: 1, files }));
  };
  put(DOCUMENT.route, [...BASE_FILES, ...CHROMIUM, ...PUPPETEER, ...SHARP]);
  put(SEND.route, [...BASE_FILES, ...SHARP]);
  for (const rule of DOC_TRACING_RULES.slice(2)) put(rule.route, BASE_FILES);
  // `root` ชี้ที่ที่ไม่มี node_modules ⇒ ใช้รายชื่อ `.br` สำรอง
  const good = checkDocTracing({ root: dir, buildDir: dir });
  assert.equal(good.ok, true, JSON.stringify(good.results.map((r) => r.issues)));
  assert.deepEqual(good.results.map((r) => r.count > 0), [true, true, true, true, true, true]);

  put('api/service/surveys/[id]/recall', [...BASE_FILES, ...SHARP]);
  put('api/sa/requests/[id]', '{ not json');
  rmSync(nftPathOf(dir, SEND.route));
  const bad = checkDocTracing({ root: dir, buildDir: dir });
  assert.equal(bad.ok, false);
  const issuesOf = (route) => bad.results.find((r) => r.route === route).issues;
  assert.match(issuesOf(SEND.route)[0], /ไม่พบ .*send\/route\.js\.nft\.json/);
  assert.match(issuesOf('api/service/surveys/[id]/recall')[0], /ลาก sharp/);
  assert.match(issuesOf('api/sa/requests/[id]')[0], /อ่าน .* ไม่ได้/);
  assert.deepEqual(issuesOf(DOCUMENT.route), []);
});

test('ด่าน trace: คีย์ที่ด่านบอกให้เพิ่ม ตรงตัวกับคีย์ใน next.config.mjs · CI รันด่านนี้หลังขั้น Build', () => {
  const config = raw('next.config.mjs');
  assert.equal(tracingKey('api/service/surveys/[id]/document'), '/api/service/surveys/\\\\[id\\\\]/document');
  assert.ok(config.includes(`'${tracingKey('api/service/surveys/[id]/document')}': [`), 'route เอกสารต้องอยู่ใน outputFileTracingIncludes');
  // รายชื่อ `.br` สำรองตรงกับของที่ติดตั้งอยู่ (อัป chromium แล้วชุดไฟล์เปลี่ยน = แก้ค่าสำรองตาม)
  const bin = join(WEBAPP, 'node_modules/@sparticuz/chromium/bin');
  if (existsSync(bin)) for (const name of CHROMIUM_BR_FALLBACK) assert.ok(existsSync(join(bin, name)), name);

  const ci = readFileSync(join(WEBAPP, '..', '.github', 'workflows', 'ci.yml'), 'utf8');
  const build = ci.indexOf('run: npm run build');
  const check = ci.indexOf('run: node scripts/check-doc-tracing.mjs');
  assert.ok(build !== -1 && check > build, 'ต้องรัน check-doc-tracing.mjs ต่อจากขั้น Build (ด่านอ่านผลของ build)');
});

/* ══ ชุดทดสอบร่วมของ ② และ ③ ═══════════════════════════════════════════ */

const NOW = new Date('2026-10-01T04:00:00.000Z'); // 1 ต.ค. 2026 11:00 เวลาไทย ⇒ เดือนที่ออก `2610`
const clock = () => new Date(NOW);
const twin = (opts) => surveyReportInputsFromFixture(syntheticSurveyFixture(), { withImages: false, ...opts });

function worldOf(opts) {
  const source = twin(opts);
  return surveyPipelineWorld(source, { files: syntheticDriveFiles(source), clock });
}

/* ใบเดียวกันก่อนส่งผล: ยังไม่มีคำตอบ · นัดยังเปิด (กำลังทำ) — การส่งผลจะปิดนัดให้ */
function unsentWorld({ visitStatus = 'in_progress' } = {}) {
  const world = worldOf();
  Object.assign(world.request(), { answeredAt: null, answeredById: null, answeredByName: null, status: 'in_progress' });
  world.tables.service_visits[0].status = visitStatus;
  return world;
}

const untouched = (world) => {
  assert.equal(world.rpcCalls.length, 0, 'ห้ามเรียก RPC');
  assert.equal(world.writes.length, 0, 'ห้ามเขียนตาราง');
  assert.equal(world.objects.size, 0, 'ห้ามแตะที่เก็บไฟล์');
  assert.equal(world.drive.fetched.size, 0, 'ห้ามดึง Drive');
};

/* ══ ② ตรวจของจริงแบบอ่านอย่างเดียว ════════════════════════════════════ */

test('🔴 readOnlyClient: เหลือแค่ `.select()` กับ `getUserById` — ทางเขียนทุกทาง · rpc · storage โยนทันที', async () => {
  const world = worldOf();
  const client = readOnlyClient(world.supabase);
  for (const op of ['insert', 'update', 'upsert', 'delete']) {
    assert.throws(() => client.from('dept_requests')[op]({ answeredAt: null }), /อ่านอย่างเดียว/, op);
  }
  assert.throws(() => client.rpc('issue_survey_report', {}), /อ่านอย่างเดียว — ห้าม rpc issue_survey_report/);
  assert.throws(() => client.storage, /อ่านอย่างเดียว — ห้าม ที่เก็บไฟล์/);
  assert.deepEqual(Object.keys(client.auth.admin), ['getUserById']);
  assert.deepEqual(Object.keys(client.from('dept_requests')).sort(), ['delete', 'insert', 'select', 'update', 'upsert']);

  const { data, error } = await client.from('dept_requests').select('id, "docNo"').eq('id', world.request().id).maybeSingle();
  assert.equal(error, null);
  assert.equal(data.docNo, 'RQ-AS-26090186');
  const user = await client.auth.admin.getUserById('U-lead');
  assert.equal(user.data.user.user_metadata.name, 'Lead Assessor');
  untouched(world);
});

test('ตรวจอินพุต: ใบที่ส่งผลแล้ว (ปุ่ม "ออกเอกสาร") — ด่านผ่าน · 4/6 หน้า · คำเตือนสองข้อ · รูปแปดไฟล์ · ไม่มีอะไรถูกเขียน', async () => {
  const world = worldOf();
  const report = await checkSurveyReportInputs(readOnlyClient(world.supabase), { request: world.request(), now: NOW });
  assert.equal(report.error, null);
  assert.equal(report.mode, 'issue');
  assert.deepEqual(report.unknown, []);
  assert.deepEqual(report.gates.map((g) => [g.name, g.error]), [['ด่านส่งผลหกข้อ', null], ['ขนาดแพ็คเกจ', null], ['รูปจุด', null]]);
  assert.deepEqual(report.issues, { content: [], system: [] });
  assert.deepEqual(report.overflow, { customer: { pages: 4, errors: [] }, internal: { pages: 6, errors: [] } });
  assert.equal(report.warnings.length, 2);
  assert.match(report.warnings[0], /หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง"/);
  assert.equal(report.images.length, 8);
  assert.deepEqual(report.images.map((i) => i.kind).sort(), ['plan', 'plan', 'spot', 'spot', 'spot', 'wide', 'wide', 'wide']);
  assert.ok(report.images.every((i) => i.onDrive && i.mimeType === 'image/jpeg' && i.fileName));
  assert.deepEqual(report.verdict, { refusedByGates: false, refusedByDocument: null, newlyRefused: false, skipped: false });
  untouched(world);

  const text = reportLines(report).join('\n');
  assert.match(text, /RQ-AS-26090186 · ส่งผลแล้ว/);
  assert.match(text, /ฉบับลูกค้า: 4 หน้า/);
  assert.match(text, /ฉบับภายใน: 6 หน้า/);
  assert.match(text, /รูปที่กระดาษพิมพ์: 8 ไฟล์/);
  assert.match(text, /✅ ปุ่ม "ออกเอกสาร" ผ่านด่านของข้อมูล/);
});

test('ตรวจอินพุต: ใบที่ยังไม่ส่งผล + นัดยังเปิด — รับรองนัดที่การส่งผลจะปิด · ส่งได้ · ไม่ถูกตีกลับเพิ่ม', async () => {
  const world = unsentWorld();
  const report = await checkSurveyReportInputs(readOnlyClient(world.supabase), { request: world.request(), now: NOW });
  assert.equal(report.error, null);
  assert.equal(report.mode, 'send');
  assert.deepEqual(report.visit, { action: 'close', code: 'SV-26090013', error: null });
  assert.deepEqual(report.issues, { content: [], system: [] });
  assert.equal(report.overflow.customer.pages, 4);
  assert.deepEqual(report.verdict, { refusedByGates: false, refusedByDocument: null, newlyRefused: false, skipped: false });
  assert.match(reportLines(report).join('\n'), /✅ ส่งผลได้ \(หัวหน้าต้องรับทราบคำเตือน 2 ข้อ\)/);
  untouched(world);
});

test('🔴 ตรวจอินพุต: ผังเป็น PDF — ด่านเดิมผ่าน (นับไฟล์ตามหมวด) แต่เปิดสวิตช์แล้ว **ถูกตีกลับ** ด้วยประโยค 409 ของ route', async () => {
  const world = unsentWorld();
  for (const file of world.tables.attachments) {
    if (file.docType === 'survey_plan' && file.entityId === 'SVZ-syn-1') Object.assign(file, { mimeType: 'application/pdf', fileName: 'plan.pdf' });
  }
  const report = await checkSurveyReportInputs(readOnlyClient(world.supabase), { request: world.request(), now: NOW });
  assert.equal(report.error, null);
  assert.ok(report.gates.every((g) => g.error === null), JSON.stringify(report.gates));
  assert.equal(report.issues.content.length, 1);
  assert.match(report.issues.content[0], /ยังไม่มีภาพผังที่ลงเอกสารได้/);
  assert.equal(report.verdict.newlyRefused, true);
  assert.match(report.verdict.refusedByDocument, /^ออกเอกสารไม่ได้ — .* · ยังไม่ได้ส่งผล$/);
  assert.match(reportLines(report).join('\n'), /🔴 เปิดสวิตช์แล้วใบนี้จะถูกตีกลับ/);
  untouched(world);
});

test('ตรวจอินพุต: ปัญหาของระบบไม่ตีกลับ — ไม่มีมาตรฐานเอกสาร = ชนิด system · อ่านไซต์ไม่ได้ = ข้ามการตีกลับ', async (t) => {
  quiet(t); // ตัวโหลดลง log ชิ้นที่อ่านไม่สำเร็จ (ตั้งใจให้ล้มในเทสต์นี้)
  const noForm = unsentWorld();
  noForm.tables.document_standard_versions.length = 0;
  const a = await checkSurveyReportInputs(readOnlyClient(noForm.supabase), { request: noForm.request(), now: NOW });
  assert.equal(a.issues.content.length, 0);
  assert.equal(a.issues.system.length, 1);
  assert.equal(a.verdict.newlyRefused, false);
  assert.equal(a.verdict.refusedByDocument, null);
  assert.match(reportLines(a).join('\n'), /เอกสารจะยังไม่ออกจนกว่าเหตุชนิด system จะหาย/);

  const noSite = unsentWorld();
  delete noSite.tables.service_sites; // ตารางหาย = error ของการอ่าน (ไม่ใช่ "ไม่มีไซต์")
  const b = await checkSurveyReportInputs(readOnlyClient(noSite.supabase), { request: noSite.request(), now: NOW });
  assert.deepEqual(b.unknown, ['site']);
  assert.deepEqual(b.verdict, { refusedByGates: false, refusedByDocument: null, newlyRefused: false, skipped: true });
  assert.match(reportLines(b).join('\n'), /ชิ้นที่อ่านไม่สำเร็จ: site/);

  // ส่งผลแล้ว: ปุ่ม "ออกเอกสาร" ตีกลับทุกชนิด รวม system
  const issued = worldOf();
  issued.tables.document_standard_versions.length = 0;
  const c = await checkSurveyReportInputs(readOnlyClient(issued.supabase), { request: issued.request(), now: NOW });
  assert.equal(c.mode, 'issue');
  assert.match(c.verdict.refusedByDocument, /^ออกเอกสารไม่ได้ — /);
});

test('ตรวจอินพุต: นัดยังเป็นร่าง = ประโยคของ `surveySendVisitStep` (ตีกลับอยู่แล้ววันนี้ — ไม่นับเป็นตีกลับเพิ่ม) · ใบที่ไม่ใช่ประเมิน = error', async () => {
  const world = unsentWorld({ visitStatus: 'draft' });
  const report = await checkSurveyReportInputs(readOnlyClient(world.supabase), { request: world.request(), now: NOW });
  assert.equal(report.visit.action, 'block');
  assert.match(report.verdict.refusedByDocument, /ยังเป็นร่าง/);
  assert.equal(report.verdict.newlyRefused, false);
  assert.ok(!report.issues.content.includes('ไม่พบนัดประเมินพื้นที่ของใบนี้'));

  const other = await checkSurveyReportInputs(readOnlyClient(world.supabase), { request: { id: 'X', kind: 'costing' } });
  assert.equal(other.error, 'ไม่ใช่ใบคำร้องประเมินพื้นที่');
  untouched(world);
});

test('ตรวจอินพุต: `main` — หาใบด้วยเลขที่หรือ id · `--open` + สรุปยอด · `--json` · ใช้ผิด = 2 · หาไม่เจอ = 1 · ทุกทางอ่านอย่างเดียว', async () => {
  const world = unsentWorld();
  const run = async (argv) => {
    const lines = [];
    const exit = await checkMain({ argv, supabase: world.supabase, log: (line) => lines.push(line), now: NOW });
    return { exit, text: lines.join('\n') };
  };
  assert.equal((await run([])).exit, 2);
  assert.equal((await run(['RQ-AS-00000000'])).exit, 1);

  const byDocNo = await run(['RQ-AS-26090186']);
  assert.equal(byDocNo.exit, 0);
  assert.match(byDocNo.text, /── RQ-AS-26090186 · ยังไม่ส่งผล ──/);
  assert.doesNotMatch(byDocNo.text, /══ สรุป/);
  assert.equal((await run(['DR-synthetic-0001'])).exit, 0);

  const open = await run(['--open']);
  assert.equal(open.exit, 0);
  assert.match(open.text, /══ สรุป 1 ใบ ══/);
  assert.match(open.text, /วันนี้ส่งได้: 1/);
  assert.match(open.text, /จะถูกตีกลับเพิ่มเมื่อเปิดสวิตช์ \(S5\): 0/);
  assert.match(open.text, /มีคำเตือนให้รับทราบ: 1/);

  const json = JSON.parse((await run(['RQ-AS-26090186', '--open', '--json'])).text);
  assert.equal(json.reports.length, 1, 'ใบที่ระบุชื่อกับใบของ --open เป็นใบเดียวกัน ต้องไม่ตรวจซ้ำ');
  assert.equal(json.reports[0].request.docNo, 'RQ-AS-26090186');

  // ตัวหาใบ: มีเพดานเสมอ · ใบที่ตอบแล้ว/ยกเลิกไม่อยู่ในชุด --open
  const client = readOnlyClient(world.supabase);
  assert.equal((await loadOpenSurveyRequests(client)).requests.length, 1);
  assert.equal((await loadOpenSurveyRequests(client, { limit: 1 })).capped, true);
  world.request().cancelledAt = '2026-09-30T00:00:00.000+00:00';
  assert.equal((await loadOpenSurveyRequests(client)).requests.length, 0);
  assert.equal((await findSurveyRequest(client, '')).error, 'ไม่ได้ระบุใบ');
  assert.equal(OPEN_SURVEY_LIMIT, 200);
  assert.match(summaryLines([], { capped: true }).join('\n'), /ถึงเพดาน 200 ใบ/);
  untouched(world);
});

/* เดิน static import ทั้งกราฟของไฟล์ — คืน `{ files, packages }` (dynamic `import()` ไม่นับ: ของหนักเข้าทางนั้นโดยตั้งใจ) */
function importGraph(entry) {
  const files = new Set();
  const packages = new Set();
  const stack = [join(WEBAPP, entry)];
  while (stack.length) {
    const file = stack.pop();
    if (files.has(file)) continue;
    files.add(file);
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[1] || m[2];
      if (spec.startsWith('@/')) stack.push(resolveFile(join(WEBAPP, 'src', spec.slice(2))));
      else if (spec.startsWith('.')) stack.push(resolveFile(join(dirname(file), spec)));
      else packages.add(spec);
    }
  }
  return { files: [...files].map((f) => f.slice(WEBAPP.length + 1)), packages };
}
function resolveFile(base) {
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try { readFileSync(candidate); return candidate; } catch { /* โฟลเดอร์ — ลองตัวถัดไป */ }
    }
  }
  throw new Error(`หาไฟล์ของ import ไม่เจอ: ${base}`);
}

test('🔴 ซอร์สของสคริปต์ตรวจ: ไม่มีคำสั่งเขียน/rpc/storage · กราฟ import ไม่ถึงขั้นออกเลข ขั้นรูป ขั้นกระดาษ Drive sharp chromium', () => {
  const src = code('scripts/check-survey-report-inputs.mjs');
  for (const call of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', '.storage', '.upload(', '.download(']) {
    assert.ok(!src.includes(call), `สคริปต์ตรวจต้องไม่มี ${call}`);
  }
  assert.match(src, /const client = readOnlyClient\(supabase\);/, 'ทุกคำสั่งของ main ต้องผ่านตัวห่ออ่านอย่างเดียว');
  // หลังห่อแล้ว `supabase` ดิบต้องไม่ถูกส่งต่อไปที่ไหนอีก
  const mainBody = src.slice(src.indexOf('export async function main('), src.indexOf('const isMain'));
  assert.equal(mainBody.split('supabase').length - 1, 2, 'main อ้าง `supabase` ได้แค่ตอนรับพารามิเตอร์กับตอนห่อ');
  // ทุก query ที่คืนหลายแถวมีเพดาน — หาใบเดียว · ใบที่ยังไม่ส่งผล (`--open`) · ใบที่ส่งผลแล้ว (`--answered`)
  //   + งวด S3 (`--r0`): แถวเอกสารทั้งตาราง · นัดของใบที่ขอดู — ทุก `.from(` ของสคริปต์มี `.limit(` ก่อนจบคำสั่ง
  assert.equal((src.match(/\.from\('dept_requests'\)/g) || []).length, 3);
  assert.equal((src.match(/\.from\('service_survey_reports'\)/g) || []).length, 1);
  assert.equal((src.match(/\.from\('service_visits'\)/g) || []).length, 1);
  assert.equal((src.match(/\.from\('/g) || []).length, 5, 'คำสั่งอ่านที่ระบุตาราง (ไม่นับ `client.from(table)` ของตัวห่อ)');
  assert.equal((src.match(/\.limit\(/g) || []).length, 5);
  for (const chunk of src.split(".from('").slice(1)) {
    assert.match(chunk.slice(0, chunk.indexOf(';')), /\.limit\(/, `query ไม่มีเพดาน: ${chunk.slice(0, 40)}`);
  }
  // R0 ไม่อ่านภาพนิ่ง/HTML/PDF ของแถวเอกสาร — ดูแค่ว่าตรึงแล้วไหม (`frozenAt`)
  assert.doesNotMatch(src, /R0_REPORT_COLUMNS = '[^']*(snapshot|Html|PdfPath|images)/);
  // สวิตช์ประเมินจากแบบส่งตรงด้วย `--drawing-method` — สคริปต์ไม่อ่านสวิตช์ (ไม่ import โมดูลสวิตช์ · ไม่อ่าน env)
  assert.doesNotMatch(src, /surveyDrawingFlag|SURVEY_DRAWING_METHOD/);
  assert.match(src, /const drawing = \{ drawingMethodEnabled: drawingMethodEnabled === true \};/);
  // ข้อกันเอกสารของใบจากแบบถูกถอดในงวด S3 — สคริปต์ไม่อ่านธง `hold` อีก
  assert.doesNotMatch(src, /\bhold\b|signHold/);
  // ตารางลายเซ็นอ่านผ่านตัวโหลดเดียวกับ route (สองคำสั่งมีเพดาน) — สคริปต์ไม่ยิงเอง และไม่แตะคลังไฟล์ลายเซ็น
  assert.doesNotMatch(src, /user_signature|signature-assets|surveyReportSignFlag|SURVEY_REPORT_SIGNATURES/);
  assert.match(src, /const rule = signers \? \{ signatureRule: 'required' \} : \{\};/, 'กติกาลายเซ็นส่งตรงให้ตัวตรวจเฉพาะเมื่อขอ --signers');

  const { files, packages } = importGraph('scripts/check-survey-report-inputs.mjs');
  for (const heavy of ['surveyReportIssue', 'surveyReportImages', 'surveyReportPaper', 'documents/htmlPdf', 'lib/drive.js', 'surveyReportDocument']) {
    assert.ok(!files.some((f) => f.includes(heavy)), `สคริปต์ตรวจต้องไม่ import ${heavy}`);
  }
  for (const pkg of ['sharp', 'puppeteer-core', '@sparticuz/chromium', 'googleapis']) assert.ok(!packages.has(pkg), pkg);
  assert.ok(files.some((f) => f.endsWith('service/surveyReportInputs.js')));
});

/* ══ ③ ไปป์ไลน์ของ harness ═════════════════════════════════════════════ */

const SHEET_OPEN = '<article class="sheet';
function fakePdf(pages) {
  const parts = ['%PDF-1.4', '1 0 obj\n<< /Type /Pages /Count 0 >>\nendobj'];
  for (let i = 0; i < pages; i += 1) parts.push(`${i + 2} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj`);
  for (const name of ['AAAAAA+Sarabun-Regular', 'BBBBBB+Sarabun-Bold']) parts.push(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} >>`);
  return Buffer.from(`${parts.join('\n')}\n%%EOF`, 'latin1');
}
/** ตัวพิมพ์ปลอม — หนึ่งแผ่นต่อ `<article class="sheet` · ผลวัดอยู่ในกรอบทุกหน้า · จำว่าเปิด/ปิดเบราว์เซอร์กี่ครั้ง */
function fakeRenderer() {
  const state = { prints: 0, launches: 0, closes: 0 };
  state.load = async () => ({
    HTML_PDF_GENERATOR_VERSION: 'pdf-fake-v1',
    launchBrowser: async () => { state.launches += 1; return { close: async () => { state.closes += 1; } }; },
    renderHtmlPdf: async (html) => {
      state.prints += 1;
      const sheets = html.split(SHEET_OPEN).length - 1;
      return {
        buffer: fakePdf(sheets),
        fit: Array.from({ length: sheets }, (_, i) => ({ page: i + 1, height: 1123, rule: 1054, last: 900, lastBlock: 'p.note', body: 900, marks: {} })),
        brokenImages: 0,
      };
    },
  });
  return state;
}

/* ตัวเตรียมรูปกับขั้นกระดาษลง log ทาง `log` ที่ harness เสียบ — เหลือแค่ console ของกรณีล้ม ซึ่งเทสต์ปิดเสียงเอง */
function quiet(t) {
  for (const name of ['error', 'warn', 'info']) t.mock.method(console, name, () => {});
}

test('ตรวจอินพุต `--signers`: รายชื่อผู้ลงนาม + ใครยังไม่มีลายเซ็น — กติกาส่งตรงไม่ผ่านสวิตช์ · ไม่ขอ = รายงานเท่าเดิม ไม่อ่านตารางลายเซ็น', async () => {
  // โลกที่สองคนมีลายเซ็นครบ (ค่าตั้งต้นของโลกปลอม)
  const ready = worldOf();
  const plain = await checkSurveyReportInputs(readOnlyClient(ready.supabase), { request: ready.request(), now: NOW });
  assert.equal('signers' in plain, false);
  const ok = await checkSurveyReportInputs(readOnlyClient(ready.supabase), { request: ready.request(), now: NOW, signers: true });
  assert.equal(ok.error, null);
  assert.deepEqual(ok.signers, [
    { seat: 'assessor', label: 'ผู้ประเมิน', name: 'Lead Assessor', userId: 'U-lead', signature: 'ready', account: 'active', barred: false },
    { seat: 'approver', label: 'ผู้ตรวจสอบและอนุมัติ', name: 'Head Approver', userId: 'U-head', signature: 'ready', account: null, barred: false },
  ]);
  assert.deepEqual(ok.issues, { content: [], system: [] });
  assert.equal(ok.verdict.refusedByDocument, null);
  assert.equal(signerStuck(ok), false);
  // อ่านอย่างเดียว และไม่แตะคลังไฟล์ลายเซ็น (ตัวห่อโยนเมื่อถูกถาม storage — รายงานจะมี error)
  untouched(ready);
  assert.deepEqual(ready.signatures.vault.downloads, []);

  // ใบที่ส่งผลแล้ว ผู้ส่งผลไม่มีลายเซ็น = ปุ่ม "ออกเอกสาร" จะติด
  const noHead = surveyPipelineWorld(twin(), { files: new Map(), clock, signed: ['assessor'] });
  const sent = await checkSurveyReportInputs(readOnlyClient(noHead.supabase), { request: noHead.request(), now: NOW, signers: true });
  assert.deepEqual(sent.signers.map((row) => [row.seat, row.signature]), [['assessor', 'ready'], ['approver', 'none']]);
  assert.equal(sent.issues.content.length, 1);
  assert.match(sent.issues.content[0], /^ผู้ตรวจสอบและอนุมัติ Head Approver \(ผู้ส่งผล\) ยังไม่มีลายเซ็นในระบบ/);
  assert.match(sent.verdict.refusedByDocument, /^ออกเอกสารไม่ได้ — ผู้ตรวจสอบและอนุมัติ Head Approver/);
  const text = reportLines(sent).join('\n');
  assert.match(text, /ผู้ลงนาม \(กติกาลายเซ็นจริง\):/);
  assert.match(text, /✓ ผู้ประเมิน Lead Assessor — มีลายเซ็นแล้ว/);
  assert.match(text, /✗ ผู้ตรวจสอบและอนุมัติ Head Approver — ยังไม่มีลายเซ็น/);
  assert.doesNotMatch(text, /U-lead|U-head/, 'ข้อความบนจอไม่พิมพ์ id ของผู้ใช้');
});

test('🔴 ตรวจอินพุต `--signers` · ใบที่ยังไม่ส่งผล: ผู้ส่งผลสมมติของสคริปต์ไม่ถูกรายงานและไม่ถูกนับเป็นเหตุ — เหลือแต่ผู้ประเมิน · ผู้ประเมินไม่มีลายเซ็น = จะถูกตีกลับ', async () => {
  const ready = unsentWorld();
  const a = await checkSurveyReportInputs(readOnlyClient(ready.supabase), { request: ready.request(), now: NOW, signers: true });
  assert.equal(a.mode, 'send');
  assert.deepEqual(a.signers.map((row) => [row.seat, row.signature]), [['assessor', 'ready']]);
  assert.deepEqual(a.issues, { content: [], system: [] }, 'บรรทัดของผู้ส่งผลสมมติ ("หัวหน้าที่จะกดส่งผล") ต้องไม่ขึ้น');
  assert.deepEqual(a.verdict, { refusedByGates: false, refusedByDocument: null, newlyRefused: false, skipped: false });
  assert.match(reportLines(a).join('\n'), /ผู้ตรวจสอบและอนุมัติ = หัวหน้าที่จะกดส่งผล/);

  const source = twin();
  const world = surveyPipelineWorld(source, { files: syntheticDriveFiles(source), clock, signed: [] });
  Object.assign(world.request(), { answeredAt: null, answeredById: null, answeredByName: null, status: 'in_progress' });
  world.tables.service_visits[0].status = 'in_progress';
  const b = await checkSurveyReportInputs(readOnlyClient(world.supabase), { request: world.request(), now: NOW, signers: true });
  assert.deepEqual(b.signers, [{ seat: 'assessor', label: 'ผู้ประเมิน', name: 'Lead Assessor', userId: 'U-lead', signature: 'none', account: 'active', barred: false }]);
  assert.deepEqual(b.issues.content, ['ผู้ประเมิน Lead Assessor ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน']);
  assert.equal(b.verdict.newlyRefused, true, 'ใบที่วันนี้ส่งได้ จะถูกตีกลับเมื่อกติกาเปิด');
  assert.equal(signerStuck(b), false, 'บัญชียังใช้งาน — เจ้าตัวเพิ่มลายเซ็นได้');
  untouched(world);
});

test('🔴 ตรวจอินพุต `--signers`: ผู้ประเมินไม่มีลายเซ็นและบัญชีถูกปิด/ถูกลบ = ใบที่ติดถาวร — สรุปนับให้เห็น (ต้องเป็น 0 ก่อนเปิดสวิตช์) · อ่านลายเซ็นไม่สำเร็จ = ไม่ทราบ ไม่ใช่ไม่มี', async (t) => {
  quiet(t);
  const source = twin();
  // ผู้ประเมินของ fixture ถูกเปลี่ยนเป็นคนที่ไม่มีบัญชีแล้ว (ตัวอ่านบัญชีตอบ 404)
  source.visit = { ...source.visit, assigneeId: 'U-gone', assigneeName: 'Former Crew' };
  const world = surveyPipelineWorld(source, { files: new Map(), clock, signed: ['approver'] });
  world.tables.service_visits[0].assigneeId = 'U-gone';
  const origin = world.supabase.auth.admin.getUserById;
  world.supabase.auth.admin.getUserById = async (id) => (id === 'U-gone'
    ? { data: { user: null }, error: { status: 404, message: 'User not found' } } : origin(id));
  const stuck = await checkSurveyReportInputs(readOnlyClient(world.supabase), { request: world.request(), now: NOW, signers: true });
  assert.deepEqual(stuck.signers[0], { seat: 'assessor', label: 'ผู้ประเมิน', name: 'Former Crew', userId: 'U-gone', signature: 'none', account: 'missing', barred: false });
  assert.equal(signerStuck(stuck), true);
  assert.match(stuck.issues.content[0], /ยังไม่มีลายเซ็นในระบบ และบัญชีถูกปิดหรือถูกลบแล้ว — เพิ่มลายเซ็นไม่ได้ แจ้งผู้ดูแลระบบ$/);
  assert.match(reportLines(stuck).join('\n'), /✗ ผู้ประเมิน Former Crew — ยังไม่มีลายเซ็น · บัญชีถูกลบ — เพิ่มลายเซ็นเองไม่ได้/);

  const fine = await checkSurveyReportInputs(readOnlyClient(worldOf().supabase), { request: worldOf().request(), now: NOW, signers: true });
  const summary = summaryLines([stuck, fine]).join('\n');
  assert.match(summary, /ลายเซ็นของผู้ลงนาม \(กติกาลายเซ็นจริง · ตรวจ 2 ใบ\)/);
  assert.match(summary, /ผู้ที่ต้องเพิ่มลายเซ็นที่ "บัญชีของฉัน": 1 คน/);
  assert.match(summary, /Former Crew \(ผู้ประเมิน\) — 1 ใบ · 🔴 บัญชีถูกปิดหรือถูกลบ/);
  assert.match(summary, /🔴 ใบที่ผู้ประเมินยังไม่มีลายเซ็นและบัญชีถูกปิดหรือถูกลบ: 1 \(ต้องเป็น 0 ก่อนเปิดสวิตช์ลายเซ็นจริง/);
  assert.match(summary, /RQ-AS-26090186 · ส่งผลแล้ว/);
  assert.match(summaryLines([fine]).join('\n'), /✅ ใบที่ผู้ประเมินยังไม่มีลายเซ็นและบัญชีถูกปิดหรือถูกลบ: 0/);
  // ไม่ได้ขอ --signers = สรุปไม่มีก้อนนี้ (ผลของสคริปต์รุ่นก่อนไม่เปลี่ยน)
  const plain = await checkSurveyReportInputs(readOnlyClient(worldOf().supabase), { request: worldOf().request(), now: NOW });
  assert.doesNotMatch(summaryLines([plain]).join('\n'), /ลายเซ็น/);

  // อ่านตารางลายเซ็นไม่ได้ = ไม่ทราบ (`?`) — ไม่ถูกนับว่า "ยังไม่มีลายเซ็น"
  const broken = worldOf();
  delete broken.tables.user_signatures;
  const unknown = await checkSurveyReportInputs(readOnlyClient(broken.supabase), { request: broken.request(), now: NOW, signers: true });
  assert.deepEqual(unknown.unknown, ['signatures']);
  assert.deepEqual(unknown.signers.map((row) => row.signature), ['unknown', 'unknown']);
  assert.deepEqual(unknown.issues.content, []);
  const text = summaryLines([unknown]).join('\n');
  assert.match(text, /ผู้ที่ต้องเพิ่มลายเซ็นที่ "บัญชีของฉัน": — \(ผู้ลงนามของทุกใบมีลายเซ็นแล้ว\)/);
  assert.match(text, /\? อ่านลายเซ็นไม่สำเร็จ 1 ใบ — รันซ้ำก่อนสรุป/);
});

test('🔴 ตรวจอินพุต `--signers`: บัญชีของผู้ลงนามที่นั่งที่นั่งนั้นไม่ได้ (ผู้ส่งผลที่ไม่ใช่หัวหน้า · ผู้ประเมินนอกฝ่ายบริการ) — รายงานรายใบและสรุปนับให้เห็นก่อนเปิดสวิตช์', async (t) => {
  quiet(t);
  const swapAccount = (world, id, user) => {
    const origin = world.supabase.auth.admin.getUserById;
    world.supabase.auth.admin.getUserById = async (asked) => (asked === id ? { data: { user: { id, ...user } }, error: null } : origin(asked));
  };

  // ① ใบที่ตอบไปแล้วโดยหัวหน้าฝ่ายขาย (ตอบผ่านปุ่มทั่วไปก่อน 24/09) — มีลายเซ็นครบ แต่เอกสารไม่พิมพ์ลายเซ็นของเขา
  const sales = worldOf();
  swapAccount(sales, sales.request().answeredById, { app_metadata: { role: 'ae_supervisor' }, user_metadata: { name: 'Head Approver' } });
  const answered = await checkSurveyReportInputs(readOnlyClient(sales.supabase), { request: sales.request(), now: NOW, signers: true });
  assert.equal(answered.error, null);
  assert.deepEqual(answered.signers.map((row) => [row.seat, row.signature, row.barred]), [['assessor', 'ready', false], ['approver', 'ready', true]]);
  assert.equal(signerBarred(answered), true);
  assert.equal(signerStuck(answered), false);
  assert.deepEqual(answered.issues.content, [
    'ผู้ตรวจสอบและอนุมัติ Head Approver (ผู้ส่งผล) ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน (หัวหน้าฝ่ายบริการ) — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ ดึงผลกลับแล้วให้หัวหน้าฝ่ายบริการส่งใหม่',
  ]);
  assert.match(answered.verdict.refusedByDocument, /^ออกเอกสารไม่ได้ — ผู้ตรวจสอบและอนุมัติ Head Approver \(ผู้ส่งผล\) ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน/);
  assert.match(reportLines(answered).join('\n'),
    /✗ ผู้ตรวจสอบและอนุมัติ Head Approver — มีลายเซ็นแล้ว · 🔴 ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน — เอกสารไม่พิมพ์ลายเซ็นของบัญชีนี้ \(ดึงผลกลับแล้วให้หัวหน้าฝ่ายบริการส่งใหม่\)/);
  untouched(sales);
  assert.deepEqual(sales.signatures.vault.downloads, [], 'สคริปต์ไม่แตะคลังไฟล์ลายเซ็น');

  // ② ใบที่ยังไม่ส่ง นัดชี้บัญชีนอกฝ่ายบริการที่มีลายเซ็น — เปิดสวิตช์แล้วจะถูกตีกลับ และเพิ่มลายเซ็นไม่ช่วย
  const source = twin();
  const outsider = surveyPipelineWorld(source, { files: syntheticDriveFiles(source), clock });
  Object.assign(outsider.request(), { answeredAt: null, answeredById: null, answeredByName: null, status: 'in_progress' });
  outsider.tables.service_visits[0].status = 'in_progress';
  swapAccount(outsider, outsider.tables.service_visits[0].assigneeId, { app_metadata: { role: 'commercial_director' }, user_metadata: { name: 'Lead Assessor' } });
  const unsent = await checkSurveyReportInputs(readOnlyClient(outsider.supabase), { request: outsider.request(), now: NOW, signers: true });
  assert.deepEqual(unsent.signers.map((row) => [row.seat, row.signature, row.barred]), [['assessor', 'ready', true]]);
  assert.deepEqual(unsent.issues.content, [
    'ผู้ประเมิน Lead Assessor ไม่ใช่บัญชีฝ่ายบริการ — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ แจ้งผู้จัดคิวให้แก้ผู้รับผิดชอบของนัด',
  ]);
  assert.equal(unsent.verdict.newlyRefused, true);
  assert.match(reportLines(unsent).join('\n'), /✗ ผู้ประเมิน Lead Assessor — มีลายเซ็นแล้ว · 🔴 ไม่ใช่บัญชีฝ่ายบริการ — เอกสารไม่พิมพ์ลายเซ็นของบัญชีนี้ \(แก้ผู้รับผิดชอบของนัด\)/);

  // สรุป: นับใบที่ติดเรื่องบัญชี แยกจาก "ใครต้องเพิ่มลายเซ็น" (สองใบนี้ไม่มีใครต้องเพิ่มลายเซ็น — เพิ่มไปก็ไม่ถูกพิมพ์)
  const fine = await checkSurveyReportInputs(readOnlyClient(worldOf().supabase), { request: worldOf().request(), now: NOW, signers: true });
  assert.equal(signerBarred(fine), false);
  const summary = summaryLines([answered, unsent, fine]).join('\n');
  assert.match(summary, /🔴 ใบที่บัญชีของผู้ลงนามนั่งที่นั่งนั้นไม่ได้ \(ผู้ประเมินนอกฝ่ายบริการ · ผู้ส่งผลที่ไม่ใช่หัวหน้า\): 2 /);
  assert.match(summary, /RQ-AS-26090186 · ส่งผลแล้ว · ผู้ตรวจสอบและอนุมัติ Head Approver/);
  assert.match(summary, /RQ-AS-26090186 · ยังไม่ส่งผล · ผู้ประเมิน Lead Assessor/);
  assert.match(summary, /ผู้ที่ต้องเพิ่มลายเซ็นที่ "บัญชีของฉัน": — \(ผู้ลงนามของทุกใบมีลายเซ็นแล้ว\)/);
  assert.match(summaryLines([fine]).join('\n'), /✅ ใบที่บัญชีของผู้ลงนามนั่งที่นั่งนั้นไม่ได้ \(ผู้ประเมินนอกฝ่ายบริการ · ผู้ส่งผลที่ไม่ใช่หัวหน้า\): 0 /);
  assert.doesNotMatch(`${summary}\n${reportLines(answered).join('\n')}`, /U-lead|U-head|U-assessor|U-approver/, 'ข้อความบนจอไม่พิมพ์ id ของผู้ใช้');
});

test('ตรวจอินพุต `main --answered --signers`: ใบที่ส่งผลแล้วเข้าชุด · ไม่ซ้ำกับใบที่ระบุชื่อ · มีเพดาน · ทุกทางอ่านอย่างเดียว', async () => {
  const world = worldOf(); // ใบของแฝดสังเคราะห์ = ส่งผลแล้ว
  const run = async (argv) => {
    const lines = [];
    const exit = await checkMain({ argv, supabase: world.supabase, log: (line) => lines.push(line), now: NOW });
    return { exit, text: lines.join('\n') };
  };
  const open = await run(['--open']);
  assert.match(open.text, /══ สรุป 0 ใบ ══/, 'ใบที่ส่งผลแล้วไม่อยู่ในชุด --open');
  const answered = await run(['--answered', '--signers']);
  assert.equal(answered.exit, 0);
  assert.match(answered.text, /── RQ-AS-26090186 · ส่งผลแล้ว ──/);
  assert.match(answered.text, /══ สรุป 1 ใบ ══/);
  assert.match(answered.text, /ผู้ลงนาม \(กติกาลายเซ็นจริง\):/);
  assert.match(answered.text, /✅ ใบที่ผู้ประเมินยังไม่มีลายเซ็นและบัญชีถูกปิดหรือถูกลบ: 0/);
  // ไม่ขอ --signers = ไม่มีก้อนผู้ลงนาม
  assert.doesNotMatch((await run(['--answered'])).text, /ผู้ลงนาม/);
  const json = JSON.parse((await run(['RQ-AS-26090186', '--open', '--answered', '--signers', '--json'])).text);
  assert.equal(json.reports.length, 1);
  assert.equal(json.reports[0].signers.length, 2);

  const client = readOnlyClient(world.supabase);
  assert.equal((await loadAnsweredSurveyRequests(client)).requests.length, 1);
  assert.equal((await loadAnsweredSurveyRequests(client, { limit: 1 })).capped, true);
  world.request().cancelledAt = '2026-09-30T00:00:00.000+00:00';
  assert.equal((await loadAnsweredSurveyRequests(client)).requests.length, 0, 'ใบที่ถูกยกเลิกไม่อยู่ในชุด');
  untouched(world);
  assert.deepEqual(world.signatures.vault.downloads, []);
});

test('⭐ ไปป์ไลน์ (ปุ่ม "ออกเอกสาร"): missing → issued → ready · รอบสอง reused · เลขเดียว แถวเดียว · sharp จริงย่อรูปไฟล์ละครั้ง', async (t) => {
  quiet(t);
  const world = worldOf();
  const renderer = fakeRenderer();
  const run = await runSurveyPipeline(world, { clock, loadRenderer: renderer.load });

  assert.deepEqual(run.states, ['missing', 'issued', 'ready']);
  assert.equal(run.docNo, 'SU-26100001-0');
  assert.deepEqual(run.first.issue, {
    state: 'issued', code: null, docNo: 'SU-26100001-0', rev: 0, reused: false, reason: null, retry: false,
    warnings: run.first.issue.warnings,
  });
  assert.equal(run.first.issue.warnings.length, 2);
  assert.deepEqual(run.first.paper, { state: 'ready', code: null, reasons: [], captured: ['customer', 'internal'], ready: { customer: true, internal: true } });
  assert.equal(run.second.issue.reused, true);
  assert.equal(run.second.issue.docNo, 'SU-26100001-0');
  assert.deepEqual(run.second.paper.captured, []);
  assert.deepEqual(pipelineFailures(world, run), []);

  // วัดก่อนออกเลขสองฉบับ (I5b) + พิมพ์จริงสองฉบับ = สี่ครั้ง ในเบราว์เซอร์เดียว · รอบสองไม่พิมพ์เลย
  assert.deepEqual({ ...renderer, load: undefined }, { prints: 4, launches: 1, closes: 1, load: undefined });
  // sharp จริง: ภาพกว้าง/จุด ≤ 1000 px · ผัง ≤ 1600 px (ต้นฉบับ 1199 ไม่ถูกขยาย)
  const row = world.reports()[0];
  // รูปของพื้นที่ 8 + ลายเซ็นของผู้ลงนามสองคน (ไปป์ไลน์เดินด้วยกติกาลายเซ็นจริงเปิด)
  assert.equal(row.images.length, 10);
  assert.deepEqual(row.images.filter((img) => img.kind === 'sign').map((img) => [img.attId, img.w, img.h]), [[null, 533, 200], [null, 533, 200]]);
  assert.ok(row.images.every((img) => /^[0-9a-f]{64}$/.test(img.sha) && Math.max(img.w, img.h) <= 1600));
  // ⭐ ลายเซ็น: ภาพนิ่งตรึงผู้ประเมินกับผู้ส่งผล (ไม่ใช่คนกด) · คลังถูกอ่านไฟล์ละครั้ง · กระดาษที่ตรึงมีรูปลายเซ็น 2 / 4 ที่
  assert.deepEqual([row.snapshot.signatures.assessor.name, row.snapshot.signatures.approver.name], ['Lead Assessor', 'Head Approver']);
  assert.ok(!JSON.stringify(row.snapshot.signatures).includes(PIPELINE_USER.id));
  assert.equal(world.signatures.vault.downloads.length, 2);
  assert.equal(row.customerHtml.split('<img class="sig-img" src="su-img:').length - 1, 2);
  assert.equal(row.internalHtml.split('<img class="sig-img" src="su-img:').length - 1, 4);
  assert.equal(run.audits[0].after.signCount, 2);
  assert.equal(row.issuedByName, PIPELINE_USER.name);
  assert.equal(row.approvedByName, 'Head Approver', 'ผู้อนุมัติ = คนส่งผลบนคำร้อง ไม่ใช่คนกด');
  assert.equal(row.issuedAt, NOW.toISOString());

  // ผลของ fixture ทองคำ: 4 / 6 หน้า · ยอดรวม · เลขที่จาก RPC บนหัววิ่ง
  const papers = pipelinePapers(world, run);
  assert.deepEqual(papers.map((p) => [p.version, p.layout.pageCount, p.pdfPages]), [['customer', 4, 4], ['internal', 6, 6]]);
  assert.deepEqual(goldenFailures(papers, run.docNo), []);
  assert.match(goldenFailures(papers, 'SU-00000000-0').join('\n'), /หัววิ่งต้องมีแค่เลขที่เอกสาร/);
  // audit ปลอมได้สองแถว — ไม่มีอะไรไปถึง audit ของจริง
  assert.deepEqual(run.audits.map((a) => a.action), ['create', 'update']);
});

test('ไปป์ไลน์ (เส้นส่งผล): ตรวจรูปก่อน → ออกเลขไม่วัดกระดาษ → ขั้นกระดาษ · แผนที่รูปถูกใช้ซ้ำ ไม่มีไฟล์ไหนถูกดึงสองครั้ง', async (t) => {
  quiet(t);
  const world = worldOf();
  const renderer = fakeRenderer();
  const run = await runSurveyPipeline(world, { via: 'send', clock, loadRenderer: renderer.load });
  assert.deepEqual(run.states, ['missing', 'issued', 'ready']);
  assert.deepEqual(pipelineFailures(world, run), []);
  assert.deepEqual([...world.drive.fetched.values()], [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(renderer.prints, 2, 'เส้นส่งผลไม่วัดกระดาษก่อนออกเลข (มติ 3) — พิมพ์แค่ตอนขั้นกระดาษ');
  assert.match(run.audits[0].summary, /พร้อมส่งผล/);
  // ลายเซ็นถูกเตรียมก่อนออกเลข (S5) แล้วส่งต่อ — ขั้นออกเลขไม่อ่านคลังซ้ำ: ไฟล์ละครั้งตลอดทั้งสองรอบ
  assert.equal(world.signatures.vault.downloads.length, 2);
  assert.equal(run.lines.filter((line) => 'versionId' in line && line.ok).length, 2, 'บรรทัดของตัวเตรียมลายเซ็น: คนละครั้ง');
  assert.equal(world.reports()[0].snapshot.signatures.approver.versionId, 'signature-version-U-head-1');
});

test('🔴 ไปป์ไลน์ + ลายเซ็น: ผู้ส่งผลไม่มีลายเซ็น = ไม่ออกเลข (blocked กดซ้ำได้) · กติกาปิด = กระดาษแบบคำ คลังไม่ถูกแตะ · `pipelineFailures` ตรวจทั้งสองแบบ', async (t) => {
  quiet(t);
  const source = twin();
  const noHead = surveyPipelineWorld(source, { files: syntheticDriveFiles(source), clock, signed: ['assessor'] });
  const refused = await runSurveyPipeline(noHead, { clock, loadRenderer: fakeRenderer().load });
  assert.deepEqual(refused.states, ['missing', 'missing']);
  assert.equal(refused.first.issue.code, 'blocked');
  assert.equal(refused.first.issue.retry, true);
  assert.match(refused.first.issue.reason, /Head Approver \(ผู้ส่งผล\) ยังไม่มีลายเซ็นในระบบ .* · ให้ผู้ที่มีชื่อในรายการเพิ่มลายเซ็นที่ “บัญชีของฉัน” แล้วกดออกเอกสารอีกครั้ง$/);
  assert.equal(noHead.rpcCalls.length, 0);
  assert.equal(noHead.drive.fetched.size, 0, 'ติดที่ด่านก่อนดึงรูปสักไฟล์');
  assert.deepEqual(noHead.signatures.vault.downloads, []);

  const off = worldOf();
  const words = await runSurveyPipeline(off, { clock, loadRenderer: fakeRenderer().load, signatureRule: 'off' });
  assert.deepEqual(words.states, ['missing', 'issued', 'ready']);
  assert.deepEqual(pipelineFailures(off, words), []);
  const row = off.reports()[0];
  assert.equal('signatures' in row.snapshot, false);
  assert.equal(row.images.length, 8);
  assert.equal(row.customerHtml.includes('class="sig-img'), false);
  assert.equal(row.customerHtml.split('<div class="sig-e">ลายเซ็นอิเล็กทรอนิกส์</div>').length - 1, 2);
  assert.deepEqual(off.signatures.vault.downloads, []);
  // `pipelineFailures` จับได้เมื่อภาพนิ่งตรึงลายเซ็นแต่กระดาษที่ตรึงไม่มีรูป
  const signedWorld = worldOf();
  const ok = await runSurveyPipeline(signedWorld, { clock, loadRenderer: fakeRenderer().load });
  assert.deepEqual(pipelineFailures(signedWorld, ok), []);
  signedWorld.reports()[0].internalHtml = off.reports()[0].internalHtml;
  assert.match(pipelineFailures(signedWorld, ok).join('\n'), /internal: ยามลายเซ็น — กระดาษไม่มีรูปลายเซ็นของผู้ประเมิน/);
});

test('คลังลายเซ็นของโลกปลอมอ่านอย่างเดียว · fixture ที่ไม่มี id ของผู้ลงนาม (ของจริง) ได้ id สมมติ — เอกสารต้องผูกที่นั่งกับบัญชี', async () => {
  const world = worldOf();
  const bucket = world.supabase.storage.from('signature-assets');
  assert.throws(() => bucket.upload('users/U-lead/x.png', Buffer.alloc(1)), /อ่านอย่างเดียว/);
  const path = world.signatures.versions['U-lead'].storagePath;
  assert.ok((await bucket.download(path)).data);
  assert.equal((await bucket.download('users/U-lead/none.png')).error.statusCode, '404');
  // ถังของเอกสารยังเป็นถังเดิมของโลกปลอม (รับแค่ JPEG/PDF)
  assert.match((await world.supabase.storage.from('survey-report').upload('img/a.png', Buffer.from('x'), { contentType: 'image/png' })).error.message, /not supported/);

  const fixture = syntheticSurveyFixture();
  delete fixture.request.answeredById;
  fixture.visits[0].assigneeId = null;
  const source = surveyReportInputsFromFixture(fixture, { withImages: false });
  const real = surveyPipelineWorld(source, { files: syntheticDriveFiles(source), clock });
  assert.deepEqual(real.signatures.signers, { assessor: 'U-assessor', approver: 'U-approver' });
  assert.equal(real.request().answeredById, 'U-approver');
  assert.deepEqual(Object.keys(real.signatures.versions).sort(), ['U-approver', 'U-assessor']);
});

test('harness โหมดเรนเดอร์: ลายเซ็นปลอมผ่านตัวเตรียมตัวจริง (sharp) — อินพุตตรึงได้ · รูปเป็น JPEG ที่ถมพื้นขาวและย่อแล้ว · กรณีของลายเซ็นครบสี่กรณี', async () => {
  const signed = await harnessSignatures(twin({ withImages: true }));
  const built = buildSurveyReportSnapshot(signed.inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  const seats = built.snapshot.signatures;
  assert.deepEqual([seats.assessor.img.w, seats.assessor.img.h], [533, 200]);
  assert.notEqual(seats.assessor.img.sha, seats.approver.img.sha, 'สองคน = สองเส้น');
  assert.deepEqual(Object.keys(signed.bySha).sort(), [seats.assessor.img.sha, seats.approver.img.sha].sort());
  for (const uri of Object.values(signed.bySha)) assert.match(uri, /^data:image\/jpeg;base64,\/9j\//);
  assert.deepEqual(Object.keys(signed.sources).sort(), ['U-head', 'U-lead']);
  // กระดาษแบบ token ของอินพุตนี้ผ่านยามลายเซ็นของ production ทั้งสองฉบับ
  for (const version of ['customer', 'internal']) {
    const view = surveyReportView(built.snapshot, { version });
    const html = renderSurveyReportHTML({ view, layout: paginateSurveyReport(view), docNo: 'SU-26100001-0' });
    assert.deepEqual(surveyReportSignatureHtmlIssues({ html, snapshot: built.snapshot, version }), [], version);
  }

  assert.deepEqual(surveySignCases().map((c) => [c.name, c.mode, c.seats.images, c.seats.waits, c.known.length, c.pipeline === true]), [
    ['sign-closed', 'freeze', 2, 0, 0, false], ['sign-same', 'freeze', 2, 0, 0, false], ['sign-wrap', 'freeze', 2, 0, 1, false],
    ['sign-draft', 'draft', 0, 2, 0, false],
    // งวด S3 — ต่อท้าย: ใบจากแบบล้วน (ที่นั่งที่ 1 คัดลอก / พิมพ์คำ) · ใบผสม — เดินผ่านไปป์ไลน์ได้ด้วย
    ['sign-drawing', 'freeze', 2, 0, 0, true], ['sign-drawing-other', 'freeze', 1, 0, 0, true], ['sign-mixed', 'freeze', 2, 0, 0, true],
  ]);
  // คนเดียวสองที่นั่ง = ไฟล์เดียว · ฉบับร่าง = ยังไม่เตรียมรูป (ไม่มีอะไรให้ Chrome วาด)
  const same = await harnessSignatures(twin({ withImages: true }), { same: true });
  assert.equal(Object.keys(same.bySha).length, 1);
  const draft = await harnessSignatures(twin({ withImages: true }), { have: ['approver'], prepared: false });
  assert.deepEqual(draft.bySha, {});
  assert.equal('signatureImageByVersionId' in draft.inputs, false);
  assert.equal(draft.inputs.signatures['U-lead'], null);
});

test('harness: ข้อของช่องลายเซ็น (`signFailures`) จับได้จริง — รูปขาด · รูปถูกยืด · ช่องสูงผิด · ล้นที่นั่ง · ชื่อหาย · ที่นั่งลูกค้าไม่ใช่แบบฟอร์ม', () => {
  const img = (over = {}) => ({ decoded: true, natural: [533, 200], box: [203, 45], fit: 'contain', inside: true, ...over });
  const seat = (title, over = {}) => ({ title, signed: true, name: 'ชื่อ', date: '09/10/2026', words: null, wait: null, form: false, img: img(), height: 188, ...over });
  const customerSeat = { title: 'ลูกค้ารับทราบ', signed: false, name: '', date: '', words: null, wait: null, form: true, img: null, height: 188 };
  const good = () => ({ version: 'customer', signs: { signoff: [[seat('ผู้ประเมิน'), seat('ผู้ตรวจสอบและอนุมัติ'), { ...customerSeat }]], signs: [] } });
  const want = { images: 2, waits: 0 };
  assert.deepEqual(signFailures(good(), want), []);
  const broken = (mutate) => { const r = good(); mutate(r.signs.signoff[0]); return signFailures(r, want).join(' | '); };
  assert.match(broken((s) => { s[1].img = null; s[1].words = 'ลายเซ็นอิเล็กทรอนิกส์'; }), /ต้องมีรูปลายเซ็น 2 ที่ — พบ 1/);
  assert.match(broken((s) => { s[0].img.decoded = false; }), /รูปลายเซ็นถอดรหัสไม่ได้/);
  assert.match(broken((s) => { s[0].img.fit = 'fill'; }), /ต้องวางแบบ contain \(ไม่ยืด ไม่ตัด\) — ได้ fill/);
  assert.match(broken((s) => { s[0].img.box = [203, 60]; }), /ช่องลายเซ็นต้องสูง 45px — วัดได้ 60/);
  assert.match(broken((s) => { s[0].img.inside = false; }), /ล้นออกนอกที่นั่ง/);
  assert.match(broken((s) => { s[1].name = '—'; }), /ชื่อหรือวันที่หาย/);
  assert.match(broken((s) => { s[2].form = false; }), /ที่นั่งลูกค้าต้องเป็นแบบฟอร์มเปล่า/);
  assert.match(broken((s) => { s[2].img = img(); }), /ต้องมีรูปลายเซ็น 2 ที่ — พบ 3/);
  // ฉบับภายในต้องมีบล็อกภาคผนวก จ หนึ่งบล็อก ช่องสูง 28 · ที่นั่งฝ่ายขายไม่มีช่องลายเซ็น
  const internal = good();
  internal.version = 'internal';
  assert.match(signFailures(internal, want).join(' | '), /ต้องมีบล็อกภาคผนวก จ 1 บล็อก — พบ 0/);
  internal.signs.signs = [[seat('ผู้ประเมิน', { img: img({ box: [203, 28] }) }), seat('หัวหน้าฝ่ายบริการ', { img: img({ box: [203, 28] }) }), { ...customerSeat, form: false }]];
  assert.deepEqual(signFailures(internal, want), []);
  // กติกาปิด (`expect = null`): สองที่นั่งพิมพ์คำ ไม่มีรูป · ฉบับร่าง: กรอบประสองที่
  const words = good();
  for (const s of words.signs.signoff[0].slice(0, 2)) { s.img = null; s.words = 'ลายเซ็นอิเล็กทรอนิกส์'; }
  assert.deepEqual(signFailures(words, null), []);
  assert.match(signFailures(good(), null).join(' | '), /ต้องมีรูปลายเซ็น 0 ที่ — พบ 2/);
  const waits = good();
  for (const s of waits.signs.signoff[0].slice(0, 2)) { s.img = null; s.wait = 'ลายเซ็นจะขึ้นเมื่อออกเอกสาร'; }
  assert.deepEqual(signFailures(waits, { images: 0, waits: 2 }), []);
  // ความสูงที่ harness คาด ตรงกับ CSS ของกระดาษ (เขียนตายตัวสองที่โดยเจตนา — เทสต์นี้ผูกไว้)
  assert.deepEqual(SIGN_BOX_HEIGHT, { signoff: 45, signs: 28 });
  assert.match(SURVEY_REPORT_CSS, /\.signoff \.sig-img\{height:45px;\}/);
  assert.match(SURVEY_REPORT_CSS, /\.sig-img\{[^}]*height:28px;/);
});

test('🔴 ไปป์ไลน์จับของพังได้จริง: ไฟล์หายจาก Drive = ไม่ออกเลข · `pipelineFailures` บอกเหตุ · ไม่มีแถว ไม่กินเลข', async (t) => {
  quiet(t);
  const source = twin();
  const files = syntheticDriveFiles(source);
  files.delete('drv-att-z1-p1');
  const world = surveyPipelineWorld(source, { files, clock });
  const run = await runSurveyPipeline(world, { clock, loadRenderer: fakeRenderer().load });
  assert.deepEqual(run.states, ['missing', 'missing']);
  assert.equal(run.first.issue.code, 'undecodable');
  assert.match(run.first.issue.reason, /9047\.jpg/);
  assert.equal(run.second, null);
  const failures = pipelineFailures(world, run);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /สถานะต้องเป็น missing → issued → ready/);
  assert.match(failures[1], /undecodable/);
  assert.equal(world.reports().length, 0);
  assert.equal(world.rpcCalls.length, 0);

  // รูปจุดที่ยังไม่ผูก (`--no-spot-links`) ติดด่านก่อนดึงรูปสักไฟล์
  const unlinked = worldOf({ spotLinks: null });
  const blocked = await runSurveyPipeline(unlinked, { clock, loadRenderer: fakeRenderer().load });
  assert.equal(blocked.first.issue.code, 'blocked');
  assert.equal(unlinked.drive.fetched.size, 0);
});

test('โลกในหน่วยความจำ: เขียนได้เฉพาะแถวเอกสาร (เติมครั้งเดียวตาม 0401 ②) · ถังรับแค่ JPEG/PDF · ตารางที่ไม่รู้จัก = error', async () => {
  const world = worldOf();
  const { supabase } = world;
  await assert.rejects(async () => supabase.from('dept_requests').update({ answeredAt: null }).eq('id', world.request().id), /ห้ามเขียนตาราง dept_requests/);
  await assert.rejects(async () => supabase.from('entity_updates').insert({}).select(), /ห้ามเขียนตาราง entity_updates/);
  assert.match((await supabase.from('no_such_table').select('*').limit(1)).error.message, /does not exist/);
  assert.equal((await supabase.rpc('other_fn', {})).error.code, 'PGRST202');

  const issued = await supabase.rpc('issue_survey_report', {
    p_report_id: 'SVR-1', p_request_id: world.request().id, p_answered_at: world.request().answeredAt, p_yymm: '2610',
    p_row: { snapshot: { v: 1 }, images: [], issuedById: 'U', issuedByName: 'N' },
  });
  assert.equal(issued.data, 'SU-26100001-0');
  assert.match((await supabase.rpc('issue_survey_report', {
    p_report_id: 'SVR-2', p_request_id: world.request().id, p_answered_at: world.request().answeredAt, p_yymm: '2610',
    p_row: { snapshot: { v: 1 } },
  })).error.message, /survey_report_already_current/);

  const freeze = () => supabase.from('service_survey_reports').update({ customerHtml: '<a>', frozenAt: 'x' }).eq('id', 'SVR-1').is('frozenAt', null).select('id').maybeSingle();
  assert.deepEqual((await freeze()).data, { id: 'SVR-1' });
  assert.equal((await freeze()).data, null, 'ตรึงแล้ว — เงื่อนไข `frozenAt is null` ไม่ตรงแถวไหน');
  const overwrite = await supabase.from('service_survey_reports').update({ customerHtml: '<b>' }).eq('id', 'SVR-1').select('id').maybeSingle();
  assert.match(overwrite.error.message, /survey_report_immutable: SU-26100001-0 customerHtml/);
  const forbidden = await supabase.from('service_survey_reports').update({ docNo: 'SU-99999999-9' }).eq('id', 'SVR-1').select('id').maybeSingle();
  assert.match(forbidden.error.message, /survey_report_immutable: SU-26100001-0 docNo/);

  const bucket = supabase.storage.from('survey-report');
  assert.match((await bucket.upload('img/a.png', Buffer.from('x'), { contentType: 'image/png' })).error.message, /not supported/);
  assert.equal((await bucket.upload('img/a.jpg', Buffer.from('x'), { contentType: 'image/jpeg' })).error, null);
  assert.match((await bucket.upload('img/a.jpg', Buffer.from('y'), { contentType: 'image/jpeg' })).error.message, /already exists/);
  assert.equal(Buffer.from(await (await bucket.download('img/a.jpg')).data.arrayBuffer()).toString(), 'x');
  assert.match((await supabase.storage.from('other').upload('a.jpg', Buffer.from('x'), { contentType: 'image/jpeg' })).error.message, /Bucket not found/);
  await assert.rejects(world.drive.getFileStream('drv-missing'), /File not found/);
});

test('🔴 ซอร์สของ harness: ยามเขียนถาวรเสียบเป็นเปิดเฉพาะกับโลกปลอม — ไม่มี client ของจริง · audit เป็นของปลอมทั้งสองขั้น · chromium โหลดแบบ lazy', () => {
  const src = code('scripts/render-survey-report.mjs');
  for (const real of ['createClient', '@supabase/supabase-js', 'supabaseAdmin', '.env', 'SUPABASE_', 'googleapis', "lib/drive"]) {
    assert.ok(!src.includes(real), `harness ต้องไม่แตะ ${real}`);
  }
  assert.equal((src.match(/storeAllowed: true/g) || []).length, 6,
    'ตรวจรูปก่อนส่ง · เตรียมลายเซ็นก่อนส่ง · ออกเลขสองทาง · ขั้นกระดาษ · ลายเซ็นของโหมดเรนเดอร์ (ถังในหน่วยความจำ)');
  // กติกาลายเซ็นจริงส่งตรง ๆ ไม่ผ่านสวิตช์ — harness ไม่อ่าน/ไม่สลับ env (ข้อ `.env` ข้างบนคุมอยู่แล้ว) และไม่ดึงไฟล์สวิตช์
  assert.doesNotMatch(src, /surveyReportSignFlag|SURVEY_REPORT_SIGNATURES/);
  assert.match(src, /signatureRule = 'required'/);
  // สวิตช์ประเมินจากแบบ (งวด S3) ก็ส่งตรง — ไม่ดึงไฟล์สวิตช์ · ตัวโหลดกับขั้นออกเลขทั้งสองทางได้ค่าจากผู้เรียก
  assert.doesNotMatch(src, /surveyDrawingFlag|SURVEY_DRAWING_METHOD/);
  const pipelineBody = src.slice(src.indexOf('export async function runSurveyPipeline('), src.indexOf('function keysDeep('));
  assert.equal(pipelineBody.split('drawingMethodEnabled,').length - 1, 3, 'ตัวโหลด (ทาง send) · ออกเลขทาง send · ออกเลขทาง issue_only');
  assert.deepEqual(parseArgs(['--stress', '--case', 'sign-wrap', '--no-signatures']), { stress: true, case: 'sign-wrap', 'no-signatures': true });
  // ทุกการเรียกสองขั้นส่ง audit ปลอม (ค่าตั้งต้นของทั้งสองขั้นคือ `recordAudit` ซึ่งเขียน audit_logs ของจริง)
  for (const call of src.split(/(?=issueSurveyReport\(supabase|ensureSurveyReportPaper\(supabase)/).slice(1)) {
    assert.match(call.slice(0, call.indexOf('});')), /\baudit\b/, call.slice(0, 60));
  }
  assert.doesNotMatch(src, /^import[^;]*documents\/htmlPdf/m, 'htmlPdf ต้องเข้าทาง await import() เท่านั้น');
  assert.match(src, /await import\('\.\.\/src\/lib\/documents\/htmlPdf\.js'\)/);
  // ตัวนับหน้า/ฟอนต์ของ PDF มาจากตัวกลางตัวเดียวกับขั้นกระดาษ (สเปก §4) — ไม่มีสำเนาในสคริปต์
  assert.match(src, /import \{ pdfFonts, pdfPageCount \} from '\.\.\/src\/lib\/documents\/pdfInspect\.js';/);
  assert.doesNotMatch(src, /function pdf(PageCount|Fonts)\(/);
  assert.deepEqual(parseArgs(['--pipeline', '--out', 'x', '--via', 'send', '--assert']), { pipeline: true, out: 'x', via: 'send', assert: true });
  // งวด S3: `--synthetic` รับชื่อชุดได้ · ไม่ใส่ = แฝดของวันนี้
  assert.deepEqual(parseArgs(['--synthetic', 'mixed', '--out', 'x']), { synthetic: 'mixed', out: 'x' });
  assert.deepEqual(parseArgs(['--synthetic', '--out', 'x']), { synthetic: true, out: 'x' });
});

/* ══ ④ งวด S3 — ประเมินจากแบบ (fixture · harness · สคริปต์ตรวจ · R0) ═════════════════════════════════ */

// ใบของงวด S3 ส่งผล 09/10 และ 14/10 — นาฬิกาของโลกต้องอยู่หลังวันส่ง (เดือนในเลขที่ = 2610)
const NOW_S3 = new Date('2026-10-15T04:00:00.000Z');
const clockS3 = () => new Date(NOW_S3);
const S3_FIXTURES = Object.freeze({ mixed: mixedSurveyFixture, drawing: drawingSurveyFixture });
const s3Source = (name, opts) => surveyReportInputsFromFixture(S3_FIXTURES[name](), { withImages: false, ...opts });
function s3World(name, opts = {}) {
  const source = s3Source(name);
  return surveyPipelineWorld(source, { files: syntheticDriveFiles(source), clock: clockS3, ...opts });
}
const NO_VISIT = 'ไม่พบนัดประเมินพื้นที่ของใบนี้';
const NO_VISIT_TAIL = ' — พื้นที่ที่ไม่ได้ลงหน้างานให้เปลี่ยนเป็น “ประเมินจากแบบ”';
/* กระดาษของอินพุตชุดหนึ่ง (ไม่ผ่าน Chrome · ไม่มี `fit`) — รูปเดียวกับผลของ `renderVersion` ที่ `goldenFailures` อ่าน */
function papersOf(inputs, docNo) {
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined, JSON.stringify(built.errors));
  return ['customer', 'internal'].map((version) => {
    const view = surveyReportView(built.snapshot, { version });
    const layout = paginateSurveyReport(view);
    return { version, view, layout, html: renderSurveyReportHTML({ view, layout, docNo }) };
  });
}

test('fixture ของงวด S3: Case A / B ตรงตัวเลขของ BRIEF · คอลัมน์ของงวดนี้ติดไปเฉพาะ fixture ที่มี — แฝดเดิมได้อินพุตเท่าเดิมทุกคีย์', () => {
  // แฝดเดิม (และของจริงที่ดึงก่อนมีคอลัมน์): ไม่มีคีย์ไหนของงวด S3 เลย
  const twinInputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  for (const key of ['otherVisits', 'drawingMethodEnabled']) assert.equal(key in twinInputs, false, key);
  assert.equal('surveyConfirm' in twinInputs.request, false);
  for (const zone of twinInputs.zones) {
    for (const key of ['method', 'methodReason', 'methodChangedByName', 'methodChangedAt', 'surveyedById']) assert.equal(key in zone, false, key);
  }
  assert.equal(twinInputs.assigneeRoleLabel, 'เจ้าหน้าที่บริการอาวุโส (Senior)');

  // Case A — ประเมินจากแบบทั้งใบ: ไม่มีนัดให้รับรอง (แบบเดียวกับตัวโหลด) · ภาพแบบพื้นที่ละรูป ไม่มีภาพกว้าง/รูปจุด
  const desk = surveyReportInputsFromFixture(drawingSurveyFixture());
  assert.equal(desk.request.docNo, 'RQ-AS-26100345');
  assert.equal(desk.request.surveyConfirm, 'needed');
  assert.equal(desk.request.answeredAt, '2026-10-09T07:20:00.000+00:00', 'ศ. 09/10/2026 14:20 เวลาไทย');
  assert.deepEqual([desk.visit, desk.helpers, desk.otherVisits, desk.assigneeRoleLabel, desk.drawingMethodEnabled], [null, [], [], null, true]);
  assert.deepEqual(desk.zones.map((z) => [z.zoneCode, z.method, z.methodChangedAt, z.surveyedById, z.packageSize]), [
    ['ZN-1188-10301', 'drawing', null, DRAWING_HEAD.id, 'SM'],
    ['ZN-1188-10302', 'drawing', null, DRAWING_HEAD.id, 'ST'],
    ['ZN-1188-10303', 'drawing', null, DRAWING_HEAD.id, 'XS'],
  ]);
  assert.deepEqual(Object.values(desk.filesByZone).map((files) => files.map((f) => [f.docType, f.fileName])), [
    [['survey_plan', 'แปลนชั้น 1.jpg']], [['survey_plan', 'แปลนชั้น 1.jpg']], [['survey_plan', 'แปลนชั้น 2.jpg']],
  ]);
  assert.deepEqual(desk.zones[1].spots, [{ id: 'spot-drw-2a', label: 'ข้างเคาน์เตอร์แคชเชียร์', note: null, selected: true }]);
  assert.deepEqual(surveyReportFreezeIssues(desk), []);
  const deskSnap = buildSurveyReportSnapshot(desk, { mode: 'freeze' }).snapshot;
  assert.deepEqual(
    [deskSnap.assessment.mode, deskSnap.assessment.drawingZones, deskSnap.assessment.drawingBy, deskSnap.assessment.drawingAt],
    ['drawing', 3, [DRAWING_HEAD.name], '2026-10-09'],
  );
  // ไฟล์ต้นฉบับของไปป์ไลน์: ภาพแบบสามรูปเท่านั้น
  assert.deepEqual([...syntheticDriveFiles(s3Source('drawing')).keys()], ['drv-att-drw-z1-p1', 'drv-att-drw-z2-p1', 'drv-att-drw-z3-p1']);

  // Case B — ใบผสม: นัดของช่างยังเป็นนัดที่รับรอง · พื้นที่ 3 สลับ 09/10 แล้วหัวหน้าบันทึก 14/10
  const mixed = surveyReportInputsFromFixture(mixedSurveyFixture());
  assert.equal(mixed.visit.code, 'SV-26100011');
  assert.deepEqual([mixed.visit.actualDate, mixed.visit.actualStartTime, mixed.visit.actualEndTime], ['2026-10-13', '10:12', '11:48']);
  assert.deepEqual(mixed.otherVisits, []);
  assert.deepEqual(mixed.zones.map((z) => z.method), ['onsite', 'onsite', 'drawing']);
  assert.deepEqual([mixed.zones[2].methodChangedAt, mixed.zones[2].surveyedAt], ['2026-10-09T03:15:00.000+00:00', '2026-10-14T02:30:00.000+00:00']);
  assert.ok(mixed.zones[2].methodReason.length >= 10, 'เหตุผลอย่างน้อย 10 ตัวอักษร (กติกาของโมดัลสลับวิธี)');
  assert.deepEqual(surveyReportFreezeIssues(mixed), []);
  assert.equal(surveyReportInputsFromFixture(mixedSurveyFixture(), { drawingMethodEnabled: false }).drawingMethodEnabled, false);

  // ใบจากแบบล้วนที่มีนัดค้างในประวัติ: นัดไม่ถูกรับรอง — ไปอยู่ `otherVisits` (นัดที่ทำไม่ได้อยู่ใต้ priorUnable ตามเดิม)
  const withVisits = surveyReportInputsFromFixture({
    ...drawingSurveyFixture(),
    visits: [
      { code: 'SV-1', status: 'unable', scheduledDate: '05/10/2026', actualDate: '05/10/2026', unableReason: 'ร้านปิดปรับปรุง' },
      { code: 'SV-2', status: 'done', scheduledDate: '06/10/2026', actualDate: '07/10/2026', assigneeName: 'ช่าง' },
      { code: 'SV-3', status: 'cancelled', scheduledDate: '08/10/2026' },
    ],
  });
  assert.equal(withVisits.visit, null);
  assert.deepEqual(withVisits.priorUnable, [{ date: '2026-10-05', reason: 'ร้านปิดปรับปรุง' }]);
  assert.deepEqual(withVisits.otherVisits, [
    { code: 'SV-2', status: 'done', date: '2026-10-07', planned: false },
    { code: 'SV-3', status: 'cancelled', date: '2026-10-08', planned: true },
  ]);
});

test('ชุดสุดขอบของงวด S3: ต่อท้ายเท่านั้น (กรณีเดิมไม่ขยับ กรณีแรกยังอยู่แรก) · ทุกกรณีตรึงได้/ร่างได้ ไม่มีหน้าล้น · พื้นที่จากแบบไม่มีภาพกว้าง/รูปจุด', () => {
  const cases = surveyStressCases();
  assert.deepEqual(cases.map((c) => c.name), [
    'stress', 'mix3', 'mix4', 'mix2d', 'limit10', 'limit9', 'sendback', 'tallhead', 'noplan',
    'drawing-draft', 'drawing-added', 'drawing-presaved', 'drawing-ten', 'mixed-names', 'drawing-spots', 'drawing-parts',
    'drawing-longname',
  ]);
  // กรณีเดิม (ลงหน้างานล้วน): อินพุตไม่มีคีย์ของงวด S3 — กระดาษต้องเท่ากับของ main (สเปก §5.3 ขั้น 1)
  for (const c of cases.slice(0, 9)) {
    const inputs = stressSurveyInputs(c.spec);
    assert.equal('otherVisits' in inputs || 'drawingMethodEnabled' in inputs || 'surveyConfirm' in inputs.request, false, c.name);
    assert.ok(inputs.zones.every((z) => !('method' in z)), c.name);
  }
  for (const c of cases.slice(9)) {
    const inputs = stressSurveyInputs(c.spec);
    const drawing = inputs.zones.filter((z) => z.method === 'drawing');
    assert.ok(drawing.length > 0, c.name);
    for (const z of drawing) {
      assert.ok(inputs.filesByZone[z.id].every((f) => f.docType === 'survey_plan'), `${c.name}: พื้นที่จากแบบมีแต่ภาพแบบ`);
    }
    const desk = drawing.length === inputs.zones.filter((z) => z.status !== 'cut').length;
    assert.equal(inputs.visit === null, desk, `${c.name}: ใบจากแบบล้วนไม่มีนัดให้รับรอง`);
    const built = buildSurveyReportSnapshot(inputs, { mode: c.mode });
    assert.ok(built.snapshot, `${c.name}: ${JSON.stringify(built.errors)}`);
    for (const version of ['customer', 'internal']) {
      assert.deepEqual(paginateSurveyReport(surveyReportView(built.snapshot, { version })).overflow, [], `${c.name}/${version}`);
    }
  }
  // ใบจากแบบที่ยังไม่ส่งผล: ไม่มีวันที่ส่ง ไม่มีคำตอบ — ภาพนิ่งโหมดร่างเท่านั้น
  const draft = stressSurveyInputs(cases.find((c) => c.name === 'drawing-draft').spec);
  assert.deepEqual([draft.request.answeredAt, draft.request.surveyConfirm, draft.takenAt], [null, null, '2026-10-09T06:00:00.000+00:00']);
  assert.ok(buildSurveyReportSnapshot(draft, { mode: 'freeze' }).errors.length > 0);
  // ช่างบันทึกก่อนหัวหน้าสลับ ไม่มีใครบันทึกใหม่: เวลาสลับหลังเวลาบันทึก · ผู้บันทึกเป็นช่าง
  const presaved = stressSurveyInputs(cases.find((c) => c.name === 'drawing-presaved').spec).zones[1];
  assert.ok(Date.parse(presaved.methodChangedAt) > Date.parse(presaved.surveyedAt));
  assert.equal(presaved.surveyedByName, 'Crew Saver');
  // ผู้ประเมินจากแบบสามคน ชื่อยาว — คนละบัญชี
  const names = stressSurveyInputs(cases.find((c) => c.name === 'mixed-names').spec).zones.filter((z) => z.method === 'drawing');
  assert.equal(new Set(names.map((z) => z.surveyedById)).size, 3);
  assert.throws(() => stressSurveyInputs({ base: 'nope' }), /ไม่มีชุดตั้งต้น "nope"/);
});

test('harness: `--synthetic <ชุด>` · `--drawing-method` · ตาราง SURVEY_GOLDEN (ใบลงหน้างานไม่มีแถว "วิธีประเมิน") · กระดาษของ mixed / drawing ผ่านข้อของตัวเอง', () => {
  assert.equal(syntheticOf(true).name, 'onsite');
  assert.equal(syntheticOf('onsite').fixture, syntheticSurveyFixture);
  assert.equal(syntheticOf('mixed').fixture, mixedSurveyFixture);
  assert.equal(syntheticOf('drawing').fixture, drawingSurveyFixture);
  assert.throws(() => syntheticOf('desk'), /--synthetic ไม่รู้จักชุด "desk" — มี: onsite · mixed · drawing/);

  const twinZones = surveyReportInputsFromFixture(syntheticSurveyFixture()).zones;
  const deskZones = s3Source('drawing').zones;
  assert.equal(drawingMethodOf({}, twinZones), false);
  assert.equal(drawingMethodOf({}, deskZones), true, 'ใบที่มีพื้นที่จากแบบ = สวิตช์เปิด (แถวแบบนั้นเกิดได้เฉพาะตอนเปิด)');
  assert.equal(drawingMethodOf({ 'drawing-method': 'off' }, deskZones), false);
  assert.equal(drawingMethodOf({ 'drawing-method': 'on' }, twinZones), true);
  assert.throws(() => drawingMethodOf({ 'drawing-method': true }, twinZones), /--drawing-method ต้องเป็น on หรือ off/);

  assert.deepEqual(Object.keys(SURVEY_GOLDEN), ['onsite', 'mixed', 'drawing']);
  assert.deepEqual(SURVEY_GOLDEN.onsite.pages, { customer: 4, internal: 6 }, 'ใบลงหน้างาน: ค่าเดิมของ main');
  assert.throws(() => goldenFailures([], 'SU-1', 'nope'), /ไม่มีผลที่ล็อกของ fixture "nope"/);

  // ใบลงหน้างาน: ผ่าน · แถว "วิธีประเมิน" ที่โผล่มา = ล้ม (มติ O3 = ข)
  const onsite = papersOf(surveyReportInputsFromFixture(syntheticSurveyFixture()), 'SU-26090001-0');
  assert.deepEqual(goldenFailures(onsite, 'SU-26090001-0'), []);
  const leaked = onsite.map((p) => ({ ...p, html: p.html.replace('</main>', '<dl><dt>วิธีประเมิน</dt><dd>ลงหน้างาน</dd></dl></main>') }));
  assert.match(goldenFailures(leaked, 'SU-26090001-0').join('\n'), /customer: แถว "วิธีประเมิน" ต้องมี 0 แถว — พบ 1/);

  // ใบผสม: ทุกข้อของแถว mixed ผ่าน (5 / 7 หน้า · ยอดรวม · บรรทัดในกล่อง · หมายเหตุ · พื้นที่ 3 ไม่มีส่วนภาพกว้าง · วันที่)
  assert.deepEqual(goldenFailures(papersOf(surveyReportInputsFromFixture(mixedSurveyFixture()), 'SU-26100004-0'), 'SU-26100004-0', 'mixed'), []);
  /* ใบจากแบบล้วน: ทั้งสองฉบับผ่านทุกข้อ — ลูกค้า 5 หน้า (พื้นที่หน้า 2, 3, 4) · ภายใน 8 หน้า (มติเจ้าของ 19/10/2026: ตารางหน้า 1 ต่อหน้า 2
     พื้นที่จึงอยู่หน้า 3, 4, 5) · ยอดรวม · ขนาดรวมสองบรรทัด · เวลา "—" · วันที่ 09/10 · ไม่มีภาพกว้าง */
  const desk = papersOf(surveyReportInputsFromFixture(drawingSurveyFixture()), 'SU-26100003-0');
  assert.deepEqual(goldenFailures(desk, 'SU-26100003-0', 'drawing'), []);
  assert.deepEqual(SURVEY_GOLDEN.drawing.pages, { customer: 5, internal: 8 });
  assert.deepEqual(SURVEY_GOLDEN.drawing.zonePage, { customer: [2, 3, 4], internal: [3, 4, 5] });
  // ตารางล็อกรายฉบับจับแผนที่ขยับได้จริง (ฉบับภายใน 9 หน้า · พื้นที่หน้า 4, 5, 6 = ล้ม ไม่ผ่านเงียบ)
  const deskInternal = desk.find((p) => p.version === 'internal');
  const shifted = { ...deskInternal, layout: { ...deskInternal.layout, pageCount: 9, zonePage: { 1: 4, 2: 5, 3: 6 } } };
  assert.deepEqual(goldenFailures([shifted], 'SU-26100003-0', 'drawing'), [
    'ฉบับภายในต้อง 8 หน้า — ได้ 9',
    'internal: คอลัมน์ "หน้า" ต้องเป็น 3, 4, 5 — ได้ {"1":4,"2":5,"3":6}',
  ]);
  // ตัวเลขของฉบับลูกค้าใช้กับฉบับภายในไม่ได้ (ล็อกรายฉบับจริง ไม่ใช่ค่าเดียวสองฉบับ)
  assert.match(goldenFailures([{ ...deskInternal, version: 'customer' }], 'SU-26100003-0', 'drawing').join('\n'), /ฉบับลูกค้าต้อง 5 หน้า — ได้ 8/);
  // ข้อของ fixture อื่นจับกระดาษผิดชุดได้จริง
  assert.match(goldenFailures(desk, 'SU-26100003-0', 'mixed').join('\n'), /รวม ตร\.ม\. ต้อง 273 — ได้ 174/);
});

test('⭐ ไปป์ไลน์ของ fixture งวด S3 (ตัวพิมพ์ปลอม): ใบผสม / ใบจากแบบล้วน · ทั้งสองทาง · รอบสอง reused · ที่นั่งที่ 1 ตามมติ O1', async (t) => {
  quiet(t);
  for (const name of ['mixed', 'drawing']) {
    for (const via of ['issue_only', 'send']) {
      const label = `${name}/${via}`;
      const world = s3World(name);
      const run = await runSurveyPipeline(world, { via, clock: clockS3, loadRenderer: fakeRenderer().load, drawingMethodEnabled: true });
      assert.deepEqual(run.states, ['missing', 'issued', 'ready'], label);
      assert.equal(run.docNo, 'SU-26100001-0', label);
      assert.equal(run.second.issue.reused, true, label);
      assert.deepEqual(run.second.paper.captured, [], label);
      assert.deepEqual(pipelineFailures(world, run), [], label);
      const row = world.reports()[0];
      const signs = row.snapshot.signatures;
      if (name === 'mixed') {
        // ใบผสม = กติกาของใบลงหน้างาน: ผู้ประเมินบนนัด · ผู้ส่งผล — สองคน สองไฟล์
        assert.deepEqual([signs.assessor.userId, signs.approver.userId], ['U-phuwadol', DRAWING_HEAD.id], label);
        assert.equal(world.signatures.vault.downloads.length, 2, label);
        assert.equal(row.images.filter((img) => img.kind !== 'sign').length, 10, `${label}: ภาพกว้าง 4 · ผัง/ภาพแบบ 3 · รูปจุด 3 — พื้นที่ 3 มีแต่ภาพแบบ`);
      } else {
        // ใบจากแบบล้วน: หัวหน้าคนเดียวกรอกผลและส่ง ⇒ ที่นั่งที่ 1 ได้ลายเซ็นเดียวกับที่นั่งที่ 2 (ไฟล์เดียว อ่านคลังครั้งเดียว)
        assert.deepEqual([signs.assessor.userId, signs.approver.userId], [DRAWING_HEAD.id, DRAWING_HEAD.id], label);
        assert.equal(signs.assessor.img.sha, signs.approver.img.sha, label);
        assert.equal(world.signatures.vault.downloads.length, 1, label);
        assert.deepEqual(row.images.map((img) => img.kind).sort(), ['plan', 'plan', 'plan', 'sign'], label);
        assert.deepEqual([...world.drive.fetched.values()], [1, 1, 1], `${label}: ภาพแบบสามไฟล์ ไฟล์ละครั้ง`);
      }
      assert.equal(row.customerHtml.split('<img class="sig-img" src="su-img:').length - 1, 2, label);
      assert.equal(run.audits[0].after.signCount, 2, label);
      const papers = pipelinePapers(world, run);
      assert.deepEqual(goldenFailures(papers, run.docNo, name), [], label);
    }
  }
});

test('ไปป์ไลน์ + กรณีลายเซ็นของงวด S3 (`--pipeline --case`): หัวหน้าอีกคนกรอกผลจากแบบ = ที่นั่งที่ 1 ไม่ตรึงลายเซ็น พิมพ์คำ · `pipelineFailures` จับที่นั่งผิดได้', async (t) => {
  quiet(t);
  assert.throws(() => pipelineSignCase('sign-wrap'), /--pipeline --case ใช้ได้กับ sign-drawing · sign-drawing-other · sign-mixed — ได้ "sign-wrap"/);
  for (const name of ['sign-drawing', 'sign-drawing-other', 'sign-mixed']) {
    const { label, source, signed } = pipelineSignCase(name);
    assert.equal(label, name);
    assert.equal('imageByAttId' in source, false, 'ไปป์ไลน์ย่อรูปเองด้วย sharp');
    for (const via of ['issue_only', 'send']) {
      const world = surveyPipelineWorld(source, { files: syntheticDriveFiles(source), clock: clockS3, signed });
      const run = await runSurveyPipeline(world, { via, clock: clockS3, loadRenderer: fakeRenderer().load, drawingMethodEnabled: true });
      assert.deepEqual(pipelineFailures(world, run), [], `${name}/${via}`);
      const row = world.reports()[0];
      if (name !== 'sign-drawing-other') continue;
      assert.deepEqual(world.signatures.signers, { assessor: null, approver: DRAWING_HEAD.id });
      assert.equal(row.snapshot.signatures.assessor, null);
      assert.equal(run.audits[0].after.signCount, 1);
      assert.equal(row.customerHtml.split('<img class="sig-img" src="su-img:').length - 1, 1);
      assert.equal(row.customerHtml.split('<div class="sig-e">ลายเซ็นอิเล็กทรอนิกส์</div>').length - 1, 1);
      // ที่นั่งที่คาดว่าไม่มีลายเซ็นแต่ภาพนิ่งตรึงไว้ (หรือกลับกัน) = ล้มพร้อมชื่อที่นั่ง
      world.signatures.signers.assessor = DRAWING_HEAD.id;
      assert.match(pipelineFailures(world, run).join('\n'), /ที่นั่ง assessor ต้องตรึงลายเซ็นของ U-arnon พร้อมรูป/);
    }
  }
});

test('ตรวจอินพุต (งวด S3): บรรทัดวิธีประเมินทุกใบ · `--drawing-method on|off` ส่งตรง (หางของบรรทัดไม่พบนัด) · นัดที่บล็อกการส่งพิมพ์เหตุบรรทัดถัดไป · ไม่มีธง hold', async () => {
  // บรรทัดวิธีประเมิน
  const twinWorld = worldOf();
  const plain = await checkSurveyReportInputs(readOnlyClient(twinWorld.supabase), { request: twinWorld.request(), now: NOW });
  assert.deepEqual(plain.method, { onsite: 2, drawing: 0 });
  assert.match(reportLines(plain).join('\n'), /วิธีประเมิน: ลงหน้างาน 2 · จากแบบ 0/);
  const deskWorld = s3World('drawing');
  const desk = await checkSurveyReportInputs(readOnlyClient(deskWorld.supabase), { request: deskWorld.request(), now: NOW_S3, signers: true });
  assert.equal(desk.error, null);
  assert.deepEqual(desk.method, { onsite: 0, drawing: 3 });
  assert.deepEqual(desk.issues, { content: [], system: [] });
  assert.equal(desk.verdict.refusedByDocument, null);
  assert.equal('signHold' in desk, false, 'ข้อกันเอกสารของใบจากแบบถูกถอดแล้ว');
  const deskText = reportLines(desk).join('\n');
  assert.match(deskText, /วิธีประเมิน: ลงหน้างาน 0 · จากแบบ 3/);
  assert.match(deskText, /ผู้ลงนาม \(กติกาลายเซ็นจริง\):\n/);
  assert.doesNotMatch(deskText, /ยังออกเอกสารไม่ได้/);
  untouched(deskWorld);

  // ไม่มีนัดเลย: สวิตช์ปิด = ประโยคเดิม · เปิด = ประโยคเดิม + หาง (สคริปต์ไม่อ่านสวิตช์เอง)
  const noVisit = unsentWorld();
  noVisit.tables.service_visits.length = 0;
  const off = await checkSurveyReportInputs(readOnlyClient(noVisit.supabase), { request: noVisit.request(), now: NOW });
  assert.ok(off.issues.content.includes(NO_VISIT), JSON.stringify(off.issues));
  const on = await checkSurveyReportInputs(readOnlyClient(noVisit.supabase), { request: noVisit.request(), now: NOW, drawingMethodEnabled: true });
  assert.ok(on.issues.content.includes(`${NO_VISIT}${NO_VISIT_TAIL}`), JSON.stringify(on.issues));
  const run = async (argv) => {
    const lines = [];
    const exit = await checkMain({ argv, supabase: noVisit.supabase, log: (line) => lines.push(line), now: NOW });
    return { exit, text: lines.join('\n') };
  };
  const switched = await run(['RQ-AS-26090186', '--drawing-method', 'on']);
  assert.equal(switched.exit, 0, 'ค่า on ไม่ใช่ชื่อใบ');
  assert.ok(switched.text.includes(`${NO_VISIT}${NO_VISIT_TAIL}`));
  const defaults = await run(['RQ-AS-26090186']);
  assert.ok(defaults.text.includes(NO_VISIT) && !defaults.text.includes(NO_VISIT_TAIL), 'ค่าตั้งต้น off');
  assert.equal((await run(['RQ-AS-26090186', '--drawing-method', 'maybe'])).exit, 2);
  assert.equal((await run(['RQ-AS-26090186', '--drawing-method'])).exit, 2);
  untouched(noVisit);

  // นัดที่บล็อกการส่ง: ร่าง (ใบลงหน้างาน) และนัดที่ยังเปิดบนใบจากแบบล้วน — เหตุจริงอยู่บรรทัดถัดไป ไม่ใช่ "เป็นร่าง" ทุกกรณี
  const draft = await checkSurveyReportInputs(readOnlyClient(unsentWorld({ visitStatus: 'draft' }).supabase), {
    request: unsentWorld({ visitStatus: 'draft' }).request(), now: NOW,
  });
  const draftText = reportLines(draft).join('\n');
  assert.ok(draftText.includes(`นัดที่ยังเปิด: SV-26090013 → บล็อกการส่งผล — เหตุอยู่บรรทัดถัดไป\n    ✗ ${draft.visit.error}`), draftText);
  assert.match(draft.visit.error, /ยังเป็นร่าง/);
  const heldDesk = s3World('drawing');
  Object.assign(heldDesk.request(), { answeredAt: null, answeredById: null, answeredByName: null, status: 'in_progress', surveyConfirm: null });
  heldDesk.tables.service_visits.push({
    id: 'SVV-open', requestId: heldDesk.request().id, code: 'SV-26100099', status: 'scheduled', scheduledDate: '2026-10-12',
    actualDate: null, startTime: '10:00', endTime: null, actualStartTime: null, actualEndTime: null, actualEndDate: null,
    assigneeId: null, assigneeName: null, assistantIds: [], unableReason: null, createdAt: '2026-10-08T02:00:00.000+00:00',
  });
  const blocked = await checkSurveyReportInputs(readOnlyClient(heldDesk.supabase), { request: heldDesk.request(), now: NOW_S3 });
  assert.equal(blocked.visit.action, 'block');
  const blockedText = reportLines(blocked).join('\n');
  assert.ok(blockedText.includes(`SV-26100099 → บล็อกการส่งผล — เหตุอยู่บรรทัดถัดไป\n    ✗ ${blocked.visit.error}`), blockedText);
  assert.match(blocked.visit.error, /ใบนี้ประเมินจากแบบทั้งใบ แต่นัด SV-26100099 ยังเปิดอยู่/);
  assert.doesNotMatch(blockedText, /เป็นร่าง — ส่งผลไม่ได้/);
  const summary = summaryLines([draft, blocked]).join('\n');
  assert.match(summary, /วันนี้ก็ส่งไม่ได้ \(ติดด่านเดิม · นัดที่ยังเปิดบล็อกการส่ง\): 2/);
  untouched(heldDesk);
});

test('🔴 ตรวจอินพุต `--r0` (สเปก S3 §4): จำนวนแถวเอกสาร · มีเลขแต่ยังไม่ตรึง · ใบที่ส่งแล้วมีพื้นที่จากแบบแต่ไม่มีแถว · รายละเอียดของใบที่ขอ — อ่านอย่างเดียว', async () => {
  assert.deepEqual([...R0_DEFAULT_REFS], ['RQ-AS-26090217', 'RQ-AS-26100312', 'SU-26100001-0']);
  assert.equal(R0_REPORT_LIMIT, 1000);

  // ใบจากแบบที่ส่งผลแล้วแต่ยังไม่มีแถวเอกสาร (ใบที่ติดข้อกันของ S2b) — พร้อมภาพแบบรายพื้นที่และคำตอบ
  const world = s3World('drawing');
  const client = readOnlyClient(world.supabase);
  const held = await releaseCheckR0(client, { refs: ['RQ-AS-26100345'] });
  assert.equal(held.error, null);
  assert.deepEqual(held.reports, { count: 0, capped: false, unfrozen: [] });
  assert.deepEqual(held.held, [{
    docNo: 'RQ-AS-26100345', id: 'DR-drawing-0345', surveyConfirm: 'needed',
    plans: [
      { zone: 'พื้นที่ 1 โถงต้อนรับ', files: [{ fileName: 'แปลนชั้น 1.jpg', mimeType: 'image/jpeg' }] },
      { zone: 'พื้นที่ 2 โซนขายหน้าร้าน', files: [{ fileName: 'แปลนชั้น 1.jpg', mimeType: 'image/jpeg' }] },
      { zone: 'พื้นที่ 3 ห้องน้ำลูกค้า', files: [{ fileName: 'แปลนชั้น 2.jpg', mimeType: 'image/jpeg' }] },
    ],
  }]);
  assert.deepEqual(held.sheets[0].zones.map((z) => z.method), ['drawing', 'drawing', 'drawing']);
  assert.deepEqual([held.sheets[0].visits, held.sheets[0].reports], [[], []]);
  const heldText = r0Lines(held).join('\n');
  assert.match(heldText, /ใบที่ส่งผลแล้ว มีพื้นที่ประเมินจากแบบ และยังไม่มีแถวเอกสาร: 1/);
  assert.match(heldText, /RQ-AS-26100345 · ต้องยืนยันหน้างาน\n {6}พื้นที่ 1 โถงต้อนรับ: แปลนชั้น 1\.jpg \(image\/jpeg\)/);
  assert.match(heldText, /พื้นที่: พื้นที่ 1 โถงต้อนรับ — ประเมินจากแบบ/);

  /* ใบที่เคยได้เลขรอบก่อน (ดึงผลกลับ ⇒ แถว `superseded`) แล้วส่งใหม่ระหว่างข้อกัน = ใบที่ติด — รอบปัจจุบันยังไม่มีเอกสาร
     (เดิมแถว superseded แถวเดียวก็ทำให้ใบหลุดรายการ ⇒ กดออกเอกสารครั้งแรกได้กระดาษจากแบบถาวรที่ไม่มีใครอ่านก่อน) */
  world.tables.service_survey_reports.push({
    id: 'SVR-old-0', requestId: world.request().id, docNo: 'SU-26090007-0', status: 'superseded', frozenAt: '2026-09-20T03:00:00.000+00:00',
    issuedAt: '2026-09-20T03:00:00.000+00:00', customerHtml: null, internalHtml: null, snapshot: { v: 1 },
  });
  const resent = await releaseCheckR0(client, { refs: [] });
  assert.equal(resent.reports.count, 1);
  assert.deepEqual(resent.held.map((sheet) => sheet.docNo), ['RQ-AS-26100345']);
  world.tables.service_survey_reports.splice(0);
  // ยังไม่ได้ตอบเรื่องยืนยันหน้างาน — คำเดียวกันทั้งรายการใบที่ติดและรายละเอียดรายใบ
  const unanswered = r0Lines({
    error: null, reports: { count: 0, capped: false, unfrozen: [] }, heldCapped: false,
    held: [{ docNo: 'RQ-X', id: 'X', surveyConfirm: null, plans: [] }],
    sheets: [{ ref: 'RQ-X', docNo: 'RQ-X', id: 'X', answered: true, cancelled: false, status: 'answered', surveyConfirm: null, zones: [], visits: [], reports: [] }],
  }).join('\n');
  assert.equal(unanswered.split('ยังไม่ได้เลือกว่าต้องยืนยันหน้างานไหม').length - 1, 2, unanswered);
  assert.doesNotMatch(unanswered, /ไม่ได้เลือกเรื่องยืนยันหน้างาน/);

  // มีแถวเอกสารแล้ว (มีเลข ยังไม่ตรึงกระดาษ): ไม่ใช่ใบที่ติด · ขึ้นในรายการ "ยังไม่ตรึง" · หาใบจากเลขที่ SU- ได้
  world.tables.service_survey_reports.push({
    id: 'SVR-real-1', requestId: world.request().id, docNo: 'SU-26100001-0', status: 'current', frozenAt: null,
    issuedAt: '2026-10-09T07:21:00.000+00:00', customerHtml: null, internalHtml: null, snapshot: { v: 1 },
  });
  const numbered = await releaseCheckR0(client, { refs: ['SU-26100001-0', 'SU-26109999-0'] });
  assert.deepEqual(numbered.reports, {
    count: 1, capped: false,
    unfrozen: [{ docNo: 'SU-26100001-0', requestId: 'DR-drawing-0345', status: 'current', issuedAt: '2026-10-09T07:21:00.000+00:00' }],
  });
  assert.deepEqual(numbered.held, []);
  assert.equal(numbered.sheets[0].docNo, 'RQ-AS-26100345');
  assert.deepEqual(numbered.sheets[0].reports, [{ docNo: 'SU-26100001-0', status: 'current', frozen: false }]);
  assert.equal(numbered.sheets[1].error, 'ไม่พบเอกสาร SU-26109999-0');
  const numberedText = r0Lines(numbered).join('\n');
  assert.match(numberedText, /มีเลขแต่ยังไม่ตรึงกระดาษ: 1\n {4}SU-26100001-0 · current · ออก 09\/10\/2026/);
  assert.match(numberedText, /RQ-AS-26100345 \(จาก SU-26100001-0\) · ส่งผลแล้ว/);
  assert.match(numberedText, /แถวเอกสาร: SU-26100001-0 current · ยังไม่ตรึง/);
  assert.match(numberedText, /❌ SU-26109999-0: ไม่พบเอกสาร SU-26109999-0/);
  // แถวเอกสารถึงเพดาน = บอกให้เห็นว่าอาจไม่ครบ
  const capped = await releaseCheckR0(client, { refs: [], limit: 1 });
  assert.equal(capped.reports.capped, true);
  assert.match(r0Lines(capped).join('\n'), /ถึงเพดาน 1000 — อาจมีมากกว่านี้/);

  // ใบผสม: นัดทุกใบพร้อมสถานะและวันที่
  const mixedWorld = s3World('mixed');
  const mixed = await releaseCheckR0(readOnlyClient(mixedWorld.supabase), { refs: ['RQ-AS-26100352'] });
  assert.deepEqual(mixed.sheets[0].visits, [{ code: 'SV-26100011', status: 'done', date: '2026-10-13' }]);
  assert.deepEqual(mixed.sheets[0].zones.map((z) => z.method), ['onsite', 'onsite', 'drawing']);
  assert.match(r0Lines(mixed).join('\n'), /นัด: SV-26100011 done 13\/10\/2026/);

  // `main --r0` — ไม่ระบุใบ = สามใบของสเปก (ใบที่ไม่มีในโลกนี้ได้บรรทัด ❌ ของตัวเอง ไม่ล้มทั้งรายการ) · `--json`
  const lines = [];
  assert.equal(await checkMain({ argv: ['--r0'], supabase: world.supabase, log: (line) => lines.push(line), now: NOW_S3 }), 0);
  for (const ref of R0_DEFAULT_REFS.slice(0, 2)) assert.match(lines.join('\n'), new RegExp(`❌ ${ref}: ไม่พบใบคำร้อง`));
  assert.match(lines.join('\n'), /RQ-AS-26100345 \(จาก SU-26100001-0\)/);
  const json = [];
  await checkMain({ argv: ['--r0', 'RQ-AS-26100345', '--json'], supabase: world.supabase, log: (line) => json.push(line), now: NOW_S3 });
  assert.equal(JSON.parse(json.join('\n')).sheets[0].docNo, 'RQ-AS-26100345');
  untouched(world);
  untouched(mixedWorld);
});

/* ══ เอกสารของงาน ═══════════════════════════════════════════════════════ */

test('docs: สถานะใช้หนึ่งในห้าคำ · เอ่ยถึงสคริปต์ทั้งสาม · มาตรฐานเอกสาร siteSurvey เป็นของ PR-3 (มติ 28)', () => {
  const WORDS = ['รอดำเนินการ', 'กำลังดำเนินการ', 'รอตรวจ', 'เสร็จสมบูรณ์', 'ระงับ'];
  const doc = readFileSync(join(WEBAPP, '..', 'docs', 'survey-report-doc.md'), 'utf8');
  const status = /^> สถานะ: \*\*([^*]+)\*\*/m.exec(doc)?.[1];
  assert.ok(WORDS.includes(status), `สถานะหัวไฟล์ "${status}"`);
  for (const name of ['check-doc-tracing.mjs', 'check-survey-report-inputs.mjs', '--pipeline', 'SURVEY_REPORT_ISSUE_AT_SEND']) {
    assert.ok(doc.includes(name), name);
  }
  const index = readFileSync(join(WEBAPP, '..', 'docs', 'INDEX.md'), 'utf8');
  const row = index.split('\n').find((line) => line.startsWith('| [survey-report-doc.md]'));
  assert.ok(row, 'docs/INDEX.md ต้องมีแถวของ survey-report-doc.md');
  assert.ok(WORDS.includes(row.trim().replace(/\|$/, '').split('|').pop().trim()), 'คอลัมน์สถานะของแถวใน INDEX');
  assert.match(row, /PR-2/);

  const migration = raw('supabase/migrations/0401_survey_report_documents.sql');
  const seed = migration.slice(migration.indexOf('-- ── ⑦'), migration.indexOf("VALUES ('siteSurvey')"));
  assert.match(seed, /PR-3/);
  assert.doesNotMatch(seed, /PR-2 เป็นคนเติม|PR-2 เติมคีย์/);
  assert.equal(SURVEY_REPORT_STANDARD_KEY, 'siteSurvey');
});
