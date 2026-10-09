// ── หัวหน้าตัดพื้นที่ลงหน้างานสุดท้ายขณะนัดยังเปิด: กล่องยืนยัน + ทางทำต่อให้จบ + กระดิ่งหัวหน้า ──────────────
//    (ประเมินจากแบบ งวด S2a · สเปก §3 กลุ่ม B ข้อ 12–14 · แผน survey-desk-assessment §2 แถว 16)
//
// ⭐ เรียก handler **ตัวจริง** (`PATCH` / `DELETE` ของพื้นที่) + แผนจริง + ตัวเขียนจริง ผ่าน supabase ปลอมที่จำแถว
//    (`crew/routeTestKit.mjs`) — "พังที่ขั้น k แล้วกดยืนยันซ้ำ" จึงเป็นการกดซ้ำจริง: รอบสองอ่านแถวที่รอบแรกเขียนค้างไว้
//    แล้วต้องจบที่สภาพเดียวกับรอบที่ไม่พังเลย (เธรดหนึ่งบรรทัด · กระดิ่งชุดเดียว · นัดถูกยกเลิกครั้งเดียว)
// 🔴 สวิตช์ `SURVEY_DRAWING_METHOD` ตั้งและคืนค่าในแต่ละเทสต์ — ปิดอยู่ = คำตอบของงวด S1 ทุกตัวอักษร
// ⚠️ ไม่มีอะไรถึงฐานจริง — ตัวอ่านผู้ใช้และ client ถูกถอดด้วย hook ของชุดเครื่องมือ (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, callRoute, tech, mate, planner } from './crew/routeTestKit.mjs';
import { surveyNeedsVisit } from './surveyMethod.js';
import { SURVEY_METHOD_ERRORS, surveyMethodPlanKey, surveyMethodSwitchPlan } from './surveyMethodSwitch.js';
import { surveyDeskCommitPatch } from './surveyVisit.js';

delete process.env.SURVEY_DRAWING_METHOD;
const { PATCH, DELETE } = await import('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');

/* ข้อความที่ผู้ใช้เห็น — เขียนตรงตัวที่นี่โดยตั้งใจ · route / แผนแก้คำเมื่อไร เทสต์ต้องแดง */
const LAST_ONSITE_CUT_CREW = 'พื้นที่สุดท้ายที่ต้องวัด — แจ้งหัวหน้าให้ตัดออก';
const DRAWING_ZONE_HEAD_ONLY = 'พื้นที่นี้หัวหน้าประเมินจากแบบ — ไม่ต้องวัดหน้างาน';
const holdText = (visitCode) => `พื้นที่สุดท้ายที่ต้องวัด และนัด ${visitCode} ยังเปิดอยู่ — ยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยตัดพื้นที่นี้ออก`;
const STALE = 'ใบนี้ถูกแก้โดยคนอื่นระหว่างที่เปิดกล่องนี้ — โหลดหน้าใหม่';
const SENT = 'ส่งผลไปแล้ว — เปลี่ยนวิธีประเมินไม่ได้ โหลดหน้าใหม่';
const BAD_BODY = 'วิธีประเมินไม่ถูกต้อง';
const RETRY = 'ตัดพื้นที่ พื้นที่ A ออกแล้ว แต่บันทึกไม่ครบ — กดยืนยันอีกครั้ง';
const CUT_SENTENCE = 'ตัดพื้นที่ พื้นที่ A ออก — ไม่เหลือพื้นที่ที่ต้องลงหน้างาน';
const CANCEL_TAIL = ' · ยกเลิกนัด SV-26100007';
const RESULT_TAIL = ' · ส่งผล 16/10/2026';
const CREW_BELL_TITLE = 'ยกเลิกนัด SV-26100007 — ใบนี้เปลี่ยนเป็นประเมินจากแบบ';
const HEAD_BELL_TITLE = 'คำร้องประเมินจากแบบ RQ-AS-26100001 — รอหัวหน้าประเมิน';
const CREW_KIND = 'survey_method_changed';
const HEAD_KIND = 'survey_desk_ready';

const head = { id: 'U-HEAD', name: 'หัวหน้าฝ่าย', role: 'ts_manager', department: 'TS' };
/* รายชื่อบัญชีของระบบ — กระดิ่งหัวหน้าไปถึงคนที่ส่งผลประเมินได้และไม่ใช่คนกด */
const AUTH_USERS = [
  { id: 'U-HEAD', email: 'head@x.test', app_metadata: { role: 'ts_manager' }, user_metadata: { name: 'หัวหน้าฝ่าย' } },
  { id: 'U-AUD', email: 'aud@x.test', app_metadata: { role: 'ts_audit' }, user_metadata: { name: 'ผู้ตรวจ' } },
  { id: 'U-TECH', email: 'tech@x.test', app_metadata: { role: 'ts' }, user_metadata: { name: 'ช่างเอ' } },
  { id: 'U-PLAN', email: 'plan@x.test', app_metadata: { role: 'ts_planner' }, user_metadata: { name: 'ผู้จัดคิว' } },
];

const T0 = '2026-10-01T00:00:00.000Z';
const CUT_REASON = 'ลูกค้าไม่เอาพื้นที่นี้แล้ว';
const DATE = '2026-10-16';
const ACTION = '0b1e6c0e-6a0b-4f0e-9a39-2f0f6f1f7c11';
const KEY = surveyMethodPlanKey({ userId: head.id, actionId: ACTION });

const request = (o = {}) => ({
  id: 'REQ1', kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100001', title: 'ประเมินพื้นที่ อาคารทดสอบ', siteId: 'SST1',
  status: 'acknowledged', acknowledgedAt: T0, variant: 'standard', requestedById: 'U-AE',
  answeredAt: null, cancelledAt: null, closedAt: null,
  committedDueDate: '2026-10-13', committedDueTime: '10:00', committedResultDate: '2026-10-15',
  assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', updatedAt: T0, ...o,
});
const zone = (id, o = {}) => ({
  id, requestId: 'REQ1', zoneId: `SZN-${id}`, zoneName: `พื้นที่ ${id}`, floor: '1', note: null, status: 'ok',
  sortOrder: 1, parts: [], spots: [], cutReason: null, updatedAt: T0, ...o,
});
const drawing = (id, o = {}) => zone(id, { method: 'drawing', ...o });
const cutRow = (id, o = {}) => zone(id, { status: 'cut', cutReason: 'ซ้ำกับพื้นที่อื่นของใบ', ...o });
const visit = (status, o = {}) => ({
  id: 'V1', code: 'SV-26100007', kind: 'survey', requestId: 'REQ1', status, scheduledDate: '2026-10-13', startTime: '10:00:00',
  assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', assistantIds: ['U-MATE'], createdAt: T0, ...o,
});
// A = พื้นที่ลงหน้างานสุดท้ายที่ยังใช้อยู่ · B = จากแบบ · C = ลงหน้างานที่ถูกตัดไปก่อนแล้ว
const mixedSheet = () => [zone('A'), drawing('B', { sortOrder: 2 }), cutRow('C', { sortOrder: 3 })];
// สภาพหลังรอบแรกตัดแถวติดแล้ว: A ถูกตัดและเป็นจากแบบด้วยเหตุผลเดียวกัน (C ยังไม่ถูกทำเครื่องหมาย)
const T1 = '2026-10-09T03:00:00.000Z';
const afterOwnWrite = () => [
  zone('A', { status: 'cut', cutReason: CUT_REASON, method: 'drawing', updatedAt: T1 }),
  drawing('B', { sortOrder: 2 }), cutRow('C', { sortOrder: 3 }),
];

function seed({ zones = mixedSheet(), visits = [visit('scheduled')], req = {}, hook = null, extra = {} } = {}) {
  const db = fakeDb({
    dept_requests: [request(req)],
    service_survey_zones: zones,
    service_visits: visits,
    service_sites: [{ id: 'SST1', code: 'ST-0001', name: 'ไซต์ทดสอบ' }],
    ...extra,
  }, { hook });
  db.auth.admin.listUsers = async ({ page }) => ({ data: { users: page === 1 ? AUTH_USERS : [] }, error: null });
  return db;
}

const patch = (db, user, zoneId, body) => callRoute(PATCH, {
  user, db, method: 'PATCH', path: `/api/service/surveys/REQ1/zones/${zoneId}`, params: { id: 'REQ1', zoneId }, body,
});
const remove = (db, user, zoneId) => callRoute(DELETE, {
  user, db, method: 'DELETE', path: `/api/service/surveys/REQ1/zones/${zoneId}`, params: { id: 'REQ1', zoneId },
});
const flipOf = (over = {}) => ({ committedResultDate: DATE, cancelVisitId: 'V1', actionId: ACTION, ...over });
const cutBody = (over = {}) => ({ status: 'cut', cutReason: CUT_REASON, ...over });
const confirmBody = (flip = {}, over = {}) => cutBody({ flip: flipOf(flip), ...over });
const cut = (db, user, zoneId = 'A', over = {}) => patch(db, user, zoneId, cutBody(over));
const confirm = (db, flip = {}, over = {}) => patch(db, head, 'A', confirmBody(flip, over));

const on = () => { process.env.SURVEY_DRAWING_METHOD = 'on'; };
const off = () => { delete process.env.SURVEY_DRAWING_METHOD; };
// กระดิ่งยิงหลังตอบ (fire-and-forget) — รอให้คิวของมันจบก่อนนับ
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

test.beforeEach((t) => { t.mock.method(console, 'error', () => {}); });
test.afterEach(() => { off(); });

/* ── ตัวอ่านของที่ถูกเขียน ─────────────────────────────────────────────────────────────── */
const rowOf = (db, id) => db.tables.service_survey_zones.find((r) => r.id === id);
const reqOf = (db) => db.tables.dept_requests[0];
const visitOf = (db, id = 'V1') => db.tables.service_visits.find((v) => v.id === id);
const updates = (db) => db.tables.entity_updates || [];
const threadRows = (db) => updates(db).filter((r) => r.entityType === 'dept_request' && r.kind === 'method');
const visitLines = (db) => updates(db).filter((r) => r.entityType === 'service_visit' && r.kind === 'cancel');
const bells = (db, kind) => (db.tables.notifications || []).filter((n) => n.kind === kind);
const bellCalls = (db, kind) => db.writes('notifications').filter((c) => [].concat(c.payload).some((n) => n.kind === kind));
const audits = (db) => (db.tables.audit_logs || []).map((a) => `${a.entityType}: ${a.summary}`);
/* คำสั่งเขียนที่เป็นเนื้อของการกด — ไม่นับ audit กับกระดิ่ง (สองอย่างนั้นมีตัวอ่านของตัวเองข้างบน)
   · คำสั่งที่ถูกทำให้พัง (`failOnce` ติดป้าย `failed`) ไม่นับ: ฐานปลอมจดคำสั่งก่อนตอบ แต่คำสั่งนั้นไม่ได้เขียนอะไร */
const dataWrites = (db, from = 0) => db.calls.slice(from)
  .filter((c) => c.write && !c.failed && c.table !== 'audit_logs' && c.table !== 'notifications');
const label = (c) => {
  if (c.table === 'entity_updates') return `${c.table}:${c.payload.entityType}:${c.payload.kind}`;
  if (c.table === 'dept_requests') return `${c.table}:${'committedResultDate' in c.payload ? 'dates' : 'touch'}`;
  if (c.table === 'service_survey_zones') return `${c.table}:${c.filters.some(([, col]) => col === 'requestId') ? 'cut-marks' : 'own-row'}`;
  return `${c.table}:${c.write}`;
};
const writeLog = (db, from = 0) => dataWrites(db, from).map(label);
const FULL_RUN = [
  'service_survey_zones:own-row',
  'dept_requests:touch',
  'service_visits:update',
  'entity_updates:service_visit:cancel',
  'service_survey_zones:cut-marks',
  'dept_requests:dates',
  'entity_updates:dept_request:method',
];

/* สภาพสุดท้ายที่การกดหนึ่งครั้งต้องทิ้งไว้ — ใช้เทียบ "พังแล้วกดซ้ำ" กับรอบที่ไม่พังเลย (ไม่มีค่าเวลา: แต่ละรอบได้เวลาของตัวเอง) */
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));
const finalState = (db) => ({
  zones: db.tables.service_survey_zones.map((z) => pick(z, ['id', 'status', 'method', 'cutReason'])),
  visits: db.tables.service_visits.map((v) => pick(v, ['id', 'status'])),
  request: pick(reqOf(db), ['committedDueDate', 'committedResultDate', 'committedDueTime', 'assigneeId', 'assigneeName', 'answeredAt']),
  thread: threadRows(db).map((r) => ({ body: r.body, key: r.meta.key, kind: r.meta.kind, flip: r.meta.flip, resultDate: r.meta.resultDate })),
  visitLines: visitLines(db).map((r) => ({ body: r.body, key: r.meta.methodKey })),
  crewBells: bells(db, CREW_KIND).map((n) => pick(n, ['userId', 'title', 'updateId', 'href'])).sort((a, b) => a.userId.localeCompare(b.userId)),
  headBells: bells(db, HEAD_KIND).map((n) => pick(n, ['userId', 'title', 'updateId'])).sort((a, b) => a.userId.localeCompare(b.userId)),
});
const DESK_DATES = pick(surveyDeskCommitPatch({ date: DATE, user: head, nowIso: T1 }),
  ['committedDueDate', 'committedResultDate', 'committedDueTime', 'assigneeId', 'assigneeName']);

test('fixture: ตัด A แล้วใบพลิกเป็นงานโต๊ะ · แผนของการตัดนี้ให้ประโยคที่เทสต์พิมพ์ตรงตัว', () => {
  const rows = mixedSheet();
  assert.equal(surveyNeedsVisit(rows), true);
  const plan = surveyMethodSwitchPlan({
    rows, cut: { zoneId: 'A', to: 'cut' }, visit: visit('scheduled'), request: request(), reason: CUT_REASON, resultDate: DATE,
    actor: { id: head.id, name: head.name },
  });
  assert.equal(plan.kind, 'cut');
  assert.equal(plan.thread, `${CUT_SENTENCE}${CANCEL_TAIL}${RESULT_TAIL}`);
  assert.equal(plan.visitCancelReason, CUT_SENTENCE);
  assert.equal(plan.bells.crew.title, CREW_BELL_TITLE);
  // 🔑 ประโยคกระดิ่งหัวหน้าที่ route ประกอบเอง (ตัด / ลบโดยคนที่ไม่ใช่หัวหน้า) ต้องเท่ากับของแผนทุกตัวอักษร
  assert.equal(plan.bells.head.title, HEAD_BELL_TITLE);
  assert.equal(SURVEY_METHOD_ERRORS.stale, STALE);
  assert.equal(SURVEY_METHOD_ERRORS.sentRoute, SENT);
});

/* ══ สวิตช์ปิด: คำตอบของงวด S1 ══════════════════════════════════════════════════════════════ */

test('🔴 สวิตช์ปิด: หัวหน้าได้ประโยคเดิม ไม่มี code · `flip` ใน body ไม่ถูกอ่าน · ไม่เขียนอะไรเลย', async () => {
  for (const state of ['scheduled', 'draft']) {
    for (const body of [cutBody(), confirmBody(), confirmBody({ actionId: null, committedResultDate: 'x' })]) {
      const db = seed({ visits: [visit(state)] });
      const { status, json } = await patch(db, head, 'A', body);
      assert.equal(status, 409, state);
      assert.deepEqual(json, { error: holdText('SV-26100007') }, state);
      assert.deepEqual(dataWrites(db), [], state);
      assert.equal(rowOf(db, 'A').status, 'ok');
      // ไม่อ่านอะไรเพิ่มจากงวด S1 — ใบถูกอ่านครั้งเดียว (ด่านล็อก)
      assert.equal(db.calls.filter((c) => c.table === 'dept_requests').length, 1, state);
      assert.equal(db.calls.some((c) => c.table === 'entity_updates'), false, state);
    }
  }
});

test('🔴 สวิตช์ปิด: แถวที่ถูกตัดอยู่แล้ว + `flip` = เดินทางเดิม (ไม่เข้าทางทำต่อให้จบ) — ไม่มีคำสั่งลงนัดหรือใบ', async () => {
  const db = seed({ zones: afterOwnWrite() });
  const { status, json } = await confirm(db);
  assert.equal(status, 200, json.error);
  assert.equal('flip' in json, false);
  assert.deepEqual(writeLog(db), ['service_survey_zones:own-row']);
  assert.equal(visitOf(db).status, 'scheduled');
});

/* ══ สวิตช์เปิด · ยังไม่ยืนยัน ═════════════════════════════════════════════════════════════ */

test('⭐ สวิตช์เปิด · ไม่ส่ง `flip`: 409 ประโยคเดิม + code + เนื้อของกล่องยืนยันจากแผน · ไม่เขียนอะไรเลย', async () => {
  on();
  for (const state of ['scheduled', 'draft']) {
    const db = seed({ visits: [visit(state)] });
    const { status, json } = await cut(db, head);
    assert.equal(status, 409, state);
    assert.deepEqual(json, {
      // แท็บเก่าอ่านประโยคนี้แล้วยังไปต่อได้ (ทางออกเดิมยังจริง) · จอรุ่นใหม่เปิดกล่องจาก `code`
      error: holdText('SV-26100007'),
      code: 'survey_flip_confirm',
      flip: {
        lines: [
          'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — ใบออกจากคิวของผู้วางคิว · หัวหน้ารับปากส่งผล 15/10/2026',
          'นัด SV-26100007 วันที่ 13/10/2026 ของ ช่างเอ จะถูกยกเลิก — งานหายจากงานของช่าง และช่างได้รับแจ้ง',
        ],
        needs: { reason: true, resultDate: true },
        // วันตั้งต้นของกล่อง = วันส่งผลที่ใบถืออยู่
        defaults: { reason: '', resultDate: '2026-10-15' },
        confirmLabel: 'ตัดพื้นที่และยกเลิกนัด',
        visit: { id: 'V1', code: 'SV-26100007' },
      },
    }, state);
    assert.deepEqual(dataWrites(db), [], state);
    assert.equal(rowOf(db, 'A').status, 'ok', state);
    assert.equal(visitOf(db).status, state);
  }

  // ใบที่ยังไม่มีวันส่งผล: ไม่มีท่อน "รับปากส่งผล" และช่องวันว่าง · นัดที่ยังไม่ได้รหัส = id ของนัด
  const bare = seed({ req: { committedResultDate: null }, visits: [visit('draft', { code: null })] });
  const { json } = await cut(bare, head);
  assert.equal(json.error, holdText('V1'));
  assert.equal(json.flip.lines[0], 'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — ใบออกจากคิวของผู้วางคิว');
  assert.equal(json.flip.lines[1], 'นัด V1 วันที่ 13/10/2026 ของ ช่างเอ จะถูกยกเลิก — งานหายจากงานของช่าง และช่างได้รับแจ้ง');
  assert.deepEqual(json.flip.defaults, { reason: '', resultDate: '' });
  assert.deepEqual(json.flip.visit, { id: 'V1', code: null });
  assert.deepEqual(dataWrites(bare), []);
});

test('สวิตช์เปิด · ไม่ส่ง `flip`: เรื่องที่ส่งกลับให้ช่างแก้ค้างอยู่ ขึ้นเป็นบรรทัดของกล่อง (ใบออกจากมือช่างแล้ว)', async () => {
  on();
  const db = seed({
    extra: {
      entity_updates: [{
        id: 'EUP-SB', entityType: 'dept_request', entityId: 'REQ1', kind: 'send_back', body: 'ขอรูปเพิ่ม',
        meta: { note: 'ขอรูปเพิ่ม', items: ['ภาพกว้างของล็อบบี้', 'ขนาดห้องประชุม'] }, createdAt: T0,
      }],
    },
  });
  const { json } = await cut(db, head);
  assert.equal(json.code, 'survey_flip_confirm');
  assert.equal(json.flip.lines.length, 3);
  assert.match(json.flip.lines[2], /^เรื่องที่ส่งกลับให้ช่างแก้.* ถูกปิดไปด้วย$/);
  assert.deepEqual(dataWrites(db), []);
});

test('🔴 สวิตช์เปิด: ช่างและผู้จัดคิวยังได้ 403 เดิม — ส่ง `flip` มาด้วยก็ไม่ถูกอ่าน · ไม่เขียนอะไร', async () => {
  on();
  for (const user of [tech, planner]) {
    for (const body of [cutBody(), confirmBody()]) {
      const db = seed();
      const { status, json } = await patch(db, user, 'A', body);
      assert.equal(status, 403, user.id);
      assert.deepEqual(json, { error: LAST_ONSITE_CUT_CREW }, user.id);
      assert.deepEqual(dataWrites(db), [], user.id);
      assert.equal(visitOf(db).status, 'scheduled');
    }
  }
});

/* ══ สวิตช์เปิด · ยืนยันแล้ว ═══════════════════════════════════════════════════════════════ */

test('⭐ ยืนยัน: ตัดแถว → ยกเลิกนัด + บรรทัดบนนัด → แถวที่ตัดไว้ก่อนตามไป → วันส่งผล + แตะปิดท้าย → บรรทัดเธรดของใบ → audit', async () => {
  on();
  const db = seed();
  const { status, json } = await confirm(db, {}, { baseUpdatedAt: T0 });
  await settle();
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.flip, { visitAction: 'cancel' });
  assert.equal(json.id, 'A');
  assert.equal(json.status, 'cut');
  assert.equal(json.method, 'drawing');
  assert.deepEqual(writeLog(db), FULL_RUN);

  const [own, touch, cancel, line, marks, dates, thread] = dataWrites(db);
  // ① แถวของตัวเองก่อน — คำสั่งเดิมของงวด S1 (ผูกกับรุ่นของแถว · พก method ไปในคำสั่งเดียวกับการตัด)
  assert.deepEqual(own.filters, [['eq', 'id', 'A'], ['eq', 'updatedAt', T0]]);
  assert.deepEqual(Object.keys(own.payload), ['status', 'cutReason', 'method', 'surveyedAt', 'surveyedById', 'surveyedByName', 'updatedAt']);
  assert.deepEqual(Object.keys(touch.payload), ['updatedAt']);
  // จองใบด้วยรุ่นที่เส้นนี้อ่านไว้ตอนสร้างแผน — อีกคนแก้ใบแทรก = จองไม่ติด (ไปทางกดยืนยันซ้ำ)
  assert.deepEqual(touch.filters, [['eq', 'id', 'REQ1'], ['is', 'answeredAt', null], ['eq', 'updatedAt', T0]]);
  // ② ยกเลิกเฉพาะนัดที่ยังร่าง / ลงตาราง ของใบนี้
  assert.equal(cancel.payload.status, 'cancelled');
  assert.deepEqual(cancel.filters, [['eq', 'id', 'V1'], ['eq', 'requestId', 'REQ1'], ['in', 'status', ['draft', 'scheduled']]]);
  assert.equal(line.payload.body, CUT_SENTENCE);
  assert.deepEqual(line.payload.meta, { methodKey: KEY });
  // ③ แถวที่ตัดไว้ก่อน (C) — ระบุรายแถว ไม่แตะแถวที่เพิ่งตัด
  assert.deepEqual(marks.filters, [['eq', 'requestId', 'REQ1'], ['eq', 'status', 'cut'], ['in', 'id', ['C']]]);
  assert.deepEqual(Object.keys(marks.payload), ['method', 'updatedAt']);
  // ④ วันบนใบ = รับปากวันส่งผลของหัวหน้าที่กด + แตะปิดท้ายด้วยเวลาที่ต่างจากการแตะครั้งแรก
  const { updatedAt: closing, ...datePatch } = dates.payload;
  assert.deepEqual(datePatch, surveyDeskCommitPatch({ date: DATE, user: head, nowIso: datePatch.dueCommittedAt }));
  assert.notEqual(closing, touch.payload.updatedAt);
  // ⑤ บรรทัดเธรดของใบ — ตัวที่แจ้งฝ่ายขาย
  assert.equal(thread.payload.body, `${CUT_SENTENCE}${CANCEL_TAIL}${RESULT_TAIL}`);
  assert.deepEqual(thread.payload.meta, {
    key: KEY, kind: 'cut', flip: 'to-desk', toDrawing: [], toOnsite: [], cancelledVisitId: 'V1', resultDate: DATE,
  });

  assert.deepEqual(finalState(db), {
    zones: [
      { id: 'A', status: 'cut', method: 'drawing', cutReason: CUT_REASON },
      { id: 'B', status: 'ok', method: 'drawing', cutReason: null },
      { id: 'C', status: 'cut', method: 'drawing', cutReason: 'ซ้ำกับพื้นที่อื่นของใบ' },
    ],
    visits: [{ id: 'V1', status: 'cancelled' }],
    request: { ...DESK_DATES, answeredAt: null },
    thread: [{ body: `${CUT_SENTENCE}${CANCEL_TAIL}${RESULT_TAIL}`, key: KEY, kind: 'cut', flip: 'to-desk', resultDate: DATE }],
    visitLines: [{ body: CUT_SENTENCE, key: KEY }],
    // ช่างบนนัด (คนไป + ผู้ช่วย) ได้กระดิ่งเดียวต่อคน — ชี้ไปจอของฝ่ายบริการ ไม่ใช่หน้าคำร้อง
    crewBells: [
      { userId: 'U-MATE', title: CREW_BELL_TITLE, updateId: `survey-method:REQ1:${KEY}`, href: '/service/surveys/REQ1' },
      { userId: 'U-TECH', title: CREW_BELL_TITLE, updateId: `survey-method:REQ1:${KEY}`, href: '/service/surveys/REQ1' },
    ],
    // หัวหน้าคนอื่น (ไม่ใช่คนกด) รู้ว่าใบรอประเมินจากแบบ
    headBells: [{ userId: 'U-AUD', title: HEAD_BELL_TITLE, updateId: `survey-desk-ready:REQ1:${KEY}` }],
  });
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false);
  assert.equal(bellCalls(db, CREW_KIND).length, 1);
  assert.deepEqual(audits(db), [
    `service_visit: ยกเลิกนัดประเมิน SV-26100007 — ${CUT_SENTENCE}`,
    `dept_request: RQ-AS-26100001 · ${CUT_SENTENCE}${CANCEL_TAIL}${RESULT_TAIL}`,
    'service_survey_zone: บันทึกผลวัด พื้นที่ A (ตัดออก)',
  ]);
});

test('🔴 ยืนยัน: เลขการกดไม่มี / ผิดรูป = 400 · วันส่งผลไม่มี / ผิดรูป = 400 · นัดที่กล่องบอกไม่ใช่นัดที่ขวางอยู่ = 409 — ทุกเคสไม่เขียนอะไร', async () => {
  on();
  const cases = [
    ['ไม่มีเลขการกด', { actionId: undefined }, 400, BAD_BODY],
    ['เลขการกดสั้นเกิน', { actionId: 'abc' }, 400, BAD_BODY],
    ['เลขการกดมีช่องว่าง', { actionId: 'abcd efgh ijkl' }, 400, BAD_BODY],
    ['เลขการกดไม่ใช่สตริง', { actionId: 12345678 }, 400, BAD_BODY],
    ['ไม่มีวันส่งผล', { committedResultDate: undefined }, 400, 'ต้องระบุวันที่จะส่งผลประเมิน'],
    ['วันส่งผลว่าง', { committedResultDate: '' }, 400, 'ต้องระบุวันที่จะส่งผลประเมิน'],
    ['วันส่งผลผิดรูป', { committedResultDate: '16/10/2026' }, 400, 'วันที่จะส่งผลประเมินไม่ถูกต้อง'],
    ['นัดคนละตัว', { cancelVisitId: 'V9' }, 409, STALE],
    ['ไม่บอกนัด', { cancelVisitId: undefined }, 409, STALE],
    ['นัดเป็น null', { cancelVisitId: null }, 409, STALE],
    // ลำดับของด่าน: เลขการกด → วัน → นัด
    ['ผิดทั้งสาม', { actionId: '', committedResultDate: 'x', cancelVisitId: 'V9' }, 400, BAD_BODY],
    ['วันผิด + นัดผิด', { committedResultDate: 'x', cancelVisitId: 'V9' }, 400, 'วันที่จะส่งผลประเมินไม่ถูกต้อง'],
  ];
  for (const [name, flip, code, error] of cases) {
    const db = seed();
    const { status, json } = await confirm(db, flip);
    assert.equal(status, code, name);
    assert.deepEqual(json, { error }, name);
    assert.deepEqual(dataWrites(db), [], name);
    assert.equal(rowOf(db, 'A').status, 'ok', name);
    assert.equal(visitOf(db).status, 'scheduled', name);
  }
  // `flip` ที่ไม่ใช่ออบเจ็กต์ = ไม่ได้ส่ง ⇒ ได้เนื้อของกล่องยืนยัน ไม่ใช่การลงมือ
  for (const flip of ['yes', true, 1, [flipOf()]]) {
    const db = seed();
    const { status, json } = await patch(db, head, 'A', cutBody({ flip }));
    assert.equal(status, 409, JSON.stringify(flip));
    assert.equal(json.code, 'survey_flip_confirm', JSON.stringify(flip));
    assert.deepEqual(dataWrites(db), []);
  }
});

test('🔴 ยืนยัน แต่แถวของตัวเองเขียนไม่ติด (อีกคนบันทึกแทรก): 409 ชนรุ่นตัวเดิม · นัดไม่ถูกยกเลิก · ใบไม่ถูกแตะ', async () => {
  on();
  const hook = (q, api) => {
    if (q.table === 'service_survey_zones' && q.write === 'update' && q.filters.some(([, col, val]) => col === 'id' && val === 'A')) {
      api.tables.service_survey_zones.find((r) => r.id === 'A').updatedAt = '2026-10-01T00:00:05.000Z';
    }
    return undefined;
  };
  const db = seed({ hook });
  const { status, json } = await confirm(db);
  await settle();
  assert.equal(status, 409);
  assert.equal(json.code, 'zone_stale');
  assert.equal(json.zone.id, 'A');
  assert.deepEqual(writeLog(db), ['service_survey_zones:own-row'], 'มีแต่คำสั่งตัดที่ไม่ติดแถว');
  assert.equal(rowOf(db, 'A').status, 'ok');
  assert.equal(rowOf(db, 'C').method, undefined);
  assert.equal(visitOf(db).status, 'scheduled');
  assert.equal(reqOf(db).updatedAt, T0);
  assert.deepEqual(updates(db), []);
  assert.deepEqual(bells(db, CREW_KIND), []);
});

test('ยืนยัน แต่ใบถูกส่งผลไประหว่างทาง: แถวถูกตัดแล้ว · คำตอบคือประโยค "ส่งผลไปแล้ว" ตรง ๆ (ไม่มี code ให้กดซ้ำ — ไม่มีอะไรให้ทำต่อ)', async () => {
  on();
  const hook = (q, api) => {
    if (q.table === 'service_survey_zones' && q.write === 'update' && q.filters.some(([, col, val]) => col === 'id' && val === 'A')) {
      api.tables.dept_requests[0].answeredAt = '2026-10-09T03:00:00.000Z';
    }
    return undefined;
  };
  const db = seed({ hook });
  const { status, json } = await confirm(db);
  assert.equal(status, 409);
  assert.deepEqual(json, { error: SENT });
  assert.equal(rowOf(db, 'A').status, 'cut');
  assert.equal(visitOf(db).status, 'scheduled', 'นัดไม่ถูกยกเลิก — การส่งผลจัดการนัดของมันเอง');
  assert.deepEqual(threadRows(db), []);
  assert.deepEqual(audits(db), ['service_survey_zone: บันทึกผลวัด พื้นที่ A (ตัดออก)'], 'การตัดเกิดขึ้นจริง ต้องมี audit');
});

/* ══ พังรายขั้น แล้วกดยืนยันซ้ำด้วย body เดิม ═══════════════════════════════════════════════ */

/* ตัวจับคำสั่งของตัวเขียน (สเปค §4.4) — แต่ละตัวทำให้คำสั่งนั้น **ครั้งแรกที่เจอ** ตอบ error แบบ PostgREST แล้วปล่อยครั้งถัดไป */
const failOnce = (match) => {
  let fired = false;
  let touched = false;
  return (q) => {
    if (q.table === 'dept_requests' && q.write === 'update') touched = true;
    if (fired || !match(q, { touched })) return undefined;
    fired = true;
    q.failed = true;
    return { data: null, error: { message: 'ฐานล่มชั่วคราว', code: '57014' } };
  };
};
const isKeyRead = (q) => q.table === 'entity_updates' && !q.write && q.filters.some(([, col, val]) => col === 'kind' && val === 'method');
// ตัวจับ "ครั้งที่ n ที่เจอ" — การอ่านกันซ้ำมีสองครั้งต่อรอบ (หลังจองใบ · ก่อนเขียนเธรด)
const nth = (match, n) => { let seen = 0; return (q, ctx) => match(q, ctx) && ++seen === n; };
const STEPS = {
  '1 แตะใบ': (q) => q.table === 'dept_requests' && q.write === 'update' && !('committedResultDate' in q.payload),
  '1 อ่านกันซ้ำหลังจองใบ': nth(isKeyRead, 1),
  // การอ่านใบครั้งแรกหลังแตะ = ตัวถามซ้ำว่า "ยังไม่ส่งผล" ก่อนยกเลิกนัด
  '2 ถามซ้ำก่อนยกเลิกนัด': (q, { touched }) => touched && q.table === 'dept_requests' && !q.write,
  '2 ยกเลิกนัด': (q) => q.table === 'service_visits' && q.write === 'update',
  '3c แถวที่ตัดไว้ก่อน': (q) => q.table === 'service_survey_zones' && q.write === 'update' && q.filters.some(([, col]) => col === 'requestId'),
  '4 วันบนใบ': (q) => q.table === 'dept_requests' && q.write === 'update' && 'committedResultDate' in q.payload,
  '5 อ่านกันซ้ำ': nth(isKeyRead, 2),
  '5 บรรทัดเธรดของใบ': (q) => q.table === 'entity_updates' && q.write === 'insert' && q.payload.entityType === 'dept_request',
};
/* จำนวนคำสั่งเขียนที่รอบแรกทำสำเร็จก่อนถึงขั้นที่พัง (นับตาม `FULL_RUN`) */
const WRITTEN_BEFORE = {
  '1 แตะใบ': 1,
  '1 อ่านกันซ้ำหลังจองใบ': 2,
  '2 ถามซ้ำก่อนยกเลิกนัด': 2,
  '2 ยกเลิกนัด': 2,
  '3c แถวที่ตัดไว้ก่อน': 4,
  '4 วันบนใบ': 5,
  '5 อ่านกันซ้ำ': 6,
  '5 บรรทัดเธรดของใบ': 6,
};

let cleanRun = null;
async function cleanState() {
  if (cleanRun) return cleanRun;
  on();
  const db = seed();
  assert.equal((await confirm(db)).status, 200);
  await settle();
  cleanRun = finalState(db);
  return cleanRun;
}

for (const [step, match] of Object.entries(STEPS)) {
  test(`🔴 พังที่ขั้น "${step}" → ตอบให้กดยืนยันอีกครั้ง → กด body เดิมซ้ำ = จบที่สภาพเดียวกับรอบที่ไม่พัง · เธรดหนึ่งบรรทัด · กระดิ่งชุดเดียว`, async () => {
    const expected = await cleanState();
    on();
    const db = seed({ hook: failOnce(match) });
    const first = await confirm(db, {}, { baseUpdatedAt: T0 });
    await settle();
    // (ก) คำตอบของรอบแรก — แถวถูกตัดแล้ว ผลที่ตามมายังไม่ครบ
    assert.equal(first.status, 409, step);
    assert.deepEqual(first.json, { error: RETRY, code: 'survey_flip_retry' }, step);
    assert.equal(rowOf(db, 'A').status, 'cut', step);
    // (ข) ที่เขียนสำเร็จไปคือขั้นก่อนหน้าเท่านั้น
    assert.deepEqual(writeLog(db), FULL_RUN.slice(0, WRITTEN_BEFORE[step]), step);
    assert.deepEqual(threadRows(db), [], `${step}: ยังไม่มีบรรทัดถึงฝ่ายขาย`);
    assert.deepEqual(bells(db, CREW_KIND), [], `${step}: กระดิ่งยิงหลังบรรทัดเธรดเท่านั้น`);

    // (ค) กดยืนยันซ้ำด้วย body เดิมทุกตัว (รุ่นของแถวที่จอถืออยู่เก่าไปแล้ว — ต้องไม่โดนตอบว่าชนรุ่น)
    const mark = db.calls.length;
    const second = await confirm(db, {}, { baseUpdatedAt: T0 });
    await settle();
    assert.equal(second.status, 200, `${step}: ${second.json.error}`);
    assert.deepEqual(second.json.flip, { visitAction: 'cancel' }, step);
    assert.equal(writeLog(db, mark).includes('service_survey_zones:own-row'), false, `${step}: ทางทำต่อให้จบไม่เขียนแถวซ้ำ`);
    assert.deepEqual(finalState(db), expected, step);
    // (ง) ตลอดสองรอบ: บรรทัดเธรดของใบหนึ่งบรรทัด · บรรทัดยกเลิกบนนัดหนึ่งบรรทัด · กระดิ่งช่างยิงครั้งเดียว
    assert.equal(threadRows(db).length, 1, step);
    assert.equal(visitLines(db).length, 1, step);
    assert.equal(bellCalls(db, CREW_KIND).length, 1, step);
    assert.equal(bellCalls(db, HEAD_KIND).length, 1, step);
    assert.equal(db.writes('service_visits').filter((c) => !c.failed).length, 1, `${step}: นัดถูกยกเลิกครั้งเดียว`);
  });
}

test('🔴 พังที่บรรทัดยกเลิกบนเธรดของนัด (นัดถูกยกเลิกแล้วแต่ไม่มีหลักฐาน): กดซ้ำยังจบได้ — นัดเป็นแค่ประวัติ ไม่อ้างว่าการกดนี้ยกเลิก', async () => {
  /* สภาพค้างที่สเปคยอมรับ (§4.6): สองคำสั่งติดกัน คำสั่งที่สองพัง ⇒ ช่างไม่ได้กระดิ่ง · ทางทำต่อให้จบต้องไม่ตัน และต้องไม่พูดเกินจริง */
  on();
  const db = seed({
    hook: failOnce((q) => q.table === 'entity_updates' && q.write === 'insert' && q.payload.entityType === 'service_visit'),
  });
  const first = await confirm(db);
  assert.deepEqual(first.json, { error: RETRY, code: 'survey_flip_retry' });
  assert.equal(visitOf(db).status, 'cancelled');
  assert.deepEqual(visitLines(db), []);

  const second = await confirm(db);
  await settle();
  assert.equal(second.status, 200, second.json.error);
  assert.deepEqual(second.json.flip, { visitAction: 'history' });
  assert.equal(threadRows(db).length, 1);
  assert.equal(threadRows(db)[0].body, `${CUT_SENTENCE}${RESULT_TAIL}`, 'ไม่มีท่อน "ยกเลิกนัด" — พิสูจน์ไม่ได้ว่าการกดนี้เป็นคนยกเลิก');
  assert.deepEqual(bells(db, CREW_KIND), []);
  assert.deepEqual(pick(reqOf(db), Object.keys(DESK_DATES)), DESK_DATES);
  assert.equal(rowOf(db, 'C').method, 'drawing');
});

/* ══ ทางทำต่อให้จบ — ทุกเคสเริ่มจาก "แถวถูกตัดแล้ว + เป็นจากแบบ + เหตุผลเดียวกัน" ═══════════════════ */

test('(ก)(ข) กดซ้ำ = "การกดนี้ตัดไปแล้ว" ไม่ใช่ 409 · วันบนใบ = รับปากวันส่งผลตามที่พิมพ์ · เธรดลงท้ายด้วยวันส่งผล', async () => {
  on();
  const db = seed({ zones: afterOwnWrite() });
  // รุ่นของแถวที่จอถืออยู่ (T0) เก่ากว่าแถวจริง (T1) — ทางนี้ไม่ถามรุ่น
  const { status, json } = await confirm(db, {}, { baseUpdatedAt: T0 });
  await settle();
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.flip, { visitAction: 'cancel' });
  assert.equal(json.id, 'A');
  assert.equal(json.status, 'cut');
  assert.deepEqual(writeLog(db), FULL_RUN.slice(1), 'ทุกขั้นหลังแถวของตัวเอง — แถวไม่ถูกเขียนซ้ำ');
  assert.equal(rowOf(db, 'A').updatedAt, T1, 'แถวที่ตัดแล้วไม่ถูกแตะ');

  const dates = dataWrites(db).find((c) => label(c) === 'dept_requests:dates');
  const { updatedAt: _closing, ...datePatch } = dates.payload;
  assert.deepEqual(datePatch, surveyDeskCommitPatch({ date: DATE, user: head, nowIso: datePatch.dueCommittedAt }));
  assert.ok(threadRows(db)[0].body.endsWith(RESULT_TAIL), threadRows(db)[0].body);
  assert.equal(threadRows(db)[0].body, `${CUT_SENTENCE}${CANCEL_TAIL}${RESULT_TAIL}`);
});

test('(ค) รอบแรกยกเลิกนัดไปแล้ว: กดซ้ำไม่เจอนัดเปิด → อ่านนัดที่กล่องบอก → พิสูจน์จากบรรทัดบนนัด → เธรดยังเล่าว่ายกเลิกนัด · กระดิ่งช่างหนึ่งชุด · ไม่มีบรรทัดบนนัดซ้ำ', async () => {
  on();
  const db = seed({
    zones: afterOwnWrite(),
    visits: [visit('cancelled')],
    extra: {
      entity_updates: [{
        id: 'EUP-V', entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: CUT_SENTENCE,
        meta: { methodKey: KEY }, createdAt: T1,
      }],
    },
  });
  const { status, json } = await confirm(db);
  await settle();
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.flip, { visitAction: 'cancel' });
  assert.equal(threadRows(db)[0].body, `${CUT_SENTENCE}${CANCEL_TAIL}${RESULT_TAIL}`);
  assert.equal(threadRows(db)[0].body.includes('undefined'), false);
  assert.equal(threadRows(db)[0].meta.cancelledVisitId, 'V1');
  assert.equal(visitLines(db).length, 1, 'ไม่มีบรรทัดยกเลิกบนนัดบรรทัดที่สอง');
  assert.deepEqual(db.writes('service_visits'), [], 'ไม่มีอะไรเหลือให้ยกเลิก');
  assert.deepEqual(bells(db, CREW_KIND).map((n) => n.userId).sort(), ['U-MATE', 'U-TECH']);
  assert.equal(bellCalls(db, CREW_KIND).length, 1);

  // นัดที่ถูกยกเลิกโดยการกดครั้งอื่น (กุญแจไม่ตรง) = ประวัติ — ไม่อ้างว่าการกดนี้ยกเลิก ไม่เด้งช่าง
  const other = seed({
    zones: afterOwnWrite(),
    visits: [visit('cancelled')],
    extra: {
      entity_updates: [{
        id: 'EUP-V', entityType: 'service_visit', entityId: 'V1', kind: 'cancel', body: 'ยกเลิกนัด',
        meta: { methodKey: 'U-OTHER|zzzzzzzz' }, createdAt: T1,
      }],
    },
  });
  const plain = await confirm(other);
  await settle();
  assert.equal(plain.status, 200, plain.json.error);
  assert.deepEqual(plain.json.flip, { visitAction: 'history' });
  assert.equal(threadRows(other)[0].body, `${CUT_SENTENCE}${RESULT_TAIL}`);
  assert.deepEqual(bells(other, CREW_KIND), []);
});

test('(ง) ช่างกดเริ่มงานระหว่าง "ตัดติด" กับ "ยกเลิกนัด": รอบแรกให้กดซ้ำ · รอบสองจบโดยไม่ยกเลิกนัด — นัดไม่ถูกแตะ วันกับเธรดถูกเขียน', async () => {
  on();
  let started = false;
  const hook = (q, api) => {
    // ช่างกดเริ่มงานทันทีหลังการแตะใบของตัวเขียน (ก่อนคำสั่งยกเลิกนัด)
    if (!started && q.table === 'service_visits' && q.write === 'update') {
      started = true;
      api.tables.service_visits[0].status = 'in_progress';
    }
    return undefined;
  };
  const db = seed({ hook });
  const first = await confirm(db);
  await settle();
  assert.equal(first.status, 409);
  assert.deepEqual(first.json, { error: RETRY, code: 'survey_flip_retry' });
  assert.equal(visitOf(db).status, 'in_progress');
  assert.equal(rowOf(db, 'A').status, 'cut');
  assert.deepEqual(threadRows(db), []);
  assert.deepEqual(visitLines(db), []);

  const mark = db.calls.length;
  const second = await confirm(db);
  await settle();
  assert.equal(second.status, 200, second.json.error);
  assert.deepEqual(second.json.flip, { visitAction: 'keep-open' });
  assert.equal(visitOf(db).status, 'in_progress', 'นัดที่ช่างเริ่มแล้วไม่ถูกยกเลิก');
  assert.deepEqual(db.calls.slice(mark).filter((c) => c.table === 'service_visits' && c.write), []);
  assert.deepEqual(writeLog(db, mark), [
    'dept_requests:touch', 'service_survey_zones:cut-marks', 'dept_requests:dates', 'entity_updates:dept_request:method',
  ]);
  assert.deepEqual(pick(reqOf(db), Object.keys(DESK_DATES)), DESK_DATES);
  assert.equal(threadRows(db).length, 1);
  assert.equal(threadRows(db)[0].body, `${CUT_SENTENCE}${RESULT_TAIL}`, 'ไม่มีท่อน "ยกเลิกนัด" — นัดไม่ได้ถูกยกเลิก');
  assert.equal(threadRows(db)[0].meta.cancelledVisitId, null);
  assert.deepEqual(visitLines(db), []);
  assert.deepEqual(bells(db, HEAD_KIND).map((n) => n.userId), ['U-AUD']);
});

test('🔴 กดยืนยันครั้งแรก แต่นัดที่กล่องบอกไม่ได้ขวางอยู่แล้ว (ช่างกดเริ่มงาน · นัดถูกปิด / ยกเลิก · ไม่มีนัด): 409 ล้าสมัย — ไม่ตัด ไม่เขียนอะไรเลย', async () => {
  /* ช่วงระหว่าง "เปิดกล่อง" กับ "กดยืนยัน": ด่านนัดไม่ตีกลับแล้ว (สภาพ ①) ⇒ เดิมกิ่งนี้ตกเป็นการตัดธรรมดาที่ตอบ 200
     ทั้งที่วันส่งผล บรรทัดเธรด และกระดิ่งที่กล่องสัญญาไว้ไม่ได้เกิด */
  on();
  for (const visits of [[visit('in_progress')], [visit('done')], [visit('cancelled')], []]) {
    const db = seed({ visits });
    const { status, json } = await confirm(db, {}, { baseUpdatedAt: T0 });
    await settle();
    const at = visits[0]?.status || 'ไม่มีนัด';
    assert.equal(status, 409, at);
    assert.deepEqual(json, { error: STALE }, at);
    assert.equal(rowOf(db, 'A').status, 'ok', `${at}: แถวต้องยังไม่ถูกตัด`);
    assert.deepEqual(writeLog(db), [], at);
    assert.deepEqual(threadRows(db), [], at);
    assert.deepEqual(audits(db), [], at);
    assert.deepEqual(db.tables.notifications || [], [], at);
  }
  // โหลดใหม่แล้วตัดโดยไม่มีคำยืนยัน = การตัดธรรมดาของสภาพ ① เดินได้ตามเดิม (นัดกำลังทำ)
  const again = seed({ visits: [visit('in_progress')] });
  const plain = await cut(again, head, 'A', { baseUpdatedAt: T0 });
  assert.equal(plain.status, 200, plain.json.error);
  assert.equal(rowOf(again, 'A').status, 'cut');
});

test('🔴 กดยืนยัน แต่การตัดนี้ไม่พลิกใบแล้ว (อีกคนสลับพื้นที่อื่นกลับเป็นลงหน้างาน): 409 ล้าสมัย · ไม่เขียนอะไร — สวิตช์ปิด `flip` ไม่ถูกอ่านตามเดิม', async () => {
  on();
  const sheet = () => [zone('A'), zone('B', { sortOrder: 2 }), cutRow('C', { sortOrder: 3 })];
  const db = seed({ zones: sheet() });
  const { status, json } = await confirm(db, {}, { baseUpdatedAt: T0 });
  assert.equal(status, 409);
  assert.deepEqual(json, { error: STALE });
  assert.equal(rowOf(db, 'A').status, 'ok');
  assert.deepEqual(writeLog(db), []);

  // สวิตช์ปิด: กล่องยืนยันไม่มีอยู่ — `flip` ที่ติดมาใน body ไม่มีผล การตัดที่ไม่พลิกใบเดินตามเดิม
  off();
  const offDb = seed({ zones: sheet() });
  const plain = await confirm(offDb, {}, { baseUpdatedAt: T0 });
  assert.equal(plain.status, 200, plain.json.error);
  assert.equal(rowOf(offDb, 'A').status, 'cut');
  assert.deepEqual(writeLog(offDb), ['service_survey_zones:own-row']);
});

test('🔴 จองใบไม่ติด (ใบถูกแก้ระหว่างสร้างแผนกับเขียน): รอบแรกให้กดยืนยันซ้ำ · รอบสองอ่านใบใหม่แล้วจบได้', async () => {
  on();
  let bumped = false;
  // อีกคนแก้ใบ (เช่นเลื่อนวัน) ทันทีหลังแถวของการตัดถูกเขียน — ก่อนตัวเขียนจองใบ
  const hook = (q, api) => {
    if (!bumped && q.table === 'dept_requests' && q.write === 'update') {
      bumped = true;
      api.tables.dept_requests[0].updatedAt = T1;
    }
    return undefined;
  };
  const db = seed({ hook });
  const first = await confirm(db, {}, { baseUpdatedAt: T0 });
  await settle();
  assert.deepEqual(first.json, { error: RETRY, code: 'survey_flip_retry' });
  // คำสั่งจองถูกส่งแต่ไม่โดนแถว (รุ่นไม่ตรง) — ไม่มีคำสั่งไหนตามมา
  assert.deepEqual(writeLog(db), ['service_survey_zones:own-row', 'dept_requests:touch']);
  assert.equal(reqOf(db).updatedAt, T1, 'จองไม่ติด = ใบไม่ถูกแตะ');
  assert.equal(visitOf(db).status, 'scheduled');

  const second = await confirm(db, {}, { baseUpdatedAt: T0 });
  await settle();
  assert.equal(second.status, 200, second.json.error);
  assert.deepEqual(second.json.flip, { visitAction: 'cancel' });
  assert.equal(visitOf(db).status, 'cancelled');
  assert.equal(threadRows(db).length, 1);
});

test('(จ) นัดที่กล่องบอกปิดไปแล้วแบบอื่น (เข้าแล้ว · ทำไม่ครบ · เข้าไม่ได้ · เลื่อนแล้ว) = จบแบบประวัติ', async () => {
  on();
  for (const status of ['done', 'partial', 'unable', 'rescheduled']) {
    const db = seed({ zones: afterOwnWrite(), visits: [visit(status)] });
    const res = await confirm(db);
    await settle();
    assert.equal(res.status, 200, `${status}: ${res.json.error}`);
    assert.deepEqual(res.json.flip, { visitAction: 'history' }, status);
    assert.equal(visitOf(db).status, status, status);
    assert.deepEqual(db.writes('service_visits'), [], status);
    assert.equal(threadRows(db)[0].body, `${CUT_SENTENCE}${RESULT_TAIL}`, status);
    assert.deepEqual(pick(reqOf(db), Object.keys(DESK_DATES)), DESK_DATES, status);
    assert.deepEqual(bells(db, CREW_KIND), [], status);
  }
});

test('🔴 (ฉ)(ช) มีนัดเปิดตัวอื่น · นัดที่กล่องบอกเป็นของใบอื่น / ไม่มีจริง / ไม่ได้บอก = 409 · ไม่เขียนอะไรเลย', async () => {
  on();
  const cases = [
    ['มีคนลงนัดใหม่ระหว่างทาง', [visit('cancelled'), visit('scheduled', { id: 'V2', code: 'SV-26100009' })], {}],
    ['นัดเปิดตัวเดิมแต่กล่องบอกอีกตัว', [visit('scheduled')], { cancelVisitId: 'V9' }],
    ['นัดของใบอื่น', [visit('cancelled', { requestId: 'REQ-OTHER' })], {}],
    ['นัดที่ไม่มีจริง', [], {}],
    ['ไม่ได้บอกนัด', [visit('cancelled')], { cancelVisitId: null }],
  ];
  for (const [name, visits, flip] of cases) {
    const db = seed({ zones: afterOwnWrite(), visits });
    const { status, json } = await confirm(db, flip);
    await settle();
    assert.equal(status, 409, name);
    assert.deepEqual(json, { error: STALE }, name);
    assert.deepEqual(dataWrites(db), [], name);
    assert.deepEqual(audits(db), [], name);
    assert.equal(rowOf(db, 'C').method, undefined, name);
  }
});

test('🔴 ทางทำต่อให้จบ: อ่านนัดที่กล่องบอก / อ่านหลักฐานบนเธรดของนัด ไม่สำเร็จ = 500 · ไม่เขียนอะไร (ไม่เดาว่า "ใช่" หรือ "ไม่ใช่")', async () => {
  on();
  const boom = { data: null, error: { message: 'เชื่อมต่อฐานข้อมูลไม่ได้' } };
  const visitRead = seed({
    zones: afterOwnWrite(), visits: [visit('cancelled')],
    // การอ่านนัดแบบระบุ id (ตัวหานัดเปิดกรองด้วยสถานะ ไม่ได้กรอง id)
    hook: (q) => (q.table === 'service_visits' && !q.write && q.filters.some(([, col]) => col === 'id') ? boom : undefined),
  });
  const first = await confirm(visitRead);
  assert.equal(first.status, 500);
  assert.deepEqual(first.json, { error: 'เชื่อมต่อฐานข้อมูลไม่ได้' });
  assert.deepEqual(dataWrites(visitRead), []);

  const proofRead = seed({
    zones: afterOwnWrite(), visits: [visit('cancelled')],
    hook: (q) => (q.table === 'entity_updates' && !q.write && q.filters.some(([, col, val]) => col === 'entityType' && val === 'service_visit')
      ? boom : undefined),
  });
  const second = await confirm(proofRead);
  assert.equal(second.status, 500);
  assert.deepEqual(second.json, { error: 'เชื่อมต่อฐานข้อมูลไม่ได้' });
  assert.deepEqual(dataWrites(proofRead), []);
});

test('ทางทำต่อให้จบ: เลขการกด / วันส่งผลผิดรูป = 400 เหมือนรอบแรก · เหตุผลคนละคำ / ใบยังต้องมีนัด = ไม่เข้าทางนี้ (เดินทางเดิม)', async () => {
  on();
  for (const [flip, error] of [[{ actionId: 'x' }, BAD_BODY], [{ committedResultDate: '' }, 'ต้องระบุวันที่จะส่งผลประเมิน']]) {
    const db = seed({ zones: afterOwnWrite() });
    const { status, json } = await confirm(db, flip);
    assert.equal(status, 400);
    assert.deepEqual(json, { error });
    assert.deepEqual(dataWrites(db), []);
  }
  // เหตุผลที่ส่งมาไม่ตรงกับเหตุผลที่แถวถูกตัด = ไม่ใช่การกดซ้ำของการตัดนั้น ⇒ คำสั่งเดิมของงวด S1 (เขียนแถวอย่างเดียว)
  const other = seed({ zones: afterOwnWrite() });
  const changed = await patch(other, head, 'A', confirmBody({}, { cutReason: 'เหตุผลอีกแบบหนึ่ง' }));
  assert.equal(changed.status, 200, changed.json.error);
  assert.equal('flip' in changed.json, false);
  assert.deepEqual(writeLog(other), ['service_survey_zones:own-row']);
  assert.equal(visitOf(other).status, 'scheduled');
  // ใบที่ยังต้องมีนัด (ยังมีพื้นที่ลงหน้างานอื่น) — แถวที่ถูกตัดอยู่ไม่ใช่การตัดที่พลิกใบ
  const needs = seed({ zones: [...afterOwnWrite(), zone('D', { sortOrder: 4 })] });
  const plain = await confirm(needs);
  assert.equal(plain.status, 200, plain.json.error);
  assert.equal('flip' in plain.json, false);
  assert.deepEqual(writeLog(needs), ['service_survey_zones:own-row']);
});

test('กดซ้ำหลังรอบแรกสำเร็จครบแล้ว (คำตอบหายกลางทาง): 200 · ไม่มีบรรทัดเธรด / กระดิ่ง / บรรทัดบนนัด เพิ่ม', async () => {
  on();
  const db = seed();
  assert.equal((await confirm(db)).status, 200);
  await settle();
  const before = finalState(db);
  const again = await confirm(db);
  await settle();
  assert.equal(again.status, 200, again.json.error);
  assert.deepEqual(again.json.flip, { visitAction: 'cancel' });
  assert.deepEqual(finalState(db), before);
  assert.equal(threadRows(db).length, 1);
  assert.equal(visitLines(db).length, 1);
  assert.equal(bellCalls(db, CREW_KIND).length, 1);
  assert.equal(bellCalls(db, HEAD_KIND).length, 1);
});

/* ══ ① คนที่ไม่ใช่หัวหน้าทำให้ใบพลิก (ไม่มีนัดค้าง / นัดกำลังทำ) → กระดิ่งหัวหน้า ═════════════════════════ */

const deskBells = (db) => bells(db, HEAD_KIND).map((n) => pick(n, ['userId', 'title', 'updateId', 'body']));

test('⭐ ช่าง / ผู้จัดคิวตัดจนใบพลิก ①: กระดิ่งถึงหัวหน้าหนึ่งครั้ง กุญแจ cut:{แถว}:{รุ่นหลังตัด} · ไม่มีเธรด ไม่แตะวันบนใบ — สวิตช์เปิดหรือปิดก็ตาม', async () => {
  for (const flag of [off, on]) {
    for (const [user, visits] of [[tech, [visit('in_progress')]], [tech, [visit('done')]], [planner, []]]) {
      flag();
      const db = seed({ visits });
      const { status, json } = await cut(db, user);
      await settle();
      assert.equal(status, 200, json.error);
      assert.equal('flip' in json, false);
      const key = `survey-desk-ready:REQ1:cut:A:${json.updatedAt}`;
      assert.deepEqual(deskBells(db).sort((a, b) => a.userId.localeCompare(b.userId)), [
        { userId: 'U-AUD', title: HEAD_BELL_TITLE, updateId: key, body: 'ประเมินพื้นที่ อาคารทดสอบ' },
        { userId: 'U-HEAD', title: HEAD_BELL_TITLE, updateId: key, body: 'ประเมินพื้นที่ อาคารทดสอบ' },
      ], user.id);
      assert.equal(bellCalls(db, HEAD_KIND).length, 1, user.id);
      assert.equal(rowOf(db, 'A').updatedAt, json.updatedAt);
      // แถว 16 ①: ไม่มีบรรทัดเธรด ไม่แตะวันบนใบ ไม่แตะนัด
      assert.deepEqual(writeLog(db), ['service_survey_zones:own-row', 'service_survey_zones:cut-marks'], user.id);
      assert.deepEqual(updates(db), [], user.id);

      /* คำขอเดิมถูกส่งซ้ำ (เครือข่ายสะดุด): แถวถูกตัดและเป็นจากแบบไปแล้ว = เป็นของหัวหน้า ⇒ คนที่ไม่ใช่หัวหน้าได้ 403 ของงวด S1
         ไม่มีการเขียน ไม่พลิกอีก ไม่มีกระดิ่งเพิ่ม */
      const mark = db.calls.length;
      const retry = await cut(db, user);
      await settle();
      assert.equal(retry.status, 403, user.id);
      assert.deepEqual(retry.json, { error: DRAWING_ZONE_HEAD_ONLY }, user.id);
      assert.deepEqual(dataWrites(db, mark), [], user.id);
      assert.equal(bellCalls(db, HEAD_KIND).length, 1, `${user.id}: ส่งซ้ำไม่เด้งซ้ำ`);
    }
  }
});

test('ใบเดิมพลิกรอบสอง (แถวถูกเอากลับและกลับมาเป็นลงหน้างาน แล้วถูกตัดอีก): กระดิ่งหัวหน้าเด้งอีกรอบด้วยกุญแจใหม่', async () => {
  const db = seed({ visits: [visit('in_progress')] });
  const first = await cut(db, tech);
  await settle();
  assert.equal(first.status, 200, first.json.error);
  // หัวหน้าเอาแถวกลับเข้าใบแล้วสลับกลับเป็นลงหน้างาน (เส้นสลับวิธี) — ใบกลับไปต้องมีนัด
  Object.assign(rowOf(db, 'A'), { status: 'ok', cutReason: null, method: 'onsite', updatedAt: '2026-10-09T05:00:00.000Z' });
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), true);
  const second = await cut(db, tech);
  await settle();
  assert.equal(second.status, 200, second.json.error);
  assert.notEqual(second.json.updatedAt, first.json.updatedAt);
  assert.equal(bellCalls(db, HEAD_KIND).length, 2);
  const keys = [...new Set(deskBells(db).map((n) => n.updateId))].sort();
  assert.deepEqual(keys, [
    `survey-desk-ready:REQ1:cut:A:${first.json.updatedAt}`, `survey-desk-ready:REQ1:cut:A:${second.json.updatedAt}`,
  ].sort());
});

test('🔴 หัวหน้าตัดเองจนใบพลิก ①: ไม่มีกระดิ่ง ไม่อ่านใบเพิ่ม · การตัดที่ไม่พลิกใบ (ใครตัดก็ตาม) ไม่มีกระดิ่ง', async () => {
  for (const flag of [off, on]) {
    flag();
    const own = seed({ visits: [visit('in_progress')] });
    assert.equal((await cut(own, head)).status, 200);
    await settle();
    assert.deepEqual(bells(own, HEAD_KIND), []);
    assert.equal(own.calls.filter((c) => c.table === 'dept_requests').length, 1, 'ใบถูกอ่านครั้งเดียว (ด่านล็อก)');

    // ยังเหลือพื้นที่ลงหน้างานอีกแห่ง = ไม่พลิก
    const still = seed({ zones: [...mixedSheet(), zone('D', { sortOrder: 4 })], visits: [visit('in_progress')] });
    assert.equal((await cut(still, tech)).status, 200);
    await settle();
    assert.deepEqual(bells(still, HEAD_KIND), []);
    assert.equal(still.calls.filter((c) => c.table === 'dept_requests').length, 1);
  }
});

test('กระดิ่งหัวหน้าพลาด (อ่านใบไม่ได้ / โหลดรายชื่อไม่ได้) ไม่ทำให้การตัดที่เขียนติดแล้วตอบ error', async () => {
  let reads = 0;
  const db = seed({
    visits: [visit('in_progress')],
    // การอ่านใบครั้งที่สอง = การอ่านเลขที่ / ชื่องานสำหรับกระดิ่ง
    hook: (q) => {
      if (q.table !== 'dept_requests' || q.write) return undefined;
      reads += 1;
      return reads === 2 ? { data: null, error: { message: 'เชื่อมต่อฐานข้อมูลไม่ได้' } } : undefined;
    },
  });
  const { status, json } = await cut(db, tech);
  await settle();
  assert.equal(status, 200, json.error);
  assert.equal(rowOf(db, 'A').status, 'cut');
  assert.deepEqual(bells(db, HEAD_KIND), []);

  const noDirectory = seed({ visits: [visit('in_progress')] });
  noDirectory.auth.admin.listUsers = async () => { throw new Error('auth ล่ม'); };
  assert.equal((await cut(noDirectory, tech)).status, 200);
  await settle();
  assert.deepEqual(bells(noDirectory, HEAD_KIND), []);
});

/* ══ ลบพื้นที่ (DELETE) ════════════════════════════════════════════════════════════════════ */

// A = พื้นที่ลงหน้างานที่ช่างเพิ่มเอง และเป็นแห่งสุดท้าย · B = จากแบบ · C = ลงหน้างานที่ถูกตัด
const addedLast = () => [zone('A', { status: 'added' }), drawing('B', { sortOrder: 2 }), cutRow('C', { sortOrder: 3 })];

test('⭐ ช่างลบพื้นที่จนใบพลิก ①: กระดิ่งถึงหัวหน้า กุญแจ del:{แถว} · หัวหน้าลบเองไม่มีกระดิ่ง · ลบที่ไม่พลิกไม่มีกระดิ่ง', async () => {
  for (const flag of [off, on]) {
    flag();
    const db = seed({ zones: addedLast(), visits: [visit('in_progress')] });
    const { status, json } = await remove(db, tech, 'A');
    await settle();
    assert.equal(status, 200, json.error);
    assert.deepEqual(json, { id: 'A', zoneDropped: false });
    assert.deepEqual(deskBells(db).sort((a, b) => a.userId.localeCompare(b.userId)), [
      { userId: 'U-AUD', title: HEAD_BELL_TITLE, updateId: 'survey-desk-ready:REQ1:del:A', body: 'ประเมินพื้นที่ อาคารทดสอบ' },
      { userId: 'U-HEAD', title: HEAD_BELL_TITLE, updateId: 'survey-desk-ready:REQ1:del:A', body: 'ประเมินพื้นที่ อาคารทดสอบ' },
    ]);
    assert.equal(bellCalls(db, HEAD_KIND).length, 1);
    assert.deepEqual(updates(db), []);
    assert.equal(db.writes('dept_requests').length, 0);
    assert.equal(db.writes('service_visits').length, 0);

    const own = seed({ zones: addedLast(), visits: [visit('in_progress')] });
    assert.equal((await remove(own, head, 'A')).status, 200);
    await settle();
    assert.deepEqual(bells(own, HEAD_KIND), []);

    const still = seed({ zones: [...addedLast(), zone('D', { sortOrder: 4 })], visits: [visit('in_progress')] });
    assert.equal((await remove(still, tech, 'A')).status, 200);
    await settle();
    assert.deepEqual(bells(still, HEAD_KIND), []);
  }
});

test('🔴 ลบแล้วใบพลิก ② (นัดร่าง / ลงตารางแล้ว): หัวหน้ายังได้ประโยคของงวด S1 ไม่มี code แม้เปิดสวิตช์ — ลบไม่มีกล่องยืนยัน', async () => {
  for (const flag of [off, on]) {
    for (const state of ['scheduled', 'draft']) {
      flag();
      const db = seed({ zones: addedLast(), visits: [visit(state)] });
      const held = await remove(db, head, 'A');
      await settle();
      assert.equal(held.status, 409, state);
      assert.deepEqual(held.json, { error: holdText('SV-26100007') }, state);
      assert.deepEqual(dataWrites(db), [], state);
      assert.ok(rowOf(db, 'A'), state);
      assert.deepEqual(bells(db, HEAD_KIND), [], state);

      const crew = seed({ zones: addedLast(), visits: [visit(state)] });
      const refused = await remove(crew, tech, 'A');
      assert.equal(refused.status, 403, state);
      assert.deepEqual(refused.json, { error: LAST_ONSITE_CUT_CREW }, state);
      assert.deepEqual(dataWrites(crew), [], state);
    }
  }
});

test('ผู้ช่วยบนนัด (`mate`) ที่ไม่ได้ถูกมอบหมาย ยังถูกด่านนัดกันก่อนถึงด่านพลิกใบ — ไม่มีกระดิ่ง', async () => {
  const db = seed({ visits: [visit('in_progress', { assistantIds: [] })] });
  const refused = await cut(db, mate);
  await settle();
  assert.equal(refused.status, 403);
  assert.deepEqual(dataWrites(db), []);
  assert.deepEqual(bells(db, HEAD_KIND), []);
});
