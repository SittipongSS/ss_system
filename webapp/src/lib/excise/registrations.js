// ── Excise registrations ──────────────────────────────────────────────
// Access layer for the excise-tax registration workflow. A registration
// binds a master product (FG) to a customer and carries the LG approval
// state + the tax snapshot used by the sales/order rollup.
//
// Server-only: uses the service-role admin client. Never import client-side.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function listRegistrations() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('excise_registrations')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getRegistration(id) {
  if (!id) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('excise_registrations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Registrations for one customer. `approvedOnly` restricts to the rows the
// sales/order flow may use.
export async function listForCustomer(customerId, { approvedOnly = false } = {}) {
  if (!customerId) return [];
  const supabase = getSupabaseAdmin();
  let query = supabase.from('excise_registrations').select('*').eq('customerId', customerId);
  if (approvedOnly) query = query.eq('status', 'approved');
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Registrations a master product appears in (which customers it's registered
// for). Used by the product detail page to show the linkage as information.
export async function listForProduct(productId) {
  if (!productId) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('excise_registrations')
    .select('*')
    .eq('productId', productId);
  if (error) throw error;
  return data || [];
}
