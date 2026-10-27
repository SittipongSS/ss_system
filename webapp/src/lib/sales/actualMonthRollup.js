// ── Actual รายเดือนของดีล + กอง "รอนับรายงวด" — ตัวรวมของแดชบอร์ด/ลิ้นชัก/แดชบอร์ดของฉัน (mig 0412 · มติเจ้าของ 26/10/2026) ──
//
// ⭐ ทำไมต้องมีไฟล์นี้: ใบสั่งขาย "Actual รายงวด" ทำให้ Actual ของดีลเดียว **อยู่ได้หลายเดือน**
//    (งวดลงเดือนที่ AE Sup อนุมัติงวด · ใบทั้งใบลงเดือนอนุมัติใบ — metadata.actualByMonth ของดีล)
//    ⇒ ตัวรวมที่เคยคัด "ดีล Won ที่ wonMonth = เดือนนั้น แล้วบวก wonValue ทั้งก้อน" ใช้ไม่ได้อีก:
//    🪤 งวด 2 อนุมัติ ธ.ค. ลากงวด 1 ของ ต.ค. ไปด้วย (wonMonth เป็นเดือนอนุมัติ **ใบ** ไม่ขยับตามงวด — ต.ค. ได้ทั้งก้อน
//       ธ.ค. ได้ 0) และ "เติมยอดจากระบบ" จะแช่ยอดผิดเดือนลง sales_history ถาวร
//    ⇒ Actual ของเดือน = ผลรวม `actualByMonth[เดือน]` ของ **ทุกดีล Won** (ไม่ใช่เฉพาะดีลที่ wonMonth ตรง)
// ⭐ จำนวน Won (wonCount) · FC Total · Won รอยื่น SO ยังอยู่ที่ wonMonth เหมือนเดิม (ความหมายเดิมของ "ดีลปิดเดือนไหน")
// ⭐ ใบทั้งใบล้วน (ทุกดีลวันนี้) ได้ตัวเลขเท่าเดิมทุกสตางค์ — actualByMonthOf ของดีลที่ยังไม่มีคีย์ = { wonMonth: wonValue }
//
// ⭐ กอง "รอนับรายงวด" (`instRemaining` · มติข้อ 5) = งวดของใบรายงวดที่ยังไม่ยื่น/ถูกตีกลับ ลงเดือนครบกำหนด
//    ไม่มีวันครบกำหนด/เลยกำหนดแล้ว **พับเข้าเดือนปัจจุบัน** (installmentRemainingByMonthOf · คิดตอนอ่าน ⇒ ผู้เรียกส่งนาฬิกา)
//    ⛔ เข้าได้แค่ยอดคาดการณ์ (projected) — ห้ามบวกเข้า Actual / won / wonValue / เป้า / % / ขาด-เกิน / sales_history
//    ⚠️ งวดที่ยื่นแล้วรอ AE Sup อยู่ในกอง "รออนุมัติ" แล้ว (pendingApprovalAmountOf รวม soInstPending*) — ไม่ใช่กองนี้
//
// ตัวรวมอยู่ที่นี่ ไม่ใช่ใน route — route.js ของ Next export ได้แค่ HTTP handler เทสต์เรียกตรงไม่ได้
// (แพตเทิร์นเดียวกับ pendingApprovalRollup / wonAwaitingSoRollup)
import { currentMonth } from '@/lib/datePeriods';
import {
  actualByMonthOf,
  actualInMonths,
  installmentRemainingByMonthOf,
  isKpiDeal,
  isWonDeal,
} from '@/lib/sales/dashboardMetrics';

const toSatang = (v) => Math.round((Number(v) || 0) * 100) / 100;

/* ดีลที่นับได้: Won + ไม่ใช่ดีลของใบสั่งขายย้อนหลัง (mig 0360 — ผู้เรียกส่วนใหญ่ตัดที่ query แล้ว ตัดซ้ำที่นี่อีกชั้น
   ⇒ ตัวรวมนี้ปลอดภัยแม้ผู้เรียกส่งดีลทั้งก้อนมา · ยามอยู่ที่ historicalMoneyGuards) */
const countable = (deal) => isWonDeal(deal) && isKpiDeal(deal);

/** Actual ของดีลที่ตกเดือน `month` ('YYYY-MM') — ดีล Won เท่านั้น (กติกาเดียวกับลูป Won เดิมของแดชบอร์ด) */
export const monthActualOf = (deal, month) => (countable(deal) ? actualInMonths(deal, [month]) : 0);

/**
 * Actual ของดีลในงวดที่ตัวจับคู่ตอบ true — ลิ้นชัก (เดือน/ไตรมาส/ทั้งปี/ทุกงวด) · แดชบอร์ดของฉัน
 * ⭐ ดีลที่แตกหลายเดือนได้ **เฉพาะส่วนของเดือนในงวด** (ไม่ใช่ wonValue ทั้งก้อน)
 * @param inPeriod (monthKey) => boolean
 */
export function actualInPeriodOf(deal, inPeriod) {
  if (!countable(deal) || typeof inPeriod !== 'function') return 0;
  let sum = 0;
  for (const [month, amount] of Object.entries(actualByMonthOf(deal))) {
    if (inPeriod(month)) sum += amount;
  }
  return toSatang(sum);
}

/** ดีลนี้มี Actual ตกเดือนใดเดือนหนึ่งในงวดไหม (ยอด ≠ 0) */
export const hasActualInPeriod = (deal, inPeriod) => actualInPeriodOf(deal, inPeriod) !== 0;

/**
 * Actual ของเดือนหนึ่งจากดีลทั้งชุด — ตัวรวมของแดชบอร์ด (totals.wonValue · ถังคน/ทีม/หมวด)
 * ⭐ วนดีลทั้งหมดที่แดชบอร์ดเห็น ไม่ใช่เฉพาะดีลที่ wonMonth = เดือนนั้น — งวดที่อนุมัติทีหลังลงเดือนของมันเอง
 * ⭐ ดีลที่ยอดของเดือนเป็น 0 ไม่ถูกส่งเข้าตัวบวก (ถังไม่ถูกสร้างเพราะยอด 0)
 * @param attribute [(deal, amount) => void] — ตัวบวกลงถังที่ยอดของดีลต้องลง
 *   ⚠️ ต้องใช้ตัวหาถังชุดเดียวกับลูป Won ของ route ไม่งั้น Actual กับ wonCount ของดีลเดียวกันลงคนละแถว
 * @returns ยอดรวมของเดือน (ตัวเดียวกับ totals.wonValue)
 */
export function rollupMonthActual(deals, month, { attribute = [] } = {}) {
  let total = 0;
  for (const deal of deals || []) {
    const amount = monthActualOf(deal, month);
    if (!amount) continue;
    total += amount;
    for (const add of attribute) add(deal, amount);
  }
  return total;
}

/* ── กอง "รอนับรายงวด" ─────────────────────────────────────────────────────────────────────────── */
export const INST_REMAINING_KEYS = Object.freeze(['instRemaining', 'instRemainingCount']);

/** ช่องตั้งต้นของทุกถัง (ห้ามขาดช่อง — payload ทุกถังมีสองช่องนี้เสมอ) · `instRemainingCount` = จำนวนดีล
 *  · `instRemainingDealIds` = id ของดีลที่นับในเดือนนี้ (review 26/10) — ดีลเดียวมีงวดค้างได้หลายเดือน ⇒ ช่วงไตรมาส/ทั้งปีต้องนับดีล
 *    ไม่ซ้ำจาก id (performanceMath.windowStat) ไม่ใช่บวกจำนวนรายเดือน (ใบบริการ 11 งวดเคยขึ้น "· 11 ดีล" ทั้งที่เป็นดีลเดียว) */
export const instRemainingFields = () => ({ instRemaining: 0, instRemainingCount: 0, instRemainingDealIds: [] });

/** ยอด "รอนับรายงวด" ของดีลที่ตกเดือน `month` — พับเดือนด้วย `thisMonth` (เดือนปัจจุบันเวลาไทยของคำขอ) */
export function instRemainingInMonthOf(deal, month, thisMonth = currentMonth()) {
  if (!countable(deal)) return 0;
  return Number(installmentRemainingByMonthOf(deal, thisMonth)[month]) || 0;
}

/** ยอด "รอนับรายงวด" ของดีลในงวด (ลิ้นชัก) — ผลรวมของเดือนที่ตัวจับคู่ตอบ true */
export function instRemainingInPeriodOf(deal, inPeriod, thisMonth = currentMonth()) {
  if (!countable(deal) || typeof inPeriod !== 'function') return 0;
  let sum = 0;
  for (const [month, amount] of Object.entries(installmentRemainingByMonthOf(deal, thisMonth))) {
    if (inPeriod(month)) sum += amount;
  }
  return toSatang(sum);
}

/** บวกยอดของดีลเดียวลงถัง — แตะแค่ช่องของตัวเอง (ยอด · จำนวนดีล · id ของดีลไม่ซ้ำ) */
export function addInstRemaining(bucket, amount, dealId = null) {
  if (!bucket || !(amount > 0)) return bucket;
  bucket.instRemaining = toSatang((Number(bucket.instRemaining) || 0) + amount);
  bucket.instRemainingCount = (Number(bucket.instRemainingCount) || 0) + 1;
  if (dealId !== null && dealId !== undefined && dealId !== '') {
    if (!Array.isArray(bucket.instRemainingDealIds)) bucket.instRemainingDealIds = [];
    const id = String(dealId);
    if (!bucket.instRemainingDealIds.includes(id)) bucket.instRemainingDealIds.push(id);
  }
  return bucket;
}

/**
 * รอบรวมกอง "รอนับรายงวด" ของหนึ่งเดือน — **รอบแยก** เหมือนรออนุมัติ (เดือนของกองนี้ไม่ใช่ wonMonth)
 * @param now นาฬิกาของคำขอ (คิดครั้งเดียวต่อคำขอ — ตัวเดียวกับคีย์ cache ของแดชบอร์ด)
 * @param attribute [(deal) => bucket] — ตัวหาถังชุดเดียวกับลูป Won (คน/ทีม/หมวด)
 * @returns { instRemaining, instRemainingCount, instRemainingDealIds } ยอดรวมทั้งเดือน
 */
export function rollupInstRemaining(deals, month, { now = new Date(), attribute = [] } = {}) {
  const thisMonth = currentMonth(now);
  const totals = instRemainingFields();
  for (const deal of deals || []) {
    const amount = instRemainingInMonthOf(deal, month, thisMonth);
    if (!(amount > 0)) continue;
    addInstRemaining(totals, amount, deal?.id);
    for (const bucketOf of attribute) addInstRemaining(bucketOf(deal), amount, deal?.id);
  }
  return totals;
}

export const hasInstRemaining = (b) => Number(b?.instRemaining) > 0 || Number(b?.instRemainingCount) > 0;
