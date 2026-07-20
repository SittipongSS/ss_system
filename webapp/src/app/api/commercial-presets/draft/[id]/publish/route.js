import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageCommercialPresets } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { publishCommercialPresetDraft, CommercialPresetError } from '@/lib/admin/commercialPresets';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageCommercialPresets(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await publishCommercialPresetDraft(getSupabaseAdmin(), id, body.expectedUpdatedAt, user);
    await recordAudit({ user, action: 'publish', entityType: 'commercial_preset_version', entityId: id, before: result.archived, after: result.published, summary: `เผยแพร่ Commercial Preset “${result.published.title}” Version ${result.published.versionNumber}`, request });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'เผยแพร่ Commercial Preset ไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
