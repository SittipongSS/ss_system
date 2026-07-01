// ── Master Data: product_types (category taxonomy) ────────────────────
// Shared-core access layer for product categories. Used by the product form
// (category dropdown) and later by PM templates (categoryOnly / categoryExclude
// steps keyed on 'XX-YYY', e.g. '01-002' = excise-taxable perfume).
//
// Server-only: uses the service-role admin client.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
export { categoryOf, isExciseCategory } from '@/lib/master/categoryOf';

export async function listProductTypes() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .order('mainCategoryCode', { ascending: true })
    .order('typeCode', { ascending: true });
  if (error) throw error;
  return data || [];
}

