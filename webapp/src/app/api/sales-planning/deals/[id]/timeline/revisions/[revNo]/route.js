import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { canViewSalesPlanning } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/deals/[id]/timeline/revisions/[revNo] — snapshot ของ Rev. นั้น (ไว้พิมพ์ฉบับเก่าซ้ำ)
// ⚠️ snapshot ของดีลไม่มีเงิน/ราคาทุน (DEAL_SNAPSHOT_FIELDS) ⇒ ไม่ต้องตัดช่องแบบ revisions/[revNo] ของโครงการ
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id, revNo } = await ctx.params;
  const n = Number(revNo);
  if (!Number.isInteger(n) || n < 0) return badRequest('เลข Rev. ไม่ถูกต้อง');
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'view');
  if (response) return response;

  const { data, error } = await supabase.from('deal_timeline_revisions')
    .select('id, revNo, note, snapshot, createdBy, createdByName, createdAt')
    .eq('dealId', deal.id).eq('revNo', n).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return notFound(`ไม่พบ Rev. ${n} ของดีลนี้`);
  return ok(data);
});
