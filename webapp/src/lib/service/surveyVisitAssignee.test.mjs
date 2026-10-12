// ── ผู้รับผิดชอบของนัดประเมิน = "ผู้ประเมิน" ที่รายงานการประเมินพื้นที่พิมพ์ลายเซ็นจริง (PR-SIG · ผลรีวิว 09/10/2026) ───────
//
// ⭐ ล็อกสี่เรื่อง:
//   ① กติกาลายเซ็นจริง **ปิด** หรือนัดชนิดอื่น = ยามไม่ทำอะไรเลย (ไม่อ่านทะเบียนผู้ใช้ ไม่ตีกลับ) — PATCH นัดเดินเหมือนเดิมทุกก้าว
//   ② 🔴 นัดประเมินที่ปิดงานแล้ว เปลี่ยนผู้รับผิดชอบไม่ได้ (409 · ไม่เขียนอะไร) — ทางลัด "สลับผู้ประเมินที่ไม่มีลายเซ็นเป็นคนที่มี"
//   ③ 🔴 คนใหม่ต้องเป็นบัญชีฝ่ายบริการที่ยังใช้งาน (400) — รหัสของผู้บริหารฝ่ายขายที่มีลายเซ็นเข้ามาทางนี้ไม่ได้
//   ④ 🔴 ชื่อบนนัดมาจากทะเบียนผู้ใช้ ไม่ใช่จาก body — ชื่อกับรหัสชี้คนเดียวกัน
// เรียก handler ตัวจริงของ PATCH /api/service/visits/[id] ผ่านฐานปลอมในหน่วยความจำ (ชุดเครื่องมือของ crew) — ไม่แตะฐานจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { callRoute, fakeDb, planner, senior } from './crew/routeTestKit.mjs';
import {
  SURVEY_VISIT_ASSIGNEE_CLOSED_ERROR, SURVEY_VISIT_ASSIGNEE_MISSING_ERROR, surveyVisitAssigneeNotServiceError,
  surveyVisitAssigneePatch,
} from './surveyVisitAssignee.js';

const { PATCH } = await import('../../app/api/service/visits/[id]/route.js');

const KEY = 'SURVEY_REPORT_SIGNATURES';
async function withSwitch(value, run) {
  const before = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  try { return await run(); } finally {
    if (before === undefined) delete process.env[KEY];
    else process.env[KEY] = before;
  }
}

/* ── ทะเบียนผู้ใช้ ── A = ผู้ประเมินเดิม (ยังไม่มีลายเซ็นก็ได้ — ยามนี้ไม่ถามเรื่องลายเซ็น) · B = ช่างอีกคน ·
   CD = ผู้บริหารฝ่ายขาย (คนที่มักมีลายเซ็นเพราะอนุมัติใบเสนอราคา) · OFF = บัญชีฝ่ายบริการที่ถูกระงับ */
const person = (id, name, role, extra = {}) => ({ id, name, role, department: role.startsWith('ts') ? 'TS' : 'SA', disabled: false, ...extra });
const PEOPLE = [
  person('U-A', 'ช่างเอ', 'ts'),
  person('U-B', 'ช่างบี', 'ts_senior'),
  person('U-CD', 'ผู้บริหารฝ่ายขาย', 'commercial_director'),
  person('U-OFF', 'ช่างที่ลาออก', 'ts', { disabled: true }),
];
function directoryOf(people = PEOPLE) {
  const log = { reads: 0 };
  const load = async () => { log.reads += 1; return new Map(people.map((p) => [p.id, p])); };
  return { load, log };
}

const visit = (over = {}) => ({
  id: 'SVV-1', code: 'SV-26100001', siteId: 'SITE-1', planId: null, requestId: 'REQ-1', kind: 'survey',
  scheduledDate: '2026-10-09', startTime: '09:00', endTime: null,
  assigneeId: 'U-A', assigneeName: 'ช่างเอ', assistantIds: [],
  status: 'scheduled', actualDate: null, actualStartTime: null, actualEndTime: null, actualEndDate: null,
  actualTimeEdited: false, unableReason: null, summary: null, note: null, attachments: [], customerSignatureUrl: null,
  createdAt: '2026-10-05T02:00:00.000Z', updatedAt: '2026-10-05T02:00:00.000Z',
  ...over,
});
const done = (over = {}) => visit({ status: 'done', actualDate: '2026-10-09', actualStartTime: '09:05', actualEndTime: '10:00', ...over });
const CLOSED = {
  done,
  partial: (over) => done({ status: 'partial', ...over }),
  unable: (over) => done({ status: 'unable', unableReason: 'อาคารปิดปรับปรุงทั้งสัปดาห์', ...over }),
};

const guard = (before, value, { ruleOn = true, people } = {}) => {
  const dir = directoryOf(people);
  return surveyVisitAssigneePatch(null, before, value, { ruleOn, loadDirectory: dir.load }).then((result) => ({ result, dir }));
};
const PASS = { error: null, status: null, patch: {} };

/* ══ 1. ตรรกะของยาม ══════════════════════════════════════════════════════════════════════ */

test('🔴 กติกาปิด · นัดชนิดอื่น · ไม่มีอะไรเปลี่ยน = ผ่านเฉย ๆ ไม่อ่านทะเบียนผู้ใช้ — แม้คำขอจะสลับคนบนนัดที่ปิดแล้ว', async () => {
  const swap = { assigneeId: 'U-CD', assigneeName: 'ชื่ออะไรก็ได้' };
  for (const [what, before, opts] of [
    ['กติกาปิด', done(), { ruleOn: false }],
    ['นัดเติมน้ำหอม', done({ kind: 'refill' }), { ruleOn: true }],
    ['นัดติดตั้ง', visit({ kind: 'install' }), { ruleOn: true }],
  ]) {
    const { result, dir } = await guard(before, swap, opts);
    assert.deepEqual(result, PASS, what);
    assert.equal(dir.log.reads, 0, `${what}: ไม่อ่านทะเบียน`);
  }
  // คำขอที่ไม่ได้แตะผู้รับผิดชอบ (ฟอร์มส่งค่าเดิมกลับมา · ช่างกดรับงาน) — ทั้งนัดเปิดและนัดปิด
  for (const before of [visit(), done()]) {
    const { result, dir } = await guard(before, { assigneeId: 'U-A', assigneeName: 'ช่างเอ' });
    assert.deepEqual(result, PASS);
    assert.equal(dir.log.reads, 0);
  }
});

test('ไม่ส่ง ruleOn = ถามสวิตช์ SURVEY_REPORT_SIGNATURES เอง — `on` คำเดียวเปิด', async () => {
  const dir = directoryOf();
  const swap = { assigneeId: 'U-B', assigneeName: 'ช่างบี' };
  const run = () => surveyVisitAssigneePatch(null, done(), swap, { loadDirectory: dir.load });
  assert.deepEqual(await withSwitch(undefined, run), PASS);
  assert.deepEqual(await withSwitch('1', run), PASS);
  assert.equal((await withSwitch('on', run)).status, 409);
});

test('🔴 นัดประเมินที่ปิดงานแล้ว (เข้าแล้ว · ทำไม่ครบ · ทำไม่ได้): เปลี่ยนผู้รับผิดชอบ = 409 พร้อมทางออก — ไม่อ่านทะเบียน ไม่มีอะไรให้เขียน', async () => {
  for (const [status, make] of Object.entries(CLOSED)) {
    for (const value of [
      { assigneeId: 'U-B', assigneeName: 'ช่างบี' },          // สลับเป็นช่างที่มีลายเซ็น
      { assigneeId: 'U-B', assigneeName: 'ช่างเอ' },          // สลับรหัสอย่างเดียว ชื่อเดิม
      { assigneeId: null, assigneeName: null },               // ถอดออก
      { assigneeId: null, assigneeName: 'ช่างเอ' },           // ถอดรหัส เหลือแต่ชื่อ
    ]) {
      const { result, dir } = await guard(make(), value);
      assert.equal(result.status, 409, status);
      assert.equal(result.error, SURVEY_VISIT_ASSIGNEE_CLOSED_ERROR, status);
      assert.deepEqual(result.patch, {});
      assert.equal(dir.log.reads, 0);
    }
  }
  assert.equal(SURVEY_VISIT_ASSIGNEE_CLOSED_ERROR,
    'นัดประเมินที่ปิดงานแล้วเปลี่ยนผู้รับผิดชอบไม่ได้ — คนบนนัดคือ “ผู้ประเมิน” ที่รายงานการประเมินพื้นที่พิมพ์ลายเซ็น · ถ้าบันทึกผิดคน ให้เปิดนัดกลับก่อนแล้วจึงเปลี่ยน');
});

test('🔴 นัดที่ยังไม่ปิด: คนใหม่ต้องเป็นบัญชีฝ่ายบริการที่ยังใช้งาน — นอกฝ่าย · ถูกระงับ · ไม่มีบัญชี = 400', async () => {
  for (const status of ['draft', 'scheduled', 'in_progress', 'cancelled', 'rescheduled']) {
    const before = visit({ status });
    const cd = await guard(before, { assigneeId: 'U-CD', assigneeName: 'ช่างเอ' });
    assert.deepEqual([cd.result.status, cd.result.error], [400, surveyVisitAssigneeNotServiceError('ผู้บริหารฝ่ายขาย')], status);
    assert.equal(cd.result.error, 'ผู้บริหารฝ่ายขาย รับงานเข้าไซต์ไม่ได้ — ต้องเป็นฝ่ายบริการ (TS)');
    const off = await guard(before, { assigneeId: 'U-OFF', assigneeName: 'ช่างที่ลาออก' });
    assert.deepEqual([off.result.status, off.result.error], [400, SURVEY_VISIT_ASSIGNEE_MISSING_ERROR], status);
    const ghost = await guard(before, { assigneeId: 'U-NOBODY', assigneeName: 'ใครก็ไม่รู้' });
    assert.deepEqual([ghost.result.status, ghost.result.error], [400, 'ไม่พบบัญชีเจ้าหน้าที่บริการที่เลือก'], status);
    for (const r of [cd, off, ghost]) assert.deepEqual(r.result.patch, {});
  }
  // ทะเบียนอ่านไม่สำเร็จ (ตัวอ่านคืนทะเบียนว่าง) = ไม่พบบัญชี — ไม่ปล่อยผ่านตอนไม่รู้
  const blind = await guard(visit(), { assigneeId: 'U-B', assigneeName: 'ช่างบี' }, { people: [] });
  assert.equal(blind.result.status, 400);
});

test('🔴 ชื่อมาจากทะเบียนผู้ใช้ ไม่ใช่จาก body: เปลี่ยนคน = ชื่อของบัญชีใหม่ · รหัสเดิมแต่ชื่อต่าง = ชื่อของบัญชีเดิม (แม้นัดปิดแล้ว)', async () => {
  const moved = await guard(visit(), { assigneeId: 'U-B', assigneeName: 'ช่างเอ' });
  assert.deepEqual(moved.result, { error: null, status: null, patch: { assigneeName: 'ช่างบี' } });
  assert.equal(moved.dir.log.reads, 1);

  // พิมพ์ชื่อใหม่ทับรหัสเดิม — ไม่ใช่การเปลี่ยนคน ชื่อถูกดึงกลับไปเป็นของบัญชี (ทั้งนัดเปิดและนัดที่ปิดแล้ว)
  for (const before of [visit(), done()]) {
    const renamed = await guard(before, { assigneeId: 'U-A', assigneeName: 'ช่างบี' });
    assert.deepEqual(renamed.result, { error: null, status: null, patch: { assigneeName: 'ช่างเอ' } });
  }
  // สำเนาชื่อบนนัดเก่ากว่าบัญชี (บัญชีถูกเปลี่ยนชื่อ) — คำขอที่แตะชื่อได้ชื่อปัจจุบันของบัญชี
  const stale = await guard(done({ assigneeName: 'ช่างเอ (ชื่อเก่า)' }), { assigneeId: 'U-A', assigneeName: 'อะไรก็ได้' });
  assert.equal(stale.result.patch.assigneeName, 'ช่างเอ');
  // บัญชีของรหัสเดิมหาไม่เจอแล้ว = ชื่อเดิมบนนัดคงไว้ (ไม่รับชื่อจาก body)
  const lost = await guard(done({ assigneeId: 'U-GONE', assigneeName: 'ช่างที่ถูกลบ' }), { assigneeId: 'U-GONE', assigneeName: 'ผู้บริหารฝ่ายขาย' });
  assert.deepEqual(lost.result, { error: null, status: null, patch: { assigneeName: 'ช่างที่ถูกลบ' } });
});

test('ถอดผู้รับผิดชอบของนัดที่ยังไม่ปิด: ชื่อถูกล้างด้วย — ชื่อที่ไม่ผูกบัญชีคือที่นั่งที่ไม่มีใครลงนามได้ · ไม่อ่านทะเบียน', async () => {
  const { result, dir } = await guard(visit(), { assigneeId: null, assigneeName: 'ช่างเอ' });
  assert.deepEqual(result, { error: null, status: null, patch: { assigneeName: null } });
  assert.equal(dir.log.reads, 0);
});

/* ══ 2. เส้น PATCH ตัวจริง ══════════════════════════════════════════════════════════════════ */

const authUser = (p) => ({
  id: p.id, email: `${p.id.toLowerCase()}@example.test`, user_metadata: { name: p.name },
  app_metadata: { role: p.role, department: p.department }, banned_until: p.disabled ? '2126-01-01T00:00:00Z' : null,
});
function world(row) {
  const db = fakeDb({
    service_visits: [row],
    service_sites: [{ id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: null, accessDays: [], accessFrom: null, accessTo: null }],
    dept_requests: [{
      id: 'REQ-1', docNo: 'RQ-AS-26100001', kind: 'site_survey', dept: 'TS', status: 'acknowledged', siteId: 'SITE-1',
      committedDueDate: row.scheduledDate, committedDueTime: '09:00', answeredAt: null, cancelledAt: null,
    }],
    service_survey_zones: [{ id: 'SZ-1', requestId: 'REQ-1', zoneId: 'ZN-1', zoneName: 'พื้นที่ 1', status: 'ok', sortOrder: 1 }],
  });
  db.listUsers = 0;
  db.auth.admin.listUsers = async ({ page = 1 } = {}) => {
    db.listUsers += 1;
    return { data: { users: page === 1 ? PEOPLE.map(authUser) : [] }, error: null };
  };
  return db;
}
const patch = (db, body, user = planner) => callRoute(PATCH, {
  user, db, method: 'PATCH', path: '/api/service/visits/SVV-1', params: { id: 'SVV-1' }, body,
});
const visitWrites = (db) => db.writes('service_visits');
const row = (db) => db.tables.service_visits[0];

test('🔴 PATCH · กติกาเปิด: สลับผู้ประเมินของนัดที่ปิดแล้ว = 409 ทั้งผู้จัดคิวและหัวหน้า — ไม่มีคำสั่งเขียนสักคำสั่ง แถวไม่ขยับ', async () => {
  for (const user of [planner, senior]) {
    for (const [status, make] of Object.entries(CLOSED)) {
      const db = world(make());
      const { status: code, json } = await withSwitch('on', () => patch(db, { assigneeId: 'U-B', assigneeName: 'ช่างบี' }, user));
      const at = `${user.role} · ${status}`;
      assert.equal(code, 409, `${at}: ${json.error}`);
      assert.equal(json.error, SURVEY_VISIT_ASSIGNEE_CLOSED_ERROR, at);
      assert.deepEqual(db.calls.filter((c) => c.write), [], at);
      assert.deepEqual([row(db).assigneeId, row(db).assigneeName], ['U-A', 'ช่างเอ'], at);
      assert.equal(db.listUsers, 0, at);
    }
  }
});

test('🔴 PATCH · กติกาเปิด: ใส่รหัสของบัญชีนอกฝ่ายบริการ (ผู้บริหารฝ่ายขาย) ลงนัดที่ยังเปิด = 400 ไม่เขียนอะไร', async () => {
  const db = world(visit());
  const { status, json } = await withSwitch('on', () => patch(db, { assigneeId: 'U-CD', assigneeName: 'ช่างเอ' }));
  assert.equal(status, 400, json.error);
  assert.equal(json.error, 'ผู้บริหารฝ่ายขาย รับงานเข้าไซต์ไม่ได้ — ต้องเป็นฝ่ายบริการ (TS)');
  assert.deepEqual(db.calls.filter((c) => c.write), []);
  assert.equal(row(db).assigneeId, 'U-A');
});

test('🔴 PATCH · กติกาเปิด: เปลี่ยนเป็นช่างฝ่ายบริการพร้อมชื่อปลอมใน body = บันทึกได้ แต่ชื่อบนนัดเป็นของบัญชี', async () => {
  const db = world(visit());
  const { status, json } = await withSwitch('on', () => patch(db, { assigneeId: 'U-B', assigneeName: 'ผู้บริหารฝ่ายขาย' }));
  assert.equal(status, 200, json.error);
  assert.deepEqual([json.visit.assigneeId, json.visit.assigneeName], ['U-B', 'ช่างบี']);
  assert.deepEqual([row(db).assigneeId, row(db).assigneeName], ['U-B', 'ช่างบี']);
  assert.equal(visitWrites(db).length, 1);
  assert.equal(visitWrites(db)[0].payload.assigneeName, 'ช่างบี');
  assert.equal(db.listUsers > 0, true, 'ชื่อมาจากทะเบียนผู้ใช้');
});

test('PATCH · กติกาเปิด: คำขอที่ไม่แตะผู้รับผิดชอบ (แก้โน้ตของนัดที่ปิดแล้ว) ผ่านตามเดิม — ไม่อ่านทะเบียนผู้ใช้', async () => {
  const db = world(done());
  const { status, json } = await withSwitch('on', () => patch(db, { note: 'ลูกค้าขอสำเนารายงาน' }));
  assert.equal(status, 200, json.error);
  assert.equal(row(db).note, 'ลูกค้าขอสำเนารายงาน');
  assert.deepEqual([row(db).assigneeId, row(db).assigneeName], ['U-A', 'ช่างเอ']);
  assert.equal(db.listUsers, 0);
});

test('🔴 PATCH · กติกาปิด (ค่าตั้งต้นของ production วันนี้): เส้นเดิมทุกก้าว — ยามไม่ทำงาน ไม่อ่านทะเบียนผู้ใช้', async () => {
  const db = world(done());
  const { status, json } = await withSwitch(undefined, () => patch(db, { assigneeId: 'U-B', assigneeName: 'ชื่อที่พิมพ์มา' }));
  assert.equal(status, 200, json.error);
  assert.deepEqual([row(db).assigneeId, row(db).assigneeName], ['U-B', 'ชื่อที่พิมพ์มา'], 'พฤติกรรมเดิม: รับจาก body ตรง ๆ');
  assert.equal(db.listUsers, 0);
});

test('ซอร์ส: ยามอยู่หลัง normalize ก่อนคำสั่งเขียนของนัด · 400/409 แยกตามเหตุ · สวิตช์อ่านผ่านไฟล์สวิตช์ตัวเดียว', () => {
  const strip = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const route = strip('src/app/api/service/visits/[id]/route.js');
  const at = (needle) => route.indexOf(needle);
  assert.ok(at('normalizeVisitInput(stampVisitInput(before, body)') > 0);
  assert.ok(at('normalizeVisitInput(stampVisitInput(before, body)') < at('surveyVisitAssigneePatch(supabase, before, value)'));
  assert.ok(at('surveyVisitAssigneePatch(supabase, before, value)') < at(".from('service_visits')\n      .update("), 'ก่อนเขียนแถวนัด');
  assert.match(route, /assignee\.status === 400 \? badRequest\(assignee\.error\) : conflict\(assignee\.error\)/);
  assert.match(route, /Object\.assign\(value, assignee\.patch\)/);
  const lib = strip('src/lib/service/surveyVisitAssignee.js');
  assert.doesNotMatch(lib, /process\.env/);
  assert.match(lib, /from '\.\/surveyReportSignFlag'/);
});
