import { pmEditScope, inScope } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound, conflict, badRequest } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';
import { genId } from '@/lib/id';

export const dynamic = 'force-dynamic';

// GET — FG (products) ที่ผูกกับโปรเจกต์นี้
export const GET = withUser(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  const { data, error } = await supabase
    .from('project_products')
    .select('*, product:products(*)')
    .eq('projectId', id);
  if (error) return fail(error.message, 500);
  return ok((data || []).map((l) => l.product).filter(Boolean));
});

// POST { productId } — ผูก FG เข้าโปรเจกต์ (1 โปรเจกต์มีได้หลาย FG)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (!inScope(pmEditScope(user?.role), user, project)) {
    return forbidden();
  }

  const body = await req.json();
  if (!body.productId) return badRequest('ต้องระบุ productId');

  const { data, error } = await supabase
    .from('project_products')
    .insert({ id: genId('PP'), projectId: project.id, productId: body.productId })
    .select('*, product:products(*)')
    .single();
  if (error) {
    if (error.code === '23505') return conflict('สินค้านี้ผูกกับโปรเจกต์แล้ว');
    return fail(error.message, 500);
  }
  return ok(data.product, 201);
});

// DELETE ?productId=... — ถอด FG ออกจากโปรเจกต์
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (!inScope(pmEditScope(user?.role), user, project)) {
    return forbidden();
  }

  const productId = new URL(req.url).searchParams.get('productId');
  if (!productId) return badRequest('ต้องระบุ productId');

  const { error } = await supabase
    .from('project_products')
    .delete()
    .eq('projectId', project.id)
    .eq('productId', productId);
  if (error) return fail(error.message, 500);
  return ok({ success: true });
});
