// ── ยอด "Won รอยื่น SO" บนแดชบอร์ดขาย (มติผู้ใช้ 2026-09-14) ─────────────────────
//
// 🐞 ตรวจซ้ำ 2026-09-14: รับใบเสนอราคา = ดีลเป็น Won ทันที (mig 0284) ⇒ หลุดจาก FC คงเหลือ
//    แต่ SO เกิดเป็นร่าง (0285) ⇒ ไม่อยู่ในรออนุมัติ/Actual ⇒ ยอดคาดการณ์วูบเต็มมูลค่าดีล
//    จนกว่าจะกดยื่น SO (เกิดซ้ำหลังตีกลับ/ดึงกลับ/ยกเลิกด้วย) · ของจริงวันนั้น 42 ดีล ฿2,659,950
// ⇒ GET /api/sales-planning/dashboard ส่งกองที่สามเป็น **ช่องแยก** `wonAwaitingSo` (บาท = มูลค่าดีล)
//    + `wonAwaitingSoCount` (จำนวนดีล) ใน totals · byOwner[] · byTeam[] · byType[] ของทุกเดือน
//
// นิยาม/ยอด/เดือน อยู่ที่ตัวช่วยกลางใน lib/sales/dashboardMetrics (isWonAwaitingSo ฯลฯ) — ไฟล์นี้
// มีแค่ "ถัง" กับ "ตัวจับคู่งวดของลิ้นชัก" · ตัวรวมไม่อยู่ใน route เพราะ route.js ของ Next export ได้
// แค่ HTTP handler เทสต์จึงเรียกของใน route ตรง ๆ ไม่ได้ (แพตเทิร์นเดียวกับ pendingApprovalRollup)
//
// ⭐ **ขี่ลูป Won เดิม ไม่ใช่รอบแยก** (ต่างจากรออนุมัติ) — เดือนของกองนี้ = wonMonthOf ซึ่งเป็นเดือน
//    เดียวกับที่ดีล Won ถูกนับอยู่แล้ว ⇒ route บวกยอดลงถัง `b` ตัวเดียวกับที่ลูป Won บวก wonCount
//    ⇒ ถังคน/ทีม/หมวดของยอดนี้ตรงกับของ Won โดยโครงสร้าง ไม่ต้องมีตัวหาถังชุดใหม่
// ⭐ ถังที่มียอดนี้มี wonCount ≥ 1 เสมอ ⇒ ไม่มีวันเป็น "แถวผี" (isEmptyDashboardBucket ไม่ต้องแก้)
// ⛔ ไม่แตะ won / wonValue / wonCount / fcTotal / weighted / gap / variance / pendingApproval —
//    ใช้ได้แค่ยอดคาดการณ์ (projected) กับบรรทัดแสดงผล ห้ามไหลเข้า Actual / เป้า / % / ขาด-เกิน
import {
  wonAwaitingSoAmountOf,
  wonAwaitingSoCountOf,
  wonAwaitingSoMonthOf,
} from '@/lib/sales/dashboardMetrics';

/** ช่องตั้งต้นของทุกถัง (รวมถังที่มีแต่เป้า) — ไม่มีดีลรอยื่นก็ต้องมีช่องเป็น 0 (สัญญากับจอ: ห้ามขาดช่อง) */
export const wonAwaitingSoFields = () => ({ wonAwaitingSo: 0, wonAwaitingSoCount: 0 });

/** บวกยอดรอยื่น SO ของดีลเดียวลงถัง — แตะแค่สองช่องของตัวเอง · ดีลที่ไม่ใช่รอยื่นได้ +0 */
export function addWonAwaitingSo(bucket, deal) {
  if (!bucket) return bucket;
  bucket.wonAwaitingSo = (Number(bucket.wonAwaitingSo) || 0) + wonAwaitingSoAmountOf(deal);
  bucket.wonAwaitingSoCount = (Number(bucket.wonAwaitingSoCount) || 0) + wonAwaitingSoCountOf(deal);
  return bucket;
}

/**
 * ยอดรวมทั้งเดือนของกองรอยื่น SO
 * @param {object[]} wonDeals ดีล Won ของเดือนนั้น **ชุดเดียวกับที่ลูป Won ของ route รวมอยู่แล้ว**
 *   (isWonDeal && wonMonthOf === month) — ห้ามส่ง visibleDeals ทั้งก้อน ไม่งั้นได้ยอดทุกเดือนรวมกัน
 * @returns {{ wonAwaitingSo: number, wonAwaitingSoCount: number }}
 */
export function rollupWonAwaitingSo(wonDeals) {
  const totals = wonAwaitingSoFields();
  for (const d of wonDeals || []) addWonAwaitingSo(totals, d);
  return totals;
}

/** ดีลนี้อยู่ในกองรอยื่น SO (ยอด > 0 หรือนับเป็นหนึ่งดีล — ดีลมูลค่าว่างก็ยังนับ) */
export const hasWonAwaitingSo = (deal) => wonAwaitingSoAmountOf(deal) > 0 || wonAwaitingSoCountOf(deal) > 0;

/**
 * ตัวกรองของลิ้นชักรายดีล metric 'wonAwaitingSo' — กติกาเดียวกับที่ API ใส่ถังเดือน
 * @param {object} deal
 * @param {(monthKey: string|null) => boolean} inPeriod ตัวจับงวดของลิ้นชัก (เดือน/ทั้งปี/ทุกงวด)
 * ⚠️ ไม่มีเดือน = API ไม่เคยนับ (ถังเดือนเทียบ wonMonthOf === month) ต้องกันเอง —
 *    งวด "ทุกงวด" ตอบ inPeriod(null) = true
 */
export function wonAwaitingSoInPeriod(deal, inPeriod) {
  if (!hasWonAwaitingSo(deal)) return false;
  const month = wonAwaitingSoMonthOf(deal);
  return Boolean(month) && Boolean(inPeriod(month));
}
