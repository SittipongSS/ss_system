/* ── ดีลอยู่ในงวดไหม — ตัวตัดสินเดียวของรายการดีล (/sa/deals) และไฟล์ FC รายหมวด ──────────
 * มติผู้ใช้ 2026-09-22 (รอบรื้อ): จุดประสงค์ = ยอดปิด (ฝ่ายขาย) **และ** วันรับของ (ส่งฝ่ายผลิตวางแผน)
 * ⇒ **สลับแกนได้ 2 แกน** — ปุ่ม "ดูตาม: เดือนปิดการขาย | เดือนรับของ" บนหน้าดีล · รายการ · KPI · ไฟล์ เดินตามแกนเดียวกัน
 *   (ของจริง: ก.ย. 2026 ยอดปิด ฿17.9M แต่ของที่ต้องส่ง ฿5.4M · ธ.ค. ยอดปิด ฿2.1M แต่ต้องส่ง ฿13.2M — แกนเดียวตอบไม่ได้ทั้งสองฝ่าย)
 *
 *   close    (เดือนปิดการขาย) — รายเดือน/ทุกเดือน: `forecastMonth` (= เดือนของ expectedCloseDate · ตรวจ prod 511/511 ตรงกัน)
 *                               ช่วงวัน: `expectedCloseDate` อยู่ใน [from, to]
 *   delivery (เดือนรับของ)     — `endDate` (วันที่ลูกค้าต้องการรับของ) อยู่ใน [from, to] · ดีลสหมิตรที่มีแค่เดือนที่ลูกค้าขอ
 *                               (`metadata.demandMonth`) นับเป็นรายเดือน · **ไม่มีวันรับของเลย = กอง "ยังไม่ระบุวันรับของ"**
 *                               ของงวดที่วันคาดปิดอยู่ในงวด (มติผู้ใช้ — ไม่เดาเดือนส่งให้ · จอขึ้นเตือนให้ AE กรอก)
 *
 * ⚠️ API รายการดีลกรองด้วยกติกาเดียวกัน (แกนปิด = ที่ query · แกนรับของ = เรียกตัวนี้ตรง ๆ) — เทสต์ dealPeriod.test.mjs
 *    อ่านซอร์ส route เทียบ
 * ⚠️ ดีลที่ไม่มีทั้งวันคาดปิดและเดือน FC ไม่อยู่ในงวดไหนเลย (ขึ้นในตัวกรอง "รอเติมข้อมูล" แทน)
 */

export const DEAL_AXES = ['close', 'delivery'];
export const DEAL_AXIS_OPTIONS = [
  { value: 'close', label: 'เดือนปิดการขาย' },
  { value: 'delivery', label: 'เดือนรับของ' },
];
export const normalizeDealAxis = (axis) => (axis === 'delivery' ? 'delivery' : 'close');

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthOf = (value) => (value ? String(value).slice(0, 7) : null);
const dayOf = (value) => (value ? String(value).slice(0, 10) : null);

/** เดือนคาดปิดของดีล — คอลัมน์ forecastMonth ก่อน แล้วค่อยเดือนของวันคาดปิด */
export const dealCloseMonth = (deal) => deal?.forecastMonth || monthOf(deal?.expectedCloseDate);

/** วันรับของ (วัน) — มีเฉพาะดีลที่กรอก endDate */
export const dealDeliveryDay = (deal) => dayOf(deal?.endDate);

/** เดือนรับของ — endDate ก่อน แล้วค่อยเดือนที่ลูกค้าขอของสหมิตร · ไม่มี = null (ไม่เดาจากวันปิด) */
export function dealDeliveryMonth(deal) {
  const fromEnd = monthOf(deal?.endDate);
  if (fromEnd) return fromEnd;
  const demand = deal?.metadata?.demandMonth;
  return MONTH_PATTERN.test(String(demand || '')) ? demand : null;
}

/** ดีลนี้ยังไม่มีวันรับของ (ไปกอง "ยังไม่ระบุวันรับของ") */
export const dealDeliveryUnknown = (deal) => !dealDeliveryMonth(deal);

/** ดีลที่ **ขาด** วันรับของ = ยังไม่มีวันรับของ และไม่ใช่ดีลแพ้ (Lost ไม่มีของต้องส่ง · ไฟล์ FC ก็ตัดทิ้ง)
 *  ⚠️ แถบเตือน · ตัวเลขในตัวกรอง · ผลของตัวกรอง "ยังไม่ระบุวันรับของ" ต้องเรียกตัวนี้ตัวเดียว
 *  🐞 เดิมแถบเตือนตัด Lost แต่ตัวกรองไม่ตัด ⇒ แถบบอก 34 ใบ กด "ดูเฉพาะดีลกลุ่มนี้" ได้ 36 */
export const dealMissingDelivery = (deal) => deal?.stage !== 'lost' && dealDeliveryUnknown(deal);

function inClosePeriod(deal, period) {
  if (period.mode === 'range') {
    const day = dayOf(deal?.expectedCloseDate);
    return Boolean(day) && day >= period.from && day <= period.to;
  }
  const month = dealCloseMonth(deal);
  return Boolean(month) && (period.months || []).includes(month);
}

/**
 * @param period ผลของ parseReportPeriod · null = ไม่จำกัดงวด (ทุกดีล)
 * @param axis   'close' | 'delivery'
 */
export function dealInReportPeriod(deal, period, axis = 'close') {
  if (!period) return true;
  if (normalizeDealAxis(axis) === 'delivery') {
    const day = dealDeliveryDay(deal);
    if (day) return day >= period.from && day <= period.to;
    const month = dealDeliveryMonth(deal); // มีแค่เดือนที่ลูกค้าขอ (สหมิตร)
    if (month) return (period.months || []).includes(month);
    // ไม่มีวันรับของ ⇒ กอง "ยังไม่ระบุวันรับของ" ของงวดที่วันคาดปิดอยู่ในงวด
    return inClosePeriod(deal, period);
  }
  return inClosePeriod(deal, period);
}

/** เดือนที่ดีลนั่งในกริดของแกนนั้น — null = กอง "ยังไม่ระบุวันรับของ" (แกนรับของเท่านั้น) */
export function dealAxisMonth(deal, axis = 'close') {
  return normalizeDealAxis(axis) === 'delivery' ? dealDeliveryMonth(deal) : dealCloseMonth(deal);
}
