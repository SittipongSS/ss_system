// ออกฉบับแก้ไข (rev.2) ของใบขอราคาผลิต — คัดลอกใบเดิมเป็นใบใหม่ (มติ 2026-07-23)
//
// ใบเดิมคงเป็นหลักฐาน (ไม่แตะ). ใบใหม่ = โครงเดิมทั้งชุด (สินค้า/บรรทัด/ชั้นจำนวน)
// แต่ล้างราคาที่อนุมัติ + สถานะกลับเป็น draft ให้เซลแก้ส่วนที่เปลี่ยนแล้วขออนุมัติใหม่
// เทียบ rev ต่อ rev ได้ว่าราคาขึ้น/ลงเท่าไร
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, isSuperuser } from '@/lib/permissions';
import { inSalesEditScope } from '@/lib/salesPlanning';
import { reviseError } from '@/lib/costing';
import { findCostingRequest } from '@/lib/costingAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;
  if (!can(user?.role, 'costing:edit')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!isSuperuser(user.role) && !inSalesEditScope(user, { team: before.team, ownerId: before.requestedById })) {
    return Response.json({ error: 'ไม่มีสิทธิ์ออกฉบับแก้ไขใบนี้' }, { status: 403 });
  }
  const blocked = reviseError(before);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  // ใบต้นฉบับ = ใบแรกของสาย (ถ้าใบนี้เองเป็น rev อยู่แล้วก็อ้างต้นเดียวกัน)
  const baseRequestId = before.baseRequestId || before.id;
  // เลข rev ถัดไป = มากสุดในสาย + 1
  const { data: siblings } = await supabase
    .from('costing_requests').select('revisionNo')
    .or(`id.eq.${baseRequestId},baseRequestId.eq.${baseRequestId}`);
  const nextRev = Math.max(1, ...((siblings || []).map((s) => Number(s.revisionNo) || 1))) + 1;

  const newId = `CR-${randomUUID()}`;
  const { error: headerError } = await supabase.from('costing_requests').insert({
    id: newId,
    status: 'draft',
    baseRequestId,
    revisionNo: nextRev,
    dealId: before.dealId,
    projectId: before.projectId,
    customerId: before.customerId,
    customerName: before.customerName,
    team: before.team,
    requestedById: user?.id ?? null,
    requestedByName: user?.name ?? null,
    moq: before.moq,
    note: before.note,
  });
  if (headerError) return Response.json({ error: headerError.message }, { status: 500 });

  // คัดลอกสินค้า + บรรทัด (พร้อมราคา snapshot ที่ดึงไว้) + ชั้นจำนวน (ล้างราคาอนุมัติ)
  for (const item of before.items || []) {
    const newItemId = `CRI-${randomUUID()}`;
    const { error: itemError } = await supabase.from('costing_request_items').insert({
      id: newItemId,
      requestId: newId,
      sortOrder: item.sortOrder,
      productId: item.productId,
      categoryCode: item.categoryCode,
      templateId: item.templateId,
      productLabel: item.productLabel,
      fragranceName: item.fragranceName,
      formulaName: item.formulaName,
      formulaCode: item.formulaCode,
      formulaDate: item.formulaDate,
      // approvalStatus เริ่ม pending เอง (default) — ไม่คัดลอกการอนุมัติเดิม
    });
    if (itemError) return Response.json({ error: itemError.message }, { status: 500 });

    if ((item.components || []).length) {
      const { error: compError } = await supabase.from('costing_item_components').insert(
        item.components.map((c) => ({
          id: `CRC-${randomUUID()}`,
          itemId: newItemId,
          sortOrder: c.sortOrder,
          kind: c.kind,
          label: c.label,
          unitBasis: c.unitBasis,
          gramsPerUnit: c.gramsPerUnit,
          sourceDept: c.sourceDept,
          // คงราคา snapshot ที่ดึงจากคลังไว้ (เซลจะได้ไม่ต้องดึงใหม่ทั้งชุด)
          pricePerKg: c.pricePerKg,
          pricePerUnit: c.pricePerUnit,
          priceStatus: c.priceStatus,
          priceSource: c.priceSource,
          materialId: c.materialId,
          materialRevisionId: c.materialRevisionId,
          required: c.required,
        })),
      );
      if (compError) return Response.json({ error: compError.message }, { status: 500 });
    }

    if ((item.tiers || []).length) {
      const { error: tierError } = await supabase.from('costing_item_tiers').insert(
        item.tiers.map((t) => ({
          id: `CRT-${randomUUID()}`,
          itemId: newItemId,
          qty: t.qty,
          approvedUnitPrice: null, // ราคาอนุมัติเดิมไม่ยกมา — ผู้บริหารเคาะใหม่
        })),
      );
      if (tierError) return Response.json({ error: tierError.message }, { status: 500 });
    }
  }

  const created = await findCostingRequest(supabase, newId);
  await recordAudit({
    user, action: 'create', entityType: 'costing_request', entityId: newId, after: created,
    summary: `ออกฉบับแก้ไข (rev.${nextRev}) ของใบ ${before.docNo || id}`, request,
  });
  return Response.json(created, { status: 201 });
}
