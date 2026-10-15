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
/* ทะเบียนใบรับการอัปโหลด (`upload_receipts`) — ด่านที่มาของรูปถามใบรับของ **คนเรียก** สำหรับรูปที่นัดยังไม่ได้เก็บ
   `owned(user)` = P2 เป็นไฟล์ที่คนนั้นอัปเองเมื่อชั่วโมงก่อน (ทางปกติของจอ) · `seed(…, …, receipts)` = ตั้งใบรับเอง */
// สวิตช์ผ่อนด่านใบรับต้องไม่ติดมาจากเครื่องที่รันเทสต์ — ชุดนี้ตรวจโหมดบังคับ
delete process.env.UPLOAD_RECEIPT_MODE;
const HOUR_MS = 60 * 60 * 1000;
const idOf = (photo) => photo.url.split('/d/')[1].split('/')[0];
const receipt = (photo, owner, o = {}) => ({
  driveFileId: idOf(photo), userId: owner.id, entityType: 'service_visit', entityId: 'V1',
  createdAt: new Date(Date.now() - HOUR_MS).toISOString(), claimedBy: null, claimedAt: null, ...o,
});
const seed = (visit = {}, opts, receipts = []) => fakeDb({ service_visits: [visitRow(visit)], upload_receipts: receipts }, opts);
const owned = (user, visit = {}, opts) => seed(visit, opts, [receipt(P2, user)]);
const post = (db, user, body) => callRoute(POST, {
  user, db, method: 'POST', path: '/api/service/visits/V1/photos', params: { id: 'V1' }, body,
});
const del = (db, user, key) => callRoute(DELETE, {
  user, db, method: 'DELETE', path: `/api/service/visits/V1/photos?h=${encodeURIComponent(key ?? '')}`, params: { id: 'V1' },
});
const visitWrites = (db) => db.writes('service_visits');
const receiptReads = (db) => db.calls.filter((c) => c.table === 'upload_receipts' && !c.write);
const receiptOf = (db, photo) => db.tables.upload_receipts.find((r) => r.driveFileId === idOf(photo));
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
  const db = owned(tech);
  const { status, json } = await post(db, tech, P2);
  assert.equal(status, 200, json.error);
  assert.deepEqual(urls(json.attachments), [P1.url, P2.url]);
  const [write] = visitWrites(db);
  assert.deepEqual(Object.keys(write.payload).sort(), ['attachments', 'updatedAt']);
  assert.deepEqual(write.filters, [['eq', 'id', 'V1'], ['eq', 'updatedAt', '2026-09-28T01:00:00.000Z']]);
  assert.notEqual(json.updatedAt, '2026-09-28T01:00:00.000Z');
  assert.equal(db.writes('audit_logs').length, 1);
  assert.equal(receiptOf(db, P2).claimedBy, 'service_visits:V1', 'ใบรับของรูปที่ลงแถวแล้วถูกประทับด้วยนัดนี้');
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
  const once = owned(tech, {}, { hook: racer(1) });
  const ok = await post(once, tech, P2);
  assert.equal(ok.status, 200, ok.json.error);
  assert.deepEqual(urls(ok.json.attachments), [P1.url, `${P3.url}&n=1`, P2.url], 'รูปที่แทรกเข้ามาต้องอยู่ครบ');
  assert.equal(visitWrites(once).length, 2, 'ลองใหม่ 1 รอบ');
  assert.equal(visitWrites(once)[1].filters.at(-1)[2], '2026-09-28T01:01:00.000Z', 'รอบสองใช้ updatedAt ของแถวที่อ่านใหม่');

  raced = 0;
  const twice = owned(tech, {}, { hook: racer(2) });
  const busy = await post(twice, tech, P2);
  assert.equal(busy.status, 409);
  assert.equal(busy.json.error, PHOTO_RACE_ERROR);
  assert.equal(twice.tables.service_visits[0].attachments.some((a) => a.url === P2.url), false, 'ไม่เขียนทับ');
  assert.equal(receiptOf(twice, P2).claimedBy, null, 'รูปไม่ได้ลงแถว = ใบรับยังไม่ถูกประทับ (กดใหม่ได้)');
});

test('ส่งรูปเดิมซ้ำ = 200 ชุดเดิม ไม่เขียน ไม่ลง audit · รูปไม่มี URL / URL ยาวเกิน = 400', async () => {
  const db = seed();
  const again = await post(db, tech, P1);
  assert.equal(again.status, 200, again.json.error);
  assert.deepEqual(urls(again.json.attachments), [P1.url]);
  assert.deepEqual(visitWrites(db), []);
  assert.equal(db.writes('audit_logs').length, 0);
  assert.deepEqual(receiptReads(db), [], 'รูปที่นัดเก็บอยู่แล้วไม่ถามทะเบียนใบรับ');
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
    const db = owned(head, future);
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

/* ═══ ด่านที่มาของรูป (รอบสองของมติเจ้าของ 08/10/2569 · docs/upload-receipts.md) ═══
   🐞 เดิมเส้นนี้เก็บ URL อะไรก็ได้ แล้ว `visits/[id]/file` สตรีมไฟล์ตาม id ในสตริงนั้น — ทุกเคส "ต้องไม่ผ่าน" เคยได้ 200 */
const RECEIPT_ERROR = 'ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณในช่วง 24 ชั่วโมงที่ผ่านมา — อัปโหลดไฟล์ใหม่แล้วแนบอีกครั้ง';
const SHAPE_ERROR = 'ไฟล์แนบต้องเป็นไฟล์ที่อัปโหลดผ่านระบบ — ลบไฟล์ออกแล้วแนบใหม่อีกครั้ง';
const IN_USE_ERROR = 'ไฟล์นี้ถูกใช้กับรายการอื่นไปแล้ว — ลบไฟล์ออกแล้วแนบใหม่อีกครั้ง';
const turnedAway = async (db, body, { status = 400, error, code = 'file_ref' }) => {
  const res = await post(db, tech, body);
  assert.equal(res.status, status, JSON.stringify(res.json));
  assert.equal(res.json.error, error);
  assert.equal(res.json.code ?? null, code);
  assert.deepEqual(db.calls.filter((c) => c.write), [], 'ต้องไม่เขียนอะไรเลย (แถวนัด · ใบรับ · audit)');
  assert.deepEqual(urls(db.tables.service_visits[0].attachments), [P1.url]);
};

test('🔴 รูปที่ไม่มีใบรับ · ใบรับของคนอื่น · ใบรับหมดอายุ = 400 พร้อม code · ไม่เขียนอะไรเลย', async () => {
  await turnedAway(seed(), P2, { error: RECEIPT_ERROR });
  await turnedAway(owned(mate), P2, { error: RECEIPT_ERROR });
  const stale = new Date(Date.now() - 25 * HOUR_MS).toISOString();
  await turnedAway(seed({}, undefined, [receipt(P2, tech, { createdAt: stale })]), P2, { error: RECEIPT_ERROR });
});

test('🔴 ใบรับที่ระเบียนอื่นใช้ไปแล้ว = 400 · ใบรับที่นัดนี้ประทับไว้เอง (ถอดรูปแล้วแนบกลับ) = ผ่าน', async () => {
  for (const claimedBy of ['service_visits:V2', 'attachments:ATT-1']) {
    await turnedAway(seed({}, undefined, [receipt(P2, tech, { claimedBy })]), P2, { error: IN_USE_ERROR });
  }
  const stale = new Date(Date.now() - 72 * HOUR_MS).toISOString();
  const db = seed({}, undefined, [receipt(P2, mate, { claimedBy: 'service_visits:V1', createdAt: stale })]);
  const back = await post(db, tech, P2);
  assert.equal(back.status, 200, back.json.error);
  assert.deepEqual(urls(back.json.attachments), [P1.url, P2.url]);
  assert.deepEqual(db.writes('upload_receipts'), [], 'ไม่ประทับซ้ำ');
});

test('🔴 ลิงก์ที่ไม่ใช่ไฟล์ Drive ใบเดียว = 400 โดยไม่ถามทะเบียนใบรับ · อ่านทะเบียนไม่ได้ = 503 ไม่ติด code', async () => {
  for (const url of [
    'https://drive.example/photo-9',
    'https://evil.example/file/d/1VictimFileEEEEEEEE/view',
    `https://drive.google.com/open?id=1VictimFileEEEEEEEE&x=/d/${idOf(P2)}`,
    '/api/service/visits/V2/file?h=abc',
  ]) {
    const db = owned(tech);
    await turnedAway(db, { url, name: 'สัญญา.pdf', kind: 'other' }, { error: SHAPE_ERROR });
    assert.deepEqual(receiptReads(db), [], url);
  }
  const down = owned(tech, {}, {
    hook: (q) => (q.table === 'upload_receipts' ? { data: null, error: { message: 'connection reset' } } : undefined),
  });
  await turnedAway(down, P2, { status: 503, code: null, error: 'ตรวจที่มาของไฟล์ไม่ได้ในขณะนี้ — ลองแนบอีกครั้ง' });
});

test('งานที่แนบรูปไม่ได้แล้วตอบ 409 เดิมก่อนถามทะเบียนใบรับ', async () => {
  const db = seed({ status: 'done' });
  const res = await post(db, planner, P2);
  assert.equal(res.status, 409);
  assert.equal(res.json.error, PHOTO_CLOSED_ERROR);
  assert.deepEqual(receiptReads(db), []);
});
