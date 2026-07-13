import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { can, isSuperuser } from '@/lib/permissions';
import {
  LEAD_CHANNELS, SERVICE_INTERESTS, SERVICE_DETAIL_REQUIRED, channelGroupOf,
} from '@/lib/sales/leads';
import { toMoney } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// ใครเห็นลีดแค่ไหน (เฟส C):
//   supervisor/admin/viewer → ทุกใบ · senior_ae/ac → ของทีม + คิวกลาง (new)
//   ae → ที่ถูกมอบหมายให้ตัวเอง · marketing → ทุกใบ (ทีม intake เห็นคิวรวมเพื่อไม่กรอกซ้ำ)
export function applyLeadScope(query, user) {
  const role = user?.role;
  // supervisor sees all leads (to screen them)
  if (isSuperuser(role) || role === 'viewer' || role === 'marketing') return query;
  if (role === 'senior_ae' || role === 'ac') {
    // Senior/AC only see leads that have been screened to their team.
    return query.eq('team', user?.team ?? '__no_team__');
  }
  if (role === 'ae') {
    return query.or(`assigneeId.eq.${user?.id ?? ''},createdBy.eq.${user?.id ?? ''}`);
  }
  return query.eq('id', '__no_lead_scope__');
}

export function canViewLeads(user) {
  return !!user && (can(user.role, 'salesplan:lead') || can(user.role, 'salesplan:view'));
}

export function canCreateLead(role) {
  return role === 'marketing' || role === 'admin';
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const status = params.get('status');

  let query = supabase.from('sales_leads').select('*').order('createdAt', { ascending: false });
  query = applyLeadScope(query, user);
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canCreateLead(user.role)) return forbidden('ลีดต้องเพิ่มโดยทีม Marketing เท่านั้น');

  const body = await req.json();
  if (!body.contactName?.trim()) return badRequest('ต้องระบุชื่อลูกค้า/ผู้ติดต่อ');
  if (!LEAD_CHANNELS.includes(body.channel)) return badRequest('ต้องระบุช่องทางที่รับลีด');
  const serviceInterest = SERVICE_INTERESTS.includes(body.serviceInterest) ? body.serviceInterest : 'other';
  const serviceDetail = (body.serviceDetail || '').trim();
  if (SERVICE_DETAIL_REQUIRED.has(serviceInterest) && !serviceDetail) {
    return badRequest('บริการที่สนใจประเภทนี้ต้องระบุรายละเอียด');
  }

  const row = {
    id: genId('LEAD'),
    channel: body.channel,
    channelGroup: channelGroupOf(body.channel),
    contactName: body.contactName.trim(),
    company: (body.company || '').trim() || null,
    email: (body.email || '').trim() || null,
    contactChannel: (body.contactChannel || '').trim() || null,
    phone: (body.phone || '').trim() || null,
    serviceInterest,
    serviceDetail: serviceDetail || null,
    budget: toMoney(body.budget, null),
    details: (body.details || '').trim() || null,
    status: 'new',
    createdBy: user.id || null,
    createdByName: user.name || null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };

  const { data, error } = await supabase.from('sales_leads').insert(row).select().single();
  if (error) return fail(error.message, 500);

  await supabase.from('lead_events').insert({
    id: genId('LEV'),
    leadId: data.id,
    kind: 'create',
    fromStatus: null,
    toStatus: 'new',
    createdBy: user.id || null,
    createdByName: user.name || null,
  });

  await recordAudit({
    user, action: 'create', entityType: 'sales_lead', entityId: data.id, after: data,
    summary: `รับลีด ${data.contactName}${data.company ? ` (${data.company})` : ''} · ${data.channel}`,
    request: req,
  });

  return ok(data, 201);
});
