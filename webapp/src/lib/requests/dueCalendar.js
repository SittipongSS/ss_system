// ── ปฏิทินคำสัญญาของฝ่าย — สัปดาห์นี้ต้องส่งอะไรบ้าง (ล้วน ไม่แตะจอ) ─────
//
// ⭐ **`committedDueDate` คือวันที่ฝ่ายให้ไว้เอง ไม่ใช่วันที่ลูกค้าขอ** (มติผู้ใช้
// 2026-08-12 · แบบ ข) — หน้าภาพรวมบอกได้แค่ "เลยกำหนดกี่ใบ" ซึ่งเป็นการ**รายงานหลัง
// เกิดเหตุ** · สิ่งที่ฝ่ายต้องการคือเห็นว่า **วันไหนรับปากไว้เยอะแล้ว** ก่อนจะรับปาก
// ใบใหม่ ⇒ เครื่องมือกันไม่ให้เลยกำหนด ไม่ใช่เครื่องมือนับว่าเลยไปแล้วกี่ใบ
//
// ⚠️ **ข้อจำกัดที่รู้อยู่ตั้งแต่ตอนเลือกแบบ** — วันที่ทำ 8 จาก 15 ใบในคิวจริง *ยังไม่มี
// ใครให้วัน* ⇒ ปฏิทินจะโล่งกว่าความจริงมาก · จึงต้องคู่กับตัวเลข "ยังไม่ได้ให้วัน"
// ที่กดไปคิวได้เสมอ (`undated`) ไม่งั้นคนอ่านจะสรุปว่าสัปดาห์นี้ว่าง
import { liveDueDate } from '@/lib/requests/dueRound';

const DAY_MS = 86400000;

export const WEEKDAY_LABELS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * วันจันทร์ของสัปดาห์ที่มี `todayIso` อยู่ — `offset` = เลื่อนกี่สัปดาห์ (ลบ = ย้อนหลัง)
 *
 * ⚠️ **สัปดาห์เริ่มวันจันทร์** ไม่ใช่วันอาทิตย์ — ปฏิทินนี้อ่านเพื่อวางแผนงาน
 * เสาร์-อาทิตย์จึงต้องอยู่ท้ายแถวติดกัน ไม่ใช่คร่อมหัวท้าย
 * ⚠️ คำนวณด้วย UTC ล้วน — `todayIso` ผ่าน `businessDate()` (โซนไทย) มาแล้ว
 * เอา Date ของเครื่องมาคิดต่อจะเลื่อนวันตอนตี 5 ของทุกวัน
 */
export function weekStart(todayIso, offset = 0) {
  const base = Date.parse(`${String(todayIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(base)) return null;
  const dow = new Date(base).getUTCDay();          // 0 = อาทิตย์
  const backToMonday = (dow + 6) % 7;              // จันทร์ = 0
  return iso(base - backToMonday * DAY_MS + offset * 7 * DAY_MS);
}

/** เจ็ดวันของสัปดาห์ — `{ iso, label, weekend, today }` */
export function weekDays(startIso, { todayIso = null } = {}) {
  const base = Date.parse(`${String(startIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(base)) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const day = iso(base + i * DAY_MS);
    return {
      iso: day,
      label: WEEKDAY_LABELS[i],
      dayOfMonth: Number(day.slice(8, 10)),
      weekend: i >= 5,
      today: !!todayIso && day === String(todayIso).slice(0, 10),
    };
  });
}

/**
 * ปฏิทินหนึ่งสัปดาห์ — คืน `{ start, end, days, dated, undated, overdue }`
 *
 * `rows` = ใบของฝ่ายที่ยังไม่จบ (ผู้เรียกกรองมาแล้ว — ฟังก์ชันนี้ไม่ตัดสินฝ่าย/สิทธิ์)
 *
 * ⚠️ **`undated` นับจากทั้งคิว ไม่ใช่แค่สัปดาห์นี้** — มันคือ "ของที่ยังไม่มีใครรับปาก
 * วันไหน" ซึ่งไม่ได้อยู่ในสัปดาห์ไหนเลยโดยนิยาม · เป็นตัวเลขที่ต้องอยู่คู่ปฏิทินเสมอ
 * ⚠️ **ใบที่เลยกำหนดแล้วไม่ถูกยัดเข้าวันนี้** — มันอยู่วันของมันเอง (ในอดีต) ⇒ ถ้า
 * สัปดาห์ที่ดูอยู่ไม่ครอบวันนั้น มันจะไม่โผล่ · `overdue` จึงนับแยกไว้ให้จอเตือนได้
 */
export function dueCalendar(rows = [], { startIso, todayIso = null } = {}) {
  const start = startIso || weekStart(todayIso);
  const days = weekDays(start, { todayIso }).map((day) => ({ ...day, items: [] }));
  const byIso = new Map(days.map((day) => [day.iso, day]));
  let undated = 0;
  let overdue = 0;
  let dated = 0;

  for (const request of rows) {
    const due = liveDueDate(request)?.slice(0, 10) || null;
    if (!due) { undated += 1; continue; }
    dated += 1;
    const late = !!todayIso && due < String(todayIso).slice(0, 10);
    if (late) overdue += 1;
    const day = byIso.get(due);
    if (!day) continue;                            // อยู่นอกสัปดาห์ที่กำลังดู
    day.items.push({
      id: request.id,
      docNo: request.docNo || 'ร่าง',
      title: request.title || request.customerName || '',
      // จำนวนบรรทัด = "หนักแค่ไหน" (กติกาเดียวกับสายพานบนหน้าเดียวกัน)
      lines: Array.isArray(request.items) ? request.items.length : 0,
      urgent: !!request.urgent,
      overdue: late,
    });
  }

  return {
    start,
    end: days.at(-1)?.iso || start,
    days,
    // จำนวนใบที่ตกอยู่ในสัปดาห์นี้จริง ๆ — ใช้บนหัวข้อ ไม่ใช่ `dated` ทั้งคิว
    inWeek: days.reduce((n, day) => n + day.items.length, 0),
    dated,
    undated,
    overdue,
  };
}

/**
 * ข้อความช่วงวันของสัปดาห์ — "10 – 16 ส.ค. 2026" · ข้ามเดือนเขียนสองเดือน
 *
 * ⚠️ ประกอบเองไม่ได้ — เดือนย่อภาษาไทยอยู่ใน `lib/format.js` (`fmtDayMonth`) ที่เดียว
 * (ratchet ห้ามเรียก `toLocaleDateString` เอง — ม-105) ⇒ ผู้เรียกส่งตัวจัดรูปแบบเข้ามา
 */
export function weekRangeText(start, end, { fmtDayMonth, fmtDate }) {
  if (!start || !end) return '';
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${Number(start.slice(8, 10))} – ${fmtDate(end)}`
    : `${fmtDayMonth(start)} – ${fmtDate(end)}`;
}
