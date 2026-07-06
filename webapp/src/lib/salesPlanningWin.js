import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { dealAuditLabel, forecastAmount, monthKey, toMoney } from '@/lib/salesPlanning';

export function winStageForProject(projectId) {
  return projectId ? 'in_project' : 'won';
}

export function buildWinPatch({ deal = {}, source = 'manual', now = new Date().toISOString(), projectValue, projectId, metadata = {} } = {}) {
  const nextProjectId = projectId || deal.projectId || null;
  const extraMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  const patch = {
    stage: winStageForProject(nextProjectId),
    depositPaid: true,
    confirmedAt: deal.confirmedAt || now,
    probability: 100,
    updatedAt: now,
    metadata: {
      ...(deal.metadata || {}),
      ...extraMetadata,
      wonSource: source,
      wonAt: now,
    },
  };

  if (projectValue !== undefined) patch.projectValue = toMoney(projectValue);
  if (nextProjectId) patch.projectId = nextProjectId;
  return patch;
}

export async function insertWinSideEffects({
  supabase,
  user,
  before = null,
  deal,
  source = 'manual',
  request,
  auditAction = 'update',
  auditSummary,
}) {
  if (!deal) return;

  if (!before || before.stage !== deal.stage) {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: deal.id,
      fromStage: before?.stage || null,
      toStage: deal.stage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
  }

  await supabase.from('sales_deal_forecasts').insert({
    id: genId('DFC'),
    dealId: deal.id,
    forecastMonth: deal.forecastMonth || monthKey(new Date().toISOString()),
    forecastAmount: forecastAmount(deal),
    probability: deal.probability,
    source,
    createdBy: user.id || null,
    createdByName: user.name || null,
  });

  await recordAudit({
    user,
    action: auditAction,
    entityType: 'sales_deal',
    entityId: deal.id,
    before: before || undefined,
    after: deal,
    summary: auditSummary || `${auditAction} won sales deal ${dealAuditLabel(deal)}`,
    request,
  });
}

export async function markWon({ supabase, user, deal, source = 'manual', projectValue, projectId, metadata = {}, request, auditSummary }) {
  const patch = buildWinPatch({ deal, source, projectValue, projectId, metadata });
  const { data, error } = await supabase
    .from('sales_deals')
    .update(patch)
    .eq('id', deal.id)
    .select()
    .single();
  if (error) throw error;

  await insertWinSideEffects({
    supabase,
    user,
    before: deal,
    deal: data,
    source,
    request,
    auditAction: 'update',
    auditSummary,
  });

  return data;
}

export async function createWonDealStub({ supabase, user, row, source = 'manual', request, auditSummary }) {
  const now = new Date().toISOString();
  const rowMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const deal = {
    ...row,
    id: row.id || genId('DEAL'),
    stage: winStageForProject(row.projectId),
    projectValue: toMoney(row.projectValue),
    probability: 100,
    forecastMonth: monthKey(row.forecastMonth || row.expectedCloseDate || now),
    depositPaid: true,
    confirmedAt: row.confirmedAt || now,
    metadata: {
      ...rowMetadata,
      wonSource: source,
      wonAt: now,
    },
  };

  const { data, error } = await supabase.from('sales_deals').insert(deal).select().single();
  if (error) throw error;

  await insertWinSideEffects({
    supabase,
    user,
    before: null,
    deal: data,
    source,
    request,
    auditAction: 'create',
    auditSummary,
  });

  return data;
}
