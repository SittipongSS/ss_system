import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageCommercialPresets } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { archiveCommercialPresetDraft, CommercialPresetError } from '@/lib/admin/commercialPresets';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageCommercialPresets(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const archived = await archiveCommercialPresetDraft(getSupabaseAdmin(), id, body.expectedUpdatedAt, user);
    await recordAudit({ user, action: 'archive', entityType: 'commercial_preset_version', entityId: id, before: { ...archived, status: 'draft', archivedAt: null }, after: archived, summary: `เก็บ Commercial Preset “${archived.title}” Version ${archived.versionNumber} เป็นประวัติ`, request });
    return Response.json(archived);
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'เก็บฉบับร่างไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
