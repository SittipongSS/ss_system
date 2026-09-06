import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canOpenSurveySheet, surveyReadError } from './surveyAccess.js';

const survey = { id: 'REQ-1', dept: 'TS', requestedById: 'sa-1' };
const tech = { id: 'u-tech', role: 'ts', department: 'TS' };
const senior = { id: 'u-senior', role: 'ts_senior', department: 'TS' };
const head = { id: 'u-head', role: 'ts_manager', department: 'TS' };
const sa = { id: 'sa-1', role: 'ae', department: 'SALES' };
const rd = { id: 'u-rd', role: 'rd', department: 'RD' };

/* 🐞 **บั๊กที่เทสต์ชุดนี้ถูกเขียนขึ้นมาเพราะมัน (UAT 06/09/2026)** — ด่านอ่านเดิมเป็น
   `canViewRequests` ล้วน ซึ่ง role `ts` ตอบ false ⇒ ช่างที่จอนี้ทำมาให้เขาใช้ เปิดไม่ได้ */
test('🐞 ช่างหน้างานต้องเปิดใบประเมินของฝ่ายตัวเองได้', () => {
  assert.equal(surveyReadError(tech, survey), null);
  assert.equal(surveyReadError(senior, survey), null);
  assert.equal(surveyReadError(head, survey), null);
  assert.equal(canOpenSurveySheet(tech), true);
});

test('เจ้าของใบฝั่งฝ่ายขายยังเปิดได้เหมือนเดิม', () => {
  assert.equal(surveyReadError(sa, survey), null);
});

/* ⚠️ **ไม่ใช่การเปิดให้อ่านทุกใบ** — ด่านรายแถวยังทำงาน */
test('🔴 คนนอกโมดูลและใบที่ไม่ได้ส่งถึงฝ่ายเรา ต้องอ่านไม่ได้', () => {
  // RD ถือ cap คำร้องของฝ่ายตัวเอง แต่ใบนี้เป็นของ TS
  assert.match(surveyReadError(rd, survey), /ไม่ใช่ของคุณ|ไม่มีสิทธิ์/);
  // ช่าง TS เปิดใบของฝ่ายอื่นไม่ได้ ถึงจะรู้ id
  assert.match(surveyReadError(tech, { ...survey, dept: 'RD' }), /ไม่ใช่ของคุณ/);
  // fail-closed: ไม่มีใบ = ปฏิเสธ ไม่ใช่ปล่อยผ่าน
  assert.match(surveyReadError(tech, null), /ไม่พบ/);
  assert.match(surveyReadError(null, survey), /ไม่มีสิทธิ์/);
});

/* 🔑 ด่านอ่านต้องกว้างกว่าหรือเท่ากับด่านเขียนเสมอ — แคบกว่าเมื่อไรได้หน้าจอที่
   "เขียนได้แต่เปิดดูไม่ได้" ซึ่งคือหน้าจอที่ไม่มีทางใช้จริง */
test('🔴 route ของใบประเมินต้องใช้ด่านกลาง ไม่ใช่ canViewRequests ล้วน', () => {
  const route = readFileSync(new URL('../../app/api/service/surveys/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /surveyReadError\(/, 'ด่านอ่านต้องอยู่ที่เดียว');
  assert.match(route, /canOpenSurveySheet\(/, 'ต้องตัดคนนอกโมดูลก่อนแตะฐาน');
  assert.doesNotMatch(route, /canViewRequests\(/,
    'ด่านคิวคำร้องล้วนปิดประตูใส่ช่างหน้างาน — ต้องผ่าน surveyAccess เท่านั้น');
});
