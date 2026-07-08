import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canReviewSalesForecast, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { quoteApprovalRequirement } from '@/lib/quotationApproval';

export const dynamic = 'force-dynamic';

async function loadQuote(supabase, id) {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const quote = await loadQuote(supabase, id);
  if (!quote) return notFound('quotation not found');
  const deal = await loadDeal(supabase, quote.dealId);
  if (!deal) return notFound('deal not found');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'request';
  const now = new Date().toISOString();
  let patch = { updatedAt: now };

  if (action === 'request') {
    if (!canEditSalesPlanning(user)) return forbidden();
    if (!inSalesEditScope(user, deal)) return forbidden();
    if (quote.status === 'accepted') return badRequest('accepted quotation cannot request approval');
    const requirement = quoteApprovalRequirement(quote, quote.metadata || {});
    patch = {
      ...patch,
      approvalStatus: 'pending',
      approvalReason: body.reason || requirement.reason || 'manual approval request',
      approvalRequestedAt: now,
      approvalRequestedBy: user.id || null,
      approvalRequestedByName: user.name || null,
      approvedAt: null,
      approvedBy: null,
      approvedByName: null,
      approvalNotes: body.notes || null,
      metadata: {
        ...(quote.metadata || {}),
        approvalThreshold: requirement.threshold,
      },
    };
  } else {
    if (!canReviewSalesForecast(user)) return forbidden();
    if (!['approve', 'reject'].includes(action)) return badRequest('invalid approval action');
    patch = {
      ...patch,
      approvalStatus: action === 'approve' ? 'approved' : 'rejected',
      approvedAt: now,
      approvedBy: user.id || null,
      approvedByName: user.name || null,
      approvalNotes: body.notes || null,
    };
  }

  const { data, error } = await supabase
    .from('quotations')
    .update(patch)
    .eq('id', quote.id)
    .select('*, lines:quotation_lines(*)')
    .single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: quote.id,
    before: quote,
    after: data,
    summary: `${action} quotation approval ${quote.quoteNumber}`,
    request: req,
  });

  return ok(data);
});
