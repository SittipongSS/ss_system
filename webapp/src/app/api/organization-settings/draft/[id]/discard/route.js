import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { discardOrganizationSettingsDraft, OrganizationSettingsError } from '@/lib/admin/organizationSettings';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const discarded = await discardOrganizationSettingsDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    // แถวร่างถูกลบถาวรแล้ว — audit log นี้คือหลักฐานเดียวที่เหลือของการยกเลิก
    await recordAudit({
      user,
      action: 'delete',
      entityType: 'organization_settings_version',
      entityId: id,
      before: discarded,
      after: null,
      summary: `ยกเลิกข้อมูลบริษัทฉบับร่าง Version ${discarded.versionNumber} (ลบถาวร)`,
      request,
    });
    return Response.json(discarded);
  } catch (error) {
    const status = error instanceof OrganizationSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'ยกเลิกฉบับร่างไม่สำเร็จ' }, { status });
  }
}
