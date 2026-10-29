// ── ใบเสนอราคาค่าสรรพสามิต: สร้างจาก SO ลูกค้า + ด่านที่ใช้ร่วม (แผนรื้อสรรพสามิต PR3 · หมวด 3.1 · 3.4 · 5) ─────────────
//
// มติเจ้าของ 28/10/2026: SA ออกใบเสนอราคาค่าสรรพสามิตด้วยฟอร์ม QT เดิม · ไม่มีดีล ผูก SO ลูกค้าต้นทาง ·
// บรรทัดละ FG ต้นทาง (ระบบคิดจาก SO) · 1 SO ลูกค้า = 1 ใบ · ไม่นับ Actual · ผู้อนุมัติ = เจ้าของดีลต้นทาง/ผู้จัดการ (0415)
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
import { normalizePaymentPlan } from '@/lib/sales/paymentPlan';
import { loadDealOwnerContact } from '@/lib/sales/dealOwner';
import { ORIGIN_EXCISE, exciseRowsOnly, isExciseOrder, isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { lineMoneyRuleMessage, withPackColumn } from '@/lib/sales/linePacks';
import { resolveSalesOrderFiling } from '@/lib/excise/soFilingItems';
import { buildExciseQuotationLines } from '@/lib/excise/exciseCharge';
import { ensureExciseChargeProduct } from '@/lib/excise/exciseChargeProduct';

export class ExciseQuotationError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** สถานะใบค่าสรรพสามิตที่ "ยังมีผล" — กันออกใบซ้ำบน SO เดียว + ล็อก SO ลูกค้า (Q16) · ยกเลิก/ออก Rev. ทับ/ปิด = ไม่มีผลแล้ว */
export const LIVE_EXCISE_QUOTATION_STATUSES = Object.freeze(['draft', 'sent', 'rejected', 'accepted']);
export const isLiveExciseQuotation = (quote) => isExciseOrder(quote) && LIVE_EXCISE_QUOTATION_STATUSES.includes(quote?.status);

/** คำอ้างอิงบนกระดาษ (ช่อง "เอกสารอ้างอิง" ของ FM-SA-01) — ลูกค้าเห็นว่าค่าภาษีนี้ของใบไหน
 *  มติเจ้าของ 29/10 (กระดาษใบทดลอง): เลข SO / QT ต้นทางเท่านั้น — คำว่า "ค่าภาษีสรรพสามิต" ย้ายไปช่อง "โครงการ" (excisePaperReference) */
export function exciseQuotationReference(order, sourceQuote) {
  return [order?.orderNumber, sourceQuote?.quoteNumber].filter(Boolean).join(' / ');
}

/** คำอ้างอิงนี้ระบบเขียนเอง (ว่าง หรือรูปเดิมก่อน 29/10 "ค่าภาษีสรรพสามิตของ …") — "คิดใหม่จากใบสั่งขาย" เขียนทับได้ · คนพิมพ์เอง = ไม่แตะ */
export const exciseReferenceIsAuto = (note) => {
  const text = String(note || '').trim();
  return !text || text.startsWith('ค่าภาษีสรรพสามิตของ');
};

/**
 * ออกใบค่าสรรพสามิตจาก SO นี้ได้ไหม — ตัวตัดสินเดียวของปุ่มบนจอ (ปุ่มกดไม่ได้ = โชว์แล้วบอกเหตุ) กับ route
 * @param order       SO ลูกค้า (แถว sales_orders)
 * @param liveQuote   ใบค่าสรรพสามิตที่ยังมีผลของ SO นี้ (ถ้ามี)
 * @returns ข้อความไทย หรือ null = ออกได้
 */
export function exciseQuotationBlocker(order, { liveQuote = null } = {}) {
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (isExciseOrder(order)) return 'ใบนี้เป็นใบสั่งขายค่าสรรพสามิตอยู่แล้ว';
  if (isHistoricalOrder(order)) return 'ใบสั่งขายย้อนหลังไม่ออกใบเสนอราคาค่าสรรพสามิตในระบบ';
  if (order.status !== 'approved' || order.supersededById) return 'ออกใบเสนอราคาค่าสรรพสามิตได้เฉพาะใบสั่งขายที่อนุมัติแล้วและยังไม่ถูกออก Rev. ทับ';
  if (order.exciseNotBilledKind) return 'ใบสั่งขายนี้ถูกตัดสินว่า "ไม่เรียกเก็บค่าสรรพสามิตในระบบ" แล้ว — ถอนการตัดสินก่อนจึงออกใบได้';
  if (liveQuote) return `มีใบเสนอราคาค่าสรรพสามิต ${liveQuote.quoteNumber || liveQuote.id} ของใบสั่งขายนี้อยู่แล้ว (1 ใบสั่งขาย = 1 ใบ)`;
  return null;
}

/** ใบค่าสรรพสามิตที่ยังมีผลของ SO ลูกค้าหนึ่งใบ (ใหม่สุดก่อน) — `{ data, error }` · ไม่ throw */
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
 * บรรทัดของใบค่าสรรพสามิตจาก SO ลูกค้า ณ ตอนนี้ (อัตราสินค้า + ทะเบียนสด) — ตัวเดียวของ "ออกใบ" กับ "คิดใหม่จากใบสั่งขาย"
 * ⚠️ บรรทัดที่ไม่มีราคาขายปลีก = ปฏิเสธทั้งชุด (มติ Q3) · ไม่มีบรรทัดสรรพสามิตเลย = ปฏิเสธ
 * @returns `{ lines, filing, customer, sourceQuote, chargeProductCreated }` · ผิดกติกา = throw ExciseQuotationError
 */
export async function buildExciseLinesFromOrder({ supabase, user, order, request = null, ensureProduct = ensureExciseChargeProduct }) {
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

  const lines = buildExciseQuotationLines({
    filing, chargeProduct: charge.product, sourceLines: withLines?.lines || [], products: filing.products || [],
  });
  return { lines, filing, customer, sourceQuote, chargeProductCreated: Boolean(charge.created) };
}

/**
 * สร้างใบเสนอราคาค่าสรรพสามิต (ร่าง · ยังไม่ยื่น) จาก SO ลูกค้า
 * ⚠️ ผู้เรียกตรวจ cap + ขอบเขตกับ SO ลูกค้ามาแล้ว (loadScoped 'edit') และส่ง `order` ที่มี `deal` มา
 * @returns `{ quote, lines, warnings, chargeProductCreated }` · ผิดกติกา = throw ExciseQuotationError
 */
export async function createExciseQuotationDraft({
  supabase, user, order, request = null,
  audit = recordAudit, ensureProduct = ensureExciseChargeProduct,
} = {}) {
  const { data: liveQuote, error: liveError } = await loadLiveExciseQuotation(supabase, order?.id);
  if (liveError) throw new ExciseQuotationError(liveError.message, 500);
  const blocker = exciseQuotationBlocker(order, { liveQuote });
  if (blocker) throw new ExciseQuotationError(blocker, liveQuote ? 409 : 400, liveQuote ? { quotationId: liveQuote.id } : {});

  const built = await buildExciseLinesFromOrder({ supabase, user, order, request, ensureProduct });
  const { lines: builtLines, filing, customer, sourceQuote } = built;
  const vatRate = 7;
  const totals = quoteTotals(builtLines, { vatRate });
  const ownerContact = await loadDealOwnerContact(supabase, order.deal?.ownerId);
  const source = sourceQuote || {};
  const quoteId = genId('QT');
  const { data: quote, error } = await insertQuotationWithNumber(supabase, {
    id: quoteId,
    origin: ORIGIN_EXCISE,
    dealId: null,
    sourceSalesOrderId: order.id,
    revisionNo: 0,
    status: 'draft',
    quoteDate: businessDate(),
    validUntil: null,
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
    paymentPlan: normalizePaymentPlan({ type: 'full' }, totals.totalAmount),
    paymentTerms: null,
    docLanguage: source.docLanguage === 'en' ? 'en' : 'th',
    approvalStatus: 'not_submitted',
    notes: null,
    referenceNote: exciseQuotationReference(order, sourceQuote),
    metadata: {
      exciseSource: {
        salesOrderId: order.id,
        orderNumber: order.orderNumber || null,
        quotationId: order.quotationId || null,
        quoteNumber: sourceQuote?.quoteNumber || null,
      },
      // ผู้เสนอราคาบนกระดาษ = เจ้าของดีลต้นทาง (คนเดียวกับผู้อนุมัติ · ตรึงชื่อ + เบอร์แบบใบปกติ — ใบไม่มีดีลให้อ่านสด)
      salesOwner: order.deal?.ownerName || null,
      salesOwnerId: ownerContact?.id || null,
      salesOwnerPhone: ownerContact?.phone || null,
    },
    createdBy: user?.id || null,
    createdByName: user?.name || null,
    createdByPhone: user?.phone || null,
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
  ['quotation_approval_required', 'ใบค่าสรรพสามิตต้องอนุมัติก่อนจึงบันทึกว่าลูกค้ารับได้', 400],
  ['quotation_approval_stale', 'เนื้อหาใบเปลี่ยนหลังอนุมัติ — ต้องยื่นอนุมัติใหม่', 409],
  ['excise_source_order_invalid', 'ใบสั่งขายต้นทางไม่อยู่ในสถานะอนุมัติแล้ว (ยกเลิก/ย้อนอนุมัติ/ออก Rev. ทับ) — รับใบค่าภาษีของใบนั้นไม่ได้', 409],
  ['excise_source_not_billed', 'ใบสั่งขายต้นทางถูกตัดสินว่าไม่เรียกเก็บค่าสรรพสามิตในระบบแล้ว', 409],
  ['excise_source_already_accepted', 'ใบสั่งขายต้นทางมีใบเสนอราคาค่าสรรพสามิตที่ลูกค้ารับแล้ว (1 ใบสั่งขาย = 1 ใบ)', 409],
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
      error: quote.approvalStatus === 'approved' ? readiness.error : 'ใบค่าสรรพสามิตต้องยื่นและอนุมัติก่อนจึงบันทึกว่าลูกค้ารับได้',
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
    if (error.code === '23505') return { status: 409, error: ACCEPT_ERRORS.at(-1)[1] };
    return { status: 500, error: error.message };
  }
  const accepted = { ...(result?.quotation || {}), lines: quote.lines || [] };
  await appendDocumentEvent(supabase, { docType: 'quotation', doc: quote, action: 'accept', user });
  await audit({
    user, action: 'update', entityType: 'quotation', entityId: quote.id, before: quote, after: accepted,
    summary: `ลูกค้ารับใบเสนอราคาค่าสรรพสามิต ${quote.quoteNumber} (ไม่แตะดีล/FC)`,
    request,
  });
  return { data: { quotation: accepted } };
}

/** ข้อความเมื่อจอส่งบรรทัด/ส่วนลด/VAT มากับใบค่าสรรพสามิต (บรรทัดคือภาษีที่ระบบคิด · VAT 7% ตรึง) */
export const EXCISE_LINES_LOCKED_MESSAGE = 'รายการของใบค่าสรรพสามิตคิดจากใบสั่งขายต้นทาง แก้เองไม่ได้ (รวมส่วนลดและ VAT) — กด “คิดใหม่จากใบสั่งขาย” ถ้าสินค้า/ราคาขายปลีกเปลี่ยน';

/**
 * บรรทัดใหม่ของใบค่าสรรพสามิตที่ยังแก้ได้ — คิดจาก SO ต้นทาง ณ ตอนนี้ (route PATCH เอาไปบันทึกทางเดียวกับการแก้บรรทัดปกติ)
 * ⚠️ SO ต้นทางต้องยังอนุมัติ/ไม่ถูกแทน/ไม่ถูกตัดสินไม่เรียกเก็บ — ด่านเดียวกับตอนออกใบ (ไม่นับใบตัวเองเป็นใบซ้ำ)
 * @returns `{ lines }` · ผิดกติกา = throw ExciseQuotationError
 */
export async function recalcExciseQuotationLines({ supabase, user, quote, request = null, ensureProduct = ensureExciseChargeProduct }) {
  const { data: order, error } = await supabase
    .from('sales_orders').select('*').eq('id', quote?.sourceSalesOrderId).maybeSingle();
  if (error) throw new ExciseQuotationError(error.message, 500);
  const blocker = exciseQuotationBlocker(order);
  if (blocker) throw new ExciseQuotationError(blocker, 409);
  const { lines, sourceQuote } = await buildExciseLinesFromOrder({ supabase, user, order, request, ensureProduct });
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
      referenceNote: exciseQuotationReference(order, sourceQuote),
      metadata: {
        salesOwner: deal?.ownerName || null,
        salesOwnerId: ownerContact?.id || null,
        salesOwnerPhone: ownerContact?.phone || null,
      },
    },
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
 * SO ลูกค้าที่ "จัดการค่าสรรพสามิตแล้ว" ในขาฝ่ายขาย — ตัดสินไม่เรียกเก็บ · มีใบค่าสรรพสามิตที่ยังเดินอยู่ (ร่าง/ยื่น/ตีกลับ)
 * · หรือลูกค้ารับใบแล้ว **และมี SO ค่าสรรพสามิตที่ยังมีผล** (PR4)
 * ⇒ ไม่อยู่ในคิว "รอออกใบค่าสรรพสามิต" ของ SA (แดชบอร์ด · แถบเตือนทะเบียน SO · ด่านปิดโครงการ)
 * ⚠️ ใบที่รับแล้วแต่ยังไม่ออก SO = **ยังค้าง** — เดิม (PR3) ถือว่าจบตั้งแต่รับ ⇒ ใบหลุดทุกคิวทั้งที่ยังไม่มีเอกสารเก็บเงิน
 * @param orders แถว SO ที่ select `exciseNotBilledKind` มาแล้ว
 * @returns Set ของ id · อ่านพลาด = throw (คิวงานต้องไม่บอกว่า "ไม่มีงาน" เพราะอ่านไม่ขึ้น)
 */
export async function exciseHandledOrderIds(supabase, orders = []) {
  const handled = new Set((orders || []).filter((order) => order?.exciseNotBilledKind).map((order) => order.id));
  const rest = (orders || []).filter((order) => order?.id && !handled.has(order.id)).map((order) => order.id);
  if (!rest.length) return handled;
  const rows = await fetchAllInChunks(rest, (chunk) => exciseRowsOnly(supabase
    .from('quotations').select('id, "sourceSalesOrderId", status'))
    .in('sourceSalesOrderId', chunk)
    .in('status', LIVE_EXCISE_QUOTATION_STATUSES)
    .order('id', { ascending: true }));
  const accepted = [];
  for (const row of rows) {
    if (row.status === 'accepted') accepted.push(row);
    else handled.add(row.sourceSalesOrderId);
  }
  if (!accepted.length) return handled;
  /* SO ค่าสรรพสามิตที่ยังมีผลของใบที่รับแล้ว (ไม่ยกเลิก · ไม่ถูกแทน — ใบละไม่เกินหนึ่ง · ด่าน 0416) */
  const orderRows = await fetchAllInChunks(accepted.map((row) => row.id), (chunk) => exciseRowsOnly(supabase
    .from('sales_orders').select('id, "quotationId"'))
    .in('quotationId', chunk)
    .neq('status', 'cancelled')
    .is('supersededById', null)
    .order('id', { ascending: true }));
  const ordered = new Set(orderRows.map((row) => row.quotationId));
  for (const row of accepted) if (ordered.has(row.id)) handled.add(row.sourceSalesOrderId);
  return handled;
}
