import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { LEAD_CHANNELS, SERVICE_INTERESTS, SERVICE_DETAIL_REQUIRED, channelGroupOf, canEditLead, canDeleteLead, LEAD_LOCKED_STATUSES } from '@/lib/sales/leads';
import { toMoney } from '@/lib/salesPlanning';
import { canViewLeads, inLeadScope } from '../route';

export const dynamic = 'force-dynamic';

async function loadLead(supabase, id) {
  const { data, error } = await supabase.from('sales_leads').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// นโยบายแก้/ลบอยู่ที่ lib/sales/leads.js (canEditLead/canDeleteLead) — ใช้ร่วมกับหน้า list

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();
  const { id } = await ctx.params;
  const lead = await loadLead(supabase, id);
  if (!lead) return notFound('ไม่พบลีด');
  // scope รายแถวเหมือนหน้า list (applyLeadScope) — เดิม route รายตัวไม่กรอง ทำให้
  // เปิดอ่านลีดข้ามทีม (PII + ดีลที่เกี่ยวข้อง) ได้จาก id ตรง ๆ
  if (!inLeadScope(user, lead)) return forbidden();
  const [{ data: events }, { data: relatedDeals }] = await Promise.all([
    supabase.from('lead_events').select('*').eq('leadId', id).order('createdAt', { ascending: false }),
    supabase.from('sales_deals').select('id, code, title, customerName, stage, dealType, projectValue, wonValue, probability, forecastMonth, projectId').eq('leadId', id).order('createdAt', { ascending: false }),
  ]);
  return ok({ ...lead, events: events || [], relatedDeals: relatedDeals || [], canEdit: canEditLead(user, lead) });
});

// PATCH — แก้ข้อมูลติดต่อ/บริการ/งบ (ไม่ใช่ transition — สถานะเปลี่ยนผ่าน /transition)
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'salesplan:lead')) return forbidden();
  const { id } = await ctx.params;
  const before = await loadLead(supabase, id);
  if (!before) return notFound('ไม่พบลีด');
  if (!canEditLead(user, before)) {
    if (user.role === 'marketing' && before.createdBy === user.id && before.status !== 'new') {
      return forbidden('ลีดที่คัดกรองแล้วอยู่ในความดูแลของฝ่ายขาย — ทีม Marketing แก้ไข/ลบไม่ได้');
    }
    return forbidden();
  }

  const body = await req.json();
  const patch = { updatedAt: new Date().toISOString() };
  if ('contactName' in body) {
    if (!body.contactName?.trim()) return badRequest('ต้องระบุชื่อลูกค้า/ผู้ติดต่อ');
    patch.contactName = body.contactName.trim();
  }
  if ('channel' in body) {
    if (!LEAD_CHANNELS.includes(body.channel)) return badRequest('ช่องทางไม่ถูกต้อง');
    patch.channel = body.channel;
    patch.channelGroup = channelGroupOf(body.channel);
  }
  for (const key of ['company', 'email', 'contactChannel', 'phone', 'details']) {
    if (key in body) patch[key] = (body[key] || '').trim() || null;
  }
  if ('budget' in body) patch.budget = toMoney(body.budget, null);
  if ('serviceInterest' in body || 'serviceDetail' in body) {
    const si = SERVICE_INTERESTS.includes(body.serviceInterest ?? before.serviceInterest)
      ? (body.serviceInterest ?? before.serviceInterest) : 'other';
    const sd = ('serviceDetail' in body ? body.serviceDetail : before.serviceDetail || '').trim();
    if (SERVICE_DETAIL_REQUIRED.has(si) && !sd) return badRequest('บริการที่สนใจประเภทนี้ต้องระบุรายละเอียด');
    patch.serviceInterest = si;
    patch.serviceDetail = sd || null;
  }

  const { data, error } = await supabase.from('sales_leads').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'update', entityType: 'sales_lead', entityId: id, before, after: data, request: req });
  return ok(data);
});

// DELETE — admin ลบได้ทุกสถานะ; supervisor ลบได้ก่อนเริ่มติดต่อ;
// marketing ลบได้เฉพาะใบที่ตัวเองกรอกและยังไม่ถูกคัดกรอง (นโยบายเดียวกับแก้ไข)
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const role = user.role;
  const { id } = await ctx.params;
  const before = await loadLead(supabase, id);
  if (!before) return notFound('ไม่พบลีด');

  if (!canDeleteLead(user, before)) {
    if (role !== 'admin' && LEAD_LOCKED_STATUSES.includes(before.status)) {
      return badRequest('ลีดที่มีการติดต่อแล้วลบได้เฉพาะแอดมิน');
    }
    if (role === 'marketing' && before.createdBy === user.id) {
      return badRequest('ลีดที่คัดกรองแล้วอยู่ในความดูแลของฝ่ายขาย — ทีม Marketing แก้ไข/ลบไม่ได้');
    }
    return forbidden('ไม่มีสิทธิลบลีดนี้');
  }

  const { error } = await supabase.from('sales_leads').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'sales_lead', entityId: id, before, summary: `ลบลีด ${before.contactName}`, request: req });
  return ok({ ok: true });
});
