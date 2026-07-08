import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { loadForecastDrift } from '@/lib/salesPlanningForecast';

export const dynamic = 'force-dynamic';

const dealSelect = `
  *,
  customer:customers(id, name, arCode, email, phone)
`;

async function safe(label, promise, fallback) {
  const { data, error } = await promise;
  if (error) return { data: fallback, warning: `${label}: ${error.message}` };
  return { data: data ?? fallback, warning: null };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { data: deal, error } = await supabase.from('sales_deals').select(dealSelect).eq('id', id).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!deal) return notFound('deal not found');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const [quotations, documents, activities, stageHistory, forecasts] = await Promise.all([
    safe('quotations', supabase.from('quotations').select('*, lines:quotation_lines(*)').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
    safe('documents', supabase.from('sales_deal_documents').select('*').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
    safe('activities', supabase.from('sales_deal_activities').select('*').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
    safe('stage history', supabase.from('sales_deal_stage_history').select('*').eq('dealId', deal.id).order('changedAt', { ascending: false }), []),
    safe('forecasts', supabase.from('sales_deal_forecasts').select('*').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
  ]);

  let project = { data: null, warning: null };
  let projectProducts = { data: [], warning: null };
  let shipmentPrep = { data: null, warning: null };
  let exciseRegistrations = { data: [], warning: null };
  let sahamitPo = { data: null, warning: null };
  if (deal.projectId) {
    [project, projectProducts, shipmentPrep, exciseRegistrations, sahamitPo] = await Promise.all([
      safe('project', supabase.from('projects').select('*').eq('id', deal.projectId).maybeSingle(), null),
      safe('project products', supabase.from('project_products').select('*, product:products(id, fgCode, productDescription, productDescriptionEn)').eq('projectId', deal.projectId), []),
      safe('shipment prep', supabase.from('shipment_prep').select('*, lines:shipment_prep_lines(*)').eq('projectId', deal.projectId).maybeSingle(), null),
      safe('excise registrations', supabase.from('excise_registrations').select('*').eq('projectId', deal.projectId), []),
      safe('sahamit po', supabase.from('sahamit_pos').select('*, lines:sahamit_po_lines(*)').eq('projectId', deal.projectId).maybeSingle(), null),
    ]);
  }

  const warnings = [
    quotations.warning,
    documents.warning,
    activities.warning,
    stageHistory.warning,
    forecasts.warning,
    project.warning,
    projectProducts.warning,
    shipmentPrep.warning,
    exciseRegistrations.warning,
    sahamitPo.warning,
  ].filter(Boolean);

  const forecastDrift = await loadForecastDrift(supabase, deal).catch(() => null);

  const canEdit = canEditSalesPlanning(user) && inSalesEditScope(user, deal);

  return ok({
    deal,
    canEdit,
    forecastDrift,
    quotations: quotations.data,
    documents: documents.data,
    activities: activities.data,
    stageHistory: stageHistory.data,
    forecasts: forecasts.data,
    project: project.data,
    projectProducts: projectProducts.data,
    shipmentPrep: shipmentPrep.data,
    exciseRegistrations: exciseRegistrations.data,
    sahamitPo: sahamitPo.data,
    warnings,
  });
});
