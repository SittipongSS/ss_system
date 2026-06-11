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

// ลบวันทำการ (ถอยหลัง ข้ามเสาร์-อาทิตย์ + วันหยุด); เลื่อนวันจบมาเป็นวันทำการก่อน
const subtractBusinessDays = (endDate, days) => {
  const d = new Date(endDate);
  while (!isBusinessDay(d)) d.setDate(d.getDate() - 1);
  let subbed = 0;
  while (subbed < days) {
    d.setDate(d.getDate() - 1);
    if (isBusinessDay(d)) subbed++;
  }
  return d;
};

// เลือกโหมดคำนวณ timeline ตามวันที่ที่โปรเจกต์มี:
//   มี dueDate (มี/ไม่มีวันเริ่มก็ได้) → backward: นับวันจบถอยลงมา
//   ไม่มี dueDate แต่มี startDate       → forward: นับจากวันเริ่ม
//   ไม่มีทั้งคู่                          → forward: นับจากวันสร้าง (createdAt) มิฉะนั้นวันนี้
export function resolveSchedule(project = {}) {
  const end = toDateStr(project.dueDate);
  if (end) return { mode: 'backward', anchor: end };
  const start = toDateStr(project.startDate);
  if (start) return { mode: 'forward', anchor: start };
  return { mode: 'forward', anchor: toDateStr(project.createdAt) || todayStr() };
}

// ตัวเลือกอัตโนมัติ: forward หรือ backward ตาม resolveSchedule
export function recalculateSchedule(tasks, project, allTasks = tasks) {
  const { mode, anchor } = resolveSchedule(project);
  return mode === 'backward'
    ? recalculateBackward(tasks, anchor, allTasks)
    : recalculateForward(tasks, anchor, allTasks);
}

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

// คำนวณ start/finish แบบ backward จาก "วันจบโปรเจกต์" (dueDate) ถอยขึ้นมา
// task สุดท้าย (ไม่มี successor) จบที่ projectEndDate; task อื่นจบก่อน successor
// ที่เริ่มเร็วสุดจะเริ่ม (เคารพ predecessors เหมือน forward แต่กลับทิศ).
// คงค่า manual override: ถ้า task มี startDate+finishDate เดิมแล้ววันเปลี่ยน → ล้าง cellsOverride.
export function recalculateBackward(tasks, projectEndDate, allTasks = tasks) {
  const taskMap = new Map();
  allTasks.forEach((t) => taskMap.set(t.id, t));

  // map: predecessor id → รายชื่อ task ที่ขึ้นกับมัน (successors)
  const successors = new Map();
  for (const t of allTasks) {
    if (Array.isArray(t.predecessors)) {
      for (const predId of t.predecessors) {
        if (!successors.has(predId)) successors.set(predId, []);
        successors.get(predId).push(t.id);
      }
    }
  }

  // ประมวลผลจากท้ายไปต้น เพื่อให้ successor ถูกคำนวณก่อน predecessor
  const order = tasks.map((t, idx) => idx).reverse();
  const result = new Array(tasks.length);

  for (const idx of order) {
    const t = tasks[idx];
    let currentFinish = new Date(projectEndDate);
    while (!isBusinessDay(currentFinish)) currentFinish.setDate(currentFinish.getDate() - 1);

    const succIds = successors.get(t.id) || [];
    let minFinish = Infinity;
    for (const succId of succIds) {
      const succ = taskMap.get(succId);
      if (succ && succ.startDate) {
        const before = new Date(succ.startDate);
        if (t.durationDays > 0) before.setDate(before.getDate() - 1);
        while (!isBusinessDay(before)) before.setDate(before.getDate() - 1);
        if (before.getTime() < minFinish) minFinish = before.getTime();
      }
    }
    if (minFinish !== Infinity && minFinish < currentFinish.getTime()) currentFinish = new Date(minFinish);

    const finish = new Date(currentFinish);
    const start = subtractBusinessDays(finish, Math.max(0, t.durationDays - 1));
    const startStr = toDateStr(start);
    const finishStr = toDateStr(finish);

    let cellsOverride = t.cellsOverride;
    if (t.startDate && t.finishDate && (t.startDate !== startStr || t.finishDate !== finishStr)) {
      cellsOverride = null;
    }

    const updated = { ...t, startDate: startStr, finishDate: finishStr, cellsOverride };
    taskMap.set(t.id, updated);
    result[idx] = updated;
  }

  return result;
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

  const computed = recalculateSchedule(withPreds, project);

  return computed.map((t, idx) => ({
    id: t.id,
    projectId,
    stepOrder: idx,
    name: t.name,
    role: t.role,
    assignee: t.assignee || null,
    // หมายเหตุ: ไม่ใส่ assigneeId ตอน gen — ปล่อยให้ DB default NULL (assign ภายหลังผ่าน
    // PATCH) เพื่อให้ insert ไม่พังถ้า migration 0019 ยังไม่ถูกรันบน live DB.
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

// ── ข้อ 2: ปรับชุดขั้นตอนเมื่อหมวดสินค้าเปลี่ยน (เพิ่ม/ลบเฉพาะขั้นตอนสรรพสามิต) ──
// คำนวณ "ชุด task เป้าหมาย" ตามหมวด/ประเภทใหม่ โดย **คงความคืบหน้าเดิม**: ขั้นตอน
// ที่ชื่อตรงกับของเดิมจะ reuse id + status + actualFinishDate + override; ขั้นตอนที่
// ผู้ใช้เพิ่มเอง (ไม่อยู่ใน template) จะถูกเก็บไว้ท้ายรายการ; ขั้นตอน template ที่
// ไม่เข้าหมวดแล้ว (เช่นขั้นสรรพสามิตตอนเปลี่ยนออกจาก 01-002) จะถูกลบ.
// คืน { rows: แถวสุดท้ายทั้งหมด (insert/update), toDeleteIds: id ที่ต้องลบ }.
export function mergeTemplateTasks(project, existingTasks) {
  const cat = project.productMainCategory || '';
  const fullTemplate = templateFor(project.type);
  const filtered = fullTemplate.filter((t) => {
    if (t.categoryOnly && t.categoryOnly !== cat) return false;
    if (t.categoryExclude && t.categoryExclude === cat) return false;
    return true;
  });

  const existingByName = new Map((existingTasks || []).map((t) => [t.name, t]));
  const allTemplateNames = new Set(fullTemplate.map((t) => t.name));

  // 1) แถวจาก template (reuse id/progress ของเดิมถ้าชื่อตรงกัน)
  const raw = filtered.map((t, idx) => {
    const prev = existingByName.get(t.name);
    return {
      ...t,
      id: prev?.id || genTaskId(),
      status: prev?.status || (idx === 0 ? 'In Progress' : 'Pending'),
      assignee: prev?.assignee ?? defaultAssignee(t.role, project),
      actualFinishDate: prev?.actualFinishDate ?? null,
      cellsOverride: prev?.cellsOverride ?? null,
      durationDays: prev?.durationDays ?? t.durationDays ?? 1,
    };
  });

  const withPreds = raw.map((t, idx) => {
    let preds = [];
    if (Array.isArray(t.dependsOnSteps)) {
      preds = t.dependsOnSteps.map((s) => raw.find((rt) => rt.step === s)?.id).filter(Boolean);
    } else if (idx > 0) {
      preds = [raw[idx - 1].id];
    }
    return { ...t, predecessors: preds };
  });

  const computed = recalculateSchedule(withPreds, project);

  const templateRows = computed.map((t, idx) => ({
    id: t.id,
    projectId: project.id,
    stepOrder: idx,
    name: t.name,
    role: t.role,
    assignee: t.assignee || null,
    // assigneeId ไม่อยู่ใน payload — reused row คงค่าเดิมใน DB, row ใหม่ default NULL
    // (กัน insert/update พังถ้า migration 0019 ยังไม่รัน)
    phase: t.phase || null,
    isMilestone: !!t.isMilestone,
    durationDays: t.durationDays ?? 1,
    startDate: t.startDate,
    finishDate: t.finishDate,
    status: t.status,
    actualFinishDate: t.actualFinishDate ?? null,
    predecessors: t.predecessors || [],
    cellsOverride: t.cellsOverride ?? null,
  }));

  // 2) ขั้นตอนที่ผู้ใช้เพิ่มเอง (ชื่อไม่อยู่ใน template เลย) → คงไว้ท้ายรายการ
  const customTasks = (existingTasks || []).filter((t) => !allTemplateNames.has(t.name));
  const customRows = customTasks.map((t, i) => ({ id: t.id, stepOrder: templateRows.length + i }));

  const keptIds = new Set([...templateRows.map((r) => r.id), ...customRows.map((r) => r.id)]);
  const toDeleteIds = (existingTasks || []).filter((t) => !keptIds.has(t.id)).map((t) => t.id);

  return { templateRows, customRows, toDeleteIds, existingIds: new Set((existingTasks || []).map((t) => t.id)) };
}
