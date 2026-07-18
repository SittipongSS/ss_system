import { genId } from '@/lib/id';
import { generateEntityCode } from '@/lib/entityCode';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  applyDealScope,
  canCreateDeal,
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
import { inLeadScope } from '../leads/route';
import { LEAD_TRANSITIONS, LEAD_STATUS_LABELS } from '@/lib/sales/leads';
import { activeProductTypeError } from '@/lib/master/productTypes';

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
  // สร้างดีลได้เฉพาะ AE/Senior AE (+ superuser กำกับดูแล) — AC เปิดดีลไม่ได้ (มติผู้ใช้)
  if (!canCreateDeal(user)) return forbidden('เปิดดีลได้เฉพาะ AE / Senior AE');

  const body = await req.json();
  if (!body.title?.trim()) return badRequest('ต้องระบุชื่อดีล');
  const categoryCode = (body.categoryCode || '').trim() || null;
  const categoryError = await activeProductTypeError(categoryCode);
  if (categoryError) return badRequest(categoryError);

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
  if (stage === 'won') return badRequest('สร้างดีลเป็น Won โดยตรงไม่ได้ ต้องปิด Won ผ่านใบเสนอราคา');
  // รหัสดีลฐาน DL-YYMMXXXX (atomic ต่อเดือน — mig 0096). แสดง DL-YYMMXXXX-0 ที่ UI/เอกสาร.
  const dealCode = await generateEntityCode(supabase, 'DL');
  const row = {
    id: genId('DEAL'),
    code: dealCode,
    customerId: body.customerId || null,
    customerName,
    title: body.title.trim(),
    stage,
    projectValue: toMoney(body.projectValue),
    wonValue: null,
    probability: toProbability(body.probability, stage),
    // เดือน FC อนุมานจากวันที่คาดปิดเสมอ (มติผู้ใช้ 2026-07-16 — ฟอร์มไม่มีช่องเดือนแล้ว
    // และไม่รับค่าจาก client); ไม่ระบุวันที่คาดปิด → ตกเป็นเดือนปัจจุบัน (default เดิมของฟอร์ม)
    forecastMonth: monthKey(body.expectedCloseDate) || monthKey(new Date().toISOString()),
    expectedCloseDate: body.expectedCloseDate || null,
    depositPaid: !!body.depositPaid,
    confirmedAt: null,
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
    // หมวดสินค้า (DL1 — mig 0094): ใช้เลือก timeline template ตามหมวด
    categoryCode,
    // วันที่เริ่ม/สิ้นสุดของดีล (mig 0095) — startDate ใช้เป็น anchor gen ไทม์ไลน์
    startDate: body.startDate || null,
    endDate: body.endDate || null,
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

  // แตกดีลจากลีด: deal-POST คือทางเดียวที่ปิดลีด (transition route ปิด create_deal
  // ของตัวเองไว้) — ต้อง re-implement guard เหมือน transition route: ห้ามแตะลีดนอก
  // scope ของผู้แก้ และลีดต้องอยู่สถานะที่แตกดีลได้ (contacted/meeting/qualified).
  // เชื่อ metadata.leadId ดิบไม่ได้ (เดิมยิงลีดทีมอื่น/สถานะใดก็บังคับ qualified ได้).
  let sourceLead = null;
  if (row.metadata?.leadId && row.metadata?.source === 'lead') {
    const { data: lead } = await supabase.from('sales_leads')
      .select('id, status, team, assigneeId, createdBy').eq('id', row.metadata.leadId).maybeSingle();
    if (!lead) return badRequest('ไม่พบลีดต้นทาง');
    if (!inLeadScope(user, lead)) return forbidden('ไม่มีสิทธิ์แตกดีลจากลีดนี้');
    if (!LEAD_TRANSITIONS[lead.status]?.includes('create_deal')) {
      return badRequest(`ลีดสถานะ "${LEAD_STATUS_LABELS[lead.status] || lead.status}" ยังแตกดีลไม่ได้`);
    }
    sourceLead = lead;
  }

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

  // ถ้าดีลนี้สร้างมาจากลีด (ผ่าน guard ด้านบนแล้ว): เปลี่ยนสถานะลีดเป็น qualified
  // (ครั้งแรก) + บันทึก event "create_deal" ทุกครั้ง (ลีด 1 ใบมีได้หลายดีล — นับ conversion ครบ)
  if (sourceLead) {
    const leadId = sourceLead.id;
    const lead = sourceLead;
    {
      const now = new Date().toISOString();
      // อัปเดตสถานะเฉพาะครั้งแรก (ยังไม่ qualified) — ครั้งถัดไปคงสถานะเดิม
      if (lead.status !== 'qualified') {
        const { data: updatedLead } = await supabase.from('sales_leads')
          .update({ status: 'qualified', closedAt: now, updatedAt: now }).eq('id', leadId).select().single();
        await recordAudit({
          user, action: 'update', entityType: 'sales_lead', entityId: leadId,
          before: lead, after: updatedLead || { ...lead, status: 'qualified' },
          summary: `ลีด → qualified (สร้างดีล ${dealAuditLabel(data)})`, request: req,
        });
      }
      // event ต่อดีล — บันทึกทุกครั้ง (แม้ลีด qualified อยู่แล้ว) เพื่อให้ conversion นับครบ
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
