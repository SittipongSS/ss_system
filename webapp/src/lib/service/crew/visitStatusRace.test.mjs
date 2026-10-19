// ── นัดถูกเปลี่ยนสถานะระหว่างคำขอ: ห้ามเขียนทับ (รีวิว S2b ข้อ V17 · 19/10) ──────────────────────────
//
// 🐞 PATCH ของนัดอ่านแถวไว้ตอนต้นคำขอ (`before`) แล้วเขียนกลับด้วย `.eq('id')` อย่างเดียว ⇒ ช่างกด "เริ่มงาน"
//    ในจังหวะเดียวกับที่หัวหน้า/ผู้จัดคิวยกเลิกนัด (เช่น เปลี่ยนทุกพื้นที่เป็นประเมินจากแบบ ซึ่งยกเลิกนัดให้เอง)
//    = นัดที่เพิ่งยกเลิกกลับมาเป็น "กำลังทำ" · ฟอร์มแก้นัดที่เปิดค้างก็เขียนสถานะเก่ากลับได้แบบเดียวกัน
// ⭐ ยามสองชั้น: ① ระหว่างคำขอ — เขียนเฉพาะเมื่อสถานะในฐานยังเท่ากับตอนอ่าน (`.eq('status', before.status)`) ไม่โดนแถว =
//    อ่านใหม่แล้วตัดสินซ้ำ (ผู้ช่วยกดเริ่มพร้อมหัวงาน = 200 no-op) · ② ฟอร์มที่เปิดค้าง — `expectedStatus` ไม่ตรงฐาน = 409 ก่อนด่านอื่น
// ⚠️ เรียก handler ตัวจริงผ่าน supabase ปลอมที่จำแถว (`routeTestKit.mjs`) — ไม่มี client จริงในเทสต์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, callRoute, tech, planner } from './routeTestKit.mjs';
import { businessDate } from '../../businessDate.js';
import { DEAD_START_ERRORS, FUTURE_STAMP_ERROR, VISIT_EDITED_MEANWHILE_ERROR, visitStatusChangedError } from './jobStart.js';

const { PATCH, DELETE } = await import('../../../app/api/service/visits/[id]/route.js');

const TODAY = businessDate();
const visitRow = (o = {}) => ({
  id: 'V1', code: 'SV-26100001', siteId: 'S1', kind: 'refill', status: 'scheduled',
  scheduledDate: TODAY, startTime: '09:00', endTime: null, actualDate: null, actualStartTime: null, actualEndTime: null,
  assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', assistantIds: [], note: null, attachments: [], planId: null,
  // แถวจริงมาจาก select('*') ⇒ มีทุกคอลัมน์ · ช่องที่แถวไม่มีถูกเขียนตามเดิม (`changedVisitColumns`)
  summary: null, unableReason: null, customerSignatureUrl: null, actualTimeEdited: false,
  ...o,
});

/* `race` = แถวที่ "อีกคน" เขียนลงฐานก่อนคำสั่งเขียนของคำขอนี้จะถึง — จำลองการกดพร้อมกัน
   (สถานะเป็นข้อความ = เปลี่ยนแค่สถานะ · object = เขียนหลายช่อง · `'deleted'` = แถวหาย) */
function seed({ visit = {}, race = null } = {}) {
  let raced = false;
  return fakeDb({
    service_visits: [visitRow(visit)],
    service_sites: [{ id: 'S1', code: 'SS-0001', name: 'ไซต์ทดสอบ', customerId: null, accessDays: [], accessFrom: null, accessTo: null }],
  }, {
    hook: (q, db) => {
      if (race && !raced && q.table === 'service_visits' && q.write === 'update') {
        raced = true;
        if (race === 'deleted') db.tables.service_visits = [];
        else Object.assign(db.tables.service_visits[0], typeof race === 'string' ? { status: race } : race, { updatedAt: '2026-10-19T03:00:00.000Z' });
      }
      return undefined;
    },
  });
}

const patch = (db, user, body) => callRoute(PATCH, {
  user, db, method: 'PATCH', path: '/api/service/visits/V1', params: { id: 'V1' }, body,
});
const row = (db) => db.tables.service_visits[0];
const visitWrites = (db) => db.writes('service_visits');

test('🔴 ช่างกด "เริ่มงาน" ขณะที่นัดเพิ่งถูกยกเลิก = 409 ข้อความของนัดที่ยกเลิก · นัดยังเป็น "ยกเลิก" · ไม่มีเวลาเริ่ม', async () => {
  const db = seed({ race: 'cancelled' });
  const { status, json } = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 409, json.error);
  assert.equal(json.error, DEAD_START_ERRORS.cancelled);
  assert.equal(row(db).status, 'cancelled');
  assert.equal(row(db).actualStartTime, null);
  assert.equal(row(db).actualDate, null);
  assert.equal(visitWrites(db).length, 1, 'คำสั่งเขียนเดียวคือตัวที่ไม่โดนแถวไหน');
  // ไม่มีอะไรเขียนต่อจากนั้น — ไม่มีบรรทัดเธรด "เริ่มงาน" ไม่มี audit ของการเปลี่ยนที่ไม่ได้เกิด
  assert.deepEqual(db.calls.filter((c) => c.write && c.table !== 'service_visits').map((c) => c.table), []);
});

test('🔴 ยามระหว่างคำขอครอบทุก PATCH ไม่ใช่แค่ปุ่มเริ่มงาน — ผู้จัดคิวแก้หมายเหตุพอดีกับที่นัดถูกยกเลิก = 409 บอกสถานะจริง', async () => {
  const db = seed({ race: 'cancelled' });
  const { status, json } = await patch(db, planner, { note: 'โทรก่อนเข้า' });
  assert.equal(status, 409, json.error);
  assert.equal(json.error, visitStatusChangedError('cancelled'));
  assert.match(json.error, /“ยกเลิก”/);
  assert.equal(row(db).status, 'cancelled');
  assert.equal(row(db).note, null);
});

test('⭐ หัวงานกับผู้ช่วยกด "เริ่มงาน" พร้อมกัน — คนช้ากว่าได้ 200 แถวของคนแรก (แผน C7) · ไม่ประทับเวลาเริ่มทับ', async () => {
  const db = seed({ race: { status: 'in_progress', actualDate: TODAY, actualStartTime: '09:01' } });
  const { status, json } = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 200, json.error);
  assert.equal(json.visit.status, 'in_progress');
  assert.equal(json.visit.actualStartTime, '09:01');
  assert.equal(row(db).actualStartTime, '09:01', 'เวลาเริ่มของคนแรกอยู่ครบ');
  assert.equal(visitWrites(db).length, 1, 'ไม่มีคำสั่งเขียนรอบสอง');
  assert.deepEqual(db.calls.filter((c) => c.write && c.table !== 'service_visits').map((c) => c.table), []);
});

test('นัดถูกลบระหว่างคำขอ = 409 "ถูกลบไปแล้ว" ไม่ใช่ 500', async () => {
  const db = seed({ race: 'deleted' });
  const { status, json } = await patch(db, planner, { note: 'โทรก่อนเข้า' });
  assert.equal(status, 409, json.error);
  assert.equal(json.error, visitStatusChangedError(null));
});

/* ═══ ② ฟอร์มที่เปิดค้าง — `expectedStatus` ═══════════════════════════════════════════════════════ */

test('🔴 ฟอร์มที่เปิดไว้ตอน "นัดไว้" กดบันทึกหลังช่างเริ่มงานแล้ว = 409 · งานที่เริ่มแล้วไม่ถอย เวลาเริ่มไม่หาย', async () => {
  const db = seed({ visit: { status: 'in_progress', actualDate: TODAY, actualStartTime: '09:00' } });
  const stale = { ...visitRow(), note: 'โทรก่อนเข้า', expectedStatus: 'scheduled' };
  delete stale.id;
  for (const attempt of [1, 2]) {
    const { status, json } = await patch(db, planner, stale);
    assert.equal(status, 409, `ครั้งที่ ${attempt}: ${json.error}`);
    assert.equal(json.error, visitStatusChangedError('in_progress'));
  }
  assert.equal(row(db).status, 'in_progress');
  assert.equal(row(db).actualStartTime, '09:00');
  assert.equal(row(db).note, null);
  assert.deepEqual(db.calls.filter((c) => c.write), [], 'ไม่เขียนอะไรเลย ทั้งสองครั้ง');
});

test('🔴 ฟอร์มที่เปิดไว้ก่อนนัดถูกยกเลิก กดบันทึกทีหลัง = 409 · นัดที่ยกเลิกไม่ฟื้น', async () => {
  const db = seed({ visit: { status: 'cancelled' } });
  const { status, json } = await patch(db, planner, { status: 'scheduled', note: 'x', expectedStatus: 'scheduled' });
  assert.equal(status, 409, json.error);
  assert.equal(json.error, visitStatusChangedError('cancelled'));
  assert.equal(row(db).status, 'cancelled');
});

test('ปล่อยร่างจากการ์ด (`expectedStatus: draft`) บนใบที่มีคนปล่อยไปก่อนแล้ว = 409 ไม่ปล่อยซ้ำ', async () => {
  const db = seed();
  const { status, json } = await patch(db, planner, { status: 'scheduled', expectedStatus: 'draft' });
  assert.equal(status, 409, json.error);
  assert.equal(json.error, visitStatusChangedError('scheduled'));
  assert.deepEqual(visitWrites(db), []);
});

test('expectedStatus ตรงกับฐาน = บันทึกตามปกติ · ไม่หลุดลงคอลัมน์', async () => {
  const db = seed();
  const { status, json } = await patch(db, planner, { note: 'โทรก่อนเข้า', expectedStatus: 'scheduled' });
  assert.equal(status, 200, json.error);
  assert.equal(row(db).note, 'โทรก่อนเข้า');
  assert.ok(!('expectedStatus' in visitWrites(db)[0].payload));
});

test('สถานะเดิมยังอยู่ = เขียนตามปกติ · คำสั่งเขียนถามสถานะที่อ่านไว้', async () => {
  const db = seed();
  const { status, json } = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 200, json.error);
  assert.equal(row(db).status, 'in_progress');
  assert.ok(row(db).actualStartTime, 'ประทับเวลาเริ่ม');
  const [write] = visitWrites(db);
  // ปุ่มเริ่มงานถามวันนัดด้วย (ด่าน "ถึงวันนัดหรือยัง" ตัดสินจากวันที่อ่านไว้)
  assert.deepEqual(write.filters, [['eq', 'id', 'V1'], ['eq', 'status', 'scheduled'], ['eq', 'scheduledDate', TODAY]]);
});

test('อีกคนแก้ช่องอื่นที่ไม่ใช่สถานะระหว่างนั้น = ไม่ใช่การชน เขียนได้ตามปกติ (ยามดูแค่สถานะ)', async () => {
  const db = seed({ race: 'scheduled' });
  const { status, json } = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 200, json.error);
  assert.equal(row(db).status, 'in_progress');
});

test('อ่านกลับพลาดหลังเขียน (error จากฐาน) ยังเป็น 500 พร้อมข้อความเดิม — ไม่กลายเป็น 409 ของการชน', async () => {
  const db = fakeDb({
    service_visits: [visitRow()],
    service_sites: [{ id: 'S1', code: 'SS-0001', name: 'ไซต์ทดสอบ', customerId: null, accessDays: [], accessFrom: null, accessTo: null }],
  }, {
    hook: (q) => (q.table === 'service_visits' && q.write === 'update'
      ? { data: null, error: { message: 'connection reset' } } : undefined),
  });
  const { status, json } = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 500);
  assert.equal(json.error, 'connection reset');
});

/* ═══ ③ ช่องอื่นที่คนอื่นแก้ระหว่างคำขอ — เขียนเฉพาะช่องที่เปลี่ยนจริง (`changedVisitColumns`) ═══════════ */

test('🔴 มีคนเลื่อนนัดไปวันหน้าพอดีกับที่ช่างกด "เริ่มงาน" = 409 "ยังไม่ถึงวันนัด" · ไม่มีนัด "กำลังทำ" ของวันข้างหน้า · วันใหม่อยู่ครบ', async () => {
  const db = seed({ race: { scheduledDate: '2099-01-05', startTime: '13:00' } });
  const { status, json } = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 409, json.error);
  assert.equal(json.error, FUTURE_STAMP_ERROR);
  assert.equal(row(db).status, 'scheduled');
  assert.equal(row(db).scheduledDate, '2099-01-05');
  assert.equal(row(db).startTime, '13:00');
  assert.equal(row(db).actualStartTime, null);
  const [write] = visitWrites(db);
  assert.deepEqual(write.filters, [['eq', 'id', 'V1'], ['eq', 'status', 'scheduled'], ['eq', 'scheduledDate', TODAY]]);
});

test('มีคนเลื่อนนัดเป็นวันที่ผ่านมาแล้วพอดีกับที่ช่างกด "เริ่มงาน" = 409 "เพิ่งถูกแก้" (สถานะไม่ได้เปลี่ยน) · กดอีกครั้ง = เริ่มได้ วันใหม่อยู่ครบ', async () => {
  const db = seed({ race: { scheduledDate: '2026-01-05' } });
  const first = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(first.status, 409, first.json.error);
  assert.equal(first.json.error, VISIT_EDITED_MEANWHILE_ERROR);
  const second = await patch(db, tech, { status: 'in_progress', stamp: 'start' });
  assert.equal(second.status, 200, second.json.error);
  assert.equal(row(db).status, 'in_progress');
  assert.equal(row(db).scheduledDate, '2026-01-05', 'เริ่มงานไม่เขียนวันเดิมทับ');
  assert.equal('scheduledDate' in visitWrites(db)[1].payload, false);
});

test('🔴 ผู้จัดคิวแก้หมายเหตุพอดีกับที่ฝ่ายขายเลื่อนวัน — วันใหม่ไม่ถูกวันเดิมเขียนทับ', async () => {
  const db = seed({ race: { scheduledDate: '2026-10-25', startTime: '13:00' } });
  const { status, json } = await patch(db, planner, { note: 'โทรก่อนเข้า' });
  assert.equal(status, 200, json.error);
  assert.equal(row(db).scheduledDate, '2026-10-25');
  assert.equal(row(db).startTime, '13:00');
  assert.equal(row(db).note, 'โทรก่อนเข้า');
});

test('CHECK ของแถวล้มตอนเขียน (คนอื่นเขียนช่องคู่กันพอดี) = 409 ให้โหลดใหม่ ไม่ใช่ข้อความ Postgres ดิบกับ 500', async () => {
  const db = fakeDb({
    service_visits: [visitRow()],
    service_sites: [{ id: 'S1', code: 'SS-0001', name: 'ไซต์ทดสอบ', customerId: null, accessDays: [], accessFrom: null, accessTo: null }],
  }, {
    hook: (q) => (q.table === 'service_visits' && q.write === 'update'
      ? { data: null, error: { code: '23514', message: 'new row violates check constraint "service_visits_time_window"' } } : undefined),
  });
  const { status, json } = await patch(db, planner, { endTime: '11:00' });
  assert.equal(status, 409);
  assert.equal(json.error, VISIT_EDITED_MEANWHILE_ERROR);
});

test('CHECK อื่นที่ไม่ได้เกิดจากการชน (เช่น เหตุผลข้ามด่าน) ยังเป็น 500 ข้อความเดิม — ไม่บอก "โหลดใหม่แล้วลองอีกครั้ง" ที่กดซ้ำก็ล้มซ้ำ', async () => {
  const db = fakeDb({
    service_visits: [visitRow()],
    service_sites: [{ id: 'S1', code: 'SS-0001', name: 'ไซต์ทดสอบ', customerId: null, accessDays: [], accessFrom: null, accessTo: null }],
  }, {
    hook: (q) => (q.table === 'service_visits' && q.write === 'update'
      ? { data: null, error: { code: '23514', message: 'new row violates check constraint "service_visits_gate_override_reason"' } } : undefined),
  });
  const { status, json } = await patch(db, planner, { note: 'x' });
  assert.equal(status, 500);
  assert.match(json.error, /service_visits_gate_override_reason/);
});

test('ผู้จัดคิวแก้หมายเหตุอย่างเดียว = คำสั่งเขียนมีแค่หมายเหตุกับ updatedAt · คนเปลี่ยนผู้รับผิดชอบคั่นกลางไม่ถูกทับ', async () => {
  const db = seed({ race: { assigneeId: 'U-MATE', assigneeName: 'ช่างบี' } });
  const { status, json } = await patch(db, planner, { note: 'โทรก่อนเข้า' });
  assert.equal(status, 200, json.error);
  const [write] = visitWrites(db);
  assert.deepEqual(Object.keys(write.payload).sort(), ['note', 'updatedAt']);
  assert.equal(row(db).assigneeId, 'U-MATE');
  assert.equal(row(db).note, 'โทรก่อนเข้า');
});

/* ═══ ④ ลบนัด — ลบเฉพาะเมื่อสถานะยังเท่ากับตอนอ่าน ═══════════════════════════════════════════════ */

const del = (db, user) => callRoute(DELETE, { user, db, method: 'DELETE', path: '/api/service/visits/V1', params: { id: 'V1' } });

test('🔴 ผู้จัดคิวกดลบนัดนอกรอบพอดีกับที่ช่างกดรับงาน = 409 บอกสถานะจริง · นัดที่กำลังทำไม่หาย', async () => {
  let raced = false;
  const racing = fakeDb({ service_visits: [visitRow()], service_visit_assets: [], service_visit_items: [] }, {
    hook: (q, api) => {
      if (!raced && q.table === 'service_visits' && q.write === 'delete') {
        raced = true;
        Object.assign(api.tables.service_visits[0], { status: 'in_progress', actualDate: TODAY, actualStartTime: '09:01' });
      }
      return undefined;
    },
  });
  const { status, json } = await del(racing, planner);
  assert.equal(status, 409, json.error);
  assert.equal(json.error, visitStatusChangedError('in_progress'));
  assert.equal(racing.tables.service_visits.length, 1, 'นัดยังอยู่');
});

test('ลบนัดนอกรอบตามปกติ (สถานะไม่เปลี่ยน) = ลบได้เหมือนเดิม', async () => {
  const db = fakeDb({ service_visits: [visitRow()], service_visit_assets: [], service_visit_items: [] });
  const { status, json } = await del(db, planner);
  assert.equal(status, 200, json.error);
  assert.equal(db.tables.service_visits.length, 0);
  const [write] = db.writes('service_visits');
  assert.deepEqual(write.filters, [['eq', 'id', 'V1'], ['eq', 'status', 'scheduled']]);
});

test('ลบไม่โดนแถว แล้วอ่านซ้ำพลาด = 409 "ยังไม่ได้ลบ" — ไม่บอกว่า "ถูกลบไปแล้ว" ทั้งที่ไม่รู้', async () => {
  let raced = false;
  const db = fakeDb({ service_visits: [visitRow()], service_visit_assets: [], service_visit_items: [] }, {
    hook: (q, api) => {
      if (!raced && q.table === 'service_visits' && q.write === 'delete') {
        raced = true;
        Object.assign(api.tables.service_visits[0], { status: 'in_progress' });
        return undefined;
      }
      if (raced && q.table === 'service_visits' && !q.write) return { data: null, error: { message: 'connection reset' } };
      return undefined;
    },
  });
  const { status, json } = await del(db, planner);
  assert.equal(status, 409, json.error);
  assert.match(json.error, /ยังไม่ได้ลบ/);
  assert.doesNotMatch(json.error, /ถูกลบไปแล้ว/);
});
