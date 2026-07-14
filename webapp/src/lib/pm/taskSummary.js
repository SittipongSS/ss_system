const dateKey = (value) => String(value || "").slice(0, 10);

export function summarizeOpenTasks(tasks, today) {
  const todayKey = dateKey(today);
  const open = (tasks || []).filter((task) => task.status !== "Completed");
  const dueInDays = (task) => {
    const due = dateKey(task.dueDate);
    if (!due || !todayKey) return null;
    const start = new Date(`${todayKey}T00:00:00Z`).getTime();
    const end = new Date(`${due}T00:00:00Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return Math.round((end - start) / 86400000);
  };

  return {
    total: open.length,
    today: open.filter((task) => dateKey(task.dueDate) === todayKey).length,
    overdue: open.filter((task) => {
      const days = dueInDays(task);
      return days != null && days < 0;
    }).length,
    urgent: open.filter((task) => {
      const days = dueInDays(task);
      return !!task.urgent || (days != null && days >= 0 && days <= 3);
    }).length,
  };
}

