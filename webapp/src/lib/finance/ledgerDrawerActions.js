/* ── ปุ่มของบัญชีในลิ้นชักรายงวด (รื้อรายการ SO + บัญชี PR-3b · มติเจ้าของ 09/11/2026) ─────────────────────────────────
   ลิ้นชักบนหน้างานบัญชี (`/finance/payments`) — ปุ่มรายงวดชุดเดียวกับคิวบนหน้าเดิม (รับรอง · ตีกลับ · บันทึกใบกำกับ ·
   บันทึกคืนเงิน) + ถอนคำรับรอง (เดิมมีแค่บนแผงงวดของหน้าใบ)
   ⭐ ด่านชุดเดิมทุกข้อ: เงื่อนไขขึ้นปุ่ม = เงื่อนไขเดียวกับคิว (`pendingConfirmations` · `pendingTaxInvoices` · `pendingStranded`) ·
     ปุ่มกดไม่ได้ = โชว์พร้อมเหตุจาก `ledgerRowLock` (ใบที่ QT ตาย · ใบรายงวดที่งวดยังไม่นับ Actual ฯลฯ) — ไม่ซ่อน (กฎ "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุ")
   ⭐ ฝั่ง server ยังตัดสินซ้ำที่ PATCH …/installments (`installmentActionError`) — ไฟล์นี้แค่ตัดสินว่าจอโชว์ปุ่มอะไร */
import { ledgerRowLock } from '@/lib/finance/paymentLedger';
import { taxInvoicePending } from '@/lib/sales/taxInvoice';

export const LEDGER_DRAWER_ACTION_LABELS = Object.freeze({
  confirm: 'รับรองว่าเงินเข้า',
  reject: 'ตีกลับ',
  'tax-invoice': 'บันทึกใบกำกับ',
  refund: 'บันทึกคืนเงิน',
  unconfirm: 'ถอนคำรับรอง',
});

/**
 * ปุ่มของงวดหนึ่งแถว (แถวทะเบียนบัญชี `ledgerRow`)
 * @returns [{ action, label, tone: 'primary'|'quiet'|'danger', lock: string|null }] — ว่าง = งวดนี้ไม่มีงานของบัญชี
 */
export function ledgerDrawerActions(row) {
  if (!row || row.refunded) return [];
  const make = (action, tone) => ({ action, label: LEDGER_DRAWER_ACTION_LABELS[action], tone, lock: ledgerRowLock(row, action) || null });
  /* ใบกำกับ: งวดที่ "ต้องมีใบ" = แจ้งแล้ว/รับรองแล้ว (`taxInvoicePending` ตัวเดียวกับคิว "ยังไม่ออกใบกำกับ" · ไม่นับงวดยกมา) */
  const invoice = taxInvoicePending(row) ? [make('tax-invoice', row.status === 'confirmed' ? 'primary' : 'quiet')] : [];
  if (row.status === 'reported') return [make('confirm', 'primary'), make('reject', 'quiet'), ...invoice];
  if (row.status !== 'confirmed') return [];
  const out = [...invoice];
  /* เงินค้างบนใบที่ยกเลิก (`stranded` — ledgerRow ประทับ) — ทางออกของบัญชี: คืนเงิน · ยกเข้าใบใหม่ทำที่ใบปลายทาง (ปุ่มยกเงินอยู่ที่นั่น) */
  if (row.stranded) out.push(make('refund', 'danger'));
  out.push(make('unconfirm', 'quiet'));
  return out;
}
