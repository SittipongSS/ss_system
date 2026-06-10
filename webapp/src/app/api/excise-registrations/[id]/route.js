import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields } from '@/lib/permissions';

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
  const salesEditable = ['assignee', 'metadata'];
  const allowed = allowedEditFields(user, 'registrations', salesEditable);

  const updated = { ...reg };
  for (const k of allowed) if (body[k] !== undefined) updated[k] = body[k];

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

  // Resubmit: SA (products:edit, no legal:approve) sends a rejected
  // registration back into the queue. The only status change SA may make.
  if (body.status === 'pending_legal' && reg.status === 'rejected' && can(user?.role, 'products:edit')) {
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
  if (!canDeleteRecord(user, 'registrations', reg)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('excise_registrations').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  return Response.json({ success: true, message: 'ลบทะเบียนเรียบร้อยแล้ว' });
}
