// ตัวตัดสินของตารางรายการใบสั่งขาย (/sa/sales-orders) — ตัวเดียวที่ทั้งตารางและการ์ดบนแถบใช้
//
// ตรวจตัวเลข L11 (26/10): การ์ด "รอตรวจอนุมัติ" · "อนุมัติแล้ว" · "Actual ก่อน VAT" นับเฉพาะใบจากใบเสนอราคา
// (`splitSalesOrderAmounts` — ใบย้อนหลังไม่นับ Actual/FC/เป้า · mig 0360) แต่กดไม่ได้ และคำเดียวกันบนตัวเลือกสถานะ
// ("รออนุมัติ" · "อนุมัติแล้ว") รวมใบย้อนหลังด้วย ⇒ จอเดียวกันมีสองตัวเลขให้คำเดียวกัน และไม่มีทางเรียกชุดของการ์ดขึ้นมา
// ⇒ นิยามของการ์ดไม่เปลี่ยน (มติ mig 0353 / 0360) · การ์ดกลายเป็นปุ่มที่ตั้งตัวกรองชุดใหม่ **ทั้งชุด**
//   (`SALES_ORDER_CARD_PICKS` · สถานะ + ที่มา = ใบจากใบเสนอราคา · ล้างที่เหลือ) ⇒ แถวหลังกด = เลขบนการ์ดพอดี
// ⭐ มิติของตารางอยู่ที่นี่ (หน้าเรียกตรง ๆ) · **คำค้นเป็นของหน้า** (`ctx.matchesSearch` — ชุดค้นอ่านสิ่งที่ตาเห็นบนแถว
//   แบบ `dealListFilter`) · การ์ดล้างคำค้นเสมอ ⇒ คำค้นไม่มีผลกับเลขของการ์ด
import { salesOrderTaxInvoiceNote } from '@/lib/sales/salesOrderPayments';
import { ORIGIN_HISTORICAL, ORIGIN_PIPELINE, isActualOrder, isHistoricalOrder } from '@/lib/sales/historicalOrders';

/* สถานะการชำระของใบ — คำถามที่ตารางสถานะเอกสารตอบไม่ได้ ("ใบไหนเงินยังไม่ครบ")
   ⚠️ `tracked` เท็จ = ยังไม่เริ่มติดตาม ไม่ใช่ "ยังไม่จ่าย" — คนละเรื่องกัน */
export const PAYMENT_FILTERS = {
  complete: { label: 'เก็บเงินครบแล้ว', match: (row) => row.payment?.complete },
  overdue: { label: 'มีงวดเลยกำหนด', match: (row) => (row.payment?.overdue || 0) > 0 },
  rejected: { label: 'มีงวดถูกตีกลับ', match: (row) => (row.payment?.rejected || 0) > 0 },
  untracked: { label: 'ยังไม่เริ่มติดตาม', match: (row) => !row.payment?.tracked },
};

/* ── ตัวกรองใบกำกับภาษี (mig 0348 · มติผู้ใช้ 2026-09-09) ──────────────────
   ⭐ **กลุ่มของตัวเอง ไม่ใช่ตัวเลือกที่ห้าของ "การชำระ"** — ตัวเลือกในกลุ่มเดียวกัน
   เป็น OR กัน (`.some`) ⇒ ยัดรวมเมื่อไร "เก็บเงินครบแล้ว + ยังไม่ออกใบกำกับ" จะกลาย
   เป็น "อย่างใดอย่างหนึ่ง" ซึ่งตรงข้ามกับที่คนกดคาดหวัง · คนละกลุ่ม = AND กัน
   (เงินกับเอกสารเป็นคนละแกน — เหตุผลเดียวกับที่แยกคอลัมน์ออกมาใน #1677)

   ⚠️ **อ่านจาก `salesOrderTaxInvoiceNote` ตัวเดียวกับที่คอลัมน์ใช้** ไม่คิดเงื่อนไขเอง —
   ตัวส่วนคือ "งวดที่จ่ายแล้ว" ซึ่งเป็นกติกาที่เขียนไว้ที่นั่นแล้ว · เขียนซ้ำที่นี่
   เมื่อไร วันหนึ่งชิปตัวกรองกับตัวเลขในคอลัมน์จะไม่ตรงกันโดยไม่มีใครรู้ */
export const INVOICE_FILTERS = {
  missing: {
    label: 'ยังไม่ออกใบกำกับ',
    match: (row) => salesOrderTaxInvoiceNote(row.payment)?.tone === 'warning',
  },
  complete: {
    label: 'ออกใบกำกับครบ',
    match: (row) => salesOrderTaxInvoiceNote(row.payment)?.tone === 'success',
  },
};

/* ── ที่มาของใบ (mig 0360 · มติผู้ใช้ 16/09/2026) ─────────────────────────
   ⭐ **กลุ่มของตัวเอง ไม่ใช่ตัวเลือกของ "สถานะเอกสาร"** — ใบย้อนหลังเกิดเป็น "อนุมัติแล้ว"
   ทุกใบ ⇒ ยัดรวมกันเมื่อไร "อนุมัติแล้ว + ใบย้อนหลัง" จะกลายเป็น "อย่างใดอย่างหนึ่ง"
   ซึ่งตรงข้ามกับที่คนกดคาดหวัง (เหตุผลเดียวกับที่ใบกำกับภาษีแยกกลุ่มออกมา)
   ⚠️ ค่าของตัวเลือกใช้ค่าคงที่จาก `lib/sales/historicalOrders` — literal ของที่มาใบย้อนหลัง
   มีบ้านเดียว (ยาม historicalMoneyGuards) และตัวตัดสินคือ `isHistoricalOrder` ตัวเดียว
   กับที่รายงานเงินใช้กรองออก ⇒ สิ่งที่เห็นบนจอตรงกับที่ระบบคิด */
export const ORIGIN_FILTERS = {
  /* ⭐ ใบค่าสรรพสามิต (mig 0414) ก็มาจากใบเสนอราคา แต่ไม่ใช่ยอดขาย — ไม่อยู่ในกองนี้ (การ์ด "อนุมัติแล้ว"/"Actual ก่อน VAT"
     ตั้งที่มานี้ ⇒ ถ้ามันปนเข้ามา ตารางที่กรองแล้วจะมีใบเกินเลขบนการ์ด) · ตัวตัดสินเดียวกับ Actual (`isActualOrder`) */
  [ORIGIN_PIPELINE]: { label: 'ใบจากใบเสนอราคา', match: (row) => isActualOrder(row) },
  [ORIGIN_HISTORICAL]: { label: 'ใบย้อนหลัง', match: (row) => isHistoricalOrder(row) },
};

/** ตัวกรองว่างทั้งชุด — รูปเดียวกับที่หน้าส่งเข้า `salesOrderPassesListFilters` (lineView 'all' = ทุกสาย) */
export const EMPTY_SALES_ORDER_FILTERS = Object.freeze({
  query: '', status: Object.freeze([]), payment: Object.freeze([]), invoice: Object.freeze([]), origin: Object.freeze([]),
  lineView: 'all', waitingOnMe: false, serviceSetupPending: false,
});

/**
 * แถวนี้ผ่านตัวกรองของตารางไหม — ลำดับและเงื่อนไขเดียวกับที่ตารางใช้ (หน้าเรียกตัวนี้ตรง ๆ)
 * @param filters ดู `EMPTY_SALES_ORDER_FILTERS` — ว่าง = ไม่กรองมิตินั้น (`query` ใช้ผ่าน ctx.matchesSearch ของหน้า)
 * @param ctx     { matchesSearch(row) } — ชุดค้นของหน้า (สิ่งที่ตาเห็นบนแถว) · ไม่ส่ง = ไม่กรองคำค้น
 */
export function salesOrderPassesListFilters(row, filters = EMPTY_SALES_ORDER_FILTERS, { matchesSearch } = {}) {
  const f = { ...EMPTY_SALES_ORDER_FILTERS, ...(filters || {}) };
  if (f.waitingOnMe && !row._waitingOnMe) return false;
  if (f.serviceSetupPending && !row._serviceSetupPending) return false;
  if (f.lineView !== 'all' && row.businessLine !== f.lineView) return false;
  if (f.status.length && !f.status.includes(row.status)) return false;
  // หลายหมวดการชำระ = "อย่างใดอย่างหนึ่ง" (เลยกำหนด **หรือ** ถูกตีกลับ = ใบที่ต้องตาม)
  if (f.payment.length && !f.payment.some((key) => PAYMENT_FILTERS[key]?.match(row))) return false;
  if (f.invoice.length && !f.invoice.some((key) => INVOICE_FILTERS[key]?.match(row))) return false;
  if (f.origin.length && !f.origin.some((key) => ORIGIN_FILTERS[key]?.match(row))) return false;
  if (typeof matchesSearch === 'function' && !matchesSearch(row)) return false;
  return true;
}

/* ── การ์ดบนแถบ → ตัวกรองชุดใหม่ทั้งชุด (แทนที่ ไม่ใช่เติม) ─────────────────────────────────────────────
   total    "ใบสั่งขายทั้งหมด" = ทุกใบในขอบเขต (rows.length) ⇒ ล้างทุกมิติ
   pending  "รอตรวจอนุมัติ"   = ใบจากใบเสนอราคา + รออนุมัติ (= pendingOrderCount — **ใบ** pending_approval ล้วน · งวดที่ยื่นของใบรายงวด
                                อนุมัติแล้วไม่อยู่ในเลขนี้ (คนละสถานะ — กดแล้วไม่มีทางขึ้น) · หมายเหตุใต้เลขบอกแยก · review รอบสาม 26/10)
   approved "อนุมัติแล้ว" · "Actual ก่อน VAT" = ใบจากใบเสนอราคา + อนุมัติแล้ว (= actualCount · Σ salesOrderActual = actual)
   ⚠️ ที่มา = ใบจากใบเสนอราคาเสมอ — ใบย้อนหลังไม่อยู่ในกองของการ์ด (salesOrderAmountKind = 'excluded') */
export const SALES_ORDER_CARD_PICKS = Object.freeze({
  total: EMPTY_SALES_ORDER_FILTERS,
  pending: Object.freeze({ ...EMPTY_SALES_ORDER_FILTERS, status: Object.freeze(['pending_approval']), origin: Object.freeze([ORIGIN_PIPELINE]) }),
  approved: Object.freeze({ ...EMPTY_SALES_ORDER_FILTERS, status: Object.freeze(['approved']), origin: Object.freeze([ORIGIN_PIPELINE]) }),
});

const sameSet = (a = [], b = []) => a.length === b.length && a.every((value) => b.includes(value));

/** ตัวกรองที่ใช้อยู่ตรงกับการ์ดนี้ทุกมิติไหม (aria-pressed · กดซ้ำ = ล้าง) */
export function salesOrderPickActive(filters, pick) {
  const f = { ...EMPTY_SALES_ORDER_FILTERS, ...(filters || {}) };
  return String(f.query || '').trim() === String(pick.query || '')
    && sameSet(f.status, pick.status) && sameSet(f.payment, pick.payment) && sameSet(f.invoice, pick.invoice)
    && sameSet(f.origin, pick.origin) && f.lineView === pick.lineView
    && !!f.waitingOnMe === !!pick.waitingOnMe && !!f.serviceSetupPending === !!pick.serviceSetupPending;
}

/* ── หัวกลุ่มเมื่อ "จัดกลุ่ม" (ตรวจตัวเลข L11c) ────────────────────────────────────────────────────────
   🐞 ป้าย "n ใบ" ของหัวกลุ่มนับทุกใบในกลุ่ม แต่ "รออนุมัติ ฿X · m ใบ" ข้าง ๆ ตัดใบย้อนหลัง ⇒ กลุ่ม "รออนุมัติ" ที่มีใบจาก
      ใบเสนอราคา 1 ใบ + ใบย้อนหลัง 2 ใบ อ่านเป็น "3 ใบ · รออนุมัติ ฿X" (เหมือน ฿X คือยอดของสามใบ)
   ⇒ หัวกลุ่มบอกจำนวนใบย้อนหลังที่รออนุมัติแยก "(ไม่นับยอด)" · ตัวนับอยู่ที่นี่ที่เดียว */
export function historicalPendingCount(items = []) {
  return (items || []).filter((order) => isHistoricalOrder(order) && order?.status === 'pending_approval').length;
}

/** คำต่อท้ายหัวกลุ่ม — ไม่มีใบย้อนหลังรออนุมัติ = '' (หัวกลุ่มหน้าตาเดิม) */
export function historicalPendingNote(count) {
  return count > 0 ? ` · ใบย้อนหลังรออนุมัติ ${count} ใบ (ไม่นับยอด)` : '';
}
