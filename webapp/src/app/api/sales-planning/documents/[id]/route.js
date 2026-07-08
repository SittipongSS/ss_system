import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

const DOC_KINDS = new Set(['customer_brief', 'quotation', 'deposit_proof', 'po', 'tax_docs', 'other']);
const DOC_STATUSES = new Set(['pending', 'received', 'waived']);

async function loadDocument(supabase, id) {
  const { data, error } = await supabase.from('sales_deal_documents').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDocument(supabase, id);
  if (!before) return notFound('document not found');

  const deal = await loadDeal(supabase, before.dealId);
  if (!deal) return notFound('ไม่พบโครงการ');
  if (!inSalesEditScope(user, deal)) return forbidden();

  const body = await req.json();
  const patch = { updatedAt: new Date().toISOString() };
  if ('kind' in body) patch.kind = DOC_KINDS.has(body.kind) ? body.kind : before.kind;
  if ('title' in body && body.title?.trim()) patch.title = body.title.trim();
  if ('status' in body) patch.status = DOC_STATUSES.has(body.status) ? body.status : before.status;
  if ('dueDate' in body) patch.dueDate = body.dueDate || null;
  if ('notes' in body) patch.notes = body.notes || null;
  if ('attachmentId' in body) patch.attachmentId = body.attachmentId || null;
  if ('metadata' in body) patch.metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  const { data, error } = await supabase.from('sales_deal_documents').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal_document',
    entityId: data.id,
    before,
    after: data,
    summary: `update document checklist item for ${deal.title}`,
    request: req,
  });
  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDocument(supabase, id);
  if (!before) return notFound('document not found');

  const deal = await loadDeal(supabase, before.dealId);
  if (!deal) return notFound('ไม่พบโครงการ');
  if (!inSalesEditScope(user, deal)) return forbidden();

  const { error } = await supabase.from('sales_deal_documents').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'delete',
    entityType: 'sales_deal_document',
    entityId: id,
    before,
    summary: `delete document checklist item for ${deal.title}`,
    request: req,
  });
  return ok({ ok: true });
});
