// ── ประเมินจากแบบ งวด 4 — POST เปิดคำร้อง: ฝ่ายขายเลือกวิธีประเมินตอนยื่น (S4 A-2 · A-3 · A-4) ─────────────
//
// ⭐ ล็อกสี่เรื่อง:
//   ① สวิตช์ `SURVEY_DRAWING_METHOD` **ปิด** (production วันนี้) — body ที่ไม่ส่ง `variant` = ลงหน้างาน (201) · ขอจากแบบ = 409
//      ก่อนอ่าน/เขียนอะไร · แถวพื้นที่ **ไม่มีคีย์ method** (payload เท่าก่อนงวดนี้)
//   ② สวิตช์ **เปิด** — ต้องเลือกวิธีเอง · ใบจากแบบเก็บ `requestedDueDate` = กระจกของวันรับผล ไม่มีเวลา (server ไม่เชื่อ
//      ค่าที่ client ส่งมา) · แถวพื้นที่ทุกแถว "เกิดมาจากแบบ" ในคำสั่ง insert เดียวกัน (ไม่มี `methodChangedAt`)
//   ③ insert แถวพื้นที่ล้ม = ลบหัวใบทิ้ง 500 · กดซ้ำได้ใบเดียว ชุดพื้นที่ชุดเดียว
//   ④ หัวข้ออื่นเปิดใบได้เหมือนเดิมทั้งสวิตช์เปิดและปิด
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถวได้ — ตัวอ่านผู้ใช้และ client จริงถูกถอดด้วย hook ของ
//    `crew/routeTestKit.mjs` (ลบ env ของ Supabase ทิ้งก่อน import · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง
// ⚠️ สวิตช์ตั้งผ่าน `process.env` รายเคส แล้วคืนค่าเดิมเสมอ (`withFlag`)
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './crew/routeTestKit.mjs';
import { canUser, canViewRequests } from '../permissions.js';
import { REQUEST_KINDS } from '../master/requestTypes.js';
import { normalizeSurveyRequest } from './surveyRequest.js';
import { SURVEY_METHOD_ERRORS } from './surveyMethodSwitch.js';

mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T03:00:00Z') });

const { POST } = await import('../../app/api/sa/requests/route.js');
const { GET: formOptions } = await import('../../app/api/sa/requests/form-options/route.js');

/* ── สวิตช์ ─────────────────────────────────────────────────────────────────────────────────── */
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

/* ── ฐานข้อมูลปลอม ───────────────────────────────────────────────────────────────────────────────
   กรองจริงตาม eq / neq / in / is · ตัดตาม range / limit · single / maybeSingle · ตัวกรองอื่นผ่านทุกแถว
   `hook(q, api)` ถูกเรียกก่อนทุกคำสั่ง — คืน `{ data, error }` เพื่อแทนคำตอบ · คืน undefined = ปกติ */
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

/* ── คน + ของตั้งต้น ─────────────────────────────────────────────────────────────────────────── */
const SALES = { id: 'sa-1', name: 'เซลเอ', role: 'ae', team: 'KA' };
const DEAL = { id: 'D-1', projectId: null, customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด', team: 'KA' };
const SITE = { id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: 'C-1' };
const QUOTATION = { id: 'QT-1', dealId: 'D-1', status: 'approved', approvalStatus: 'approved', totalAmount: 10700, subtotal: 10000 };

const world = ({ hook = null } = {}) => fakeDb({
  sales_deals: [DEAL],
  service_sites: [SITE],
  service_zones: [],
  quotations: [QUOTATION],
}, { hook });

const RESULT = '2026-10-25';
const VISIT = '2026-10-20';
// body ที่ฟอร์มส่ง — ลงหน้างาน (มีวันเข้าพื้นที่ + เวลา + วันรับผล)
const surveyBody = (over = {}) => ({
  kind: 'site_survey',
  title: 'ประเมินพื้นที่ โรงแรมทดสอบ',
  body: 'ลูกค้าจะเปิดโซนใหม่ปลายเดือน',
  dealId: 'D-1',
  siteId: 'SITE-1',
  zones: [{ name: 'โซนล็อบบี้', floor: 'G' }, { name: 'โซนสปา', floor: '2' }],
  requestedDueDate: VISIT,
  requestedDueTime: '10:00',
  requestedResultDate: RESULT,
  ...over,
});
// body ของใบประเมินจากแบบ — ฟอร์มมีวันเดียว (วันรับผล)
const drawingBody = (over = {}) => {
  const out = surveyBody({ variant: 'drawing', ...over });
  if (!('requestedDueDate' in over)) delete out.requestedDueDate;
  if (!('requestedDueTime' in over)) delete out.requestedDueTime;
  return out;
};

const post = (db, body, user = SALES) => callRoute(POST, { user, db, method: 'POST', path: '/api/sa/requests', body });
const headInserts = (db) => db.writes('dept_requests').filter((c) => c.write === 'insert');
const zoneInserts = (db) => db.writes('service_survey_zones').filter((c) => c.write === 'insert');
const zoneRowsOf = (db) => zoneInserts(db).flatMap((c) => [].concat(c.payload));

test('fixture: ฝ่ายขายเปิดคำร้องได้', () => {
  assert.equal(canViewRequests(SALES), true);
  assert.equal(canUser(SALES, 'costing:edit'), true);
});

/* ═══ ① สวิตช์ปิด ═══════════════════════════════════════════════════════════════════════════ */

test('สวิตช์ปิด: ไม่ส่ง variant มา = ลงหน้างาน 201 · แถวพื้นที่ไม่มีคีย์ method (payload เท่าก่อนงวดนี้)', async () => {
  await withFlag(false, async () => {
    const db = world();
    const res = await post(db, surveyBody());
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const [head] = headInserts(db);
    assert.equal(head.payload.variant, 'standard');
    assert.equal(head.payload.requestedDueDate, VISIT);
    assert.equal(head.payload.requestedDueTime, '10:00');
    assert.equal(head.payload.requestedResultDate, RESULT);
    const zones = zoneRowsOf(db);
    assert.equal(zones.length, 2);
    for (const row of zones) {
      assert.equal('method' in row, false, 'ใบลงหน้างานต้องไม่เขียนคีย์ method');
      assert.equal('methodChangedAt' in row, false);
    }
  });
});

test('สวิตช์ปิด: ส่ง standard มา = 201 แถวเดิม', async () => {
  await withFlag(false, async () => {
    const db = world();
    const res = await post(db, surveyBody({ variant: 'standard' }));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(headInserts(db)[0].payload.variant, 'standard');
    for (const row of zoneRowsOf(db)) assert.equal('method' in row, false);
  });
});

test('🔴 สวิตช์ปิด: ขอประเมินจากแบบ = 409 "ยังไม่เปิดใช้…" ก่อนอ่าน/เขียนอะไรทั้งนั้น', async () => {
  await withFlag(false, async () => {
    const db = world();
    const res = await post(db, drawingBody());
    assert.equal(res.status, 409);
    assert.equal(res.json.error, SURVEY_METHOD_ERRORS.off);
    assert.equal(res.json.error, 'ยังไม่เปิดใช้การประเมินจากแบบ');
    assert.deepEqual(db.writes(), [], 'ไม่มีคำสั่งเขียน');
    assert.deepEqual(db.calls, [], 'ไม่มีแม้แต่คำสั่งอ่าน');
  });
});

/* ═══ ② สวิตช์เปิด ═══════════════════════════════════════════════════════════════════════════ */

test('สวิตช์เปิด: ไม่เลือกวิธี = 400 ประโยคบังคับเลือกของทะเบียน · ไม่มีอะไรถูกเขียน', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await post(db, surveyBody());
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'ต้องเลือกวิธีประเมิน — ลงหน้างาน หรือ ประเมินจากแบบ');
    assert.deepEqual(db.writes(), []);
  });
});

test('สวิตช์เปิด: ลงหน้างาน = 201 แถวพื้นที่ไม่มีคีย์ method', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await post(db, surveyBody({ variant: 'standard' }));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(headInserts(db)[0].payload.requestedDueDate, VISIT);
    for (const row of zoneRowsOf(db)) assert.equal('method' in row, false);
  });
});

test('⭐ สวิตช์เปิด: ประเมินจากแบบ มีแต่วันรับผล = 201 · requestedDueDate = วันรับผล · ไม่มีเวลา · ทุกพื้นที่เกิดมาจากแบบ', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await post(db, drawingBody());
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const [head] = headInserts(db);
    assert.equal(head.payload.variant, 'drawing');
    assert.equal(head.payload.requestedResultDate, RESULT);
    assert.equal(head.payload.requestedDueDate, RESULT, 'กระจกของวันรับผล');
    assert.equal(head.payload.requestedDueTime, null);
    const zones = zoneRowsOf(db);
    assert.equal(zones.length, 2);
    for (const row of zones) {
      assert.equal(row.method, 'drawing');
      assert.equal('methodChangedAt' in row, false, 'เกิดมาแบบนั้น ไม่ใช่ถูกสลับ');
      assert.equal('methodReason' in row, false);
      assert.equal('methodChangedByName' in row, false);
    }
    // insert แถวพื้นที่คำสั่งเดียว — ไม่มีก้าวที่สองที่ตามมาเขียนวิธี
    assert.equal(zoneInserts(db).length, 1);
    assert.equal(db.writes('service_survey_zones').length, 1);
  });
});

test('🔴 สวิตช์เปิด: ใบจากแบบที่ client ส่งวันเข้าพื้นที่/เวลามาด้วย = server เขียนทับทั้งสองช่อง', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await post(db, drawingBody({ requestedDueDate: '2026-10-14', requestedDueTime: '09:30' }));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const [head] = headInserts(db);
    assert.equal(head.payload.requestedDueDate, RESULT);
    assert.equal(head.payload.requestedDueTime, null);
  });
});

test('🔴 วิธีที่มีช่องว่างหัวท้าย (\' drawing\') = ตัดก่อนทุกด่าน — สวิตช์ปิด 409 ไม่แตะฐาน · สวิตช์เปิดเก็บเป็นจากแบบ', async () => {
  await withFlag(false, async () => {
    const db = world();
    const res = await post(db, drawingBody({ variant: ' drawing ' }));
    assert.equal(res.status, 409);
    assert.equal(res.json.error, SURVEY_METHOD_ERRORS.off);
    assert.deepEqual(db.calls, [], 'ไม่มีแม้แต่คำสั่งอ่าน');
  });
  await withFlag(true, async () => {
    const db = world();
    const res = await post(db, drawingBody({ variant: ' drawing' }));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const [head] = headInserts(db);
    assert.equal(head.payload.variant, 'drawing');
    assert.equal(head.payload.requestedDueDate, RESULT);
    for (const row of zoneRowsOf(db)) assert.equal(row.method, 'drawing');
  });
});

test('สวิตช์เปิด: ประเมินจากแบบที่ไม่มีวันรับผล = 400 "ต้องระบุวันที่ต้องการรับผลประเมิน"', async () => {
  await withFlag(true, async () => {
    const db = world();
    const res = await post(db, drawingBody({ requestedResultDate: '' }));
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'ต้องระบุวันที่ต้องการรับผลประเมิน');
    assert.deepEqual(db.writes(), []);
  });
});

test('วิธีที่ไม่มีในทะเบียน = 400 ทั้งสวิตช์เปิดและปิด', async () => {
  for (const on of [true, false]) {
    await withFlag(on, async () => {
      const db = world();
      const res = await post(db, surveyBody({ variant: 'remote' }));
      assert.equal(res.status, 400, `flag ${on}`);
      assert.match(res.json.error, /remote/);
      assert.deepEqual(db.writes(), []);
    });
  }
});

/* ═══ ตัวตรวจใบประเมิน (A-4) — ลงหน้างานเหมือนเดิมทุกตัวอักษร ═══════════════════════════════ */

test('normalizeSurveyRequest: ใบจากแบบไม่ถามเวลาและไม่เทียบวันรับผลกับวันเข้าพื้นที่ · ลงหน้างานเท่าเดิม', () => {
  const base = { siteId: 'SITE-1', zones: [{ name: 'โซนล็อบบี้', floor: 'G' }] };
  // ลงหน้างาน: วันรับผลก่อนวันเข้า = ตีกลับ · เวลาเพี้ยน = ตีกลับ (เดิม)
  assert.match(normalizeSurveyRequest({ ...base, kind: 'site_survey', variant: 'standard', requestedDueDate: '2026-10-20', requestedResultDate: '2026-10-19' }).error, /ต้องไม่มาก่อน/);
  assert.equal(normalizeSurveyRequest({ ...base, kind: 'site_survey', variant: 'standard', requestedDueDate: '2026-10-20', requestedDueTime: 'ก', requestedResultDate: '2026-10-21' }).error, 'เวลาที่ต้องการไม่ถูกต้อง');
  // body ที่ไม่มี kind (ผู้เรียกเดิม) = ลงหน้างาน
  assert.match(normalizeSurveyRequest({ ...base, requestedDueDate: '2026-10-20', requestedResultDate: '2026-10-19' }).error, /ต้องไม่มาก่อน/);
  // จากแบบ: เวลาที่หลุดมาถูกทิ้ง · ไม่มีการเทียบกับวันเข้าพื้นที่
  const drawing = normalizeSurveyRequest({
    ...base, kind: 'site_survey', variant: 'drawing', requestedDueDate: '2026-10-30', requestedDueTime: 'ก', requestedResultDate: '2026-10-21',
  });
  assert.equal(drawing.error, null);
  assert.equal(drawing.value.requestedDueTime, null);
  assert.equal(drawing.value.requestedResultDate, '2026-10-21');
  assert.equal(normalizeSurveyRequest({ ...base, kind: 'site_survey', variant: 'drawing' }).error, 'ต้องระบุวันที่ต้องการรับผลประเมิน');
});

/* ═══ ③ insert แถวพื้นที่ล้ม → กดซ้ำ ═════════════════════════════════════════════════════════ */

test('🔴 insert แถวพื้นที่ล้ม = ลบหัวใบทิ้ง 500 · กดซ้ำด้วย body เดิม = ใบเดียว ชุดพื้นที่ชุดเดียว', async () => {
  await withFlag(true, async () => {
    let failed = 0;
    const db = world({
      hook: (q) => {
        if (q.table === 'service_survey_zones' && q.write === 'insert' && failed === 0) {
          failed += 1;
          return { data: null, error: { message: 'insert พื้นที่ล้ม' } };
        }
        return undefined;
      },
    });
    const first = await post(db, drawingBody());
    assert.equal(first.status, 500);
    assert.equal(db.rows('dept_requests').length, 0, 'หัวใบที่เพิ่งเขียนถูกลบ');
    assert.equal(db.rows('service_survey_zones').length, 0);
    assert.equal(db.writes('dept_requests').filter((c) => c.write === 'delete').length, 1);

    const again = await post(db, drawingBody());
    assert.equal(again.status, 201, JSON.stringify(again.json));
    assert.equal(db.rows('dept_requests').length, 1);
    const [head] = db.rows('dept_requests');
    const zones = db.rows('service_survey_zones');
    assert.equal(zones.length, 2);
    for (const row of zones) {
      assert.equal(row.requestId, head.id);
      assert.equal(row.method, 'drawing');
    }
  });
});

/* ═══ ④ หัวข้ออื่น ════════════════════════════════════════════════════════════════════════════ */

/* หัวข้อที่ประกอบ body จาก fixture ได้ — ที่เหลือ (scent_dev ต้องมี SO + PDR · formula_dev ต้องมีหมวด/กลิ่นในทะเบียน ·
   material_eta เลิกใช้แล้ว) ถูกตรวจทาง update ใน `surveyIntakeUpdateRoute.test.mjs` */
const OTHER_KINDS = {
  info: () => ({ kind: 'info', dept: 'RD', title: 'สอบถามสเปก', dealId: 'D-1', requestedDueDate: '2026-10-20' }),
  document: () => ({
    kind: 'document', title: 'ขอเอกสาร MSDS', dealId: 'D-1', requestedDueDate: '2026-10-20',
    items: [{ docType: 'msds', spec: 'MSDS ภาษาไทย' }],
  }),
  billing_doc: () => ({
    kind: 'billing_doc', title: 'ขอใบวางบิล', quotationId: 'QT-1', billAmount: 5350, requestedDueDate: '2026-10-20',
    items: [{ docType: 'invoice', spec: 'ใบแจ้งหนี้งวด 1' }],
  }),
};

test('หัวข้ออื่นเปิดใบได้เหมือนเดิม ทั้งสวิตช์เปิดและปิด · ไม่มีคีย์ variant ในแถวของหัวข้อที่ไม่มีรูปแบบ', async () => {
  assert.ok(Object.keys(OTHER_KINDS).every((kind) => REQUEST_KINDS[kind] && !REQUEST_KINDS[kind].variants));
  for (const [kind, build] of Object.entries(OTHER_KINDS)) {
    for (const on of [true, false]) {
      await withFlag(on, async () => {
        const db = world();
        const res = await post(db, build());
        assert.equal(res.status, 201, `${kind} flag ${on}: ${JSON.stringify(res.json)}`);
        const [head] = headInserts(db);
        assert.equal('variant' in head.payload, false, kind);
        assert.equal(head.payload.requestedDueDate, '2026-10-20', kind);
        assert.equal(zoneInserts(db).length, 0, kind);
      });
    }
  }
});

test('พัฒนาสูตร (มีรูปแบบ ไม่บังคับเลือก): ไม่ส่ง variant = รูปแบบตั้งต้น ทั้งสวิตช์เปิดและปิด — ไม่ถูกด่านบังคับเลือก', async () => {
  for (const on of [true, false]) {
    await withFlag(on, async () => {
      const db = world();
      // ไม่มีรายการ = ตีกลับด้วยด่านรายการเดิมของหัวข้อ ไม่ใช่ด่านบังคับเลือกวิธี
      const res = await post(db, { kind: 'formula_dev', title: 'พัฒนาสูตร', dealId: 'D-1', requestedDueDate: '2026-10-20', items: [] });
      assert.equal(res.status, 400);
      assert.doesNotMatch(res.json.error, /วิธีประเมิน/);
    });
  }
});

/* ═══ ค่าสวิตช์ของหน้าเปิดใบใหม่ (A-1) ═══════════════════════════════════════════════════════ */

test('GET /api/sa/requests/form-options: ตอบค่าสวิตช์ตามจริง · ไม่มีสิทธิ์ดูคำร้อง = 403 · ไม่แตะฐาน', async () => {
  const TS = { id: 'u-tech', name: 'ช่างเอ', role: 'ts_manager', department: 'TS' };
  for (const on of [true, false]) {
    await withFlag(on, async () => {
      for (const user of [SALES, TS]) {
        const db = world();
        const res = await callRoute(formOptions, { user, db, path: '/api/sa/requests/form-options' });
        assert.equal(res.status, 200, `${user.role} flag ${on}`);
        assert.deepEqual(res.json, { drawingMethodEnabled: on });
        assert.deepEqual(db.calls, []);
      }
    });
  }
  await withFlag(true, async () => {
    const res = await callRoute(formOptions, { user: null, db: world(), path: '/api/sa/requests/form-options' });
    assert.equal(res.status, 403);
    assert.equal('drawingMethodEnabled' in res.json, false);
  });
});
