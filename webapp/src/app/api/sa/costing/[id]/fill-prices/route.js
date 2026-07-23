// เซลดึงราคาวัสดุจากคลัง (mig 0143) เข้าบรรทัดในใบขอราคาผลิต (costing:edit)
//
// ราคาที่ดึงเป็น snapshot บนบรรทัด (ราคาคลังเปลี่ยนทีหลังไม่กระทบใบนี้).
// บรรทัดที่คลังไม่มี → ข้าม (เซลต้องไปเปิดใบขอราคาวัสดุก่อน).
// บรรทัดที่ราคาเกินอายุ → ดึงได้แต่ติดธง confirmStatus='pending' รอ RD/PC ยืนยัน
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditCostingRequest } from '@/lib/costing';
import { componentFillFromRevision, componentLibraryStatus } from '@/lib/costingLibrary';
import { findCostingRequest } from '@/lib/costingAdmin';
import { loadMaterials } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canEditCostingRequest(user, before)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้ใบนี้ หรือใบจบแล้ว' }, { status: 403 });
  }

  const materials = await loadMaterials(supabase);
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const customerId = before.customerId || null;

  // จำกัดเฉพาะบรรทัดที่ระบุ ถ้าส่ง componentIds มา (ไม่งั้นดึงทุกบรรทัดที่ดึงได้)
  const body = await request.json().catch(() => ({}));
  const target = Array.isArray(body.componentIds) ? new Set(body.componentIds) : null;

  let filled = 0;
  let flaggedExpired = 0;
  for (const item of before.items || []) {
    for (const component of item.components || []) {
      if (target && !target.has(component.id)) continue;
      // เติมเฉพาะบรรทัดที่ยังไม่มีราคา (ไม่ทับราคาที่ยืนยันแล้ว/กรอกมือ)
      if (component.priceStatus === 'quoted') continue;
      const { status, match } = componentLibraryStatus(component, materials, { customerId, todayIso });
      if (status !== 'ready' && status !== 'expired') continue;

      const expired = status === 'expired';
      const fill = componentFillFromRevision(match.revision);
      if (!fill) continue;
      const patch = {
        ...fill,
        confirmStatus: expired ? 'pending' : null,
        confirmRequestedAt: expired ? nowIso : null,
        confirmRequestedById: expired ? (user?.id ?? null) : null,
        quotedById: user?.id ?? null,
        quotedByName: user?.name ?? null,
        quotedAt: nowIso,
        updatedAt: nowIso,
      };
      const { error } = await supabase.from('costing_item_components').update(patch).eq('id', component.id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      filled += 1;
      if (expired) flaggedExpired += 1;
    }
  }

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ดึงราคาวัสดุจากคลัง ${filled} บรรทัดในใบ ${after.docNo || id}`
      + (flaggedExpired ? ` (${flaggedExpired} บรรทัดเกินอายุ รอยืนยัน)` : ''),
    request,
  });
  return Response.json({ ...after, _filled: filled, _flaggedExpired: flaggedExpired });
}
