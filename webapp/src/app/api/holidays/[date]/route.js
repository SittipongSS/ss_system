import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { invalidateCache } from '@/lib/serverCache';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH /api/holidays/[date] — rename a holiday. Supervisor-only.
export async function PATCH(request, { params }) {
  const { date } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await request.json();
  const { data: before } = await supabase.from('holidays').select('*').eq('date', date).maybeSingle();
  const { data, error } = await supabase
    .from('holidays')
    .update({ name: body.name ?? '' })
    .eq('date', date)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateCache('holidays');
  await recordAudit({
    user, action: 'update', entityType: 'holiday', entityId: date, before, after: data,
    summary: `แก้ชื่อวันหยุด ${date} เป็น "${data.name || '-'}"`, request,
  });
  return Response.json(data);
}

// DELETE /api/holidays/[date] — remove a holiday. Supervisor-only.
export async function DELETE(request, { params }) {
  const { date } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data: before } = await supabase.from('holidays').select('*').eq('date', date).maybeSingle();
  const { data, error } = await supabase.from('holidays').delete().eq('date', date).select('date');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบวันหยุดนี้' }, { status: 404 });
  invalidateCache('holidays');
  await recordAudit({
    user, action: 'delete', entityType: 'holiday', entityId: date, before,
    summary: `ลบวันหยุด ${date}${before?.name ? ` (${before.name})` : ''}`, request,
  });
  return Response.json({ success: true });
}
