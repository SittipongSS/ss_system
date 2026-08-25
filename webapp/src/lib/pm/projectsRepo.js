// Data-access helpers for PM projects — mirrors the lib/master/* repo pattern.
// Routes should load projects / team scope / next code through here instead of
// re-querying Supabase inline (which had drifted into 3 divergent copies).
import { purgeUpdatesMany } from '@/lib/master/updates';
import { userTeams } from '@/lib/permissions';
import { purgeAttachments } from '@/lib/master/attachments';
import { fetchAllResult } from '@/lib/supabaseFetchAll';

// Resolve a URL segment to a project. Internal ids ('PRJ-######') and human
// project codes ('PJ-YYMMNNN') never collide, so accept either: try id first,
// then fall back to code. Callers must use the returned row's real `id` for any
// project_tasks / project_products subqueries (those FK the internal id).
// (Canonical version — replaces the id-only copies that 404'd on a human code.)
export async function loadProject(supabase, idOrCode) {
  const { data, error } = await supabase
    .from('projects').select('*').eq('id', idOrCode).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: byCode, error: codeErr } = await supabase
    .from('projects').select('*').eq('code', idOrCode).maybeSingle();
  if (codeErr) throw codeErr;
  return byCode;
}

// Internal project ids for a team (used to scope project_tasks / personal_tasks).
// `team` รับได้ทั้งทีมเดียวและอาร์เรย์ (ผู้ใช้อยู่หลายทีม) — ไม่มีทีมเลย = ไม่มีโครงการ
export async function teamProjectIds(supabase, team) {
  const teams = userTeams(team);
  if (!teams.length) return [];
  const { data } = await supabase.from('projects').select('id').in('team', teams);
  return (data || []).map((p) => p.id);
}

// Whether a project has excise registrations pointing at it. excise_registrations
// .projectId is a *logical* link (no FK, migration 0066) so deleting the project
// would silently orphan tax records — callers block deletion when this is true.
export async function projectHasExciseRegistrations(supabase, projectId) {
  const { count, error } = await supabase
    .from('excise_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('projectId', projectId);
  if (error) throw error;
  return (count || 0) > 0;
}

// Delete a project and every child row it owns. FK ON DELETE CASCADE already
// removes project_tasks / project_products / shipment_prep(+lines); sahamit_pos
// .projectId is SET NULL. But personal_tasks, project_doc_revisions, dept_requests
// AND material_deliveries link by a *logical* projectId (no FK, migrations
// 0019/0040/0104/0176) so we clear them by hand first — otherwise they dangle. dept_requests also own their thread
// + back-linked personal_tasks (both no-FK), removed transitively. Caller is
// responsible for permission + blocker checks (see projectHasExciseRegistrations).
// Returns the removed child counts.
export async function deleteProjectDeep(supabase, projectId) {
  const [{ count: taskCount }, { count: revCount }] = await Promise.all([
    supabase.from('personal_tasks').select('id', { count: 'exact', head: true }).eq('projectId', projectId),
    supabase.from('project_doc_revisions').select('id', { count: 'exact', head: true }).eq('projectId', projectId),
  ]);
  // Logical-link children: remove before the project row disappears.
  /* ไฟล์แนบของงานใต้โครงการต้องไปก่อนแถว — polymorphic ไม่มี FK cascade
     (เส้นลบงานทีละใบเรียก purgeAttachments อยู่แล้ว เส้นชุดนี้เคยหลุด) */
  {
    // ⚠️ ไล่ทีละหน้า — เหตุผลเดียวกับ forceDelete: ตัดที่ 1,000 = ไฟล์แนบค้างกำพร้า
    const { data: tasks } = await fetchAllResult(() => supabase
      .from('personal_tasks').select('id').eq('projectId', projectId).order('id', { ascending: true }));
    for (const task of tasks || []) await purgeAttachments('personal_task', task.id, supabase);
  }
  await supabase.from('personal_tasks').delete().eq('projectId', projectId);
  await supabase.from('project_doc_revisions').delete().eq('projectId', projectId);
  // ของเข้า (mig 0176) — projectId เป็น logical link ไม่มี FK เช่นกัน
  await supabase.from('material_deliveries').delete().eq('projectId', projectId);
  // dept_requests.projectId is a no-FK logical link (mig 0173) — clean the thread +
  // its messages + any task created from it, else they orphan silently.
  const { data: inqs } = await supabase.from('dept_requests').select('id').eq('projectId', projectId);
  const inquiryIds = (inqs || []).map((r) => r.id);
  if (inquiryIds.length) {
    // เธรดเป็น polymorphic ไม่มี FK — กวาดเอง (บรรทัด/ชั้นจำนวนมี FK CASCADE แล้ว)
    await purgeUpdatesMany(supabase, 'dept_request', inquiryIds);
    {
      const { data: tasks } = await fetchAllResult(() => supabase
        .from('personal_tasks').select('id').in('inquiryId', inquiryIds).order('id', { ascending: true }));
      for (const task of tasks || []) await purgeAttachments('personal_task', task.id, supabase);
    }
    await supabase.from('personal_tasks').delete().in('inquiryId', inquiryIds);
    // ⚠️ guard_dept_request บล็อกการลบคำร้องที่ส่งแล้ว — ต้องผ่าน RPC ทีละใบ
    for (const requestId of inquiryIds) {
      await supabase.rpc('force_delete_dept_request', { p_id: requestId });
    }
  }
  // เธรดของตัวโครงการเอง (entity_updates + notifications) — polymorphic ไม่มี FK
  // เช่นกัน ไม่กวาด = กระดิ่งเหลือแถวที่กดแล้วไปเจอโครงการที่ไม่มีแล้ว
  await purgeUpdatesMany(supabase, 'project', [projectId]);
  // เอกสารร่วมของโครงการ (entityType `project`) — กวาดก่อนแถวหาย
  await purgeAttachments('project', projectId, supabase);
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
  return { personalTasks: taskCount || 0, docRevisions: revCount || 0, inquiries: inquiryIds.length };
}

// โครงการเหลือ "โครงเปล่า" ไหมหลังดีลใบหนึ่งถูกลบ — คืน null ถ้ายังมีดีลอื่นผูกอยู่.
// เฟส B ตั้งใจไม่ลบโครงการตามดีล (โครงการอาจรอดีลใหม่มาผูก) แต่ถ้าไม่บอกใครเลย
// โครงเปล่าจะค้างในรายการโดยไม่มีใครสังเกต — prod 2026-07-30 เจอค้าง 3 ใบ (0 ดีล
// 0 ขั้นตอน) ซึ่งผู้ใช้อ่านว่า "ลบดีลแล้วไทม์ไลน์ยังอยู่". ผู้เรียกเอาไปถามผู้ใช้ต่อ
// ว่าจะลบโครงการทิ้งด้วยไหม — ไม่ลบให้เอง.
// tasksLeft = ขั้นตอนที่ยังเหลือในโครงการ (งานกลางที่ไม่ได้ผูกดีลใบไหน) ต้องบอกด้วย
// เพราะถ้ามีเหลือ การลบโครงการจะพาไทม์ไลน์ชุดนั้นไปด้วย — ผู้ใช้ควรรู้ก่อนตัดสินใจ.
export async function emptyProjectAfterDealDelete(supabase, project) {
  if (!project?.id) return null;
  const { count: dealsLeft, error: dealsError } = await supabase
    .from('sales_deals').select('id', { count: 'exact', head: true }).eq('projectId', project.id);
  // นับพลาดแล้วเงียบ = count เป็น null → อ่านเป็น 0 → ชวนผู้ใช้ลบโครงการที่ยังมีดีลผูกอยู่
  if (dealsError) throw new Error(`นับดีลที่เหลือในโครงการไม่สำเร็จ: ${dealsError.message}`);
  if ((dealsLeft || 0) > 0) return null;
  const { count: tasksLeft, error: tasksError } = await supabase
    .from('project_tasks').select('id', { count: 'exact', head: true }).eq('projectId', project.id);
  if (tasksError) throw new Error(`นับขั้นตอนที่เหลือในโครงการไม่สำเร็จ: ${tasksError.message}`);
  return {
    id: project.id,
    code: project.code || project.id,
    name: project.name || '',
    tasksLeft: tasksLeft || 0,
  };
}

// รหัสโครงการฐาน PJ-YYMMXXXX (เลขรัน 4 หลัก ต่อเดือน — mig 0096)
// แสดงเป็น PJ-YYMMXXXX-R ที่ฝั่ง UI/เอกสาร (R = currentRev ผ่าน entityCodeDisplay)
//
// ⚠️ **ไม่มีฟังก์ชัน "ขอรหัสมาถือไว้ก่อน" อีกแล้ว** (มติผู้ใช้ 2026-08-12) — รหัสออก
// พร้อม insert ในทรานแซกชันเดียวผ่าน insertRowWithEntityCode(supabase, 'PJ', row)
// ของ lib/entityCode.js (mig 0240) · ตัวเดิม generateProjectCode() จองเลขคนละคำสั่ง
// กับ insert ⇒ ทุก insert ที่ล้ม (รวมลูป retry ที่ออกรหัสใหม่ทุกรอบ) กินเลขทิ้ง
