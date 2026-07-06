import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, dealAuditLabel, inSalesEditScope } from '@/lib/salesPlanning';
import { markWon } from '@/lib/salesPlanningWin';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/deals/[id]/win — one-click close: mark the deal Won.
// Win = confirmed + deposit paid (D3), so markWon sets depositPaid/confirmedAt/
// probability=100 and moves to in_project when a PM project is linked. Central
// markWon() is the single source (also used by quotation accept / Sahamit PO).
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { data: deal, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!deal) return notFound('ไม่พบ deal');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('deal นี้ lost แล้ว ปิดเป็น Won ไม่ได้');
  if (['won', 'in_project'].includes(deal.stage)) return ok(deal); // already won — idempotent

  try {
    const updated = await markWon({
      supabase,
      user,
      deal,
      source: 'manual',
      request: req,
      auditSummary: `ปิดดีล (Won) ${dealAuditLabel(deal)}`,
    });
    return ok(updated);
  } catch (e) {
    return fail(e.message, 500);
  }
});
