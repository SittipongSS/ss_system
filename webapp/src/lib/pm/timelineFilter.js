export const TIMELINE_ALL = 'all';
export const TIMELINE_CENTRAL = '__central__';

export function filterTimelineTasks(tasks, selection = TIMELINE_ALL) {
  const rows = tasks || [];
  if (selection === TIMELINE_ALL) return rows;
  if (selection === TIMELINE_CENTRAL) return rows.filter((task) => !task.dealId);
  return rows.filter((task) => task.dealId === selection);
}

export function isDealTimelineSelection(selection) {
  return Boolean(selection && selection !== TIMELINE_ALL && selection !== TIMELINE_CENTRAL);
}
