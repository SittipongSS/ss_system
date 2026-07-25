import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageCommercialPresets } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { COMMERCIAL_PRESET_KINDS, normalizeCommercialPresetInput, normalizeCommercialPresetKind } from '@/lib/commercialPresets';
import { createCommercialPreset, loadCommercialPresetsAdmin, CommercialPresetError } from '@/lib/admin/commercialPresets';

export const dynamic = 'force-dynamic';

const denied = (user) => !user
  ? Response.json({ error: 'unauthorized' }, { status: 401 })
  : !canManageCommercialPresets(user.role)
    ? Response.json({ error: 'forbidden' }, { status: 403 })
    : null;

// ?kind=payment|remarks — ไม่ระบุ = คืนทั้งสองคลัง (หน้าตั้งค่าโหลดครั้งเดียวแล้วสลับแท็บ)
export async function GET(request) {
  const user = await getCurrentUser();
  const rejection = denied(user);
  if (rejection) return rejection;
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind && !COMMERCIAL_PRESET_KINDS.includes(kind)) {
    return Response.json({ error: 'ชนิดคลังไม่ถูกต้อง' }, { status: 400 });
  }
  try {
    return Response.json({ presets: await loadCommercialPresetsAdmin(getSupabaseAdmin(), kind) });
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'โหลดชุดเงื่อนไขการค้าไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
export async function POST(request) {
  const user = await getCurrentUser();
  const rejection = denied(user);
  if (rejection) return rejection;
  try {
    const body = await request.json();
    const identity = normalizeCommercialPresetKind(body);
    if (identity.errors.length) return Response.json({ error: identity.errors[0], errors: identity.errors }, { status: 400 });
    const normalized = normalizeCommercialPresetInput(body, { kind: identity.value.kind });
    if (normalized.errors.length) return Response.json({ error: normalized.errors[0], errors: normalized.errors }, { status: 400 });
    const result = await createCommercialPreset(getSupabaseAdmin(), { ...identity.value, ...normalized.value }, user);
    await recordAudit({
      user, action: 'create', entityType: 'commercial_preset_version', entityId: result.draft.id,
      after: result, summary: `สร้างชุดเงื่อนไขการค้า“${result.draft.title}” Version 1 ฉบับร่าง`, request,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'สร้างชุดเงื่อนไขการค้าไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
