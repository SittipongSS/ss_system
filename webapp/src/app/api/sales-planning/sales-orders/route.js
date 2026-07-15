import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { data: orders, error } = await supabase
    .from('sales_orders')
    .select('*')
    .order('orderDate', { ascending: false })
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);

  const dealIds = [...new Set((orders || []).map((row) => row.dealId).filter(Boolean))];
  const quoteIds = [...new Set((orders || []).map((row) => row.quotationId).filter(Boolean))];
  const [{ data: deals, error: dealError }, { data: quotes, error: quoteError }] = await Promise.all([
    dealIds.length
      ? supabase.from('sales_deals').select('id, title, stage, dealType, team, ownerId, ownerName, customerName, projectId').in('id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length
      ? supabase.from('quotations').select('id, quoteNumber, status').in('id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (dealError || quoteError) return fail((dealError || quoteError).message, 500);

  const dealById = new Map((deals || []).map((row) => [row.id, row]));
  const quoteById = new Map((quotes || []).map((row) => [row.id, row]));
  const visible = (orders || [])
    .map((row) => ({ ...row, deal: dealById.get(row.dealId) || null, quotation: quoteById.get(row.quotationId) || null }))
    .filter((row) => row.deal && inSalesViewScope(user, row.deal));

  return ok(visible);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const quotationId = String(body.quotationId || '').trim();
  if (!quotationId) return badRequest('กรุณาระบุใบเสนอราคา Won');

  const { data: quote, error: quoteError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, status, deal:sales_deals(*)')
    .eq('id', quotationId)
    .maybeSingle();
  if (quoteError) return fail(quoteError.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (quote.status !== 'accepted') return badRequest('สร้าง Sale Order ได้เฉพาะ QT ที่ Won แล้ว');
  if (!quote.deal || !inSalesEditScope(user, quote.deal)) return forbidden();

  const orderId = genId('SOR');
  const { data: order, error } = await supabase.rpc('create_sales_order_draft', {
    p_quote_id: quotationId,
    p_order_id: orderId,
    p_actor_id: user.id || null,
    p_actor_name: user.name || null,
  });
  if (error) {
    if (error.code === '23505' || error.message?.includes('already_exists')) {
      return conflict('QT ใบนี้มี Sale Order แล้ว');
    }
    return fail(error.message, /quotation_|sales_order_/.test(error.message || '') ? 400 : 500);
  }
  await recordAudit({ user, action: 'create', entityType: 'sales_order', entityId: orderId, before: null, after: order, summary: `create SO draft from ${quote.quoteNumber}`, request: req });
  return ok(order, 201);
});
