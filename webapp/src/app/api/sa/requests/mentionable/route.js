// ── รายชื่อคนที่ @ ได้ในคำร้อง "ที่ยังไม่ถูกสร้าง" ───────────────────────
//
// ทำไมต้องมีเส้นแยกจาก /api/updates/mentionable: เส้นนั้นรับ entityId ของเรื่องที่
// **มีอยู่แล้ว** เพื่อเอาแถวแม่ไปตัดสินสิทธิ์รายคน — แต่ฟอร์มเปิดคำร้องต้องโชว์
// รายชื่อ *ก่อน* คำร้องเกิด (ผู้ใช้พิมพ์ @ ตอนกรอกฟอร์ม ไม่ใช่หลังกดส่ง)
//
// ⭐ เดิมเส้นนี้พึ่งพาว่าด่านเธรด (`updateAccess.dept_request.canView`) **ไม่ดูแถว**
// จึงส่ง parent เปล่า ๆ เข้าไปแล้วได้รายชื่อที่เท่ากันทุกใบ · ตอนนี้ด่านนั้นผูกกับแถว
// แล้ว (ปิดรูที่ใครถือ costing:view ก็อ่านเธรดของใบไหนก็ได้) ⇒ ต้องประกอบ parent ที่
// **เป็นตัวแทนของคำร้องที่ผู้ใช้กำลังจะเปิด** ไม่ใช่ของปลอมที่ไม่มีฟิลด์อะไรเลย
//
//   requestedById = ตัวผู้ใช้เอง (เขาคือผู้ขอของใบที่กำลังจะเกิด)
//   dept          = ฝ่ายปลายทางที่เขาเลือกไว้บนฟอร์ม → คนของฝ่ายนั้นคือผู้ตอบ
//
// ⚠️ ไม่ระบุ dept = ตอบเป็น **สหภาพของทุกฝ่ายผู้รับ** เพื่อไม่ให้รายชื่อว่างตอนที่
// ฟอร์มยังไม่ได้เลือกฝ่าย · เป็น superset ที่ยอมรับได้เพราะด่านจริงอยู่ตอนโพสต์:
// `sanitizeMentions` กรองซ้ำด้วยแถวจริงของคำร้อง ⇒ @ คนที่เห็นใบไม่ได้ จะไม่ถูก
// บันทึกและไม่ได้แจ้งเตือน (ที่เสียคือ UX ไม่ใช่สิทธิ์)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import { mentionableUsers } from '@/lib/master/mentions';
import { REQUEST_DEPTS } from '@/lib/master/requestTypes';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

    const wanted = new URL(request.url).searchParams.get('dept');
    const depts = REQUEST_DEPTS.includes(wanted) ? [wanted] : REQUEST_DEPTS;
    const supabase = getSupabaseAdmin();

    // ถามทีละฝ่ายแล้วรวม — เพราะด่านตัดสินจาก `dept` ของแถว ทีละค่าเท่านั้น
    const byId = new Map();
    for (const dept of depts) {
      const draft = { status: 'draft', requestedById: user?.id ?? null, dept };
      for (const p of await mentionableUsers(supabase, 'dept_request', draft)) {
        byId.set(p.id, p);
      }
    }
    const people = [...byId.values()]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));

    return Response.json(people, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
