export const TIMELINE_CENTRAL = '__central__';

export function filterTimelineTasks(tasks, selections = []) {
  const rows = tasks || [];
  if (!selections?.length) return rows;
  const selected = new Set(selections);
  return rows.filter((task) => (
    task.dealId ? selected.has(task.dealId) : selected.has(TIMELINE_CENTRAL)
  ));
}

export function singleSelectedDeal(selections = []) {
  return selections.length === 1 && selections[0] !== TIMELINE_CENTRAL
    ? selections[0]
    : null;
}
