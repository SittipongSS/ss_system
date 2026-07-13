import { withUser, ok, fail, badRequest, forbidden, notFound } from "@/lib/http";
import { inPmProjectScope } from "@/lib/permissions";
import { loadProject } from "@/lib/pm/projectsRepo";
import { normalizeDealOrder, reindexTasksByDealOrder } from "@/lib/pm/dealOrder";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PUT /api/pm/projects/[id]/deal-order
// บันทึกลำดับ segment ของดีล และจัด stepOrder ของ task ทั้งโครงการให้เรียงตามดีลนั้น
export const PUT = withUser(async ({ user, supabase, req, ctx }) => {
  const { id: idOrCode } = await ctx.params;
  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound("ไม่พบโครงการ");
  if (!inPmProjectScope(user, project)) return forbidden();

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.dealIds)) return badRequest("ต้องระบุ dealIds เป็นรายการ");

  const [{ data: deals, error: dealsError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase.from("sales_deals").select("id").eq("projectId", project.id).order("createdAt", { ascending: true }),
    supabase.from("project_tasks").select("id, dealId, stepOrder").eq("projectId", project.id).order("stepOrder", { ascending: true }),
  ]);
  if (dealsError) return fail(dealsError.message, 500);
  if (tasksError) return fail(tasksError.message, 500);

  const dealIds = normalizeDealOrder(deals || [], body.dealIds);
  const reorderedTasks = reindexTasksByDealOrder(tasks || [], dealIds);
  const metadata = { ...(project.metadata || {}), dealOrder: dealIds };
  const now = new Date().toISOString();

  const taskUpdates = reorderedTasks
    .filter((task) => (tasks || []).find((row) => row.id === task.id)?.stepOrder !== task.stepOrder)
    .map((task) => supabase.from("project_tasks").update({ stepOrder: task.stepOrder, updatedAt: now }).eq("id", task.id));
  const results = await Promise.all(taskUpdates);
  const taskError = results.find((result) => result.error)?.error;
  if (taskError) return fail(taskError.message, 500);

  const { error: projectError } = await supabase.from("projects").update({ metadata, updatedAt: now }).eq("id", project.id);
  if (projectError) return fail(projectError.message, 500);

  await recordAudit({
    user,
    action: "update",
    entityType: "project",
    entityId: project.id,
    before: { dealOrder: project.metadata?.dealOrder || [] },
    after: { dealOrder: dealIds },
    summary: `จัดลำดับดีลในโครงการ ${project.code || project.id}`,
    request: req,
  });
  return ok({ dealIds, updatedTasks: taskUpdates.length });
});
