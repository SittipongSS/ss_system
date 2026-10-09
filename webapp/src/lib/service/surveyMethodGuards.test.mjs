// ── ประเมินจากแบบ งวด S1: ยามซอร์สข้ามไฟล์ + ตะเข็บข้ามกลุ่ม (mig 0408 · สเปก S1 §5.4–5.5) ───────────────
//
// ⭐ งวด S1 สร้างพร้อมกันเจ็ดกลุ่มไฟล์ — กติกาที่ **ไม่มีไฟล์ไหนเป็นเจ้าของคนเดียว** ถูกล็อกไว้ที่นี่:
//   ① ค่าคอลัมน์ `method` ถูกเทียบที่ `surveyMethod.js` ที่เดียว (ที่อื่นถามผ่าน `zoneMethod` / `isDrawingZone`)
//   ② เขียน `method` ได้สองไฟล์ (เส้นเพิ่มพื้นที่ · เส้นแก้พื้นที่) และเขียนได้ค่าเดียวคือ 'drawing'
//      ⇒ ใบลงหน้างานไม่ส่งคีย์ `method` ไปฐานเลย (payload เท่าก่อน mig · ปลอดภัยแม้ mig ยังไม่ถูกรัน)
//   ③ ทุกที่ที่เรียก `surveySendVisitStep(` ส่ง `needsVisit` — ลืมตัวเดียว = ใบงานโต๊ะถูกปิดนัดเป็น "เข้าแล้ว"
//   ④ สวิตช์ `SURVEY_DRAWING_METHOD` ถูกอ่านไฟล์เดียว และไฟล์นั้นถูกดึงจากใต้ `src/app/api/` เท่านั้น
//   ⑤ ชื่อคอลัมน์ใหม่ที่ถูกระบุในคำสั่งอ่านมีสองจุด (เหตุเดียวที่ `check:columns` แดงก่อนรัน mig 0408)
//   ⑥ ภาพนิ่งของเอกสารยังรุ่น 1 (งวด S3 เป็นคนขยับ)
//
// ⭐ งวด S2a (สลับวิธี · สเปก S2a §3 Integrate ข้อ 2) **ขยายยามสี่ข้อโดยตั้งใจ** — ทุกข้อเป็นลิสต์ปิดเหมือนเดิม แค่ยาวขึ้น:
//   ② ผู้เขียน `method` = สองเส้นพื้นที่ + `surveyMethodWrites.js` (ตัวเขียนของแผนสลับวิธี) · 'onsite' เขียนได้ที่ไฟล์หลังที่เดียว
//   ④ ผู้ถามสวิตช์ = สี่ route ใต้ `src/app/api/` (ส่งผล · สลับวิธี · GET ของใบ · แก้พื้นที่)
//   ⑤ คอลัมน์ใหม่ที่ถูกเอ่ยชื่อ: ลิสต์ไฟล์รายคอลัมน์ (เดิมว่างทั้งห้า)
//   ตะเข็บ A ↔ D: ผู้เรียก `surveySendBackOnSheet` ทุกจุดส่ง `needsVisit` แล้ว (ลิสต์ "ยังไม่ส่ง" ว่าง)
//   ใหม่ ⑦ โมดูลแผน `surveyMethodSwitch.js` ดึงได้สี่โมดูล · ⑧ ของงวดหลัง (S2b จอ · S5 ผูกใบยืนยัน) ยังไม่มีในโค้ด
//
// ⚠️ อ่านซอร์สเป็นข้อความหลังตัดคอมเมนต์ — ⛔ สตริง/regex ในไฟล์นี้ห้ามมีทับตามด้วยดอกจันติดกัน
//    (ตัวตัดคอมเมนต์ของยามตัวอื่นจะกลืนโค้ดตั้งแต่จุดนั้น)
// ⚠️ ยามตรวจ **ข้อความ** จึงจับได้แค่รูปที่รู้จัก — พฤติกรรมจริงของแต่ละกติกามีเทสต์ของตัวเองใน `surveyMethod*.test.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSurveySpots, surveySendBackOnSheet } from './survey.js';
import { surveyZoneFacts } from './surveyControl.js';
import { surveySendVisitStep } from './surveySendClose.js';
import { requestRailSteps } from '../requests/requestRail.js';
import { SURVEY_REPORT_SNAPSHOT_VERSION } from './surveyReportSnapshot.js';
import { SURVEY_ZONE_TAG } from './surveyMethodSwitch.js';
import { zoneRegistryRow } from './zoneRegistry.js';

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
const read = (relative) => fs.readFileSync(path.join(WEBAPP, relative), 'utf8');
const hits = (pattern, { except = [] } = {}) => APP
  .filter(({ file, code }) => !except.includes(file) && pattern.test(code))
  .map(({ file }) => file)
  .sort();

const LEAF = 'src/lib/service/surveyMethod.js';
const FLAG = 'src/lib/service/surveyDrawingFlag.js';
const ZONES_ROUTE = 'src/app/api/service/surveys/[id]/zones/route.js';
const ZONE_ROUTE = 'src/app/api/service/surveys/[id]/zones/[zoneId]/route.js';
const SEND_ROUTE = 'src/app/api/service/surveys/[id]/send/route.js';
const METHOD_ROUTE = 'src/app/api/service/surveys/[id]/method/route.js';
const SHEET_ROUTE = 'src/app/api/service/surveys/[id]/route.js';
const RECALL_ROUTE = 'src/app/api/service/surveys/[id]/recall/route.js';
const REQUEST_ROUTE = 'src/app/api/sa/requests/[id]/route.js';
const CUSTOMER_ZONES_ROUTE = 'src/app/api/service/customers/[customerId]/zones/route.js';
const SWITCH = 'src/lib/service/surveyMethodSwitch.js';
const WRITES = 'src/lib/service/surveyMethodWrites.js';
const DOCUMENT_ROUTE = 'src/app/api/service/surveys/[id]/document/route.js';
const SCRIPT = 'scripts/check-survey-report-inputs.mjs';

test('ตัวตัดคอมเมนต์ของไฟล์นี้ทำงานจริง (ยามที่อ่านคอมเมนต์เป็นโค้ด = ยามที่ไม่ได้เฝ้าอะไร)', () => {
  const open = '/' + '*';
  const close = '*' + '/';
  const sample = `a(); ${open} row.method === 'drawing' ${close}\n  // row.method === 'drawing'\nb(); // x.method = 1\nconst u = 'https://example.test/a';`;
  const out = stripComments(sample);
  assert.doesNotMatch(out, /method/);
  assert.match(out, /a\(\);/);
  assert.match(out, /b\(\);/);
  assert.match(out, /https:\/\/example\.test\/a/);
  assert.ok(APP.length > 500, 'ต้องเดินเจอซอร์สของแอปจริง');
});

/* ═══ ① เทียบค่า method ที่เดียว ═════════════════════════════════════════════════════════════ */

test('🔴 ไม่มีไฟล์ไหนเทียบค่า `.method` กับ drawing / onsite เอง — ถามผ่าน surveyMethod.js เท่านั้น', () => {
  const compare = /\.method\s*[!=]==?\s*['"`](?:drawing|onsite)['"`]/;
  const viaConstant = /\.method\s*[!=]==?\s*SURVEY_METHOD_(?:DRAWING|ONSITE)/;
  assert.deepEqual(hits(compare, { except: [LEAF] }), []);
  assert.deepEqual(hits(viaConstant, { except: [LEAF] }), []);
  // ตัวมันเองต้องมีการเทียบจริง (ไม่งั้นข้อบนผ่านเพราะ regex จับอะไรไม่ได้เลย)
  assert.match(stripComments(read(LEAF)), viaConstant);
  // แถวเก่าไม่มีคีย์ method — การหยิบค่าดิบไปเทียบกลับด้าน (`'drawing' === x.method`) ก็ห้ามเช่นกัน
  assert.deepEqual(hits(/['"`](?:drawing|onsite)['"`]\s*[!=]==?\s*[\w.?]*\.method\b/, { except: [LEAF] }), []);
});

test('โมดูลใบ surveyMethod.js ไม่ดึงโมดูลไหนเข้ามา (กันวงกลม attachmentTypes → survey → surveyMethod)', () => {
  const code = stripComments(read(LEAF));
  assert.doesNotMatch(code, /\bimport\b/);
  assert.doesNotMatch(code, /\brequire\s*\(/);
});

/* ═══ ② เขียน method ได้สามไฟล์ · onsite ไฟล์เดียว ═══════════════════════════════════════════ */

test('🔴 เขียน `method` ได้เฉพาะสองเส้นพื้นที่กับตัวเขียนของแผนสลับวิธี · ค่า onsite เขียนได้ที่ตัวเขียนที่เดียว', () => {
  const write = /\bmethod\s*(?::|=(?!=))\s*(?:SURVEY_METHOD_\w+|['"`](?:drawing|onsite)['"`])/;
  // งวด S2a เพิ่ม `surveyMethodWrites.js` — ตัวเดียวที่ลงมือเขียนตามแผน (`runSurveyMethodPlan`) ทั้งสองทิศ
  assert.deepEqual(hits(write, { except: [LEAF] }), [ZONE_ROUTE, ZONES_ROUTE, WRITES].sort());

  // ค่า onsite ถูกเขียนที่ตัวเขียนของแผนที่เดียว — สองเส้นพื้นที่ยังไม่ส่งคีย์นี้ (ใบลงหน้างานได้ payload เท่าก่อน mig)
  const writesOnsite = /\bmethod\s*(?::|=(?!=))\s*(?:SURVEY_METHOD_ONSITE|['"`]onsite['"`])/;
  assert.deepEqual(hits(writesOnsite, { except: [LEAF] }), [WRITES]);
  // ตัวเขียน: สามจุด (กลับเป็นลงหน้างาน · เป็นจากแบบ · แถวที่ตัดไปแล้วตามใบที่กลายเป็นงานโต๊ะ) — ทุกจุดอยู่บนตารางพื้นที่
  const writes = stripComments(read(WRITES));
  assert.equal((writes.match(new RegExp(write.source, 'g')) || []).length, 3);
  assert.equal((writes.match(new RegExp(writesOnsite.source, 'g')) || []).length, 1);
  // โมดูลแผนเป็นไฟล์ล้วน: ไม่มีรูปเขียน method และไม่แตะฐาน (สำเนาแถวในหน่วยความจำทำผ่าน asMethod)
  const plan = stripComments(read(SWITCH));
  assert.doesNotMatch(plan, write);
  assert.doesNotMatch(plan, /\.from\(|supabase|process\.env/);

  // เส้นเพิ่มพื้นที่: คีย์อยู่ใต้เงื่อนไข — พื้นที่ลงหน้างานได้ payload ที่ไม่มีคีย์ method
  assert.match(
    stripComments(read(ZONES_ROUTE)),
    /\.\.\.\(method === SURVEY_METHOD_DRAWING \? \{ method: SURVEY_METHOD_DRAWING \} : \{\}\)/,
  );
  // เส้นแก้พื้นที่: สามจุดเขียน (แถวที่ตัดไปแล้ว · ตัดพื้นที่สุดท้ายที่ต้องวัด · คืนพื้นที่บนใบงานโต๊ะ)
  const zone = stripComments(read(ZONE_ROUTE));
  assert.equal((zone.match(/\bmethod\s*(?::|=(?!=))\s*SURVEY_METHOD_DRAWING/g) || []).length, 3);
  assert.doesNotMatch(zone, /body\??\.method\b/, 'เส้นแก้พื้นที่ไม่รับวิธีประเมินจาก body (สลับวิธี = เส้น method เท่านั้น)');
  assert.doesNotMatch(stripComments(read(ZONES_ROUTE)), /body\??\.method\b/);
  // ไม่มีไฟล์ไหนหยิบ `body.method` เลย — เส้นสลับวิธีอ่าน `changes[].method` ผ่าน surveyMethodChanges ของโมดูลแผน
  assert.deepEqual(hits(/body\??\.method\b/), []);
  const methodRoute = stripComments(read(METHOD_ROUTE));
  assert.match(methodRoute, /surveyMethodChanges\(/);
  assert.match(methodRoute, /runSurveyMethodPlan\(/);
  assert.doesNotMatch(methodRoute, write, 'เส้นสลับวิธีไม่เขียน method เอง — ส่งแผนให้ตัวเขียน');
});

/* ═══ ③ surveySendVisitStep ต้องได้ needsVisit ทุกที่ ═══════════════════════════════════════ */

/** ตัวเรียกทุกจุดของ `name(` ในโค้ด พร้อมข้อความในวงเล็บ (นับวงเล็บซ้อน) — ไม่นับบรรทัดประกาศฟังก์ชัน */
function callsOf(code, name) {
  const out = [];
  const pattern = new RegExp(`\\b${name}\\(`, 'g');
  let m = pattern.exec(code);
  while (m) {
    const declared = /function\s+$/.test(code.slice(Math.max(0, m.index - 12), m.index));
    let depth = 1;
    let i = pattern.lastIndex;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') depth -= 1;
      i += 1;
    }
    if (!declared) out.push(code.slice(pattern.lastIndex, i - 1));
    m = pattern.exec(code);
  }
  return out;
}

test('🔴 ทุกจุดที่เรียก surveySendVisitStep( ส่ง needsVisit — หกจุดใน src + สคริปต์ตรวจอินพุต', () => {
  const sites = APP.flatMap(({ file, code }) => callsOf(code, 'surveySendVisitStep').map((args) => ({ file, args })));
  assert.deepEqual(sites.map((s) => s.file).sort(), [
    DOCUMENT_ROUTE,
    SEND_ROUTE,
    SEND_ROUTE,
    'src/lib/service/surveyControl.js',
    'src/lib/service/surveyReportInputs.js',
    'src/lib/service/surveySendClose.js',
  ].sort(), 'เพิ่มจุดเรียกใหม่ = เพิ่มในลิสต์นี้ พร้อมส่ง needsVisit');
  const passing = sites.filter((s) => /\bneedsVisit\b/.test(s.args));
  assert.equal(passing.length, sites.length, sites.filter((s) => !passing.includes(s)).map((s) => s.file).join(', '));

  const script = callsOf(stripComments(read(SCRIPT)), 'surveySendVisitStep');
  assert.equal(script.length, 1);
  assert.match(script[0], /\bneedsVisit\b/);

  // ลืมส่ง = โยนทันที ไม่ใช่ตกไปเป็น "ต้องมีนัด" เงียบ ๆ (ตัวป้องกันชั้นรันไทม์ของข้อเดียวกัน)
  for (const bad of [undefined, null, 0, 'true']) {
    assert.throws(() => surveySendVisitStep(null, { today: '2026-10-09', needsVisit: bad }), TypeError, String(bad));
  }
  assert.throws(() => surveySendVisitStep(null), TypeError);
  assert.deepEqual(surveySendVisitStep(null, { needsVisit: true }), { action: 'none', visit: null });
});

test('ตะเข็บ B ↔ A: บรรทัด closesVisit ของ route ส่งผลตรงกับที่เทสต์ด่านรูปจุดอ่าน', () => {
  assert.ok(read(SEND_ROUTE).includes(
    "const closesVisit = surveySendVisitStep(open, { today, needsVisit }).action === 'close';",
  ));
  // ค่า needsVisit ของ route มาจากแถวพื้นที่ที่ server อ่านเอง ไม่ใช่จาก body
  const send = stripComments(read(SEND_ROUTE));
  assert.match(send, /needsVisit = surveyNeedsVisit\(/);
  assert.doesNotMatch(send, /body\??\.needsVisit/);
});

/* ═══ ④ สวิตช์ ═══════════════════════════════════════════════════════════════════════════ */

test('🔴 สวิตช์ SURVEY_DRAWING_METHOD ถูกอ่านไฟล์เดียว และไฟล์นั้นถูกดึงจากใต้ src/app/api/ เท่านั้น', () => {
  assert.deepEqual(hits(/process\.env\.SURVEY_DRAWING_METHOD\b/), [FLAG]);
  assert.deepEqual(hits(/SURVEY_DRAWING_METHOD/), [FLAG], 'ชื่อสวิตช์ต้องไม่โผล่ในโค้ดไฟล์อื่น (รวม NEXT_PUBLIC_ ที่พาไปถึงเบราว์เซอร์)');
  const importers = hits(/surveyDrawingFlag/, { except: [FLAG] });
  // งวด S2a: สี่ route — ด่านส่งผลแถว 17a · เส้นสลับวิธี · GET ของใบ (ส่งค่าให้จอ) · กล่องยืนยันตอนหัวหน้าตัดพื้นที่สุดท้ายที่ต้องวัด
  assert.deepEqual(importers, [METHOD_ROUTE, SHEET_ROUTE, SEND_ROUTE, ZONE_ROUTE].sort(), 'ผู้ใช้สวิตช์ใหม่ = เพิ่มในลิสต์นี้ และต้องอยู่ใต้ src/app/api/');
  for (const file of importers) assert.ok(file.startsWith('src/app/api/'), file);
  // ถามผ่าน surveyDrawingMethodEnabled() เท่านั้น — ไม่มีไฟล์ไหนดึงชื่ออื่นจากโมดูลสวิตช์ และไม่มีโค้ดฝั่งจอ/โมดูลล้วนเรียกตัวถาม
  assert.deepEqual(hits(/\bsurveyDrawingMethodEnabled\b/, { except: [FLAG] }), importers);
  for (const file of importers) {
    assert.match(stripComments(read(file)), /import \{ surveyDrawingMethodEnabled \} from '@\/lib\/service\/surveyDrawingFlag';/, file);
  }
  // จอรู้ค่าสวิตช์ทางเดียว: คีย์ drawingMethodEnabled ของ GET (ค่าจาก server ไม่ใช่ NEXT_PUBLIC_)
  assert.match(stripComments(read(SHEET_ROUTE)), /const drawingMethodEnabled = surveyDrawingMethodEnabled\(\);/);

  // ด่านที่อยู่ใต้สวิตช์: ตัวด่านเป็นฟังก์ชันล้วน (ไม่อ่านสวิตช์เอง) · route เป็นคนเลือกว่าจะถามไหม
  const send = stripComments(read(SEND_ROUTE));
  assert.match(send, /surveyDrawingMethodEnabled\(\)/);
  assert.equal(callsOf(send, 'surveySendSiteVisitError').length, 1);
  // งวด S2a: การ์ดควบคุมถามด่านเดียวกันจากค่า siteVisitReached ที่ GET ส่งมา (null = สวิตช์ปิด/อ่านไม่ได้ ⇒ ไม่ถาม)
  assert.deepEqual(
    hits(/\bsurveySendSiteVisitError\(/, { except: ['src/lib/service/surveySendClose.js'] }),
    [SEND_ROUTE, 'src/lib/service/surveyControl.js'].sort(),
  );
  const control = stripComments(read('src/lib/service/surveyControl.js'));
  assert.equal(callsOf(control, 'surveySendSiteVisitError').length, 1);
  assert.doesNotMatch(control, /surveyDrawingFlag|process\.env/, 'การ์ดเป็นฟังก์ชันล้วน — รับค่าสวิตช์เป็นอาร์กิวเมนต์');
});

/* ═══ ⑤ คอลัมน์ใหม่ที่ถูกเอ่ยชื่อในคำสั่งอ่าน ═════════════════════════════════════════════════ */

test('คอลัมน์ของ mig 0408: จุดที่ระบุชื่อในคำสั่งอ่านเป็นลิสต์ปิด (สามจุดของพื้นที่ + หนึ่งจุดของคำร้อง) · ผู้เอ่ยชื่อรายคอลัมน์เป็นลิสต์ปิด', () => {
  const COLUMNS = 'id, "requestId", status, method';
  assert.ok(read('src/lib/service/surveyQueueRepo.js').includes(`export const SURVEY_QUEUE_ZONE_COLUMNS = '${COLUMNS}';`));
  // visitsRepo: สองจุด (สถานะตีกลับของนัด + ตัวนับพื้นที่ของหน้างานของฉัน — งวด S2a เพิ่มจุดหลัง)
  const visits = stripComments(read('src/lib/service/visitsRepo.js'));
  assert.equal(visits.split(`.select('${COLUMNS}')`).length - 1, 2);
  /* ลิสต์คอลัมน์ในสตริงที่มีคำว่า method เป็นคอลัมน์ (คั่นด้วยจุลภาค) — มีได้แค่สองไฟล์นั้น */
  const namedInList = /['"`][^'"`\n]*,\s*method\s*(?:,[^'"`\n]*)?['"`]/;
  assert.deepEqual(hits(namedInList), ['src/lib/service/surveyQueueRepo.js', 'src/lib/service/visitsRepo.js']);

  // surveyConfirm ถูกระบุชื่อในคำสั่งอ่านจุดเดียว: คำร้องที่ค้างของทะเบียนโซนลูกค้า (ป้าย "รอยืนยันหน้างาน")
  assert.deepEqual(hits(/select\([^)]*surveyConfirm[^)]*\)/), [CUSTOMER_ZONES_ROUTE]);

  /* ผู้เอ่ยชื่อคอลัมน์นอกโมดูลใบ — ทุกไฟล์อ่านจากแถว `select('*')` หรือเขียนลง patch (ไม่ใช่คำสั่งอ่านที่ระบุชื่อ)
     เพิ่มไฟล์ = เพิ่มในลิสต์นี้พร้อมเหตุ */
  const NAMED = {
    // แผนอ่านสองช่องนี้จากแถวเพื่อแยก "กดซ้ำของการกระทำเดิม" ออกจาก "มีคนอื่นสลับไปแล้ว" · ตัวเขียนเป็นคนประทับ
    methodReason: [SWITCH, WRITES],
    methodChangedByName: [SWITCH, WRITES],
    // เส้นแก้พื้นที่: ช่างเขียนทับพื้นที่ที่หัวหน้าเพิ่งสลับ ⇒ 409 (ไม่ใช่ 403) · ตัวเขียนเป็นคนประทับ
    methodChangedAt: [ZONE_ROUTE, WRITES],
    // เขียน: ส่งผล (เฉพาะใบที่มีพื้นที่จากแบบ) · ดึงกลับ/เปิดใหม่ (ล้างเป็น NULL) — อ่าน: ทะเบียนโซน · แบนเนอร์ของฝ่ายขาย · ด่าน/ข้อความตอนส่ง
    surveyConfirm: [
      REQUEST_ROUTE, CUSTOMER_ZONES_ROUTE, RECALL_ROUTE, SEND_ROUTE,
      'src/lib/service/surveyJob.js', 'src/lib/service/surveySendClose.js',
    ],
    // ผูกใบยืนยันหน้างานกับใบต้นทาง = งวด S5 — ยังไม่มีโค้ดไหนแตะ (รวมโมดูลใบ)
    surveyConfirmOfId: [],
  };
  for (const [column, files] of Object.entries(NAMED)) {
    assert.deepEqual(hits(new RegExp(`\\b${column}\\b`), { except: [LEAF] }), [...files].sort(), column);
  }
  assert.deepEqual(hits(/\bsurveyConfirmOfId\b/), [], 'งวด S5');

  // เปิดใบใหม่ใช้ร่วมทุกชนิดคำร้อง — คีย์ surveyConfirm ถูกใส่เฉพาะคำร้องประเมินพื้นที่
  assert.match(stripComments(read(REQUEST_ROUTE)), /if \(before\.kind === 'site_survey'\) patch\.surveyConfirm = null;/);
  // ส่งผล: คีย์ถูกใส่เฉพาะใบที่มีพื้นที่จากแบบ (ใบลงหน้างานได้ patch เท่าเดิม — เทสต์โกลเดนยืนยันด้วยพฤติกรรม)
  assert.match(stripComments(read(SEND_ROUTE)), /if \(methodMix\.drawing > 0\) patch\.surveyConfirm = body\?\.surveyConfirm;/);
});

/* ═══ ⑥ กระดาษ ═══════════════════════════════════════════════════════════════════════════ */

test('ภาพนิ่งของเอกสารประเมินยังรุ่น 1 — งวด S1/S2a ไม่เพิ่มคีย์ลงภาพนิ่ง (งวด S3 เป็นคนขยับรุ่น)', () => {
  assert.equal(SURVEY_REPORT_SNAPSHOT_VERSION, 1);
  // งวด S2a ไม่แตะกระดาษ: ไฟล์ของเอกสารไม่รู้จักโมดูลสลับวิธีเลย
  const paper = APP.filter(({ file }) => /\/surveyReport\w*\.js$/.test(file));
  assert.ok(paper.length >= 5);
  for (const { file, code } of paper) assert.doesNotMatch(code, /surveyMethod(?:Switch|Writes|Notify)\b/, file);
});

test('route ออกเอกสารส่งธง hold ต่อเฉพาะตอนผลมีธงนั้น — ผลอื่นทุกแบบได้คีย์ชุดเดิม', () => {
  const route = stripComments(read(DOCUMENT_ROUTE));
  assert.match(route, /\.\.\.\(issued\.hold === true \? \{ hold: true \} : \{\}\)/);
  assert.doesNotMatch(route, /hold: issued\.hold/);
});

/* ═══ ตะเข็บข้ามกลุ่ม (พฤติกรรมจริงของฟังก์ชันที่กลุ่มหนึ่งประกาศ อีกกลุ่มเรียก) ═════════════════ */

test('ตะเข็บ A ↔ F: normalizeSurveySpots รับ defaultSelected — จุดใหม่ของพื้นที่จากแบบเกิดมาถูกเลือก · ไม่ส่ง = เท่าเดิม', () => {
  let n = 0;
  const newId = () => `SPT-${(n += 1)}`;
  const before = [{ id: 'old', label: 'จุดเดิม', note: '', selected: false }];
  const input = [{ id: 'old', label: 'จุดเดิม' }, { label: 'จุดใหม่' }];
  const today = normalizeSurveySpots(input, before, { newId });
  assert.equal(today.error, null);
  assert.deepEqual(today.value.map((spot) => [spot.id, spot.selected]), [['old', false], ['SPT-1', false]]);
  n = 0;
  assert.deepEqual(normalizeSurveySpots(input, before, { newId, defaultSelected: false }), today);
  n = 0;
  // ต้องเป็น true ตรงตัว — ค่าที่ "ดูเหมือนจริง" ไม่เปิดให้
  assert.deepEqual(normalizeSurveySpots(input, before, { newId, defaultSelected: 1 }), today);
  n = 0;
  const { value: desk, error } = normalizeSurveySpots(input, before, { newId, defaultSelected: true });
  assert.equal(error, null);
  assert.deepEqual(desk, today.value.map((spot) => (spot.id === 'old' ? spot : { ...spot, selected: true })));
  assert.equal(desk.find((spot) => spot.id === 'old').selected, false, 'จุดที่มีอยู่แล้วคงค่าเดิม');
  // route แก้พื้นที่: แถวลงหน้างานยังเรียกรูปเดิมตรงตัว (ไม่มีคีย์ตัวเลือกใหม่) · แถวจากแบบส่ง defaultSelected
  const zone = read(ZONE_ROUTE);
  assert.ok(zone.includes("normalizeSurveySpots(body.spots, row.spots, { newId: () => genId('SPT') })"));
  assert.ok(zone.includes("normalizeSurveySpots(body.spots, row.spots, { newId: () => genId('SPT'), defaultSelected: true })"));
});

test('ตะเข็บ A ↔ D: surveySendBackOnSheet รับ { needsVisit } — ผู้เรียกทุกจุดส่งมา (งวด S2a ต่อ GET ของใบกับการ์ดควบคุมครบแล้ว)', () => {
  const pending = { pending: true, sentBack: { at: '2026-10-08T08:00:00Z' }, done: null };
  assert.equal(surveySendBackOnSheet(pending, { status: 'acknowledged' }), pending);
  assert.equal(surveySendBackOnSheet(pending, { status: 'acknowledged' }, { needsVisit: true }), pending);
  assert.deepEqual(
    surveySendBackOnSheet(pending, { status: 'acknowledged' }, { needsVisit: false }),
    { ...pending, pending: false, closedByMethod: true },
  );

  const callers = APP.flatMap(({ file, code }) => callsOf(code, 'surveySendBackOnSheet').map((args) => ({ file, args })));
  assert.deepEqual(
    callers.filter((c) => /\bneedsVisit\b/.test(c.args)).map((c) => c.file).sort(),
    [SHEET_ROUTE, 'src/lib/service/surveyControl.js', 'src/lib/service/visitsRepo.js'].sort(),
  );
  /* ของค้างงวด S1 (สเปก S1 §6 ข้อ 10) ปิดแล้วในงวด S2a: GET ของใบส่ง needsVisit · ลิสต์ "ยังไม่ส่ง" ต้องว่างตลอดไป
     ผู้เรียกใหม่ที่ไม่ส่ง = ข้อนี้แดง */
  assert.deepEqual(callers.filter((c) => !/\bneedsVisit\b/.test(c.args)).map((c) => c.file), []);
  // GET ของใบ: ค่า needsVisit มาจากแถวพื้นที่ที่ server อ่านเอง (ตัวเดียวกับที่ส่งเข้าบรรทัด sendBack) ไม่ใช่จากคำขอ
  const sheet = stripComments(read(SHEET_ROUTE));
  assert.match(sheet, /sendBack: surveySendBackOnSheet\(context\.sendBack, request, \{ needsVisit \}\),/);
  assert.match(sheet, /\bneedsVisit = surveyNeedsVisit\(/);
  assert.doesNotMatch(sheet, /searchParams[^\n]*needsVisit/);
});

test('ตะเข็บ D ↔ B: requestRailSteps รับ needsVisit — การ์ดควบคุมกับการ์ดงานส่งค่าจากแถวพื้นที่ของตัวเอง', () => {
  // ใบที่แจ้งวันแล้วแต่ไม่มีนัด: ใบที่ต้องมีนัดค้างที่ขั้นลงคิว · ใบงานโต๊ะเดินต่อ (วันบนใบคือวันส่งผล ไม่ใช่วันนัด)
  const request = {
    id: 'DR-1', kind: 'site_survey', dept: 'TS', status: 'acknowledged',
    acknowledgedAt: '2026-10-06T08:12:00Z', committedDueDate: '2026-10-12', committedResultDate: '2026-10-12',
  };
  const today = requestRailSteps(request, { visit: null });
  assert.deepEqual(requestRailSteps(request, { visit: null, needsVisit: true }), today);
  assert.deepEqual(requestRailSteps({ ...request, surveyNeedsVisit: true }, { visit: null }), today);
  const desk = requestRailSteps(request, { visit: null, needsVisit: false });
  assert.deepEqual(requestRailSteps({ ...request, surveyNeedsVisit: false }, { visit: null }), desk);
  assert.equal(today.index, 2);
  assert.equal(desk.index, 3, 'ใบงานโต๊ะที่รับปากวันส่งผลแล้วไม่ค้างที่ขั้นลงคิว');
  // ยังไม่รับปากวัน = ค้างที่ขั้นเดียวกับใบที่ยังไม่ลงคิว
  const unpromised = { ...request, committedDueDate: null, committedResultDate: null };
  assert.equal(requestRailSteps(unpromised, { visit: null, needsVisit: false }).index, 2);
  assert.deepEqual(desk.steps.map((s) => s.id), today.steps.map((s) => s.id), 'ชื่อขั้นบนรางยังชุดเดิม (คำของงานโต๊ะ = งวด S2b)');

  for (const file of ['src/lib/service/surveyControl.js', 'src/lib/service/surveyJob.js']) {
    const calls = callsOf(stripComments(read(file)), 'requestRailSteps');
    assert.equal(calls.length, 1, file);
    assert.match(calls[0], /\bneedsVisit\b/, file);
  }
});

test('🔑 แถวรายการของการ์ด (surveyZoneFacts) ถามด่านผ่าน applies / ownerOf — พื้นที่จากแบบไม่มีของขาดฝั่งช่าง', () => {
  const part = { widthM: 4, lengthM: 5, heightM: 3, label: null };
  const bare = { id: 'z1', zoneName: 'Studio 01', status: 'ok', parts: [], spots: [], packageQty: null };
  const keys = (facts) => facts.missing.map((g) => `${g.key}:${g.owner}`);

  // ลงหน้างาน (สามแบบของแถว): หกข้อ เจ้าของตามที่ประกาศ — เท่าก่อนงวด S1
  const onsite = ['size:crew', 'wide:crew', 'spots:crew', 'plan:head', 'picked:head', 'package:head'];
  for (const extra of [{}, { method: 'onsite' }, { method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }]) {
    const facts = surveyZoneFacts({ ...bare, ...extra }, []);
    assert.deepEqual(keys(facts), onsite);
    assert.equal(facts.missingCrew.length, 3);
    assert.equal(facts.missingHead.length, 3);
    assert.equal(facts.missingText, 'ขาด: ขนาด · ภาพกว้าง · จุดติดตั้ง');
    assert.deepEqual(facts, surveyZoneFacts(bare, []), 'คีย์ใหม่บนแถวไม่เปลี่ยนผลของแถวลงหน้างาน');
  }

  // จากแบบ: ไม่มีข้อที่ต้องยืนหน้างาน (ภาพกว้าง · จุดติดตั้ง · เลือกจุด) และทุกข้อที่เหลือเป็นของหัวหน้า
  const desk = surveyZoneFacts({ ...bare, method: 'drawing' }, []);
  assert.deepEqual(keys(desk), ['size:head', 'plan:head', 'package:head']);
  assert.deepEqual(desk.missingCrew, []);
  assert.equal(desk.missingHead.length, 3);
  assert.equal(desk.missingText, null, 'ไม่มีบรรทัด "ขาด: …" ของช่างบนพื้นที่ที่ไม่มีช่างไป');
  assert.equal(desk.crewComplete, true);
  assert.equal(desk.ready, false);
  // วัดแล้ว + มีภาพแบบ JPG ⇒ เหลือแค่แพ็คเกจ
  const measured = surveyZoneFacts(
    { ...bare, method: 'drawing', parts: [part], surveyedAt: '2026-10-08T03:00:00Z' },
    [{ docType: 'survey_plan', fileName: 'plan.jpg', mimeType: 'image/jpeg' }],
  );
  assert.deepEqual(keys(measured), ['package:head']);
  // พื้นที่ที่ถูกตัดไม่มีของขาดเลย ไม่ว่าวิธีไหน
  assert.deepEqual(surveyZoneFacts({ ...bare, method: 'drawing', status: 'cut' }, []).missing, []);
});

/* ═══ งวด S2a: ⑦ โมดูลแผน · ⑧ ของงวดหลังยังไม่มี · ตะเข็บทะเบียน ═══════════════════════════════════ */

/** ปลายทางของ import ทุกบรรทัด (รวม import ข้างเดียว และ `export … from`) */
const importsOf = (code) => [...code.matchAll(/\b(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g)]
  .map((m) => m[1] || m[2]);

test('🔴 ⑦ surveyMethodSwitch.js ดึงได้สี่โมดูลเท่านั้น และสามโมดูลต้นน้ำไม่ดึงมันกลับ (กันวงกลม + กันของ server หลุดเข้า bundle)', () => {
  const code = stripComments(read(SWITCH));
  assert.deepEqual(importsOf(code).sort(), [
    '@/lib/format',
    '@/lib/service/survey',
    '@/lib/service/surveyMethod',
    '@/lib/service/visitStatus',
  ]);
  assert.doesNotMatch(code, /\brequire\s*\(/);
  for (const upstream of ['src/lib/service/survey.js', LEAF, 'src/lib/master/attachmentTypes.js']) {
    assert.doesNotMatch(stripComments(read(upstream)), /surveyMethodSwitch/, upstream);
  }
  // ตัวเขียนกับตัวส่งกระดิ่งเป็นของ server: มีแต่ route / โมดูล server ด้วยกันดึง — ไม่มีไฟล์ใต้ components หรือ page.js
  const serverOnly = hits(/surveyMethod(?:Writes|Notify)\b/, { except: [WRITES, 'src/lib/service/surveyMethodNotify.js'] });
  assert.deepEqual(serverOnly, [METHOD_ROUTE, ZONE_ROUTE, 'src/app/api/service/visits/[id]/route.js'].sort());
});

test('⑧ งวด S2a ไม่มีจอ: ไม่มีไฟล์ใต้ src/components หรือ page.js ไหนดึงโมดูลสลับวิธี/ไฟล์เธรดตรง ๆ (งวด S2b เป็นคนต่อ แล้วแก้ลิสต์นี้)', () => {
  const screens = APP.filter(({ file }) => file.startsWith('src/components/') || /\/page\.js$/.test(file));
  assert.ok(screens.length > 100);
  const wired = screens
    .filter(({ code }) => /surveyMethod(?:Switch|Writes|Notify)\b|surveyThreadFiles\b/.test(code))
    .map(({ file }) => file);
  assert.deepEqual(wired, []);
  // ฟังก์ชันจอของงวดนี้ยังไม่มีใครเรียกนอกไฟล์ของมันเอง — เรียกเมื่อไร = มีจอแล้ว ต้องเปิดดูจอจริงก่อนส่ง
  for (const name of ['surveyDrawingZoneView', 'surveySalesDrawingsView', 'deskRescheduleView', 'surveyMethodSwitchGate']) {
    const users = hits(new RegExp(`\\b${name}\\b`));
    assert.ok(users.length >= 1, `${name} ต้องมีอยู่จริง`);
    for (const file of users) assert.ok(file.startsWith('src/lib/'), `${name} ← ${file}`);
  }
});

test('ตะเข็บ C ↔ §2: ป้ายของทะเบียนโซน (confirmTag) คือค่าคงที่ SURVEY_ZONE_TAG ตัวเดียวกับที่จอสลับวิธีใช้', () => {
  const zone = { id: 'ZN1', code: 'ZN-AAAA-01-00001', name: 'Lobby', floor: '1', siteId: 'ST1' };
  const survey = {
    id: 'SZ-1', zoneId: 'ZN1', requestId: 'DR-1', status: 'ok', method: 'drawing',
    createdAt: '2026-10-07T03:00:01Z', surveyedAt: '2026-10-08T03:00:00Z',
    parts: [{ widthM: 10, lengthM: 4, heightM: 3 }], packageQty: 1, packageSize: 'ST',
  };
  const request = { id: 'DR-1', docNo: 'RQ-AS-26100001', status: 'closed', createdAt: '2026-10-07T03:00:00Z', answeredAt: '2026-10-08T04:00:00Z' };
  const row = (zoneRow, surveyConfirm) => zoneRegistryRow(zone, {
    surveys: [zoneRow], requestsById: new Map([['DR-1', { ...request, surveyConfirm }]]),
  });
  const awaiting = row(survey, 'needed');
  assert.equal(awaiting.confirm, 'awaiting');
  assert.equal(awaiting.confirmTag, SURVEY_ZONE_TAG.awaiting);
  const plain = row(survey, 'not_needed');
  assert.equal(plain.confirm, 'drawing');
  assert.equal(plain.confirmTag, SURVEY_ZONE_TAG.drawing);
  assert.notEqual(SURVEY_ZONE_TAG.awaiting, SURVEY_ZONE_TAG.drawing);
  // โซนที่ผลล่าสุดมาจากการลงหน้างาน: ไม่มีป้าย แม้คำร้องจะถือค่าตัวเลือกค้างอยู่
  const onsite = row({ ...survey, method: 'onsite' }, 'needed');
  assert.equal(onsite.confirm, 'none');
  assert.equal(onsite.confirmTag, null);
  // ทะเบียนดึงป้ายจากค่าคงที่ ไม่พิมพ์ข้อความเอง
  assert.match(stripComments(read('src/lib/service/zoneRegistry.js')), /confirmTag: SURVEY_ZONE_TAG\[confirm\] \|\| null/);
});
