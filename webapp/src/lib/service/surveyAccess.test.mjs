import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES } from '../permissions.js';
import {
  canOpenRequestPage, canOpenSurveyDocument, canOpenSurveySheet, surveyDocAccess, surveyDocVersion, surveyReadError,
} from './surveyAccess.js';

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

/* 🐞 **ลิงก์ "คำร้อง RQ-…" บนการ์ดควบคุมเคยเดาเอาเองจากสิทธิ์เขียน** (PR3 รอบแรก:
   `!readOnly && !canDecide` = "ช่าง") ⇒ **ช่างที่ไม่ได้ถูกมอบหมายในนัดนั้น** ซึ่งเทสต์
   ข้างบนยืนยันว่าต้องเปิดใบของเพื่อนอ่านได้ ได้ `canWrite = false` ⇒ ถูกจัดเป็น "คนดู"
   แล้วได้ลิงก์ไปหน้าที่ตอบ 403 ใส่เขา (กติกา ui-visibility: ไม่มีสิทธิ์ = ไม่โชว์)
   ⇒ ด่านของ **หน้าปลายทาง** ต้องถูกถามตรง ๆ ที่ server แล้วส่งคำตอบไปกับ payload */
test('🔴 ลิงก์ไปหน้าคำร้องต้องถามด่านของหน้าปลายทาง ไม่ใช่เดาจากสิทธิ์เขียน', () => {
  assert.equal(canOpenRequestPage(tech), false, 'ช่างเปิดหน้าคำร้องไม่ได้ (403) ⇒ ต้องไม่โชว์ลิงก์');
  assert.equal(canOpenRequestPage(sa), true, 'เจ้าของใบฝั่งฝ่ายขายเปิดได้');
  assert.equal(canOpenRequestPage(head), true, 'หัวหน้าฝ่ายบริการตอบคิวคำร้องของฝ่ายตัวเองได้');
  assert.equal(canOpenRequestPage(null), false, 'ไม่รู้ว่าใคร = ไม่โชว์');

  const route = readFileSync(new URL('../../app/api/service/surveys/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /canOpenRequest: canOpenRequestPage\(user\)/,
    'payload ต้องส่งคำตอบไปให้จอ — จอไม่รู้ role ของตัวเอง จึงอนุมานเองไม่ได้');
  const card = readFileSync(new URL('../../components/service/SurveyControlCard.js', import.meta.url), 'utf8');
  assert.match(card, /showRequestLink = !!requestHref && flags\.canOpenRequest/,
    'การ์ดต้องใช้ธงจาก server ไม่ใช่ประกอบเงื่อนไขจาก canWrite/canDecide เอง');
});

/* ══ เอกสารประเมิน (SU-…) — ตารางสิทธิ์ของ PR-2 §7 ══════════════════════════════════════════
   ⭐ ตารางเขียนเป็นตัวอักษรทีละตำแหน่ง **ไม่คำนวณจาก helper ตัวเดียวกับที่กำลังเทสต์** — เพิ่มตำแหน่งใหม่ใน `ROLES`
     เมื่อไร เทสต์แรกตกจนกว่าจะมีคนตัดสินว่าตำแหน่งนั้นได้เอกสารฉบับไหน
   C = ฉบับลูกค้า · I = ฉบับภายใน · S = ออกเอกสาร (issue) · D = ฉบับร่าง · H = รายการฉบับเก่า */
const DOC_KEYS = { C: 'customer', I: 'internal', S: 'issue', D: 'draft', H: 'history' };
const flags = (letters) => Object.fromEntries(Object.entries(DOC_KEYS).map(([k, key]) => [key, letters.includes(k)]));

// คนที่ **ไม่ใช่ผู้ขอและไม่อยู่ทีมของใบ** — ใบของฝ่าย TS
const DOC_MATRIX = {
  admin: 'CISDH',
  ts_manager: 'CISDH',
  ts_audit: 'CISDH',
  ts_senior: 'CISDH',
  commercial_director: 'CISDH',
  commercial_manager: 'CISDH',
  executive: 'CI',
  ae_supervisor: 'C',
  ac_supervisor: 'C',
  senior_ae: '', senior_ac: '', ac: '', ae: '',
  secretary: '', marketing: '', ra: '',
  rd: '', rd_perfumer: '', rd_chemist: '', rd_coordinator: '', rd_supervisor: '',
  finance: '', pc: '', pd: '', wh: '', qc: '',
  ts: '', ts_planner: '',
  viewer: '',
};
// ตำแหน่งที่เปิดระบบคำร้องไม่ได้เลย ⇒ เป็นผู้ขอของใบไม่ได้ และตกด่านชั้นนอกของเอกสารทุกกรณี
const NO_REQUEST_SYSTEM = ['secretary', 'marketing', 'ra', 'pd', 'wh', 'qc', 'ts', 'viewer'];

const docRequest = { id: 'DR-1', kind: 'site_survey', dept: 'TS', requestedById: 'sa-1', team: 'ODM' };
const stranger = (role) => ({ id: `u-${role}`, role });

test('🔴 ตารางสิทธิ์เอกสารครอบทุกตำแหน่งใน ROLES — ตำแหน่งใหม่ต้องถูกตัดสินก่อน', () => {
  assert.deepEqual(Object.keys(DOC_MATRIX).sort(), [...ROLES].sort());
  for (const role of NO_REQUEST_SYSTEM) assert.ok(ROLES.includes(role), role);
});

test('🔴 §7 คนนอกใบ: หัวหน้าได้ครบ · ผู้บริหารได้อ่านสองฉบับ · หัวหน้าฝ่ายขายได้ฉบับลูกค้า · ที่เหลือไม่ได้อะไร', () => {
  for (const role of ROLES) {
    assert.deepEqual(surveyDocAccess(stranger(role), docRequest), flags(DOC_MATRIX[role]), role);
  }
});

test('🔴 §7 ผู้ขอ: ได้ฉบับลูกค้าเพิ่มอย่างเดียว — ไม่มีตำแหน่งไหนได้ฉบับภายใน/ออกเอกสาร/ร่าง/ประวัติ เพราะเป็นผู้ขอ', () => {
  for (const role of ROLES) {
    const base = flags(DOC_MATRIX[role]);
    const want = { ...base, customer: base.customer || !NO_REQUEST_SYSTEM.includes(role) };
    assert.deepEqual(surveyDocAccess({ id: 'sa-1', role }, docRequest), want, role);
  }
});

test('🔴 §7 เพื่อนร่วมทีมของใบ: เท่ากับผู้ขอ (ทีมเดียว · หลายทีม) — ทีมว่างสองฝั่งไม่นับว่าตรงกัน', () => {
  for (const role of ROLES) {
    const base = flags(DOC_MATRIX[role]);
    const want = { ...base, customer: base.customer || !NO_REQUEST_SYSTEM.includes(role) };
    assert.deepEqual(surveyDocAccess({ id: `u-${role}`, role, team: 'ODM' }, docRequest), want, `${role} team`);
    assert.deepEqual(surveyDocAccess({ id: `u-${role}`, role, team: 'KA', teams: ['KA', 'ODM'] }, docRequest), want, `${role} teams`);
    // คนละทีม = คนนอกใบ
    assert.deepEqual(surveyDocAccess({ id: `u-${role}`, role, team: 'KA' }, docRequest), base, `${role} other team`);
    // ใบไม่มีทีม + ผู้ใช้ไม่มีทีม ต้องไม่ "ตรงกัน"
    assert.deepEqual(surveyDocAccess(stranger(role), { ...docRequest, team: null }), base, `${role} no team`);
  }
});

/* มติเจ้าของข้อ 6: ฝ่ายขายไม่ได้ฉบับภายในไม่ว่าทางไหน · ช่างไม่ได้อะไรเลย */
test('🔴 ช่างหน้างานไม่ได้เอกสารสักฉบับ แม้เป็นผู้ขอหรืออยู่ทีมเดียวกับใบ — ทั้งที่อ่านใบประเมินได้', () => {
  const none = flags('');
  assert.equal(surveyReadError(tech, { ...survey }), null, 'ช่างยังเปิดใบประเมินได้ (คนละด่าน)');
  assert.equal(canOpenSurveyDocument(tech), false);
  assert.deepEqual(surveyDocAccess(tech, docRequest), none);
  assert.deepEqual(surveyDocAccess({ ...tech, team: 'ODM' }, docRequest), none);
  assert.deepEqual(surveyDocAccess({ ...tech, id: 'sa-1' }, docRequest), none);
});

test('🔴 Planner กับหัวหน้าฝ่ายขายผ่าน canAnswerRequest แต่ออกเอกสารไม่ได้ — ต้องเป็นหัวหน้าฝ่ายบริการด้วย', () => {
  const planner = { id: 'u-pl', role: 'ts_planner' };
  assert.equal(canOpenSurveyDocument(planner), true, 'ผ่านด่านชั้นนอก (ตอบคิวคำร้องของฝ่ายได้)');
  assert.deepEqual(surveyDocAccess(planner, docRequest), flags(''));
  for (const role of ['ae_supervisor', 'ac_supervisor']) {
    const got = surveyDocAccess(stranger(role), docRequest);
    assert.equal(got.issue, false, role);
    assert.equal(got.draft, false, role);
    assert.equal(got.internal, false, role);
    assert.equal(got.history, false, role);
  }
});

test('ผู้ขอฝั่งฝ่ายขาย (AE): ฉบับลูกค้าเท่านั้น', () => {
  assert.deepEqual(surveyDocAccess(sa, docRequest), flags('C'));
  // AE อีกคนที่ไม่ใช่ผู้ขอ ไม่อยู่ทีมของใบ (เช่นเจ้าของดีล) — ไม่ได้
  assert.deepEqual(surveyDocAccess({ id: 'sa-2', role: 'ae', team: 'KA' }, docRequest), flags(''));
});

test('ผู้บริหารอ่านได้สองฉบับ แต่ viewer ไม่ได้ — ห้ามใช้ isReadOnlyObserver', () => {
  assert.deepEqual(surveyDocAccess(stranger('executive'), docRequest), flags('CI'));
  assert.deepEqual(surveyDocAccess(stranger('viewer'), docRequest), flags(''));
  assert.equal(canOpenSurveyDocument(stranger('viewer')), false);
  const src = readFileSync(new URL('./surveyAccess.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /isReadOnlyObserver\(/);
});

test('ออกเอกสาร/ฉบับร่าง = คู่เดียวกับปุ่มส่งผล: หัวหน้า + ตอบใบของฝ่ายนั้นได้', () => {
  const otherDept = { ...docRequest, dept: 'RD' };
  // หัวหน้าฝ่าย TS กับใบของฝ่ายอื่น: อ่านได้ตามตำแหน่ง แต่ออกเอกสารไม่ได้
  for (const role of ['ts_manager', 'ts_audit', 'ts_senior']) {
    assert.deepEqual(surveyDocAccess(stranger(role), otherDept), flags('CIH'), role);
  }
  // แอดมิน · CD · CM ตอบได้ทุกฝ่าย (superuser)
  for (const role of ['admin', 'commercial_director', 'commercial_manager']) {
    assert.deepEqual(surveyDocAccess(stranger(role), otherDept), flags('CISDH'), role);
  }
  // draft เดินตาม issue เสมอ
  for (const role of ROLES) {
    const got = surveyDocAccess(stranger(role), docRequest);
    assert.equal(got.draft, got.issue, role);
    if (got.issue) assert.equal(got.history && got.internal && got.customer, true, role);
  }
});

test('🔴 fail-closed: ไม่มีผู้ใช้ · ไม่มีใบ = ไม่ได้สักคีย์ และได้อ็อบเจกต์ใหม่ทุกครั้ง (ห้าคีย์ บูลีนล้วน)', () => {
  const none = flags('');
  assert.deepEqual(surveyDocAccess(null, docRequest), none);
  assert.deepEqual(surveyDocAccess(undefined, docRequest), none);
  assert.deepEqual(surveyDocAccess(head, null), none);
  assert.deepEqual(surveyDocAccess({}, docRequest), none);
  assert.equal(canOpenSurveyDocument(null), false);
  const a = surveyDocAccess(null, null);
  a.internal = true;
  assert.equal(surveyDocAccess(null, null).internal, false, 'ค่าว่างต้องไม่ใช่อ็อบเจกต์ร่วมที่แก้ได้');
  for (const role of ROLES) {
    const got = surveyDocAccess(stranger(role), docRequest);
    assert.deepEqual(Object.keys(got).sort(), ['customer', 'draft', 'history', 'internal', 'issue']);
    for (const v of Object.values(got)) assert.equal(typeof v, 'boolean', role);
  }
});

test('ด่านชั้นนอกของเอกสาร: หัวหน้า · ผู้บริหาร · คนที่เปิดระบบคำร้องได้ — ที่เหลือตกก่อนอ่านฐาน', () => {
  const closed = ROLES.filter((role) => !canOpenSurveyDocument(stranger(role)));
  assert.deepEqual(closed.sort(), [...NO_REQUEST_SYSTEM].sort());
  // ทุกคีย์ที่ได้ต้องผ่านด่านชั้นนอกก่อนเสมอ (route ถามด่านชั้นนอกก่อนอ่านคำร้อง)
  for (const role of ROLES) {
    for (const user of [stranger(role), { id: 'sa-1', role }, { id: `u-${role}`, role, team: 'ODM' }]) {
      const any = Object.values(surveyDocAccess(user, docRequest)).some(Boolean);
      if (any) assert.equal(canOpenSurveyDocument(user), true, role);
    }
  }
});

test('🔴 ฉบับที่ขอ: สตริง internal ตรงตัวเท่านั้นที่เป็นฉบับภายใน', () => {
  assert.equal(surveyDocVersion('internal'), 'internal');
  for (const v of ['customer', 'Internal', 'INTERNAL', ' internal', 'internal ', '', null, undefined, ['internal'], 1, true, 'draft', 'history', 'issue']) {
    assert.equal(surveyDocVersion(v), 'customer', JSON.stringify(v));
  }
  // คีย์ที่ได้ใช้เปิดแผนที่สิทธิ์ได้ตรง ๆ — AE ผู้ขอพิมพ์ version ผิดก็ได้แค่ฉบับลูกค้า
  const access = surveyDocAccess(sa, docRequest);
  assert.equal(access[surveyDocVersion('internal')], false);
  assert.equal(access[surveyDocVersion('Internal')], true);
});
