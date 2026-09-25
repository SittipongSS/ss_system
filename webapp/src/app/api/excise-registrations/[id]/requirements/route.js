import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord } from '@/lib/permissions';
import { registrationRequirements } from '@/lib/tax/requirements';

export const dynamic = 'force-dynamic';

// GET /api/excise-registrations/[id]/requirements
// Completeness checklist for a registration (same service the submit-gate uses).
// → { ready, missing[], warnings[] }  (see lib/tax/requirements.js)
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  // View-scope gate: don't leak requirements for out-of-team registrations.
  const { data: reg, error } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!reg || !canViewRecord(user, 'registrations', reg)) {
    return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  }

  /* 🐞 เดิมไม่จับ — `registrationRequirements` ตั้งใจ throw เมื่อ query พัง ("query พังต้องดัง" ใน lib/tax/requirements)
     แต่ถ้าหลุดออกจาก handler ไป Next ตอบ 500 เปล่า ๆ ไม่มี JSON ⇒ บรรทัด "รายละเอียดสำหรับแจ้งปัญหา"
     บนหน้าทะเบียนเหลือแค่ "HTTP 500" · จับแล้วส่งข้อความจริงกลับไป (ยังเป็น 500 — ไม่ได้ทำให้ดูเหมือนผ่าน) */
  let result;
  try {
    result = await registrationRequirements(supabase, id);
  } catch (e) {
    console.error('[excise-registrations/requirements]', id, e);
    return Response.json({ error: e?.message || 'ตรวจเอกสารบังคับไม่สำเร็จ' }, { status: 500 });
  }
  // ทะเบียนหายไประหว่างตรวจ (ถูกลบพอดี) — ตอบ 404 แทน `{ ready: false, missing: [] }` ที่อ่านเป็น "ขาด 0 ฉบับ"
  if (result?.notFound) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  return Response.json(result);
}
