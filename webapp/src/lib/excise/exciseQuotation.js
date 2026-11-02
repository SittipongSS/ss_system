// ── ใบเสนอราคาค่าสรรพสามิต: สร้างจาก SO ลูกค้า + ด่านที่ใช้ร่วม (แผนรื้อสรรพสามิต PR3 · หมวด 3.1 · 3.4 · 5) ─────────────
//
// มติเจ้าของ 28/10/2026: SA ออกใบเสนอราคาค่าสรรพสามิตด้วยฟอร์ม QT เดิม · ไม่มีดีล ผูก SO ลูกค้าต้นทาง ·
// บรรทัดละ FG ต้นทาง (ระบบคิดจาก SO) · ไม่นับ Actual · ผู้อนุมัติ = เจ้าของดีลต้นทาง/ผู้จัดการ (0415)
// ⭐ แบ่งรอบ (มติ 02/11 V10–V12 · หมวด 13): SO ลูกค้าหนึ่งใบออกได้หลายรอบ · แก้ได้แค่จำนวนรายบรรทัด ไม่เกินคงเหลือ
//    (เดิม "1 SO ลูกค้า = 1 ใบ") · ตัวคิดคงเหลือ/จำนวนอยู่ที่ exciseRounds.js
//
// ⚠️ `createQuotationDraft` ผูกดีลทั้งก้อน (ขั้นดีล · ประวัติขั้น · ลูกค้าจากดีล) ⇒ ที่นี่เป็นฟังก์ชันพี่น้อง ใช้ตัวออกเลข
//    `insertQuotationWithNumber` ร่วม แต่ไม่แตะดีลเลย
// ⚠️ เขียนฐาน ⇒ ผู้เรียกส่ง client · ตัวเขียน audit + ตัวสร้างสินค้า 04-003 รับเป็นพารามิเตอร์ (AGENTS.md "เทสต์ห้ามต่อฐานจริง")
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { validateDocumentReadiness } from '@/lib/documentWorkflow';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { businessDate } from '@/lib/businessDate';
import { insertQuotationWithNumber, quoteTotals } from '@/lib/salesPlanning';
import { normalizePaymentPlan, validatePaymentPlan } from '@/lib/sales/paymentPlan';
import { loadDealOwnerContact } from '@/lib/sales/dealOwner';
import { ORIGIN_EXCISE, exciseRowsOnly, isExciseOrder, isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { lineMoneyRuleMessage, withPackColumn } from '@/lib/sales/linePacks';
import { resolveSalesOrderFiling } from '@/lib/excise/soFilingItems';
import { buildExciseQuotationLines } from '@/lib/excise/exciseCharge';
import { ensureExciseChargeProduct, peekExciseChargeProduct } from '@/lib/excise/exciseChargeProduct';
import { resolvePinnedPresetVersionIds } from '@/lib/admin/commercialPresets';
import {
  applyRoundQuantities, exciseRoundRows, parseRoundQuantities, resolveRoundQuantities, roundLinesLinked, roundQuantitiesOf,
  roundRemainingSummary, roundsRemainingUnits,
} from '@/lib/excise/exciseRounds';

export class ExciseQuotationError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** สถานะใบค่าสรรพสามิตที่ "ยังมีผล" — นับเป็นยอดที่ออกแล้วของ SO (แบ่งรอบ) + ล็อก SO ลูกค้า (Q16) · ยกเลิก/ออก Rev. ทับ/ปิด = ไม่มีผลแล้ว (คืนยอด) */
export const LIVE_EXCISE_QUOTATION_STATUSES = Object.freeze(['draft', 'sent', 'rejected', 'accepted']);
export const isLiveExciseQuotation = (quote) => isExciseOrder(quote) && LIVE_EXCISE_QUOTATION_STATUSES.includes(quote?.status);

/** คำอ้างอิงบนกระดาษ (ช่อง "เอกสารอ้างอิง" ของ FM-SA-01) — ลูกค้าเห็นว่าค่าภาษีนี้ของใบไหน
 *  มติเจ้าของ 29/10 (กระดาษใบทดลอง): เลข SO / QT ต้นทางเท่านั้น — คำว่า "ค่าภาษีสรรพสามิต" ย้ายไปช่อง "โครงการ" (excisePaperReference)
 *  ⭐ แบ่งรอบ (D16): รอบที่ 2 ขึ้นไปต่อท้าย "· รอบที่ n" — ลูกค้าแยกใบของ SO เดียวกันออก · รอบแรกคงรูปเดิม (ยังไม่รู้ว่าจะมีรอบสอง) */
export function exciseQuotationReference(order, sourceQuote, roundNo = 1) {
  const base = [order?.orderNumber, sourceQuote?.quoteNumber].filter(Boolean).join(' / ');
  return roundNo >= 2 && base ? `${base} · รอบที่ ${roundNo}` : base;
}

/* รอบที่เท่าไรของใบนี้ — รอบที่ยังมีผลซึ่งออกก่อนใบนี้ + 1 (`others` ไม่รวมใบนี้ · ใบใหม่ = ทุกรอบที่มีอยู่ + 1) */
const roundNumberOf = (others = [], quote = null) => (quote?.createdAt
  ? others.filter((row) => String(row.createdAt || '') < String(quote.createdAt)).length
  : others.length) + 1;

/** คำอ้างอิงนี้ระบบเขียนเอง (ว่าง หรือรูปเดิมก่อน 29/10 "ค่าภาษีสรรพสามิตของ …") — "คิดใหม่จากใบสั่งขาย" เขียนทับได้ · คนพิมพ์เอง = ไม่แตะ */
export const exciseReferenceIsAuto = (note) => {
  const text = String(note || '').trim();
  return !text || text.startsWith('ค่าภาษีสรรพสามิตของ');
};

/**
 * ออกใบค่าสรรพสามิต (รอบใหม่) จาก SO นี้ได้ไหม — ตัวตัดสินเดียวของปุ่มบนจอ (ปุ่มกดไม่ได้ = โชว์แล้วบอกเหตุ) กับ route
 * @param order  SO ลูกค้า (แถว sales_orders)
 * @param rounds `{ liveCount, hasRemaining }` ของ SO นี้ (ไม่ส่ง = ตรวจแค่สภาพ SO — ทางคิดใหม่/ออก Rev. ของใบที่มีอยู่)
 * @returns ข้อความไทย หรือ null = ออกได้
 */
export function exciseQuotationBlocker(order, { rounds = null } = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (isExciseOrder(order)) return 'ใบนี้เป็นใบสั่งขายค่าสรรพสามิตอยู่แล้ว';
  if (isHistoricalOrder(order)) return 'ใบสั่งขายย้อนหลังไม่ออกใบเสนอราคาค่าสรรพสามิตในระบบ';
  if (order.status !== 'approved' || order.supersededById) return 'ออกใบเสนอราคาค่าสรรพสามิตได้เฉพาะใบสั่งขายที่อนุมัติแล้วและยังไม่ถูกออก Rev. ทับ';
  if (order.exciseNotBilledKind) return 'ใบสั่งขายนี้ถูกตัดสินว่า "ไม่เรียกเก็บค่าสรรพสามิตในระบบ" แล้ว — ถอนการตัดสินก่อนจึงออกใบได้';
  if (rounds?.liveCount > 0) {
    // V11: ปิดยอดค้างแล้ว = ไม่ออกรอบใหม่ (ใบที่ออกไปแล้วเดินต่อได้)
    if (order.exciseRemainderClosedAt) return 'ใบสั่งขายนี้ปิดยอดค้างค่าสรรพสามิตแล้ว — เปิดยอดค้างก่อนจึงออกรอบใหม่ได้';
    if (rounds.hasRemaining === false) return 'ใบสั่งขายนี้ออกใบค่าสรรพสามิตครบทุกรายการแล้ว — ไม่มียอดค้างให้ออกรอบใหม่';
  }
  return null;
}

/** ใบค่าสรรพสามิตที่ยังมีผลของ SO ลูกค้าหนึ่งใบ **ใบใหม่สุด** — `{ data, error }` · ไม่ throw
 *  (ล็อก SO ลูกค้า Q16 · ด่านไม่เรียกเก็บ — ต้องการแค่ "มีสักใบไหม" · รายรอบใช้ loadLiveExciseQuotations) */
export async function loadLiveExciseQuotation(supabase, salesOrderId) {
  if (!salesOrderId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('quotations')
    .select('id, "quoteNumber", status, origin, "sourceSalesOrderId", "approvalStatus"')
    .eq('sourceSalesOrderId', salesOrderId)
    .in('status', LIVE_EXCISE_QUOTATION_STATUSES)
    .order('createdAt', { ascending: false })
    .limit(1);
  if (error) return { data: null, error };
  return { data: (data || []).find(isLiveExciseQuotation) || null, error: null };
}

/**
 * ใบค่าสรรพสามิตที่ยังมีผลทุกรอบของ SO ลูกค้า (เก่าสุดก่อน = รอบที่ 1 ก่อน) พร้อมบรรทัด — `{ data, error }` · ไม่ throw
 * @param exceptId ใบที่ไม่นับ (ใบที่กำลังแก้/คิดใหม่/ออก Rev.)
 */
export async function loadLiveExciseQuotations(supabase, salesOrderId, { exceptId = null } = {}) {
  if (!salesOrderId) return { data: [], error: null };
  // ไล่หน้าให้ครบ (check:rowcap) — SO ใบเดียวมีไม่กี่รอบ แต่ตัวนับคงเหลือห้ามพลาดรอบไหน
  const { data, error } = await fetchAllResult(() => supabase
    .from('quotations')
    .select('id, "quoteNumber", status, origin, "sourceSalesOrderId", "approvalStatus", "createdAt", lines:quotation_lines(id, qty, "packQty", "fgCode", metadata)')
    .eq('sourceSalesOrderId', salesOrderId)
    .in('status', LIVE_EXCISE_QUOTATION_STATUSES)
    .order('createdAt', { ascending: true })
    .order('id', { ascending: true }));
  if (error) return { data: [], error };
  return { data: (data || []).filter((quote) => isLiveExciseQuotation(quote) && quote.id !== exceptId), error: null };
}

/**
 * บรรทัดของใบค่าสรรพสามิตจาก SO ลูกค้า ณ ตอนนี้ (อัตราสินค้า + ทะเบียนสด) — ตัวเดียวของ "ออกใบ" · "แก้จำนวน" · "คิดใหม่จากใบสั่งขาย" · ออก Rev.
 * ⚠️ บรรทัดที่ไม่มีราคาขายปลีก = ปฏิเสธทั้งชุด (มติ Q3) · ไม่มีบรรทัดสรรพสามิตเลย = ปฏิเสธ
 * ⭐ แบ่งรอบ (หมวด 13): จำนวนของรอบนี้ = ที่จอขอ (`quantities`) → จำนวนเดิมของใบ (`fallbackQuantities`) → คงเหลือทั้งหมด (ใบใหม่)
 *    ไม่เกินคงเหลือ (ไม่นับใบ `exceptQuoteId`) · จำนวน 0 = ตัดบรรทัดนั้นออกจากรอบนี้
 * @returns `{ lines, rows, templateLines, liveRounds, filing, customer, sourceQuote, chargeProductCreated }` · ผิดกติกา = throw ExciseQuotationError
 */
export async function buildExciseLinesFromOrder({
  supabase, user, order, request = null, ensureProduct = ensureExciseChargeProduct,
  quantities = null, fallbackQuantities = null, exceptQuoteId = null,
}) {
  const { data: withLines, error: lineError } = await supabase
    .from('sales_orders').select('*, lines:sales_order_lines(*)').eq('id', order.id).maybeSingle();
  if (lineError) throw new ExciseQuotationError(lineError.message, 500);
  const filing = await resolveSalesOrderFiling(supabase, withLines || { ...order, lines: [] });
  if (!filing.lines.length) {
    throw new ExciseQuotationError('ใบสั่งขายนี้ไม่มีรายการสินค้าที่ต้องเสียภาษีสรรพสามิต — ไม่มีอะไรให้ออกใบ');
  }
  /* มติ Q3 (28/10): ราคาขายปลีก (ฐานภาษี) **บังคับตอนออกใบ** — ภาษี ฿0 บนใบที่ลูกค้าจ่าย = เก็บขาดถาวร
     ทะเบียนยังไม่ครบ = เตือน ไม่บล็อก (บังคับตอนยื่นกรม — RA) */
  const unpriced = filing.lines.filter((line) => line.taxBaseMissing);
  if (unpriced.length) {
    throw new ExciseQuotationError(
      `สินค้าต่อไปนี้ยังไม่มีราคาขายปลีก (ฐานภาษี) — ใส่ราคาขายปลีกที่ทะเบียนสินค้าก่อนออกใบ: ${unpriced.map((l) => l.fgCode).join(', ')}`,
      400, { productIds: unpriced.map((l) => l.productId) },
    );
  }

  const [{ data: sourceQuote, error: quoteError }, { data: customer, error: customerError }] = await Promise.all([
    supabase.from('quotations').select('*').eq('id', order.quotationId).maybeSingle(),
    supabase.from('customers').select('*').eq('id', order.customerId).maybeSingle(),
  ]);
  if (quoteError || customerError) throw new ExciseQuotationError((quoteError || customerError).message, 500);
  if (!customer) throw new ExciseQuotationError('ไม่พบลูกค้าของใบสั่งขาย', 400);

  const charge = await ensureProduct(supabase, {
    customer, sourceFgCodes: filing.lines.map((l) => l.fgCode), user, request,
  });
  if (charge.error) throw new ExciseQuotationError(charge.error, charge.status || 500);

  const templateLines = buildExciseQuotationLines({
    filing, chargeProduct: charge.product, sourceLines: withLines?.lines || [], products: filing.products || [],
  });
  const { data: liveRounds, error: roundsError } = await loadLiveExciseQuotations(supabase, order.id, { exceptId: exceptQuoteId });
  if (roundsError) throw new ExciseQuotationError(roundsError.message, 500);
  const rows = exciseRoundRows({ templateLines, otherQuotes: liveRounds });
  const resolved = resolveRoundQuantities({ rows, requested: quantities, fallback: fallbackQuantities });
  if (resolved.error) {
    // ออกครบทุกรายการแล้ว = 409 พร้อมรอบล่าสุด (หน้าออกใบโชว์ลิงก์ "เปิดใบที่มีอยู่") · จำนวนผิด = 400
    const full = liveRounds.length > 0 && !roundRemainingSummary(rows).hasRemaining;
    throw new ExciseQuotationError(resolved.error, full ? 409 : 400, full ? { quotationId: liveRounds.at(-1).id } : {});
  }
  const lines = applyRoundQuantities(templateLines, resolved.quantities);
  return {
    lines, rows, templateLines, liveRounds, filing, customer, sourceQuote,
    chargeProductCreated: Boolean(charge.created), chargePending: Boolean(charge.pending),
  };
}

/** จำนวนเดิมของใบ (คิดใหม่/ออก Rev.) — ใบที่ผูกบรรทัด SO ครบ = จำนวนรายบรรทัด · ใบก่อนลิงก์ = null (ใช้คงเหลือทั้งหมด) */
export const exciseQuotationQuantities = (quote) => (roundLinesLinked(quote?.lines) ? roundQuantitiesOf(quote.lines) : null);

/* ช่องบันทึกการยื่นที่ฝ่ายขายเห็นบนหน้า SO (ร่องรอยของ RA · v3) */
const ROUND_FILING_FIELDS = 'id, status, "exciseSalesOrderId", "filingStartedAt", "filingStartedByName", "exciseReceiptNumber", "taxPaidDate", "filedAt"';

/**
 * รอบค่าสรรพสามิตของ SO ลูกค้า (เส้นเดินงาน + แผงรอบบนหน้า SO) — รอบที่ยังมีผล (เก่าสุดก่อน = รอบที่ 1) พร้อม
 * SO ค่าสรรพสามิตที่ยังมีผลของรอบ + บันทึกการยื่นของ RA รายรอบ + คงเหลือรายบรรทัด SO
 * ⚠️ คงเหลือคิดจากใบยื่นของ SO ณ ตอนนี้ (resolveSalesOrderFiling) **เมื่อมีรอบแล้วเท่านั้น** — ยังไม่มีรอบ = คงเหลือเต็มทุกบรรทัด ไม่ต้องคิด
 * @param exceptQuoteId ใบที่ไม่นับในคงเหลือ (หน้าใบที่กำลังแก้จำนวน) — ยังอยู่ในรายการรอบ (เลขรอบไม่เลื่อน)
 * @returns `{ rounds, rows, summary }` (summary = null เมื่อยังไม่มีรอบ) · อ่านพลาด = throw ExciseQuotationError
 */
export async function loadExciseRoundState(supabase, order, { exceptQuoteId = null } = {}) {
  const { data: liveRounds, error } = await loadLiveExciseQuotations(supabase, order?.id);
  if (error) throw new ExciseQuotationError(error.message, 500);
  if (!liveRounds.length) return { rounds: [], rows: [], summary: null };

  const acceptedIds = liveRounds.filter((quote) => quote.status === 'accepted').map((quote) => quote.id);
  const { data: exciseOrders, error: orderError } = acceptedIds.length
    ? await fetchAllResult(() => exciseRowsOnly(supabase.from('sales_orders').select('id, "orderNumber", status, "quotationId"'))
      .in('quotationId', acceptedIds)
      .neq('status', 'cancelled')
      .is('supersededById', null)
      .order('id', { ascending: true }))
    : { data: [], error: null };
  if (orderError) throw new ExciseQuotationError(orderError.message, 500);
  const exciseOrderIds = (exciseOrders || []).map((row) => row.id);
  const { data: filings, error: filingError } = exciseOrderIds.length
    ? await supabase.from('orders').select(ROUND_FILING_FIELDS).in('exciseSalesOrderId', exciseOrderIds).order('id', { ascending: true })
    : { data: [], error: null };
  if (filingError) throw new ExciseQuotationError(filingError.message, 500);
  const exciseOrderByQuote = new Map((exciseOrders || []).map((row) => [row.quotationId, row]));
  const filingByOrder = new Map((filings || []).map((row) => [row.exciseSalesOrderId, row]));

  const { data: withLines, error: lineError } = await supabase
    .from('sales_orders').select('*, lines:sales_order_lines(*)').eq('id', order.id).maybeSingle();
  if (lineError) throw new ExciseQuotationError(lineError.message, 500);
  const resolved = await resolveSalesOrderFiling(supabase, withLines || { ...order, lines: [] });
  const unitByLine = new Map((withLines?.lines || []).map((line) => [line.id, line.unit || '']));
  // บรรทัดเต็มจำนวนรูปเดียวกับ buildExciseQuotationLines (ช่องที่ exciseRoundRows อ่าน) — ไม่ต้องหาสินค้า 04-003
  const templateLines = resolved.lines.map((line) => ({
    qty: Number(line.quantity) || 0,
    unitPrice: Number(line.taxPerUnit) || 0,
    unit: unitByLine.get(line.salesOrderLineId) || '',
    description: line.description || line.fgCode,
    metadata: { sourceSalesOrderLineId: line.salesOrderLineId || null, sourceFgCode: line.fgCode || null, descriptionTh: line.description || null },
  }));
  const rows = exciseRoundRows({ templateLines, otherQuotes: liveRounds.filter((quote) => quote.id !== exceptQuoteId) });

  const rounds = liveRounds.map((quote, index) => {
    const exciseOrder = exciseOrderByQuote.get(quote.id) || null;
    return {
      round: index + 1,
      quote: { id: quote.id, quoteNumber: quote.quoteNumber || null, status: quote.status, approvalStatus: quote.approvalStatus || null },
      units: [...roundQuantitiesOf(quote.lines).values()].reduce((sum, qty) => sum + qty, 0),
      exciseOrder: exciseOrder ? { id: exciseOrder.id, orderNumber: exciseOrder.orderNumber || null, status: exciseOrder.status } : null,
      filing: exciseOrder ? filingByOrder.get(exciseOrder.id) || null : null,
    };
  });
  return { rounds, rows, summary: roundRemainingSummary(rows) };
}

/**
 * แบ่งรอบของใบค่าสรรพสามิตหนึ่งใบ (หน้าใบ GET) — แถวคงเหลือ **ไม่นับใบนี้** (ช่องจำนวนแก้ได้ถึงเท่านี้) + รอบที่เท่าไร
 * ⚠️ ไม่ทำหน้าใบล้ม — อ่านไม่ขึ้น = `{ error }` (จอโชว์รายการเดิมแบบอ่านอย่างเดียว · server ตรวจซ้ำตอนบันทึก)
 * @returns null (ไม่ใช่ใบค่าสรรพสามิต) · `{ rows, round, roundCount, remainingLines, remainingUnits, hasRemaining }` · `{ error }`
 */
export async function loadExciseQuoteRound(supabase, quote) {
  if (!isExciseOrder(quote) || !quote?.sourceSalesOrderId) return null;
  try {
    const { data: order, error } = await supabase.from('sales_orders').select('*').eq('id', quote.sourceSalesOrderId).maybeSingle();
    if (error) throw error;
    if (!order) return { error: 'ไม่พบใบสั่งขายต้นทาง' };
    const state = await loadExciseRoundState(supabase, order, { exceptQuoteId: quote.id });
    const index = state.rounds.findIndex((round) => round.quote.id === quote.id);
    return {
      rows: state.rows,
      round: index >= 0 ? index + 1 : null,
      roundCount: state.rounds.length,
      ...roundRemainingSummary(state.rows),
    };
  } catch (error) {
    return { error: error?.message || 'อ่านยอดคงเหลือของใบสั่งขายไม่สำเร็จ' };
  }
}

/** วัน `YYYY-MM-DD` ที่ใช้ได้ หรือ null */
const isoDay = (value) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : null;
};
const textOrNull = (value, max = 2000) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

/**
 * หัวใบที่ผู้ใช้แก้บนหน้าออกใบใหม่ก่อนบันทึก (มติเจ้าของ 29/10 "แก้ก่อนบันทึก แบบ new ใบเสนอราคา")
 * ช่องเดียวกับที่ใบร่างแก้ได้: วันที่ · ยืนราคาถึง · งวดชำระ · เงื่อนไขชำระ · หมายเหตุ · เอกสารอ้างอิง · ภาษาเอกสาร
 * + ชุดเงื่อนไขการค้าที่หยิบมาเป็นค่าตั้งต้น (`metadata.paymentPresetVersionId/remarksPresetVersionId` — ตรวจว่ามีจริงตอนบันทึก)
 * ⚠️ บรรทัด/VAT/ส่วนลดไม่อยู่ในนี้ — มาจาก SO ต้นทางเท่านั้น · ค่าที่ไม่ส่ง/ผิดรูป = ค่าตั้งต้นของใบ
 * ⭐ แบ่งรอบ: `exciseQuantities` `{ [บรรทัด SO]: จำนวน }` → `value.quantities` (Map) · ตรวจกับคงเหลือตอนสร้างบรรทัด
 * @returns `{ value }` หรือ `{ error }` (ข้อความไทย)
 */
export function exciseQuotationOverrides(body = {}) {
  const value = {};
  const quantities = parseRoundQuantities(body.exciseQuantities);
  if (quantities.error) return { error: quantities.error };
  if (quantities.value) value.quantities = quantities.value;
  if (body.quoteDate !== undefined) {
    const day = isoDay(body.quoteDate);
    if (!day) return { error: 'วันที่ใบเสนอราคาไม่ถูกต้อง' };
    value.quoteDate = day;
  }
  if (body.validUntil !== undefined) {
    const day = body.validUntil === null || body.validUntil === '' ? null : isoDay(body.validUntil);
    if (body.validUntil && !day) return { error: 'วันยืนราคาไม่ถูกต้อง' };
    value.validUntil = day;
  }
  if (value.validUntil && value.validUntil < (value.quoteDate || businessDate())) return { error: 'วันยืนราคาต้องไม่ก่อนวันที่ใบเสนอราคา' };
  if (body.paymentPlan !== undefined) {
    const plan = body.paymentPlan && typeof body.paymentPlan === 'object' ? body.paymentPlan : { type: 'full' };
    const check = validatePaymentPlan(plan);
    if (!check.ok) return { error: check.error };
    value.paymentPlan = plan;
  }
  if (body.paymentTerms !== undefined) value.paymentTerms = textOrNull(body.paymentTerms);
  if (body.notes !== undefined) value.notes = textOrNull(body.notes);
  if (body.referenceNote !== undefined) value.referenceNote = textOrNull(body.referenceNote, 500);
  if (body.docLanguage !== undefined) {
    if (!['th', 'en'].includes(body.docLanguage)) return { error: 'ภาษาเอกสารต้องเป็น th หรือ en' };
    value.docLanguage = body.docLanguage;
  }
  if (body.metadata && typeof body.metadata === 'object') {
    value.presets = {
      paymentPresetVersionId: textOrNull(body.metadata.paymentPresetVersionId, 200),
      remarksPresetVersionId: textOrNull(body.metadata.remarksPresetVersionId, 200),
    };
  }
  return { value };
}

/** แถวหัวใบของใบค่าสรรพสามิต (ไม่รวม id/เลขที่) — ตัวเดียวของพรีวิวและทางบันทึก ⇒ สิ่งที่เห็นบนหน้าออกใบ = สิ่งที่ลงฐาน */
function exciseQuotationRow({ order, customer, sourceQuote, ownerContact, user, lines, rows = [], roundNo = 1, overrides = {}, pinnedPresets = null }) {
  const vatRate = 7;
  const totals = quoteTotals(lines, { vatRate });
  const source = sourceQuote || {};
  return {
    origin: ORIGIN_EXCISE,
    dealId: null,
    sourceSalesOrderId: order.id,
    revisionNo: 0,
    status: 'draft',
    quoteDate: overrides.quoteDate || businessDate(),
    validUntil: overrides.validUntil ?? null,
    /* หัวใบลอกจากใบเสนอราคาต้นทางของ SO (กระดาษแบบเดียวกับที่ลูกค้าเคยได้) — ลูกค้า/ที่อยู่/ผู้ติดต่อ/ภาษาเอกสาร */
    customerId: order.customerId || source.customerId || null,
    customerName: source.customerName || order.customerName || null,
    customerNameEn: source.customerNameEn || null,
    customerTaxId: source.customerTaxId || customer.taxId || null,
    billingAddress: source.billingAddress || null,
    billingAddressEn: source.billingAddressEn || null,
    shippingAddress: source.shippingAddress || null,
    shippingAddressEn: source.shippingAddressEn || null,
    billingAddressId: source.billingAddressId || null,
    shippingAddressId: source.shippingAddressId || null,
    branchCode: source.branchCode || null,
    contactName: source.contactName || null,
    contactPhone: source.contactPhone || null,
    contactEmail: source.contactEmail || null,
    ...totals,
    discountType: null,
    discountValue: 0,
    vatRate,
    paymentPlan: normalizePaymentPlan(overrides.paymentPlan || { type: 'full' }, totals.totalAmount),
    paymentTerms: overrides.paymentTerms ?? null,
    docLanguage: overrides.docLanguage || (source.docLanguage === 'en' ? 'en' : 'th'),
    approvalStatus: 'not_submitted',
    notes: overrides.notes ?? null,
    referenceNote: overrides.referenceNote !== undefined ? overrides.referenceNote : exciseQuotationReference(order, sourceQuote, roundNo),
    metadata: {
      exciseSource: {
        salesOrderId: order.id,
        orderNumber: order.orderNumber || null,
        quotationId: order.quotationId || null,
        quoteNumber: sourceQuote?.quoteNumber || null,
        /* ⭐ แบ่งรอบ: หน่วยที่ยื่นภาษีของบรรทัด SO ณ ตอนออกใบ — คิว "รอออกใบค่าสรรพสามิต" ของ SA (exciseHandledOrderIds)
           รู้ว่ายังค้างไหมโดยไม่ต้องคิดใบยื่นทั้ง SO ใหม่ · SO ล็อกระหว่างมีใบที่ยังมีผล (Q16) ⇒ ค่านี้ไม่เปลี่ยนใต้ใบ */
        orderedByLine: Object.fromEntries(rows.filter((row) => row.sourceSalesOrderLineId).map((row) => [row.sourceSalesOrderLineId, row.ordered])),
      },
      // ผู้เสนอราคาบนกระดาษ = เจ้าของดีลต้นทาง (คนเดียวกับผู้อนุมัติ · ตรึงชื่อ + เบอร์แบบใบปกติ — ใบไม่มีดีลให้อ่านสด)
      salesOwner: order.deal?.ownerName || null,
      salesOwnerId: ownerContact?.id || null,
      salesOwnerPhone: ownerContact?.phone || null,
      ...(pinnedPresets ? { paymentPresetVersionId: pinnedPresets.payment || null, remarksPresetVersionId: pinnedPresets.remarks || null } : {}),
    },
    createdBy: user?.id || null,
    createdByName: user?.name || null,
    createdByPhone: user?.phone || null,
  };
}

/* ด่านสภาพ SO + ปิดยอดค้าง (ก่อนคิดบรรทัด) · คงเหลือหมด = resolveRoundQuantities ปฏิเสธตอนคิดบรรทัด */
function assertCanIssue(order, built = null) {
  const liveCount = built?.liveRounds?.length || 0;
  const blocker = exciseQuotationBlocker(order, {
    rounds: built ? { liveCount, hasRemaining: roundRemainingSummary(built.rows).hasRemaining } : null,
  });
  if (blocker) throw new ExciseQuotationError(blocker, liveCount ? 409 : 400);
}

/**
 * พรีวิวใบเสนอราคาค่าสรรพสามิตของ SO ลูกค้า (หน้าออกใบใหม่ · ยังไม่บันทึก · ไม่ออกเลข · ไม่สร้างสินค้า 04-003)
 * @returns `{ quote, round, warnings, chargeProductPending, sourceOrder, sourceQuote, sourceDeal }`
 */
export async function previewExciseQuotationDraft({ supabase, user, order, ensureProduct = peekExciseChargeProduct } = {}) {
  assertCanIssue(order);
  const built = await buildExciseLinesFromOrder({ supabase, user, order, ensureProduct });
  assertCanIssue(order, built);
  const ownerContact = await loadDealOwnerContact(supabase, order.deal?.ownerId);
  const row = exciseQuotationRow({
    order, customer: built.customer, sourceQuote: built.sourceQuote, ownerContact, user, lines: built.lines, rows: built.rows,
    roundNo: roundNumberOf(built.liveRounds),
  });
  return {
    quote: { ...row, lines: built.lines },
    // ⭐ แบ่งรอบ: จอแก้จำนวนรายบรรทัดแล้วคิดยอดเอง (applyRoundQuantities) จากบรรทัดเต็มจำนวน — บันทึกแล้ว server คิดซ้ำ
    round: roundPayload(built),
    warnings: (built.filing.warnings || []).filter((w) => w.code === 'registration_missing'),
    chargeProductPending: Boolean(built.chargePending),
    sourceOrder: { id: order.id, orderNumber: order.orderNumber || null },
    sourceQuote: built.sourceQuote ? { id: built.sourceQuote.id, quoteNumber: built.sourceQuote.quoteNumber || null } : null,
    sourceDeal: order.deal ? { id: order.deal.id, title: order.deal.title || null, ownerName: order.deal.ownerName || null } : null,
  };
}

/**
 * สร้างใบเสนอราคาค่าสรรพสามิต (ร่าง · ยังไม่ยื่น) จาก SO ลูกค้า
 * ⚠️ ผู้เรียกตรวจ cap + ขอบเขตกับ SO ลูกค้ามาแล้ว (loadScoped 'edit') และส่ง `order` ที่มี `deal` มา
 * @param overrides หัวใบจากหน้าออกใบใหม่ (exciseQuotationOverrides) — ไม่ส่ง = ค่าตั้งต้น
 * @returns `{ quote, lines, warnings, chargeProductCreated }` · ผิดกติกา = throw ExciseQuotationError
 */
export async function createExciseQuotationDraft({
  supabase, user, order, request = null, overrides = {},
  audit = recordAudit, ensureProduct = ensureExciseChargeProduct, resolvePresets = resolvePinnedPresetVersionIds,
} = {}) {
  assertCanIssue(order);
  const pinnedPresets = overrides.presets ? await resolvePresets(supabase, overrides.presets) : null;

  const built = await buildExciseLinesFromOrder({ supabase, user, order, request, ensureProduct, quantities: overrides.quantities || null });
  assertCanIssue(order, built);
  const { lines: builtLines, filing, customer, sourceQuote } = built;
  const ownerContact = await loadDealOwnerContact(supabase, order.deal?.ownerId);
  const quoteId = genId('QT');
  const { data: quote, error } = await insertQuotationWithNumber(supabase, {
    id: quoteId,
    ...exciseQuotationRow({
      order, customer, sourceQuote, ownerContact, user, lines: builtLines, rows: built.rows,
      roundNo: roundNumberOf(built.liveRounds), overrides, pinnedPresets,
    }),
  });
  if (error) throw new ExciseQuotationError(error.code === '23505' ? `เลขใบเสนอราคาซ้ำ (${quoteId})` : error.message, error.code === '23505' ? 409 : 500);

  // withPackColumn: ทุกแถวรูปเดียวกัน — บรรทัดค่าภาษีไม่มีเลขแพ็ค ⇒ ไม่เอ่ยชื่อคอลัมน์ (ยาม linePackWritePaths)
  const rows = withPackColumn(builtLines.map((line) => ({ ...line, id: genId('QTL'), quotationId: quote.id })));
  const { data: lineRows, error: insertError } = await supabase.from('quotation_lines').insert(rows).select();
  if (insertError) {
    const { error: rollbackError } = await supabase.from('quotations').delete().eq('id', quote.id);
    if (rollbackError) console.error('[excise quotation] ลบหัวใบที่บรรทัดเขียนไม่ลงไม่สำเร็จ', quote.id, rollbackError.message);
    throw new ExciseQuotationError(lineMoneyRuleMessage(insertError) || insertError.message, 500);
  }

  await audit({
    user, action: 'create', entityType: 'quotation', entityId: quote.id,
    after: { ...quote, lines: lineRows || [] },
    summary: `ออกใบเสนอราคาค่าสรรพสามิต ${quote.quoteNumber} จาก ${order.orderNumber}`,
    request,
  });
  return {
    quote, lines: lineRows || [], chargeProductCreated: built.chargeProductCreated,
    warnings: (filing.warnings || []).filter((w) => w.code === 'registration_missing'),
  };
}

/* รหัส RAISE ของ accept_excise_quotation_atomic (0415) → ข้อความไทย + สถานะ HTTP */
const ACCEPT_ERRORS = [
  ['excise_quotation_origin_invalid', 'ใบนี้ไม่ใช่ใบเสนอราคาค่าสรรพสามิต', 400],
  ['quotation_not_acceptable', 'ใบนี้รับไม่ได้ในสถานะปัจจุบัน — โหลดหน้าใหม่แล้วลองอีกครั้ง', 409],
  ['quotation_lines_required', 'ใบไม่มีรายการ', 400],
  ['quotation_approval_required', 'ใบค่าสรรพสามิตต้องอนุมัติก่อนจึงปิด Won ได้', 400],
  ['quotation_approval_stale', 'เนื้อหาใบเปลี่ยนหลังอนุมัติ — ต้องยื่นอนุมัติใหม่', 409],
  ['excise_source_order_invalid', 'ใบสั่งขายต้นทางไม่อยู่ในสถานะอนุมัติแล้ว (ยกเลิก/ย้อนอนุมัติ/ออก Rev. ทับ) — รับใบค่าภาษีของใบนั้นไม่ได้', 409],
  ['excise_source_not_billed', 'ใบสั่งขายต้นทางถูกตัดสินว่าไม่เรียกเก็บค่าสรรพสามิตในระบบแล้ว', 409],
  // ⭐ 0418 แบ่งรอบ: ผลรวมจำนวนของรอบที่ Won แล้ว + ใบนี้ เกินหน่วยบนบรรทัด SO
  ['excise_quantity_exceeds_remaining', 'จำนวนของใบนี้รวมกับรอบที่ Won แล้วเกินยอดบนใบสั่งขายต้นทาง — ดึงกลับแล้วลดจำนวนให้ไม่เกินคงเหลือ', 409],
  // ใบก่อนลิงก์บรรทัด SO (ไม่ควรมี) — ฐานถอยไปกติกาเดิม
  ['excise_source_already_accepted', 'ใบสั่งขายต้นทางมีใบเสนอราคาค่าสรรพสามิตที่ Won แล้ว และใบนี้นับจำนวนรายบรรทัดไม่ได้ — กด “คิดใหม่จากใบสั่งขาย” ก่อน', 409],
];

/**
 * ลูกค้ารับใบค่าสรรพสามิต — RPC 0415 ไม่แตะดีล/FC/Won/ใบพี่น้อง · ด่านความพร้อมของใบ (อนุมัติ + fingerprint) ชุดเดียวกับใบปกติ
 * ⚠️ ผู้เรียกตรวจ cap + ขอบเขต (inSalesDocScope 'edit') มาแล้ว · `quote` ต้องพก `lines`
 * @returns `{ data }` หรือ `{ error, status }`
 */
export async function acceptExciseQuotation({ supabase, user, quote, request = null, audit = recordAudit }) {
  const currentFingerprint = quotationApprovalFingerprint(quote);
  const readiness = validateDocumentReadiness({
    action: 'accept',
    status: quote.status,
    lineCount: quote.lines?.length || 0,
    approvalStatus: quote.approvalStatus,
    approvalFingerprint: quote.approvalFingerprint,
    currentFingerprint,
  });
  if (!readiness.ok || quote.approvalStatus !== 'approved') {
    return {
      status: 400,
      error: quote.approvalStatus === 'approved' ? readiness.error : 'ใบค่าสรรพสามิตต้องยื่นและอนุมัติก่อนจึงปิด Won ได้',
    };
  }
  const { data: result, error } = await supabase.rpc('accept_excise_quotation_atomic', {
    p_quote_id: quote.id,
    p_current_fingerprint: currentFingerprint,
    p_actor_id: user?.id || null,
    p_actor_name: user?.name || null,
  });
  if (error) {
    const hit = ACCEPT_ERRORS.find(([code]) => String(error.message || '').includes(code));
    if (hit) return { status: hit[2], error: hit[1] };
    if (error.code === '23505') return { status: 409, error: 'ใบนี้ถูกรับไปแล้ว — โหลดหน้าใหม่' };
    return { status: 500, error: error.message };
  }
  const accepted = { ...(result?.quotation || {}), lines: quote.lines || [] };
  await appendDocumentEvent(supabase, { docType: 'quotation', doc: quote, action: 'accept', user });
  await audit({
    user, action: 'update', entityType: 'quotation', entityId: quote.id, before: quote, after: accepted,
    summary: `ปิด Won ใบเสนอราคาค่าสรรพสามิต ${quote.quoteNumber} (ไม่แตะดีล/FC)`,
    request,
  });
  return { data: { quotation: accepted } };
}

/** ข้อความเมื่อจอส่งบรรทัด/ส่วนลด/VAT มากับใบค่าสรรพสามิต (บรรทัดคือภาษีที่ระบบคิด · VAT 7% ตรึง) */
export const EXCISE_LINES_LOCKED_MESSAGE = 'รายการของใบค่าสรรพสามิตคิดจากใบสั่งขายต้นทาง แก้ได้แค่จำนวนของรอบนี้ (ราคา ส่วนลด และ VAT แก้ไม่ได้) — กด “คิดใหม่จากใบสั่งขาย” ถ้าสินค้า/ราคาขายปลีกเปลี่ยน';

/**
 * บรรทัดใหม่ของใบค่าสรรพสามิตที่ยังแก้ได้ — คิดจาก SO ต้นทาง ณ ตอนนี้ (route PATCH เอาไปบันทึกทางเดียวกับการแก้บรรทัดปกติ)
 * ⚠️ SO ต้นทางต้องยังอนุมัติ/ไม่ถูกแทน/ไม่ถูกตัดสินไม่เรียกเก็บ — ด่านเดียวกับตอนออกใบ (ไม่นับใบตัวเองเป็นยอดที่ออกแล้ว)
 * ⭐ แบ่งรอบ: คงจำนวนเดิมของใบ (`quote.lines`) เว้นแต่จอขอจำนวนใหม่ (`quantities`) · เกินคงเหลือ = ปฏิเสธ ไม่ตัดเงียบ
 * @returns `{ lines, header }` · ผิดกติกา = throw ExciseQuotationError
 */
export async function recalcExciseQuotationLines({
  supabase, user, quote, request = null, ensureProduct = ensureExciseChargeProduct, quantities = null,
}) {
  const { data: order, error } = await supabase
    .from('sales_orders').select('*').eq('id', quote?.sourceSalesOrderId).maybeSingle();
  if (error) throw new ExciseQuotationError(error.message, 500);
  const blocker = exciseQuotationBlocker(order);
  if (blocker) throw new ExciseQuotationError(blocker, 409);
  const { lines, rows, sourceQuote, liveRounds } = await buildExciseLinesFromOrder({
    supabase, user, order, request, ensureProduct,
    quantities, fallbackQuantities: exciseQuotationQuantities(quote), exceptQuoteId: quote?.id || null,
  });
  /* หัวใบที่มาจาก SO ต้นทางคิดใหม่ไปพร้อมบรรทัด (มติ 29/10 กระดาษใบทดลอง): ผู้เสนอราคา + เบอร์ = เจ้าของดีลต้นทาง ณ ตอนนี้ ·
     คำอ้างอิง = SO / QT ต้นทาง (route เขียนทับเฉพาะเมื่อของเดิมเป็นคำที่ระบบเขียนเอง — exciseReferenceIsAuto) */
  const { data: deal, error: dealError } = order.dealId
    ? await supabase.from('sales_deals').select('id, ownerId, ownerName').eq('id', order.dealId).maybeSingle()
    : { data: null, error: null };
  if (dealError) throw new ExciseQuotationError(dealError.message, 500);
  const ownerContact = await loadDealOwnerContact(supabase, deal?.ownerId);
  return {
    lines,
    header: {
      referenceNote: exciseQuotationReference(order, sourceQuote, roundNumberOf(liveRounds, quote)),
      metadata: {
        salesOwner: deal?.ownerName || null,
        salesOwnerId: ownerContact?.id || null,
        salesOwnerPhone: ownerContact?.phone || null,
        // ทางรวม metadata ของ route เขียนทับทั้งก้อนต่อคีย์ ⇒ ส่ง exciseSource ครบชุดพร้อมยอดสั่งรายบรรทัดใหม่
        exciseSource: {
          ...(quote?.metadata?.exciseSource || {}),
          orderedByLine: Object.fromEntries(rows.filter((row) => row.sourceSalesOrderLineId).map((row) => [row.sourceSalesOrderLineId, row.ordered])),
        },
      },
    },
  };
}

/** ข้อมูลแบ่งรอบที่จอใช้ (หน้าออกใบ · หน้าใบ) — แถวคงเหลือ + บรรทัดเต็มจำนวน + รอบอื่นที่ยังมีผล */
export function roundPayload(built) {
  return {
    rows: built.rows,
    templateLines: built.templateLines,
    liveRounds: (built.liveRounds || []).map((quote) => ({ id: quote.id, quoteNumber: quote.quoteNumber || null, status: quote.status })),
    ...roundRemainingSummary(built.rows),
  };
}

const SOURCE_LOCK_VERBS = Object.freeze({ revoke: 'ย้อนการอนุมัติ', revise: 'ออก Rev.', cancel: 'ยกเลิก' });

/**
 * ล็อก SO ลูกค้าที่มีใบค่าสรรพสามิตที่ยังมีผล (Q16 · แผน หมวด 5) — ย้อนอนุมัติ/ออก Rev./ยกเลิก ต้องยกเลิกใบค่าภาษีก่อน
 * ⭐ ยกเลิกใบค่าภาษี (รวมใบที่ลูกค้ารับแล้วแต่ยังไม่มี SO ค่าภาษี) = ปลดล็อก · ลบ SO ลูกค้ากันด้วย FK RESTRICT อีกชั้น
 * @returns `{ status, error }` หรือ null
 */
export async function exciseSourceLock(supabase, order, action) {
  if (!order || isExciseOrder(order) || !SOURCE_LOCK_VERBS[action]) return null;
  const { data: liveQuote, error } = await loadLiveExciseQuotation(supabase, order.id);
  if (error) return { status: 500, error: error.message };
  if (!liveQuote) return null;
  return {
    status: 409,
    error: `${SOURCE_LOCK_VERBS[action]}ใบสั่งขายนี้ไม่ได้ — มีใบเสนอราคาค่าสรรพสามิต ${liveQuote.quoteNumber || liveQuote.id} ที่ยังมีผลอยู่ `
      + '· ยกเลิกใบค่าสรรพสามิตก่อน (ผู้อนุมัติของใบกด “ยกเลิกใบ”)',
  };
}

/**
 * SO ลูกค้าที่ "จัดการค่าสรรพสามิตแล้ว" ในขาฝ่ายขาย — ตัดสินไม่เรียกเก็บ · หรือมีใบค่าสรรพสามิตที่ยังมีผล **และไม่มีงานค้างของฝ่ายขาย**
 * ⇒ ไม่อยู่ในคิว "รอออกใบค่าสรรพสามิต" ของ SA (แดชบอร์ด · แถบเตือนทะเบียน SO · ด่านปิดโครงการ)
 * งานค้างของฝ่ายขาย (= ยังอยู่ในคิว):
 *  · รอบที่ลูกค้ารับแล้วแต่ยังไม่มี SO ค่าสรรพสามิตที่ยังมีผล (PR4 — เดิม PR3 ถือว่าจบตั้งแต่รับ ⇒ ใบหลุดทุกคิว)
 *  · ⭐ แบ่งรอบ: ไม่มีรอบไหนกำลังเดิน (ร่าง/ยื่น/ตีกลับ) แต่ยังมียอดค้างและยังไม่ปิดยอดค้าง (V11) — ต้องออกรอบถัดไป
 *    ยอดค้างคิดจากยอดสั่งที่ตรึงบนใบ (`metadata.exciseSource.orderedByLine`) ไม่คิดใบยื่นทั้ง SO ใหม่ · ใบก่อนแบ่งรอบไม่มีค่านี้ = ถือว่าครบ
 * @param orders แถว SO ที่ select `exciseNotBilledKind` มาแล้ว
 * @returns Set ของ id · อ่านพลาด = throw (คิวงานต้องไม่บอกว่า "ไม่มีงาน" เพราะอ่านไม่ขึ้น)
 */
export async function exciseHandledOrderIds(supabase, orders = []) {
  const handled = new Set((orders || []).filter((order) => order?.exciseNotBilledKind).map((order) => order.id));
  const rest = (orders || []).filter((order) => order?.id && !handled.has(order.id)).map((order) => order.id);
  if (!rest.length) return handled;
  const rows = await fetchAllInChunks(rest, (chunk) => exciseRowsOnly(supabase
    .from('quotations').select('id, "sourceSalesOrderId", status, "createdAt", metadata, lines:quotation_lines(qty, "packQty", metadata)'))
    .in('sourceSalesOrderId', chunk)
    .in('status', LIVE_EXCISE_QUOTATION_STATUSES)
    .order('id', { ascending: true }));
  if (!rows.length) return handled;
  const accepted = rows.filter((row) => row.status === 'accepted');
  /* SO ค่าสรรพสามิตที่ยังมีผลของรอบที่รับแล้ว (ไม่ยกเลิก · ไม่ถูกแทน — ใบละไม่เกินหนึ่ง · ด่าน 0416) */
  const orderRows = accepted.length ? await fetchAllInChunks(accepted.map((row) => row.id), (chunk) => exciseRowsOnly(supabase
    .from('sales_orders').select('id, "quotationId"'))
    .in('quotationId', chunk)
    .neq('status', 'cancelled')
    .is('supersededById', null)
    .order('id', { ascending: true })) : [];
  const ordered = new Set(orderRows.map((row) => row.quotationId));

  const bySource = new Map();
  for (const row of rows) bySource.set(row.sourceSalesOrderId, [...(bySource.get(row.sourceSalesOrderId) || []), row]);
  const remainderCandidates = [];
  for (const [sourceId, rounds] of bySource) {
    if (rounds.some((row) => row.status === 'accepted' && !ordered.has(row.id))) continue; // รอออก SO ค่าสรรพสามิต
    if (rounds.some((row) => row.status !== 'accepted')) { handled.add(sourceId); continue; } // มีรอบกำลังเดิน
    if ((roundsRemainingUnits(rounds) || 0) > 0.000001) remainderCandidates.push(sourceId);
    else handled.add(sourceId);
  }
  if (!remainderCandidates.length) return handled;
  // ยังค้างแต่ปิดยอดค้างแล้ว (V11) = จบงานฝ่ายขาย
  const closedRows = await fetchAllInChunks(remainderCandidates, (chunk) => supabase
    .from('sales_orders').select('id, "exciseRemainderClosedAt"')
    .in('id', chunk)
    .not('exciseRemainderClosedAt', 'is', null)
    .order('id', { ascending: true }));
  for (const row of closedRows) handled.add(row.id);
  return handled;
}

