import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/excise-registrations — team-scoped list (legal/supervisor see all).
export async function GET() {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  let query = supabase
    .from('excise_registrations')
    .select('*')
    .order('createdAt', { ascending: false });
  if (viewScope(user?.role) === 'team') query = query.eq('team', user?.team ?? null);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST /api/excise-registrations — SA submits a master FG product for excise
// registration against a customer. Tax is snapshotted from the master product.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  if (!body.productId) return Response.json({ error: 'กรุณาเลือกสินค้า (FG)' }, { status: 400 });

  // Pull the master product (source of truth for FG + tax + owner customer).
  const { data: product, error: prodErr } = await supabase
    .from('products').select('*').eq('id', body.productId).maybeSingle();
  if (prodErr) return Response.json({ error: prodErr.message }, { status: 500 });
  if (!product) return Response.json({ error: 'ไม่พบสินค้าที่เลือก' }, { status: 404 });

  // The customer is derived from the FG's master owner (products.customerId FK),
  // not chosen freely — an FG belongs to exactly one customer. Only fall back to
  // the client-supplied customerId when the FG has no owner set yet.
  const customerId = product.customerId || body.customerId;
  if (!customerId) {
    return Response.json({ error: 'FG นี้ยังไม่มีลูกค้าเจ้าของ กรุณากำหนดลูกค้าให้สินค้าในระบบฐานข้อมูลก่อน' }, { status: 400 });
  }

  const { data: customer, error: custErr } = await supabase
    .from('customers').select('*').eq('id', customerId).maybeSingle();
  if (custErr) return Response.json({ error: custErr.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });

  // One registration per (product, customer).
  const { data: dup } = await supabase
    .from('excise_registrations')
    .select('id')
    .eq('productId', body.productId)
    .eq('customerId', customerId)
    .maybeSingle();
  if (dup) {
    return Response.json({ error: 'สินค้านี้ถูกขึ้นทะเบียนให้ลูกค้ารายนี้แล้ว' }, { status: 409 });
  }

  // Tax snapshot from the master product. LG may override taxability later.
  const isExciseTaxable = product.isExciseTaxable !== false;

  const newReg = {
    id: 'REG-' + Date.now().toString().slice(-6),
    productId: product.id,
    customerId: customer.id,
    fgCode: product.fgCode,
    productName: product.productDescription,
    brandName: product.brandName,
    customerName: customer.name,
    taxId: customer.taxId,
    isExciseTaxable,
    taxableOverride: null,
    exciseTax: isExciseTaxable ? (product.exciseTax || 0) : 0,
    localTax: isExciseTaxable ? (product.localTax || 0) : 0,
    status: 'pending_legal',
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
    assignee: body.assignee || user?.name || 'Sales',
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('excise_registrations').insert(newReg).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
