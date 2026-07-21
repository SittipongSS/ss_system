import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { listHolidays } from '@/lib/master/holidays';
import { cachedJson, invalidateCache } from '@/lib/serverCache';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// ปฏิทินวันหยุดเหมือนกันทุกผู้ใช้และเปลี่ยนนาน ๆ ครั้ง — cache 5 นาที ลดภาระ DB
const CACHE_TTL_MS = 5 * 60 * 1000;

// GET /api/holidays — full calendar (any signed-in user; PM/UI reads it).
export async function GET() {
  try {
    const data = await cachedJson('holidays', CACHE_TTL_MS, () => listHolidays());
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/holidays — add a holiday. Supervisor-only (master:manage),
// also enforced by the proxy cap gate.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const date = (body.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('holidays')
    .insert({ date, name: body.name || '' })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return Response.json({ error: 'วันหยุดนี้มีอยู่แล้ว' }, { status: 409 });
    return Response.json({ error: error.message }, { status: 500 });
  }
  invalidateCache('holidays');
  await recordAudit({
    user, action: 'create', entityType: 'holiday', entityId: date, after: data,
    summary: `เพิ่มวันหยุด ${date}${data.name ? ` (${data.name})` : ''}`, request,
  });
  return Response.json(data, { status: 201 });
}
