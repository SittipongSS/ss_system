// ── ลงคิวใบประเมิน = ใบได้วัน + ช่างได้นัด (เฟส 2) ─────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_VISIT_KIND, createSurveyVisit, moveSurveyVisit,
  surveyScheduleError, surveyVisitInsertError,
} from './surveyVisit.js';
import { REQUEST_SLOT_VISIT_STATES } from './visitStatus.js';
import { VISIT_KINDS, VISIT_KINDS_MANUAL, VISIT_KIND_LABELS, normalizeVisitInput } from './rounds.js';

const request = { id: 'DR-1', docNo: 'AS-26080002', siteId: 'SVS-1' };
const site = { id: 'SVS-1', name: 'สาขาสีลม', accessDays: [], accessFrom: null, accessTo: null };

test('🔴 ลงคิวต้องมีวันและช่าง — นัดที่ไม่มีช่างจะจอดเป็นร่างที่ไม่มีใครเห็น', () => {
  assert.match(surveyScheduleError({}, request), /วันนัด/);
  assert.match(surveyScheduleError({ committedDueDate: '2026-09-08' }, request), /ช่าง/);
  assert.equal(
    surveyScheduleError({ committedDueDate: '2026-09-08', assigneeId: 'U1' }, request),
    null,
  );
});

test('เวลาไม่บังคับ — "ไปทั้งวัน" เป็นคำตอบที่ถูกของงานจริง · รูปผิดถึงตีกลับ', () => {
  const base = { committedDueDate: '2026-09-08', assigneeId: 'U1' };
  assert.equal(surveyScheduleError({ ...base, committedDueTime: '' }, request), null);
  assert.equal(surveyScheduleError({ ...base, committedDueTime: '13:30' }, request), null);
  assert.match(surveyScheduleError({ ...base, committedDueTime: '99:99' }, request), /เวลานัด/);
});

test('🔴 ใบที่ไม่มีสถานที่ ลงคิวไม่ได้ — นัดต้องรู้ว่าไปที่ไหน', () => {
  assert.match(
    surveyScheduleError({ committedDueDate: '2026-09-08', assigneeId: 'U1' }, { id: 'DR-1' }),
    /ไม่มีสถานที่/,
  );
});

/* ตัวปลอมของ "สร้างนัด" — ต้องตอบได้ทั้งการ *ถามหานัดเปิดเดิม* (from/select/…)
   และการ *เขียนแถวใหม่* (rpc) เพราะ `createSurveyVisit` ทำสองอย่างนั้นต่อกัน */
function fakeCreateDb({ open = null, rpcResult, calls = [] } = {}) {
  const ins = [];
  const api = {
    calls, ins,
    rpc: async (fn, args) => { calls.push(args); return rpcResult; },
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    in(col, values) { ins.push([col, values]); return api; },
    order() { return api; },
    limit() { return Promise.resolve({ data: open ? [open] : [], error: null }); },
  };
  return api;
}

test('สร้างนัด: ชนิด survey · ผูกกลับใบ · เวลาว่าง = ไปทั้งวัน', async () => {
  const calls = [];
  const fake = fakeCreateDb({ calls, rpcResult: { data: [{ id: 'SVV-1', code: 'SV-26090001' }], error: null } });
  const { visit, error } = await createSurveyVisit(fake, {
    request, site, date: '2026-09-08', time: '', assigneeId: 'U1', assigneeName: 'ช่างเอ',
    user: { id: 'U9', name: 'หัวหน้า' },
  });
  assert.equal(error, null);
  assert.equal(visit.code, 'SV-26090001');

  const row = calls[0].p_rows[0];
  assert.equal(row.kind, SURVEY_VISIT_KIND);
  assert.equal(row.requestId, 'DR-1');
  assert.equal(row.siteId, 'SVS-1');
  assert.equal(row.scheduledDate, '2026-09-08');
  assert.equal(row.startTime, null);
  assert.equal(row.assigneeId, 'U1');
  // ⭐ โน้ตชี้กลับใบ — ช่างที่เปิดจากตารางต้องรู้ว่ามาจากเรื่องอะไร
  assert.match(row.note, /AS-26080002/);
  // สถานะมาจากด่าน ไม่ใช่จากผู้เรียก
  assert.ok(['scheduled', 'draft'].includes(row.status));
});

test('เวลาที่ส่งมาถูกทำให้เป็น HH:MM ก่อนลงนัด', async () => {
  const calls = [];
  const fake = fakeCreateDb({ calls, rpcResult: { data: [{ id: 'SVV-1' }], error: null } });
  await createSurveyVisit(fake, {
    request, site, date: '2026-09-08', time: '13:30:00', assigneeId: 'U1', user: {},
  });
  assert.equal(calls[0].p_rows[0].startTime, '13:30');
});

/* ── เลื่อนวัน = ขยับนัดเดิม ไม่สร้างใบที่สอง ────────────────────────────── */
function fakeVisitDb(visit) {
  /* ⚠️ ตัวปลอมต้องกรองตาม `.in('status', …)` จริง ๆ — ไม่งั้นเทสต์จะผ่านทั้งที่โค้ด
     ถามหา "นัดที่ยังกินสิทธิ์" แล้ว DB ยื่นนัดที่ปิดไปแล้วกลับมาให้ */
  const state = { visit, patch: null, statuses: null };
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    in(col, values) { if (col === 'status') state.statuses = values; return api; },
    order() { return api; },
    limit() {
      const row = state.visit;
      const kept = row && (!state.statuses || state.statuses.includes(row.status)) ? [row] : [];
      return Promise.resolve({ data: kept, error: null });
    },
    update(patch) { state.patch = patch; return api; },
    maybeSingle() { return Promise.resolve({ data: { ...state.visit, ...state.patch }, error: null }); },
    _state: state,
  };
  return api;
}

test('เลื่อนวันบนใบ = ขยับนัดของช่างด้วย (หนึ่งใบ = หนึ่งนัด)', async () => {
  const db = fakeVisitDb({ id: 'SVV-1', status: 'scheduled', scheduledDate: '2026-09-08' });
  const { visit, error } = await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-12', time: '09:00' });
  assert.equal(error, null);
  assert.equal(db._state.patch.scheduledDate, '2026-09-12');
  assert.equal(db._state.patch.startTime, '09:00');
  assert.equal(visit.scheduledDate, '2026-09-12');
});

test('ไม่ส่งเวลามา = ไม่แตะเวลาเดิม (ต่างจากส่งค่าว่างที่แปลว่าไปทั้งวัน)', async () => {
  const db = fakeVisitDb({ id: 'SVV-1', status: 'scheduled', startTime: '09:00' });
  await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-12' });
  assert.equal('startTime' in db._state.patch, false);

  const db2 = fakeVisitDb({ id: 'SVV-1', status: 'scheduled', startTime: '09:00' });
  await moveSurveyVisit(db2, { requestId: 'DR-1', date: '2026-09-12', time: '' });
  assert.equal(db2._state.patch.startTime, null);
});

test('🔴 นัดที่ปิดจบแล้วไม่ถูกวันใหม่เขียนทับ — และต้องบอกว่าต้องมีนัดใบใหม่', async () => {
  for (const status of ['done', 'partial', 'unable', 'cancelled', 'rescheduled']) {
    const db = fakeVisitDb({ id: 'SVV-1', status, scheduledDate: '2026-09-08' });
    const { needsNew, error } = await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-12' });
    assert.equal(db._state.patch, null, status);
    // ถามหาแถวที่ยังกินสิทธิ์ตรง ๆ — ไม่ใช่หยิบแถวล่าสุดมาแล้วค่อยดูสถานะ
    assert.deepEqual(db._state.statuses, REQUEST_SLOT_VISIT_STATES, status);
    assert.equal(error, null, status);
    /* 🐞 ของเดิมคืน error:null แล้วจบ ⇒ ใบบอกว่าเลื่อนแล้วทั้งที่ตารางช่างไม่ขยับ
       (เคส "ไปแล้วเข้าไม่ได้" คือคำตอบของงานจริง ไม่ใช่เคสสมมติ) */
    assert.equal(needsNew, true, status);
  }
});

test('🔴 ไม่มีนัด (สร้างไม่สำเร็จรอบก่อน · ถูกลบ) = ต้องสร้างใบใหม่ ไม่ใช่เงียบ', async () => {
  const db = fakeVisitDb(null);
  const { visit, error, needsNew } = await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-12' });
  assert.equal(visit, null);
  assert.equal(error, null);
  // ถ้าเงียบ ใบจะค้างสถานะ "ลงวันแล้วแต่ไม่มีนัด" แบบกู้ไม่ได้ (commit-due กดซ้ำไม่ได้)
  assert.equal(needsNew, true);
});

/* ── นัดประเมินสร้างมือไม่ได้ ──────────────────────────────────────────── */
test('🔴 "ประเมินพื้นที่" ต้องไม่อยู่ในชุดชนิดที่คนเลือกเองในโมดัลนัด', () => {
  assert.ok(VISIT_KINDS.includes('survey'), 'ระบบต้องรู้จักชนิดนี้ (ป้าย/สี/ตัวกรอง)');
  assert.equal(VISIT_KINDS_MANUAL.includes('survey'), false);
  assert.equal(VISIT_KIND_LABELS.survey, 'ประเมินพื้นที่');
});

test('🐞 ด่าน "สร้างมือไม่ได้" ต้องไม่ล็อกการ *แก้* นัดที่ลงคิวไปแล้ว', () => {
  const row = { siteId: 'SVS-1', kind: 'survey', scheduledDate: '2026-09-12' };
  // สร้าง = ตีกลับ
  assert.match(normalizeVisitInput(row).error, /สร้างที่นี่ไม่ได้/);
  /* แก้ = ผ่าน — PATCH ส่ง {...before, ...body} ⇒ kind มาจากแถวเดิมเสมอ
     ถ้าด่านยิงตรงนี้ด้วย ช่างจะเลื่อนนัดประเมินจากตารางไม่ได้เลย */
  const edit = normalizeVisitInput({ ...row, scheduledDate: '2026-09-17' }, { existingKind: 'survey' });
  assert.equal(edit.error, null);
  assert.equal(edit.value.scheduledDate, '2026-09-17');
  // แต่แปลงชนิดทิ้งต้นเรื่องไม่ได้ (ทั้งสองทาง)
  assert.match(normalizeVisitInput({ ...row, kind: 'refill' }, { existingKind: 'survey' }).error, /เปลี่ยนชนิด/);
  assert.match(normalizeVisitInput({ ...row, kind: 'survey' }, { existingKind: 'refill' }).error, /เปลี่ยนชนิด/);
  // ชนิดที่สร้างมือได้ ยังสลับกันเองได้เหมือนเดิม
  assert.equal(normalizeVisitInput({ ...row, kind: 'refill' }, { existingKind: 'install' }).error, null);
});

test('เลื่อนสำเร็จต้องไม่บอกให้สร้างใบใหม่', async () => {
  const db = fakeVisitDb({ id: 'SVV-1', status: 'scheduled', scheduledDate: '2026-09-08' });
  const { needsNew } = await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-12' });
  assert.equal(needsNew, false);
});

/* ── หนึ่งใบ = หนึ่งนัดที่ยังไม่ปิด (mig 0316) ───────────────────────────── */
test('🔴 มีนัดเปิดค้างอยู่แล้ว = สร้างนัดใบที่สองไม่ได้ (ข้อความไทย ไม่ใช่ error ของ DB)', async () => {
  const db = fakeCreateDb({ open: { id: 'SVV-1', code: 'SV-26090001', status: 'scheduled' } });
  const { visit, error } = await createSurveyVisit(db, {
    request, site, date: '2026-09-08', time: '', assigneeId: 'U1', user: {},
  });
  assert.equal(visit, null);
  assert.match(error, /SV-26090001/);
  assert.match(error, /เลื่อนวัน/);
  assert.equal(db.calls.length, 0, 'ต้องไม่ยิง rpc เลยเมื่อรู้ตั้งแต่ต้นว่าซ้ำ');
});

test('นัดที่ปิดจบแล้วไม่กันการลงคิวรอบใหม่ — ถามเฉพาะนัดที่ยังเปิด', async () => {
  const db = fakeCreateDb({ open: null, rpcResult: { data: [{ id: 'SVV-2' }], error: null } });
  const { error } = await createSurveyVisit(db, {
    request, site, date: '2026-09-08', time: '', assigneeId: 'U1', user: {},
  });
  assert.equal(error, null);
  // ตัวกรองต้องถามชุดเดียวกับ predicate ของ index — ไม่ใช่รายการที่พิมพ์ซ้ำเอง
  assert.deepEqual(db.ins, [['status', REQUEST_SLOT_VISIT_STATES]]);
});

test('🔴 ชนกันตอนกดพร้อมกัน = แปลง error ของ index เป็นภาษาคน', () => {
  const raw = 'duplicate key value violates unique constraint "service_visits_survey_open_request_uk"';
  assert.match(surveyVisitInsertError({ message: raw }), /อีกหน้าจอ/);
  // error อื่นต้องไม่ถูกกลืน — ข้อความเดิมคือเบาะแสเดียวที่เหลือ
  assert.equal(surveyVisitInsertError({ message: 'permission denied' }), 'permission denied');
});

test('🔴 ชุดสถานะ "นัดยังมีชีวิต" ของแอป ต้องตรงกับ predicate ของ index ใน mig 0316', () => {
  const sql = readFileSync(
    new URL('../../../supabase/migrations/0316_survey_visit_one_open.sql', import.meta.url), 'utf8',
  );
  /* 🐞 เพี้ยนเมื่อไรได้เคสที่แอปยอมให้สร้างแต่ DB ตีกลับ (หรือแอปห้ามทั้งที่ DB ยอม
     ⇒ ลงคิวใหม่ไม่ได้เลยโดยไม่มีใครรู้ว่าติดตรงไหน) — ปักทั้งสองฝั่งไว้ที่นี่ */
  /* 🐞 **ต้องอ่านเฉพาะก้อน CREATE INDEX** — ประโยค `status IN (…)` โผล่สองที่ในไฟล์
     (บล็อกตรวจของค้าง กับตัว index) ⇒ `sql.includes(...)` เฉย ๆ ผ่านได้ทั้งที่ predicate
     ของ index ถูกแก้ไปแล้ว ซึ่งคือสิ่งเดียวที่เทสต์นี้มีหน้าที่ปัก */
  const stmt = sql.match(
    /CREATE UNIQUE INDEX IF NOT EXISTS service_visits_survey_open_request_uk[\s\S]*?;/,
  );
  assert.ok(stmt, 'ไม่พบคำสั่งสร้าง index ในไฟล์ migration');
  const inList = `status IN (${REQUEST_SLOT_VISIT_STATES.map((s) => `'${s}'`).join(', ')})`;
  assert.equal(stmt[0].includes(inList), true, `predicate ของ index ไม่ตรงกับแอป: ${inList}`);
  assert.match(stmt[0], /ON public\.service_visits \("requestId"\)/);
  assert.match(stmt[0], /kind = 'survey'/);
  assert.match(stmt[0], /"requestId" IS NOT NULL/);
});

test('🐞 นัดที่ยังมีชีวิตอาจเป็นแถว *เก่ากว่า* แถวที่ปิดแล้ว — ต้องเจอและขยับตัวนั้น', async () => {
  /* เปิดนัดที่ปิดไปแล้วกลับมาเป็น "นัดไว้" ทำได้จากโมดัลนัด ⇒ แถวที่ยังมีชีวิตกลาย
     เป็นแถวเก่ากว่าแถวที่ปิด · อ่าน "แถวล่าสุด" จะเห็นแถวที่ปิดแล้วสั่งสร้างนัดใหม่
     ซึ่งไปตกด่าน "มีนัดที่ยังไม่ปิดอยู่แล้ว" ⇒ กดปุ่มไหนก็ไม่ผ่านทั้งคู่ */
  const db = fakeVisitDb({ id: 'SVV-old', status: 'scheduled', scheduledDate: '2026-09-08' });
  const { visit, needsNew, error } = await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-20' });
  assert.equal(error, null);
  assert.equal(needsNew, false);
  assert.equal(visit.scheduledDate, '2026-09-20');
  assert.equal(db._state.patch.scheduledDate, '2026-09-20');
});
