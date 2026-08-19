// ── ปิดเรื่องต้องครบสองฝั่ง ────────────────────────────────────────────────
//
// กฎ (มติผู้ใช้ 2026-08-20): ฝั่งฝ่าย = `answeredAt` · ฝั่งผู้ขอ = `closedAt` ·
// ใบจบเมื่อมีครบทั้งคู่ · มีตราเดียว = ใบยังเปิด และยังนับเป็นงานค้างในคิว
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closureStatus, replyClearsClosure, reopenRequestError, requestClosure,
} from './closure.js';
import { requestRowsClosurePatch } from './stages.js';
import { requestNextStep } from './queueBoard.js';
import { requestQueueTrack } from './queueTrack.js';

const ask = (over = {}) => ({
  kind: 'info', dept: 'RD', requesterDept: 'SA', status: 'acknowledged',
  committedDueDate: '2026-08-25', items: [], ...over,
});
const NOW = '2026-08-20T03:00:00Z';

test('⭐ ตราเดียวยังไม่จบ — ครบสองฝั่งถึงเป็น closed', () => {
  assert.equal(closureStatus({ status: 'acknowledged' }), 'acknowledged');
  // ฝ่ายกดก่อน
  assert.equal(closureStatus({ status: 'acknowledged', answeredAt: NOW }), 'answered');
  // ผู้ขอกดก่อน — ใบยังเปิด ไม่ใช่ closed (🐞 ของเดิมปิดทันทีตรงนี้)
  assert.equal(closureStatus({ status: 'acknowledged', closedAt: NOW }), 'acknowledged');
  // ครบสองฝั่ง
  assert.equal(closureStatus({ status: 'answered', answeredAt: NOW, closedAt: NOW }), 'closed');
  // ⚠️ ปลายทางถาวร · ใบยกเลิกไม่ขยับ
  assert.equal(closureStatus({ status: 'closed', answeredAt: null, closedAt: null }), 'closed');
  assert.equal(closureStatus({ status: 'cancelled', answeredAt: NOW, closedAt: NOW }), 'cancelled');
});

test('เหลือฝั่งไหน — ป้ายทั้งระบบอ่านจากตัวนี้', () => {
  assert.equal(requestClosure(ask()).waitingSide, null);
  assert.equal(requestClosure(ask({ answeredAt: NOW })).waitingSide, 'requester');
  assert.equal(requestClosure(ask({ closedAt: NOW })).waitingSide, 'dept');
  assert.equal(requestClosure(ask({ answeredAt: NOW, closedAt: NOW })).complete, true);
  assert.equal(requestClosure(ask({ status: 'closed' })).complete, true);
});

test('⭐ คิวยังนับใบที่ปิดฝั่งเดียว — ไม่ตกไปแท็บประวัติ', () => {
  // 🐞 ของเดิมใบ `answered` คืน null ⇒ ตกแท็บประวัติทันทีที่ฝ่ายตอบ ทั้งที่ผู้ขอยังไม่ปิด
  const deptDone = requestNextStep(ask({ status: 'answered', answeredAt: NOW }));
  assert.deepEqual(deptDone, { owner: 'requester', label: 'รอ SA ปิด' });

  const requesterDone = requestNextStep(ask({ closedAt: NOW }));
  assert.deepEqual(requesterDone, { owner: 'dept', label: 'รอ RD ตอบ' });

  // ครบสองฝั่ง = ไม่มีก้าวเหลือ (เข้าประวัติ)
  assert.equal(requestNextStep(ask({ status: 'closed', answeredAt: NOW, closedAt: NOW })), null);
});

test('รางบนตาราง — ขั้น "ปิด" เขียวเมื่อครบสองฝั่งเท่านั้น', () => {
  const stateOf = (t, key) => t.steps.find((s) => s.key === key)?.state;
  const noteOf = (t, key) => t.steps.find((s) => s.key === key)?.note;

  const deptOnly = requestQueueTrack(ask({ status: 'answered', answeredAt: NOW }));
  assert.equal(stateOf(deptOnly, 'answer'), 'done');
  assert.equal(stateOf(deptOnly, 'close'), 'now');
  assert.equal(noteOf(deptOnly, 'close'), 'รอ SA ปิดเรื่อง');

  const requesterOnly = requestQueueTrack(ask({ closedAt: NOW }));
  assert.equal(stateOf(requesterOnly, 'answer'), 'now');
  assert.equal(noteOf(requesterOnly, 'close'), 'รอ RD ตอบ');

  const both = requestQueueTrack(ask({ status: 'closed', answeredAt: NOW, closedAt: NOW }));
  assert.equal(stateOf(both, 'close'), 'done');
});

test('⭐ ถูกถามกลับ = ตราของอีกฝั่งหลุดเอง (เฉพาะใบที่เธรดคือตัวงาน)', () => {
  const deptDone = ask({ status: 'answered', answeredAt: NOW });
  // ผู้ขอพิมพ์ถามกลับ ⇒ ตราของฝ่ายหลุด
  assert.equal(replyClearsClosure(deptDone, { side: 'requester', threadOnly: true }), 'dept');
  // ฝ่ายพิมพ์เสริมเอง ⇒ ไม่หลุด (พูดของตัวเอง ไม่ใช่การทวงงาน)
  assert.equal(replyClearsClosure(deptDone, { side: 'dept', threadOnly: true }), null);
  // ใบที่มีแถว (พัฒนากลิ่น/เอกสาร) ไม่หลุดตามข้อความ — ตัวงานคือแถว
  assert.equal(replyClearsClosure(deptDone, { side: 'requester', threadOnly: false }), null);
  // ฝั่งผู้ขอกดปิดไว้ แล้วฝ่ายถามกลับ
  assert.equal(replyClearsClosure(ask({ closedAt: NOW }), { side: 'dept', threadOnly: true }), 'requester');
  // ใบที่ปิดครบแล้วไม่ถูกแตะ (ปลายทางถาวร)
  assert.equal(
    replyClearsClosure(ask({ status: 'closed', answeredAt: NOW, closedAt: NOW }), { side: 'requester', threadOnly: true }),
    null,
  );
});

test('ปุ่ม "ยังไม่จบ" — ต้องมีตราอยู่ก่อน · บังคับเหตุผล · ใบที่ปิดครบแล้วห้ามเปิด', () => {
  assert.match(reopenRequestError(ask(), { reason: 'ยังขาดเอกสาร' }), /ไม่มีอะไรให้ถอน/);
  assert.match(reopenRequestError(ask({ answeredAt: NOW })), /ต้องบอกว่ายังเหลืออะไร/);
  assert.equal(reopenRequestError(ask({ answeredAt: NOW }), { reason: 'ยังไม่ได้ให้ลูกค้าดม' }), null);
  assert.equal(reopenRequestError(ask({ closedAt: NOW }), { reason: 'ขอเอกสารเพิ่ม' }), null);
  assert.match(
    reopenRequestError(ask({ status: 'closed', answeredAt: NOW, closedAt: NOW }), { reason: 'x' }),
    /ปิดครบสองฝั่งแล้ว/,
  );
});

/* ⭐ ใบที่มีแถว (ขอเอกสาร · พัฒนากลิ่น · พัฒนาสูตร) — ตราฝั่งฝ่ายมาจาก "ทุกแถวจบ"
   🐞 ของเดิมขยับแค่ `status` ⇒ `answeredAt` ของหัวใบไม่เคยถูกประทับเลย */
test('⭐ ใบที่มีแถว: แถวครบ = ได้ตราฝ่าย · แถวกลับมาไม่ครบ = ตราหลุดทั้งสองฝั่ง', () => {
  const done = [{ answerStatus: 'done' }, { answerStatus: 'done' }];
  const mixed = [{ answerStatus: 'done' }, { ackAt: 'x' }];
  const doc = (over) => ({ kind: 'document', dept: 'RD', status: 'acknowledged', ...over });

  assert.deepEqual(
    requestRowsClosurePatch(doc(), done, NOW),
    { answeredAt: NOW, status: 'answered' },
  );
  // ผู้ขอปิดไว้ก่อนแล้ว ⇒ แถวครบเมื่อไรใบจบทันที
  assert.deepEqual(
    requestRowsClosurePatch(doc({ closedAt: '2026-08-19T00:00:00Z' }), done, NOW),
    { answeredAt: NOW, status: 'closed' },
  );
  // มีแถวใหม่เข้ามา ⇒ ถอนตราทั้งสองฝั่ง แล้วใบกลับมาเปิด
  assert.deepEqual(
    requestRowsClosurePatch(
      doc({ status: 'answered', answeredAt: NOW, closedAt: NOW, closedById: 'U1', closedByName: 'SA' }),
      mixed,
      NOW,
    ),
    {
      answeredAt: null, closedAt: null, closedById: null, closedByName: null, status: 'acknowledged',
    },
  );
  // ใบที่ยังไม่มีแถวเลย (ก่อนฝ่ายส่งงาน) ไม่แตะอะไร
  assert.deepEqual(requestRowsClosurePatch(doc(), [], NOW), {});
  // ใบที่ปิด/ยกเลิกแล้วไม่ถอยกลับ
  assert.deepEqual(requestRowsClosurePatch(doc({ status: 'closed' }), mixed, NOW), {});
});
