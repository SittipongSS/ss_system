// ── ใบยื่นกรมของ RA — ตัวโหลดฝั่ง server (แผนรื้อสรรพสามิต PR5 · mig 0417) ──────────────────────────────
//
// ใช้ร่วม: คิวงานของ RA (GET /api/tax/orders/queue) · เริ่มยื่น = เขียนบันทึก (POST /api/tax/orders/from-sales-order) ·
// แผงสรุปบนหน้างาน (GET /api/orders/[id]) · ใบสรุปรายการยื่น · ป้ายเมนู — RA ไม่มีสิทธิ์เปิดหน้าขาย (ไม่มี salesplan:view) ⇒ ทุกอย่างที่ RA
// ต้องรู้เรื่อง SO มาทางนี้ อ่านด้วยบัญชีระบบ แล้วส่งเฉพาะช่องที่ใบยื่นต้องใช้
// กติกาล้วน (รายการ · ด่าน) อยู่ที่ raFilingRules.js
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { ORIGIN_PIPELINE, exciseRowsOnly, isExciseOrder, pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { resolveSalesOrderFiling } from '@/lib/excise/soFilingItems';
import { billedTaxTotals } from '@/lib/tax/exciseBilling';
import { ORDER_SELECT, attachRegistrations } from '@/lib/tax/orders';
import { statusMeta } from '@/lib/excise/workflow';
import { productDisplayName } from '@/lib/master/productIdentity';
import { LIVE_EXCISE_QUOTATION_STATUSES } from '@/lib/excise/exciseQuotation';
import { roundsRemainingUnits } from '@/lib/excise/exciseRounds';
import {
  FILING_SOURCE_EXCISE_ORDER, FILING_SOURCE_NOT_BILLED, NOT_BILLED_FILING_KINDS,
  exciseOrderFilingLines, filingSourceOf, filingStartGates, notBilledLabel,
} from '@/lib/excise/raFilingRules';

const ORDER_FIELDS = 'id, "orderNumber", status, "customerId", "customerName", "orderDate", "approvedAt", "supersededById"';

/* ใบยื่นที่มีอยู่ทั้งหมด (สองลิงก์) — ตารางเล็กแต่ไล่หน้าให้ครบเสมอ
   ⭐ แบ่งรอบ (0418): รอบละใบยื่น ⇒ SO ค่าสรรพสามิตตัดสินด้วย `byExciseOrder` อย่างเดียว · `bySalesOrder` = ใบยื่นแบบไม่เรียกเก็บ
   (ไม่ผูก SO ค่าสรรพสามิต · หนึ่งใบต่อ SO ลูกค้า) — เดิมนับทุกใบ ⇒ รอบที่สองหายจากคิว RA เพราะ SO ลูกค้ามีใบยื่นของรอบแรกแล้ว */
async function existingFilingLinks(supabase) {
  const { data, error } = await fetchAllResult(() => supabase
    .from('orders').select('id, "salesOrderId", "exciseSalesOrderId"')
    .not('salesOrderId', 'is', null)
    .order('id', { ascending: true }));
  if (error) throw error;
  return {
    bySalesOrder: new Map((data || []).filter((row) => !row.exciseSalesOrderId).map((row) => [row.salesOrderId, row.id])),
    byExciseOrder: new Map((data || []).filter((row) => row.exciseSalesOrderId).map((row) => [row.exciseSalesOrderId, row.id])),
  };
}

/**
 * คิวงานของ RA ที่ยังไม่มีบันทึกการยื่น — คำนวณสด ไม่เก็บ (แผน หมวด 12.2 ขั้น 11)
 *  · **รอ RA** (`ready: true`): SO ค่าสรรพสามิตที่อนุมัติแล้วที่ยังไม่มีบันทึก (รายรอบ · 0418) ·
 *    SO ลูกค้าที่ตัดสิน "ไม่เรียกเก็บ" แบบเก็บนอกระบบ/รวมในราคา
 *  · ⭐ **กำลังมา** (มติเจ้าของ 29/10 · `ready: false`): ใบเสนอราคาค่าสรรพสามิตที่อนุมัติแล้ว แต่ SO ค่าสรรพสามิตยังไม่อนุมัติ —
 *    RA เห็นงานล่วงหน้าพร้อมขั้นที่ถึง (รอ Won · รอออก SO · SO รออนุมัติ) และเตรียมทะเบียนได้ก่อน · เริ่มยื่นยังไม่ได้
 *    (บันทึกผูก SO ค่าสรรพสามิต — 0417)
 * @param upcoming  false = ข้ามแถวกำลังมา (ป้ายเมนูนับแค่รอ RA)
 * @returns แถวละหนึ่งงาน `{ key, source, ready, salesOrder, exciseOrder?, exciseQuote?, notBilled?, stage? }` เก่าสุดก่อน
 */
export async function loadRaFilingQueue(supabase, { upcoming = true } = {}) {
  const [exciseResult, notBilledResult, links] = await Promise.all([
    fetchAllResult(() => exciseRowsOnly(supabase
      .from('sales_orders')
      .select(`${ORDER_FIELDS}, "sourceSalesOrderId", "quotationId", "totalAmount", "vatAmount", "financeStatus"`)
      .eq('status', 'approved')
      .is('supersededById', null))
      .order('approvedAt', { ascending: true })
      .order('id', { ascending: true })),
    fetchAllResult(() => pipelineRowsOnly(supabase
      .from('sales_orders')
      .select(`${ORDER_FIELDS}, "exciseNotBilledKind", "exciseNotBilledReason", "exciseNotBilledRef", "exciseNotBilledAt"`)
      .eq('status', 'approved')
      .is('supersededById', null)
      .in('exciseNotBilledKind', NOT_BILLED_FILING_KINDS))
      .order('exciseNotBilledAt', { ascending: true })
      .order('id', { ascending: true })),
    existingFilingLinks(supabase),
  ]);
  if (exciseResult.error) throw exciseResult.error;
  if (notBilledResult.error) throw notBilledResult.error;

  const exciseOrders = (exciseResult.data || []).filter((row) => !links.byExciseOrder.has(row.id));
  const sourceRows = await fetchAllInChunks(
    exciseOrders.map((row) => row.sourceSalesOrderId),
    (chunk) => supabase.from('sales_orders').select(ORDER_FIELDS).in('id', chunk).order('id', { ascending: true }),
  );
  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
  const quoteRows = await fetchAllInChunks(
    exciseOrders.map((row) => row.quotationId),
    (chunk) => supabase.from('quotations').select('id, "quoteNumber"').in('id', chunk).order('id', { ascending: true }),
  );
  const quoteNumberById = new Map(quoteRows.map((row) => [row.id, row.quoteNumber]));

  const rows = [];
  for (const exciseOrder of exciseOrders) {
    const salesOrder = sourceById.get(exciseOrder.sourceSalesOrderId);
    if (!salesOrder || salesOrder.status !== 'approved') continue;
    rows.push({
      key: `excise:${exciseOrder.id}`,
      source: FILING_SOURCE_EXCISE_ORDER,
      ready: true,
      salesOrder,
      exciseOrder: { ...exciseOrder, quoteNumber: quoteNumberById.get(exciseOrder.quotationId) || null },
      since: exciseOrder.approvedAt || null,
    });
  }
  for (const salesOrder of notBilledResult.data || []) {
    if (links.bySalesOrder.has(salesOrder.id)) continue;
    rows.push({
      key: `not_billed:${salesOrder.id}`,
      source: FILING_SOURCE_NOT_BILLED,
      ready: true,
      salesOrder,
      notBilled: {
        kind: salesOrder.exciseNotBilledKind,
        label: notBilledLabel(salesOrder.exciseNotBilledKind),
        reason: salesOrder.exciseNotBilledReason || null,
        ref: salesOrder.exciseNotBilledRef || null,
      },
      since: salesOrder.exciseNotBilledAt || salesOrder.approvedAt || null,
    });
  }
  const readyExciseOrderIds = new Set((exciseResult.data || []).map((row) => row.quotationId));
  if (upcoming) rows.push(...await loadUpcomingRows(supabase, { links, readyQuoteIds: readyExciseOrderIds }));
  await attachRounds(supabase, rows);
  return rows.sort((a, b) => String(a.since || '').localeCompare(String(b.since || '')));
}

/* ⭐ แบ่งรอบ (แผน หมวด 13 · D19): งานรายรอบได้ป้าย "รอบที่ n จาก m" + ยอดค้างของ SO ลูกค้า (ยอดตรึงบนใบ · ไม่คิดใบยื่นใหม่)
   — RA รู้ว่าใบนี้ยังมีรอบตามมาอีก · เขียนลง `row.round` (null = งานไม่เรียกเก็บ / หารอบไม่เจอ) */
async function attachRounds(supabase, rows) {
  const targets = rows.filter((row) => row.salesOrder?.id && (row.exciseOrder?.quotationId || row.exciseQuote?.id));
  const sourceIds = [...new Set(targets.map((row) => row.salesOrder.id))];
  if (!sourceIds.length) return;
  const quotes = await fetchAllInChunks(sourceIds, (chunk) => exciseRowsOnly(supabase
    .from('quotations').select('id, "sourceSalesOrderId", status, "createdAt", metadata, lines:quotation_lines(qty, "packQty", metadata)'))
    .in('sourceSalesOrderId', chunk)
    .in('status', LIVE_EXCISE_QUOTATION_STATUSES)
    .order('id', { ascending: true }));
  const bySource = new Map();
  for (const quote of quotes) bySource.set(quote.sourceSalesOrderId, [...(bySource.get(quote.sourceSalesOrderId) || []), quote]);
  for (const list of bySource.values()) list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  for (const row of targets) {
    const list = bySource.get(row.salesOrder.id) || [];
    const index = list.findIndex((quote) => quote.id === (row.exciseOrder?.quotationId || row.exciseQuote?.id));
    row.round = index < 0 ? null : { no: index + 1, count: list.length, remainingUnits: roundsRemainingUnits(list) };
  }
}

/* ขั้นของแถวกำลังมา — ใครถือ · รออะไร (คำบนคิวของ RA) */
export const UPCOMING_STAGE_TEXT = Object.freeze({
  quote_approved: 'ใบเสนอราคาค่าสรรพสามิตอนุมัติแล้ว — รอลูกค้าตอบรับ (Won)',
  quote_accepted: 'ใบเสนอราคาค่าสรรพสามิต Won แล้ว — รอฝ่ายขายออกใบสั่งขายค่าสรรพสามิต',
  order_pending: 'ใบสั่งขายค่าสรรพสามิตรออนุมัติ',
  order_draft: 'ใบสั่งขายค่าสรรพสามิตเป็นร่าง — รอฝ่ายขายยื่นอนุมัติ',
});

/** แถวกำลังมา: ใบเสนอราคาค่าสรรพสามิตอนุมัติแล้ว (ส่ง/รับแล้ว) ที่ยังไม่มี SO ค่าสรรพสามิตอนุมัติ (รายรอบ — รอบก่อนยื่นแล้วไม่ตัดรอบนี้) */
async function loadUpcomingRows(supabase, { links, readyQuoteIds }) {
  const { data: quotes, error } = await fetchAllResult(() => exciseRowsOnly(supabase
    .from('quotations')
    .select('id, "quoteNumber", status, "approvalStatus", "approvedAt", "sourceSalesOrderId", "totalAmount", "customerName"'))
    .eq('approvalStatus', 'approved')
    .in('status', ['draft', 'sent', 'accepted'])
    .order('approvedAt', { ascending: true })
    .order('id', { ascending: true }));
  if (error) throw error;
  const waiting = (quotes || []).filter((quote) => !readyQuoteIds.has(quote.id));
  if (!waiting.length) return [];
  const [sourceRows, orderResult] = await Promise.all([
    fetchAllInChunks(
      waiting.map((quote) => quote.sourceSalesOrderId),
      (chunk) => supabase.from('sales_orders').select(ORDER_FIELDS).in('id', chunk).order('id', { ascending: true }),
    ),
    fetchAllResult(() => exciseRowsOnly(supabase
      .from('sales_orders')
      .select('id, "orderNumber", status, "quotationId", "createdAt"')
      .in('status', ['draft', 'pending_approval', 'rejected'])
      .is('supersededById', null))
      .order('createdAt', { ascending: true })
      .order('id', { ascending: true })),
  ]);
  if (orderResult.error) throw orderResult.error;
  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
  const orderByQuote = new Map((orderResult.data || []).map((row) => [row.quotationId, row]));
  const rows = [];
  for (const quote of waiting) {
    const salesOrder = sourceById.get(quote.sourceSalesOrderId);
    if (!salesOrder || salesOrder.status !== 'approved') continue;
    const order = quote.status === 'accepted' ? orderByQuote.get(quote.id) || null : null;
    const stage = order
      ? (order.status === 'pending_approval' ? 'order_pending' : 'order_draft')
      : quote.status === 'accepted' ? 'quote_accepted' : 'quote_approved';
    rows.push({
      key: `upcoming:${quote.id}`,
      source: 'upcoming',
      ready: false,
      salesOrder,
      exciseQuote: { id: quote.id, quoteNumber: quote.quoteNumber, status: quote.status, totalAmount: Number(quote.totalAmount) || 0 },
      exciseOrder: order ? { id: order.id, orderNumber: order.orderNumber, status: order.status } : null,
      stage,
      stageLabel: UPCOMING_STAGE_TEXT[stage],
      since: quote.approvedAt || null,
    });
  }
  return rows;
}

/* SO หนึ่งใบพร้อมบรรทัดครบคอลัมน์ (packQty · metadata) */
async function loadOrderWithLines(supabase, id) {
  const { data, error } = await supabase
    .from('sales_orders').select('*, lines:sales_order_lines(*)').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

const fail = (status, message) => ({ error: { status, message } });

/**
 * แหล่งของงานยื่นหนึ่งงาน (เริ่มยื่น/พรีวิว/ใบสรุป) — `{ error }` หรือ `{ source, salesOrder, exciseOrder, resolved }`
 * @param exciseSalesOrderId SO ค่าสรรพสามิต (ใบที่ลูกค้าจ่ายค่าภาษี) · หรือ
 * @param salesOrderId       SO ลูกค้าที่ตัดสินไม่เรียกเก็บ
 */
export async function loadFilingSource(supabase, { exciseSalesOrderId = '', salesOrderId = '' } = {}) {
  let exciseOrder = null;
  let customerOrderId = salesOrderId;
  if (exciseSalesOrderId) {
    exciseOrder = await loadOrderWithLines(supabase, exciseSalesOrderId);
    if (!exciseOrder || !isExciseOrder(exciseOrder)) return fail(404, 'ไม่พบใบสั่งขายค่าสรรพสามิต');
    if (exciseOrder.status !== 'approved' || exciseOrder.supersededById) {
      return fail(400, `ใบสั่งขายค่าสรรพสามิต ${exciseOrder.orderNumber || exciseOrder.id} ยังไม่ได้อยู่ในสถานะอนุมัติแล้ว — เริ่มยื่นไม่ได้`);
    }
    customerOrderId = exciseOrder.sourceSalesOrderId;
  }
  if (!customerOrderId) return fail(400, 'กรุณาระบุใบสั่งขาย');
  const salesOrder = await loadOrderWithLines(supabase, customerOrderId);
  if (!salesOrder) return fail(404, 'ไม่พบใบสั่งขายของลูกค้า');
  if (salesOrder.origin !== ORIGIN_PIPELINE) return fail(400, 'งานยื่นกรมผูกได้เฉพาะใบสั่งขายจากใบเสนอราคา');
  if (salesOrder.status !== 'approved' || salesOrder.supersededById) {
    return fail(400, `ใบสั่งขาย ${salesOrder.orderNumber || salesOrder.id} ไม่ได้อยู่ในสถานะอนุมัติแล้ว — เริ่มยื่นไม่ได้`);
  }
  if (!exciseOrder && !NOT_BILLED_FILING_KINDS.includes(salesOrder.exciseNotBilledKind)) {
    return fail(400, salesOrder.exciseNotBilledKind === 'not_liable'
      ? 'ใบสั่งขายนี้ฝ่ายขายตัดสินว่าไม่ต้องเสียภาษี — ไม่ต้องยื่นกรม'
      : salesOrder.exciseNotBilledKind === 'paid_before_launch'
        ? 'ใบสั่งขายนี้จ่ายกรมไปแล้วก่อนเปิดระบบ (ฝ่ายขายบันทึกไว้) — ไม่ต้องยื่นซ้ำ'
      : 'ใบสั่งขายนี้ยังไม่มีใบสั่งขายค่าสรรพสามิตที่อนุมัติ และไม่ได้ตัดสินว่าไม่เรียกเก็บ — ยังไม่ใช่งานยื่นกรม');
  }

  const customerResolved = await resolveSalesOrderFiling(supabase, salesOrder);
  if (!exciseOrder) {
    return {
      source: FILING_SOURCE_NOT_BILLED,
      salesOrder,
      exciseOrder: null,
      resolved: { ...customerResolved, amountToCollect: billedTaxTotals(customerResolved.lines).amountToCollect },
    };
  }
  const built = exciseOrderFilingLines({ exciseLines: exciseOrder.lines || [], customerLines: customerResolved.lines });
  if (!built.lines.length) return fail(400, 'ใบสั่งขายค่าสรรพสามิตนี้ไม่มีรายการค่าภาษีให้ยื่น');
  // เลขใบค่าสรรพสามิตของรอบนี้ — เลขอ้างอิงบนบันทึกการยื่น (รอบละใบ · แบ่งรอบ 0418)
  const { data: exciseQuote, error: exciseQuoteError } = exciseOrder.quotationId
    ? await supabase.from('quotations').select('"quoteNumber"').eq('id', exciseOrder.quotationId).maybeSingle()
    : { data: null, error: null };
  if (exciseQuoteError) throw exciseQuoteError;
  return {
    source: FILING_SOURCE_EXCISE_ORDER,
    salesOrder,
    exciseOrder,
    exciseQuoteNumber: exciseQuote?.quoteNumber || null,
    resolved: {
      ...built,
      eligible: true,
      // ยอดเรียกเก็บ = ยอดรวมของ SO ค่าสรรพสามิต (ที่ลูกค้าจ่ายจริง · รวม VAT) — ไม่คิดซ้ำ
      amountToCollect: Number(exciseOrder.totalAmount) || 0,
    },
  };
}

/**
 * ใบยื่นของงานนี้ที่มีอยู่แล้ว — `{ id, status }` หรือ null
 * ⭐ แบ่งรอบ (0418): งานรายรอบ = ดูลิงก์ SO ค่าสรรพสามิตอย่างเดียว (SO ลูกค้ามีใบยื่นของรอบอื่นได้) ·
 *    งานไม่เรียกเก็บ = ใบยื่นของ SO ลูกค้าที่ไม่ผูก SO ค่าสรรพสามิต (ทั้งใบ · V12)
 */
export async function findFilingFor(supabase, { salesOrderId, exciseSalesOrderId }) {
  if (!salesOrderId && !exciseSalesOrderId) return null;
  const query = supabase.from('orders').select('id, status');
  const { data, error } = await (exciseSalesOrderId
    ? query.eq('exciseSalesOrderId', exciseSalesOrderId)
    : query.eq('salesOrderId', salesOrderId).is('exciseSalesOrderId', null)).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

/**
 * แผงสรุป SO บนหน้างาน (บันทึกการยื่น) + สถานะเงิน/ทะเบียน — RA อ่านได้โดยไม่ต้องเข้าหน้าขาย
 * @param order บันทึกการยื่น (ฝัง items แล้ว)
 */
export async function loadFilingSummary(supabase, order) {
  const source = filingSourceOf(order);
  if (!source) return { source: null, gates: filingStartGates({ order }) };
  const ids = [order.salesOrderId, order.exciseSalesOrderId].filter(Boolean);
  const { data, error } = await supabase
    .from('sales_orders')
    .select(`${ORDER_FIELDS}, origin, "quotationId", "totalAmount", "vatAmount", "financeStatus", "exciseNotBilledKind", "exciseNotBilledReason", "exciseNotBilledRef"`)
    .in('id', ids)
    .limit(ids.length); // ไม่เกินสองใบ (SO ลูกค้า + SO ค่าสรรพสามิตของใบยื่นนี้)
  if (error) throw error;
  const byId = new Map((data || []).map((row) => [row.id, row]));
  const salesOrder = byId.get(order.salesOrderId) || null;
  const exciseOrder = order.exciseSalesOrderId ? byId.get(order.exciseSalesOrderId) || null : null;
  let quoteNumber = null;
  if (exciseOrder?.quotationId) {
    const { data: quote, error: quoteError } = await supabase
      .from('quotations').select('"quoteNumber"').eq('id', exciseOrder.quotationId).maybeSingle();
    if (quoteError) throw quoteError;
    quoteNumber = quote?.quoteNumber || null;
  }
  const pick = (row) => (row ? {
    id: row.id, orderNumber: row.orderNumber, status: row.status, customerName: row.customerName,
    orderDate: row.orderDate, approvedAt: row.approvedAt,
  } : null);
  return {
    source,
    salesOrder: pick(salesOrder),
    exciseOrder: exciseOrder ? {
      ...pick(exciseOrder),
      totalAmount: Number(exciseOrder.totalAmount) || 0,
      vatAmount: Number(exciseOrder.vatAmount) || 0,
      financeStatus: exciseOrder.financeStatus || null,
      quoteNumber,
    } : null,
    notBilled: salesOrder?.exciseNotBilledKind ? {
      kind: salesOrder.exciseNotBilledKind,
      label: notBilledLabel(salesOrder.exciseNotBilledKind),
      reason: salesOrder.exciseNotBilledReason || null,
      ref: salesOrder.exciseNotBilledRef || null,
    } : null,
    gates: filingStartGates({ order, exciseOrder, notBilledKind: salesOrder?.exciseNotBilledKind || null }),
  };
}

/* ── ใบสรุปรายการยื่น (v3 · V9) — หนึ่งคีย์งาน → หัวงาน + รายการ (ของบริสุทธิ์ที่จัดเป็นรายงานอยู่ lib/excise/filingSummary.js)
   order:<id> = บันทึกที่ตรึงไว้ · excise:/not_billed: = ข้อมูลสดจาก SO ตัวโหลดเดียวกับตอนเริ่มยื่น (loadFilingSource) */
const PENDING_LABEL = 'รอ RA — ยังไม่เริ่มยื่น (ข้อมูลสดจากใบสั่งขาย)';

async function summaryRecordItem(supabase, id) {
  const { data: order, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!order) return { missing: `ไม่พบบันทึกการยื่น ${id}` };
  await attachRegistrations(supabase, order);
  let exciseOrderNumber = null;
  if (order.exciseSalesOrderId) {
    const { data: exciseOrder, error: exciseError } = await supabase
      .from('sales_orders').select('"orderNumber"').eq('id', order.exciseSalesOrderId).maybeSingle();
    if (exciseError) throw exciseError;
    exciseOrderNumber = exciseOrder?.orderNumber || null;
  }
  return {
    statusLabel: statusMeta(order.status).label,
    salesOrderNumber: order.poReference || order.quotationRef || order.id,
    exciseOrderNumber,
    customerName: order.customerName,
    customerTaxId: order.customerTaxId,
    lines: (order.items || []).map((item) => {
      const product = item.product || item.registration || {};
      return {
        fgCode: product.fgCode || '',
        description: productDisplayName(product),
        registrationNumber: item.registration?.approvalNumber || '',
        quantity: item.quantity,
        exciseRatePerUnit: item.exciseRatePerUnit,
        localTaxRatePerUnit: item.localTaxRatePerUnit,
        totalExciseTax: item.totalExciseTax,
        totalLocalTax: item.totalLocalTax,
        totalTax: item.totalTax,
      };
    }),
  };
}

async function summaryPendingItem(supabase, parsed) {
  const loaded = await loadFilingSource(supabase, parsed.kind === 'excise'
    ? { exciseSalesOrderId: parsed.id }
    : { salesOrderId: parsed.id });
  if (loaded.error) return { missing: loaded.error.message };
  const { salesOrder, exciseOrder, resolved } = loaded;
  const regIds = [...new Set(resolved.lines.map((line) => line.registrationId).filter(Boolean))];
  const [{ data: regs, error: regError }, { data: customer, error: customerError }] = await Promise.all([
    regIds.length
      ? supabase.from('excise_registrations').select('id, "approvalNumber"').in('id', regIds)
      : Promise.resolve({ data: [], error: null }),
    salesOrder.customerId
      ? supabase.from('customers').select('id, "taxId"').eq('id', salesOrder.customerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (regError) throw regError;
  if (customerError) throw customerError;
  const approvalById = new Map((regs || []).map((reg) => [reg.id, reg.approvalNumber]));
  return {
    statusLabel: PENDING_LABEL,
    salesOrderNumber: salesOrder.orderNumber,
    exciseOrderNumber: exciseOrder?.orderNumber || null,
    notBilledLabel: exciseOrder ? null : notBilledLabel(salesOrder.exciseNotBilledKind),
    customerName: salesOrder.customerName,
    customerTaxId: customer?.taxId || null,
    lines: resolved.lines.map((line) => ({
      fgCode: line.fgCode,
      description: line.description,
      registrationNumber: line.registrationId ? approvalById.get(line.registrationId) || '' : '',
      quantity: line.quantity,
      exciseRatePerUnit: line.exciseRatePerUnit,
      localTaxRatePerUnit: line.localTaxRatePerUnit,
      totalExciseTax: line.totalExciseTax,
      totalLocalTax: line.totalLocalTax,
      totalTax: line.totalTax,
    })),
  };
}

/** คีย์งานที่แกะแล้ว (`parseFilingSummaryKey`) → หัวงาน + รายการ หรือ `{ missing: ข้อความ }` เมื่อหาไม่เจอ/ไม่ใช่งานยื่น */
export function loadFilingSummaryItem(supabase, parsedKey) {
  return parsedKey.kind === 'order'
    ? summaryRecordItem(supabase, parsedKey.id)
    : summaryPendingItem(supabase, parsedKey);
}
