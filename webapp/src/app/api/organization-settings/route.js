import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { loadOrganizationSettingsAdmin, OrganizationSettingsError } from '@/lib/admin/organizationSettings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    return Response.json(await loadOrganizationSettingsAdmin(getSupabaseAdmin()));
  } catch (error) {
    const status = error instanceof OrganizationSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'โหลดข้อมูลบริษัทไม่สำเร็จ' }, { status });
  }
}
