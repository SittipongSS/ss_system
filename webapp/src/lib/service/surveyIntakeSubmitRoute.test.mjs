// ── ประเมินจากแบบ งวด 4 — PATCH `submit`: ด่านไฟล์แบบ + วันรับผล · ตาข่ายตั้งวิธีรายพื้นที่ · กระดิ่งหัวหน้า (S4 A-6) ─────
//
// ⭐ ล็อกสี่เรื่อง:
//   ① ใบจากแบบส่งได้เมื่อมีไฟล์ในช่อง "แบบ / ผังพื้นที่ที่ให้ประเมิน" อย่างน้อยหนึ่งไฟล์ (docType `spec` ที่ไม่ใช่เอกสาร Google) ·
//      ขาดหลายอย่าง = **ข้อความเดียว** ต่อกันด้วย " · " · อ่านไฟล์พัง = 500 ไม่เขียนอะไร · ใบลงหน้างานไม่มีด่านนี้
//   ② ก่อนออกรหัสพื้นที่และเลขที่: ตั้งวิธีของแถวพื้นที่ให้ตรงกับใบ (ซ่อมรอบบันทึกร่างที่ล้ม) · ใบจากแบบที่แถวมีผลวัดหน้างาน = 409 ·
//      ใบลงหน้างานที่แถวจากแบบมีผลของหัวหน้า = ประทับในนามผู้กดส่ง (มติ 19/10 O8 = ข)
//   ③ ล้มทีละก้าวแล้วกดซ้ำ: ยังไม่ออกเลขที่ก่อนสองก้าวนั้นผ่าน
//   ④ กระดิ่งหัวหน้า TS เมื่อใบที่ส่งไม่ต้องมีนัด (ตัดสินจากแถวพื้นที่) — ครั้งเดียว กุญแจของการกดครั้งนี้ · พลาดไม่เปลี่ยน 200
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอม — hook ของ `crew/routeTestKit.mjs` ถอดตัวอ่านผู้ใช้และ client จริง
//    (ลบ env ของ Supabase ก่อน import · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง
// ⚠️ แถวไฟล์แนบในเทสต์มีรูปเดียวกับแถวจริงของ `attachments` (`listAttachments` = select('*')) — เครื่องหมายเอกสาร Google อยู่ที่
//    `metadata.kind` ไม่ใช่ `kind` แบน ๆ (ที่แบนมีแค่ในคำตอบของ API ที่จอได้)
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './crew/routeTestKit.mjs';
import { SURVEY_INTAKE_SWITCH_REASON, SURVEY_RESEED_MISMATCH_ERROR } from './surveyIntake.js';
import { surveyZoneNeedsResave } from './surveyMethod.js';

mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T03:00:00Z') });
const NOW = '2026-10-12T03:00:00.000Z';

const { PATCH: requestPatch } = await import('../../app/api/sa/requests/[id]/route.js');

async function withFlag(on, run) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'SURVEY_DRAWING_METHOD');
  const old = process.env.SURVEY_DRAWING_METHOD;
  if (on) process.env.SURVEY_DRAWING_METHOD = 'on';
  else delete process.env.SURVEY_DRAWING_METHOD;
  try {
    return await run();
  } finally {
    if (had) process.env.SURVEY_DRAWING_METHOD = old;
    else delete process.env.SURVEY_DRAWING_METHOD;
  }
}

async function quiet(run) {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

// กระดิ่งยิงแบบ fire-and-forget (นอก request scope `after` โยน ⇒ ยิงทันทีแบบไม่รอ) — รอให้คิวว่างก่อนตรวจ
const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

/* ── ฐานข้อมูลปลอม (กรองจริงตาม eq / neq / in / is · range / limit · single / maybeSingle) ───────────
   RPC `assign_dept_request_doc_no` (mig 0243) = ออกเลขเมื่อใบยังไม่มี + เขียน patch ในคำสั่งเดียว — จดเป็นคำสั่ง `rpc` */
const WRITES = ['insert', 'update', 'upsert', 'delete'];
function fakeDb(seed = {}, { hook = null, users = [] } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => structuredClone(r))]));
  const calls = [];
  const rowsOf = (t) => (tables[t] ||= []);
  const same = (a, b) => String(a ?? '') === String(b ?? '');
  const pass = (row) => ([op, col, val]) => {
    if (op === 'eq') return same(row[col], val);
    if (op === 'neq') return !same(row[col], val);
    if (op === 'in') return (val || []).some((v) => same(row[col], v));
    if (op === 'is') return (row[col] ?? null) === val;
    return true;
  };
  const exec = (q) => {
    const list = rowsOf(q.table);
    const hit = () => list.filter((row) => q.filters.every(pass(row)));
    let out;
    if (q.write === 'rpc') {
      const row = list.find((r) => same(r.id, q.args.p_id));
      if (!row) return { data: null, error: { message: 'request_not_found' } };
      if (!row.docNo) row.docNo = `${q.args.p_prefix}${'1'.padStart(q.args.p_width, '0')}`;
      Object.assign(row, structuredClone(q.args.p_patch));
      return { data: structuredClone(row), error: null };
    }
    if (q.write === 'insert') {
      out = [].concat(q.payload).map((r) => structuredClone(r));
      list.push(...out);
    } else if (q.write === 'upsert') {
      out = [].concat(q.payload).map((r) => { list.push(structuredClone(r)); return r; });
    } else if (q.write === 'update') {
      out = hit();
      for (const row of out) Object.assign(row, structuredClone(q.payload));
    } else if (q.write === 'delete') {
      out = hit();
      tables[q.table] = list.filter((row) => !out.includes(row));
    } else {
      out = hit();
    }
    if (q.limit != null) out = out.slice(0, q.limit);
    if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
    const copy = out.map((r) => structuredClone(r));
    if (q.head) return { data: null, count: copy.length, error: null };
    if (q.single === 'maybe') return { data: copy[0] ?? null, error: null };
    if (q.single === 'one') {
      return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
    }
    return { data: copy, error: null };
  };
  const api = { tables, calls };
  const run = (q) => hook?.(q, api) ?? exec(q);
  const blank = (table) => ({ table, filters: [], write: null, payload: null, select: undefined, limit: null, range: null, single: null, head: false });
  const from = (table) => {
    const q = blank(table);
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve().then(() => run(q)).then(resolve, reject);
        return (...args) => {
          if (['eq', 'neq', 'in', 'is'].includes(prop)) q.filters.push([prop, args[0], args[1]]);
          else if (WRITES.includes(prop)) { q.write = prop; q.payload = args[0]; }
          else if (prop === 'select') { q.select = args[0] ?? null; if (args[1]?.head) q.head = true; }
          else if (prop === 'limit') q.limit = args[0];
          else if (prop === 'range') q.range = [args[0], args[1]];
          else if (prop === 'maybeSingle') q.single = 'maybe';
          else if (prop === 'single') q.single = 'one';
          return builder;
        };
      },
    });
    return builder;
  };
  return Object.assign(api, {
    from,
    rpc: async (name, args) => {
      const q = { ...blank(name === 'assign_dept_request_doc_no' ? 'dept_requests' : name), write: name === 'assign_dept_request_doc_no' ? 'rpc' : null, rpc: name, args };
      calls.push(q);
      if (!q.write) return { data: null, error: null };
      return run(q);
    },
    auth: { admin: {
      listUsers: async ({ page = 1 } = {}) => ({ data: { users: page === 1 ? users : [] }, error: null }),
      getUserById: async () => ({ data: { user: null }, error: { status: 404, message: 'User not found' } }),
    } },
    writes: (table) => calls.filter((c) => c.write && (!table || c.table === table)),
    rows: (table) => rowsOf(table),
  });
}

const isDocNo = (q) => q.rpc === 'assign_dept_request_doc_no';
const isZoneMethodWrite = (q) => q.table === 'service_survey_zones' && q.write === 'update' && 'method' in (q.payload || {});
const isAttachmentRead = (q) => q.table === 'attachments' && !q.write;

/* ── คน + ของตั้งต้น ─────────────────────────────────────────────────────────────────────────── */
const SALES = { id: 'sa-1', name: 'เซลเอ', role: 'ae', team: 'KA' };
const DIRECTORY = [
  { id: 'u-head', email: 'head@example.test', user_metadata: { name: 'อานนท์' }, app_metadata: { role: 'ts_manager', department: 'TS' } },
  { id: 'u-tech', email: 'tech@example.test', user_metadata: { name: 'ช่างเอ' }, app_metadata: { role: 'ts', department: 'TS' } },
];
const RESULT = '2026-10-25';
const VISIT = '2026-10-20';
const SITE = { id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: 'C-1' };
const REGISTRY_ZONES = [{ id: 'SZN-1', siteId: 'SITE-1', code: 'ZN-0001', name: 'พื้นที่ 1', floor: 'G', isActive: true }];

const survey = (over = {}) => ({
  id: 'REQ-1', docNo: null, kind: 'site_survey', dept: 'TS', status: 'draft', variant: 'standard',
  title: 'ประเมินพื้นที่ โรงแรมทดสอบ', body: 'รายละเอียด', urgent: false, urgentReason: null,
  requestedById: 'sa-1', requestedByName: 'เซลเอ', team: 'KA',
  dealId: 'D-1', customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด', siteId: 'SITE-1',
  requestedDueDate: VISIT, requestedDueTime: '10:00', requestedResultDate: RESULT, pdrRefNo: null,
  createdAt: '2026-10-05T02:00:00+00:00', updatedAt: '2026-10-05T02:00:00+00:00',
  ...over,
});
const drawingSurvey = (over = {}) => survey({ variant: 'drawing', requestedDueDate: RESULT, requestedDueTime: null, ...over });
// แถวพื้นที่ที่ผูกทะเบียนแล้ว (ไม่ต้องออกรหัส ZN ตอนส่ง)
const zone = (n, over = {}) => ({
  id: `SZ-${n}`, requestId: 'REQ-1', zoneId: `SZN-${n}`, zoneName: `พื้นที่ ${n}`, floor: 'G', status: 'ok', sortOrder: n, ...over,
});
const drawingZones = (over = {}) => [zone(1, { method: 'drawing', ...over }), zone(2, { method: 'drawing', ...over })];
const onsiteZones = (over = {}) => [zone(1, over), zone(2, over)];
const file = (n, over = {}) => ({
  id: `ATT-${n}`, entityType: 'dept_request', entityId: 'REQ-1', docType: 'spec', fileName: `แบบ-${n}.pdf`,
  metadata: {}, createdAt: '2026-10-06T02:00:00+00:00', ...over,
});

const world = ({ req = drawingSurvey(), zones = drawingZones(), files = [file(1)], hook = null } = {}) => fakeDb({
  dept_requests: [req],
  service_survey_zones: zones,
  service_sites: [SITE],
  service_zones: REGISTRY_ZONES,
  service_visits: [],
  attachments: files,
}, { hook, users: DIRECTORY });

const submit = (db, user = SALES) => callRoute(requestPatch, {
  user, db, method: 'PATCH', path: '/api/sa/requests/REQ-1', params: { id: 'REQ-1' }, body: { action: 'submit' },
});
const FILES_ERROR = 'ยังไม่ได้แนบไฟล์ในช่อง “แบบ / ผังพื้นที่ที่ให้ประเมิน” — ประเมินจากแบบต้องมีอย่างน้อย 1 ไฟล์';
const deskBells = (db) => db.rows('notifications').filter((n) => n.kind === 'survey_desk_ready');

/* ═══ ① ช่องไฟล์บังคับ + วันรับผล ══════════════════════════════════════════════════════════════ */

test('🔴 ใบจากแบบที่ไม่มีไฟล์แบบ = 409 ประโยคของช่อง (ไม่พูดชื่อชนิดภายใน) · ไม่เขียนอะไร ไม่ออกเลขที่', async () => {
  await withFlag(true, async () => {
    const db = world({ files: [] });
    const res = await submit(db);
    assert.equal(res.status, 409);
    assert.equal(res.json.error, FILES_ERROR);
    assert.doesNotMatch(res.json.error, /spec/i);
    assert.doesNotMatch(res.json.error, /สเปก/);
    assert.deepEqual(db.writes(), []);
  });
});

test('ใบจากแบบที่มีไฟล์แบบ 1 ไฟล์ = ส่งได้ · ออกเลขที่ · สถานะรอรับเรื่อง', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await submit(db);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const [row] = db.rows('dept_requests');
    assert.equal(row.status, 'pending');
    assert.ok(row.docNo);
    assert.equal(db.calls.filter(isDocNo).length, 1);
  });
});

test('มีแต่ไฟล์ชนิดอื่น (other) = 409 · มีแต่เอกสาร Google ชนิด spec (รูปแถวจริง metadata.kind) = 409', async () => {
  await withFlag(true, async () => {
    for (const files of [
      [file(1, { docType: 'other' })],
      [file(1, { docType: 'spec', fileName: 'แบบ (Google Doc)', metadata: { kind: 'gdoc' } })],
    ]) {
      const db = world({ files });
      const res = await submit(db);
      assert.equal(res.status, 409, JSON.stringify(files));
      assert.equal(res.json.error, FILES_ERROR);
      assert.deepEqual(db.writes(), []);
    }
  });
});

test('🔴 ขาดทั้งไฟล์แบบและวันรับผล = 409 ข้อความเดียว ต่อกันด้วย " · "', async () => {
  await withFlag(true, async () => {
    const db = world({ req: drawingSurvey({ requestedResultDate: null }), files: [] });
    const res = await submit(db);
    assert.equal(res.status, 409);
    assert.equal(res.json.error, `${FILES_ERROR} · ต้องระบุวันที่ต้องการรับผลประเมิน`);
    assert.deepEqual(db.writes(), []);
  });
});

test('🔴 อ่านไฟล์แนบพัง = 500 ไม่เขียนอะไร (ไม่ใช่ "ไม่มีไฟล์" และไม่ใช่ "ผ่าน")', async () => {
  await withFlag(true, async () => {
    const db = world({ hook: (q) => (isAttachmentRead(q) ? { data: null, error: { message: 'attachments read failed' } } : undefined) });
    const res = await submit(db);
    assert.equal(res.status, 500);
    assert.deepEqual(db.writes(), []);
  });
});

test('ใบลงหน้างานที่ไม่มีไฟล์ = ส่งได้ (ไม่มีด่านไฟล์ · ไม่อ่านไฟล์แนบเลย)', async () => {
  await withFlag(true, async () => {
    const db = world({ req: survey(), zones: onsiteZones(), files: [] });
    const res = await submit(db);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(db.calls.filter(isAttachmentRead).length, 0);
    assert.equal(db.calls.filter(isZoneMethodWrite).length, 0);
  });
});

test('สวิตช์ปิด + ร่างที่เป็นจากแบบอยู่แล้ว = ส่งได้ (แถวจากแบบเดินตามกติกาของมันเสมอ)', async () => {
  await withFlag(false, async () => {
    const db = world();
    const res = await submit(db);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(db.rows('dept_requests')[0].status, 'pending');
  });
});

/* ═══ ② ตาข่ายตั้งวิธีรายพื้นที่ ═══════════════════════════════════════════════════════════════ */

test('⭐ แถวพื้นที่ไม่ตรงกับใบ (บันทึกร่างรอบก่อนตั้งวิธีไม่สำเร็จ) = ส่งตั้งให้ก่อน แล้วค่อยออกเลขที่', async () => {
  await withFlag(true, async () => {
    const db = world({ zones: onsiteZones() });
    const res = await submit(db);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(db.rows('service_survey_zones').every((row) => row.method === 'drawing'));
    const fixAt = db.calls.findIndex(isZoneMethodWrite);
    const docAt = db.calls.findIndex(isDocNo);
    assert.ok(fixAt >= 0 && docAt > fixAt, 'ตั้งวิธีก่อนออกเลขที่');
    for (const row of db.rows('service_survey_zones')) assert.equal(row.methodChangedAt, undefined);
  });
});

test('🔴 ใบจากแบบที่แถวไม่ตรงกับใบ และมีผลวัดหน้างาน = 409 MISMATCH · ไม่เขียนทับ · ไม่ออกเลขที่', async () => {
  await withFlag(true, async () => {
    const db = world({ zones: onsiteZones({ surveyedAt: '2026-10-07T02:00:00+00:00' }) });
    const res = await submit(db);
    assert.equal(res.status, 409);
    assert.equal(res.json.error, SURVEY_RESEED_MISMATCH_ERROR);
    assert.equal(db.calls.filter(isDocNo).length, 0);
    assert.deepEqual(db.writes(), []);
  });
});

test('⭐ O8 ข · ใบลงหน้างานที่แถวจากแบบยังมีผลของหัวหน้า (ตอนบันทึกร่างประทับไม่สำเร็จ) = ส่งประทับในนามผู้กดส่งก่อน แล้วค่อยออกเลขที่', async () => {
  await withFlag(true, async () => {
    const db = world({ req: survey(), zones: drawingZones({ surveyedAt: '2026-10-07T02:00:00+00:00', updatedAt: '2026-10-07T02:00:00+00:00' }), files: [] });
    const res = await submit(db);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const fixAt = db.calls.findIndex(isZoneMethodWrite);
    const docAt = db.calls.findIndex(isDocNo);
    assert.ok(fixAt >= 0 && docAt > fixAt, 'ประทับก่อนออกเลขที่');
    for (const row of db.rows('service_survey_zones')) {
      assert.equal(row.method, 'onsite');
      assert.equal(row.methodReason, SURVEY_INTAKE_SWITCH_REASON);
      assert.equal(row.methodChangedByName, 'เซลเอ');
      assert.equal(surveyZoneNeedsResave(row), true, 'ช่างต้องวัดใหม่');
    }
    assert.equal(db.rows('dept_requests')[0].status, 'pending');
  });
});

/* ═══ ③ ล้มทีละก้าว แล้วกดซ้ำ ════════════════════════════════════════════════════════════════ */

test('ตั้งวิธีของพื้นที่ล้ม = 409 ไม่ออกเลขที่ · กดส่งซ้ำ = ผ่าน', async () => {
  await withFlag(true, async () => {
    let failed = 0;
    const db = world({
      zones: onsiteZones(),
      hook: (q) => {
        if (isZoneMethodWrite(q) && failed === 0) { failed += 1; return { data: null, error: { message: 'update ล้ม' } }; }
        return undefined;
      },
    });
    const first = await submit(db);
    assert.equal(first.status, 409);
    assert.equal(first.json.error, 'ตั้งวิธีประเมินของพื้นที่ไม่สำเร็จ — กด “ส่งคำร้อง” อีกครั้ง');
    assert.equal(db.calls.filter(isDocNo).length, 0);
    assert.equal(db.rows('dept_requests')[0].status, 'draft');

    const again = await submit(db);
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal(db.rows('dept_requests')[0].status, 'pending');
    assert.ok(db.rows('service_survey_zones').every((row) => row.method === 'drawing'));
  });
});

test('ออกรหัสพื้นที่ล้มหลังตั้งวิธีสำเร็จ = 409 ไม่ออกเลขที่ · กดส่งซ้ำ = ไม่มีงานตั้งวิธีแล้ว ผูกพื้นที่ต่อจนผ่าน', async () => {
  await withFlag(true, async () => {
    let failed = 0;
    // พื้นที่ใหม่ (ยังไม่มี zoneId) ชื่อตรงกับโซนในทะเบียน ⇒ ตอนส่งผูกเข้าโซนเดิม · ตัวออกรหัสอ่านไซต์ก่อน
    const zones = [zone(1, { zoneId: null })];
    const db = world({
      zones,
      hook: (q) => {
        if (q.table === 'service_sites' && !q.write && q.select === 'id, code' && failed === 0) {
          failed += 1;
          return { data: null, error: { message: 'อ่านไซต์ไม่สำเร็จ' } };
        }
        return undefined;
      },
    });
    const first = await submit(db);
    assert.equal(first.status, 409);
    assert.equal(first.json.error, 'อ่านไซต์ไม่สำเร็จ');
    assert.equal(db.calls.filter(isDocNo).length, 0);
    assert.equal(db.calls.filter(isZoneMethodWrite).length, 1, 'รอบแรกตั้งวิธีไปแล้ว');
    assert.equal(db.rows('service_survey_zones')[0].method, 'drawing');

    const again = await submit(db);
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal(db.calls.filter(isZoneMethodWrite).length, 1, 'รอบสองไม่มีงานตั้งวิธี');
    assert.equal(db.rows('service_survey_zones')[0].zoneId, 'SZN-1');
    assert.equal(db.rows('dept_requests')[0].status, 'pending');
  });
});

/* ═══ ④ กระดิ่งหัวหน้า ═══════════════════════════════════════════════════════════════════════ */

test('⭐ ส่งใบที่ทุกพื้นที่เป็นจากแบบ = กระดิ่งหัวหน้า TS หนึ่งครั้ง กุญแจ submit|<เวลากด>', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await submit(db);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    await settle();
    const bells = deskBells(db);
    assert.equal(bells.length, 1, JSON.stringify(db.rows('notifications')));
    const [bell] = bells;
    assert.equal(bell.userId, 'u-head');
    assert.equal(bell.updateId, `survey-desk-ready:REQ-1:submit|${NOW}`);
    assert.equal(bell.title, `คำร้องประเมินจากแบบ ${db.rows('dept_requests')[0].docNo} — รอหัวหน้าประเมิน`);
  });
});

test('ส่งใบลงหน้างาน = ไม่มีกระดิ่งหัวหน้า', async () => {
  await withFlag(true, async () => {
    const db = world({ req: survey(), zones: onsiteZones(), files: [] });
    const res = await submit(db);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    await settle();
    assert.equal(deskBells(db).length, 0);
  });
});

test('กระดิ่งหัวหน้าพลาด = คำตอบยัง 200 ใบส่งแล้ว', async () => {
  await withFlag(true, async () => {
    const db = world({
      hook: (q) => {
        const rows = [].concat(q.payload || []);
        if (q.table === 'notifications' && q.write && rows.some((r) => r?.kind === 'survey_desk_ready')) {
          return { data: null, error: { message: 'notifications ล้ม' } };
        }
        return undefined;
      },
    });
    const res = await quiet(async () => {
      const out = await submit(db);
      await settle();
      return out;
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(db.rows('dept_requests')[0].status, 'pending');
    assert.equal(deskBells(db).length, 0);
  });
});
