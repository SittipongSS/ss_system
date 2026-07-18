import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canManageProductCategories } from '@/lib/permissions';
import { listProductTypes } from '@/lib/master/productTypes';
import { normalizeProductCategoryInput, productCategoryCode } from '@/lib/master/productCategory';
import { cachedJson, invalidateCache } from '@/lib/serverCache';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// taxonomy เหมือนกันทุกผู้ใช้และเปลี่ยนนาน ๆ ครั้ง — cache 5 นาที ลดภาระ DB
// (write handler ด้านล่างเรียก invalidateCache ให้ instance นี้เห็นของใหม่ทันที)
const CACHE_TTL_MS = 5 * 60 * 1000;

// GET — category taxonomy. Readable by any signed-in user (used for the
// product-form dropdown and PM templates). The proxy already blocks anon.
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const manage = url.searchParams.get('manage') === '1';
    if (manage) {
      const user = await getCurrentUser();
      if (!canManageProductCategories(user?.role)) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }
      const supabase = getSupabaseAdmin();
      const [typesResult, productsResult, dealsResult, projectsResult] = await Promise.all([
        supabase.from('product_types').select('*')
          .order('mainCategoryCode', { ascending: true })
          .order('typeCode', { ascending: true }),
        supabase.from('products').select('categoryCode').not('categoryCode', 'is', null),
        supabase.from('sales_deals').select('categoryCode').not('categoryCode', 'is', null),
        supabase.from('projects').select('productMainCategory').not('productMainCategory', 'is', null),
      ]);
      const queryError = typesResult.error || productsResult.error || dealsResult.error || projectsResult.error;
      if (queryError) return Response.json({ error: queryError.message }, { status: 500 });

      const countBy = (rows, key) => {
        const counts = new Map();
        for (const row of rows || []) {
          const code = String(row?.[key] || '').trim();
          if (code) counts.set(code, (counts.get(code) || 0) + 1);
        }
        return counts;
      };
      const productCounts = countBy(productsResult.data, 'categoryCode');
      const dealCounts = countBy(dealsResult.data, 'categoryCode');
      const projectCounts = countBy(projectsResult.data, 'productMainCategory');
      const items = (typesResult.data || []).map((row) => {
        const code = productCategoryCode(row);
        const usage = {
          products: productCounts.get(code) || 0,
          deals: dealCounts.get(code) || 0,
          projects: projectCounts.get(code) || 0,
        };
        return { ...row, code, usage: { ...usage, total: usage.products + usage.deals + usage.projects } };
      });
      return Response.json({
        items,
        summary: {
          mainCategories: new Set(items.map((row) => row.mainCategoryCode)).size,
          total: items.length,
          active: items.filter((row) => row.isActive !== false).length,
          inactive: items.filter((row) => row.isActive === false).length,
          used: items.filter((row) => row.usage.total > 0).length,
        },
      });
    }
    const data = await cachedJson('product-types', CACHE_TTL_MS, () => listProductTypes());
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST — add a category. Supervisor-only (master:manage); also gated by proxy.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { value, errors } = normalizeProductCategoryInput(body);
  if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // A main category is denormalized across its sub-category rows. Reuse the
  // canonical group name when adding another item so one code cannot drift into
  // multiple names.
  const { data: mainRows, error: mainError } = await supabase
    .from('product_types')
    .select('mainCategoryName')
    .eq('mainCategoryCode', value.mainCategoryCode)
    .limit(1);
  if (mainError) return Response.json({ error: mainError.message }, { status: 500 });
  const mainCategoryName = mainRows?.[0]?.mainCategoryName || value.mainCategoryName;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('product_types')
    .insert({
      ...value,
      mainCategoryName,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();

  if (error) {
    // Unique violation on (mainCategoryCode, typeCode)
    if (error.code === '23505') {
      return Response.json({ error: 'หมวด/รหัสนี้มีอยู่แล้ว' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  invalidateCache('product-types');
  await recordAudit({
    user, action: 'create', entityType: 'product_category', entityId: data.id,
    after: data, summary: `เพิ่มหมวดสินค้า ${productCategoryCode(data)} ${data.nameTh || data.nameEn || ''}`.trim(), request,
  });
  return Response.json(data, { status: 201 });
}
