import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GRID_SLOTS, addDays, clashIn, dayOccupancy, dragRange, freeFrom, freeUntil, gridBlocks, hhmm, minutesOf,
  roomBookingsOn, slotOf, stripDays, thaiMinutes, weekdayOf,
} from "./appointmentGrid.js";
import { appointmentRangeOf } from "./leadAppointments.js";

const DATE = "2026-11-11";
/* แถวนัดแบบที่ API คืน — เวลาเป็น UTC (ไทย −7) */
const row = (id, room, start, end, over = {}) => ({
  id, leadId: `L-${id}`, room, mode: "onsite_at_office", source: "meeting",
  startAt: `${DATE}T${start}:00+07:00`, endAt: `${DATE}T${end}:00+07:00`, endedAt: null, ...over,
});
const ROWS = [
  row("a", "studio_01", "10:30", "12:00"),
  row("b", "studio_01", "13:30", "15:00", { source: "intake" }),
  row("c", "studio_02", "09:00", "18:00"),
  row("d", "studio_03", "07:30", "08:30"), // นอกช่วงตารางทั้งก้อน
  row("x", "studio_03", "11:00", "12:00", { endedAt: "2026-11-06T01:00:00Z", endedReason: "cancelled" }),
  { ...row("o", null, "10:00", "11:00"), mode: "online" },
];

test("นาทีไทยจากจุดเวลา UTC · แปลงไปกลับ", () => {
  assert.equal(thaiMinutes("2026-11-11T06:30:00.000Z"), 13 * 60 + 30);
  assert.equal(thaiMinutes("2026-11-10T17:30:00Z"), 30, "00:30 ไทยของวันที่ 11");
  assert.equal(hhmm(13 * 60 + 30), "13:30");
  assert.equal(minutesOf("09:05"), 9 * 60 + 5);
  assert.equal(minutesOf("9:5"), null);
  assert.equal(minutesOf("25:00"), null);
});

test("แถบวัน: 14 วันจากวันนี้ · เสาร์–อาทิตย์/วันหยุดติดป้ายแต่ยังอยู่ในแถบ (กดได้)", () => {
  const days = stripDays("2026-11-05", { holidayOf: (d) => (d === "2026-11-16" ? "วันหยุดชดเชย" : null) });
  assert.equal(days.length, 14);
  assert.equal(days[0].date, "2026-11-05");
  assert.equal(days[0].today, true);
  assert.equal(days[13].date, "2026-11-18");
  assert.deepEqual(days.filter((d) => d.weekend).map((d) => d.date), ["2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15"]);
  assert.equal(days.find((d) => d.date === "2026-11-16").holiday, "วันหยุดชดเชย");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekdayOf("2026-11-11"), 3);
  assert.deepEqual(stripDays("ไม่ใช่วัน"), []);
});

test("นัดของวันนั้นที่ใช้ห้อง: ตัดนัด Online และนัดที่ปิดแล้ว · คนละวันไม่มา", () => {
  const ids = roomBookingsOn(ROWS, DATE).map((r) => r.id);
  assert.deepEqual(ids, ["d", "c", "a", "b"]);
  assert.equal(roomBookingsOn(ROWS, "2026-11-12").length, 0);
});

test("ความแน่นรายห้องนับเฉพาะ 09:00–18:00 · ห้องเต็มวัน = 1 · นัดของลีดตัวเองไม่นับ", () => {
  const occ = dayOccupancy(ROWS, DATE);
  assert.deepEqual(occ.rooms, [3 / 9, 1, 0]);
  assert.equal(occ.freeMinutes, 6 * 60 + 0 + 9 * 60);
  assert.equal(occ.full, false);
  assert.deepEqual(dayOccupancy(ROWS, DATE, { leadId: "L-a" }).rooms, [1.5 / 9, 1, 0]);
  // นัดซ้อนกันในห้องเดียวต้องไม่นับซ้ำ
  const overlap = [row("p", "studio_03", "10:00", "12:00"), row("q", "studio_03", "11:00", "13:00")];
  assert.equal(dayOccupancy(overlap, DATE).rooms[2], 3 / 9);
});

test("ก้อนในตาราง: คอลัมน์/ความยาวเป็นช่อง 30 นาที · นัดนอกช่วงไปอยู่ outside ไม่หายไป", () => {
  const { blocks, outside } = gridBlocks(ROWS, DATE, { leadId: "L-b" });
  const a = blocks.find((b) => b.id === "a");
  assert.equal(a.col, 3);
  assert.equal(a.span, 3);
  assert.equal(a.roomIndex, 0);
  const c = blocks.find((b) => b.id === "c");
  assert.deepEqual([c.col, c.span], [0, GRID_SLOTS]);
  assert.equal(blocks.find((b) => b.id === "b").own, true, "นัดของลีดนี้ติดธง own");
  assert.deepEqual(outside.map((r) => r.id), ["d"]);
  assert.equal(slotOf(9 * 60), 0);
  assert.equal(slotOf(17 * 60 + 59), 17);
  assert.equal(slotOf(18 * 60), null);
});

test("ชน: ช่วงครึ่งเปิด — จบ 12:00 กับเริ่ม 12:00 ไม่ชน · นัดของลีดตัวเองไม่ชน", () => {
  assert.equal(clashIn(ROWS, DATE, "studio_01", 11 * 60, 12 * 60 + 30).id, "a");
  assert.equal(clashIn(ROWS, DATE, "studio_01", 12 * 60, 13 * 60 + 30), null);
  assert.equal(clashIn(ROWS, DATE, "studio_01", 13 * 60 + 30, 15 * 60, { leadId: "L-b" }), null);
  assert.equal(clashIn(ROWS, DATE, "studio_03", 11 * 60, 12 * 60), null, "นัดที่ยกเลิกแล้วคืนห้องแล้ว");
});

test("ว่างถึง/ว่างตั้งแต่: ขอบนัดถัดไป/ก่อนหน้า หรือขอบตาราง", () => {
  assert.equal(freeUntil(ROWS, DATE, "studio_01", 12 * 60), 13 * 60 + 30);
  assert.equal(freeUntil(ROWS, DATE, "studio_01", 15 * 60), 18 * 60);
  assert.equal(freeUntil(ROWS, DATE, "studio_01", 11 * 60), 11 * 60, "จุดเริ่มตกในนัดคนอื่น = ว่าง 0 นาที");
  assert.equal(freeFrom(ROWS, DATE, "studio_01", 13 * 60), 12 * 60);
  assert.equal(freeFrom(ROWS, DATE, "studio_03", 13 * 60), 9 * 60);
});

test("กด–ลาก: ลากเกินขอบนัดคนอื่นไม่ได้ (หยุดที่ขอบ + capped) · ลากย้อนก็หยุด · กดบนนัดคนอื่น = null", () => {
  // Studio 01 ว่าง 12:00–13:30 · กดที่ 12:00 (ช่อง 6) ลากถึง 14:00 (ช่อง 10)
  assert.deepEqual(dragRange(ROWS, DATE, "studio_01", 6, 10), { start: 12 * 60, end: 13 * 60 + 30, capped: true, limit: 13 * 60 + 30 });
  assert.deepEqual(dragRange(ROWS, DATE, "studio_01", 6, 7), { start: 12 * 60, end: 13 * 60, capped: false, limit: 13 * 60 + 30 });
  // กดเฉย ๆ = 30 นาที
  assert.deepEqual(dragRange(ROWS, DATE, "studio_03", 4, 4), { start: 11 * 60, end: 11 * 60 + 30, capped: false, limit: 18 * 60 });
  // ลากย้อนจาก 13:00 (ช่อง 8) ถึง 10:00 (ช่อง 2) — นัด 10:30–12:00 ขวางอยู่ ⇒ เริ่มได้เร็วสุด 12:00
  const back = dragRange(ROWS, DATE, "studio_01", 8, 2);
  assert.deepEqual([back.start, back.end, back.capped], [12 * 60, 13 * 60 + 30, true]);
  assert.equal(dragRange(ROWS, DATE, "studio_02", 4, 6), null, "Studio 02 เต็มทั้งวัน");
  // นัดของลีดตัวเองลากทับได้ (AE ยืนยันนัดเดิม)
  assert.equal(dragRange(ROWS, DATE, "studio_01", 9, 11, { leadId: "L-b" }).end, 15 * 60);
});

test("ช่วงที่ API นัดหมายอ่าน: วันเดียว หรือ from–to ไม่เกิน 45 วัน", () => {
  assert.deepEqual(appointmentRangeOf({ date: "2026-11-11" }), { error: null, fromIso: "2026-11-10T17:00:00.000Z", untilIso: "2026-11-11T17:00:00.000Z" });
  assert.deepEqual(appointmentRangeOf({ from: "2026-11-05", to: "2026-11-18" }), { error: null, fromIso: "2026-11-04T17:00:00.000Z", untilIso: "2026-11-18T17:00:00.000Z" });
  assert.match(appointmentRangeOf({ from: "2026-11-18", to: "2026-11-05" }).error, /ไม่มาก่อน/);
  assert.match(appointmentRangeOf({ from: "2026-11-01", to: "2027-01-01" }).error, /ไม่เกิน 45 วัน/);
  assert.match(appointmentRangeOf({}).error, /YYYY-MM-DD/);
});

test("CSS ของตารางรองรับทุกคอลัมน์/ความยาว/แถว และระดับความแน่น 0–10", () => {
  const css = readFileSync(path.resolve(process.cwd(), "src/components/salesPlanning/LeadAppointmentFields.module.css"), "utf8");
  for (let i = 0; i < GRID_SLOTS; i += 1) assert.match(css, new RegExp(`\\[data-col="${i}"\\] \\{ grid-column-start: ${i + 2}; \\}`));
  for (let i = 1; i <= GRID_SLOTS; i += 1) assert.match(css, new RegExp(`\\[data-span="${i}"\\] \\{ grid-column-end: span ${i}; \\}`));
  for (let i = 0; i < 3; i += 1) assert.match(css, new RegExp(`\\[data-row="${i}"\\] \\{ grid-row: ${i + 2}; \\}`));
  for (let i = 1; i <= 10; i += 1) assert.match(css, new RegExp(`\\[data-fill="${i}"\\]::after`));
});
