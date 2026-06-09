import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope } from '@/lib/permissions';

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
  const isExciseTaxable = !!(fgCode && fgCode.includes('01-002'));

  const retailPriceExVat = isExciseTaxable ? retailPriceIncVat / 1.07 : 0;
  const exciseTax = isExciseTaxable ? retailPriceExVat * 0.08 : 0;
  const localTax = isExciseTaxable ? exciseTax * 0.1 : 0;

  const factoryPrice = costPrice;
  const laborCost = volume >= 30 ? 5 : 2;
  const shippingCost = 1;
  const materialCost = factoryPrice * 0.65;
  const factoryProfit = factoryPrice - materialCost - laborCost - shippingCost;

  const newProduct = {
    id: 'PRD-' + Date.now().toString().slice(-6),
    ...body,
    isExciseTaxable,
    retailPriceExVat,
    exciseTax,
    localTax,
    laborCost,
    shippingCost,
    materialCost,
    factoryProfit,
    status: 'pending_legal',
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
