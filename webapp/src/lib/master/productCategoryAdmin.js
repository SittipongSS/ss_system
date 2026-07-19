import { productCategoryCode } from './productCategory';

export async function loadProductCategoryRows(supabase) {
  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .order('mainCategoryCode', { ascending: true })
    .order('typeCode', { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function loadProductCategoryManagement(supabase) {
  const [items, productsResult, dealsResult, projectsResult] = await Promise.all([
    loadProductCategoryRows(supabase),
    supabase.from('products').select('categoryCode').not('categoryCode', 'is', null),
    supabase.from('sales_deals').select('categoryCode').not('categoryCode', 'is', null),
    supabase.from('projects').select('productMainCategory').not('productMainCategory', 'is', null),
  ]);
  const queryError = productsResult.error || dealsResult.error || projectsResult.error;
  if (queryError) throw queryError;

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
  const rows = items.map((row) => {
    const code = productCategoryCode(row);
    const usage = {
      products: productCounts.get(code) || 0,
      deals: dealCounts.get(code) || 0,
      projects: projectCounts.get(code) || 0,
    };
    return { ...row, code, usage: { ...usage, total: usage.products + usage.deals + usage.projects } };
  });
  return {
    items: rows,
    summary: {
      mainCategories: new Set(rows.map((row) => row.mainCategoryCode)).size,
      total: rows.length,
      active: rows.filter((row) => row.isActive !== false).length,
      inactive: rows.filter((row) => row.isActive === false).length,
      used: rows.filter((row) => row.usage.total > 0).length,
    },
  };
}
