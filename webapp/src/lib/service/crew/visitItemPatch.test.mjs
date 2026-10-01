// ── แก้ของที่ใช้รายบรรทัด: `PATCH visits/[id]/items/[itemId]` (แผน operation-crew R9 · S3) ──────────────
//
// ⭐ หน้างานของช่างแก้บรรทัดจากฟอร์มตัวเดียวกับตอนเพิ่ม ⇒ server ต้องตรวจด้วยกติกาเดียวกับ POST (`normalizeVisitItem`)
//    · ด่านเดียวกับ POST (`requireVisit({ edit: true })`) · ผูก `visitId` เหมือน DELETE
// 🔴 มติ 28/09 Q3: ช่างแก้/ลบของที่ใช้บนใบที่ส่งงานแล้วไม่ได้ (409 จาก requireVisit) · หัวหน้า (ts_senior) ได้
// ⚠️ เรียก handler ตัวจริงผ่าน supabase ปลอมที่จำแถว (`routeTestKit.mjs`) — ไม่มี client จริงในเทสต์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeDb, callRoute, tech, mate, senior, planner } from './routeTestKit.mjs';
import { businessDate } from '../../businessDate.js';
import { CREW_CLOSED_EDIT_ERROR, CREW_NOT_ON_SCHEDULE_ERROR, CREW_NOT_STARTED_ERROR } from '../visitAccess.js';
import { addDays } from '../../datePeriods.js';
import { normalizeVisitItem } from '../visitItems.js';

const { PATCH, DELETE } = await import('../../../app/api/service/visits/[id]/items/[itemId]/route.js');
const { POST } = await import('../../../app/api/service/visits/[id]/items/route.js');

const TODAY = businessDate();
const visitRow = (o = {}) => ({
  id: 'V1', code: 'SV-26090001', siteId: 'S1', kind: 'refill', status: 'in_progress',
  scheduledDate: TODAY, actualDate: TODAY, assigneeId: 'U-TECH', assistantIds: ['U-MATE'], ...o,
});
const item = (o = {}) => ({
  id: 'SVI-1', visitId: 'V1', assetId: 'A1', productId: 'P-OUD', label: 'น้ำหอม Oud', qty: 2, unit: 'ขวด', note: null, ...o,
});
const seed = (visit = {}, items = [item()]) => fakeDb({
  service_visits: [visitRow(visit), visitRow({ id: 'V2', code: 'SV-26090002' })],
  service_visit_items: items,
});
const patch = (db, user, body, { visitId = 'V1', itemId = 'SVI-1' } = {}) => callRoute(PATCH, {
  user, db, method: 'PATCH', path: `/api/service/visits/${visitId}/items/${itemId}`, params: { id: visitId, itemId }, body,
});
const remove = (db, user, { visitId = 'V1', itemId = 'SVI-1' } = {}) => callRoute(DELETE, {
  user, db, method: 'DELETE', path: `/api/service/visits/${visitId}/items/${itemId}`, params: { id: visitId, itemId },
});
const post = (db, user, body) => callRoute(POST, {
  user, db, method: 'POST', path: '/api/service/visits/V1/items', params: { id: 'V1' }, body,
});
const itemWrites = (db) => db.writes('service_visit_items');

test('⭐ แก้บรรทัด: ช่องที่ส่งมาเปลี่ยน · ช่องที่ไม่ส่งคงค่าเดิม · ผูก visitId · ลง audit', async () => {
  const db = seed();
  const { status, json } = await patch(db, mate, { qty: '3.5', note: 'เติมเพิ่มหน้าลิฟต์' });
  assert.equal(status, 200, json.error);
  assert.equal(json.qty, 3.5);
  assert.equal(json.label, 'น้ำหอม Oud');
  assert.equal(json.unit, 'ขวด');
  assert.equal(json.note, 'เติมเพิ่มหน้าลิฟต์');
  const [write] = itemWrites(db);
  assert.equal(write.write, 'update');
  assert.deepEqual(write.filters, [['eq', 'id', 'SVI-1'], ['eq', 'visitId', 'V1']]);
  assert.deepEqual(Object.keys(write.payload).sort(), ['assetId', 'label', 'note', 'productId', 'qty', 'unit']);
  const audit = db.tables.audit_logs.at(-1);
  assert.equal(audit.action, 'update');
  assert.equal(audit.before.qty, 2);
});

test('🔴 ตรวจด้วยกติกาเดียวกับ POST — ข้อความเดียวกันทั้งสองทาง และไม่เขียนอะไร', async () => {
  const cases = [
    [{ label: '   ' }, 'ต้องระบุชื่อของที่ใช้'],
    [{ label: 'ก'.repeat(201) }, 'ชื่อของที่ใช้ยาวเกิน 200 ตัวอักษร'],
    [{ qty: 0 }, 'จำนวนต้องเป็นตัวเลขมากกว่า 0'],
    [{ qty: 'สองขวด' }, 'จำนวนต้องเป็นตัวเลขมากกว่า 0'],
    [{ unit: 'x'.repeat(31) }, 'หน่วยยาวเกิน 30 ตัวอักษร'],
    [{ note: 'x'.repeat(501) }, 'หมายเหตุยาวเกิน 500 ตัวอักษร'],
  ];
  for (const [body, error] of cases) {
    const db = seed();
    const edited = await patch(db, tech, body);
    assert.equal(edited.status, 400, JSON.stringify(body));
    assert.equal(edited.json.error, error);
    assert.equal(normalizeVisitItem({ ...item(), ...body }).error, error);
    const created = await post(db, tech, { ...item(), id: undefined, ...body });
    assert.equal(created.status, 400, `POST ${JSON.stringify(body)}`);
    assert.equal(created.json.error, error);
    assert.deepEqual(itemWrites(db), []);
  }
  // จำนวนว่าง = ยังไม่ได้ชั่ง (null) ไม่ใช่ 0 — ทั้งสองทาง
  const db = seed();
  assert.equal((await patch(db, tech, { qty: '' })).json.qty, null);
  assert.equal((await post(db, tech, { label: 'ผ้าเช็ด', qty: '' })).json.qty, null);
});

test('🔴 ผูก visitId — บรรทัดของนัดอื่นแก้/ลบผ่านนัดนี้ไม่ได้ (404) และไม่เขียนอะไร', async () => {
  const db = seed({}, [item(), item({ id: 'SVI-9', visitId: 'V2', label: 'ของนัดอื่น' })]);
  const edited = await patch(db, tech, { qty: 9 }, { itemId: 'SVI-9' });
  assert.equal(edited.status, 404);
  const dropped = await remove(db, tech, { itemId: 'SVI-9' });
  assert.equal(dropped.status, 404);
  assert.deepEqual(itemWrites(db), []);
  assert.equal(db.tables.service_visit_items.find((r) => r.id === 'SVI-9').qty, 2);
});

test('ด่านเดียวกับ POST: ใบของคนอื่น = 403 · ไม่ล็อกอิน = ตีกลับ', async () => {
  const db = seed({ assigneeId: 'U-OTHER', assistantIds: [] });
  assert.equal((await patch(db, tech, { qty: 3 })).status, 403);
  assert.equal((await post(db, tech, { label: 'ผ้าเช็ด' })).status, 403);
  const anon = await patch(db, null, { qty: 3 });
  assert.ok(anon.status >= 400);
  assert.deepEqual(itemWrites(db), []);
});

test('🔴 มติ 28/09 Q3: ช่างแก้/ลบของที่ใช้บนใบที่ส่งงานแล้ว = 409 · หัวหน้า (ts_senior) / ผู้จัดคิว ทำได้', async () => {
  for (const status of ['done', 'partial', 'unable']) {
    const db = seed({ status });
    for (const user of [tech, mate]) {
      const edited = await patch(db, user, { qty: 3 });
      assert.equal(edited.status, 409, `${user.id}/${status}`);
      assert.equal(edited.json.error, CREW_CLOSED_EDIT_ERROR);
      const dropped = await remove(db, user);
      assert.equal(dropped.status, 409);
      assert.equal(dropped.json.error, CREW_CLOSED_EDIT_ERROR);
      assert.equal((await post(db, user, { label: 'ผ้าเช็ด' })).status, 409);
    }
    assert.deepEqual(itemWrites(db), []);

    for (const head of [senior, planner]) {
      const ok = seed({ status });
      const edited = await patch(ok, head, { qty: 3 });
      assert.equal(edited.status, 200, `${head.role}: ${edited.json.error}`);
      assert.equal(edited.json.qty, 3);
      const dropped = await remove(ok, head);
      assert.equal(dropped.status, 200, head.role);
      assert.equal(ok.tables.service_visit_items.length, 0);
    }
  }
  // นัดประเมินที่ปิดแล้วไม่อยู่ใต้ด่านนี้ (แก้ผลวัดเดินเส้นของใบประเมิน)
  const survey = seed({ kind: 'survey', status: 'done', requestId: 'RQ1' });
  assert.equal((await patch(survey, tech, { qty: 3 })).status, 200);
});

test('🔴 ช่างเพิ่ม/แก้/ลบของที่ใช้บนนัดของวันหน้า / นัดที่ยกเลิก = 409 ไม่เขียนอะไร · หัวหน้าไม่เปลี่ยน', async () => {
  const cases = [
    [{ status: 'scheduled', scheduledDate: addDays(TODAY, 3), actualDate: null }, CREW_NOT_STARTED_ERROR],
    [{ status: 'cancelled' }, CREW_NOT_ON_SCHEDULE_ERROR],
  ];
  for (const [visit, message] of cases) {
    const db = seed(visit);
    for (const user of [tech, mate]) {
      for (const out of [await post(db, user, { label: 'ผ้าเช็ด' }), await patch(db, user, { qty: 3 }), await remove(db, user)]) {
        assert.equal(out.status, 409, `${user.id}/${visit.status}`);
        assert.equal(out.json.error, message);
      }
    }
    assert.deepEqual(itemWrites(db), []);
    assert.equal(db.tables.service_visit_items[0].qty, 2);

    for (const head of [senior, planner]) {
      const ok = seed(visit);
      assert.equal((await post(ok, head, { label: 'ผ้าเช็ด' })).status, 201, head.role);
      assert.equal((await patch(ok, head, { qty: 3 })).status, 200, head.role);
      assert.equal((await remove(ok, head)).status, 200, head.role);
    }
  }
});

test('ซอร์ส: POST กับ PATCH เรียกตัวตรวจตัวเดียวกัน — route ไม่มีกติกาช่องของตัวเองเหลือ', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const create = read('../../../app/api/service/visits/[id]/items/route.js');
  const edit = read('../../../app/api/service/visits/[id]/items/[itemId]/route.js');
  for (const [name, src] of [['POST', create], ['PATCH', edit]]) {
    assert.match(src, /import \{ normalizeVisitItem \} from '@\/lib\/service\/visitItems';/, name);
    assert.match(src, /normalizeVisitItem\(/, name);
    assert.doesNotMatch(src, /ยาวเกิน 200 ตัวอักษร|จำนวนต้องเป็นตัวเลข/, `${name}: กติกาช่องต้องอยู่ที่ visitItems.js ที่เดียว`);
    assert.match(src, /requireVisit\(\{ user, supabase, id, edit: true, running: true \}\)/, name);
  }
  assert.match(edit, /\.update\(value\)\.eq\('id', itemId\)\.eq\('visitId', id\)/);
});
