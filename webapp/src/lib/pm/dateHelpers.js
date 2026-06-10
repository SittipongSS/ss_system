// Business-day + date helpers for PM (ported from ss-cj).
// ss-team ไม่มีตาราง holidays → ใช้ THAI_HOLIDAYS (hardcode) เป็นค่าตั้งต้น/ค่าถาวร.
// setHolidays/getHolidays คงไว้เผื่ออนาคตเชื่อมตาราง holidays.

/**
 * วันหยุดนักขัตฤกษ์ไทย (รวมวันหยุดชดเชย) — hardcode ปี 2025-2026
 * ⚠ ต้องตรวจสอบ/อัปเดตตามประกาศคณะรัฐมนตรีจริงทุกปี
 */
export const THAI_HOLIDAYS = new Set([
  // ----- 2025 -----
  '2025-01-01', '2025-02-12', '2025-04-07', '2025-04-14', '2025-04-15',
  '2025-04-16', '2025-05-01', '2025-05-05', '2025-05-12', '2025-06-03',
  '2025-07-10', '2025-07-11', '2025-07-28', '2025-08-12', '2025-10-13',
  '2025-10-23', '2025-12-05', '2025-12-10', '2025-12-31',
  // ----- 2026 (โดยประมาณ — รอประกาศ ครม. ยืนยัน) -----
  '2026-01-01', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14',
  '2026-04-15', '2026-05-01', '2026-05-04', '2026-05-31', '2026-06-01',
  '2026-06-03', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-12',
  '2026-10-13', '2026-10-23', '2026-12-07', '2026-12-10', '2026-12-31',
]);

let activeHolidays = new Set(THAI_HOLIDAYS);

export const setHolidays = (dates) => { activeHolidays = new Set(dates || []); };
export const getHolidays = () => activeHolidays;

/** แปลง Date เป็น 'YYYY-MM-DD' อิงเวลาท้องถิ่น (กันวันเพี้ยนจาก UTC) */
export const toLocalISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** เป็นวันทำการหรือไม่ (ไม่ใช่เสาร์/อาทิตย์ และไม่ใช่วันหยุด) */
export const isBusinessDay = (date, holidays = activeHolidays) => {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !holidays.has(toLocalISODate(date));
};

/** บวกจำนวน "วันทำการ" เข้ากับวันเริ่มต้น (ข้ามเสาร์-อาทิตย์ + วันหยุด) */
export const addBusinessDays = (startDate, numDays, holidays = activeHolidays) => {
  const result = new Date(startDate);
  if (!(result instanceof Date) || isNaN(result.getTime())) return result;
  let added = 0;
  while (added < numDays) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result, holidays)) added++;
  }
  return result;
};

/** นับวันทำการระหว่าง 2 วัน (ไม่นับวันเริ่ม นับถึงวันสิ้นสุด); บวกถ้า end>start */
export const countBusinessDays = (startDate, endDate, holidays = activeHolidays) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const sign = end >= start ? 1 : -1;
  let count = 0;
  const cursor = new Date(sign > 0 ? start : end);
  const target = new Date(sign > 0 ? end : start);
  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor, holidays)) count++;
  }
  return count * sign;
};

/** Format เป็น DD/MM/YYYY (ค.ศ.); '-' ถ้าว่าง/ไม่ถูกต้อง */
export const formatDate = (dateInput) => {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};
