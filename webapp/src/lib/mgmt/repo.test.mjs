import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInYearOrNull, listTasks, listMeetings } from './repo.js';

// ── ตัวกรองปีต้องไม่กลืนแถวที่ยังไม่มีวันที่ ──────────────────────────────
// เทสต์นี้ตรวจ "รูปของ query ที่ส่งไป PostgREST" ไม่ได้ตรวจผลจาก Postgres จริง —
// สิ่งที่กันไว้คือการเผลอกลับไปใช้ .gte/.lte ตรง ๆ ซึ่งทำให้แถว dueDate = null
// หายจากลิสต์ทุกปี (NULL เทียบกับวันที่ไม่เคยเป็นจริงใน SQL)

// stub ของ supabase query builder: จดทุก method ที่ถูกเรียก แล้ว await ได้เหมือน query จริง
function fakeSupabase(rows = []) {
  const calls = [];
  const q = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve({ data: rows, error: null });
      return (...args) => { calls.push([prop, ...args]); return q; };
    },
  });
  return { supabase: { from: (table) => { calls.push(['from', table]); return q; } }, calls };
}
const callsTo = (calls, name) => calls.filter((c) => c[0] === name);

test('เงื่อนไขปีของ PostgREST ครอบ "ไม่มีวันที่" ไว้ด้วย', () => {
  assert.equal(
    dateInYearOrNull('dueDate', ['2026-01-01', '2026-12-31']),
    'dueDate.is.null,and(dueDate.gte.2026-01-01,dueDate.lte.2026-12-31)',
  );
});

test('listTasks กรองปีด้วย .or() ก้อนเดียว — ไม่ใช่ .gte/.lte ที่ทิ้งงานไม่มีกำหนด', async () => {
  const { supabase, calls } = fakeSupabase();
  await listTasks(supabase, { year: 2026 });

  assert.deepEqual(callsTo(calls, 'or'), [
    ['or', 'dueDate.is.null,and(dueDate.gte.2026-01-01,dueDate.lte.2026-12-31)'],
  ]);
  // 🐞 ของเดิม: .gte('dueDate', ...).lte('dueDate', ...) → งานที่ยังไม่กรอกวันสิ้นสุด
  // บันทึกติดแต่ไม่โผล่ในลิสต์อีกเลย ดูเหมือนข้อมูลหาย
  assert.equal(callsTo(calls, 'gte').length, 0);
  assert.equal(callsTo(calls, 'lte').length, 0);
  // งานไม่มีกำหนดอยู่ท้ายลิสต์ ไม่ใช่หัวลิสต์
  assert.deepEqual(callsTo(calls, 'order'), [['order', 'dueDate', { ascending: true, nullsFirst: false }]]);
});

test('listMeetings กันประตูเดียวกัน — วันที่ประชุมถูกล้างเป็นว่างตอนแก้ได้', async () => {
  const { supabase, calls } = fakeSupabase();
  await listMeetings(supabase, { year: 2025 });

  assert.deepEqual(callsTo(calls, 'or'), [
    ['or', 'meetingDate.is.null,and(meetingDate.gte.2025-01-01,meetingDate.lte.2025-12-31)'],
  ]);
  assert.equal(callsTo(calls, 'gte').length, 0);
  assert.deepEqual(callsTo(calls, 'order'), [['order', 'meetingDate', { ascending: false, nullsFirst: false }]]);
});

test('ไม่ส่งปีมา = ไม่กรองวันที่เลย (ตัวกรองอื่นยังทำงานตามเดิม)', async () => {
  const { supabase, calls } = fakeSupabase();
  await listTasks(supabase, { deptCode: 'MK', status: 'todo' });

  assert.equal(callsTo(calls, 'or').length, 0);
  assert.deepEqual(callsTo(calls, 'eq'), [['eq', 'deptCode', 'MK'], ['eq', 'status', 'todo']]);
  // แถวที่ถูกลบนุ่ม ๆ ยังต้องถูกตัดออกเสมอ ไม่ว่ากรองปีหรือไม่
  assert.deepEqual(callsTo(calls, 'is'), [['is', 'deletedAt', null]]);
});
