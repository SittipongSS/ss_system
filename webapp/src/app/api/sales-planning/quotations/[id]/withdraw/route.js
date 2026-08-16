import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { canViewSalesPlanning, dealAuditLabel } from '@/lib/salesPlanning';
import { canWithdrawQuotationSubmission } from '@/lib/sales/quotationWorkflow';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
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

  const { row: quote, response } = await loadScoped(supabase, 'quotations', id, user, 'view');
  if (response) return response;

  // ดึงกลับเป็นการกระทำของผู้ยื่นเท่านั้น (มติ 2026-07-26) — ผู้อนุมัติใช้ /reject แทน
  if (!canWithdrawQuotationSubmission(quote, { userId: user.id })) {
    return forbidden('ดึงกลับได้เฉพาะผู้ยื่นเอกสารเอง — ผู้อนุมัติให้ใช้ “ตีกลับให้แก้ไข”');
  }
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

  // เหตุการณ์ลงเธรดของใบ — ไม่เช็ค error โดยเจตนา (ดู submit/route.js)
  await appendDocumentEvent(supabase, {
    docType: 'quotation', doc: quote, action: 'withdraw', opts: { reason }, user,
  });

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: id,
    before: quote,
    after: data,
    summary: `ดึงกลับใบเสนอราคา ${quote.quoteNumber}: ${reason} (${dealAuditLabel(quote.deal)})`,
    request: req,
  });
  return ok(data);
});
