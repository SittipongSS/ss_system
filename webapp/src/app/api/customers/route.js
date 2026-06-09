import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  // Duplicate AR Code check
  const { data: dup } = await supabase
    .from('customers')
    .select('id')
    .eq('arCode', body.arCode)
    .maybeSingle();
  if (dup) {
    return Response.json({ error: 'รหัสลูกค้านี้มีในระบบแล้ว' }, { status: 409 });
  }

  const newCustomer = {
    id: 'CUS-' + Date.now().toString().slice(-6),
    arCode: body.arCode,
    name: body.name,
    taxId: body.taxId,
    address: body.address,
    brands: body.brands || [],
    mapFileUrl: body.mapFileUrl || null,
    createdAt: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('customers').insert(newCustomer).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
