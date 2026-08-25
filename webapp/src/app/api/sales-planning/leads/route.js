import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  LEAD_CHANNELS, SERVICE_INTERESTS, SERVICE_DETAIL_REQUIRED, channelGroupOf, leadBudgetError,
  applyLeadScope, canViewLeads, canCreateLead,
  leadBounceHistory, chunkLeadIds, LEAD_BOUNCE_KINDS,
} from '@/lib/sales/leads';
import { toMoney } from '@/lib/salesPlanning';
import { notifyLeadHandoff } from '@/lib/sales/leadNotify';
import { loadUserDirectory } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';

// applyLeadScope / inLeadScope / canViewLeads / canCreateLead ย้ายไป
// `lib/sales/leads.js` แล้ว (ทะเบียนเธรดกลางเป็น lib จะ import จาก app route ไม่ได้
// · และ canCreateLead ต้องตรงกับปุ่ม "รับลีดใหม่" บนหน้า list เสมอ)

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const status = params.get('status');

  /* ⚠️ ไล่ทีละหน้า — `applyLeadScope` **คืน query เดิมโดยไม่กรองเลย** สำหรับ superuser /
     ผู้สังเกตการณ์ / marketing (ดู lib/sales/leads.js) ⇒ สามบทบาทนั้นอ่านทั้งตาราง
     และจะโดนเพดาน 1,000 แถวตัดเงียบ ๆ ก่อนเพื่อน · เรียง `createdAt` มากไปน้อย
     ⇒ ลีดเก่าหายก่อน แล้ว KPI ที่นับจากลิสต์นี้จะต่ำกว่าจริงโดยไม่มีสัญญาณ */
  const { data, error } = await fetchAllResult(() => {
    let query = supabase.from('sales_leads').select('*')
      .order('createdAt', { ascending: false })
      .order('id', { ascending: true });
    query = applyLeadScope(query, user);
    if (status && status !== 'all') query = query.eq('status', status);
    return query;
  });
  if (error) return fail(error.message, 500);
  const leads = data || [];

  /* ⭐ บริบทของใบที่ถูกส่งกลับ — ติดไปกับแถวเลย ไม่ให้จอต้องยิงรายใบ
     ใบที่ไม่เคยถูกตีกลับไม่มีคีย์นี้เลย (ไม่ใช่ค่าว่าง) ⇒ จอเช็ค `lead.bounce` ตรง ๆ ได้
     ⚠️ อ่านไม่สำเร็จ = **ไม่ใส่บริบท** แต่ยังคืนลีดตามปกติ — คิวลีดเป็นหน้าทำงานหลัก
     ล้มทั้งหน้าเพราะป้ายเสริมอ่านไม่ได้คือแลกผิดฝั่ง */
  await attachBounceContext(supabase, leads);
  return ok(leads);
});

/* ⚠️ ซอย `.in()` เสมอ — PostgREST ยัดลิสต์ลง query string ทั้งก้อน (ดู LEAD_ID_CHUNK)
   ⚠️ **ถามเฉพาะใบที่ยังอยู่คิวคัดกรอง** — ใบที่ถูกมอบหมายต่อไปแล้วไม่ต้องโชว์ป้าย
   "ส่งกลับ" อีก เพราะรอบใหม่เริ่มไปแล้ว · ตัดจำนวนใบที่ต้องถามลงมาก */
async function attachBounceContext(supabase, leads) {
  const ids = leads.filter((l) => l?.status === 'new').map((l) => l.id).filter(Boolean);
  if (!ids.length) return;
  const byLead = new Map();
  for (const chunk of chunkLeadIds(ids)) {
    const { data, error } = await supabase
      .from('lead_events')
      .select('leadId, kind, team, assigneeId, assigneeName, reason, createdAt')
      .in('leadId', chunk)
      .in('kind', LEAD_BOUNCE_KINDS)
      .order('createdAt', { ascending: false });
    if (error) {
      console.error('[leads] อ่านประวัติการตีกลับไม่สำเร็จ — คิวจะไม่มีป้ายบริบท:', error.message);
      return;
    }
    for (const row of data || []) {
      if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
      byLead.get(row.leadId).push(row);
    }
  }
  for (const lead of leads) {
    const events = byLead.get(lead.id);
    if (events?.length) lead.bounce = leadBounceHistory(events);
  }
}

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canCreateLead(user.role)) return forbidden('ลีดเพิ่มได้เฉพาะทีม Marketing และหัวหน้าฝ่ายขาย');

  const body = await req.json();
  if (!body.contactName?.trim()) return badRequest('ต้องระบุชื่อลูกค้า/ผู้ติดต่อ');
  if (!LEAD_CHANNELS.includes(body.channel)) return badRequest('ต้องระบุช่องทางที่รับลีด');
  const serviceInterest = SERVICE_INTERESTS.includes(body.serviceInterest) ? body.serviceInterest : 'other';
  const serviceDetail = (body.serviceDetail || '').trim();
  if (SERVICE_DETAIL_REQUIRED.has(serviceInterest) && !serviceDetail) {
    return badRequest('บริการที่สนใจประเภทนี้ต้องระบุรายละเอียด');
  }
  // ⚠️ ด่านเดียวกับ CHECK ของ mig 0233 — ตกที่นี่ได้ข้อความไทยพร้อมชื่อช่อง
  // ส่วนตกที่ DB ได้ error ภาษาอังกฤษที่คนกรอกอ่านไม่ออก
  const budgetError = leadBudgetError(body);
  if (budgetError) return badRequest(budgetError);

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
    budgetMax: toMoney(body.budgetMax, null),
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

  /* จุดส่งมอบ 1/3 — เข้ากล่องแจ้งเตือนของ **คนที่ต้องคัดกรอง** ไม่ใช่ห้องรวม
     🪦 เดิมมีคู่กับ Chat webhook (ประกาศให้ฝ่าย) ซึ่งถูกถอดออก 2026-08-12 ⇒ ตอนนี้
     ทางนี้คือ**ทางเดียว**ที่คนได้รู้ว่ามีลีดเข้ามา (ดูเหตุผลเต็มใน leadNotify.js) */
  notifyLeadHandoff(supabase, {
    action: 'create',
    lead: data,
    directory: await loadUserDirectory(supabase).catch(() => new Map()),
    actor: user,
  });

  // จุดส่งมอบ 1/3: ลีดใหม่เข้าคิว → แจ้งผู้คัดกรอง (Supervisor) ให้เริ่มนับ SLA 1 วันทำการ.

  return ok(data, 201);
});
