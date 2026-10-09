// ── กระดิ่งของการสลับวิธีประเมิน (งวด S2a §2.3) ─────────────────────────────────────
//
// ⭐ ตรึงสี่เรื่อง: ใครได้รับ · ประโยคมาจากแผน (ไม่แต่งเอง) · ปลายทางที่ผู้รับเปิดได้จริง · กุญแจกันซ้ำ
// 🔴 ไม่มีกุญแจ = ไม่ยิง — กระดิ่งกันซ้ำถาวรที่ unique index (userId, updateId) ⇒ กุญแจที่ลงท้ายด้วย `undefined`
//    จะกลืนกระดิ่งของการสลับทุกครั้งถัดไปของใบนั้นเงียบ ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVEY_DESK_READY_KIND, SURVEY_METHOD_CREW_KIND,
  notifySurveyDeskReady, notifySurveyMethodCrew, surveyDeskReadyNotice, surveyMethodCrewNotice,
} from './surveyMethodNotify.js';
import { SERVICE_BELL_KINDS } from '../notifications.js';

const request = { id: 'RQ1', docNo: 'RQ-AS-26100312', title: 'ประเมินพื้นที่ชั้น 12' };
const visit = { id: 'V1', code: 'SV-26100011', assigneeId: 'U-TECH', assistantIds: ['U-AST', 'U-HEAD', 'U-TECH', null] };
const actor = { id: 'U-HEAD', name: 'หัวหน้า ก' };
const KEY = 'U-HEAD|0b1e6c0e-6a0b-4f0e-9a39-2f0f6f1f7c11';
const bell = { kind: 'cancel', title: 'ยกเลิกนัด SV-26100011 — ใบนี้เปลี่ยนเป็นประเมินจากแบบ' };
const users = [
  { id: 'U-HEAD', role: 'ts_manager' },
  { id: 'U-AUD', role: 'ts_audit' },
  { id: 'U-SEN', role: 'ts_senior' },
  { id: 'U-PLN', role: 'ts_planner' },
  { id: 'U-TECH', role: 'ts' },
  { id: 'U-ADM', role: 'admin' },
  { id: 'U-OFF', role: 'ts_manager', disabled: true },
];
const HEAD_TITLE = 'คำร้องประเมินจากแบบ RQ-AS-26100312 — รอหัวหน้าประเมิน';

test('สองชนิดอยู่ในทะเบียนกล่องกระดิ่ง — ไม่งั้นแจ้งเตือนลงฐานแต่ไม่มีใครเห็น', () => {
  assert.equal(SURVEY_METHOD_CREW_KIND, 'survey_method_changed');
  assert.equal(SURVEY_DESK_READY_KIND, 'survey_desk_ready');
  assert.ok(SERVICE_BELL_KINDS.includes(SURVEY_METHOD_CREW_KIND));
  assert.ok(SERVICE_BELL_KINDS.includes(SURVEY_DESK_READY_KIND));
});

test('⭐ กระดิ่งช่าง: ผู้รับผิดชอบ + คนไปด้วยบนนัด ลบคนกด · ประโยคของแผน · ปลายทางคือจอของฝ่ายบริการ', () => {
  const n = surveyMethodCrewNotice({ request, visit, bell, reason: 'หน้างานยังก่อสร้าง ถึงสิ้นเดือน', actor, key: KEY });
  assert.deepEqual(n, {
    userIds: ['U-TECH', 'U-AST'],
    entityType: 'dept_request',
    entityId: 'RQ1',
    kind: 'survey_method_changed',
    title: bell.title,
    body: 'RQ-AS-26100312 ประเมินพื้นที่ชั้น 12 — หน้างานยังก่อสร้าง ถึงสิ้นเดือน',
    dedupeKey: `survey-method:RQ1:${KEY}`,
    // 🔴 ช่างเปิดหน้าคำร้องไม่ได้ (403) — กระดิ่งต้องไม่พาไปชนกำแพง
    href: '/service/surveys/RQ1',
  });
});

test('กระดิ่งช่าง: ตารางกรณีขอบ', () => {
  const base = { request, visit, bell, reason: '', actor, key: KEY };
  const cases = [
    ['ไม่มีเหตุผล → เนื้อไม่มีขีดท้าย', base, (n) => assert.equal(n.body, 'RQ-AS-26100312 ประเมินพื้นที่ชั้น 12')],
    ['ไม่มีเลขใบ', { ...base, request: { id: 'RQ1', title: 'งาน ก' }, reason: 'เหตุ' }, (n) => assert.equal(n.body, 'งาน ก — เหตุ')],
    ['ไม่มีทั้งเลขและชื่อ', { ...base, request: { id: 'RQ1' } }, (n) => assert.equal(n.body, '')],
    ['ไม่มีคนไปด้วย', { ...base, visit: { id: 'V1', assigneeId: 'U-TECH' } }, (n) => assert.deepEqual(n.userIds, ['U-TECH'])],
    ['id เป็นเลข', { ...base, visit: { id: 'V1', assigneeId: 7, assistantIds: [8] } }, (n) => assert.deepEqual(n.userIds, ['7', '8'])],
    ['ไม่ส่งคนกด → ทุกคนบนนัดได้รับ', { ...base, actor: null }, (n) => assert.deepEqual(n.userIds, ['U-TECH', 'U-AST', 'U-HEAD'])],
  ];
  for (const [name, args, check] of cases) {
    const n = surveyMethodCrewNotice(args);
    assert.ok(n, name);
    check(n);
  }
  const none = [
    ['🔴 ไม่มีกุญแจ', { ...base, key: undefined }],
    ['กุญแจว่าง', { ...base, key: '' }],
    ['ไม่มีใบ', { ...base, request: null }],
    ['ไม่มีนัด', { ...base, visit: null }],
    ['แผนไม่มีกระดิ่งช่าง', { ...base, bell: null }],
    ['กระดิ่งไม่มีประโยค', { ...base, bell: { kind: 'zones' } }],
    ['นัดยังไม่มีช่าง', { ...base, visit: { id: 'V1', assigneeId: null, assistantIds: [] } }],
    ['คนกดเป็นคนเดียวบนนัด (Senior ออกหน้างานเอง)', { ...base, visit: { id: 'V1', assigneeId: 'U-HEAD' } }],
    ['ไม่ส่งอะไรมาเลย', undefined],
  ];
  for (const [name, args] of none) assert.equal(surveyMethodCrewNotice(args), null, name);
});

test('⭐ กระดิ่งหัวหน้า: หัวหน้าสามตำแหน่งที่ยังทำงานอยู่ ลบคนกด · ปลายทางคือแท็บสรุปส่งผล', () => {
  const n = surveyDeskReadyNotice({ request, users, actor, title: HEAD_TITLE, key: KEY });
  assert.deepEqual({ ...n, userIds: [...n.userIds].sort() }, {
    userIds: ['U-AUD', 'U-SEN'],
    entityType: 'dept_request',
    entityId: 'RQ1',
    kind: 'survey_desk_ready',
    title: HEAD_TITLE,
    body: 'ประเมินพื้นที่ชั้น 12',
    dedupeKey: `survey-desk-ready:RQ1:${KEY}`,
    href: '/service/surveys/RQ1?tab=result',
  });
  // คนกดไม่ใช่หัวหน้า (ช่างตัดพื้นที่จนใบพลิก) → หัวหน้าครบสามคน
  const fromCrew = surveyDeskReadyNotice({ request, users, actor: { id: 'U-TECH' }, title: HEAD_TITLE, key: 'cut:Z1:x' });
  assert.deepEqual([...fromCrew.userIds].sort(), ['U-AUD', 'U-HEAD', 'U-SEN']);
  assert.equal(fromCrew.dedupeKey, 'survey-desk-ready:RQ1:cut:Z1:x');
  assert.equal(surveyDeskReadyNotice({ request: { id: 'RQ1' }, users, actor, title: HEAD_TITLE, key: KEY }).body, '');

  const none = [
    ['🔴 ไม่มีกุญแจ', { request, users, actor, title: HEAD_TITLE }],
    ['ไม่มีประโยค', { request, users, actor, key: KEY }],
    ['ไม่มีใบ', { users, actor, title: HEAD_TITLE, key: KEY }],
    ['ไม่มีหัวหน้าคนอื่น', { request, users: users.filter((u) => u.id === 'U-HEAD' || u.id === 'U-PLN'), actor, title: HEAD_TITLE, key: KEY }],
    ['ไม่มีรายชื่อ', { request, actor, title: HEAD_TITLE, key: KEY }],
    ['ไม่ส่งอะไรมาเลย', undefined],
  ];
  for (const [name, args] of none) assert.equal(surveyDeskReadyNotice(args), null, name);
});

/* ── ตัวยิง — ฐานปลอมจดสิ่งที่ถูกเขียนลง `notifications` ───────────────────── */
function fakeSupabase({ authUsers = [], upsertError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      admin: {
        listUsers: async ({ page }) => ({ data: { users: page === 1 ? authUsers : [] }, error: null }),
      },
    },
    from: (table) => ({
      upsert: async (rows, opts) => { calls.push({ table, op: 'upsert', rows, opts }); return { error: upsertError }; },
      insert: async (rows) => { calls.push({ table, op: 'insert', rows }); return { error: null }; },
    }),
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const authUser = (id, role, extra = {}) => ({ id, email: `${id}@x.test`, app_metadata: { role }, user_metadata: { name: id }, ...extra });

test('notifySurveyMethodCrew: ยิงแบบกันซ้ำด้วยกุญแจ · ไม่มีกุญแจ = ไม่แตะฐาน · ฐานพังไม่โยนกลับ', async () => {
  const db = fakeSupabase();
  notifySurveyMethodCrew(db, { request, visit, bell, reason: 'เหตุผลของการสลับ', actor, key: KEY });
  await settle();
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].table, 'notifications');
  assert.equal(db.calls[0].op, 'upsert', 'มีกุญแจ = upsert แบบข้ามแถวซ้ำ');
  assert.deepEqual(db.calls[0].opts, { onConflict: 'userId,updateId', ignoreDuplicates: true });
  assert.deepEqual(db.calls[0].rows.map((r) => r.userId), ['U-TECH', 'U-AST']);
  for (const row of db.calls[0].rows) {
    assert.equal(row.updateId, `survey-method:RQ1:${KEY}`);
    assert.equal(row.kind, 'survey_method_changed');
    assert.equal(row.title, bell.title);
    assert.equal(row.href, '/service/surveys/RQ1');
    assert.equal(row.actorName, 'หัวหน้า ก');
  }

  const silent = fakeSupabase();
  notifySurveyMethodCrew(silent, { request, visit, bell, actor });
  notifySurveyMethodCrew(silent, { request, visit, bell: null, actor, key: KEY });
  notifySurveyMethodCrew(silent);
  await settle();
  assert.deepEqual(silent.calls, []);

  // กระดิ่งที่พลาดต้องไม่ทำให้การสลับตอบ error
  const broken = { from: () => { throw new Error('ฐานล่ม'); } };
  assert.doesNotThrow(() => notifySurveyMethodCrew(broken, { request, visit, bell, actor, key: KEY }));
  await settle();
});

test('notifySurveyDeskReady: โหลดรายชื่อเอง แล้วยิงถึงหัวหน้าที่ไม่ใช่คนกด', async () => {
  const db = fakeSupabase({
    authUsers: [
      authUser('U-HEAD', 'ts_manager'), authUser('U-AUD', 'ts_audit'), authUser('U-SEN', 'ts_senior'),
      authUser('U-PLN', 'ts_planner'), authUser('U-TECH', 'ts'),
      authUser('U-OFF', 'ts_manager', { banned_until: '2999-01-01T00:00:00Z' }),
    ],
  });
  notifySurveyDeskReady(db, { request, actor, title: HEAD_TITLE, key: KEY });
  await settle();
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].rows.map((r) => r.userId).sort(), ['U-AUD', 'U-SEN']);
  for (const row of db.calls[0].rows) {
    assert.equal(row.updateId, `survey-desk-ready:RQ1:${KEY}`);
    assert.equal(row.kind, 'survey_desk_ready');
    assert.equal(row.title, HEAD_TITLE);
    assert.equal(row.href, '/service/surveys/RQ1?tab=result');
  }

  // ไม่มีกุญแจ = ไม่โหลดรายชื่อ ไม่ยิง
  const silent = fakeSupabase({ authUsers: [authUser('U-AUD', 'ts_audit')] });
  let listed = 0;
  silent.auth.admin.listUsers = async () => { listed += 1; return { data: { users: [] }, error: null }; };
  notifySurveyDeskReady(silent, { request, actor, title: HEAD_TITLE });
  notifySurveyDeskReady(silent, { request, actor, key: KEY });
  notifySurveyDeskReady(silent);
  await settle();
  assert.equal(listed, 0);
  assert.deepEqual(silent.calls, []);
});
