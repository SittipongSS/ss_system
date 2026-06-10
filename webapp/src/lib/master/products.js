// ── Master Data: products ─────────────────────────────────────────────
// Shared-core access layer for the product registry. Centralizes the
// customer↔product link lookup so callers don't re-implement it.
//
// Server-only: uses the service-role admin client. Never import client-side.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function listProducts() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getProduct(id) {
  if (!id) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// All products belonging to a customer. Prefers the real FK (customerId);
// falls back to the legacy name/taxId match so products created before the FK
// existed (migration 0006) are still found. De-duped by product id.
export async function listProductsForCustomer(customer) {
  if (!customer) return [];
  const supabase = getSupabaseAdmin();

  const lookups = [
    supabase.from('products').select('*').eq('customerId', customer.id),
    customer.name
      ? supabase.from('products').select('*').eq('customerName', customer.name)
      : Promise.resolve({ data: [] }),
    customer.taxId
      ? supabase.from('products').select('*').eq('taxId', customer.taxId)
      : Promise.resolve({ data: [] }),
  ];

  const results = await Promise.all(lookups);
  const map = new Map();
  for (const res of results) {
    for (const p of res.data || []) map.set(p.id, p);
  }
  return [...map.values()];
}
