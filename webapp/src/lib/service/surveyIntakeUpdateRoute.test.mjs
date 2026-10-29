// ── ประเมินจากแบบ งวด 4 — PATCH `update`: แก้ร่าง/สลับวิธีประเมินจากฟอร์มเดียวกับตอนสร้าง (S4 A-5 · A-7) ─────────
//
// ⭐ ล็อกห้าเรื่อง:
//   ① 🔴 ถดถอย 0351: ฟอร์มแก้ส่ง `variant` มาทุกครั้ง ⇒ ทุกหัวข้อที่ไม่ใช่ของเลิกใช้ต้องบันทึกได้ · ไม่มี `variant: null` ·
//      หัวข้อที่ไม่มีรูปแบบไม่มีคีย์ `variant` ในคำสั่งเขียนเลย
//   ② ประเมินพื้นที่: สลับวิธีบนร่าง (สวิตช์เปิด) · ขอสลับไปจากแบบขณะสวิตช์ปิด = 409 · ใบที่เป็นจากแบบอยู่แล้วแก้ต่อได้ ·
//      ส่งแล้ว = ล็อก (ประโยคของทะเบียน) · วันของใบจากแบบ = กระจกของวันรับผล ไม่มีเวลา
//   ③ ร่างที่ถูกตีกลับหลังหัวหน้าบันทึกผลแล้ว (มติเจ้าของ 19/10 · O8 = ข): สลับเป็นลงหน้างาน = 200 + แถวที่มีผลถูกประทับ
//      ในนามฝ่ายขาย (ด่านขนาดของช่างบังคับวัดใหม่) · 🔴 สลับเป็นจากแบบทั้งที่แถวมีผลลงหน้างาน = 409 **ไม่เขียนอะไรเลย** (รวม `variant`)
//   ④ ประโยคเธรด/audit ของการสลับใช้ป้ายของหัวข้อ ("วิธีประเมิน") · พัฒนาสูตรได้ "รูปแบบงาน" เท่าเดิมทุกตัวอักษร
//   ⑤ ล้มทีละก้าวแล้วกดซ้ำ: หัวใบล้ม = ไม่แตะพื้นที่ · หัวใบผ่านแต่ตั้งวิธีของพื้นที่ล้ม = 200 + คำเตือน → บันทึกซ้ำซ่อมได้
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอม — hook ของ `crew/routeTestKit.mjs` ถอดตัวอ่านผู้ใช้และ client จริง
//    (ลบ env ของ Supabase ก่อน import · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './crew/routeTestKit.mjs';
import { askActionUpdate } from '../costingUpdates.js';
import {
  REQUEST_KINDS, requestVariantFieldLabel, requestVariantKey, requestVariantLockText,
} from '../master/requestTypes.js';
import { SURVEY_INTAKE_SWITCH_REASON, SURVEY_RESEED_ASSESSED_ERROR, SURVEY_RESEED_MISMATCH_ERROR } from './surveyIntake.js';
import { surveyZoneNeedsResave } from './surveyMethod.js';
import { surveyZoneResaveText } from './surveyFieldView.js';

mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T03:00:00Z') });

const { GET: requestGet, PATCH: requestPatch } = await import('../../app/api/sa/requests/[id]/route.js');

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

/* เงียบ console.error ระหว่างเคสที่ตั้งใจให้ล้ม */
async function quiet(run) {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

/* ── ฐานข้อมูลปลอม (กรองจริงตาม eq / neq / in / is · range / limit · single / maybeSingle) ─────────── */
const WRITES = ['insert', 'update', 'upsert', 'delete'];
function fakeDb(seed = {}, { hook = null } = {}) {
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
  const from = (table) => {
    const q = { table, filters: [], write: null, payload: null, select: undefined, limit: null, range: null, single: null, head: false };
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
    rpc: async () => ({ data: null, error: null }),
    auth: { admin: {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      getUserById: async () => ({ data: { user: null }, error: { status: 404, message: 'User not found' } }),
    } },
    writes: (table) => calls.filter((c) => c.write && (!table || c.table === table)),
    rows: (table) => rowsOf(table),
  });
}

/* ตัวอ่าน/เขียนของการตั้งวิธีรายพื้นที่ (`reseedSurveyZoneMethods`) — คำสั่งอ่านเดียวที่เลือก `methodChangedAt` */
const isReseedRead = (q) => q.table === 'service_survey_zones' && !q.write && /methodChangedAt/.test(String(q.select || ''));
const isZoneWrite = (q) => q.table === 'service_survey_zones' && !!q.write;
const isHeadUpdate = (q) => q.table === 'dept_requests' && q.write === 'update';

/* ── คน + ของตั้งต้น ─────────────────────────────────────────────────────────────────────────── */
const SALES = { id: 'sa-1', name: 'เซลเอ', role: 'ae', team: 'KA' };
const HEAD = { id: 'u-head', name: 'อานนท์', role: 'ts_manager', department: 'TS' };
const VISIT = '2026-10-20';
const RESULT = '2026-10-25';
const SITE = { id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: 'C-1' };

const base = (over = {}) => ({
  id: 'REQ-1', docNo: null, dept: 'RD', status: 'draft',
  title: 'คำร้องทดสอบ', body: 'รายละเอียด', urgent: false, urgentReason: null,
  requestedById: 'sa-1', requestedByName: 'เซลเอ', team: 'KA',
  dealId: 'D-1', customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด',
  requestedDueDate: VISIT, pdrRefNo: null,
  createdAt: '2026-10-05T02:00:00+00:00', updatedAt: '2026-10-05T02:00:00+00:00',
  ...over,
});
const survey = (over = {}) => base({
  kind: 'site_survey', dept: 'TS', variant: 'standard', title: 'ประเมินพื้นที่ โรงแรมทดสอบ',
  siteId: 'SITE-1', requestedDueTime: '10:00', requestedResultDate: RESULT, ...over,
});
// ใบที่ยื่นเป็นจากแบบ — `requestedDueDate` ถือกระจกของวันรับผล
const drawingSurvey = (over = {}) => survey({ variant: 'drawing', requestedDueDate: RESULT, requestedDueTime: null, ...over });
const zone = (n, over = {}) => ({
  id: `SZ-${n}`, requestId: 'REQ-1', zoneId: null, zoneName: `พื้นที่ ${n}`, floor: 'G', status: 'ok', sortOrder: n, note: null, ...over,
});
const onsiteZones = () => [zone(1), zone(2)];
const drawingZones = (over = {}) => [zone(1, { method: 'drawing', ...over }), zone(2, { method: 'drawing', ...over })];

const world = ({ req = survey(), zones = onsiteZones(), items = [], hook = null } = {}) => fakeDb({
  dept_requests: [req],
  dept_request_items: items,
  service_survey_zones: zones,
  service_sites: [SITE],
  service_visits: [],
}, { hook });

/* body ที่ฟอร์มแก้ส่ง — ฟอร์มเดียวกับตอนสร้าง · `variant` = รูปแบบของแถว (ว่าง = หัวข้อที่ไม่มีรูปแบบ) */
const editBody = (row, over = {}) => ({
  action: 'update',
  title: row.title, body: row.body, urgent: false, urgentReason: null,
  requestedDueDate: row.requestedDueDate,
  ...(row.kind === 'site_survey' ? { requestedDueTime: row.requestedDueTime ?? '', requestedResultDate: row.requestedResultDate } : {}),
  variant: requestVariantKey(row) || '',
  ...over,
});
const patch = (db, body, user = SALES) => callRoute(requestPatch, {
  user, db, method: 'PATCH', path: '/api/sa/requests/REQ-1', params: { id: 'REQ-1' }, body,
});
const headPatches = (db) => db.calls.filter(isHeadUpdate).map((c) => c.payload);
const threadBodies = (db) => db.rows('entity_updates').filter((r) => r.entityType === 'dept_request').map((r) => r.body);
const auditSummaries = (db) => db.rows('audit_logs').map((r) => r.summary);

/* ═══ ① ถดถอย 0351 — ทุกหัวข้อที่ยังเปิดใบได้ ══════════════════════════════════════════════════ */

/* แถวของแต่ละหัวข้อที่ด่านรูปทรงผ่าน — ประกอบจากของที่ใบมีอยู่แล้ว (ฟอร์มแก้ไม่ส่งบรรทัด = ไม่แตะบรรทัด) */
const KIND_FIXTURES = {
  info: () => ({ req: base({ kind: 'info' }) }),
  scent_dev: () => ({ req: base({ kind: 'scent_dev', dealId: 'D-1', salesOrderId: 'SO-1' }) }),
  formula_dev: () => ({
    req: base({ kind: 'formula_dev', variant: 'standard' }),
    items: [{ id: 'DRI-1', requestId: 'REQ-1', lineKind: 'product_dev', sortOrder: 0, label: 'หมวด 01 · กลิ่น A', categoryCode: '01', scentId: 'SC-1', qty: 1, unit: 'ชิ้น' }],
  }),
  document: () => ({
    req: base({ kind: 'document' }),
    items: [{ id: 'DRI-1', requestId: 'REQ-1', lineKind: 'document', sortOrder: 0, label: 'MSDS', spec: 'MSDS ภาษาไทย', docType: 'msds' }],
  }),
  billing_doc: () => ({
    req: base({ kind: 'billing_doc', dept: 'FN', quotationId: 'QT-1', billPercent: 50, billAmount: 5350, billBaseAmount: 10700 }),
    items: [{ id: 'DRI-1', requestId: 'REQ-1', lineKind: 'billing_doc', sortOrder: 0, label: 'ใบแจ้งหนี้', spec: 'งวด 1', docType: 'invoice' }],
  }),
  site_survey: () => ({ req: survey(), zones: onsiteZones() }),
};

test('fixture: ครบทุกหัวข้อที่ไม่ใช่ของเลิกใช้', () => {
  const live = Object.entries(REQUEST_KINDS).filter(([, meta]) => !meta.legacy).map(([kind]) => kind).sort();
  assert.deepEqual(Object.keys(KIND_FIXTURES).sort(), live);
});

test('🔴 ถดถอย 0351: ทุกหัวข้อบันทึกการแก้ได้ (สวิตช์เปิดและปิด) · ไม่มี variant: null · หัวข้อที่ไม่มีรูปแบบไม่มีคีย์ variant', async () => {
  for (const [kind, build] of Object.entries(KIND_FIXTURES)) {
    for (const on of [true, false]) {
      await withFlag(on, async () => {
        const fixture = build();
        const db = world(fixture);
        const res = await patch(db, editBody(fixture.req, { title: `${fixture.req.title} (แก้)` }));
        assert.equal(res.status, 200, `${kind} flag ${on}: ${JSON.stringify(res.json)}`);
        const [payload] = headPatches(db);
        assert.ok(payload, kind);
        assert.notEqual(payload.variant, null, kind);
        if (REQUEST_KINDS[kind].variants) assert.equal(payload.variant, requestVariantKey(fixture.req), kind);
        else assert.equal('variant' in payload, false, kind);
      });
    }
  }
});

/* ═══ ② ประเมินพื้นที่: สลับวิธีบนร่าง ════════════════════════════════════════════════════════ */

test('⭐ ร่าง ลงหน้างาน → จากแบบ (สวิตช์เปิด) = 200 · variant + กระจกวัน + ไม่มีเวลา · ทุกพื้นที่เป็นจากแบบ ไม่มี methodChangedAt', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await patch(db, editBody(survey(), { variant: 'drawing', requestedDueDate: '', requestedDueTime: '' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json._warning, undefined);
    const [payload] = headPatches(db);
    assert.equal(payload.variant, 'drawing');
    assert.equal(payload.requestedDueDate, RESULT);
    assert.equal(payload.requestedDueTime, null);
    assert.equal(payload.requestedResultDate, RESULT);
    for (const row of db.rows('service_survey_zones')) {
      assert.equal(row.method, 'drawing');
      assert.equal(row.methodChangedAt, undefined);
    }
    assert.equal(db.writes('service_survey_zones').length, 1, 'คำสั่งเดียวทั้งใบ');
  });
});

test('🔴 ร่าง ลงหน้างาน → จากแบบ ขณะสวิตช์ปิด = 409 "ยังไม่เปิดใช้…" ไม่เขียนอะไร', async () => {
  await withFlag(false, async () => {
    const db = world();
    const res = await patch(db, editBody(survey(), { variant: 'drawing' }));
    assert.equal(res.status, 409);
    assert.equal(res.json.error, 'ยังไม่เปิดใช้การประเมินจากแบบ');
    assert.deepEqual(db.writes(), []);
  });
});

test('ร่าง จากแบบ → ลงหน้างาน พร้อมวันเข้าพื้นที่ = 200 · พื้นที่กลับเป็นลงหน้างาน ไม่มี methodChangedAt', async () => {
  await withFlag(true, async () => {
    const db = world({ req: drawingSurvey(), zones: drawingZones() });
    const res = await patch(db, editBody(drawingSurvey(), { variant: 'standard', requestedDueDate: VISIT, requestedDueTime: '09:00' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const [payload] = headPatches(db);
    assert.equal(payload.variant, 'standard');
    assert.equal(payload.requestedDueDate, VISIT);
    assert.equal(payload.requestedDueTime, '09:00');
    for (const row of db.rows('service_survey_zones')) {
      assert.equal(row.method, 'onsite');
      assert.equal(row.methodChangedAt, undefined);
    }
  });
});

test('ร่าง จากแบบ → ลงหน้างาน แต่ไม่กรอกวันเข้าพื้นที่ (ฟอร์มล้างกระจกทิ้ง) = 400 ไม่เขียนอะไร', async () => {
  await withFlag(true, async () => {
    const db = world({ req: drawingSurvey(), zones: drawingZones() });
    const res = await patch(db, editBody(drawingSurvey(), { variant: 'standard', requestedDueDate: '' }));
    assert.equal(res.status, 400);
    // ประโยคพูดป้ายของช่องจริงบนฟอร์มลงหน้างาน (UAT S4 รอบ 4 ข้อ 11) — ด่านเดิม คำใหม่
    assert.equal(res.json.error, 'ต้องระบุวันที่ต้องการให้เข้าพื้นที่');
    assert.deepEqual(db.writes(), []);
  });
});

test('ใบจากแบบ: ฟอร์มส่งวันเข้าพื้นที่/เวลามาด้วย = server เขียนกระจกของวันรับผลทับ · วันรับผลไม่เทียบกับวันเข้าพื้นที่', async () => {
  await withFlag(true, async () => {
    const db = world({ req: drawingSurvey(), zones: drawingZones() });
    const res = await patch(db, editBody(drawingSurvey(), { requestedDueDate: '2026-11-30', requestedDueTime: '13:00', requestedResultDate: '2026-10-22' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const [payload] = headPatches(db);
    assert.equal(payload.requestedResultDate, '2026-10-22');
    assert.equal(payload.requestedDueDate, '2026-10-22');
    assert.equal(payload.requestedDueTime, null);
  });
});

test('🔴 ส่งแล้ว (รอรับเรื่อง · รับเรื่องแล้ว) + เปลี่ยนวิธี = 409 ประโยคล็อกของทะเบียน · วิธีเดิม = 200 (แก้หัวใบยังได้)', async () => {
  await withFlag(true, async () => {
    for (const status of ['pending', 'acknowledged']) {
      const req = survey({ status, docNo: 'RQ-AS-26100001' });
      const db = world({ req });
      const res = await patch(db, editBody(req, { variant: 'drawing' }));
      assert.equal(res.status, 409, status);
      assert.equal(res.json.error, requestVariantLockText('site_survey'));
      assert.equal(res.json.error, 'ส่งคำร้องแล้ว — เปลี่ยนวิธีประเมินได้ที่ฝ่ายบริการ (หัวหน้า TS)');
      assert.deepEqual(db.writes(), [], status);

      const same = world({ req });
      const ok = await patch(same, editBody(req, { title: 'ประเมินพื้นที่ (แก้ชื่อ)' }));
      assert.equal(ok.status, 200, `${status}: ${JSON.stringify(ok.json)}`);
      assert.equal(headPatches(same)[0].title, 'ประเมินพื้นที่ (แก้ชื่อ)');
      // ส่งแล้วไม่ตั้งวิธีของพื้นที่จากฝั่งผู้ขออีก (เป็นงานของหัวหน้า TS)
      assert.equal(same.calls.filter(isReseedRead).length, 0, status);
      assert.equal(same.writes('service_survey_zones').length, 0, status);
    }
  });
});

test('ร่างที่เป็นจากแบบอยู่แล้ว + สวิตช์ปิด: แก้ชื่อเรื่อง = 200 (สวิตช์ที่ปิดทีหลังไม่ล็อกร่างเดิม)', async () => {
  await withFlag(false, async () => {
    const db = world({ req: drawingSurvey(), zones: drawingZones() });
    const res = await patch(db, editBody(drawingSurvey(), { title: 'ประเมินพื้นที่ (แก้)' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(headPatches(db)[0].variant, 'drawing');
    assert.equal(db.writes('service_survey_zones').length, 0, 'แถวตรงกับใบอยู่แล้ว');
  });
});

test('สลับวิธีบนร่างที่หัวหน้าเคยสลับรายพื้นที่ (methodChangedAt) = บันทึก variant · ไม่แตะแถวพื้นที่', async () => {
  await withFlag(true, async () => {
    const zones = [zone(1, { method: 'drawing', methodChangedAt: '2026-10-08T02:00:00+00:00' }), zone(2)];
    const db = world({ zones });
    const res = await patch(db, editBody(survey(), { variant: 'drawing', requestedDueDate: '' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json._warning, undefined, "'switched' เงียบ");
    assert.equal(headPatches(db)[0].variant, 'drawing');
    assert.equal(db.writes('service_survey_zones').length, 0);
  });
});

test('ผู้ที่ไม่ใช่ฝั่งผู้ขอสลับวิธี = 403 ประโยคใช้ป้ายของหัวข้อ', async () => {
  await withFlag(true, async () => {
    const db = world({ req: survey({ status: 'pending', docNo: 'RQ-AS-26100001' }) });
    const res = await patch(db, editBody(survey(), { variant: 'drawing' }), HEAD);
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'สลับวิธีประเมินได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน');
    assert.deepEqual(db.writes(), []);
  });
});

/* ═══ ③ ร่างที่ถูกตีกลับพร้อมผลประเมิน ══════════════════════════════════════════════════════════ */

test('⭐ O8 ข · ร่างจากแบบที่พื้นที่มีผลประเมิน (surveyedAt) + สลับเป็นลงหน้างาน = 200 · variant บันทึก · แถวถูกประทับในนามฝ่ายขาย ด่านขนาดบังคับวัดใหม่', async () => {
  await withFlag(true, async () => {
    const zones = drawingZones({
      surveyedAt: '2026-10-07T02:00:00+00:00', surveyedByName: 'อานนท์', updatedAt: '2026-10-07T02:00:00+00:00',
      parts: [{ widthM: 4, lengthM: 5, heightM: 3 }], spots: [{ id: 's1', selected: true }],
    });
    const req = drawingSurvey({ docNo: 'RQ-AS-26100001' });
    const db = world({ req, zones });
    const res = await patch(db, editBody(req, { variant: 'standard', requestedDueDate: VISIT }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json._warning, undefined);
    assert.equal(db.rows('dept_requests')[0].variant, 'standard');
    // ด่านก่อนเขียนหัวใบ (dryRun) ไม่ตีกลับ ⇒ หัวใบเขียนก่อน แล้วค่อยประทับแถว (ลำดับเดียวกับการตั้งวิธีปกติ)
    const headAt = db.calls.findIndex(isHeadUpdate);
    const zoneAt = db.calls.findIndex(isZoneWrite);
    assert.ok(headAt >= 0 && zoneAt > headAt, 'หัวใบก่อนแถวพื้นที่');
    const stamps = db.writes('service_survey_zones');
    assert.equal(stamps.length, 2, 'ทีละแถว');
    for (const row of db.rows('service_survey_zones')) {
      assert.equal(row.method, 'onsite');
      assert.equal(row.methodReason, SURVEY_INTAKE_SWITCH_REASON);
      assert.equal(row.methodChangedByName, 'เซลเอ', 'ชื่อฝ่ายขายที่กดบันทึก');
      assert.equal(row.methodChangedAt, '2026-10-12T03:00:00.000Z');
      assert.deepEqual(row.spots, [{ id: 's1', selected: false }]);
      assert.equal(row.surveyedAt, '2026-10-07T02:00:00+00:00', 'ผลเดิมคงอยู่ — ช่างตรวจกับของจริงแล้วบันทึกทับ');
      assert.equal(surveyZoneNeedsResave(row), true);
      assert.equal(surveyZoneResaveText(row, []), 'พื้นที่นี้เพิ่งกลับมาเป็นลงหน้างาน — ตรวจขนาดและภาพกว้างแล้วกดบันทึกอีกครั้ง');
    }
    assert.ok(threadBodies(db).includes('ผู้ขอสลับวิธีประเมินเป็น ลงหน้างาน — ตรวจรายละเอียดอีกครั้งก่อนรับเรื่อง'), threadBodies(db).join('\n'));

    // บันทึกซ้ำ = ไม่มีงาน ไม่ประทับซ้ำ (ตราของฝ่ายขายไม่ใช่ "หัวหน้าสลับแล้ว")
    const again = await patch(db, editBody(db.rows('dept_requests')[0]));
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal(db.writes('service_survey_zones').length, 2);
  });
});

test('⭐ O8 ข · ร่างจากแบบที่ไม่มีแถวไหนมีผล + สลับเป็นลงหน้างาน = แถวได้ { method, updatedAt } เท่าเดิม ไม่มีตรา', async () => {
  await withFlag(true, async () => {
    const req = drawingSurvey({ docNo: 'RQ-AS-26100001' });
    const db = world({ req, zones: drawingZones() });
    const res = await patch(db, editBody(req, { variant: 'standard', requestedDueDate: VISIT }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const writes = db.writes('service_survey_zones');
    assert.equal(writes.length, 1);
    assert.deepEqual(Object.keys(writes[0].payload).sort(), ['method', 'updatedAt']);
    for (const row of db.rows('service_survey_zones')) {
      assert.equal(row.method, 'onsite');
      assert.equal(row.methodChangedAt, undefined);
      assert.equal(row.methodReason, undefined);
      assert.equal(surveyZoneNeedsResave(row), false);
    }
  });
});

test('🔴 ร่างลงหน้างานที่พื้นที่มีผลวัดหน้างาน (surveyedAt) + สลับเป็นจากแบบ = 409 ASSESSED · ไม่เขียนอะไรเลย (variant ยังเป็นลงหน้างาน)', async () => {
  await withFlag(true, async () => {
    const zones = onsiteZones().map((z) => ({ ...z, surveyedAt: '2026-10-07T02:00:00+00:00' }));
    const req = survey({ docNo: 'RQ-AS-26100001' });
    const db = world({ req, zones });
    const res = await patch(db, editBody(req, { variant: 'drawing', requestedDueDate: '' }));
    assert.equal(res.status, 409);
    assert.equal(res.json.error, SURVEY_RESEED_ASSESSED_ERROR);
    assert.deepEqual(db.writes(), []);
    assert.equal(db.rows('dept_requests')[0].variant, 'standard');
    assert.ok(db.rows('service_survey_zones').every((row) => row.method === undefined));
  });
});

test('ร่างเดียวกัน แก้ชื่อเรื่องโดยไม่เปลี่ยนวิธี = 200 · ไม่มีการถามก่อนเขียนหัวใบ · ไม่เขียนแถวพื้นที่', async () => {
  await withFlag(true, async () => {
    const zones = drawingZones({ surveyedAt: '2026-10-07T02:00:00+00:00' });
    const req = drawingSurvey({ docNo: 'RQ-AS-26100001' });
    const db = world({ req, zones });
    const res = await patch(db, editBody(req, { title: 'ประเมินพื้นที่ (แก้)' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const headAt = db.calls.findIndex(isHeadUpdate);
    assert.ok(headAt >= 0);
    assert.equal(db.calls.slice(0, headAt).filter(isReseedRead).length, 0, 'ไม่มีการอ่านแถวพื้นที่ก่อนเขียนหัวใบ');
    assert.equal(db.writes('service_survey_zones').length, 0);
  });
});

test('🔴 อ่านแถวพื้นที่ก่อนเขียน (ตอนสลับ) พัง = 500 ไม่เขียนอะไร', async () => {
  await withFlag(true, async () => {
    const db = world({ hook: (q) => (isReseedRead(q) ? { data: null, error: { message: 'read failed' } } : undefined) });
    const res = await patch(db, editBody(survey(), { variant: 'drawing', requestedDueDate: '' }));
    assert.equal(res.status, 500);
    assert.deepEqual(db.writes(), []);
  });
});

/* ═══ ④ ประโยคเธรด / audit ════════════════════════════════════════════════════════════════════ */

test('ประโยคเธรด + audit ของการสลับ: ประเมินพื้นที่ = "วิธีประเมิน"', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await patch(db, editBody(survey(), { variant: 'drawing', requestedDueDate: '' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(threadBodies(db).includes('ผู้ขอสลับวิธีประเมินเป็น ประเมินจากแบบ — ตรวจรายละเอียดอีกครั้งก่อนรับเรื่อง'), threadBodies(db).join('\n'));
    assert.ok(auditSummaries(db).includes('สลับวิธีประเมินเป็น ประเมินจากแบบ · REQ-1'), auditSummaries(db).join('\n'));
  });
});

test('พัฒนาสูตร: ประโยคเธรดของการสลับเท่าเดิมทุกตัวอักษร ("รูปแบบงาน")', () => {
  const ask = { id: 'REQ-1', dept: 'RD' };
  const before = askActionUpdate('update', ask, { variantChange: 'NPD' });
  // route ส่งป้ายของหัวข้อมาด้วยเสมอ — ป้ายของพัฒนาสูตรคือค่าตั้งต้น ⇒ ประโยคเดียวกับก่อนงวดนี้
  const now = askActionUpdate('update', ask, { variantChange: 'NPD', variantField: requestVariantFieldLabel('formula_dev') });
  assert.equal(before.body, 'ผู้ขอสลับรูปแบบงานเป็น NPD — ตรวจรายละเอียดอีกครั้งก่อนรับเรื่อง');
  assert.deepEqual(now, before);
  assert.equal(
    askActionUpdate('update', ask, { variantChange: 'ประเมินจากแบบ', variantField: requestVariantFieldLabel('site_survey') }).body,
    'ผู้ขอสลับวิธีประเมินเป็น ประเมินจากแบบ — ตรวจรายละเอียดอีกครั้งก่อนรับเรื่อง',
  );
  // แก้โดยไม่สลับ = ประโยคเดิม
  assert.equal(askActionUpdate('update', ask, {}).body, 'ผู้ขอแก้ข้อมูลคำร้อง — ตรวจรายละเอียดอีกครั้งก่อนรับเรื่อง');
});

/* ═══ ⑤ ล้มทีละก้าว แล้วกดซ้ำ ════════════════════════════════════════════════════════════════ */

test('① หัวใบล้ม = 500 ไม่เขียนแถวพื้นที่ · กดซ้ำ = เขียนครบทั้งสอง', async () => {
  await withFlag(true, async () => {
    let failed = 0;
    const db = world({
      hook: (q) => {
        if (isHeadUpdate(q) && failed === 0) { failed += 1; return { data: null, error: { message: 'update ล้ม' } }; }
        return undefined;
      },
    });
    const body = editBody(survey(), { variant: 'drawing', requestedDueDate: '' });
    const first = await patch(db, body);
    assert.equal(first.status, 500);
    assert.equal(db.calls.filter(isZoneWrite).length, 0);
    assert.equal(db.rows('dept_requests')[0].variant, 'standard');

    const again = await patch(db, body);
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal(db.rows('dept_requests')[0].variant, 'drawing');
    assert.ok(db.rows('service_survey_zones').every((row) => row.method === 'drawing'));
  });
});

test('② หัวใบผ่าน แต่อ่านแถวพื้นที่หลังบันทึกพัง = 200 + คำเตือน · กดบันทึกซ้ำ (ไม่ได้สลับแล้ว) = ตั้งวิธีให้ ไม่มีคำเตือน', async () => {
  await withFlag(true, async () => {
    let reads = 0;
    const db = world({
      hook: (q) => {
        if (!isReseedRead(q)) return undefined;
        reads += 1;
        return reads === 2 ? { data: null, error: { message: 'read failed' } } : undefined;
      },
    });
    const first = await quiet(() => patch(db, editBody(survey(), { variant: 'drawing', requestedDueDate: '' })));
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.equal(first.json._warning, 'บันทึกคำร้องแล้ว แต่ตั้งวิธีประเมินของพื้นที่ไม่สำเร็จ — กด “แก้ไข” แล้ว “บันทึกการแก้ไข” อีกครั้ง (หรือกด “ส่งคำร้อง” ระบบจะตั้งให้ก่อนส่ง)');
    assert.equal(db.rows('dept_requests')[0].variant, 'drawing');
    assert.ok(db.rows('service_survey_zones').every((row) => row.method === undefined), 'ยังไม่ได้ตั้ง');

    const saved = db.rows('dept_requests')[0];
    const again = await patch(db, editBody(saved));
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal(again.json._warning, undefined);
    assert.ok(db.rows('service_survey_zones').every((row) => row.method === 'drawing'), 'ซ่อมแล้ว');
  });
});

test('③ หัวใบผ่าน แต่เขียนวิธีของพื้นที่ล้ม = 200 + คำเตือน · กดบันทึกซ้ำ = ซ่อมได้', async () => {
  await withFlag(true, async () => {
    let failed = 0;
    const db = world({
      hook: (q) => {
        if (isZoneWrite(q) && failed === 0) { failed += 1; return { data: null, error: { message: 'update ล้ม' } }; }
        return undefined;
      },
    });
    const first = await quiet(() => patch(db, editBody(survey(), { variant: 'drawing', requestedDueDate: '' })));
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.match(first.json._warning, /ตั้งวิธีประเมินของพื้นที่ไม่สำเร็จ/);

    const again = await patch(db, editBody(db.rows('dept_requests')[0]));
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal(again.json._warning, undefined);
    assert.ok(db.rows('service_survey_zones').every((row) => row.method === 'drawing'));
  });
});

test("หลังด่านก่อนเขียนผ่าน มีคนบันทึกผลแทรก ('assessed' ตอนตั้งวิธี) = 200 + คำเตือน MISMATCH ไม่เขียนทับ", async () => {
  await withFlag(true, async () => {
    let reads = 0;
    const db = world({
      hook: (q, api) => {
        if (!isReseedRead(q)) return undefined;
        reads += 1;
        // หลังด่านแรก: แถวได้ผลประเมินระหว่างทาง
        if (reads === 2) for (const row of api.tables.service_survey_zones) row.surveyedAt = '2026-10-12T02:59:00+00:00';
        return undefined;
      },
    });
    const res = await patch(db, editBody(survey(), { variant: 'drawing', requestedDueDate: '' }));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json._warning, SURVEY_RESEED_MISMATCH_ERROR);
    assert.equal(db.writes('service_survey_zones').length, 0);
  });
});

/* ═══ GET: ค่าสวิตช์ให้ฟอร์มแก้ (A-7) ═════════════════════════════════════════════════════════ */

test('GET ใบเดียว: ประเมินพื้นที่ได้ drawingMethodEnabled ตามสวิตช์ · หัวข้ออื่นไม่มีคีย์', async () => {
  for (const on of [true, false]) {
    await withFlag(on, async () => {
      const db = world();
      const res = await callRoute(requestGet, { user: SALES, db, path: '/api/sa/requests/REQ-1', params: { id: 'REQ-1' } });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.drawingMethodEnabled, on);

      const other = world({ req: base({ kind: 'info' }) });
      const info = await callRoute(requestGet, { user: SALES, db: other, path: '/api/sa/requests/REQ-1', params: { id: 'REQ-1' } });
      assert.equal(info.status, 200, JSON.stringify(info.json));
      assert.equal('drawingMethodEnabled' in info.json, false);
    });
  }
});
