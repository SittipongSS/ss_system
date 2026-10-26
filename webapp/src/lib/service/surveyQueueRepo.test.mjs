// ── ตัวโหลดคำร้องรอลงคิวของหน้าจัดคิว (มติเจ้าของ 23/09) ─────────────────────────────
//
// ⭐ สามอย่างที่ต้องล็อก:
//   1. ตัวกรองถูกชุด — ฝ่าย TS · หัวข้อที่เป็นนัดได้ · ใบที่เดินอยู่ (ไม่ใช่ "รอ TS ตอบ" ของคิวคำร้อง)
//   2. "ลงคิวแล้วหรือยัง" ตอบด้วยนัดชุดเดียวกับที่จอวาด · ประวัตินัดถามเฉพาะใบที่ต้องใช้จริง
//   3. payload = การ์ด (แถวที่ไม่มีขั้นถูกตัดทิ้ง) · ไล่หน้าครบ · query พัง = โยน ไม่ใช่อาร์เรย์ว่าง
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVEY_QUEUE_REQUEST_COLUMNS, SURVEY_QUEUE_VISIT_COLUMNS, loadSurveyQueueRequests,
} from './surveyQueueRepo.js';
import { SITE_REQUEST_KINDS } from './surveyQueue.js';
import { REQUEST_OPEN_STATUSES } from '../requests/statuses.js';
import { IN_CHUNK_SIZE } from '../supabaseInChunks.js';

/* ฐานข้อมูลปลอม — กรองจริงตาม eq/in และ **ตัดที่ 1,000 แถว** เหมือน max_rows ของโปรเจกต์
   (แพตเทิร์นเดียวกับ visitBundle.test.mjs) */
const MAX_ROWS = 1000;
function fakeDb(tables = {}, { errors = {} } = {}) {
  const log = [];
  return {
    log,
    from(table) {
      const q = { table, select: null, filters: [], orders: [], ranged: false };
      log.push(q);
      const matching = () => {
        let rows = [...(tables[table] || [])];
        for (const [op, col, val] of q.filters) {
          if (op === 'in') rows = rows.filter((r) => val.includes(r[col]));
          if (op === 'eq') rows = rows.filter((r) => r[col] === val);
        }
        return rows;
      };
      const result = (from = 0, to = MAX_ROWS - 1) => Promise.resolve(errors[table]
        ? { data: null, error: errors[table] }
        : { data: matching().slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null });
      const chain = {
        select(cols) { q.select = cols; return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        range(from, to) { q.ranged = true; return result(from, to); },
        then(resolve, reject) { return result().then(resolve, reject); },
      };
      return chain;
    },
  };
}

const req = (o) => ({
  kind: 'site_survey', dept: 'TS', status: 'acknowledged', siteId: 'S1',
  acknowledgedAt: '2026-09-20T02:00:00.000Z', committedDueDate: null, closedAt: null,
  submittedAt: '2026-09-19T02:00:00.000Z', ...o,
});

const requests = [
  req({ id: 'R-pending', status: 'pending', acknowledgedAt: null }),
  req({ id: 'R-queue' }),
  req({ id: 'R-live', committedDueDate: '2026-09-25' }),          // มีนัดที่ยังมีชีวิตในชุดของจอ
  req({ id: 'R-cancelled', committedDueDate: '2026-09-24' }),     // นัดเดิมยกเลิก ⇒ ลงคิวใหม่
  req({ id: 'R-done', committedDueDate: '2026-09-18' }),          // ช่างไปแล้ว ⇒ รอผล ไม่ใช่การ์ด
  req({ id: 'R-lost', committedDueDate: '2026-09-23' }),          // มีวันแต่ไม่เคยมีนัด ⇒ ลงคิวใหม่
  req({ id: 'R-closed', closedAt: '2026-09-21T00:00:00.000Z' }),  // ผู้ขอปิดแล้ว
  req({ id: 'R-info', kind: 'info' }),                            // ผิดหัวข้อ
  req({ id: 'R-rd', dept: 'RD' }),                                 // ผิดฝ่าย
  req({ id: 'R-answered', status: 'answered' }),                  // ผิดสถานะ
];
const history = [
  { id: 'V-live', requestId: 'R-live', status: 'scheduled', createdAt: '2026-09-21T00:00:00Z' },
  { id: 'V-cancel', requestId: 'R-cancelled', status: 'cancelled', createdAt: '2026-09-21T00:00:00Z' },
  { id: 'V-done', requestId: 'R-done', status: 'done', createdAt: '2026-09-17T00:00:00Z' },
];
const queueVisits = [{ id: 'V-live', requestId: 'R-live', status: 'scheduled', siteId: 'S1' }];

test('⭐ payload = การ์ด: รอรับเรื่อง · รอลงคิว · นัดหลุด — ตัดใบที่ลงคิวแล้ว/ช่างไปแล้ว/ปิดแล้ว/ผิดชุด', async () => {
  const db = fakeDb({ dept_requests: requests, service_visits: history });
  const got = await loadSurveyQueueRequests(db, { visits: queueVisits });
  assert.deepEqual(got.map((r) => r.id).sort(), ['R-cancelled', 'R-lost', 'R-pending', 'R-queue']);
  const byId = Object.fromEntries(got.map((r) => [r.id, r]));
  assert.equal(byId['R-cancelled'].surveyVisit.id, 'V-cancel', 'การ์ดต้องบอกได้ว่านัดเดิมจบแบบไหน');
  assert.equal(byId['R-lost'].surveyVisit, null);
  assert.equal(byId['R-queue'].surveyVisit, null);
});

test('ตัวกรองคำร้อง: ฝ่าย TS · หัวข้อจากทะเบียน · สถานะที่เดินอยู่ · ไล่หน้าด้วยลำดับนิ่งที่ id', async () => {
  const db = fakeDb({ dept_requests: requests, service_visits: history });
  await loadSurveyQueueRequests(db, { visits: queueVisits });
  const q = db.log.find((x) => x.table === 'dept_requests');
  assert.equal(q.select, SURVEY_QUEUE_REQUEST_COLUMNS);
  assert.deepEqual(q.filters, [
    ['eq', 'dept', 'TS'],
    ['in', 'kind', SITE_REQUEST_KINDS],
    ['in', 'status', REQUEST_OPEN_STATUSES],
  ]);
  assert.deepEqual(q.orders, [['submittedAt', true], ['id', true]]);
  assert.ok(q.ranged, 'ต้องไล่หน้าด้วย .range() (fetchAll)');
  assert.doesNotMatch(SURVEY_QUEUE_REQUEST_COLUMNS, /\*/);
  // ประเมินจากแบบ งวด 4 (S4 D-1): การ์ดอ่าน `variant` (สิ่งที่ฝ่ายขายขอ) — คอลัมน์มีตั้งแต่ mig 0351 · ชื่อไม่มีตัวใหญ่จึงไม่ต้องครอบอัญประกาศ
  assert.ok(SURVEY_QUEUE_REQUEST_COLUMNS.split(',').map((c) => c.trim()).includes('variant'));
});

test('⭐ ประวัตินัดถามเฉพาะใบที่รับเรื่องแล้ว + มีวัน + ไม่มีนัดที่ยังมีชีวิตในชุดของจอ', async () => {
  const db = fakeDb({ dept_requests: requests, service_visits: history });
  await loadSurveyQueueRequests(db, { visits: queueVisits });
  const visitQueries = db.log.filter((x) => x.table === 'service_visits');
  assert.equal(visitQueries.length, 1);
  const [vq] = visitQueries;
  assert.equal(vq.select, SURVEY_QUEUE_VISIT_COLUMNS);
  const inIds = vq.filters.find(([op, col]) => op === 'in' && col === 'requestId')[2];
  assert.deepEqual([...inIds].sort(), ['R-cancelled', 'R-done', 'R-lost'], 'R-live มีนัดในชุดของจออยู่แล้ว ไม่ต้องถาม');
  assert.deepEqual(vq.orders, [['id', true]]);
  assert.ok(vq.ranged);
});

test('ไม่มีใบที่ต้องดูประวัตินัด = ไม่ยิงถามตารางนัดเลย', async () => {
  const db = fakeDb({ dept_requests: [req({ id: 'R1' }), req({ id: 'R2', status: 'pending' })], service_visits: history });
  const got = await loadSurveyQueueRequests(db, { visits: [] });
  assert.equal(got.length, 2);
  assert.equal(db.log.some((x) => x.table === 'service_visits'), false);
});

test('🔴 นัดที่ยังมีชีวิตโผล่ในประวัติ (เพิ่งลงคิวระหว่างสองคำขอ) = ไม่ใช่การ์ด', async () => {
  const db = fakeDb({
    dept_requests: [req({ id: 'R1', committedDueDate: '2026-09-25' })],
    service_visits: [
      { id: 'V-old', requestId: 'R1', status: 'cancelled', createdAt: '2026-09-22T00:00:00Z' },
      { id: 'V-new', requestId: 'R1', status: 'draft', createdAt: '2026-09-10T00:00:00Z' },
    ],
  });
  assert.deepEqual(await loadSurveyQueueRequests(db, { visits: [] }), []);
});

test('🔴 ลิสต์ id ของประวัตินัดถูกซอยก้อน (URL 16 KB) · ใบเกินพันใบมาครบ (เพดาน 1,000 แถว)', async () => {
  const many = Array.from({ length: 1234 }, (_, i) => req({
    id: `R${String(i).padStart(5, '0')}`, committedDueDate: '2026-09-25',
  }));
  const db = fakeDb({ dept_requests: many, service_visits: [] });
  const got = await loadSurveyQueueRequests(db, { visits: [] });
  assert.equal(got.length, 1234, 'ทุกใบเป็นการ์ดลงคิวใหม่');
  const chunks = db.log.filter((x) => x.table === 'service_visits')
    .map((x) => x.filters.find(([op]) => op === 'in')[2]);
  assert.equal(chunks.length, Math.ceil(1234 / IN_CHUNK_SIZE));
  assert.ok(chunks.every((ids) => ids.length <= IN_CHUNK_SIZE));
});

test('query พัง = โยน error ต่อ ไม่ใช่คืนอาร์เรย์ว่าง ("ไม่มีใบรอลงคิว" ซึ่งโกหก)', async () => {
  const boom = { message: 'connection reset' };
  await assert.rejects(
    loadSurveyQueueRequests(fakeDb({}, { errors: { dept_requests: boom } }), { visits: [] }),
    (e) => e === boom,
  );
  await assert.rejects(
    loadSurveyQueueRequests(fakeDb({ dept_requests: [req({ id: 'R1', committedDueDate: '2026-09-25' })] },
      { errors: { service_visits: boom } }), { visits: [] }),
    (e) => e === boom,
  );
});

/* ── งวด S2b (ประเมินจากแบบ §2.5 e): ที่มาของใบที่หัวหน้าสลับกลับเป็นลงหน้างาน ─────────────────────────────
   การ์ดลงคิวของใบแบบนี้ต้องบอกผู้วางคิวว่าทำไมใบกลับมา ("หัวหน้าเปลี่ยนเป็นลงหน้างาน: {เหตุผล}") — เหตุผลอ่านจากแถวพื้นที่
   ในคำสั่งอ่านเดิม (ไม่มีคำสั่งอ่านเพิ่ม) · ใบของวันนี้ที่ไม่เคยสลับได้ `null` */
import { SURVEY_QUEUE_ZONE_COLUMNS } from './surveyQueueRepo.js';

test('⭐ surveyMethodBack ติดทุกแถว: ใบที่สลับกลับเป็นลงหน้างาน = { reason } ของการสลับล่าสุด · ใบที่ไม่เคยสลับ = null · ไม่มีคำสั่งอ่านเพิ่ม', async () => {
  const zone = (id, requestId, o = {}) => ({ id, requestId, status: 'ok', method: 'onsite', methodReason: null, methodChangedAt: null, ...o });
  const db = fakeDb({
    dept_requests: requests,
    service_visits: history,
    service_survey_zones: [
      zone('Z1', 'R-queue', { methodReason: 'ลูกค้าขอให้เข้าวัดจริง', methodChangedAt: '2026-09-20T03:00:00+00:00' }),
      zone('Z2', 'R-queue', { methodReason: 'แบบไม่ตรงหน้างาน ต้องวัดใหม่', methodChangedAt: '2026-09-20T09:00:00.000Z' }),
      zone('Z3', 'R-pending'),
      // แถวก่อน mig 0408 — ไม่มีคีย์ของวิธีประเมินเลย
      { id: 'Z4', requestId: 'R-lost', status: 'ok' },
    ],
  });
  const got = await loadSurveyQueueRequests(db, { visits: queueVisits });
  const byId = Object.fromEntries(got.map((r) => [r.id, r]));
  assert.deepEqual(byId['R-queue'].surveyMethodBack, { reason: 'แบบไม่ตรงหน้างาน ต้องวัดใหม่' });
  assert.equal(byId['R-pending'].surveyMethodBack, null);
  assert.equal(byId['R-lost'].surveyMethodBack, null);
  assert.equal(byId['R-cancelled'].surveyMethodBack, null, 'ใบที่ยังไม่มีแถวพื้นที่');
  for (const row of got) assert.ok(Object.hasOwn(row, 'surveyMethodBack'), row.id);
  // คำสั่งอ่านแถวพื้นที่ยังมีชุดเดียว (ซอยก้อนตาม id) และระบุคอลัมน์ — เพิ่มมาสองคอลัมน์ท้าย
  const zoneQueries = db.log.filter((x) => x.table === 'service_survey_zones');
  assert.equal(zoneQueries.length, 1);
  assert.equal(zoneQueries[0].select, SURVEY_QUEUE_ZONE_COLUMNS);
  assert.equal(SURVEY_QUEUE_ZONE_COLUMNS, 'id, "requestId", status, method, "methodReason", "methodChangedAt"');
});

test('surveyMethodBack: ใบที่กลายเป็นงานโต๊ะ (ไม่ต้องมีนัด) ไม่ถือที่มา — และใบแบบนั้นที่รับเรื่องแล้วไม่ใช่การ์ดลงคิวอยู่แล้ว', async () => {
  const db = fakeDb({
    dept_requests: [req({ id: 'R-desk-pending', status: 'pending', acknowledgedAt: null })],
    service_survey_zones: [
      { id: 'Z1', requestId: 'R-desk-pending', status: 'ok', method: 'drawing', methodReason: 'ฝ่ายขายมีแบบครบ', methodChangedAt: '2026-09-20T03:00:00Z' },
      { id: 'Z2', requestId: 'R-desk-pending', status: 'cut', method: 'onsite', methodReason: 'เคยสลับกลับ', methodChangedAt: '2026-09-21T03:00:00Z' },
    ],
  });
  const got = await loadSurveyQueueRequests(db, { visits: [] });
  assert.deepEqual(got.map((r) => [r.id, r.surveyNeedsVisit, r.surveyMethodBack]), [['R-desk-pending', false, null]]);
});
