// รายการชุดเงื่อนไขการค้าที่ "เผยแพร่แล้ว" สำหรับ dropdown บนฟอร์มใบเสนอราคา.
// ต่างจาก GET /api/commercial-presets (จัดการคลัง, gate canManageCommercialPresets):
// อันนี้ให้ผู้จัดทำใบ (salesplan:edit) อ่านได้เพื่อ "เลือกใช้" — ไม่เห็นร่าง ไม่เห็นประวัติ
// และไม่มีเส้นทางเขียนกลับคลังจากฝั่งเอกสาร (มติ 2026-07-25: จัดการชุดที่หน้าตั้งค่าเท่านั้น)
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { COMMERCIAL_PRESET_KINDS } from '@/lib/commercialPresets';
import { loadPublishedCommercialPresetOptions, CommercialPresetError } from '@/lib/admin/commercialPresets';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const kind = new URL(request.url).searchParams.get('kind');
  if (!COMMERCIAL_PRESET_KINDS.includes(kind)) {
    return Response.json({ error: 'ชนิดคลังไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const options = await loadPublishedCommercialPresetOptions(getSupabaseAdmin(), kind);
    return Response.json({ options });
  } catch (error) {
    const known = error instanceof CommercialPresetError;
    return Response.json(
      { error: known ? error.message : 'โหลดรายการชุดเงื่อนไขการค้าไม่สำเร็จ' },
      { status: known ? error.status : 500 },
    );
  }
}
