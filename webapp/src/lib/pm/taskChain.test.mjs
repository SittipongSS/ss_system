import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainBlockReason, chainStatusOnLink, daysWaiting, followersToUnlock, isChainBlocked } from './taskChain';

const TODAY = '2026-08-17';

test('chainStatusOnLink: ผูกกับงานที่ยังไม่เสร็จ = ล็อกเป็นรอคนอื่นพร้อมเหตุผล', () => {
  const out = chainStatusOnLink('Pending', { id: 'A', title: 'ส่งตัวอย่างให้ลูกค้า', status: 'In Progress' }, TODAY);
  assert.equal(out.status, 'Blocked');
  assert.equal(out.blockedReason, 'รองาน “ส่งตัวอย่างให้ลูกค้า” ให้เสร็จก่อน');
  assert.equal(out.blockedSince, TODAY);
});

test('chainStatusOnLink: งานก่อนหน้าเสร็จแล้ว = ไม่แทรกแซง', () => {
  assert.equal(chainStatusOnLink('Pending', { id: 'A', title: 'ก', status: 'Completed' }, TODAY), null);
});

test('chainStatusOnLink: ไม่ได้ผูกงานก่อนหน้า = ไม่แทรกแซง', () => {
  assert.equal(chainStatusOnLink('Pending', null, TODAY), null);
});

test('chainStatusOnLink: สั่งปิดงานมาเอง = ไม่ถูกเด้งกลับไปรอ (บันทึกงานย้อนหลังทั้งสาย)', () => {
  assert.equal(chainStatusOnLink('Completed', { id: 'A', title: 'ก', status: 'Pending' }, TODAY), null);
});

test('chainBlockReason: ไม่มีชื่องานก่อนหน้า = ยังอ่านรู้เรื่อง', () => {
  assert.equal(chainBlockReason(''), 'รองานก่อนหน้าให้เสร็จก่อน');
});

test('isChainBlocked: เทียบที่สถานะของใบก่อนหน้าเท่านั้น', () => {
  assert.equal(isChainBlocked({ status: 'Pending' }), true);
  assert.equal(isChainBlocked({ status: 'Completed' }), false);
  assert.equal(isChainBlocked(null), false);
});

test('followersToUnlock: ปลดเฉพาะใบที่ยังติดล็อก — ใบที่ลงมือ/ปิดไปแล้วห้ามถูกดึงกลับ', () => {
  const rows = [
    { id: 'B', status: 'Blocked' },
    { id: 'C', status: 'In Progress' },
    { id: 'D', status: 'Completed' },
    { id: 'E', status: 'Pending' },
  ];
  assert.deepEqual(followersToUnlock(rows).map((t) => t.id), ['B']);
  assert.deepEqual(followersToUnlock(), []);
});

test('daysWaiting: นับจากวันที่เริ่มรอ · ไม่มีข้อมูล = null', () => {
  assert.equal(daysWaiting({ blockedSince: '2026-08-10' }, TODAY), 7);
  assert.equal(daysWaiting({ blockedSince: '2026-08-20' }, TODAY), 0); // ตั้งวันอนาคตมา = ไม่ติดลบ
  assert.equal(daysWaiting({}, TODAY), null);
});

/* ── สองเคสที่เจอตอน scrutinize (ก่อน merge) ──────────────────────────────
   ตรรกะจริงอยู่ในเส้น PATCH ของ API เทสต์นี้ตรึง **สัญญาของ helper** ที่เส้นนั้นใช้
   ไม่ให้ใครมาผ่อนกฎทีหลังโดยไม่รู้ตัว */

test('chainStatusOnLink: งานที่คนปลดไปทำแล้ว (In Progress) ยังถูกล็อกซ้ำได้ถ้าเรียกมันอีก', () => {
  // ⇒ ผู้เรียกต้องเรียกเฉพาะตอนลิงก์ "เปลี่ยนจริง" ไม่ใช่ตอนมีคีย์ predecessorId ในคำขอ
  const out = chainStatusOnLink('In Progress', { id: 'A', title: 'ก', status: 'In Progress' }, TODAY);
  assert.equal(out.status, 'Blocked');
});

test('followersToUnlock: ใช้ได้ทั้งตอนปิดงานและตอนลบงาน — คืนเฉพาะใบที่ยังติดล็อก', () => {
  const rows = [{ id: 'B', status: 'Blocked' }, { id: 'C', status: 'Pending' }];
  assert.deepEqual(followersToUnlock(rows).map((t) => t.id), ['B']);
});

test('UNLOCK_PATCH: ปลดล็อกแล้วต้องล้างเหตุผลและวันเริ่มรอไปพร้อมกัน', async () => {
  const { UNLOCK_PATCH } = await import('./taskChain');
  assert.deepEqual(UNLOCK_PATCH, { status: 'Pending', blockedReason: null, blockedSince: null });
});
