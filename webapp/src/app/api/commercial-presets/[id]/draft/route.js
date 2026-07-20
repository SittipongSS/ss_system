import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageCommercialPresets } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { createCommercialPresetDraft, CommercialPresetError } from '@/lib/admin/commercialPresets';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageCommercialPresets(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const draft = await createCommercialPresetDraft(getSupabaseAdmin(), id, user);
    await recordAudit({ user, action: 'create', entityType: 'commercial_preset_version', entityId: draft.id, after: draft, summary: `สร้าง Commercial Preset “${draft.title}” Version ${draft.versionNumber} ฉบับร่าง`, request });
    return Response.json(draft, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'สร้างฉบับร่างไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
