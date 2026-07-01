// SAHAMIT — PO server-only helpers (take a supabase client; not for client use).

// Insert PO lines, tolerating a missing `destination` column (before migration
// 0057 is run on this DB). On a destination-column error, retry without it so
// PO creation keeps working pre-migration.
export async function insertPoLinesTolerant(supabase, rows) {
  let { error } = await supabase.from('sahamit_po_lines').insert(rows);
  if (error && /destination/i.test(error.message || '')) {
    const stripped = rows.map(({ destination, ...r }) => r);
    ({ error } = await supabase.from('sahamit_po_lines').insert(stripped));
  }
  return error;
}

// Update one PO line, tolerating a missing `destination` column. On a
// destination-column error, drop destination from the patch and retry.
export async function updatePoLineTolerant(supabase, lineId, customerId, patch) {
  let res = await supabase
    .from('sahamit_po_lines').update(patch).eq('id', lineId).eq('customerId', customerId).select().single();
  if (res.error && 'destination' in patch && /destination/i.test(res.error.message || '')) {
    const { destination, ...rest } = patch;
    res = await supabase
      .from('sahamit_po_lines').update(rest).eq('id', lineId).eq('customerId', customerId).select().single();
  }
  return res;
}
