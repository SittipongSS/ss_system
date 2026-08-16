import { recordAudit } from '@/lib/audit';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { canApproveQuotation, canViewSalesPlanning, dealAuditLabel } from '@/lib/salesPlanning';
import { canRejectQuotationSubmission } from '@/lib/sales/quotationWorkflow';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/quotations/[id]/reject — "ตีกลับ" (มติผู้ใช้ 2026-07-26)
// pending → not_submitted พร้อมเหตุผลที่ผู้จัดทำมองเห็นบนใบ. ต่างจาก /withdraw
// ("ดึงกลับ") ตรงที่คนละฝ่ายเป็นผู้ทำ และการตีกลับต้องทิ้งร่องรอยให้ผู้จัดทำรู้ว่าต้องแก้อะไร
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return badRequest(expected.error);

  // โหลด + ตรวจขอบเขตในจังหวะเดียว — ไม่มีจังหวะที่ถือแถวไว้โดยยังไม่ผ่านด่าน
  const { row: quote, response } = await loadScoped(supabase, 'quotations', id, user, 'view');
  if (response) return response;

  const approver = canApproveQuotation(user, quote.deal);
  if (!canRejectQuotationSubmission(quote, { approver, userId: user.id })) {
    return forbidden('ตีกลับได้เฉพาะผู้อนุมัติของใบเสนอราคาที่กำลังรออนุมัติ — ใบที่ยื่นเองให้ใช้ “ดึงกลับมาแก้ไข”');
  }

  const { data, error: rpcError } = await supabase.rpc('reject_quotation_submission_atomic', {
    p_quote_id: id,
    p_expected_updated_at: expected.value,
    p_reason: reason,
    p_actor_id: user.id,
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (rpcError) {
    const mapped = documentWorkflowError(rpcError, { context: `quotation reject ${id}` });
    return fail(mapped.message, mapped.status);
  }

  // เหตุการณ์ลงเธรดของใบ — ไม่เช็ค error โดยเจตนา (ดู submit/route.js)
  // ⭐ แถวนี้คือหัวใจของ PR: `rejectionReason` ถูกล้างทิ้งตอนยื่นใหม่/กู้คืน
  // เหตุผลที่ตีกลับรอบก่อน ๆ จึงไม่เคยเหลือให้คนทำใบรอบถัดไปอ่าน
  await appendDocumentEvent(supabase, {
    docType: 'quotation', doc: quote, action: 'reject', opts: { reason }, user,
  });

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: id,
    before: quote,
    after: data,
    summary: `ตีกลับใบเสนอราคา ${quote.quoteNumber}: ${reason} (${dealAuditLabel(quote.deal)})`,
    request: req,
  });
  // แจ้งทีมขายเหมือนฝั่งใบสั่งขาย — ผู้จัดทำต้องรู้ว่าต้องกลับมาแก้ ไม่ใช่รอเงียบ ๆ
  return ok(data);
});
