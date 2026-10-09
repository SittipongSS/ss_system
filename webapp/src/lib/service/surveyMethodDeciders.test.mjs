// ── ประเมินจากแบบ งวด S1 — ตัวตัดสินและตัวโหลดที่ถามว่า "ใบนี้ต้องมีนัดไหม" (แผน survey-desk-assessment §7) ──
//
// ⭐ หกจุดที่เทสต์ชุดนี้ล็อก: ขั้นของการ์ดลงคิว · ตัวโหลดคิว · จุดบนราง · ขั้นของงานบนหน้าคำร้อง ·
//    ตัวโหลดใบเดียว (`findRequest`) · ช่องค้าง "ส่งกลับให้แก้" ของช่าง
// 🔑 ธงบนแถวคำร้องคือ `surveyNeedsVisit` — **ไม่มี / undefined / ค่าอื่นที่ไม่ใช่ `false` ตรงตัว = ต้องมีนัด**
//    ⇒ ใบที่ทุกพื้นที่ลงหน้างาน (ทุกใบของวันนี้ · แถวเก่าไม่มีคีย์ `method` เลย) ต้องตอบเหมือนเดิมทุกค่า
// ⚠️ ไม่มี client จริงในไฟล์นี้ (dev DB = prod DB) — supabase ปลอมกรองแถวจริงตามตัวกรองที่ query ส่งมา
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { surveyQueueStep } from './surveyQueue.js';
import {
  SURVEY_QUEUE_VISIT_COLUMNS, SURVEY_QUEUE_ZONE_COLUMNS, loadSurveyQueueRequests,
} from './surveyQueueRepo.js';
import { requestRailSteps } from '../requests/requestRail.js';
import { surveyJobView } from './surveyJob.js';
import { VISIT_STATUSES } from './visitStatus.js';
import { IN_CHUNK_SIZE } from '../supabaseInChunks.js';
import { addDays } from '../datePeriods.js';

/* ⚠️ visitsRepo ลาก `@/lib/http` → `next/headers` (ทางเดียวกับ crew/myWork.test.mjs) — ต่อ hook ก่อน import */
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { return n(s === 'next/headers' ? 'next/headers.js' : s, c); }",
));
const { loadMyWorkRows } = await import('./visitsRepo.js');
const { findRequest } = await import('../materialPricesAdmin.js');

/* ── supabase ปลอม: ตารางเป็นลิสต์แถว · builder จดทุก op แล้วกรองตอน await ─────────────── */
function matchesOr(row, expr) {
  return String(expr).split(',').some((clause) => {
    const [col, op, ...rest] = clause.split('.');
    const value = rest.join('.');
    if (op === 'eq') return String(row[col] ?? '') === value;
    if (op === 'cs') {
      const have = Array.isArray(row[col]) ? row[col].map(String) : [];
      return JSON.parse(value).every((v) => have.includes(String(v)));
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
  for (const [name, col, value] of ops) {
    if (name === 'eq') out = out.filter((r) => String(r[col] ?? '') === String(value));
    else if (name === 'in') out = out.filter((r) => value.map(String).includes(String(r[col] ?? '')));
    else if (name === 'gte') out = out.filter((r) => r[col] != null && String(r[col]) >= String(value));
    else if (name === 'lte') out = out.filter((r) => r[col] != null && String(r[col]) <= String(value));
    else if (name === 'lt') out = out.filter((r) => r[col] != null && String(r[col]) < String(value));
    else if (name === 'or') out = out.filter((r) => matchesOr(r, col));
    else if (name === 'order') orders.push([col, value?.ascending !== false]);
    else if (name === 'range') range = [col, value];
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

const BOOM = { message: 'connection reset' };
function fakeSupabase(tables = {}, { failTable = null } = {}) {
  const calls = [];
  const from = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve, reject) => Promise.resolve(table === failTable
            ? { data: null, error: BOOM }
            : { data: applyOps(tables[table] || [], q.ops), error: null }).then(resolve, reject);
        }
        return (...args) => { q.ops.push([prop, ...args]); return builder; };
      },
    });
    return builder;
  };
  const of = (table) => calls.filter((c) => c.table === table);
  const opsOf = (q, name) => q.ops.filter(([n]) => n === name).map(([, ...args]) => args);
  return { from, calls, of, opsOf };
}

/* แถวพื้นที่สามทรงที่ต้องอ่านเป็น "ลงหน้างาน" เหมือนกันหมด — แถวเก่าไม่มีคีย์ · ค่าตั้งต้นของคอลัมน์ · คอลัมน์ใหม่ว่างทั้งชุด */
const ONSITE_SHAPES = {
  'ไม่มีคีย์ method': {},
  "method 'onsite'": { method: 'onsite' },
  'คอลัมน์ใหม่ว่างทั้งชุด': { method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null },
};
const DRAWING = { method: 'drawing' };

/* ── 1) ขั้นของการ์ดลงคิว (`surveyQueueStep`) ─────────────────────────────────── */
const ask = {
  id: 'DR-1', docNo: 'AS-26100001', kind: 'site_survey', dept: 'TS', siteId: 'SVS-1',
  status: 'acknowledged', acknowledgedAt: '2026-10-01T02:00:00.000Z',
  committedDueDate: null, closedAt: null, surveyVisit: null,
};
const QUEUE_SHAPES = [
  ['ยังไม่มีวัน', {}],
  ['มีวัน + นัดที่ยังมีชีวิต', { committedDueDate: '2026-10-05', surveyVisit: { id: 'V1', status: 'scheduled' } }],
  ['มีวัน + นัดยกเลิก', { committedDueDate: '2026-10-05', surveyVisit: { id: 'V1', status: 'cancelled' } }],
  ['มีวัน + นัดเข้าแล้ว', { committedDueDate: '2026-10-05', surveyVisit: { id: 'V1', status: 'done' } }],
];
// คำตอบของวันนี้ (ใบที่ต้องมีนัด) เรียงตาม QUEUE_SHAPES — ตัวอักษรจากกติกาเดิมของ `surveyQueue.test.mjs`
const QUEUE_TODAY = ['queue', null, 'requeue', null];

test('surveyQueueStep · ไม่มีธง / ธง true / ค่าอื่นที่ไม่ใช่ false = คำตอบของวันนี้ทุกช่อง', () => {
  const flags = [
    ['ไม่มีคีย์', {}], ['undefined', { surveyNeedsVisit: undefined }], ['true', { surveyNeedsVisit: true }],
    ['null', { surveyNeedsVisit: null }], ["'false' (สตริง)", { surveyNeedsVisit: 'false' }], ['0', { surveyNeedsVisit: 0 }],
  ];
  for (const [flagName, flag] of flags) {
    QUEUE_SHAPES.forEach(([shapeName, shape], i) => {
      const label = `${flagName} · ${shapeName}`;
      assert.equal(surveyQueueStep({ ...ask, ...shape, ...flag, status: 'pending', acknowledgedAt: null }), 'acknowledge', `รอรับเรื่อง · ${label}`);
      assert.equal(surveyQueueStep({ ...ask, ...shape, ...flag }), QUEUE_TODAY[i], `รับเรื่องแล้ว · ${label}`);
    });
  }
});

test('⭐ surveyQueueStep · งานโต๊ะ (ธง false): รอรับเรื่องยังเป็นการ์ด "รับเรื่อง" · หลังรับเรื่องไม่มีขั้นลงคิว/ลงคิวใหม่อีกเลย', () => {
  for (const [shapeName, shape] of QUEUE_SHAPES) {
    const desk = { ...ask, ...shape, surveyNeedsVisit: false };
    assert.equal(surveyQueueStep({ ...desk, status: 'pending', acknowledgedAt: null }), 'acknowledge', shapeName);
    assert.equal(surveyQueueStep(desk), null, shapeName);
  }
  // ด่านที่มาก่อนธงยังตอบเหมือนเดิม: ไม่ใช่ใบประเมิน · ผู้ขอปิดแล้ว · ไม่ได้เดินอยู่
  assert.equal(surveyQueueStep({ ...ask, kind: 'info', status: 'pending', surveyNeedsVisit: false }), null);
  assert.equal(surveyQueueStep({ ...ask, closedAt: '2026-10-02T00:00:00Z', surveyNeedsVisit: false }), null);
  assert.equal(surveyQueueStep({ ...ask, status: 'answered', surveyNeedsVisit: false }), null);
});

/* ── 2) ตัวโหลดคิว (`loadSurveyQueueRequests`) ────────────────────────────────── */
const openAsk = (o) => ({
  kind: 'site_survey', dept: 'TS', status: 'acknowledged', siteId: 'S1',
  acknowledgedAt: '2026-10-01T02:00:00.000Z', committedDueDate: null, closedAt: null,
  submittedAt: '2026-09-30T02:00:00.000Z', ...o,
});
const zone = (id, requestId, o = {}) => ({ id, requestId, status: 'ok', ...o });
const QUEUE_ASKS = [
  openAsk({ id: 'R-onsite' }),                                           // แถวเก่า ไม่มีคีย์ method
  openAsk({ id: 'R-nozone' }),                                           // ไม่มีแถวพื้นที่เลย
  openAsk({ id: 'R-mixed' }),                                            // ผสม — ยังต้องมีนัด
  openAsk({ id: 'R-desk-pending', status: 'pending', acknowledgedAt: null }),
  openAsk({ id: 'R-desk-ack' }),                                         // จากแบบล้วน รับเรื่องแล้ว
  openAsk({ id: 'R-desk-dated', committedDueDate: '2026-10-05' }),       // จากแบบล้วน + มีวันค้างบนใบ + นัดเดิมยกเลิก
  openAsk({ id: 'R-cutdraw' }),                                          // เหลือแต่พื้นที่ลงหน้างานที่ยังใช้ — ตัดเฉพาะแถวจากแบบ
  openAsk({ id: 'R-allcut-onsite' }),                                    // ตัดหมด ลงหน้างาน (ทรง RQ-AS-26090233)
];
const QUEUE_ZONES = [
  zone('Z01', 'R-onsite'),
  zone('Z02', 'R-mixed', DRAWING), zone('Z03', 'R-mixed', { method: 'onsite' }),
  zone('Z04', 'R-desk-pending', DRAWING),
  zone('Z05', 'R-desk-ack', DRAWING), zone('Z06', 'R-desk-ack', { ...DRAWING, status: 'added' }),
  zone('Z07', 'R-desk-dated', DRAWING),
  zone('Z08', 'R-cutdraw', { ...DRAWING, status: 'cut' }), zone('Z09', 'R-cutdraw'),
  zone('Z10', 'R-allcut-onsite', { status: 'cut' }),
  zone('Z99', 'R-somebody-else', DRAWING),                               // ใบอื่น — ต้องไม่ปนเข้ามา
];
const QUEUE_HISTORY = [
  { id: 'V-desk', requestId: 'R-desk-dated', status: 'cancelled', createdAt: '2026-10-02T00:00:00Z' },
];
const queueDb = (o = {}, opts) => fakeSupabase({
  dept_requests: QUEUE_ASKS, service_survey_zones: QUEUE_ZONES, service_visits: QUEUE_HISTORY, ...o,
}, opts);

test('⭐ ตัวโหลดคิว: ธง surveyNeedsVisit ติดทุกแถว (boolean) · งานโต๊ะที่รับเรื่องแล้วหลุดจากการ์ด · รอรับเรื่องยังอยู่', async () => {
  const got = await loadSurveyQueueRequests(queueDb(), { visits: [] });
  const byId = Object.fromEntries(got.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(byId).sort(), [
    'R-allcut-onsite', 'R-cutdraw', 'R-desk-pending', 'R-mixed', 'R-nozone', 'R-onsite',
  ], 'R-desk-ack / R-desk-dated ไม่ใช่การ์ดลงคิว (ไม่มีนัดให้ลง)');
  assert.deepEqual(
    Object.fromEntries(got.map((r) => [r.id, r.surveyNeedsVisit])),
    {
      'R-onsite': true, 'R-nozone': true, 'R-mixed': true, 'R-desk-pending': false,
      'R-cutdraw': true, 'R-allcut-onsite': true,
    },
  );
  assert.equal(surveyQueueStep(byId['R-desk-pending']), 'acknowledge');
  assert.equal(surveyQueueStep(byId['R-onsite']), 'queue');
  for (const row of got) assert.equal(typeof row.surveyNeedsVisit, 'boolean', row.id);
});

test('ตัวโหลดคิว: อ่านพื้นที่ครั้งเดียวทุกใบที่เดินอยู่ · คอลัมน์แคบ · ลำดับนิ่งที่ id · ไล่หน้า', async () => {
  const db = queueDb();
  await loadSurveyQueueRequests(db, { visits: [] });
  const reads = db.of('service_survey_zones');
  assert.equal(reads.length, 1);
  assert.equal(SURVEY_QUEUE_ZONE_COLUMNS, 'id, "requestId", status, method');
  assert.deepEqual(db.opsOf(reads[0], 'select'), [[SURVEY_QUEUE_ZONE_COLUMNS]]);
  assert.deepEqual(
    db.opsOf(reads[0], 'in').map(([col, ids]) => [col, [...ids].sort()]),
    [['requestId', QUEUE_ASKS.map((r) => r.id).sort()]],
    'ทุกใบที่เดินอยู่ — รวมใบรอรับเรื่อง (การ์ดของมันต้องรู้ว่าเป็นงานโต๊ะ)',
  );
  assert.deepEqual(db.opsOf(reads[0], 'order'), [['id', { ascending: true }]]);
  assert.deepEqual(db.opsOf(reads[0], 'range'), [[0, 999]], 'fetchAll ไล่หน้า');
});

test('ตัวโหลดคิว: ประวัตินัดไม่ถามของใบงานโต๊ะ (คำตอบไม่ขึ้นกับนัดเดิมแล้ว)', async () => {
  const db = queueDb({
    dept_requests: [...QUEUE_ASKS, openAsk({ id: 'R-onsite-dated', committedDueDate: '2026-10-06' })],
  });
  const got = await loadSurveyQueueRequests(db, { visits: [] });
  const history = db.of('service_visits');
  assert.equal(history.length, 1);
  assert.deepEqual(db.opsOf(history[0], 'select'), [[SURVEY_QUEUE_VISIT_COLUMNS]]);
  assert.deepEqual(db.opsOf(history[0], 'in'), [['requestId', ['R-onsite-dated']]]);
  assert.equal(surveyQueueStep(got.find((r) => r.id === 'R-onsite-dated')), 'requeue');

  // เหลือแต่ใบงานโต๊ะที่มีวันค้าง = ไม่ยิงถามตารางนัดเลย
  const deskOnly = queueDb();
  await loadSurveyQueueRequests(deskOnly, { visits: [] });
  assert.equal(deskOnly.of('service_visits').length, 0);
});

test('🔴 ตัวโหลดคิว: ลิสต์ใบของคำขอพื้นที่ถูกซอยก้อน (URL 16 KB) · ใบเกินพันใบได้ธงครบ', async () => {
  const many = Array.from({ length: 1234 }, (_, i) => openAsk({ id: `R${String(i).padStart(5, '0')}` }));
  // ใบสุดท้ายของก้อนสุดท้ายเป็นงานโต๊ะ — ก้อนท้ายตกหล่น = ใบนี้กลับมาเป็นการ์ดลงคิว
  const db = fakeSupabase({ dept_requests: many, service_survey_zones: [zone('Z1', 'R01233', DRAWING)] });
  const got = await loadSurveyQueueRequests(db, { visits: [] });
  assert.equal(got.length, 1233);
  assert.ok(!got.some((r) => r.id === 'R01233'));
  const chunks = db.of('service_survey_zones').map((q) => db.opsOf(q, 'in')[0][1]);
  assert.equal(chunks.length, Math.ceil(1234 / IN_CHUNK_SIZE));
  assert.ok(chunks.every((ids) => ids.length <= IN_CHUNK_SIZE));
});

test('🔴 ตัวโหลดคิว: อ่านพื้นที่พลาด = โยน error ตัวนั้นต่อ — ไม่กลืนเป็น "ทุกใบต้องมีนัด"', async () => {
  await assert.rejects(
    loadSurveyQueueRequests(queueDb({}, { failTable: 'service_survey_zones' }), { visits: [] }),
    (e) => e === BOOM,
  );
});

/* ── 3) จุดบนราง (`requestRailSteps` → `fieldIndex`) ──────────────────────────── */
const railAsk = (o = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-01T07:50:00Z',
  acknowledgedAt: '2026-10-01T08:12:00Z', acknowledgedByName: 'Apisith Pattangthani',
  committedDueDate: null, committedResultDate: null, ...o,
});
const railVisit = (status) => (status ? { id: 'v1', code: 'SV-26100001', status, scheduledDate: '2026-10-05' } : null);
// จุดของวันนี้ตามสถานะนัด (ใบรับเรื่องแล้ว): ไปถึงไซต์ = 4 · นัดยังมีชีวิต = 3 · นอกนั้น = 2
const RAIL_TODAY = {
  none: 2, draft: 3, scheduled: 3, in_progress: 3, done: 4, partial: 4, unable: 2, rescheduled: 2, cancelled: 2,
};

test('ราง · ไม่มีธง / ธง true / option true = จุดของวันนี้ทุกสถานะนัด · ขั้นทั้งหกเท่ากันทุกตัวอักษร', () => {
  assert.deepEqual(Object.keys(RAIL_TODAY).sort(), ['none', ...VISIT_STATUSES].sort(), 'ตารางครบทุกสถานะนัด');
  for (const [status, index] of Object.entries(RAIL_TODAY)) {
    const visit = railVisit(status === 'none' ? null : status);
    const request = railAsk({ committedResultDate: '2026-10-08' });
    const today = requestRailSteps(request, { visit });
    assert.equal(today.index, index, status);
    assert.deepEqual(requestRailSteps({ ...request, surveyNeedsVisit: true }, { visit }), today, `ธง true · ${status}`);
    assert.deepEqual(requestRailSteps({ ...request, surveyNeedsVisit: undefined }, { visit }), today, `ธง undefined · ${status}`);
    assert.deepEqual(requestRailSteps(request, { visit, needsVisit: true }), today, `option true · ${status}`);
    assert.deepEqual(requestRailSteps(request, { visit, needsVisit: undefined }), today, `option undefined · ${status}`);
    assert.deepEqual(requestRailSteps(request, { visit, needsVisit: null }), today, `option null · ${status}`);
  }
  for (const [status, index] of [['draft', 0], ['pending', 1], ['answered', 5], ['closed', 5]]) {
    assert.equal(requestRailSteps(railAsk({ status }), { visit: null }).index, index, status);
  }
});

test('⭐ ราง · งานโต๊ะ: ยังไม่แจ้งวันส่งผล = ขั้น 2 · แจ้งแล้ว = ขั้น 3 · ไม่ขึ้นกับนัด (ไม่มีขั้น 4)', () => {
  const table = [
    ['draft', null, 0], ['draft', '2026-10-08', 0],
    ['pending', null, 1], ['pending', '2026-10-08', 1],
    ['acknowledged', null, 2], ['acknowledged', '   ', 2], ['acknowledged', undefined, 2],
    ['acknowledged', '2026-10-08', 3],
    ['answered', null, 5], ['answered', '2026-10-08', 5],
    ['closed', null, 5], ['closed', '2026-10-08', 5],
  ];
  for (const [status, committedResultDate, index] of table) {
    for (const visitStatus of [null, ...VISIT_STATUSES]) {
      const request = railAsk({ status, committedResultDate });
      const visit = railVisit(visitStatus);
      const label = `${status} · ผล ${committedResultDate} · นัด ${visitStatus}`;
      assert.equal(requestRailSteps(request, { visit, needsVisit: false }).index, index, `option · ${label}`);
      assert.equal(requestRailSteps({ ...request, surveyNeedsVisit: false }, { visit }).index, index, `ธงบนแถว · ${label}`);
    }
  }
});

test('ราง · option ชนะธงบนแถว · ไม่ส่ง visit มา = อ่าน surveyVisit ของใบเหมือนเดิม', () => {
  const done = railVisit('done');
  const request = railAsk({ committedResultDate: '2026-10-08' });
  assert.equal(requestRailSteps({ ...request, surveyNeedsVisit: false }, { visit: done, needsVisit: true }).index, 4);
  assert.equal(requestRailSteps({ ...request, surveyNeedsVisit: true }, { visit: done, needsVisit: false }).index, 3);
  assert.equal(requestRailSteps({ ...request, surveyVisit: done }).index, 4);
  assert.equal(requestRailSteps({ ...request, surveyVisit: done, surveyNeedsVisit: false }).index, 3);
});

test('ราง · งานโต๊ะยังใช้ชื่อขั้นและบรรทัดใต้ขั้นชุดเดิม (คำของงานโต๊ะมาในงวดจอ) · หัวข้ออื่นไม่รู้จักธงนี้', () => {
  for (const visitStatus of [null, ...VISIT_STATUSES]) {
    const request = railAsk({ committedResultDate: '2026-10-08' });
    const visit = railVisit(visitStatus);
    const words = (rail) => rail.steps.map((s) => [s.id, s.label, s.hint]);
    assert.deepEqual(
      words(requestRailSteps(request, { visit, needsVisit: false })),
      words(requestRailSteps(request, { visit })),
      String(visitStatus),
    );
  }
  for (const status of ['draft', 'pending', 'acknowledged', 'answered', 'closed']) {
    const info = { kind: 'info', dept: 'RD', status };
    assert.deepEqual(requestRailSteps({ ...info, surveyNeedsVisit: false }, { needsVisit: false }), requestRailSteps(info), status);
  }
});

/* ── 4) ขั้นของงานบนหน้าคำร้อง (`surveyJobView` → `stageOf`) ───────────────────── */
const TODAY = '2026-09-28';
const spotFile = (spotId) => ({ docType: 'survey_spot', mimeType: 'image/jpeg', fileName: null, metadata: { spotId } });
const jobZones = (extra = {}) => ([
  { id: 'z1', zoneName: 'Reception ชั้น 1', zoneCode: 'ZN-1160-10254', zoneFloor: '01', status: 'ok',
    parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }], spots: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], ...extra },
  { id: 'z2', zoneName: 'ห้อง MD ชั้น 5', zoneCode: 'ZN-1160-10255', zoneFloor: '05', status: 'ok',
    parts: [{ id: 'p', widthM: 6, lengthM: 5, heightM: 2.8 }], spots: [{ id: 'a' }, { id: 'b' }], ...extra },
  { id: 'z3', zoneName: 'ห้อง Treatment ชั้น 5', zoneCode: 'ZN-1160-10256', zoneFloor: '05', status: 'ok',
    parts: [], spots: [], ...extra },
]);
const jobVisit = (o = {}) => ({
  id: 'v1', code: 'SV-26090014', status: 'in_progress', scheduledDate: TODAY, startTime: '10:00:00',
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', assistantIds: [],
  actualDate: TODAY, actualStartTime: '10:12:00', createdByName: 'Apisith Pattangthani',
  createdAt: '2026-09-23T08:15:00Z', ...o,
});
const jobAsk = (o = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26090188', team: 'SV',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-09-23T07:50:00Z',
  acknowledgedAt: '2026-09-23T08:12:00Z', acknowledgedByName: 'Apisith Pattangthani',
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad',
  requestedDueDate: TODAY, requestedDueTime: '10:00:00', requestedResultDate: '2026-09-30',
  committedDueDate: TODAY, committedResultDate: '2026-09-30', dueCommittedAt: '2026-09-23T08:15:00Z',
  surveyVisit: jobVisit(),
  surveyZones: jobZones(),
  surveyFilesByZone: {
    z1: [{ docType: 'survey_wide' }, { docType: 'survey_wide' }, ...['a', 'b', 'c'].map(spotFile)],
    z2: [{ docType: 'survey_wide' }, ...['a', 'b'].map(spotFile)],
    z3: [],
  },
  ...o,
});
const SEND_BACK_PENDING = { pending: true, sentBack: { at: '2026-09-28T08:00:00Z', byName: 'Arnon Aunsapwilai' }, done: null };
const stageOfJob = (request, today = TODAY) => surveyJobView({ request, today, viewer: { canDecide: true } });

// ขั้นของวันนี้รายสถานการณ์ — ค่าที่คาดคือคีย์ที่โค้ดคืนอยู่ก่อนงวดนี้ (ล็อกเป็นตัวอักษร)
const ONSITE_STAGES = [
  ['ร่าง', { status: 'draft', surveyVisit: null }, 'draft'],
  ['รอรับเรื่อง', { status: 'pending', surveyVisit: null }, 'pending'],
  ['รับเรื่องแล้วยังไม่ลงคิว', { surveyVisit: null, committedDueDate: null }, 'queue'],
  ['รับเรื่องแล้วยังไม่ลงคิว · วันส่งผลเลยมาแล้ว', { surveyVisit: null, committedDueDate: null, committedResultDate: '2026-09-20' }, 'queue'],
  ['นัดเข้าไม่ได้', { surveyVisit: jobVisit({ status: 'unable', unableReason: 'ไซต์ปิด' }) }, 'requeue'],
  ['นัดยังเป็นร่าง', { surveyVisit: jobVisit({ status: 'draft' }) }, 'visit-draft'],
  ['นัดไว้ วันนี้', { surveyVisit: jobVisit({ status: 'scheduled' }) }, 'scheduled'],
  ['นัดไว้ เลยวัน', { surveyVisit: jobVisit({ status: 'scheduled', scheduledDate: '2026-09-25' }) }, 'overdue'],
  ['กำลังวัด', {}, 'measuring'],
  ['ช่างส่งงานแล้ว ของขาด', { surveyVisit: jobVisit({ status: 'done', actualEndTime: '11:48:00' }) }, 'crew-gaps'],
  ['ส่งกลับให้ช่างแก้ค้าง', { surveyVisit: jobVisit({ status: 'done', actualEndTime: '11:48:00' }), surveySendBack: SEND_BACK_PENDING }, 'sent-back'],
  ['ส่งผลแล้ว', { answeredAt: '2026-09-29T03:00:00Z', surveyVisit: jobVisit({ status: 'done' }) }, 'sent'],
  ['ปิดครบ', { status: 'closed', answeredAt: '2026-09-29T03:00:00Z', closedAt: '2026-09-30T03:00:00Z', surveyVisit: jobVisit({ status: 'done' }) }, 'closed'],
  ['ยกเลิก', { status: 'cancelled', cancelledAt: '2026-09-24T03:00:00Z', surveyVisit: null }, 'cancelled'],
];

test('ขั้นของงาน · ใบลงหน้างานทั้งสามทรงของแถว = คีย์ของวันนี้ทุกสถานการณ์ · ผลลัพธ์ทั้งก้อนเท่ากัน', () => {
  for (const [name, over, stage] of ONSITE_STAGES) {
    const views = Object.entries(ONSITE_SHAPES).map(([shape, extra]) => {
      const view = stageOfJob(jobAsk({ ...over, surveyZones: jobZones(extra) }));
      assert.equal(view.stage, stage, `${name} · ${shape}`);
      return view;
    });
    /* แถวดิบเดินทางไปกับผลลัพธ์ได้ (ตารางพื้นที่) ⇒ เทียบทุกอย่างที่คนอ่าน โดยตัดคีย์ของคอลัมน์ใหม่ออกก่อน */
    const strip = (view) => JSON.parse(JSON.stringify(view, (key, value) => (
      ['method', 'methodReason', 'methodChangedAt', 'methodChangedByName'].includes(key) ? undefined : value
    )));
    assert.deepEqual(strip(views[1]), strip(views[0]), `${name} · method 'onsite' เทียบกับแถวเก่า`);
    assert.deepEqual(strip(views[2]), strip(views[0]), `${name} · คอลัมน์ว่าง เทียบกับแถวเก่า`);
  }
});

test('⭐ ขั้นของงาน · งานโต๊ะ: ยังไม่แจ้งวันส่งผล = desk-queue · มีวัน = desk-working · เลยวัน = desk-overdue', () => {
  const desk = (o = {}) => jobAsk({
    surveyVisit: null, committedDueDate: null, committedResultDate: null, surveyZones: jobZones(DRAWING), ...o,
  });
  const queue = stageOfJob(desk());
  assert.equal(queue.stage, 'desk-queue');
  assert.deepEqual(queue.status, { label: 'รอแจ้งวันส่งผล', tone: 'warning' });
  assert.equal(queue.index, 2, 'จุดบนรางของงานโต๊ะที่ยังไม่แจ้งวันส่งผล');
  assert.equal(stageOfJob(desk({ committedResultDate: '   ' })).stage, 'desk-queue', 'ช่องว่างล้วนคือยังไม่มีวัน');

  const working = stageOfJob(desk({ committedResultDate: '2026-09-30' }));
  assert.equal(working.stage, 'desk-working');
  assert.deepEqual(working.status, { label: 'กำลังประเมินจากแบบ', tone: 'info' });
  assert.equal(working.index, 3);
  assert.equal(working.now.tone, 'info');
  assert.equal(stageOfJob(desk({ committedResultDate: TODAY })).stage, 'desk-working', 'วันนี้ยังไม่เลย');
  assert.equal(stageOfJob(desk({ committedResultDate: '2026-09-20' }), null).stage, 'desk-working', 'ไม่รู้วันนี้ = ไม่นับเลยกำหนด');

  const overdue = stageOfJob(desk({ committedResultDate: '2026-09-27' }));
  assert.equal(overdue.stage, 'desk-overdue');
  assert.deepEqual(overdue.status, { label: 'เลยวันส่งผล', tone: 'danger' });
  assert.equal(overdue.now.tone, 'danger');
});

test('⭐ ขั้นของงาน · งานโต๊ะไม่มีขั้นของนัดและไม่มี "ส่งกลับให้ช่างแก้" — แม้นัดเดิมยังติดใบอยู่', () => {
  const desk = (o = {}) => jobAsk({ committedResultDate: '2026-09-30', surveyZones: jobZones(DRAWING), ...o });
  const visits = [
    null, jobVisit({ status: 'draft' }), jobVisit({ status: 'scheduled', scheduledDate: '2026-09-25' }), jobVisit(),
    jobVisit({ status: 'done', actualEndTime: '11:48:00' }), jobVisit({ status: 'unable' }), jobVisit({ status: 'cancelled' }),
  ];
  for (const surveyVisit of visits) {
    assert.equal(stageOfJob(desk({ surveyVisit })).stage, 'desk-working', String(surveyVisit?.status));
  }
  // ใบที่ช่างไปแล้ว หัวหน้าส่งกลับค้างไว้ แล้วทุกพื้นที่ถูกสลับเป็นจากแบบ — ไม่มีอะไรให้ช่างแก้แล้ว
  const sentBack = stageOfJob(desk({
    surveyVisit: jobVisit({ status: 'done', actualEndTime: '11:48:00' }), surveySendBack: SEND_BACK_PENDING,
  }));
  assert.notEqual(sentBack.stage, 'sent-back');
  assert.equal(sentBack.stage, 'desk-working');
});

test('ขั้นของงาน · งานโต๊ะ: ขั้นที่มาก่อนคำถามเรื่องนัดยังตอบเหมือนเดิม (ร่าง · รอรับเรื่อง · ส่งแล้ว · ปิด · ยกเลิก · ไม่มีพื้นที่)', () => {
  const desk = (o = {}) => jobAsk({ surveyVisit: null, committedResultDate: '2026-09-27', surveyZones: jobZones(DRAWING), ...o });
  assert.equal(stageOfJob(desk({ status: 'draft' })).stage, 'draft');
  assert.equal(stageOfJob(desk({ status: 'pending' })).stage, 'pending');
  assert.equal(stageOfJob(desk({ answeredAt: '2026-09-29T03:00:00Z' })).stage, 'sent');
  assert.equal(stageOfJob(desk({ status: 'closed', answeredAt: '2026-09-29T03:00:00Z', closedAt: '2026-09-30T03:00:00Z' })).stage, 'closed');
  assert.equal(stageOfJob(desk({ status: 'closed', closedAt: '2026-09-30T03:00:00Z' })).stage, 'closed-unassessed');
  assert.equal(stageOfJob(desk({ closedAt: '2026-09-30T03:00:00Z' })).stage, 'closed-early');
  assert.equal(stageOfJob(desk({ status: 'cancelled', cancelledAt: '2026-09-24T03:00:00Z' })).stage, 'cancelled');
  // ตัดออกหมดทั้งใบ (ทุกแถวจากแบบ) — ยังเป็น "ไม่มีพื้นที่ให้ประเมิน" ตามเดิม
  assert.equal(stageOfJob(desk({ surveyZones: jobZones({ ...DRAWING, status: 'cut' }) })).stage, 'no-zones');
});

test('ขั้นของงาน · ใบผสม (ยังมีพื้นที่ลงหน้างาน) และใบที่ตัดพื้นที่จากแบบออก = ขั้นของนัดตามเดิม', () => {
  const mixed = jobZones().map((z, i) => (i === 2 ? { ...z, ...DRAWING } : z));
  assert.equal(stageOfJob(jobAsk({ surveyVisit: null, surveyZones: mixed })).stage, 'queue');
  assert.equal(stageOfJob(jobAsk({ surveyVisit: jobVisit({ status: 'scheduled' }), surveyZones: mixed })).stage, 'scheduled');
  const cutDrawing = jobZones().map((z, i) => (i === 2 ? { ...z, ...DRAWING, status: 'cut' } : z));
  assert.equal(stageOfJob(jobAsk({ surveyVisit: null, surveyZones: cutDrawing })).stage, 'queue');
});

/* ── 5) ตัวโหลดใบเดียว (`findRequest`) — เดินจริงกับ supabase ปลอม ไม่ใช่อ่านซอร์ส ──────── */
const findDb = (zones, o = {}) => fakeSupabase({
  dept_requests: [
    { id: 'RQ-S', kind: 'site_survey', dept: 'TS', status: 'acknowledged', siteId: null, createdAt: '2026-10-01T00:00:00Z' },
    { id: 'RQ-I', kind: 'info', dept: 'RD', status: 'acknowledged', createdAt: '2026-10-01T00:00:00Z' },
  ],
  service_survey_zones: zones,
  ...o,
});

test('⭐ findRequest: ใบประเมินได้ธง surveyNeedsVisit จากแถวพื้นที่ที่โหลดอยู่แล้ว (ไม่มีคำขอเพิ่ม) · หัวข้ออื่นไม่มีคีย์นี้', async () => {
  const cases = [
    ['ไม่มีแถวพื้นที่', [], true],
    ['แถวเก่า ไม่มีคีย์ method', [zone('Z1', 'RQ-S'), zone('Z2', 'RQ-S', { status: 'cut' })], true],
    ['ผสม', [zone('Z1', 'RQ-S', DRAWING), zone('Z2', 'RQ-S', { method: 'onsite' })], true],
    ['จากแบบล้วน', [zone('Z1', 'RQ-S', DRAWING), zone('Z2', 'RQ-S', { ...DRAWING, status: 'added' })], false],
    ['พื้นที่ลงหน้างานถูกตัด เหลือแต่จากแบบ', [zone('Z1', 'RQ-S', { status: 'cut' }), zone('Z2', 'RQ-S', DRAWING)], false],
    ['ตัดหมด ลงหน้างาน (ทรง RQ-AS-26090233)', [zone('Z1', 'RQ-S', { status: 'cut' })], true],
  ];
  for (const [name, zones, expected] of cases) {
    const db = findDb([...zones, zone('Z9', 'RQ-OTHER', DRAWING)]);
    const got = await findRequest(db, 'RQ-S');
    assert.equal(got.surveyNeedsVisit, expected, name);
    assert.equal(got.surveyZones.length, zones.length, name);
    assert.equal(db.of('service_survey_zones').length, 1, `${name}: อ่านพื้นที่ครั้งเดียวเท่าเดิม`);
    // ธงตัวเดียวกับที่การ์ดลงคิวและรางอ่าน
    assert.equal(surveyQueueStep(got), expected ? 'queue' : null, name);
  }
  const info = findDb([zone('Z1', 'RQ-I', DRAWING)]);
  const other = await findRequest(info, 'RQ-I');
  assert.equal(other.kind, 'info');
  assert.ok(!('surveyNeedsVisit' in other), 'หัวข้ออื่นไม่มีคีย์ (ผู้อ่านตีความ "ไม่มี" = เดินเหมือนเดิม)');
  assert.equal(info.of('service_survey_zones').length, 0);
});

/* ── 6) ช่องค้าง "ส่งกลับให้แก้" ของช่าง (`loadSentBackSurveys` ผ่าน `loadMyWorkRows`) ────── */
const ME = 'U-TECH';
const WORK_TODAY = '2026-10-08';
const WINDOW = { from: WORK_TODAY, to: addDays(WORK_TODAY, 13), today: WORK_TODAY };
const surveyVisitRow = (id, requestId, o = {}) => ({
  id, code: `SV-${id}`, kind: 'survey', siteId: 'S9', requestId,
  scheduledDate: addDays(WORK_TODAY, -3), startTime: '09:00', status: 'done', actualDate: addDays(WORK_TODAY, -3),
  assigneeId: ME, assigneeName: 'ช่างเอ', assistantIds: [], createdAt: '2026-10-01T00:00:00Z', ...o,
});
const sendBackRow = (id, entityId, createdAt = '2026-10-06T03:00:00.000Z') => ({
  id, entityType: 'dept_request', entityId, kind: 'send_back',
  body: 'หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน', meta: { note: 'ถ่ายภาพกว้างเพิ่ม', items: ['ถ่ายภาพกว้างเพิ่ม'] },
  authorId: 'U-HEAD', authorName: 'หัวหน้า', createdAt,
});
const liveAsk = (id) => ({ id, status: 'acknowledged', answeredAt: null, closedAt: null, cancelledAt: null });
const workDb = (o = {}, opts) => fakeSupabase({
  service_visits: [surveyVisitRow('V-ON', 'RQ-ON'), surveyVisitRow('V-DESK', 'RQ-DESK'), surveyVisitRow('V-MIX', 'RQ-MIX')],
  entity_updates: [sendBackRow('EU-1', 'RQ-ON'), sendBackRow('EU-2', 'RQ-DESK', '2026-10-06T04:00:00.000Z'), sendBackRow('EU-3', 'RQ-MIX', '2026-10-06T05:00:00.000Z')],
  dept_requests: [liveAsk('RQ-ON'), liveAsk('RQ-DESK'), liveAsk('RQ-MIX')],
  service_survey_zones: [
    zone('Z1', 'RQ-ON'), zone('Z2', 'RQ-ON', { status: 'cut' }),
    zone('Z3', 'RQ-DESK', DRAWING), zone('Z4', 'RQ-DESK', { ...DRAWING, status: 'cut' }),
    zone('Z5', 'RQ-MIX', DRAWING), zone('Z6', 'RQ-MIX', { method: 'onsite' }),
  ],
  ...o,
}, opts);

test('⭐ ส่งกลับให้แก้: ใบที่ทุกพื้นที่กลายเป็นจากแบบแล้ว ไม่ค้างในคิวช่าง · ใบลงหน้างาน/ใบผสมยังค้างเหมือนเดิม', async () => {
  const rows = await loadMyWorkRows(workDb(), { assigneeId: ME, ...WINDOW });
  assert.deepEqual(rows.sentBack.map((v) => v.id), ['V-ON', 'V-MIX'], 'เรียงรอนานสุดก่อน · V-DESK ไม่มีอะไรให้ช่างแก้แล้ว');
  assert.equal(rows.sentBack[0].sendBack.note, 'ถ่ายภาพกว้างเพิ่ม');

  // ใบที่ไม่มีแถวพื้นที่เลย (อ่านได้ 0 แถว) = ต้องมีนัด ⇒ ยังค้างตามเดิม
  const bare = await loadMyWorkRows(workDb({ service_survey_zones: [] }), { assigneeId: ME, ...WINDOW });
  assert.deepEqual(bare.sentBack.map((v) => v.id), ['V-ON', 'V-DESK', 'V-MIX']);
});

test('ส่งกลับให้แก้: อ่านวิธีประเมินครั้งเดียว เฉพาะใบที่ค้าง · คอลัมน์แคบ · ไม่มีใครค้าง = ไม่อ่านพื้นที่เลย', async () => {
  const db = workDb();
  await loadMyWorkRows(db, { assigneeId: ME, ...WINDOW });
  const reads = db.of('service_survey_zones');
  assert.equal(reads.length, 1);
  assert.deepEqual(db.opsOf(reads[0], 'select'), [['id, "requestId", status, method']]);
  assert.deepEqual(db.opsOf(reads[0], 'in').map(([col, ids]) => [col, [...ids].sort()]), [['requestId', ['RQ-DESK', 'RQ-MIX', 'RQ-ON']]]);
  assert.deepEqual(db.opsOf(reads[0], 'order'), [['id', { ascending: true }]]);
  assert.deepEqual(db.opsOf(reads[0], 'range'), [[0, 999]], 'fetchAll ไล่หน้า');

  const quiet = workDb({ entity_updates: [] });
  await loadMyWorkRows(quiet, { assigneeId: ME, ...WINDOW });
  assert.equal(quiet.of('service_survey_zones').length, 0);
  // ทั้งฝ่าย (scope=team) ไม่ถามส่งกลับเลย ⇒ ไม่อ่านพื้นที่ด้วย
  const team = workDb();
  await loadMyWorkRows(team, { assigneeId: null, ...WINDOW });
  assert.equal(team.of('service_survey_zones').length, 0);
});

test('🔴 ส่งกลับให้แก้: อ่านวิธีประเมินพลาด = โยน — ไม่เดาว่า "ยังค้าง" หรือ "ไม่ค้าง"', async () => {
  await assert.rejects(
    loadMyWorkRows(workDb({}, { failTable: 'service_survey_zones' }), { assigneeId: ME, ...WINDOW }),
    (e) => e === BOOM,
  );
});

/* ── ยามซอร์ส: จุดในกลุ่มนี้ถามวิธีประเมินผ่านโมดูลใบเท่านั้น ───────────────────── */
test('ยาม: หกไฟล์ของกลุ่มนี้ไม่เทียบค่าคอลัมน์ method เอง — ถามผ่าน surveyNeedsVisit ของโมดูลใบ', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const read = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
  for (const rel of ['./surveyQueueRepo.js', './surveyJob.js', './visitsRepo.js', '../materialPricesAdmin.js']) {
    const src = read(rel);
    assert.match(src, /import \{[^}]*\bsurveyNeedsVisit\b[^}]*\} from '(\.\/|@\/lib\/service\/)surveyMethod'/, rel);
    assert.doesNotMatch(src, /\.method\s*[!=]==?/, rel);
  }
  // สองตัวนี้อ่านธง `surveyNeedsVisit` ที่ตัวโหลดติดมาบนแถว — ไม่แตะคอลัมน์ method เลย
  for (const rel of ['./surveyQueue.js', '../requests/requestRail.js']) {
    assert.doesNotMatch(read(rel), /\.method\b/, rel);
  }
});
