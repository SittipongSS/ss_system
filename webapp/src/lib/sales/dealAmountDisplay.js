// มูลค่าที่ขึ้นจอของดีลหนึ่งใบ + ยอด SO "รออนุมัติ" ที่วางข้าง ๆ (มติผู้ใช้ 2026-09-11 · mig 0353)
//
// ใช้ร่วมกันที่หน้ารายการดีล (คอลัมน์มูลค่า · เรียงตามมูลค่า · ยอดหัวกลุ่ม · KPI) และการ์ด
// "ดีลจากลีดนี้" — จอไหนคิดเองจะหลุดจากกติกาเดียวกันทันที
//
// ⭐ Won = Actual (SO อนุมัติแล้ว ผ่าน wonAmountOf ซึ่งเช็ค actualSource) · ดีลเปิด = FC (projectValue)
// ⭐ ยอดรออนุมัติเป็น **ช่องแยก** เสมอ นับเฉพาะดีล Won (pendingApprovalAmountOf กรองให้แล้ว)
// ⛔ ห้ามบวกยอดรออนุมัติเข้า dealDisplayValue — ตัวเลขหลักของแถวคือ Actual/FC ตามเดิม
// 🪤 `wonValue ?? projectValue` ที่หน้าจอเคยเขียนเป็นโค้ดตาย: trigger 0110 เขียน wonValue = 0
//    (ไม่ใช่ null) ให้ทุกดีลตั้งแต่ INSERT ⇒ `??` ไม่เคยถอยไป FC และดีลเปิดที่ไม่กรองด้วยขั้น
//    Won จะขึ้น ฿0.00 (การ์ดดีลบนหน้าลีดเป็นแบบนั้นมาตลอด)
import {
  isWonDeal,
  pendingApprovalAmountOf,
  pendingApprovalCountOf,
  pendingApprovalMonthOf,
  wonAmountOf,
} from '@/lib/sales/dashboardMetrics';
import { isMonthValue, yearOfMonth } from '@/lib/datePeriods';
import { fmtMoney } from '@/lib/format';

export function dealDisplayValue(deal) {
  if (isWonDeal(deal)) return wonAmountOf(deal);
  return Number(deal?.projectValue) || 0;
}

// เรียงตามมูลค่า: ตัวเลขหลัก (Actual/FC) ก่อน — ยอดรออนุมัติเป็นแค่ตัวตัดสินตอนเสมอกัน
// ⇒ ดีล Won ที่ SO ยังรออนุมัติ (Actual 0) ขึ้นก่อนดีลที่ยอด 0 จริง แต่ไม่แซงดีลที่มี Actual
export function compareDealDisplayValue(a, b) {
  return (dealDisplayValue(a) - dealDisplayValue(b))
    || (pendingApprovalAmountOf(a) - pendingApprovalAmountOf(b));
}

/* งวดของยอดรออนุมัติบนหน้ารายการดีล (มติผู้ใช้ 2026-09-14 · fix 2)
   ยอดรออนุมัติลง **เดือนปัจจุบันเวลาไทยเสมอ** (pendingApprovalMonthOf) ⇒ นับเข้ายอดรวมของหน้า
   เฉพาะเมื่อเดือนนั้นอยู่ในงวดที่หน้ากำลังโชว์ — กติกาเดียวกับภาพรวม/ลิ้นชัก/แดชบอร์ดของฉัน
     เดือนเดียว          เดือนต้องตรงกัน
     ติ๊ก "ทุกเดือน"     ปีเดียวกัน (API ดึงทั้งปีของเดือนที่เลือก)
     "รอเติมข้อมูล"      ไม่กรอง (API ดึงดีลทุกปี — ไม่มีงวดให้เทียบ)
     เดือนอ่านไม่ออก     ไม่กรอง (ไม่มีงวด)
   คืน `null` = ไม่กรอง · ไม่งั้นคืนตัวเทียบ (pendingMonth) => boolean
   ⚠️ ตัวเทียบตอบ false เสมอเมื่อไม่มีเดือน — ไม่มีเดือน = ไม่มีใบรออนุมัติ */
export function pendingPeriodMatcher({ month, allMonths = false, reviewOnly = false } = {}) {
  if (reviewOnly || !isMonthValue(month)) return null;
  if (allMonths) {
    const year = yearOfMonth(month);
    return (pendingMonth) => Boolean(pendingMonth) && yearOfMonth(pendingMonth) === year;
  }
  return (pendingMonth) => Boolean(pendingMonth) && pendingMonth === month;
}

// รวมยอดของชุดดีล (หัวกลุ่ม · KPI) — สองกองแยกกันเหมือนในแถว
//   value                 Σ dealDisplayValue (Actual ของ Won + FC ของดีลเปิด)
//   pendingApproval       Σ ยอด SO รออนุมัติของดีล Won
//   pendingApprovalCount  Σ จำนวนใบ SO รออนุมัติ (ไม่ใช่จำนวนดีล)
//
// options (ไม่ส่ง = นับยอดรออนุมัติทุกใบ ตามเดิม)
//   inPeriod  ตัวเทียบงวดจาก pendingPeriodMatcher — นับยอดรออนุมัติของดีลเฉพาะเมื่อ
//             pendingApprovalMonthOf(deal, now) อยู่ในงวด · `value` ไม่ถูกกรองด้วยตัวนี้
//   now       เวลาที่ใช้ตัดสินเดือนปัจจุบัน — หน้าจอส่งเวลาที่จับไว้ตอนโหลด (ห้ามอ่านนาฬิกา
//             ตอนเรนเดอร์) · ส่ง `null` มา = ยังไม่รู้เวลา ⇒ ยังไม่นับยอดรออนุมัติ (ไม่เดาเดือน)
export function sumDealDisplay(deals = [], { inPeriod = null, now } = {}) {
  const out = { value: 0, pendingApproval: 0, pendingApprovalCount: 0 };
  const clockUnknown = Boolean(inPeriod) && now === null;
  for (const deal of deals || []) {
    out.value += dealDisplayValue(deal);
    if (clockUnknown) continue;
    if (inPeriod && !inPeriod(pendingApprovalMonthOf(deal, now))) continue;
    out.pendingApproval += pendingApprovalAmountOf(deal);
    out.pendingApprovalCount += pendingApprovalCountOf(deal);
  }
  return out;
}

/* คำใต้การ์ด "มูลค่าปิดจริง (Won)" ของหน้ารายละเอียดดีล (มติผู้ใช้ 2026-09-14 · fix 1)
   🐞 เดิมเขียน "คาดการณ์ ฿V · ต่าง ฿(V − Actual)" ทุกกรณี ⇒ ดีลที่เพิ่งรับใบเสนอราคา (SO ยังเป็น
      ร่าง) หรือ SO ยื่นแล้วรออนุมัติ ขึ้น "ต่าง = FC ทั้งก้อน" อ่านเป็นพลาดเป้าทั้งใบ
   สามกรณี (ข้อมูลเข้าจากแถว SO ที่หน้าโหลดมาแล้ว — splitSalesOrderAmounts — กับ Actual ของดีล):
     'actual'         มี SO อนุมัติ ไม่มีใบรออนุมัติ  → "คาดการณ์ ฿V · ต่าง ฿(V−A)" / "ตรงกับคาดการณ์"
     'when_approved'  มีใบรออนุมัติ                   → "คาดการณ์ ฿V · ต่างเมื่ออนุมัติครบ ฿(V−A−P)"
                                                        / "ตรงกับคาดการณ์เมื่ออนุมัติครบ"
     'awaiting_so'    ไม่มีทั้งสองอย่าง (Won รอยื่น SO) → "คาดการณ์ ฿V · ยังไม่มีใบสั่งขายที่ยื่น"
                                                        ไม่มีตัวเลขต่าง — ยังไม่มีอะไรให้เทียบ
   ⭐ "มี SO อนุมัติ" = มีแถวอนุมัติ **หรือ** Actual > 0 — ใบอนุมัติยอด 0 บาทถูกกฎ (mig 0197)
      · Actual มาจาก SO อนุมัติเท่านั้น (มติผู้ใช้ 2026-09-14 — ไม่มีดีลที่มี Actual โดยไม่มีแถว SO
        ดู lib/sales/legacyDealSwitch)
   ⭐ ส่วนต่างปัดเป็นสตางค์ก่อนเทียบศูนย์ — V−A−P ของทศนิยมเหลือเศษ 1e-11 ได้
   ⛔ ส่วนต่างติดลบ (ปิดเกินคาดการณ์) โชว์ตามจริง ไม่ตัดเป็น 0
   ⛔ ใบรออนุมัติไม่ถูกบวกเข้า Actual — มันลบออกจากส่วนต่างเฉพาะในคำว่า "เมื่ออนุมัติครบ" */
export const WON_HINT_KINDS = Object.freeze({
  ACTUAL: 'actual',
  WHEN_APPROVED: 'when_approved',
  AWAITING_SO: 'awaiting_so',
});

const toSatang = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function wonDealForecastHint({
  forecast,
  actual,
  actualCount,
  pendingApproval,
  pendingApprovalCount,
} = {}) {
  const forecastValue = Number(forecast) || 0;
  const actualValue = Math.max(0, Number(actual) || 0);
  const pendingValue = Math.max(0, Number(pendingApproval) || 0);
  const hasPending = pendingValue > 0 || (Number(pendingApprovalCount) || 0) > 0;
  const hasApproved = actualValue > 0 || (Number(actualCount) || 0) > 0;
  const forecastText = `คาดการณ์ ${fmtMoney(forecastValue)}`;

  if (!hasApproved && !hasPending) {
    return {
      kind: WON_HINT_KINDS.AWAITING_SO,
      gap: null,
      text: `${forecastText} · ยังไม่มีใบสั่งขายที่ยื่น`,
    };
  }
  if (hasPending) {
    const gap = toSatang(forecastValue - actualValue - pendingValue) || 0;
    return {
      kind: WON_HINT_KINDS.WHEN_APPROVED,
      gap,
      text: gap === 0 ? 'ตรงกับคาดการณ์เมื่ออนุมัติครบ' : `${forecastText} · ต่างเมื่ออนุมัติครบ ${fmtMoney(gap)}`,
    };
  }
  const gap = toSatang(forecastValue - actualValue) || 0;
  return {
    kind: WON_HINT_KINDS.ACTUAL,
    gap,
    text: gap === 0 ? 'ตรงกับคาดการณ์' : `${forecastText} · ต่าง ${fmtMoney(gap)}`,
  };
}
