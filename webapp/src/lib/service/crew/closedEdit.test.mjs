// ── ส่งงานแล้ว ช่างแก้ไม่ได้ — ด่านที่ `requireVisit` (มติเจ้าของ 28/09 Q3 · แผน operation-crew S1) ──
//
// ⭐ ด่านเดียวที่ `requireVisit({ edit: true })` ⇒ ครอบทุกเส้นเขียนของนัดพร้อมกัน: PATCH/DELETE ของนัด ·
//    ของที่ใช้ POST/DELETE · ผลรายเครื่อง PUT (และเส้นใหม่ของงวดถัดไป) · ไม่ต้องไปเติมทีละ route
// ⚠️ ทางอ่าน (`edit:false`) และใบส่งงาน (`report:true`) ต้องไม่เปลี่ยน — ช่างยังเปิดดูงานที่ส่งแล้วได้
// ⚠️ เรียก `requireVisit` ตัวจริงด้วย supabase ปลอม (อ่านแถวนัดอย่างเดียว) — ไม่มี client จริงในเทสต์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import {
  CREW_CLOSED_EDIT_ERROR, CREW_NOT_ON_SCHEDULE_ERROR, CREW_NOT_STARTED_ERROR, crewNotRunningError,
} from '../visitAccess.js';

/* ⚠️ visitsRepo ลาก `@/lib/http` → `next/headers` (ทางเดียวกับ visitDelete.test.mjs) — ต่อ hook ก่อน import */
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { return n(s === 'next/headers' ? 'next/headers.js' : s, c); }",
));
const { requireVisit } = await import('../visitsRepo.js');

/* supabase ปลอม: ตอบเฉพาะ `service_visits … eq('id') … maybeSingle()` · จดว่ามีการเขียนไหม (ต้องไม่มี) */
function fakeSupabase(row) {
  const calls = [];
  const from = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve) => resolve(q.table === 'service_visits' ? { data: row, error: null } : { data: null, error: null });
        }
        return (...args) => { q.ops.push(prop); return builder; };
      },
    });
    return builder;
  };
  return { from, calls, wrote: () => calls.some((c) => c.ops.some((op) => ['insert', 'update', 'upsert', 'delete'].includes(op))) };
}

const tech = { id: 'U-TECH', role: 'ts', department: 'TS' };
const senior = { id: 'U-SEN', role: 'ts_senior', department: 'TS' };
const planner = { id: 'U-PLAN', role: 'ts_planner', department: 'TS' };
const sales = { id: 'U-AE', role: 'ae', department: 'SA', team: 'KA', teams: ['KA'] };
const visit = (o = {}) => ({ id: 'V1', siteId: 'S1', kind: 'refill', status: 'done', assigneeId: 'U-TECH', assistantIds: [], ...o });

const call = async (user, row, opts) => {
  const supabase = fakeSupabase(row);
  const out = await requireVisit({ user, supabase, id: row.id, ...opts });
  assert.equal(supabase.wrote(), false, 'ด่านอ่านอย่างเดียว');
  return out;
};

test('🔴 ช่าง + edit บนนัดงานเครื่องที่ปิดแล้ว = 409 พร้อมข้อความชี้หัวหน้า/ผู้จัดคิว', async () => {
  for (const status of ['done', 'partial', 'unable']) {
    const out = await call(tech, visit({ status }), { edit: true });
    assert.ok(out.response, status);
    assert.equal(out.response.status, 409, status);
    assert.deepEqual(await out.response.json(), { error: CREW_CLOSED_EDIT_ERROR });
  }
  // ผู้ช่วยของใบก็เป็นช่างของใบ — ด่านเดียวกัน
  const helped = await call({ id: 'U-MATE', role: 'ts', department: 'TS' }, visit({ assistantIds: ['U-MATE'] }), { edit: true });
  assert.equal(helped.response?.status, 409);
});

test('ใบของคนอื่นยังตอบ 403 "ไม่ใช่งานของคุณ" ก่อน — ด่านรายใบมาก่อนด่านส่งงานแล้ว', async () => {
  const out = await call({ id: 'U-MATE', role: 'ts', department: 'TS' }, visit(), { edit: true });
  assert.equal(out.response.status, 403);
  assert.match((await out.response.json()).error, /ไม่ใช่งานของคุณ/);
});

test('ช่าง + นัดที่ยังเปิด / นัดประเมินที่ปิดแล้ว = ผ่าน พร้อมธง ownWorkOnly', async () => {
  for (const row of [visit({ status: 'scheduled' }), visit({ status: 'in_progress' }), visit({ kind: 'survey', requestId: 'RQ1' })]) {
    const out = await call(tech, row, { edit: true });
    assert.equal(out.response, undefined, `${row.kind}/${row.status}`);
    assert.equal(out.ownWorkOnly, true);
    assert.equal(out.visit.id, 'V1');
  }
});

test('Senior / Planner แก้ผลที่ส่งได้ตามเดิม (ทาง "แก้ผลที่ส่ง" ของหัวหน้า)', async () => {
  for (const user of [senior, planner]) {
    const out = await call(user, visit(), { edit: true });
    assert.equal(out.response, undefined, user.role);
    assert.equal(out.ownWorkOnly, false);
  }
});

test('⭐ ทางอ่าน (edit:false) และใบส่งงาน (report:true) ไม่เปลี่ยน — ช่างยังเปิดงานที่ส่งแล้วได้', async () => {
  const read = await call(tech, visit(), {});
  assert.equal(read.response, undefined);
  assert.equal(read.ownWorkOnly, false);

  const report = await call(tech, visit(), { report: true });
  assert.equal(report.response, undefined);
  assert.equal(report.visit.status, 'done');

  // ฝ่ายขายอ่านใบส่งงานได้ (มติ 24/09) — ทาง readOnly เดิม
  const salesReport = await call(sales, visit(), { report: true });
  assert.equal(salesReport.readOnly, true);
});

/* ── `running` = เส้นเขียนผลของการไป (ผลรายเครื่อง · ของที่ใช้ · รูป) — ช่างต้องเป็นงานที่กำลังทำ (S3) ──
   🐞 เดิมช่างยิง PUT ผลรายเครื่องทั้งชุดบนนัดของวันหน้า/นัดที่ยกเลิกแล้วได้ 200 และทะเบียนเครื่องเปลี่ยนจริง */
test('🔴 running: ช่างบนนัดที่ยังไม่รับงาน/ร่าง/ยกเลิก/เลื่อน = 409 · กำลังทำ = ผ่าน · ใบที่ปิดแล้วได้ข้อความส่งงานแล้ว', async () => {
  const cases = [
    ['scheduled', CREW_NOT_STARTED_ERROR], ['draft', CREW_NOT_ON_SCHEDULE_ERROR],
    ['cancelled', CREW_NOT_ON_SCHEDULE_ERROR], ['rescheduled', CREW_NOT_ON_SCHEDULE_ERROR],
    ['done', CREW_CLOSED_EDIT_ERROR],
  ];
  for (const [status, message] of cases) {
    const out = await call(tech, visit({ status }), { edit: true, running: true });
    assert.equal(out.response?.status, 409, status);
    assert.deepEqual(await out.response.json(), { error: message }, status);
  }
  const running = await call(tech, visit({ status: 'in_progress' }), { edit: true, running: true });
  assert.equal(running.response, undefined);
  assert.equal(running.ownWorkOnly, true);
});

test('running: หัวหน้า/ผู้จัดคิวไม่เปลี่ยน · นัดประเมินยกเว้น · PATCH ของนัด (ไม่ส่ง running) ยังรับงานจากนัดที่ยังไม่เริ่มได้', async () => {
  for (const user of [senior, planner]) {
    for (const status of ['scheduled', 'cancelled', 'done']) {
      const out = await call(user, visit({ status }), { edit: true, running: true });
      assert.equal(out.response, undefined, `${user.role}/${status}`);
    }
  }
  const survey = await call(tech, visit({ kind: 'survey', status: 'scheduled', requestId: 'RQ1' }), { edit: true, running: true });
  assert.equal(survey.response, undefined);
  const start = await call(tech, visit({ status: 'scheduled' }), { edit: true });
  assert.equal(start.response, undefined, 'ทางรับงานต้องไม่โดนด่าน running');
  // ธงอยู่คู่กับ edit เท่านั้น — ทางอ่านไม่มีด่านนี้
  const read = await call(tech, visit({ status: 'cancelled' }), { running: true });
  assert.equal(read.response, undefined);
  // ตรรกะล้วน: ไม่มีธง ownWorkOnly = ไม่ถาม
  assert.equal(crewNotRunningError(visit({ status: 'cancelled' })), null);
});
