// ── รายชื่อคนที่ @ ได้ในคำร้อง "ที่ยังไม่ถูกสร้าง" ───────────────────────
//
// ทำไมต้องมีเส้นแยกจาก /api/updates/mentionable: เส้นนั้นรับ entityId ของเรื่องที่
// **มีอยู่แล้ว** เพื่อเอาแถวแม่ไปตัดสินสิทธิ์รายคน — แต่โมดัลเปิดคำร้องต้องโชว์
// รายชื่อ *ก่อน* คำร้องเกิด (ผู้ใช้พิมพ์ @ ตอนกรอกฟอร์ม ไม่ใช่หลังกดส่ง)
//
// ⭐ ที่ทำได้เพราะด่านของเธรดคำร้อง (`updateAccess.dept_request.canView`) คือ
// `canViewCosting(user)` ซึ่ง **ไม่ขึ้นกับแถวคำร้องเลย** — รายชื่อจึงเท่ากันทุกใบ
// ⚠️ ถ้าวันหนึ่งด่านนั้นเปลี่ยนไปดูตัวแถว (เช่น จำกัดตามทีมเจ้าของดีล) เส้นนี้จะ
// ตอบกว้างเกินจริงทันที → ต้องเปลี่ยนมาสร้างร่างก่อนแล้วถามด้วย id จริง
// (เทสต์ `deptRequestMentionable` ล็อกสมมุติฐานข้อนี้ไว้)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import { mentionableUsers } from '@/lib/master/mentions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    // parent ปลอมรูปคำร้องร่าง — canView ของ dept_request ไม่อ่านฟิลด์ไหนเลย แต่
    // `mentionableUsers` คืน [] ถ้า parent ว่าง จึงต้องส่งของที่ไม่ใช่ null เข้าไป
    const people = await mentionableUsers(getSupabaseAdmin(), 'dept_request', { status: 'draft' });
    return Response.json(people, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
