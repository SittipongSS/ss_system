import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { revokeGoogleDocAccess } from '@/lib/master/googleDocAccess';

export const dynamic = 'force-dynamic';
// ถอน permission บน Drive ต้องโหลด googleapis — ต้อง Node runtime
export const runtime = 'nodejs';

// POST /api/users/[id]/revoke-doc-access — ถอนสิทธิ์เอกสารร่วมทั้งหมดของคนนี้บน Drive
//
// ⭐ **เคสที่ต้องกดจริงคือ "ย้ายทีมทั้งที่ยังทำงานอยู่"** — ระบบตัดสิทธิ์เห็นดีลเก่า
// ทันทีที่ย้าย แต่ permission บนไฟล์ที่เคยเปิดยังค้าง เขายังเปิดผ่านลิงก์เดิมหรือจาก
// "แชร์กับฉัน" ได้ · ส่วนตอน **ลาออก** บริษัทปิดบัญชีอีเมลอยู่แล้ว permission ที่ค้าง
// จึงเป็นบรรทัดตายที่ล็อกอินไม่ได้ — กดก็ดี ไม่กดก็ไม่ได้เปิดช่องให้ใคร
//
// ⚠️ ถอนเฉพาะสิทธิ์ที่ **ระบบเป็นคนให้** (จดไว้ใน metadata.accessGranted) — ถ้ามีคน
// ไปแชร์ให้เองใน Google หรือคนนั้นเป็นสมาชิก Shared Drive เขายังเปิดได้อยู่
export async function POST(request, { params }) {
  const actor = await getCurrentUser();
  if (!can(actor?.role, 'users:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return Response.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
  const email = data.user.email;
  if (!email) return Response.json({ error: 'บัญชีนี้ไม่มีอีเมล — ไม่มีสิทธิ์บน Drive ให้ถอน' }, { status: 400 });

  let result;
  try {
    result = await revokeGoogleDocAccess(supabase, email);
  } catch (err) {
    console.error('[users/revoke-doc-access] failed', email, err?.message);
    return Response.json({ error: 'ถอนสิทธิ์บน Google Drive ไม่สำเร็จ' }, { status: 500 });
  }

  await recordAudit({
    user: actor,
    action: 'update',
    entityType: 'user_doc_access',
    entityId: id,
    after: { email, ...result },
    request,
  });

  return Response.json({ email, ...result });
}
