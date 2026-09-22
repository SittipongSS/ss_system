/* ── ดีลอยู่ในงวดไหม — ตัวตัดสินเดียวของรายการดีล (/sa/deals) และไฟล์ FC รายหมวด ──────────
 * มติผู้ใช้ 2026-09-22: "ดีลในงวด" = **เดือนคาดปิดการขาย** อยู่ในงวด (แกนเดียวกับรายการดีลบนจอ)
 *   รายเดือน / ทุกเดือน → `forecastMonth` (= เดือนของ expectedCloseDate · ตรวจ prod 511/511 ใบตรงกัน)
 *   ช่วงวัน             → `expectedCloseDate` (วัน) อยู่ใน [from, to]
 * ⚠️ API รายการดีลกรองที่ query ด้วยกติกาเดียวกัน (route ของ deals) — เปลี่ยนที่นี่ต้องเปลี่ยนที่นั่นด้วย
 *    (เทสต์ dealPeriod.test.mjs อ่านซอร์ส route เทียบ)
 * ⚠️ ดีลที่ไม่มีทั้งวันคาดปิดและเดือน FC ไม่อยู่ในงวดไหนเลย (ขึ้นในตัวกรอง "รอเติมข้อมูล" แทน)
 */

const monthOf = (value) => (value ? String(value).slice(0, 7) : null);
const dayOf = (value) => (value ? String(value).slice(0, 10) : null);

/** เดือนคาดปิดของดีล — คอลัมน์ forecastMonth ก่อน แล้วค่อยเดือนของวันคาดปิด */
export const dealCloseMonth = (deal) => deal?.forecastMonth || monthOf(deal?.expectedCloseDate);

/** @param period ผลของ parseReportPeriod · null = ไม่จำกัดงวด (ทุกดีล) */
export function dealInReportPeriod(deal, period) {
  if (!period) return true;
  if (period.mode === 'range') {
    const day = dayOf(deal?.expectedCloseDate);
    return Boolean(day) && day >= period.from && day <= period.to;
  }
  const month = dealCloseMonth(deal);
  return Boolean(month) && (period.months || []).includes(month);
}
