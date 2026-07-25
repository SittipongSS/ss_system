// ปฏิทินทำการ "ขาดปี" หรือยัง — ตรรกะบริสุทธิ์ ไม่แตะ DB/DOM (เทสต์ได้ตรง ๆ)
//
// ทำไมต้องมี: holidaySet() ใน lib/master/holidays.js ตกไปใช้ THAI_HOLIDAYS ที่ hardcode ไว้
// **เฉพาะตอนตาราง holidays ว่างทั้งตาราง** เท่านั้น พอมีข้อมูลปีปัจจุบันอยู่แล้ว ปีที่ยังไม่ได้
// กรอกจะกลายเป็น "ไม่มีวันหยุดเลย" เงียบ ๆ — ไทม์ไลน์โครงการที่ข้ามไปปีนั้นจะนับวันหยุด
// เป็นวันทำการทั้งปีโดยไม่มีใครรู้ หน้าตั้งค่าจึงต้องเตือนก่อนถึงจุดนั้น

export const HOLIDAY_WARNING_FROM_MONTH = 10; // เริ่มเตือนถึงปีหน้าเมื่อเข้าไตรมาส 4

const yearOf = (holiday) => String(holiday?.date || '').slice(0, 4);

// นับจำนวนวันหยุดที่มีอยู่ในแต่ละปี → Map<'2027', 12>
export function holidayYearCounts(holidays = []) {
  const counts = new Map();
  for (const holiday of holidays) {
    const year = yearOf(holiday);
    if (!/^\d{4}$/.test(year)) continue;
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  return counts;
}

export function hasHolidaysForYear(holidays, year) {
  return (holidayYearCounts(holidays).get(String(year)) || 0) > 0;
}

// ปีที่ "ควรมีข้อมูลแล้วแต่ยังว่าง" — คืนเรียงจากน้อยไปมาก (ปกติมีไม่เกิน 2 ปี)
//   · ปีหน้า: เตือนเมื่อเข้าไตรมาส 4 แล้วเท่านั้น (ต้นปีเตือนก็เป็นเสียงรบกวนเปล่า ๆ)
//   · ปีที่ผู้ใช้กำลังเลื่อนปฏิทินไปดู: เตือนทันทีถ้าว่าง — ช่วยอธิบายว่าทำไมเดือนนั้นโล่ง
// ตารางว่างทั้งหมด = ยังไม่ได้ตั้งระบบ ปล่อยให้ empty state พูดแทน ไม่ต้องเตือนซ้อน
export function missingHolidayYears(holidays = [], today = new Date(), viewingYear = null) {
  if (!holidays.length) return [];

  const currentYear = today.getFullYear();
  const month = today.getMonth() + 1;
  const years = new Set();

  if (month >= HOLIDAY_WARNING_FROM_MONTH && !hasHolidaysForYear(holidays, currentYear + 1)) {
    years.add(currentYear + 1);
  }
  // ดูปีอดีตที่ว่างไม่ต้องเตือน — แก้ย้อนหลังไม่ได้และไม่กระทบไทม์ไลน์ข้างหน้า
  if (viewingYear && Number(viewingYear) >= currentYear && !hasHolidaysForYear(holidays, viewingYear)) {
    years.add(Number(viewingYear));
  }

  return [...years].sort((a, b) => a - b);
}
