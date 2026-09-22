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
 * ⚠️ API รายการดีลกับไฟล์ FC คัดด้วย `dealInReportPeriod` ตัวนี้ทั้งสองแกน (query แกนปิดอ่านแค่ชุดที่ใหญ่กว่าไว้ก่อน)
 *    และไฟล์ลงช่องเดือนด้วย `dealAxisPlacement` ที่อ่านฟิลด์เดียวกับตัวคัด — เทสต์ dealPeriod.test.mjs อ่านซอร์ส route เทียบ
 * ⚠️ ดีลที่ไม่มีทั้งวันคาดปิดและเดือน FC ไม่อยู่ในงวดไหนเลย (ขึ้นในตัวกรอง "รอเติมข้อมูล" แทน)
 */

export const DEAL_AXES = ['close', 'delivery'];
export const DEAL_AXIS_OPTIONS = [
  { value: 'close', label: 'เดือนปิดการขาย' },
  { value: 'delivery', label: 'เดือนรับของ' },
];
export const normalizeDealAxis = (axis) => (axis === 'delivery' ? 'delivery' : 'close');

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/* ⚠️ อ่านเดือน/วันผ่านสองตัวนี้เท่านั้น (ตรวจรูปทุกครั้ง) — ทั้งการคัดดีลเข้างวดและการลงช่องเดือนของไฟล์ FC
   🐞 เดิมไฟล์ลงช่องด้วย `monthKey` (ตัด 7 ตัวแรก) แต่ตัวคัดใช้รูปเต็ม ⇒ demandMonth แบบ "2026-10-15"
      ถูกคัดเป็น "ไม่มีวันรับของ" แต่ไปลงช่อง ต.ค. ที่ไม่อยู่ในงวด = ยอดหายจากกริดเงียบ ๆ */
const monthOf = (value) => {
  const month = value ? String(value).slice(0, 7) : '';
  return MONTH_PATTERN.test(month) ? month : null;
};
const dayOf = (value) => {
  const day = value ? String(value).slice(0, 10) : '';
  return DAY_PATTERN.test(day) ? day : null;
};

/** เดือนคาดปิดของดีล — คอลัมน์ forecastMonth ก่อน แล้วค่อยเดือนของวันคาดปิด */
export const dealCloseMonth = (deal) => deal?.forecastMonth || monthOf(deal?.expectedCloseDate);

/** วันรับของ (วัน) — มีเฉพาะดีลที่กรอก endDate */
export const dealDeliveryDay = (deal) => dayOf(deal?.endDate);

/** เดือนรับของ — endDate ก่อน แล้วค่อยเดือนที่ลูกค้าขอของสหมิตร · ไม่มี = null (ไม่เดาจากวันปิด) */
export function dealDeliveryMonth(deal) {
  const day = dealDeliveryDay(deal);
  if (day) return monthOf(day);
  return monthOf(deal?.metadata?.demandMonth);
}

/** ดีลนี้ยังไม่มีวันรับของ (ไปกอง "ยังไม่ระบุวันรับของ") */
export const dealDeliveryUnknown = (deal) => !dealDeliveryMonth(deal);

/** ดีลที่ **ขาด** วันรับของ = ยังไม่มีวันรับของ และไม่ใช่ดีลแพ้ (Lost ไม่มีของต้องส่ง · ไฟล์ FC ก็ตัดทิ้ง)
 *  ⚠️ แถบเตือน · ตัวเลขในตัวกรอง · ผลของตัวกรอง "ยังไม่ระบุวันรับของ" ต้องเรียกตัวนี้ตัวเดียว
 *  🐞 เดิมแถบเตือนตัด Lost แต่ตัวกรองไม่ตัด ⇒ แถบบอก 34 ใบ กด "ดูเฉพาะดีลกลุ่มนี้" ได้ 36 */
export const dealMissingDelivery = (deal) => deal?.stage !== 'lost' && dealDeliveryUnknown(deal);

/** สถานะวันรับของสำหรับตัวกรองบนจอ — 'known' มีเดือนรับของ · 'missing' ขาด (ไม่นับ Lost) ·
 *  null = ดีลแพ้ที่ไม่มีวันรับของ (ไม่ใช่ทั้งสองกลุ่ม — ไม่งั้น "ระบุแล้ว" จะโชว์แถวที่ไม่มีเดือนรับของ) */
export function dealDeliveryState(deal) {
  if (dealDeliveryMonth(deal)) return 'known';
  return dealMissingDelivery(deal) ? 'missing' : null;
}

/** เดือนปิดที่ใช้ **ทั้งคัดเข้างวดและลงช่องเดือน** — ช่วงวันใช้วันคาดปิด · รายเดือน/ทุกเดือนใช้เดือน FC
 *  🐞 เดิมช่วงวันคัดด้วย expectedCloseDate แต่ลงช่องด้วย forecastMonth ⇒ สองช่องไม่ตรงกัน (สหมิตรตั้ง
 *     forecastMonth = เดือนรับ PO · expectedCloseDate = วันครบกำหนด) ยอดไปลงเดือนนอกงวดแล้วหายจากกริด */
function closeMonthIn(deal, period) {
  return period?.mode === 'range' ? monthOf(deal?.expectedCloseDate) : dealCloseMonth(deal);
}

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

/** เดือนที่ดีลนั่งในกริดของแกนนั้น — null = กอง "ยังไม่ระบุ…" */
export function dealAxisMonth(deal, axis = 'close', period = null) {
  return dealAxisPlacement(deal, axis, period).month;
}

/**
 * ช่องเดือนของดีลในไฟล์ FC — **ตัวเดียวกับที่คัดเข้างวด** (ดีลที่ผ่าน dealInReportPeriod ลงช่องที่อยู่ในงวดเสมอ
 * — เทสต์ dealPeriod.test.mjs สวีปยืนยัน) · basis = ป้าย "เดือนมาจาก" ของชีตรายดีล
 *   close    → เดือนปิด (basis closeMonth) · ไม่มีวัน/เดือนปิดเลย = month null (กอง)
 *   delivery → endDate (basis endDate) · demandMonth (basis demandMonth) · ไม่มี = month null
 *              basis บอกว่าไม่มีวันรับของเพราะอะไร (expectedCloseDate/forecastMonth = ⚠ ถอยจากวันปิด ในชีตรายดีล)
 */
export function dealAxisPlacement(deal, axis = 'close', period = null) {
  if (normalizeDealAxis(axis) === 'close') {
    return { month: closeMonthIn(deal, period), basis: 'closeMonth' };
  }
  const month = dealDeliveryMonth(deal);
  if (month) return { month, basis: dealDeliveryDay(deal) ? 'endDate' : 'demandMonth' };
  return { month: null, basis: deal?.expectedCloseDate ? 'expectedCloseDate' : 'forecastMonth' };
}
