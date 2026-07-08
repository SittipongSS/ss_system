import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, dealAuditLabel, inSalesEditScope } from '@/lib/salesPlanning';
import { markWon } from '@/lib/salesPlanningWin';
import { quoteCanBeAccepted } from '@/lib/quotationApproval';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('quotation not found');
  if (['cancelled', 'rejected'].includes(quote.status)) return badRequest('quotation cannot be accepted');
  if (!quoteCanBeAccepted(quote)) return badRequest('quotation approval is required before accept');

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
  if (!deal) return notFound('deal not found');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ดีลนี้ปิดเป็น Lost แล้ว ไม่สามารถรับใบเสนอราคาได้');

  const now = new Date().toISOString();
  const { data: accepted, error: acceptError } = await supabase
    .from('quotations')
    .update({
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: user.name || user.id || null,
      updatedAt: now,
    })
    .eq('id', quote.id)
    .select('*, lines:quotation_lines(*)')
    .single();
  if (acceptError) return fail(acceptError.message, 500);

  let updatedDeal;
  const acceptedMetadata = {
    acceptedQuotationId: quote.id,
    acceptedQuoteNumber: quote.quoteNumber,
    acceptedQuoteAt: now,
  };

  if (deal.depositPaid) {
    try {
      updatedDeal = await markWon({
        supabase,
        user,
        deal,
        source: 'quotation',
        projectValue: quote.totalAmount || 0,
        metadata: acceptedMetadata,
        request: req,
        auditSummary: `update deal from accepted quotation ${quote.quoteNumber}`,
      });
    } catch (dealError) {
      return fail(dealError.message, 500);
    }
  } else {
    const { data: nextDeal, error: dealError } = await supabase
      .from('sales_deals')
      .update({
        stage: 'awaiting_confirm',
        projectValue: quote.totalAmount || 0,
        updatedAt: now,
        metadata: {
          ...(deal.metadata || {}),
          ...acceptedMetadata,
        },
      })
      .eq('id', deal.id)
      .select()
      .single();
    if (dealError) return fail(dealError.message, 500);
    updatedDeal = nextDeal;

    if (deal.stage !== updatedDeal.stage) {
      await supabase.from('sales_deal_stage_history').insert({
        id: genId('DSH'),
        dealId: deal.id,
        fromStage: deal.stage,
        toStage: updatedDeal.stage,
        changedBy: user.id || null,
        changedByName: user.name || null,
      });
    }
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: quote.id,
    before: quote,
    after: accepted,
    summary: `accept quotation ${quote.quoteNumber} for ${dealAuditLabel(deal)}`,
    request: req,
  });

  if (!deal.depositPaid) {
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_deal',
      entityId: deal.id,
      before: deal,
      after: updatedDeal,
      summary: `update deal from accepted quotation ${quote.quoteNumber}`,
      request: req,
    });
  }

  return ok({ quotation: accepted, deal: updatedDeal });
});
