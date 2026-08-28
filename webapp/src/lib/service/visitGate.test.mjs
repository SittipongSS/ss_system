// ── ด่านเข้าไซต์ (mig 0302) ───────────────────────────────────────────────
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด (มติผู้ใช้ 2026-08-28):
//   "TS จะไม่สามารถสร้างการเข้าบริการได้เอง จนกว่าจะผ่านด่าน"
// และข้อจำกัดที่สำคัญพอ ๆ กัน: **ด่านต้องไม่กลายเป็นแรงเสียดทานรายวัน** —
// นัดที่ครบเงื่อนไขตั้งแต่แรกต้องขึ้นตารางเอง ไม่ต้องรอคนมากดปล่อยทีละใบ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_PHASE_READY,
  evaluateVisitGate,
  gateBlocker,
  gatePassed,
  gateReasons,
  gateSummary,
  initialVisitStatus,
} from './visitGate.js';

// ไซต์เข้าได้ จ–ศ 09:00–17:00
const site = {
  id: 'S1', name: 'Jim Thompson Outlet 93',
  accessDays: [1, 2, 3, 4, 5], accessFrom: '09:00', accessTo: '17:00',
};
// 2026-08-27 = วันพฤหัส · 2026-08-29 = วันเสาร์
const ok = { assigneeId: 'U1', assigneeName: 'ต้า', scheduledDate: '2026-08-27', startTime: '10:00', endTime: '12:00' };

test('ครบทุกข้อที่ตรวจได้ = ขึ้นตารางเลย ไม่ต้องให้คนมากดปล่อย', () => {
  const items = evaluateVisitGate(ok, { site });
  assert.equal(gatePassed(items), true);
  assert.equal(initialVisitStatus(ok, { site }), 'scheduled');
  assert.equal(gateBlocker(items), '');
});

test('ไม่มีช่าง = จอดเป็นร่าง และบอกว่าเป็นงานของ TS', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '' }, { site });
  assert.equal(initialVisitStatus({ ...ok, assigneeId: '' }, { site }), 'draft');
  const assignee = items.find((i) => i.key === 'assignee');
  assert.equal(assignee.state, 'blocked');
  assert.equal(assignee.owner, 'TS');
  assert.equal(assignee.fix, 'assignee');
});

test('นัดวันเสาร์ทั้งที่ไซต์ให้เข้า จ–ศ = ไม่ผ่านข้อช่วงเวลา', () => {
  const weekend = { ...ok, scheduledDate: '2026-08-29' };
  const items = evaluateVisitGate(weekend, { site });
  const access = items.find((i) => i.key === 'access');
  assert.equal(access.state, 'blocked');
  assert.ok(access.detail);
  assert.equal(initialVisitStatus(weekend, { site }), 'draft');
});

test('⭐ ปุ่มที่กดไม่ได้ต้องบอก **ทุกข้อที่ขาดในครั้งเดียว** ไม่ใช่ทีละข้อ', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '', scheduledDate: '2026-08-29' }, { site });
  const msg = gateBlocker(items);
  assert.match(msg, /ยังไม่มอบหมาย/);
  assert.match(msg, /เสาร์|ไซต์|เข้า/);
  assert.equal(msg.split(' · ').length >= 2, true);
});

test('⭐ ข้อที่ระบบยังตรวจให้ไม่ได้ ต้องขึ้นว่า parked — ห้ามติ๊กผ่านเงียบ ๆ', () => {
  assert.equal(CONTRACT_PHASE_READY, false, 'ยังไม่มีต้นฉบับสัญญาจ้างบริการในระบบ');
  const items = evaluateVisitGate(ok, { site });
  const parked = items.filter((i) => i.state === 'parked').map((i) => i.key);
  assert.deepEqual(parked, ['contract', 'payment']);
  for (const item of items.filter((i) => i.state === 'parked')) {
    assert.match(item.detail, /รอระบบสัญญา/);
  }
});

test('parked ไม่บล็อก — หยุดงานทั้งบริษัทเพราะฟีเจอร์ของเรายังไม่พร้อมไม่ได้', () => {
  assert.equal(gatePassed(evaluateVisitGate(ok, { site })), true);
});

test('⭐ วันที่ unpark สองข้อนั้นเริ่มบล็อกทันทีโดยไม่ต้องแก้ตรรกะ', () => {
  const items = evaluateVisitGate(ok, { site, contractPhaseReady: true });
  assert.equal(items.filter((i) => i.state === 'parked').length, 0);
  assert.equal(gateSummary(items).ok, 4);
});

test('ไม่รู้จักไซต์ = ตรวจข้อช่วงเวลาไม่ได้ ต้องไม่ระเบิดและไม่แกล้งบล็อก', () => {
  const items = evaluateVisitGate(ok, {});
  assert.equal(items.find((i) => i.key === 'access').state, 'ok');
  assert.equal(gatePassed(items), true);
});

test('นับผลรวมได้ครบ 4 ข้อเสมอ — จอไหนก็เห็นเท่ากัน', () => {
  const s = gateSummary(evaluateVisitGate({}, { site }));
  assert.equal(s.total, 4);
  assert.equal(s.parked, 2);
  assert.equal(s.blocked >= 1, true);
});

test('รายการเหตุแยกจากประโยคเต็ม — จอที่บอกบริบทอยู่แล้วไม่ต้องอ่านขีดซ้อนสามชั้น', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '' }, { site });
  assert.deepEqual(gateReasons(items), ['ยังไม่มอบหมาย — เลือกช่างก่อนปล่อยเข้าคิว']);
  assert.equal(gateBlocker(items), 'ยังเข้าคิวไม่ได้ — ยังไม่มอบหมาย — เลือกช่างก่อนปล่อยเข้าคิว');
  assert.deepEqual(gateReasons(evaluateVisitGate(ok, { site })), []);
});
