// ── ภาระงาน AE ตอนมอบหมาย (ข้อ 3 ของแผนปิดช่องว่าง UI) ────────────────────
//
// 🔴 ปัญหาที่แก้: คนกระจายลีดเลือกจากรายชื่อล้วน ⇒ ใบไปกองกับคนที่นึกออก ไม่ใช่คนที่ว่าง
// ตัวเลขที่ต้องใช้มีอยู่ในตารางลีดครบตลอด แค่ไม่เคยถูกวางตรงจังหวะที่ตัดสินใจ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEAD_WORKLOAD_STATUSES, WORKLOAD_FIELDS, EMPTY_WORKLOAD,
  leadWorkloadFrom, workloadOf, withWorkload,
} from './leadWorkload.js';

const TODAY = '2026-08-25';
const row = (over = {}) => ({ assigneeId: 'ae-1', status: 'contacted', followUpAt: null, ...over });

test('นับสามช่องแยกกัน — ถืออยู่ / รอติดต่อ / เลยติดตาม', () => {
  const w = leadWorkloadFrom([
    row({ status: 'assigned' }),
    row({ status: 'contacted', followUpAt: '2026-08-20T00:00:00Z' }), // เลยแล้ว
    row({ status: 'meeting' }),
  ], TODAY);
  assert.deepEqual(w['ae-1'], { holding: 3, waitingContact: 1, lateFollowUp: 1 });
});

test('วันติดตามที่ยังไม่ถึง หรือถึงวันนี้พอดี ไม่นับว่าเลย', () => {
  const w = leadWorkloadFrom([
    row({ followUpAt: '2026-08-25T00:00:00Z' }),  // วันนี้
    row({ followUpAt: '2026-08-28T00:00:00Z' }),  // อนาคต
    row({ followUpAt: null }),                     // ไม่มีนัดติดตาม
  ], TODAY);
  assert.equal(w['ae-1'].lateFollowUp, 0);
  assert.equal(w['ae-1'].holding, 3);
});

test('แยกรายคน และข้ามแถวที่ไม่มีเจ้าของ', () => {
  const w = leadWorkloadFrom([
    row({ assigneeId: 'ae-1' }),
    row({ assigneeId: 'ae-2' }),
    row({ assigneeId: null }),
    row({ assigneeId: '' }),
  ], TODAY);
  assert.equal(w['ae-1'].holding, 1);
  assert.equal(w['ae-2'].holding, 1);
  assert.equal(Object.keys(w).length, 2);
});

/* 🪤 ผู้เรียกอาจลืมกรองสถานะ — ใบที่ปิดไปแล้วต้องไม่นับเป็นภาระ ไม่งั้น AE ที่ทำงานเยอะ
   จะดูเหมือนงานล้นตลอดกาล เพราะใบที่ปิดไปแล้วไม่มีวันหายจากตัวเลข */
test('สถานะนอกลิสต์ไม่นับ แม้หลุดเข้ามาในแถว', () => {
  const w = leadWorkloadFrom([
    row({ status: 'qualified' }),
    row({ status: 'disqualified' }),
    row({ status: 'new' }),
    row({ status: 'assigned' }),
  ], TODAY);
  assert.equal(w['ae-1'].holding, 1);
  assert.deepEqual(LEAD_WORKLOAD_STATUSES, ['assigned', 'contacted', 'meeting']);
});

test('คนที่ไม่มีใบค้างได้ศูนย์ ไม่ใช่ undefined', () => {
  const w = leadWorkloadFrom([row()], TODAY);
  assert.deepEqual(workloadOf(w, 'ae-9'), EMPTY_WORKLOAD);
  assert.deepEqual(workloadOf(null, 'ae-1'), EMPTY_WORKLOAD);
  assert.equal(workloadOf(w, 'ae-1').holding, 1);
});

test('withWorkload ติดตัวเลขเข้ากับรายชื่อ และไม่แตะของเดิมถ้าไม่มีตัวเลข', () => {
  const users = [{ id: 'ae-1', name: 'ก' }, { id: 'ae-2', name: 'ข' }];
  const w = leadWorkloadFrom([row({ status: 'assigned' })], TODAY);
  const withLoad = withWorkload(users, w);
  assert.equal(withLoad[0].load.waitingContact, 1);
  assert.equal(withLoad[1].load.holding, 0);
  assert.equal(users[0].load, undefined);        // ไม่แก้ของเดิม
  assert.equal(withWorkload(users, null), users); // ไม่มีตัวเลข = คืนชุดเดิมทั้งก้อน
});

/* ช่อง `alert` คือช่องที่ "มากกว่าศูนย์แล้วแปลว่าแย่" — หน้าจอทาสีจากธงนี้
   ถ้าธงหายไปจากตาราง ตัวเลขเลยติดตามจะกลายเป็นเลขเทา ๆ กลืนกับช่องนับเฉย ๆ */
test('มีช่องเตือนอยู่ช่องเดียว คือเลยติดตาม', () => {
  const alerts = WORKLOAD_FIELDS.filter((f) => f.alert).map((f) => f.key);
  assert.deepEqual(alerts, ['lateFollowUp']);
  assert.deepEqual(WORKLOAD_FIELDS.map((f) => f.key), Object.keys(EMPTY_WORKLOAD));
});

/* 🪤 เพดาน 1,000 แถวของ PostgREST ตัดเงียบ ๆ — ตัวเลขที่ต่ำกว่าจริงอ่านว่า "คนนี้ว่าง"
   ซึ่งพาใบไปกองกับคนที่งานล้นที่สุด แย่กว่าไม่มีตัวเลขให้ดูเลย */
test('route ภาระงานต้องไล่ทีละหน้า ไม่ใช่ select ก้อนเดียว', () => {
  const src = readFileSync(new URL('../../app/api/sales-planning/leads/workload/route.js', import.meta.url), 'utf8');
  assert.match(src, /fetchAllResult/);
  assert.match(src, /\.order\('id'/);
});
