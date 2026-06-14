// ── Orders ↔ excise_registrations: JS join (no PostgREST embed) ───────────
// `order_items.registrationId` (migration 0017) is a plain text column + index
// with NO foreign-key constraint to `excise_registrations`, so PostgREST has no
// relationship in its schema cache and an embed like
//   order_items(*, registration:excise_registrations(*))
// fails with "Could not find a relationship between 'order_items' and
// 'excise_registrations'". The `product:products(*)` embed DOES work — that one
// has a real FK (migration 0002) — so we keep it and only join registrations
// here, in JS. See memory [[no-real-fk-constraints]].

// Embeddable part of the orders select: header + items + product (real FKs).
// Registrations are attached afterwards by attachRegistrations().
export const ORDER_SELECT =
  '*, items:order_items(*, product:products(*))';

// Given orders (each with `items[]`), fetch every referenced registration in one
// query and attach it as `item.registration`. Mutates and returns the orders.
export async function attachRegistrations(supabase, orders) {
  const list = Array.isArray(orders) ? orders : orders ? [orders] : [];
  const regIds = [
    ...new Set(
      list.flatMap((o) => (o.items || []).map((it) => it.registrationId)).filter(Boolean)
    ),
  ];
  if (regIds.length === 0) {
    for (const o of list) for (const it of o.items || []) it.registration = null;
    return orders;
  }
  const { data: regs, error } = await supabase
    .from('excise_registrations')
    .select('*')
    .in('id', regIds);
  if (error) throw error;
  const regMap = new Map((regs || []).map((r) => [r.id, r]));
  for (const o of list) {
    for (const it of o.items || []) {
      it.registration = it.registrationId ? regMap.get(it.registrationId) || null : null;
    }
  }
  return orders;
}
