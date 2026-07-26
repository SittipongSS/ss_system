// เซลดึงราคาวัสดุจากทะเบียน (mig 0157–0159) เข้าบรรทัดในใบขอราคาผลิต (costing:edit)
//
// ราคาที่ดึงเป็น snapshot บนบรรทัด: ทะเบียนออก rev ใหม่ทีหลังไม่กระทบใบที่ดึงไปแล้ว
// (มติ 2) — ปุ่มนี้จึง **ไม่ทับ** บรรทัดที่มีราคาสดอยู่แล้ว ยกเว้นสองกรณี:
//   1) ราคาที่ตรึงไว้เกินอายุแล้ว (rev ที่บรรทัดชี้อยู่หมดอายุ) → ต่อให้เป็นราคาล่าสุด
//   2) เซลเจาะจงบรรทัดมาเอง (componentIds) → ยอมรับว่าตั้งใจดึงทับ
//
// บรรทัดที่ยังไม่ผูกวัสดุ/วัสดุยังเป็นร่าง/ไม่มีราคา → ข้าม แล้วรายงานจำนวนกลับไป
// ให้หน้าจอบอกผู้ใช้ตรง ๆ ว่าเหลืออะไรต้องทำ (ของเดิมเงียบ ไม่มีใครรู้ว่าทำไมไม่ขยับ)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditCostingRequest } from '@/lib/costing';
import {
  componentFillFromRevision, componentLibraryStatus,
  componentSnapshotExpired, componentSnapshotPrice,
} from '@/lib/costingLibrary';
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

  // status: null = ทุกสถานะ — วัสดุร่างต้องโหลดมาด้วย ไม่งั้นจะรายงานว่า "ไม่พบวัสดุ"
  // ทั้งที่ของจริงคือ "ยังเป็นร่าง รอ RD/PC รับ" ซึ่งคนละเรื่องกันสำหรับผู้ใช้
  const materials = await loadMaterials(supabase, { status: null });
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  // จำกัดเฉพาะบรรทัดที่ระบุ ถ้าส่ง componentIds มา (ไม่งั้นดึงทุกบรรทัดที่ดึงได้)
  const body = await request.json().catch(() => ({}));
  const target = Array.isArray(body.componentIds) ? new Set(body.componentIds) : null;

  let filled = 0;      // บรรทัดที่เพิ่งได้ราคา
  let refreshed = 0;   // บรรทัดที่ราคาเดิมเกินอายุแล้วต่ออายุให้
  let missing = 0;     // ยังไม่ผูกวัสดุ / วัสดุร่าง / ทะเบียนยังไม่มีราคา
  let expired = 0;     // ผูกแล้วแต่ราคาล่าสุดในทะเบียนก็เกินอายุ — ต้องเปิดเคสขอราคา
  let tierBelow = 0;   // ชั้นที่เลือกไว้ต่ำกว่าชั้นต่ำสุดที่รุ่นนี้มี (ราคาต่ำกว่าจริง)

  for (const item of before.items || []) {
    for (const component of item.components || []) {
      if (!component.sourceDept) continue;
      if (target && !target.has(component.id)) continue;

      const hasFreshSnapshot = componentSnapshotPrice(component) != null
        && !componentSnapshotExpired(component, materials, todayIso);
      if (hasFreshSnapshot && !target) continue;

      const state = componentLibraryStatus(component, materials, { todayIso });
      if (state.status === 'expired') { expired += 1; continue; }
      if (state.status !== 'ready') {
        if (state.status !== 'internal') missing += 1;
        continue;
      }

      const fill = componentFillFromRevision(state.revision, { tierQty: component.priceTierQty });
      if (!fill) { missing += 1; continue; }
      // ตัวเลขเดิมกับตัวเลขใหม่เป็นรุ่นเดียวกัน = ไม่มีอะไรเปลี่ยน ไม่ต้องนับ
      if (component.materialRevisionId === fill.materialRevisionId && hasFreshSnapshot) continue;

      const { error } = await supabase.from('costing_item_components').update({
        ...fill,
        quotedById: user?.id ?? null,
        quotedByName: user?.name ?? null,
        quotedAt: nowIso,
        updatedAt: nowIso,
      }).eq('id', component.id);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      if (componentSnapshotPrice(component) != null) refreshed += 1;
      else filled += 1;
      if (state.tierBelow) tierBelow += 1;
    }
  }

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ดึงราคาวัสดุจากทะเบียนเข้าใบ ${after.docNo || id}`
      + ` — เติม ${filled} บรรทัด`
      + (refreshed ? ` · ต่ออายุ ${refreshed}` : '')
      + (expired ? ` · เกินอายุ ${expired}` : '')
      + (missing ? ` · ยังไม่มีราคา ${missing}` : ''),
    request,
  });
  return Response.json({
    ...after, _filled: filled, _refreshed: refreshed, _missing: missing,
    _expired: expired, _tierBelow: tierBelow,
  });
}
