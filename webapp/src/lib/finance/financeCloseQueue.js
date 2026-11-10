// ── ชุดใบที่ "เก็บครบแล้ว รอบัญชีปิด" (แท็บรอปิดใบของหน้างานบัญชี · รื้อ PR-4a) ─────────────────────────────────
//
// ⭐ ตัวตัดสินตัวเดียวกับป้ายบนเมนู (เลนบัญชีของ /api/nav/counts) และธง `_awaitingFinanceReview` ของรายการ SO:
//   `awaitsFinanceReview(ใบ, งวดทุกงวดของใบ)` — แคบด้วย status = approved + financeStatus = pending ที่ query ก่อน (ชุดเล็ก: ค้างจริงเท่านั้น)
// ⚠️ อ่าน **งวดทุกงวด** ของใบจากตาราง ไม่ใช่แถวทะเบียน — ทะเบียนมีแต่งวดที่ตรึงแล้ว (frozenAt) · ใบที่ยังมีงวดไม่ตรึงต้องไม่ขึ้นว่าเก็บครบ
// 🔴 อ่านพัง = โยน (ไม่ใช่ชุดว่าง) — แท็บรอปิดใบว่างเงียบ ๆ คือกับดักที่เอกสารของ awaitsFinanceReview เตือนไว้ตรง ๆ
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { awaitsFinanceReview } from '@/lib/sales/salesOrderFinanceApproval';

/**
 * ตัดสินจากแถวที่โหลดมาแล้ว (แยกไว้ให้เทสต์ได้โดยไม่ต้องมีฐาน)
 * @param {object[]} orders แถว sales_orders (`id, status, totalAmount, financeStatus`)
 * @param {object[]} installments แถว sales_order_installments (`salesOrderId, status`)
 * @returns {Set<string>}
 */
export function financeCloseIdsOf(orders = [], installments = []) {
  const byOrder = new Map();
  for (const row of installments || []) {
    const list = byOrder.get(row.salesOrderId) || [];
    list.push(row);
    byOrder.set(row.salesOrderId, list);
  }
  return new Set((orders || []).filter((o) => awaitsFinanceReview(o, byOrder.get(o.id) || [])).map((o) => o.id));
}

/** @returns {Promise<Set<string>>} */
export async function loadFinanceCloseIds(supabase) {
  const { data: orders, error: orderError } = await fetchAllResult(() => supabase.from('sales_orders')
    .select('id, status, "totalAmount", "financeStatus"')
    .eq('status', 'approved').eq('financeStatus', 'pending').order('id', { ascending: true }));
  if (orderError) throw orderError;
  if (!(orders || []).length) return new Set();
  // ⚠️ ซอยลิสต์ + ไล่หน้า — ใบหนึ่งมีได้หลายงวด (เพดาน 1,000 แถว) และลิสต์ id ยาวชนเพดาน URL (กติกาเดียวกับเลนบัญชีของป้ายบนเมนู)
  const { data: installments, error: installmentError } = await fetchInChunks(orders.map((o) => o.id), (chunk) => fetchAllResult(() => supabase
    .from('sales_order_installments')
    .select('"salesOrderId", status')
    .in('salesOrderId', chunk)
    .order('id', { ascending: true })));
  if (installmentError) throw installmentError;
  return financeCloseIdsOf(orders, installments || []);
}
