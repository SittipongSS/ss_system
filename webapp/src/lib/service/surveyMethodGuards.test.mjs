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
// ⭐ งวด S3 (กระดาษของใบที่มีพื้นที่จากแบบ · สเปก S3 §3 Integrate ข้อ 3):
//   ④ ผู้ถามสวิตช์ + route เอกสาร (ฉบับร่าง) · สองสคริปต์ของกระดาษรับค่าเป็นตัวเลือก ไม่ดึงโมดูลสวิตช์
//   ⑤ ผู้เอ่ยชื่อคอลัมน์ + ภาพนิ่ง / ตัวกรอง / ตัวโหลด / ตัวอย่างกระดาษ (อ่านจากแถวหรืออยู่ในหน่วยความจำ — ไม่มีคำสั่งอ่านใหม่)
//   ⑥ ภาพนิ่งยังรุ่น 1 (คีย์เพิ่มแบบไม่ทำลาย) · ไม่มีคีย์ hold ในโค้ดของกระดาษ · ภาพนิ่ง/ตัวกรองเป็นโมดูลล้วน · ตัวเรนเดอร์ไม่มีตัวเลือกสี
// ⭐ งวด S4 (ฝ่ายขายเลือกวิธีตอนยื่น · สเปก S4 §3 Integrate ข้อ 1) ขยายลิสต์ปิดอีกรอบ — ไฟล์ละหนึ่งเหตุ:
//   ② ผู้เขียน `method` + `surveyIntakeSeed.js` (แถวที่เกิดตอนเปิดใบ + ร่างที่เปลี่ยนวิธี) — สี่จุดเขียน สองจุด onsite
//      (มติเจ้าของ 19/10 · O8 = ข: จุดที่สี่ = ตราการสลับของแถวจากแบบที่มีผลแล้ว ในนามฝ่ายขาย — จุดเดียวที่ประทับ)
//   ④ ผู้ถามสวิตช์ + สาม route ของคำร้อง (สร้าง · GET/แก้/ส่ง · ตัวเลือกของฟอร์มสร้าง)
//   ⑤ ผู้เอ่ยชื่อคอลัมน์: ตัวตั้งวิธีอ่าน `method` / `spots` / `"methodChangedAt"` / `"methodReason"` / `"surveyedAt"` / `"updatedAt"`
//      และประทับสามช่องของการสลับที่จุดเดียว (O8 = ข)
//   ⑦ ผู้ดึงตัวส่งกระดิ่ง + route ของคำร้อง (กระดิ่ง "งานโต๊ะพร้อม" ถึงหัวหน้าตอนส่งใบที่ยื่นเป็นจากแบบ)
//   ใหม่ ⑨ `variant` (สิ่งที่ฝ่ายขายขอ) ไม่ถูกอ่านโดยด่าน/คิว/ราง/ส่งผล/กระดาษ — ไฟล์พวกนั้นอ่านแถวพื้นที่เท่านั้น
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
const QUEUE_REPO = 'src/lib/service/surveyQueueRepo.js';
const WRITES = 'src/lib/service/surveyMethodWrites.js';
// งวด S3 — กระดาษ: ภาพนิ่งหยิบคอลัมน์ของการสลับวิธีจากแถว (`select('*')` ของตัวโหลด) · ตัวกรองพิมพ์ภาคผนวก ง · ตัวโหลดใส่คำตอบลงผู้ส่งที่กำลังจะเขียน
const PAPER_SNAPSHOT = 'src/lib/service/surveyReportSnapshot.js';
const PAPER_VIEW = 'src/lib/service/surveyReportView.js';
const PAPER_INPUTS = 'src/lib/service/surveyReportInputs.js';
// งวด S5 — ตัวอ่าน/เขียนฐานทุกจุดของใบยืนยันหน้างาน
const SURVEY_CONFIRM_REPO = 'src/lib/service/surveyConfirmRepo.js';
const DOCUMENT_ROUTE = 'src/app/api/service/surveys/[id]/document/route.js';
const SCRIPT = 'scripts/check-survey-report-inputs.mjs';
/* งวด S4 (ฝ่ายขายเลือกวิธีตอนยื่น · สเปก S4 §3 Integrate ข้อ 1) — ไฟล์ใหม่ไฟล์เดียวที่เขียน method + สาม route ของคำร้องที่ถามสวิตช์ */
const INTAKE_SEED = 'src/lib/service/surveyIntakeSeed.js';
const REQUESTS_ROUTE = 'src/app/api/sa/requests/route.js';
const FORM_OPTIONS_ROUTE = 'src/app/api/sa/requests/form-options/route.js';

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
  // งวด S4 เพิ่ม `surveyIntakeSeed.js` — แถวที่เกิดตอนเปิดใบ + ร่างที่ฝ่ายขายเปลี่ยนวิธี (ประทับเฉพาะแถวจากแบบที่มีผล · O8 = ข)
  assert.deepEqual(hits(write, { except: [LEAF] }), [ZONE_ROUTE, ZONES_ROUTE, WRITES, INTAKE_SEED].sort());

  // ค่า onsite ถูกเขียนที่ตัวเขียนของแผน + ตัวตั้งวิธีของร่าง — สองเส้นพื้นที่ยังไม่ส่งคีย์นี้ (ใบลงหน้างานได้ payload เท่าก่อน mig)
  const writesOnsite = /\bmethod\s*(?::|=(?!=))\s*(?:SURVEY_METHOD_ONSITE|['"`]onsite['"`])/;
  assert.deepEqual(hits(writesOnsite, { except: [LEAF] }), [WRITES, INTAKE_SEED].sort());
  /* ตัวตั้งวิธีของงวด S4: สี่จุด (ค่าที่ต่อท้ายแถวตอน insert · สองแขนของคำสั่งแก้ร่าง · ตราของแถวที่มีผล) · onsite สองจุด
     (แขนกลับเป็นลงหน้างาน · ตรา) — ⚠️ ทุกจุดเขียนชื่อค่าคงที่ตรง ๆ: `method: want` จะหลบ regex ข้างบน แล้วลิสต์นี้เฝ้าอะไรไม่ได้ */
  const seed = stripComments(read(INTAKE_SEED));
  assert.equal((seed.match(new RegExp(write.source, 'g')) || []).length, 4);
  assert.equal((seed.match(new RegExp(writesOnsite.source, 'g')) || []).length, 2);
  assert.doesNotMatch(seed, /\bmethod\s*:\s*(?!SURVEY_METHOD_)\w/, 'ตัวตั้งวิธีเขียน method ด้วยชื่อค่าคงที่เท่านั้น');
  /* 🔴 ตรา (มติเจ้าของ 19/10 · O8 = ข) มี **จุดเดียว** และเป็นทรงเดียวกับที่หัวหน้าสลับกลับเป็นลงหน้างาน: onsite + สามช่อง + ปลดเลือกจุด
     · เหตุผลเป็นค่าคงที่ของฝ่ายขายเสมอ (ตัวโหลดคิวใช้แยกจากการสลับของหัวหน้า) · ไม่มีทางเขียนตราทิศจากแบบ
     ⇒ แถวที่ไม่มีผลยังอ่านเป็น "เกิดมาแบบนั้น" — พฤติกรรมจริงล็อกที่ `surveyIntakeSeed.test.mjs` */
  assert.equal((seed.match(/\bmethodChangedAt\s*:/g) || []).length, 1);
  assert.equal((seed.match(/\bmethodChangedByName\s*:/g) || []).length, 1);
  assert.equal((seed.match(/\bmethodReason\s*:/g) || []).length, 1);
  assert.doesNotMatch(seed, /"methodChangedAt"\s*:/);
  assert.match(seed, /method: SURVEY_METHOD_ONSITE,\s*methodReason: SURVEY_INTAKE_SWITCH_REASON,\s*methodChangedAt: updatedAt,\s*methodChangedByName: text\(actorName\) \|\| null,\s*spots: unselectedSpots\(row\),\s*updatedAt,\s*\}/);
  assert.doesNotMatch(seed, /method: SURVEY_METHOD_DRAWING,\s*methodReason/, 'ไม่มีตราทิศจากแบบ');
  // ตัวตั้งวิธีเป็นของ server: ผู้ดึงอยู่ใต้ src/app/api/ เท่านั้น (จอไม่เคยเขียนวิธีของแถวพื้นที่เอง)
  const seedImporters = hits(/surveyIntakeSeed\b/, { except: [INTAKE_SEED] });
  assert.deepEqual(seedImporters, [REQUESTS_ROUTE, REQUEST_ROUTE].sort());
  for (const file of seedImporters) assert.ok(file.startsWith('src/app/api/'), file);
  /* ตัว insert ของแถวพื้นที่รับคีย์จากตัวตั้งวิธีมาต่อท้าย — ไม่มีค่าของวิธีเป็นสตริงเอง · ไฟล์ตัดสินคำของรายการพื้นที่ก็เช่นกัน
     (zonePickState เทียบ `assessMethod` ของทะเบียนโซนกับค่าคงที่มาตั้งแต่งวด S2b — นั่นคือการอ่าน ไม่ใช่สตริงค่าวิธี) */
  for (const file of ['src/lib/service/surveyRepo.js', 'src/lib/service/zonePickState.js']) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /['"`](?:drawing|onsite)['"`]/, file);
    assert.doesNotMatch(code, write, file);
  }
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
  // + งวด S3: route เอกสาร — ฉบับร่างส่งค่าสวิตช์ให้ตัวโหลดอินพุต (`drawingMethodEnabled`) เหมือนรอบตรวจตอนส่งผล
  // งวด S4: + สาม route ของคำร้อง — สร้าง (ตีกลับ drawing ตอนปิด) · GET/แก้/ส่ง (คีย์ drawingMethodEnabled ของฟอร์มแก้) · ตัวเลือกของฟอร์มสร้าง
  assert.deepEqual(
    importers,
    [METHOD_ROUTE, SHEET_ROUTE, SEND_ROUTE, ZONE_ROUTE, DOCUMENT_ROUTE, REQUESTS_ROUTE, REQUEST_ROUTE, FORM_OPTIONS_ROUTE].sort(),
    'ผู้ใช้สวิตช์ใหม่ = เพิ่มในลิสต์นี้ และต้องอยู่ใต้ src/app/api/',
  );
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

  // งวด S3: สองสคริปต์ของกระดาษรับค่าสวิตช์เป็นตัวเลือก (`drawingMethodEnabled`) — ไม่ดึงโมดูลสวิตช์ ไม่อ่าน env ของมัน
  for (const script of ['scripts/render-survey-report.mjs', SCRIPT]) {
    const code = stripComments(read(script));
    assert.doesNotMatch(code, /surveyDrawingFlag|surveyDrawingMethodEnabled|SURVEY_DRAWING_METHOD/, script);
    assert.match(code, /\bdrawingMethodEnabled\b/, `${script}: ต้องส่งค่าสวิตช์ให้ตัวโหลดเอง`);
  }
});

/* ═══ ⑤ คอลัมน์ใหม่ที่ถูกเอ่ยชื่อในคำสั่งอ่าน ═════════════════════════════════════════════════ */

test('คอลัมน์ของ mig 0408: จุดที่ระบุชื่อในคำสั่งอ่านเป็นลิสต์ปิด (สามจุดของพื้นที่ + หนึ่งจุดของคำร้อง) · ผู้เอ่ยชื่อรายคอลัมน์เป็นลิสต์ปิด', () => {
  const COLUMNS = 'id, "requestId", status, method';
  /* งวด S2b: ตัวโหลดคิวอ่านเพิ่มสองคอลัมน์ (เหตุผล + เวลาของการสลับวิธี) — การ์ดของใบที่หัวหน้าสลับกลับเป็นลงหน้างานบอกที่มา
     · `visitsRepo.js` ยังใช้สี่คอลัมน์ชุดเดิม */
  const QUEUE_COLUMNS = `${COLUMNS}, "methodReason", "methodChangedAt"`;
  assert.ok(read('src/lib/service/surveyQueueRepo.js').includes(`export const SURVEY_QUEUE_ZONE_COLUMNS = '${QUEUE_COLUMNS}';`));
  // visitsRepo: สองจุด (สถานะตีกลับของนัด + ตัวนับพื้นที่ของหน้างานของฉัน — งวด S2a เพิ่มจุดหลัง)
  const visits = stripComments(read('src/lib/service/visitsRepo.js'));
  assert.equal(visits.split(`.select('${COLUMNS}')`).length - 1, 2);
  /* ลิสต์คอลัมน์ในสตริงที่มีคำว่า method เป็นคอลัมน์ (คั่นด้วยจุลภาค) — มีได้แค่สองไฟล์นั้น */
  const namedInList = /['"`][^'"`\n]*,\s*method\s*(?:,[^'"`\n]*)?['"`]/;
  // งวด S4: + ตัวตั้งวิธีของร่าง (อ่าน method / methodChangedAt / surveyedAt ก่อนตัดสินว่าจะเขียนไหม)
  //   O8 = ข (19/10): + spots (ปลดเลือกจุดตอนประทับ) · methodReason (แยกตราของฝ่ายขายจากการสลับของหัวหน้า) · updatedAt (ผูกรุ่นที่อ่าน)
  assert.deepEqual(hits(namedInList), ['src/lib/service/surveyQueueRepo.js', 'src/lib/service/visitsRepo.js', INTAKE_SEED].sort());
  assert.ok(read(INTAKE_SEED).includes(`.select('id, method, spots, "methodChangedAt", "methodReason", "surveyedAt", "updatedAt"')`));

  // surveyConfirm ถูกระบุชื่อในคำสั่งอ่านสองจุด: คำร้องที่ค้างของทะเบียนโซนลูกค้า (ป้าย "รอยืนยันหน้างาน")
  // + งวด S5 §2.6 (b): ตัวอ่านของใบยืนยันหน้างาน — ใบแม่ของแถวพื้นที่ (`"surveyConfirm"` ตัดสินว่ายังรอยืนยันไหม)
  //   ⚠️ regex ไม่มีขอบคำ ⇒ คอลัมน์ที่กลุ่ม C เพิ่มให้ route ทะเบียนลูกค้ายังนับเป็นจุดเดิม
  assert.deepEqual(hits(/select\([^)]*surveyConfirm[^)]*\)/), [CUSTOMER_ZONES_ROUTE, SURVEY_CONFIRM_REPO].sort());

  /* ผู้เอ่ยชื่อคอลัมน์นอกโมดูลใบ — ทุกไฟล์อ่านจากแถว `select('*')` หรือเขียนลง patch (ไม่ใช่คำสั่งอ่านที่ระบุชื่อ)
     เพิ่มไฟล์ = เพิ่มในลิสต์นี้พร้อมเหตุ */
  const NAMED = {
    // แผนอ่านสองช่องนี้จากแถวเพื่อแยก "กดซ้ำของการกระทำเดิม" ออกจาก "มีคนอื่นสลับไปแล้ว" · ตัวเขียนเป็นคนประทับ
    // + ตัวโหลดคิว (งวด S2b): บรรทัดที่มา "หัวหน้าเปลี่ยนเป็นลงหน้างาน: {เหตุผล}" บนการ์ดของผู้วางคิว — อ่านอย่างเดียว
    // + กระดาษ (งวด S3): ภาพนิ่งเก็บเหตุผล/คนสลับ/เวลาสลับ · ตัวกรองพิมพ์แถว "วิธีประเมินรายพื้นที่" ของฉบับภายใน — อ่านอย่างเดียว
    // + ตัวตั้งวิธีของร่าง (O8 = ข · 19/10): ประทับตราของฝ่ายขาย + อ่านเพื่อแยกตราของตัวเองจาก "หัวหน้าสลับแล้ว"
    // + ตารางพื้นที่ของหน้าคำร้อง (UAT S4 รอบ 4 ข้อ 17 · `surveyJob.js`): แถวที่ถือตราของฝ่ายขายและยังไม่ถูกวัดทับได้ป้าย
    //   "จากแบบ · รอวัดใหม่" — อ่านจากแถว `select('*')` อย่างเดียว ไม่เขียน
    methodReason: [SWITCH, WRITES, QUEUE_REPO, PAPER_SNAPSHOT, PAPER_VIEW, INTAKE_SEED, 'src/lib/service/surveyJob.js'],
    methodChangedByName: [SWITCH, WRITES, PAPER_SNAPSHOT, PAPER_VIEW, INTAKE_SEED],
    // เส้นแก้พื้นที่: ช่างเขียนทับพื้นที่ที่หัวหน้าเพิ่งสลับ ⇒ 409 (ไม่ใช่ 403) · ตัวเขียนเป็นคนประทับ
    // + ตัวโหลดคิว (งวด S2b): เลือกพื้นที่ที่ถูกสลับล่าสุด — อ่านอย่างเดียว
    // + ตัวตั้งวิธีของร่าง (งวด S4): แถวที่หัวหน้าสลับแล้วไม่ถูกตั้งทับ (`'switched'`) · ประทับแถวจากแบบที่มีผล (O8 = ข · 19/10)
    methodChangedAt: [ZONE_ROUTE, WRITES, QUEUE_REPO, PAPER_SNAPSHOT, PAPER_VIEW, INTAKE_SEED],
    // เขียน: ส่งผล (เฉพาะใบที่มีพื้นที่จากแบบ) · ดึงกลับ/เปิดใหม่ (ล้างเป็น NULL) — อ่าน: ทะเบียนโซน · แบนเนอร์ของฝ่ายขาย · ด่าน/ข้อความตอนส่ง
    // + หน้าใบประเมิน (งวด S2b): ใส่ตัวเลือกของสองไทล์ลง body ตอนส่งผล — เขียนผ่าน route ส่งผลเท่านั้น ไม่อ่านคอลัมน์
    surveyConfirm: [
      REQUEST_ROUTE, CUSTOMER_ZONES_ROUTE, RECALL_ROUTE, SEND_ROUTE, 'src/app/service/surveys/[id]/page.js',
      'src/lib/service/surveyJob.js', 'src/lib/service/surveySendClose.js',
      // + กระดาษ (งวด S3): ภาพนิ่ง (`request.surveyConfirm`) · ตัวกรอง (กล่องหมายเหตุ · แถว "ยืนยันหน้างานภายหลัง") ·
      //   รอบตรวจก่อนส่งผลรับคำตอบจากกล่องส่งผลเป็นตัวเลือก — ไม่มีคำสั่งอ่านที่เอ่ยชื่อคอลัมน์
      PAPER_SNAPSHOT, PAPER_VIEW, PAPER_INPUTS,
      // + ตัวอย่างกระดาษของหน้าตั้งค่า (งวด S3 กลุ่ม C): คำร้องตัวอย่างในหน่วยความจำพก `surveyConfirm: 'needed'`
      //   ให้กล่องหมายเหตุพิมพ์ท้ายประโยค — ไม่อ่านคอลัมน์ ไม่เขียนฐาน
      'src/lib/service/surveyReportPreview.js',
      // + ใบยืนยันหน้างาน (งวด S5 §2.6 d): ตัวจัดสภาพพื้นที่และตัวตัดสินปุ่มเทียบ `=== 'needed'` ตรงตัว — ฟังก์ชันล้วน ไม่อ่านฐาน
      'src/lib/service/surveyConfirmLink.js',
      // + ตัวอ่านของใบยืนยันหน้างาน (งวด S5 §2.6 d): ใบแม่ของแถวพื้นที่อ่านคอลัมน์นี้ · ตัวโหลดของหน้าคำร้องถามก่อนยิงคำสั่ง
      SURVEY_CONFIRM_REPO,
    ],
  };
  for (const [column, files] of Object.entries(NAMED)) {
    assert.deepEqual(hits(new RegExp(`\\b${column}\\b`), { except: [LEAF] }), [...files].sort(), column);
  }
  /* ผูกใบยืนยันหน้างานกับใบต้นทาง (งวด S5 §2.6 a) — ผู้เอ่ยชื่อคอลัมน์ต้องอยู่ในลิสต์ปิด · ทุกไฟล์ในลิสต์ยังไม่ต้องมีครบ
     (กลุ่ม A–F ทยอยเข้า) — ตัวตรวจแบบตรงทั้งชุดอยู่ใน `surveyConfirmGuards.test.mjs` ของ Integrate
     ⚠️ ตัวจัดสภาพ `surveyConfirmLink.js` **ไม่อยู่ในลิสต์** — ตัดสิน "ผูกแล้ว" จาก id ของ `children` ที่ตัวอ่านคัดมาด้วยคอลัมน์นี้ (F7) */
  const SURVEY_CONFIRM_OF_FILES = [
    SURVEY_CONFIRM_REPO,
    'src/lib/service/zoneRegistry.js',
    REQUESTS_ROUTE,
    REQUEST_ROUTE,
    SHEET_ROUTE,
    SEND_ROUTE,
    RECALL_ROUTE,
    CUSTOMER_ZONES_ROUTE,
  ];
  assert.deepEqual(hits(/\bsurveyConfirmOfId\b/).filter((f) => !SURVEY_CONFIRM_OF_FILES.includes(f)), [], 'งวด S5 — ลิสต์ปิด');

  // เปิดใบใหม่ใช้ร่วมทุกชนิดคำร้อง — คีย์ surveyConfirm ถูกใส่เฉพาะคำร้องประเมินพื้นที่
  assert.match(stripComments(read(REQUEST_ROUTE)), /if \(before\.kind === 'site_survey'\) patch\.surveyConfirm = null;/);
  // ส่งผล: คีย์ถูกใส่เฉพาะใบที่มีพื้นที่จากแบบ (ใบลงหน้างานได้ patch เท่าเดิม — เทสต์โกลเดนยืนยันด้วยพฤติกรรม)
  assert.match(stripComments(read(SEND_ROUTE)), /if \(methodMix\.drawing > 0\) patch\.surveyConfirm = body\?\.surveyConfirm;/);
});

/* ═══ ⑥ กระดาษ ═══════════════════════════════════════════════════════════════════════════ */

test('ภาพนิ่งของเอกสารประเมินยังรุ่น 1 — งวด S3 เพิ่มคีย์แบบไม่ทำลาย (รุ่นไม่ขยับ) · ไฟล์กระดาษไม่ดึงโมดูลสลับวิธี', () => {
  assert.equal(SURVEY_REPORT_SNAPSHOT_VERSION, 1);
  // ไฟล์ของเอกสารไม่รู้จักโมดูลสลับวิธีเลย (งวด S3 ถามวิธีผ่าน surveyMethod.js · ข้อความ "ยังไม่ได้เลือก…" ก๊อปเป็นค่าคงที่ของตัวเอง)
  const paper = APP.filter(({ file }) => /\/surveyReport\w*\.js$/.test(file));
  assert.ok(paper.length >= 5);
  for (const { file, code } of paper) assert.doesNotMatch(code, /surveyMethod(?:Switch|Writes|Notify)\b/, file);
});

/* งวด S3 ถอดข้อกันเอกสารของ S1 (ค่าคงที่ · ธง `hold` · ผู้อ่านธงทุกตัว) — คำว่า hold ต้องไม่เหลือเป็นคีย์/ตัวแปรในโค้ดของกระดาษ
   ⚠️ ใช้ขอบคำ: route เอกสารดึง `printPlaceholderHtml` ซึ่งมีตัวอักษร h-o-l-d อยู่กลางคำ */
test('งวด S3: route ออกเอกสารไม่ส่งธง hold แล้ว — ผลออกเอกสารทุกแบบได้คีย์ชุดเดียว', () => {
  const route = stripComments(read(DOCUMENT_ROUTE));
  assert.doesNotMatch(route, /\bhold\b/);
  assert.match(route, /printPlaceholderHtml/, 'ตัวอย่างของคำที่มีตัวอักษรชุดนี้กลางคำยังอยู่ — ยามต้องใช้ขอบคำ');
});

test('งวด S3: ไม่มีคีย์ hold ถูกสร้างหรืออ่านในไฟล์กระดาษ · หน้าจอเอกสาร · route เอกสาร · สองสคริปต์', () => {
  const files = [
    ...APP.filter(({ file }) => /^src\/lib\/service\/surveyReport\w*\.js$/.test(file)).map(({ file }) => file),
    'src/lib/service/surveyDocumentView.js', DOCUMENT_ROUTE, 'scripts/render-survey-report.mjs', SCRIPT,
  ];
  assert.ok(files.length >= 14, 'ต้องเดินเจอไฟล์กระดาษจริง');
  for (const file of files) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /\bhold\b/, file);
    assert.doesNotMatch(code, /DRAWING_HOLD|drawingHold|PAPER_HOLD|signHold/, file);
  }
});

test('งวด S3: ภาพนิ่ง/ตัวกรองของกระดาษเป็นโมดูลล้วน — ไม่ดึง server-only ไม่ดึงตัวอ่านสวิตช์ · ตัวเรนเดอร์ไม่มีตัวเลือกสี', () => {
  for (const file of [PAPER_SNAPSHOT, PAPER_VIEW]) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /server-only|from 'node:|from "node:/, file);
    assert.doesNotMatch(code, /surveyDrawingFlag|surveyDrawingMethodEnabled|process\.env/, file);
    // ทุก import ของไฟล์ — ไม่มีโมดูลไหนที่มีคำว่า Repo / Writes / Flag (ตัวแตะฐานและตัวอ่านสวิตช์)
    const imports = [...code.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((m) => m[1]);
    assert.ok(imports.length >= 5, `${file}: ต้องอ่าน import ได้จริง`);
    for (const from of imports) assert.doesNotMatch(from, /Repo$|Writes$|Flag$|server/, `${file} ← ${from}`);
  }
  const renderer = stripComments(read('src/lib/service/surveyReportDocument.js'));
  const signature = renderer.match(/export function renderSurveyReportHTML\(\{([\s\S]*?)\} = \{\}\)/);
  assert.ok(signature, 'ต้องเจอหัวฟังก์ชันของตัวเรนเดอร์');
  assert.doesNotMatch(signature[1], /accentKey/, 'สีมาจากฉบับของ view ทางเดียว');
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

test('🔴 ⑦ surveyMethodSwitch.js ดึงได้ห้าโมดูลเท่านั้น และสามโมดูลต้นน้ำไม่ดึงมันกลับ (กันวงกลม + กันของ server หลุดเข้า bundle)', () => {
  const code = stripComments(read(SWITCH));
  assert.deepEqual(importsOf(code).sort(), [
    '@/lib/format',
    '@/lib/service/queueWords', // S2b แก้หลังตรวจจอ head-r3-21: ตัวจัดรูปวันบนจอ (ไฟล์ใบ — ไม่มีวงกลม)
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
  // งวด S4: + route ของคำร้อง — กระดิ่ง `notifySurveyDeskReady` ถึงหัวหน้าตอนส่งใบที่ทุกพื้นที่เป็นจากแบบ (สเปก S4 A-6 ⑤)
  assert.deepEqual(serverOnly, [METHOD_ROUTE, ZONE_ROUTE, 'src/app/api/service/visits/[id]/route.js', REQUEST_ROUTE].sort());
  assert.deepEqual(importsOf(stripComments(read(REQUEST_ROUTE))).filter((m) => /surveyMethod(?:Writes|Notify)\b/.test(m)), ['@/lib/service/surveyMethodNotify']);
});

/* ═══ ⑧ จอที่ต่อกับโมดูลสลับวิธี — ลิสต์ปิดของงวด S2b ═══════════════════════════════════════════════════════════
   งวด S2a ไม่มีจอ (ลิสต์ว่าง) · งวด S2b ต่อจอ: ไฟล์จอที่ดึง `surveyMethodSwitch` ได้คือไฟล์ที่สเปก S2b §3 กลุ่ม A–E ระบุชื่อเท่านั้น
   (คำ · ค่าคงที่ · ตัวตัดสินของปุ่ม — ไฟล์ล้วน ไม่มีของ server) · เพิ่มจอ = เพิ่มในลิสต์นี้พร้อมเหตุ
   🔴 ตัวเขียน · ตัวส่งกระดิ่ง · ตัวโหลดไฟล์เธรด เป็นของ server — **ไม่มีจอไหนดึงได้** ไม่ว่างวดไหน
   ⚠️ ลิสต์นี้เป็น "เพดาน" (จอนอกลิสต์ห้ามดึง) — ข้อ "ฟังก์ชันจอทั้งสี่ต้องมีผู้เรียกนอก src/lib อย่างน้อยหนึ่งราย" เป็นของขั้นรวมงาน
      (Integrate เติมหลังห้ากลุ่มต่อจอครบ — ตอนที่ชิ้นส่วนกลางลงก่อน จอยังไม่ได้เรียก) */
const S2B_SWITCH_SCREENS = [
  // A — หน้าใบประเมิน · โมดัลเปลี่ยนวิธี
  'src/app/service/surveys/[id]/page.js',
  'src/components/service/SurveyMethodDialog.js',
  // B — รายการพื้นที่ · หน้าพื้นที่ · แผงแบบจากฝ่ายขาย
  'src/components/service/SurveyZoneList.js',
  'src/components/service/SurveyZonePage.js',
  'src/components/service/SurveySalesDrawings.js',
  // C — ตารางสรุปส่งผล · การ์ดจัดการผล
  'src/components/service/SurveyResultTable.js',
  'src/components/service/SurveyControlCard.js',
  // D — หน้าคำร้อง
  'src/components/requests/CommitDueDialog.js',
  'src/app/requests/[id]/page.js',
  'src/components/requests/details/SurveyRequestView.js',
  'src/components/requests/details/SurveyDetail.js',
  // E — หน้าจัดคิว · ป้ายปลายน้ำ
  'src/components/service/ScheduleQueueCard.js',
  'src/app/service/schedule/page.js',
  'src/components/requests/SurveySiteFields.js',
  'src/components/service/CustomerZonesPanel.js',
  'src/components/salesPlanning/serviceSetup/ServiceSetupGrid.js',
  'src/components/service/ZonesBulkModal.js',
  'src/components/service/zonesBulkPlan.js',
];

test('⑧ งวด S2b: จอที่ดึงโมดูลสลับวิธีเป็นลิสต์ปิด (กลุ่ม A–E ของสเปก) · ตัวเขียน / กระดิ่ง / ไฟล์เธรด ไม่มีจอไหนดึง', () => {
  const screens = APP.filter(({ file }) => file.startsWith('src/components/') || /\/page\.js$/.test(file));
  assert.ok(screens.length > 100);
  const using = (pattern) => screens.filter(({ code }) => pattern.test(code)).map(({ file }) => file);
  const outside = using(/surveyMethodSwitch\b/).filter((file) => !S2B_SWITCH_SCREENS.includes(file));
  assert.deepEqual(outside, [], 'จอนอกลิสต์ของงวด S2b ดึงโมดูลสลับวิธี');
  assert.deepEqual(using(/surveyMethod(?:Writes|Notify)\b|surveyThreadFiles\b/), [], 'ของ server ห้ามเข้า bundle ของจอ');
  // เส้นคัดลอกไฟล์ของฝ่ายขาย (งวด S2b) ก็เป็นของ server — จอเรียกผ่านตัวช่วยฝั่งเบราว์เซอร์ `surveyPlanReuse` เท่านั้น
  assert.deepEqual(using(/surveyPlanCopy\b/), []);
  /* ฟังก์ชันจอของงวด S2a — ผู้เรียกนอก src/lib ต้องเป็นจอในลิสต์เท่านั้น (จอที่ต่อแล้วต้องถูกเปิดดูจริงก่อนส่ง) */
  for (const name of ['surveyDrawingZoneView', 'surveySalesDrawingsView', 'deskRescheduleView', 'surveyMethodSwitchGate']) {
    const users = hits(new RegExp(`\\b${name}\\b`));
    assert.ok(users.length >= 1, `${name} ต้องมีอยู่จริง`);
    for (const file of users) {
      assert.ok(file.startsWith('src/lib/') || S2B_SWITCH_SCREENS.includes(file), `${name} ← ${file}`);
    }
    /* จอของงวด S2b ต่อครบแล้ว — ตัวตัดสินทุกตัวต้องมีจอเรียกจริงอย่างน้อยหนึ่งจอ (ตัวตัดสินที่ไม่มีใครเรียก = จอวาดเอง) */
    /* ด่านของปุ่ม "เปลี่ยนวิธีประเมิน" ถูกเรียกที่ตัวตัดสินของการ์ด (`surveyControl.js` → `view.method`) จอจึงอ่านผ่านคีย์นั้น
       ไม่ได้เรียกชื่อฟังก์ชันเอง — ตรวจผู้ใช้คีย์แทน (ข้างล่าง) */
    if (name === 'surveyMethodSwitchGate') continue;
    assert.ok(users.some((file) => !file.startsWith('src/lib/')), `${name} ยังไม่มีจอไหนเรียก`);
  }
  assert.match(stripComments(read('src/lib/service/surveyControl.js')), /method: surveyMethodSwitchGate\(request, \{ canSwitch: canDecide, enabled: methodOn \}\),/);
  const gateReaders = screens.filter(({ code }) => /\bview\.method\.(?:show|allowed|reason)\b/.test(code)).map(({ file }) => file).sort();
  assert.deepEqual(gateReaders, ['src/app/service/surveys/[id]/page.js', 'src/components/service/SurveyControlCard.js']);
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

/* ═══ งวด S4: ⑨ `variant` = สิ่งที่ฝ่ายขายขอ — ด่าน/คิว/ราง/ส่งผล/กระดาษ ไม่อ่าน ══════════════════════════════
   หัวหน้าสลับวิธีรายพื้นที่ได้หลังรับเรื่อง (S2a) โดย `variant` ไม่ขยับ ⇒ ตัวตัดสินที่อ่าน `variant` จะขัดกับแถวพื้นที่
   (ใบ RQ-AS-26100312: variant = standard · ทุกพื้นที่จากแบบ) · ตัวตอบ "ต้องไปไหม" มีตัวเดียว = `surveyNeedsVisit`
   ข้อยกเว้นที่ตั้งใจ: `survey.js` รับ **พารามิเตอร์** ชื่อ variant (ข้อความ 409 ใบเปล่าของ route ปิดนัด · V14) ไม่ใช่การอ่าน `.variant` */
test('⑨ งวด S4: ไฟล์ด่าน · คิว · ราง · ส่งผล · กระดาษ · ตัวเลือกพื้นที่ ไม่อ่าน `.variant` (จำนวนเท่าก่อนงวด S4 = 0)', () => {
  const gates = [
    'src/lib/service/survey.js',
    'src/lib/service/surveyQueue.js',
    'src/lib/requests/requestRail.js',
    'src/lib/service/surveySendClose.js',
    'src/lib/service/zonePickState.js',
    'src/lib/service/surveyMethod.js',
    'src/lib/service/surveyMethodSwitch.js',
    ...APP.filter(({ file }) => /^src\/lib\/service\/surveyReport\w*\.js$/.test(file)).map(({ file }) => file),
  ];
  assert.ok(gates.length >= 12, 'ต้องเจอไฟล์กระดาษจริง');
  for (const file of gates) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /\.variant\b/, file);
    assert.doesNotMatch(code, /\bvariant\s*\]/, `${file} — อ่านผ่าน ['variant'] ก็นับ`);
  }
  // survey.js: พารามิเตอร์ตัวเดียว ใช้ที่ข้อความใบเปล่า — ไม่เข้าด่านรายพื้นที่
  const survey = stripComments(read('src/lib/service/survey.js'));
  assert.equal((survey.match(/\bvariant\b/g) || []).length, 2, 'ประกาศพารามิเตอร์ + เทียบหนึ่งครั้งในกิ่งใบเปล่า');
  assert.match(survey, /export function surveyFieldSubmitError\(rows = \[\], filesByZone = \{\}, \{ variant = null \} = \{\}\)/);
  // กระดาษอ่าน "วันที่อยากให้เข้า" ผ่านตัวอ่านเดียว (D-7) — ไม่อ่านคอลัมน์ requestedDueDate ตรง ๆ
  const snapshot = stripComments(read('src/lib/service/surveyReportSnapshot.js'));
  assert.match(snapshot, /requestedDueDate: dayOnly\(wish\.date\), requestedDueTime: hhmm\(wish\.time\),/);
  assert.doesNotMatch(snapshot, /r\.requestedDueDate|r\.requestedDueTime/);
});

test('⑨ งวด S4: ตัวอ่าน "ฝ่ายขายขออะไร" (`surveyIntake.js`) เป็นโมดูลล้วน — ไม่อ่านสวิตช์ ไม่แตะฐาน · ดึงได้โมดูลเดียว', () => {
  const code = stripComments(read('src/lib/service/surveyIntake.js'));
  assert.deepEqual(importsOf(code), ['@/lib/service/surveyMethodSwitch']);
  assert.doesNotMatch(code, /process\.env|supabase|\.from\(|surveyDrawingFlag/);
  // survey.js / surveyMethod.js อยู่ต้นน้ำของมัน (ผ่านโมดูลสลับวิธี) — ดึงกลับ = วงจร import ค่าเป็น undefined เงียบ ๆ
  for (const upstream of ['src/lib/service/survey.js', LEAF, 'src/lib/service/visitStatus.js', 'src/lib/format.js']) {
    assert.doesNotMatch(stripComments(read(upstream)), /surveyIntake\b/, upstream);
  }
});
