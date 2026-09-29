// ── ของประกอบใบประเมินที่ GET ต้องส่งมาให้จอ (PR2) ───────────────────────
//
// 🔴 **หัวใจของไฟล์นี้คือกรณี "อ่านไม่สำเร็จ"** — `supabase-js` ไม่ throw มันคืน
//   `{ data: null, error }` ⇒ โค้ดที่เขียน `data || null` จะเปลี่ยน "อ่านพลาด" ให้เป็น
//   "ไม่มีข้อมูล" เงียบ ๆ · ตัวโหลดต้องปัก `unknown.<ชิ้น>` ให้จอเขียน "ไม่ทราบ" แทน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSurveyCrew, loadSurveySheetContext } from './surveyRepo.js';

/** ตัดคอมเมนต์ออกก่อนค้นซอร์ส — ยามที่ห้ามไฟล์อธิบายตัวเองคือยามที่พังตัวเอง */
const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** ตัวปลอมของ PostgREST — คืนผลตามชื่อตาราง และจดว่าถูกยิงด้วยอะไรบ้าง */
function fakeSupabase(byTable) {
  const calls = [];
  const make = (table) => {
    const call = { table, filters: [], cols: null };
    calls.push(call);
    const result = () => Promise.resolve(byTable[table] ?? { data: [], error: null });
    const builder = {
      select(cols) { call.cols = cols; return builder; },
      eq(col, value) { call.filters.push(['eq', col, value]); return builder; },
      in(col, values) { call.filters.push(['in', col, values]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle: result,
      // builder ของ supabase-js เป็น thenable — `await query` ได้โดยไม่ต้องเรียกอะไรปิดท้าย
      then(resolve, reject) { return result().then(resolve, reject); },
    };
    return builder;
  };
  return { calls, from: make };
}

const REQUEST = { id: 'DR-1', siteId: 'SS-1', customerId: 'CU-1' };
const SITE = { id: 'SS-1', code: 'ST-0000-01-BKK-1019', name: 'สำนักงานใหญ่', address: '2/4 ซอยเพชรเกษม 35/1', contactName: 'ฟลุค', contactPhone: '0616254262' };
const CUSTOMER = { id: 'CU-1', name: 'บริษัท เซนท์ แอนด์ เซนส์ จำกัด', arCode: 'AR-000' };
const RECALL = {
  id: 'EUP-1', authorId: 'U-1', authorName: 'Local D.', createdAt: '2026-09-15T02:12:00.000Z',
  body: 'TS ดึงผลประเมินกลับมาแก้ — กรอกแพ็คเกจผิด · ตัวเลขที่ส่งไปแล้ว 2 พื้นที่ · 40 ตร.ม. · 2 แพ็คเกจ',
  meta: { totals: { zones: 2, areaSqm: 40, packageQty: 2 } },
};

const zones = () => [
  { id: 'z1', zoneId: 'SZN-1', zoneName: 'Studio 01' },
  { id: 'z2', zoneId: 'SZN-2', zoneName: 'Studio 02' },
  { id: 'z3', zoneId: null, zoneName: 'พื้นที่ใหม่ที่ยังไม่ได้ส่งใบ' },
];

/** กลืน console.error ระหว่างเทสต์ที่ตั้งใจให้ query ล้ม — แต่ยังนับว่าถูกเรียก */
function captureErrors(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map(String).join(' '));
  return Promise.resolve(run()).finally(() => { console.error = original; }).then((v) => [v, lines]);
}

test('ทางปกติ — ได้ไซต์ · รหัส AR · แถวดึงกลับล่าสุด และเติมรหัส ZN ลงแถวพื้นที่', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [{ id: 'SZN-1', code: 'ZN-1019-10022' }, { id: 'SZN-2', code: 'ZN-1019-10023' }], error: null },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: [RECALL], error: null },
  });
  const rows = zones();
  const ctx = await loadSurveySheetContext(supabase, REQUEST, rows);

  assert.deepEqual(ctx.site, SITE);
  assert.deepEqual(ctx.customer, { id: 'CU-1', name: CUSTOMER.name, arCode: 'AR-000' });
  assert.equal(ctx.recall.reason, 'กรอกแพ็คเกจผิด');
  assert.deepEqual(ctx.recall.totals, { zones: 2, areaSqm: 40, packageQty: 2 });
  assert.deepEqual(ctx.unknown, {});
  assert.deepEqual(rows.map((r) => r.zoneCode), ['ZN-1019-10022', 'ZN-1019-10023', null]);
  assert.equal(rows.some((r) => r.zoneCodeUnknown), false);
});

test('ไม่เคยถูกดึงกลับ = recall เป็น null (ไม่ใช่ unknown)', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [], error: null },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: [], error: null },
  });
  const ctx = await loadSurveySheetContext(supabase, REQUEST, zones());
  assert.equal(ctx.recall, null);
  assert.deepEqual(ctx.unknown, {});
});

test('🔴 ลูกค้าที่มีแต่ชื่ออังกฤษ ต้องได้ชื่อจริง ไม่ใช่ขีด', async () => {
  /* 🐞 บทเรียน AR-630: จุดที่ select แค่ `name` แล้วอ่าน `.name` ตรง ๆ คืน null ให้แถวที่
     กรอกชื่อไว้แล้ว (ภาษาอังกฤษ) ⇒ จอวาดขีด และเพราะไม่ได้หยิบ `nameEn` มาด้วย
     ปลายทางกู้เองไม่ได้ · กติกาเขียนไว้ที่ `lib/master/customerName.js` แล้ว */
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [], error: null },
    customers: { data: { id: 'CU-9', name: null, nameEn: 'Shinesty company', arCode: 'AR-630' }, error: null },
    entity_updates: { data: [], error: null },
  });
  const ctx = await loadSurveySheetContext(supabase, REQUEST, []);
  assert.equal(ctx.customer.name, 'Shinesty company');
  assert.equal(ctx.customer.arCode, 'AR-630');
  const call = supabase.calls.find((c) => c.table === 'customers');
  assert.match(call.cols, /nameEn/, 'ไม่ select nameEn = fallback ไม่มีข้อมูลให้ตก');
});

test('ไม่มีชื่อสักภาษา = null (ปลายทางวาดขีดตามกติกาค่าว่าง ไม่ใช่ "ไม่ทราบ")', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [], error: null },
    customers: { data: { id: 'CU-9', name: '', nameEn: null, arCode: 'AR-631' }, error: null },
    entity_updates: { data: [], error: null },
  });
  const ctx = await loadSurveySheetContext(supabase, REQUEST, []);
  assert.equal(ctx.customer.name, null);
  assert.deepEqual(ctx.unknown, {}, 'ไม่มีชื่อ ≠ อ่านไม่สำเร็จ');
});

test('🔴 อ่านไซต์ไม่สำเร็จ = unknown.site ไม่ใช่ "ใบนี้ไม่มีไซต์" · ชิ้นอื่นยังมาครบ', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: null, error: { message: 'fetch failed' } },
    service_zones: { data: [{ id: 'SZN-1', code: 'ZN-1019-10022' }], error: null },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: [], error: null },
  });
  const [ctx, logs] = await captureErrors(() => loadSurveySheetContext(supabase, REQUEST, zones()));
  assert.equal(ctx.site, null);
  assert.equal(ctx.unknown.site, true);
  assert.equal(ctx.customer.arCode, 'AR-000', 'ชิ้นที่อ่านได้ต้องไม่หายไปด้วย');
  assert.equal(logs.length, 1, 'ต้อง log ไว้ ไม่ใช่เงียบ');
});

test('🔴 อ่านรหัส ZN ไม่สำเร็จ = ปัก zoneCodeUnknown เฉพาะแถวที่มีรหัสจริง', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: null, error: { message: 'fetch failed' } },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: [], error: null },
  });
  const rows = zones();
  const [ctx] = await captureErrors(() => loadSurveySheetContext(supabase, REQUEST, rows));
  assert.equal(ctx.unknown.zoneCodes, true);
  assert.deepEqual(rows.map((r) => r.zoneCode), [null, null, null]);
  assert.deepEqual(rows.map((r) => r.zoneCodeUnknown === true), [true, true, false],
    'แถวที่ยังไม่มี zoneId ไม่ใช่ "ไม่ทราบ" — มันยังไม่เคยมีรหัส');
});

test('🔴 อ่านแถวดึงกลับไม่สำเร็จ = unknown.recall ไม่ใช่ "ไม่เคยดึงกลับ"', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [], error: null },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: null, error: { message: 'PGRST303' } },
  });
  const [ctx] = await captureErrors(() => loadSurveySheetContext(supabase, REQUEST, zones()));
  assert.equal(ctx.recall, null);
  assert.equal(ctx.unknown.recall, true);
});

test('ใบที่ยังไม่ผูกไซต์/ลูกค้า — ไม่ยิง query ของชิ้นนั้นเลย และไม่นับเป็น unknown', async () => {
  const supabase = fakeSupabase({ entity_updates: { data: [], error: null } });
  const ctx = await loadSurveySheetContext(supabase, { id: 'DR-2' }, []);
  assert.deepEqual(ctx.unknown, {});
  assert.equal(ctx.site, null);
  assert.equal(ctx.customer, null);
  // เธรดของใบยังถามได้เสมอ (ไม่ขึ้นกับไซต์/ลูกค้า) — แถวดึงกลับ + แถวส่งกลับให้ช่างแก้ (2026-09-22)
  assert.deepEqual(supabase.calls.map((c) => c.table), ['entity_updates', 'entity_updates']);
});

test('รหัส ZN ยิงผ่านตัวซอยก้อน — ลิสต์โตตามข้อมูล ห้ามยัด .in() ก้อนเดียว', async () => {
  const many = Array.from({ length: 320 }, (_, i) => ({ id: `z${i}`, zoneId: `SZN-${i}`, zoneName: `พื้นที่ ${i}` }));
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [], error: null },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: [], error: null },
  });
  await loadSurveySheetContext(supabase, REQUEST, many);
  const zoneCalls = supabase.calls.filter((c) => c.table === 'service_zones');
  assert.equal(zoneCalls.length, 3, '320 รหัส ⇒ 3 ก้อน (150 ต่อก้อน)');
  for (const call of zoneCalls) {
    assert.ok(call.filters[0][2].length <= 150, `ก้อนละไม่เกิน 150 · ได้ ${call.filters[0][2].length}`);
  }
});

test('ถามแถวดึงกลับเฉพาะของใบนี้ และเฉพาะ kind=recall', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [], error: null },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: [RECALL], error: null },
  });
  await loadSurveySheetContext(supabase, REQUEST, []);
  const call = supabase.calls.find((c) => c.table === 'entity_updates');
  assert.deepEqual(call.filters, [
    ['eq', 'entityType', 'dept_request'],
    ['eq', 'entityId', 'DR-1'],
    ['eq', 'kind', 'recall'],
  ]);
});

/* ══ สัญญาของ GET /api/service/surveys/[id] ══════════════════════════════
   ⚠️ จอ PR3/PR4 อ่านชื่อคีย์พวกนี้ตรง ๆ — เปลี่ยนชื่อเมื่อไร การ์ดควบคุมจะได้ค่าว่าง
      โดยไม่มี error ให้เห็น (คีย์ที่ไม่มีอยู่ = `undefined` ไม่ใช่ข้อผิดพลาด) */
test('GET ต้องส่ง site · customer · recall · unknown · crew ออกมาพร้อมของเดิม', () => {
  const route = code('../../app/api/service/surveys/[id]/route.js');
  for (const key of ['site: context.site', 'customer: context.customer',
    'recall: context.recall', 'unknown: context.unknown', 'crew: crewRes.crew']) {
    assert.match(route, new RegExp(key.replace(/[.[\]]/g, '\\$&')), `GET ต้องตอบ ${key}`);
  }
  assert.match(route, /loadSurveySheetContext\(supabase, request, zones\)/);
  /* ⚠️ ของประกอบไม่ได้รอผลของไฟล์/นัด ⇒ ต้องอยู่ใน `Promise.all` ก้อนเดียวกัน — จอนี้
     ถูกโหลดใหม่ทุกครั้งที่บันทึก/ส่ง/สลับแท็บกลับมา รอบเดินทางที่เพิ่มมาคือรอบที่ช่างรอ */
  assert.match(route, /Promise\.all\(\[[\s\S]*?loadSurveySheetContext[\s\S]*?\]\)/);
  // ⚠️ ชิ้นประกอบล้มต้องไม่ตีกลับทั้งเส้น — ผลวัดซึ่งเป็นเนื้อหลักอ่านได้แล้ว
  assert.doesNotMatch(route, /context\.unknown[\s\S]{0,80}return fail/);
  /* ⭐ ทีมบนนัด (§10.5 S5) — ชื่อผู้ช่วยต้องรอรู้นัดก่อน ⇒ ต่อท้ายนัดในสายเดียวกันของ `Promise.all` ก้อนเดิม
     (ไม่ใช่ `await` แยกอีกรอบหลังทั้งก้อน) · "คุณ" มาจาก id ของคนที่เปิดจอ · อ่านชื่อล้ม = `unknown.crew` */
  assert.match(route, /findSurveyVisit\(supabase, id, \{ preferOpen: true \}\)\s*\.then\(async \(found\) => \[found, await loadSurveyCrew\(supabase, found, \{ viewerId: user\?\.id \}\)\]\)/);
  assert.match(route, /if \(crewRes\.unknown\) context\.unknown\.crew = true;/);
});

test('ไซต์ของหัวงานพกช่วงเข้าไซต์ · เงื่อนไขการเข้า · ลิงก์แผนที่ (§10.5 S5)', async () => {
  const supabase = fakeSupabase({
    service_sites: { data: SITE, error: null },
    service_zones: { data: [], error: null },
    customers: { data: CUSTOMER, error: null },
    entity_updates: { data: [], error: null },
  });
  await loadSurveySheetContext(supabase, REQUEST, []);
  const call = supabase.calls.find((c) => c.table === 'service_sites');
  for (const col of ['"accessFrom"', '"accessTo"', '"accessDays"', '"accessNote"', '"mapUrl"', '"contactPhone"']) {
    assert.ok(call.cols.includes(col), `ต้อง select ${col}`);
  }
});

/* ══ ทีมบนนัด (`loadSurveyCrew` · §10.5 S5) ══════════════════════════════════════
   ⭐ ชื่อผู้ช่วยถามบัญชีรายคน (`auth.admin.getUserById`) — ไม่ไล่ผู้ใช้ทั้งระบบทุกครั้งที่จอโหลดใหม่ */
function fakeAuth(byId) {
  const asked = [];
  return {
    asked,
    auth: {
      admin: {
        async getUserById(id) {
          asked.push(id);
          const hit = byId[id];
          if (hit instanceof Error) throw hit;
          return hit ?? { data: { user: null }, error: { status: 404, message: 'User not found' } };
        },
      },
    },
  };
}
const CREW_VISIT = { id: 'SV-1', assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', assistantIds: ['u-np'] };

test('ทีม: คนไปจากชื่อบนนัด (ไม่ถามบัญชี) · ผู้ช่วยจากบัญชี · "คุณ" = คนที่เปิดจอ', async () => {
  const supabase = fakeAuth({ 'u-np': { data: { user: { id: 'u-np', email: 'np@x', user_metadata: { name: 'Nattawut Pornprasit' } } }, error: null } });
  const res = await loadSurveyCrew(supabase, CREW_VISIT, { viewerId: 'u-pa' });
  assert.deepEqual(res, {
    crew: [
      { id: 'u-pa', name: 'Phuwadol Aoonnankad', lead: true, you: true },
      { id: 'u-np', name: 'Nattawut Pornprasit', lead: false, you: false },
    ],
    unknown: false,
  });
  assert.deepEqual(supabase.asked, ['u-np'], 'ถามเฉพาะผู้ช่วย');
});

test('ทีม: ไม่มีผู้ช่วย = ไม่ยิงอะไรเลย · ผู้ช่วยซ้ำ/เป็นคนไปเอง = ไม่ถามซ้ำ · ไม่มีนัด = ทีมว่าง', async () => {
  const none = fakeAuth({});
  assert.equal((await loadSurveyCrew(none, { ...CREW_VISIT, assistantIds: [] })).crew.length, 1);
  assert.deepEqual(none.asked, []);
  const dup = fakeAuth({ 'u-np': { data: { user: { id: 'u-np', email: 'np@x', user_metadata: {} } }, error: null } });
  const res = await loadSurveyCrew(dup, { ...CREW_VISIT, assistantIds: ['u-np', 'u-pa', 'u-np', null] });
  assert.deepEqual(dup.asked, ['u-np']);
  assert.equal(res.crew[1].name, 'np@x', 'ไม่มีชื่อในบัญชี = อีเมล (กติกาเดียวกับทะเบียนผู้ใช้)');
  assert.deepEqual(await loadSurveyCrew(fakeAuth({}), null), { crew: [], unknown: false });
});

test('🔴 ทีม: อ่านชื่อผู้ช่วยล้ม = ชื่อ null + unknown (ไม่ใช่ "ไม่มีคนนี้") · บัญชีถูกลบ = gone ไม่ใช่ล้ม', async () => {
  const failing = fakeAuth({ 'u-np': new Error('fetch failed') });
  const [res, logs] = await captureErrors(() => loadSurveyCrew(failing, CREW_VISIT, { viewerId: 'u-np' }));
  assert.equal(res.unknown, true);
  assert.deepEqual(res.crew[1], { id: 'u-np', name: null, lead: false, you: true });
  assert.equal(logs.length, 1, 'ต้อง log ไว้ ไม่ใช่เงียบ');

  const apiError = fakeAuth({ 'u-np': { data: null, error: { status: 500, message: 'PGRST303' } } });
  const [res2] = await captureErrors(() => loadSurveyCrew(apiError, CREW_VISIT));
  assert.equal(res2.unknown, true);

  const gone = await loadSurveyCrew(fakeAuth({}), CREW_VISIT);
  assert.equal(gone.unknown, false);
  assert.deepEqual(gone.crew[1], { id: 'u-np', name: null, lead: false, you: false, gone: true });
});

test('🔴 ชั้นไหลทางเดียว — ตัวอ่านฝั่ง server ห้าม import โมดูลประกอบหน้าจอ', () => {
  /* `surveyRepo` ถูก import โดยเส้น API สี่เส้น (ส่ง · ดึงกลับ · zones · zones/[zoneId])
     ⇒ ถ้ามันลาก `surveyControl.js` เข้ามา วันที่ไฟล์นั้นงอก import ฝั่ง React/Next
     (มันโตไปทางจอ อยู่แล้ว) เส้นเขียนทั้งสี่จะล้มตั้งแต่โหลดโมดูล · กฎ: จอ → กฎ → จบ */
  assert.doesNotMatch(code('./surveyRepo.js'), /from '@\/lib\/service\/surveyControl'/);
  // ⚠️ import หลายบรรทัดได้ (เพิ่มตัวตัดสินการส่งกลับ 2026-09-22) — สิ่งที่ตรึงคือ "ถามกฎจาก survey.js"
  assert.match(code('./surveyRepo.js'), /surveyRecallRecord[\s\S]{0,120}\} from '@\/lib\/service\/survey'/);
});
