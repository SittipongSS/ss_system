// ── ลงคิวใบประเมิน = ใบได้วัน + ช่างได้นัด (เฟส 2) ─────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { SURVEY_VISIT_KIND, createSurveyVisit, moveSurveyVisit, surveyScheduleError } from './surveyVisit.js';
import { VISIT_KINDS, VISIT_KINDS_MANUAL, VISIT_KIND_LABELS } from './rounds.js';

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

test('สร้างนัด: ชนิด survey · ผูกกลับใบ · เวลาว่าง = ไปทั้งวัน', async () => {
  const calls = [];
  const fake = { rpc: async (fn, args) => { calls.push(args); return { data: [{ id: 'SVV-1', code: 'SV-26090001' }], error: null }; } };
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
  const fake = { rpc: async (fn, args) => { calls.push(args); return { data: [{ id: 'SVV-1' }], error: null }; } };
  await createSurveyVisit(fake, {
    request, site, date: '2026-09-08', time: '13:30:00', assigneeId: 'U1', user: {},
  });
  assert.equal(calls[0].p_rows[0].startTime, '13:30');
});

/* ── เลื่อนวัน = ขยับนัดเดิม ไม่สร้างใบที่สอง ────────────────────────────── */
function fakeVisitDb(visit) {
  const state = { visit, patch: null };
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    order() { return api; },
    limit() { return Promise.resolve({ data: state.visit ? [state.visit] : [], error: null }); },
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

test('🔴 นัดที่ปิดจบแล้วไม่ถูกวันใหม่เขียนทับ — ประวัติการเข้าจริงเป็นของมีค่าที่สุด', async () => {
  for (const status of ['done', 'partial', 'unable', 'cancelled']) {
    const db = fakeVisitDb({ id: 'SVV-1', status, scheduledDate: '2026-09-08' });
    await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-12' });
    assert.equal(db._state.patch, null, status);
  }
});

test('ยังไม่เคยลงคิว = ไม่มีอะไรให้ขยับ ไม่ใช่ error', async () => {
  const db = fakeVisitDb(null);
  const { visit, error } = await moveSurveyVisit(db, { requestId: 'DR-1', date: '2026-09-12' });
  assert.equal(visit, null);
  assert.equal(error, null);
});

/* ── นัดประเมินสร้างมือไม่ได้ ──────────────────────────────────────────── */
test('🔴 "ประเมินพื้นที่" ต้องไม่อยู่ในชุดชนิดที่คนเลือกเองในโมดัลนัด', () => {
  assert.ok(VISIT_KINDS.includes('survey'), 'ระบบต้องรู้จักชนิดนี้ (ป้าย/สี/ตัวกรอง)');
  assert.equal(VISIT_KINDS_MANUAL.includes('survey'), false);
  assert.equal(VISIT_KIND_LABELS.survey, 'ประเมินพื้นที่');
});
