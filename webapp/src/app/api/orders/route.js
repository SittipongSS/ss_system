import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export async function GET() {
  const supabase = getSupabaseAdmin();
  // Embed the related product as `product` (FK orders.productId -> products.id)
  const { data, error } = await supabase
    .from('orders')
    .select('*, product:products(*)')
    .order('createdAt', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const body = await request.json();

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', body.productId)
    .maybeSingle();
  if (!product) return Response.json({ error: 'Product not found' }, { status: 404 });

  const qty = parseInt(body.quantity);
  const totalExciseTax = product.exciseTax * qty;
  const totalLocalTax = product.localTax * qty;
  const totalTax = totalExciseTax + totalLocalTax;

  const newOrder = {
    id: 'ORD-' + Date.now().toString().slice(-6),
    productId: body.productId,
    quantity: qty,
    quotationRef: body.quotationRef || '-',
    deliveryDate: body.deliveryDate || '-',
    remarks: body.remarks || '-',
    assignee: body.assignee || 'Sales',
    totalExciseTax,
    totalLocalTax,
    totalTax,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('orders').insert(newOrder).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
