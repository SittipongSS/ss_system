// ── หน้าสินค้าศูนย์รวม: ตัวคำนวณแบบ pure (งวด S1) ─────────────────────────────────────────────
//
// แผน: docs/product-hub-plan.md · มติเจ้าของ 18/11/2026 ข้อ 2 (ตัวเลขยอด) · ข้อ 5 (แท็บการขาย)
// ไม่แตะฐาน ไม่แตะ React — จอ (app/database/products/[id] + components/database/productHub) กับเทสต์เรียกชุดเดียวกัน
//
// ⭐ "ใบที่นับ" = `countsAsOrdered` ตัวเดียวกับแท็บสินค้าของหน้าลูกค้า (อนุมัติแล้ว · ยังมีผล · ไม่ใช่ใบค่าสรรพสามิต ·
//    รวมใบย้อนหลัง) ⇒ ยอด FG บนหน้าลูกค้า = ยอดบนหัวหน้าสินค้า ทุกตัวอักษร
// ⭐ มูลค่า = Σ lineTotal (ก่อน VAT) · จำนวน = Σ lineUnitsTotal (แพ็ค × จำนวน — ตัวกลางของ linePacks.js)
// ⚠️ ใบค่าสรรพสามิตไม่ใช่การขายสินค้า (บรรทัดคือภาษีของสินค้า) — ไม่ขึ้นแท็บการขาย ไม่นับยอด
import { countsAsOrdered, isLiveOrder } from '@/lib/master/customerHub';
import { isExciseOrder } from '@/lib/sales/historicalOrders';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { lineUnitsTotal } from '@/lib/sales/linePacks';

const num = (v) => Number(v) || 0;
const money2 = (v) => Math.round(v * 100) / 100;
const dayOf = (v) => (v ? String(v).slice(0, 10) : null);
const orderDate = (o) => dayOf(o?.orderDate || o?.approvedAt || o?.createdAt);
const quoteDate = (q) => dayOf(q?.quoteDate || q?.createdAt);
const newer = (a, b) => String(b || '').localeCompare(String(a || ''));

/** ราคา/หน่วยของบรรทัดสินค้านี้บนใบ — หลายบรรทัดราคาต่างกัน = null (จอขึ้น "หลายราคา") */
function priceOf(lines) {
  const prices = [...new Set(lines.map((l) => num(l.unitPrice)))];
  return prices.length === 1 ? prices[0] : null;
}

/** สรุปบรรทัดของสินค้านี้บนใบหนึ่งใบ */
function lineSummary(lines = []) {
  return {
    qty: lines.reduce((sum, l) => sum + lineUnitsTotal(l), 0),
    amount: money2(lines.reduce((sum, l) => sum + num(l.lineTotal), 0)),
    unitPrice: priceOf(lines),
    unit: lines.find((l) => l.unit)?.unit || null,
    packed: lines.some((l) => num(l.packQty) > 0),
  };
}

/**
 * แถวของมุมมอง "ใบสั่งขาย" — ใหม่ก่อน · ไม่รวมใบค่าสรรพสามิต
 * `counted` = ใบนี้นับเข้ายอดบนหัว (ใบอื่นยังโชว์ เช่น รออนุมัติ/ถูก Rev. แทน — จอทำแถวจาง)
 */
export function productOrderRows(sales) {
  return (sales?.orders || [])
    .filter((o) => !isExciseOrder(o))
    .map((order) => ({ id: order.id, order, date: orderDate(order), counted: countsAsOrdered(order), live: isLiveOrder(order), ...lineSummary(order.lines) }))
    .sort((a, b) => newer(a.date, b.date) || newer(a.order.createdAt, b.order.createdAt));
}

/**
 * แถวของมุมมอง "ใบเสนอราคา" — ใหม่ก่อน · ไม่รวมใบค่าสรรพสามิต
 * `latest` = ฉบับล่าสุดของสาย Rev. (ฉบับเก่าซ่อนตั้งต้น · ทรงเดียวกับหน้าลูกค้า)
 */
export function productQuoteRows(sales) {
  const quotes = (sales?.quotations || []).filter((q) => !isExciseOrder(q));
  const latestIds = new Set(latestQuotationRevisions(quotes).map((q) => q.id));
  return quotes
    .map((quote) => ({ id: quote.id, quote, date: quoteDate(quote), latest: latestIds.has(quote.id), ...lineSummary(quote.lines) }))
    .sort((a, b) => newer(a.date, b.date) || newer(a.quote.createdAt, b.quote.createdAt));
}

/**
 * ตัวเลขบนหัวหน้าสินค้า (มติ 2 · 5) — null = ผู้ดูไม่มีสิทธิ์โมดูลขาย ⇒ จอไม่วาดช่องเหล่านี้
 * @returns {null | {
 *   ordered: { amount: number, qty: number, orders: number, lastDate: string|null },
 *   quotes: { count: number, won: number, lastPrice: number|null, lastDate: string|null },
 * }}
 */
export function productSalesFacts(sales) {
  if (!sales?.visible) return null;
  const counted = productOrderRows(sales).filter((r) => r.counted);
  const quotes = productQuoteRows(sales);
  const latestQuotes = quotes.filter((r) => r.latest);
  // ราคาล่าสุด = ใบเสนอราคาฉบับล่าสุดที่ใหม่สุดซึ่งมีราคาเดียว (ใบที่ราคาหลายแบบข้ามไป)
  const priced = latestQuotes.find((r) => r.unitPrice !== null) || null;
  return {
    ordered: {
      amount: money2(counted.reduce((sum, r) => sum + r.amount, 0)),
      qty: counted.reduce((sum, r) => sum + r.qty, 0),
      orders: counted.length,
      lastDate: counted[0]?.date || null,
    },
    quotes: {
      count: latestQuotes.length,
      won: latestQuotes.filter((r) => r.quote.status === 'accepted').length,
      lastPrice: priced ? priced.unitPrice : null,
      lastDate: priced ? priced.date : null,
    },
  };
}

/** คำค้นของแถว — ตาเห็นบนแถว = ค้นเจอ (เลขใบ · PO · ดีล · ลูกค้า) */
export const productOrderText = (row, dealCode) => [row.order.orderNumber, row.order.referenceDoc, dealCode, row.order.customerName]
  .filter(Boolean).join(' ').toLowerCase();
export const productQuoteText = (row, dealCode) => [row.quote.quoteNumber, row.quote.referenceNote, dealCode, row.quote.customerName]
  .filter(Boolean).join(' ').toLowerCase();
