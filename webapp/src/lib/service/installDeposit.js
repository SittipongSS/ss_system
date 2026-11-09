// ── ด่านมัดจำก่อนติดตั้ง (mig 0425) — ตัวตัดสินล้วน ไม่มี React ไม่มี DB ─────────────────
//
// ⭐ มติเจ้าของ 09/11/2026: ก่อนติดตั้งมีด่าน **ข้อเดียว** = งวดที่ติดธง "ก่อนติดตั้ง"
//    (`sales_order_installments."beforeInstall"`) ต้องบัญชีรับรองครบทุกงวด
//    · ใบที่ไม่มีงวดติดธง = ผ่าน (บอกเหตุว่าผ่านเพราะอะไร ไม่ผ่านเงียบ)
//    · สัญญา **ไม่ใช่** ด่านก่อนติดตั้ง — สัญญาทำหลังทุกไซต์ติดตั้งเสร็จ (สัญญาระบุจำนวนเครื่อง + จุดที่ติด)
//
// ⚠️ **ตัวเดียวที่ทั้งด่านนัด (visitGate) และคิวติดตั้ง (installQueue) ถาม** — ปุ่ม "ยืนยันวัน" ของ TS
//    กับด่านตอนเลื่อนร่างขึ้นตารางต้องพูดเรื่องเดียวกันเสมอ (กติกา GatedAction ของ repo)
// ⚠️ "แจ้งแล้ว" ไม่ปลดด่าน — นับเฉพาะ `confirmed` (กติกาเดียวกับด่านเงินของนัดตามรอบ)
// ⚠️ ไม่ใช้ paidThrough — งวดก่อนติดตั้งผูกกับ "เหตุการณ์ติดตั้ง" ไม่ใช่ช่วงวันที่บริการ
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';
import { fmtMoney } from '@/lib/format';

export const INSTALL_DEPOSIT_TEXT = Object.freeze({
  label: 'งวดก่อนติดตั้งบัญชีรับรองแล้ว',
  none: 'ใบนี้ไม่มีงวดก่อนติดตั้ง — ผ่านข้อนี้',
  zeroValue: 'ใบยอด 0 บาท — ไม่มีเงินให้เก็บ',
  noOrder: 'ไม่พบใบสั่งขายของคำขอติดตั้งนี้ — เปิดใบสั่งขายตรวจก่อน',
});

/* เหตุของงวดที่ยังไม่ผ่าน — บอก **ใครต้องทำอะไร** ตามสถานะจริงของงวด (เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอก) */
const STATUS_REASON = Object.freeze({
  pending: 'ฝ่ายขายยังไม่แจ้งชำระ',
  reported: 'แจ้งชำระแล้ว รอบัญชีรับรอง',
  rejected: 'บัญชีตีกลับ — ฝ่ายขายแจ้งชำระใหม่',
});

function rowText(row) {
  const name = String(row?.label || '').trim() || `งวด ${row?.seq ?? ''}`.trim();
  const amount = Number(row?.amount);
  return Number.isFinite(amount) ? `${name} ${fmtMoney(amount)}` : name;
}

/**
 * ด่านมัดจำก่อนติดตั้งของใบหนึ่งใบ
 * @param order        ใบสั่งขาย (อ่าน `totalAmount` — ใบยอด 0 ผ่านเอง · ไม่ส่ง = ไม่รู้ยอด = เดินตามงวด)
 * @param installments งวดทั้งหมดของใบ (งวดที่ไม่ติดธงถูกข้าม)
 * @returns {{ state: 'ok'|'blocked', reason: string|null, detail: string|null, flagged: number, pending: object[] }}
 *   `detail` = ประโยคบอกเหตุที่ผ่าน (ไม่มีงวด · ยอด 0) — ด่านที่ผ่านเพราะไม่มีอะไรให้ตรวจต้องบอก
 */
export function installDepositGate(order, installments = []) {
  if (!order) {
    return { state: 'blocked', reason: INSTALL_DEPOSIT_TEXT.noOrder, detail: null, flagged: 0, pending: [] };
  }
  if (paymentNotRequired(order.totalAmount)) {
    return { state: 'ok', reason: null, detail: INSTALL_DEPOSIT_TEXT.zeroValue, flagged: 0, pending: [] };
  }
  const flagged = (installments || []).filter((r) => r && r.beforeInstall === true);
  if (!flagged.length) {
    return { state: 'ok', reason: null, detail: INSTALL_DEPOSIT_TEXT.none, flagged: 0, pending: [] };
  }
  const pending = flagged
    .filter((r) => r.status !== 'confirmed')
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  if (!pending.length) {
    return { state: 'ok', reason: null, detail: null, flagged: flagged.length, pending: [] };
  }
  const first = pending[0];
  const why = STATUS_REASON[first.status] || STATUS_REASON.pending;
  const more = pending.length > 1 ? ` (+ อีก ${pending.length - 1} งวด)` : '';
  return {
    state: 'blocked',
    reason: `งวดก่อนติดตั้ง ${rowText(first)} — ${why}${more}`,
    detail: null,
    flagged: flagged.length,
    pending,
  };
}
