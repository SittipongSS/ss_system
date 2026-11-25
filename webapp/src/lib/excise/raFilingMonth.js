// ── คำของตาราง "รายการชำระภาษีสรรพสามิต" ฝั่งจอ (มติเจ้าของ 03/11 V20–V21) — ไฟล์บริสุทธิ์ ไม่พก lib ฝั่ง server ──
import { MONTH_LABELS } from '@/lib/datePeriods';
import { fmtDate } from '@/lib/format';

/** หัวเดือนแบบตารางเดิม — 'YYYY-MM' → `{ short: 'M.10/69', long: 'ต.ค. 2569' }` · ไม่มีเดือน = ยังไม่มีวันที่ส่ง */
export function filingMonthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  /* ไม่มีเดือน (มติเจ้าของ 25/11: เดือน = เดือนที่ส่ง) = งานที่ยังไม่มีวันที่ส่งของ (กำลังมา · SO ยังไม่ใส่วัน · สหมิตรไม่มีวันที่ PO)
     หรือยังโหลดรายการไม่ขึ้น */
  if (!match) return { short: '(ยังไม่มีวันที่ส่ง)', long: 'ยังไม่มีวันที่ส่งของ' };
  const year = Number(match[1]) + 543;
  const index = Number(match[2]) - 1;
  return { short: `M.${Number(match[2])}/${String(year).slice(-2)}`, long: `${MONTH_LABELS[index]} ${year}` };
}

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** ภาษีรวมของรายการชุดหนึ่ง (หัวงาน) — ปัดสองตำแหน่งครั้งเดียวตอนจบ */
export const filingLinesTaxTotal = (lines = []) => round2((lines || []).reduce((sum, line) => sum + (Number(line?.totalTax) || 0), 0));

/**
 * ยอดรวมของหัวเดือน (เจ้าของ 04/11: "ควรมียอดรวมด้วย") — ยอดที่ RA ยื่นชำระในเดือนนั้น ตามแถวที่ผ่านตัวกรองบนจอ
 * `{ jobs, lines, totalTax, missing }` · `missing` = งานที่ยังไม่มีรายการ (กำลังโหลด · โหลดไม่ขึ้น) — ไม่อยู่ในยอด ⇒ จอต้องบอก
 */
export function filingMonthTotals(rows = []) {
  const withDetail = (rows || []).filter((row) => row?.detail);
  const lines = withDetail.flatMap((row) => row.detail.lines || []);
  return {
    jobs: (rows || []).length,
    lines: lines.length,
    totalTax: filingLinesTaxTotal(lines),
    missing: (rows || []).length - withDetail.length,
  };
}

/** เดือนของงาน (มติเจ้าของ 25/11 · แทน V24 "เดือนที่ยื่น") = เดือนของวันในคอลัมน์ (วันที่ส่งของ · สหมิตร = วันที่เอกสาร PO)
 *  'YYYY-MM-DD' → 'YYYY-MM' · ไม่มีวัน = null (จอรวมไว้กอง "ยังไม่มีวันที่ส่ง") — วันในปฏิทิน ไม่ใช่จุดเวลา ⇒ ตัดสตริงตรง ๆ */
export function filingDeliveryMonth(date) {
  const match = /^(\d{4}-\d{2})-\d{2}$/.exec(String(date || ''));
  return match ? match[1] : null;
}

/** ใบของสหมิตร (ลูกค้า AR-109) — ตัดสินจาก `customerId` ของ SO ลูกค้า · ไม่รู้รหัสลูกค้าสหมิตร = ไม่ใช่ */
export const isSahamitFilingOrder = (salesOrder, sahamitCustomerId) => Boolean(
  sahamitCustomerId && salesOrder?.customerId && salesOrder.customerId === sahamitCustomerId,
);

/** วันที่เอกสาร PO ของ SO ลูกค้า — เฉพาะเอกสารยืนยันชนิด PO (`confirmDocType` 'po') · ชนิดอื่น/ไม่มี = null (จอโชว์ "—") */
export const salesOrderPoDocDate = (salesOrder) => (salesOrder?.confirmDocType === 'po' ? salesOrder.confirmDocDate || null : null);

/**
 * วันที่ส่งของของกลุ่ม — 'YYYY-MM-DD' หรือ null (จอโชว์ "—")
 * เจ้าของ 04/11: "ใส่แค่วันที่ส่งของ ถ้ายังไม่ส่งก็ต้อง - ไว้" ⇒ เลิกถอยไปวันที่ PO ("PO มาวันที่ …" ของตารางเดิม)
 * · งานที่มีใบค่าสรรพสามิต (`viaExcise` — กำลังมา · รอ RA · บันทึกรายรอบ) = วันของ SO ค่าสรรพสามิตเท่านั้น (SA ใส่ตอนยื่น · V21)
 *   ⚠️ ไม่ถอยไปกำหนดส่งของ SO ต้นทาง: แบ่งรอบแล้ว SO ต้นทางถือวันของรอบล่าสุด (V22) ⇒ รอบที่ยังไม่ส่งจะได้วันของรอบอื่น
 * · งานไม่เรียกเก็บ / บันทึกเก่าที่ไม่ผูก SO ค่าสรรพสามิต = กำหนดส่งของ SO ลูกค้า
 */
export function filingDeliveryDate({ exciseOrder = null, salesOrder = null, viaExcise = Boolean(exciseOrder), sahamitCustomerId = null } = {}) {
  /* ⭐ สหมิตร (มติเจ้าของ 25/11): "ยกเว้นสหมิตรที่จะโชว์เป็นวันที่เอกสาร PO แทน" — ทั้งงานค่าสรรพสามิตและไม่เรียกเก็บ (PO อยู่ที่ SO ลูกค้า) */
  if (isSahamitFilingOrder(salesOrder, sahamitCustomerId)) return salesOrderPoDocDate(salesOrder);
  if (viaExcise) return exciseOrder?.deliveryDueDate || null;
  return salesOrder?.deliveryDueDate || null;
}

/**
 * วันที่ในคอลัมน์ "วันที่ส่งของ" ของ SO ค่าสรรพสามิตใบหนึ่ง (ทะเบียน SO แท็บสรรพสามิต · เจ้าของ 25/11 "แสดงวันที่ส่งของด้วย")
 * — กติกาเดียวกับตาราง RA: วันของใบค่าสรรพสามิต · สหมิตร = วันที่เอกสาร PO ของ SO ลูกค้าต้นทาง
 * คืน `{ date, kind }` · kind 'po' | 'delivery' · ไม่มีวัน = date null
 */
export function exciseOrderDeliveryShown(exciseOrder, sourceOrder, sahamitCustomerId) {
  const date = filingDeliveryDate({ exciseOrder, salesOrder: sourceOrder, viaExcise: true, sahamitCustomerId });
  return { date, kind: isSahamitFilingOrder(sourceOrder, sahamitCustomerId) ? 'po' : 'delivery' };
}

/** ข้อความของวันในคอลัมน์ — สหมิตรนำด้วย "PO " ให้รู้ว่าไม่ใช่วันส่ง · ไม่มีวัน = '' */
export function deliveryShownText(date, kind) {
  if (!date) return '';
  return kind === 'po' ? `PO ${fmtDate(date)}` : fmtDate(date);
}

/** ช่อง "วันที่ส่งของ" — ยังไม่มีวันส่ง = '' (จอโชว์ "—" · เจ้าของ 04/11 เลิกโชว์ "PO มาวันที่ …" แบบตารางเดิม)
 *  ⭐ ยกเว้นสหมิตร (มติ 25/11): วันในช่องคือวันที่เอกสาร PO (`deliveryDateKind` 'po') ⇒ นำด้วย "PO " ให้รู้ว่าไม่ใช่วันส่ง */
export function filingDateText(detail) {
  return deliveryShownText(detail?.deliveryDate, detail?.deliveryDateKind);
}

/** ป้ายใต้ตัวกรอง/หัวรายงาน — คำเดียวกันทุกจุด */
export const FILING_MONTH_FILTER_LABEL = 'เดือนที่ส่ง';
