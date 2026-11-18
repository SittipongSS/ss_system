// ── หน้าสินค้าศูนย์รวม: ใบเสนอราคา/ใบสั่งขายที่มีสินค้า 1 ตัว (งวด S1) ─────────────────────────────
//
// แผน: docs/product-hub-plan.md · มติเจ้าของ 18/11/2026
//  · มติ 5 — **เห็นตามสิทธิ์โมดูลขาย** ⇒ ด่านชุดเดียวกับหน้าลูกค้า (customerHubData.js มติ 4) ห้ามเขียนด่านใหม่:
//      ใบเสนอราคา/ใบสั่งขาย  canViewSalesPlanning + inSalesDocScope ผ่านดีล (ใบค่าสรรพสามิต = ผ่านดีลต้นทาง)
//    ไม่มีสิทธิ์ = `visible: false` + ลิสต์ว่าง (จอไม่วาดแท็บการขายและตัวเลขยอดบนหัว)
//  · หาใบจาก **บรรทัด** ที่ `productId` ตรง (ไม่ใช่จากลูกค้า) — FG เดียวกันอาจถูกขายในชื่อลูกค้าอื่นของนิติบุคคลเดียวกัน
//  · ⛔ GET ห้ามเขียน · ⚠️ query พัง = throw (ว่างเพราะพังอ่านเหมือน "สินค้านี้ยังไม่เคยขาย")
//  · ⚠️ ทุก query ผ่าน fetchAll / fetchAllInChunks + เรียงด้วย id (ตัด 1,000 แถวเงียบ · `.in()` 16 KB)
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { can, canSeeProductCostUser } from '@/lib/permissions';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import {
  HUB_ORDER_COLS, HUB_QUOTATION_COLS, dealMapFor, scopeSalesDocs, sourceDealMapFor,
} from '@/lib/master/customerHubData';

export const PRODUCT_QUOTE_LINE_COLS = 'id, quotationId, productId, fgCode, description, qty, unit, unitPrice, lineTotal, packQty';
export const PRODUCT_ORDER_LINE_COLS = 'id, salesOrderId, productId, fgCode, description, qty, unit, unitPrice, lineTotal, packQty';
// + ชื่อลูกค้าบนใบ — FG หนึ่งตัวขายในชื่อลูกค้าอื่นของนิติบุคคลเดียวกันได้ (จอโชว์คอลัมน์ลูกค้าเมื่อมีมากกว่าหนึ่งราย)
const QUOTE_COLS = `${HUB_QUOTATION_COLS}, customerName`;
const ORDER_COLS = `${HUB_ORDER_COLS}, customerName`;
const DEAL_COLS = 'id, code, title, stage, dealType, team, ownerId, ownerName';

const linesOf = (supabase, table, cols, productId) => fetchAll(() => supabase
  .from(table).select(cols).eq('productId', productId).order('id', { ascending: true }));

const byIds = (supabase, table, cols, ids) => (ids.length
  ? fetchAllInChunks(ids, (chunk) => supabase.from(table).select(cols).in('id', chunk).order('id', { ascending: true }))
  : []);

const groupLines = (lines, key) => {
  const map = new Map();
  for (const line of lines) {
    const id = line[key];
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(line);
  }
  return map;
};

/**
 * @returns {Promise<{ visible: boolean, quotations: object[], orders: object[], deals: object[] }>}
 *   ทุกใบติด `lines` = บรรทัดของสินค้านี้บนใบนั้น (ใบหนึ่งมีสินค้าเดียวกันได้หลายบรรทัด)
 *   `deals` = ดีลของใบที่มองเห็น (ใช้โชว์รหัสดีลบนแถว)
 */
export async function productSalesRelations(supabase, productId, user) {
  if (!canViewSalesPlanning(user)) return { visible: false, quotations: [], orders: [], deals: [] };

  const [quoteLines, orderLines] = await Promise.all([
    linesOf(supabase, 'quotation_lines', PRODUCT_QUOTE_LINE_COLS, productId),
    linesOf(supabase, 'sales_order_lines', PRODUCT_ORDER_LINE_COLS, productId),
  ]);
  const quoteLinesById = groupLines(quoteLines, 'quotationId');
  const orderLinesById = groupLines(orderLines, 'salesOrderId');

  const [quoteRows, orderRows] = await Promise.all([
    byIds(supabase, 'quotations', QUOTE_COLS, [...quoteLinesById.keys()]),
    byIds(supabase, 'sales_orders', ORDER_COLS, [...orderLinesById.keys()]),
  ]);
  const docRows = [...quoteRows, ...orderRows];
  const dealById = await dealMapFor(supabase, [], docRows);
  const sourceDealById = await sourceDealMapFor(supabase, docRows);

  const quotations = scopeSalesDocs(user, quoteRows, dealById, sourceDealById)
    .map((q) => ({ ...q, lines: quoteLinesById.get(q.id) || [] }));
  const orders = scopeSalesDocs(user, orderRows, dealById, sourceDealById)
    .map((o) => ({ ...o, lines: orderLinesById.get(o.id) || [] }));

  // ดีลที่ส่งให้จอ = เฉพาะของใบที่มองเห็น (ไม่ส่งดีลของใบที่ถูกกรองทิ้ง)
  const visibleDealIds = new Set([...quotations, ...orders].map((d) => d.dealId).filter(Boolean));
  const deals = [...dealById.values()]
    .filter((d) => visibleDealIds.has(d.id))
    .map((d) => Object.fromEntries(DEAL_COLS.split(', ').map((k) => [k, d[k] ?? null])));

  return { visible: true, quotations, orders, deals };
}

/* ── ประวัติราคา (งวด S3 · มติ 6) ─────────────────────────────────────────────────────────────────────────
   `product_price_history` — ระบบเขียนทุกครั้งที่แก้ราคา (lib/master/priceHistory.js) แต่ไม่เคยมีจอไหนอ่าน
   ⭐ เห็นตามสิทธิ์เดิมของแท็บราคา (ห้ามเขียนด่านใหม่ — ตัดด้วยตัวตัดสินชุดเดียวกับ redactProductMargin / ระบบภาษี):
      ราคาผลิต (costPrice*)        canSeeProductCostUser (SA · RA · แอดมิน · FN)
      ภาษีสรรพสามิต/ท้องถิ่น         history:view (ผู้เห็นระบบภาษี)
      ราคาขายปลีก (รวม/ถอด VAT)    ทุกคนที่เปิดหน้าสินค้าได้ (ตัวเดียวกับที่ GET สินค้าคืนให้อยู่แล้ว)
   ⚠️ แถวที่หลังตัดแล้วไม่เหลือช่องที่เปลี่ยนให้เห็น = ไม่ส่ง (ไม่โชว์แถวว่างที่บอกแค่ว่า "มีคนแก้อะไรสักอย่าง") */
export const PRICE_HISTORY_COLS = 'id, productId, changeType, changedByName, createdAt, costPriceBefore, costPriceAfter, retailPriceIncVatBefore, retailPriceIncVatAfter, retailPriceExVatBefore, retailPriceExVatAfter, exciseTaxBefore, exciseTaxAfter, localTaxBefore, localTaxAfter';
const PRICE_PAIRS = Object.freeze({
  cost: ['costPrice'],
  retail: ['retailPriceIncVat', 'retailPriceExVat'],
  tax: ['exciseTax', 'localTax'],
});
const samePrice = (a, b) => ((a == null || a === '') && (b == null || b === '')) || Number(a) === Number(b);

/** ตัดช่องตามสิทธิ์ของผู้ดู — pure (เทสต์ได้โดยไม่ต้องมีฐาน) */
export function redactPriceHistory(rows, { seesCost = false, seesTax = false } = {}) {
  const groups = ['retail', ...(seesCost ? ['cost'] : []), ...(seesTax ? ['tax'] : [])];
  const fields = groups.flatMap((g) => PRICE_PAIRS[g]);
  return (rows || []).map((row) => {
    const out = { id: row.id, changeType: row.changeType, changedByName: row.changedByName, createdAt: row.createdAt };
    for (const f of fields) {
      out[`${f}Before`] = row[`${f}Before`] ?? null;
      out[`${f}After`] = row[`${f}After`] ?? null;
    }
    out.changed = fields.filter((f) => !samePrice(row[`${f}Before`], row[`${f}After`]));
    return out;
  }).filter((row) => row.changed.length > 0);
}

export async function productPriceHistory(supabase, productId, user) {
  const rows = await fetchAll(() => supabase
    .from('product_price_history').select(PRICE_HISTORY_COLS).eq('productId', productId)
    .order('createdAt', { ascending: false }).order('id', { ascending: true }));
  return redactPriceHistory(rows, { seesCost: canSeeProductCostUser(user), seesTax: can(user?.role, 'history:view') });
}
