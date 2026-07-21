// ── Master Data: product edit scope ───────────────────────────────────
// A product's CARETAKER teams — the teams allowed to edit it — are its OWNING
// CUSTOMER's teams[], NOT product.team (which only records who created the row;
// มติ 2026-07-20: "the owner is the customer"). Resolved live from the customer
// so it always tracks the current caretaker assignment (no denormalized copy to
// keep in sync). Feed the result to canEditRecord(user, 'products', product, teams).
//
// Server-only: uses the service-role admin client. Do NOT import in client code.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { caretakerTeamsOf } from '@/lib/permissions';

// Returns the owning customer's caretaker teams, or [] when the product has no
// customer / the customer is teamless (= shared master data, any team may edit).
export async function productCaretakerTeams(product, supabase = getSupabaseAdmin()) {
  if (!product?.customerId) return [];
  const { data: customer } = await supabase
    .from('customers')
    .select('teams, team')
    .eq('id', product.customerId)
    .maybeSingle();
  return caretakerTeamsOf(customer);
}
