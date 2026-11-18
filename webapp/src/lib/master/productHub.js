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
import { reportOrderMonth } from '@/lib/sales/reportRows';
import { addMonths, currentMonth } from '@/lib/datePeriods';
import { fmtNumber } from '@/lib/format';

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

/* ── แท็บภาพรวม (งวด S2 · มติ 4) ─────────────────────────────────────────────────────────────────────── */

/**
 * ยอดสั่งซื้อรายเดือน 12 เดือนล่าสุด — ใบที่นับ = ตัวเดียวกับตัวเลขบนหัว (`countsAsOrdered`)
 * เดือน = `reportOrderMonth` ตัวเดียวกับรายงานยอดขาย (เดือนที่อนุมัติใบตามเวลาไทย · แถวเก่าไม่มี approvedAt ถอยไป orderDate)
 * ⭐ คืนทั้งมูลค่าและจำนวนต่อเดือน — จอสลับแกนเอง (ปุ่มสลับอยู่ที่กราฟ · มติ 2)
 * @returns {{ months: { month: string, amount: number, qty: number, orders: number }[], total: { amount: number, qty: number, orders: number } }}
 */
export function productMonthlyOrders(sales, { months = 12, now = new Date() } = {}) {
  const byMonth = new Map();
  for (const row of productOrderRows(sales).filter((r) => r.counted)) {
    const month = reportOrderMonth(row.order);
    if (!month) continue;
    const cur = byMonth.get(month) || { amount: 0, qty: 0, orders: 0 };
    cur.amount += row.amount;
    cur.qty += row.qty;
    cur.orders += 1;
    byMonth.set(month, cur);
  }
  const last = currentMonth(now);
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const month = addMonths(last, -i);
    const cur = byMonth.get(month) || { amount: 0, qty: 0, orders: 0 };
    out.push({ month, amount: money2(cur.amount), qty: cur.qty, orders: cur.orders });
  }
  return {
    months: out,
    total: {
      amount: money2(out.reduce((s, m) => s + m.amount, 0)),
      qty: out.reduce((s, m) => s + m.qty, 0),
      orders: out.reduce((s, m) => s + m.orders, 0),
    },
  };
}

const ORDER_WAITING = new Set(['draft', 'pending_approval', 'approval_revoked']);

/**
 * "ต้องตามต่อ" ของสินค้า — เรื่องที่ยังค้าง เรียงจากเร่งไปเบา · แต่ละรายการพาไปแท็บของเรื่องนั้น
 * ผู้เรียกส่งของที่ตัดสินไว้แล้วบนหน้า (ตัวตัดสินกลางชุดเดียวกับการ์ดสรุป/การ์ดจัดการ — ไม่คิดซ้ำที่นี่):
 *   approval      'approved' | 'pending' | 'rejected'  (approvalControlView)
 *   rejectionReason
 *   exciseRec     ผลของ exciseRecommendationState (null = ไม่เข้าข่าย/ขึ้นทะเบียนแล้ว · ผู้ไม่เห็นภาษีส่ง null)
 *   bom           { step, status, blockerShort } (hasBomStep · bomStatusOf · bomSendBlockerShort) · ไม่มีขั้น = step:false
 * @returns {{ key, tone: 'danger'|'warning'|'info'|'neutral', title, detail, tab }[]}
 */
export function productFollowUps({ sales = null, approval = 'approved', rejectionReason = '', exciseRec = null, bom = {} } = {}) {
  const items = [];
  const orderRows = sales?.visible ? productOrderRows(sales) : [];
  const counted = orderRows.filter((r) => r.counted);
  if (approval === 'rejected') {
    items.push({ key: 'approval-rejected', tone: 'danger', title: 'ข้อมูลสินค้าถูกตีกลับ', detail: rejectionReason ? `เหตุผล: ${rejectionReason}` : 'แก้ตามเหตุผลแล้วส่งอนุมัติใหม่', tab: 'info' });
  }
  if (bom.step && bom.status === 'returned') {
    items.push({ key: 'bom-returned', tone: 'danger', title: 'RD ตีกลับเรื่องลง BOM', detail: bom.reason ? `เหตุผล: ${bom.reason}` : 'แก้แล้วกดส่ง RD อีกครั้ง', tab: 'bom' });
  }
  if (exciseRec?.kind === 'rejected') {
    items.push({ key: 'excise-rejected', tone: 'warning', title: 'ทะเบียนสรรพสามิตถูก RA ตีกลับ', detail: exciseRec.reg?.rejectionReason ? `เหตุผล: ${exciseRec.reg.rejectionReason}` : 'แก้แล้วยื่นใหม่', tab: 'excise' });
  } else if (exciseRec?.kind === 'incomplete') {
    items.push({ key: 'excise-draft', tone: 'warning', title: 'ทะเบียนสรรพสามิตยังเป็นร่าง', detail: 'แนบเอกสารให้ครบแล้วยื่นให้ RA', tab: 'excise' });
  } else if (exciseRec?.kind === 'unregistered') {
    items.push({
      key: 'excise-unregistered', tone: counted.length ? 'warning' : 'neutral', title: 'ยังไม่ขึ้นทะเบียนสรรพสามิต',
      detail: counted.length ? `มีใบสั่งขายที่อนุมัติแล้ว ${counted.length} ใบ · หมวดนี้ต้องเสียภาษี` : 'หมวดนี้ต้องเสียภาษี — ขึ้นทะเบียนก่อนขาย',
      tab: 'excise',
    });
  } else if (exciseRec?.kind === 'pending') {
    items.push({ key: 'excise-pending', tone: 'info', title: 'ทะเบียนสรรพสามิตรอ RA อนุมัติ', detail: 'ยื่นแล้ว — รอฝ่าย RA ตรวจ', tab: 'excise' });
  }
  const waiting = orderRows.filter((r) => r.live && ORDER_WAITING.has(r.order.status));
  if (waiting.length) {
    items.push({ key: 'orders-waiting', tone: 'info', title: `ใบสั่งขายยังไม่อนุมัติ ${waiting.length} ใบ`, detail: waiting.map((r) => r.order.orderNumber || 'ร่าง').slice(0, 3).join(' · '), tab: 'sales' });
  }
  if (approval === 'pending') {
    items.push({ key: 'approval-pending', tone: 'info', title: 'ข้อมูลสินค้ารออนุมัติ', detail: 'ระหว่างนี้สินค้าไม่ขึ้นในรายการเลือกของระบบอื่น', tab: 'info' });
  }
  if (bom.step && !bom.status) {
    items.push(bom.blockerShort
      ? { key: 'bom-blocked', tone: 'neutral', title: 'ยังส่ง RD ลง BOM ไม่ได้', detail: bom.blockerShort, tab: 'bom' }
      : { key: 'bom-ready', tone: 'neutral', title: 'พร้อมส่ง RD ลง BOM', detail: 'ข้อมูลครบแล้ว — กดส่งที่การ์ดจัดการ', tab: 'bom' });
  }
  return items;
}

const stamp = (v) => { const ms = Date.parse(v || ''); return Number.isFinite(ms) ? ms : 0; };

/**
 * "ล่าสุด" — เหตุการณ์จากวันที่บนแถว (สินค้า · BOM · QT · SO · ทะเบียน) ใหม่ไปเก่า · ตัดตาม limit
 * ⚠️ ไม่ใช่เธรด — เธรดเต็ม (ความเห็น · ทุกรอบ) อยู่แท็บความเคลื่อนไหว
 * @returns {{ key, at, code, text, href?: string, tab?: string }[]}
 */
export function productRecentEvents({ product = null, sales = null, registrations = [] } = {}, { limit = 6, unit = '' } = {}) {
  const out = [];
  const push = (at, ev) => { if (stamp(at)) out.push({ ...ev, at }); };
  if (product) {
    const code = product.fgCode || null;
    push(product.createdAt, { key: 'p:created', code, text: 'เปิดรหัสสินค้า', tab: 'info' });
    push(product.approvedAt, { key: 'p:approved', code, text: 'อนุมัติข้อมูลสินค้า', tab: 'info' });
    push(product.bomSentAt, { key: 'b:sent', code: 'BOM', text: 'ส่ง RD ลง BOM', tab: 'bom' });
    push(product.bomAcceptedAt, { key: 'b:accepted', code: 'BOM', text: 'RD รับเรื่องลง BOM', tab: 'bom' });
    push(product.bomReturnedAt, { key: 'b:returned', code: 'BOM', text: 'RD ตีกลับเรื่องลง BOM', tab: 'bom' });
    push(product.bomDoneAt, { key: 'b:done', code: 'BOM', text: product.bomCode ? `ลง BOM เสร็จ · ${product.bomCode}` : 'ลง BOM เสร็จ', tab: 'bom' });
  }
  if (sales?.visible) {
    for (const row of productOrderRows(sales)) {
      if (!row.live || row.order.status !== 'approved') continue;
      const qty = `${fmtNumber(row.qty)}${unit ? ` ${unit}` : ''}`;
      push(row.order.approvedAt, { key: `o:${row.id}`, code: row.order.orderNumber, text: `อนุมัติใบสั่งขาย · ${qty}`, href: `/sa/sales-orders/${row.id}` });
    }
    for (const row of productQuoteRows(sales)) {
      if (row.quote.status !== 'accepted') continue;
      push(row.quote.acceptedAt, { key: `q:${row.id}`, code: row.quote.quoteNumber, text: 'ลูกค้ารับใบเสนอราคา (Won)', href: `/sa/quotations/${row.id}` });
    }
  }
  for (const reg of registrations || []) {
    push(reg.createdAt, { key: `r:${reg.id}`, code: 'สรรพสามิต', text: `เปิดคำขอทะเบียน${reg.customerName ? ` · ${reg.customerName}` : ''}`, tab: 'excise' });
  }
  return out.sort((a, b) => stamp(b.at) - stamp(a.at)).slice(0, limit);
}
