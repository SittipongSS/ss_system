import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, isSuperuser } from '@/lib/permissions';
import { LEAD_TRANSITIONS, TRANSITION_TO_STATUS, MEETING_MODES } from '@/lib/sales/leads';
import { TEAMS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/leads/[id]/transition
// { action: screen|assign|contact|meeting|qualify|disqualify|bounce,
//   team?, assigneeId?, assigneeName?, reason?, meetingMode?, eventAt?, customerId? }
//
// กติกา role ต่อ action (เฟส C — ตามเส้นชีวิตในแผน):
//   screen     = supervisor/admin (คัดกรอง เลือกทีม — SLA 1 วันทำการ)
//   assign     = senior_ae/ac ของทีมนั้น + supervisor/admin (กระจายให้ AE)
//   contact    = ผู้รับมอบ (AE) / senior ทีม / supervisor (SLA 1 วันทำการ)
//   meeting    = เดียวกับ contact (+ บันทึกรูปแบบนัด onsite/online — วัด KPI)
//   qualify    = เดียวกับ contact — ต้องระบุ customerId (เปิดลูกค้าในฐานข้อมูลก่อน)
//   disqualify = เดียวกับ contact + supervisor — ต้องมีเหตุผล
//   bounce     = ทีมไม่ตรง → กลับคิวคัดกรอง (ล้างทีม/ผู้รับ) — ต้องมีเหตุผล
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'salesplan:lead')) return forbidden();

  const { id } = await ctx.params;
  const { data: lead, error: loadErr } = await supabase.from('sales_leads').select('*').eq('id', id).maybeSingle();
  if (loadErr) return fail(loadErr.message, 500);
  if (!lead) return notFound('ไม่พบลีด');

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const allowed = LEAD_TRANSITIONS[lead.status] || [];
  if (!allowed.includes(action)) {
    return badRequest(`ลีดสถานะ "${lead.status}" ทำ "${action}" ไม่ได้`);
  }

  const role = user.role;
  const superuser = isSuperuser(role);
  const inTeam = (role === 'senior_ae' || role === 'ac') && lead.team === user.team;
  const isAssignee = role === 'ae' && lead.assigneeId === user.id;
  const workScope = superuser || inTeam || isAssignee; // ผู้ที่ทำงานลีดใบนี้ได้

  const now = new Date().toISOString();
  const patch = { updatedAt: now };
  const event = {
    id: genId('LEV'),
    leadId: lead.id,
    kind: action,
    fromStatus: lead.status,
    toStatus: TRANSITION_TO_STATUS[action],
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  if (action === 'screen') {
    if (!superuser) return forbidden('คัดกรองลีดได้เฉพาะแอดมินหรือ AE Supervisor');
    if (!TEAMS.includes(body.team)) return badRequest('ต้องเลือกทีม (ODM/KA/SV)');
    patch.team = body.team;
    patch.screenedAt = lead.screenedAt || now; // SLA นับครั้งแรก — ตีกลับแล้วคัดใหม่ไม่รีเซ็ต
    event.team = body.team;
  } else if (action === 'assign') {
    const canPull = (role === 'senior_ae' || role === 'ac') && lead.status === 'new' && !!user.team;
    if (!(role === 'admin' || inTeam || canPull)) return forbidden('กระจายลีดได้เฉพาะ Senior AE ของทีม หรือแอดมิน');
    if (!body.assigneeId || !body.assigneeName) return badRequest('ต้องเลือก AE ผู้รับผิดชอบ');
    patch.assigneeId = body.assigneeId;
    patch.assigneeName = body.assigneeName;
    patch.assignedAt = now; // จุดเริ่ม SLA ติดต่อกลับ — มอบใหม่นับใหม่ (เจ้าของใหม่)
    event.assigneeId = body.assigneeId;
    event.assigneeName = body.assigneeName;
    if (canPull && lead.status === 'new') {
      patch.team = user.team;
      event.team = user.team;
      patch.screenedAt = lead.screenedAt || now;
    }
  } else if (action === 'contact') {
    if (!workScope) return forbidden();
    patch.firstContactAt = lead.firstContactAt || now;
    event.eventAt = body.eventAt || now;
  } else if (action === 'meeting') {
    if (!workScope) return forbidden();
    if (body.meetingMode && !MEETING_MODES.includes(body.meetingMode)) return badRequest('รูปแบบนัดไม่ถูกต้อง');
    patch.meetingAt = body.eventAt || now;
    event.meetingMode = body.meetingMode || null;
    event.eventAt = body.eventAt || now;
  } else if (action === 'create_deal') {
    if (!workScope) return forbidden();
    if (!body.dealTitle?.trim()) return badRequest('ต้องระบุชื่อดีล');
    if (!['SCENT', 'NPD', 'RE-ORDER'].includes(body.dealType)) return badRequest('ประเภทดีลไม่ถูกต้อง');
    
    let customer = null;
    if (body.customerId) {
      const { data } = await supabase.from('customers').select('id, name').eq('id', body.customerId).maybeSingle();
      if (!data) return badRequest('ไม่พบลูกค้าที่เลือก');
      customer = data;
    }
    
    const dealId = genId('SDL');
    const newDeal = {
      id: dealId,
      title: body.dealTitle.trim(),
      dealType: body.dealType,
      stage: 'lead',
      leadId: lead.id,
      customerId: customer?.id || null,
      customerName: customer ? customer.name : `${lead.contactName}${lead.company ? ` (${lead.company})` : ''}`,
      ownerId: lead.assigneeId || user.id,
      ownerName: lead.assigneeName || user.name,
      team: lead.team,
      createdAt: now,
      updatedAt: now
    };
    
    const { error: dealErr } = await supabase.from('sales_deals').insert(newDeal);
    if (dealErr) return fail('สร้างดีลไม่สำเร็จ: ' + dealErr.message, 500);

    if (body.forecastAmount && body.forecastMonth) {
      const { error: fcErr } = await supabase.from('sales_deal_forecasts').insert({
        id: genId('SDF'),
        dealId,
        forecastMonth: body.forecastMonth,
        forecastAmount: Number(body.forecastAmount) || 0,
        createdBy: user.id,
        createdByName: user.name,
        createdAt: now
      });
      if (fcErr) console.error('Failed to create forecast:', fcErr.message); // Not blocking
    }
    
    patch.customerId = customer?.id || lead.customerId;
    patch.closedAt = lead.closedAt || now;
  } else if (action === 'disqualify') {
    if (!workScope) return forbidden();
    if (!body.reason?.trim()) return badRequest('ต้องระบุเหตุผลที่ไม่ไปต่อ');
    patch.disqualifiedReason = body.reason.trim();
    patch.closedAt = now;
    event.reason = body.reason.trim();
  } else if (action === 'bounce') {
    if (!workScope) return forbidden();
    if (!body.reason?.trim()) return badRequest('ต้องระบุเหตุผลที่ตีกลับ (เช่น ทีมไม่ตรง)');
    patch.team = null;
    patch.assigneeId = null;
    patch.assigneeName = null;
    event.reason = body.reason.trim();
  }

  // If already qualified and doing create_deal, it stays qualified.
  patch.status = lead.status === 'qualified' && action === 'create_deal' ? 'qualified' : TRANSITION_TO_STATUS[action];

  const { data, error } = await supabase.from('sales_leads').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await supabase.from('lead_events').insert(event);

  await recordAudit({
    user, action: 'update', entityType: 'sales_lead', entityId: id, before: lead, after: data,
    summary: `ลีด ${lead.contactName}: ${lead.status} → ${data.status} (${action}${event.reason ? ` — ${event.reason}` : ''})`,
    request: req,
  });

  return ok(data);
});

