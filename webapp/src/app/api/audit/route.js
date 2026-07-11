import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/audit — อ่าน audit log (supervisor/admin only, cap audit:view).
// proxy บล็อก non-admin อยู่แล้ว แต่ guard ซ้ำที่ handler เป็น defense-in-depth.
//
// query params (ทุกตัว optional):
//   months     = '3' | '6' | '12' | 'all'   (default '6') — กรองตาม createdAt
//   entityType = 'customer' | 'product' | 'order' | ...
//   action     = 'create' | 'update' | 'delete'
//   actor      = actorId (กรองตามคนทำ)
//   q          = ค้นในข้อความ summary / entityId
//   limit      = จำนวนแถวสูงสุด (default 500, เพดาน 2000)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canUser(user, 'audit:view')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const months = sp.get('months') || '6';
  const entityType = sp.get('entityType') || '';
  const action = sp.get('action') || '';
  const actor = sp.get('actor') || '';
  const q = (sp.get('q') || '').trim();
  const limit = Math.min(parseInt(sp.get('limit') || '500', 10) || 500, 2000);

  const supabase = getSupabaseAdmin();
  let query = supabase.from('audit_logs').select('*').order('createdAt', { ascending: false }).limit(limit);

  // ตัวกรองเวลา = filter การแสดงผล (ไม่ลบ log จริง). 'all' = ไม่จำกัด.
  if (months !== 'all') {
    const n = parseInt(months, 10);
    if (Number.isFinite(n) && n > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - n);
      query = query.gte('createdAt', cutoff.toISOString());
    }
  }
  if (entityType) query = query.eq('entityType', entityType);
  if (action) query = query.eq('action', action);
  if (actor) query = query.eq('actorId', actor);
  if (q) query = query.or(`summary.ilike.%${q}%,entityId.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ rows: data || [], limit });
}
