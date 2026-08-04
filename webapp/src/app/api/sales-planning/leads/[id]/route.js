import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canForceDelete, isForceRequest } from '@/lib/forceDelete';
import { can } from '@/lib/permissions';
import {
  LEAD_CHANNELS, SERVICE_INTERESTS, SERVICE_DETAIL_REQUIRED, channelGroupOf, canEditLead,
  canDeleteLead, LEAD_LOCKED_STATUSES, canViewLeads, inLeadScope,
} from '@/lib/sales/leads';
import { toMoney } from '@/lib/salesPlanning';
import { purgeUpdates } from '@/lib/master/updates';

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
  // canDelete คำนวณที่นี่เหมือน canEdit — หน้ารายละเอียดจะได้ไม่ต้องคิดนโยบายซ้ำ
  // (หน้า list คิดฝั่ง client เพราะมีลีดหลายใบในจอเดียว ไม่คุ้มยิงถามทีละใบ)
  return ok({
    ...lead,
    events: events || [],
    relatedDeals: relatedDeals || [],
    canEdit: canEditLead(user, lead),
    // ⚠️ ต้องรวมด่าน "มีดีลผูกอยู่" ที่ DELETE บังคับด้วย ไม่งั้นปุ่มลบโผล่แล้วกดได้
    // 409 เสมอ = error ที่ผู้ใช้เดาไม่ได้ (บทเรียนเดียวกับปุ่มลบดีลที่มีใบ accepted)
    // ดีลที่ผูกอยู่โหลดมาแล้วข้างบน — ไม่ต้องยิงถามเพิ่ม
    canDelete: canDeleteLead(user, lead) && !(relatedDeals || []).length,
  });
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

  // ⭐ ลีดที่แตกดีลไปแล้วลบไม่ได้ (มติผู้ใช้ 2026-08-04) — เดิมลบผ่านเงียบ ๆ แล้ว
  // ทิ้งความเสียหายไว้สองอย่างที่ไม่มีอะไรบอก:
  //   1. `sales_deals.leadId` เป็น ON DELETE SET NULL (mig 0093) → คอลัมน์ว่าง
  //      แต่ `metadata.leadId` ที่ POST /deals เขียนคู่ไว้ยังค้าง = สองความจริงใน
  //      แถวเดียว ซึ่งเป็นสิ่งที่ `sourceLeadIdOf` ออกแบบมาเพื่อกันโดยเฉพาะ
  //   2. `lead_events` เป็น ON DELETE CASCADE (mig 0091) → ประวัติ conversion ของ
  //      ดีลที่ **ยังอยู่** หายตามลีดไปทั้งชุด กู้ไม่ได้
  // กติกาเดียวกับที่ลบโครงการที่ยังมีดีลผูกอยู่ไม่ได้ — ให้ไปจัดการดีลก่อน
  const force = isForceRequest(req) && canForceDelete(user);
  if (!force) {
    const { count: dealCount, error: dealCountError } = await supabase
      .from('sales_deals').select('id', { count: 'exact', head: true }).eq('leadId', id);
    if (dealCountError) return fail(`ตรวจดีลที่ผูกลีดไม่สำเร็จ: ${dealCountError.message}`, 500);
    if ((dealCount || 0) > 0) {
      return conflict(
        `ลีดนี้แตกเป็นดีลไปแล้ว ${dealCount} ดีล — ลบไม่ได้ เพราะประวัติการเปิดดีลจะหายไปจากดีลที่ยังอยู่`
        + ' กรุณาลบดีลที่ผูกอยู่ทั้งหมดที่หน้า "บริหารงานขาย" ก่อน แล้วจึงลบลีดที่นี่ได้',
      );
    }
  } else {
    // บังคับลบ (แอดมิน): ล้าง pointer ที่ชี้ลีดใบนี้ใน metadata ของดีลก่อน ไม่งั้น
    // คอลัมน์ถูก SET NULL แต่ metadata ยังชี้ลีดที่ไม่มีอยู่แล้ว (ปัญหาเดิมข้อ 1)
    const { data: linked, error: linkedError } = await supabase
      .from('sales_deals').select('id, metadata').eq('leadId', id);
    if (linkedError) return fail(`อ่านดีลที่ผูกลีดไม่สำเร็จ: ${linkedError.message}`, 500);
    for (const deal of linked || []) {
      const { leadId: _dropped, ...rest } = deal.metadata || {};
      const { error: cleanError } = await supabase
        .from('sales_deals').update({ metadata: rest }).eq('id', deal.id);
      if (cleanError) return fail(`ล้างการอ้างลีดในดีล ${deal.id} ไม่สำเร็จ: ${cleanError.message} — ยังไม่ได้ลบลีด`, 500);
    }
  }

  const { error } = await supabase.from('sales_leads').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  // เธรดกลางเป็น polymorphic ไม่มี FK → ต้องกวาดเอง ไม่งั้นข้อความค้างในตารางตลอดไป
  // (lead_events มี FK ของตัวเอง จึงหายไปพร้อมลีดอยู่แล้ว)
  await purgeUpdates(supabase, 'lead', id);
  await recordAudit({
    user, action: 'delete', entityType: 'sales_lead', entityId: id, before,
    summary: `ลบลีด ${before.contactName}${force ? ' (บังคับลบทั้งที่มีดีลผูกอยู่ — สิทธิ์ผู้ดูแลระบบ)' : ''}`,
    request: req,
  });
  return ok({ ok: true });
});
