import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageProductCategories } from '@/lib/permissions';
import { loadProductCategoryManagement } from '@/lib/master/productCategoryAdmin';
import { buildProductCategoryExportBuffer } from '@/lib/master/productCategoryWorkbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const now = new Date();
    const { items } = await loadProductCategoryManagement(getSupabaseAdmin());
    const buffer = await buildProductCategoryExportBuffer(items, { now });
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type)?.value || '';
    const date = `${value('year')}${value('month')}${value('day')}`;
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${date}_product-categories.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[product-category-export]', error);
    return Response.json({ error: 'ส่งออกข้อมูลหมวดสินค้าไม่สำเร็จ' }, { status: 500 });
  }
}
