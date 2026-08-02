import test from 'node:test';
import assert from 'node:assert/strict';
import { groupThreadItems, threadKeyOf } from './updateGrouping.js';

/* การจัดกลุ่มแถวในเธรด — "เรื่องเดียวกันอยู่กลุ่มเดียวกัน"

   🐞 ที่มา (ผู้ใช้ชี้จากของจริง 2026-08-02): งานใบเดียวทำให้เกิด 3 หัวเรื่องแยกกัน
   ในเธรดดีล — "สร้างงาน: TEST" · "อัปเดตงาน ทดสอบการอัพเดทงาน" · "อัปเดตงาน อัพเดท"
   ทั้งที่มันคือเรื่องเดียวกัน ควรซ้อนใต้หัวเดียวเหมือนการตอบกลับ */

const own = (id, at, taskId, quotedId) => ({
  id, at, kind: 'own',
  row: { id, createdAt: at, meta: { ...(taskId ? { taskId } : {}), ...(quotedId ? { quotedId } : {}) } },
});
const extra = (id, at, threadKey) => ({ id, at, kind: 'extra', threadKey });
const mapOf = (items) => new Map(items.filter((i) => i.kind === 'own').map((i) => [i.id, i.row]));

test('งานใบเดียวได้หัวเรื่องเดียว ที่เหลือซ้อนใต้', () => {
  const timeline = [
    own('u-created', '2026-08-02T05:53:00Z', 'T1'),
    extra('tu-1', '2026-08-02T05:55:00Z', 'task:T1'),
    extra('tu-2', '2026-08-02T07:02:00Z', 'task:T1'),
    own('u-done', '2026-08-02T08:00:00Z', 'T1'),
  ];
  const { roots, repliesOf } = groupThreadItems(timeline, { byId: mapOf(timeline), order: 'desc' });
  assert.deepEqual(roots.map((r) => r.id), ['u-created'], 'หัวเรื่องต้องเหลือใบเดียว');
  assert.deepEqual(repliesOf.get('u-created').map((r) => r.id), ['tu-1', 'tu-2', 'u-done'],
    'คำตอบเรียงเก่า→ใหม่เสมอ แม้เธรดหลักเรียงใหม่ก่อน');
});

test('หัวกลุ่ม = แถวที่เก่าที่สุด ไม่ใช่ตัวแรกที่เจอในลิสต์', () => {
  // เธรดดีลเรียง desc → แถวใหม่มาก่อนใน timeline
  const timeline = [
    extra('tu-late', '2026-08-02T07:02:00Z', 'task:T1'),
    own('u-created', '2026-08-02T05:53:00Z', 'T1'),
  ];
  const { roots } = groupThreadItems(timeline, { byId: mapOf(timeline), order: 'desc' });
  assert.deepEqual(roots.map((r) => r.id), ['u-created'], 'ต้องเป็น "สร้างงาน" ไม่ใช่แถวที่มาก่อน');
});

test('กลุ่มงานขยับตามความคืบหน้าล่าสุด ไม่จมอยู่กับวันที่สร้าง', () => {
  /* งานเปิดไว้ตั้งแต่มิถุนายน เพิ่งคืบหน้าวันนี้ — ถ้าเรียงด้วยเวลาสร้าง กลุ่มจะจม
     อยู่ท้ายเธรดทั้งที่เป็นความเคลื่อนไหวล่าสุดของดีล */
  const timeline = [
    own('u-note', '2026-07-15T00:00:00Z', null),                 // ข้อความคนเมื่อกลางเดือน
    own('u-created', '2026-06-01T00:00:00Z', 'T1'),
    extra('tu-new', '2026-08-02T00:00:00Z', 'task:T1'),
  ];
  const { roots } = groupThreadItems(timeline, { byId: mapOf(timeline), order: 'desc' });
  assert.deepEqual(roots.map((r) => r.id), ['u-created', 'u-note'],
    'กลุ่มงานต้องอยู่บนสุดเพราะคืบหน้าล่าสุด');

  const asc = groupThreadItems(timeline, { byId: mapOf(timeline), order: 'asc' });
  assert.deepEqual(asc.roots.map((r) => r.id), ['u-note', 'u-created'], 'ทิศ asc ต้องกลับด้าน');
});

test('คำตอบของคนยังทำงานเหมือนเดิม และยึดตำแหน่งของต้นเรื่อง', () => {
  const timeline = [
    own('a', '2026-08-01T00:00:00Z', null),
    own('b', '2026-08-03T00:00:00Z', null, 'a'),   // ตอบ a
    own('c', '2026-08-02T00:00:00Z', null),
  ];
  const { roots, repliesOf } = groupThreadItems(timeline, { byId: mapOf(timeline), order: 'desc' });
  assert.deepEqual(roots.map((r) => r.id), ['c', 'a'],
    'a ต้องอยู่ตามเวลาของตัวเอง ไม่ขยับขึ้นเพราะมีคนตอบ (ต่างจากกลุ่มงานโดยตั้งใจ)');
  assert.deepEqual(repliesOf.get('a').map((r) => r.id), ['b']);
});

test('แถวที่ไม่มีคีย์ไม่ถูกจับกลุ่มมั่ว', () => {
  const timeline = [
    extra('st-1', '2026-08-01T00:00:00Z', undefined),
    extra('st-2', '2026-08-02T00:00:00Z', undefined),
  ];
  const { roots, repliesOf } = groupThreadItems(timeline, { order: 'asc' });
  assert.equal(roots.length, 2, 'ประวัติสถานะต้องเป็นแถวอิสระเหมือนเดิม');
  assert.equal(repliesOf.size, 0);
});

test('threadKeyOf: เธรดอ่าน meta.taskId · รายการที่ยืมมาส่งคีย์เอง', () => {
  assert.equal(threadKeyOf(own('x', '2026-08-01', 'T9')), 'task:T9');
  assert.equal(threadKeyOf(own('x', '2026-08-01', null)), null);
  assert.equal(threadKeyOf(extra('y', '2026-08-01', 'task:T9')), 'task:T9');
  assert.equal(threadKeyOf(null), null);
});
