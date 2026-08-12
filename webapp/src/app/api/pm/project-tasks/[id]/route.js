import { pmEditScope, inScope, pmTaskEditTier } from '@/lib/permissions';
import { recalculateGraph, resolveSchedule, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { durationFromDates } from '@/lib/pm/stepSchedule';
import { holidaySet } from '@/lib/master/holidays';
import { propagateAndPersist } from '@/lib/pm/status';
import { withUser, ok, fail, badRequest, forbidden, notFound, conflict } from '@/lib/http';
import { pickFields } from '@/lib/validate';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { milestoneDoneUpdate } from '@/lib/pm/projectUpdates';
import { appendUpdate } from '@/lib/master/updates';

export const dynamic = 'force-dynamic';

// แก้ field เหล่านี้แล้วต้องคำนวณ timeline ใหม่ (วันเริ่ม/วันเสร็จ + เลื่อนขั้นถัดไป)
// ไม่มี finishDate ในลิสต์เพราะบล็อก "วันจบ↔duration" ด้านล่างถอดมันออกจาก updates เสมอ
// (แปลงเป็น durationDays ซึ่งอยู่ในลิสต์นี้แล้ว) — ห้ามปล่อยให้ finishDate รอดไปถึง .update()
// ไม่งั้นจะเขียนวันจบที่ไม่ผ่านการ snap วันทำการ แล้วไม่มีอะไรกระตุ้น recalc ต่อ
const SCHEDULE_FIELDS = ['startDate', 'durationDays', 'predecessors'];

const EDITABLE = [
  'name', 'role', 'assignee', 'assigneeId', 'phase', 'isMilestone', 'durationDays',
  'startDate', 'finishDate', 'actualStartDate', 'actualFinishDate', 'dueDate', 'status',
  'predecessors', 'cellsOverride', 'stepOrder',
  'note', 'showNoteInPrint',
];

// Load the task + its parent project (for team-scope checks).
// DL1: task ลอยของดีล (projectId ว่าง — mig 0094) ใช้ scope จากดีลแทน
// (pseudo-project {team, aeOwner} ให้ pmTaskEditTier/inScope เช็คทีมได้เหมือนเดิม)
async function loadTaskWithProject(supabase, id) {
  const { data: task, error: taskError } = await supabase.from('project_tasks').select('*').eq('id', id).maybeSingle();
  if (taskError) throw taskError;
  if (!task) return { task: null, project: null, scopeRow: null };
  if (!task.projectId && task.dealId) {
    const { data: deal, error: dealError } = await supabase.from('sales_deals')
      .select('id, team, ownerName').eq('id', task.dealId).maybeSingle();
    if (dealError) throw dealError;
    return { task, project: null, scopeRow: deal ? { team: deal.team, aeOwner: deal.ownerName } : null };
  }
  const { data: project } = await supabase.from('projects').select('*').eq('id', task.projectId).maybeSingle();
  return { task, project, scopeRow: project };
}

// PATCH /api/pm/project-tasks/[id]
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const { task, project, scopeRow } = await loadTaskWithProject(supabase, id);
  if (!task) return notFound('ไม่พบขั้นตอน');

  // สิทธิ์แก้ไขมี 2 ระดับ (รวม logic ไว้ที่ pmTaskEditTier ใน permissions.js):
  //   full     — ฝ่ายขาย/แอดมิน แก้ได้ทั้งโครงแผน (team-scope บนโครงการ)
  //   workflow — ผู้รับผิดชอบ (assigneeId) หรือ staff ฝ่ายเดียวกับขั้นตอน (role===department)
  //              อัปเดตได้เฉพาะสถานะ/ความคืบหน้า/โน้ต ไม่แตะวันเริ่ม/ลำดับ/การมอบหมาย
  // task ลอยของดีล (DL1): scopeRow = ทีม/AE ของดีล แทนโครงการ
  const tier = pmTaskEditTier(user, task, scopeRow);
  if (tier === 'none') return forbidden();
  const workflowEdit = tier === 'workflow';

  // ด่านหลังปิด (เฟส F): โครงการ closed ห้ามแก้ขั้นตอน (ทุก tier รวม workflow) —
  // ต้อง reopen ผ่าน /close ก่อน; task ลอยของดีล (ไม่มี project) ไม่เข้าเงื่อนไขนี้
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  const body = await req.json();
  // workflowEdit จำกัดเฉพาะ field งาน/สถานะ — กันไม่ให้พนักงานรื้อแผนหรือ reassign
  // วันของจริงทั้งคู่เป็นเรื่องของคนทำงาน ไม่ใช่โครงแผน → tier workflow แก้ได้
  const WORKFLOW_FIELDS = ['status', 'actualStartDate', 'actualFinishDate', 'note', 'showNoteInPrint'];
  const editable = workflowEdit ? EDITABLE.filter((k) => WORKFLOW_FIELDS.includes(k)) : EDITABLE;
  const updates = pickFields(body, editable, { nullable: ['startDate', 'finishDate', 'actualStartDate', 'actualFinishDate', 'dueDate'] });
  updates.updatedAt = new Date().toISOString();

  // ── วันจบ↔duration: ให้ server เป็นเจ้าของการคำนวณวันทำการเพียงเจ้าเดียว ──
  // client ส่ง "วันจบที่ผู้ใช้เลือก" มาตรง ๆ (ไม่คิด duration เอง) — กันกรณี client/server
  // นับวันทำการไม่ตรงกัน (เช่น ปฏิทินวันหยุดฝั่ง client โหลดไม่ทัน) แล้วเกิดอาการ "ไม่ซิงค์".
  // แปลงเป็น durationDays ที่นี่ แล้วลบ finishDate ออก → ปล่อยให้ recalcForward กางใหม่
  // (ได้วันจบที่ snap เป็นวันทำการถูกต้อง + เลื่อน downstream ตามจริง).
  //
  // กติกาเดียวของช่องนี้: **วันจบเป็นค่าคำนวณเสมอ (วันเริ่ม + จำนวนวันทำการ) ไม่เคยเก็บ
  // ค่าที่ client ส่งมาตรง ๆ** จึงถอด finishDate ออกจาก updates ทุกกรณี — เข้าเงื่อนไขด้วย
  // "มีคีย์ไหม" ไม่ใช่ "ค่า truthy ไหม"
  // 🐞 เดิมเช็คว่าค่ามีจริงก่อนถึงจะเข้าบล็อกนี้ ทำให้สองทางหลุด: (1) ค่าว่าง (ผู้ใช้กดล้าง
  //    วันในตาราง) ผ่านเข้าไปเขียน null ลงฐานตรง ๆ โดย durationDays เดิมค้าง และ
  //    SCHEDULE_FIELDS ไม่มี finishDate จึงไม่ recalc ต่อ = แถววันจบว่างแต่มีจำนวนวัน
  //    (2) ส่งวันจบมาทั้งที่ขั้นตอนยังไม่มีวันเริ่ม → คำนวณ duration ไม่ได้ แล้วค่าถูกลบทิ้งเงียบ ๆ
  // ⚠️ ห้ามเขียนเงื่อนไขแบบเช็คค่า truthy ที่นี่อีก แม้ในคอมเมนต์ — ตัวสแกนของเทสต์
  //    (stepDateSync.test.mjs) ไม่แยกโค้ดกับคอมเมนต์
  if ('finishDate' in updates) {
    const startForCalc = updates.startDate || task.startDate;
    if (updates.finishDate) {
      // ไม่มีวันเริ่ม = คำนวณจำนวนวันไม่ได้ → บอกสาเหตุ ไม่ใช่กลืนค่าแล้วตอบ 200
      if (!startForCalc) return badRequest('ขั้นตอนนี้ยังไม่มีวันเริ่ม — ตั้งวันเริ่มก่อนจึงจะกำหนดวันจบได้');
      setHolidays([...(await holidaySet())]);
      // สูตรเดียวกับที่ฟอร์ม/ตารางใช้พรีวิว (lib/pm/stepSchedule) — คนละฝั่งกันแต่ต้องได้เลขเท่ากัน
      updates.durationDays = durationFromDates(startForCalc, updates.finishDate);
    }
    // ล้างวันจบ (null) = ไม่มีอะไรให้เปลี่ยน — วันจบวิ่งตามจำนวนวันอยู่แล้ว
    delete updates.finishDate;
  }

  // ผู้ใช้ตั้งวันเริ่มเอง = ปักหมุด (startLocked); เคลียร์วันเริ่ม = ปลดหมุด → ไหลตาม dependency
  if ('startDate' in updates) updates.startLocked = !!updates.startDate;

  // ── #2 variance: ตั้ง/ล้าง "วันของจริง" ตามการเปลี่ยนสถานะ ──
  // (ทำเฉพาะเมื่อ client ไม่ได้ส่งค่านั้นมาเอง)
  //
  // ไทม์ไลน์เก็บสองชั้น: **แผน** (startDate/finishDate ที่คำนวณจากจำนวนวันทำการ) กับ
  // **ของจริง** (actualStartDate/actualFinishDate ที่สแตมตอนคนเดินสถานะ — mig 0239)
  // สองชั้นนี้ห้ามปนกัน: แผนขยับได้ตลอดเมื่อ predecessor เลื่อน ของจริงขยับไม่ได้
  if (body.status !== undefined && body.status !== task.status) {
    // เริ่มทำจริง — กด "กำลังทำ" คือคนบอกว่าเริ่มวันนี้ (status.js คุมอัตโนมัติเฉพาะ Pending)
    // ข้ามจาก Pending ไป Completed รวดเดียว = เริ่มและจบวันเดียวกัน จึงสแตมทั้งคู่
    if (body.actualStartDate === undefined) {
      if (body.status !== 'Pending' && !task.actualStartDate) updates.actualStartDate = todayStr();
      // ถอยกลับไป Pending = ยังไม่ได้เริ่ม ล้างทิ้ง (กระจกเงาของกติกาวันเสร็จด้านล่าง)
      else if (body.status === 'Pending') updates.actualStartDate = null;
    }
    if (body.actualFinishDate === undefined) {
      if (body.status === 'Completed') updates.actualFinishDate = todayStr();
      else if (task.status === 'Completed') updates.actualFinishDate = null;
    }
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

  // หมุดหมายของโครงการเข้าเธรด — **เฉพาะขั้นที่ติดธง `isMilestone`** เท่านั้น
  // โครงการหนึ่งมี 20–40 ขั้น ถ้าเอาทุกขั้นที่เปลี่ยนสถานะ เธรดจะกลายเป็น log ของ
  // ระบบงานแล้วบทสนทนาจม (บทเรียนจากเธรดงานส่วนบุคคล: 92% ของแถวเป็นเหตุการณ์ระบบ)
  // ⚠️ ต้องอยู่ก่อนบล็อก recalc ด้านล่างซึ่งมีทางออกหลายทาง (return ได้ 2 จุด)
  // · ขั้นตอนลอยของดีลไม่มีโครงการแม่ = ไม่มีเธรดให้ลง ข้ามไป
  if (project?.id) {
    const event = milestoneDoneUpdate(task, data);
    if (event) await appendUpdate(supabase, { entityType: 'project', entityId: project.id, ...event, user });
  }

  // ── auto status: แก้สถานะ/predecessors ของขั้นนี้ → คำนวณสถานะทั้งกราฟใหม่
  // (กดเสร็จ → ขั้นถัดไปที่พร้อม เป็น In Progress ; ถอย/แก้ pred → ขั้นถัดที่ไม่พร้อม กลับ Pending).
  // client reload เมื่อ status/predecessors เปลี่ยน จึงเห็นผลกับขั้นอื่นทันที.
  if ('status' in updates || 'predecessors' in updates) {
    // task ลอยของดีล: propagate ภายในชุดของดีล (projectId ว่าง + dealId)
    await propagateAndPersist(supabase, project?.id ?? null, { dealId: task.dealId });
  }

  // ── #1 recalc (dependency-driven): แก้วันเริ่ม/จำนวนวัน/predecessors/ปักหมุด →
  // คำนวณ timeline ทั้งกราฟใหม่จากวันเริ่มโครงการตามสาย predecessor จริง แล้ว persist
  // เฉพาะแถวที่เปลี่ยน. ขั้นที่ไม่ผูกกับขั้นนี้จะไม่ขยับ (ต่างจาก slice แบบเดิมที่ลากทุกขั้นที่อยู่หลัง) ──
  const schedulingChanged = SCHEDULE_FIELDS.some((k) => k in updates) || 'startLocked' in updates;
  if (schedulingChanged && (project || task.dealId)) {
    setHolidays([...(await holidaySet())]);
    // ชุดที่ recalc: ทั้งโครงการ หรือชุดลอยของดีล (projectId ว่าง) — anchor ของชุดลอย
    // = วันเริ่มเร็วสุดในชุด (ไม่มีวันเริ่มโครงการให้อิง)
    let setQuery = supabase.from('project_tasks').select('*');
    setQuery = project ? setQuery.eq('projectId', project.id) : setQuery.is('projectId', null).eq('dealId', task.dealId);
    const { data: all } = await setQuery.order('stepOrder', { ascending: true });

    if (all && all.length) {
      const applied = all.map((t) => (t.id === id ? { ...t, ...updates } : t));
      const anchor = project
        ? resolveSchedule(project).anchor
        : (applied.map((t) => t.startDate).filter(Boolean).sort()[0] || todayStr());
      const recalced = recalculateGraph(applied, anchor);

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

  const { task, project, scopeRow } = await loadTaskWithProject(supabase, id);
  if (!task) return notFound('ไม่พบขั้นตอน');
  if (!inScope(pmEditScope(user?.role), user, scopeRow || {})) {
    return forbidden();
  }

  // ด่านหลังปิด (เฟส F): โครงการ closed ลบขั้นตอนไม่ได้ — ต้อง reopen ผ่าน /close ก่อน
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  const { error } = await supabase.from('project_tasks').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  // ── recalc (dependency-driven): ลบขั้นตอนแล้วคำนวณ timeline ของขั้นที่เหลือใหม่ ──
  // 1) ตัด reference ของขั้นที่ถูกลบออกจาก predecessors ของขั้นอื่น
  // 2) recalculateGraph ทั้งกราฟ → ขั้นที่เคยรอขั้นที่ลบจะขยับมาเร็วขึ้นตามจริง (ไม่กระทบขั้นอิสระ)
  if (project || task.dealId) {
    setHolidays([...(await holidaySet())]);
    let setQuery = supabase.from('project_tasks').select('*');
    setQuery = project ? setQuery.eq('projectId', project.id) : setQuery.is('projectId', null).eq('dealId', task.dealId);
    const { data: all } = await setQuery.order('stepOrder', { ascending: true });

    if (all && all.length) {
      // ตัด reference ของขั้นที่ถูกลบออกจาก predecessors ของขั้นอื่น แล้วคำนวณทั้งกราฟใหม่
      const cleaned = all.map((t) =>
        Array.isArray(t.predecessors) && t.predecessors.includes(id)
          ? { ...t, predecessors: t.predecessors.filter((p) => p !== id) }
          : t
      );
      const anchor = project
        ? resolveSchedule(project).anchor
        : (cleaned.map((t) => t.startDate).filter(Boolean).sort()[0] || todayStr());
      const recalced = recalculateGraph(cleaned, anchor);

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
    await propagateAndPersist(supabase, project?.id ?? null, { dealId: task.dealId });
  }

  return ok({ success: true });
});
