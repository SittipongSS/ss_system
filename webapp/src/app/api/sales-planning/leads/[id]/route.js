import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, isSuperuser } from '@/lib/permissions';
import { LEAD_CHANNELS, SERVICE_INTERESTS, SERVICE_DETAIL_REQUIRED, channelGroupOf } from '@/lib/sales/leads';
import { toMoney } from '@/lib/salesPlanning';
import { canViewLeads } from '../route';

export const dynamic = 'force-dynamic';

async function loadLead(supabase, id) {
  const { data, error } = await supabase.from('sales_leads').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// แก้ข้อมูลลีดได้เมื่อ: ผู้กรอกเอง (ก่อนปิด) / ผู้รับมอบ / senior ทีมนั้น / supervisor+
function canEditLead(user, lead) {
  const role = user?.role;
  if (isSuperuser(role)) return true;
  if (['contacted', 'meeting', 'qualified', 'disqualified'].includes(lead.status)) return false;
  if (role === 'marketing') return lead.createdBy === user.id;
  if (role === 'senior_ae' || role === 'ac') return !lead.team || lead.team === user.team;
  if (role === 'ae') return lead.assigneeId === user.id || lead.createdBy === user.id;
  return false;
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();
  const { id } = await ctx.params;
  const lead = await loadLead(supabase, id);
  if (!lead) return notFound('ไม่พบลีด');
  const { data: events } = await supabase
    .from('lead_events').select('*').eq('leadId', id).order('createdAt', { ascending: false });
  return ok({ ...lead, events: events || [] });
});

// PATCH — แก้ข้อมูลติดต่อ/บริการ/งบ (ไม่ใช่ transition — สถานะเปลี่ยนผ่าน /transition)
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'salesplan:lead')) return forbidden();
  const { id } = await ctx.params;
  const before = await loadLead(supabase, id);
  if (!before) return notFound('ไม่พบลีด');
  if (!canEditLead(user, before)) return forbidden();

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

// DELETE — เฉพาะ supervisor/admin (ลีดผิด/ซ้ำ) — ลีดที่เปิดลูกค้าแล้วห้ามลบ
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!isSuperuser(user.role)) return forbidden('ลบลีดได้เฉพาะหัวหน้าฝ่ายขาย/แอดมิน');
  const { id } = await ctx.params;
  const before = await loadLead(supabase, id);
  if (!before) return notFound('ไม่พบลีด');
  if (['contacted', 'meeting', 'qualified', 'disqualified'].includes(before.status)) return badRequest('ลีดที่มีการติดต่อแล้วจะลบไม่ได้');
  const { error } = await supabase.from('sales_leads').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'sales_lead', entityId: id, before, summary: `ลบลีด ${before.contactName}`, request: req });
  return ok({ ok: true });
});
