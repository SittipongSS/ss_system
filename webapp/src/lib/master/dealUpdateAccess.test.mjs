// ด่านสิทธิ์เธรดของดีล + ชุดชนิดของฟีดดีล (ย้ายมาจาก sales_deal_activities, mig 0169)
//
// ⚠️ การย้ายท่อแบบนี้พังได้เงียบสองแบบ และเทสต์ชุดนี้กันไว้ทั้งสอง:
//   1) ด่านเพี้ยนจากของเดิม — คนที่เคยโพสต์ได้กลายเป็นโพสต์ไม่ได้ (หรือแย่กว่า:
//      คนนอกทีมโพสต์ได้) โดยไม่มีใครสั่งให้เปลี่ยน
//   2) ชุด kind หล่น — ป้าย/สีที่ผู้ใช้คุ้นหายไปหลังย้าย ทั้งที่ตั้งใจย้ายเฉย ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPostUpdate, canViewUpdates } from './updateAccess.js';
import {
  authorableKinds, isAuthorableKind, kindAcceptsDueDate, updateKindMeta,
} from './updateTypes.js';

const db = null;   // ด่านของดีลตัดสินจาก record ล้วน ไม่ query ต่อ

const OWNER = { id: 'U-AE', role: 'ae', department: 'SA', team: 'KA' };
const SAME_TEAM_LEAD = { id: 'U-SUP', role: 'ae_supervisor', department: 'SA', team: 'KA' };
const OTHER_TEAM = { id: 'U-AE2', role: 'ae', department: 'SA', team: 'KB' };
const ADMIN = { id: 'U-AD', role: 'admin', department: 'SA' };
const OUTSIDER = { id: 'U-ST', role: 'staff', department: 'PC' };

const deal = (over = {}) => ({ id: 'D1', team: 'KA', ownerId: 'U-AE', ...over });

test('ดีล: เจ้าของโพสต์ได้ · คนนอกฝ่ายขายแตะไม่ได้เลย', async () => {
  const d = deal();
  assert.equal(await canPostUpdate(db, 'deal', d, OWNER), true);
  assert.equal(await canPostUpdate(db, 'deal', d, ADMIN), true);
  // staff ฝ่ายผลิต/จัดซื้อ ไม่ได้อยู่ในระบบวางแผนการขาย — ต้องไม่เห็นและไม่โพสต์
  assert.equal(await canViewUpdates(db, 'deal', d, OUTSIDER), false);
  assert.equal(await canPostUpdate(db, 'deal', d, OUTSIDER), false);
});

test('ดีล: หัวหน้าทีมเดียวกันเข้าถึงได้ตามขอบเขตเดิมของระบบขาย', async () => {
  const d = deal();
  assert.equal(await canViewUpdates(db, 'deal', d, SAME_TEAM_LEAD), true);
  assert.equal(await canPostUpdate(db, 'deal', d, SAME_TEAM_LEAD), true);
});

test('ดีล: ดีลทีมอื่นที่ไม่ใช่ของเรา โพสต์ไม่ได้', async () => {
  const d = deal({ team: 'KB', ownerId: 'U-SOMEONE' });
  assert.equal(await canPostUpdate(db, 'deal', d, OWNER), false);
});

test('ดีล: ไม่มี record = ปิดตาย ไม่ใช่ปล่อยผ่าน', async () => {
  assert.equal(await canViewUpdates(db, 'deal', null, ADMIN), false);
  assert.equal(await canPostUpdate(db, 'deal', null, ADMIN), false);
});

test('ชุดชนิดของฟีดดีลต้องครบห้าตัวเท่าของเดิม (CHECK ของ mig 0063)', () => {
  // ชื่อต้องตรงกับ CHECK เดิมเป๊ะ ไม่งั้น backfill ของ mig 0169 จะได้ kind ที่
  // ทะเบียนไม่รู้จัก แล้วขึ้นจอเป็นป้ายผิด
  assert.deepEqual(authorableKinds('deal'), ['note', 'call', 'meeting', 'email', 'next_step']);
});

test('ฟีดดีล: กำหนดวันมีเฉพาะ "ขั้นถัดไป" เหมือนของเดิม', () => {
  assert.equal(kindAcceptsDueDate('deal', 'next_step'), true);
  for (const k of ['note', 'call', 'meeting', 'email']) {
    assert.equal(kindAcceptsDueDate('deal', k), false, `${k} ไม่ควรกรอกกำหนดวันได้`);
  }
});

test('ฟีดดีล: ป้าย/สี ยกมาจาก ACTIVITY_META เดิมครบ ไม่หล่นสี', () => {
  const expected = {
    note: 'บันทึก', call: 'โทร', meeting: 'ประชุม', email: 'อีเมล', next_step: 'ขั้นถัดไป',
  };
  for (const [kind, label] of Object.entries(expected)) {
    const meta = updateKindMeta('deal', kind);
    assert.equal(meta.label, label, `${kind} ป้ายเพี้ยน`);
    assert.ok(meta.color, `${kind} ไม่มีสี`);
  }
});

test('ฟีดดีลไม่มีชนิด comment — ค่าตั้งต้นต้องเป็น note ไม่ใช่หลุดไปค่ากลาง', () => {
  assert.equal(isAuthorableKind('deal', 'comment'), false);
  // ของเดิมตั้งต้นที่ 'note' (feedKind useState("note")) — ต้องคงไว้
  assert.equal(authorableKinds('deal')[0], 'note');
  assert.equal(updateKindMeta('deal', 'ไม่มีชนิดนี้').label, 'บันทึก');
});
