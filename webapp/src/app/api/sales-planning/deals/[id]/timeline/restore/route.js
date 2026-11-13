import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { dealAuditLabel } from '@/lib/salesPlanning';
import { canEditDealTimeline } from '@/lib/sales/dealTimelineAccess';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/deals/[id]/timeline/restore  body: { revNo }
// ย้อนขั้นตอน "ทั้งชุดของดีลนี้" กลับไปเท่ากับ Rev. ที่เลือก — atomic ใน RPC `deal_restore_timeline_revision`
// (mig 0436): ลบขั้นของดีลแล้วใส่กลับจาก snapshot พร้อม dealId/projectId · ตั้ง Rev. ปัจจุบัน + ล้าง "แก้แล้ว"
// ขั้นของดีลอื่น/งานกลางในโครงการเดียวกันไม่ถูกแตะ · ประวัติ Rev. อื่นยังอยู่ครบ ย้อนไปมาได้
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'edit');
  if (response) return response;
  if (!canEditDealTimeline(user, deal)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const revNo = Number(body.revNo);
  if (!Number.isInteger(revNo) || revNo < 0) return badRequest('ต้องระบุเลข Rev. ที่จะย้อนกลับ');

  const { data, error } = await supabase.rpc('deal_restore_timeline_revision', { p_deal_id: deal.id, p_rev_no: revNo });
  if (error) {
    if (error.code === 'P0002') return notFound(`ไม่พบ Rev. ${revNo} ของดีลนี้`);
    return fail(error.message, 500);
  }

  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id,
    summary: `ย้อนไทม์ไลน์ของดีล ${dealAuditLabel(deal)} กลับไป Rev. ${revNo} (เขียนทับ ${data?.overwritten || 0} · สร้างคืน ${data?.recreated || 0} · ลบ ${data?.deleted || 0})`,
    request: req,
  });
  return ok({ ...(data || {}), currentRev: revNo });
});
