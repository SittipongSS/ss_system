// ── วิธีประเมินรายพื้นที่ × เส้นเขียนพื้นที่ของใบประเมิน (แผน survey-desk-assessment §2 แถว 13–16 · งวด S1) ──
//
// ⭐ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถว (`crew/routeTestKit.mjs`) — ถามได้ว่า
//    "เขียนอะไรลงตารางไหน ตามลำดับไหน" ไม่ใช่แค่ว่าซอร์สมีคำนี้
// 🔴 กติกาที่ทุกเคส **ลงหน้างานล้วน** ต้องยืนยัน: คำสั่งเขียนเหมือนเดิมทุกคีย์ — **ไม่มีคีย์ `method` เลย**
//    (แถวเก่า/fixture เก่าไม่มีคีย์นี้ · และ migration 0408 ยังไม่ถูกรัน ⇒ ส่งคีย์ที่ฐานไม่รู้จัก = เพิ่มพื้นที่ไม่ได้ทั้งระบบ)
// ⚠️ งวด S1 ยังไม่มีเส้นไหนทำให้แถวเป็น 'drawing' ได้ — แถวจากแบบในไฟล์นี้มาจาก fixture ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeDb, callRoute, tech, mate, planner } from './crew/routeTestKit.mjs';
import { isDrawingZone, surveyNeedsVisit } from './surveyMethod.js';

const { POST } = await import('../../app/api/service/surveys/[id]/zones/route.js');
const { PATCH, DELETE } = await import('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
const { canAttachToCosting, surveySpotLinkAccess } = await import('../master/costingAttachmentAccess.js');
const { canEditAttachmentParent } = await import('../master/attachmentAccess.js');

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ข้อความที่ผู้ใช้เห็น — เขียนตรงตัวที่นี่โดยตั้งใจ (แผน §2 แถว 13 · 14 · 16) · route แก้คำเมื่อไร เทสต์ต้องแดง */
const DRAWING_ZONE_HEAD_ONLY = 'พื้นที่นี้หัวหน้าประเมินจากแบบ — ไม่ต้องวัดหน้างาน';
const DESK_ADD_HEAD_ONLY = 'ใบนี้หัวหน้าประเมินจากแบบ — เพิ่มพื้นที่ได้เฉพาะหัวหน้าฝ่ายบริการ';
const LAST_ONSITE_CUT_CREW = 'พื้นที่สุดท้ายที่ต้องวัด — แจ้งหัวหน้าให้ตัดออก';
const holdText = (visitCode) => `พื้นที่สุดท้ายที่ต้องวัด และนัด ${visitCode} ยังเปิดอยู่ — ยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยตัดพื้นที่นี้ออก`;
const NOT_YOUR_VISIT = 'นัดนี้ไม่ใช่งานของคุณ — แก้ได้เฉพาะงานที่ถูกมอบหมายให้คุณ';

const head = { id: 'U-HEAD', name: 'หัวหน้าฝ่าย', role: 'ts_manager', department: 'TS' };
const admin = { id: 'U-ADMIN', name: 'แอดมิน', role: 'admin', department: 'IT' };
const sales = { id: 'U-AE', name: 'ฝ่ายขาย', role: 'ae', department: 'SA' };

const T0 = '2026-10-01T00:00:00.000Z';
const request = (o = {}) => ({
  id: 'REQ1', kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100001', siteId: 'SST1', status: 'acknowledged',
  variant: 'standard', requestedById: 'U-AE', answeredAt: null, cancelledAt: null, closedAt: null, ...o,
});
const zone = (id, o = {}) => ({
  id, requestId: 'REQ1', zoneId: `SZN-${id}`, zoneName: `พื้นที่ ${id}`, floor: '1', note: null, status: 'ok',
  sortOrder: 1, parts: [], spots: [], cutReason: null, updatedAt: T0, ...o,
});
const drawing = (id, o = {}) => zone(id, { method: 'drawing', ...o });
const cutRow = (id, o = {}) => zone(id, { status: 'cut', cutReason: 'ซ้ำกับพื้นที่อื่นของใบ', ...o });
// นัดของใบ — ช่างเอ (`tech`) คือคนที่ถูกมอบหมาย · ช่างบี (`mate`) ไม่ได้อยู่บนนัด
const visit = (status, o = {}) => ({
  id: 'V1', code: 'SV-26100007', kind: 'survey', requestId: 'REQ1', status,
  assigneeId: 'U-TECH', assistantIds: [], createdAt: T0, ...o,
});
/* โซน "โถงลิฟต์" มีในทะเบียนของไซต์อยู่แล้ว ⇒ พื้นที่ที่เพิ่มด้วยชื่อนี้ถูกผูกเข้าโซนเดิม (ไม่ต้องออกรหัส ZN ใหม่ในเทสต์) */
const seed = ({ zones = [], visits = [], req = {}, hook = null } = {}) => fakeDb({
  dept_requests: [request(req)],
  service_survey_zones: zones,
  service_visits: visits,
  service_sites: [{ id: 'SST1', code: 'ST-0001', name: 'ไซต์ทดสอบ' }],
  service_zones: [{ id: 'SZN-LIFT', siteId: 'SST1', code: 'ZN-0001-01', name: 'โถงลิฟต์', floor: '3' }],
}, { hook });

const add = (db, user, body = { name: 'โถงลิฟต์', floor: '3' }) => callRoute(POST, {
  user, db, method: 'POST', path: '/api/service/surveys/REQ1/zones', params: { id: 'REQ1' }, body,
});
const patch = (db, user, zoneId, body) => callRoute(PATCH, {
  user, db, method: 'PATCH', path: `/api/service/surveys/REQ1/zones/${zoneId}`, params: { id: 'REQ1', zoneId }, body,
});
const cut = (db, user, zoneId) => patch(db, user, zoneId, { status: 'cut', cutReason: 'ลูกค้าไม่เอาพื้นที่นี้แล้ว' });
const restore = (db, user, zoneId) => patch(db, user, zoneId, { status: 'ok' });
const remove = (db, user, zoneId) => callRoute(DELETE, {
  user, db, method: 'DELETE', path: `/api/service/surveys/REQ1/zones/${zoneId}`, params: { id: 'REQ1', zoneId },
});

const zoneWrites = (db) => db.writes('service_survey_zones');
// คำสั่งเขียนที่ไม่ใช่ audit — เคสที่ถูกตีกลับต้องได้ลิสต์ว่าง
const dataWrites = (db) => db.calls.filter((c) => c.write && c.table !== 'audit_logs');
const writesOutsideZones = (db) => dataWrites(db).filter((c) => c.table !== 'service_survey_zones');
const rowOf = (db, id) => db.tables.service_survey_zones.find((r) => r.id === id);

/* ทรงของแถวลงหน้างานที่ระบบต้องอ่านเหมือนกันทุกตัวอักษร — แถวเก่าไม่มีคีย์ · แถวหลัง 0408 = 'onsite' · คอลัมน์ใหม่ครบแต่ว่าง */
const ONSITE_SHAPES = [
  ['ไม่มีคีย์ method', {}],
  ["method 'onsite'", { method: 'onsite' }],
  ['คอลัมน์ใหม่ครบแต่ว่าง', { method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }],
];

/* คีย์ของคำสั่งเขียนวันนี้ — เรียงตามที่ route ประกอบ (ลำดับเปลี่ยน = payload ไม่เหมือนเดิม) */
const INSERT_KEYS_TODAY = [
  'id', 'requestId', 'zoneId', 'zoneName', 'floor', 'note', 'status', 'sortOrder', 'surveyedById', 'surveyedByName',
];
const STATUS_PATCH_KEYS_TODAY = ['status', 'cutReason', 'surveyedAt', 'surveyedById', 'surveyedByName', 'updatedAt'];

/* ══ เพิ่มพื้นที่ (POST · แถว 14) — วิธีมาจากใบ ไม่ใช่จากคนกด ═══════════════════════════════ */

for (const [label, shape] of ONSITE_SHAPES) {
  test(`เพิ่มพื้นที่ · ใบลงหน้างาน (${label}): ช่างบนนัดเพิ่มได้เหมือนเดิม · แถวใหม่ไม่มีคีย์ method`, async () => {
    const db = seed({ zones: [zone('A', shape), zone('B', { ...shape, sortOrder: 2 })], visits: [visit('in_progress')] });
    const { status, json } = await add(db, tech);
    assert.equal(status, 200, json.error);
    const [insert, link] = zoneWrites(db);
    assert.equal(insert.write, 'insert');
    assert.deepEqual(Object.keys(insert.payload), INSERT_KEYS_TODAY);
    assert.equal(insert.payload.status, 'added');
    assert.equal(insert.payload.sortOrder, 3);
    assert.equal(insert.payload.surveyedById, 'U-TECH');
    // คำสั่งที่สองคือการผูกรหัสโซน (materializeSurveyZones) — ไม่มีคำสั่งเขียนอื่นแทรก
    assert.deepEqual(Object.keys(link.payload), ['zoneId', 'updatedAt']);
    assert.equal(zoneWrites(db).length, 2);
    assert.deepEqual(writesOutsideZones(db), []);
    assert.equal('method' in json, false);
  });
}

test('เพิ่มพื้นที่ · ใบลงหน้างาน: ด่านเดิมไม่ขยับ — ผู้จัดคิวได้ · ช่างนอกนัดได้ 403 ข้อความเดิม · ส่งผลแล้ว 409', async () => {
  const zones = [zone('A')];
  assert.equal((await add(seed({ zones }), planner)).status, 200);
  const outsider = await add(seed({ zones, visits: [visit('in_progress')] }), mate);
  assert.equal(outsider.status, 403);
  assert.equal(outsider.json.error, NOT_YOUR_VISIT);
  const sent = seed({ zones, visits: [visit('done')], req: { answeredAt: T0 } });
  const locked = await add(sent, tech);
  assert.equal(locked.status, 409);
  assert.match(locked.json.error, /ส่งผลให้ฝ่ายขายไปแล้ว/);
  assert.deepEqual(dataWrites(sent), []);
});

const DESK_SHEETS = [
  ['พื้นที่ทั้งใบเป็นจากแบบ', [drawing('A'), drawing('B', { sortOrder: 2 })]],
  ['ตัดหมดทั้งใบ และทุกแถวเป็นจากแบบ', [cutRow('A', { method: 'drawing' }), cutRow('B', { method: 'drawing', sortOrder: 2 })]],
  ['พื้นที่ลงหน้างานถูกตัด เหลือแต่จากแบบ', [cutRow('A'), drawing('B', { sortOrder: 2 })]],
];

for (const [label, zones] of DESK_SHEETS) {
  test(`เพิ่มพื้นที่ · ใบงานโต๊ะ (${label}): หัวหน้าได้แถวจากแบบ · ช่างและผู้จัดคิวได้ 403 · ไม่อ่านนัด`, async () => {
    // ช่างของนัดเก่า/นัดที่ยกเลิก ยังถูกมอบหมายอยู่บนนัด — ด่านนัดอย่างเดียวจะปล่อยให้เพิ่มพื้นที่ลงหน้างานกลับเข้าใบงานโต๊ะ
    for (const user of [tech, planner]) {
      const db = seed({ zones, visits: [visit('done')] });
      const refused = await add(db, user);
      assert.equal(refused.status, 403, user.id);
      assert.equal(refused.json.error, DESK_ADD_HEAD_ONLY);
      assert.deepEqual(dataWrites(db), []);
    }
    const db = seed({ zones });
    const { status, json } = await add(db, head);
    assert.equal(status, 200, json.error);
    const [insert] = zoneWrites(db);
    assert.deepEqual(Object.keys(insert.payload), [...INSERT_KEYS_TODAY, 'method']);
    assert.equal(insert.payload.method, 'drawing');
    assert.equal(insert.payload.status, 'added');
    assert.equal(json.method, 'drawing');
    assert.equal(db.calls.some((c) => c.table === 'service_visits'), false, 'ใบงานโต๊ะไม่ถามนัด');
    assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false, 'เพิ่มพื้นที่ไม่พลิกใบกลับไปต้องมีนัด');
  });
}

test('เพิ่มพื้นที่ · ใบงานโต๊ะที่ส่งผลแล้ว: หัวหน้าก็เพิ่มไม่ได้ (409 ด่านล็อกตัวเดิม)', async () => {
  const db = seed({ zones: [drawing('A')], req: { answeredAt: T0 } });
  const { status, json } = await add(db, head);
  assert.equal(status, 409);
  assert.match(json.error, /ส่งผลให้ฝ่ายขายไปแล้ว/);
  assert.deepEqual(dataWrites(db), []);
});

test('เพิ่มพื้นที่ · ใบที่ยังไม่มีแถวเลย: วิธีตามที่ฝ่ายขายขอ (variant) — drawing = หัวหน้าเท่านั้น · standard = เหมือนเดิม', async () => {
  const desk = seed({ req: { variant: 'drawing' }, visits: [visit('in_progress')] });
  const refused = await add(desk, tech);
  assert.equal(refused.status, 403);
  assert.equal(refused.json.error, DESK_ADD_HEAD_ONLY);
  assert.deepEqual(dataWrites(desk), []);
  const born = await add(desk, head);
  assert.equal(born.status, 200, born.json.error);
  assert.equal(zoneWrites(desk)[0].payload.method, 'drawing');

  for (const variant of ['standard', undefined, null]) {
    const db = seed({ req: { variant }, visits: [visit('in_progress')] });
    const { status, json } = await add(db, tech);
    assert.equal(status, 200, json.error);
    assert.deepEqual(Object.keys(zoneWrites(db)[0].payload), INSERT_KEYS_TODAY, String(variant));
  }
});

/* ══ บันทึกผลของพื้นที่ (PATCH · แถว 13) ═══════════════════════════════════════════════ */

test('บันทึกพื้นที่จากแบบ: ช่างบนนัดและผู้จัดคิวได้ 403 ข้อความเดียวกัน · หัวหน้าบันทึกได้โดยไม่อ่านนัด', async () => {
  const zones = [drawing('A'), zone('B', { sortOrder: 2 })];
  for (const user of [tech, planner]) {
    const db = seed({ zones, visits: [visit('in_progress')] });
    const refused = await patch(db, user, 'A', { note: 'อ่านจากแบบชั้น 1' });
    assert.equal(refused.status, 403, user.id);
    assert.equal(refused.json.error, DRAWING_ZONE_HEAD_ONLY);
    assert.deepEqual(dataWrites(db), []);
  }
  const db = seed({ zones, visits: [visit('in_progress')] });
  const { status, json } = await patch(db, head, 'A', { note: 'อ่านจากแบบชั้น 1' });
  assert.equal(status, 200, json.error);
  assert.equal(json.note, 'อ่านจากแบบชั้น 1');
  assert.equal(db.calls.some((c) => c.table === 'service_visits'), false);
  // พื้นที่ลงหน้างานของใบเดียวกันยังเป็นของช่างบนนัดเหมือนเดิม
  const mixed = seed({ zones, visits: [visit('in_progress')] });
  assert.equal((await patch(mixed, tech, 'B', { note: 'วัดแล้ว' })).status, 200);
  assert.equal((await patch(mixed, mate, 'B', { note: 'x' })).json.error, NOT_YOUR_VISIT);
});

test('บันทึกพื้นที่จากแบบของใบที่ส่งผลแล้ว: ด่านล็อกมาก่อน (409) ทั้งหัวหน้าและช่าง', async () => {
  const db = seed({ zones: [drawing('A')], req: { answeredAt: T0 }, visits: [visit('done')] });
  for (const user of [head, tech]) {
    const res = await patch(db, user, 'A', { note: 'x' });
    assert.equal(res.status, 409, user.id);
    assert.match(res.json.error, /ส่งผลให้ฝ่ายขายไปแล้ว/);
  }
  assert.deepEqual(dataWrites(db), []);
});

for (const [label, shape] of ONSITE_SHAPES) {
  test(`บันทึกพื้นที่ลงหน้างาน (${label}): จุดใหม่ยังไม่ถูกเลือก · คำสั่งเขียนไม่มีคีย์ method`, async () => {
    const db = seed({ zones: [zone('A', shape)], visits: [visit('in_progress')] });
    const { status, json } = await patch(db, tech, 'A', { spots: [{ label: 'ข้างเสาหน้าลิฟต์', note: '' }] });
    assert.equal(status, 200, json.error);
    assert.equal(json.spots.length, 1);
    assert.equal(json.spots[0].selected, false);
    const [write] = zoneWrites(db);
    assert.deepEqual(Object.keys(write.payload), ['spots', 'surveyedAt', 'surveyedById', 'surveyedByName', 'updatedAt']);
    assert.equal(zoneWrites(db).length, 1);
  });
}

/* ตัวเลือก `defaultSelected` เป็นของ `normalizeSurveySpots` (`survey.js`) — ที่นี่ยืนยันผลที่บันทึกลงแถวจริง
   ⇒ ฝั่งใดฝั่งหนึ่งหลุด (route เลิกส่ง หรือตัวจัดแถวเลิกรับ) เทสต์นี้แดง */
test('บันทึกพื้นที่จากแบบ: จุดที่หัวหน้าเพิ่มถูกเลือกทันที · จุดเดิมคงค่าที่เคาะไว้', async () => {
  const db = seed({
    zones: [drawing('A', {
      spots: [
        { id: 'S-OFF', label: 'จุดที่ยังไม่เลือก', note: null, selected: false },
        { id: 'S-ON', label: 'จุดที่เลือกไว้', note: null, selected: true },
      ],
    })],
  });
  const { status, json } = await patch(db, head, 'A', {
    spots: [
      { id: 'S-OFF', label: 'จุดที่ยังไม่เลือก' },
      { id: 'S-ON', label: 'จุดที่เลือกไว้' },
      { label: 'ข้างเคาน์เตอร์ (จากแบบ)' },
    ],
  });
  assert.equal(status, 200, json.error);
  assert.deepEqual(json.spots.map((s) => s.selected), [false, true, true]);
  assert.deepEqual(rowOf(db, 'A').spots.map((s) => s.selected), [false, true, true]);
});

test('ซอร์ส: PATCH ส่ง defaultSelected เฉพาะพื้นที่จากแบบ · สายลงหน้างานเรียกตัวจัดแถวด้วยคำเดิมทุกตัวอักษร', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  const body = route.slice(route.indexOf('export const PATCH'), route.indexOf('export const PUT'));
  assert.match(body, /isDrawingZone\(row\)\s*\? normalizeSurveySpots\(body\.spots, row\.spots, \{ newId: \(\) => genId\('SPT'\), defaultSelected: true \}\)\s*: normalizeSurveySpots\(body\.spots, row\.spots, \{ newId: \(\) => genId\('SPT'\) \}\)/);
  assert.equal(body.match(/defaultSelected/g).length, 1);
});

/* ══ ตัดพื้นที่ลงหน้างานสุดท้ายขณะที่ยังมีพื้นที่จากแบบ (แถว 16) ═══════════════════════════ */

// A = พื้นที่ลงหน้างานสุดท้ายที่ยังใช้อยู่ · B = จากแบบ · C = ลงหน้างานที่ถูกตัดไปก่อนแล้ว
const mixedSheet = () => [zone('A'), drawing('B', { sortOrder: 2 }), cutRow('C', { sortOrder: 3 })];

function assertFlipWrites(db) {
  const [own, marks] = zoneWrites(db);
  assert.equal(zoneWrites(db).length, 2);
  // ② แถวที่ถูกตัดไปก่อนแล้วของใบถูกทำเครื่องหมายเป็นจากแบบ **หลัง** แถวนี้ถูกตัดจริง — ระบุรายแถว ไม่แตะแถวที่เพิ่งตัด
  assert.equal(marks.write, 'update');
  assert.deepEqual(marks.filters, [['eq', 'requestId', 'REQ1'], ['eq', 'status', 'cut'], ['in', 'id', ['C']]]);
  assert.deepEqual(Object.keys(marks.payload), ['method', 'updatedAt']);
  assert.equal(marks.payload.method, 'drawing');
  // ① แถวที่ตัดเองพก method ไปในคำสั่งเดียวกับการตัด (คำสั่งแรก · มีเงื่อนไขกับรุ่นที่อ่าน)
  assert.deepEqual(own.filters, [['eq', 'id', 'A'], ['eq', 'updatedAt', T0]]);
  assert.deepEqual(Object.keys(own.payload), ['status', 'cutReason', 'method', 'surveyedAt', 'surveyedById', 'surveyedByName', 'updatedAt']);
  assert.equal(own.payload.status, 'cut');
  assert.equal(own.payload.method, 'drawing');
  assert.deepEqual(writesOutsideZones(db), [], 'ไม่แตะนัด ไม่แตะวันบนใบ');
  assert.equal(rowOf(db, 'C').method, 'drawing');
  assert.equal(rowOf(db, 'A').updatedAt, own.payload.updatedAt, 'รุ่นของแถวที่เพิ่งตัด = ที่ส่งกลับให้จอ (คำสั่งทำเครื่องหมายไม่ทับ)');
  assert.equal(rowOf(db, 'B').updatedAt, T0, 'พื้นที่ที่ยังใช้อยู่ไม่ถูกแตะ');
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false);
}

test('ตัดแล้วใบพลิกเป็นงานโต๊ะ · ไม่มีนัดค้าง (นัดปิดแล้ว/ไม่มีนัด): คนที่ตัดได้วันนี้ตัดได้ · แล้วทำเครื่องหมายแถวที่ตัดไว้ก่อน', async () => {
  const closed = seed({ zones: mixedSheet(), visits: [visit('done')] });
  const byCrew = await cut(closed, tech, 'A');
  assert.equal(byCrew.status, 200, byCrew.json.error);
  assert.equal(byCrew.json.method, 'drawing');
  assertFlipWrites(closed);

  const none = seed({ zones: mixedSheet() });
  assert.equal((await cut(none, planner, 'A')).status, 200);
  assertFlipWrites(none);
});

test('ตัดแล้วใบพลิกเป็นงานโต๊ะ · นัดกำลังทำ: ช่างบนนัดตัดได้ คำสั่งเขียนชุดเดียวกัน · ไม่เขียนนัดและใบคำร้อง', async () => {
  const db = seed({ zones: mixedSheet(), visits: [visit('in_progress')] });
  const { status, json } = await cut(db, tech, 'A');
  assert.equal(status, 200, json.error);
  assertFlipWrites(db);
  assert.equal(db.tables.service_visits[0].status, 'in_progress');
  assert.equal(db.writes('service_visits').length, 0);
  assert.equal(db.writes('dept_requests').length, 0);
});

test('ลำดับ ตัด A (ลงหน้างาน) → ตัด B (จากแบบ): ใบยังเป็นงานโต๊ะ ไม่พลิกกลับเมื่อถูกตัดหมด', async () => {
  const db = seed({ zones: mixedSheet() });
  assert.equal((await cut(db, head, 'A')).status, 200);
  const second = await cut(db, head, 'B');
  assert.equal(second.status, 200, second.json.error);
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false);
  // ตัดพื้นที่จากแบบไม่พลิกอะไร ⇒ ไม่มีคำสั่งทำเครื่องหมายรอบสอง และคำสั่งตัดไม่มีคีย์ method
  assert.equal(zoneWrites(db).length, 3);
  assert.deepEqual(Object.keys(zoneWrites(db)[2].payload), STATUS_PATCH_KEYS_TODAY);
});

for (const state of ['scheduled', 'draft']) {
  test(`ตัดแล้วใบพลิกเป็นงานโต๊ะ · นัด ${state} ยังเปิด: ช่างและผู้จัดคิว 403 · หัวหน้า 409 พร้อมรหัสนัด · ไม่เขียนอะไรเลย`, async () => {
    for (const user of [tech, planner]) {
      const db = seed({ zones: mixedSheet(), visits: [visit(state)] });
      const refused = await cut(db, user, 'A');
      assert.equal(refused.status, 403, user.id);
      assert.equal(refused.json.error, LAST_ONSITE_CUT_CREW);
      assert.deepEqual(dataWrites(db), []);
      assert.equal(rowOf(db, 'A').status, 'ok');
    }
    const db = seed({ zones: mixedSheet(), visits: [visit(state)] });
    const held = await cut(db, head, 'A');
    assert.equal(held.status, 409);
    assert.equal(held.json.error, holdText('SV-26100007'));
    assert.deepEqual(dataWrites(db), []);
    assert.equal(rowOf(db, 'C').method, undefined);

    // นัดที่ยังไม่ได้รหัส (ร่าง) = ใช้ id ของนัดแทน
    const noCode = seed({ zones: mixedSheet(), visits: [visit(state, { code: null })] });
    assert.equal((await cut(noCode, head, 'A')).json.error, holdText('V1'));
  });
}

const markFails = (q) => (q.table === 'service_survey_zones' && q.write === 'update'
  && q.filters.some(([, col]) => col === 'requestId')
  ? { data: null, error: { message: 'เชื่อมต่อฐานข้อมูลไม่ได้' } } : undefined);

test('🔴 ตัดแล้วใบพลิก แต่แถวของตัวเองเขียนไม่ติด (อีกคนบันทึกแทรก = 409): ไม่มีแถวไหนถูกทำเครื่องหมาย', async () => {
  /* 🐞 เดิมทำเครื่องหมายก่อนเขียนแถวของตัวเอง ⇒ ตีกลับ 409 แล้วใบยังต้องมีนัด แต่ C (ตัดไว้ก่อน · ลงหน้างาน) กลายเป็นจากแบบ:
     ช่างที่ตัด C ไว้คืนเองไม่ได้ และหัวหน้ากด "เอากลับเข้าใบ" ได้พื้นที่จากแบบที่ไม่มีใครเลือก */
  const hook = (q, db) => {
    if (q.table === 'service_survey_zones' && q.write === 'update' && q.filters.some(([, col, val]) => col === 'id' && val === 'A')) {
      db.tables.service_survey_zones.find((r) => r.id === 'A').updatedAt = '2026-10-01T00:00:05.000Z';
    }
    return undefined;
  };
  const db = seed({ zones: mixedSheet(), visits: [visit('in_progress')], hook });
  const { status } = await cut(db, tech, 'A');
  assert.equal(status, 409);
  assert.equal(rowOf(db, 'A').status, 'ok');
  assert.equal(rowOf(db, 'C').method, undefined, 'แถวที่ตัดไว้ก่อนยังเป็นลงหน้างาน');
  assert.equal(rowOf(db, 'C').updatedAt, T0);
  assert.equal(zoneWrites(db).length, 1, 'มีแต่คำสั่งตัดที่ไม่ติดแถว');
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), true);
  // คืน C เข้าใบที่ยังต้องมีนัด = กลับมาเป็นพื้นที่ลงหน้างานตามเดิม · ช่างบนนัดคืนเองได้
  const back = await restore(db, tech, 'C');
  assert.equal(back.status, 200, back.json.error);
  assert.equal(isDrawingZone(rowOf(db, 'C')), false);
});

test('ตัดสำเร็จแล้วทำเครื่องหมายแถวที่ตัดไว้ก่อนไม่สำเร็จ = 500 ที่บอกว่าตัดแล้ว · ยังเขียน audit · การตัดครั้งถัดไปของใบซ่อมให้ก่อนตัด', async () => {
  let failing = true;
  const db = seed({ zones: mixedSheet(), visits: [visit('in_progress')], hook: (q) => (failing ? markFails(q) : undefined) });
  const { status, json } = await cut(db, tech, 'A');
  assert.equal(status, 500);
  assert.equal(json.error, 'ตัดพื้นที่ พื้นที่ A ออกแล้ว แต่บันทึกวิธีประเมินของพื้นที่ที่ตัดไว้ก่อนหน้าไม่สำเร็จ — โหลดหน้าใหม่ (เชื่อมต่อฐานข้อมูลไม่ได้)');
  assert.equal(rowOf(db, 'A').status, 'cut');
  assert.equal(rowOf(db, 'A').method, 'drawing');
  assert.equal(rowOf(db, 'C').method, undefined);
  assert.equal(db.tables.audit_logs?.length, 1, 'การตัดเกิดขึ้นจริง ต้องมี audit');
  // ใบเป็นงานโต๊ะแล้ว (B ยังใช้อยู่) — แถว C ที่ค้างยังไม่มีผล
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false);

  // หัวหน้าตัด B (จากแบบ · พื้นที่สุดท้าย): ซ่อม C **ก่อน** ตัด ⇒ ตัดหมดใบแล้วยังเป็นงานโต๊ะ
  failing = false;
  const before = zoneWrites(db).length;
  const second = await cut(db, head, 'B');
  assert.equal(second.status, 200, second.json.error);
  const [heal, own] = zoneWrites(db).slice(before);
  assert.deepEqual(heal.filters, [['eq', 'requestId', 'REQ1'], ['eq', 'status', 'cut'], ['in', 'id', ['C']]]);
  assert.deepEqual(own.filters, [['eq', 'id', 'B'], ['eq', 'updatedAt', T0]]);
  assert.deepEqual(Object.keys(own.payload), STATUS_PATCH_KEYS_TODAY);
  assert.equal(rowOf(db, 'C').method, 'drawing');
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false);
});

test('ซ่อมแถวตัดเก่าไม่สำเร็จ = 500 ก่อนตัด · พื้นที่ยังไม่ถูกตัด (กดใหม่ได้)', async () => {
  const db = seed({ zones: [drawing('B'), cutRow('C', { sortOrder: 2 })], hook: markFails });
  const { status, json } = await cut(db, head, 'B');
  assert.equal(status, 500);
  assert.equal(json.error, 'เชื่อมต่อฐานข้อมูลไม่ได้');
  assert.equal(rowOf(db, 'B').status, 'ok');
  assert.equal(zoneWrites(db).length, 1, 'หยุดที่คำสั่งซ่อม ไม่เดินต่อไปตัดแถว');
  assert.equal(db.tables.audit_logs, undefined);
});

/* ── ตัดที่ไม่พลิก = วันนี้ทุกคีย์ ── */
const NON_FLIP_SHEETS = [
  ['ยังเหลือพื้นที่ลงหน้างานอีกแห่ง', (shape) => [zone('A', shape), zone('B', { ...shape, sortOrder: 2 })]],
  ['พื้นที่ลงหน้างานสุดท้าย และใบไม่มีพื้นที่จากแบบ', (shape) => [zone('A', shape)]],
  ['พื้นที่เดียวของใบ มีแถวที่ตัดไปก่อน (ทรง RQ-AS-26090233)', (shape) => [zone('A', shape), cutRow('C', { ...shape, sortOrder: 2 })]],
];

for (const [sheet, build] of NON_FLIP_SHEETS) {
  for (const [label, shape] of ONSITE_SHAPES) {
    test(`ตัดที่ไม่พลิก · ${sheet} (${label}): คำสั่งเขียนเท่าวันนี้ ไม่มีคีย์ method · นัด scheduled ก็ไม่ขวาง`, async () => {
      for (const state of ['scheduled', 'in_progress']) {
        const db = seed({ zones: build(shape), visits: [visit(state)] });
        const { status, json } = await cut(db, tech, 'A');
        assert.equal(status, 200, json.error);
        const writes = zoneWrites(db);
        assert.equal(writes.length, 1, state);
        assert.deepEqual(writes[0].filters, [['eq', 'id', 'A'], ['eq', 'updatedAt', T0]]);
        assert.deepEqual(Object.keys(writes[0].payload), STATUS_PATCH_KEYS_TODAY);
        assert.deepEqual(writesOutsideZones(db), []);
        assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), true);
      }
    });
  }
}

test('ตัดพื้นที่จากแบบของใบผสม: หัวหน้าเท่านั้น และไม่พลิกอะไร (ไม่มีคีย์ method)', async () => {
  const db = seed({ zones: mixedSheet(), visits: [visit('scheduled')] });
  assert.equal((await cut(db, tech, 'B')).json.error, DRAWING_ZONE_HEAD_ONLY);
  const { status, json } = await cut(db, head, 'B');
  assert.equal(status, 200, json.error);
  assert.equal(zoneWrites(db).length, 1);
  assert.deepEqual(Object.keys(zoneWrites(db)[0].payload), STATUS_PATCH_KEYS_TODAY);
});

/* ══ เอาพื้นที่ที่ตัดกลับเข้าใบ (แถว 15) ═════════════════════════════════════════════ */

test('คืนพื้นที่ · ใบงานโต๊ะ: แถวที่คืนเป็นจากแบบ · หัวหน้าเท่านั้น', async () => {
  // แถวลงหน้างานที่ถูกตัดไว้ตั้งแต่ก่อนใบเป็นงานโต๊ะ — คืนเฉย ๆ = ใบพลิกกลับไปต้องมีนัดเงียบ ๆ
  const sheet = () => [cutRow('A'), drawing('B', { sortOrder: 2 })];
  for (const user of [tech, planner]) {
    const db = seed({ zones: sheet(), visits: [visit('done')] });
    const refused = await restore(db, user, 'A');
    assert.equal(refused.status, 403, user.id);
    assert.equal(refused.json.error, DRAWING_ZONE_HEAD_ONLY);
    assert.deepEqual(dataWrites(db), []);
  }
  const db = seed({ zones: sheet() });
  const { status, json } = await restore(db, head, 'A');
  assert.equal(status, 200, json.error);
  const [write] = zoneWrites(db);
  assert.equal(zoneWrites(db).length, 1);
  assert.deepEqual(Object.keys(write.payload), ['status', 'cutReason', 'method', 'surveyedAt', 'surveyedById', 'surveyedByName', 'updatedAt']);
  assert.equal(write.payload.method, 'drawing');
  assert.equal(write.payload.status, 'ok');
  assert.equal(write.payload.cutReason, null);
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false);

  // ถูกตัดหมดทั้งใบและทุกแถวเป็นจากแบบ — คืนแล้วยังเป็นจากแบบ
  const allCut = seed({ zones: [cutRow('A', { method: 'drawing' })] });
  assert.equal((await restore(allCut, head, 'A')).json.method, 'drawing');
});

for (const [label, shape] of ONSITE_SHAPES) {
  test(`คืนพื้นที่ · ใบลงหน้างาน (${label}): เหมือนเดิม ไม่มีคีย์ method · ช่างบนนัดและผู้จัดคิวคืนได้`, async () => {
    for (const [user, visits] of [[tech, [visit('in_progress')]], [planner, []]]) {
      const db = seed({ zones: [cutRow('A', shape), zone('B', { ...shape, sortOrder: 2 })], visits });
      const { status, json } = await restore(db, user, 'A');
      assert.equal(status, 200, json.error);
      assert.equal(zoneWrites(db).length, 1);
      assert.deepEqual(Object.keys(zoneWrites(db)[0].payload), STATUS_PATCH_KEYS_TODAY);
    }
    // ใบที่ถูกตัดหมดและเป็นลงหน้างาน (ทรง RQ-AS-26090233) — ยังเป็นใบที่ต้องมีนัด คืนได้ตามเดิม
    const allCut = seed({ zones: [cutRow('A', shape)] });
    assert.equal((await restore(allCut, planner, 'A')).status, 200);
    assert.deepEqual(Object.keys(zoneWrites(allCut)[0].payload), STATUS_PATCH_KEYS_TODAY);
  });
}

test('คืนพื้นที่จากแบบของใบผสม: คงวิธีเดิม (ไม่มีคีย์ method ในคำสั่ง) · หัวหน้าเท่านั้น', async () => {
  const sheet = () => [zone('A'), cutRow('B', { method: 'drawing', sortOrder: 2 })];
  const crew = seed({ zones: sheet(), visits: [visit('in_progress')] });
  assert.equal((await restore(crew, tech, 'B')).json.error, DRAWING_ZONE_HEAD_ONLY);
  const db = seed({ zones: sheet() });
  const { status, json } = await restore(db, head, 'B');
  assert.equal(status, 200, json.error);
  assert.deepEqual(Object.keys(zoneWrites(db)[0].payload), STATUS_PATCH_KEYS_TODAY);
  assert.equal(json.method, 'drawing');
});

/* ══ ลบพื้นที่ที่เพิ่มบนใบ (DELETE · แถว 13 + 16) ═══════════════════════════════════════ */

test('ลบพื้นที่จากแบบที่เพิ่มบนใบ: ช่างและผู้จัดคิว 403 · หัวหน้าลบได้โดยไม่อ่านนัด · ใบที่ส่งผลแล้ว 409', async () => {
  const sheet = () => [drawing('A', { status: 'added' }), drawing('B', { sortOrder: 2 })];
  for (const user of [tech, planner]) {
    const db = seed({ zones: sheet(), visits: [visit('done')] });
    const refused = await remove(db, user, 'A');
    assert.equal(refused.status, 403, user.id);
    assert.equal(refused.json.error, DRAWING_ZONE_HEAD_ONLY);
    assert.deepEqual(dataWrites(db), []);
  }
  const db = seed({ zones: sheet() });
  const { status, json } = await remove(db, head, 'A');
  assert.equal(status, 200, json.error);
  assert.equal(rowOf(db, 'A'), undefined);
  assert.equal(db.calls.some((c) => c.table === 'service_visits'), false);
  assert.deepEqual(zoneWrites(db).map((w) => w.write), ['delete']);

  const sent = seed({ zones: sheet(), req: { answeredAt: T0 } });
  const locked = await remove(sent, head, 'A');
  assert.equal(locked.status, 409);
  assert.match(locked.json.error, /ส่งผลให้ฝ่ายขายไปแล้ว/);
  assert.deepEqual(dataWrites(sent), []);
});

// A = พื้นที่ลงหน้างานที่ช่างเพิ่มเอง และเป็นแห่งสุดท้าย · B = จากแบบ · C = ลงหน้างานที่ถูกตัด
const addedLast = () => [zone('A', { status: 'added' }), drawing('B', { sortOrder: 2 }), cutRow('C', { sortOrder: 3 })];

for (const state of ['scheduled', 'draft']) {
  test(`ลบแล้วใบพลิกเป็นงานโต๊ะ · นัด ${state} ยังเปิด: ตีกลับเหมือนการตัด · ไม่ลบ ไม่เขียนอะไร`, async () => {
    for (const user of [tech, planner]) {
      const db = seed({ zones: addedLast(), visits: [visit(state)] });
      const refused = await remove(db, user, 'A');
      assert.equal(refused.status, 403, user.id);
      assert.equal(refused.json.error, LAST_ONSITE_CUT_CREW);
      assert.deepEqual(dataWrites(db), []);
    }
    const db = seed({ zones: addedLast(), visits: [visit(state)] });
    const held = await remove(db, head, 'A');
    assert.equal(held.status, 409);
    assert.equal(held.json.error, holdText('SV-26100007'));
    assert.deepEqual(dataWrites(db), []);
    assert.ok(rowOf(db, 'A'));
  });
}

test('ลบแล้วใบพลิกเป็นงานโต๊ะ · นัดกำลังทำ: ช่างลบได้ · ลบก่อน แล้วทำเครื่องหมายแถวที่ตัดไว้ก่อน · ไม่แตะนัด', async () => {
  const db = seed({ zones: addedLast(), visits: [visit('in_progress')] });
  const { status, json } = await remove(db, tech, 'A');
  assert.equal(status, 200, json.error);
  const [gone, marks] = zoneWrites(db);
  assert.equal(zoneWrites(db).length, 2);
  assert.equal(marks.write, 'update');
  assert.deepEqual(marks.filters, [['eq', 'requestId', 'REQ1'], ['eq', 'status', 'cut'], ['in', 'id', ['C']]]);
  assert.equal(marks.payload.method, 'drawing');
  assert.equal(gone.write, 'delete');
  assert.equal(rowOf(db, 'A'), undefined);
  assert.equal(rowOf(db, 'C').method, 'drawing');
  assert.equal(db.writes('service_visits').length, 0);
  assert.equal(db.writes('dept_requests').length, 0);
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), false);
});

test('ลบแล้วใบพลิก แต่ลบแถวไม่สำเร็จ = 500 · ไม่มีแถวไหนถูกทำเครื่องหมาย', async () => {
  const hook = (q) => (q.table === 'service_survey_zones' && q.write === 'delete'
    ? { data: null, error: { message: 'เชื่อมต่อฐานข้อมูลไม่ได้' } } : undefined);
  const db = seed({ zones: addedLast(), visits: [visit('in_progress')], hook });
  const { status } = await remove(db, tech, 'A');
  assert.equal(status, 500);
  assert.ok(rowOf(db, 'A'));
  assert.equal(rowOf(db, 'C').method, undefined);
  assert.equal(zoneWrites(db).some((w) => w.write === 'update'), false);
  assert.equal(surveyNeedsVisit(db.tables.service_survey_zones), true);
});

test('ลบสำเร็จแล้วทำเครื่องหมายแถวที่ตัดไว้ก่อนไม่สำเร็จ = 500 ที่บอกว่าลบแล้ว · ยังเขียน audit', async () => {
  const db = seed({ zones: addedLast(), visits: [visit('in_progress')], hook: markFails });
  const { status, json } = await remove(db, tech, 'A');
  assert.equal(status, 500);
  assert.equal(json.error, 'ลบพื้นที่ พื้นที่ A ออกจากใบแล้ว แต่บันทึกวิธีประเมินของพื้นที่ที่ตัดไว้ก่อนหน้าไม่สำเร็จ — โหลดหน้าใหม่ (เชื่อมต่อฐานข้อมูลไม่ได้)');
  assert.equal(rowOf(db, 'A'), undefined);
  assert.equal(rowOf(db, 'C').method, undefined);
  assert.equal(db.tables.audit_logs?.length, 1);
});

for (const [label, shape] of ONSITE_SHAPES) {
  test(`ลบที่ไม่พลิก · ใบลงหน้างาน (${label}): คำสั่งเขียนเท่าวันนี้ (ลบแถวอย่างเดียว) · นัด scheduled ก็ไม่ขวาง`, async () => {
    const sheets = [
      [zone('A', { ...shape, status: 'added' }), zone('B', { ...shape, sortOrder: 2 })],
      // ลบแล้วไม่เหลือแถวเลย = ยังเป็นใบที่ต้องมีนัด
      [zone('A', { ...shape, status: 'added' })],
    ];
    for (const zones of sheets) {
      const db = seed({ zones, visits: [visit('scheduled')] });
      const { status, json } = await remove(db, tech, 'A');
      assert.equal(status, 200, json.error);
      assert.deepEqual(json, { id: 'A', zoneDropped: false });
      assert.deepEqual(zoneWrites(db).map((w) => w.write), ['delete']);
      assert.deepEqual(writesOutsideZones(db), []);
    }
    const outsider = seed({ zones: sheets[0], visits: [visit('in_progress')] });
    const refused = await remove(outsider, mate, 'A');
    assert.equal(refused.status, 403);
    assert.equal(refused.json.error, NOT_YOUR_VISIT);
  });
}

/* ══ ไฟล์ของพื้นที่ (แถว 13 · ด่านคนละตัวกับ PATCH) ═══════════════════════════════════════ */

const filesDb = ({ req = {}, visits = [visit('in_progress')] } = {}) => fakeDb({
  dept_requests: [request(req)], service_visits: visits,
});
/* แนบ (POST /api/attachments → `canEditAttachmentParent`) กับ ลบ/แก้รายละเอียด (→ `canAttachToCosting`) ต้องตอบตรงกัน */
const fileGates = [
  ['แนบ', (db, row, user) => canEditAttachmentParent(db, 'service_survey_zone', row, user)],
  ['ลบ', (db, row, user) => canAttachToCosting(db, 'service_survey_zone', row, user)],
];

for (const [action, gate] of fileGates) {
  test(`ไฟล์ของพื้นที่จากแบบ · ${action}: ผู้จัดคิวและช่างบนนัดไม่ได้ · หัวหน้าและแอดมินได้`, async () => {
    const row = drawing('A');
    const cases = [[planner, false], [tech, false], [mate, false], [sales, false], [head, true], [admin, true]];
    for (const [user, expected] of cases) {
      assert.equal(await gate(filesDb(), row, user), expected, user.id);
    }
    // ไม่มีนัดเลยก็ตอบเหมือนกัน — พื้นที่จากแบบไม่ถามนัด
    assert.equal(await gate(filesDb({ visits: [] }), row, head), true);
    const db = filesDb();
    await gate(db, row, head);
    assert.equal(db.calls.some((c) => c.table === 'service_visits'), false);
  });

  test(`ไฟล์ของพื้นที่จากแบบ · ${action}: ใบที่ส่งผลแล้วหัวหน้าก็ไม่ได้ (แอดมินได้) · ใบของฝ่ายอื่นไม่ได้`, async () => {
    const sent = filesDb({ req: { answeredAt: T0 } });
    assert.equal(await gate(sent, drawing('A'), head), false);
    assert.equal(await gate(sent, drawing('A'), admin), true);
    const otherDept = filesDb({ req: { dept: 'RD', kind: 'scent_dev' } });
    assert.equal(await gate(otherDept, drawing('A'), head), false);
  });

  for (const [label, shape] of ONSITE_SHAPES) {
    test(`ไฟล์ของพื้นที่ลงหน้างาน · ${action} (${label}): ตารางสิทธิ์เดิมทุกช่อง`, async () => {
      const row = zone('A', shape);
      const cases = [[tech, true], [mate, false], [planner, true], [head, true], [admin, true], [sales, false]];
      for (const [user, expected] of cases) {
        assert.equal(await gate(filesDb(), row, user), expected, user.id);
      }
      const sent = filesDb({ req: { answeredAt: T0 } });
      for (const user of [tech, planner, head]) assert.equal(await gate(sent, row, user), false, user.id);
      assert.equal(await gate(sent, row, admin), true);
    });
  }
}

test('ผูกรูปกับจุดของพื้นที่จากแบบ: ใบเปิด = หัวหน้าเท่านั้น · ใบส่งผลแล้ว = ข้อยกเว้นของหัวหน้าเหมือนเดิม', async () => {
  const row = drawing('A');
  for (const user of [tech, planner]) {
    const refused = await surveySpotLinkAccess(filesDb(), row, user);
    assert.equal(refused.ok, false, user.id);
  }
  const open = await surveySpotLinkAccess(filesDb(), row, head);
  assert.deepEqual({ ok: open.ok, locked: open.locked }, { ok: true, locked: false });
  const sent = await surveySpotLinkAccess(filesDb({ req: { answeredAt: T0 } }), row, head);
  assert.deepEqual({ ok: sent.ok, locked: sent.locked }, { ok: true, locked: true });
  // พื้นที่ลงหน้างาน: ช่างบนนัดยังผูกได้เหมือนเดิม
  assert.equal((await surveySpotLinkAccess(filesDb(), zone('A'), tech)).ok, true);
});

/* ══ ยามผูกกับซอร์สจริง ═══════════════════════════════════════════════════════════ */

test('ซอร์ส: คีย์ method ถูกเขียนเฉพาะค่า drawing — เส้นเพิ่มพื้นที่แนบคีย์แบบมีเงื่อนไข', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/route.js');
  assert.match(route, /const method = surveyNewZoneMethod\(rows, \{ variant: request\.variant \}\);/);
  assert.match(route, /\.\.\.\(method === SURVEY_METHOD_DRAWING \? \{ method: SURVEY_METHOD_DRAWING \} : \{\}\),/);
  assert.equal(route.match(/loadSurveyZones\(/g).length, 1, 'อ่านแถวของใบครั้งเดียว ใช้ทั้งวิธี · ชื่อซ้ำ · ลำดับ');
});

test('ซอร์ส: ทั้งสามไฟล์ถามวิธีผ่านโมดูลใบ ไม่เทียบค่าคอลัมน์เอง', () => {
  for (const rel of [
    '../../app/api/service/surveys/[id]/zones/route.js',
    '../../app/api/service/surveys/[id]/zones/[zoneId]/route.js',
    '../master/costingAttachmentAccess.js',
  ]) {
    const src = code(rel);
    assert.doesNotMatch(src, /\.method\s*[!=]==?/, rel);
    assert.doesNotMatch(src, /['"](drawing|onsite)['"]/, rel);
    assert.match(src, /from '@\/lib\/service\/surveyMethod'/, rel);
  }
});

/* 🔴 ด่านไฟล์ตัดสินจากแถวพื้นที่ที่ผู้เรียกส่งมา ⇒ ผู้เรียกทุกจุดต้องอ่านแถวทั้งแถว
   เลือกคอลัมน์ขาด `method` เมื่อไร พื้นที่จากแบบกลายเป็นลงหน้างานเงียบ ๆ แล้วช่างแนบ/ลบไฟล์ได้ */
test('ซอร์ส: ผู้เรียกด่านไฟล์ของพื้นที่อ่านแถวแม่ด้วย select ทั้งแถว', () => {
  const list = code('../../app/api/attachments/route.js');
  const loadParent = list.slice(list.indexOf('async function loadParent'), list.indexOf('export async function GET'));
  assert.match(loadParent, /COSTING_ATTACHMENT_TABLE\[entityType\]/);
  assert.match(loadParent, /supabase\.from\(table\)\.select\('\*'\)\.eq\('id', entityId\)\.maybeSingle\(\)/);

  const item = code('../../app/api/attachments/[id]/route.js');
  assert.match(item, /\.from\(COSTING_ATTACHMENT_TABLE\[att\.entityType\]\)\.select\('\*'\)\.eq\('id', att\.entityId\)\.maybeSingle\(\)/);

  const link = code('./surveySpotLink.js');
  assert.match(link, /\.from\('service_survey_zones'\)\.select\('\*'\)\.eq\('id', att\.entityId\)\.maybeSingle\(\)/);

  const gate = code('../master/costingAttachmentAccess.js');
  assert.match(gate, /writeSurveyZoneFilesFor\(supabase, await parentRequest\(supabase, parent\), user, \{ zoneRow: parent \}\)/);
  assert.match(gate, /await writeSurveyZoneFilesFor\(supabase, req, user, \{ zoneRow: parent \}\)/);
  // ด่านอ่านและล็อกเวลามาก่อนการแยกวิธีเสมอ
  const body = gate.slice(gate.indexOf('async function writeSurveyZoneFilesFor'), gate.indexOf('export async function surveySpotLinkAccess'));
  const readAt = body.indexOf('if (surveyReadError(user, req)) return false;');
  const lockAt = body.indexOf("if (user?.role !== 'admin' && surveyEditLockError(req)) return false;");
  const methodAt = body.indexOf('if (isDrawingZone(zoneRow)) return canSendSurveyResult(user);');
  assert.ok(readAt > 0 && lockAt > readAt && methodAt > lockAt);
});
