import { test } from 'node:test';
import assert from 'node:assert';
import {
  ASSUMED_MEETING_MINUTES, DEFAULT_SCHEDULE_VIEW,
  buildScheduleDueItems, clampSelected, clashCount, clusterDayMeetings, daysBetween,
  meetingSlot, normalizeScheduleView, scheduleByDay, scheduleRange, scheduleTotals,
  shiftAnchor, startOfWeek, weekIndex,
} from './mySchedule.js';

/* เวลาในเทสต์เขียนเป็น offset +07:00 ทุกจุด — ฟังก์ชันที่แบ่งช่องวัน/ช่องเวลาอ่านด้วย
   **เวลาท้องถิ่นของเครื่องที่รัน** ถ้าเขียน `Z` เทสต์จะผ่าน/ตกตาม TZ ของเครื่องคนรัน */
const at = (day, time) => `${day}T${time}:00+07:00`;

// ── ช่วงของแต่ละมุมมอง ──────────────────────────────────────────────────────
test('ช่วงมุมมองวัน = วันเดียว · สัปดาห์ = อาทิตย์ถึงเสาร์ · เดือน = 1 ถึงสิ้นเดือน', () => {
  assert.deepEqual(scheduleRange('day', '2026-08-21'), { from: '2026-08-21', to: '2026-08-21' });
  // 2026-08-21 = ศุกร์ ⇒ สัปดาห์เริ่มอาทิตย์ 16 จบเสาร์ 22 (เริ่มวันอาทิตย์ให้ตรงกับ MonthGrid)
  assert.deepEqual(scheduleRange('week', '2026-08-21'), { from: '2026-08-16', to: '2026-08-22' });
  assert.deepEqual(scheduleRange('month', '2026-08-21'), { from: '2026-08-01', to: '2026-08-31' });
});

test('สัปดาห์เริ่มวันอาทิตย์ — วันอาทิตย์เป็นต้นสัปดาห์ของตัวเอง ไม่ใช่ท้ายสัปดาห์ก่อน', () => {
  assert.equal(weekIndex('2026-08-16'), 0);
  assert.equal(startOfWeek('2026-08-16'), '2026-08-16');
  assert.equal(startOfWeek('2026-08-22'), '2026-08-16');
});

test('เดือนที่สั้นกว่ากันไม่ทำให้วันล้น — 31 ม.ค. เดินหน้าไปกุมภาพันธ์ ไม่ใช่ 3 มี.ค.', () => {
  assert.equal(shiftAnchor('month', '2026-01-31', 1).slice(0, 7), '2026-02');
  assert.deepEqual(scheduleRange('month', shiftAnchor('month', '2026-01-31', 1)),
    { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(shiftAnchor('day', '2026-08-31', 1), '2026-09-01');
  assert.equal(shiftAnchor('week', '2026-08-31', -1), '2026-08-24');
});

test('daysBetween ครอบคลุมปลายทั้งสองข้าง', () => {
  assert.equal(daysBetween('2026-08-16', '2026-08-22').length, 7);
  assert.deepEqual(daysBetween('2026-08-21', '2026-08-21'), ['2026-08-21']);
});

// ── วันที่เลือก ────────────────────────────────────────────────────────────
test('วันที่เลือกต้องอยู่ในช่วงที่กางเสมอ — หลุดช่วงแล้วตกมาที่วันนี้ ไม่ใช่ค้างวันเดิม', () => {
  const range = { from: '2026-08-16', to: '2026-08-22' };
  assert.equal(clampSelected('2026-08-20', range, '2026-08-21'), '2026-08-20');
  assert.equal(clampSelected('2026-07-01', range, '2026-08-21'), '2026-08-21');
  // วันนี้ก็ไม่อยู่ในช่วง (เลื่อนไปดูเดือนหน้า) ⇒ เอาวันแรกของช่วง
  assert.equal(clampSelected('2026-07-01', range, '2026-09-30'), '2026-08-16');
});

// ── การวางบล็อกในราง ───────────────────────────────────────────────────────
test('ช่องในราง: 09:00 = ช่องแรก · 09:30 = ช่องที่สอง · นอกช่วง 09:00–18:00 = ไม่มีช่อง', () => {
  assert.equal(meetingSlot(at('2026-08-21', '09:00')), 0);
  assert.equal(meetingSlot(at('2026-08-21', '09:30')), 1);
  assert.equal(meetingSlot(at('2026-08-21', '17:30')), 17);
  assert.equal(meetingSlot(at('2026-08-21', '08:59')), null);
  assert.equal(meetingSlot(at('2026-08-21', '18:00')), null);
});

test('นัดนอกช่วงเวลาทำงานต้องไม่หายไป — ไปอยู่ก้อน outside', () => {
  const { clusters, outside } = clusterDayMeetings([
    { id: 'a', at: at('2026-08-21', '07:30') },
    { id: 'b', at: at('2026-08-21', '11:00') },
  ]);
  assert.deepEqual(outside.map((meeting) => meeting.id), ['a']);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].items[0].id, 'b');
});

test(`นัดที่เริ่มห่างกันน้อยกว่า ${ASSUMED_MEETING_MINUTES} นาที = ชนกัน · ห่างเท่ากันพอดี = ไม่ชน`, () => {
  const clash = clusterDayMeetings([
    { id: 'a', at: at('2026-08-21', '09:30') },
    { id: 'b', at: at('2026-08-21', '10:00') },
  ]);
  assert.equal(clash.clusters.length, 1);
  assert.equal(clash.clusters[0].clash, true);
  assert.equal(clash.clusters[0].items.length, 2);

  const apart = clusterDayMeetings([
    { id: 'a', at: at('2026-08-21', '09:00') },
    { id: 'b', at: at('2026-08-21', '10:00') },
  ]);
  assert.equal(apart.clusters.length, 2);
  assert.equal(apart.clusters.every((cluster) => !cluster.clash), true);
  assert.equal(clashCount(apart.clusters.flatMap((cluster) => cluster.items)), 0);
});

test('สามใบชนกันนับเป็น 2 คู่ — เลขบนแถบสรุปต้องเป็นจำนวนใบที่ต้องเลื่อน', () => {
  assert.equal(clashCount([
    { id: 'a', at: at('2026-08-21', '09:00') },
    { id: 'b', at: at('2026-08-21', '09:15') },
    { id: 'c', at: at('2026-08-21', '09:45') },
  ]), 2);
});

// ── จัดของลงวัน ────────────────────────────────────────────────────────────
test('นัดแบ่งวันด้วยเวลาท้องถิ่น · งาน/คำร้องใช้สตริงวันตรง ๆ · ของนอกช่วงถูกทิ้ง', () => {
  const byDay = scheduleByDay({
    meetings: [
      { id: 'm1', at: at('2026-08-21', '11:00') },
      { id: 'm2', at: at('2026-08-22', '09:00') },
      { id: 'out', at: at('2026-09-01', '09:00') },
    ],
    due: [
      { key: 'task:1', kind: 'task', date: '2026-08-21' },
      { key: 'task:2', kind: 'task', date: '2026-07-01' },
    ],
    from: '2026-08-16',
    to: '2026-08-22',
  });
  assert.equal(byDay.size, 7);
  assert.deepEqual(byDay.get('2026-08-21').meetings.map((m) => m.id), ['m1']);
  assert.equal(byDay.get('2026-08-21').due.length, 1);
  assert.equal(byDay.get('2026-08-22').meetings.length, 1);
  assert.deepEqual(scheduleTotals(byDay), { meetings: 2, due: 1, clashes: 0 });
});

// ── งาน/คำร้อง ─────────────────────────────────────────────────────────────
test('งานไม่มีวันครบกำหนด = ไม่เข้าปฏิทิน (ไม่มีวันให้วาง ไม่ใช่ของที่ต้องเดาวันให้)', () => {
  const items = buildScheduleDueItems({
    tasks: [{ id: 'T1', title: 'งานไม่มีวัน' }, { id: 'T2', title: 'มีวัน', dueDate: '2026-08-21' }],
    todayIso: '2026-08-21',
  });
  assert.deepEqual(items.map((item) => item.id), ['T2']);
  assert.equal(items[0].overdue, false);
  assert.equal(items[0].days, 0);
});

test('คำร้องที่ฝ่ายรับปากแล้วนับว่าเลยกำหนดได้ · ใบที่ยังไม่รับปากไม่นับ (ไม่มีใครผิดสัญญา)', () => {
  const [committed, requested] = buildScheduleDueItems({
    requests: [
      { id: 'R1', title: 'รับปากแล้ว', committedDueDate: '2026-08-18', docNo: 'RQ-1' },
      { id: 'R2', title: 'ยังไม่รับปาก', requestedDueDate: '2026-08-19' },
    ],
    todayIso: '2026-08-21',
  });
  assert.equal(committed.overdue, true);
  assert.equal(committed.days, -3);
  assert.equal(committed.dateNote, 'ฝ่ายรับปากส่ง');
  assert.equal(requested.overdue, false);
  assert.match(requested.dateNote, /ยังไม่รับปาก/);
});

test('เรียงตามวัน แล้วด่วนก่อนเมื่อวันเท่ากัน', () => {
  const items = buildScheduleDueItems({
    tasks: [
      { id: 'A', title: 'ธรรมดา', dueDate: '2026-08-21' },
      { id: 'B', title: 'ด่วน', dueDate: '2026-08-21', urgent: true },
      { id: 'C', title: 'ก่อนหน้า', dueDate: '2026-08-19' },
    ],
    todayIso: '2026-08-21',
  });
  assert.deepEqual(items.map((item) => item.id), ['C', 'B', 'A']);
});

// ── มุมมองที่จำไว้ ─────────────────────────────────────────────────────────
test('ค่ามุมมองที่อ่านจาก storage ต้องถูกล้าง — ค่าขยะตกมาที่ค่าตั้งต้น ไม่ทำให้ปฏิทินว่าง', () => {
  assert.equal(normalizeScheduleView('day'), 'day');
  assert.equal(normalizeScheduleView('agenda'), DEFAULT_SCHEDULE_VIEW);
  assert.equal(normalizeScheduleView(null), DEFAULT_SCHEDULE_VIEW);
});
