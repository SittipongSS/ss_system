import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

const DOC_KINDS = new Set(['customer_brief', 'quotation', 'deposit_proof', 'po', 'tax_docs', 'other']);
const DOC_STATUSES = new Set(['pending', 'received', 'waived']);

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const dealId = new URL(req.url).searchParams.get('dealId');
  if (!dealId) return badRequest('dealId is required');

  const deal = await loadDeal(supabase, dealId);
  if (!deal) return notFound('deal not found');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const { data, error } = await supabase
    .from('sales_deal_documents')
    .select('*')
    .eq('dealId', dealId)
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const body = await req.json();
  if (!body.dealId) return badRequest('dealId is required');
  if (!body.title?.trim()) return badRequest('title is required');

  const deal = await loadDeal(supabase, body.dealId);
  if (!deal) return notFound('deal not found');
  if (!inSalesEditScope(user, deal)) return forbidden();

  const row = {
    id: genId('SDOC'),
    dealId: deal.id,
    kind: DOC_KINDS.has(body.kind) ? body.kind : 'other',
    title: body.title.trim(),
    status: DOC_STATUSES.has(body.status) ? body.status : 'pending',
    dueDate: body.dueDate || null,
    notes: body.notes || null,
    attachmentId: body.attachmentId || null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  const { data, error } = await supabase.from('sales_deal_documents').insert(row).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal_document',
    entityId: data.id,
    after: data,
    summary: `create document checklist item for ${deal.title}`,
    request: req,
  });
  return ok(data, 201);
});
