// ── ตัวเลือกวัน + ช่างแบบตาราง (P1 · มติเจ้าของ 10/11/2026) — ตัวตัดสินล้วน ─────────────────────────────────────
//
// ⭐ มติ: ตาราง 24 ชม. · เวลาทำการ จ–ส 08:30–17:30 (นอกนั้นจาง แต่เลือกได้) · ลากปัด 30 นาที · คลิก = ยาวเท่าที่ฝ่ายขายขอ
//    · นัด "ทั้งวัน" นับในภาระ · ทับ/เกินภาระ/นอกช่วงไซต์ = เตือน ไม่ห้าม
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MINUTES, WORK_END, WORK_START, askedSlot, clickSlot, dayStripCounts, dragToSlot, hhmm, slotRows,
  slotScrollStart, slotTimes, slotWarnings, weekdayOf, workingWindow,
} from './crewSlotGrid.js';
import { crewLoadPeople } from './scheduleQueue.js';

const DAY = '2026-11-18'; // พุธ
const SUNDAY = '2026-11-22';
const technicians = [
  { id: 'U-NATE', name: 'Nattawut' }, { id: 'U-PEERA', name: 'Peera' }, { id: 'U-PHU', name: 'Phuwadol' },
  { id: 'U-VEE', name: 'Veerachai' }, { id: 'U-WIT', name: 'Witthaya' }, { id: 'U-API', name: 'Apisith' },
];
const members = [
  { userId: 'U-NATE', teamCode: 'OPS' }, { userId: 'U-PEERA', teamCode: 'OPS' }, { userId: 'U-PHU', teamCode: 'OPS' },
  { userId: 'U-VEE', teamCode: 'OPS' }, { userId: 'U-WIT', teamCode: 'OPS' },
];
const teams = [{ code: 'OPS', name: 'Operations' }];
const workload = { S1: { assets: 2, packs: 1 }, S2: { assets: 6, packs: 2 }, S3: { assets: 9, packs: 3 }, S4: { assets: 4, packs: 2 }, S5: { assets: 3, packs: 1 } };
const visits = [
  { id: 'V1', code: 'SV-18', status: 'scheduled', scheduledDate: DAY, siteId: 'S1', assigneeId: 'U-NATE', startTime: '13:30:00', endTime: '15:00:00' },
  { id: 'V2', code: 'SV-21', status: 'scheduled', scheduledDate: DAY, siteId: 'S2', assigneeId: 'U-PEERA', assistantIds: ['U-WIT'], startTime: '09:30:00', endTime: '11:30:00' },
  { id: 'V3', code: 'SV-25', status: 'scheduled', scheduledDate: DAY, siteId: 'S3', assigneeId: 'U-PHU' },
  { id: 'V4', code: 'SV-30', kind: 'install', status: 'draft', installRequestId: 'R9', tsConfirmedAt: '2026-11-10T03:00:00Z', scheduledDate: DAY, siteId: 'S4', assigneeId: 'U-VEE', startTime: '13:00:00', endTime: '16:00:00' },
  { id: 'V5', code: 'SV-40', status: 'scheduled', scheduledDate: DAY, siteId: 'S5', assigneeId: 'U-WIT', startTime: '21:00:00', endTime: '23:30:00' },
  { id: 'V6', code: 'SV-99', status: 'draft', scheduledDate: DAY, siteId: 'S1', assigneeId: 'U-API', startTime: '10:00:00', endTime: '11:00:00' },
  { id: 'V7', code: 'SV-77', status: 'scheduled', scheduledDate: '2026-11-19', siteId: 'S1', assigneeId: 'U-NATE', startTime: '10:00:00', endTime: '11:00:00' },
];
const grid = (over = {}) => slotRows({ visits, workload, technicians, members, teams, dateIso: DAY, siteLoad: { assets: 4, packs: 2 }, ...over });
const rowOf = (g, id) => g.rows.find((r) => r.id === id);

test('เวลาทำการ: จ–ส 08:30–17:30 · อาทิตย์ไม่มี · วันในสัปดาห์จากปฏิทินล้วน', () => {
  assert.equal(weekdayOf(DAY), 3);
  assert.deepEqual(workingWindow(DAY), { start: WORK_START, end: WORK_END });
  assert.deepEqual(workingWindow('2026-11-21'), { start: WORK_START, end: WORK_END }, 'เสาร์ทำงาน');
  assert.equal(workingWindow(SUNDAY), null);
  assert.equal(workingWindow('bad'), null);
});

test('ลาก: ปัดเป็นช่อง 30 นาทีที่ครอบ · ลากถอยหลังได้ · อย่างน้อยหนึ่งช่อง · ไม่ล้นวัน', () => {
  assert.deepEqual(dragToSlot(605, 772), { start: 600, end: 780 });
  assert.deepEqual(dragToSlot(772, 605), { start: 600, end: 780 }, 'ลากขวาไปซ้าย');
  assert.deepEqual(dragToSlot(610, 612), { start: 600, end: 630 });
  assert.deepEqual(dragToSlot(1435, 1500), { start: 1410, end: DAY_MINUTES });
});

test('ที่ฝ่ายขายขอ: มีเวลา = ช่วงนั้น · ทั้งวัน = เวลาทำการ · ไม่มีวัน = null', () => {
  assert.deepEqual(askedSlot({ requestedDate: DAY, requestedStartTime: '09:00:00', requestedEndTime: '12:00:00' }), { date: DAY, start: 540, end: 720, allDay: false, length: 180 });
  assert.deepEqual(askedSlot({ requestedDate: DAY }), { date: DAY, start: WORK_START, end: WORK_END, allDay: true, length: WORK_END - WORK_START });
  assert.equal(askedSlot({}), null);
});

test('คลิกช่องเดียว: ยาวเท่าที่ฝ่ายขายขอ · ขอทั้งวัน = 08:30–17:30 · ไม่มีที่ขอ = ความยาวเดิม/1 ชม. · ล้นเที่ยงคืนดันถอย', () => {
  const asked = askedSlot({ requestedDate: DAY, requestedStartTime: '09:00', requestedEndTime: '12:00' });
  assert.deepEqual(clickSlot(612, { asked }), { start: 600, end: 780 });
  assert.deepEqual(clickSlot(612, { asked: askedSlot({ requestedDate: DAY }) }), { start: WORK_START, end: WORK_END });
  assert.deepEqual(clickSlot(612, { currentLength: 90 }), { start: 600, end: 690 });
  assert.deepEqual(clickSlot(612), { start: 600, end: 660 });
  assert.deepEqual(clickSlot(1400, { asked }), { start: 1260, end: DAY_MINUTES });
});

test('แถว: ภาระชุดเดียวกับ crewLoadPeople · ถ้าเลือก → x/12 · เกินภาระ · กลุ่มตามทีม', () => {
  const g = grid();
  const base = crewLoadPeople({ visits, dateIso: DAY, workload, technicians });
  for (const p of base) assert.equal(rowOf(g, p.id).assets, p.assets, p.id);
  assert.deepEqual([rowOf(g, 'U-NATE').projected, rowOf(g, 'U-NATE').over], [6, false]);
  assert.deepEqual([rowOf(g, 'U-PHU').assets, rowOf(g, 'U-PHU').projected, rowOf(g, 'U-PHU').over], [9, 13, true], 'นัดทั้งวันนับในภาระ');
  assert.deepEqual(g.groups.map((x) => [x.label, x.rows.length]), [['Operations', 5], ['ไม่ระบุทีม', 1]]);
});

test('บล็อก: บนตาราง · จองไว้ · ไปช่วย · กะดึก · นัดไม่ระบุเวลา = ชิปทั้งวัน · ร่างอื่น/วันอื่นไม่ขึ้น', () => {
  const g = grid();
  assert.deepEqual(rowOf(g, 'U-NATE').blocks.map((b) => [b.code, b.kind, b.start, b.end]), [['SV-18', 'live', 810, 900]]);
  assert.deepEqual(rowOf(g, 'U-VEE').blocks.map((b) => [b.code, b.kind]), [['SV-30', 'reserved']]);
  assert.deepEqual(rowOf(g, 'U-WIT').blocks.map((b) => [b.code, b.kind, b.start]), [['SV-21', 'assist', 570], ['SV-40', 'live', 1260]]);
  assert.deepEqual(rowOf(g, 'U-PHU').blocks, []);
  assert.deepEqual(rowOf(g, 'U-PHU').allDay, [{ id: 'V3', code: 'SV-25', assets: 9, reserved: false }]);
  assert.deepEqual(rowOf(g, 'U-API').blocks, [], 'ร่างที่ไม่ได้จองไม่ขึ้น');
  assert.equal(rowOf(g, 'U-VEE').reserved, 1);
});

test('บล็อก: รู้แค่เวลาเริ่ม = วาด 1 ชม. ติดธง · นัดที่กำลังแก้ไม่นับเป็นของตัวเอง', () => {
  const open = slotRows({ visits: [{ id: 'X', code: 'SV-X', status: 'scheduled', scheduledDate: DAY, siteId: 'S1', assigneeId: 'U-NATE', startTime: '10:00' }], workload, technicians, dateIso: DAY });
  assert.deepEqual(rowOf(open, 'U-NATE').blocks.map((b) => [b.start, b.end, b.endUnknown]), [[600, 660, true]]);
  const g = grid({ excludeVisitId: 'V4' });
  assert.deepEqual([rowOf(g, 'U-VEE').blocks.length, rowOf(g, 'U-VEE').reserved], [0, 0]);
});

test('เตือน: ทับ (บอกจองไว้/ไปช่วย) · เกินภาระ · นอกช่วงไซต์ · นอกเวลาทำการ · อาทิตย์ — เตือนอย่างเดียว', () => {
  const g = grid();
  const site = { accessFrom: '10:00', accessTo: '20:00' };
  assert.deepEqual(slotWarnings({ row: rowOf(g, 'U-NATE'), start: 600, end: 780, site, dateIso: DAY }), [], 'ช่วงในม็อก = ผ่านทุกข้อ');
  assert.deepEqual(slotWarnings({ row: rowOf(g, 'U-VEE'), start: 720, end: 900, site, dateIso: DAY }).map((w) => w.text), ['เวลาทับ SV-30 13:00–16:00 (จองไว้)']);
  assert.deepEqual(slotWarnings({ row: rowOf(g, 'U-WIT'), start: 540, end: 600, site, dateIso: DAY }).map((w) => w.key), ['overlap-V2', 'access']);
  assert.equal(slotWarnings({ row: rowOf(g, 'U-PHU'), start: 600, end: 780, site, dateIso: DAY })[0].tone, 'danger');
  assert.deepEqual(slotWarnings({ row: rowOf(g, 'U-API'), start: 1260, end: 1380, dateIso: DAY }).map((w) => w.key), ['offhours']);
  assert.deepEqual(slotWarnings({ row: rowOf(g, 'U-API'), start: 600, end: 660, dateIso: SUNDAY }).map((w) => w.key), ['offday']);
});

test('แถบวัน: ว่างกี่คน (จองไว้/ไปช่วย = ไม่ว่าง) · ร่างที่กำลังแก้ไม่นับ · บอกวันทำงาน', () => {
  const [day, next, sunday] = dayStripCounts({ visits, technicians, dates: [DAY, '2026-11-19', SUNDAY] });
  assert.deepEqual([day.free, day.total, day.workday], [1, 6, true], 'เหลือ Apisith คนเดียว (ร่างของเขาไม่นับ)');
  assert.equal(next.free, 5);
  assert.deepEqual([sunday.free, sunday.workday], [6, false]);
  assert.equal(dayStripCounts({ visits, technicians, dates: [DAY], excludeVisitId: 'V4' })[0].free, 2);
});

test('เปิดตาราง: เลื่อนไปช่วงทำงาน — 08:30 เว้นแต่ที่ขอ/นัดแรกเช้ากว่า · ถอยหนึ่งชั่วโมง ปัดต้นชั่วโมง', () => {
  assert.equal(slotScrollStart({ rows: [] }), 420);
  assert.equal(slotScrollStart({ rows: [], asked: askedSlot({ requestedDate: DAY, requestedStartTime: '06:30', requestedEndTime: '08:00' }) }), 300);
  assert.equal(slotScrollStart({ rows: grid().rows }), 420, 'นัดแรก 09:30 ไม่เช้ากว่า 08:30');
});

test('ค่าที่ส่งฟอร์ม: HH:MM · สุดวัน 24:00 = 23:59 (ตัวตรวจเวลาทั้งระบบรับถึง 23:59)', () => {
  assert.deepEqual(slotTimes({ start: 600, end: 780 }), { startTime: '10:00', endTime: '13:00' });
  assert.deepEqual(slotTimes({ start: 1260, end: DAY_MINUTES }), { startTime: '21:00', endTime: '23:59' });
  assert.equal(hhmm(DAY_MINUTES), '23:59');
});
