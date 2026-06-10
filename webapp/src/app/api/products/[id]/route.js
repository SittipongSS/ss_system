import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
// GET /api/products/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  // Hide out-of-team products (return 404 so we don't leak their existence).
  if (!canViewRecord(user, 'products', data)) {
    return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  }
  return Response.json(data);
}

// PATCH /api/products/[id]
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: product, error: findErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!product) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });

  // Row-level scope: own-team (sa roles) / own record (ae) / all (supervisor,
  // legal approval). The proxy already verified the coarse capability.
  if (!canEditRecord(user, 'products', product)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Duplicate FG Code check (if changing)
  if (body.fgCode && body.fgCode !== product.fgCode) {
    const { data: dup } = await supabase
      .from('products')
      .select('id')
      .eq('fgCode', body.fgCode)
      .maybeSingle();
    if (dup) {
      return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
    }
  }

  // Commercial fields belong to sales; tax/approval fields belong to legal.
  // allowedEditFields unions the lists the user's capabilities unlock, so a
  // legal-only user can approve but cannot rewrite costPrice/price.
  const salesEditable = [
    'fgCode', 'productDescription', 'brandName', 'customerName',
    'taxId', 'address', 'volume', 'costPrice', 'retailPriceIncVat', 'assignee', 'mapFileUrl',
  ];
  const allowed = allowedEditFields(user, 'products', salesEditable);

  const updated = { ...product };
  for (const k of allowed) if (body[k] !== undefined) updated[k] = body[k];

  // Approval / rejection audit trail (driven by the status transition).
  if (allowed.has('status') && body.status !== undefined && body.status !== product.status) {
    if (body.status === 'approved') {
      updated.approvedBy = user?.id ?? null;
      updated.approvedByName = user?.name ?? null;
      updated.approvedAt = new Date().toISOString();
      updated.rejectionReason = null;
    } else if (body.status === 'rejected') {
      // Reason is required so Sales knows what to fix.
      if (!body.rejectionReason || !String(body.rejectionReason).trim()) {
        return Response.json({ error: 'กรุณาระบุเหตุผลที่ตีกลับ' }, { status: 400 });
      }
    }
  }

  // Resubmit: Sales (products:edit, no legal:approve) may send a rejected
  // product back into the queue after fixing it. This is the only status
  // change a non-legal editor is allowed to make.
  if (body.status === 'pending_legal' && product.status === 'rejected' && can(user?.role, 'products:edit')) {
    updated.status = 'pending_legal';
    updated.rejectionReason = null;
  }

  // Recalculate derived fields. Taxability follows LG's override when set,
  // otherwise the automatic FG-code rule.
  const autoTaxable = !!(updated.fgCode && updated.fgCode.includes('01-002'));
  const ovr = updated.taxableOverride;
  const isExciseTaxable = typeof ovr === 'boolean' ? ovr : autoTaxable;
  updated.isExciseTaxable = isExciseTaxable;
  updated.retailPriceExVat = isExciseTaxable ? updated.retailPriceIncVat / 1.07 : 0;
  updated.exciseTax = isExciseTaxable ? updated.retailPriceExVat * 0.08 : 0;
  updated.localTax = isExciseTaxable ? updated.exciseTax * 0.1 : 0;

  const factoryPrice = updated.costPrice;
  updated.laborCost = updated.volume >= 30 ? 5 : 2;
  updated.shippingCost = 1;
  updated.materialCost = factoryPrice * 0.65;
  updated.factoryProfit = factoryPrice - updated.materialCost - updated.laborCost - updated.shippingCost;

  const { data, error } = await supabase
    .from('products')
    .update(updated)
    .eq('id', id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// DELETE /api/products/[id] — supervisor only (enforced here + by proxy cap).
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: product, error: findErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!product) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  if (!canDeleteRecord(user, 'products', product)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase.from('products').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  return Response.json({ success: true, message: 'ลบสินค้าเรียบร้อยแล้ว' });
}
