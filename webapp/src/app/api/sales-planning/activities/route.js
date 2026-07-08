import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

const ACTIVITY_KINDS = new Set(['note', 'call', 'meeting', 'email', 'next_step']);

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const dealId = new URL(req.url).searchParams.get('dealId');
  if (!dealId) return badRequest('ต้องระบุ dealId');

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', dealId).maybeSingle();
  if (!deal) return notFound('ไม่พบโครงการ');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const { data, error } = await supabase
    .from('sales_deal_activities')
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
  if (!body.dealId) return badRequest('ต้องระบุ dealId');
  if (!body.body?.trim()) return badRequest('ต้องระบุรายละเอียด activity');

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', body.dealId).maybeSingle();
  if (!deal) return notFound('ไม่พบโครงการ');
  if (!inSalesEditScope(user, deal)) return forbidden();

  const row = {
    id: genId('ACT'),
    dealId: body.dealId,
    kind: ACTIVITY_KINDS.has(body.kind) ? body.kind : 'note',
    body: body.body.trim(),
    dueDate: body.dueDate || null,
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  const { data, error } = await supabase.from('sales_deal_activities').insert(row).select().single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
});
