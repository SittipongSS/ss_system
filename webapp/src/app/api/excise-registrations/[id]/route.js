import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields } from '@/lib/permissions';
import { purgeAttachments } from '@/lib/master/attachments';
import { registrationDeleteBlock } from '@/lib/deletion';
import { registrationRequirements } from '@/lib/tax/requirements';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/excise-registrations/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  if (!canViewRecord(user, 'registrations', data)) {
    return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  }
  return Response.json(data);
}

// PATCH /api/excise-registrations/[id] — LG approves/rejects; SA resubmits.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: reg, error: findErr } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!reg) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });

  if (!canEditRecord(user, 'registrations', reg)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Re-approval rule (ทุกระบบ, stricter): an APPROVED registration is LOCKED.
  // The only permitted change is the explicit "ขอแก้ไข" (revise): SA reverts it
  // to 'draft', clearing the approval, which re-enters draft → submit → approve.
  if (reg.status === 'approved') {
    if (body.status === 'draft' && can(user?.role, 'products:edit')) {
      const { data, error } = await supabase
        .from('excise_registrations')
        .update({
          status: 'draft',
          approvalNumber: null,
          approvedBy: null,
          approvedByName: null,
          approvedAt: null,
          rejectionReason: null,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      await recordAudit({
        user, action: 'update', entityType: 'registration', entityId: id, before: reg, after: data,
        summary: `ขอแก้ไขทะเบียน ${reg.fgCode || id} (อนุมัติแล้ว → ร่าง)`, request,
      });
      return Response.json(data);
    }
    return Response.json({ error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก กรุณากดขอแก้ไขก่อน' }, { status: 403 });
  }

  // SA owns the link fields; LG owns the approval/tax fields (allowedEditFields).
  const salesEditable = ['assignee', 'metadata', 'productId', 'customerId'];
  const allowed = allowedEditFields(user, 'registrations', salesEditable);

  const updated = { ...reg };
  for (const k of allowed) if (body[k] !== undefined) updated[k] = body[k];

  // If SA re-points the registration to a different FG, the customer and the
  // denormalized snapshot must follow the FG's master owner — never the
  // client-supplied customerId (FG ↔ customer is fixed by products.customerId).
  if (allowed.has('productId') && body.productId !== undefined && body.productId !== reg.productId) {
    const { data: product, error: prodErr } = await supabase
      .from('products').select('*').eq('id', body.productId).maybeSingle();
    if (prodErr) return Response.json({ error: prodErr.message }, { status: 500 });
    if (!product) return Response.json({ error: 'ไม่พบสินค้าที่เลือก' }, { status: 404 });

    const customerId = product.customerId || (allowed.has('customerId') ? body.customerId : null) || reg.customerId;
    const { data: customer } = await supabase
      .from('customers').select('*').eq('id', customerId).maybeSingle();
    if (!customer) return Response.json({ error: 'FG นี้ยังไม่มีลูกค้าเจ้าของ กรุณากำหนดลูกค้าให้สินค้าในฐานข้อมูลก่อน' }, { status: 400 });

    updated.productId = product.id;
    updated.customerId = customer.id;
    updated.fgCode = product.fgCode;
    updated.productName = product.productDescription;
    updated.brandName = product.brandName;
    updated.customerName = customer.name;
    updated.taxId = customer.taxId;
  } else {
    // FG unchanged → never let customerId drift away from the FG's owner.
    updated.customerId = reg.customerId;
  }

  // Approval / rejection audit trail (driven by the status transition).
  if (allowed.has('status') && body.status !== undefined && body.status !== reg.status) {
    if (body.status === 'approved') {
      updated.approvedBy = user?.id ?? null;
      updated.approvedByName = user?.name ?? null;
      updated.approvedAt = new Date().toISOString();
      updated.rejectionReason = null;
    } else if (body.status === 'rejected') {
      if (!body.rejectionReason || !String(body.rejectionReason).trim()) {
        return Response.json({ error: 'กรุณาระบุเหตุผลที่ตีกลับ' }, { status: 400 });
      }
    }
  }

  // Submit for approval: SA (products:edit, no legal:approve) moves a draft (first
  // submit) or a rejected (resubmit) registration into the LG queue. Hard-blocked
  // until the required docs are present: ฉลาก/Artwork on the registration, AND the
  // company map (address_map) on the CUSTOMER record (shared master data — the map
  // is attached once to the customer, never duplicated per registration).
  if (body.status === 'pending_legal' && (reg.status === 'draft' || reg.status === 'rejected') && can(user?.role, 'products:edit')) {
    const { ready, missing } = await registrationRequirements(supabase, id);
    if (!ready) {
      return Response.json(
        { error: `กรุณาแนบเอกสารให้ครบก่อนยื่น: ${missing.map((m) => m.label).join(', ')}` },
        { status: 400 },
      );
    }
    updated.status = 'pending_legal';
    updated.rejectionReason = null;
  }

  // Recompute the tax snapshot when LG overrides taxability. Re-derive from the
  // master product's retail price so the registration stays consistent.
  if (allowed.has('taxableOverride')) {
    const { data: product } = await supabase
      .from('products').select('retailPriceIncVat, isExciseTaxable, exciseTax, localTax').eq('id', reg.productId).maybeSingle();
    const ovr = updated.taxableOverride;
    const autoTaxable = product ? product.isExciseTaxable !== false : reg.isExciseTaxable !== false;
    const isExciseTaxable = typeof ovr === 'boolean' ? ovr : autoTaxable;
    updated.isExciseTaxable = isExciseTaxable;
    if (!isExciseTaxable) {
      updated.exciseTax = 0;
      updated.localTax = 0;
    } else if (product) {
      const exVat = (product.retailPriceIncVat || 0) / 1.07;
      updated.exciseTax = exVat * 0.08;
      updated.localTax = updated.exciseTax * 0.1;
    }
  }

  updated.updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('excise_registrations').update(updated).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const summary = data.status !== reg.status
    ? `เปลี่ยนสถานะทะเบียน ${reg.fgCode || id}: ${reg.status} → ${data.status}` : null;
  await recordAudit({ user, action: 'update', entityType: 'registration', entityId: id, before: reg, after: data, summary, request });
  return Response.json(data);
}

// DELETE /api/excise-registrations/[id] — superuser / senior_ae (team) / ae (own),
// and only while the registration is a draft with no order-line references (Phase 2
// deletion policy). Submitted/approved registrations must be revised to draft first.
// Cascades attachment cleanup so a deleted draft never orphans documents/files.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: reg, error: findErr } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!reg) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });

  // Authority lives entirely in deleteScope: superuser (all) / senior_ae (team) /
  // ae (own). Deliberately NOT canEditRecord — that would let legal + ac delete.
  if (!canDeleteRecord(user, 'registrations', reg)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // Deletion policy (Phase 2): a registration is a workflow record — hard delete
  // only while it's still a draft AND not referenced by any order line. Anything
  // submitted/approved must be reverted to draft ("ขอแก้ไข") first.
  const { count: orderItemCount, error: cntErr } = await supabase
    .from('order_items').select('orderId', { count: 'exact', head: true }).eq('registrationId', id);
  if (cntErr) return Response.json({ error: cntErr.message }, { status: 500 });
  const block = registrationDeleteBlock(reg, { orderItemCount: orderItemCount || 0 });
  if (block) return Response.json({ error: block }, { status: 409 });

  const { data, error } = await supabase
    .from('excise_registrations').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });

  // Cascade: purge this registration's attachments (rows + storage/Drive files)
  // so deleting a draft never orphans documents or storage.
  await purgeAttachments('registration', id);
  await recordAudit({
    user, action: 'delete', entityType: 'registration', entityId: id, before: reg,
    summary: `ลบทะเบียน ${reg.fgCode || id} (${reg.customerName || ''})`.trim(), request,
  });
  return Response.json({ success: true, message: 'ลบทะเบียนเรียบร้อยแล้ว' });
}
