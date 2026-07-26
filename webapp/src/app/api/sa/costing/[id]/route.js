// ── API ใบขอราคาผลิตรายใบ — อ่าน + แก้ (mig 0141) ─────────────────────
// PATCH รับ payload รูปเดียวกับตอนสร้าง (ฟอร์มเป็น component เดียวกัน) แล้ว
// server เทียบเองว่าอะไรเพิ่ม/แก้/ลบ — ดู lib/costingReconcile.js
// การตอบราคา (RD/PC) และการอนุมัติ (ผู้บริหาร) อยู่คนละ endpoint ใน PR4
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { loadCostTemplates } from '@/lib/master/costTemplateAdmin';
import { canEditCostingRequest, canViewCostingRequest } from '@/lib/costing';
import {
  componentRowsFromTemplate, findCostingRequest, loadPendingAskLinks, tierRowsFor,
} from '@/lib/costingAdmin';
import {
  blockingChangeError, blockingTierError, normalizeCostingItems, normalizeTierQuantities,
  planItemChanges, planTierChanges,
} from '@/lib/costingReconcile';
import { canForceDelete, isForceRequest } from '@/lib/forceDelete';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// DELETE — ปกติลบได้เฉพาะร่างที่ยังไม่ส่ง (guard 0141). ?force=1 (admin, mig 0147):
// break-glass ลบได้ทุกสถานะผ่าน RPC ข้าม guard (ลูก cascade เอง). ทำลายหลักฐาน
export async function DELETE(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;
  if (!can(user?.role, 'costing:edit')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });

  if (isForceRequest(request)) {
    if (!canForceDelete(user)) {
      return Response.json({ error: 'ลบใบที่ส่งแล้วต้องเป็นผู้ดูแลระบบ (admin)' }, { status: 403 });
    }
    const { error } = await supabase.rpc('force_delete_costing_request', { p_id: id });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await recordAudit({
      user, action: 'delete', entityType: 'costing_request', entityId: id, before,
      summary: `[admin force] ลบใบขอราคาผลิต ${before.docNo || id} (สถานะ ${before.status})`, request,
    });
    return Response.json({ ok: true });
  }

  // เส้นปกติ: ร่างที่ยังไม่ส่งเท่านั้น (เจ้าของใบ)
  if (!canEditCostingRequest(user, before)) {
    return Response.json({ error: 'ไม่มีสิทธิ์ลบใบนี้' }, { status: 403 });
  }
  // เกณฑ์คือ "ยังไม่เคยส่งออกจากมือฝ่ายขาย" ไม่ใช่ป้ายสถานะ — ใบร่างที่เพียงแค่
  // เปิดเคสถามราคาจะขยับเป็น pricing/assembling เอง แต่ยังไม่ใช่หลักฐานของใคร
  // (guard ระดับ DB ผ่อนตามใน mig 0159 ให้ตรงกัน)
  if (before.submittedAt || !['draft', 'pricing', 'assembling'].includes(before.status)) {
    return Response.json({ error: 'ลบได้เฉพาะใบร่างที่ยังไม่ส่ง — ใบที่ส่งแล้วใช้ยกเลิกแทน' }, { status: 409 });
  }
  const { error } = await supabase.from('costing_requests').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await recordAudit({
    user, action: 'delete', entityType: 'costing_request', entityId: id, before,
    summary: `ลบใบขอราคาผลิตร่าง (${(before.items || []).length} รายการ)`, request,
  });
  return Response.json({ ok: true });
}

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const found = await findCostingRequest(supabase, id);
    if (!found) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
    if (!canViewCostingRequest(user, found)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    // เคสขอราคาที่เปิดค้างจากใบนี้ — หน้าจอใช้ขึ้นป้าย "รอ RD/PC ตอบ" รายบรรทัด
    // (เก็บเป็น _openAsks ไม่ยัดเข้า components เพราะมันเป็นข้อมูลของอีกโมดูล)
    return Response.json(
      { ...found, _openAsks: await loadPendingAskLinks(supabase, id) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canEditCostingRequest(user, before)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้ไขใบนี้ หรือใบจบขั้นตอนแล้ว' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const nowIso = new Date().toISOString();

  // ── ยกเลิกใบ (เช่น ดีลหลุด) — แยกเป็น action ชัด ๆ ไม่ให้หลุดไปกับการบันทึก ──
  if (body.action === 'cancel') {
    const reason = String(body.cancelReason || '').trim();
    if (!reason) return Response.json({ error: 'ต้องระบุเหตุผลที่ยกเลิก' }, { status: 400 });
    const { error } = await supabase.from('costing_requests').update({
      status: 'cancelled', cancelReason: reason.slice(0, 500),
      cancelledAt: nowIso, updatedAt: nowIso,
    }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const after = await findCostingRequest(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
      summary: `ยกเลิกใบขอราคา ${before.docNo || id}: ${reason}`, request,
    });
    return Response.json(after);
  }

  // ── บันทึกเนื้อหาใบ ──
  const moq = body.moq == null || body.moq === '' ? Number(before.moq) : Number(body.moq);
  if (!Number.isFinite(moq) || moq <= 0) {
    return Response.json({ error: 'MOQ ต้องเป็นตัวเลขมากกว่า 0' }, { status: 400 });
  }

  const { items: payloadItems, error: itemFormatError } = normalizeCostingItems(body.items);
  if (itemFormatError) return Response.json({ error: itemFormatError }, { status: 400 });

  const { quantities, error: tierFormatError } = normalizeTierQuantities(body.tierQuantities);
  if (tierFormatError) return Response.json({ error: tierFormatError }, { status: 400 });

  const plan = planItemChanges(before.items || [], payloadItems);

  // กันงานของฝ่ายอื่นหาย ก่อนเขียนอะไรทั้งนั้น
  const blocked = blockingChangeError(plan);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  // ประเภทสินค้าของแถวใหม่/แถวที่เปลี่ยนประเภท ต้องมีแม่แบบที่ใช้งานอยู่
  const templates = await loadCostTemplates(supabase, { includeHidden: false });
  const templateFor = (categoryCode) => templates.find((t) => t.categoryCode === categoryCode) || null;

  const needsExpand = [
    ...plan.created.map((c) => ({ ...c, itemId: null })),
    ...plan.updated.filter((u) => u.categoryChanged).map((u) => ({ ...u, itemId: u.current.id })),
  ];
  for (const entry of needsExpand) {
    const categoryCode = entry.raw.categoryCode;
    const categoryError = await activeProductTypeError(categoryCode);
    if (categoryError) return Response.json({ error: categoryError }, { status: 400 });
    if (!templateFor(categoryCode)) {
      return Response.json({
        error: `ประเภทสินค้า ${categoryCode} ยังไม่มีแม่แบบต้นทุน — ให้ผู้ดูแลระบบสร้างที่หน้าตั้งค่าก่อน`,
      }, { status: 400 });
    }
  }

  // ── เขียน ──
  if (plan.removed.length) {
    const { error } = await supabase.from('costing_request_items')
      .delete().in('id', plan.removed.map((i) => i.id));
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  for (const { current, raw, sortOrder, categoryChanged } of plan.updated) {
    const patch = {
      sortOrder,
      productLabel: raw.productLabel,
      fragranceName: raw.fragranceName,
      productId: raw.productId,
      updatedAt: nowIso,
    };
    if (categoryChanged) {
      patch.categoryCode = raw.categoryCode;
      patch.templateId = templateFor(raw.categoryCode).id;
    }
    const { error } = await supabase.from('costing_request_items').update(patch).eq('id', current.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (categoryChanged) {
      // กางบรรทัดใหม่ทั้งชุด (ตรวจแล้วว่าไม่มีราคาที่ตอบไว้จะหาย)
      await supabase.from('costing_item_components').delete().eq('itemId', current.id);
      const { error: compError } = await supabase.from('costing_item_components')
        .insert(componentRowsFromTemplate(current.id, templateFor(raw.categoryCode).lines));
      if (compError) return Response.json({ error: compError.message }, { status: 500 });
    }
  }

  for (const { raw, sortOrder } of plan.created) {
    const itemId = `CRI-${randomUUID()}`;
    const template = templateFor(raw.categoryCode);
    const { error } = await supabase.from('costing_request_items').insert({
      id: itemId,
      requestId: id,
      sortOrder,
      productId: raw.productId,
      categoryCode: raw.categoryCode,
      templateId: template.id,
      productLabel: raw.productLabel,
      fragranceName: raw.fragranceName,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const { error: compError } = await supabase.from('costing_item_components')
      .insert(componentRowsFromTemplate(itemId, template.lines));
    if (compError) return Response.json({ error: compError.message }, { status: 500 });

    const { error: tierError } = await supabase.from('costing_item_tiers')
      .insert(tierRowsFor(itemId, [...quantities, moq]));
    if (tierError) return Response.json({ error: tierError.message }, { status: 500 });
  }

  // ชั้นจำนวนของรายการเดิม — ปรับให้ตรงกับที่กรอกใหม่ (ชั้นที่อนุมัติแล้วลบไม่ได้)
  for (const { current } of plan.updated) {
    const tierPlan = planTierChanges(current.tiers || [], quantities, moq);
    const tierBlocked = blockingTierError(current.productLabel, tierPlan.toRemove);
    if (tierBlocked) return Response.json({ error: tierBlocked }, { status: 409 });

    if (tierPlan.toRemove.length) {
      const { error } = await supabase.from('costing_item_tiers')
        .delete().in('id', tierPlan.toRemove.map((t) => t.id));
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
    if (tierPlan.toAdd.length) {
      const { error } = await supabase.from('costing_item_tiers')
        .insert(tierRowsFor(current.id, tierPlan.toAdd));
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  const { error: headerError } = await supabase.from('costing_requests').update({
    moq,
    note: body.note ? String(body.note).trim().slice(0, 2000) : null,
    updatedAt: nowIso,
  }).eq('id', id);
  if (headerError) return Response.json({ error: headerError.message }, { status: 500 });

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `แก้ไขใบขอราคา ${before.docNo || id} (${after.items.length} รายการ)`, request,
  });
  return Response.json(after);
}
