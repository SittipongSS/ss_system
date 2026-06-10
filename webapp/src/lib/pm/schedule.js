// PM scheduling + task generation (ported/condensed from ss-cj ProjectContext).
// ใช้ทั้งฝั่ง server (ตอน gen tasks ตอนสร้างโปรเจกต์) และ client (คำนวณ timeline ใหม่).
// v1: forward scheduling (จากวันเริ่ม). predecessors = task ที่ต้องเสร็จก่อน.
import { isBusinessDay } from './dateHelpers';
import { templateFor, defaultAssignee } from './templates';

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const toDateStr = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};

// บวกวันทำการ (ข้ามเสาร์-อาทิตย์ + วันหยุด); เลื่อนวันเริ่มมาเป็นวันทำการก่อน
const addBusinessDays = (startDate, days) => {
  const d = new Date(startDate);
  while (!isBusinessDay(d)) d.setDate(d.getDate() + 1);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) added++;
  }
  return d;
};

// คำนวณ start/finish ของทุก task แบบ forward จากวันเริ่มโปรเจกต์
// เคารพ predecessors (เริ่มหลัง predecessor ที่เสร็จช้าสุด) และ manual startDate override
// allTasks: ฐานสำหรับ resolve predecessors (ใช้ตอน partial recalc — ส่งเฉพาะ
// ช่วง task ที่ต้องเลื่อน แต่ predecessors อาจชี้ไป task ก่อนหน้าที่อยู่นอกช่วง).
// default = tasks → buildProjectTasks เดิมไม่กระทบ.
export function recalculateForward(tasks, projectStartDate, allTasks = tasks) {
  const taskMap = new Map();
  allTasks.forEach((t) => taskMap.set(t.id, t));

  return tasks.map((t) => {
    let currentStart = new Date(projectStartDate);
    while (!isBusinessDay(currentStart)) currentStart.setDate(currentStart.getDate() + 1);

    if (Array.isArray(t.predecessors) && t.predecessors.length > 0) {
      let maxStart = 0;
      for (const predId of t.predecessors) {
        const pred = taskMap.get(predId);
        if (pred && pred.finishDate) {
          const next = new Date(pred.finishDate);
          if (pred.durationDays > 0) next.setDate(next.getDate() + 1);
          while (!isBusinessDay(next)) next.setDate(next.getDate() + 1);
          if (next.getTime() > maxStart) maxStart = next.getTime();
        }
      }
      if (maxStart > 0 && maxStart > currentStart.getTime()) currentStart = new Date(maxStart);
    }

    const start = new Date(currentStart);
    const finish = addBusinessDays(start, Math.max(0, t.durationDays - 1));
    const startStr = toDateStr(start);
    const finishStr = toDateStr(finish);

    // ถ้าผู้ใช้ override กริดไว้แล้วแต่วันเปลี่ยน → ล้าง override ให้ระบายใหม่ auto
    let cellsOverride = t.cellsOverride;
    if (t.startDate && t.finishDate && (t.startDate !== startStr || t.finishDate !== finishStr)) {
      cellsOverride = null;
    }

    const updated = { ...t, startDate: startStr, finishDate: finishStr, cellsOverride };
    taskMap.set(t.id, updated);
    return updated;
  });
}

let _seq = 0;
const genTaskId = () => `PT-${Date.now().toString(36)}-${(_seq++).toString(36)}`;

// สร้าง task rows จาก template ตามประเภท + หมวดสินค้า + คำนวณวันเริ่ม-เสร็จ
// project: { type, productMainCategory, startDate, aeOwner } ; projectId: ผูกหลัง insert
// คืน array ของ row พร้อม insert ลง project_tasks (camelCase)
export function buildProjectTasks(project, projectId) {
  const cat = project.productMainCategory || '';
  const template = templateFor(project.type).filter((t) => {
    if (t.categoryOnly && t.categoryOnly !== cat) return false;
    if (t.categoryExclude && t.categoryExclude === cat) return false;
    return true;
  });

  // gen id ก่อน เพื่ออ้างใน predecessors
  const raw = template.map((t, idx) => ({
    ...t,
    id: genTaskId(),
    status: idx === 0 ? 'In Progress' : 'Pending',
    assignee: defaultAssignee(t.role, project),
  }));

  const withPreds = raw.map((t, idx) => {
    let preds = [];
    if (Array.isArray(t.dependsOnSteps)) {
      preds = t.dependsOnSteps.map((s) => raw.find((rt) => rt.step === s)?.id).filter(Boolean);
    } else if (idx > 0) {
      preds = [raw[idx - 1].id]; // default sequential
    }
    return { ...t, predecessors: preds };
  });

  const startDate = project.startDate || todayStr();
  const computed = recalculateForward(withPreds, startDate);

  return computed.map((t, idx) => ({
    id: t.id,
    projectId,
    stepOrder: idx,
    name: t.name,
    role: t.role,
    assignee: t.assignee || null,
    phase: t.phase || null,
    isMilestone: !!t.isMilestone,
    durationDays: t.durationDays ?? 1,
    startDate: t.startDate,
    finishDate: t.finishDate,
    status: t.status,
    predecessors: t.predecessors || [],
    cellsOverride: t.cellsOverride ?? null,
  }));
}
