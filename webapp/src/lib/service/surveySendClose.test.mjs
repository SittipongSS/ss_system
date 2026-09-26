// ── "ส่งผล" ปิดนัดประเมินที่ยังเปิดอยู่ (มติเจ้าของ 24/09 ข้อ 2) ─────────────────────
//
// ⭐ ครอบสามชั้น: ตัวตัดสิน (`surveySendVisitStep`) · คำสั่งปิดแบบมีเงื่อนไข (`closeSurveyVisitForSend`)
//   · ลำดับการเขียนทั้งปุ่ม (`surveySendWrites`) — ชั้นสุดท้ายคือยามของกติกา "ไม่มีสภาพครึ่งทาง":
//   ตอบใบแล้วแต่นัดยังเปิด ต้องไปไม่ถึง ไม่ว่าคำสั่งไหนจะล้ม
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEND_CLOSABLE_VISIT_STATES,
  closeSurveyVisitForSend,
  surveySendCloseBody,
  surveySendConfirm,
  surveySendDoneText,
  surveySendVisitStep,
  surveySendWrites,
} from './surveySendClose.js';
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
  assert.equal(surveySendVisitStep(null, { today: TODAY }).action, 'none');
  for (const status of ['done', 'partial', 'unable', 'cancelled', 'rescheduled']) {
    assert.equal(surveySendVisitStep(visit({ status }), { today: TODAY }).action, 'none', status);
  }
});

test('⭐ กำลังทำ = ปิดเป็น "เข้าแล้ว" · เก็บวันที่ช่างกดเริ่ม · **ไม่มีคีย์เวลาเลย** (เวลาที่ช่างประทับอยู่ครบ)', () => {
  const step = surveySendVisitStep(visit(), { today: TODAY });
  assert.equal(step.action, 'close');
  assert.deepEqual(step.patch, { status: 'done', actualDate: '2026-09-22' });
  for (const key of ['actualStartTime', 'actualEndTime', 'actualEndDate']) {
    assert.ok(!(key in step.patch), `ห้ามแตะ ${key} — ส่งผลไม่ประทับเวลา`);
  }
});

test('ยังไม่เคยกดเริ่ม: วันนัดผ่านมาแล้ว = วันนัด · วันนัดยังไม่มาถึง = วันนี้ (ไปวัดก่อนวันนัด)', () => {
  const past = surveySendVisitStep(visit({ status: 'scheduled', actualDate: null, actualStartTime: null, scheduledDate: '2026-09-20' }), { today: TODAY });
  assert.deepEqual(past.patch, { status: 'done', actualDate: '2026-09-20' });
  const future = surveySendVisitStep(visit({ status: 'scheduled', actualDate: null, actualStartTime: null, scheduledDate: '2026-09-30' }), { today: TODAY });
  assert.deepEqual(future.patch, { status: 'done', actualDate: TODAY });
});

test('🔴 นัดยังเป็นร่าง = ส่งผลไม่ได้ บอกรหัสนัดและทางออก (ไม่ปิดร่างเป็น "เข้าแล้ว" · ไม่ยกเลิกแทนผู้จัดคิว)', () => {
  const step = surveySendVisitStep(visit({ status: 'draft', actualDate: null, actualStartTime: null }), { today: TODAY });
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
  const step = surveySendVisitStep(visit(), { today: TODAY });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.equal(out.error, null);
  assert.equal(out.closed.status, 'done');
  assert.equal(out.closed.actualStartTime, '14:05:00', 'เวลาเริ่มของช่างยังอยู่');
  assert.equal(out.closed.actualEndTime, null, 'ไม่ประทับเวลาจบให้');
  assert.deepEqual(Object.keys(db.calls[0].patch).sort(), ['actualDate', 'status', 'updatedAt']);
});

test('🔑 ช่างปิดเป็น "เข้าแล้ว" ไปก่อน (0 แถว) = ไปต่อได้ แต่ไม่นับว่าคำขอนี้ปิด', async () => {
  const db = fakeSupabase({ service_visits: [visit({ status: 'done' })] });
  const step = surveySendVisitStep(visit(), { today: TODAY });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.deepEqual(out, { closed: null, error: null, status: null });
});

test('🔴 ช่างเพิ่งปิดเป็น "ทำไม่ได้" ระหว่างกดส่งผล = 409 · ไม่ทับผลของช่าง', async () => {
  const db = fakeSupabase({ service_visits: [visit({ status: 'unable' })] });
  const step = surveySendVisitStep(visit(), { today: TODAY });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.equal(out.status, 409);
  assert.match(out.error, /ทำไม่ได้/);
  assert.equal(db.tables.service_visits[0].status, 'unable');
});

test('ฐานล้มตอนปิด = 500 พร้อมบอกว่ายังไม่ได้ส่งผล', async () => {
  const db = fakeSupabase({ service_visits: [visit()] }, { failOn: ['service_visits'] });
  const step = surveySendVisitStep(visit(), { today: TODAY });
  const out = await closeSurveyVisitForSend(db, { step, nowIso: NOW });
  assert.equal(out.status, 500);
  assert.match(out.error, /ยังไม่ได้ส่งผล/);
});

// ══ ลำดับการเขียนทั้งปุ่ม ═══════════════════════════════════════════════
test('⭐ นัดกำลังทำ: ปิดนัดก่อน แล้วค่อยตอบใบ · เธรดของนัดถูกเขียนระหว่างสองคำสั่ง', async () => {
  const db = fakeSupabase({ service_visits: [visit()], dept_requests: [requestRow()] });
  const order = [];
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: visit(), closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW,
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
      requestId: 'DR-1', open: visit(), closeVisitId, answerPatch, today: TODAY, nowIso: NOW,
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
    requestId: 'DR-1', open: draft, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW,
  });
  assert.equal(out.status, 409);
  assert.deepEqual(writes(db.calls), []);
});

test('ไม่มีนัดค้าง (ช่างส่งงานแล้ว) = ตอบใบอย่างเดียว · โมดัลที่เคยบอกนัดที่เพิ่งปิดไปก็ไม่ตีกลับ', async () => {
  for (const closeVisitId of [null, 'SVV-1']) {
    const db = fakeSupabase({ service_visits: [visit({ status: 'done' })], dept_requests: [requestRow()] });
    const out = await surveySendWrites(db, {
      requestId: 'DR-1', open: null, closeVisitId, answerPatch, today: TODAY, nowIso: NOW,
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
    requestId: 'DR-1', open: visit(), closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, onVisitClosed,
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
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW, onVisitClosed,
  });
  assert.equal(retry.request.answeredAt, NOW);
  assert.deepEqual(writes(retryDb.calls), ['dept_requests']);
  assert.deepEqual(threads, ['SVV-1'], 'ไม่ลงเธรดซ้ำ');
});

test('🔴 ช่างปิดเป็น "ทำไม่ได้" ระหว่างทาง = ไม่ตอบใบ (ใบต้องถอยไปลงคิว ไม่ใช่ส่งผลที่ไม่มีคนวัด)', async () => {
  const db = fakeSupabase({ service_visits: [visit({ status: 'unable' })], dept_requests: [requestRow()] });
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: visit(), closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW,
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
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW,
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
      requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW,
    });
    assert.equal(out.status, 409, String(rows[0]?.status));
    assert.match(out.error, pattern);
    assert.deepEqual(writes(db.calls), []);
  }
  const done = fakeSupabase({ service_visits: [visit({ status: 'done' })], dept_requests: [requestRow()] });
  const ok = await surveySendWrites(done, {
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW,
  });
  assert.equal(ok.request.status, 'answered', 'ช่างส่งงานเองไปแล้ว = ผลเท่ากับที่โมดัลสัญญา');
});

test('อ่านนัดที่โมดัลบอกไม่สำเร็จ = 500 บอกว่ายังไม่ได้ส่งผล · ไม่ตอบใบตอนไม่รู้', async () => {
  const db = fakeSupabase(
    { service_visits: [visit({ status: 'done' })], dept_requests: [requestRow()] },
    { failReadOn: ['service_visits'] },
  );
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: null, closeVisitId: 'SVV-1', answerPatch, today: TODAY, nowIso: NOW,
  });
  assert.equal(out.status, 500);
  assert.match(out.error, /ยังไม่ได้ส่งผล/);
  assert.deepEqual(writes(db.calls), []);
});

test('🔑 ตอบได้ครั้งเดียว — หัวหน้าอีกคนส่งไปก่อน = 409 ไม่ใช่ "ตอบแล้ว" รอบสอง (กระดิ่งเด้งซ้ำ)', async () => {
  const db = fakeSupabase({ service_visits: [], dept_requests: [requestRow({ answeredAt: '2026-09-24T07:59:00.000Z', status: 'answered' })] });
  const out = await surveySendWrites(db, {
    requestId: 'DR-1', open: null, closeVisitId: null, answerPatch, today: TODAY, nowIso: NOW,
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
    assert.notEqual(surveySendVisitStep(visit({ status }), { today: TODAY }).action, 'close', status);
  }
  for (const status of ['scheduled', 'in_progress']) {
    assert.equal(surveySendVisitStep(visit({ status }), { today: TODAY }).action, 'close', status);
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
