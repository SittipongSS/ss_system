// ── ใบค้างก่อนเปิดระบบ — คิว "รอออกใบค่าสรรพสามิต" ของ SA (แผนรื้อสรรพสามิต หมวด 11 · มติ D6 · PR6c) ─────────────
//
// มติ D6 (28/10): เปิดระบบเมื่อ PR6 ขึ้น · ใบค้างทั้งหมด (49 SO ณ 26/10) เข้าคิว SA พร้อมป้าย "ก่อนเปิดระบบ"
// ลำดับ: ใบที่ราคา/ทะเบียนครบ → ใบที่ยังไม่มีทะเบียน → ใบที่รอเติมราคาขายปลีก (ออกใบไม่ได้จนกว่าจะมีราคา — มติ Q3)
// (ใบที่เก็บค่าภาษีนอกระบบไปแล้ว = SA กด "ไม่เรียกเก็บในระบบ" บน SO — ออกจากคิวเอง ระบบเดาแทนไม่ได้)
// ⚠️ ไฟล์บริสุทธิ์ — ตัวโหลดคิว (handoffQueueData) กับตัวจัดแถวแดชบอร์ด (myQueue) ใช้ตัวเดียวกัน
import { businessDayKey } from '@/lib/datePeriods';

/** วันเปิดระบบใบค่าสรรพสามิต (PR6c ขึ้น prod) — SO ที่อนุมัติก่อนวันนี้ = ใบค้างก่อนเปิดระบบ */
export const EXCISE_SYSTEM_LAUNCH_DATE = '2026-11-03';

export const BACKLOG_READINESS = Object.freeze({
  ready: { rank: 0, label: 'ราคา/ทะเบียนครบ — ออกใบได้เลย' },
  missing_registration: { rank: 1, label: 'ยังไม่มีทะเบียนสรรพสามิต (ออกใบได้ · RA ต้องอนุมัติทะเบียนก่อนยื่นกรม)' },
  missing_price: { rank: 2, label: 'รอเติมราคาขายปลีก — ออกใบไม่ได้จนกว่าจะมีราคา' },
});

/** SO อนุมัติก่อนเปิดระบบไหม — วันตามนาฬิกาไทย (`businessDayKey` · อนุมัติ 06:30 น. ไทย = 23:30 UTC ของเมื่อวาน) · ไม่มีวันอนุมัติ = ไม่ติดป้าย */
export const isBeforeExciseLaunch = (order) => {
  const day = order?.approvedAt ? businessDayKey(order.approvedAt) : null;
  return Boolean(day) && day < EXCISE_SYSTEM_LAUNCH_DATE;
};

/** ความพร้อมของใบจากบรรทัดใบยื่น (resolveSoFiling) — ขาดราคาหนักกว่าขาดทะเบียน (ออกใบไม่ได้เลย) */
export function backlogReadiness(lines = []) {
  if ((lines || []).some((line) => line.taxBaseMissing)) return 'missing_price';
  if ((lines || []).some((line) => line.needsRegistration)) return 'missing_registration';
  return 'ready';
}

/** เรียงคิว: พร้อมก่อน → ขาดทะเบียน → ขาดราคา · ในกลุ่มเดียวกันเก่าสุดก่อน */
export function sortBacklog(orders = []) {
  const rank = (order) => BACKLOG_READINESS[order.readiness]?.rank ?? 0;
  return [...(orders || [])].sort((a, b) => rank(a) - rank(b) || String(a.approvedAt || '').localeCompare(String(b.approvedAt || '')));
}
