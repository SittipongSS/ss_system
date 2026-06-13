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

// ไทม์ไลน์ "forward อย่างเดียว" — นับจากวันเริ่มไปข้างหน้าเสมอ:
//   มี startDate           → นับจากวันเริ่ม
//   ไม่มี startDate         → นับจากวันสร้าง (createdAt) มิฉะนั้นวันนี้
// dueDate ไม่ใช้ขับการคำนวณอีกต่อไป — เป็นแค่ "เป้าหมาย" ที่โชว์เป็นหมุดบน Gantt
// เพื่อดูว่างานจบทันกำหนดหรือไม่ (ดู feasibility ใน ProjectDocumentView).
export function resolveSchedule(project = {}) {
  const start = toDateStr(project.startDate);
  if (start) return { mode: 'forward', anchor: start };
  return { mode: 'forward', anchor: toDateStr(project.createdAt) || todayStr() };
}

// คำนวณ timeline (forward เสมอ) จาก anchor ที่ resolveSchedule เลือก
export function recalculateSchedule(tasks, project, allTasks = tasks) {
  const { anchor } = resolveSchedule(project);
  return recalculateForward(tasks, anchor, allTasks);
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
// ผู้ใช้เพิ่มเอง (origin='custom') จะถูกเก็บไว้ท้ายรายการ; ขั้นตอน template ที่
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

  // reuse เฉพาะแถวที่มาจาก template (origin !== 'custom') — กันแถวที่ผู้ใช้เพิ่มเอง
  // ที่บังเอิญชื่อชนกับ template มาถูกดูดเป็น template row (จะซ้ำกับ customRows)
  const existingByName = new Map((existingTasks || []).filter((t) => t.origin !== 'custom').map((t) => [t.name, t]));

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

  // 2) ขั้นตอนที่ผู้ใช้เพิ่มเอง → คงไว้ท้ายรายการ. ใช้ origin='custom' (migration 0022)
  // แทนการเทียบชื่อ — เดิมถ้าผู้ใช้ "แก้ชื่อ" ขั้นตอน template ชื่อจะไม่ตรง template เลย
  // ถูกนับเป็น custom + สร้าง template ชื่อเดิมใหม่ → ขั้นตอนซ้ำ. origin ไม่พลาดกรณีนี้.
  const customTasks = (existingTasks || []).filter((t) => t.origin === 'custom');

  const keptIds = new Set([...templateRows.map((r) => r.id), ...customTasks.map((t) => t.id)]);
  // custom row คง predecessors เดิม (templateRows rebuild ใหม่หมด แต่ custom ไม่ถูกแตะ) →
  // ต้องตัด id ที่หลุดออกจาก keptIds (เช่นขั้น template ที่ถูกลบเพราะเปลี่ยนหมวด) ทิ้ง
  // ไม่งั้นจะค้างเป็น dangling predecessor. persist เฉพาะเมื่อมีการตัดจริง (กัน update เปล่า).
  const customRows = customTasks.map((t, i) => {
    const row = { id: t.id, stepOrder: templateRows.length + i };
    const preds = Array.isArray(t.predecessors) ? t.predecessors : [];
    const cleaned = preds.filter((p) => keptIds.has(p));
    if (cleaned.length !== preds.length) row.predecessors = cleaned;
    return row;
  });

  const toDeleteIds = (existingTasks || []).filter((t) => !keptIds.has(t.id)).map((t) => t.id);

  return { templateRows, customRows, toDeleteIds, existingIds: new Set((existingTasks || []).map((t) => t.id)) };
}
