import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageCommercialPresets } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { discardCommercialPresetDraft, CommercialPresetError } from '@/lib/admin/commercialPresets';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageCommercialPresets(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { discarded, presetDeleted } = await discardCommercialPresetDraft(getSupabaseAdmin(), id, body.expectedUpdatedAt, user);
    // แถวร่างถูกลบถาวรแล้ว (preset ใหม่ที่ไม่เคยเผยแพร่ถูกลบทั้งตัว) — audit log นี้คือหลักฐานเดียวที่เหลือ
    await recordAudit({
      user, action: 'delete', entityType: 'commercial_preset_version', entityId: id,
      before: discarded, after: null,
      summary: presetDeleted
        ? `ยกเลิก Commercial Preset “${discarded.title}” ฉบับร่าง Version ${discarded.versionNumber} (ลบ preset ที่ไม่เคยเผยแพร่ทั้งตัว)`
        : `ยกเลิก Commercial Preset “${discarded.title}” ฉบับร่าง Version ${discarded.versionNumber} (ลบถาวร)`,
      request,
    });
    return Response.json({ ...discarded, presetDeleted });
  } catch (error) {
    return Response.json({ error: error instanceof CommercialPresetError ? error.message : 'ยกเลิกฉบับร่างไม่สำเร็จ' }, { status: error instanceof CommercialPresetError ? error.status : 500 });
  }
}
