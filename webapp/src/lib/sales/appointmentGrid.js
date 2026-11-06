// ตารางห้อง Studio ทั้งวัน (แบบ ก · มติเจ้าของ 06/11/2026 · ม็อก artifact HrCnMzft1fFKoDaESrMEd4)
//
// เจ้าของ 05/11: "เลือกวันเวลายังดูยากเวลาดูว่าว่างหรือไม่ว่าง" — ของเดิมต้องพิมพ์วัน + เวลาเริ่ม–จบก่อน
// แผ่นห้องถึงบอกว่าว่างไหม (เห็นทีละช่วง · ไม่เห็นภาพทั้งวัน · ไม่รู้ว่าวันอื่นว่างกว่า) ⇒ แบบ ก:
//   แถบวัน 2 สัปดาห์ (ความแน่นรายห้อง) → ตาราง 3 ห้อง × 09:00–18:00 ช่องละ 30 นาที → กด–ลากช่วงที่ว่าง
//
// ไฟล์นี้เป็นกติกาบริสุทธิ์ของตาราง (เทสต์ได้โดยไม่ต้องมีจอ) · เวลาทั้งหมดเป็น **นาทีนับจากเที่ยงคืนตามเวลาไทย**
// แปลงจากจุดเวลาด้วย businessDayKey/businessTimeKey ตัวเดียวกับทั้งเว็บ (memory thai-time-display)
// ⚠️ ช่วงครึ่งเปิด [เริ่ม, จบ) เหมือน EXCLUDE ของ mig 0424 — จบ 15:00 กับเริ่ม 15:00 ไม่ชน

import { businessDayKey, businessTimeKey } from "@/lib/datePeriods";
import { STUDIO_ROOMS } from "@/lib/sales/leadAppointments";

export const GRID_OPEN = 9 * 60;
export const GRID_CLOSE = 18 * 60;
export const GRID_STEP = 30;
export const GRID_SLOTS = (GRID_CLOSE - GRID_OPEN) / GRID_STEP; // 18 — CSS รองรับ data-col/data-span ตามนี้
/** จำนวนวันบนแถบวัน (นับวันนี้) */
export const STRIP_DAYS = 14;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

/** นาทีจากเที่ยงคืนตามเวลาไทยของจุดเวลา ISO · ไม่ใช่เวลา = null */
export function thaiMinutes(iso) {
  const t = businessTimeKey(iso);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

export const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "HH:MM" → นาที (ค่าจากฟอร์ม) · ไม่ใช่เวลา = null */
export function minutesOf(text) {
  const match = String(text || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]); const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** วันในปฏิทินถัดไป n วัน (สตริงวันล้วน — เลขคณิตปฏิทิน ไม่ขยับโซน) */
export function addDays(date, n) {
  if (!DATE_RE.test(String(date || ""))) return null;
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** วันในสัปดาห์ 0 = อาทิตย์ */
export function weekdayOf(date) {
  return DATE_RE.test(String(date || "")) ? new Date(`${date}T00:00:00Z`).getUTCDay() : null;
}

/**
 * วันบนแถบ — เริ่มที่วันนี้ (วันไทย) ยาว STRIP_DAYS วัน
 * ⚠️ เสาร์–อาทิตย์/วันหยุด **ยังกดได้** แค่ขึ้นว่าวันหยุด — บล็อกแล้วนัดที่บริษัทเปิดพิเศษจะไม่มีทางลง (ทางตัน)
 * @param holidayOf (date) → ชื่อวันหยุด | null
 */
export function stripDays(today, { count = STRIP_DAYS, holidayOf = () => null } = {}) {
  if (!DATE_RE.test(String(today || ""))) return [];
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i);
    const weekday = weekdayOf(date);
    const holiday = holidayOf(date) || null;
    return { date, weekday, today: i === 0, weekend: weekday === 0 || weekday === 6, holiday };
  });
}

/** นัดของวันนั้นที่ใช้ห้อง — ตัดเป็นนาทีไทย (นัดข้ามเที่ยงคืนไม่มีในงานนี้ · ตัดที่ขอบวัน) */
export function roomBookingsOn(rows = [], date) {
  const out = [];
  for (const row of rows) {
    if (!row?.room || !STUDIO_ROOMS.includes(row.room) || row.endedAt) continue;
    if (businessDayKey(row.startAt) !== date) continue;
    const start = thaiMinutes(row.startAt);
    let end = thaiMinutes(row.endAt);
    if (start == null || end == null) continue;
    if (businessDayKey(row.endAt) !== date || end <= start) end = 24 * 60;
    out.push({ ...row, start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * ความแน่นของแต่ละห้องในวันนั้น (เฉพาะช่วง 09:00–18:00) — แถบเล็ก 3 เส้นใต้วันที่บนแถบวัน
 * @returns {{ rooms: number[] (0–1 ต่อห้อง), freeMinutes: number, full: boolean }}
 */
export function dayOccupancy(rows = [], date, { leadId = null } = {}) {
  const span = GRID_CLOSE - GRID_OPEN;
  const bookings = roomBookingsOn(rows, date).filter((row) => !leadId || row.leadId !== leadId);
  const rooms = STUDIO_ROOMS.map((room) => {
    const own = bookings.filter((row) => row.room === room);
    let busy = 0;
    let cursor = GRID_OPEN;
    for (const row of own) { // เรียงตามเวลาเริ่มแล้ว · รวมช่วงที่ซ้อนกันไม่ให้นับซ้ำ
      const s = Math.max(row.start, cursor, GRID_OPEN);
      const e = Math.min(row.end, GRID_CLOSE);
      if (e > s) { busy += e - s; cursor = e; }
    }
    return Math.min(1, busy / span);
  });
  const freeMinutes = rooms.reduce((sum, share) => sum + Math.round((1 - share) * span), 0);
  return { rooms, freeMinutes, full: rooms.every((share) => share >= 1) };
}

/** ช่องของตาราง — ช่องที่นาทีนั้นตกอยู่ (0–17) · นอกช่วง = null */
export function slotOf(minutes) {
  if (minutes == null || minutes < GRID_OPEN || minutes >= GRID_CLOSE) return null;
  return Math.floor((minutes - GRID_OPEN) / GRID_STEP);
}

/**
 * ก้อนนัดที่วาดในตาราง — ตัดที่ขอบ 09:00–18:00 · นัดที่อยู่นอกช่วงทั้งก้อนไปอยู่ `outside` (ต้องยังเห็น ไม่ใช่หายไป
 * — บทเรียนเดียวกับรางชั่วโมงของกำหนดการของฉัน) · `own` = นัดของลีดใบนี้เอง (ไม่นับว่าชน)
 */
export function gridBlocks(rows = [], date, { leadId = null } = {}) {
  const blocks = [];
  const outside = [];
  for (const row of roomBookingsOn(rows, date)) {
    const own = !!leadId && row.leadId === leadId;
    if (row.end <= GRID_OPEN || row.start >= GRID_CLOSE) { outside.push({ ...row, own }); continue; }
    const s = Math.max(row.start, GRID_OPEN);
    const e = Math.min(row.end, GRID_CLOSE);
    const col = Math.floor((s - GRID_OPEN) / GRID_STEP);
    const span = Math.max(1, Math.ceil((e - GRID_OPEN) / GRID_STEP) - col);
    blocks.push({ ...row, own, col, span, roomIndex: STUDIO_ROOMS.indexOf(row.room) });
  }
  return { blocks, outside };
}

/** นัดของคนอื่นที่ชนช่วง [start, end) ในห้องนี้ */
export function clashIn(rows = [], date, room, start, end, { leadId = null } = {}) {
  return roomBookingsOn(rows, date).find((row) => row.room === room
    && (!leadId || row.leadId !== leadId) && row.start < end && start < row.end) || null;
}

/** ห้องว่างจาก `start` ไปได้ถึงเมื่อไร (นัดถัดไปของคนอื่น หรือ 18:00) */
export function freeUntil(rows = [], date, room, start, { leadId = null } = {}) {
  const next = roomBookingsOn(rows, date)
    .filter((row) => row.room === room && (!leadId || row.leadId !== leadId) && row.end > start)
    .sort((a, b) => a.start - b.start)[0];
  if (next && next.start <= start) return start; // จุดเริ่มตกในนัดของคนอื่น
  return next ? Math.min(next.start, GRID_CLOSE) : GRID_CLOSE;
}

/** ห้องว่างย้อนจาก `end` ไปได้ถึงเมื่อไร (จบของนัดก่อนหน้า หรือ 09:00) */
export function freeFrom(rows = [], date, room, end, { leadId = null } = {}) {
  const prev = roomBookingsOn(rows, date)
    .filter((row) => row.room === room && (!leadId || row.leadId !== leadId) && row.start < end)
    .sort((a, b) => b.end - a.end)[0];
  return prev ? Math.max(prev.end, GRID_OPEN) : GRID_OPEN;
}

/**
 * ช่วงที่ได้จากการกด–ลาก — จุดที่กด (`anchor`) ถึงช่องที่นิ้ว/เมาส์อยู่ (`current`) ในห้องเดียวกัน
 * **ลากทับนัดคนอื่นไม่ได้** หยุดที่ขอบนัด (มติข้อ 3: ชน = บล็อก) · `capped` = ลากเกินขอบนัด (จอบอกเหตุ)
 * @returns {{ start, end, capped, limit } | null} null = จุดที่กดเป็นนัดของคนอื่น
 */
export function dragRange(rows = [], date, room, anchorSlot, currentSlot, { leadId = null } = {}) {
  const anchor = GRID_OPEN + anchorSlot * GRID_STEP;
  if (clashIn(rows, date, room, anchor, anchor + GRID_STEP, { leadId })) return null;
  if (currentSlot >= anchorSlot) {
    const limit = freeUntil(rows, date, room, anchor, { leadId });
    const wanted = GRID_OPEN + (currentSlot + 1) * GRID_STEP;
    return { start: anchor, end: Math.min(wanted, limit), capped: wanted > limit, limit };
  }
  const limit = freeFrom(rows, date, room, anchor + GRID_STEP, { leadId });
  const wanted = GRID_OPEN + currentSlot * GRID_STEP;
  return { start: Math.max(wanted, limit), end: anchor + GRID_STEP, capped: wanted < limit, limit };
}
