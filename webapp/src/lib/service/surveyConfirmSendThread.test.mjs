// ── ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 กลุ่ม B · B-5) — ส่งผลของใบยืนยัน = บรรทัดผลบนเธรดของใบต้นทาง ─────────────────
//
// ⭐ ล็อกห้าเรื่อง:
//   ① สี่ผลในการส่งครั้งเดียว — บรรทัดสรุปมาก่อน แล้ว ตัวเลขเปลี่ยน → จากแบบอีกครั้ง → ตัดออก → ตรง (กระดิ่งเห็นของสำคัญก่อน)
//   ② เขียนเฉพาะใบต้นทางที่ยังอยู่ · ยังมีผลที่ส่ง · ตอบ "ต้องยืนยันหน้างาน" — ดึงกลับแล้ว / ไม่ต้องยืนยัน / หาย = ศูนย์แถว (O17)
//   ③ หนึ่งการส่ง หนึ่งกระดิ่ง (R8) — 31 พื้นที่ = สามแถว: แถวแรก `survey_confirm` (กระดิ่ง) · ที่เหลือ `survey_confirm_more` (เงียบ)
//   ④ best effort (V9 · F13) — เขียนเธรดพลาด / ตัวสร้างบรรทัดโยน ⇒ ส่งผลยังตอบ 200 และกระดิ่งคำตอบของใบนี้ถึงผู้ขอแล้ว ·
//      ดึงกลับแล้วส่งใหม่ = ชุดใหม่ (กุญแจใหม่)
//   ⑤ ใบที่ไม่ผูก = ไม่มีคำสั่งของงวดสักคำสั่ง
//
// 🔴 เรียก handler POST ตัวจริงกับของปลอมทั้งหมด (ท่าเดียวกับ `surveyMethodSendChoice.test.mjs`) — ตัวอ่านผู้ใช้ · client ·
//    `lib/drive` ถูกแทนด้วย hook และ env ของ Supabase ถูกลบก่อน import (dev DB = prod DB) · สวิตช์ออกเอกสารตอนส่งผลปิด
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { surveyConfirmSentLines, surveyConfirmSentSummary } from './surveyConfirmLink.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';

for (const key of [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_ENV', 'SURVEY_REPORT_ISSUE_AT_SEND', 'SURVEY_DRAWING_METHOD',
]) delete process.env[key];

const WEBAPP = process.cwd();
const fileUrl = (rel) => pathToFileURL(path.join(WEBAPP, rel)).href;
const dataUrl = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
/* ตัวห่อของงวด — ของจริงทุกชื่อ · ชื่อที่ระบุโยนได้เมื่อ `globalThis.__s5Trip` มีชื่อนั้น (เฉพาะตอน route import) */
const tripWrap = (rel, names) => dataUrl(`
  import * as real from ${JSON.stringify(fileUrl(rel))};
  export * from ${JSON.stringify(fileUrl(rel))};
  const trip = (name, fn) => function tripped(...args) {
    if (globalThis.__s5Trip?.has(name)) throw new Error('trip ' + name);
    return fn.apply(this, args);
  };
  ${names.map((n) => `export const ${n} = trip(${JSON.stringify(n)}, real.${n});`).join('\n  ')}
`);
const STUBS = {
  '@/lib/authUser': dataUrl('export async function getCurrentUser() { return globalThis.__confirmSendTest?.user ?? null; }'),
  '@/lib/supabaseAdmin': dataUrl(`export function getSupabaseAdmin() {
    const s = globalThis.__confirmSendTest?.supabase;
    if (!s) throw new Error('fake supabase missing');
    return s;
  }`),
  '@/lib/drive': dataUrl('export async function getFileStream() { throw new Error("fake drive: not expected in this suite"); }'),
};
const WRAPS = {
  '@/lib/service/surveyConfirmLink': tripWrap('src/lib/service/surveyConfirmLink.js', ['surveyConfirmSentLines']),
};
register(dataUrl(`
  const STUBS = ${JSON.stringify(STUBS)};
  const WRAPS = ${JSON.stringify(WRAPS)};
  export async function resolve(s, c, n) {
    if (Object.hasOwn(STUBS, s)) return { url: STUBS[s], shortCircuit: true };
    if (Object.hasOwn(WRAPS, s) && /\\/app\\/api\\//.test(c.parentURL || '')) return { url: WRAPS[s], shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));
const { POST } = await import('../../app/api/service/surveys/[id]/send/route.js');
const { POST: recallPost } = await import('../../app/api/service/surveys/[id]/recall/route.js');

/* ── ฐานข้อมูลปลอม (ตัวเดียวกับ `surveyMethodSendChoice.test.mjs`) + `fail(q)` ให้คำสั่งที่ตรงล้ม ─────────────────── */
const WRITE_OPS = ['insert', 'update', 'upsert', 'delete', 'rpc'];
function fakeDb(tables, { fail = null } = {}) {
  const events = [];
  const db = {
    events,
    tables,
    async rpc(name, args) {
      events.push({ op: 'rpc', name, args });
      return { data: null, error: { code: 'PGRST202', message: `function ${name} does not exist` } };
    },
    auth: { admin: { async getUserById() { return { data: { user: null }, error: { status: 404, message: 'User not found' } }; } } },
    from(table) {
      const q = { op: 'select', table, select: null, filters: [], orders: [], limit: null, values: null };
      const matches = (r) => q.filters.every(([op, col, val]) => {
        if (op === 'eq') return r[col] === val;
        if (op === 'neq') return r[col] !== val;
        if (op === 'in') return val.includes(r[col]);
        if (op === 'is') return (r[col] ?? null) === val;
        return true;
      });
      let done = null;
      const run = () => {
        if (done) return done;
        events.push(q);
        if (fail?.(q)) {
          done = { data: null, error: { message: 'injected failure' } };
          return done;
        }
        if (q.op === 'insert' || q.op === 'upsert') {
          const rows = (Array.isArray(q.values) ? q.values : [q.values]).map((r) => structuredClone(r));
          tables[table] = [...(tables[table] || []), ...rows];
          done = { data: rows.map((r) => structuredClone(r)), error: null };
          return done;
        }
        let rows = (tables[table] || []).filter(matches);
        if (q.op === 'update') {
          rows.forEach((r) => Object.assign(r, structuredClone(q.values)));
          done = { data: rows.map((r) => structuredClone(r)), error: null };
          return done;
        }
        if (q.op === 'delete') {
          tables[table] = (tables[table] || []).filter((r) => !rows.includes(r));
          done = { data: rows, error: null };
          return done;
        }
        for (const [col, asc] of [...q.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[col]; const y = b[col];
            if (x === y) return 0;
            return (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
        if (q.limit != null) rows = rows.slice(0, q.limit);
        done = { data: rows.map((r) => structuredClone(r)), error: null };
        return done;
      };
      const one = () => Promise.resolve().then(run).then(({ data, error }) => (
        error ? { data: null, error } : { data: data[0] || null, error: null }
      ));
      const known = {
        select(cols) { if (q.op === 'select') q.select = cols; return chain; },
        insert(values) { q.op = 'insert'; q.values = values; return chain; },
        upsert(values) { q.op = 'upsert'; q.values = values; return chain; },
        update(values) { q.op = 'update'; q.values = values; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        neq(col, val) { q.filters.push(['neq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        is(col, val) { q.filters.push(['is', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        limit(n) { q.limit = n; return chain; },
        range(a, b) { q.range = [a, b]; return chain; },
        maybeSingle() { return one(); },
        single() { return one(); },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      // ตัวกรองที่ของปลอมไม่รู้จัก = ปล่อยผ่าน
      const chain = new Proxy(known, { get: (target, prop) => (prop in target ? target[prop] : () => chain) });
      return chain;
    },
  };
  return db;
}

/* ── โลก: ใบยืนยัน (แฝดสังเคราะห์ของเอกสารประเมิน · ผ่านทุกด่าน) ที่ผูกกับใบต้นทาง `DR-O` ─────────────────────────── */
const HEAD = { id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', department: 'TS', team: 'TS', teams: ['TS'] };
const SALE = 'U-sale';
const REQUEST_ID = 'DR-synthetic-0001';
const CHILD_DOC = 'RQ-AS-26090186';
const ORIG_DOC = 'RQ-AS-26090100';
const ORIGINAL = Object.freeze({
  id: 'DR-O', docNo: ORIG_DOC, kind: 'site_survey', dept: 'TS', status: 'answered', variant: 'drawing', title: 'ประเมินจากแบบ',
  requestedById: SALE, team: 'SV', answeredAt: '2026-09-20T03:00:00.000Z', surveyConfirm: 'needed', closedAt: null,
  createdAt: '2026-09-15T02:00:00.000Z',
});
const part = (w, l, h = 3) => ({ label: 'ห้อง', widthM: w, lengthM: l, heightM: h });
const oRow = (zoneId, zoneName, over = {}) => ({
  id: `OZ-${zoneId}`, requestId: 'DR-O', zoneId, zoneName, status: 'ok', method: 'drawing', sortOrder: 0,
  parts: [part(6, 8)], packageSize: 'SM', packageQty: 1, surveyedAt: '2026-09-19T02:00:00.000Z', ...over,
});

const NO_KEY = Symbol('no key');
/**
 * @param zones (base) => แถวพื้นที่ของใบยืนยัน · `files` (base) => ไฟล์ของแถวเหล่านั้น — ตั้งต้น = สองพื้นที่ของแฝด
 * @param originalRows แถวของใบต้นทาง · `original` = แถวคำร้องต้นทาง (null = ถูกลบ) · `link` = ค่า surveyConfirmOfId ของใบนี้
 *   (`NO_KEY` = แถวไม่มีคีย์นี้เลย — แถวเก่าก่อน mig 0408 / select ที่ไม่ขอคอลัมน์)
 */
function makeWorld({
  zones = null, files = null, original = ORIGINAL, originalRows = [], link = 'DR-O', thread = [], fail = null,
} = {}) {
  const source = surveyReportInputsFromFixture(syntheticSurveyFixture());
  const request = {
    ...source.request,
    dept: 'TS', status: 'acknowledged', requestedById: SALE, variant: 'standard',
    answeredAt: null, answeredById: null, answeredByName: null,
    siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1',
    ...(link === NO_KEY ? {} : { surveyConfirmOfId: link }),
  };
  const base = source.zones.map(({ zoneCode: _zoneCode, ...z }) => ({ ...z, requestId: request.id }));
  const baseFiles = source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
    .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id, driveFileId: `drv-${f.id}` })));
  const visitRow = {
    id: 'SVV-1', requestId: request.id, kind: 'survey', createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
    ...source.visit, assistantIds: [],
  };
  const tables = {
    dept_requests: [request, ...(original ? [structuredClone(original)] : [])],
    service_survey_zones: [...(zones ? zones(base) : base), ...originalRows],
    attachments: files ? files(baseFiles) : baseFiles,
    service_visits: [visitRow],
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    entity_updates: thread.map((r) => structuredClone(r)),
    audit_logs: [],
    notifications: [],
  };
  const db = fakeDb(tables, { fail });
  return {
    db, tables,
    child: () => tables.dept_requests.find((r) => r.id === REQUEST_ID),
    childZones: () => tables.service_survey_zones.filter((z) => z.requestId === REQUEST_ID),
    confirmRows: () => tables.entity_updates.filter((r) => r.entityType === 'dept_request' && r.entityId === 'DR-O'
      && String(r.kind).startsWith('survey_confirm')),
    answerRow: () => tables.entity_updates.find((r) => r.entityType === 'dept_request' && r.entityId === REQUEST_ID && r.kind === 'answer'),
    bellsFor: (rows) => tables.notifications.filter((n) => rows.some((r) => r.id === n.updateId)),
    audit: () => tables.audit_logs.find((r) => r.entityType === 'dept_request' && r.entityId === REQUEST_ID),
  };
}

async function send(world, { body = {} } = {}) {
  globalThis.__confirmSendTest = { user: HEAD, supabase: world.db };
  const req = new Request(`http://localhost/api/service/surveys/${REQUEST_ID}/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ id: REQUEST_ID }) });
  return { status: res.status, json: await res.json() };
}
async function recall(world) {
  globalThis.__confirmSendTest = { user: HEAD, supabase: world.db };
  const req = new Request(`http://localhost/api/service/surveys/${REQUEST_ID}/recall`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'ตัวเลขห้องหนึ่งผิด ต้องแก้' }),
  });
  const res = await recallPost(req, { params: Promise.resolve({ id: REQUEST_ID }) });
  return { status: res.status, json: await res.json() };
}

test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
});
test.afterEach(() => { delete globalThis.__confirmSendTest; delete globalThis.__s5Trip; });

/* แถวของแฝด: SVZ-syn-1 (SZN-syn-1 · 8 × 7.9 · SM 1) · SVZ-syn-2 (SZN-syn-2 · 7.7 × 14.3 · ST 1) */
const Z1 = 'SZN-syn-1';
const Z2 = 'SZN-syn-2';
/* โคลนพื้นที่ 1 เป็นพื้นที่ใหม่ (id · zoneId · ชื่อ) พร้อมไฟล์ของมัน — ผ่านทุกด่านเหมือนตัวต้นแบบ */
const cloneZone = (base, n, name) => ({ ...structuredClone(base[0]), id: `SVZ-c-${n}`, zoneId: `SZN-c-${n}`, zoneName: name, sortOrder: n + 10 });
const cloneFiles = (baseFiles, n) => baseFiles.filter((f) => f.entityId === 'SVZ-syn-1')
  .map((f) => ({ ...structuredClone(f), id: `${f.id}-c${n}`, entityId: `SVZ-c-${n}`, driveFileId: `drv-${f.id}-c${n}` }));

/* ══ ① สี่ผลในการส่งครั้งเดียว ══════════════════════════════════════════════════════════════ */

function fourOutcomeWorld(over = {}) {
  return makeWorld({
    // พื้นที่ 1 ตรง · พื้นที่ 2 ส่งจากแบบอีกครั้ง · พื้นที่ 3 (โคลน) ตัวเลขเปลี่ยน · พื้นที่ 4 ถูกตัด
    zones: (base) => [
      base[0],
      { ...base[1], method: 'drawing' },
      cloneZone(base, 3, 'ห้องที่3'),
      { ...cloneZone(base, 4, 'ห้องที่4'), status: 'cut', cutReason: 'ห้องปิดปรับปรุง', spots: [] },
    ],
    files: (baseFiles) => [...baseFiles, ...cloneFiles(baseFiles, 3)],
    originalRows: [
      oRow(Z1, 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส', { parts: [part(8, 7.9, 4.4)], packageSize: 'SM', packageQty: 1 }),
      oRow(Z2, 'ห้องที่2', { sortOrder: 1 }),
      oRow('SZN-c-3', 'ห้องที่3', { sortOrder: 2 }),
      oRow('SZN-c-4', 'ห้องที่4', { sortOrder: 3 }),
    ],
    ...over,
  });
}
const MIXED_BODY = { methodMix: { onsite: 2, drawing: 1 }, surveyConfirm: 'needed' };

test('⭐ สี่ผลในการส่งครั้งเดียว — สรุปก่อน แล้ว เปลี่ยน → จากแบบอีกครั้ง → ตัด → ตรง · แถวเดียว ก้อนแรก (กระดิ่ง)', async () => {
  const world = fourOutcomeWorld();
  const { status, json } = await send(world, { body: MIXED_BODY });
  assert.equal(status, 200, json.error);
  const rows = world.confirmRows();
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.kind, 'survey_confirm');
  const child = world.child();
  const lines = surveyConfirmSentLines({
    child, childRows: world.childZones(), originalRows: world.tables.service_survey_zones.filter((z) => z.requestId === 'DR-O'),
  });
  assert.deepEqual(lines.map((l) => l.outcome), ['confirmed_changed', 'drawing_again', 'cut', 'confirmed_same']);
  assert.deepEqual(lines.map((l) => l.zoneId), ['SZN-c-3', Z2, 'SZN-c-4', Z1]);
  const summary = `ผลใบยืนยันหน้างาน ${CHILD_DOC}: ตัวเลขเปลี่ยน 1 · ตรงกับผลจากแบบ 1 · ยังไม่ได้ยืนยัน 2`;
  assert.equal(surveyConfirmSentSummary(child, lines), summary);
  assert.equal(row.body, [summary, ...lines.map((l) => l.text)].join('\n'));
  assert.match(row.body.split('\n')[1], /^ยืนยันหน้างานแล้ว \(RQ-AS-26090186\) — ห้องที่3: 48 ตร\.ม\. · SM 1 → /);
  assert.equal(row.body.split('\n')[4], `ยืนยันหน้างานแล้ว (${CHILD_DOC}) — พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส: ตัวเลขตรงกับผลจากแบบ`);
  assert.match(row.meta.key, new RegExp(`^sent:${REQUEST_ID}:${child.answeredAt.replace(/[.]/g, '\\.')}:0$`));
  assert.equal(row.meta.event, 'sent');
  assert.equal(row.meta.childId, REQUEST_ID);
  assert.equal(row.meta.childDocNo, CHILD_DOC);
  assert.deepEqual(row.meta.outcomes, lines.map(({ zoneId, outcome }) => ({ zoneId, outcome })));
  // หนึ่งกระดิ่งถึงผู้ขอของใบต้นทาง (คนกดคือหัวหน้า ไม่ใช่ผู้ขอ)
  assert.equal(world.bellsFor(rows).length, 1);
  assert.equal(world.bellsFor(rows)[0].userId, SALE);
  // ส่งผลของใบนี้เองเท่าเดิม — คำตอบ · audit · ไม่มีคีย์ใหม่ในคำตอบของ route
  assert.ok(world.answerRow());
  assert.ok(world.audit());
  assert.deepEqual(Object.keys(json), ['request', 'totals', 'closedVisit', 'report']);
});

/* ══ ② ใบต้นทางที่ไม่ควรได้บรรทัด ═══════════════════════════════════════════════════════════ */

test('🔴 ใบต้นทางถูกดึงผลกลับ / ตอบไม่ต้องยืนยัน / ถูกลบ / ไม่มีแถวพื้นที่ / อ่านพัง = ศูนย์แถว · ส่งผลของใบนี้ 200 ตามเดิม', async () => {
  const cases = [
    ['ดึงผลกลับ', { original: { ...ORIGINAL, answeredAt: null, status: 'acknowledged', surveyConfirm: null } }],
    ['ไม่ต้องยืนยันหน้างาน', { original: { ...ORIGINAL, surveyConfirm: 'not_needed' } }],
    ['ถูกลบ (ลิงก์ลอย)', { original: null }],
    ['ไม่มีแถวพื้นที่', { originalRows: [] }],
    ['อ่านใบต้นทางพัง', { fail: (q) => q.table === 'dept_requests' && q.op === 'select' && q.filters.some(([, , v]) => v === 'DR-O') }],
    ['อ่านแถวพื้นที่ของใบต้นทางพัง', {
      fail: (q) => q.table === 'service_survey_zones' && q.op === 'select' && q.filters.some(([op, col, v]) => op === 'eq' && col === 'requestId' && v === 'DR-O'),
    }],
  ];
  for (const [name, over] of cases) {
    const world = fourOutcomeWorld(over);
    const { status, json } = await send(world, { body: MIXED_BODY });
    assert.equal(status, 200, `${name}: ${json.error}`);
    assert.equal(world.confirmRows().length, 0, name);
    assert.ok(world.child().answeredAt, name);
    assert.ok(world.answerRow(), name);
  }
});

/* ══ ③ หนึ่งการส่ง หนึ่งกระดิ่ง ══════════════════════════════════════════════════════════════ */

test('⭐ 31 พื้นที่ที่ยกมา = สามแถว · แถว 0 `survey_confirm` · แถว 1–2 `survey_confirm_more` · กระดิ่งเดียว', async () => {
  const N = 31;
  const ids = Array.from({ length: N }, (_, i) => i + 1);
  const world = makeWorld({
    zones: (base) => ids.map((n) => cloneZone(base, n, `ห้อง ${n}`)),
    files: (baseFiles) => ids.flatMap((n) => cloneFiles(baseFiles, n)),
    originalRows: ids.map((n) => oRow(`SZN-c-${n}`, `ห้อง ${n}`, { sortOrder: n })),
  });
  const { status, json } = await send(world, { body: { methodMix: { onsite: N, drawing: 0 } } });
  assert.equal(status, 200, json.error);
  const rows = world.confirmRows();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.kind), ['survey_confirm', 'survey_confirm_more', 'survey_confirm_more']);
  assert.deepEqual(rows.map((r) => r.body.split('\n').length), [15, 15, 2]);
  assert.ok(rows[0].body.startsWith(`ผลใบยืนยันหน้างาน ${CHILD_DOC}: ตัวเลขเปลี่ยน ${N}`));
  assert.deepEqual(rows.map((r) => r.meta.key.split(':').pop()), ['0', '1', '2']);
  assert.ok(rows[0].meta.outcomes);
  assert.equal('outcomes' in rows[1].meta, false);
  assert.equal(world.bellsFor(rows).length, 1, 'หนึ่งการส่ง หนึ่งกระดิ่ง');
  assert.equal(world.bellsFor([rows[0]]).length, 1);
});

/* ══ ④ best effort ════════════════════════════════════════════════════════════════════════════ */

test('🔴 เขียนเธรดของใบต้นทางพัง / ตัวสร้างบรรทัดโยน = ส่งผลยัง 200 · คำตอบ + กระดิ่งของใบนี้ถึงผู้ขอแล้ว · ลง log', async () => {
  const cases = [
    ['อ่านแถวเดิมพัง (ปิดทางกันบรรทัดซ้ำ)', { fail: (q) => q.table === 'entity_updates' && q.op === 'select'
      && q.filters.some(([op, col, v]) => op === 'in' && col === 'kind' && v.includes('survey_confirm')) }, null],
    ['เขียนแถวพัง', { fail: (q) => q.table === 'entity_updates' && q.op === 'insert' && String(q.values?.kind).startsWith('survey_confirm') }, null],
    ['ตัวสร้างบรรทัดโยน', {}, 'surveyConfirmSentLines'],
  ];
  for (const [name, over, tripName] of cases) {
    const world = fourOutcomeWorld(over);
    if (tripName) globalThis.__s5Trip = new Set([tripName]);
    const { status, json } = await send(world, { body: MIXED_BODY });
    delete globalThis.__s5Trip;
    assert.equal(status, 200, `${name}: ${json.error}`);
    assert.equal(world.confirmRows().length, 0, name);
    const answer = world.answerRow();
    assert.ok(answer, name);
    assert.equal(world.bellsFor([answer]).length, 1, `${name}: กระดิ่งคำตอบถึงผู้ขอ`);
    assert.ok(world.audit(), name);
    assert.ok(console.error.mock.calls.some((c) => String(c.arguments[0]).includes('[surveyConfirm]')), `${name}: ลง log`);
  }
});

test('ดึงผลกลับแล้วส่งใหม่ = ชุดใหม่ (กุญแจของรอบใหม่) · การดึงกลับขึ้น N10 บนใบต้นทาง', async () => {
  const world = fourOutcomeWorld();
  assert.equal((await send(world, { body: MIXED_BODY })).status, 200);
  const firstKey = world.confirmRows()[0].meta.key;
  const back = await recall(world);
  assert.equal(back.status, 200, back.json.error);
  const n10 = world.confirmRows().filter((r) => r.meta.event === 'reopened');
  assert.equal(n10.length, 1);
  assert.equal(n10[0].body, `ใบยืนยันหน้างาน ${CHILD_DOC} ถูกเปิดกลับมาแก้ — ผลยืนยันหน้างานที่แจ้งไว้ยังไม่นิ่ง รอ TS ส่งผลใหม่`);
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  const again = await send(world, { body: MIXED_BODY });
  assert.equal(again.status, 200, again.json.error);
  const sent = world.confirmRows().filter((r) => r.meta.event === 'sent');
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].meta.key, firstKey);
  assert.equal(sent[1].body, sent[0].body, 'ตัวเลขเท่าเดิม = บรรทัดเท่าเดิม แต่เป็นแถวใหม่');
});

/* ══ ⑤ ใบที่ไม่ผูก ═══════════════════════════════════════════════════════════════════════════ */

const isConfirmQuery = (q) => (q.table === 'dept_requests' && q.filters.some(([, , v]) => v === 'DR-O'))
  || (q.table === 'service_survey_zones' && q.filters.some(([, , v]) => v === 'DR-O'))
  || (q.table === 'entity_updates' && q.filters.some(([op, col, v]) => op === 'in' && col === 'kind' && v.includes('survey_confirm')))
  || (q.table === 'entity_updates' && q.filters.some(([, , v]) => v === 'DR-O'));

test('🔴 ส่งผลของใบที่ไม่ผูก (ไม่มีคีย์ / null) = ไม่มีคำสั่งของงวดสักคำสั่ง · จำนวนคำสั่งเท่ากันทั้งสองแบบ', async () => {
  const counts = [];
  for (const link of [NO_KEY, null]) {
    const world = makeWorld({ link, originalRows: [oRow(Z1, 'x'), oRow(Z2, 'y')] });
    const { status, json } = await send(world);
    assert.equal(status, 200, json.error);
    assert.equal(world.db.events.filter(isConfirmQuery).length, 0, String(link));
    assert.equal(world.confirmRows().length, 0);
    counts.push(world.db.events.length);
  }
  assert.equal(counts[0], counts[1]);
  // ผูกแต่ใบต้นทางถูกลบ = คำสั่งเพิ่มหนึ่งคำสั่ง (อ่านใบต้นทาง) แล้วหยุด
  const dangling = makeWorld({ original: null });
  assert.equal((await send(dangling)).status, 200);
  assert.equal(dangling.db.events.length, counts[0] + 1);
  assert.equal(dangling.db.events.filter(isConfirmQuery).length, 1);
});
