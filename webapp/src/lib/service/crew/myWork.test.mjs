// ── คิวงานของช่าง: `loadMyWorkRows` + `enrichMyWork` (แผน operation-crew §5 · S2 · R13 R15 R16 · มติ 28/09 Q2 Q7) ──
//
// ⭐ สองชั้น: แถวล้วน (ป้ายนับบนเมนูจะถามตัวนี้ทุก 120 วิ ใน PR-3) กับของประกอบการ์ด (จ่ายเฉพาะตอนเปิดจอ)
//    ⇒ ชั้นแรกต้องไม่แตะชื่อ · เครื่อง · พื้นที่ เลยสักคำขอ
// ⚠️ supabase ปลอมที่ **กรองแถวจริง** ตามตัวกรองที่ query ส่งมา (eq/in/gte/lt/or …) — เทสต์จึงจับได้ทั้ง
//    "ส่งตัวกรองผิด" และ "ลืมกรอง" · ไม่มี client จริงในไฟล์นี้ (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { addDays } from '../../datePeriods.js';

/* ⚠️ visitsRepo ลาก `@/lib/http` → `next/headers` (ทางเดียวกับ visitDelete.test.mjs) — ต่อ hook ก่อน import */
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { return n(s === 'next/headers' ? 'next/headers.js' : s, c); }",
));
const { BROKEN_ASSETS_SHOWN, SENT_BACK_DAYS, enrichMyWork, loadMyWorkRows } = await import('../visitsRepo.js');

/* ── supabase ปลอม: ตารางเป็นลิสต์แถว · builder จดทุก op แล้วกรองตอน await ─────────────── */
function matchesOr(row, expr) {
  return String(expr).split(',').some((clause) => {
    const [col, op, ...rest] = clause.split('.');
    const value = rest.join('.');
    if (op === 'eq') return String(row[col] ?? '') === value;
    if (op === 'cs') {
      const want = JSON.parse(value);
      const have = Array.isArray(row[col]) ? row[col].map(String) : [];
      return want.every((v) => have.includes(String(v)));
    }
    throw new Error(`fake or: ไม่รู้จัก ${op}`);
  });
}

function applyOps(rows, ops) {
  let out = [...rows];
  const orders = [];
  let range = null;
  let limit = null;
  let single = false;
  for (const [name, ...args] of ops) {
    const [col, value] = args;
    if (name === 'eq') out = out.filter((r) => String(r[col] ?? '') === String(value));
    else if (name === 'in') out = out.filter((r) => value.map(String).includes(String(r[col] ?? '')));
    else if (name === 'gte') out = out.filter((r) => r[col] != null && String(r[col]) >= String(value));
    else if (name === 'lte') out = out.filter((r) => r[col] != null && String(r[col]) <= String(value));
    else if (name === 'lt') out = out.filter((r) => r[col] != null && String(r[col]) < String(value));
    else if (name === 'or') out = out.filter((r) => matchesOr(r, col));
    else if (name === 'order') orders.push([col, value?.ascending !== false]);
    else if (name === 'range') range = args;
    else if (name === 'limit') limit = col;
    else if (name === 'maybeSingle' || name === 'single') single = true;
    else if (name !== 'select') throw new Error(`fake: ไม่รู้จัก op ${name}`);
  }
  out.sort((a, b) => {
    for (const [col, asc] of orders) {
      const x = a[col] ?? null;
      const y = b[col] ?? null;
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      return (String(x) < String(y) ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  });
  if (range) out = out.slice(range[0], range[1] + 1);
  if (limit != null) out = out.slice(0, limit);
  return single ? (out[0] || null) : out;
}

function fakeSupabase(tables = {}, { users = {}, failTable = null } = {}) {
  const calls = [];
  const asked = [];
  const from = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve, reject) => Promise.resolve(table === failTable
            ? { data: null, error: { message: `อ่าน ${table} ไม่สำเร็จ` } }
            : { data: applyOps(tables[table] || [], q.ops), error: null }).then(resolve, reject);
        }
        return (...args) => { q.ops.push([prop, ...args]); return builder; };
      },
    });
    return builder;
  };
  const auth = {
    admin: {
      async getUserById(id) {
        asked.push(id);
        const hit = users[id];
        if (hit instanceof Error) throw hit;
        if (!hit) return { data: { user: null }, error: { status: 404, message: 'User not found' } };
        return { data: { user: { id, email: `${id}@x`, user_metadata: { name: hit } } }, error: null };
      },
    },
  };
  const opsOf = (q, name) => q.ops.filter(([n]) => n === name).map(([, ...args]) => args);
  return { from, auth, calls, asked, opsOf, tablesRead: () => [...new Set(calls.map((c) => c.table))].sort() };
}

/* ── ชุดข้อมูล ─────────────────────────────────────────────────────────────── */
const TODAY = '2026-09-28';
const ME = 'U-TECH';
const visit = (id, o = {}) => ({
  id, code: `SV-${id}`, kind: 'refill', siteId: 'S1', requestId: null,
  scheduledDate: TODAY, startTime: '09:00', status: 'scheduled', actualDate: null,
  assigneeId: ME, assigneeName: 'ช่างเอ', assistantIds: [], createdAt: '2026-09-01T00:00:00Z',
  ...o,
});
const VISITS = [
  visit('V-TODAY', { assistantIds: ['U-NP'] }),
  visit('V-HELP', { siteId: 'S2', scheduledDate: addDays(TODAY, 2), assigneeId: 'U-OT', assigneeName: 'หัวหน้าทีม', assistantIds: [ME, 'U-NP'] }),
  visit('V-DONE', { status: 'done', startTime: '08:00', actualDate: TODAY }),
  visit('V-DRAFT', { status: 'draft', scheduledDate: addDays(TODAY, 1) }),
  visit('V-CANC', { status: 'cancelled' }),
  visit('V-RESCH', { status: 'rescheduled' }),
  visit('V-OLD', { scheduledDate: addDays(TODAY, -200) }),
  visit('V-OLDRUN', { status: 'in_progress', scheduledDate: addDays(TODAY, -3) }),
  visit('V-OLDDONE', { status: 'done', scheduledDate: addDays(TODAY, -20), actualDate: addDays(TODAY, -20) }),
  visit('V-OTHER', { assigneeId: 'U-X', assigneeName: 'คนอื่น' }),
  visit('V-SURV', {
    kind: 'survey', requestId: 'RQ1', siteId: 'S9', status: 'done',
    scheduledDate: addDays(TODAY, -3), actualDate: addDays(TODAY, -3),
  }),
];
const ASSETS = [
  { id: 'A1', siteId: 'S1', code: 'OV-01', label: 'เครื่อง 1', status: 'active', condition: 'ok', floor: 'ชั้น 1', spot: 'ล็อบบี้' },
  { id: 'A2', siteId: 'S1', code: 'OV-07', label: 'เครื่อง 7', status: 'active', condition: 'broken', floor: 'ชั้น 2', spot: 'ห้องประชุม' },
  { id: 'A3', siteId: 'S1', code: 'OV-05', label: 'เครื่อง 5', status: 'active', condition: 'broken', floor: 'ชั้น 1', spot: 'หน้าลิฟต์' },
  { id: 'A4', siteId: 'S1', code: 'OV-06', label: 'เครื่อง 6', status: 'active', condition: 'broken', floor: null, spot: null },
  { id: 'A5', siteId: 'S1', code: 'OV-09', label: 'ถอดแล้ว', status: 'removed', condition: 'broken', floor: null, spot: null },
  { id: 'B1', siteId: 'S2', code: 'OV-20', label: 'เครื่อง 20', status: 'active', condition: 'ok', floor: null, spot: null },
];
const ZONES = [
  { id: 'Z1', requestId: 'RQ1', status: 'ok' },
  { id: 'Z2', requestId: 'RQ1', status: 'added' },
  { id: 'Z3', requestId: 'RQ1', status: 'cut' },
];
const SEND_BACK = {
  id: 'EU-1', entityType: 'dept_request', entityId: 'RQ1', kind: 'send_back',
  body: 'หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — ถ่ายภาพกว้างโซน 2', meta: { note: 'ถ่ายภาพกว้างโซน 2', items: ['ถ่ายภาพกว้างโซน 2'] },
  authorId: 'U-HEAD', authorName: 'หัวหน้า', createdAt: '2026-09-26T03:00:00.000Z',
};
const SEND_BACK_DONE = {
  id: 'EU-2', entityType: 'dept_request', entityId: 'RQ1', kind: 'send_back_done',
  body: 'ช่างแจ้งว่าแก้แล้ว', meta: {}, authorId: ME, authorName: 'ช่างเอ', createdAt: '2026-09-27T03:00:00.000Z',
};
const REQUEST = { id: 'RQ1', status: 'in_progress', answeredAt: null, closedAt: null, cancelledAt: null };
const USERS = { 'U-NP': 'Nattawut', 'U-OT': 'หัวหน้าทีม', [ME]: 'ช่างเอ' };

const db = (o = {}) => ({
  service_visits: VISITS, service_assets: ASSETS, service_survey_zones: ZONES,
  entity_updates: [SEND_BACK], dept_requests: [REQUEST], ...o,
});
const WINDOW = { from: TODAY, to: addDays(TODAY, 13), today: TODAY };
const ids = (rows) => rows.map((r) => r.id);
const visitQueries = (s) => s.calls.filter((c) => c.table === 'service_visits');
/* คำขอ "นัดที่จอประเมินเปิด" (ทั้งใบ · ทุกคน) — ถามตาม `requestId` ไม่ใช่ตามคน */
const isScreenQuery = (s, q) => s.opsOf(q, 'in').some(([col]) => col === 'requestId');
const myVisitQueries = (s) => visitQueries(s).filter((q) => !isScreenQuery(s, q));

/* ── loadMyWorkRows ─────────────────────────────────────────────────────────── */
test('⭐ คิวของฉัน: คนไปหรือผู้ช่วยเท่านั้น · ตัดร่าง/ยกเลิก/เลื่อนที่ server · ปิดแล้ววันนี้ยังอยู่ (ปฏิทินนับด้วย)', async () => {
  const s = fakeSupabase(db());
  const rows = await loadMyWorkRows(s, { assigneeId: ME, ...WINDOW });
  assert.deepEqual(ids(rows.visits), ['V-DONE', 'V-TODAY', 'V-HELP']);
  // ทุกคำขอนัดของฉันถือ id ของฉันตัวเดียว (ไม่มีทางยาวถึงเพดาน 16 KB · ไม่มีใครอื่นหลุดเข้ามา)
  for (const q of myVisitQueries(s)) {
    const ors = s.opsOf(q, 'or');
    assert.equal(ors.length, 1);
    assert.equal(ors[0][0], `assigneeId.eq.${ME},assistantIds.cs.["${ME}"]`);
  }
});

test('🔴 ทุกคำขอของนัดไล่หน้าด้วย fetchAll + ลำดับนิ่งปิดท้ายที่ id', async () => {
  const s = fakeSupabase(db());
  await loadMyWorkRows(s, { assigneeId: ME, ...WINDOW });
  assert.equal(visitQueries(s).length, 4, 'ช่วงวัน · ค้าง · ประเมินที่ปิดแล้ว · นัดที่จอเปิดของใบที่ค้าง');
  for (const q of visitQueries(s)) {
    assert.deepEqual(s.opsOf(q, 'range')[0], [0, 999], 'fetchAll ไล่หน้าละ 1,000');
    assert.deepEqual(s.opsOf(q, 'order').at(-1), ['id', { ascending: true }]);
  }
});

test('⭐ นัดค้าง: ไม่มีขอบล่าง (200 วันก่อนก็ยังอยู่) · เฉพาะนัดที่ยังเปิด · เรียงค้างนานสุดก่อน', async () => {
  const s = fakeSupabase(db());
  const rows = await loadMyWorkRows(s, { assigneeId: ME, ...WINDOW });
  assert.deepEqual(ids(rows.overdue), ['V-OLD', 'V-OLDRUN']);
  const overdueQuery = visitQueries(s).find((q) => s.opsOf(q, 'lt').length);
  assert.deepEqual(s.opsOf(overdueQuery, 'lt'), [['scheduledDate', TODAY]]);
  assert.equal(s.opsOf(overdueQuery, 'gte').length, 0, 'ขอบล่าง = นัดที่ลืมปิดหายจากสายตาถาวร');
  assert.deepEqual(s.opsOf(overdueQuery, 'in'), [['status', ['scheduled', 'in_progress']]]);
});

test('🔴 แถวล้วน: ไม่อ่านชื่อ · เครื่อง · พื้นที่ (ป้ายนับบนเมนูยิงทุก 120 วิ — R15)', async () => {
  const s = fakeSupabase(db(), { users: USERS });
  await loadMyWorkRows(s, { assigneeId: ME, ...WINDOW });
  assert.deepEqual(s.tablesRead(), ['dept_requests', 'entity_updates', 'service_visits']);
  assert.deepEqual(s.asked, [], 'ไม่ถามบัญชีผู้ใช้');
});

test('⭐ ส่งกลับให้แก้: นัดประเมินที่ปิดแล้วถูกส่งกลับค้าง = ขึ้น · ช่างแจ้งแก้แล้ว (send_back_done) = หาย (R16 · Q7)', async () => {
  const pending = await loadMyWorkRows(fakeSupabase(db()), { assigneeId: ME, ...WINDOW });
  assert.deepEqual(ids(pending.sentBack), ['V-SURV']);
  assert.equal(pending.sentBack[0].sendBack.note, 'ถ่ายภาพกว้างโซน 2');
  assert.deepEqual(pending.sentBack[0].sendBack.items, ['ถ่ายภาพกว้างโซน 2']);
  assert.equal(pending.sentBack[0].sendBack.at, SEND_BACK.createdAt);

  const done = await loadMyWorkRows(fakeSupabase(db({ entity_updates: [SEND_BACK, SEND_BACK_DONE] })), { assigneeId: ME, ...WINDOW });
  assert.deepEqual(done.sentBack, []);
  // ส่งกลับซ้ำหลังแจ้งแล้ว = ค้างรอบใหม่
  const again = { ...SEND_BACK, id: 'EU-3', createdAt: '2026-09-28T01:00:00.000Z' };
  const reopened = await loadMyWorkRows(fakeSupabase(db({ entity_updates: [SEND_BACK, SEND_BACK_DONE, again] })), { assigneeId: ME, ...WINDOW });
  assert.deepEqual(ids(reopened.sentBack), ['V-SURV']);
});

test('ส่งกลับให้แก้: ใบที่ส่งผล/ยกเลิก/ปิดแล้ว ไม่ค้าง (ตามที่จอประเมินเห็น) · ใบหายไป = ไม่ขึ้น', async () => {
  for (const lock of [{ answeredAt: '2026-09-27T05:00:00Z' }, { cancelledAt: '2026-09-27T05:00:00Z' }, { status: 'closed' }]) {
    const rows = await loadMyWorkRows(fakeSupabase(db({ dept_requests: [{ ...REQUEST, ...lock }] })), { assigneeId: ME, ...WINDOW });
    assert.deepEqual(rows.sentBack, [], JSON.stringify(lock));
  }
  const gone = await loadMyWorkRows(fakeSupabase(db({ dept_requests: [] })), { assigneeId: ME, ...WINDOW });
  assert.deepEqual(gone.sentBack, []);
});

test('ส่งกลับให้แก้: ปิดแบบทำไม่ได้ · ปิดเกิน 31 วัน · ใบที่มีนัดเปิดอยู่แล้ว = ไม่ขึ้น', async () => {
  const survey = (id, o) => visit(id, { kind: 'survey', requestId: 'RQ1', siteId: 'S9', status: 'done', ...o });
  const unable = [survey('V-UN', { status: 'unable', actualDate: addDays(TODAY, -2) })];
  const old = [survey('V-40', { actualDate: addDays(TODAY, -(SENT_BACK_DAYS + 1)) })];
  const reopened = [
    survey('V-S1', { scheduledDate: addDays(TODAY, -3), actualDate: addDays(TODAY, -3) }),
    survey('V-S2', { status: 'scheduled', scheduledDate: TODAY }),
  ];
  for (const rows of [unable, old]) {
    const s = fakeSupabase(db({ service_visits: rows }));
    const out = await loadMyWorkRows(s, { assigneeId: ME, ...WINDOW });
    assert.deepEqual(out.sentBack, []);
    assert.ok(!s.tablesRead().includes('entity_updates'), 'ไม่มีนัดให้ถาม = ไม่อ่านเธรด');
  }
  const out = await loadMyWorkRows(fakeSupabase(db({ service_visits: reopened })), { assigneeId: ME, ...WINDOW });
  assert.deepEqual(ids(out.visits), ['V-S2']);
  assert.deepEqual(out.sentBack, [], 'จอประเมินพาไปนัดที่เปิดอยู่ ซึ่งอยู่ในคิววันนี้แล้ว');
});

/* 🐞 review S2 28/09 — ช่องค้างต้องเลือกนัดตัวเดียวกับจอประเมิน (`findSurveyVisit` preferOpen:
   นัดที่ยังกินสิทธิ์ของใบก่อน · ไม่มีก็ใบล่าสุดตาม createdAt ทุกสถานะ ทุกคน) ไม่งั้นการ์ดค้างเปิดแล้วไม่มีอะไรให้ทำ */
const SURV = { kind: 'survey', requestId: 'RQ1', siteId: 'S9', createdAt: '2026-09-20T00:00:00Z' };
const MINE = visit('V-SURV', { ...SURV, status: 'done', scheduledDate: addDays(TODAY, -3), actualDate: addDays(TODAY, -3) });
const sentBackWith = async (extra, window = WINDOW) => {
  const s = fakeSupabase(db({ service_visits: [MINE, ...extra] }));
  return { s, out: await loadMyWorkRows(s, { assigneeId: ME, ...window }) };
};

test('🔴 ส่งกลับให้แก้: ใบที่มีนัดใหม่กว่าของช่างอีกคน = ไม่ขึ้น (จอเปิดนัดของเขา · ฉัน canWrite=false)', async () => {
  const other = { ...SURV, assigneeId: 'U-B', assigneeName: 'ช่างบี', createdAt: '2026-09-25T00:00:00Z' };
  for (const theirs of [
    visit('V-B', { ...other, status: 'done', scheduledDate: addDays(TODAY, -1), actualDate: addDays(TODAY, -1) }),
    visit('V-B', { ...other, status: 'scheduled', scheduledDate: addDays(TODAY, 5) }),
  ]) {
    const { s, out } = await sentBackWith([theirs]);
    assert.deepEqual(out.sentBack, [], theirs.status);
    // คำขอนัดทั้งใบไม่กรองคน — ของช่างอีกคนคือตัวที่จอเห็นจริง
    const screen = visitQueries(s).filter((q) => isScreenQuery(s, q));
    assert.equal(screen.length, 1);
    assert.equal(s.opsOf(screen[0], 'or').length, 0);
    assert.equal(s.opsOf(screen[0], 'eq').length, 0, 'ทุกชนิด · ทุกสถานะ (findSurveyVisit กรองแค่ requestId)');
    assert.deepEqual(s.opsOf(screen[0], 'range')[0], [0, 999], 'fetchAll ไล่หน้า');
  }
});

test('🔴 ส่งกลับให้แก้: นัดเปิดของฉันที่อยู่นอกช่วงวัน = ไม่ขึ้น · ช่องค้างไม่เปลี่ยนตามช่วงวันที่ขอ', async () => {
  const revisit = visit('V-RE', { ...SURV, status: 'scheduled', scheduledDate: addDays(TODAY, 20), createdAt: '2026-09-27T00:00:00Z' });
  for (const to of [13, 30]) {
    const { out } = await sentBackWith([revisit], { from: TODAY, to: addDays(TODAY, to), today: TODAY });
    assert.deepEqual(out.sentBack, [], `ช่วง วันนี้…+${to}`);
  }
  // นัดค้างชนะแม้สร้างก่อน (ร่างก็กินสิทธิ์ของใบ — REQUEST_SLOT_VISIT_STATES)
  const olderDraft = visit('V-DR', { ...SURV, status: 'draft', scheduledDate: addDays(TODAY, 2), createdAt: '2026-09-01T00:00:00Z' });
  assert.deepEqual((await sentBackWith([olderDraft])).out.sentBack, []);
});

test('🔴 ส่งกลับให้แก้: นัดล่าสุดของใบถูกยกเลิก = ไม่ขึ้น (จอเปิดนัดที่ยกเลิก ไม่มีแถบ) · นัดเก่ากว่าไม่บังของฉัน', async () => {
  const cancelled = visit('V-CX', { ...SURV, status: 'cancelled', scheduledDate: addDays(TODAY, 1), createdAt: '2026-09-26T00:00:00Z' });
  assert.deepEqual((await sentBackWith([cancelled])).out.sentBack, []);
  const olderUnable = visit('V-OLDUN', {
    ...SURV, assigneeId: 'U-B', status: 'unable', scheduledDate: addDays(TODAY, -10), actualDate: addDays(TODAY, -10), createdAt: '2026-09-10T00:00:00Z',
  });
  const olderCancelled = { ...cancelled, id: 'V-OLDCX', createdAt: '2026-09-05T00:00:00Z' };
  assert.deepEqual(ids((await sentBackWith([olderUnable, olderCancelled])).out.sentBack), ['V-SURV']);
});

test('วันปกติ (ไม่มีใครส่งกลับ) ไม่ถามใบคำร้อง · ทั้งฝ่าย (scope=team) ไม่ถามส่งกลับเลย', async () => {
  const quiet = fakeSupabase(db({ entity_updates: [] }));
  await loadMyWorkRows(quiet, { assigneeId: ME, ...WINDOW });
  assert.ok(!quiet.tablesRead().includes('dept_requests'));
  assert.equal(visitQueries(quiet).filter((q) => isScreenQuery(quiet, q)).length, 0, 'ไม่ถามนัดทั้งใบด้วย');

  const team = fakeSupabase(db());
  const rows = await loadMyWorkRows(team, { assigneeId: null, ...WINDOW });
  assert.deepEqual(rows.sentBack, []);
  assert.equal(visitQueries(team).length, 2);
  assert.ok(ids(rows.visits).includes('V-OTHER'), 'ทั้งฝ่าย = ไม่กรองคน');
  for (const q of visitQueries(team)) assert.equal(team.opsOf(q, 'or').length, 0);
});

/* ── enrichMyWork ───────────────────────────────────────────────────────────── */
const enriched = async (o = {}, opts = {}) => {
  const s = fakeSupabase(db(o.tables), { users: USERS, ...o.fake });
  const rows = await loadMyWorkRows(s, { assigneeId: ME, ...WINDOW });
  const before = s.calls.length;
  const work = await enrichMyWork(s, rows, { personId: ME, viewerId: ME, ...opts });
  return { s, work, enrichCalls: s.calls.slice(before) };
};
const byId = (work) => new Map([...work.visits, ...work.overdue, ...work.sentBack].map((v) => [v.id, v]));

test('⭐ ชื่อผู้ช่วยถามครั้งเดียวต่อคนทั้งคำตอบ (C10) · คนไปใช้ชื่อบนนัด · you = คนเปิดจอ', async () => {
  const { s, work } = await enriched();
  assert.deepEqual([...s.asked].sort(), ['U-NP', ME], 'U-NP เป็นผู้ช่วยสองนัด ถามครั้งเดียว · คนไป (U-OT) ใช้ชื่อบนนัด ไม่ถาม');
  const today = byId(work).get('V-TODAY');
  assert.deepEqual(today.crew, [
    { id: ME, name: 'ช่างเอ', lead: true, you: true },
    { id: 'U-NP', name: 'Nattawut', lead: false, you: false },
  ]);
  const help = byId(work).get('V-HELP');
  assert.deepEqual(help.crew.map((c) => [c.name, c.lead, c.you]), [['หัวหน้าทีม', true, false], ['ช่างเอ', false, true], ['Nattawut', false, false]]);
});

test('⭐ crewRole = บทบาทของเจ้าของคิว (หัวหน้าที่ดูแทนเห็นบทบาทของช่าง) · you = คนเปิดจอ', async () => {
  const mine = byId((await enriched()).work);
  assert.equal(mine.get('V-TODAY').crewRole, 'lead');
  assert.equal(mine.get('V-HELP').crewRole, 'helper');
  const cover = byId((await enriched({}, { personId: ME, viewerId: 'U-HEAD' })).work);
  assert.equal(cover.get('V-HELP').crewRole, 'helper');
  assert.ok(cover.get('V-HELP').crew.every((c) => !c.you), 'หัวหน้าไม่ได้อยู่บนนัด');
});

test('🔴 เครื่องชำรุดบอกได้ 2 ตัว (R13) · นับเฉพาะเครื่องใช้งาน (นับแถว ไม่ใช่ qty)', async () => {
  const { work, enrichCalls } = await enriched();
  const today = byId(work).get('V-TODAY');
  assert.equal(today.machineCount, 4, 'A5 ถอดแล้ว ไม่นับ');
  assert.equal(today.brokenCount, 3);
  assert.equal(BROKEN_ASSETS_SHOWN, 2);
  assert.deepEqual(today.brokenAssets, [
    { code: 'OV-05', label: 'เครื่อง 5', floor: 'ชั้น 1', spot: 'หน้าลิฟต์' },
    { code: 'OV-06', label: 'เครื่อง 6', floor: null, spot: null },
  ]);
  assert.equal(byId(work).get('V-HELP').brokenCount, 0);
  // เครื่องอ่านครั้งเดียวทุกไซต์ (ไม่ใช่รายนัด) และไม่อ่านไซต์ของนัดประเมิน
  const assetReads = enrichCalls.filter((c) => c.table === 'service_assets');
  assert.equal(assetReads.length, 1);
  const inOps = assetReads[0].ops.filter(([n]) => n === 'in');
  assert.deepEqual(inOps, [['in', 'siteId', ['S1', 'S2']]]);
});

test('นัดประเมิน: zoneCount ไม่นับพื้นที่ที่ตัด · ไม่มีตัวเลขเครื่อง · นัดงานเครื่องไม่มี zoneCount', async () => {
  const { work } = await enriched();
  const survey = byId(work).get('V-SURV');
  assert.equal(survey.zoneCount, 2);
  assert.equal(survey.machineCount, null);
  assert.deepEqual(survey.brokenAssets, []);
  assert.equal(byId(work).get('V-TODAY').zoneCount, null);
});

test('🔴 ไม่มีช่องแพ็ก/แผนรอบในคิวงาน (มติ 28/09 Q2 — จำนวนแพ็กต่อรอบอยู่ที่งานใบเดียว S9)', async () => {
  const { work, enrichCalls } = await enriched();
  for (const job of byId(work).values()) {
    for (const key of ['packageQty', 'packs', 'packsPerRound']) assert.ok(!(key in job), `${job.id}: ${key}`);
  }
  assert.ok(!enrichCalls.some((c) => /zone_terms|sales_order|service_plans/.test(c.table)), 'ไม่แตะแผน/SO');
  const src = readFileSync(new URL('../visitsRepo.js', import.meta.url), 'utf8');
  const section = src.slice(src.indexOf('// ── คิวงานของช่าง'));
  assert.doesNotMatch(section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /visitBundle|packageQty|packsPerRound/);
});

test('🔴 อ่านชื่อผู้ช่วยพลาด = ชื่อ null + crewUnknown (ไม่ล้มทั้งคิว) · อ่านเครื่อง/พื้นที่พลาด = โยน (คิวต้องขึ้น error ไม่ใช่วันว่าง)', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const { work } = await enriched({ fake: { users: { 'U-NP': new Error('fetch failed') } } });
    const today = byId(work).get('V-TODAY');
    assert.equal(today.crewUnknown, true);
    assert.deepEqual(today.crew[1], { id: 'U-NP', name: null, lead: false, you: false });
  } finally {
    console.error = original;
  }
  for (const failTable of ['service_assets', 'service_survey_zones']) {
    const s = fakeSupabase(db(), { users: USERS, failTable });
    const rows = await loadMyWorkRows(s, { assigneeId: ME, ...WINDOW });
    // error ของ supabase เป็นอ็อบเจกต์ `{ message }` ไม่ใช่ Error — fetchAll โยนตัวนั้นตรง ๆ
    await assert.rejects(enrichMyWork(s, rows, { personId: ME, viewerId: ME }), (e) => /ไม่สำเร็จ/.test(e.message), failTable);
  }
});

test('คิวว่าง = ไม่ยิงของประกอบสักคำขอ', async () => {
  const s = fakeSupabase({}, { users: USERS });
  const work = await enrichMyWork(s, { visits: [], overdue: [], sentBack: [] }, { personId: ME, viewerId: ME });
  assert.deepEqual(work, { visits: [], overdue: [], sentBack: [] });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(s.asked, []);
});
