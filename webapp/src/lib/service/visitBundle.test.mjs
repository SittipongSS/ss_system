// ── รายการงานของหน้าจัดตาราง: ตัวโหลดนัด · ก้อนประกอบ · route (มติเจ้าของ 2026-09-22) ──
//
// ⭐ สามชิ้นที่ต้องล็อก:
//   1. `loadQueueVisits` — ร่าง + นัดเปิด **ไม่มีขอบวันที่** · นัดปิดเฉพาะ 14 วันล่าสุด · ไล่หน้าครบ
//   2. `visitBundle` — ก้อนเดียวกับที่ตารางสัปดาห์เคยประกอบเอง (รูป response ต้องไม่เปลี่ยน)
//      และบริบทด่านโหลดเฉพาะไซต์ที่ผู้เรียกขอ
//   3. route รายการงาน — ด่านอ่านตัวเดียวกับตารางสัปดาห์ · ด่านโหลดเฉพาะไซต์ของร่าง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { VISIT_STATUSES, isClosedVisit, isDraftVisit, isOpenVisit } from './visitStatus.js';
import { QUEUE_CLOSED_DAYS, addDaysIso } from './scheduleQueue.js';
import { apiWriteAllowed, lockedOut } from '../../proxy.js';

/* ⚠️ visitsRepo ลาก `@/lib/http` → authUser → `next/headers` มาด้วย ซึ่ง raw Node หาไม่เจอ
   (package exports ของ next ต้องลงท้าย .js — เหตุเดียวกับที่ test-loader แก้ให้ next/server)
   ⇒ ต่อ hook เฉพาะไฟล์นี้ก่อนค่อย import แบบ dynamic · `node --test` แยก process ต่อไฟล์
   hook นี้จึงไม่รั่วไปเทสต์อื่น · ได้เทสต์พฤติกรรมจริงแทนการอ่าน source อย่างเดียว */
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { return n(s === 'next/headers' ? 'next/headers.js' : s, c); }",
));
const { loadQueueVisits } = await import('./visitsRepo.js');
const { visitBundle } = await import('./visitBundle.js');

/* ── ฐานข้อมูลปลอมในหน่วยความจำ — กรองจริงตาม in/gte/eq และ **ตัดที่ 1,000 แถว**
   เหมือน max_rows ของโปรเจกต์ ⇒ ตัวโหลดที่ลืมไล่หน้าจะได้ข้อมูลขาดในเทสต์ด้วย
   ไม่ใช่ผ่านเพราะของปลอมใจดีกว่าของจริง */
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
          if (op === 'gte') rows = rows.filter((r) => r[col] != null && r[col] >= val);
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
        gte(col, val) { q.filters.push(['gte', col, val]); return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        range(from, to) { q.ranged = true; return result(from, to); },
        then(resolve, reject) { return result().then(resolve, reject); },
      };
      return chain;
    },
  };
}

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const TODAY = '2026-09-22';
const CLOSED_SINCE = addDaysIso(TODAY, -QUEUE_CLOSED_DAYS);

/* ══ 1 · loadQueueVisits ══════════════════════════════════════════════ */

test('ช่วงนัดปิดของรายการงาน = 14 วันก่อนวันนี้ (ตัวเลขเดียวกับที่จอใช้)', () => {
  assert.equal(QUEUE_CLOSED_DAYS, 14);
  assert.equal(CLOSED_SINCE, '2026-09-08');
  // ข้ามเดือน/ข้ามปี — เลขคณิตปฏิทินล้วน ไม่มีโซนเวลา
  assert.equal(addDaysIso('2026-03-05', -14), '2026-02-19');
  assert.equal(addDaysIso('2027-01-03', -14), '2026-12-20');
  assert.equal(addDaysIso('bad', 1), null);
});

test('⭐ ทุกสถานะ × อดีต/อนาคต: ร่างและนัดเปิดมาครบทุกวัน · นัดปิดเฉพาะ 14 วัน · ยกเลิก/เลื่อนไม่มา', async () => {
  const rows = [];
  for (const status of VISIT_STATUSES) {
    for (const [tag, date] of [['old', '2026-06-01'], ['recent', '2026-09-15'], ['future', '2026-11-30']]) {
      rows.push({
        id: `${status}-${tag}`, status, scheduledDate: date,
        // DB บังคับวันเข้าจริงของสามสถานะปิด (mig 0300) — อนาคตของนัดปิดไม่มีจริง ใช้วันนี้แทน
        actualDate: isClosedVisit({ status }) ? (tag === 'future' ? TODAY : date) : null,
      });
    }
  }
  const got = await loadQueueVisits(fakeDb({ service_visits: rows }), { closedSince: CLOSED_SINCE });
  const ids = new Set(got.map((v) => v.id));
  assert.equal(ids.size, got.length, 'สองก้อนต้องไม่ซ้อนกัน');

  for (const row of rows) {
    const inQueue = isDraftVisit(row) || isOpenVisit(row);
    const recentClosed = isClosedVisit(row) && row.actualDate >= CLOSED_SINCE;
    assert.equal(ids.has(row.id), inQueue || recentClosed, row.id);
  }
  // ร่างที่วันเลยมาแล้ว = ของที่ต้องเห็นที่สุด ห้ามถูกตัดตามวัน
  assert.ok(ids.has('draft-old'));
  assert.ok(ids.has('scheduled-old'), 'นัดค้างเมื่อเดือนก่อนต้องยังอยู่ในรายการ');
  assert.ok(!ids.has('done-old'), 'นัดปิดเกิน 14 วันไม่มา');
  assert.ok(!ids.has('cancelled-recent') && !ids.has('rescheduled-recent'));

  // ก้อนงานเปิดมาก่อน ก้อนปิดตามหลัง
  const firstClosed = got.findIndex(isClosedVisit);
  assert.ok(firstClosed > 0);
  assert.ok(got.slice(firstClosed).every(isClosedVisit));
});

test('ชุดสถานะที่ส่งเข้า PostgREST ประกอบจาก visitStatus.js ไม่ใช่ลิสต์เขียนมือ', async () => {
  const db = fakeDb({ service_visits: [] });
  await loadQueueVisits(db, { closedSince: CLOSED_SINCE });
  const [open, closed] = db.log;
  const statusIn = (q) => q.filters.find(([op, col]) => op === 'in' && col === 'status')[2];
  assert.deepEqual(statusIn(open), VISIT_STATUSES.filter((s) => isDraftVisit({ status: s }) || isOpenVisit({ status: s })));
  assert.deepEqual(statusIn(closed), VISIT_STATUSES.filter((s) => isClosedVisit({ status: s })));
  assert.equal(open.filters.some(([op]) => op === 'gte'), false, 'งานเปิดไม่มีขอบวันที่');
  assert.deepEqual(closed.filters.find(([op]) => op === 'gte'), ['gte', 'actualDate', CLOSED_SINCE]);
  // ลำดับนิ่ง: คีย์สุดท้ายต้องเป็น id ไม่งั้นไล่หน้าแล้วได้แถวซ้ำ/แถวหาย
  assert.deepEqual(open.orders, [['scheduledDate', true], ['id', true]]);
  assert.deepEqual(closed.orders, [['actualDate', false], ['id', true]]);
  assert.ok(open.ranged && closed.ranged, 'ต้องไล่หน้าด้วย .range() (fetchAll)');
});

test('🔴 ร่างเกินพันใบต้องมาครบ — เพดาน max_rows ตัดเงียบ ๆ', async () => {
  const rows = Array.from({ length: 1234 }, (_, i) => ({
    id: `V${String(i).padStart(5, '0')}`, status: 'draft', scheduledDate: TODAY, actualDate: null,
  }));
  const got = await loadQueueVisits(fakeDb({ service_visits: rows }), { closedSince: CLOSED_SINCE });
  assert.equal(got.length, 1234);
});

test('query พัง = โยน error ต่อ ไม่ใช่คืนรายการว่าง (จอว่าง = "ไม่มีงาน" ซึ่งโกหก)', async () => {
  const boom = { message: 'connection reset' };
  await assert.rejects(
    loadQueueVisits(fakeDb({}, { errors: { service_visits: boom } }), { closedSince: CLOSED_SINCE }),
    (e) => e === boom,
  );
  await assert.rejects(loadQueueVisits(fakeDb({}), {}), /closedSince/);
});

/* ══ 2 · visitBundle ══════════════════════════════════════════════════ */

const bundleTables = () => ({
  service_sites: [
    { id: 'S1', code: 'ST-1', name: 'ไซต์หนึ่ง' },
    { id: 'S2', code: 'ST-2', name: 'ไซต์สอง' },
  ],
  service_assets: [
    { id: 'A1', siteId: 'S1', status: 'installed', qty: 3 },
    { id: 'A2', siteId: 'S1', status: 'in_stock', qty: 9 },     // ในสต๊อก ไม่นับ
    { id: 'A3', siteId: 'S2', status: 'removed', qty: 1 },      // ถอดแล้ว ไม่นับ
  ],
  service_zones: [
    { id: 'Z1', siteId: 'S1', name: 'ล็อบบี้' },
    { id: 'Z2', siteId: 'S2', name: 'ทางเดิน' },
  ],
  service_zone_terms: [
    { id: 'T1', zoneId: 'Z1', packageQty: 2, salesOrderId: 'SO1', createdAt: '2026-09-01' },
    { id: 'T2', zoneId: 'Z2', packageQty: 5, salesOrderId: 'SO2', createdAt: '2026-09-01' },
  ],
  sales_orders: [
    { id: 'SO1', status: 'approved', supersededById: null },
    { id: 'SO2', status: 'approved', supersededById: 'SO3' },   // ถูก Rev. แล้ว ⇒ รอบตาย
  ],
  sales_order_installments: [],
  sales_contracts: [],
});

const visits = [
  { id: 'V1', siteId: 'S1', status: 'draft' },
  { id: 'V2', siteId: 'S2', status: 'scheduled' },
  { id: 'V3', siteId: 'S-GONE', status: 'scheduled' },       // ไซต์ไม่มีในทะเบียนแล้ว
];

/* ด่านโหลดโซนด้วย select('*') · ภาระโหลดด้วย 'id, siteId' ⇒ แยกสองชุดคำขอออกจากกันได้ */
const gateZoneSiteIds = (db) => db.log
  .filter((q) => q.table === 'service_zones' && q.select === '*')
  .flatMap((q) => q.filters.find(([op]) => op === 'in')[2]);

test('⭐ รูปผลลัพธ์ = รูปที่ตารางสัปดาห์เคยตอบ: sites เป็น array · ภาระรายไซต์ · บริบทด่านห้าก้อน', async () => {
  const db = fakeDb(bundleTables());
  const got = await visitBundle(db, visits);
  assert.deepEqual(Object.keys(got).sort(), ['gateContext', 'sites', 'workload']);
  assert.ok(Array.isArray(got.sites));
  assert.deepEqual(got.sites.map((s) => s.id), ['S1', 'S2']);
  // ภาระ = จุดที่อยู่หน้างาน (qty) + แพ็คของรอบที่ยังมีผลเท่านั้น
  assert.deepEqual(got.workload, { S1: { assets: 3, packs: 2 }, S2: { assets: 0, packs: 0 } });
  assert.deepEqual(Object.keys(got.gateContext).sort(),
    ['contractsById', 'installmentsByOrderId', 'ordersById', 'termsBySite', 'zonesBySite']);
  // ไม่ส่ง gateSiteIds = ทุกไซต์ของชุด (พฤติกรรมเดิมของตารางสัปดาห์)
  assert.deepEqual(gateZoneSiteIds(db).sort(), ['S1', 'S2']);
  assert.deepEqual(Object.keys(got.gateContext.zonesBySite).sort(), ['S1', 'S2']);
});

test('gateSiteIds จำกัดเฉพาะบริบทด่าน — ภาระยังนับทุกไซต์', async () => {
  const db = fakeDb(bundleTables());
  const got = await visitBundle(db, visits, { gateSiteIds: ['S1'] });
  assert.deepEqual(gateZoneSiteIds(db), ['S1']);
  assert.deepEqual(Object.keys(got.gateContext.zonesBySite), ['S1']);
  assert.deepEqual(Object.keys(got.workload).sort(), ['S1', 'S2']);
});

test('⭐ extraSiteIds (ไซต์ของการ์ดคำร้อง · มติ 23/09) ได้ไซต์ + ภาระ แต่ไม่ได้บริบทด่าน', async () => {
  const db = fakeDb(bundleTables());
  const onlyS1 = [{ id: 'V1', siteId: 'S1', status: 'draft' }];
  const got = await visitBundle(db, onlyS1, { extraSiteIds: ['S2', null, 'S2'] });
  assert.deepEqual(got.sites.map((s) => s.id).sort(), ['S1', 'S2']);
  assert.deepEqual(Object.keys(got.workload).sort(), ['S1', 'S2']);
  // ไม่ส่ง gateSiteIds = ด่านของไซต์ **ที่มีนัด** เท่านั้น — ไซต์ของคำร้องไม่มีนัดให้ตรวจ
  assert.deepEqual(gateZoneSiteIds(db), ['S1']);
  assert.deepEqual(Object.keys(got.gateContext.zonesBySite), ['S1']);
  // ส่ง gateSiteIds มา = ใช้ตามนั้น (route ของรายการงาน)
  const db2 = fakeDb(bundleTables());
  await visitBundle(db2, onlyS1, { gateSiteIds: [], extraSiteIds: ['S2'] });
  assert.deepEqual(gateZoneSiteIds(db2), []);
  // ไม่มีนัดเลยแต่มีไซต์ของคำร้อง = ยังได้ไซต์
  const db3 = fakeDb(bundleTables());
  const lone = await visitBundle(db3, [], { gateSiteIds: [], extraSiteIds: ['S2'] });
  assert.deepEqual(lone.sites.map((s) => s.id), ['S2']);
});

test('ไม่มีร่างเลย (gateSiteIds ว่าง) = ไม่ยิงคำขอของด่านสักคำขอ', async () => {
  const db = fakeDb(bundleTables());
  const got = await visitBundle(db, visits, { gateSiteIds: [] });
  assert.deepEqual(gateZoneSiteIds(db), []);
  assert.deepEqual(got.gateContext, {
    zonesBySite: {}, termsBySite: {}, ordersById: {}, installmentsByOrderId: {}, contractsById: {},
  });
});

test('ไม่มีนัดเลย = ก้อนว่างโดยไม่แตะฐาน', async () => {
  const db = fakeDb(bundleTables());
  const got = await visitBundle(db, []);
  assert.deepEqual(got.sites, []);
  assert.deepEqual(got.workload, {});
  assert.equal(db.log.length, 0);
});

test('query ของภาระพัง = โยนต่อให้ route ตอบ 500 (ไม่ใช่ภาระศูนย์เงียบ ๆ)', async () => {
  const boom = { message: 'timeout' };
  await assert.rejects(visitBundle(fakeDb(bundleTables(), { errors: { service_assets: boom } }), visits),
    (e) => e === boom);
});

/* ══ 3 · route ════════════════════════════════════════════════════════ */

const QUEUE_ROUTE = '../../app/api/service/visits/queue/route.js';
const WEEK_ROUTE = '../../app/api/service/visits/route.js';

function loadQueueVisitsSource() {
  const src = code('./visitsRepo.js');
  const start = src.indexOf('export async function loadQueueVisits');
  assert.ok(start >= 0, 'ต้องมี loadQueueVisits ใน visitsRepo.js');
  const end = src.indexOf('\nexport ', start + 1);
  const constLine = src.split('\n').find((line) => /^const QUEUE_OPEN\s*=/.test(line));
  assert.ok(constLine, 'ชุดสถานะของรายการงานต้องประกอบเป็นค่าคงที่ QUEUE_OPEN');
  return `${constLine}\n${src.slice(start, end < 0 ? undefined : end)}`;
}

test('🔴 route รายการงานใช้ด่านอ่านตัวเดียวกับตารางสัปดาห์ (ไม่ใช่ด่านแก้)', () => {
  const route = code(QUEUE_ROUTE);
  assert.match(route, /export const GET = withUser\(/);
  assert.match(route, /requireService\(\{ user \}\)/);
  assert.doesNotMatch(route, /edit:\s*true/, 'ด่านแก้ = เจ้าหน้าที่หน้างานเห็นปฏิทินแต่รายการงานขึ้น 403');
  assert.doesNotMatch(route, /export const (POST|PATCH|PUT|DELETE)\b/, 'เส้นนี้อ่านอย่างเดียว');
  assert.match(code(WEEK_ROUTE), /export const GET = withUser\(async \(\{ user, supabase, req \}\) => \{\s*const access = requireService\(\{ user \}\);/);
});

test('🔴 ไม่มีสตริงสถานะเขียนมือใน route และตัวโหลด — ใช้ตัวช่วยของ visitStatus.js', () => {
  const sources = { route: code(QUEUE_ROUTE), loader: loadQueueVisitsSource() };
  for (const [name, src] of Object.entries(sources)) {
    for (const status of VISIT_STATUSES) {
      assert.doesNotMatch(src, new RegExp(`['"\`]${status}['"\`]`), `${name}: '${status}'`);
    }
  }
  assert.match(sources.route, /visits\.filter\(isDraftVisit\)/);
  assert.match(sources.loader, /isDraftVisit\(\{ status: s \}\) \|\| isOpenVisit\(\{ status: s \}\)/);
});

test('ตัวโหลดไล่หน้าด้วย fetchAll + ลำดับนิ่งที่ id ทั้งสองก้อน', () => {
  const src = loadQueueVisitsSource();
  assert.equal((src.match(/fetchAll\(\(\) => supabase/g) || []).length, 2);
  assert.equal((src.match(/\.order\('id', \{ ascending: true \}\)/g) || []).length, 2);
});

test('⭐ บริบทด่านของรายการงานโหลดเฉพาะไซต์ของร่าง · asOf มาจากนาฬิกาไทย', () => {
  const route = code(QUEUE_ROUTE);
  assert.match(route, /const gateSiteIds = mode\.gate \? visits\.filter\(isDraftVisit\)\.map\(\(visit\) => visit\.siteId\) : \[\];/);
  assert.match(route, /visitBundle\(supabase, visits, \{ gateSiteIds, extraSiteIds \}\)/);
  assert.match(route, /const todayIso = businessDate\(\);/);
  assert.match(route, /addDaysIso\(todayIso, -QUEUE_CLOSED_DAYS\)/);
  assert.match(route, /loadQueueVisits\(supabase, \{ closedSince \}\)/);
  assert.match(route, /ok\(\{\s*asOf: todayIso, closedSince, visits, sites, workload, gateContext,\s*surveyRequests, surveyRequestsError,\s*\}\)/);
});

/* ── คำร้องรอลงคิว (มติเจ้าของ 23/09) ── */
test('⭐ route ส่งคำร้องรอลงคิวเฉพาะคนที่ตอบคำร้องของ TS ได้ · ?requests=0 = ไม่เอา', () => {
  const route = code(QUEUE_ROUTE);
  assert.match(route, /import \{ canAnswerServiceRequests \} from '@\/lib\/permissions';/);
  assert.match(route, /const mode = queueRouteMode\(url\.searchParams, \{ canAnswer: canAnswerServiceRequests\(user\) \}\);/);
  assert.match(route, /const wantRequests = mode\.requests;/);
  // ไม่มีสิทธิ์/ไม่ขอ = null (UI visibility rule: ไม่มีสิทธิ์ = ไม่โชว์) — ไม่ใช่ [] ที่อ่านว่า "ไม่มีใบ"
  assert.match(route, /let surveyRequests = null;/);
  assert.match(route, /if \(wantRequests\) \{\s*try \{\s*surveyRequests = await loadSurveyQueueRequests\(supabase, \{ visits \}\);/);
  // ไซต์ของการ์ดคำร้องมาด้วยก้อนเดียวกัน
  assert.match(route, /const extraSiteIds = \(surveyRequests \|\| \[\]\)\.map\(\(request\) => request\.siteId\);/);
  // ด่านอ่านชั้นนอกยังเป็นตัวเดิม
  assert.match(route, /requireService\(\{ user \}\)/);
});

test('🔴 คำร้องพัง ≠ รายการงานพัง — try แยก · error แยกช่อง · ส่ง null ไม่ใช่ []', () => {
  const route = code(QUEUE_ROUTE);
  const block = route.slice(route.indexOf('if (wantRequests)'), route.indexOf('const gateSiteIds'));
  assert.match(block, /\} catch \(e\) \{\s*surveyRequests = null;\s*surveyRequestsError = `โหลดคำร้องรอลงคิวไม่สำเร็จ — \$\{e\?\.message \|\| 'ไม่ทราบสาเหตุ'\}`;/);
  assert.doesNotMatch(block, /return fail/, 'ห้ามตอบ 500 ทั้งเส้นเพราะคำร้อง');
  // โหลดนัดก่อนคำร้อง — "ลงคิวแล้วหรือยัง" ตอบด้วยนัดชุดที่จอวาด
  assert.ok(route.indexOf('loadQueueVisits(') < route.indexOf('loadSurveyQueueRequests('));
});

test('ตารางสัปดาห์ประกอบผ่าน visitBundle ที่เดียว — รูป response เดิม ด่านทุกไซต์เหมือนเดิม', () => {
  const route = code(WEEK_ROUTE);
  assert.match(route, /await visitBundle\(supabase, visits\);/, 'ไม่ส่ง gateSiteIds = ด่านของทุกไซต์ตามเดิม');
  assert.match(route, /return ok\(\{ visits, sites, workload, gateContext \}\);/);
  // สูตรภาระต้องมีที่เดียว — ก๊อปกลับมาใน route = สองคอลัมน์นับภาระคนละแบบวันหนึ่ง
  assert.doesNotMatch(route, /from\('service_assets'\)/);
  assert.doesNotMatch(route, /siteWorkload\(/);
});

test('proxy ปล่อย GET /api/service/visits/queue ไปถึง handler (ด่านจริงคือ requireService)', () => {
  for (const role of ['ts', 'ts_planner', 'ts_manager']) {
    assert.equal(lockedOut({ role }, '/api/service/visits/queue', 'GET', true), false, role);
    assert.equal(apiWriteAllowed('GET', '/api/service/visits/queue', role, []), true, role);
  }
});

/* 🐞 รีวิว 24/09: ตัวเลือกเจ้าหน้าที่บนหน้าใบคำร้อง (`useCrewLoad`) ยิง `?requests=0` แล้วได้ **ทั้งก้อน**
   ของรายการงาน — บริบทด่านเต็ม (โซน · รอบขาย · ใบสั่งขาย · งวด · สัญญา) ของทุกไซต์ที่มีร่าง รวมร่างของรอบ
   บริการล่วงหน้า ~90 วัน · ทุกครั้งที่เปิดโมดัลลงคิว ทั้งที่ฮุกอ่านแค่ นัด · ภาระ · closedSince
   ⭐ `?view=load` = ภาระอย่างเดียว: ไม่เอาคำร้อง · ไม่โหลดบริบทด่าน · ไม่ส่งร่าง (ร่างไม่นับภาระ — staffLoadOn) */
test('🐞 ?view=load = ภาระอย่างเดียว — ไม่มีคำร้อง ไม่มีบริบทด่าน ไม่มีร่าง', async () => {
  const { queueRouteMode } = await import('./scheduleQueue.js');
  const params = (q) => new URLSearchParams(q);
  assert.deepEqual(queueRouteMode(params(''), { canAnswer: true }), { load: false, requests: true, gate: true, drafts: true });
  assert.deepEqual(queueRouteMode(params(''), { canAnswer: false }), { load: false, requests: false, gate: true, drafts: true },
    'ไม่มีสิทธิ์ตอบคำร้อง = ไม่เอาคำร้อง (UI visibility rule)');
  assert.deepEqual(queueRouteMode(params('requests=0'), { canAnswer: true }), { load: false, requests: false, gate: true, drafts: true });
  assert.deepEqual(queueRouteMode(params('view=load'), { canAnswer: true }), { load: true, requests: false, gate: false, drafts: false });
  assert.deepEqual(queueRouteMode(null, {}), { load: false, requests: false, gate: true, drafts: true });

  const route = code(QUEUE_ROUTE);
  assert.match(route, /const visits = mode\.drafts \? loaded : loaded\.filter\(\(visit\) => !isDraftVisit\(visit\)\);/);
  // ฮุกของหน้าใบขอโหมดภาระ ไม่ใช่ทั้งก้อน
  const hook = readFileSync(new URL('./useCrewLoad.js', import.meta.url), 'utf8');
  assert.match(hook, /apiFetch\("\/api\/service\/visits\/queue\?view=load"\)/);
  assert.doesNotMatch(hook, /queue\?requests=0/);
});
