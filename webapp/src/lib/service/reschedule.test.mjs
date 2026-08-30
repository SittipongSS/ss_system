// เลื่อนนัด + เธรดความเคลื่อนไหว (S-5) — logic ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import { isReschedule, rescheduleSummary } from './rounds.js';
import { UPDATE_KINDS, updateKindMeta } from '../master/updateTypes.js';
import { UPDATE_ENTITIES } from '../master/updateAccess.js';

const visit = (over = {}) => ({
  id: 'V1', code: 'SV-1', siteId: 'S1', kind: 'refill',
  scheduledDate: '2026-08-03', status: 'scheduled', ...over,
});

test('⭐ เปลี่ยน "วัน" ของนัดที่ยังไม่ปิด = เลื่อน (ต้องมีเหตุผล)', () => {
  assert.equal(isReschedule(visit(), visit({ scheduledDate: '2026-08-10' })), true);
});

test('⭐ เปลี่ยนแค่เวลาในวันเดิม ไม่นับว่าเลื่อน — ขยับ 30 นาทีเพราะรถติดไม่ต้องอธิบายลูกค้า', () => {
  assert.equal(
    isReschedule(visit({ startTime: '09:00' }), visit({ startTime: '09:30' })),
    false,
  );
});

test('นัดที่ปิดงาน/ยกเลิกไปแล้ว ไม่นับว่าเลื่อน (แก้ข้อมูลย้อนหลังคนละเรื่อง)', () => {
  assert.equal(isReschedule(visit({ status: 'done' }), visit({ scheduledDate: '2026-08-10' })), false);
  assert.equal(isReschedule(visit({ status: 'cancelled' }), visit({ scheduledDate: '2026-08-10' })), false);
});

test('ข้อมูลไม่ครบ ไม่ตัดสินว่าเลื่อน', () => {
  assert.equal(isReschedule(null, visit()), false);
  assert.equal(isReschedule(visit(), { scheduledDate: null }), false);
});

test('ข้อความในเธรดอ่านย้อนหลังแล้วเห็นภาพโดยไม่ต้องเปิดนัด', () => {
  const text = rescheduleSummary(visit(), visit({ scheduledDate: '2026-08-10' }), 'ลูกค้าขอเลื่อน');
  assert.equal(text, 'เลื่อนนัดจาก 2026-08-03 → 2026-08-10 · ลูกค้าขอเลื่อน');
  assert.match(rescheduleSummary(visit(), visit({ scheduledDate: '2026-08-10' }), ''), /2026-08-03 → 2026-08-10$/);
});

// ── ลงทะเบียนกับเธรดกลาง ────────────────────────────────────────────────
test('⭐ service_visit ลงทะเบียนครบทั้งชนิดและด่านสิทธิ์ — ขาดข้างใดข้างหนึ่งเธรดเงียบ', () => {
  assert.ok(UPDATE_KINDS.service_visit, 'ต้องมีชุดชนิดใน UPDATE_KINDS');
  assert.ok(UPDATE_ENTITIES.service_visit, 'ต้องมีด่านสิทธิ์ใน UPDATE_ENTITIES');
  assert.equal(UPDATE_ENTITIES.service_visit.table, 'service_visits');
});

test('ชนิดที่คนเลือกเองได้มีแค่ "บันทึกหน้างาน" — เหตุการณ์ระบบปลอมไม่ได้', () => {
  const authorable = Object.entries(UPDATE_KINDS.service_visit)
    .filter(([, meta]) => meta.authorable).map(([kind]) => kind);
  assert.deepEqual(authorable, ['comment']);
  for (const kind of ['reschedule', 'done', 'cancel']) {
    assert.equal(UPDATE_KINDS.service_visit[kind].authorable, undefined, kind);
  }
});

test('ทุกชนิดมีป้ายไทยและสี — ไม่มีชนิดไหนโผล่เป็น key ดิบบนหน้าจอ', () => {
  for (const kind of Object.keys(UPDATE_KINDS.service_visit)) {
    const meta = updateKindMeta('service_visit', kind);
    assert.ok(meta.label && meta.label !== kind, kind);
    assert.match(meta.color, /^var\(--/, kind);
  }
});

test('แจ้งเตือนไปที่เจ้าหน้าที่เจ้าของนัด ไม่กระจายทั้งฝ่าย — คิวที่เต็มไปด้วยเรื่องคนอื่นไม่มีใครอ่าน', () => {
  assert.deepEqual(UPDATE_ENTITIES.service_visit.recipients({ assigneeId: 'U1' }), ['U1']);
});
