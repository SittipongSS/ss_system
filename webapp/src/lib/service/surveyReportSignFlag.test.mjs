// ── สวิตช์ลายเซ็นจริงของรายงานการประเมินพื้นที่ (PR-SIG §1) ──────────────────────────────────────
//
// ⭐ ล็อกสองเรื่อง: ① เปิดด้วยคำว่า `on` คำเดียว — ค่าอื่นทุกค่าปิด  ② ตัวแปรถูกอ่านไฟล์เดียว และผู้ดึงไฟล์นั้นเป็นลิสต์ปิด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { surveyReportSignaturesOn } from './surveyReportSignFlag.js';

const KEY = 'SURVEY_REPORT_SIGNATURES';

function withEnv(value, run) {
  const before = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  try { return run(); } finally {
    if (before === undefined) delete process.env[KEY];
    else process.env[KEY] = before;
  }
}

test('เปิดด้วยคำว่า on คำเดียว (ไม่สนตัวพิมพ์/ช่องว่างหัวท้าย) — ค่าอื่นทุกค่าปิด', () => {
  for (const on of ['on', 'ON', ' On ', 'on\n']) assert.equal(withEnv(on, surveyReportSignaturesOn), true, JSON.stringify(on));
  for (const off of [undefined, '', ' ', '1', 'true', 'yes', 'enabled', 'required', 'o n', 'on1', 'onn', 'off', '0']) {
    assert.equal(withEnv(off, surveyReportSignaturesOn), false, JSON.stringify(off));
  }
});

test('อ่าน env ทุกครั้งที่ถูกเรียก — ไม่จำค่าไว้ตอนโหลดโมดูล (สลับสวิตช์แล้ว redeploy ไม่ต้องพึ่งลำดับการโหลด)', () => {
  assert.equal(withEnv('on', surveyReportSignaturesOn), true);
  assert.equal(withEnv(undefined, surveyReportSignaturesOn), false);
  assert.equal(withEnv('on', surveyReportSignaturesOn), true);
});

/* เดินทุกไฟล์ของแอป (ไม่รวมเทสต์) — คอมเมนต์ถูกตัดก่อนค้น */
const WEBAPP = process.cwd();
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.m?js$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) out.push(full);
  }
  return out;
}
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w\\])\/\/[^\n]*/g, '$1');
const APP = [...walk(join(WEBAPP, 'src')), ...walk(join(WEBAPP, 'scripts'))]
  .map((file) => ({ file: file.slice(WEBAPP.length + 1), code: strip(readFileSync(file, 'utf8')) }));

test('🔴 ตัวแปร SURVEY_REPORT_SIGNATURES ถูกอ่านไฟล์เดียว — โมดูลล้วนไม่อ่าน env', () => {
  const readers = APP.filter(({ code }) => code.includes(KEY)).map(({ file }) => file);
  assert.deepEqual(readers, ['src/lib/service/surveyReportSignFlag.js']);
  // โมดูลล้วนของกติกานี้ไม่แตะ `process.env` เลย — ตัดสินจาก `inputs.signatureRule`
  for (const pure of ['surveyReportSigners.js', 'surveyReportSnapshot.js', 'surveyReportView.js', 'surveyReportDocument.js']) {
    const hit = APP.find(({ file }) => file === `src/lib/service/${pure}`);
    assert.ok(hit, pure);
    assert.doesNotMatch(hit.code, /process\.env/, pure);
  }
});

test('🔴 ผู้ดึงไฟล์สวิตช์เป็นลิสต์ปิด — ตัวโหลดอินพุต (และสรุปของ GET ใบประเมินเมื่องวด B ต่อสาย) · ไม่มีจอ ไม่มีโมดูลล้วน', () => {
  const importers = APP.filter(({ file, code }) => /surveyReportSignFlag/.test(code) && !file.endsWith('surveyReportSignFlag.js'))
    .map(({ file }) => file).sort();
  /* ผู้อ่านคนที่สาม (รอบแก้ผลรีวิว 09/10): ยามผู้รับผิดชอบของนัดประเมิน — นัดที่ปิดแล้วเปลี่ยนผู้ประเมินไม่ได้ และรหัสต้องเป็นบัญชีฝ่ายบริการ
     ทำงานเฉพาะตอนกติกาเปิด (ปิด = PATCH นัดเดินเหมือนเดิมทุกก้าว) จึงต้องถามสวิตช์เอง · ไฟล์ฝั่ง server ล้วน ไม่มีจอ */
  const ALLOWED = [
    'src/lib/service/surveyReportInputs.js', 'src/lib/service/surveyReportRows.js', 'src/lib/service/surveyVisitAssignee.js',
  ];
  assert.ok(importers.includes('src/lib/service/surveyReportInputs.js'), 'ตัวโหลดอินพุตต้องเป็นคนอ่านสวิตช์');
  for (const file of importers) assert.ok(ALLOWED.includes(file), `${file} ไม่ควรอ่านสวิตช์ลายเซ็นเอง — รับ signatureRule จากตัวโหลด`);
  // harness กับสคริปต์ตรวจส่ง `signatureRule` ตรง ๆ — ไม่ดึงไฟล์สวิตช์ ไม่สลับ env
  for (const script of ['scripts/render-survey-report.mjs', 'scripts/check-survey-report-inputs.mjs']) {
    assert.ok(!importers.includes(script), script);
  }
});
