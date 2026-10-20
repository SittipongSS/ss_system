// ── ค่าที่ฟอร์มเปิดคำร้อง **ใบใหม่** ต้องรู้จาก server (ประเมินจากแบบ งวด 4 · S4 A-1) ────────────
//
// ⭐ ทำไมต้องมีเส้นแยก: ฟอร์มแก้ใบรู้ค่าสวิตช์จาก GET ของใบ (`drawingMethodEnabled` ใน `[id]/route.js`)
//   แต่หน้า `/requests/new` ยังไม่มีใบให้ GET ⇒ ถามที่นี่ก่อนวาดปุ่มเลือกวิธีประเมิน
// 🔴 สวิตช์ `SURVEY_DRAWING_METHOD` อ่านได้ที่ server เท่านั้น (ไม่ใช่ `NEXT_PUBLIC_`) — จอที่อ่านเองจะเห็น "ปิด"
//   เสมอแล้วเถียงกับด่านของ POST ⇒ จอรู้ค่าจากคำตอบของเส้นนี้ทางเดียว
// ⚠️ ด่านเดียวกับ `mentionable/route.js` (`canViewRequests`) — เส้นนี้บอกแค่ค่าสวิตช์ ไม่มีข้อมูลของใคร
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { surveyDrawingMethodEnabled } from '@/lib/service/surveyDrawingFlag';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    return Response.json(
      { drawingMethodEnabled: surveyDrawingMethodEnabled() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
