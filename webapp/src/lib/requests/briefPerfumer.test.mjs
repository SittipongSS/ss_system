import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PERFUMER_NAME, assignBriefPerfumerError, briefPerfumer, briefPerfumerPatch, briefScentSent,
} from './briefPerfumer.js';

const open = { status: 'acknowledged' };
const emptyGroup = { id: 'b1', directions: [] };

test('กลิ่นที่ยังไม่ถูกแจก = ยังไม่มีใครถือ ไม่ใช่ถือโดยคนไม่มีชื่อ', () => {
  assert.deepEqual(briefPerfumer({}), { id: null, name: '', assignedAt: null });
  assert.deepEqual(briefPerfumer({ perfumerName: '   ' }), { id: null, name: '', assignedAt: null });
});

/* ⚠️ ไม่ถอยไปใช้ `pdrSignPerfumer` ของหัวใบ — เทสต์นี้กันไม่ให้ใครเติมกฎถอยหลัง
   เข้ามาทีหลัง (ถ้าถอย กลิ่นที่ยังไม่มีคนรับจะอ่านเหมือนแจกแล้วทั้งใบ) */
test('ชื่อบนหัวใบไม่ใช่คำตอบของกลิ่นก้อนนี้', () => {
  const brief = { id: 'b1', label: 'กลิ่นที่ 1' };
  assert.equal(briefPerfumer(brief).name, '');
});

test('อ่านคนถือได้ทั้ง id และชื่อ พร้อมเวลาที่แจก', () => {
  const got = briefPerfumer({ perfumerId: 'u1', perfumerName: ' ริสา ', assignedAt: '2026-09-08T03:00:00Z' });
  assert.deepEqual(got, { id: 'u1', name: 'ริสา', assignedAt: '2026-09-08T03:00:00Z' });
});

test('ชื่อที่กรอกมือไว้โดยไม่มีบัญชี ยังอ่านออกว่ามีคนถือ', () => {
  assert.deepEqual(briefPerfumer({ perfumerName: 'มดตะนอย' }), { id: null, name: 'มดตะนอย', assignedAt: null });
});

/* ── เส้นแบ่ง "ส่งกลิ่นแล้ว" ─────────────────────────────────────────────── */

test('กลิ่นที่ผลิตออกมาแล้ว (มี producedScentId) ถือว่าส่งแล้ว', () => {
  assert.equal(briefScentSent({ directions: [{ stage: 'ready', scentId: 's1' }] }), true);
});

test('แถวเก่าที่ไม่มี producedScentId ยังอ่านจากขั้นของแถวได้', () => {
  assert.equal(briefScentSent({ directions: [{ stage: 'sent', scentId: null }] }), true);
  assert.equal(briefScentSent({ directions: [{ stage: 'done', scentId: null }] }), true);
});

test('บรีฟที่ยังทำอยู่ / ยังไม่มี direction เลย = ยังไม่ส่ง', () => {
  assert.equal(briefScentSent({ directions: [{ stage: 'developing', scentId: null }] }), false);
  assert.equal(briefScentSent(emptyGroup), false);
  assert.equal(briefScentSent({}), false);
});

/* ── ด่านของการแจก ───────────────────────────────────────────────────────── */

test('แจกได้เฉพาะใบที่ยังเดินอยู่', () => {
  for (const status of ['pending', 'acknowledged']) {
    assert.equal(assignBriefPerfumerError({ status }, emptyGroup, { perfumerId: 'u1' }), null, status);
  }
  assert.match(assignBriefPerfumerError({ status: 'draft' }, emptyGroup, {}), /ยังไม่ถูกส่ง/);
  assert.match(assignBriefPerfumerError({ status: 'cancelled' }, emptyGroup, {}), /ยกเลิก/);
  assert.match(assignBriefPerfumerError({ status: 'closed' }, emptyGroup, {}), /ปิดไปแล้ว/);
});

test('ถอนการแจกทำได้เสมอที่ใบยังเดินอยู่ — คนลาออกต้องเอางานออกจากมือได้', () => {
  assert.equal(assignBriefPerfumerError(open, emptyGroup, { perfumerId: null, perfumerName: null }), null);
});

/* ถ้อยคำผู้ใช้ 2026-09-08: "เปลี่ยนได้ จนกว่า จะส่งกลิ่น" */
test('ส่งกลิ่นไปแล้วห้ามเปลี่ยนเจ้าของ — และบอกทางออกว่าต้องไปแก้ที่ไหน', () => {
  const sent = { id: 'b1', directions: [{ stage: 'ready', scentId: 's1' }] };
  const msg = assignBriefPerfumerError(open, sent, { perfumerId: 'u2' });
  assert.match(msg, /ส่งออกไปแล้ว/);
  assert.match(msg, /ทะเบียนกลิ่น/);
});

test('ช่องว่างล้วนคือพิมพ์พลาด ไม่ใช่การถอนงาน', () => {
  assert.match(assignBriefPerfumerError(open, emptyGroup, { perfumerId: '   ' }), /ต้องเลือกผู้ปรุง/);
});

test('ชื่อยาวเกินเพดานถูกตีกลับเป็นข้อความไทย ไม่ใช่ error ของ Postgres', () => {
  const long = 'ก'.repeat(MAX_PERFUMER_NAME + 1);
  assert.match(assignBriefPerfumerError(open, emptyGroup, { perfumerId: 'u1', perfumerName: long }), /ยาวเกิน/);
});

test('ไม่มีกลิ่นก้อนนั้นในใบ = ตีกลับ ไม่ใช่เขียนแถวใหม่', () => {
  assert.match(assignBriefPerfumerError(open, null, { perfumerId: 'u1' }), /ไม่พบกลิ่น/);
});

/* ── ค่าที่เขียนลงแถว ────────────────────────────────────────────────────── */

test('แจกงาน: ตัดช่องว่างหัวท้าย + ประทับคนแจกและเวลา', () => {
  const patch = briefPerfumerPatch({
    perfumerId: 'u1', perfumerName: '  ธนกร  ', by: { id: 'sup', name: 'รุจิรา' }, nowIso: '2026-09-08T03:00:00Z',
  });
  assert.deepEqual(patch, {
    perfumerId: 'u1',
    perfumerName: 'ธนกร',
    assignedAt: '2026-09-08T03:00:00Z',
    assignedById: 'sup',
    assignedByName: 'รุจิรา',
  });
});

/* 🐞 คืนไม่ครบทุกช่องเมื่อไร การถอนงานกลายเป็น no-op เงียบ ๆ — ชื่อเดิมค้างในแถว
   แล้วตารางยังขึ้นชื่อคนเดิมทั้งที่ id ถูกล้างไปแล้ว */
test('ถอนการแจกต้องล้างครบทั้งห้าช่อง', () => {
  const cleared = briefPerfumerPatch({ perfumerId: null, perfumerName: '', by: { id: 'sup' }, nowIso: 'now' });
  assert.equal(Object.keys(cleared).length, 5);
  for (const [key, value] of Object.entries(cleared)) assert.equal(value, null, key);
});

test('ชื่อว่างเปล่าพร้อม id ว่าง = ถอน ไม่ใช่แจกให้คนไม่มีชื่อ', () => {
  assert.equal(briefPerfumerPatch({ perfumerName: '   ', nowIso: 'now' }).assignedAt, null);
});
