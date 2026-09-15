import { viewScope, can, canDeleteRecord, inPmProjectScope } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { rollupDeals } from '@/lib/sales/projectRollup';
import { canApproveProjectClose, isProjectCloseWaitingOnMe } from '@/lib/pm/projectClose';
import { teamInClause } from '@/lib/teamScope';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects — team-scoped list (supervisor sees all).
export const GET = withUser(async ({ user, supabase }) => {
  // PM is a sales-only tool: gate on the pm:view capability (not just scope).
  // RA has viewScope 'all' but no pm:view — without this it would read every
  // team's projects. viewer/staff hold pm:view and pass.
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  let query = supabase.from('projects').select('*').order('createdAt', { ascending: false });
  if (viewScope(user?.role) === 'team') {
    /* 🐞 **`projects."ownerId"` เป็น uuid** (mig 0008) ต่างจาก ownerId ของตารางอื่นที่เป็น text
       ⇒ ผู้ใช้สมมติตอน devBypass (`id` ไม่ใช่ uuid โดยเจตนา ดู lib/devBypass.js) ทำให้
       Postgres ตีกลับทั้งคำสั่ง `22P02 invalid input syntax for type uuid` แล้วเราท์นี้
       ตอบ 500 ⇒ **หน้ารวมโครงการเปิดไม่ขึ้นเลยตอน UAT** (เจอตอน UAT 2026-09-09)
       ⚠️ **แก้ที่คำสั่ง ไม่ใช่ที่ id** — id ที่ไม่ใช่ uuid คือด่านสุดท้ายที่กันไม่ให้
       เซสชัน UAT ปั๊มเจ้าของ/ผู้อนุมัติผีลงฐานข้อมูลจริง (โหมดนี้ proxy ข้ามด่านเขียน
       ทั้งหมด และเขียนลง prod ตรง ๆ — ดู proxy.js:32 กับ [[dev-db-is-prod-db]])
       ผู้ใช้สมมติไม่มีทางเป็นเจ้าของโครงการอยู่แล้ว ⇒ ตัดเงื่อนไขเจ้าของทิ้งได้ตรง ๆ
       เหลือขอบเขตทีม ซึ่งเป็นความจริงของบัญชีนั้น */
    const own = user?.id ?? '';
    query = user?.devBypass
      ? query.or(teamInClause(user))
      : query.or(`${teamInClause(user)},ownerId.eq.${own}`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  // Attach a lightweight task summary so the list UI can render the done/total
  // progress without a round-trip per project. Only `status` is read on the list.
  const ids = (data || []).map((p) => p.id);
  if (ids.length) {
    /* 🐞 เดิมทิ้ง error ของสองการอ่านนี้ (`const [{ data: tasks }, { data: deals }]`) ⇒ อ่านดีล
       ไม่ขึ้นแล้ว **ทุกโครงการขึ้น FC Total / Actual / FC คงเหลือ / รออนุมัติ เป็น 0 เงียบ ๆ**
       ซึ่งหน้าตาเหมือน "ยังไม่มีดีล" ทุกประการ — อ่านไม่ขึ้นต้องเป็น 500 ไม่ใช่ตัวเลขศูนย์
       ⚠️ `ids` = ทุกโครงการที่มองเห็น ⇒ `.in('projectId', ids)` ตรง ๆ โตจนเกินเพดาน URL 16 KB
       ของ PostgREST ได้ (lib/supabaseInChunks) และ project_tasks เกิน 1,000 แถวไปนานแล้ว (ถูกตัดเงียบ)
       ⇒ ซอยลิสต์เป็นก้อน (fetchInChunks) แล้วไล่หน้าในก้อน (fetchAllResult)
       ⭐ ลำดับดีลต่อโครงการยังถูกโดยไม่ต้องเรียงใหม่ — ดีลของโครงการเดียวอยู่ก้อนเดียวกันเสมอ
          (ซอยตาม projectId) และในก้อนเรียงตาม createdAt แล้วตัดสินเสมอด้วย id */
    const [{ data: tasks, error: tasksError }, { data: deals, error: dealsError }] = await Promise.all([
      /* งานใช้แค่นับความคืบหน้า "เสร็จ/ทั้งหมด" บน /sa/projects (อ่าน `status` ช่องเดียว) —
         จอเลือกโครงการอีก ~14 จุดที่เรียกเส้นนี้ไม่อ่านงานเลย ⇒ ดึงเฉพาะช่องที่ใช้ (id ไว้ตัดสิน
         ลำดับตอนไล่หน้า) · อ่านครบทุกแถวแล้ว ส่งชื่อ/วันที่/ลำดับขั้นไปด้วยเท่ากับส่งหลายพันแถวทิ้ง */
      fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
        .from('project_tasks')
        .select('id, projectId, status')
        .in('projectId', chunk)
        .order('id', { ascending: true }))),
      // เฟส B: ดีลของแต่ละโครงการ (หลายดีลต่อโครงการ) — หน้ารวมโครงการใช้คิด KPI
      // FC Total / Actual / FC คงเหลือ ต่อแถว ผ่าน rollup กลาง
      fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
        .from('sales_deals')
        .select('id, projectId, title, stage, dealType, projectValue, wonValue, forecastMonth, metadata, createdAt')
        .in('projectId', chunk)
        .order('createdAt', { ascending: true })
        .order('id', { ascending: true }))),
    ]);
    if (tasksError) return fail(tasksError.message, 500);
    if (dealsError) return fail(dealsError.message, 500);
    const byProject = {};
    for (const t of tasks || []) (byProject[t.projectId] ??= []).push(t);
    const dealsByProject = {};
    for (const d of deals || []) (dealsByProject[d.projectId] ??= []).push(d);
    for (const p of data) {
      p.tasks = byProject[p.id] || [];
      p.deals = dealsByProject[p.id] || [];
      p.dealsRollup = rollupDeals(p.deals);
    }
  }

  // Expose row-level actions from the same permission rules used by the detail
  // and mutation endpoints, so the project table never guesses from role names.
  for (const project of data || []) {
    project.canEdit = inPmProjectScope(user, project);
    project.canDelete = canDeleteRecord(user, 'projects', project);
    // ผู้อนุมัติปิดโครงการ — หน้ารายการต้องรู้ ไม่งั้นปุ่ม "อนุมัติปิด"/"ตีกลับ" ในแถว
    // ไม่มีทางโผล่เลย (หน้ารายละเอียดส่งค่านี้อยู่แล้ว หน้ารายการเพิ่งมีคนใช้)
    project.canApproveClose = canApproveProjectClose(user);
    // ใช้เทียบว่าคำขอปิดเป็นของเราเอง — คนยื่นอนุมัติเองไม่ได้ (API ก็ปฏิเสธ)
    project.me = { id: user.id, name: user.name, role: user.role, team: user.team, teams: user.teams };
    // ธงเดียวกับที่ป้ายตัวเลขบนเมนูนับ (ม-114) — helper ตัวเดียวกับหน้ารายละเอียด
    project._waitingOnMe = isProjectCloseWaitingOnMe(project, user);
  }

  return ok(data);
});

// POST /api/pm/projects — ปิดแล้ว (แผน merge เฟส 2): โครงการทุกงานเกิดจาก
// "บริหารงานขาย" (สร้างโครงการ → create-project) หรือ PO สหมิตรเท่านั้น เพื่อให้
// Sales เป็นแม่ และไม่มีโครงการลอยที่ไม่ผูกงานขาย. การแก้ไข (PATCH [id]) ยังทำได้ปกติ.
export const POST = withUser(async ({ user }) => {
  if (!user) return unauthorized();
  return forbidden('สร้างโครงการที่หน้า "บริหารงานขาย" (สร้างโครงการ แล้วกดสร้างงานผลิต) — การสร้างโครงการเดี่ยวในระบบจัดการโครงการถูกปิดแล้ว');
});
