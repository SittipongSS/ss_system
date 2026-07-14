import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, dealAuditLabel, inSalesEditScope } from '@/lib/salesPlanning';
import { quoteCanBeAccepted } from '@/lib/quotationApproval';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { validateDocumentReadiness } from '@/lib/documentWorkflow';

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
  if (quote.status === 'accepted') return badRequest('ใบเสนอราคานี้ถูกรับแล้ว');
  if (['cancelled', 'rejected'].includes(quote.status)) return badRequest('quotation cannot be accepted');
  if (!quoteCanBeAccepted(quote)) return badRequest('quotation approval is required before accept');
  // ยอดต้อง > 0 ไม่งั้นการรับจะไปล้าง projectValue ของดีลเป็น 0 (N3)
  if (!(Number(quote.totalAmount) > 0)) return badRequest('ใบเสนอราคายอดรวมต้องมากกว่า 0');

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ดีลนี้ปิดเป็น Lost แล้ว ไม่สามารถรับใบเสนอราคาได้');
  if (['won', 'in_project'].includes(deal.stage)) return badRequest('ดีลนี้ปิดการขาย (Won) แล้ว');

  const currentFingerprint = quotationApprovalFingerprint(quote);
  const readiness = validateDocumentReadiness({
    action: 'accept',
    status: quote.status,
    lineCount: quote.lines?.length || 0,
    totalAmount: quote.totalAmount,
    approvalStatus: quote.approvalStatus,
    approvalFingerprint: quote.approvalFingerprint,
    currentFingerprint,
  });
  if (!readiness.ok) return badRequest(readiness.error);

  const { data: result, error: acceptError } = await supabase.rpc('accept_quotation_atomic', {
    p_quote_id: quote.id,
    p_current_fingerprint: currentFingerprint,
    p_actor_id: user.id || null,
    p_actor_name: user.name || null,
    p_history_id: genId('DSH'),
    p_forecast_id: genId('DFC'),
  });
  if (acceptError) {
    if (acceptError.code === '23505' || acceptError.message?.includes('already_has_accepted')) {
      return conflict('ดีลนี้มีใบเสนอราคาที่รับแล้ว');
    }
    const clientError = /quotation_|deal_closed|deal_not_found/.test(acceptError.message || '');
    return fail(acceptError.message, clientError ? 400 : 500);
  }
  const accepted = { ...(result?.quotation || {}), lines: quote.lines || [] };
  const updatedDeal = result?.deal;

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

  return ok({ quotation: accepted, deal: updatedDeal });
});
