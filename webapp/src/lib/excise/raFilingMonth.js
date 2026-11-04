// ── คำของตาราง "รายการชำระภาษีสรรพสามิต" ฝั่งจอ (มติเจ้าของ 03/11 V20–V21) — ไฟล์บริสุทธิ์ ไม่พก lib ฝั่ง server ──
import { MONTH_LABELS } from '@/lib/datePeriods';
import { fmtDate } from '@/lib/format';

/** หัวเดือนแบบตารางเดิม — 'YYYY-MM' → `{ short: 'M.10/69', long: 'ต.ค. 2569' }` · ไม่มีเดือน = ยังไม่มีวันที่ */
export function filingMonthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!match) return { short: 'ไม่มีวันที่', long: 'ยังไม่มีวันที่ส่งของ' };
  const year = Number(match[1]) + 543;
  const index = Number(match[2]) - 1;
  return { short: `M.${Number(match[2])}/${String(year).slice(-2)}`, long: `${MONTH_LABELS[index]} ${year}` };
}

/** ช่อง "วันที่ส่งของ" — ยังไม่มีวันส่ง = '' (จอโชว์ "—" · เจ้าของ 04/11 เลิกโชว์ "PO มาวันที่ …" แบบตารางเดิม) */
export function filingDateText(detail) {
  return detail?.deliveryDate ? fmtDate(detail.deliveryDate) : '';
}
