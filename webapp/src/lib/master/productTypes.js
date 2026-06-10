// ── Master Data: product_types (category taxonomy) ────────────────────
// Shared-core access layer for product categories. Used by the product form
// (category dropdown) and later by PM templates (categoryOnly / categoryExclude
// steps keyed on 'XX-YYY', e.g. '01-002' = excise-taxable perfume).
//
// Server-only: uses the service-role admin client.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

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

// Extract the 'mainCategoryCode-typeCode' pair from an FG code.
// FG codes look like 'FG-123-01-002-5555' → category '01-002'.
// Returns null if the pattern isn't present.
export function categoryOf(fgCode) {
  if (!fgCode || typeof fgCode !== 'string') return null;
  const m = fgCode.match(/(\d{2})-(\d{3})/);
  return m ? `${m[1]}-${m[2]}` : null;
}
