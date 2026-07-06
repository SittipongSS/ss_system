import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  forecastAmount,
  inSalesEditScope,
  inSalesViewScope,
  monthKey,
  normalizeStage,
  toMoney,
  toProbability,
} from '@/lib/salesPlanning';
import { buildWinPatch } from '@/lib/salesPlanningWin';

export const dynamic = 'force-dynamic';

const selectDeal = `
  *,
  customer:customers(id, name, arCode)
`;

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select(selectDeal).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบ deal');
  if (!inSalesViewScope(user, deal)) return forbidden();
  return ok(deal);
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDeal(supabase, id);
  if (!before) return notFound('ไม่พบ deal');
  if (!inSalesEditScope(user, before)) return forbidden();

  const body = await req.json();
  if ('title' in body && !body.title?.trim()) return badRequest('ต้องระบุชื่อ deal');

  const nextStage = 'stage' in body ? normalizeStage(body.stage) : before.stage;
  const nextDepositPaid = 'depositPaid' in body ? !!body.depositPaid : !!before.depositPaid;
  if (nextStage === 'won' && !nextDepositPaid) return badRequest('Won ต้องยืนยันว่าได้รับมัดจำแล้ว');
  const patch = {
    updatedAt: new Date().toISOString(),
  };
  for (const key of ['customerId', 'customerName', 'expectedCloseDate', 'depositPaid', 'lostReason', 'notes', 'ownerId', 'ownerName', 'team', 'metadata']) {
    if (key in body) patch[key] = body[key] === '' ? null : body[key];
  }
  if ('title' in body) patch.title = body.title.trim();
  if ('stage' in body) patch.stage = nextStage;
  if ('projectValue' in body) patch.projectValue = toMoney(body.projectValue);
  if ('probability' in body || 'stage' in body) patch.probability = toProbability(body.probability ?? before.probability, nextStage);
  if ('forecastMonth' in body || 'expectedCloseDate' in body) {
    patch.forecastMonth = monthKey(body.forecastMonth || body.expectedCloseDate) || null;
  }
  if (nextStage === 'won') {
    Object.assign(patch, buildWinPatch({
      deal: before,
      source: 'manual',
      now: patch.updatedAt,
      projectValue: 'projectValue' in patch ? patch.projectValue : before.projectValue,
      projectId: before.projectId,
      metadata: 'metadata' in body ? body.metadata : {},
    }));
    if (body.confirmedAt) patch.confirmedAt = body.confirmedAt;
  }
  if (nextStage !== 'won' && 'stage' in body) patch.confirmedAt = null;
  if (nextStage !== 'lost' && 'stage' in body) patch.lostReason = null;

  const { data, error } = await supabase
    .from('sales_deals')
    .update(patch)
    .eq('id', id)
    .select(selectDeal)
    .single();
  if (error) return fail(error.message, 500);

  // Keep the linked PM project's name in sync with the deal title (two-way sync;
  // the project PATCH mirrors the reverse). Direct table write, no loop.
  if (before.projectId && 'title' in body && before.title !== data.title) {
    await supabase.from('projects').update({ name: data.title, updatedAt: patch.updatedAt }).eq('id', before.projectId);
  }

  if (before.stage !== data.stage) {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: data.id,
      fromStage: before.stage,
      toStage: data.stage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
  }

  if (before.forecastMonth !== data.forecastMonth || before.projectValue !== data.projectValue || before.probability !== data.probability) {
    await supabase.from('sales_deal_forecasts').insert({
      id: genId('DFC'),
      dealId: data.id,
      forecastMonth: data.forecastMonth || monthKey(new Date().toISOString()),
      forecastAmount: forecastAmount(data),
      probability: data.probability,
      source: 'sales',
      createdBy: user.id || null,
      createdByName: user.name || null,
    });
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: data.id,
    before,
    after: data,
    summary: `แก้ไข sales deal ${dealAuditLabel(data)}`,
    request: req,
  });

  return ok(data);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDeal(supabase, id);
  if (!before) return notFound('ไม่พบ deal');
  if (!inSalesEditScope(user, before)) return forbidden();

  const { error } = await supabase.from('sales_deals').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({
    user,
    action: 'delete',
    entityType: 'sales_deal',
    entityId: id,
    before,
    summary: `ลบ sales deal ${dealAuditLabel(before)}`,
    request: req,
  });
  return ok({ ok: true });
});
