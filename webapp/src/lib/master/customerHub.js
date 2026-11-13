// ── หน้าลูกค้าศูนย์รวม: ตัวคำนวณแบบ pure (งวด H1) ─────────────────────────────────────────────
//
// แผน: docs/customer-hub-plan.md · มติเจ้าของ 13/11/2026 ข้อ 1 (แท็บการขาย "ตามดีล") · ข้อ 7 (เครื่องมือรายแท็บ)
// ไม่แตะฐาน ไม่แตะ React — จอ (components/database/customerHub) กับเทสต์เรียกชุดเดียวกัน
import { CLOSED_STAGES } from '@/lib/salesPlanning';
import { isExciseOrder, isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { salesOrderActual, splitSalesOrderAmounts } from '@/lib/sales/salesOrderWorkflow';
import { installmentDisplayStatus } from '@/lib/sales/salesOrderPayments';
import { addMonths, businessDayKey, currentMonth } from '@/lib/datePeriods';
import { reportActualRows, reportOrderMonth } from '@/lib/sales/reportRows';
import { isInstallmentActualOrder } from '@/lib/sales/salesOrderActualMode';

const num = (v) => Number(v) || 0;
const time = (v) => { const ms = Date.parse(v || ''); return Number.isFinite(ms) ? ms : 0; };
const newestFirst = (a, b) => time(b.createdAt) - time(a.createdAt);
const groupBy = (rows, keyOf) => {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyOf(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};

export const todayKey = (now = new Date()) => businessDayKey(now.toISOString());
export const isOpenDeal = (deal) => !CLOSED_STAGES.includes(deal?.stage);
/** ใบสั่งขายที่ยังมีผล = ไม่ถูก Rev. แทน และไม่ยกเลิก */
export const isLiveOrder = (order) => !order?.supersededById && order?.status !== 'cancelled' && order?.status !== 'revised';
const OPEN_REQUEST_STATUSES = new Set(['pending', 'acknowledged', 'answered']);
export const isOpenRequest = (request) => OPEN_REQUEST_STATUSES.has(request?.status) && !request?.closedAt;

/* ── งวดชำระ ───────────────────────────────────────────────────────────────────────────────
   ค้างชำระ = งวดของใบที่ยังมีผล ที่ยังไม่ "ชำระแล้ว" (ไม่นับงวดคืนเงิน · งวดที่จ่ายแล้วรอใบอนุมัติ = จ่ายแล้ว)
   เกินกำหนด = ค้าง + กำหนดชำระ < วันนี้ (วันไทย) */
export function installmentState(inst, order, today = todayKey()) {
  const display = installmentDisplayStatus(inst);
  const settled = display === 'confirmed' || display === 'prepaid' || display === 'refunded' || display === 'reported';
  const live = order ? isLiveOrder(order) : true;
  const outstanding = live && !settled;
  const overdue = outstanding && !!inst?.dueDate && String(inst.dueDate).slice(0, 10) < today;
  return { display, outstanding, overdue };
}

/* ── เส้นดีล → ใบเสนอราคา → ใบสั่งขาย → ชำระ (มติ 1) ─────────────────────────────────────────── */
/** ใบเสนอราคาที่แทนดีลบนแถว: ใบที่รับแล้วก่อน · ไม่มีก็ฉบับล่าสุดของสายล่าสุด */
export function currentQuote(quotes = []) {
  if (!quotes.length) return null;
  const latest = latestQuotationRevisions(quotes);
  return latest.find((q) => q.status === 'accepted') || latest[0] || null;
}

/** ใบสั่งขายที่แทนดีลบนแถว: ใบที่ยังมีผลล่าสุด · ไม่มีก็ใบล่าสุด (ให้เห็นว่ายกเลิกไปแล้ว) */
export function currentOrder(orders = []) {
  if (!orders.length) return null;
  const sorted = [...orders].sort(newestFirst);
  return sorted.find(isLiveOrder) || sorted[0];
}

export function buildDealRows({ deals = [], quotations = [], orders = [], installments = [], requests = [], contracts = [], leads = [] } = {}, today = todayKey()) {
  const quotesByDeal = groupBy(quotations, (q) => q.dealId);
  const ordersByDeal = groupBy(orders.filter((o) => !isExciseOrder(o)), (o) => o.dealId);
  const instByOrder = groupBy(installments, (i) => i.salesOrderId);
  const requestsByDeal = groupBy(requests, (r) => r.dealId);
  const contractsByDeal = groupBy(contracts, (c) => c.dealId);
  const leadById = new Map(leads.map((l) => [l.id, l]));

  return [...deals].sort(newestFirst).map((deal) => {
    const quotes = quotesByDeal.get(deal.id) || [];
    const dealOrders = ordersByDeal.get(deal.id) || [];
    const quote = currentQuote(quotes);
    const order = currentOrder(dealOrders);
    const liveOrders = dealOrders.filter(isLiveOrder);
    const insts = liveOrders.flatMap((o) => (instByOrder.get(o.id) || []).map((i) => ({ inst: i, order: o })));
    const states = insts.map(({ inst, order: o }) => ({ inst, ...installmentState(inst, o, today) }));
    return {
      id: deal.id,
      deal,
      lead: deal.leadId ? leadById.get(deal.leadId) || null : null,
      quote,
      olderQuotes: Math.max(0, quotes.length - (quote ? 1 : 0)),
      order,
      payment: {
        count: states.length,
        paid: states.filter((s) => !s.outstanding).length,
        outstanding: states.filter((s) => s.outstanding).reduce((sum, s) => sum + num(s.inst.amount), 0),
        overdue: states.some((s) => s.overdue),
      },
      actual: liveOrders.reduce((sum, o) => sum + salesOrderActual(o), 0),
      requestCount: (requestsByDeal.get(deal.id) || []).length,
      contractCount: (contractsByDeal.get(deal.id) || []).length,
      year: (businessDayKey(deal.createdAt) || '').slice(0, 4) || null,
    };
  });
}

/* ── การสั่งซื้อรายสินค้า (แท็บสินค้า) ──────────────────────────────────────────────────────
   นับจากบรรทัดของใบสั่งขายที่ **อนุมัติแล้วและยังมีผล** — รวมใบย้อนหลัง (การสั่งจริงในอดีต) · ไม่รวมใบค่าสรรพสามิต
   ยอด = lineTotal (ก่อน VAT) · "สั่งแล้ว" = จำนวนใบที่มีสินค้านี้ (ไม่ใช่จำนวนบรรทัด) */
export function productOrderStats(lines = [], orders = []) {
  const orderById = new Map(orders.filter((o) => o.status === 'approved' && isLiveOrder(o) && !isExciseOrder(o)).map((o) => [o.id, o]));
  const byProduct = new Map();
  const manual = new Map();
  for (const line of lines) {
    const order = orderById.get(line.salesOrderId);
    if (!order) continue;
    const key = line.productId || null;
    const target = key ? byProduct : manual;
    const id = key || `${line.fgCode || ''}|${line.description || ''}`;
    const cur = target.get(id) || { productId: key, fgCode: line.fgCode || null, description: line.description || null, orderIds: new Set(), lastDate: null, total: 0 };
    cur.orderIds.add(order.id);
    const date = order.orderDate || order.approvedAt || null;
    if (date && (!cur.lastDate || String(date) > String(cur.lastDate))) cur.lastDate = String(date).slice(0, 10);
    cur.total += num(line.lineTotal);
    target.set(id, cur);
  }
  const finish = (row) => ({ productId: row.productId, fgCode: row.fgCode, description: row.description, orders: row.orderIds.size, lastDate: row.lastDate, total: Math.round(row.total * 100) / 100 });
  return {
    byProduct: new Map([...byProduct.values()].map((row) => [row.productId, finish(row)])),
    manual: [...manual.values()].map(finish).sort((a, b) => b.total - a.total),
  };
}

/* ── ตัวเลขบนหัวหน้า (4 ช่อง) — null = ผู้ดูไม่มีสิทธิ์กลุ่มนั้น ⇒ จอไม่วาดช่องนั้น (มติ 4) ─────────── */
export function hubFacts(hub, today = todayKey()) {
  const sales = hub?.sales || {};
  const facts = { actual: null, openDeals: null, outstanding: null, openRequests: null };
  if (sales.visible) {
    const actualOrders = (sales.orders || []).filter((o) => !isHistoricalOrder(o) && !isExciseOrder(o));
    const split = splitSalesOrderAmounts(actualOrders);
    facts.actual = { amount: split.actual, orders: split.actualCount, pending: split.pendingApproval };
    const open = (sales.deals || []).filter(isOpenDeal);
    facts.openDeals = { count: open.length, value: open.reduce((s, d) => s + num(d.projectValue), 0) };
  }
  if (hub?.finance?.visible) {
    const orderById = new Map((sales.orders || []).map((o) => [o.id, o]));
    let amount = 0; let count = 0; let overdue = 0; let paid = 0; let total = 0;
    for (const inst of hub.finance.installments || []) {
      const order = orderById.get(inst.salesOrderId);
      if (!order || !isLiveOrder(order)) continue;
      const st = installmentState(inst, order, today);
      total += 1;
      if (st.outstanding) { amount += num(inst.amount); count += 1; } else paid += 1;
      if (st.overdue) overdue += 1;
    }
    facts.outstanding = { amount: Math.round(amount * 100) / 100, count, overdue, paid, total };
  }
  if (hub?.requests?.visible) {
    const open = (hub.requests.rows || []).filter(isOpenRequest);
    facts.openRequests = { count: open.length, byDept: countBy(open, (r) => r.dept || '—') };
  }
  return facts;
}

function countBy(rows, keyOf) {
  const out = {};
  for (const row of rows) { const k = keyOf(row); out[k] = (out[k] || 0) + 1; }
  return out;
}

/* ── ค้นช่องเดียว (มติ 7) — "ตาเห็นบนแถว = ค้นเจอ" + เลขอ้างอิงที่คนถือมา (PO ลูกค้า · เลขอ้างอิงใบ) ─────── */
export const hubText = (...parts) => parts.flat().filter((v) => v !== null && v !== undefined && v !== '').join(' ').toLowerCase();

export function matchesQuery(haystack, query) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every((w) => haystack.includes(w));
}

export const dealRowText = (row) => hubText(
  row.deal.code, row.deal.title, row.deal.dealType, row.deal.categoryCode, row.deal.ownerName,
  row.quote?.quoteNumber, row.quote?.referenceNote, row.order?.orderNumber, row.order?.referenceDoc,
  row.lead?.company, row.lead?.contactName,
);
export const quoteText = (q, dealCode) => hubText(q.quoteNumber, q.referenceNote, dealCode);
export const orderText = (o, dealCode) => hubText(o.orderNumber, o.referenceDoc, dealCode);
export const leadText = (l) => hubText(l.company, l.contactName, l.channel, l.assigneeName);
export const contractText = (c, dealCode) => hubText(c.contractNo, c.externalRef, dealCode);
export const requestText = (r, dealCode) => hubText(r.docNo, r.pdrRefNo, r.title, r.requestedByName, dealCode);
export const installmentText = (i, orderNumber) => hubText(orderNumber, i.label, i.taxInvoiceNo);
export const registrationText = (r) => hubText(r.fgCode, r.productName, r.brandName, r.approvalNumber);

/* ── แท็บภาพรวม (งวด H2 · มติ 2: เปิดหน้ามาที่ภาพรวม) ─────────────────────────────────────────────── */

/** Actual รายเดือนของลูกค้า — **ตัวคิดเดียวกับรายงานยอดขาย** (reportActualRows + reportOrderMonth)
 *  ใบทั้งใบ = เดือนที่อนุมัติใบ (เวลาไทย) · ใบรายงวด = เดือนที่นับงวด (mig 0412) · ใบย้อนหลัง/ค่าสรรพสามิตไม่นับ
 *  คืน `months` เดือนล่าสุดจนถึงเดือนนี้ (เดือนที่ไม่มียอด = 0 · ให้กราฟไม่ขาดช่วง) + ยอดรวมของช่วง */
export function monthlyActual(orders = [], installments = [], { months = 12, now = new Date() } = {}) {
  const counted = orders.filter((o) => o.status === 'approved' && !isHistoricalOrder(o) && !isExciseOrder(o));
  const instByOrder = groupBy(installments, (i) => i.salesOrderId);
  const rows = reportActualRows(counted, { installmentsOf: (o) => instByOrder.get(o.id) || [] });
  const byMonth = new Map();
  for (const row of rows) {
    const month = reportOrderMonth(row);
    if (!month) continue;
    const amount = isInstallmentActualOrder(row) ? num(row.actualAmount) : salesOrderActual(row);
    byMonth.set(month, (byMonth.get(month) || 0) + amount);
  }
  const last = currentMonth(now);
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const month = addMonths(last, -i);
    out.push({ month, amount: Math.round((byMonth.get(month) || 0) * 100) / 100 });
  }
  return { months: out, total: Math.round(out.reduce((s, m) => s + m.amount, 0) * 100) / 100 };
}

const ORDER_NEEDS_ACTION = new Set(['draft', 'pending_approval', 'rejected', 'approval_revoked']);

/** "ต้องตามต่อ" — ของที่ยังค้างของลูกค้ารายนี้ เรียงจากเร่งไปเบา (เกินกำหนด → คำร้องค้าง → ใบสั่งขายค้าง → ดีลเปิด)
 *  แต่ละรายการ: { key, kind, tone, code, title, href, at } + ช่องตามชนิด (dueDate/amount · dept/status · status · stage/amount)
 *  `href` = หน้าของใบนั้น (ลิงก์ตรง ไม่ต้องไปหาในแท็บ) · ป้ายภาษาไทยของสถานะเป็นหน้าที่ของจอ */
export function followUps(hub, today = todayKey()) {
  const sales = hub?.sales || {};
  const out = [];
  if (hub?.finance?.visible) {
    const orderById = new Map((sales.orders || []).map((o) => [o.id, o]));
    for (const inst of hub.finance.installments || []) {
      const order = orderById.get(inst.salesOrderId);
      if (!order) continue;
      const st = installmentState(inst, order, today);
      if (!st.outstanding || !st.overdue) continue;
      out.push({
        key: `inst:${inst.id}`, kind: 'overdue', tone: 'danger', code: order.orderNumber,
        title: `งวด ${inst.seq ?? ''} เกินกำหนดชำระ`.trim(), dueDate: inst.dueDate, amount: num(inst.amount),
        href: `/sa/sales-orders/${order.id}`, at: inst.dueDate,
      });
    }
  }
  if (hub?.requests?.visible) {
    for (const r of (hub.requests.rows || []).filter(isOpenRequest)) {
      out.push({
        key: `req:${r.id}`, kind: 'request', tone: 'warning', code: r.docNo || 'ร่าง',
        title: r.title || 'คำร้อง', dept: r.dept || null, status: r.status, href: `/requests/${r.id}`, at: r.submittedAt || r.createdAt,
      });
    }
  }
  if (sales.visible) {
    for (const o of (sales.orders || []).filter((x) => ORDER_NEEDS_ACTION.has(x.status) && !x.supersededById)) {
      out.push({
        key: `so:${o.id}`, kind: 'order', tone: 'info', code: o.orderNumber,
        title: 'ใบสั่งขายยังไม่อนุมัติ', status: o.status, href: `/sa/sales-orders/${o.id}`, at: o.createdAt,
      });
    }
    for (const d of (sales.deals || []).filter(isOpenDeal).sort(newestFirst)) {
      out.push({
        key: `deal:${d.id}`, kind: 'deal', tone: 'neutral', code: d.code,
        title: d.title || 'ดีล', stage: d.stage, amount: num(d.projectValue), href: `/sa/deals/${d.id}`, at: d.createdAt,
      });
    }
  }
  return out;
}

/** "ล่าสุด" — เหตุการณ์จากวันที่บนใบ (เปิดดีล · ลูกค้ารับใบเสนอราคา · อนุมัติใบสั่งขาย · รับรองการชำระ · ยื่น/ปิดคำร้อง)
 *  ⚠️ ยังไม่ใช่ความเคลื่อนไหวรวมจาก entity_updates (นั่นคืองวด H3) — ที่นี่เล่าจากช่องเวลาบนแถวที่โหลดมาแล้วเท่านั้น */
export function recentEvents(hub, { limit = 6 } = {}) {
  const sales = hub?.sales || {};
  const dealCode = new Map((sales.deals || []).map((d) => [d.id, d.code]));
  const orderById = new Map((sales.orders || []).map((o) => [o.id, o]));
  const ev = [];
  const push = (at, e) => { if (at) ev.push({ ...e, at }); };
  for (const d of sales.deals || []) push(d.createdAt, { key: `d:${d.id}`, kind: 'deal', code: d.code, text: `เปิดดีล ${d.title || ''}`.trim(), href: `/sa/deals/${d.id}` });
  for (const q of sales.quotations || []) {
    if (q.status === 'accepted') push(q.acceptedAt, { key: `q:${q.id}`, kind: 'quote', code: q.quoteNumber, text: `ลูกค้ารับใบเสนอราคา · ดีล ${dealCode.get(q.dealId) || '—'}`, href: `/sa/quotations/${q.id}` });
  }
  for (const o of sales.orders || []) {
    if (o.approvedAt) push(o.approvedAt, { key: `o:${o.id}`, kind: 'order', code: o.orderNumber, text: 'อนุมัติใบสั่งขาย', href: `/sa/sales-orders/${o.id}` });
  }
  for (const i of hub?.finance?.installments || []) {
    const o = orderById.get(i.salesOrderId);
    if (i.status === 'confirmed' && o) push(i.confirmedAt, { key: `i:${i.id}`, kind: 'payment', code: o.orderNumber, text: `รับรองการชำระงวด ${i.seq ?? ''}`.trim(), href: `/sa/sales-orders/${o.id}` });
  }
  for (const r of hub?.requests?.rows || []) {
    push(r.submittedAt, { key: `rs:${r.id}`, kind: 'request', code: r.docNo, text: `ยื่นคำร้อง ${r.title || ''}`.trim(), href: `/requests/${r.id}` });
    if (r.status === 'closed') push(r.closedAt, { key: `rc:${r.id}`, kind: 'request', code: r.docNo, text: 'ปิดคำร้อง', href: `/requests/${r.id}` });
  }
  return ev.sort((a, b) => time(b.at) - time(a.at)).slice(0, limit);
}

