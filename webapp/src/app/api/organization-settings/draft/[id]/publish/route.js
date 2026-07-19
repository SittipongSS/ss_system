import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { publishOrganizationSettingsDraft, OrganizationSettingsError } from '@/lib/admin/organizationSettings';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await publishOrganizationSettingsDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    await recordAudit({
      user,
      action: 'publish',
      entityType: 'organization_settings_version',
      entityId: id,
      before: result.archived,
      after: result.published,
      summary: `เผยแพร่ข้อมูลบริษัท Version ${result.published.versionNumber}`,
      request,
    });
    return Response.json(result);
  } catch (error) {
    const status = error instanceof OrganizationSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'เผยแพร่ข้อมูลบริษัทไม่สำเร็จ' }, { status });
  }
}
