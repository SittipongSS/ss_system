// ── ประเมินจากแบบ งวด S5 (ใบยืนยันหน้างาน): ยามซอร์สข้ามไฟล์ของงวด — สเปก S5 §6.2 · ไฟล์ของ Integrate ──────────────
//
// ⭐ งวด S5 สร้างพร้อมกันหกกลุ่มไฟล์ (A–F) + ส่วนกลาง — กติกาที่ **ไม่มีกลุ่มไหนเป็นเจ้าของคนเดียว** ถูกล็อกไว้ที่นี่:
//   ① คอลัมน์ `surveyConfirmOfId` ถูกเอ่ยชื่อใน **ลิสต์ปิดแปดไฟล์ตรงตัว** (§2.6 a) · ไม่อยู่ในช่องที่แก้ได้ · ไม่มีใครเขียนทับหลังสร้าง
//   ② ประโยค "ยืนยันหน้างานแล้ว" มีที่เดียว (สองตัวประกอบประโยค) · ไม่มีไฟล์ใหม่ไหนพูด "ไม่ได้เข้าพื้นที่"
//   ③ สถานะรอยืนยันไม่ถูกเทียบค่าดิบนอกใบไม้ — ยกเว้นบรรทัดเดียวของ `unsoldCounts` (R7) ที่ต้องนับ 'confirming' ด้วย
//   ④ ดึงกลับ / "ยังไม่จบ" ไม่ถูกปฏิเสธเพราะใบยืนยัน (แผน §2 แถว 29)
//   ⑤ ลำดับในซอร์ส: ล็อกวิธี (R2) · กิ่งสร้างใบยืนยันก่อนอ่าน variant (R1) · ด่านตอนยื่นปิดเมื่ออ่านพัง (F4) · ตะขอหลัง commit (F13)
//   ⑥ คีย์ใหม่บนก้อนเดิมมาทาง conditional spread เท่านั้น (R-KEYS — ยามโกลเดน) · แถบแจ้งไม่รู้จักคนดู
//   ⑦ โมดูลที่ดึงได้: ตัวอ่านของงวดดึงกระดาษได้แค่คู่เบา (R9) · `surveyConfirmLink.js` ถึงเบราว์เซอร์ ⇒ ลิสต์ปิด (§2.1)
//   ⑧ `?confirms=` ถูกตรวจรูปก่อนกลายเป็น path ของ API (F14)
//
// ⚠️ ยามของงวดที่อยู่ใน `surveyMethodGuards.test.mjs` (รูปลิสต์อนุญาตของ ① · (b) (c) (d) · ตะเข็บ C) **ไม่ถูกแก้ซ้ำ** — ไฟล์นี้ถือ
//    รูปตรงตัว (deepEqual) ของ ① เท่านั้น ตามสเปก F18
// ⚠️ อ่านซอร์สเป็นข้อความหลังตัดคอมเมนต์ — ⛔ สตริง/regex ในไฟล์นี้ห้ามมีทับตามด้วยดอกจันติดกัน
//    (ตัวตัดคอมเมนต์ของยามตัวอื่นจะกลืนโค้ดตั้งแต่จุดนั้น)
// ⚠️ ยามตรวจ **ข้อความ** จึงจับได้แค่รูปที่รู้จัก — พฤติกรรมจริงอยู่ใน `surveyConfirm*.test.mjs` ของแต่ละกลุ่ม
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUEST_EDIT_PATCH_FIELDS } from '../requests/requestEdit.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = path.resolve(HERE, '../../..');
const SRC = path.join(WEBAPP, 'src');
const rel = (file) => path.relative(WEBAPP, file).split(path.sep).join('/');

const BLOCK_COMMENT = new RegExp('\\/\\*[\\s\\S]*?\\*\\/', 'g');
/* ตัดคอมเมนต์: บล็อก · ทั้งบรรทัด · ท้ายบรรทัดที่มีช่องว่างนำ (`https://` ในสตริงไม่โดน — นำด้วยโคลอน) */
const stripComments = (source) => source
  .replace(BLOCK_COMMENT, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const isTest = (file) => /\.test\.mjs$/.test(file) || /TestKit\.mjs$/.test(file);
/* โค้ดของแอปทุกไฟล์ (ไม่นับเทสต์/ชุดทดสอบ) หลังตัดคอมเมนต์ */
const APP = walk(SRC).filter((file) => !isTest(file)).map((file) => ({
  file: rel(file), code: stripComments(fs.readFileSync(file, 'utf8')),
}));
const hits = (pattern, { within = '' } = {}) => APP
  .filter(({ file, code }) => file.startsWith(within) && pattern.test(code))
  .map(({ file }) => file)
  .sort();
const code = (relative) => stripComments(fs.readFileSync(path.join(WEBAPP, relative), 'utf8'));
/* ตัวฟังก์ชัน (หลังตัดคอมเมนต์) จากบรรทัดประกาศถึง `}` ที่ต้นบรรทัดตัวแรก */
const bodyOf = (source, head) => {
  const start = source.indexOf(head);
  assert.ok(start >= 0, `ไม่พบ ${head}`);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end < 0 ? source.length : end + 2);
};
const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `ไม่พบ ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `ไม่พบ ${to} หลัง ${from}`);
  return source.slice(start, end);
};
const countOf = (source, needle) => source.split(needle).length - 1;

const LINK = 'src/lib/service/surveyConfirmLink.js';
const REPO = 'src/lib/service/surveyConfirmRepo.js';
const PLAN_ROUTE = 'src/app/api/sa/requests/[id]/confirm-plan/route.js';
const REQUESTS_ROUTE = 'src/app/api/sa/requests/route.js';
const REQUEST_ROUTE = 'src/app/api/sa/requests/[id]/route.js';
const SHEET_ROUTE = 'src/app/api/service/surveys/[id]/route.js';
const SEND_ROUTE = 'src/app/api/service/surveys/[id]/send/route.js';
const RECALL_ROUTE = 'src/app/api/service/surveys/[id]/recall/route.js';
const CUSTOMER_ZONES_ROUTE = 'src/app/api/service/customers/[customerId]/zones/route.js';
const ZONE_REGISTRY = 'src/lib/service/zoneRegistry.js';
const SURVEY_JOB = 'src/lib/service/surveyJob.js';
const NEW_PAGE = 'src/app/requests/new/page.js';

/* ═══ ① คอลัมน์ลิงก์ ═══════════════════════════════════════════════════════════════════════════ */

test('① surveyConfirmOfId: เอ่ยชื่อในลิสต์ปิดแปดไฟล์ตรงตัว (§2.6 a) — ตัวประกอบประโยคกับทุกจอไม่รู้จักคอลัมน์ (F7)', () => {
  const SURVEY_CONFIRM_OF_FILES = [
    REPO, ZONE_REGISTRY, REQUESTS_ROUTE, REQUEST_ROUTE, SHEET_ROUTE, SEND_ROUTE, RECALL_ROUTE, CUSTOMER_ZONES_ROUTE,
  ];
  assert.deepEqual(hits(/\bsurveyConfirmOfId\b/), [...SURVEY_CONFIRM_OF_FILES].sort());
  assert.equal(hits(/\bsurveyConfirmOfId\b/).includes(LINK), false);
});

test('① surveyConfirmOfId เขียนครั้งเดียวตอนสร้างร่าง: ไม่อยู่ในช่องที่แก้ได้ · ไม่อยู่ใน requestPayload · ไม่มี .update( ไหนเขียน', () => {
  assert.equal(REQUEST_EDIT_PATCH_FIELDS.includes('surveyConfirmOfId'), false);
  assert.equal(/\bsurveyConfirmOfId\b/.test(bodyOf(code('src/lib/master/requestCreate.js'), 'export function requestPayload(')), false);
  assert.equal(/\bsurveyConfirmOfId\b/.test(code('src/lib/master/requestCreate.js')), false);
  // ไม่มีคำสั่ง update ที่พกคีย์นี้ · ไม่มี patch ที่ตั้งคีย์นี้
  assert.deepEqual(hits(/\.update\(\s*\{[^)]*\bsurveyConfirmOfId\b/), []);
  // ⚠️ regex ข้างบนหยุดที่ ')' ตัวแรก — `update({ updatedAt: new Date().toISOString(), surveyConfirmOfId: null })` หลุด (รอบแก้ S5)
  //    ⇒ ตรึงที่ตัวคีย์ของ object literal เอง ไม่ขึ้นกับวงเล็บ: คีย์ชื่อนี้มีไฟล์เดียวทั้งแอป (แถวหัวของร่างใน POST)
  //    (select/.eq ใช้ชื่อเป็นสตริงที่ไม่มี ':' ตาม · zoneRegistry เขียน `confirmOfId:`) · upsert ไม่มีสิทธิ์พกคีย์นี้เลย
  assert.deepEqual(hits(/\bsurveyConfirmOfId['"]?\s*:/), [REQUESTS_ROUTE]);
  assert.deepEqual(hits(/\.upsert\([^;]*\bsurveyConfirmOfId\b/), []);
  assert.deepEqual(hits(/\b(?:patch|updates?|changes)\.surveyConfirmOfId\s*=/), []);
  assert.deepEqual(hits(/\b(?:patch|updates?|changes)\[\s*['"]surveyConfirmOfId['"]\s*\]\s*=/), []);
  // จุดเขียนจุดเดียว = แถวหัวของร่างใน POST (conditional spread — ใบธรรมดาได้แถวเท่าเดิม)
  assert.match(code(REQUESTS_ROUTE), /\.\.\.\(confirmOf \? \{ surveyConfirmOfId: confirmOf\.id \} : \{\}\),/);
  assert.equal(countOf(code(REQUESTS_ROUTE), 'surveyConfirmOfId:'), 1);
});

/* ═══ ② ประโยค ═══════════════════════════════════════════════════════════════════════════════ */

test('② "ยืนยันหน้างานแล้ว" มีไฟล์เดียว และอยู่ใน surveyConfirmSentLines กับ surveyConfirmBannerParts เท่านั้น', () => {
  assert.deepEqual(hits(/ยืนยันหน้างานแล้ว/), [LINK]);
  const source = code(LINK);
  const allowed = [
    bodyOf(source, 'export function surveyConfirmSentLines('),
    bodyOf(source, 'export function surveyConfirmBannerParts('),
  ];
  const total = countOf(source, 'ยืนยันหน้างานแล้ว');
  assert.ok(total > 0);
  assert.equal(allowed.reduce((n, part) => n + countOf(part, 'ยืนยันหน้างานแล้ว'), 0), total, 'ทุกจุดอยู่ในสองฟังก์ชันนี้');
});

test('② ไม่มีไฟล์ใหม่ของงวดไหนพูด "ไม่ได้เข้าพื้นที่" (คำต้องห้ามของแผน)', () => {
  for (const file of [LINK, REPO, PLAN_ROUTE]) {
    assert.equal(fs.readFileSync(path.join(WEBAPP, file), 'utf8').includes('ไม่ได้เข้าพื้นที่'), false, file);
  }
});

test('② ชนิดบรรทัด survey_confirm / survey_confirm_more บนเธรดคำร้อง เขียนจาก surveyConfirmRepo.js ที่เดียว', () => {
  const writers = hits(/['"]survey_confirm(?:_more)?['"]/).filter((f) => f !== 'src/lib/master/updateTypes.js');
  assert.deepEqual(writers, [REPO]);
  // ทะเบียนชนิด: ก้อนแรกยิงกระดิ่ง · ก้อนต่อเงียบ (R8)
  const types = code('src/lib/master/updateTypes.js');
  assert.match(types, /survey_confirm: \{ label: 'ใบยืนยันหน้างาน', color: 'var\(--blue\)', narrative: true \},/);
  assert.match(types, /survey_confirm_more: \{ label: 'ใบยืนยันหน้างาน', color: 'var\(--blue\)', narrative: true, quiet: true \},/);
});

/* ═══ ③ สถานะรอยืนยัน ════════════════════════════════════════════════════════════════════════ */

test("③ ไม่เทียบ === 'awaiting' ดิบนอกใบไม้ — ยกเว้นบรรทัด unsoldCounts (R7) ที่ต้องนับ 'confirming' ในบรรทัดเดียวกัน", () => {
  const AWAITING = /(?:\.confirm|confirmOf\([^)]*\)|\bconfirm)\s*===\s*['"]awaiting['"]/;
  const PANEL = 'src/components/service/CustomerZonesPanel.js';
  const found = [];
  for (const within of ['src/lib/service/', 'src/components/service/', 'src/components/requests/']) {
    for (const { file, code: source } of APP.filter((f) => f.file.startsWith(within))) {
      source.split('\n').forEach((line, i) => { if (AWAITING.test(line)) found.push({ file, line: i + 1, text: line }); });
    }
  }
  const outside = found.filter((h) => h.file !== 'src/lib/service/surveyMethod.js');
  assert.deepEqual(outside.map((h) => h.file), [PANEL], JSON.stringify(outside));
  const [only] = outside;
  assert.match(only.text, /unsold: zones\.length/, 'บรรทัดเดียวที่ยกเว้นคือบรรทัดคืนค่าของ unsoldCounts');
  assert.match(only.text, /=== "awaiting" \|\| zone\.confirm === "confirming"/);
  // ใบไม้: ตัวเดียวที่บอก "ยังรอ" — สองค่า
  assert.match(code('src/lib/service/surveyMethod.js'),
    /export const surveyConfirmPending = \(confirm\) => confirm === 'awaiting' \|\| confirm === 'confirming';/);
});

/* ═══ ④ ไม่มีด่านใหม่บนการดึงกลับ / "ยังไม่จบ" ═══════════════════════════════════════════════════ */

test('④ ดึงกลับ และ "ยังไม่จบ" ไม่ถูกปฏิเสธเพราะใบยืนยัน — สองกิ่งไม่เรียกตัวตัดสินของงวด', () => {
  const recall = code(RECALL_ROUTE);
  assert.equal(/\bsurveyConfirmPlan\b/.test(recall), false);
  assert.equal(/\bsurveyConfirmSubmitMismatch\b/.test(recall), false);
  const reopen = between(code(REQUEST_ROUTE), "} else if (action === 'reopen') {", "} else if (action === 'close-unassessed') {");
  assert.equal(/\bsurveyConfirm(?:Plan|SubmitGate|SubmitMismatch)\b/.test(reopen), false);
  assert.equal(/surveyConfirmOfId/.test(reopen), false, 'กิ่ง reopen ไม่ถามลิงก์ — บรรทัดเธรดอยู่ในตะขอหลัง commit');
});

/* ═══ ⑤ ลำดับในซอร์ส ══════════════════════════════════════════════════════════════════════════ */

test('⑤ R2 ล็อกวิธีของใบยืนยัน: N25 ก่อนตัวตั้งวิธีแบบลองของ update · ด่านตอนยื่นก่อนตัวตั้งวิธีและ materialize', () => {
  const source = code(REQUEST_ROUTE);
  const update = between(source, "} else if (action === 'update') {", "} else if (action === '");
  const lock = update.indexOf("if (before.surveyConfirmOfId && next.variant !== undefined && next.variant !== 'standard') {");
  const dry = update.indexOf('reseedSurveyZoneMethods(supabase, { requestId: id, variant: next.variant, dryRun: true })');
  assert.ok(lock >= 0 && dry >= 0, 'มีทั้งสองจุด');
  assert.ok(lock < dry, 'N25 ก่อน dry-run');
  assert.match(update.slice(lock, dry), /return Response\.json\(\{ error: SURVEY_CONFIRM_VARIANT_ERROR \}, \{ status: 409 \}\);/);

  const submit = between(source, "if (action === 'submit') {", 'materializeSurveyZones(supabase');
  const gate = submit.indexOf('await surveyConfirmSubmitGate(supabase, { id, before })');
  const reseed = submit.indexOf('reseedSurveyZoneMethods(supabase');
  assert.ok(gate >= 0 && reseed > gate, 'ด่านของใบยืนยันก่อนตัวตั้งวิธีของ S4 (และก่อน materialize — ตัดช่วงจบที่นั่น)');
  assert.match(submit.slice(gate, reseed),
    /if \(confirmGate\.refusal\) \{\s*return Response\.json\(\{ error: confirmGate\.refusal\.error \}, \{ status: confirmGate\.refusal\.status \}\);/);
  // ด่านเรียกตัวเทียบชุดพื้นที่/วิธี (`surveyConfirmSubmitMismatch`) — ผลไม่ตรง = 409
  const gateFn = bodyOf(source, 'async function surveyConfirmSubmitGate(');
  assert.match(gateFn, /const mismatch = surveyConfirmSubmitMismatch\(plan, before, original\);\s*if \(mismatch\) return \{ refusal: \{ status: 409, error: mismatch \}, original \};/);
});

test('⑤ F4 ด่านตอนยื่นปิดเมื่ออ่านพัง: อ่านใบต้นทาง / อ่านบริบทพัง = 500 ก่อนตัวตั้งวิธี — ไม่ปล่อยเป็นใบธรรมดา', () => {
  const gateFn = bodyOf(code(REQUEST_ROUTE), 'async function surveyConfirmSubmitGate(');
  assert.match(gateFn,
    /const \{ original, error \} = await loadSurveyConfirmOriginal\(supabase, before\.surveyConfirmOfId\);\s*if \(error\) return \{ refusal: \{ status: 500, error \}, original: null \};/);
  assert.match(gateFn,
    /const ctx = await loadSurveyConfirmContext\(supabase, original\);\s*if \(ctx\.error\) return \{ refusal: \{ status: 500, error: ctx\.error \}, original \};/);
  // อ่านได้แต่ไม่พบใบต้นทาง (ลบไปแล้ว) = ลิงก์ลอย ⇒ ใบธรรมดา (§5 — ไม่มีด่าน)
  assert.ok(gateFn.indexOf('if (error) return') < gateFn.indexOf('if (!original)'), 'พัง ≠ ไม่พบ — ถามพังก่อน');
});

test('⑤ R1 กิ่งสร้างใบยืนยันของ POST อยู่ก่อนการอ่าน body.variant ครั้งแรก', () => {
  const source = code(REQUESTS_ROUTE);
  const branch = source.indexOf('body = surveyConfirmCreateBody(body, original, plan);');
  const firstVariant = source.indexOf('body.variant');
  assert.ok(branch >= 0 && firstVariant >= 0);
  assert.ok(branch < firstVariant, 'ประกอบ body (variant standard) ก่อนด่าน variant ของ S4');
  assert.match(source, /let body = await request\.json\(\)\.catch\(\(\) => \(\{\}\)\);/);
});

test('⑤ F13 ตะขอหลัง commit: หลัง audit / เหตุการณ์ของ route และห่อ try/catch ที่ลง log — ทั้งสาม route', () => {
  const source = code(REQUEST_ROUTE);
  // ตัวประกอบบรรทัดและตัวเขียนถูกเรียกในตะขอตัวเดียว
  const hook = bodyOf(source, 'async function surveyConfirmAfterAction(');
  for (const name of ['appendSurveyConfirmLines(', 'surveyConfirmEndedText(', 'surveyConfirmOpenedText(']) {
    assert.ok(countOf(source, name) > 0, name);
    assert.equal(countOf(hook, name), countOf(source, name), `${name} อยู่ในตะขอเท่านั้น`);
  }
  assert.equal(countOf(source, 'surveyConfirmAfterAction('), 2, 'ประกาศหนึ่ง เรียกหนึ่ง');
  const patch = between(source, 'export async function PATCH(', 'export async function DELETE(');
  const call = patch.indexOf('await surveyConfirmAfterAction(');
  assert.ok(call > patch.lastIndexOf('appendRequestEvent('), 'หลังเหตุการณ์ตัวสุดท้ายของ PATCH');
  assert.ok(call > patch.lastIndexOf('recordAudit('), 'หลัง audit');
  assert.match(patch, /try \{\s*await surveyConfirmAfterAction\(supabase, \{[\s\S]*?\}\);\s*\} catch \(e\) \{\s*console\.error\(/);

  const recall = code(RECALL_ROUTE);
  assert.ok(recall.indexOf('appendSurveyConfirmLines(') > recall.lastIndexOf('recordAudit('), 'ดึงกลับ: หลัง audit');
  assert.match(recall,
    /try \{\s*const \{ original, error: originalError \} = await loadSurveyConfirmOriginal\([\s\S]*?appendSurveyConfirmLines\([\s\S]*?\} catch \(e\) \{\s*console\.error\(/);

  const send = code(SEND_ROUTE);
  const post = send.slice(send.indexOf('export const POST = withUser('));
  const sent = post.indexOf('await surveyConfirmSentThread(');
  assert.ok(sent > post.lastIndexOf('recordAudit('), 'ส่งผล: หลัง audit ของการส่ง');
  assert.ok(sent < post.indexOf('await surveySendIssue('), 'ก่อนขั้นออกเลข (B-5)');
  assert.match(post, /if \(data\?\.surveyConfirmOfId\) \{\s*try \{\s*await surveyConfirmSentThread\([\s\S]*?\} catch \(e\) \{\s*console\.error\(/);
});

/* ═══ ⑥ รูปของก้อน ═══════════════════════════════════════════════════════════════════════════ */

test('⑥ R-KEYS: คีย์ใหม่บนก้อนเดิม (confirmLinks · confirmOf · refs · confirmRequest · confirmOfId · surveyConfirmLink) มาทาง conditional spread', () => {
  const SPREAD = (key) => new RegExp(`\\.\\.\\.\\([^?]+\\?\\s*\\{\\s*${key}\\b[^}]*\\}(?:\\s*\\})?\\s*:\\s*\\{\\}\\)`);
  const cases = [
    [SURVEY_JOB, ['confirmLinks', 'confirmOf', 'refs']],
    [ZONE_REGISTRY, ['confirmRequest', 'confirmOfId']],
    [SHEET_ROUTE, ['confirmOf']],
    [REQUEST_ROUTE, ['surveyConfirmLink']],
  ];
  for (const [file, keys] of cases) {
    const lines = code(file).split('\n');
    for (const key of keys) {
      const writes = lines.filter((line) => new RegExp(`(?:[{,]\\s*${key}\\s*[,}]|\\b${key}\\s*:)`).test(line));
      assert.ok(writes.length > 0, `${file}: ไม่พบ ${key}`);
      for (const line of writes) assert.match(line, SPREAD(key), `${file}: ${key} ต้องมาทาง conditional spread — ${line.trim()}`);
    }
  }
});

test('⑥ แถบแจ้งไม่รู้จักคนดู: surveyDrawingBanner ไม่มี viewer · ผู้เรียกสองที่ส่งสามตัวเลือกเดิม', () => {
  const source = code(SURVEY_JOB);
  assert.match(source, /function surveyDrawingBanner\(request, \{ show = false, count = 0, dept = 'TS' \} = \{\}\) \{/);
  assert.equal(/\bviewer\b/.test(bodyOf(source, 'function surveyDrawingBanner(')), false);
  const calls = source.match(/surveyDrawingBanner\(request, \{[^}]*\}\)/g) || [];
  assert.equal(calls.length, 2);
  for (const call of calls) assert.match(call, /\{ show: [^,]+, count: [^,]+, dept \}\)$/, call);
});

test('⑥ จอ: SurveyDetail ไม่ส่ง onConfirm (ไม่ถูกเมานต์ — รั้วถูก ๆ) · SurveyRequestView ไม่มี variant="primary"', () => {
  assert.equal(/\bonConfirm\b/.test(code('src/components/requests/details/SurveyDetail.js')), false);
  assert.equal(code('src/components/requests/details/SurveyRequestView.js').includes('variant="primary"'), false);
});

/* ═══ ⑦ โมดูลที่ดึงได้ ═══════════════════════════════════════════════════════════════════════ */

const importsOf = (source) => [...source.matchAll(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm)].map((m) => ({ names: m[1], from: m[2] }));

test('⑦ R9 surveyConfirmRepo.js ดึงจากโมดูลกระดาษได้แค่ surveyReportRows กับ surveyReportState', () => {
  const paper = importsOf(code(REPO)).filter((i) => /surveyReport/.test(i.from)).map((i) => i.from).sort();
  assert.deepEqual(paper, ['@/lib/service/surveyReportRows', '@/lib/service/surveyReportState']);
  assert.equal(/surveyReport(?:Paper|Images|Document)\b/.test(code(REPO)), false);
});

test('⑦ surveyConfirmLink.js (ถึงเบราว์เซอร์ผ่าน surveyJob.js) ดึงได้เฉพาะลิสต์ของ §2.1 — ไม่มีโมดูลฝั่ง server', () => {
  const got = importsOf(code(LINK)).map((i) => [i.from, i.names.replace(/\s+/g, ' ')]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(got, [
    ['@/lib/format', '{ fmtNumber }'],
    ['@/lib/requests/statuses', '{ requestStatusView }'],
    ['@/lib/service/survey', '{ surveyZonePackageText, surveyZoneSize }'],
    ['@/lib/service/surveyMethod', '{ isDrawingZone }'],
    ['@/lib/service/zonePickState', '{ busySurveyRequests }'],
    ['@/lib/service/zoneRegistry', '{ latestSurveyRow }'],
  ]);
  assert.equal(/\brequire\(|import\(/.test(code(LINK)), false);
});

/* ═══ ⑧ ?confirms= ════════════════════════════════════════════════════════════════════════════ */

test('⑧ F14 /requests/new: ตรวจรูป ?confirms= ก่อนยิง confirm-plan · path ผ่าน encodeURIComponent · ไม่มี confirms ดิบใน /api/', () => {
  const source = code(NEW_PAGE);
  const check = source.indexOf('SURVEY_CONFIRM_ID_PATTERN.test(');
  const fetch = source.indexOf('/confirm-plan`');
  assert.ok(check >= 0 && fetch > check, 'ตรวจรูปก่อนยิง');
  assert.match(source, /apiJson\(`\/api\/sa\/requests\/\$\{encodeURIComponent\(confirms\)\}\/confirm-plan`/);
  assert.match(source, /if \(!confirms \|\| confirmsBad\) return undefined;/);
  for (const { file, code: text } of APP.filter((f) => f.file.startsWith('src/app/') || f.file.startsWith('src/components/'))) {
    assert.equal(/`\/api\/[^`]*\$\{confirms\}/.test(text), false, file);
  }
});
