import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageProductCategories } from '@/lib/permissions';
import { loadProductCategoryRows } from '@/lib/master/productCategoryAdmin';
import { buildProductCategoryTemplateBuffer } from '@/lib/master/productCategoryWorkbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const timestamp = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}-${value('hour')}${value('minute')}${value('second')}`;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const now = new Date();
    const rows = await loadProductCategoryRows(getSupabaseAdmin());
    const buffer = await buildProductCategoryTemplateBuffer(rows, { now });
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${timestamp(now)}_product-category-import.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[product-category-template]', error);
    return Response.json({ error: 'สร้างไฟล์สำหรับนำเข้าไม่สำเร็จ' }, { status: 500 });
  }
}
