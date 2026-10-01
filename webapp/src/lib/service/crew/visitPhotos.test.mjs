// ── รูปหน้างานทีละรูป: `POST|DELETE visits/[id]/photos` (แผน operation-crew C5 · R14 · S3) ──────────────
//
// 🐞 ที่มา: ทางเดียวที่เขียนรูปคือ PATCH ของนัดที่ส่ง `attachments` ทั้งชุด ⇒ ช่างกับผู้ช่วยถ่ายรูปจากสองเครื่อง
//    คนที่บันทึกทีหลังทับรูปของอีกคนหายเงียบ · เส้นใหม่แก้ทีละรูปบนชุดล่าสุด + ด่าน `updatedAt` (ลองใหม่ 1 รอบ)
// ⚠️ เรียก handler ตัวจริงผ่าน supabase ปลอมที่จำแถว (`routeTestKit.mjs`) — ไม่มี client จริงในเทสต์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, callRoute, tech, mate, planner, senior } from './routeTestKit.mjs';
import { businessDate } from '../../businessDate.js';
import { visitFileKey } from '../visitFiles.js';
import { CREW_CLOSED_EDIT_ERROR, CREW_NOT_ON_SCHEDULE_ERROR, CREW_NOT_STARTED_ERROR } from '../visitAccess.js';
import { addDays } from '../../datePeriods.js';
import {
  PHOTO_CLOSED_ERROR, PHOTO_NOT_OPEN_ERROR, PHOTO_RACE_ERROR, addVisitPhoto, photoEditError, removeVisitPhoto,
} from './visitPhotos.js';

const { POST, DELETE } = await import('../../../app/api/service/visits/[id]/photos/route.js');

const TODAY = businessDate();
const drive = (id) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;
const P1 = { url: drive('1PhotoBeforeAAAAAAA'), name: 'ก่อนทำ.jpg', kind: 'before' };
const P2 = { url: drive('1PhotoAfterBBBBBBBB'), name: 'หลังทำ.jpg', kind: 'after' };
const P3 = { url: drive('1PhotoMateCCCCCCCCC'), name: 'ผู้ช่วย.jpg', kind: 'after' };
const visitRow = (o = {}) => ({
  id: 'V1', code: 'SV-26090001', siteId: 'S1', kind: 'refill', status: 'in_progress',
  scheduledDate: TODAY, actualDate: TODAY, assigneeId: 'U-TECH', assistantIds: ['U-MATE'],
  attachments: [P1], customerSignatureUrl: null, updatedAt: '2026-09-28T01:00:00.000Z', ...o,
});
const seed = (visit = {}, opts) => fakeDb({ service_visits: [visitRow(visit)] }, opts);
const post = (db, user, body) => callRoute(POST, {
  user, db, method: 'POST', path: '/api/service/visits/V1/photos', params: { id: 'V1' }, body,
});
const del = (db, user, key) => callRoute(DELETE, {
  user, db, method: 'DELETE', path: `/api/service/visits/V1/photos?h=${encodeURIComponent(key ?? '')}`, params: { id: 'V1' },
});
const visitWrites = (db) => db.writes('service_visits');
const urls = (list) => (list || []).map((a) => a.url);

/* ═══ ตรรกะล้วน ═══ */
test('ชุดรูป: เพิ่มต่อท้าย · URL ซ้ำไม่เพิ่ม (กดส่งซ้ำหลังคำตอบหาย) · ลบตามกุญแจ · ไม่มีรูปนั้น = ไม่เปลี่ยน', () => {
  assert.deepEqual(addVisitPhoto([P1], P2), { list: [P1, P2], changed: true });
  assert.deepEqual(addVisitPhoto([P1], { ...P1, name: 'ชื่อใหม่' }), { list: [P1], changed: false });
  assert.deepEqual(addVisitPhoto(null, P1), { list: [P1], changed: true });
  const removed = removeVisitPhoto([P1, P2], visitFileKey(P1.url));
  assert.deepEqual(removed.list, [P2]);
  assert.equal(removed.changed, true);
  assert.deepEqual(removeVisitPhoto([P2], visitFileKey(P1.url)), { list: [P2], changed: false, removed: [] });
});

test('แนบรูปได้เฉพาะงานที่ยังเปิด (นัดแล้ว · กำลังทำ) — ส่งงานแล้ว/ร่าง/ยกเลิก/เลื่อน ไม่ได้', () => {
  for (const status of ['scheduled', 'in_progress']) assert.equal(photoEditError({ status }), null, status);
  for (const status of ['done', 'partial', 'unable']) assert.equal(photoEditError({ status }), PHOTO_CLOSED_ERROR, status);
  for (const status of ['draft', 'cancelled', 'rescheduled']) assert.equal(photoEditError({ status }), PHOTO_NOT_OPEN_ERROR, status);
});

/* ═══ ต่อสายถึง handler จริง ═══ */
test('⭐ เพิ่มรูป = เขียนเฉพาะคอลัมน์รูป + updatedAt ภายใต้ด่าน updatedAt · คืนชุดล่าสุด', async () => {
  const db = seed();
  const { status, json } = await post(db, tech, P2);
  assert.equal(status, 200, json.error);
  assert.deepEqual(urls(json.attachments), [P1.url, P2.url]);
  const [write] = visitWrites(db);
  assert.deepEqual(Object.keys(write.payload).sort(), ['attachments', 'updatedAt']);
  assert.deepEqual(write.filters, [['eq', 'id', 'V1'], ['eq', 'updatedAt', '2026-09-28T01:00:00.000Z']]);
  assert.notEqual(json.updatedAt, '2026-09-28T01:00:00.000Z');
  assert.equal(db.writes('audit_logs').length, 1);
});

test('🔴 ด่าน updatedAt: มีคนเขียนแทรก = อ่านใหม่แล้วเพิ่มบนชุดล่าสุด (รูปของผู้ช่วยไม่หาย) · แทรกสองรอบ = 409', async () => {
  // ผู้ช่วยแนบ P3 ระหว่างที่คำขอของช่างอ่านแถวไปแล้ว — จำลองด้วยการเขียนแทรกก่อน update ครั้งแรก
  let raced = 0;
  const racer = (times) => (q, db) => {
    if (q.table === 'service_visits' && q.write === 'update' && raced < times) {
      raced += 1;
      const row = db.tables.service_visits[0];
      row.attachments = [...row.attachments, { ...P3, url: `${P3.url}&n=${raced}` }];
      row.updatedAt = `2026-09-28T01:0${raced}:00.000Z`;
    }
    return undefined;
  };
  const once = seed({}, { hook: racer(1) });
  const ok = await post(once, tech, P2);
  assert.equal(ok.status, 200, ok.json.error);
  assert.deepEqual(urls(ok.json.attachments), [P1.url, `${P3.url}&n=1`, P2.url], 'รูปที่แทรกเข้ามาต้องอยู่ครบ');
  assert.equal(visitWrites(once).length, 2, 'ลองใหม่ 1 รอบ');
  assert.equal(visitWrites(once)[1].filters.at(-1)[2], '2026-09-28T01:01:00.000Z', 'รอบสองใช้ updatedAt ของแถวที่อ่านใหม่');

  raced = 0;
  const twice = seed({}, { hook: racer(2) });
  const busy = await post(twice, tech, P2);
  assert.equal(busy.status, 409);
  assert.equal(busy.json.error, PHOTO_RACE_ERROR);
  assert.equal(twice.tables.service_visits[0].attachments.some((a) => a.url === P2.url), false, 'ไม่เขียนทับ');
});

test('ส่งรูปเดิมซ้ำ = 200 ชุดเดิม ไม่เขียน ไม่ลง audit · รูปไม่มี URL / URL ยาวเกิน = 400', async () => {
  const db = seed();
  const again = await post(db, tech, P1);
  assert.equal(again.status, 200, again.json.error);
  assert.deepEqual(urls(again.json.attachments), [P1.url]);
  assert.deepEqual(visitWrites(db), []);
  assert.equal(db.writes('audit_logs').length, 0);
  const empty = await post(db, tech, { url: '  ', kind: 'before' });
  assert.equal(empty.status, 400);
  const long = await post(db, tech, { url: `https://drive.google.com/${'x'.repeat(1000)}`, kind: 'before' });
  assert.equal(long.status, 400);
  assert.match(long.json.error, /ยาวเกินไป/);
});

test('ลบรูปตามกุญแจ `?h=` · ลบซ้ำ = 200 ไม่เปลี่ยน · กุญแจเสีย = 400 · ผู้ช่วยลบได้', async () => {
  const db = seed({ attachments: [P1, P2] });
  const gone = await del(db, mate, visitFileKey(P1.url));
  assert.equal(gone.status, 200, gone.json.error);
  assert.deepEqual(urls(gone.json.attachments), [P2.url]);
  const again = await del(db, mate, visitFileKey(P1.url));
  assert.equal(again.status, 200);
  assert.deepEqual(urls(again.json.attachments), [P2.url]);
  assert.equal(visitWrites(db).length, 1);
  for (const bad of ['', '0', 'ABC', '../1']) {
    const res = await del(db, mate, bad);
    if (bad === '0') { assert.equal(res.status, 200, 'รูปร่างถูกแต่ไม่มีรูปนั้น = ไม่เปลี่ยน'); continue; }
    assert.equal(res.status, 400, bad);
  }
});

test('🔴 ส่งงานแล้ว = 409 ทุกตำแหน่ง (หัวหน้าแก้รูปที่ "แก้ผลที่ส่ง") · ช่างโดนด่านส่งงานแล้วของ requireVisit ก่อน', async () => {
  for (const status of ['done', 'partial', 'unable']) {
    for (const user of [planner, senior]) {
      const db = seed({ status });
      const add = await post(db, user, P2);
      assert.equal(add.status, 409, `${user.role}/${status}`);
      assert.equal(add.json.error, PHOTO_CLOSED_ERROR);
      const drop = await del(db, user, visitFileKey(P1.url));
      assert.equal(drop.status, 409);
      assert.deepEqual(visitWrites(db), []);
    }
    const crew = seed({ status });
    const refused = await post(crew, tech, P2);
    assert.equal(refused.status, 409);
    assert.equal(refused.json.error, CREW_CLOSED_EDIT_ERROR);
  }
  // ยกเลิก/ร่าง = ไม่ได้อยู่บนตาราง
  const cancelled = seed({ status: 'cancelled' });
  const res = await post(cancelled, planner, P2);
  assert.equal(res.status, 409);
  assert.equal(res.json.error, PHOTO_NOT_OPEN_ERROR);
});

test('🔴 ช่างแนบ/ลบรูปได้เฉพาะงานที่กำลังทำ — นัดของวันหน้า / นัดที่ยกเลิก = 409 ไม่เขียน · หัวหน้าไม่เปลี่ยน', async () => {
  const future = { status: 'scheduled', scheduledDate: addDays(TODAY, 3), actualDate: null };
  for (const [visit, message] of [[future, CREW_NOT_STARTED_ERROR], [{ status: 'cancelled' }, CREW_NOT_ON_SCHEDULE_ERROR]]) {
    const db = seed(visit);
    for (const user of [tech, mate]) {
      const add = await post(db, user, P2);
      assert.equal(add.status, 409, `${user.id}/${visit.status}`);
      assert.equal(add.json.error, message);
      const drop = await del(db, user, visitFileKey(P1.url));
      assert.equal(drop.status, 409);
      assert.equal(drop.json.error, message);
    }
    assert.deepEqual(visitWrites(db), []);
    assert.deepEqual(urls(db.tables.service_visits[0].attachments), [P1.url]);
  }
  // หัวหน้า: ด่านเดิมของเส้นรูป (`photoEditError`) — นัดที่ยังไม่เริ่มแนบได้ · ยกเลิกไม่ได้ (เทสต์ข้างบน)
  for (const head of [senior, planner]) {
    const db = seed(future);
    const add = await post(db, head, P2);
    assert.equal(add.status, 200, `${head.role}: ${add.json.error}`);
    assert.deepEqual(urls(add.json.attachments), [P1.url, P2.url]);
  }
});

test('ใบของคนอื่น = 403 เดิม (ด่านรายใบของ requireVisit)', async () => {
  const db = seed({ assigneeId: 'U-OTHER', assistantIds: [] });
  const { status } = await post(db, tech, P2);
  assert.equal(status, 403);
  assert.deepEqual(visitWrites(db), []);
});
