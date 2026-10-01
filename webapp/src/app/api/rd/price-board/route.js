import { canAccessRd } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { loadRequests } from '@/lib/materialPricesAdmin';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { rowsSlotPricesLive } from '@/lib/master/scentFormulaAdmin';
import { awaitingPriceItems, priceBoardRows } from '@/lib/rd/priceBoard';

export const dynamic = 'force-dynamic';

const DEPT = 'RD';

// GET /api/rd/price-board — รายการที่ลูกค้าคอนเฟิร์มแล้ว รอ RD ใส่ราคา หนึ่งแถวหนึ่งรายการ (ม-153)
//
// ⭐ **ฝ่ายตรึงเป็น RD** เหมือน `/api/rd/perfumer-board` — แอดมินฝ่าย AD เปิดแล้วต้องได้ของ RD ไม่ใช่ศูนย์แถว
//
// ⚠️ **อ่านอย่างเดียว** — การใส่ราคา/ใช้ราคาในทะเบียนเขียนผ่าน
// `POST /api/sa/requests/[id]/items/[itemId]/price` ซึ่งมีด่านรายใบของตัวเองอยู่แล้ว · `proxy.js`
// เปิด `/api/rd` ไว้เฉพาะ GET โดยตั้งใจ
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  // ด่านเดียวกับการ์ดระบบ + แถบเมนูของโมดูล — แยกสองที่เมื่อไรก็ได้เมนูที่กดแล้ว 403
  if (!canAccessRd(user)) return forbidden('เส้นนี้เป็นของฝ่ายที่รับคำร้อง');

  let requests;
  try {
    /* ⭐ **ใช้ตัวโหลดคิวตัวเดิม ไม่เขียน query ใหม่** — จุดอ่าน `dept_requests` ถูกนับใน `check:rowcap`
       ซึ่งเพดานเต็มพอดี · และมันคืน `items` + ชื่อลูกค้ามาให้แล้ว (ไม่ใช่ `lean` — จอต้องโชว์ลูกค้า)
       ⚠️ กรองสถานะใบที่นี่ด้วยชุดเดียวกับด่าน POST — ใบที่ปิด/ยกเลิกไปแล้วไม่ต้องดึงมาเลย */
    requests = await loadRequests(supabase, { dept: DEPT, status: REQUEST_OPEN_STATUSES });
  } catch (e) {
    return fail(e?.message || 'อ่านคำร้องของฝ่ายไม่สำเร็จ', 500);
  }
  const pairs = awaitingPriceItems(requests);
  if (!pairs.length) return ok([]);

  let live;
  try {
    // ช่องราคา + ราคาในทะเบียนสด — ตัวเดียวกับที่ POST ใช้ตัดสิน (จอเปิดช่อง/ปุ่มชุดเดียวกับด่านเสมอ)
    live = await rowsSlotPricesLive(supabase, pairs.map((p) => p.item));
  } catch (e) {
    return fail(`อ่านทะเบียนกลิ่น/สูตร/ราคาไม่สำเร็จ: ${e?.message || ''}`.trim(), 500);
  }
  // ⚠️ ประกอบแถวที่ lib ตัวเดียวกับที่เทสต์ยิง — route มีหน้าที่แค่ดึงข้อมูลมาต่อกัน
  return ok(priceBoardRows(pairs, live));
});
