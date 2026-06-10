import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord } from '@/lib/permissions';
import { categoryOf } from '@/lib/master/productTypes';

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

  // Master catalog edit — catalog/spec fields only. Customer linkage + excise
  // approval are NOT here; they live on the registration (/api/excise-registrations).
  const catalogEditable = [
    'fgCode', 'productDescription', 'brandName',
    'volume', 'costPrice', 'retailPriceIncVat', 'assignee', 'mapFileUrl',
    'categoryCode', 'metadata',
  ];
  const updated = { ...product };
  for (const k of catalogEditable) if (body[k] !== undefined) updated[k] = body[k];

  // Re-derive categoryCode from fgCode when fgCode changed and it wasn't given.
  if (body.fgCode !== undefined && body.categoryCode === undefined) {
    updated.categoryCode = categoryOf(updated.fgCode) || null;
  }

  // Taxability is intrinsic to the FG code (auto rule). LG override now lives
  // on the registration, not the master product.
  const isExciseTaxable = !!(updated.fgCode && updated.fgCode.includes('01-002'));
  updated.isExciseTaxable = isExciseTaxable;
  updated.retailPriceExVat = isExciseTaxable ? updated.retailPriceIncVat / 1.07 : 0;
  updated.exciseTax = isExciseTaxable ? updated.retailPriceExVat * 0.08 : 0;
  updated.localTax = isExciseTaxable ? updated.exciseTax * 0.1 : 0;

  const factoryPrice = updated.costPrice;
  updated.laborCost = updated.volume >= 30 ? 5 : 2;
  updated.shippingCost = 1;
  updated.materialCost = factoryPrice * 0.65;
  updated.factoryProfit = factoryPrice - updated.materialCost - updated.laborCost - updated.shippingCost;

  updated.updatedAt = new Date().toISOString();

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
