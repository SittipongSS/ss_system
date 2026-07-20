import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageCommercialPresets } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { normalizeCommercialPresetInput } from '@/lib/commercialPresets';
import { createCommercialPreset, loadCommercialPresetsAdmin, CommercialPresetError } from '@/lib/admin/commercialPresets';

export const dynamic = 'force-dynamic';

const denied = (user) => !user
  ? Response.json({ error: 'unauthorized' }, { status: 401 })
  : !canManageCommercialPresets(user.role)
    ? Response.json({ error: 'forbidden' }, { status: 403 })
    : null;

export async function GET() {
  const user = await getCurrentUser();
  const rejection = denied(user);
  if (rejection) return rejection;
  try {
    return Response.json({ presets: await loadCommercialPresetsAdmin(getSupabaseAdmin()) });
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'โหลด Commercial Preset ไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
export async function POST(request) {
  const user = await getCurrentUser();
  const rejection = denied(user);
  if (rejection) return rejection;
  try {
    const body = await request.json();
    const normalized = normalizeCommercialPresetInput(body, { includeScope: true });
    if (normalized.errors.length) return Response.json({ error: normalized.errors[0], errors: normalized.errors }, { status: 400 });
    const result = await createCommercialPreset(getSupabaseAdmin(), normalized.value, user);
    await recordAudit({
      user, action: 'create', entityType: 'commercial_preset_version', entityId: result.draft.id,
      after: result, summary: `สร้าง Commercial Preset “${result.draft.title}” Version 1 ฉบับร่าง`, request,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'สร้าง Commercial Preset ไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
