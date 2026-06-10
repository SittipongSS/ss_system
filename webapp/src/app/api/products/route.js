import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope } from '@/lib/permissions';
import { categoryOf } from '@/lib/master/productTypes';

export const dynamic = 'force-dynamic';
export async function GET() {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  let query = supabase.from('products').select('*').order('createdAt', { ascending: false });
  // Team-scoped roles only see their own team's products; 'all' sees everything.
  if (viewScope(user?.role) === 'team') query = query.eq('team', user?.team ?? null);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  // Duplicate FG Code check
  const { data: dup } = await supabase
    .from('products')
    .select('id')
    .eq('fgCode', body.fgCode)
    .maybeSingle();
  if (dup) {
    return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
  }

  const { fgCode, volume, costPrice, retailPriceIncVat } = body;
  // Taxability is auto-derived from the FG code, but LG may override it.
  const autoTaxable = !!(fgCode && fgCode.includes('01-002'));
  const taxableOverride =
    typeof body.taxableOverride === 'boolean' ? body.taxableOverride : null;
  const isExciseTaxable = taxableOverride === null ? autoTaxable : taxableOverride;

  const retailPriceExVat = isExciseTaxable ? retailPriceIncVat / 1.07 : 0;
  const exciseTax = isExciseTaxable ? retailPriceExVat * 0.08 : 0;
  const localTax = isExciseTaxable ? exciseTax * 0.1 : 0;

  const factoryPrice = costPrice;
  const laborCost = volume >= 30 ? 5 : 2;
  const shippingCost = 1;
  const materialCost = factoryPrice * 0.65;
  const factoryProfit = factoryPrice - materialCost - laborCost - shippingCost;

  // Master catalog only — products are NOT tied to a customer here. Linking a
  // product to a customer + excise approval happens in the registration flow
  // (/api/excise-registrations). Category is derived from the FG code.
  const categoryCode = body.categoryCode || categoryOf(fgCode);

  // Whitelist the catalog fields we accept from the form (don't spread the
  // whole body — keeps stray customer/status values out of the master row).
  const newProduct = {
    id: 'PRD-' + Date.now().toString().slice(-6),
    fgCode,
    productDescription: body.productDescription ?? null,
    brandName: body.brandName ?? null,
    volume,
    costPrice,
    retailPriceIncVat,
    mapFileUrl: body.mapFileUrl ?? null,
    taxableOverride,
    isExciseTaxable,
    retailPriceExVat,
    exciseTax,
    localTax,
    laborCost,
    shippingCost,
    materialCost,
    factoryProfit,
    categoryCode: categoryCode ?? null,
    metadata: body.metadata || {},
    // Ownership comes from the server-side identity, not the client body.
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
    assignee: body.assignee || user?.name || 'Sales',
    createdAt: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('products').insert(newProduct).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
