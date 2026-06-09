import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';

export const dynamic = 'force-dynamic';
// Customers are a central registry — every signed-in user can view all of them
// (so teams don't re-register the same customer). Edit/delete is team-scoped.
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
  const user = await getCurrentUser();
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
    phone: body.phone || null,
    address: body.address,
    brands: body.brands || [],
    mapFileUrl: body.mapFileUrl || null,
    // Managing team + owner come from the server-side identity.
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
    createdAt: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('customers').insert(newCustomer).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
