import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageProductCategories } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(searchParams.get('pageSize') || '25', 10) || 25));
  const from = (page - 1) * pageSize;
  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from('product_category_import_runs')
    .select('*', { count: 'exact' })
    .order('createdAt', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    console.error('[product-category-import-history]', error);
    return Response.json({ error: 'โหลดประวัติการนำเข้าไม่สำเร็จ' }, { status: 500 });
  }
  return Response.json({ items: data || [], total: count || 0, page, pageSize });
}
