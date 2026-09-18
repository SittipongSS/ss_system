// ── ถอดจุดติดตั้งออกจากใบสั่งขายย้อนหลัง (มติข้อ 23 ส่วน ข2 · mig 0366) ─────────
//
// ⭐ **ตัวคิดเงินตัวเดียวกับ RPC** — โมดัลยืนยันต้องโชว์ "ยอดเดิม → ยอดใหม่" ก่อนกด (มติ: บอก
//   ผลลัพธ์ก่อนลงมือ) และตัวเลขที่โชว์ต้องเป็นตัวเดียวกับที่ฐานจะเขียนจริง ไม่งั้นคนกดโดยเชื่อ
//   เลขหนึ่งแล้วได้อีกเลขหนึ่ง · สูตรตรงกับข้อ ⑥ ของ 0366 ทุกบรรทัด (เทสต์เทียบ SQL)
//
// 🪤 **VAT คิดจากสัดส่วนเดิม ไม่ใช่จากอัตรา** — `sales_orders` ไม่มีคอลัมน์ `vatRate`
//   (อัตราเป็นค่าตอนคีย์ แล้ว `splitHistoricalAmounts` แตกเป็น subtotal/vat ก่อนเข้า RPC)
//   ⇒ `vat_ใหม่ = round(subtotal_ใหม่ × vat_เดิม / subtotal_เดิม, 2)` ซึ่งรักษาอัตราเดิมไว้เอง
//
// ⚠️ import ได้แค่ตัวช่วยที่ปลอดภัยทั้งสองฝั่ง (`format` · `historicalOrders`) — ไฟล์นี้ถูกเรียก
//   ทั้งจาก route และจากโมดัลบนจอ · ห้ามลากของฝั่ง server เข้ามา
import { fmtMoney } from '@/lib/format';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';

export const REMOVE_REASON_MIN = 10;   // = เหตุผลยกเว้นด่านเงินของ 0360
export const REMOVE_REASON_MAX = 500;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
/* ปัดสองตำแหน่งแบบเดียวกับ `round(x, 2)` ของ Postgres — `Number.EPSILON` กัน 1.005 ตกเป็น 1.00 */
export const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

/** ยอดหัวใบหลังถอดบรรทัดนี้ออก — คืนก้อนที่โมดัลเอาไปโชว์ได้ตรง ๆ */
export function amountsAfterRemoval(order, line) {
  const subtotalBefore = num(order?.subtotal);
  const vatBefore = num(order?.vatAmount);
  const totalBefore = num(order?.totalAmount);
  let subtotal = subtotalBefore - num(line?.lineTotal);
  if (subtotal < 0) subtotal = 0;
  const vat = subtotalBefore > 0 ? round2((subtotal * vatBefore) / subtotalBefore) : 0;
  subtotal = round2(subtotal);
  const total = round2(subtotal + vat);
  return {
    subtotalBefore, vatBefore, totalBefore,
    subtotal, vat, total,
    /* สูตรเดียวกับทุกตัวเขียน SO ในระบบ */
    actual: Math.max(0, round2(total - vat)),
  };
}

export const removeReasonError = (reason) => {
  const n = [...String(reason ?? '').trim()].length;
  if (n < REMOVE_REASON_MIN || n > REMOVE_REASON_MAX) {
    return `กรุณาระบุเหตุผลที่ถอดจุดนี้ออกจากใบ ${REMOVE_REASON_MIN}–${REMOVE_REASON_MAX} ตัวอักษร`;
  }
  return null;
};

/** ผลรวมงวดที่คีย์ไว้ — **ทุกสถานะ** รวมงวดที่บัญชีตีกลับ (ยังเป็นยอดที่ต้องเก็บ)
    เกณฑ์เดียวกับ `append_historical_installments` ของ 0360 */
export const installmentsTotal = (installments = []) =>
  round2((installments || []).reduce((sum, row) => sum + num(row?.amount), 0));

/**
 * ถอดบรรทัดนี้ได้ไหม — คืนข้อความไทยเมื่อไม่ได้ หรือ null
 * ⚠️ **ด่านจริงอยู่ที่ RPC** (0366 ข้อ ①–⑧) · ตัวนี้มีไว้ให้จอบอกเหตุ**ก่อน**กด ไม่ใช่แทนด่าน
 *    ลำดับต้องตรงกับ SQL เป๊ะ ๆ ไม่งั้นจอบอกเหตุคนละข้อกับที่ฐานตีกลับ
 */
export function removalBlock({ order, line, lines = [], installments = [] } = {}) {
  if (!order || !line) return 'ไม่พบจุดติดตั้งที่จะถอด';
  if (!isHistoricalOrder(order)) return 'ถอดจุดออกจากใบได้เฉพาะใบสั่งขายย้อนหลัง';
  if (order.status !== 'approved') return 'ใบสั่งขายที่ยกเลิกแล้วถอดจุดไม่ได้';
  if (num(order.discountAmount) > 0) {
    return 'ใบนี้มีส่วนลดหัวใบ — ถอดจุดแล้วระบบไม่รู้ว่าส่วนลดเฉลี่ยลงบรรทัดยังไง ต้องแก้ใบด้วยมือ';
  }
  if (!line.siteNotFoundAt) return 'จุดนี้ยังไม่ถูกแจ้งว่าไม่พบหน้างาน — ถอดออกจากใบไม่ได้';
  if (line.siteClosedAt) return 'จุดนี้ถูกตัดสินไปแล้ว — ถอดออกจากใบไม่ได้';
  if ((lines || []).length <= 1) return 'ใบนี้เหลือจุดเดียว — ถอดออกแล้วใบจะไม่มีรายการเลย ให้ยกเลิกทั้งใบแทน';
  const { total } = amountsAfterRemoval(order, line);
  const paid = installmentsTotal(installments);
  if (paid > total + 0.01) {
    return `งวดที่คีย์ไว้รวม ${fmtMoney(paid)} เกินยอดใบใหม่ — แก้งวดก่อนถอดจุดนี้`;
  }
  if (total === 0 && !order.paymentGateExemptAt) {
    return 'ถอดแล้วใบเหลือยอด 0 แต่ใบนี้ยังไม่ได้ยกเว้นด่านเงิน — นัดบริการจะติดด่านโดยไม่มีทางปลด';
  }
  return null;
}

/* ก้อนที่โมดัลใช้วาด "ยอดเดิม → ยอดใหม่ · งวดเทียบยอดใหม่" — คิดครั้งเดียว ใช้ทั้งข้อความและด่าน */
export function removalPreview({ order, line, lines = [], installments = [] } = {}) {
  const amounts = amountsAfterRemoval(order, line);
  const paid = installmentsTotal(installments);
  return {
    ...amounts,
    installmentsTotal: paid,
    installmentsCount: (installments || []).length,
    /* งวดกินยอดใบใหม่ไปเท่าไร — บอกให้เห็นว่าเหลือช่องว่างอีกแค่ไหน ไม่ใช่แค่ผ่าน/ไม่ผ่าน */
    remainingAfterInstallments: round2(amounts.total - paid),
    linesLeft: Math.max(0, (lines || []).length - 1),
    block: removalBlock({ order, line, lines, installments }),
  };
}
