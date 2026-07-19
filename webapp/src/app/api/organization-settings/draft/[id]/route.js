import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { normalizeOrganizationSettingsInput } from '@/lib/organizationSettings';
import { updateOrganizationSettingsDraft, OrganizationSettingsError } from '@/lib/admin/organizationSettings';

export async function PATCH(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { value, errors } = normalizeOrganizationSettingsInput(body);
    if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });

    const result = await updateOrganizationSettingsDraft(
      getSupabaseAdmin(),
      id,
      value,
      body.expectedUpdatedAt,
      user,
    );
    await recordAudit({
      user,
      action: 'update',
      entityType: 'organization_settings_version',
      entityId: id,
      before: result.before,
      after: result.after,
      summary: `บันทึกข้อมูลบริษัทฉบับร่าง Version ${result.after.versionNumber}`,
      request,
    });
    return Response.json(result.after);
  } catch (error) {
    const status = error instanceof OrganizationSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'บันทึกฉบับร่างไม่สำเร็จ' }, { status });
  }
}
