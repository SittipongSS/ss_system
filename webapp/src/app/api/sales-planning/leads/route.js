import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  LEAD_CHANNELS, SERVICE_INTERESTS, SERVICE_DETAIL_REQUIRED, channelGroupOf,
  LEAD_CHANNEL_LABELS, applyLeadScope, canViewLeads,
} from '@/lib/sales/leads';
import { toMoney } from '@/lib/salesPlanning';
import { sendChat, chatCard } from '@/lib/chat';

export const dynamic = 'force-dynamic';

// applyLeadScope / inLeadScope / canViewLeads ย้ายไป `lib/sales/leads.js` แล้ว
// (ทะเบียนเธรดกลางเป็น lib จะ import จาก app route ไม่ได้)

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

  // จุดส่งมอบ 1/3: ลีดใหม่เข้าคิว → แจ้งผู้คัดกรอง (Supervisor) ให้เริ่มนับ SLA 1 วันทำการ.
  // fire-and-forget หลังเขียน DB สำเร็จ — แจ้งเตือนล่มไม่กระทบการรับลีด (กติกา lib/chat).
  sendChat('leads', chatCard({
    title: '📥 ลีดใหม่รอคัดกรอง',
    subtitle: data.company ? `${data.contactName} · ${data.company}` : data.contactName,
    rows: [
      { label: 'ช่องทาง', value: LEAD_CHANNEL_LABELS[data.channel] || data.channel },
      { label: 'ผู้กรอก', value: data.createdByName || '' },
      { label: 'สิ่งที่ต้องทำ', value: 'AE Supervisor คัดกรอง + เลือกทีม (ภายใน 1 วันทำการ)' },
    ],
    linkPath: `/sa/leads`,
    linkLabel: 'เปิดคิวลีด',
  }));

  return ok(data, 201);
});
