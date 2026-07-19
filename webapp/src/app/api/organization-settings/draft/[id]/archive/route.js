import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { archiveOrganizationSettingsDraft, OrganizationSettingsError } from '@/lib/admin/organizationSettings';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const archived = await archiveOrganizationSettingsDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    await recordAudit({
      user,
      action: 'archive',
      entityType: 'organization_settings_version',
      entityId: id,
      before: { ...archived, status: 'draft', archivedAt: null },
      after: archived,
      summary: `เก็บข้อมูลบริษัทฉบับร่าง Version ${archived.versionNumber}`,
      request,
    });
    return Response.json(archived);
  } catch (error) {
    const status = error instanceof OrganizationSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'เก็บฉบับร่างไม่สำเร็จ' }, { status });
  }
}
