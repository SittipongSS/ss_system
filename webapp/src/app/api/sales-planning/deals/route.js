import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  applyDealScope,
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  forecastAmount,
  inSalesEditScope,
  inSalesViewScope,
  monthKey,
  normalizeDealType,
  normalizeStage,
  toMoney,
  toProbability,
} from '@/lib/salesPlanning';
import { loadForecastDriftMap } from '@/lib/salesPlanningForecast';
import { isSuperuser } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const selectDeal = `
  *,
  customer:customers(id, name, arCode)
`;

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const stage = params.get('stage');
  const month = monthKey(params.get('month'));

  let query = supabase
    .from('sales_deals')
    .select(selectDeal)
    .order('updatedAt', { ascending: false });
  query = applyDealScope(query, user);
  if (stage && stage !== 'all') query = query.eq('stage', normalizeStage(stage));
  if (month) query = query.eq('forecastMonth', month);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  // Per-row edit flag so the UI hides actions that would 403 (AE sees the whole
  // team's pipeline but may only act on its own deals).
  const editor = canEditSalesPlanning(user);
  const driftMap = await loadForecastDriftMap(supabase, data || []).catch(() => new Map());
  const rows = (data || []).filter((d) => inSalesViewScope(user, d)).map((d) => ({
    ...d,
    canEdit: editor && inSalesEditScope(user, d),
    forecastDrift: driftMap.get(d.id) || null,
  }));
  return ok(rows);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const body = await req.json();
  if (!body.title?.trim()) return badRequest('ต้องระบุชื่อดีล');

  let customerName = body.customerName || null;
  if (body.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', body.customerId)
      .maybeSingle();
    customerName = customer?.name || customerName;
  }

  let stage = normalizeStage(body.stage);
  // in_project ถูกยุบเป็น won แล้ว (mig 0082 ตัดออกจาก CHECK) — กัน insert พัง 500
  // ถ้า client ยังส่งค่าเก่ามา ให้ถือเป็น won.
  if (stage === 'in_project') stage = 'won';
  // ปิด Won ตอนสร้างดีลต้องผ่านเงื่อนไขเดียวกับ win-flow: มัดจำ + มูลค่าปิดจริง>0 (M5)
  const bodyWonValue = toMoney(body.wonValue, null);
  if (stage === 'won') {
    if (!body.depositPaid) return badRequest('Won ต้องยืนยันว่าได้รับมัดจำแล้ว');
    if (bodyWonValue == null || bodyWonValue <= 0) return badRequest('ต้องระบุมูลค่าปิดจริง (Won) มากกว่า 0');
  }
  const row = {
    id: genId('DEAL'),
    customerId: body.customerId || null,
    customerName,
    title: body.title.trim(),
    stage,
    projectValue: toMoney(body.projectValue),
    wonValue: stage === 'won' ? bodyWonValue : null,
    probability: toProbability(body.probability, stage),
    forecastMonth: monthKey(body.forecastMonth || body.expectedCloseDate),
    expectedCloseDate: body.expectedCloseDate || null,
    depositPaid: !!body.depositPaid,
    confirmedAt: stage === 'won' ? (body.confirmedAt || new Date().toISOString()) : null,
    lostReason: stage === 'lost' ? (body.lostReason || null) : null,
    notes: body.notes || null,
    ownerId: body.ownerId || user.id || null,
    ownerName: body.ownerName || user.name || null,
    team: body.team || user.team || null,
    // ประเภทดีล 3 ค่า (SCENT/NPD/RE-ORDER) = คอลัมน์จริง (mig 0088) — ค่าตรงกับ
    // projects.type ส่งต่อเป็น template ตอนสร้างโครงการ PM. transition: เขียน
    // metadata.projectType คู่ไว้ 1 เฟส ให้โค้ด/แคชเก่าอ่านได้.
    dealType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType),
    // ชื่อสูตรกลิ่น (ดีล SCENT — จุดปลั๊กอิน RD ในอนาคต)
    formulaName: (body.formulaName || '').trim() || null,
    metadata: {
      ...(body.metadata || {}),
      projectType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType),
      brand: (body.brand ?? body.metadata?.brand ?? '') || '',
    },
    leadId: body.leadId || body.metadata?.leadId || null,
  };

  // The creator may only mint deals within its own edit scope: an AE cannot
  // hand ownership to another user, and team-scoped roles cannot create for
  // another team. Superusers (scope 'all') are unrestricted.
  if (!inSalesEditScope(user, row)) return forbidden();

  const { data, error } = await supabase.from('sales_deals').insert(row).select(selectDeal).single();
  if (error) return fail(error.message, 500);

  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'),
    dealId: data.id,
    fromStage: null,
    toStage: data.stage,
    changedBy: user.id || null,
    changedByName: user.name || null,
  });
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

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: data.id,
    after: data,
    summary: `สร้าง sales deal ${dealAuditLabel(data)}`,
    request: req,
  });

  // ถ้าดีลนี้สร้างมาจากลีด ให้ทำการเปลี่ยนสถานะลีดเป็น qualified โดยอัตโนมัติ
  if (data.metadata?.leadId && data.metadata?.source === 'lead') {
    const leadId = data.metadata.leadId;
    const { data: lead } = await supabase.from('sales_leads').select('id, status').eq('id', leadId).maybeSingle();
    if (lead && lead.status !== 'qualified') {
      const now = new Date().toISOString();
      await supabase.from('sales_leads').update({ status: 'qualified', closedAt: now, updatedAt: now }).eq('id', leadId);
      await supabase.from('lead_events').insert({
        id: genId('LEV'),
        leadId,
        kind: 'create_deal',
        fromStatus: lead.status,
        toStatus: 'qualified',
        createdBy: user.id || null,
        createdByName: user.name || null,
        eventAt: now,
      });
    }
  }

  return ok(data, 201);
});
