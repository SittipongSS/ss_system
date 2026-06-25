import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord } from '@/lib/permissions';
import { productRelations } from '@/lib/master/relations';

export const dynamic = 'force-dynamic';

// GET /api/products/[id]/relations — read-only 360-view summary.
// → { registrations[], orders[], projects[] } (scoped to the viewer).
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: product } = await supabase
    .from('products').select('*').eq('id', id).maybeSingle();
  // 404 (not 403) for out-of-team products so we don't leak their existence.
  if (!product || !canViewRecord(user, 'products', product)) {
    return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  }

  const relations = await productRelations(supabase, id, user);
  return Response.json(relations);
}
