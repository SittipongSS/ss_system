import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageProductCategories } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const [runResult, rowsResult] = await Promise.all([
    supabase.from('product_category_import_runs').select('*').eq('id', id).maybeSingle(),
    supabase.from('product_category_import_rows').select('*').eq('runId', id).order('rowNumber'),
  ]);
  const error = runResult.error || rowsResult.error;
  if (error) {
    console.error('[product-category-import-detail]', error);
    return Response.json({ error: 'โหลดรายละเอียดการนำเข้าไม่สำเร็จ' }, { status: 500 });
  }
  if (!runResult.data) return Response.json({ error: 'ไม่พบประวัติการนำเข้า' }, { status: 404 });
  return Response.json({ ...runResult.data, rows: rowsResult.data || [] });
}
