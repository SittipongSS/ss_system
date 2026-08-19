// ── ตาใครตอบ (หัวข้อที่ทั้งใบคือเธรด) ─────────────────────────────────────
//
// ⭐ เทสต์ชุดนี้คุมสองอย่างที่พังง่ายที่สุดของกติกานี้:
//   1 **ขอบเขต** — ห้ามไปทับใบที่มีแถวจริง ซึ่งมีขั้นของแถวเล่าละเอียดกว่าอยู่แล้ว
//   2 **ช่องไฟ** — รหัสฝ่ายเป็นอักษรละติน ต้องเว้นวรรค · คำไทยถอยห้ามเว้น
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestIsThreadOnly, requestReplyTurn, requestWaitLabel } from './replyTurn.js';

const asked = (over = {}) => ({
  kind: 'info', dept: 'RD', requesterDept: 'SA', status: 'acknowledged', items: [], ...over,
});

test('⭐ สอบถามข้อมูล — ป้ายพลิกตามคนโพสต์ล่าสุด (มติผู้ใช้ 2026-08-20)', () => {
  // ยังไม่มีใครพิมพ์ = ตาฝ่าย · คำถามอยู่ในใบตั้งแต่ตอนเปิดแล้ว การเงียบของฝ่าย
  // คือสิ่งที่ต้องทวง ไม่ใช่ให้ใบไปค้างที่ฝั่งคนถาม
  assert.deepEqual(requestReplyTurn(asked()), { side: 'dept', label: 'รอ RD ตอบ' });
  assert.deepEqual(
    requestReplyTurn(asked({ lastReplySide: 'requester' })),
    { side: 'dept', label: 'รอ RD ตอบ' },
  );
  // ฝ่ายตอบไปแล้ว ⇒ ลูกอยู่ฝั่งคนเปิดใบ
  assert.deepEqual(
    requestReplyTurn(asked({ lastReplySide: 'dept' })),
    { side: 'requester', label: 'รอ SA ตอบ' },
  );
});

test('⚠️ ขอบเขต — ใบที่มีแถวจริง/ยังไม่รับเรื่อง/จบแล้ว ไม่มีตาให้ชี้', () => {
  // 🐞 ใบที่ `kind` ว่างหรือไม่รู้จักเคยถูกนับเป็น "เธรดล้วน" ทั้งที่มีแถวเดินอยู่ ⇒
  // ป้าย "รอ … ตอบ" ไปทับ "รอปิดเรื่อง" ของฝั่งผู้ขอ (เจอตอนเทสต์คิวแดง)
  assert.equal(requestReplyTurn(asked({ kind: undefined, items: [{ answerStatus: 'done' }] })), null);
  // หัวข้อที่ฝ่ายสร้างแถวเองตอนส่งงาน — ขั้นของแถวละเอียดกว่าเธรด
  assert.equal(requestReplyTurn(asked({ kind: 'scent_dev' })), null);
  // ยังไม่รับเรื่อง = มีป้ายของตัวเองอยู่แล้ว ("รอรับเรื่อง")
  assert.equal(requestReplyTurn(asked({ status: 'pending' })), null);
  // ตอบแล้ว/ปิดแล้ว = ไม่มีใครต้องตอบอีก
  assert.equal(requestReplyTurn(asked({ status: 'answered' })), null);
  assert.equal(requestReplyTurn(null), null);

  assert.equal(requestIsThreadOnly('info'), true);
  assert.equal(requestIsThreadOnly('scent_dev'), false);
});

test('⚠️ ช่องไฟ — เว้นวรรครอบรหัสฝ่าย แต่ห้ามเว้นรอบคำไทย', () => {
  assert.equal(requestWaitLabel({ dept: 'RD' }, 'dept', 'ตอบ'), 'รอ RD ตอบ');
  assert.equal(requestWaitLabel({ requesterDept: 'FN' }, 'requester', 'ปิดเรื่อง'), 'รอ FN ปิดเรื่อง');
  // ใบเก่าที่ยังไม่มี `requesterDept` (ก่อน mig 0270 / backfill ไม่ถึง) ต้องอ่านออก
  assert.equal(requestWaitLabel({}, 'requester', 'ทำต่อ'), 'รอผู้ขอทำต่อ');
  assert.equal(requestWaitLabel({}, 'dept', 'ตอบ'), 'รอฝ่ายผู้รับตอบ');
});
