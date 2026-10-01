// ── ลงผลทีละเครื่อง: `PUT visits/[id]/assets` + `partial: true` (แผน operation-crew C3 · C4 · R6 · R10 · S3) ──
//
// ⭐ หน้างานของช่างบันทึกผลทุกครั้งที่แตะเครื่อง (ไม่ถือไว้ในมือถือ — กล้อง Android รีโหลดหน้าแล้วหาย · ผู้ช่วยลงผล
//    อีกเครื่องพร้อมกัน) ⇒ ทางเดียวกับ PUT ทั้งชุด ด่านชุดเดียวกัน แต่ **ไม่แตะแถวของเครื่องอื่น** และ **ยังไม่ลง
//    ทะเบียนเปลี่ยนเครื่อง** (ส่งงานส่ง PUT ทั้งชุดรอบเดียว) · แจ้งชำรุดได้ก่อนเลือกผล (แถวแจ้งชำรุดอย่างเดียว)
// ⚠️ เรียก handler ตัวจริงผ่าน supabase ปลอมที่จำแถว (`routeTestKit.mjs`) — ไม่มี client จริงในเทสต์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, callRoute, tech, mate, senior, planner } from './routeTestKit.mjs';
import { businessDate } from '../../businessDate.js';
import { CREW_CLOSED_EDIT_ERROR, CREW_NOT_ON_SCHEDULE_ERROR, CREW_NOT_STARTED_ERROR } from '../visitAccess.js';
import { addDays } from '../../datePeriods.js';

const { PUT } = await import('../../../app/api/service/visits/[id]/assets/route.js');

const TODAY = businessDate();
const machine = (id, zoneId, o = {}) => ({
  id, code: id, label: `เครื่อง ${id}`, siteId: 'S1', zoneId, status: 'active', condition: 'ok',
  installedAt: '2026-01-05', serial: null, ...o,
});
const visitRow = (o = {}) => ({
  id: 'V1', code: 'SV-26090001', siteId: 'S1', kind: 'refill', status: 'in_progress',
  scheduledDate: TODAY, actualDate: TODAY, actualStartTime: '09:00',
  assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', assistantIds: ['U-MATE'], ...o,
});
const resultRow = (assetId, outcome = 'done', o = {}) => ({
  id: `SVR-${assetId}`, visitId: 'V1', assetId, outcome, reason: null, replacedByAssetId: null,
  createdById: 'U-MATE', createdByName: 'ช่างบี', ...o,
});

function seed({ visit = {}, results = [] } = {}) {
  return fakeDb({
    service_visits: [visitRow(visit)],
    service_sites: [{ id: 'S1', name: 'ไซต์ทดสอบ' }],
    service_assets: [
      machine('A1', 'Z1'), machine('A2', 'Z1'), machine('B1', 'Z2'), machine('B2', 'Z2'),
      machine('SP', 'Z1', { status: 'active', installedAt: null }),
    ],
    service_visit_assets: results,
  });
}

const put = (db, user, body) => callRoute(PUT, {
  user, db, method: 'PUT', path: '/api/service/visits/V1/assets', params: { id: 'V1' }, body,
});
const rowsOf = (db) => new Map((db.tables.service_visit_assets || []).map((r) => [r.assetId, r]));
const assetWrites = (db) => db.writes('service_assets');

test('🔴 ทีละเครื่องได้เฉพาะงานที่กำลังทำ — ยังไม่กดรับงาน / ใบที่ปิดแล้ว (หัวหน้า) = 409 และไม่เขียนอะไร', async () => {
  for (const [user, visit] of [[tech, { status: 'scheduled', actualDate: null }], [planner, { status: 'done' }], [senior, { status: 'partial' }]]) {
    const db = seed({ visit });
    const { status, json } = await put(db, user, { partial: true, results: [{ assetId: 'A1', outcome: 'done' }] });
    assert.equal(status, 409, `${user.role}/${visit.status}`);
    assert.match(json.error, /^กดรับงานก่อน/);
    assert.deepEqual(db.writes('service_visit_assets'), []);
  }
});

test('⭐ แถวของเครื่องอื่นอยู่ครบ — upsert เฉพาะเครื่องที่ส่งมา ไม่มีคำสั่งลบ · คืนผลทั้งใบ', async () => {
  const db = seed({ results: [resultRow('A2')] });
  const { status, json } = await put(db, tech, { partial: true, results: [{ assetId: 'A1', outcome: 'done' }] });
  assert.equal(status, 200, json.error);
  const writes = db.writes('service_visit_assets');
  assert.deepEqual(writes.map((w) => w.write), ['upsert']);
  assert.equal(writes[0].options.onConflict, 'visitId,assetId');
  const rows = rowsOf(db);
  assert.equal(rows.get('A2').createdById, 'U-MATE', 'ผลของผู้ช่วยต้องไม่ถูกลบ/ทับ');
  assert.equal(rows.get('A1').outcome, 'done');
  assert.equal(rows.get('A1').createdById, 'U-TECH');
  assert.deepEqual(json.map((r) => r.assetId).sort(), ['A1', 'A2']);
});

test('แก้ผลเครื่องเดิมซ้ำ = แถวเดิม (id เดิม) ไม่ใช่แถวใหม่ · updatedAt ขยับ', async () => {
  const db = seed({ results: [resultRow('A1', 'done', { updatedAt: '2026-01-01T00:00:00.000Z' })] });
  const { status, json } = await put(db, tech, {
    partial: true, results: [{ assetId: 'A1', outcome: 'unable', reason: 'ลูกค้าไม่ให้เข้าห้อง' }],
  });
  assert.equal(status, 200, json.error);
  const rows = db.tables.service_visit_assets;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'SVR-A1');
  assert.equal(rows[0].outcome, 'unable');
  assert.notEqual(rows[0].updatedAt, '2026-01-01T00:00:00.000Z');
});

test('🔴 ทีละเครื่องไม่ลงทะเบียนเปลี่ยนเครื่อง — PUT ทั้งชุดตอนส่งงานเปลี่ยนครั้งเดียว (พฤติกรรมเดิม)', async () => {
  const db = seed();
  const swap = { assetId: 'A1', outcome: 'swapped', reason: 'เครื่องเดิมพังเปิดไม่ติด', replacedByAssetId: 'SP' };
  const first = await put(db, tech, { partial: true, results: [swap] });
  assert.equal(first.status, 200, first.json.error);
  assert.equal(rowsOf(db).get('A1').outcome, 'swapped');
  assert.deepEqual(assetWrites(db), [], 'ทีละเครื่อง = ไม่แตะทะเบียนเครื่อง');
  assert.equal(db.tables.service_assets.find((a) => a.id === 'A1').status, 'active');

  // ส่งงาน: PUT ทั้งชุดของแถวใน server → ลงทะเบียนเปลี่ยนเครื่องตามเดิม
  const full = await put(db, tech, { results: [swap, { assetId: 'A2', outcome: 'done' }, { assetId: 'B1', outcome: 'done' }, { assetId: 'B2', outcome: 'done' }] });
  assert.equal(full.status, 200, full.json.error);
  const a1 = db.tables.service_assets.find((a) => a.id === 'A1');
  assert.equal(a1.status, 'removed');
  assert.equal(a1.removedAt, TODAY);
  assert.equal(db.tables.service_assets.find((a) => a.id === 'SP').installedAt, TODAY);
  // ทั้งชุด = ลบแถวที่แก้ได้แล้วใส่ใหม่ (เหมือนเดิม) ไม่ใช่ upsert
  assert.deepEqual(db.writes('service_visit_assets').map((w) => w.write), ['upsert', 'delete', 'insert']);
});

test('🔴 แจ้งชำรุดอย่างเดียว (ยังไม่มีผล) = ไม่มีแถวผล · สั่งแจ้งชำรุดหนึ่งครั้ง · อาการติดไปกับประวัติ (R6)', async () => {
  const db = seed();
  const symptom = 'ปั๊มไม่พ่น มีเสียงดัง';
  const first = await put(db, tech, { partial: true, results: [{ assetId: 'A1', broken: true, symptom }] });
  assert.equal(first.status, 200, first.json.error);
  assert.deepEqual(db.writes('service_visit_assets'), [], 'แจ้งชำรุดอย่างเดียวไม่เขียนแถวผล');
  assert.deepEqual(first.json, []);
  const moves = db.tables.service_asset_moves || [];
  assert.equal(moves.length, 1);
  assert.equal(moves[0].reason, symptom);
  assert.equal(moves[0].conditionAfter, 'broken');
  assert.equal(db.tables.service_assets.find((a) => a.id === 'A1').condition, 'broken');

  // กด "ทำแล้ว" ทีหลังด้วยเหตุผลว่าง — อาการในประวัติไม่ถูกแตะ ไม่มีคำสั่งแจ้งซ้ำ
  const later = await put(db, tech, { partial: true, results: [{ assetId: 'A1', outcome: 'done', reason: '' }] });
  assert.equal(later.status, 200, later.json.error);
  assert.equal(rowsOf(db).get('A1').reason, null);
  assert.equal(db.tables.service_asset_moves.length, 1);
  assert.equal(db.tables.service_asset_moves[0].reason, symptom);
});

test('แจ้งชำรุดอย่างเดียว: อาการสั้นไป = 400 · PUT ทั้งชุดไม่รับทรงนี้ (ทั้งชุดคือคำตอบของทั้งใบ)', async () => {
  const db = seed();
  const short = await put(db, tech, { partial: true, results: [{ assetId: 'A1', broken: true, symptom: 'เสีย' }] });
  assert.equal(short.status, 400);
  assert.match(short.json.error, /อาการอย่างน้อย 5/);
  const full = await put(db, tech, { results: [{ assetId: 'A1', broken: true, symptom: 'ปั๊มไม่พ่นเลย' }] });
  assert.equal(full.status, 400);
  assert.match(full.json.error, /ผลการทำงานของอุปกรณ์ไม่ถูกต้อง/);
  // แจ้งชำรุด + ผลของเครื่องเดียวกันในคำขอเดียว = ซ้ำ
  const dup = await put(db, tech, {
    partial: true, results: [{ assetId: 'A1', broken: true, symptom: 'ปั๊มไม่พ่นเลย' }, { assetId: 'A1', outcome: 'done' }],
  });
  assert.equal(dup.status, 400);
  assert.match(dup.json.error, /อุปกรณ์ซ้ำ/);
  assert.deepEqual(db.writes('service_visit_assets'), []);
  assert.equal((db.tables.service_asset_moves || []).length, 0);
});

test('PUT ทั้งชุดที่ส่ง `symptom` มา = ใช้อาการแทนเหตุผลของแถว (ฟอร์มแก้ผลที่ส่งทำตัวเหมือนหน้างาน)', async () => {
  const db = seed({ visit: { status: 'done' } });
  const { status, json } = await put(db, planner, {
    results: [
      { assetId: 'A1', outcome: 'done', reason: '', broken: true, symptom: 'ฝาครอบแตกด้านข้าง' },
      { assetId: 'A2', outcome: 'done' }, { assetId: 'B1', outcome: 'done' }, { assetId: 'B2', outcome: 'done' },
    ],
  });
  assert.equal(status, 200, json.error);
  assert.equal(rowsOf(db).get('A1').reason, null, 'อาการไม่ลงช่องเหตุผลของแถว');
  assert.equal(db.tables.service_asset_moves[0].reason, 'ฝาครอบแตกด้านข้าง');
});

test('🔴 สองเครื่องกดเครื่องเดียวกัน — ทีละเครื่องคนหลังทับ (upsert) · 23505 = 409 ภาษาไทย ไม่ใช่ 500 ดิบ (R10)', async () => {
  const db = seed();
  const a = await put(db, tech, { partial: true, results: [{ assetId: 'A1', outcome: 'done' }] });
  const b = await put(db, mate, { partial: true, results: [{ assetId: 'A1', outcome: 'unable', reason: 'น้ำหอมหมดสต็อกรถ' }] });
  assert.equal(a.status, 200, a.json.error);
  assert.equal(b.status, 200, b.json.error);
  const rows = db.tables.service_visit_assets.filter((r) => r.assetId === 'A1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, 'unable');
  assert.equal(rows[0].createdById, 'U-MATE');

  // ทั้งชุดชนแถวที่อีกคนเพิ่งใส่ (ลบแล้วใส่แข่งกัน) — จำลอง 23505 จาก insert/upsert
  const clash = (write) => fakeDb({
    service_visits: [visitRow()],
    service_assets: [machine('A1', 'Z1')],
  }, {
    hook: (q) => (q.table === 'service_visit_assets' && q.write === write
      ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "service_visit_assets_once"' } }
      : undefined),
  });
  for (const [write, body] of [['insert', {}], ['upsert', { partial: true }]]) {
    const { status, json } = await put(clash(write), tech, { ...body, results: [{ assetId: 'A1', outcome: 'done' }] });
    assert.equal(status, 409, write);
    assert.match(json.error, /มีคนบันทึกเครื่องนี้พร้อมกัน/, write);
    assert.doesNotMatch(json.error, /duplicate key/, write);
  }
});

test('🔴 มติ 28/09 Q3: ช่างส่ง PUT ทั้งชุดบนใบที่ส่งงานแล้ว = 409 · ทางแก้ผลที่ส่งของหัวหน้า (ทั้งชุด) ไม่เปลี่ยน', async () => {
  const closed = { status: 'partial' };
  const results = [
    { assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' },
    { assetId: 'B1', outcome: 'unable', reason: 'งดบริการ · ยังไม่ชำระ' }, { assetId: 'B2', outcome: 'unable', reason: 'งดบริการ · ยังไม่ชำระ' },
  ];
  const crew = seed({ visit: closed, results: [resultRow('A1')] });
  const refused = await put(crew, tech, { results });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.error, CREW_CLOSED_EDIT_ERROR);
  assert.deepEqual(crew.writes('service_visit_assets'), []);

  for (const head of [planner, senior]) {
    const db = seed({ visit: closed, results: [resultRow('A1')] });
    const { status, json } = await put(db, head, { results });
    assert.equal(status, 200, `${head.role}: ${json.error}`);
    assert.deepEqual(db.writes('service_visit_assets').map((w) => w.write), ['delete', 'insert'], head.role);
    assert.equal(db.tables.service_visit_assets.length, 4);
  }
});

test('มติ 28/09 Q5: เครื่องทั้งโซนงดบริการลงในคำขอเดียว (ทำไม่ได้ · "งดบริการ · …") ผ่าน · แถวอื่นไม่ถูกแตะ', async () => {
  const db = seed({ results: [resultRow('A1'), resultRow('A2', 'unable', { reason: 'ลูกค้าปิดห้องประชุม' })] });
  const reason = 'งดบริการ · SO ยังไม่ชำระเงินงวดนี้';
  const { status, json } = await put(db, tech, {
    partial: true,
    results: ['B1', 'B2'].map((assetId) => ({ assetId, outcome: 'unable', reason })),
  });
  assert.equal(status, 200, json.error);
  const rows = rowsOf(db);
  assert.equal(rows.size, 4);
  for (const id of ['B1', 'B2']) {
    assert.equal(rows.get(id).outcome, 'unable');
    assert.equal(rows.get(id).reason, reason);
  }
  assert.equal(rows.get('A2').reason, 'ลูกค้าปิดห้องประชุม');
  assert.equal(rows.get('A1').createdById, 'U-MATE');
  assert.deepEqual(db.writes('service_visit_assets').map((w) => w.write), ['upsert']);
});

test('ทีละเครื่องได้ด่านชุดเดียวกับทั้งชุด — เครื่องนอกไซต์ · เปลี่ยนเครื่องในนัดถอน = 400 ก่อนเขียน', async () => {
  const db = seed();
  const offSite = await put(db, tech, { partial: true, results: [{ assetId: 'X9', outcome: 'done' }] });
  assert.equal(offSite.status, 400);
  assert.match(offSite.json.error, /ไม่ได้อยู่ในไซต์ของนัดนี้/);
  const remove = seed({ visit: { kind: 'remove' } });
  const swap = await put(remove, tech, {
    partial: true, results: [{ assetId: 'A1', outcome: 'swapped', reason: 'เอาตัวสำรองใส่แทน', replacedByAssetId: 'SP' }],
  });
  assert.equal(swap.status, 400);
  assert.deepEqual([...db.writes('service_visit_assets'), ...remove.writes('service_visit_assets')], []);
});

/* 🐞 ด่าน "กดรับงานก่อน" เดิมถามแค่โหมดทีละเครื่อง ⇒ ช่างยิง PUT ทั้งชุดบนนัดของอีกสามวัน/นัดที่ยกเลิกแล้วได้ 200
   และ **ทะเบียนเครื่องเปลี่ยนจริง** (เปลี่ยนเครื่อง = ตัวเก่าถูกถอดลงวันที่ในอนาคต · แจ้งชำรุด = สภาพเปลี่ยน + แถวผล)
   ทั้งที่ด่านจับเวลา (C7) กันการส่งงานไว้ · ทางจริง = แท็บเก่าที่แผ่นปิดงานเปิดค้างตอนผู้จัดคิวยกเลิก/เลื่อนนัด */
test('🔴 ช่าง: PUT ทั้งชุดบนนัดของวันหน้า / นัดที่ยกเลิก = 409 · ไม่เขียนผล ไม่แตะทะเบียนเครื่อง · หัวหน้าไม่เปลี่ยน', async () => {
  const future = { status: 'scheduled', scheduledDate: addDays(TODAY, 3), actualDate: null, actualStartTime: null };
  const swap = [{ assetId: 'A1', outcome: 'swapped', reason: 'เอาตัวสำรองใส่แทน', replacedByAssetId: 'SP' }];
  const early = seed({ visit: future });
  const refused = await put(early, tech, { results: swap });
  assert.equal(refused.status, 409, refused.json.error);
  assert.equal(refused.json.error, CREW_NOT_STARTED_ERROR);
  assert.deepEqual(early.writes('service_visit_assets'), []);
  assert.deepEqual(assetWrites(early), []);
  assert.equal(early.tables.service_assets.find((a) => a.id === 'A1').status, 'active');

  const cancelled = seed({ visit: { status: 'cancelled' } });
  const broken = await put(cancelled, mate, {
    results: [{ assetId: 'A1', outcome: 'done', broken: true, reason: 'ฝาครอบแตกด้านข้าง' }],
  });
  assert.equal(broken.status, 409, broken.json.error);
  assert.equal(broken.json.error, CREW_NOT_ON_SCHEDULE_ERROR);
  assert.deepEqual(cancelled.writes('service_visit_assets'), []);
  assert.deepEqual(assetWrites(cancelled), []);
  assert.equal(cancelled.tables.service_assets.find((a) => a.id === 'A1').condition, 'ok');
  assert.equal((cancelled.tables.service_asset_moves || []).length, 0);
  // ทีละเครื่องบนนัดที่ยกเลิก = ด่านเดียวกัน (ช่างไม่ถึงด่าน "กดรับงานก่อน" ของโหมดนี้)
  const partialCancelled = await put(cancelled, tech, { partial: true, results: [{ assetId: 'A1', outcome: 'done' }] });
  assert.equal(partialCancelled.json.error, CREW_NOT_ON_SCHEDULE_ERROR);

  // หัวหน้า/ผู้จัดคิว: ทาง PUT ทั้งชุดเดิม (ไม่มีธง ownWorkOnly)
  for (const head of [senior, planner]) {
    const db = seed({ visit: future });
    const { status, json } = await put(db, head, { results: [{ assetId: 'A1', outcome: 'done' }] });
    assert.equal(status, 200, `${head.role}: ${json.error}`);
    assert.equal(rowsOf(db).get('A1').outcome, 'done');
  }
});

/* 🔴 ทั้งชุด 23505 มา **หลังลบแถวที่แก้ได้ไปแล้ว** และ insert เป็นคำสั่งเดียว ⇒ ล้มทั้งชุด ใบเหลือแถวของอีกคน
   ผลที่เหลืออยู่ที่เดียวคือฟอร์มที่ยังเปิด ⇒ ข้อความต้องบอก "กดบันทึกอีกครั้ง" ไม่ใช่ "โหลดหน้าใหม่" (ทิ้งผลทั้งใบ)
   · กดบันทึกซ้ำด้วยชุดเดิม = อ่านแถวของอีกคนแล้วลบ ใส่ทั้งชุดคืนครบ */
test('🔴 ทั้งชุดชนคนบันทึกพร้อมกัน (23505) — แถวที่ลบไปแล้วหาย · ข้อความบอกกดบันทึกอีกครั้ง · กดซ้ำได้ครบคืน', async () => {
  const seeded = seed({ results: [resultRow('A1'), resultRow('A2'), resultRow('B1', 'unable', { reason: 'ลูกค้าปิดห้องประชุม' })] }).tables;
  let raced = false;
  const results = [
    { assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' },
    { assetId: 'B1', outcome: 'unable', reason: 'ลูกค้าปิดห้องประชุม' },
  ];
  // ผู้ช่วยลงผล A2 ทีละเครื่องแทรกเข้ามา ระหว่าง "ลบแถวเดิม" กับ "ใส่ทั้งชุด" ของอีกแท็บ
  const racing = fakeDb(seeded, {
    hook: (q, api) => {
      if (raced || q.table !== 'service_visit_assets' || q.write !== 'insert') return undefined;
      raced = true;
      api.tables.service_visit_assets.push(resultRow('A2', 'unable', { id: 'SVR-MATE', reason: 'ห้องล็อก รอแม่บ้าน' }));
      return undefined;
    },
  });
  const first = await put(racing, tech, { results });
  assert.equal(first.status, 409);
  assert.match(first.json.error, /มีคนบันทึกเครื่องนี้พร้อมกัน/);
  assert.match(first.json.error, /กดบันทึกอีกครั้ง/);
  assert.doesNotMatch(first.json.error, /โหลดหน้าใหม่/, 'โหลดหน้าใหม่ = ทิ้งฟอร์มซึ่งเป็นที่เดียวที่ผลยังอยู่');
  // สิ่งที่เหลือในฐานหลังล้ม: เฉพาะแถวของผู้ช่วย — ผล A1/B1 ที่ลบไปแล้วอยู่ในฟอร์มที่เดียว
  assert.deepEqual(racing.tables.service_visit_assets.map((r) => r.id), ['SVR-MATE']);

  const retry = await put(racing, tech, { results });
  assert.equal(retry.status, 200, retry.json.error);
  const rows = rowsOf(racing);
  assert.deepEqual([...rows.keys()].sort(), ['A1', 'A2', 'B1']);
  assert.equal(rows.get('A2').outcome, 'done', 'ชุดของคนกดซ้ำทับแถวของผู้ช่วย (ทั้งชุด = คนหลังชนะ)');
  assert.equal(rows.get('B1').reason, 'ลูกค้าปิดห้องประชุม');

  // ทีละเครื่องไม่ได้ลบอะไร ⇒ ยังบอกให้โหลดใหม่ดูผลล่าสุดได้
  const partialClash = fakeDb({ service_visits: [visitRow()], service_assets: [machine('A1', 'Z1')] }, {
    hook: (q) => (q.table === 'service_visit_assets' && q.write === 'upsert'
      ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } } : undefined),
  });
  const partialOut = await put(partialClash, tech, { partial: true, results: [{ assetId: 'A1', outcome: 'done' }] });
  assert.equal(partialOut.status, 409);
  assert.match(partialOut.json.error, /โหลดหน้าใหม่/);
});
