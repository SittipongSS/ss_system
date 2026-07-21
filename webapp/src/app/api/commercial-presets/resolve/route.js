// จุดเชื่อม Commercial Preset → ฟอร์มสร้างใบเสนอราคา (Phase 7C).
// ต่างจาก GET /api/commercial-presets (จัดการ preset, gate canManageCommercialPresets):
// อันนี้ให้ผู้จัดทำใบ (salesplan:edit) ขอ "ค่าตั้งต้น" ของ preset ที่ match scope เดียว
// เท่านั้น — คืนเฉพาะเวอร์ชันเผยแพร่ ไม่เปิดรายการ preset ทั้งหมด.
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { commercialPresetToQuotationDefaults, COMMERCIAL_DOCUMENT_KEYS } from '@/lib/commercialPresets';
import { resolvePublishedCommercialPreset, CommercialPresetError } from '@/lib/admin/commercialPresets';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const documentKey = searchParams.get('documentKey') || 'quotation';
  if (!COMMERCIAL_DOCUMENT_KEYS.includes(documentKey)) {
    return Response.json({ error: 'ชนิดเอกสารไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const resolved = await resolvePublishedCommercialPreset(getSupabaseAdmin(), {
      documentKey,
      teamKey: searchParams.get('team'),
      dealType: searchParams.get('dealType'),
      serviceType: searchParams.get('serviceType'),
    });
    return Response.json({ defaults: commercialPresetToQuotationDefaults(resolved) });
  } catch (error) {
    const known = error instanceof CommercialPresetError;
    return Response.json(
      { error: known ? error.message : 'โหลดค่าตั้งต้นพรีเซ็ตไม่สำเร็จ' },
      { status: known ? error.status : 500 },
    );
  }
}
