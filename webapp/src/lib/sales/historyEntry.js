// ตรรกะล้วนของหน้ากรอก "ยอดขายย้อนหลัง" (/sa/targets/history)
//
// ยอดย้อนหลังกรอกได้เฉพาะ "ยอดรวมทั้งบริษัท" ไม่แบ่งทีม — ทีมขายเพิ่งแบ่งจริงเมื่อ
// มิถุนายน 2026 ตัวเลขก่อนหน้านั้นไม่มีเจ้าของทีม การให้กรอกรายทีมย้อนหลังจึงเป็นการ
// เดาที่ไปโผล่บนกราฟเทียบการเติบโตเหมือนเป็นข้อมูลจริง

export const MONTHS_IN_YEAR = 12;

// ปีปัจจุบัน + ย้อนหลัง 3 ปี — ต้องมีปีปัจจุบันด้วยเพราะเดือนต้นปีที่ยังไม่ได้ใช้ระบบ
// (ม.ค.–พ.ค. 2026) ก็ต้องกรอกย้อนหลังเหมือนกัน
export function historyYearOptions(now = new Date(), span = 4) {
  const current = now.getFullYear();
  return Array.from({ length: span }, (_, i) => String(current - i));
}

// เดือนที่ยังมาไม่ถึงกรอกไม่ได้ — ยอดขายของอนาคตไม่มีอยู่จริง
export function isMonthEditable(year, monthIdx, now = new Date()) {
  const y = Number(year);
  if (!Number.isFinite(y) || monthIdx < 0 || monthIdx >= MONTHS_IN_YEAR) return false;
  const currentYear = now.getFullYear();
  if (y < currentYear) return true;
  if (y > currentYear) return false;
  return monthIdx <= now.getMonth();
}

export function monthsSum(values = []) {
  return values.reduce((sum, value) => {
    const n = Number(value);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

// ยอดรวมทั้งปีที่แก้เองได้: ตราบใดที่ผู้ใช้ยังไม่แตะช่องนี้ ให้ตามผลรวมรายเดือนไป
// (ปีที่มีตัวเลขรายเดือนครบ) · แตะเมื่อไรถือว่าคนคุมเอง ห้ามเขียนทับ (บางปีรู้แค่ยอดรวม)
export function resolveYearTotal({ months = [], override = null }) {
  const sum = monthsSum(months);
  if (override === null || override === undefined || override === '') return { total: sum, mismatch: false };
  const typed = Number(override);
  if (!Number.isFinite(typed)) return { total: sum, mismatch: false };
  // ต่างกันเกิน 1 บาทถึงเตือน — กันเตือนเพราะเศษสตางค์จากการปัด
  return { total: typed, mismatch: sum > 0 && Math.abs(typed - sum) > 1 };
}
