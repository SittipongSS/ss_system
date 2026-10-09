// คิวงานของเจ้าหน้าที่ (S-3) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeFormDefaults, groupVisits, missingEvidence, openCount } from './myVisits.js';
import { normalizeVisitInput } from './rounds.js';

const TODAY = '2026-07-30';
const v = (over = {}) => ({
  id: 'V1', siteId: 'S1', kind: 'refill', scheduledDate: TODAY,
  status: 'scheduled', assigneeId: 'U1', ...over,
});

test('⭐ นัดค้าง (เลยวันแล้วยังไม่ปิด) แยกเป็นกลุ่มของตัวเอง — ถ้าปนอยู่ท้ายรายการจะเลื่อนหลุดจอจนไม่มีใครเห็น', () => {
  const groups = groupVisits([
    v({ id: 'A', scheduledDate: '2026-07-27' }),
    v({ id: 'B', scheduledDate: '2026-07-28' }),
    v({ id: 'C' }),
  ], TODAY);
  assert.deepEqual(groups.overdue.map((r) => r.id), ['A', 'B']);
  assert.deepEqual(groups.today.map((r) => r.id), ['C']);
});

test('นัดที่เลยวันแล้วแต่ปิดไปแล้ว = ประวัติ ไม่ใช่ของค้าง', () => {
  const groups = groupVisits([
    v({ id: 'A', scheduledDate: '2026-07-27', status: 'done', actualDate: '2026-07-27' }),
  ], TODAY);
  assert.deepEqual(groups.overdue, []);
});

test('⭐ นัดที่เพิ่งปิดวันนี้ยังอยู่ในกลุ่มวันนี้ — เจ้าหน้าที่ต้องเห็นว่าทำอะไรไปแล้วและกดกลับไปแก้ได้', () => {
  const groups = groupVisits([v({ id: 'C', status: 'done', actualDate: TODAY })], TODAY);
  assert.deepEqual(groups.today.map((r) => r.id), ['C']);
  assert.equal(openCount(groups).today, 0);
});

test('แยกวันนี้ / พรุ่งนี้ / ถัดไป', () => {
  const groups = groupVisits([
    v({ id: 'C' }),
    v({ id: 'D', scheduledDate: '2026-07-31' }),
    v({ id: 'E', scheduledDate: '2026-08-05' }),
  ], TODAY);
  assert.deepEqual(groups.tomorrow.map((r) => r.id), ['D']);
  assert.deepEqual(groups.later.map((r) => r.id), ['E']);
});

test('นัดที่ยกเลิก/เลื่อนแล้วไม่โผล่ในคิวเจ้าหน้าที่เลย', () => {
  const groups = groupVisits([
    v({ id: 'X', status: 'cancelled' }),
    v({ id: 'Y', status: 'rescheduled' }),
  ], TODAY);
  assert.deepEqual([...groups.overdue, ...groups.today, ...groups.tomorrow, ...groups.later], []);
});

test('ในวันเดียวกันเรียงตามเวลา · ไม่ระบุเวลาไปท้าย', () => {
  const groups = groupVisits([
    v({ id: 'A' }),
    v({ id: 'B', startTime: '13:00' }),
    v({ id: 'C', startTime: '09:00' }),
  ], TODAY);
  assert.deepEqual(groups.today.map((r) => r.id), ['C', 'B', 'A']);
});

test('⭐ ฟอร์มปิดงานเติมวันที่เข้าจริงเป็น "วันนี้" ไม่ใช่วันที่นัด — คนปิดงานตอนทำเสร็จจริง', () => {
  const form = closeFormDefaults(v({ scheduledDate: '2026-07-27', startTime: '10:00:00', endTime: '11:00:00' }), { todayIso: TODAY });
  assert.equal(form.actualDate, TODAY);
});

/* 🐞 รีวิว 24/09 — ฟอร์มเคยเติมเวลานัดเริ่ม/จบเป็น "เวลาเข้าจริง" (ยุคที่ยังเป็นช่องกรอก) แล้วส่งไปกับคำขอปิดงาน
   ⇒ นัด 08:00–10:00 ที่เริ่มจริง 14:00 ปิดไม่ได้ (400 เวลาเริ่มหลังเวลาสิ้นสุด) · นัดที่ไม่เคยกดเริ่มได้เวลาเริ่มปลอม
   ⇒ เวลาเข้าจริงบนฟอร์ม = เวลาที่ประทับไว้เท่านั้น · ยังไม่ประทับ = ว่าง (server ประทับตอนกดปิดงาน) */
test('🔴 ฟอร์มปิดงานไม่เติมเวลานัด/นาฬิกาเครื่องเป็นเวลาเข้าจริง — มีแต่เวลาที่ประทับไว้แล้ว', () => {
  const scheduled = closeFormDefaults(v({ startTime: '10:00:00', endTime: '11:00:00' }), { todayIso: TODAY, nowHHMM: '15:42' });
  assert.equal(scheduled.actualStartTime, '');
  assert.equal(scheduled.actualEndTime, '');
  const started = closeFormDefaults(v({
    status: 'in_progress', startTime: '08:00:00', endTime: '10:00:00', actualStartTime: '14:05:00',
  }), { todayIso: TODAY });
  assert.equal(started.actualStartTime, '14:05', 'เวลาเริ่มที่ช่างกดไว้');
  assert.equal(started.actualEndTime, '', 'เวลานัดจบ 10:00 ไม่ใช่เวลาจบจริง');
  const closed = closeFormDefaults(v({ status: 'done', actualStartTime: '09:00:00', actualEndTime: '09:40:00' }));
  assert.deepEqual([closed.actualStartTime, closed.actualEndTime], ['09:00', '09:40'], 'นัดที่ปิดแล้ว = ค่าที่บันทึกไว้');
});

test('⭐ รูปและลายเซ็นไม่บังคับ แต่ต้องบอกว่าขาด — ไม่ใช่เงียบ (มติผู้ใช้ 2026-07-30)', () => {
  assert.deepEqual(missingEvidence({}), ['ยังไม่มีรูปหน้างาน', 'ยังไม่มีลายเซ็นผู้รับงาน']);
  assert.deepEqual(
    missingEvidence({ attachments: [{ url: 'x' }], customerSignatureUrl: 'y' }),
    [],
  );
});

test('⭐ ปิดงานได้โดยไม่มีรูป/ลายเซ็น — ถ้าบล็อก เจ้าหน้าที่จะไปบันทึกย้อนหลังแล้วเวลาผิดทั้งชุด', () => {
  const { value, error } = normalizeVisitInput({
    siteId: 'S1', kind: 'refill', scheduledDate: TODAY,
    status: 'done', actualDate: TODAY, actualStartTime: '10:05', actualEndTime: '10:50',
  });
  assert.equal(error, null);
  assert.equal(value.status, 'done');
  assert.deepEqual(value.attachments, []);
  assert.equal(value.customerSignatureUrl, null);
});

test('ไฟล์แนบเก็บเฉพาะแถวที่มีลิงก์จริง · ชนิดแปลก ๆ ตกเป็น other', () => {
  const { value } = normalizeVisitInput({
    siteId: 'S1', kind: 'refill', scheduledDate: TODAY,
    attachments: [
      { url: 'https://drive.google.com/file/d/1PhotoBeforeAAAAAAA/view', name: 'ก่อนซ่อม', kind: 'before' },
      { url: '', name: 'ว่าง' },
      { url: 'https://drive.google.com/file/d/1PhotoAfterBBBBBBBB/view', kind: 'ไม่รู้จัก' },
    ],
  });
  assert.deepEqual(value.attachments, [
    { url: 'https://drive.google.com/file/d/1PhotoBeforeAAAAAAA/view', name: 'ก่อนซ่อม', kind: 'before' },
    { url: 'https://drive.google.com/file/d/1PhotoAfterBBBBBBBB/view', name: 'ไฟล์แนบ', kind: 'other' },
  ]);
});

// ── ป้ายตัวเลขบนเมนู (ม-116) ─────────────────────────────────────────────
test('⭐ "รอฉันลงมือ" = นัดค้าง + นัดวันนี้ที่ยังไม่ปิด — พรุ่งนี้ยังไม่ใช่ของค้าง', async () => {
  const { waitingOnMeVisitCount } = await import('./myVisits.js');
  const today = '2026-08-12';
  const visits = [
    { id: 'a', scheduledDate: '2026-08-10', status: 'scheduled' },  // ค้าง
    { id: 'b', scheduledDate: '2026-08-10', status: 'done' },       // ค้างแต่ปิดแล้ว
    { id: 'c', scheduledDate: today, status: 'scheduled' },         // วันนี้
    { id: 'd', scheduledDate: today, status: 'done' },              // วันนี้ ปิดแล้ว
    { id: 'e', scheduledDate: '2026-08-13', status: 'scheduled' },  // พรุ่งนี้ = แผน
    { id: 'f', scheduledDate: '2026-08-11', status: 'cancelled' },  // ยกเลิก
  ];
  assert.equal(waitingOnMeVisitCount(visits, today), 2);
  assert.equal(waitingOnMeVisitCount([], today), 0);
});

/* ══ GET /api/service/my-visits — สองแบบ (แผน operation-crew §5 · S2 · R3) ══════════════════════════
 *
 * ⚠️ เรียก handler ตัวจริงผ่าน supabase ปลอม — ถอดตัวอ่านผู้ใช้กับ client จริงออกด้วย hook และลบ env ของ
 *    Supabase ทิ้งก่อน import ⇒ ต่อให้ hook พลาด ก็สร้าง client จริงไม่ได้ (dev DB = prod DB)
 * ⚠️ hook ต่อหลัง import ข้างบน (ไฟล์กฎล้วน) — มีผลกับ import ข้างล่างเท่านั้น */
const { register } = await import('node:module');
const { mock } = await import('node:test');
const { businessDate } = await import('../businessDate.js');
const { addDays } = await import('../datePeriods.js');

for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[key];
register('data:text/javascript,' + encodeURIComponent(`
  const mod = (src) => 'data:text/javascript,' + encodeURIComponent(src);
  const AUTH = mod("export async function getCurrentUser() { return globalThis.__myVisitsRouteTest?.user ?? null; }");
  const ADMIN = mod("export function getSupabaseAdmin() { const s = globalThis.__myVisitsRouteTest?.supabase; if (!s) throw new Error('fake supabase missing'); return s; }");
  export async function resolve(s, c, n) {
    if (s === '@/lib/authUser') return { url: AUTH, shortCircuit: true };
    if (s === '@/lib/supabaseAdmin') return { url: ADMIN, shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));
const { GET: getMyVisits } = await import('../../app/api/service/my-visits/route.js');

/* supabase ปลอม: จดทุก query · `reply(q)` ตอบแถวของนัด · ตารางอื่นว่าง */
function routeSupabase(reply = () => []) {
  const calls = [];
  const from = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve, reject) => Promise.resolve({ data: table === 'service_visits' ? reply(q) : [], error: null })
            .then(resolve, reject);
        }
        return (...args) => { q.ops.push([prop, ...args]); return builder; };
      },
    });
    return builder;
  };
  const opsOf = (q, name) => q.ops.filter(([n]) => n === name).map(([, ...args]) => args);
  return { from, calls, opsOf, visitQueries: () => calls.filter((c) => c.table === 'service_visits') };
}

async function myVisitsAs(user, query, reply) {
  const supabase = routeSupabase(reply);
  globalThis.__myVisitsRouteTest = { user, supabase };
  const res = await getMyVisits(new Request(`http://localhost/api/service/my-visits?${query}`));
  return { status: res.status, json: await res.json(), supabase };
}

const tech = { id: 'U-TECH', name: 'ช่างเอ', role: 'ts', department: 'TS' };
const planner = { id: 'U-PLAN', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' };
const routeVisit = (id, o = {}) => ({
  id, siteId: 'S1', kind: 'refill', scheduledDate: businessDate(), startTime: '09:00',
  status: 'scheduled', assigneeId: 'U-TECH', assistantIds: [], ...o,
});

test('🔴 ไม่ส่ง from/to = ทรงคำตอบเดิมทุกอย่าง (หน้างานวันนี้ตัวเก่าอ่านแค่ data.visits — R3)', async () => {
  const day = businessDate();
  const late = routeVisit('V-LATE', { scheduledDate: addDays(day, -3) });
  const { status, json, supabase } = await myVisitsAs(tech, 'scope=mine', () => [late, routeVisit('V-TODAY')]);
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json).sort(), ['scope', 'sites', 'visits'], 'ไม่มีคีย์ overdue/sentBack');
  assert.deepEqual(json.visits.map((x) => x.id), ['V-LATE', 'V-TODAY'], 'นัดค้างยังปนอยู่ใน visits');
  const queries = supabase.visitQueries();
  assert.equal(queries.length, 1, 'คำขอเดียว ไม่มีตัวโหลดนัดค้าง/ส่งกลับ');
  // ไม่ส่ง back/ahead = วันนี้วันเดียว เหมือนของที่ใช้อยู่จริง (คงไว้จนจอใหม่ขึ้น — การ์ดวันหน้าจะมีปุ่มเริ่มงานที่โดน 409)
  assert.deepEqual(supabase.opsOf(queries[0], 'gte'), [['scheduledDate', day]]);
  assert.deepEqual(supabase.opsOf(queries[0], 'lte'), [['scheduledDate', day]]);
  assert.equal(supabase.opsOf(queries[0], 'in').length, 0, 'แบบเดิมไม่กรองสถานะที่ server (groupVisits ตัดเอง)');
});

test('🔴 "วันนี้" มาจากนาฬิกาไทย — 00:30 ไทย (17:30 UTC ของเมื่อวาน) ช่วงวันต้องไม่ถอยไปหนึ่งวัน', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-27T17:30:00.000Z') });
  try {
    const legacy = await myVisitsAs(tech, 'scope=mine');
    const [q] = legacy.supabase.visitQueries();
    assert.deepEqual(legacy.supabase.opsOf(q, 'gte'), [['scheduledDate', '2026-09-28']]);
    assert.deepEqual(legacy.supabase.opsOf(q, 'lte'), [['scheduledDate', '2026-09-28']]);
    const ranged = await myVisitsAs(tech, 'from=2026-09-28&to=2026-10-11');
    assert.equal(ranged.json.today, '2026-09-28');
    const overdue = ranged.supabase.visitQueries().find((x) => ranged.supabase.opsOf(x, 'lt').length);
    assert.deepEqual(ranged.supabase.opsOf(overdue, 'lt'), [['scheduledDate', '2026-09-28']]);
  } finally {
    mock.timers.reset();
  }
});

test('⭐ แบบช่วงวัน: นัดค้างเกิน 14 วันยังอยู่ (ไม่มีขอบล่าง) · ช่วงวันตัดร่าง/ยกเลิก/เลื่อนที่ query', async () => {
  const day = businessDate();
  const ancient = routeVisit('V-40', { scheduledDate: addDays(day, -40) });
  const reply = (q) => (q.ops.some(([n]) => n === 'lt') ? [ancient] : []);
  const { status, json, supabase } = await myVisitsAs(tech, `from=${day}&to=${addDays(day, 13)}`, reply);
  assert.equal(status, 200);
  assert.deepEqual(json.overdue.map((x) => x.id), ['V-40']);
  assert.deepEqual(json.sentBack, []);
  assert.equal(json.from, day);
  assert.equal(json.to, addDays(day, 13));
  const [windowQuery, overdueQuery] = supabase.visitQueries();
  assert.deepEqual(supabase.opsOf(windowQuery, 'in'), [['status', ['scheduled', 'in_progress', 'done', 'partial', 'unable']]]);
  assert.equal(supabase.opsOf(overdueQuery, 'gte').length, 0);
});

test('แบบช่วงวัน: ผิดรูป/วันที่ไม่มีจริง/กลับหัว/ยาวเกิน 62 วัน = 400 ภาษาไทย · ล้นขอบ (ย้อน 31 · ล่วง 90) ถูกบีบ', async () => {
  const day = businessDate();
  // วันที่ไม่มีจริงผ่าน regex ของ isDayValue ได้ — ปล่อยถึงคอลัมน์ `date` = 500 ภาษาอังกฤษ (review S2 28/09)
  for (const query of [
    'from=2026-9-1&to=2026-09-30', `from=${day}`, `from=${addDays(day, 5)}&to=${day}`, `from=${day}&to=${addDays(day, 63)}`,
    'from=2026-02-30&to=2026-03-05', 'from=2026-09-01&to=2026-09-31',
  ]) {
    const { status, json, supabase } = await myVisitsAs(tech, query);
    assert.equal(status, 400, query);
    assert.match(json.error, /ช่วงวัน/, query);
    assert.equal(supabase.calls.length, 0, `${query}: ไม่ยิง query`);
  }
  const past = await myVisitsAs(tech, `from=${addDays(day, -60)}&to=${addDays(day, -10)}`);
  assert.equal(past.json.from, addDays(day, -31));
  assert.deepEqual(past.supabase.opsOf(past.supabase.visitQueries()[0], 'gte'), [['scheduledDate', addDays(day, -31)]]);
  const future = await myVisitsAs(tech, `from=${addDays(day, 60)}&to=${addDays(day, 100)}`);
  assert.equal(future.json.to, addDays(day, 90));
});

test('🔴 ช่างขอคิวคนอื่น/ทั้งฝ่ายไม่ได้ — server บังคับเป็นตัวเอง · ผู้จัดคิวยังดูแทนได้ (?user=)', async () => {
  const day = businessDate();
  for (const query of ['scope=team&assignee=U-X', `scope=team&assignee=U-X&from=${day}&to=${day}`]) {
    const { json, supabase } = await myVisitsAs(tech, query);
    assert.equal(json.scope, 'mine', query);
    for (const q of supabase.visitQueries()) {
      assert.deepEqual(supabase.opsOf(q, 'or'), [['assigneeId.eq.U-TECH,assistantIds.cs.["U-TECH"]']], query);
    }
  }
  const cover = await myVisitsAs(planner, `scope=mine&assignee=U-X&from=${day}&to=${day}`);
  for (const q of cover.supabase.visitQueries()) {
    assert.deepEqual(cover.supabase.opsOf(q, 'or'), [['assigneeId.eq.U-X,assistantIds.cs.["U-X"]']]);
  }
  const team = await myVisitsAs(planner, 'scope=team');
  assert.equal(team.json.scope, 'team');
  assert.equal(team.supabase.opsOf(team.supabase.visitQueries()[0], 'or').length, 0);
});
