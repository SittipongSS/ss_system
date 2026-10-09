// ── ตัวเขียนของการสลับวิธีประเมิน (งวด S2a §2.3 · ลำดับเขียน §4.4 · ตารางพังรายขั้น §4.6) ──────────
//
// ⭐ เทสต์นี้วิ่ง **แผนจริง + ตัวเขียนจริง** บนฐานปลอมที่จำสถานะข้ามรอบ — "พังที่ขั้น k แล้วกดซ้ำ" จึงเป็นการกดซ้ำจริง:
//   รอบสองอ่านแถวที่รอบแรกเขียนค้างไว้ สร้างแผนใหม่ แล้วต้องจบที่สถานะเดียวกับรอบที่ไม่พังเลย
//   (เธรดหนึ่งบรรทัด · กระดิ่งชุดเดียว · บรรทัดยกเลิกบนนัดหนึ่งบรรทัด)
// 🔴 ฐานปลอมคืน error เป็น **ออบเจ็กต์ธรรมดา** `{ message }` แบบ PostgREST และ `appendUpdate` คืน error เป็น **สตริง**
//   — สองรูปที่ `runSteps` เจอจริง (ตัวหลังทำ `error.message = …` พังเป็น TypeError ถ้าไม่ห่อ)
// ⚠️ ไม่มีการแตะฐานจริง ไม่มีเครือข่าย — `audit` และ `notify` ถูกฉีดเป็นตัวจด
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  surveyMethodAppliedByOther,
  appendVisitCancelLine, cancelSurveyVisitForMethod, runSurveyMethodPlan, surveyVisitCancelledByKey,
} from './surveyMethodWrites.js';
import { SURVEY_METHOD_CANCEL_ONLY_REASON, SURVEY_METHOD_ERRORS, surveyMethodPlanKey, surveyMethodSwitchPlan } from './surveyMethodSwitch.js';

const NOW = '2026-10-09T04:00:00.000Z';
const REASON = 'หน้างานยังก่อสร้าง ถึงสิ้นเดือน';
const CUT_REASON = 'ลูกค้ายกเลิกโซนนี้';
const DATE = '2026-10-12';
const user = { id: 'U-HEAD', name: 'หัวหน้า ก', role: 'ts_manager', department: 'TS' };
const KEY = surveyMethodPlanKey({ userId: user.id, actionId: '0b1e6c0e-6a0b-4f0e-9a39-2f0f6f1f7c11' });
const KEY2 = surveyMethodPlanKey({ userId: user.id, actionId: '7f3d2a10-1111-4222-8333-444455556666' });
const E = SURVEY_METHOD_ERRORS;

/* ── ฐานปลอม: ตารางในหน่วยความจำ + ตัวสร้างคำสั่งแบบ supabase + จุดฉีดความพัง ────────────── */
const clone = (v) => structuredClone(v);
const same = (a, b) => (a == null || b == null ? a == null && b == null : String(a) === String(b));

function fakeDb(seed) {
  const tables = clone(seed);
  const calls = [];
  const hooks = [];
  const db = {
    tables,
    calls,
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    /** ครั้งที่ `nth` ที่คำสั่งตรง `match`: `effect(tables)` รันก่อนคำสั่ง · คืน error = คำสั่งนั้นพังโดยไม่เขียน */
    on(match, effect, nth = 1) { hooks.push({ match, effect, nth, seen: 0 }); return db; },
    failOn(match, nth = 1, message = 'ฐานล่มชั่วคราว') { return db.on(match, () => ({ message, code: '57014' }), nth); },
  };
  db.from = (table) => {
    const q = { op: 'select', where: [], tests: [], patch: null, rows: null, cols: null, order: null, limit: null };
    const filter = (kind, col, value, fn) => { q.where.push([kind, col, value]); q.tests.push(fn); return builder; };
    const run = (mode) => {
      const call = { table, op: q.op, patch: q.patch, rows: q.rows, where: q.where, cols: q.cols };
      let injected = null;
      for (const hook of hooks) {
        if (!hook.match(call)) continue;
        hook.seen += 1;
        if (hook.seen === hook.nth) injected = hook.effect(tables) || injected;
      }
      calls.push(call);
      if (injected) { call.failed = true; return { data: null, error: injected }; }
      const store = (tables[table] ||= []);
      const hit = (row) => q.tests.every((fn) => fn(row));
      let out;
      if (q.op === 'insert' || q.op === 'upsert') {
        out = [].concat(q.rows).map((row) => ({ ...row }));
        store.push(...out);
      } else if (q.op === 'update') {
        out = store.filter(hit);
        for (const row of out) Object.assign(row, clone(q.patch));
        call.hit = out.length;
      } else {
        out = store.filter(hit);
        if (q.order) {
          const [col, asc] = q.order;
          out = [...out].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1));
        }
        if (q.limit != null) out = out.slice(0, q.limit);
      }
      out = out.map(clone);
      // select แบบระบุคอลัมน์คืนเฉพาะคอลัมน์นั้น (ชื่อในเครื่องหมายคำพูดแบบ PostgREST ถูกถอดออก)
      if (q.op === 'select' && q.cols && q.cols !== '*') {
        const cols = q.cols.split(',').map((col) => col.trim().replace(/"/g, ''));
        out = out.map((row) => Object.fromEntries(cols.map((col) => [col, row[col]])));
      }
      if (mode === 'maybeSingle') return { data: out[0] || null, error: null };
      if (mode === 'single') return out[0] ? { data: out[0], error: null } : { data: null, error: { message: 'ไม่มีแถว' } };
      return { data: out, error: null };
    };
    const builder = {
      select(cols = '*') { if (q.op === 'select') q.cols = cols; return builder; },
      update(patch) { q.op = 'update'; q.patch = patch; return builder; },
      insert(rows) { q.op = 'insert'; q.rows = rows; return builder; },
      upsert(rows) { q.op = 'upsert'; q.rows = rows; return builder; },
      eq: (col, value) => filter('eq', col, value, (row) => same(row[col], value)),
      neq: (col, value) => filter('neq', col, value, (row) => !same(row[col] ?? null, value)),
      in: (col, list) => filter('in', col, list, (row) => list.some((v) => same(row[col], v))),
      is: (col, value) => filter('is', col, value, (row) => (row[col] ?? null) === value),
      not: (col, op, value) => filter('not', col, value, (row) => (op === 'is' ? (row[col] ?? null) !== value : true)),
      or: () => builder,
      order(col, { ascending = true } = {}) { q.order = [col, ascending]; return builder; },
      limit(n) { q.limit = n; return builder; },
      maybeSingle: async () => run('maybeSingle'),
      single: async () => run('single'),
      then: (resolve, reject) => Promise.resolve().then(() => run('many')).then(resolve, reject),
    };
    return builder;
  };
  return db;
}

/* ตัวจับคำสั่งรายขั้นของ §4.4 */
const M = {
  touch: (c) => c.table === 'dept_requests' && c.op === 'update',
  recheck: (c) => c.table === 'dept_requests' && c.op === 'select' && c.cols !== '*' && /answeredAt/.test(c.cols || ''),
  cancel: (c) => c.table === 'service_visits' && c.op === 'update',
  visitLine: (c) => c.table === 'entity_updates' && c.op === 'insert' && c.rows?.entityType === 'service_visit',
  toDrawing: (c) => c.table === 'service_survey_zones' && c.op === 'update' && 'methodReason' in c.patch && !('spots' in c.patch),
  toOnsite: (c) => c.table === 'service_survey_zones' && c.op === 'update' && 'spots' in c.patch,
  cutMark: (c) => c.table === 'service_survey_zones' && c.op === 'update' && !('methodReason' in c.patch),
  dedupeRead: (c) => c.table === 'entity_updates' && c.op === 'select' && c.where.some(([k, col, v]) => k === 'eq' && col === 'kind' && v === 'method'),
  thread: (c) => c.table === 'entity_updates' && c.op === 'insert' && c.rows?.entityType === 'dept_request',
};
const writesOf = (db, from = 0) => db.calls.slice(from).filter((c) => !c.failed && c.op !== 'select' && c.table !== 'notifications');

/* ── fixture ─────────────────────────────────────────────────────────────── */
const zone = (id, zoneName, over = {}) => ({
  id, requestId: 'RQ1', zoneName, status: 'ok', method: 'onsite', spots: [],
  updatedAt: `2026-10-08T0${id.slice(-1)}:00:00+00:00`, ...over,
});
const drawn = { method: 'drawing', methodReason: 'ลูกค้ายังไม่ให้เข้า', methodChangedByName: 'หัวหน้า ข', methodChangedAt: '2026-10-07T02:00:00+00:00' };
const requestRow = (over = {}) => ({
  id: 'RQ1', kind: 'site_survey', docNo: 'RQ-AS-26100312', title: 'ประเมินพื้นที่ชั้น 12', status: 'acknowledged',
  acknowledgedAt: '2026-10-08T00:00:00+00:00', answeredAt: null, cancelledAt: null,
  committedDueDate: '2026-10-13', committedDueTime: '10:00', committedResultDate: '2026-10-15',
  assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad', updatedAt: '2026-10-08T00:00:00+00:00', ...over,
});
const visitRow = (status, over = {}) => ({
  id: 'V1', requestId: 'RQ1', code: 'SV-26100011', kind: 'survey', status, scheduledDate: '2026-10-13', startTime: '10:00:00',
  assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad', assistantIds: ['U-AST'], createdAt: '2026-10-08T01:00:00+00:00', ...over,
});
const toDrawing = (...ids) => ids.map((zoneId) => ({ zoneId, method: 'drawing' }));
const toOnsite = (...ids) => ids.map((zoneId) => ({ zoneId, method: 'onsite' }));

/* สี่ชนิดของแผน — ทุกตัวมีแถวลงหน้างานที่ตัดไปแล้ว (Z0) ให้ขั้น 3c มีงานทำ */
const SCENARIOS = {
  'ทั้งใบเป็นจากแบบ + นัดไว้ (1 · 2 · 3a · 3c · 4 · 5 · 6)': {
    seed: () => ({
      dept_requests: [requestRow()],
      service_survey_zones: [zone('Z0', 'ห้องเก็บของ', { status: 'cut' }), zone('Z1', 'ล็อบบี้'), zone('Z2', 'ห้องประชุม'), zone('Z3', 'ห้องน้ำ')],
      service_visits: [visitRow('scheduled')],
      entity_updates: [],
    }),
    body: { changes: toDrawing('Z1', 'Z2', 'Z3'), reason: REASON, resultDate: DATE, cancelVisitId: 'V1' },
    steps: ['touch', 'dedupeRead', 'recheck', 'cancel', 'toDrawing', 'cutMark', 'touch#2', 'dedupeRead#2', 'thread'],
    kind: 'switch',
  },
  'พื้นที่แรกกลับเป็นลงหน้างาน ไม่มีนัด (1 · 3b×2 · 4 · 5 · 6)': {
    seed: () => ({
      dept_requests: [requestRow({ committedDueDate: '2026-10-15', committedDueTime: null, assigneeId: 'U-HEAD', assigneeName: 'หัวหน้า ก' })],
      service_survey_zones: [
        zone('Z0', 'ห้องเก็บของ', { status: 'cut', method: 'drawing' }),
        zone('Z1', 'ล็อบบี้', { ...drawn, spots: [{ id: 's1', selected: true }, { id: 's2', selected: false }] }),
        zone('Z2', 'ห้องประชุม', { ...drawn, spots: [{ id: 's3', selected: true }] }),
        zone('Z3', 'ห้องน้ำ', drawn),
      ],
      service_visits: [],
      entity_updates: [],
    }),
    body: { changes: toOnsite('Z1', 'Z2'), reason: REASON, resultDate: '' },
    steps: ['touch', 'dedupeRead', 'recheck', 'toOnsite', 'toOnsite#2', 'touch#2', 'dedupeRead#2', 'thread'],
    kind: 'switch',
  },
  'ยกเลิกนัดอย่างเดียว (1 · 2 · 3c · 4 · 5 · 6)': {
    seed: () => ({
      dept_requests: [requestRow()],
      service_survey_zones: [zone('Z0', 'ห้องเก็บของ', { status: 'cut' }), zone('Z1', 'ล็อบบี้', drawn), zone('Z2', 'ห้องประชุม', drawn)],
      service_visits: [visitRow('scheduled')],
      entity_updates: [],
    }),
    body: { changes: [], reason: SURVEY_METHOD_CANCEL_ONLY_REASON, resultDate: '', cancelVisitId: 'V1' },
    steps: ['touch', 'dedupeRead', 'recheck', 'cancel', 'cutMark', 'touch#2', 'dedupeRead#2', 'thread'],
    kind: 'cancel-only',
  },
  'หัวหน้าตัดพื้นที่ลงหน้างานสุดท้าย — route พื้นที่เขียนแถวไปแล้ว (1 · 2 · 3c · 4 · 5 · 6)': {
    seed: () => ({
      dept_requests: [requestRow()],
      service_survey_zones: [
        zone('Z0', 'ห้องเก็บของ', { status: 'cut' }),
        zone('Z1', 'ล็อบบี้', { status: 'cut', method: 'drawing', cutReason: CUT_REASON }),
        zone('Z2', 'ห้องประชุม', drawn),
      ],
      service_visits: [visitRow('scheduled')],
      entity_updates: [],
    }),
    body: { cut: { zoneId: 'Z1', to: 'cut' }, reason: CUT_REASON, resultDate: DATE, cancelVisitId: 'V1' },
    steps: ['touch', 'dedupeRead', 'recheck', 'cancel', 'cutMark', 'touch#2', 'dedupeRead#2', 'thread'],
    kind: 'cut',
  },
};

/* ── "route จิ๋ว": เลือกนัดก่อนสร้างแผน (§4.2 ข้อ 7) แล้วส่งให้ตัวเขียน ─────────────────── */
const STALE = { status: 409, error: E.stale };
const OPEN = ['draft', 'scheduled', 'in_progress'];

function recorder() {
  const bells = [];
  const audits = [];
  return {
    bells,
    audits,
    notify: {
      crew: (_db, args) => bells.push(['crew', args.bell.kind, args.bell.title, args.key, args.visit.assigneeId]),
      head: (_db, args) => bells.push(['head', args.title, args.key]),
    },
    audit: async (entry) => { audits.push(entry); },
  };
}

async function attempt(db, body, rec, { key = KEY } = {}) {
  const request = clone(db.tables.dept_requests[0]);
  const rows = clone(db.tables.service_survey_zones);
  const visits = db.tables.service_visits;
  let visit = visits.find((v) => OPEN.includes(v.status)) || null;
  if (visit && body.cancelVisitId && body.cancelVisitId !== visit.id) return { result: STALE };
  if (!visit && body.cancelVisitId) {
    const named = visits.find((v) => v.id === body.cancelVisitId);
    if (!named || named.status !== 'cancelled') return { result: STALE };
    const proof = await surveyVisitCancelledByKey(db, { visitId: named.id, key });
    if (proof.error) return { result: { status: 500, error: proof.error.message } };
    if (!proof.proved) return { result: STALE };
    visit = { ...named, cancelledByThisAction: true };
  } else if (!visit) {
    visit = visits.at(-1) || null;
  }
  const plan = surveyMethodSwitchPlan({
    rows, changes: body.changes, cut: body.cut || null, visit: visit ? clone(visit) : null, request,
    reason: body.reason, resultDate: body.resultDate, actor: user, nowIso: NOW,
  });
  if (plan.stale) return { plan, result: STALE };
  const result = await runSurveyMethodPlan(db, { plan, request, user, nowIso: NOW, key, req: null, notify: rec.notify, audit: rec.audit });
  return { plan, result };
}

/* สถานะที่คนเห็น — ไม่รวมเวลาที่ต่างกันทุกรอบโดยธรรมชาติ (`updatedAt` ของใบ · เวลาและ id ของบรรทัดเธรด) */
function visible(db, rec) {
  const t = db.tables;
  const r = t.dept_requests[0];
  return {
    zones: t.service_survey_zones.map(({ id, status, method, methodReason, methodChangedByName, methodChangedAt, spots }) => (
      { id, status, method, methodReason, methodChangedByName, methodChangedAt, spots })),
    visits: t.service_visits.map(({ id, status }) => ({ id, status })),
    request: {
      committedDueDate: r.committedDueDate, committedDueTime: r.committedDueTime, committedResultDate: r.committedResultDate,
      assigneeId: r.assigneeId, assigneeName: r.assigneeName, dueCommittedAt: r.dueCommittedAt ?? null, answeredAt: r.answeredAt,
    },
    thread: t.entity_updates.filter((u) => u.entityType === 'dept_request').map(({ kind, body, meta }) => ({ kind, body, meta })),
    visitLines: t.entity_updates.filter((u) => u.entityType === 'service_visit').map(({ kind, body, meta }) => ({ kind, body, meta })),
    bells: rec.bells,
  };
}

/* กลืน console.error ระหว่างรัน แล้วคืนสิ่งที่ถูก log (ตัวเขียนต้อง log ป้ายขั้น + ข้อความจริงเมื่อฐานพัง) */
async function quiet(fn) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); };
  try {
    return { value: await fn(), logged };
  } finally {
    console.error = original;
  }
}

const matcherOf = (step) => {
  const [name, nth] = step.split('#');
  return [M[name], Number(nth || 1)];
};

/* ── เส้นปกติของแต่ละชนิด ─────────────────────────────────────────────────── */
test('ทั้งใบเป็นจากแบบ + นัดไว้: ลำดับเขียนตาม §4.4 และของที่ลงฐานตรงกับที่แผนบอก', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  const { value: { plan, result } } = await quiet(() => attempt(db, sc.body, rec));
  assert.deepEqual(result, { ok: true });

  const order = writesOf(db).map((c) => `${c.table}.${c.op}`);
  assert.deepEqual(order, [
    'dept_requests.update',          // 1 แตะใบ
    'service_visits.update',         // 2 ยกเลิกนัด
    'entity_updates.insert',         //   บรรทัดยกเลิกบนเธรดของนัด
    'service_survey_zones.update',   // 3a
    'service_survey_zones.update',   // 3c
    'dept_requests.update',          // 4 วัน + แตะปิดท้าย
    'entity_updates.insert',         // 5 เธรดของใบ
  ]);

  const [touch1, touch2] = db.calls.filter(M.touch);
  assert.deepEqual(touch1.patch, { updatedAt: NOW });
  // 🔑 ขั้น 1 จองด้วยรุ่นของใบที่ route อ่าน — หัวหน้าสองคนที่สร้างแผนจากแถวชุดเดียวกันผ่านได้คนเดียว
  assert.deepEqual(touch1.where, [['eq', 'id', 'RQ1'], ['is', 'answeredAt', null], ['eq', 'updatedAt', '2026-10-08T00:00:00+00:00']]);
  // 🔴 แตะปิดท้ายต้องได้ค่าที่ **ต่างจากขั้น 1** — ไม่งั้นการส่งผลที่อ่านแถวพื้นที่ก่อนสลับยังเคลมใบได้
  assert.notEqual(touch2.patch.updatedAt, NOW);
  assert.ok(Date.parse(touch2.patch.updatedAt) > Date.parse(NOW) || touch2.patch.updatedAt > NOW);
  assert.deepEqual({ ...touch2.patch, updatedAt: null }, { ...plan.writes.dates, updatedAt: null });
  assert.deepEqual(touch2.where, [['eq', 'id', 'RQ1'], ['is', 'answeredAt', null]]);

  const cancel = db.calls.find(M.cancel);
  assert.deepEqual(cancel.patch, { status: 'cancelled', updatedAt: NOW });
  assert.deepEqual(cancel.where, [['eq', 'id', 'V1'], ['eq', 'requestId', 'RQ1'], ['in', 'status', ['draft', 'scheduled']]]);

  const drawing = db.calls.find(M.toDrawing);
  assert.deepEqual(drawing.patch, {
    method: 'drawing', methodReason: REASON, methodChangedAt: NOW, methodChangedByName: 'หัวหน้า ก', updatedAt: NOW,
  });
  assert.deepEqual(drawing.where, [['eq', 'requestId', 'RQ1'], ['in', 'id', ['Z1', 'Z2', 'Z3']], ['neq', 'status', 'cut']]);
  const cutMark = db.calls.find(M.cutMark);
  assert.deepEqual(cutMark.patch, { method: 'drawing', updatedAt: NOW });
  assert.deepEqual(cutMark.where, [['eq', 'requestId', 'RQ1'], ['eq', 'status', 'cut'], ['in', 'id', ['Z0']]]);

  const state = visible(db, rec);
  assert.deepEqual(state.zones.map((z) => z.method), ['drawing', 'drawing', 'drawing', 'drawing']);
  assert.deepEqual(state.visits, [{ id: 'V1', status: 'cancelled' }]);
  assert.deepEqual(state.request, {
    committedDueDate: DATE, committedDueTime: null, committedResultDate: DATE,
    assigneeId: 'U-HEAD', assigneeName: 'หัวหน้า ก', dueCommittedAt: NOW, answeredAt: null,
  });
  assert.deepEqual(state.thread, [{
    kind: 'method',
    body: plan.thread,
    meta: { key: KEY, kind: 'switch', flip: 'to-desk', toDrawing: ['Z1', 'Z2', 'Z3'], toOnsite: [], cancelledVisitId: 'V1', resultDate: DATE },
  }]);
  assert.deepEqual(state.visitLines, [{ kind: 'cancel', body: `เปลี่ยนเป็นประเมินจากแบบ: ${REASON}`, meta: { methodKey: KEY } }]);
  assert.deepEqual(state.bells, [
    ['crew', 'cancel', 'ยกเลิกนัด SV-26100011 — ใบนี้เปลี่ยนเป็นประเมินจากแบบ', KEY, 'U-TECH'],
    ['head', 'คำร้องประเมินจากแบบ RQ-AS-26100312 — รอหัวหน้าประเมิน', KEY],
  ]);

  // audit: หนึ่งแถวของนัด + หนึ่งแถวของใบ (ขั้น 6)
  assert.equal(rec.audits.length, 2);
  assert.equal(rec.audits[0].entityType, 'service_visit');
  assert.equal(rec.audits[0].summary, `ยกเลิกนัดประเมิน SV-26100011 — เปลี่ยนเป็นประเมินจากแบบ: ${REASON}`);
  const last = rec.audits[1];
  assert.equal(last.action, 'update');
  assert.equal(last.entityType, 'dept_request');
  assert.equal(last.entityId, 'RQ1');
  assert.equal(last.summary, `RQ-AS-26100312 · ${plan.thread}`);
  assert.equal(last.before.committedResultDate, '2026-10-15');
  assert.equal(last.after.committedResultDate, DATE, 'after = ใบที่อ่านใหม่หลังเขียน');
  assert.equal(last.user, user);

  // 🔴 ตัวเขียนไม่แตะคอลัมน์ผลวัดและไฟล์ — เฉพาะคอลัมน์วิธี
  for (const call of db.calls.filter((c) => c.table === 'service_survey_zones' && c.op === 'update')) {
    for (const col of Object.keys(call.patch)) {
      assert.ok(['method', 'methodReason', 'methodChangedAt', 'methodChangedByName', 'updatedAt', 'spots'].includes(col), col);
    }
  }
});

test('กลับเป็นลงหน้างาน: เขียนทีละแถวแบบมีเงื่อนไขรุ่นของแถว · จุดถูกปลดเลือก · วันถูกล้าง · ไม่มีกระดิ่ง', async () => {
  const sc = Object.values(SCENARIOS)[1];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  const { value: { plan, result } } = await quiet(() => attempt(db, sc.body, rec));
  assert.deepEqual(result, { ok: true });
  const rowsWritten = db.calls.filter(M.toOnsite);
  assert.equal(rowsWritten.length, 2);
  assert.deepEqual(rowsWritten[0].patch, {
    method: 'onsite', methodReason: REASON, methodChangedAt: NOW, methodChangedByName: 'หัวหน้า ก',
    spots: [{ id: 's1', selected: false }, { id: 's2', selected: false }], updatedAt: NOW,
  });
  assert.deepEqual(rowsWritten[0].where, [
    ['eq', 'id', 'Z1'], ['eq', 'requestId', 'RQ1'], ['eq', 'updatedAt', '2026-10-08T01:00:00+00:00'], ['neq', 'status', 'cut'],
  ]);
  const state = visible(db, rec);
  assert.deepEqual(state.zones.map((z) => z.method), ['drawing', 'onsite', 'onsite', 'drawing']);
  assert.deepEqual(state.request, {
    committedDueDate: null, committedDueTime: null, committedResultDate: null,
    assigneeId: 'U-HEAD', assigneeName: 'หัวหน้า ก', dueCommittedAt: null, answeredAt: null,
  });
  assert.equal(state.thread.length, 1);
  assert.equal(state.thread[0].body, plan.thread);
  assert.deepEqual(state.thread[0].meta, {
    key: KEY, kind: 'switch', flip: 'to-visit', toDrawing: [], toOnsite: ['Z1', 'Z2'], cancelledVisitId: null, resultDate: null,
  });
  assert.deepEqual(state.bells, []);
  assert.equal(db.calls.filter(M.cancel).length, 0);
  assert.equal(db.calls.filter(M.cutMark).length, 0, 'ใบกลับมาต้องมีนัด — แถวที่ตัดไม่ถูกแตะ');
});

test('ใบยังผสม: ขั้น 4 ยังวิ่งเป็น "แตะปิดท้าย" อย่างเดียว ไม่มีคอลัมน์วัน', async () => {
  const db = fakeDb({
    dept_requests: [requestRow()],
    service_survey_zones: [zone('Z1', 'ล็อบบี้'), zone('Z2', 'ห้องประชุม')],
    service_visits: [visitRow('in_progress')],
    entity_updates: [],
  });
  const rec = recorder();
  const { value: { result } } = await quiet(() => attempt(db, { changes: toDrawing('Z2'), reason: REASON, resultDate: '' }, rec));
  assert.deepEqual(result, { ok: true });
  const [touch1, touch2] = db.calls.filter(M.touch);
  assert.deepEqual(Object.keys(touch2.patch), ['updatedAt']);
  assert.notEqual(touch2.patch.updatedAt, touch1.patch.updatedAt);
  assert.equal(db.tables.service_visits[0].status, 'in_progress', 'นัดไม่ถูกแตะ');
  assert.deepEqual(rec.bells, [['crew', 'zones', 'หัวหน้าเปลี่ยน “ห้องประชุม” เป็นประเมินจากแบบ — ไม่ต้องวัดพื้นที่นี้', KEY, 'U-TECH']]);
});

/* ── §4.6 ตารางแรก: ฐานพังรายขั้น แล้วกดซ้ำด้วย body + actionId เดิม ─────────────────── */
for (const [name, sc] of Object.entries(SCENARIOS)) {
  test(`ฐานพังทีละขั้นแล้วกดซ้ำ → จบที่สถานะเดียวกับรอบที่ไม่พัง · ${name}`, async () => {
    const clean = fakeDb(sc.seed());
    const cleanRec = recorder();
    const first = await quiet(() => attempt(clean, sc.body, cleanRec));
    assert.deepEqual(first.value.result, { ok: true }, 'รอบที่ไม่พัง');
    assert.equal(first.value.plan.kind, sc.kind);
    const want = visible(clean, cleanRec);
    assert.equal(want.thread.length, 1);

    for (const step of sc.steps) {
      const db = fakeDb(sc.seed());
      const rec = recorder();
      const [match, nth] = matcherOf(step);
      db.failOn(match, nth, `พังที่ ${step}`);

      const one = await quiet(() => attempt(db, sc.body, rec));
      if (step === 'touch') {
        // ขั้น 1 พัง = ยังไม่มีอะไรถูกเขียน ⇒ 500 ไม่ใช่ "กดอีกครั้ง"
        assert.deepEqual(one.value.result, { status: 500, error: `พังที่ ${step}`, code: 'error' }, step);
        assert.deepEqual(writesOf(db), [], `${step}: ต้องยังไม่มีอะไรถูกเขียน`);
      } else {
        assert.deepEqual(one.value.result, { status: 409, error: E.partial, code: 'partial' }, step);
        assert.ok(one.logged.some((line) => line.includes(`พังที่ ${step}`)), `${step}: ต้อง log ข้อความจริงของฐาน — ได้ ${one.logged.join(' / ')}`);
        assert.ok(!one.logged.some((line) => /Cannot create property/.test(line)), `${step}: error รูปสตริงทำ runSteps พัง`);
      }
      assert.deepEqual(rec.bells, [], `${step}: รอบที่พังต้องยังไม่ยิงกระดิ่ง (กระดิ่งมาหลังเธรด)`);
      assert.equal(visible(db, rec).thread.length, 0, `${step}: รอบที่พังต้องยังไม่มีบรรทัดเธรดของใบ`);

      const two = await quiet(() => attempt(db, sc.body, rec));
      if (step === 'visitLine') {
        /* นัดถูกยกเลิกแล้วแต่บรรทัดหลักฐานไม่ลง ⇒ กดซ้ำพิสูจน์ไม่ได้ว่าเป็นของการกดนี้ = ล้าสมัย (สภาพค้างที่ยอมรับ §4.6)
           — ต้อง log ดัง ๆ พร้อมเลขนัดตั้งแต่รอบแรก หัวหน้าจะได้บอกช่างเอง */
        assert.deepEqual(two.value.result, STALE, step);
        assert.ok(one.logged.some((line) => line.includes('SV-26100011')), 'ต้อง log เลขนัดที่ถูกยกเลิกโดยไม่มีบรรทัด');
        assert.equal(db.tables.service_visits[0].status, 'cancelled');
        continue;
      }
      assert.deepEqual(two.value.result, { ok: true }, `${step}: กดซ้ำ`);
      assert.deepEqual(visible(db, rec), want, `${step}: สถานะหลังกดซ้ำ`);

      // กดครั้งที่สาม (คำตอบรอบสองหายกลางทาง) = ไม่มีเธรด / กระดิ่งรอบสอง
      const three = await quiet(() => attempt(db, sc.body, rec));
      assert.deepEqual(three.value.result, { ok: true, already: true }, `${step}: กดครั้งที่สาม`);
      assert.deepEqual(visible(db, rec), want, `${step}: สถานะหลังกดครั้งที่สาม`);
    }
  });
}

test('🔴 อ่านกันซ้ำของขั้น 5 พัง = ขั้นที่พัง ไม่ใช่ "ยังไม่มีบรรทัด" — ต้องไม่มีการเขียนเธรด', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  db.failOn(M.dedupeRead);
  const { value: { result } } = await quiet(() => attempt(db, sc.body, rec));
  assert.deepEqual(result, { status: 409, error: E.partial, code: 'partial' });
  assert.equal(db.calls.filter(M.thread).length, 0);
  assert.deepEqual(rec.bells, []);
});

test('การกดใหม่ที่เนื้อหาเหมือนเดิมทุกตัว (actionId ใหม่) ได้บรรทัดเธรดและกระดิ่งของตัวเอง', async () => {
  const seed = () => ({
    dept_requests: [requestRow()],
    service_survey_zones: [zone('Z1', 'ล็อบบี้'), zone('Z2', 'ห้องประชุม')],
    service_visits: [visitRow('scheduled')],
    entity_updates: [],
  });
  const db = fakeDb(seed());
  const rec = recorder();
  const go = (changes, key) => quiet(() => attempt(db, { changes, reason: 'หน้างานยังก่อสร้าง', resultDate: '' }, rec, { key }));
  assert.deepEqual((await go(toDrawing('Z2'), KEY)).value.result, { ok: true });
  assert.deepEqual((await go(toOnsite('Z2'), 'U-HEAD|back-0001')).value.result, { ok: true });
  assert.deepEqual((await go(toDrawing('Z2'), KEY2)).value.result, { ok: true });
  const state = visible(db, rec);
  assert.equal(state.thread.length, 3);
  assert.deepEqual(state.thread.map((t) => t.meta.key), [KEY, 'U-HEAD|back-0001', KEY2]);
  assert.equal(state.thread[0].body, state.thread[2].body, 'เนื้อหาเหมือนกันทุกตัวอักษร แต่เป็นสองเหตุการณ์');
  assert.deepEqual(state.bells.map((b) => b[3]), [KEY, KEY2], 'กระดิ่งช่างสองครั้ง คนละกุญแจ');
});

test('🔴 กดซ้ำหลังเสร็จครบแล้ว = ไม่มีขั้นไหนวิ่งซ้ำ — วันส่งผลที่ถูกเลื่อนทีหลังไม่ถูกเขียนทับ · แถวที่ถูกสลับกลับไม่ถูกสลับอีก', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  assert.deepEqual((await quiet(() => attempt(db, sc.body, rec))).value.result, { ok: true });

  // คำตอบรอบแรกหายกลางทาง · หัวหน้าเลื่อนวันส่งผลที่หน้าคำร้อง และสลับ Z3 กลับเป็นลงหน้างานด้วยการกดอีกครั้งหนึ่ง
  Object.assign(db.tables.dept_requests[0], { committedDueDate: '2026-10-20', committedResultDate: '2026-10-20' });
  Object.assign(db.tables.service_survey_zones.find((z) => z.id === 'Z3'), { method: 'onsite', methodReason: 'แบบไม่พอ ต้องดูของจริง' });
  const bellsBefore = rec.bells.length;
  const from = db.calls.length;

  // โมดัลเดิมยังเปิดอยู่ — กดบันทึกอีกครั้งด้วย body + actionId เดิม
  const again = await quiet(() => attempt(db, sc.body, rec));
  assert.deepEqual(again.value.result, { ok: true, already: true });
  assert.deepEqual(writesOf(db, from).map((c) => `${c.table}.${c.op}`), ['dept_requests.update'], 'มีแค่การจองใบของขั้น 1');
  assert.equal(db.tables.dept_requests[0].committedResultDate, '2026-10-20', 'วันที่เลื่อนไว้ต้องอยู่');
  assert.equal(db.tables.dept_requests[0].committedDueDate, '2026-10-20');
  assert.equal(db.tables.service_survey_zones.find((z) => z.id === 'Z3').method, 'onsite', 'แถวที่สลับกลับไปแล้วไม่ถูกสลับซ้ำเงียบ ๆ');
  assert.equal(db.tables.entity_updates.filter((u) => u.entityType === 'dept_request').length, 1);
  assert.equal(rec.bells.length, bellsBefore);
});

test('🔴 ขั้น 1 จองด้วยรุ่นของใบ: ใบถูกแก้หลัง route อ่าน (หัวหน้าอีกคนเขียนก่อน) → 409 ล้าสมัย · ไม่มีอะไรถูกเขียน · อ่านซ้ำไม่ออก = 500', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  // อีกการกดแตะใบไปก่อน (รุ่นขยับ) ระหว่างที่การกดนี้สร้างแผนเสร็จกับจองใบ
  db.on(M.touch, (t) => { t.dept_requests[0].updatedAt = '2026-10-09T00:00:00+00:00'; }, 1);
  const { value: { result }, logged } = await quiet(() => attempt(db, sc.body, rec));
  assert.deepEqual(result, { status: 409, error: E.stale, code: 'stale' });
  assert.equal(db.calls.filter(M.touch)[0].hit, 0);
  assert.deepEqual(writesOf(db).filter((c) => c.hit !== 0), []);
  assert.equal(db.tables.service_visits[0].status, 'scheduled');
  assert.equal(db.tables.dept_requests[0].updatedAt, '2026-10-09T00:00:00+00:00');
  assert.deepEqual(rec.bells, []);
  assert.deepEqual(logged, [], 'การชนไม่ใช่ความพังของฐาน');

  // จองไม่ติดแล้วอ่านใบซ้ำไม่ออก — ไม่เดาว่า "ส่งผลไปแล้ว" หรือ "ถูกแก้": 500 (ยังไม่ได้เขียนอะไร)
  const down = fakeDb(sc.seed());
  down.on(M.touch, (t) => { t.dept_requests[0].updatedAt = '2026-10-09T00:00:00+00:00'; }, 1);
  down.failOn(M.recheck, 1, 'อ่านใบไม่ได้');
  const out = await quiet(() => attempt(down, sc.body, recorder()));
  assert.deepEqual(out.value.result, { status: 500, error: 'อ่านใบไม่ได้', code: 'error' });
  assert.deepEqual(writesOf(down).filter((c) => c.hit !== 0), []);

  // ใบที่ไม่มีรุ่นเลย (แถวเก่า) — จองด้วย "รุ่นว่าง"
  const blank = fakeDb({ ...sc.seed(), dept_requests: [requestRow({ updatedAt: null })] });
  assert.deepEqual((await quiet(() => attempt(blank, sc.body, recorder()))).value.result, { ok: true });
  assert.deepEqual(blank.calls.filter(M.touch)[0].where, [['eq', 'id', 'RQ1'], ['is', 'answeredAt', null], ['is', 'updatedAt', null]]);
});

test('surveyMethodAppliedByOther: แถวที่ถึงเป้าแล้วเป็นของการกดครั้งอื่นที่ลงเธรดครบ = ใช่ · กดซ้ำหลังบันทึกครึ่งทาง / หลังเสร็จครบ = ไม่ใช่ · อ่านพัง = error', async () => {
  const line = (key, toDrawing, toOnsite, createdAt) => ({
    id: `EUP-${createdAt}`, entityType: 'dept_request', entityId: 'RQ1', kind: 'method', body: 'x',
    meta: { key, kind: 'switch', toDrawing, toOnsite }, createdAt,
  });
  const world = (updates) => fakeDb({
    dept_requests: [requestRow()],
    service_survey_zones: [zone('Z1', 'ล็อบบี้', { ...drawn, methodReason: REASON, methodChangedByName: 'หัวหน้า ก' }), zone('Z2', 'ห้องประชุม')],
    service_visits: [],
    entity_updates: updates,
  });
  const planOf = (db) => surveyMethodSwitchPlan({
    rows: clone(db.tables.service_survey_zones), changes: toDrawing('Z1', 'Z2'), visit: null, request: requestRow(),
    reason: REASON, resultDate: DATE, actor: user, nowIso: NOW,
  });
  const ask = (db) => surveyMethodAppliedByOther(db, { requestId: 'RQ1', key: KEY, plan: planOf(db) });

  // Z1 ถึงเป้าแล้ว (เหตุผล + ชื่อตรง) — แผนนับเป็นของการกดนี้ · Z2 ยังต้องเขียน
  const half = world([]);
  assert.deepEqual(planOf(half).writes.drawingIds, ['Z2']);
  assert.deepEqual(await ask(half), { other: false }, 'กดซ้ำหลังบันทึกครึ่งทาง: ยังไม่มีบรรทัดเธรดของใคร');

  const mine = world([line(KEY, ['Z1', 'Z2'], [], '2026-10-08T05:00:00+00:00')]);
  assert.deepEqual(await ask(mine), { other: false }, 'กดซ้ำหลังเสร็จครบ: บรรทัดล่าสุดเป็นของกุญแจตัวเอง');

  const tab = world([line('U-HEAD|other-tab-01', ['Z1'], [], '2026-10-08T05:00:00+00:00')]);
  assert.deepEqual(await ask(tab), { other: true }, 'แท็บอื่นของหัวหน้าคนเดียวกันสลับไปก่อนด้วยชิปเดียวกัน');

  // สลับ → สลับกลับ → สลับอีก (รอบสามพังครึ่งทาง): บรรทัดล่าสุดที่เอ่ยถึง Z1 คือ "กลับเป็นลงหน้างาน" ของอีกการกด — ไม่ใช่ทิศเดียวกัน
  const third = world([
    line('U-HEAD|first-0001', ['Z1'], [], '2026-10-08T03:00:00+00:00'),
    line('U-HEAD|back-00001', [], ['Z1'], '2026-10-08T04:00:00+00:00'),
  ]);
  assert.deepEqual(await ask(third), { other: false }, 'การกดซ้ำของรอบสามต้องไม่ถูกตอบว่าล้าสมัยตลอดไป');

  // ไม่มีแถวที่ถึงเป้าแล้ว = ไม่อ่านอะไรเลย
  const fresh = fakeDb({ dept_requests: [requestRow()], service_survey_zones: [zone('Z1', 'ล็อบบี้'), zone('Z2', 'ห้องประชุม')], service_visits: [], entity_updates: [] });
  assert.deepEqual(await ask(fresh), { other: false });
  assert.equal(fresh.calls.length, 0);

  const down = world([]);
  down.failOn(M.dedupeRead, 1, 'อ่านเธรดไม่ได้');
  const failed = await ask(down);
  assert.equal(failed.error?.message, 'อ่านเธรดไม่ได้');
  assert.equal('other' in failed, false, 'อ่านพังต้องไม่ตอบว่าใช่หรือไม่ใช่');
});

/* ── §4.6 ตารางสอง: ชนกับคนอื่น — ตอบข้อความของตัวเอง ไม่ใช่ "กดอีกครั้ง" ────────────── */
test('ชน: ใบถูกส่งผลไปก่อน (ขั้น 1 ไม่โดนแถว) → 409 ส่งผลไปแล้ว · ไม่มีอะไรถูกเขียน', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  db.on(M.touch, (t) => { t.dept_requests[0].answeredAt = NOW; });
  const { value: { result }, logged } = await quiet(() => attempt(db, sc.body, rec));
  assert.deepEqual(result, { status: 409, error: E.sentRoute, code: 'sent' });
  assert.equal(db.tables.service_visits[0].status, 'scheduled');
  assert.deepEqual(db.tables.service_survey_zones.map((z) => z.method), ['onsite', 'onsite', 'onsite', 'onsite']);
  assert.equal(db.calls.filter(M.touch)[0].hit, 0);
  assert.deepEqual(writesOf(db).filter((c) => c.hit !== 0), []);
  assert.deepEqual(logged, [], 'การชนไม่ใช่ความพังของฐาน — ไม่ log เป็น error');
});

test('ชน: ใบถูกส่งผลระหว่างทาง (ตรวจซ้ำก่อนขั้น 2 / 3a) → 409 ส่งผลไปแล้ว · เขียนไปแค่ที่ผ่านมา', async () => {
  const sc = Object.values(SCENARIOS)[0];
  // ก่อนขั้น 2
  const a = fakeDb(sc.seed());
  a.on(M.recheck, (t) => { t.dept_requests[0].answeredAt = NOW; }, 1);
  const ra = await quiet(() => attempt(a, sc.body, recorder()));
  assert.deepEqual(ra.value.result, { status: 409, error: E.sentRoute, code: 'sent' });
  assert.deepEqual(writesOf(a).map((c) => `${c.table}.${c.op}`), ['dept_requests.update'], 'มีแค่การแตะใบ');
  assert.equal(a.tables.service_visits[0].status, 'scheduled');
  // ก่อนขั้น 3a (นัดถูกยกเลิกไปแล้ว)
  const b = fakeDb(sc.seed());
  b.on(M.recheck, (t) => { t.dept_requests[0].answeredAt = NOW; }, 2);
  const rb = await quiet(() => attempt(b, sc.body, recorder()));
  assert.deepEqual(rb.value.result, { status: 409, error: E.sentRoute, code: 'sent' });
  assert.equal(b.tables.service_visits[0].status, 'cancelled');
  assert.deepEqual(b.tables.service_survey_zones.map((z) => z.method), ['onsite', 'onsite', 'onsite', 'onsite']);
  assert.equal(b.calls.filter(M.thread).length, 0);
});

test('ชน: ช่างกดเริ่มงานก่อนคำสั่งยกเลิกถึง (ขั้น 2) → 409 ล้าสมัย · เขียนไปแค่การแตะใบ', async () => {
  for (const sc of [Object.values(SCENARIOS)[0], Object.values(SCENARIOS)[2], Object.values(SCENARIOS)[3]]) {
    const db = fakeDb(sc.seed());
    const rec = recorder();
    const before = clone(db.tables.service_survey_zones);
    db.on(M.cancel, (t) => { t.service_visits[0].status = 'in_progress'; });
    const { value: { result }, logged } = await quiet(() => attempt(db, sc.body, rec));
    assert.deepEqual(result, { status: 409, error: E.stale, code: 'stale' }, sc.kind);
    assert.equal(db.tables.service_visits[0].status, 'in_progress');
    assert.deepEqual(db.tables.service_survey_zones, before, 'แถวพื้นที่ไม่ถูกแตะ');
    assert.deepEqual(db.tables.entity_updates, []);
    assert.deepEqual(rec.bells, []);
    assert.deepEqual(logged, []);
  }
});

test('ชน (ขั้น 3b): แถวถูกบันทึกโดยคนอื่นหนึ่งครั้ง = อ่านใหม่แล้วเขียนได้ · ถูกตัด / ขยับสองครั้ง = 409 ล้าสมัย', async () => {
  const sc = Object.values(SCENARIOS)[1];

  // (ก) ช่างบันทึกจุดเพิ่มระหว่างทาง — ยังเป็นจากแบบ ยังไม่ถูกตัด ⇒ ใช้จุดชุดใหม่ ปลดเลือกทุกจุด
  const a = fakeDb(sc.seed());
  a.on(M.toOnsite, (t) => {
    const z1 = t.service_survey_zones.find((z) => z.id === 'Z1');
    z1.updatedAt = '2026-10-09T03:59:00+00:00';
    z1.spots = [...z1.spots, { id: 's9', selected: true }];
  });
  const ra = await quiet(() => attempt(a, sc.body, recorder()));
  assert.deepEqual(ra.value.result, { ok: true });
  const z1 = a.tables.service_survey_zones.find((z) => z.id === 'Z1');
  assert.equal(z1.method, 'onsite');
  assert.deepEqual(z1.spots, [{ id: 's1', selected: false }, { id: 's2', selected: false }, { id: 's9', selected: false }]);
  const tries = a.calls.filter((c) => M.toOnsite(c) && c.where.some(([, col, v]) => col === 'id' && v === 'Z1'));
  assert.deepEqual(tries.map((c) => c.hit), [0, 1]);
  assert.deepEqual(tries[1].where[2], ['eq', 'updatedAt', '2026-10-09T03:59:00+00:00']);

  // (ข) แถวที่สองถูกตัดไประหว่างทาง ⇒ ล้าสมัย · แถวแรกเป็นลงหน้างานไปแล้ว · วันและเธรดยังไม่ถูกเขียน
  const b = fakeDb(sc.seed());
  const recB = recorder();
  b.on(M.toOnsite, (t) => {
    const z2 = t.service_survey_zones.find((z) => z.id === 'Z2');
    z2.status = 'cut';
    z2.updatedAt = '2026-10-09T03:59:30+00:00';
  }, 2);
  const rb = await quiet(() => attempt(b, sc.body, recB));
  assert.deepEqual(rb.value.result, { status: 409, error: E.stale, code: 'stale' });
  assert.deepEqual(b.tables.service_survey_zones.map((z) => z.method), ['drawing', 'onsite', 'drawing', 'drawing']);
  assert.equal(b.tables.dept_requests[0].committedResultDate, '2026-10-15', 'วันยังไม่ถูกล้าง');
  assert.deepEqual(b.tables.entity_updates, []);
  assert.deepEqual(rb.logged, []);

  // (ค) คนอื่นสลับแถวนั้นกลับเป็นลงหน้างานไปก่อน ⇒ ล้าสมัย
  const c = fakeDb(sc.seed());
  c.on(M.toOnsite, (t) => {
    const row = t.service_survey_zones.find((z) => z.id === 'Z1');
    Object.assign(row, { method: 'onsite', methodChangedByName: 'หัวหน้า ข', updatedAt: '2026-10-09T03:59:40+00:00' });
  });
  assert.deepEqual((await quiet(() => attempt(c, sc.body, recorder()))).value.result, { status: 409, error: E.stale, code: 'stale' });

  // (ง) แถวขยับอีกรอบระหว่างอ่านใหม่กับเขียนรอบสอง ⇒ ล้าสมัย (ไม่วนไม่รู้จบ)
  const d = fakeDb(sc.seed());
  const bump = (stamp) => (t) => { t.service_survey_zones.find((z) => z.id === 'Z1').updatedAt = stamp; };
  d.on(M.toOnsite, bump('2026-10-09T03:59:50+00:00'), 1);
  d.on(M.toOnsite, bump('2026-10-09T03:59:55+00:00'), 2);
  const rd = await quiet(() => attempt(d, sc.body, recorder()));
  assert.deepEqual(rd.value.result, { status: 409, error: E.stale, code: 'stale' });
  assert.equal(d.calls.filter(M.toOnsite).length, 2);

  // (จ) การอ่านใหม่พัง = ฐานพัง ไม่ใช่การชน
  const e = fakeDb(sc.seed());
  e.on(M.toOnsite, bump('2026-10-09T03:59:50+00:00'), 1);
  e.failOn((call) => call.table === 'service_survey_zones' && call.op === 'select', 1, 'อ่านแถวไม่ได้');
  const re = await quiet(() => attempt(e, sc.body, recorder()));
  assert.deepEqual(re.value.result, { status: 409, error: E.partial, code: 'partial' });
  assert.ok(re.logged.some((line) => line.includes('อ่านแถวไม่ได้')));
});

test('ใบถูกส่งผลหลังขั้น 3 (ขั้น 4 ไม่โดนแถว) ไม่ใช่ความพัง — ข้ามวัน แล้วเขียนเธรดต่อ', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  db.on(M.touch, (t) => { t.dept_requests[0].answeredAt = NOW; }, 2);
  const { value: { result } } = await quiet(() => attempt(db, sc.body, rec));
  assert.deepEqual(result, { ok: true });
  assert.equal(db.tables.dept_requests[0].committedResultDate, '2026-10-15', 'วันไม่ถูกเขียนทับใบที่ส่งผลแล้ว');
  assert.equal(visible(db, rec).thread.length, 1);
});

/* ── ด่านของตัวเขียนเอง — แผนที่ไม่ควรมาถึง ───────────────────────────────── */
test('ตัวเขียนไม่รับแผนที่ล้าสมัย / ไม่มีอะไรให้ทำ / ช่องกรอกผิด / ไม่มีกุญแจ — ไม่แตะฐานเลย', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const seed = sc.seed();
  const build = (over = {}) => surveyMethodSwitchPlan({
    rows: seed.service_survey_zones, changes: sc.body.changes, visit: seed.service_visits[0], request: seed.dept_requests[0],
    reason: REASON, resultDate: DATE, actor: user, nowIso: NOW, ...over,
  });
  const cases = [
    ['ล้าสมัย', build({ changes: toDrawing('Z404') }), KEY, { status: 409, error: E.stale, code: 'stale' }],
    ['ไม่มีอะไรให้ทำ', build({ changes: [] }), KEY, { status: 409, error: E.nothing, code: 'nothing' }],
    ['เหตุผลสั้น', build({ reason: 'สั้น' }), KEY, { status: 400, error: E.reason, code: 'invalid' }],
    ['ไม่มีวันส่งผล', build({ resultDate: '' }), KEY, { status: 400, error: E.resultDate, code: 'invalid' }],
    ['ไม่มีกุญแจ', build(), '', { status: 400, error: 'วิธีประเมินไม่ถูกต้อง', code: 'invalid' }],
    ['ไม่มีแผน', null, KEY, { status: 400, error: 'วิธีประเมินไม่ถูกต้อง', code: 'invalid' }],
  ];
  for (const [name, plan, key, want] of cases) {
    const db = fakeDb(seed);
    const rec = recorder();
    const got = await runSurveyMethodPlan(db, { plan, request: seed.dept_requests[0], user, nowIso: NOW, key, notify: rec.notify, audit: rec.audit });
    assert.deepEqual(got, want, name);
    assert.deepEqual(db.calls, [], `${name}: ต้องไม่แตะฐาน`);
  }
});

test('แผนที่ไม่ได้ส่งเวลามา: ตัวเขียนเติม dueCommittedAt / assignedAt ด้วยเวลาของ request เอง', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const rec = recorder();
  const seed = sc.seed();
  const plan = surveyMethodSwitchPlan({
    rows: seed.service_survey_zones, changes: sc.body.changes, visit: seed.service_visits[0], request: seed.dept_requests[0],
    reason: REASON, resultDate: DATE, actor: user,
  });
  assert.equal(plan.writes.dates.dueCommittedAt, null);
  const { value } = await quiet(() => runSurveyMethodPlan(db, { plan, request: seed.dept_requests[0], user, nowIso: NOW, key: KEY, notify: rec.notify, audit: rec.audit }));
  assert.deepEqual(value, { ok: true });
  assert.equal(db.tables.dept_requests[0].dueCommittedAt, NOW);
  assert.equal(db.tables.dept_requests[0].assignedAt, NOW);
});

test('กระดิ่งที่โยน error ต้องไม่ทำให้การสลับที่เขียนครบแล้วตอบว่าพัง', async () => {
  const sc = Object.values(SCENARIOS)[0];
  const db = fakeDb(sc.seed());
  const boom = () => { throw new Error('กระดิ่งล่ม'); };
  const { value: { result } } = await quiet(() => attempt(db, sc.body, { notify: { crew: boom, head: boom }, audit: async () => {}, bells: [] }));
  assert.deepEqual(result, { ok: true });
});

/* ── cancelSurveyVisitForMethod ───────────────────────────────────────────── */
const visitSeed = (status) => ({ dept_requests: [requestRow()], service_visits: [visitRow(status)], entity_updates: [] });
const cancelArgs = (rec) => ({
  visitId: 'V1', requestId: 'RQ1', reason: `เปลี่ยนเป็นประเมินจากแบบ: ${REASON}`, key: KEY, user, nowIso: NOW, req: null, audit: rec.audit,
});

test('cancelSurveyVisitForMethod: นัดไว้ / ร่าง → ยกเลิก + บรรทัดเดียวที่พก meta.methodKey · ไม่เขียน dept_requests เลย', async () => {
  for (const status of ['scheduled', 'draft']) {
    const db = fakeDb(visitSeed(status));
    const rec = recorder();
    const { value: got } = await quiet(() => cancelSurveyVisitForMethod(db, cancelArgs(rec)));
    assert.equal(got.cancelled, true, status);
    assert.equal(got.visit.id, 'V1');
    assert.equal(got.visit.status, 'cancelled');
    assert.equal(db.tables.service_visits[0].status, 'cancelled');
    assert.equal(db.tables.service_visits[0].updatedAt, NOW);
    assert.deepEqual(db.tables.entity_updates.map(({ entityType, entityId, kind, body, meta, authorId }) => ({ entityType, entityId, kind, body, meta, authorId })), [{
      entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: `เปลี่ยนเป็นประเมินจากแบบ: ${REASON}`, meta: { methodKey: KEY }, authorId: 'U-HEAD',
    }]);
    // 🔴 การยกเลิกนัดไม่มีผลข้างเคียงบนใบ (ถอยขั้นเฉพาะ "เข้าพื้นที่ไม่ได้")
    assert.deepEqual(db.calls.filter((c) => c.table === 'dept_requests' && c.op !== 'select'), []);
    assert.equal(rec.audits.length, 1);
    assert.equal(rec.audits[0].entityType, 'service_visit');
    assert.equal(rec.audits[0].entityId, 'V1');
    assert.equal(rec.audits[0].summary, `ยกเลิกนัดประเมิน SV-26100011 — เปลี่ยนเป็นประเมินจากแบบ: ${REASON}`);
  }
});

test('cancelSurveyVisitForMethod: ยกเลิกไปแล้ว = กดซ้ำ ไม่มีบรรทัดที่สอง · นัดเดินไปแล้ว = ชน ไม่ใช่เขียนพัง', async () => {
  const again = fakeDb(visitSeed('cancelled'));
  const rec = recorder();
  const { value: got } = await quiet(() => cancelSurveyVisitForMethod(again, cancelArgs(rec)));
  assert.deepEqual(got, { cancelled: false, visit: { id: 'V1', code: 'SV-26100011', status: 'cancelled' } });
  assert.deepEqual(again.tables.entity_updates, []);
  assert.deepEqual(rec.audits, []);

  for (const status of ['in_progress', 'done', 'partial', 'unable', 'rescheduled']) {
    const db = fakeDb(visitSeed(status));
    const { value } = await quiet(() => cancelSurveyVisitForMethod(db, cancelArgs(recorder())));
    assert.deepEqual(value, { conflict: true }, status);
    assert.equal(db.tables.service_visits[0].status, status);
    assert.deepEqual(db.tables.entity_updates, []);
  }
  // นัดของใบอื่น / ไม่มีนัดนี้ = ชนเช่นกัน
  const other = fakeDb({ ...visitSeed('scheduled'), service_visits: [visitRow('scheduled', { requestId: 'RQ-OTHER' })] });
  assert.deepEqual((await quiet(() => cancelSurveyVisitForMethod(other, cancelArgs(recorder())))).value, { conflict: true });
  assert.equal(other.tables.service_visits[0].status, 'scheduled');
});

test('cancelSurveyVisitForMethod: ทุกทางพังคืน { error } ที่เป็น Error จริง (runSteps แก้ .message ได้)', async () => {
  const table = [
    ['คำสั่งยกเลิกพัง', (db) => db.failOn(M.cancel, 1, 'ยกเลิกไม่ได้'), 'ยกเลิกไม่ได้', 'scheduled'],
    ['บรรทัดเธรดไม่ลง (error รูปสตริงจาก appendUpdate)', (db) => db.failOn(M.visitLine, 1, 'เขียนเธรดไม่ได้'), 'เขียนเธรดไม่ได้', 'cancelled'],
    ['อ่านซ้ำพัง', (db) => db.failOn((c) => c.table === 'service_visits' && c.op === 'select', 1, 'อ่านนัดไม่ได้'), 'อ่านนัดไม่ได้', 'in_progress'],
  ];
  for (const [name, arm, message, endStatus] of table) {
    const db = fakeDb(visitSeed(name === 'อ่านซ้ำพัง' ? 'in_progress' : 'scheduled'));
    arm(db);
    const { value: got, logged } = await quiet(() => cancelSurveyVisitForMethod(db, cancelArgs(recorder())));
    assert.ok(got.error instanceof Error, name);
    assert.match(got.error.message, new RegExp(message), name);
    assert.doesNotThrow(() => { got.error.message = `ป้าย: ${got.error.message}`; }, name);
    assert.equal(db.tables.service_visits[0].status, endStatus, name);
    if (name.startsWith('บรรทัดเธรด')) assert.ok(logged.some((line) => line.includes('SV-26100011')), 'ต้อง log เลขนัด');
  }
});

/* ── appendVisitCancelLine ────────────────────────────────────────────────── */
test('appendVisitCancelLine: ไม่ส่ง meta = แถวเดียวกับที่ PATCH ของนัดเขียนทุกวันนี้ · ไม่มีเหตุผล = "ยกเลิกนัด"', async () => {
  const db = fakeDb({ service_visits: [visitRow('cancelled')], entity_updates: [] });
  await quiet(async () => {
    const plain = await appendVisitCancelLine(db, { visitId: 'V1', reason: '', user });
    assert.equal(plain.error, null);
    const withMeta = await appendVisitCancelLine(db, { visitId: 'V1', reason: 'ลูกค้าขอเลื่อน', user, meta: { methodKey: KEY } });
    assert.equal(withMeta.error, null);
  });
  assert.deepEqual(db.tables.entity_updates.map(({ entityType, entityId, kind, body, meta }) => ({ entityType, entityId, kind, body, meta })), [
    { entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: 'ยกเลิกนัด', meta: {} },
    { entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: 'ลูกค้าขอเลื่อน', meta: { methodKey: KEY } },
  ]);
});

/* ── surveyVisitCancelledByKey ────────────────────────────────────────────── */
test('surveyVisitCancelledByKey: พิสูจน์จากบรรทัดยกเลิกของนัดนั้นเท่านั้น · อ่านพัง = { error } ไม่ใช่ "ไม่ใช่" หรือ "ใช่"', async () => {
  const line = (over = {}) => ({
    id: `EUP-${Math.random()}`, entityType: 'service_visit', entityId: 'V1', kind: 'cancel', meta: { methodKey: KEY },
    createdAt: '2026-10-09T04:00:00.000Z', ...over,
  });
  const cases = [
    ['บรรทัดตรงกุญแจ', [line()], KEY, true],
    ['กุญแจของการกดอื่น', [line({ meta: { methodKey: KEY2 } })], KEY, false],
    ['ยกเลิกจากจอนัด (ไม่มี meta)', [line({ meta: {} }), line({ meta: null })], KEY, false],
    ['ไม่มีบรรทัดเลย', [], KEY, false],
    ['บรรทัดของนัดอื่น', [line({ entityId: 'V2' })], KEY, false],
    ['บรรทัดชนิดอื่นของนัดนี้', [line({ kind: 'queue' })], KEY, false],
    ['เธรดของใบที่บังเอิญ id ตรง', [line({ entityType: 'dept_request' })], KEY, false],
    ['ไม่ส่งกุญแจ', [line({ meta: { methodKey: undefined } }), line({ meta: {} })], undefined, false],
    ['หลายบรรทัด ตัวที่ตรงอยู่ในห้าตัวล่าสุด', [line({ meta: {} , createdAt: '2026-10-09T05:00:00.000Z' }), line()], KEY, true],
  ];
  for (const [name, rows, key, want] of cases) {
    const db = fakeDb({ entity_updates: rows });
    assert.deepEqual(await surveyVisitCancelledByKey(db, { visitId: 'V1', key }), { proved: want }, name);
    const read = db.calls[0];
    assert.equal(read.cols, 'id, meta');
    assert.deepEqual(read.where, [['eq', 'entityType', 'service_visit'], ['eq', 'entityId', 'V1'], ['eq', 'kind', 'cancel']]);
  }
  const broken = fakeDb({ entity_updates: [line()] });
  broken.failOn((c) => c.table === 'entity_updates', 1, 'อ่านเธรดไม่ได้');
  const got = await surveyVisitCancelledByKey(broken, { visitId: 'V1', key: KEY });
  assert.ok(got.error instanceof Error);
  assert.equal(got.error.message, 'อ่านเธรดไม่ได้');
  assert.equal('proved' in got, false, 'อ่านไม่ได้ต้องไม่ตกไปเป็นคำตอบ');
});
