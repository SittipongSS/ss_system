// ── ใบสั่งขาย + บรรทัด ของเส้นเอกสาร FM-SA-04 ฝั่ง server — ตัวโหลดที่ทุกเส้นใต้ ──────────
//    `/api/sales-planning/sales-orders/[id]/spec-documents` ใช้ร่วมกัน (mig 0370)
//
// ⭐ ยกออกมาจาก `spec-documents/route.js` ตอนทำหน้า "ออกเอกสาร" แบบใบเสนอราคา (มติเจ้าของ 23/09/2569
//    "การสร้างเอกสาร ยังไม่ต้องรันอะไร จนกว่าจะบันทึก") — หน้าใหม่มีเส้นอ่านสองเส้น (ข้อมูลหน้า · กระดาษตัวอย่าง)
//    ที่ต้องเห็นใบ/บรรทัด/ขอบเขตชุดเดียวกับการ์ดและการออกเลขจริง · ไฟล์ route ส่งออกฟังก์ชันอื่นนอกจาก
//    handler ไม่ได้ (ข้อจำกัดของ Next) ⇒ ตัวโหลดต้องอยู่ที่นี่ ไม่งั้นแต่ละเส้นเขียนด่านของตัวเองแล้วเพี้ยนหากัน
// ⚠️ ไฟล์นี้ไม่ตัดสินสิทธิ์ออกเอกสาร — ด่านอยู่ที่ `documentCreateGate` (productSpecDocWorkflow) ตัวเดียว
// ⚠️ **supabase ไม่ throw** — ทุก query เช็ค `error` เอง
import 'server-only';
import { loadScoped } from '@/lib/scopedRow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';

export const NO_PRODUCT_LINK = 'บรรทัดนี้ไม่ได้ผูกสินค้าในทะเบียน — ออกใบสเปคสินค้าไม่ได้';

export const HISTORICAL_ORDER_BLOCK = 'ใบสั่งขายย้อนหลังไม่ออกใบสเปคสินค้า — ใบนี้คีย์จากเอกสารเดิมที่ส่งของไปแล้ว';

/**
 * โหลด + ตรวจขอบเขตในจังหวะเดียว (`loadScoped` — กฎ 6 ของด่านรายแถว) แล้วค่อยต่อบรรทัดสินค้า
 * · บรรทัดไม่ได้ scope เอง มันสังกัดใบที่ผ่านด่านมาแล้ว
 *
 * ⭐ `loadScoped` join ดีลแม่มาให้แล้ว (`order.deal`) ⇒ `order.deal.ownerId` คือ AE เจ้าของดีล
 *    (`sales_deals.ownerId`) — คนเดียวกับที่ขั้น AE ของเอกสารเป็นของเขา
 * 🛑 **ใบย้อนหลังออกใบสเปคไม่ได้** — ใบที่คีย์จากชีตคือของที่ส่งไปแล้วในอดีต ไม่มี "รอบขายที่กำลังจะส่ง"
 *    ให้ตกลงสเปก · ปล่อยผ่านเมื่อไรจะกินเลขที่เอกสารของเดือนนี้ไปกับใบที่ไม่มีใครใช้ (มติข้อ 21 ของสาย
 *    SO ย้อนหลัง) · RPC กันซ้ำอีกชั้น
 * ⚠️ บรรทัดพก `quotationLineId` มาด้วย — "จำนวนผลิต" ของกระดาษถอยไปบรรทัดใบเสนอราคาที่บรรทัด SO ชี้
 *    (`loadDocumentQuantity`) · ขาดคอลัมน์นี้ = กระดาษตัวอย่างพิมพ์จำนวนคนละตัวกับตอนยื่น
 *
 * @param mode 'view' (อ่าน) | 'edit' (ออกเลข)
 * @returns {{ order, dealOwnerId } | { response: Response } | { blocked: string } | { error: string }}
 */
export async function loadSpecDocOrder(supabase, id, user, mode) {
  const scoped = await loadScoped(supabase, 'sales_orders', id, user, mode);
  if (scoped.response) return { response: scoped.response };
  const order = scoped.row;
  if (isHistoricalOrder(order)) return { blocked: HISTORICAL_ORDER_BLOCK };
  // ⚠️ ไล่ทีละหน้า — เพดาน 1,000 แถวของ PostgREST ตัดเงียบ ๆ · ลำดับต้องนิ่ง
  //    ไม่งั้นหน้าที่สองซ้อนหน้าแรก (ด่าน check:rowcap)
  const lines = await fetchAllResult(() => supabase
    .from('sales_order_lines')
    .select('id, salesOrderId, quotationLineId, productId, fgCode, description, qty, unit, sortOrder')
    .eq('salesOrderId', id)
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true }));
  if (lines.error) return { error: lines.error.message };
  return { order: { ...order, lines: lines.data || [] }, dealOwnerId: order.deal?.ownerId || null };
}

/* เหตุที่บรรทัดนี้ไม่เข้าเกณฑ์ใบสเปค — หมวดนอก 01/02 หรือไม่ได้ผูกสินค้า (ไม่มีสเปคให้อ้าง)
   ⚠️ บรรทัด SO แก้ไม่ได้ (เป็น snapshot) ⇒ บรรทัดที่ไม่ผูกสินค้าไม่มีทางออกเอกสาร
      นับเป็น "ไม่ต้องใช้" พร้อมเหตุ ตามกติกาเดิมของการ์ด */
export const specDocLineScopeReason = (line) => productSpecScopeReason({ fgCode: line?.fgCode })
  || (line?.productId ? null : NO_PRODUCT_LINK);

/** บรรทัดในรูปที่จอเห็น — ไม่ส่งคอลัมน์ภายใน (`salesOrderId` · `quotationLineId`) ออกไป */
export const specDocLineView = (line) => ({
  id: line.id,
  fgCode: line.fgCode || null,
  description: line.description || null,
  qty: line.qty ?? null,
  unit: line.unit || null,
  productId: line.productId || null,
  sortOrder: line.sortOrder ?? null,
});
