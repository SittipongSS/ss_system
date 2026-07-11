import { pmEditScope, inScope, pmTaskEditTier } from '@/lib/permissions';
import { recalculateGraph, resolveSchedule, todayStr } from '@/lib/pm/schedule';
import { setHolidays, countBusinessDays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { propagateAndPersist } from '@/lib/pm/status';
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { pickFields } from '@/lib/validate';

export const dynamic = 'force-dynamic';

// แก้ field เหล่านี้แล้วต้องคำนวณ timeline ใหม่ (วันเริ่ม/วันเสร็จ + เลื่อนขั้นถัดไป)
const SCHEDULE_FIELDS = ['startDate', 'durationDays', 'predecessors'];

const EDITABLE = [
  'name', 'role', 'assignee', 'assigneeId', 'phase', 'isMilestone', 'durationDays',
  'startDate', 'finishDate', 'actualFinishDate', 'dueDate', 'status',
  'predecessors', 'cellsOverride', 'stepOrder',
  'note', 'showNoteInPrint',
];

// Load the task + its parent project (for team-scope checks).
async function loadTaskWithProject(supabase, id) {
  const { data: task } = await supabase.from('project_tasks').select('*').eq('id', id).maybeSingle();
  if (!task) return { task: null, project: null };
  const { data: project } = await supabase.from('projects').select('*').eq('id', task.projectId).maybeSingle();
  return { task, project };
}

// PATCH /api/pm/project-tasks/[id]
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const { task, project } = await loadTaskWithProject(supabase, id);
  if (!task) return notFound('ไม่พบขั้นตอน');

  // สิทธิ์แก้ไขมี 2 ระดับ (รวม logic ไว้ที่ pmTaskEditTier ใน permissions.js):
  //   full     — ฝ่ายขาย/แอดมิน แก้ได้ทั้งโครงแผน (team-scope บนโครงการ)
  //   workflow — ผู้รับผิดชอบ (assigneeId) หรือ staff ฝ่ายเดียวกับขั้นตอน (role===department)
  //              อัปเดตได้เฉพาะสถานะ/ความคืบหน้า/โน้ต ไม่แตะวันเริ่ม/ลำดับ/การมอบหมาย
  const tier = pmTaskEditTier(user, task, project);
  if (tier === 'none') return forbidden();
  const workflowEdit = tier === 'workflow';

  const body = await req.json();
  // workflowEdit จำกัดเฉพาะ field งาน/สถานะ — กันไม่ให้พนักงานรื้อแผนหรือ reassign
  const WORKFLOW_FIELDS = ['status', 'actualFinishDate', 'note', 'showNoteInPrint'];
  const editable = workflowEdit ? EDITABLE.filter((k) => WORKFLOW_FIELDS.includes(k)) : EDITABLE;
  const updates = pickFields(body, editable, { nullable: ['startDate', 'finishDate', 'actualFinishDate', 'dueDate'] });
  updates.updatedAt = new Date().toISOString();

  // ── วันจบ↔duration: ให้ server เป็นเจ้าของการคำนวณวันทำการเพียงเจ้าเดียว ──
  // client ส่ง "วันจบที่ผู้ใช้เลือก" มาตรง ๆ (ไม่คิด duration เอง) — กันกรณี client/server
  // นับวันทำการไม่ตรงกัน (เช่น ปฏิทินวันหยุดฝั่ง client โหลดไม่ทัน) แล้วเกิดอาการ "ไม่ซิงค์".
  // แปลงเป็น durationDays ที่นี่ แล้วลบ finishDate ออก → ปล่อยให้ recalcForward กางใหม่
  // (ได้วันจบที่ snap เป็นวันทำการถูกต้อง + เลื่อน downstream ตามจริง).
  if (updates.finishDate && project) {
    setHolidays([...(await holidaySet())]);
    const startForCalc = updates.startDate || task.startDate;
    if (startForCalc) {
      const dur = new Date(updates.finishDate) <= new Date(startForCalc)
        ? 1
        : countBusinessDays(startForCalc, updates.finishDate) + 1;
      updates.durationDays = Math.max(1, dur);
    }
    delete updates.finishDate;
  }

  // ผู้ใช้ตั้งวันเริ่มเอง = ปักหมุด (startLocked); เคลียร์วันเริ่ม = ปลดหมุด → ไหลตาม dependency
  if ('startDate' in updates) updates.startLocked = !!updates.startDate;

  // ── #2 variance: ตั้ง/ล้าง actualFinishDate ตามการเปลี่ยนสถานะ ──
  // (ทำเฉพาะเมื่อ client ไม่ได้ส่ง actualFinishDate มาเอง)
  if (body.status !== undefined && body.status !== task.status && body.actualFinishDate === undefined) {
    if (body.status === 'Completed') updates.actualFinishDate = todayStr();
    else if (task.status === 'Completed') updates.actualFinishDate = null;
  }

  // ── origin tracking (migration 0022): mark "แก้ไขโดยผู้ใช้" เมื่อแก้ field สำคัญของแผน
  // ไม่นับ status / actualFinishDate (workflow) และไม่นับการเลื่อน downstream อัตโนมัติ
  // (อันนั้นเขียนผ่าน .update() แยกด้านล่าง ไม่ผ่าน path นี้)
  const USER_EDIT_FIELDS = ['name', 'role', 'assignee', 'assigneeId', 'phase', 'isMilestone', 'durationDays', 'startDate', 'finishDate', 'dueDate', 'predecessors', 'note', 'showNoteInPrint'];
  const isUserEdit = USER_EDIT_FIELDS.some((k) =>
    k in updates && JSON.stringify(updates[k] ?? null) !== JSON.stringify(task[k] ?? null)
  );
  if (isUserEdit && !task.userEdited) updates.userEdited = true;

  const { data, error } = await supabase.from('project_tasks').update(updates).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  // ── auto status: แก้สถานะ/predecessors ของขั้นนี้ → คำนวณสถานะทั้งกราฟใหม่
  // (กดเสร็จ → ขั้นถัดไปที่พร้อม เป็น In Progress ; ถอย/แก้ pred → ขั้นถัดที่ไม่พร้อม กลับ Pending).
  // client reload เมื่อ status/predecessors เปลี่ยน จึงเห็นผลกับขั้นอื่นทันที.
  if (project && ('status' in updates || 'predecessors' in updates)) {
    await propagateAndPersist(supabase, project.id);
  }

  // ── #1 recalc (dependency-driven): แก้วันเริ่ม/จำนวนวัน/predecessors/ปักหมุด →
  // คำนวณ timeline ทั้งกราฟใหม่จากวันเริ่มโครงการตามสาย predecessor จริง แล้ว persist
  // เฉพาะแถวที่เปลี่ยน. ขั้นที่ไม่ผูกกับขั้นนี้จะไม่ขยับ (ต่างจาก slice แบบเดิมที่ลากทุกขั้นที่อยู่หลัง) ──
  const schedulingChanged = SCHEDULE_FIELDS.some((k) => k in updates) || 'startLocked' in updates;
  if (schedulingChanged && project) {
    setHolidays([...(await holidaySet())]);
    const { data: all } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('projectId', project.id)
      .order('stepOrder', { ascending: true });

    if (all && all.length) {
      const applied = all.map((t) => (t.id === id ? { ...t, ...updates } : t));
      const recalced = recalculateGraph(applied, resolveSchedule(project).anchor);

      const sameCells = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const changed = recalced.filter((r) => {
        const orig = all.find((o) => o.id === r.id);
        return orig.startDate !== r.startDate || orig.finishDate !== r.finishDate || !sameCells(orig.cellsOverride, r.cellsOverride);
      });

      if (changed.length) {
        await Promise.all(changed.map((r) =>
          supabase.from('project_tasks').update({
            startDate: r.startDate, finishDate: r.finishDate, cellsOverride: r.cellsOverride ?? null,
            updatedAt: new Date().toISOString(),
          }).eq('id', r.id)
        ));
      }

      // คืน task ที่แก้พร้อม start/finish ที่คำนวณใหม่ (clamp pin แล้ว — เผื่อ client ไม่ reload)
      const self = recalced.find((r) => r.id === id);
      if (self) return ok({ ...data, startDate: self.startDate, finishDate: self.finishDate, cellsOverride: self.cellsOverride ?? null });
    }
  }

  return ok(data);
});

// DELETE /api/pm/project-tasks/[id]
export const DELETE = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;

  const { task, project } = await loadTaskWithProject(supabase, id);
  if (!task) return notFound('ไม่พบขั้นตอน');
  if (!inScope(pmEditScope(user?.role), user, project || {})) {
    return forbidden();
  }

  const { error } = await supabase.from('project_tasks').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  // ── recalc (dependency-driven): ลบขั้นตอนแล้วคำนวณ timeline ของขั้นที่เหลือใหม่ ──
  // 1) ตัด reference ของขั้นที่ถูกลบออกจาก predecessors ของขั้นอื่น
  // 2) recalculateGraph ทั้งกราฟ → ขั้นที่เคยรอขั้นที่ลบจะขยับมาเร็วขึ้นตามจริง (ไม่กระทบขั้นอิสระ)
  if (project) {
    setHolidays([...(await holidaySet())]);
    const { data: all } = await supabase
      .from('project_tasks').select('*').eq('projectId', project.id)
      .order('stepOrder', { ascending: true });

    if (all && all.length) {
      // ตัด reference ของขั้นที่ถูกลบออกจาก predecessors ของขั้นอื่น แล้วคำนวณทั้งกราฟใหม่
      const cleaned = all.map((t) =>
        Array.isArray(t.predecessors) && t.predecessors.includes(id)
          ? { ...t, predecessors: t.predecessors.filter((p) => p !== id) }
          : t
      );
      const recalced = recalculateGraph(cleaned, resolveSchedule(project).anchor);

      const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const changed = recalced.filter((r) => {
        const orig = all.find((o) => o.id === r.id);
        return orig.startDate !== r.startDate || orig.finishDate !== r.finishDate
          || !sameJson(orig.cellsOverride, r.cellsOverride) || !sameJson(orig.predecessors, r.predecessors);
      });

      if (changed.length) {
        await Promise.all(changed.map((r) =>
          supabase.from('project_tasks').update({
            startDate: r.startDate, finishDate: r.finishDate,
            cellsOverride: r.cellsOverride ?? null,
            predecessors: r.predecessors ?? [],
            updatedAt: new Date().toISOString(),
          }).eq('id', r.id)
        ));
      }
    }

    // ลบขั้นแล้ว → ขั้นถัดที่อ้างขั้นนี้อาจพร้อมทำงาน → คำนวณสถานะทั้งกราฟใหม่
    await propagateAndPersist(supabase, project.id);
  }

  return ok({ success: true });
});
