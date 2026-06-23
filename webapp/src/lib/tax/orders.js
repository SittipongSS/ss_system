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

// ── Additive columns (migrations 0041/0042) — resilient writes ────────────
// These columns are added by manual migrations that may not be applied yet on a
// given environment (migrations run by hand on Supabase before deploy). To keep
// order create/complete working both before AND after the migration — and to
// survive the deploy window where code lands before the schema — we attempt the
// write WITH the new columns and, only on a missing-column error, retry without
// them. See memory [[deploy-workflow]] (schema-cache mismatch → 500s).
const ADDITIVE_ITEM_COLS = ['salePrice', 'exciseRatePerUnit', 'localTaxRatePerUnit'];
const ADDITIVE_ORDER_COLS = ['taxPaidDate', 'taxInvoiceNumber'];

const isMissingColumnError = (error, cols) =>
  !!error && (error.code === 'PGRST204' || error.code === '42703' ||
    cols.some((c) => (error.message || '').includes(c)));
const stripCols = (obj, cols) => { const c = { ...obj }; for (const k of cols) delete c[k]; return c; };

// Insert order_items, dropping the additive audit columns if the schema predates
// migration 0041.
export async function insertOrderItems(supabase, rows) {
  let { error } = await supabase.from('order_items').insert(rows);
  if (isMissingColumnError(error, ADDITIVE_ITEM_COLS)) {
    ({ error } = await supabase.from('order_items').insert(rows.map((r) => stripCols(r, ADDITIVE_ITEM_COLS))));
  }
  return { error };
}

// Update an order, dropping additive columns (e.g. taxPaidDate) if the schema
// predates migration 0042. Returns { error }.
export async function updateOrderResilient(supabase, id, updates) {
  let { error } = await supabase.from('orders').update(updates).eq('id', id);
  if (isMissingColumnError(error, ADDITIVE_ORDER_COLS)) {
    ({ error } = await supabase.from('orders').update(stripCols(updates, ADDITIVE_ORDER_COLS)).eq('id', id));
  }
  return { error };
}

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
