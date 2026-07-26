import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canApproveQuotation,
  canViewSalesPlanning,
  dealAuditLabel,
  inSalesViewScope,
} from '@/lib/salesPlanning';
import { canWithdrawQuotationSubmission } from '@/lib/sales/quotationWorkflow';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/quotations/[id]/withdraw
// pending → not_submitted. The actual proposer or the current QT approver may
// withdraw. Signature evidence remains immutable; only the active pointer ends.
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  // เวอร์ชันที่ "หน้าเว็บเห็น" ไม่ใช่ที่ server เพิ่งอ่าน — ดู lib/sales/documentConcurrency.js
  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return badRequest(expected.error);

  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, deal:sales_deals(id, title, code, ownerId, ownerName, team, stage, customerName)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (!quote.deal || !inSalesViewScope(user, quote.deal)) return forbidden();

  const approver = canApproveQuotation(user, quote.deal);
  const allowed = canWithdrawQuotationSubmission(quote, { userId: user.id, approver });
  if (!allowed) return forbidden('ถอนการยื่นได้เฉพาะผู้ยื่นหรือผู้อนุมัติ');
  // A proposer who has since lost edit capability still owns the pending
  // submission and may withdraw it; they simply cannot edit afterward.

  const { data, error: rpcError } = await supabase.rpc('withdraw_quotation_submission_atomic', {
    p_quote_id: id,
    p_expected_updated_at: expected.value,
    p_reason: reason,
    p_actor_id: user.id,
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (rpcError) {
    const mapped = documentWorkflowError(rpcError, { context: `quotation withdraw ${id}` });
    return fail(mapped.message, mapped.status);
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: id,
    before: quote,
    after: data,
    summary: `ถอนการยื่นใบเสนอราคา ${quote.quoteNumber}: ${reason} (${dealAuditLabel(quote.deal)})`,
    request: req,
  });
  return ok(data);
});
