// ── วันเริ่ม / วันสิ้นสุด ของดีลที่สร้างจาก FC สหมิตร ─────────────────────────
//
// มติผู้ใช้ 2026-10-15: "FC มีเดือนส่ง ถ้าดึงมาเป็นดีล จะกลายเป็นวันสิ้นสุด และวันเริ่ม
// คือวันที่คาดได้ PO"
//   startDate = วันที่คาดได้ PO   = สิ้นเดือนของ "เดือนคาดได้รับ PO" (วันเดียวกับ expectedCloseDate)
//   endDate   = เดือนส่งของใน FC = สิ้นเดือนของ `demandMonth`
//
// 🐞 เดิมดีลจาก FC ไม่มีสองช่องนี้เลย (insert ตรงด้วย service-role ข้ามด่าน
//    `dealRequiredFields`) ⇒ เปิดฟอร์มแก้ดีลแล้วบันทึกไม่ได้ ("กรุณากรอก วันที่เริ่ม ·
//    วันที่สิ้นสุด") และรายงานวางแผนผลิตต้องถอยไปอ่าน `metadata.demandMonth` แทน
// ⚠️ รายงานอ่านแค่ "เดือน" ของ endDate ⇒ ใช้สิ้นเดือนส่งของ = เดือนเดิมกับ demandMonth ยอดไม่ย้ายเดือน
// ⚠️ ไฟล์นี้เป็นสูตรล้วน (จอ import ได้) — ห้ามแตะฐานหรือ session

const MONTH = /^\d{4}-\d{2}$/;

/** สิ้นเดือนของ "YYYY-MM" (หรือวันที่เต็มที่ขึ้นต้นด้วยเดือนนั้น) — ไม่ใช่เดือนที่อ่านได้ = null */
export function lastDayOfMonth(month) {
  const key = String(month || '').slice(0, 7);
  if (!MONTH.test(key)) return null;
  const [year, mm] = key.split('-').map(Number);
  return new Date(Date.UTC(year, mm, 0)).toISOString().slice(0, 10);
}

/** วันของดีลจากเดือนคาดได้ PO + เดือนส่งของ — ขาดเดือนไหนก็คืน null ช่องนั้น */
export function fcDealDates({ poMonth, demandMonth }) {
  return { startDate: lastDayOfMonth(poMonth), endDate: lastDayOfMonth(demandMonth) };
}

/** เดือนส่งของมาก่อนเดือนคาดได้ PO = วันเริ่มเลยวันสิ้นสุด ⇒ ห้ามสร้าง (เดือนเท่ากันได้) */
export function deliveryBeforePo({ poMonth, demandMonth }) {
  const po = String(poMonth || '').slice(0, 7);
  const demand = String(demandMonth || '').slice(0, 7);
  return MONTH.test(po) && MONTH.test(demand) && demand < po;
}
