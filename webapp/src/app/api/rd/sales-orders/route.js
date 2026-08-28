import { canAccessRd } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { referencedOrderIds, relatedOrderRows } from '@/lib/rd/relatedOrders';

export const dynamic = 'force-dynamic';

const DEPT = 'RD';

// GET /api/rd/sales-orders — ใบสั่งขายที่คำร้องของฝ่าย R&D "อ้างถึง" (อ่านอย่างเดียว)
//
// ⭐ **ฝ่ายตรึงเป็น RD เหมือนหน้าคิวคำร้องของโมดูลนี้** (`app/rd/requests/page.js`
// ตรึง `DEPT = "RD"` เช่นกัน) — เส้นนี้อยู่ใต้ `/api/rd` จึงเป็นข้อมูลของฝ่ายนั้น
// 🐞 เคยเขียนให้กรองด้วย **ฝ่ายของคนเรียก** แล้วแอดมิน (ฝ่าย AD) เปิดหน้านี้ได้ศูนย์แถว
// ทั้งที่ `canAccessRd` ให้ผ่าน ⇒ หน้าดูเหมือนพัง สำหรับคนที่มีหน้าที่ตรวจระบบพอดี
//
// ⚠️ **ไม่ใช่ทะเบียนใบสั่งขาย** — คืนเฉพาะใบที่ถูกอ้างจริง · การแก้ทุกอย่างยังอยู่ที่
// เจ้าของเอกสาร (`/api/sales-planning/sales-orders/...`) เส้นนี้ไม่มี POST/PATCH โดยตั้งใจ
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  // ด่านเดียวกับการ์ดระบบ + แถบเมนูของโมดูล — แยกสองที่เมื่อไรก็ได้เมนูที่กดแล้ว 403
  if (!canAccessRd(user)) return forbidden('เส้นนี้เป็นของฝ่ายที่รับคำร้อง');

  /* ⚠️ `.limit()` ทุกจุดที่อ่านตารางที่โตได้ (check:rowcap) — คำร้องของฝ่ายเดียว
     ยังโตได้เรื่อย ๆ จึงไล่ทีละหน้าแทนการหวังว่าจะไม่ถึงเพดาน 1,000 */
  const { data: requests, error } = await fetchAllResult(() => supabase
    .from('dept_requests')
    .select('id, "docNo", kind, status, title, "salesOrderId"')
    .eq('dept', DEPT)
    .not('salesOrderId', 'is', null)
    .order('createdAt', { ascending: false }));
  if (error) return fail(error.message || 'อ่านคำร้องของฝ่ายไม่สำเร็จ', 500);

  const orderIds = referencedOrderIds(requests || []);
  if (!orderIds.length) return ok([]);

  // อ่านได้อย่างมากเท่าจำนวน id ที่ขอ — ขอบเขตชัด ไม่ต้องไล่หน้า
  const [{ data: orders, error: orderError }, { data: lines, error: lineError }] = await Promise.all([
    supabase.from('sales_orders')
      .select('id, "orderNumber", "orderDate", status, "customerId", "customerName", "dealId", "projectId"')
      .in('id', orderIds).limit(orderIds.length),
    /* บรรทัดสินค้า: RD อ่านเพื่อรู้ว่าออร์เดอร์นี้ต้องได้ FG อะไรออกมา
       ⚠️ **ไม่เอาราคา** — `unitPrice`/`lineTotal` เป็นข้อมูลการค้าของฝ่ายขาย
       ฝ่าย R&D ไม่ต้องใช้ และการไม่ส่งมาคือด่านที่แน่นอนกว่าการซ่อนที่จอ
       ⚠️ เพดาน: หนึ่งใบมีได้หลายบรรทัด ⇒ กันไว้ที่ 50 บรรทัด/ใบ ซึ่งเกินของจริงมาก */
    supabase.from('sales_order_lines')
      .select('id, "salesOrderId", "fgCode", description, qty, unit, "sortOrder"')
      .in('salesOrderId', orderIds).limit(orderIds.length * 50),
  ]);
  if (orderError || lineError) return fail((orderError || lineError).message, 500);

  return ok(relatedOrderRows({ requests: requests || [], orders: orders || [], lines: lines || [] }));
});
