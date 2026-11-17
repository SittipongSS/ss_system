// ── ตัวโหลดข้อมูลของ `/api/ext/v1/sales-orders` — ใบไหนส่ง · แบ่งหน้าด้วย `changeSeq` (แผน docs/so-external-api-plan.md) ──
//
// ใบที่ส่ง (มติ 6): `origin = 'pipeline'` · สถานะ 4 ตัว (EXPORT_STATUSES) · มีบรรทัดหมวดกลุ่ม 01/02 อย่างน้อยหนึ่งบรรทัด
//   (`BOM_MAIN_CATEGORIES` — กติกาเดียวกับส่ง BOM ให้ RD) · **ข้อยกเว้น Rev.**: ใบ Rev. ที่ถอด 01/02 ออกหมดยังส่ง
//   ถ้าใบก่อนหน้า (`revisedFromId`) เคยเข้าเกณฑ์ — ไม่งั้นปลายทางเห็น `supersededBy` ชี้ใบที่ไม่เคยได้รับ
// แบ่งหน้า: รวม SO + ร่องรอยใบที่ถูกลบ เรียงตาม `changeSeq` (sequence เดียวกัน) · `nextAfter` = เลขของแถวสุดท้ายที่ **สแกน**
//   (ไม่ใช่แถวสุดท้ายที่ส่ง — ใบที่ไม่เข้าเกณฑ์ต้องถูกข้ามไปด้วย ไม่งั้นปลายทางวนไม่จบ)
// ⭐ ไม่ส่งแถวที่ `changedAt` ใหม่กว่า 60 วินาที — กันแถวที่ได้เลขก่อนแต่ commit ทีหลังถูกข้าม (ทรานแซกชันของระบบจบในไม่กี่วินาที)
import { BOM_MAIN_CATEGORIES } from '@/lib/master/productBom';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { ORIGIN_PIPELINE, pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { EXPORT_STATUSES, extLineCategory, salesOrderDto, deletedOrderDto } from '@/lib/extApi/salesOrderDto';

export const FEED_LIMIT_MAX = 100;
export const FEED_SETTLE_SECONDS = 60;
const REV_CHAIN_MAX = 30;

export const FEED_ORDER_COLUMNS = [
  'id', '"orderNumber"', '"baseNumber"', '"revisionNo"', 'status', '"supersededById"', '"revisedFromId"', 'origin',
  '"orderDate"', '"deliveryDueDate"', '"paymentDueDate"', '"approvedAt"', '"cancelledAt"', '"customerId"', '"customerName"',
  'subtotal', '"discountAmount"', '"vatAmount"', '"totalAmount"', '"changeSeq"', '"changedAt"',
].join(', ');
// ⚠️ สตริงตรง ๆ (ไม่ใช่ `[...].join`) — ยามผู้อ่านจำนวน (linePackReaders GA) ต้องอ่านออกว่า qty มาคู่ packQty
export const FEED_LINE_COLUMNS = 'id, "salesOrderId", "productId", "fgCode", description, qty, "packQty", unit, "unitPrice", "discountAmount", "lineTotal", "sortOrder", metadataCategory:metadata->>categoryCode';
const CHAIN_COLUMNS = 'id, origin, "revisedFromId"';

/** `after` / `limit` จาก query string — ค่าผิดรูป = error ภาษาไทยให้ route ตอบ 400 */
export function parseFeedParams(searchParams) {
  const rawAfter = searchParams.get('after');
  const rawLimit = searchParams.get('limit');
  const after = rawAfter === null || rawAfter === '' ? 0 : Number(rawAfter);
  if (!Number.isSafeInteger(after) || after < 0) return { error: 'after ต้องเป็นจำนวนเต็มตั้งแต่ 0' };
  const limit = rawLimit === null || rawLimit === '' ? FEED_LIMIT_MAX : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > FEED_LIMIT_MAX) return { error: `limit ต้องอยู่ระหว่าง 1–${FEED_LIMIT_MAX}` };
  return { after, limit };
}

export const isProductionLine = (line) => {
  const code = extLineCategory(line);
  return !!code && BOM_MAIN_CATEGORIES.includes(String(code).slice(0, 2)) && String(code)[2] === '-';
};

/**
 * ใบไหนเข้าเกณฑ์ — คืน Set ของ id
 * @param orders แถวที่จะตัดสิน (มี id · origin · revisedFromId)
 * @param chain  Map id → แถวใบก่อนหน้า (id · origin · revisedFromId) — รวมทุกชั้นที่ตามได้
 * @param linesByOrder Map id → บรรทัด (ของทั้ง orders และ chain)
 */
export function qualifyingOrderIds(orders, chain, linesByOrder) {
  const memo = new Map();
  const qualifies = (row, depth = 0) => {
    if (!row || row.origin !== ORIGIN_PIPELINE) return false;
    if (memo.has(row.id)) return memo.get(row.id);
    memo.set(row.id, false); // กันวน
    let ok = (linesByOrder.get(row.id) || []).some(isProductionLine);
    if (!ok && row.revisedFromId && depth < REV_CHAIN_MAX) ok = qualifies(chain.get(row.revisedFromId), depth + 1);
    memo.set(row.id, ok);
    return ok;
  };
  return new Set(orders.filter((row) => qualifies(row)).map((row) => row.id));
}

/** รวม SO กับร่องรอย เรียงตาม changeSeq แล้วตัดหน้า · `nextAfter` = แถวสุดท้ายที่สแกน */
export function mergeFeedWindow(orders, deleted, { after, limit }) {
  const merged = [
    ...orders.map((row) => ({ kind: 'order', seq: Number(row.changeSeq), row })),
    ...deleted.map((row) => ({ kind: 'deleted', seq: Number(row.changeSeq), row })),
  ].sort((a, b) => a.seq - b.seq);
  const window = merged.slice(0, limit);
  return {
    window,
    hasMore: merged.length > limit,
    nextAfter: window.length ? window[window.length - 1].seq : after,
  };
}

async function loadLines(supabase, orderIds) {
  return fetchAllInChunks(orderIds, (ids) => supabase.from('sales_order_lines')
    .select(FEED_LINE_COLUMNS).in('salesOrderId', ids).order('id', { ascending: true }));
}

async function loadChain(supabase, orders) {
  const chain = new Map();
  let pending = [...new Set(orders.map((row) => row.revisedFromId).filter(Boolean))];
  for (let depth = 0; pending.length && depth < REV_CHAIN_MAX; depth += 1) {
    const rows = await fetchAllInChunks(pending, (ids) => supabase.from('sales_orders')
      .select(CHAIN_COLUMNS).in('id', ids).order('id', { ascending: true }));
    for (const row of rows) chain.set(row.id, row);
    pending = [...new Set(rows.map((row) => row.revisedFromId).filter((id) => id && !chain.has(id)))];
  }
  return chain;
}

/** ประกอบ DTO ของใบชุดหนึ่ง (โหลดบรรทัด · ใบก่อนหน้า · ใบที่มาแทน · รหัส AR) แล้วคืนเฉพาะใบที่เข้าเกณฑ์ */
export async function buildOrderDtos(supabase, orders) {
  if (!orders.length) return new Map();
  const chain = await loadChain(supabase, orders);
  const lines = await loadLines(supabase, [...orders.map((row) => row.id), ...chain.keys()]);
  const linesByOrder = new Map();
  for (const line of lines) {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId).push(line);
  }
  const keep = qualifyingOrderIds(orders, chain, linesByOrder);
  const kept = orders.filter((row) => keep.has(row.id));
  const [successors, customers] = await Promise.all([
    fetchAllInChunks(kept.map((row) => row.supersededById).filter(Boolean), (ids) => supabase.from('sales_orders')
      .select('id, "orderNumber"').in('id', ids).order('id', { ascending: true })),
    fetchAllInChunks(kept.map((row) => row.customerId).filter(Boolean), (ids) => supabase.from('customers')
      .select('id, "arCode"').in('id', ids).order('id', { ascending: true })),
  ]);
  const successorNumber = new Map(successors.map((row) => [row.id, row.orderNumber]));
  const arCode = new Map(customers.map((row) => [row.id, row.arCode]));
  return new Map(kept.map((row) => [row.id, salesOrderDto(row, {
    lines: linesByOrder.get(row.id) || [],
    arCode: arCode.get(row.customerId) || null,
    supersededBy: row.supersededById ? successorNumber.get(row.supersededById) || null : null,
  })]));
}

/** หนึ่งหน้าของรายการ · throw เมื่ออ่านฐานไม่ได้ (route ตอบ 500 — ห้ามตอบหน้าว่างที่ปลายทางอ่านว่า "ไม่มีอะไรเปลี่ยน") */
export async function loadFeedPage(supabase, { after, limit, now = new Date() }) {
  const settled = new Date(now.getTime() - FEED_SETTLE_SECONDS * 1000).toISOString();
  const [ordersResult, deletedResult] = await Promise.all([
    pipelineRowsOnly(supabase.from('sales_orders').select(FEED_ORDER_COLUMNS))
      .in('status', EXPORT_STATUSES)
      .gt('changeSeq', after).lte('changedAt', settled)
      .order('changeSeq', { ascending: true }).limit(limit + 1),
    supabase.from('sales_orders_deleted').select('"changeSeq", "orderNumber", "baseNumber", "revisionNo", "deletedAt"')
      .gt('changeSeq', after).lte('deletedAt', settled)
      .order('changeSeq', { ascending: true }).limit(limit + 1),
  ]);
  if (ordersResult.error) throw new Error(`อ่านใบสั่งขายไม่สำเร็จ: ${ordersResult.error.message}`);
  if (deletedResult.error) throw new Error(`อ่านร่องรอยใบที่ถูกลบไม่สำเร็จ: ${deletedResult.error.message}`);
  const { window, hasMore, nextAfter } = mergeFeedWindow(ordersResult.data || [], deletedResult.data || [], { after, limit });
  const dtos = await buildOrderDtos(supabase, window.filter((item) => item.kind === 'order').map((item) => item.row));
  const data = [];
  for (const item of window) {
    if (item.kind === 'deleted') data.push(deletedOrderDto(item.row));
    else if (dtos.has(item.row.id)) data.push(dtos.get(item.row.id));
  }
  return { data, nextAfter, hasMore };
}

/** ใบเดียวตามเลขที่ใบ — `null` = ไม่พบ หรือไม่ใช่ใบที่ API ส่ง (ไม่บอกว่าเพราะอะไร) */
export async function loadOneOrder(supabase, orderNumber) {
  const { data: rows, error } = await supabase.from('sales_orders').select(FEED_ORDER_COLUMNS)
    .eq('orderNumber', orderNumber).limit(2);
  if (error) throw new Error(`อ่านใบสั่งขายไม่สำเร็จ: ${error.message}`);
  const row = (rows || [])[0] || null;
  if (row) {
    if (row.origin !== ORIGIN_PIPELINE || !EXPORT_STATUSES.includes(row.status)) return null;
    const dtos = await buildOrderDtos(supabase, [row]);
    return dtos.get(row.id) || null;
  }
  const { data: gone, error: goneError } = await supabase.from('sales_orders_deleted')
    .select('"changeSeq", "orderNumber", "baseNumber", "revisionNo", "deletedAt"')
    .eq('orderNumber', orderNumber).order('changeSeq', { ascending: false }).limit(1);
  if (goneError) throw new Error(`อ่านร่องรอยใบที่ถูกลบไม่สำเร็จ: ${goneError.message}`);
  return gone?.[0] ? deletedOrderDto(gone[0]) : null;
}
