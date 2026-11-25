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

/** ช่อง "วันที่ส่งของ" — ยังไม่มีวันส่ง = '' (จอโชว์ "—" · เจ้าของ 04/11 เลิกโชว์ "PO มาวันที่ …" แบบตารางเดิม)
 *  ⭐ ยกเว้นสหมิตร (มติ 25/11): วันในช่องคือวันที่เอกสาร PO (`deliveryDateKind` 'po') ⇒ นำด้วย "PO " ให้รู้ว่าไม่ใช่วันส่ง */
export function filingDateText(detail) {
  if (!detail?.deliveryDate) return '';
  return detail.deliveryDateKind === 'po' ? `PO ${fmtDate(detail.deliveryDate)}` : fmtDate(detail.deliveryDate);
}

/** ป้ายใต้ตัวกรอง/หัวรายงาน — คำเดียวกันทุกจุด */
export const FILING_MONTH_FILTER_LABEL = 'เดือนที่ส่ง';
