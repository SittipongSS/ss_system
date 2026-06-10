// ── Master Data: customers ────────────────────────────────────────────
// Shared-core access layer for the customer registry. Every subsystem
// (tax/orders, PM, future) reads customers THROUGH this module instead of
// querying supabase directly, so the link/lookup logic lives in one place.
//
// Server-only: uses the service-role admin client (bypasses RLS). Never
// import into client components.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// All customers (central registry — viewable by every signed-in user).
export async function listCustomers() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return data || [];
}

// A single customer by id, or null.
export async function getCustomer(id) {
  if (!id) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Resolve a customer record from whatever a caller has: a real id (preferred),
// else a taxId, else an exact name. Used when a subsystem only carries a
// snapshot and wants to re-link to the master row.
export async function resolveCustomer({ id, taxId, name } = {}) {
  if (id) {
    const byId = await getCustomer(id);
    if (byId) return byId;
  }
  const supabase = getSupabaseAdmin();
  if (taxId) {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('taxId', taxId)
      .maybeSingle();
    if (data) return data;
  }
  if (name) {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('name', name)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}
