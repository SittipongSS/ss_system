// ── มอบหมายคำร้องให้คนในฝ่าย (mig 0230) ──────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { assignPatch, assignRequestError, requestAssignee } from './assign.js';

const req = (over = {}) => ({ id: 'DR-1', dept: 'RD', status: 'acknowledged', ...over });
const NOW = '2026-08-12T03:00:00.000Z';

test('⭐ ใบอยู่ที่ใคร — ผู้รับผิดชอบมาก่อน แล้วค่อยถอยไปคนที่กดรับเรื่อง', () => {
  const assigned = req({
    assigneeId: 'U2', assigneeName: 'ธนพล',
    acknowledgedById: 'U1', acknowledgedByName: 'ปกิตา',
  });
  assert.deepEqual(requestAssignee(assigned), { id: 'U2', name: 'ธนพล', source: 'assignee' });

  // ใบเก่า/ใบที่ยังไม่จัดคน — ต้องยังอ่านออกว่าอยู่ที่ใคร
  const acked = req({ acknowledgedById: 'U1', acknowledgedByName: 'ปกิตา' });
  assert.deepEqual(requestAssignee(acked), { id: 'U1', name: 'ปกิตา', source: 'acknowledged' });

  const nobody = requestAssignee(req());
  assert.equal(nobody.id, null);
  assert.equal(nobody.source, null, 'ยังไม่มีใครถือ ต้องแยกออกจาก "ถือแต่ไม่รู้ชื่อ"');
  assert.equal(requestAssignee(undefined).source, null);
});

test('มอบหมายได้เฉพาะใบที่ยังเดินอยู่', () => {
  assert.equal(assignRequestError(req(), { assigneeId: 'U2' }), null);
  assert.equal(assignRequestError(req({ status: 'pending' }), { assigneeId: 'U2' }), null);
  assert.match(assignRequestError(req({ status: 'draft' }), { assigneeId: 'U2' }), /ยังไม่ถูกส่ง/);
  assert.match(assignRequestError(req({ status: 'closed' }), { assigneeId: 'U2' }), /ปิดไปแล้ว/);
  assert.match(assignRequestError(req({ status: 'cancelled' }), { assigneeId: 'U2' }), /ยกเลิกแล้ว/);
  assert.match(assignRequestError(null, { assigneeId: 'U2' }), /ไม่พบคำร้อง/);
  // id ที่เป็นช่องว่างล้วน = พิมพ์พลาด ไม่ใช่ "ถอนมอบหมาย"
  assert.match(assignRequestError(req(), { assigneeId: '   ' }), /ต้องเลือกผู้รับผิดชอบ/);
});

test('⭐ ถอนการมอบหมายต้องทำได้เสมอที่ใบยังเดินอยู่', () => {
  // คนลาออก/ลาป่วย — ปล่อยให้ค้างเป็นเจ้าของงานถาวรไม่ได้
  assert.equal(assignRequestError(req({ assigneeId: 'U2' }), { assigneeId: null }), null);
});

test('🔴 ถอนมอบหมายต้องล้างทุกช่อง — ไม่งั้นชื่อเดิมค้างอยู่ในแถว', () => {
  const cleared = assignPatch({ assigneeId: null, assigneeName: null, nowIso: NOW });
  assert.deepEqual(cleared, {
    assigneeId: null, assigneeName: null, assignedAt: null, assignedById: null, assignedByName: null,
  });
  // คืนครบทุกคีย์เสมอ — คืนเฉพาะช่องที่มีค่าเมื่อไร การถอนจะกลายเป็น no-op เงียบ ๆ
  assert.equal(Object.keys(cleared).length, 5);
});

test('มอบหมาย — เขียนทั้ง id ชื่อ เวลา และคนสั่ง', () => {
  const patch = assignPatch({
    assigneeId: 'U2', assigneeName: ' ธนพล ', by: { id: 'U9', name: 'หัวหน้า' }, nowIso: NOW,
  });
  assert.deepEqual(patch, {
    assigneeId: 'U2',
    assigneeName: 'ธนพล',
    assignedAt: NOW,
    assignedById: 'U9',
    assignedByName: 'หัวหน้า',
  });
});

test('ชื่อยาวเกินเพดานถูกปฏิเสธ — ชื่อขนาดนั้นคือข้อมูลผิด ไม่ใช่ชื่อคน', () => {
  assert.match(
    assignRequestError(req(), { assigneeId: 'U2', assigneeName: 'ก'.repeat(201) }),
    /ยาวเกิน 200/,
  );
});
