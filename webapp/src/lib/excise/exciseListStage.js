// ── ป้าย "สรรพสามิต · ขั้น" บนแถวทะเบียนใบสั่งขาย (มติเจ้าของ 03/11/2026) ─────────────────────────────────────
//
// เจ้าของถาม: "รายการ SO มันจะมีอะไรบอกมั้ยว่า SO นี้ต้องมีสรรพสามิต และถึงขั้นไหน" ⇒ แถว SO ลูกค้าที่มีสินค้าหมวดสรรพสามิต
// บอกขั้นบนเส้น SA → RA บรรทัดเดียว · แถว SO ค่าสรรพสามิต (แท็บ "สรรพสามิต") บอกว่าเป็นของ SO ไหน + ขั้นของ RA
// ⭐ "รอออกใบค่าสรรพสามิต" = คิวของ SA ตัวเดียวกับแดชบอร์ด (`loadAwaitingFiling`) ไม่คิดเอง · คำของขั้นรอบ/ใบยื่นมาจาก
//    `exciseRoundStage` (เส้นเดินงานบนหน้า SO) — สองจอพูดคำเดียวกัน
// ⚠️ ไฟล์นี้มีทั้งตัวตัดสิน (บริสุทธิ์ · เทสต์ได้) และตัวโหลด — ตัวโหลดเรียกจาก GET ทะเบียนใบสั่งขายที่เดียว
import { exciseRoundStage } from '@/lib/sales/salesOrderWorkTrack';
import { categoryOf, isExciseCategory } from '@/lib/master/categoryOf';
import { isExciseOrder } from '@/lib/sales/historicalOrders';
import { EXCISE_NOT_BILLED_KINDS } from '@/lib/excise/exciseNotBilled';
import { NOT_BILLED_FILING_KINDS } from '@/lib/excise/raFilingRules';
import { LIVE_EXCISE_QUOTATION_STATUSES } from '@/lib/excise/exciseQuotation';
import { loadAwaitingFiling } from '@/lib/sales/handoffQueueData';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';

const DONE = 'success';
const SA_TURN = 'warning';
const WAITING = 'info';

/** SO ลูกค้ามีสินค้าหมวดสรรพสามิตไหม — หมวดจากรหัส FG (หรือหมวดของบรรทัดพิมพ์เอง) × ธง isExcise ของหมวด */
export function orderHasExciseLines(lines = [], productTypes = []) {
  return (lines || []).some((line) => {
    const category = categoryOf(String(line?.fgCode || '').trim()) || line?.categoryCode || null;
    return !!category && isExciseCategory(category, productTypes);
  });
}

const filingText = (filing) => exciseRoundStage({ filing }).text;
const filingDone = (filing) => exciseRoundStage({ filing }).done;

const EXCISE_ORDER_TEXT = {
  approved: 'รอ RA ยื่นกรม',
  pending_approval: 'รออนุมัติ',
  rejected: 'ถูกตีกลับ',
  draft: 'ร่าง',
};

/**
 * ป้ายของแถว — `{ text, tone }` หรือ null (ไม่มีเรื่องสรรพสามิต)
 * @param ctx.needsExcise  SO ลูกค้ามีสินค้าหมวดสรรพสามิต
 * @param ctx.awaiting     อยู่ในคิว SA "รอออกใบค่าสรรพสามิต"
 * @param ctx.rounds       รอบของ SO ลูกค้า (เก่า → ใหม่) `[{ quote, exciseOrder, filing }]`
 * @param ctx.filing       ใบยื่นของแถวนี้ (SO ไม่เรียกเก็บ = ใบยื่นที่ผูก SO ลูกค้าตรง · SO ค่าสรรพสามิต = ใบยื่นของรอบนั้น)
 * @param ctx.sourceOrderNumber  เลข SO ลูกค้าต้นทาง (แถว SO ค่าสรรพสามิต)
 */
export function exciseListStage(order, { needsExcise = false, awaiting = false, rounds = [], filing = null, sourceOrderNumber = null } = {}) {
  if (!order) return null;
  if (isExciseOrder(order)) {
    const step = filing ? filingText(filing) : EXCISE_ORDER_TEXT[order.status] || null;
    return {
      text: [`ของ ${sourceOrderNumber || 'SO ต้นทาง'}`, step].filter(Boolean).join(' · '),
      tone: filing && filingDone(filing) ? DONE : WAITING,
    };
  }
  if (!needsExcise) return null;
  if (order.status !== 'approved') return { text: 'มีสินค้าสรรพสามิต · ออกใบค่าสรรพสามิตได้หลังอนุมัติ', tone: 'neutral' };

  if (order.exciseNotBilledKind) {
    const label = EXCISE_NOT_BILLED_KINDS[order.exciseNotBilledKind]?.label || order.exciseNotBilledKind;
    const toRa = NOT_BILLED_FILING_KINDS.includes(order.exciseNotBilledKind);
    const step = toRa ? (filing ? filingText(filing) : 'รอ RA ยื่นกรม') : null;
    return {
      text: [`ไม่เรียกเก็บในระบบ · ${label}`, step].filter(Boolean).join(' · '),
      tone: !toRa || (filing && filingDone(filing)) ? DONE : WAITING,
    };
  }
  if (awaiting) {
    return { text: rounds.length ? 'รอออกใบค่าสรรพสามิตรอบถัดไป' : 'รอออกใบค่าสรรพสามิต', tone: SA_TURN };
  }

  const latest = rounds.at(-1);
  if (latest) {
    const prefix = rounds.length > 1 ? `รอบที่ ${rounds.length} · ` : '';
    if (latest.filing) {
      return { text: `${prefix}ค่าสรรพสามิต · ${filingText(latest.filing)}`, tone: filingDone(latest.filing) ? DONE : WAITING };
    }
    if (latest.exciseOrder) {
      const status = latest.exciseOrder.status;
      return {
        text: `${prefix}SO ค่าสรรพสามิต ${latest.exciseOrder.orderNumber || ''} · ${EXCISE_ORDER_TEXT[status] || status}`.replace(/\s+·/, ' ·'),
        tone: status === 'approved' ? WAITING : SA_TURN,
      };
    }
    const quote = latest.quote || {};
    const number = quote.quoteNumber ? ` ${quote.quoteNumber}` : '';
    if (quote.status === 'accepted') return { text: `${prefix}ใบค่าสรรพสามิต${number} Won · รอออก SO ค่าสรรพสามิต`, tone: SA_TURN };
    const sa = quote.status === 'draft' && quote.approvalStatus !== 'pending' && quote.approvalStatus !== 'approved';
    return { text: `${prefix}ใบค่าสรรพสามิต${number} · ${exciseRoundStage({ quote }).text}`, tone: sa || quote.status === 'rejected' ? SA_TURN : WAITING };
  }
  if (filing) return { text: `ค่าสรรพสามิต · ${filingText(filing)}`, tone: filingDone(filing) ? DONE : WAITING };
  // อนุมัติแล้ว มีสินค้าหมวดสรรพสามิต แต่ไม่อยู่ในคิว SA และไม่มีรอบ = ไม่มีรายการที่ต้องยื่นจริง (ทะเบียนไม่ต้องเสียภาษี ฯลฯ)
  return { text: 'ไม่มีรายการที่ต้องยื่นภาษี', tone: 'neutral' };
}

const raise = (label, error) => {
  if (error) throw new Error(`${label}: ${error.message || error}`);
};

/**
 * ป้ายของทุกแถวที่ทะเบียนโหลด — Map id → `{ text, tone }` · อ่านพลาด = throw (ผู้เรียกตัดสินว่าจะกลืนไหม)
 * @param orders      แถว SO ทั้งทะเบียน (`select('*')` — มี origin · status · exciseNotBilledKind · sourceSalesOrderId · quotationId)
 * @param linesByOrder Map id → บรรทัด (fgCode · categoryCode)
 */
export async function loadExciseListStages(supabase, orders = [], { linesByOrder = new Map(), loadAwaiting = loadAwaitingFiling } = {}) {
  const { data: productTypes, error: typeError } = await supabase.from('product_types')
    .select('mainCategoryCode, typeCode, isExcise');
  raise('โหลดหมวดสินค้าไม่สำเร็จ', typeError);

  const byId = new Map((orders || []).map((order) => [order.id, order]));
  const customerIds = (orders || [])
    .filter((order) => order.origin === 'pipeline' && !isExciseOrder(order)
      && orderHasExciseLines(linesByOrder.get(order.id) || [], productTypes || []))
    .map((order) => order.id);
  const needs = new Set(customerIds);
  const exciseOrders = (orders || []).filter((order) => isExciseOrder(order));
  if (!needs.size && !exciseOrders.length) return new Map();

  const [awaitingRows, quoteResult, filingResult] = await Promise.all([
    needs.size ? loadAwaiting(supabase, null, { limit: Infinity }) : [],
    fetchInChunks(customerIds, (chunk) => fetchAllResult(() => supabase.from('quotations')
      .select('id, "quoteNumber", "sourceSalesOrderId", status, "approvalStatus", "createdAt"')
      .in('sourceSalesOrderId', chunk)
      .in('status', LIVE_EXCISE_QUOTATION_STATUSES)
      .order('createdAt', { ascending: true })
      .order('id', { ascending: true }))),
    fetchInChunks(customerIds, (chunk) => fetchAllResult(() => supabase.from('orders')
      .select('id, status, "salesOrderId", "exciseSalesOrderId"')
      .in('salesOrderId', chunk)
      .order('id', { ascending: true }))),
  ]);
  raise('โหลดใบค่าสรรพสามิตไม่สำเร็จ', quoteResult.error);
  raise('โหลดใบยื่นชำระภาษีไม่สำเร็จ', filingResult.error);

  const awaitingIds = new Set((awaitingRows || []).map((row) => row.id));
  const liveExciseByQuote = new Map(exciseOrders
    .filter((order) => order.status !== 'cancelled' && !order.supersededById && order.quotationId)
    .map((order) => [order.quotationId, order]));
  const filingByExcise = new Map();
  const filingByCustomer = new Map();
  for (const filing of filingResult.data || []) {
    if (filing.exciseSalesOrderId) filingByExcise.set(filing.exciseSalesOrderId, filing);
    else filingByCustomer.set(filing.salesOrderId, filing);
  }
  const roundsBySource = new Map();
  for (const quote of quoteResult.data || []) {
    const exciseOrder = quote.status === 'accepted' ? liveExciseByQuote.get(quote.id) || null : null;
    const round = { quote, exciseOrder, filing: exciseOrder ? filingByExcise.get(exciseOrder.id) || null : null };
    roundsBySource.set(quote.sourceSalesOrderId, [...(roundsBySource.get(quote.sourceSalesOrderId) || []), round]);
  }

  const stages = new Map();
  for (const id of customerIds) {
    const stage = exciseListStage(byId.get(id), {
      needsExcise: true,
      awaiting: awaitingIds.has(id),
      rounds: roundsBySource.get(id) || [],
      filing: filingByCustomer.get(id) || null,
    });
    if (stage) stages.set(id, stage);
  }
  // ใบยื่นของ SO ค่าสรรพสามิต: แถวของ SO ลูกค้าต้นทางที่โหลดมาแล้วข้างบน · ต้นทางไม่ได้อยู่ในชุดนี้ = ยังไม่รู้ขั้น RA
  for (const order of exciseOrders) {
    const stage = exciseListStage(order, {
      filing: filingByExcise.get(order.id) || null,
      sourceOrderNumber: byId.get(order.sourceSalesOrderId)?.orderNumber || null,
    });
    if (stage) stages.set(order.id, stage);
  }
  return stages;
}
