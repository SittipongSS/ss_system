// ── วันติดตามต่อของลีด (mig 0289 · มติผู้ใช้ 2026-08-25) ────────────────────
//
// `contacted` เคยเป็นสถานะเดียวในเส้นทางที่ **ไม่มีนาฬิกาเลย** — SLA จบที่
// `firstContactAt` แล้วลีดนอนอยู่ได้ตลอดกาลโดยไม่มีอะไรทวง (ตรวจจริง 2026-08-08:
// 14 ใบค้างข้ามเดือน ใบที่นานสุด 10 วันทำการ)
//
// สิ่งที่ต้องล็อก เรียงตามความเสียหายถ้าหลุด:
//   1) คอลัมน์ต้องถูก **ล้าง** ตอนตีกลับและตอนนัดประชุม — ไม่งั้นลีดใบเดียวมีสอง
//      กำหนด หรือกำหนดของเจ้าของคนเก่าฟื้นมาทวงเจ้าของคนใหม่
//   2) ด่านเดียวใช้ทั้งฟอร์มและ API (form-design-rules §2)
//   3) `followup` ต้องไม่ขยับสถานะ — แมปผิดเมื่อไรใบที่นัดแล้วถอยกลับทุกครั้งที่โทรตาม
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEAD_TRANSITIONS, TRANSITION_TO_STATUS, LEAD_FOLLOW_UP_ACTIONS, leadFollowUpError,
} from './leads.js';

const routeSrc = readFileSync(
  new URL('../../app/api/sales-planning/leads/[id]/transition/route.js', import.meta.url), 'utf8',
);

/* ── เส้นทาง ─────────────────────────────────────────────────────────────── */

test('followup ทำได้จาก contacted และ meeting — ไม่ใช่จาก assigned', () => {
  assert.ok(LEAD_TRANSITIONS.contacted.includes('followup'));
  assert.ok(LEAD_TRANSITIONS.meeting.includes('followup'));
  // ครั้งแรกใช้ `contact` (ซึ่งเลื่อนสถานะ) — มี followup ที่นี่ด้วยจะมีสองปุ่มทำเรื่องเดียวกัน
  assert.equal(LEAD_TRANSITIONS.assigned.includes('followup'), false);
});

/* ⚠️ null โดยเจตนา — แมปเป็น 'contacted' เมื่อไร ลีดที่นัดประชุมแล้วจะถอยกลับไป
   "ติดต่อแล้ว" ทุกครั้งที่โทรตาม ⇒ หลุดจากผัง Funnel และปุ่มก้าวถัดไปเพี้ยน
   (เหตุผลเดียวกับที่ `meeting → contact` ถูกปฏิเสธมาตั้งแต่ต้น) */
test('followup ไม่ขยับสถานะ', () => {
  assert.equal(TRANSITION_TO_STATUS.followup, null);
  assert.ok('followup' in TRANSITION_TO_STATUS, 'ต้องประกาศไว้ ไม่ใช่ undefined โดยบังเอิญ');
});

/* ── ด่านวันติดตาม ───────────────────────────────────────────────────────── */

test('ต้องระบุวันติดตามต่อ — ค่าว่างทุกรูปแบบตกด่าน', () => {
  for (const bad of [undefined, null, '']) assert.match(leadFollowUpError(bad), /ต้องระบุ/);
  assert.match(leadFollowUpError('ไม่ใช่วันที่'), /ไม่ถูกต้อง/);
  assert.equal(leadFollowUpError('2026-09-01'), '');
  assert.equal(leadFollowUpError('2026-09-01T03:00:00Z'), '');
});

test('บังคับวันติดตามทั้ง contact และ followup', () => {
  assert.deepEqual([...LEAD_FOLLOW_UP_ACTIONS].sort(), ['contact', 'followup']);
});

/* ⭐ ด่านเดียวใช้ทั้งสองฝั่ง — API เขียนเงื่อนไขเองเมื่อไร ฟอร์มกับปุ่มจะเริ่มไม่ตรงกัน
   แล้วผู้ใช้กดแล้วโดนตีกลับโดยไม่รู้ว่าเพราะอะไร */
test('API เรียก leadFollowUpError ตัวเดียวกับฟอร์ม ไม่เขียนเงื่อนไขซ้ำ', () => {
  assert.match(routeSrc, /leadFollowUpError\(body\.followUpAt\)/);
  assert.doesNotMatch(routeSrc, /body\.followUpAt\s*(?:\?\?|\|\|)\s*['"]/,
    'เห็นค่าถอยของ followUpAt ใน route = มีเงื่อนไขซ้อนอยู่นอกด่านกลาง');
});

/* ── การล้างคอลัมน์ ──────────────────────────────────────────────────────── */

/** ตัวเนื้อของสาขา `action === 'x'` ใน route (ตัดที่ else if ตัวถัดไป) */
const branch = (action) => {
  const head = routeSrc.indexOf(`action === '${action}'`);
  assert.ok(head > 0, `หาสาขา ${action} ใน route ไม่เจอ — เทสต์นี้ตาบอดแล้ว`);
  const rest = routeSrc.slice(head);
  const end = rest.indexOf('} else if');
  return end === -1 ? rest : rest.slice(0, end);
};

/* 🐞 บั๊กพี่น้องกับที่ mig 0234 แก้ให้ screenedAt/assignedAt ไปแล้ว: ตีกลับ = เริ่มรอบใหม่
   ล้างไม่ครบแล้ววันติดตามของเจ้าของคนเก่าจะฟื้นขึ้นมาบนลีดของเจ้าของคนใหม่
   ซึ่งไม่เคยรับปากอะไรไว้ แล้วระบบจะทวงเขาด้วยกำหนดของคนอื่น */
test('ตีกลับล้างวันติดตามด้วย — ครบชุดเดียวกับ firstContactAt/meetingAt', () => {
  const bounce = branch('bounce');
  for (const col of ['firstContactAt', 'meetingAt', 'followUpAt']) {
    assert.match(bounce, new RegExp(`patch\\.${col} = null`), `bounce ไม่ได้ล้าง ${col}`);
  }
});

/* ⚠️ วันประชุมแทนที่คำสัญญา "จะโทรกลับ" ไปแล้ว — ปล่อยทั้งคู่ไว้ = ลีดใบเดียวโผล่
   สองแถวในคิวของฉันด้วยกำหนดคนละวัน */
test('บันทึกนัดประชุมล้างวันติดตาม', () => {
  assert.match(branch('meeting'), /patch\.followUpAt = null/);
});

/* `contact` เท่านั้นที่ขยับ firstContactAt — `followup` เป็นครั้งที่สองขึ้นไป
   เขียนทับเมื่อไร SLA ติดต่อกลับจะถูกเลื่อนไปเรื่อย ๆ ตามการโทรตามครั้งล่าสุด */
test('followup ไม่แตะ firstContactAt (ไม่งั้น SLA ติดต่อกลับเลื่อนตามการโทรตาม)', () => {
  const shared = branch('contact');
  assert.match(shared, /if \(action === 'contact'\) patch\.firstContactAt/);
});
