// SAHAMIT — chronological round numbering. The whole module treats roundNo as
// the chronological order of FC rounds (compare/flags/peak/predict all sort by
// it), so backfilled history must slot in by receivedDate — not by the order it
// was typed into the system. After any write that can change the order (create,
// edit receivedDate, delete), renumber every round of the customer to 1..N by
// receivedDate and move the fc_flags audit rows along with their round.

// Pure: which rounds need a new number. Orders by receivedDate (tie: keep the
// current roundNo order, so same-date rounds stay in entry order) and returns
// only the changes: [{ id, from, to }].
export function desiredRoundNumbers(rounds) {
  const ordered = [...(rounds || [])].sort((a, b) => {
    const da = String(a.receivedDate || '');
    const db = String(b.receivedDate || '');
    if (da !== db) return da < db ? -1 : 1;
    return (a.roundNo || 0) - (b.roundNo || 0);
  });
  return ordered
    .map((r, i) => ({ id: r.id, from: r.roundNo, to: i + 1 }))
    .filter((c) => c.from !== c.to);
}

// Two-phase renumber so the unique (customerId, roundNo) index never collides
// mid-flight: park every changed round (and its flags) on a temporary number,
// then land on the final one. Unchanged rounds already sit on their final
// numbers, so finals only ever collide with parked rows — which are out of the
// way. Returns the changes applied (empty array = order was already correct).
const PARK_OFFSET = 100000;

export async function renumberRoundsByDate(supabase, customerId) {
  const { data: rounds, error } = await supabase
    .from('sahamit_forecast_rounds')
    .select('id, roundNo, receivedDate')
    .eq('customerId', customerId);
  if (error) throw new Error(error.message);

  const changes = desiredRoundNumbers(rounds || []);
  for (const c of changes) {
    const r1 = await supabase.from('sahamit_forecast_rounds')
      .update({ roundNo: c.from + PARK_OFFSET }).eq('id', c.id);
    if (r1.error) throw new Error(r1.error.message);
    const f1 = await supabase.from('sahamit_fc_flags')
      .update({ roundNo: c.from + PARK_OFFSET })
      .eq('customerId', customerId).eq('roundNo', c.from);
    if (f1.error) throw new Error(f1.error.message);
  }
  for (const c of changes) {
    const r2 = await supabase.from('sahamit_forecast_rounds')
      .update({ roundNo: c.to }).eq('id', c.id);
    if (r2.error) throw new Error(r2.error.message);
    const f2 = await supabase.from('sahamit_fc_flags')
      .update({ roundNo: c.to })
      .eq('customerId', customerId).eq('roundNo', c.from + PARK_OFFSET);
    if (f2.error) throw new Error(f2.error.message);
  }
  return changes;
}
