import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageCommercialPresets } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { normalizeCommercialPresetInput } from '@/lib/commercialPresets';
import { updateCommercialPresetDraft, CommercialPresetError } from '@/lib/admin/commercialPresets';

export async function PATCH(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageCommercialPresets(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const normalized = normalizeCommercialPresetInput(body);
    if (normalized.errors.length) return Response.json({ error: normalized.errors[0], errors: normalized.errors }, { status: 400 });
    const result = await updateCommercialPresetDraft(getSupabaseAdmin(), id, normalized.value, body.expectedUpdatedAt, user);
    await recordAudit({ user, action: 'update', entityType: 'commercial_preset_version', entityId: id, before: result.before, after: result.after, summary: `บันทึก Commercial Preset “${result.after.title}” Version ${result.after.versionNumber}`, request });
    return Response.json(result.after);
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'บันทึกฉบับร่างไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
