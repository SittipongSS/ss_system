// ── ใครบ้างที่ @ ได้ในเธรดนี้ ────────────────────────────────────────────
// GET /api/updates/mentionable?entityType=&entityId=
//
// 🔴 รายชื่อนี้ **กรองด้วยด่านของ entity นั้นแล้ว** — กล่องพิมพ์จึงเสนอเฉพาะคนที่
// เปิดเธรดได้จริง · ด่านซ้ำอีกชั้นตอนโพสต์ (POST /api/updates) เพราะรายชื่อฝั่ง
// client เชื่อไม่ได้
//
// ⚠️ ผู้เรียกต้องเปิดเธรดนี้ได้ก่อน — ไม่งั้นจะกลายเป็นช่องส่องรายชื่อผู้ใช้ทั้งระบบ
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewUpdates, isUpdateEntity, loadUpdateParent } from '@/lib/master/updateAccess';
import { mentionableUsers } from '@/lib/master/mentions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType') || '';
  const entityId = searchParams.get('entityId') || '';
  if (!isUpdateEntity(entityType) || !entityId) {
    return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const parent = await loadUpdateParent(supabase, entityType, entityId);
    if (!parent || !(await canViewUpdates(supabase, entityType, parent, user))) {
      return Response.json({ error: 'ไม่พบรายการนี้' }, { status: 404 });
    }
    return Response.json({ users: await mentionableUsers(supabase, entityType, parent) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
