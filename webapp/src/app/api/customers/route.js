import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canApproveMasterData } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
// Customers are a central registry — every signed-in user can view all of them
// (so teams don't re-register the same customer). Edit/delete is team-scoped.
//
// Approval gate: by default GET returns only APPROVED customers, so every
// downstream consumer (orders, excise registration, PM pickers) automatically
// never sees a pending/rejected row. The management page passes ?manage=1 to
// see all statuses (with badges + approve/reject actions).
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const manage = new URL(request.url).searchParams.get('manage') === '1';

  let query = supabase.from('customers').select('*').order('createdAt', { ascending: false });
  // Treat legacy NULL as approved (pre-0027 rows). Filter only outside manage view.
  if (!manage) query = query.or('approvalStatus.eq.approved,approvalStatus.is.null');

  const { data, error } = await query;
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

  // AE / AC creations land as 'pending'; Senior AE+ auto-approve their own.
  const nowIso = new Date().toISOString();
  const autoApprove = canApproveMasterData(user?.role);

  const newCustomer = {
    id: 'CUS-' + Date.now().toString().slice(-6),
    arCode: body.arCode,
    name: body.name,
    taxId: body.taxId,
    phone: body.phone || null,
    address: body.address,
    brands: body.brands || [],
    mapFileUrl: body.mapFileUrl || null,
    // Master-data contact / commercial fields (migration 0005, 0025).
    contactPerson: body.contactPerson || null,
    contactPhone: body.contactPhone || null,
    email: body.email || null,
    creditTerms: body.creditTerms || null,
    jubiliId: body.jubiliId || null,
    metadata: body.metadata || {},
    // Managing team + owner come from the server-side identity.
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
    // Approval workflow (migration 0027).
    approvalStatus: autoApprove ? 'approved' : 'pending',
    submittedBy: user?.id ?? null,
    submittedByName: user?.name ?? null,
    approvedBy: autoApprove ? (user?.id ?? null) : null,
    approvedByName: autoApprove ? (user?.name ?? null) : null,
    approvedAt: autoApprove ? nowIso : null,
    createdAt: nowIso,
  };

  const { data, error } = await supabase.from('customers').insert(newCustomer).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
