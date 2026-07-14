export const MINE_TASK_VIEWS = {
  RESPONSIBLE: "responsible",
  DELEGATED: "delegated",
  ALL: "all",
};

export function responsibleTaskUserId(task) {
  return task?.proxyBy || task?.assigneeId || task?.ownerId || null;
}

export function isTaskDelegatedBy(task, userId) {
  if (!task || !userId) return false;
  const responsibleId = responsibleTaskUserId(task);
  return responsibleId !== userId && (task.ownerId === userId || task.assignedBy === userId);
}

export function matchesMineTaskView(task, userId, view) {
  if (!task) return false;
  if (view === MINE_TASK_VIEWS.ALL) return true;
  if (!userId) return false;
  if (view === MINE_TASK_VIEWS.DELEGATED) return isTaskDelegatedBy(task, userId);
  return responsibleTaskUserId(task) === userId;
}

export function taskRelationship(task, userId, nameForId = () => "") {
  const responsibleId = responsibleTaskUserId(task);
  const responsibleName = nameForId(responsibleId) || "ผู้รับผิดชอบ";

  if (responsibleId === userId) {
    const sourceId = task?.assignedBy && task.assignedBy !== userId
      ? task.assignedBy
      : task?.ownerId && task.ownerId !== userId
        ? task.ownerId
        : null;
    if (sourceId) {
      return { kind: "incoming", label: `${nameForId(sourceId) || "ผู้อื่น"} มอบหมายให้คุณ`, compactLabel: "รับมอบ" };
    }
    return { kind: "self", label: "สร้างเอง", compactLabel: "สร้างเอง" };
  }

  if (isTaskDelegatedBy(task, userId)) {
    return { kind: "outgoing", label: `คุณมอบหมายให้ ${responsibleName}`, compactLabel: `มอบให้ ${responsibleName}` };
  }

  return { kind: "related", label: `ผู้รับผิดชอบ: ${responsibleName}`, compactLabel: responsibleName };
}
