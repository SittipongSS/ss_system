// ── "ส่งผล" ปิดนัดประเมินที่ยังเปิดอยู่ (มติเจ้าของ 24/09 ข้อ 2) ─────────────────────
//
// ⭐ ครอบสามชั้น: ตัวตัดสิน (`surveySendVisitStep`) · คำสั่งปิดแบบมีเงื่อนไข (`closeSurveyVisitForSend`)
//   · ลำดับการเขียนทั้งปุ่ม (`surveySendWrites`) — ชั้นสุดท้ายคือยามของกติกา "ไม่มีสภาพครึ่งทาง":
//   ตอบใบแล้วแต่นัดยังเปิด ต้องไปไม่ถึง ไม่ว่าคำสั่งไหนจะล้ม
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEND_CLOSABLE_VISIT_STATES,
  SURVEY_SEND_OLD_PAGE_ERROR,
  SURVEY_SEND_PREFLIGHT_MS,
  SURVEY_SEND_REPORT_FAILED,
  SURVEY_SEND_REPORT_OFF,
  SURVEY_SEND_SIGN_MS,
  SURVEY_SEND_WARNINGS_CHANGED_ERROR,
  closeSurveyVisitForSend,
  surveySendCloseBody,
  surveySendConfirm,
  surveySendDiffBaseline,
  surveySendDocumentRefusal,
  surveySendDocumentRefusalList,
  surveySendDoneText,
  surveySendDoneToast,
  surveySendImageRefusal,
  surveySendRefusalKeeps,
  surveySendReport,
  surveySendSignatureRefusal,
  surveySendUnreadSignRefusal,
  surveySendUnseenWarnings,
  surveySendVisitStep,
  surveySendWrites,
} from './surveySendClose.js';
import { SURVEY_SIGN_FAILURE, SURVEY_SIGN_PERMANENT_REASONS } from './surveyReportImages.js';
import { SURVEY_SIGN_FAILURE_LABELS, surveyReportSignFileLines, surveyReportSignersText } from './surveyReportSigners.js';
import { isOpenVisit } from './visitStatus.js';

const TODAY = '2026-09-24';
const NOW = '2026-09-24T08:00:00.000Z';
const visit = (over = {}) => ({
  id: 'SVV-1', code: 'SV-2609001', requestId: 'DR-1', kind: 'survey', status: 'in_progress',
  scheduledDate: '2026-09-22', actualDate: '2026-09-22', actualStartTime: '14:05:00', actualEndTime: null,
  ...over,
});

/* supabase ปลอม — พอสำหรับรูปคำสั่งที่ไฟล์นี้ใช้ (update/select · eq · in · is · maybeSingle)
   · จดทุกคำสั่งตามลำดับ (ลำดับปิดนัด → ตอบใบคือเนื้อของกติกา) · `failOn` ทำให้คำสั่งเขียนของตารางนั้นล้ม */
function fakeSupabase(seed, { failOn = [], failReadOn = [] } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const calls = [];
  const from = (table) => {
    const state = { op: 'select', filters: [], patch: null, returning: false, single: false };
    const run = () => {
      const rows = tables[table] || [];
      const hit = rows.filter((row) => state.filters.every((keep) => keep(row)));
      calls.push({ table, op: state.op, patch: state.patch });
      if (state.op === 'select' && failReadOn.includes(table)) return { data: null, error: { message: `boom read ${table}` } };
      if (state.op === 'update') {
        if (failOn.includes(table)) return { data: null, error: { message: `boom ${table}` } };
        for (const row of hit) Object.assign(row, state.patch);
        const out = hit.map((r) => ({ ...r }));
        if (state.single) return { data: out[0] || null, error: null };
        return { data: state.returning ? out : null, error: null };
      }
      if (state.single) return { data: hit[0] ? { ...hit[0] } : null, error: null };
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const builder = {
      select() { state.returning = true; return builder; },
      update(patch) { state.op = 'update'; state.patch = patch; return builder; },
      eq(col, v) { state.filters.push((row) => row[col] === v); return builder; },
      in(col, vs) { state.filters.push((row) => vs.includes(row[col])); return builder; },
      is(col, v) { state.filters.push((row) => (row[col] ?? null) === v); return builder; },
      maybeSingle() { state.single = true; return builder; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return builder;
  };
  return { from, calls, tables };
}
const writes = (calls) => calls.filter((c) => c.op === 'update').map((c) => c.table);
const answerPatch = { answeredAt: NOW, answeredById: 'U-1', answeredByName: 'หัวหน้า', status: 'answered', updatedAt: NOW };
const requestRow = (over = {}) => ({ id: 'DR-1', status: 'acknowledged', answeredAt: null, closedAt: null, ...over });

// ══ ตัวตัดสิน ═══════════════════════════════════════════════════════════
test('ไม่มีนัดค้าง / นัดปิดไปแล้ว = ไม่แตะนัด', () => {
  assert.equal(surveySendVisitStep(null, { today: TODAY, needsVisit: true }).action, 'none');
  for (const status of ['done', 'partial', 'unable', 'cancelled', 'rescheduled']) {
    assert.equal(surveySendVisitStep(visit({ status }), { today: TODAY, needsVisit: true }).action, 'none', status);
  }
});

test('⭐ กำลังทำ = ปิดเป็น "เข้าแล้ว" · เก็บวันที่ช่างกดเริ่ม · **ไม่มีคีย์เวลาเลย** (เวลาที่ช่างประทับอยู่ครบ)', () => {
  const step = surveySendVisitStep(visit(), { today: TODAY, needsVisit: true });
  assert.equal(step.action, 'close');
  assert.deepEqual(step.patch, { status: 'done', actualDate: '2026-09-22' });
  for (const key of ['actualStartTime', 'actualEndTime', 'actualEndDate']) {
    assert.ok(!(key in step.patch), `ห้ามแตะ ${key} — ส่งผลไม่ประทับเวลา`);
  }
});

test('ยังไม่เคยกดเริ่ม: วันนัดผ่านมาแล้ว = วันนัด · วันนัดยังไม่มาถึง = วันนี้ (ไปวัดก่อนวันนัด)', () => {
  const past = surveySendVisitStep(visit({ status: 'scheduled', actualDate: null, actualStartTime: null, scheduledDate: '2026-09-20' }), { today: TODAY, needsVisit: true });
  assert.deepEqual(past.patch, { status: 'done', actualDate: '2026-09-20' });
  const future = surveySendVisitStep(visit({ status: 'scheduled', actualDate: null, actualStartTime: null, scheduledDate: '2026-09-30' }), { today: TODAY, needsVisit: true });
  assert.deepEqual(future.patch, { status: 'done', actualDate: TODAY });
});

test('🔴 นัดยังเป็นร่าง = ส่งผลไม่ได้ บอกรหัสนัดและทางออก (ไม่ปิดร่างเป็น "เข้าแล้ว" · ไม่ยกเลิกแทนผู้จัดคิว)', () => {
  const step = surveySendVisitStep(visit({ status: 'draft', actualDate: null, actualStartTime: null }), { today: TODAY, needsVisit: true });
  assert.equal(step.action, 'block');
  assert.match(step.error, /SV-2609001/);
  assert.match(step.error, /ร่าง/);
  assert.match(step.error, /หน้าจัดคิว/);
});

test('ชุดสถานะที่คำสั่ง update ปิดได้ ตรงกับตัวตัดสิน (`isOpenVisit`) เป๊ะ', () => {
  for (const status of ['draft', 'scheduled', 'in_progress', 'done', 'partial', 'unable', 'rescheduled', 'cancelled']) {
    assert.equal(SEND_CLOSABLE_VISIT_STATES.includes(status), isOpenVisit({ status }), status);
  }
});

test('⭐ บรรทัดเธรดของนัดบอกใครปิด ทางไหน และเวลาจริงที่มี/ไม่มี', () => {
  const started = surveySendCloseBody({ ...visit(), status: 'done' }, { name: 'สมชาย' });
  assert.equal(started, 'ปิดพร้อมส่งผล โดย สมชาย — เข้าแล้ว · เข้าจริง 22/09/2026 · เริ่ม 14:05 น. (ไม่มีเวลาจบ: ช่างไม่ได้กดส่งงาน)');
  const never = surveySendCloseBody({ ...visit({ actualStartTime: null }), status: 'done' }, { name: 'สมชาย' });
  assert.match(never, /ไม่มีเวลาเข้าจริง \(ไม่เคยกดเริ่มงาน\)$/);
});

// ══ คำสั่งปิดแบบมีเงื่อนไข ═══════════════════════════════════════════════
test('ปิดด้วยเงื่อนไขสถานะ — เขียน status + actualDate + updatedAt เท่านั้น', async () => {
  const db = fakeSupabase({ service_visits: [visit()] });
  const step = surveySendVisitStep(visit(), { today: TODAY, needsVisit: true });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.equal(out.error, null);
  assert.equal(out.closed.status, 'done');
  assert.equal(out.closed.actualStartTime, '14:05:00', 'เวลาเริ่มของช่างยังอยู่');
  assert.equal(out.closed.actualEndTime, null, 'ไม่ประทับเวลาจบให้');
  assert.deepEqual(Object.keys(db.calls[0].patch).sort(), ['actualDate', 'status', 'updatedAt']);
});

test('🔑 ช่างปิดเป็น "เข้าแล้ว" ไปก่อน (0 แถว) = ไปต่อได้ แต่ไม่นับว่าคำขอนี้ปิด', async () => {
  const db = fakeSupabase({ service_visits: [visit({ status: 'done' })] });
  const step = surveySendVisitStep(visit(), { today: TODAY, needsVisit: true });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.deepEqual(out, { closed: null, error: null, status: null });
});

test('🔴 ช่างเพิ่งปิดเป็น "ทำไม่ได้" ระหว่างกดส่งผล = 409 · ไม่ทับผลของช่าง', async () => {
  const db = fakeSupabase({ service_visits: [visit({ status: 'unable' })] });
  const step = surveySendVisitStep(visit(), { today: TODAY, needsVisit: true });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.equal(out.status, 409);
  assert.match(out.error, /ทำไม่ได้/);
  assert.equal(db.tables.service_visits[0].status, 'unable');
});

test('ฐานล้มตอนปิด = 500 พร้อมบอกว่ายังไม่ได้ส่งผล', async () => {
  const db = fakeSupabase({ service_visits: [visit()] }, { failOn: ['service_visits'] });
  const step = surveySendVisitStep(visit(), { today: TODAY, needsVisit: true });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.equal(out.status, 500);
  assert.match(out.error, /ยังไม่ได้ส่งผล/);
});

// ══ ลำดับการเขียนทั้งปุ่ม ═══════════════════════════════════════════════
test('⭐ นัดกำลังทำ: ปิดนัดก่อน แล้วค่อยตอบใบ · เธรดของนัดถูกเขียนระหว่างสองคำสั่ง', async () => {
  const db = fakeSupabase({ service_visits: [visit()], dept_requests: [requestRow()] });
  const order = [];
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: visit(), closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
    onVisitClosed: (closed) => { order.push(`thread ${closed.id} ${closed.status}`); },
  });
  assert.equal(out.error, undefined);
  assert.equal(out.request.answeredAt, NOW);
  assert.equal(out.closedVisit.id, 'SVV-1');
  assert.deepEqual(writes(db.calls), ['service_visits', 'dept_requests'], 'ปิดนัดก่อนตอบใบเสมอ');
  assert.deepEqual(order, ['thread SVV-1 done']);
  assert.equal(db.tables.service_visits[0].status, 'done');
});

test('🔑 โมดัลไม่ได้บอกนัดนี้ (จอเก่า/ไม่ส่งรหัส/รหัสอื่น) = 409 ให้โหลดใหม่ · ไม่เขียนอะไรเลย', async () => {
  for (const closeVisitId of [null, undefined, '', 'SVV-OTHER']) {
    const db = fakeSupabase({ service_visits: [visit()], dept_requests: [requestRow()] });
    const out = await surveySendWrites(db, {
      requestId: 'DR-1', open: visit(), closeVisitId, answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
    });
    assert.equal(out.status, 409, String(closeVisitId));
    assert.match(out.error, /โหลดหน้าใหม่/);
    assert.deepEqual(writes(db.calls), []);
  }
});

test('นัดร่าง = 409 ก่อนเขียนอะไร', async () => {
  const draft = visit({ status: 'draft', actualDate: null, actualStartTime: null });
  const db = fakeSupabase({ service_visits: [draft], dept_requests: [requestRow()] });
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: draft, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
  });
  assert.equal(out.status, 409);
  assert.deepEqual(writes(db.calls), []);
});

test('ไม่มีนัดค้าง (ช่างส่งงานแล้ว) = ตอบใบอย่างเดียว · โมดัลที่เคยบอกนัดที่เพิ่งปิดไปก็ไม่ตีกลับ', async () => {
  for (const closeVisitId of [null, 'SVV-1']) {
    const db = fakeSupabase({ service_visits: [visit({ status: 'done' })], dept_requests: [requestRow()] });
    const out = await surveySendWrites(db, {
      requestId: 'DR-1', open: null, closeVisitId, answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
    });
    assert.equal(out.closedVisit, null);
    assert.equal(out.request.status, 'answered');
    assert.deepEqual(writes(db.calls), ['dept_requests']);
  }
});

test('🔴 ไม่มีสภาพครึ่งทาง: ตอบใบล้มหลังปิดนัด ⇒ 500 บอกให้กดซ้ำ · กดซ้ำแล้วจบ (ไม่ปิดนัดซ้ำ ไม่ลงเธรดซ้ำ)', async () => {
  const seed = { service_visits: [visit()], dept_requests: [requestRow()] };
  const threads = [];
  const onVisitClosed = (closed) => { threads.push(closed.id); };

  const flaky = fakeSupabase(seed, { failOn: ['dept_requests'] });
  const first = await surveySendWrites(flaky, {
    requestId: 'DR-1', open: visit(), closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true, onVisitClosed,
  });
  assert.equal(first.status, 500);
  assert.match(first.error, /ปิดนัด SV-2609001 แล้ว แต่ส่งผลไม่สำเร็จ — กดส่งผลอีกครั้ง/);
  // สภาพที่เหลือ = นัดปิด ใบยังไม่ตอบ (เท่ากับหลังช่างกดส่งงาน) — ไม่ใช่ "ตอบแล้วแต่นัดเปิด"
  assert.equal(flaky.tables.service_visits[0].status, 'done');
  assert.equal(flaky.tables.dept_requests[0].answeredAt, null);
  assert.deepEqual(threads, ['SVV-1'], 'เธรดของนัดต้องลงแล้ว — รอบสองไม่ได้ปิดเอง จะไม่มีโอกาสลงอีก');

  // กดซ้ำ: route หานัดค้างใหม่ = ไม่เจอ (ปิดไปแล้ว) · จอยังถือรหัสนัดเดิมอยู่
  const retryDb = fakeSupabase(flaky.tables);
  const retry = await surveySendWrites(retryDb, {
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true, onVisitClosed,
  });
  assert.equal(retry.request.answeredAt, NOW);
  assert.deepEqual(writes(retryDb.calls), ['dept_requests']);
  assert.deepEqual(threads, ['SVV-1'], 'ไม่ลงเธรดซ้ำ');
});

test('🔴 ช่างปิดเป็น "ทำไม่ได้" ระหว่างทาง = ไม่ตอบใบ (ใบต้องถอยไปลงคิว ไม่ใช่ส่งผลที่ไม่มีคนวัด)', async () => {
  const db = fakeSupabase({ service_visits: [visit({ status: 'unable' })], dept_requests: [requestRow()] });
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: visit(), closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
  });
  assert.equal(out.status, 409);
  assert.equal(db.tables.dept_requests[0].answeredAt, null);
});

/* 🐞 รีวิว 24/09 — นัดที่โมดัลสัญญาว่าจะปิด กลายเป็น "ทำไม่ได้" **ก่อน** server อ่าน (ไม่ใช่แข่งกันระหว่างอ่านกับเขียน)
   ⇒ หานัดค้างไม่เจอ = `none` ⇒ เดิมตอบใบไปเฉย ๆ · ช่างเพิ่งบอกฝ่ายขายว่า "ยังไม่ได้คำตอบ" (ใบถอยไปลงคิว)
   แล้วหัวหน้ากลับตอบทับ และคำสัญญาของโมดัล ("ปิดนัด SV-… เป็น “เข้าแล้ว”") ไม่ถูกทำ */
test('🔴 นัดที่โมดัลบอกว่าจะปิด กลายเป็น "ทำไม่ได้" ก่อนกด = 409 ให้โหลดใหม่ · ไม่ตอบใบ', async () => {
  const db = fakeSupabase({ service_visits: [visit({ status: 'unable' })], dept_requests: [requestRow()] });
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
  });
  assert.equal(out.status, 409);
  assert.equal(out.error,
    'นัด SV-2609001 เพิ่งเปลี่ยนเป็น “ทำไม่ได้” หลังเปิดหน้า — ยังไม่ได้ส่งผล โหลดหน้าใหม่แล้วตรวจก่อนส่งอีกครั้ง');
  assert.deepEqual(writes(db.calls), [], 'ไม่เขียนอะไรเลย');
  assert.equal(db.tables.dept_requests[0].answeredAt, null);
});

test('นัดที่โมดัลบอก: ยกเลิก · เลื่อน · ถูกลบ · เป็นนัดของใบอื่น = 409 เหมือนกัน · "เข้าแล้ว" เท่านั้นที่ไปต่อ', async () => {
  const cases = [
    [[visit({ status: 'cancelled' })], /เปลี่ยนเป็น “ยกเลิก”/],
    [[visit({ status: 'rescheduled' })], /เปลี่ยนเป็น/],
    [[], /นัด SVV-1 เพิ่งถูกลบ/],
    [[visit({ requestId: 'DR-OTHER', status: 'done' })], /ถูกลบ/],
  ];
  for (const [rows, pattern] of cases) {
    const db = fakeSupabase({ service_visits: rows, dept_requests: [requestRow()] });
    const out = await surveySendWrites(db, {
      requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
    });
    assert.equal(out.status, 409, String(rows[0]?.status));
    assert.match(out.error, pattern);
    assert.deepEqual(writes(db.calls), []);
  }
  const done = fakeSupabase({ service_visits: [visit({ status: 'done' })], dept_requests: [requestRow()] });
  const ok = await surveySendWrites(done, {
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
  });
  assert.equal(ok.request.status, 'answered', 'ช่างส่งงานเองไปแล้ว = ผลเท่ากับที่โมดัลสัญญา');
});

test('อ่านนัดที่โมดัลบอกไม่สำเร็จ = 500 บอกว่ายังไม่ได้ส่งผล · ไม่ตอบใบตอนไม่รู้', async () => {
  const db = fakeSupabase(
    { service_visits: [visit({ status: 'done' })], dept_requests: [requestRow()] },
    { failReadOn: ['service_visits'] },
  );
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
  });
  assert.equal(out.status, 500);
  assert.match(out.error, /ยังไม่ได้ส่งผล/);
  assert.deepEqual(writes(db.calls), []);
});

test('🔑 ตอบได้ครั้งเดียว — หัวหน้าอีกคนส่งไปก่อน = 409 ไม่ใช่ "ตอบแล้ว" รอบสอง (กระดิ่งเด้งซ้ำ)', async () => {
  const db = fakeSupabase({ service_visits: [], dept_requests: [requestRow({ answeredAt: '2026-09-24T07:59:00.000Z', status: 'answered' })] });
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: null, closeVisitId: null, answerPatch, today: TODAY, nowIso: NOW, needsVisit: true,
  });
  assert.equal(out.status, 409);
  assert.match(out.error, /ส่งผลไปแล้ว/);
  assert.equal(db.tables.dept_requests[0].answeredAt, '2026-09-24T07:59:00.000Z');
});

// ── โมดัลยืนยัน "ส่งผล" บอกผลทุกข้อ รวมการปิดนัด (มติเจ้าของ 24/09 ข้อ 2 · กติกาโมดัลบอกผลลัพธ์) ─────────
/* ⭐ ข้อมูลตั้งต้นของโมดัล = `view.send.closesVisit` ของการ์ดควบคุม — รูปเดียวกับที่ `surveyControlView` คืน */
const closes = (over = {}) => ({
  id: 'SVV-1', code: 'SV-2609001', status: 'in_progress', statusLabel: 'กำลังทำ',
  actualDate: '2026-09-22', startTime: '14:05', ...over,
});

test('⭐ นัดกำลังทำ: โมดัลบอกว่าจะปิดนัดไหน เก็บเวลาเริ่มที่ช่างกด และไม่ใส่เวลาจบ · ปุ่ม "ส่งผลและปิดนัด"', () => {
  const c = surveySendConfirm({ docNo: 'AS-26090001', closesVisit: closes() });
  assert.equal(c.confirmLabel, 'ส่งผลและปิดนัด');
  assert.deepEqual(c.effects, [
    'ใบ AS-26090001 เป็น “ตอบแล้ว” — ฝ่ายขายได้แจ้งเตือนและเอาตัวเลขไปตั้งราคาได้ทันที',
    'ผลประเมินล็อก แก้ไม่ได้ จนกว่าหัวหน้าจะกด “ดึงผลกลับมาแก้”',
    'ปิดนัด SV-2609001 เป็น “เข้าแล้ว” ไปพร้อมกัน — ช่างยังไม่ได้กดส่งงาน · เก็บเวลาเริ่ม 14:05 น. ที่ช่างกดไว้ ไม่ใส่เวลาจบให้',
    'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”',
  ]);
});

test('นัดยังนัดไว้ (ไม่เคยกดเริ่ม): บอกวันเข้าที่จะบันทึก และบอกตรง ๆ ว่าไม่มีเวลาเข้าจริง', () => {
  const c = surveySendConfirm({
    docNo: 'AS-26090001', closesVisit: closes({ status: 'scheduled', statusLabel: 'นัดไว้', startTime: null, actualDate: '2026-09-23' }),
  });
  assert.equal(c.confirmLabel, 'ส่งผลและปิดนัด');
  assert.equal(c.effects[2],
    'ปิดนัด SV-2609001 เป็น “เข้าแล้ว” ไปพร้อมกัน — ช่างยังไม่เคยกดเริ่มงาน · บันทึกวันเข้าเป็น 23/09/2026 ไม่มีเวลาเข้าจริง');
});

test('นัดกำลังทำแต่ไม่มีเวลาเริ่ม (ตั้งสถานะจากฟอร์มแก้) — ห้ามพูดถึงเวลาเริ่มที่ไม่มีอยู่จริง', () => {
  const line = surveySendConfirm({ docNo: 'AS-1', closesVisit: closes({ startTime: null }) }).effects[2];
  assert.match(line, /ช่างยังไม่ได้กดส่งงาน · บันทึกวันเข้าเป็น 22\/09\/2026 ไม่มีเวลาเข้าจริง$/);
  assert.doesNotMatch(line, /เก็บเวลาเริ่ม/);
});

test('ไม่มีนัดต้องปิด = ไม่มีข้อ "ปิดนัด" และปุ่มเขียนว่า "ส่งผล" เฉย ๆ (ปุ่มพูดตามผลของการกด)', () => {
  const c = surveySendConfirm({ docNo: 'AS-26090001', closesVisit: null });
  assert.equal(c.confirmLabel, 'ส่งผล');
  assert.equal(c.effects.length, 3);
  assert.ok(c.effects.every((line) => !/ปิดนัด/.test(line)));
  assert.match(surveySendConfirm({}).effects[0], /^ใบนี้ เป็น “ตอบแล้ว”/, 'ไม่มีเลขที่ = ไม่มีช่องว่างลอย');
});

test('🔑 ข้อ "ปิดนัด" ในโมดัลมาจากตัวตัดสินตัวเดียวกับที่ route ปิดจริง — ร่าง/ปิดแล้ว = ไม่มีข้อนี้', () => {
  /* โมดัลอ่าน `closesVisit` ซึ่ง `surveyControlView` ประกอบจาก `surveySendVisitStep` — ตัวเดียวกับ `surveySendWrites` */
  for (const status of ['draft', 'done', 'unable', 'cancelled', 'rescheduled']) {
    assert.notEqual(surveySendVisitStep(visit({ status }), { today: TODAY, needsVisit: true }).action, 'close', status);
  }
  for (const status of ['scheduled', 'in_progress']) {
    assert.equal(surveySendVisitStep(visit({ status }), { today: TODAY, needsVisit: true }).action, 'close', status);
  }
});

test('toast หลังส่งผลบอกผลกับนัดด้วย · ไม่ได้ปิดนัด = ข้อความเดิม', () => {
  assert.equal(surveySendDoneText({ id: 'SVV-1', code: 'SV-2609001' }), 'ส่งผลให้ฝ่ายขายแล้ว · ปิดนัด SV-2609001 เป็น “เข้าแล้ว”');
  assert.equal(surveySendDoneText(null), 'ส่งผลให้ฝ่ายขายแล้ว');
  assert.equal(surveySendDoneText(), 'ส่งผลให้ฝ่ายขายแล้ว');
});

/* 🐞 review 26/09 — ส่งกลับให้ช่างแก้ค้างอยู่ (ช่างยังไม่แจ้งว่าแก้แล้ว) แต่ด่านเขียวหมด ⇒ ส่งผลได้ (เตือน ไม่บล็อก)
   แต่โมดัลต้องบอกก่อนกดว่า **ส่งแล้วเรื่องนั้นปิด และช่างแก้ต่อไม่ได้** (ใบล็อก) — กติกาโมดัลบอกผลลัพธ์ */
test('🐞 ส่งกลับค้างอยู่ = โมดัลบอกว่าส่งผลจะปิดเรื่องนั้นไปด้วย · ต่อท้ายข้อ "ล็อก" · ไม่มีเรื่องค้าง = ไม่มีข้อนี้', () => {
  const c = surveySendConfirm({ docNo: 'AS-26090001', closesVisit: closes(), sendBackPending: { itemCount: 2 } });
  assert.equal(c.confirmLabel, 'ส่งผลและปิดนัด', 'เตือนอย่างเดียว ป้ายปุ่มไม่เปลี่ยน');
  assert.equal(c.effects.length, 5);
  assert.match(c.effects[1], /^ผลประเมินล็อก/);
  assert.equal(c.effects[2],
    'เรื่องที่ส่งกลับให้ช่างแก้ 2 ข้อ ยังรอช่างแจ้งว่าแก้แล้ว — ส่งผลแล้วช่างแก้ต่อไม่ได้ (ดึงผลกลับมาแก้ = เรื่องนี้กลับมารอช่างอีกครั้ง)');
  assert.match(c.effects[3], /^ปิดนัด SV-2609001/);

  // ไม่รู้จำนวนข้อ (แถวเก่าไม่มีข้อ) = ไม่มีตัวเลขลอย
  assert.equal(surveySendConfirm({ sendBackPending: { itemCount: 0 } }).effects[2],
    'เรื่องที่ส่งกลับให้ช่างแก้ ยังรอช่างแจ้งว่าแก้แล้ว — ส่งผลแล้วช่างแก้ต่อไม่ได้ (ดึงผลกลับมาแก้ = เรื่องนี้กลับมารอช่างอีกครั้ง)');
  for (const none of [null, undefined]) {
    const plain = surveySendConfirm({ docNo: 'AS-1', sendBackPending: none });
    assert.equal(plain.effects.length, 3);
    assert.ok(plain.effects.every((line) => !/ส่งกลับ/.test(line)));
  }
});

/* ══ ส่งผล = ออกเอกสารประเมินด้วย (สเปก PR-2 §2 · §8) ═══════════════════════════════════════
 * ตรรกะล้วนของ route ส่งผล — เทสต์ระดับ route (ของปลอมทั้งเส้น) อยู่ที่ surveySendRoute.test.mjs */

test('⭐ โมดัลยืนยัน: ไม่ส่งสามตัวใหม่ (issuesDocument · replacesDocNo · warnings) = ผลเท่าเดิมทุกตัวอักษร', () => {
  const base = { docNo: 'AS-26090001', closesVisit: closes(), sendBackPending: { itemCount: 2 }, sizeReview: { text: 'พื้นที่ 1 ยังไม่ได้เทียบขนาด' } };
  const before = surveySendConfirm(base);
  for (const extra of [
    {}, { issuesDocument: false }, { issuesDocument: false, replacesDocNo: 'SU-26100001-0' },
    { warnings: null }, { warnings: [] }, { warnings: ['', '   ', null, 7] }, { issuesDocument: undefined, replacesDocNo: null, warnings: undefined },
    // PR-3: ตัวที่สี่ (`documentUnknown`) — ไม่ส่ง/ไม่ใช่ true ตรงตัว = ไม่มีข้อเพิ่ม
    { documentUnknown: false }, { documentUnknown: undefined }, { documentUnknown: null }, { documentUnknown: 'true' }, { documentUnknown: 1 },
    // PR-SIG: ตัวที่ห้า (`signers`) — ไม่ส่ง/ว่าง = ไม่มีข้อเพิ่ม · มีรายชื่อแต่การส่งครั้งนี้ไม่ออกเอกสาร = ไม่มีข้อเพิ่มเหมือนกัน
    { signers: null }, { signers: [] }, { signers: undefined },
    { signers: [{ seats: ['assessor'], name: 'สมชาย' }, { seats: ['approver'], name: 'หัวหน้า ก' }] },
  ]) {
    assert.deepEqual(surveySendConfirm({ ...base, ...extra }), before, JSON.stringify(extra));
  }
  assert.deepEqual(Object.keys(before), ['effects', 'confirmLabel']);
  assert.ok(before.effects.every((line) => !/เอกสารประเมิน|ฉบับลูกค้า/.test(line)));
});

test('โมดัลยืนยัน: ส่งผลที่ออกเอกสารด้วยบอกก่อนกด — ข้อออกเอกสารต่อจากข้อปิดนัด · คำเตือนทีละข้อ · ป้ายปุ่มไม่เปลี่ยน', () => {
  const warnings = [
    'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — ฉบับลูกค้าไม่ควรเอ่ยถึงเครื่อง ตรวจข้อความก่อนส่ง',
    'ชื่อพื้นที่ 2 มีอักขระที่เอกสารพิมพ์ไม่ได้ (😀 U+1F600) — จะขึ้นเป็นกล่องสี่เหลี่ยม',
  ];
  const c = surveySendConfirm({ docNo: 'AS-26090001', closesVisit: closes(), issuesDocument: true, warnings });
  assert.equal(c.confirmLabel, 'ส่งผลและปิดนัด');
  assert.equal(c.effects.length, 7);
  assert.match(c.effects[2], /^ปิดนัด SV-2609001/);
  assert.equal(c.effects[3],
    'ออกเอกสารประเมิน (เลข SU) ไปพร้อมกัน — ฝ่ายขายดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง · เอกสารที่ออกแล้วแก้ไม่ได้ (แก้ = ดึงผลกลับแล้วส่งใหม่เป็น Rev ถัดไป)');
  // คำเตือนพิมพ์ตามที่ server ให้มา ไม่ตัด ไม่แก้ — จอส่งสตริงชุดเดียวกันนี้กลับเป็น seenWarnings
  assert.equal(c.effects[4], `ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${warnings[0]}`);
  assert.equal(c.effects[5], `ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${warnings[1]}`);
  assert.equal(c.effects[6], 'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”', 'ข้อปิดท้ายยังเป็นข้อสุดท้าย');

  // ส่งรอบใหม่หลังดึงกลับ — บอกเลขฉบับที่ถูกแทนที่ · ไม่มีนัดต้องปิด = ป้าย "ส่งผล"
  const again = surveySendConfirm({ docNo: 'AS-26090001', issuesDocument: true, replacesDocNo: ' SU-26100001-0 ' });
  assert.equal(again.confirmLabel, 'ส่งผล');
  assert.equal(again.effects.length, 4);
  assert.match(again.effects[2], /^ออกเอกสารประเมินฉบับใหม่ \(Rev ถัดไป\) แทน SU-26100001-0 ที่ใช้ไม่ได้แล้ว — /);
});

test('ค่าคงที่ของเส้นส่งผล: งบรอบตรวจรูป 60 วิ · ประโยคตีกลับตรงตามสเปก · report ตอนสวิตช์ปิด', () => {
  assert.equal(SURVEY_SEND_PREFLIGHT_MS, 60_000);
  assert.equal(SURVEY_SEND_OLD_PAGE_ERROR, 'หน้านี้เป็นรุ่นเก่า — โหลดหน้าใหม่ก่อนส่งผล (การส่งผลจะออกเอกสาร SU ด้วย)');
  assert.equal(SURVEY_SEND_WARNINGS_CHANGED_ERROR, 'ข้อความบนเอกสารเปลี่ยนไปหลังเปิดหน้า — โหลดหน้าใหม่แล้วอ่านคำเตือนก่อนส่งอีกครั้ง');
  assert.deepEqual(SURVEY_SEND_REPORT_OFF, { state: 'off' });
  assert.ok(Object.isFrozen(SURVEY_SEND_REPORT_OFF));
});

test('คำเตือนที่จอยังไม่เห็น: เทียบสตริงตรงตัว · ข้อที่จอส่งมาเกินไม่นับ · ของที่ไม่ใช่สตริงถูกข้าม', () => {
  const w = ['หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง"', 'ที่อยู่ มีอักขระที่เอกสารพิมพ์ไม่ได้'];
  assert.deepEqual(surveySendUnseenWarnings(w, [...w]), []);
  assert.deepEqual(surveySendUnseenWarnings(w, [w[1], 'ข้อที่หายไปแล้ว', w[0]]), []);
  assert.deepEqual(surveySendUnseenWarnings(w, [w[0]]), [w[1]]);
  assert.deepEqual(surveySendUnseenWarnings(w, []), w);
  assert.deepEqual(surveySendUnseenWarnings(w, [`${w[0]} `, w[1].slice(0, 10)]), w, 'ช่องว่างเกิน/ตรงบางส่วน = ยังไม่เห็น');
  assert.deepEqual(surveySendUnseenWarnings(w, [{ text: w[0] }, 1, null]), w);
  assert.deepEqual(surveySendUnseenWarnings(w, null), w);
  assert.deepEqual(surveySendUnseenWarnings([], ['อะไรก็ได้']), []);
  assert.deepEqual(surveySendUnseenWarnings(null, null), []);
});

test('🔴 รูปเปิดไม่ได้: ตีกลับเฉพาะไฟล์ที่เสียถาวร พร้อมชื่อไฟล์ · ล้มชั่วคราว (Drive · เวลา · sharp) ไม่ตีกลับ', () => {
  const transient = [
    { attId: 'A1', fileName: 'a.jpg', reason: 'drive_timeout', permanent: false },
    { attId: 'A2', fileName: 'b.jpg', reason: 'timeout', permanent: false },
    { attId: 'A3', fileName: 'c.jpg', reason: 'sharp_unavailable', permanent: false },
    { attId: 'A4', fileName: 'd.jpg', reason: 'upload_failed', permanent: false },
    { attId: 'A5', fileName: 'e.jpg', reason: 'drive_error' }, // ไม่บอกชนิด = ไม่ใช่ถาวร
  ];
  assert.equal(surveySendImageRefusal(transient), null);
  assert.equal(surveySendImageRefusal([]), null);
  assert.equal(surveySendImageRefusal(null), null);

  const broken = [
    ...transient,
    { attId: 'B1', fileName: 'IMG_0001.jpg', reason: 'undecodable', permanent: true },
    { attId: 'B2', fileName: 'ผัง ชั้น 2.png', reason: 'drive_not_found', permanent: true },
  ];
  assert.equal(surveySendImageRefusal(broken),
    'รูป 2 รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ IMG_0001.jpg · ผัง ชั้น 2.png) · ยังไม่ได้ส่งผล');
  // ชื่อซ้ำ (ไฟล์เดียวกันอัปสองที่) พิมพ์ครั้งเดียว แต่จำนวนนับตามไฟล์ · ไม่มีชื่อ = รหัสไฟล์แนบ
  assert.equal(surveySendImageRefusal([
    { attId: 'B1', fileName: 'S__1.jpg', permanent: true }, { attId: 'B2', fileName: 'S__1.jpg', permanent: true },
    { attId: 'B3', fileName: '', permanent: true },
  ]), 'รูป 3 รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ S__1.jpg · B3) · ยังไม่ได้ส่งผล');
});

test('🔴 เอกสารออกไม่ได้: ตีกลับเฉพาะเหตุของใบ (content) · เหตุของระบบ (system) ไม่ขวางการส่งผล', () => {
  assert.equal(surveySendDocumentRefusal([]), null);
  assert.equal(surveySendDocumentRefusal(null), null);
  assert.equal(surveySendDocumentRefusal([
    { kind: 'system', text: 'ยังไม่มีข้อมูลบริษัทที่เผยแพร่' }, { kind: 'system', text: 'อ่านนัดไม่สำเร็จ' },
    { kind: 'อื่น', text: 'ชนิดที่ไม่รู้จัก' }, { text: 'ไม่มีชนิด' },
  ]), null);
  assert.equal(surveySendDocumentRefusal([
    { kind: 'system', text: 'ยังไม่มีแบบฟอร์มที่เผยแพร่' },
    { kind: 'content', text: 'ภาพผังของพื้นที่ 1 เป็น PDF' },
    { kind: 'content', text: 'ฉบับลูกค้า: หน้า 2 ล้น' },
    { kind: 'content', text: 'ภาพผังของพื้นที่ 1 เป็น PDF' },
    { kind: 'content', text: '  ' },
  ]), 'ออกเอกสารไม่ได้ — ภาพผังของพื้นที่ 1 เป็น PDF | ฉบับลูกค้า: หน้า 2 ล้น · ยังไม่ได้ส่งผล');
});

/* 🐞 UAT PR-3 (S03): ประโยคของ route ต่อเหตุด้วย " | " — บนการ์ดกว้าง 298px อ่านเป็นก้อนเดียว ⇒ จอวาด "บรรทัดนำ + รายการ" ของประโยคเดียวกัน */
test('รูป "บรรทัดนำ + รายการ" ของประโยคเอกสารออกไม่ได้: เหตุชุดเดียวกับประโยคเต็ม (เฉพาะ content · ไม่ซ้ำ · ลำดับเดิม) · ท่อนหัว/ท้ายคำเดียวกัน', () => {
  assert.equal(surveySendDocumentRefusalList([]), null);
  assert.equal(surveySendDocumentRefusalList(null), null);
  assert.equal(surveySendDocumentRefusalList([{ kind: 'system', text: 'ยังไม่มีข้อมูลบริษัทที่เผยแพร่' }, { text: 'ไม่มีชนิด' }]), null);
  const blockers = [
    { kind: 'system', text: 'ยังไม่มีแบบฟอร์มที่เผยแพร่' },
    { kind: 'content', text: 'ภาพผังของพื้นที่ 1 เป็น PDF' },
    { kind: 'content', text: 'ฉบับลูกค้า: หน้า 2 ล้น' },
    { kind: 'content', text: 'ภาพผังของพื้นที่ 1 เป็น PDF' },
    { kind: 'content', text: '  ' },
  ];
  const list = surveySendDocumentRefusalList(blockers);
  assert.deepEqual(list, {
    lead: 'ออกเอกสารไม่ได้ — ติด 2 ข้อ · ยังไม่ได้ส่งผล',
    items: ['ภาพผังของพื้นที่ 1 เป็น PDF', 'ฉบับลูกค้า: หน้า 2 ล้น'],
  });
  /* สองรูปของประโยคเดียวกัน — ประกอบรายการกลับด้วย " | " ต้องได้ประโยคเต็มของ route ทุกตัวอักษร */
  const [head, tail] = list.lead.split('ติด 2 ข้อ');
  assert.equal(`${head}${list.items.join(' | ')}${tail}`, surveySendDocumentRefusal(blockers));
  assert.doesNotMatch(list.lead, / \| /);
});

test('🔴 ฐานของส่วนต่าง = แถวแรก (ใหม่ก่อน) ที่พก meta.totals — แถวคำตอบรุ่นก่อนที่ไม่มียอดถูกข้าม', () => {
  const t = (n) => ({ zones: n, areaSqm: n * 10, packageQty: n });
  assert.equal(surveySendDiffBaseline([]), null);
  assert.equal(surveySendDiffBaseline(null), null);
  assert.equal(surveySendDiffBaseline([{ kind: 'answer', meta: { dept: 'TS' } }, { kind: 'answer', meta: null }, { kind: 'answer' }]), null);
  // ส่ง → "ยังไม่จบ" → ส่ง: ไม่มีแถวดึงกลับ ฐานคือแถวคำตอบของรอบก่อน
  assert.deepEqual(surveySendDiffBaseline([{ kind: 'answer', meta: { dept: 'TS', totals: t(2) } }]), t(2));
  // ดึงกลับ → ส่ง → ดึงกลับ: แถวดึงกลับล่าสุดมาก่อน (ยอดเท่ากับการส่งรอบนั้น)
  assert.deepEqual(surveySendDiffBaseline([
    { kind: 'recall', meta: { totals: t(3) } }, { kind: 'answer', meta: { dept: 'TS', totals: t(3) } },
    { kind: 'recall', meta: { totals: t(2) } },
  ]), t(3));
  // แถวคำตอบก่อน PR-2 ไม่มียอด ⇒ ถอยไปแถวดึงกลับ (พฤติกรรมเดิม)
  assert.deepEqual(surveySendDiffBaseline([{ kind: 'answer', meta: { dept: 'TS' } }, { kind: 'recall', meta: { totals: t(1) } }]), t(1));
  // ยอดที่ไม่ใช่ object ไม่นับ
  assert.deepEqual(surveySendDiffBaseline([{ meta: { totals: 'x' } }, { meta: { totals: [1] } }, { meta: { totals: t(4) } }]), t(4));
});

test('🔴 report ของคำตอบ: หยิบทีละคีย์ (id ของแถวเอกสารไม่ออก) · ผลที่อ่านไม่ออก = failed ที่กดซ้ำได้', () => {
  const issued = {
    state: 'issued', code: null, docNo: 'SU-26100001-0', rev: 0, reused: false, reasons: [], reason: null, retry: false,
    warnings: ['คำเตือน 1', '', null], reportId: 'SVR-ลับ', snapshot: { v: 1 },
  };
  assert.deepEqual(surveySendReport(issued), { state: 'issued', docNo: 'SU-26100001-0', rev: 0, reused: false, warnings: ['คำเตือน 1'] });
  assert.deepEqual(surveySendReport({ ...issued, rev: 2, reused: true, warnings: undefined }),
    { state: 'issued', docNo: 'SU-26100001-0', rev: 2, reused: true, warnings: [] });

  const failed = { state: 'failed', code: 'images_failed', docNo: null, rev: null, reused: false, reasons: ['a.jpg'], reason: 'ดึงรูปจาก Drive ไม่สำเร็จ 1 รูป', retry: true, warnings: [], reportId: null };
  assert.deepEqual(surveySendReport(failed), { state: 'failed', code: 'images_failed', reason: 'ดึงรูปจาก Drive ไม่สำเร็จ 1 รูป', retry: true });
  assert.deepEqual(surveySendReport({ ...failed, code: 'undecodable', retry: false }).retry, false);
  assert.equal(surveySendReport({ ...failed, retry: 'yes' }).retry, false, 'retry ต้องเป็น true ตรงตัว');

  const fallback = { state: 'failed', code: 'internal', reason: SURVEY_SEND_REPORT_FAILED, retry: true };
  for (const odd of [null, undefined, {}, 'issued', { state: 'issued' }, { state: 'issued', docNo: '  ' }, { state: 'อื่น', docNo: 'SU-1' }]) {
    assert.deepEqual(surveySendReport(odd), fallback, JSON.stringify(odd));
  }
  assert.deepEqual(surveySendReport({ state: 'failed' }), { state: 'failed', code: 'internal', reason: SURVEY_SEND_REPORT_FAILED, retry: false });
});

/* ══ PR-3 (สเปก §3.5) — โมดัลบอกผลเมื่ออ่านสถานะเอกสารไม่สำเร็จ · toast ที่บอกเลขเอกสาร · การตีกลับที่การ์ดเก็บไว้ ══ */

test('โมดัลยืนยัน: คำเตือนที่ซ้ำกันตามตัวอักษรขึ้นข้อเดียว (จอใช้ข้อความเป็น key ของข้อ) · ลำดับเดิม', () => {
  const a = 'หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา ตรวจข้อความก่อนส่ง';
  const b = 'ชื่อลูกค้า มีอักขระที่เอกสารพิมพ์ไม่ได้ (😀 U+1F600) — จะขึ้นเป็นกล่องสี่เหลี่ยม';
  const c = surveySendConfirm({ docNo: 'AS-26090001', issuesDocument: true, warnings: [a, b, a, b, a] });
  assert.deepEqual(c.effects.slice(3), [
    `ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${a}`,
    `ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${b}`,
    'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”',
  ]);
  assert.equal(new Set(c.effects).size, c.effects.length);
  // ต่างกันช่องว่างเดียว = คนละบรรทัด (ไม่ขัดเกลา — server เทียบตรงตัว)
  assert.equal(surveySendConfirm({ issuesDocument: true, warnings: [a, `${a} `] }).effects.length, 6);
});

test('โมดัลยืนยัน: อ่านสถานะเอกสารไม่สำเร็จ = บอกผลแบบมีเงื่อนไข หนึ่งข้อก่อนข้อปิดท้าย · ป้ายปุ่มไม่เปลี่ยน', () => {
  const line = 'อ่านสถานะเอกสารประเมินไม่สำเร็จ — ถ้าระบบเปิดออกเอกสารตอนส่งผลอยู่ การส่งครั้งนี้จะออกเลข SU ด้วย';
  const plain = surveySendConfirm({ docNo: 'AS-26090001', closesVisit: closes() });
  const unknown = surveySendConfirm({ docNo: 'AS-26090001', closesVisit: closes(), documentUnknown: true });
  assert.equal(unknown.confirmLabel, plain.confirmLabel);
  assert.equal(unknown.effects.length, plain.effects.length + 1);
  assert.equal(unknown.effects.at(-2), line);
  assert.equal(unknown.effects.at(-1), 'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”');
  assert.deepEqual(unknown.effects.filter((l) => l !== line), plain.effects, 'ข้ออื่นไม่ขยับ');
  // ไม่รู้ = ไม่มีข้อ "ออกเอกสาร" ที่พูดเหมือนรู้แน่
  assert.ok(unknown.effects.every((l) => !/^ออกเอกสารประเมิน/.test(l)));
});

test('toast หลังส่งผล: ไม่มีเอกสาร = ข้อความเดิม · โมดัลสัญญาเอกสารแต่สวิตช์ถูกปิด = เตือน · ออกแล้วบอกเลข · ออกไม่สำเร็จชี้ไปส่วนเอกสาร', () => {
  const closedVisit = { id: 'SVV-1', code: 'SV-2609001' };
  const visitPart = ' · ปิดนัด SV-2609001 เป็น “เข้าแล้ว”';

  // สวิตช์ปิด และโมดัลไม่ได้บอกเรื่องเอกสาร — เท่าเดิมทุกตัวอักษร ไม่มีคีย์ `duration` (ใช้ค่าตั้งต้นของ toast)
  for (const res of [{}, { report: SURVEY_SEND_REPORT_OFF }, { report: null }, { report: { state: 'อื่น' } }, null, undefined]) {
    assert.deepEqual(surveySendDoneToast(res), { kind: 'success', msg: 'ส่งผลให้ฝ่ายขายแล้ว' }, JSON.stringify(res));
  }
  assert.deepEqual(surveySendDoneToast({ closedVisit, report: SURVEY_SEND_REPORT_OFF }, { expectedDocument: false }),
    { kind: 'success', msg: surveySendDoneText(closedVisit) });

  // โมดัลบอกว่าจะออกเอกสาร แต่คำตอบไม่มีเอกสาร (ถอยรุ่นระหว่างที่แท็บเปิดอยู่)
  const offText = 'ส่งผลให้ฝ่ายขายแล้ว · เอกสารยังไม่ออก — กด “ออกเอกสาร” ที่ส่วน “เอกสารประเมินพื้นที่”';
  assert.deepEqual(surveySendDoneToast({ report: SURVEY_SEND_REPORT_OFF }, { expectedDocument: true }),
    { kind: 'warning', duration: 9000, msg: offText });
  assert.deepEqual(surveySendDoneToast({ closedVisit }, { expectedDocument: true }),
    { kind: 'warning', duration: 9000, msg: `${offText}${visitPart}` });

  // ออกเอกสารแล้ว — เลขกับนัดเท่านั้น (คำเตือนที่ยังไม่ได้อ่านไปอยู่ที่ส่วนเอกสาร)
  const issued = surveySendReport({ state: 'issued', docNo: 'SU-26100001-0', rev: 0, reused: false, warnings: ['พื้นที่ 1: มีภาพผัง 3 รูป'] });
  assert.deepEqual(surveySendDoneToast({ report: issued }, { expectedDocument: true }),
    { kind: 'success', duration: 6000, msg: 'ส่งผลให้ฝ่ายขายแล้ว · ออกเอกสาร SU-26100001-0' });
  assert.deepEqual(surveySendDoneToast({ closedVisit, report: issued }, { expectedDocument: true }),
    { kind: 'success', duration: 6000, msg: `ส่งผลให้ฝ่ายขายแล้ว · ออกเอกสาร SU-26100001-0${visitPart}` });
  assert.doesNotMatch(surveySendDoneToast({ report: issued }).msg, /ภาพผัง/);

  // ส่งผลสำเร็จ เอกสารยังไม่ออก — เหตุอยู่ที่ส่วนเอกสาร (ไม่ยัดประโยคยาวลง toast)
  const failed = surveySendReport({ state: 'failed', code: 'undecodable', reason: 'รูป 1 รูปเปิดไม่ได้ — ดึงผลกลับมาอัปใหม่', retry: false });
  const failText = 'ส่งผลให้ฝ่ายขายแล้ว · เอกสารยังไม่ออก — ดูเหตุที่ส่วน “เอกสารประเมินพื้นที่”';
  for (const expectedDocument of [true, false]) {
    assert.deepEqual(surveySendDoneToast({ report: failed }, { expectedDocument }), { kind: 'warning', duration: 9000, msg: failText });
  }
  assert.deepEqual(surveySendDoneToast({ closedVisit, report: failed }, { expectedDocument: true }),
    { kind: 'warning', duration: 9000, msg: `${failText}${visitPart}` });
  // "ออกแล้ว" ที่ไม่มีเลข = ไม่อ้างว่าออกแล้ว
  assert.equal(surveySendDoneToast({ report: { state: 'issued', docNo: '  ' } }).kind, 'warning');
});

test('การตีกลับที่การ์ดเก็บไว้ = รูปเปิดไม่ได้เท่านั้น — ตรงกับผลของตัวสร้างประโยค · การตีกลับอื่นไม่เก็บ', () => {
  const one = surveySendImageRefusal([{ attId: 'B1', fileName: 'IMG_0001.jpg', permanent: true }]);
  const many = surveySendImageRefusal(Array.from({ length: 12 }, (_, i) => ({ attId: `B${i}`, fileName: `ผัง ${i}.png`, permanent: true })));
  assert.equal(surveySendRefusalKeeps(one), true);
  assert.equal(surveySendRefusalKeeps(many), true);
  assert.match(many, /^รูป 12 รูปเปิดไม่ได้/);

  const draft = surveySendVisitStep(visit({ status: 'draft' }), { today: TODAY, needsVisit: true }).error;
  const others = [
    SURVEY_SEND_OLD_PAGE_ERROR,
    SURVEY_SEND_WARNINGS_CHANGED_ERROR,
    surveySendDocumentRefusal([{ kind: 'content', text: 'รูป 2 รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ a.jpg)' }]),
    draft,
    'นัดของใบนี้เปลี่ยนไปหลังเปิดหน้า — โหลดหน้าใหม่แล้วกดส่งผลอีกครั้ง',
    'ใบนี้ถูกส่งผลไปแล้ว — โหลดหน้าใหม่เพื่อดูผลล่าสุด',
    'ส่งผลไม่สำเร็จ',
    'รูป หลายรูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ a.jpg) · ยังไม่ได้ส่งผล',
    'รูป 2 รูปเปิดไม่ได้',
  ];
  for (const message of others) {
    assert.ok(typeof message === 'string' && message, 'ประโยคตัวอย่างต้องมีจริง');
    assert.equal(surveySendRefusalKeeps(message), false, message);
  }
  for (const none of [null, undefined, '', 7, { message: one }, [one]]) assert.equal(surveySendRefusalKeeps(none), false);
});

/* ══ ลายเซ็นจริงของผู้ลงนาม (PR-SIG §3.3 · §5 · มติเจ้าของ 09/10/2026) ════════════════════════════ */

const SIGNERS = [{ seats: ['assessor'], name: 'สมชาย' }, { seats: ['approver'], name: 'หัวหน้า ก' }];
const ISSUE_LINE = 'ออกเอกสารประเมิน (เลข SU) ไปพร้อมกัน — ฝ่ายขายดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง · เอกสารที่ออกแล้วแก้ไม่ได้ (แก้ = ดึงผลกลับแล้วส่งใหม่เป็น Rev ถัดไป)';

test('โมดัลยืนยัน · ลายเซ็นจริง: เอ่ยชื่อผู้ลงนามต่อจากข้อออกเอกสารทันที — เฉพาะเมื่อการส่งครั้งนี้ออกเอกสาร · ป้ายปุ่มไม่เปลี่ยน', () => {
  const warnings = ['หมายเหตุพื้นที่ 1 มีคำว่า "เครื่อง" — ตรวจข้อความก่อนส่ง'];
  const base = { docNo: 'AS-26090001', closesVisit: closes(), issuesDocument: true, warnings };
  const plain = surveySendConfirm(base);
  const c = surveySendConfirm({ ...base, signers: SIGNERS });
  const at = plain.effects.indexOf(ISSUE_LINE);
  assert.ok(at > 0);
  assert.deepEqual(c.effects, [
    ...plain.effects.slice(0, at + 1),
    'เอกสารจะพิมพ์ลายเซ็นที่บันทึกไว้ของ สมชาย (ผู้ประเมิน) และ หัวหน้า ก (ผู้ตรวจสอบและอนุมัติ)',
    ...plain.effects.slice(at + 1),
  ]);
  assert.equal(c.confirmLabel, plain.confirmLabel);
  assert.deepEqual(Object.keys(c), ['effects', 'confirmLabel']);
  assert.equal(new Set(c.effects).size, c.effects.length, 'จอใช้ข้อความเป็น key ของข้อ');
  assert.equal(c.effects[at + 1], `เอกสารจะพิมพ์ลายเซ็นที่บันทึกไว้ของ ${surveyReportSignersText(SIGNERS)}`);

  // คนเดียวสองที่นั่ง (หัวหน้าไปประเมินเองแล้วส่งเอง)
  const same = surveySendConfirm({ ...base, signers: [{ seats: ['assessor', 'approver'], name: 'หัวหน้า ก' }] });
  assert.equal(same.effects[at + 1], 'เอกสารจะพิมพ์ลายเซ็นที่บันทึกไว้ของ หัวหน้า ก ทั้งสองช่อง (ผู้ประเมิน และผู้ตรวจสอบและอนุมัติ)');
  // ส่งรอบใหม่หลังดึงกลับ — ต่อจากข้อ "ออกฉบับใหม่ (Rev ถัดไป)"
  const again = surveySendConfirm({ docNo: 'AS-26090001', issuesDocument: true, replacesDocNo: 'SU-26100001-0', signers: SIGNERS });
  assert.match(again.effects[2], /^ออกเอกสารประเมินฉบับใหม่ \(Rev ถัดไป\) แทน SU-26100001-0/);
  assert.match(again.effects[3], /^เอกสารจะพิมพ์ลายเซ็นที่บันทึกไว้ของ สมชาย/);

  // รูปที่อ่านไม่ออก = ไม่มีข้อนี้ (ไม่พิมพ์ประโยคครึ่งท่อน)
  for (const odd of ['x', [{ seats: ['sales'], name: 'ก' }], [{ seats: ['assessor'], name: '  ' }], [null]]) {
    assert.deepEqual(surveySendConfirm({ ...base, signers: odd }), plain, JSON.stringify(odd));
  }
});

test('🔴 โมดัลยืนยัน · ลายเซ็นจริง: การส่งที่ไม่ออกเอกสารไม่อ้างว่าจะพิมพ์ลายเซ็น — สวิตช์ปิด · อ่านสถานะไม่สำเร็จ (ใบลงหน้างาน · ใบผสม · จากแบบทั้งใบ)', () => {
  const noLine = (c, at) => assert.ok(c.effects.every((line) => !line.includes('ลายเซ็น')), `${at}\n${c.effects.join('\n')}`);
  const sheets = [
    ['ลงหน้างาน', null],
    ['ผสม', { mix: { onsite: 1, drawing: 1, mode: 'mixed' }, confirm: 'needed', openVisit: null }],
    ['จากแบบทั้งใบ', { mix: { onsite: 0, drawing: 2, mode: 'drawing' }, confirm: 'not_needed', openVisit: null }],
  ];
  for (const [at, method] of sheets) {
    noLine(surveySendConfirm({ docNo: 'AS-26090001', issuesDocument: false, signers: SIGNERS, method }), at);
    noLine(surveySendConfirm({ docNo: 'AS-26090001', documentUnknown: true, signers: SIGNERS, method }), at);
  }
});

/* ══ งวด S3 — ใบที่มีพื้นที่ประเมินจากแบบออกเอกสารได้แล้ว: ข้อผู้ลงนามตามข้อออกเอกสารเหมือนใบลงหน้างาน (สเปก S3 §2.6) ══
   แถวผู้ลงนามมาจาก server (`document.send.signers` — กลุ่ม A) · ตัวตัดสินไม่มีกิ่งของวิธีประเมิน */
test('⭐ โมดัลยืนยัน · ลายเซ็นจริง × ใบที่มีพื้นที่จากแบบ: แถวสองที่นั่ง = "ทั้งสองช่อง" · แถวที่นั่งเดียว = ผู้ตรวจสอบและอนุมัติ · ใบผสม = สองคน', () => {
  const DRAWING = { mix: { onsite: 0, drawing: 3, mode: 'drawing' }, confirm: 'needed', openVisit: null };
  const MIXED = { mix: { onsite: 2, drawing: 1, mode: 'mixed' }, confirm: 'needed', openVisit: null };
  const lineAfterIssue = (c) => {
    const at = c.effects.indexOf(ISSUE_LINE);
    assert.ok(at > 0, c.effects.join('\n'));
    return c.effects[at + 1];
  };
  // จากแบบทั้งใบ · ผู้ประเมินจากแบบคือผู้ส่งผล (ช่องที่ 1 ใช้ลายเซ็นของผู้อนุมัติ) — server ส่งแถวเดียวสองที่นั่ง
  const both = surveySendConfirm({
    docNo: 'RQ-AS-26100345', issuesDocument: true, method: DRAWING,
    signers: [{ seats: ['assessor', 'approver'], name: 'Arnon' }],
  });
  assert.equal(lineAfterIssue(both), 'เอกสารจะพิมพ์ลายเซ็นที่บันทึกไว้ของ Arnon ทั้งสองช่อง (ผู้ประเมิน และผู้ตรวจสอบและอนุมัติ)');
  // จากแบบทั้งใบ · หัวหน้าอีกคนประเมิน (ช่องที่ 1 เป็นคำ ไม่ใช่ลายเซ็น) — server ส่งแถวที่นั่งเดียว
  const approverOnly = surveySendConfirm({
    docNo: 'RQ-AS-26100345', issuesDocument: true, method: DRAWING,
    signers: [{ seats: ['approver'], name: 'Arnon' }],
  });
  assert.equal(lineAfterIssue(approverOnly), 'เอกสารจะพิมพ์ลายเซ็นที่บันทึกไว้ของ Arnon (ผู้ตรวจสอบและอนุมัติ)');
  // ใบผสม: ผู้ประเมินของนัด + ผู้ส่งผล — ประโยคเดียวกับใบลงหน้างาน
  const mixed = surveySendConfirm({ docNo: 'RQ-AS-26100352', issuesDocument: true, method: MIXED, signers: SIGNERS });
  assert.equal(lineAfterIssue(mixed), 'เอกสารจะพิมพ์ลายเซ็นที่บันทึกไว้ของ สมชาย (ผู้ประเมิน) และ หัวหน้า ก (ผู้ตรวจสอบและอนุมัติ)');
  // ข้อผู้ลงนามอยู่ตำแหน่งเดียวกับใบลงหน้างาน (ต่อจากข้อออกเอกสารทันที) — ไม่มีข้อไหนบอกว่าเอกสารยังออกไม่ได้
  for (const c of [both, approverOnly, mixed]) {
    assert.equal(c.effects.filter((line) => line.startsWith('เอกสารจะพิมพ์ลายเซ็น')).length, 1);
    assert.equal(c.effects.some((line) => line.includes('ยังออกไม่ได้')), false, c.effects.join('\n'));
    assert.equal(c.effects.at(-1), 'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”');
  }
});

test('🔴 งวด S3: ไฟล์นี้ไม่ส่งออกค่าคงที่ของข้อพักเอกสารอีกแล้ว — ไม่มีชื่อส่งออกไหนพูดถึง HOLD', async () => {
  const mod = await import('./surveySendClose.js');
  assert.deepEqual(Object.keys(mod).filter((name) => /HOLD/.test(name)), []);
});

test('🔴 ตัวตรวจอ่านไม่ครบ (S5): ผู้ลงนามที่รู้แน่ว่ายังไม่มีลายเซ็นยังตีกลับ — เว้นแต่ชิ้นที่ตัดสินเรื่องลายเซ็นเองอ่านไม่ได้ (ตารางลายเซ็น · นัด · ผลวัด)', () => {
  const sign = { kind: 'content', sign: true, userId: 'U-lead', seats: ['assessor'], text: 'ผู้ประเมิน สมชาย ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน' };
  const other = { kind: 'content', text: 'พื้นที่ 1: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)' };
  const system = { kind: 'system', text: 'อ่านเลขที่ดีลไม่สำเร็จ' };
  const check = (unknown, blockers = [system, sign]) => ({ unknown, blockers, warnings: [], signers: [] });
  const REFUSAL = `ออกเอกสารไม่ได้ — ${sign.text} · ยังไม่ได้ส่งผล`;

  // ชิ้นที่ไม่เกี่ยวกับลายเซ็นล้ม = รู้แน่ ⇒ ตีกลับ
  for (const piece of ['deal', 'company', 'form', 'helpers', 'assigneeRole', 'history', 'sizes', 'site', 'customer', 'files', 'zoneRegistry', 'visitThread']) {
    assert.equal(surveySendUnreadSignRefusal(check([piece])), REFUSAL, piece);
  }
  assert.equal(surveySendUnreadSignRefusal(check(['deal', 'company'])), REFUSAL);
  // ชิ้นที่ตัดสินเรื่องลายเซ็นล้ม (แม้ปนกับชิ้นอื่น) = ไม่รู้ ⇒ ไม่ตีกลับ (กติกาเดิม: ปัญหาของระบบไม่ขวางผล)
  for (const piece of ['signatures', 'visits', 'zones']) {
    assert.equal(surveySendUnreadSignRefusal(check([piece])), null, piece);
    assert.equal(surveySendUnreadSignRefusal(check(['deal', piece])), null, piece);
  }
  // เฉพาะบรรทัดที่พก `sign: true` — เหตุชนิด content ข้ออื่นยังไม่ตีกลับตอนอ่านไม่ครบ และไม่ถูกลากเข้าประโยค
  assert.equal(surveySendUnreadSignRefusal(check(['deal'], [system, other])), null);
  assert.equal(surveySendUnreadSignRefusal(check(['deal'], [other, sign, system])), REFUSAL);
  assert.equal(surveySendUnreadSignRefusal(check(['deal'], [{ ...sign, sign: 'yes' }, { ...sign, kind: 'system' }])), null);
  // สองคนไม่มีลายเซ็น = สองบรรทัดในประโยคเดียว
  const head = { kind: 'content', sign: true, userId: 'U-head', seats: ['approver'], text: 'ผู้ตรวจสอบและอนุมัติ สมหญิง (ผู้ส่งผล) ยังไม่มีลายเซ็นในระบบ' };
  assert.equal(surveySendUnreadSignRefusal(check(['deal'], [sign, head])), `ออกเอกสารไม่ได้ — ${sign.text} | ${head.text} · ยังไม่ได้ส่งผล`);
  // อ่านครบ = ทางปกติของ S5 ตัดสินเอง (ตัวนี้เงียบ) · ผลผิดรูป = เงียบ
  assert.equal(surveySendUnreadSignRefusal(check([])), null);
  for (const odd of [null, undefined, {}, { unknown: 'deal', blockers: [sign] }, { unknown: ['deal'] }, { unknown: ['deal'], blockers: 'x' }]) {
    assert.equal(surveySendUnreadSignRefusal(odd), null, JSON.stringify(odd));
  }
  assert.doesNotMatch(REFUSAL, /U-lead/);
});

test('🔴 ไฟล์ลายเซ็นใช้พิมพ์ไม่ได้ (S5): ตีกลับเฉพาะเหตุถาวร พร้อมชื่อเจ้าของและเหตุ · ล้มชั่วคราวไม่ตีกลับ · งบ 15 วินาที', () => {
  assert.equal(SURVEY_SEND_SIGN_MS, 15_000);
  const row = (name, reason, permanent, extra = {}) => ({
    userId: 'U-secret-id', name, seats: ['assessor'], versionId: 'signature-version-secret', reason, permanent, ...extra,
  });
  assert.equal(surveySendSignatureRefusal([row('สมชาย', SURVEY_SIGN_FAILURE.BLANK, true)]),
    'ออกเอกสารไม่ได้ — ลายเซ็นของ สมชาย ใช้พิมพ์ไม่ได้ (ภาพลายเซ็นว่างหรือจางเกินไป) — ให้เจ้าตัวอัปโหลดลายเซ็นใหม่ที่ “บัญชีของฉัน” · ยังไม่ได้ส่งผล');
  // ทุกเหตุถาวรมีป้ายของตัวเอง — ขึ้นต้น/ลงท้ายเหมือนประโยค 409 ของเอกสาร (จอและคนอ่านรู้ว่ายังไม่ได้ส่งผล)
  for (const reason of SURVEY_SIGN_PERMANENT_REASONS) {
    const text = surveySendSignatureRefusal([row('สมชาย', reason, true)]);
    assert.ok(text.startsWith('ออกเอกสารไม่ได้ — ลายเซ็นของ สมชาย ใช้พิมพ์ไม่ได้ ('), reason);
    assert.ok(text.includes(`(${SURVEY_SIGN_FAILURE_LABELS[reason]})`), reason);
    assert.ok(text.endsWith(' · ยังไม่ได้ส่งผล'), reason);
    assert.equal(surveySendDocumentRefusal([{ kind: 'content', text: 'x' }]).slice(0, 18), text.slice(0, 18));
  }
  // สองคน = สองบรรทัดในประโยคเดียว · ชั่วคราวที่ปนมาไม่ถูกเอ่ย
  const both = surveySendSignatureRefusal([
    row('สมชาย', SURVEY_SIGN_FAILURE.MISSING, true), row('หัวหน้า ก', SURVEY_SIGN_FAILURE.TIMEOUT, false),
    row('วิชัย', SURVEY_SIGN_FAILURE.MISMATCH, true),
  ]);
  assert.equal(both, 'ออกเอกสารไม่ได้ — ลายเซ็นของ สมชาย ใช้พิมพ์ไม่ได้ (ไฟล์ลายเซ็นหายจากที่เก็บ) | ลายเซ็นของ วิชัย ใช้พิมพ์ไม่ได้ (ไฟล์ลายเซ็นไม่ตรงกับที่บันทึกไว้)'
    + ' — ให้เจ้าตัวอัปโหลดลายเซ็นใหม่ที่ “บัญชีของฉัน” · ยังไม่ได้ส่งผล');
  assert.deepEqual(surveyReportSignFileLines([row('สมชาย', SURVEY_SIGN_FAILURE.MISSING, true)]), ['ลายเซ็นของ สมชาย ใช้พิมพ์ไม่ได้ (ไฟล์ลายเซ็นหายจากที่เก็บ)']);
  // 🔴 ไม่มีรหัสผู้ใช้ รหัสฉบับ หรือที่อยู่ไฟล์ในประโยค
  assert.doesNotMatch(both, /U-secret-id|signature-version|users\//);

  // ล้มชั่วคราวล้วน / ไม่มีอะไรล้ม / รูปแปลก = ไม่ตีกลับ
  for (const reason of [SURVEY_SIGN_FAILURE.TIMEOUT, SURVEY_SIGN_FAILURE.STORAGE, SURVEY_SIGN_FAILURE.SHARP_UNAVAILABLE, SURVEY_SIGN_FAILURE.INTERNAL]) {
    assert.equal(surveySendSignatureRefusal([row('สมชาย', reason, false)]), null, reason);
  }
  for (const none of [[], null, undefined, 'x', [null], [{ name: 'ก', reason: 'sign_blank', permanent: 'true' }]]) {
    assert.equal(surveySendSignatureRefusal(none), null, JSON.stringify(none));
  }
  // การ์ดไม่เก็บการตีกลับนี้ (วันนี้เก็บเฉพาะรูปเปิดไม่ได้ — โมดัลเป็นคนบอก)
  assert.equal(surveySendRefusalKeeps(both), false);
});
