// Pure reorder helpers for PM project tasks.
// stepOrder is purely the DISPLAY order — the timeline is dependency-driven
// (see recalculateGraph), so reordering is cosmetic: it never touches
// predecessors or dates, and therefore can never change the computed schedule.

// Assign stepOrder = position within `orderedIds`. Returns ONLY the rows whose
// stepOrder actually changes (minimal updates). Ids in orderedIds that aren't
// real tasks are ignored; tasks missing from orderedIds are appended in their
// current order (defensive — a partial/stale list never drops or reindexes rows
// it didn't mention into nonsense).
export function reindexByOrder(tasks, orderedIds) {
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const seen = new Set();
  const seq = [];
  for (const id of orderedIds || []) {
    if (byId.has(id) && !seen.has(id)) { seen.add(id); seq.push(id); }
  }
  const rest = (tasks || [])
    .filter((t) => !seen.has(t.id))
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
  for (const t of rest) seq.push(t.id);

  return seq
    .map((id, i) => ({ id, stepOrder: i }))
    .filter((c) => ((byId.get(c.id).stepOrder) ?? 0) !== c.stepOrder);
}

// Move one task to a target index (0-based) within the project's current order.
// Returns the minimal stepOrder changes (via reindexByOrder).
export function moveStep(tasks, movedId, toIndex) {
  const ordered = [...(tasks || [])].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
  const from = ordered.findIndex((t) => t.id === movedId);
  if (from < 0) return [];
  const [moved] = ordered.splice(from, 1);
  const clamped = Math.max(0, Math.min(toIndex, ordered.length));
  ordered.splice(clamped, 0, moved);
  return reindexByOrder(tasks, ordered.map((t) => t.id));
}
