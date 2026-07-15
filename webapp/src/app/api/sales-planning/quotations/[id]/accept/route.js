import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, dealAuditLabel, inSalesEditScope } from '@/lib/salesPlanning';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { validateDocumentReadiness } from '@/lib/documentWorkflow';
import { quotationWonAmount } from '@/lib/sales/quotationWonAmount';
import { validateWonEvidence, WON_DOC_TYPE_LABELS } from '@/lib/sales/quotationWonEvidence';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  // หลักฐานบังคับ (feedback ผู้ใช้ 2026-07-15): ไฟล์แนบ + ประเภท + วันที่เอกสาร
  // (+กำหนดชำระเมื่อไม่ใช่เอกสารการชำระ) — validate ที่นี่ก่อน แล้ว RPC ตรวจซ้ำชั้น DB
  const body = await req.json().catch(() => ({}));
  const evidenceCheck = validateWonEvidence(body);
  if (!evidenceCheck.ok) return badRequest(evidenceCheck.error);
  const evidence = evidenceCheck.evidence;

  const { id } = await ctx.params;
  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('quotation not found');
  if (quote.status === 'accepted') return badRequest('ใบเสนอราคานี้ถูกรับแล้ว');
  if (quote.status === 'closed') return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น)');
  if (['cancelled', 'rejected', 'revised'].includes(quote.status)) return badRequest('quotation cannot be accepted');
  // ยอดต้อง > 0 ไม่งั้นการรับจะไปล้าง projectValue ของดีลเป็น 0 (N3)
  if (!(quotationWonAmount(quote) > 0)) return badRequest('ยอดใบเสนอราคาก่อน VAT ต้องมากกว่า 0');

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (!deal.projectId) return badRequest('ต้องเชื่อมโครงการกับดีลก่อนปิด Won ผ่านใบเสนอราคา');
  if (deal.stage === 'lost') return badRequest('ดีลนี้ปิดเป็น Lost แล้ว ไม่สามารถปิด Won ผ่านใบเสนอราคาได้');
  if (['won', 'in_project'].includes(deal.stage)) return badRequest('ดีลนี้ปิดการขาย (Won) แล้ว');

  const currentFingerprint = quotationApprovalFingerprint(quote);
  const readiness = validateDocumentReadiness({
    action: 'accept',
    status: quote.status,
    lineCount: quote.lines?.length || 0,
    totalAmount: quote.totalAmount,
    approvalStatus: 'not_required',
    approvalFingerprint: null,
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
    p_evidence: evidence,
  });
  if (acceptError) {
    if (acceptError.code === '23505' || acceptError.message?.includes('already_has_accepted')) {
      return conflict('ดีลนี้มีใบเสนอราคาที่รับแล้ว');
    }
    const clientError = /quotation_|deal_closed|deal_not_found|deal_project_required/.test(acceptError.message || '');
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
    summary: `mark quotation ${quote.quoteNumber} as Won for ${dealAuditLabel(deal)} (หลักฐาน: ${WON_DOC_TYPE_LABELS[evidence.docType]} ลงวันที่ ${evidence.docDate})`,
    request: req,
  });

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: deal.id,
    before: deal,
    after: updatedDeal,
    summary: `Won deal from quotation ${quote.quoteNumber} (ex VAT ${quotationWonAmount(quote)})`,
    request: req,
  });

  return ok({ quotation: accepted, deal: updatedDeal });
});
