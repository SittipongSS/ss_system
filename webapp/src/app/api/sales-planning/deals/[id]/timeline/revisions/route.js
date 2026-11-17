import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, conflict, forbidden, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { canViewSalesPlanning, dealAuditLabel } from '@/lib/salesPlanning';
import { canEditDealTimeline } from '@/lib/sales/dealTimelineAccess';
import { buildDealTimelineSnapshot, nextTimelineRev, TIMELINE_STANDARD_KEY } from '@/lib/sales/dealTimelineRevisions';

export const dynamic = 'force-dynamic';

// ── Rev. ไทม์ไลน์ของดีล (งวด P2b ยุบดีล/โครงการ · มติเจ้าของ 13/11/2026 ①: เลขที่เอกสาร = รหัสดีล + Rev.) ──
// GET  = ประวัติ Rev. (ไม่ส่ง snapshot ก้อนใหญ่) · POST = ออก Rev. ใหม่ (ถ่าย snapshot จากฐาน ไม่เชื่อจอ)
// โมเดลเดียวกับ /api/pm/projects/[id]/revisions ย้ายมาอยู่บนดีล — ตารางคือ deal_timeline_revisions (mig 0435)

const REVISION_LIST_COLUMNS = 'id, revNo, note, createdBy, createdByName, createdAt';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'view');
  if (response) return response;

  const { data, error } = await supabase.from('deal_timeline_revisions')
    .select(REVISION_LIST_COLUMNS).eq('dealId', deal.id)
    .order('revNo', { ascending: false });
  if (error) return fail(error.message, 500);
  const revisions = data || [];
  return ok({
    revisions,
    currentRev: deal.timelineRev ?? null,
    stale: !!deal.timelineRevStale,
    maxRev: revisions.length ? revisions[0].revNo : null,
  });
});

// มาตรฐานเอกสารไทม์ไลน์ที่เผยแพร่อยู่ (แถวเวอร์ชันเต็ม — รูปเดียวกับ projects.timelineStandardSnapshot ของ mig 0198)
async function publishedTimelineStandard(supabase) {
  const { data: standard, error } = await supabase.from('document_standards')
    .select('publishedVersionId').eq('documentKey', TIMELINE_STANDARD_KEY).maybeSingle();
  if (error) throw error;
  if (!standard?.publishedVersionId) return null;
  const { data: version, error: versionError } = await supabase.from('document_standard_versions')
    .select('*').eq('id', standard.publishedVersionId).maybeSingle();
  if (versionError) throw versionError;
  return version || null;
}

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'edit');
  if (response) return response;
  if (!canEditDealTimeline(user, deal)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const [tasksResult, projectResult, maxResult] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('dealId', deal.id).order('stepOrder', { ascending: true }),
    // โครงการที่ดีล (ผ่านด่านแล้ว) ชี้อยู่ — มาตรฐานฟอร์มที่ตรึงไว้ · หายไปพร้อมตาราง projects ในงวด P3
    deal.projectId
      ? supabase.from('projects').select('*').eq('id', deal.projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('deal_timeline_revisions').select('revNo').eq('dealId', deal.id)
      .order('revNo', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [tasksResult, projectResult, maxResult]) {
    if (result.error) return fail(result.error.message, 500);
  }
  const tasks = tasksResult.data || [];
  if (!tasks.length) return conflict('ดีลนี้ยังไม่มีไทม์ไลน์ — สร้างไทม์ไลน์ก่อนออก Rev.');
  const project = projectResult.data;

  // ดีลในโครงการ: ใช้มาตรฐานที่โครงการตรึงไว้ (กระดาษที่ออกไปแล้วใช้ฟอร์มชุดนั้น) · ไม่มี = ที่เผยแพร่อยู่ตอนนี้
  let standard = project?.timelineStandardSnapshot || null;
  if (!standard) {
    try { standard = await publishedTimelineStandard(supabase); } catch (error) { return fail(error.message, 500); }
  }

  const revNo = nextTimelineRev(maxResult.data?.revNo);
  const snapshot = buildDealTimelineSnapshot({ deal, project, tasks, standard });
  const { data: rev, error: insertError } = await supabase.from('deal_timeline_revisions')
    .insert({ dealId: deal.id, revNo, snapshot, note, createdBy: user.id || null, createdByName: user.name || null })
    .select(REVISION_LIST_COLUMNS).single();
  if (insertError) {
    // UNIQUE (dealId, revNo) — อีกหน้าต่างออกเลขเดียวกันไปก่อน
    if (insertError.code === '23505') return conflict('มีการออก Rev. นี้จากหน้าต่างอื่นไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง');
    return fail(insertError.message, 500);
  }

  // live = snapshot ที่เพิ่งถ่าย ⇒ ชี้ Rev. ใหม่ + ล้าง "แก้แล้ว"
  const { error: updateError } = await supabase.from('sales_deals')
    .update({ timelineRev: revNo, timelineRevStale: false }).eq('id', deal.id);
  if (updateError) return fail(updateError.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id,
    summary: `ออก Rev. ${revNo} ไทม์ไลน์ของดีล ${dealAuditLabel(deal)} (${tasks.length} ขั้นตอน)${note ? ` · ${note}` : ''}`,
    request: req,
  });
  return ok({ ...rev, currentRev: revNo }, 201);
});
