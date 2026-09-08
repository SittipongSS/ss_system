import { canAccessRd } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { loadRequests } from '@/lib/materialPricesAdmin';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { byColumns, fetchAllInChunks } from '@/lib/supabaseInChunks';
import { perfumerBoardRows } from '@/lib/rd/perfumerBoard';

export const dynamic = 'force-dynamic';

const DEPT = 'RD';
// หัวข้อเดียวที่มี "กลิ่น" ให้แจก — ชนิดอื่นของฝ่าย (สอบถาม/ขอเอกสาร/พัฒนาสูตร)
// ไม่มีบรีฟกลิ่นโดยธรรมชาติ ⇒ เอามาใส่ตารางนี้จะได้แถวที่แจกอะไรไม่ได้
const KIND = 'scent_dev';

// GET /api/rd/perfumer-board — กลิ่นที่ยังเดินอยู่ทั้งฝ่าย หนึ่งแถวหนึ่งกลิ่น
//
// ⭐ **ฝ่ายตรึงเป็น RD** เหมือน `/api/rd/sales-orders` และหน้าคิวของโมดูล — เส้นนี้อยู่
// ใต้ `/api/rd` จึงเป็นข้อมูลของฝ่ายนั้น ไม่ใช่ของฝ่ายคนเรียก (แอดมินฝ่าย AD ต้องเปิดได้
// ไม่ใช่ได้ศูนย์แถว — บั๊กเดียวกับที่ route ข้างเคียงเคยเจอ)
//
// ⚠️ **อ่านอย่างเดียว** — การแจกเขียนผ่าน `PATCH /api/sa/requests/[id]`
// (`action: 'assign-brief'`) ซึ่งมีด่านรายใบของตัวเองอยู่แล้ว · เส้นนี้ไม่มี POST/PATCH
// โดยตั้งใจ และ `proxy.js` เปิด `/api/rd` ไว้เฉพาะ GET
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  // ด่านเดียวกับการ์ดระบบ + แถบเมนูของโมดูล — แยกสองที่เมื่อไรก็ได้เมนูที่กดแล้ว 403
  if (!canAccessRd(user)) return forbidden('เส้นนี้เป็นของฝ่ายที่รับคำร้อง');

  let requests;
  try {
    /* ⭐ **ใช้ตัวโหลดคิวตัวเดิม ไม่เขียน query ใหม่** — สองเหตุผล:
       (1) มันคืน `items` (direction ของแต่ละบรีฟ) มาให้แล้ว ซึ่งเป็นตัวตัดสินว่า
           "กลิ่นก้อนนี้ส่งไปแล้วหรือยัง" ⇒ ไม่ต้องอ่านตารางเดิมซ้ำ
       (2) จุดอ่าน `dept_requests` ของมันถูกนับใน `check:rowcap` อยู่แล้ว —
           เพดานของตารางนั้นเต็มพอดี (14/14) ⇒ เขียน `.select()` ใหม่แบบไม่มีขอบเขต
           ที่ไหนก็ตาม CI แดงทันที */
    requests = await loadRequests(supabase, { dept: DEPT, status: REQUEST_OPEN_STATUSES });
  } catch (e) {
    return fail(e?.message || 'อ่านคำร้องของฝ่ายไม่สำเร็จ', 500);
  }
  const asks = (requests || []).filter((r) => r?.kind === KIND);
  if (!asks.length) return ok([]);

  let briefs = [];
  try {
    /* 🔴 **ซอยลิสต์ข้างนอก ไล่หน้าข้างใน** — `fetchAll` อย่างเดียวไม่พอ เพราะมันส่ง
       ตัวกรองก้อนเดิมไปทุกหน้า ⇒ ลิสต์ id ที่โตตามจำนวนใบจะชน URL 16 KB ของ
       PostgREST เองวันหนึ่ง (กับดักที่ระบบนี้เจอมาแล้วกับ `/api/products`)
       ⚠️ **เลือกคอลัมน์เท่าที่ใช้ ห้าม `select('*')`** — บรีฟหนึ่งก้อนพกข้อความอิสระ
       ได้ถึง ~10 KB (brief 4000 · inspiration/likedNotes/dislikedNotes 2000 ต่อช่อง)
       ซึ่งตารางนี้ไม่ได้ใช้สักตัว · PostgREST คิดเป็น 79% ของ egress ทั้งโปรเจกต์
       ⚠️ ปิดท้าย `.order('id')` เสมอ — เรียงไม่นิ่งเมื่อไร การไล่หน้าจะซ้ำแถวและตก
       แถวพร้อมกัน · และต้องส่ง `sort` มาด้วยเพราะ PostgREST เรียง **ต่อก้อน**
       ไม่ได้เรียงทั้งชุดที่รวมแล้ว */
    briefs = await fetchAllInChunks(
      asks.map((a) => a.id),
      (chunk) => supabase
        .from('dept_request_scents')
        .select('id, "requestId", "sortOrder", label, "perfumerId", "perfumerName", "assignedAt"')
        .in('requestId', chunk)
        .order('requestId', { ascending: true })
        .order('sortOrder', { ascending: true })
        .order('id', { ascending: true }),
      { sort: byColumns('requestId', 'sortOrder', 'id') },
    );
  } catch (e) {
    return fail(e?.message || 'อ่านบรีฟกลิ่นไม่สำเร็จ', 500);
  }

  const byRequest = new Map();
  for (const brief of briefs) {
    const list = byRequest.get(brief.requestId) || [];
    list.push(brief);
    byRequest.set(brief.requestId, list);
  }

  // ⚠️ ประกอบแถวที่ lib ตัวเดียวกับที่เทสต์ยิง — route มีหน้าที่แค่ดึงข้อมูลมาต่อกัน
  return ok(perfumerBoardRows(asks.map((ask) => ({ ...ask, briefs: byRequest.get(ask.id) || [] }))));
});
