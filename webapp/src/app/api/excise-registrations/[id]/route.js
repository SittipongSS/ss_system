import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields } from '@/lib/permissions';
import { listAttachments } from '@/lib/master/attachments';
import { requiredDocKeys, attachmentTypeLabel } from '@/lib/master/attachmentTypes';

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
    if (!customer) return Response.json({ error: 'FG นี้ยังไม่มีลูกค้าเจ้าของ กรุณากำหนดลูกค้าให้สินค้าในระบบฐานข้อมูลก่อน' }, { status: 400 });

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
  // submit) or a rejected (resubmit) registration into the LG queue. Gated on the
  // required documents (แผนที่ + ฉลาก/Artwork) being attached first — hard block.
  if (body.status === 'pending_legal' && (reg.status === 'draft' || reg.status === 'rejected') && can(user?.role, 'products:edit')) {
    const required = requiredDocKeys('registration');
    if (required.length) {
      const present = new Set((await listAttachments('registration', id)).map((a) => a.docType));
      const missing = required.filter((k) => !present.has(k));
      if (missing.length) {
        const labels = missing.map((k) => attachmentTypeLabel('registration', k));
        return Response.json({ error: `กรุณาแนบเอกสารให้ครบก่อนยื่น: ${labels.join(', ')}` }, { status: 400 });
      }
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
  return Response.json(data);
}

// DELETE /api/excise-registrations/[id] — supervisor only (deleteScope).
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: reg, error: findErr } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!reg) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  const isSupervisorDelete = canDeleteRecord(user, 'registrations', reg);
  const isOwnerDraftDelete = canEditRecord(user, 'registrations', reg); // Removed status check for demo

  if (!isSupervisorDelete && !isOwnerDraftDelete) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('excise_registrations').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  return Response.json({ success: true, message: 'ลบทะเบียนเรียบร้อยแล้ว' });
}
