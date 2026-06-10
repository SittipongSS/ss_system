import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { editScope, inScope } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function loadProject(supabase, id) {
  const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  return data;
}

// GET — FG (products) ที่ผูกกับโปรเจกต์นี้
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('project_products')
    .select('*, product:products(*)')
    .eq('projectId', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json((data || []).map((l) => l.product).filter(Boolean));
}

// POST { productId } — ผูก FG เข้าโปรเจกต์ (1 โปรเจกต์มีได้หลาย FG)
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const project = await loadProject(supabase, id);
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
  if (!inScope(editScope(user?.role), user, project)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();
  if (!body.productId) return Response.json({ error: 'ต้องระบุ productId' }, { status: 400 });

  const { data, error } = await supabase
    .from('project_products')
    .insert({ id: 'PP-' + Date.now().toString().slice(-6), projectId: id, productId: body.productId })
    .select('*, product:products(*)')
    .single();
  if (error) {
    if (error.code === '23505') return Response.json({ error: 'สินค้านี้ผูกกับโปรเจกต์แล้ว' }, { status: 409 });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data.product, { status: 201 });
}

// DELETE ?productId=... — ถอด FG ออกจากโปรเจกต์
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const project = await loadProject(supabase, id);
  if (!project) return Response.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 });
  if (!inScope(editScope(user?.role), user, project)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const productId = new URL(request.url).searchParams.get('productId');
  if (!productId) return Response.json({ error: 'ต้องระบุ productId' }, { status: 400 });

  const { error } = await supabase
    .from('project_products')
    .delete()
    .eq('projectId', id)
    .eq('productId', productId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
