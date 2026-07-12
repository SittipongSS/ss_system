import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { buildProjectTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { canEditSalesPlanning, dealAuditLabel, dealTypeOf, inSalesEditScope } from '@/lib/salesPlanning';
import { genId } from '@/lib/id';

export const dynamic = 'force-dynamic';

// DL1: ไทม์ไลน์ของดีลเอง — task ลอย (projectId ว่าง, mig 0094) เกิดที่ดีลตั้งแต่
// ยังไม่มีโครงการ. ตอนผูกโครงการ (link-project/create-project) task ชุดนี้ถูก
// "รับเลี้ยง" เข้าโครงการ (เติม projectId) — ไม่ gen ซ้ำ.

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

const guard = (user, deal) => {
  if (!canEditSalesPlanning(user) || !can(user.role, 'pm:edit')) return forbidden();
  if (!inSalesEditScope(user, deal)) return forbidden();
  return null;
};

// POST /api/sales-planning/deals/[id]/timeline { startDate?, categoryCode? }
// gen ไทม์ไลน์จาก template ตาม (ประเภทดีล + หมวดสินค้า) — anchor ที่ startDate
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  const denied = guard(user, deal);
  if (denied) return denied;
  if (deal.stage === 'lost') return badRequest('ดีล Lost แล้ว สร้างไทม์ไลน์ไม่ได้');
  if (deal.projectId) return conflict('ดีลนี้ผูกโครงการแล้ว — จัดการไทม์ไลน์ที่หน้าโครงการ');

  const { count: existing } = await supabase
    .from('project_tasks').select('id', { count: 'exact', head: true })
    .eq('dealId', deal.id).is('projectId', null);
  if ((existing || 0) > 0) return conflict('ดีลนี้มีไทม์ไลน์แล้ว — ลบก่อนถ้าต้องการสร้างใหม่');

  const body = await req.json().catch(() => ({}));
  const categoryCode = (body.categoryCode ?? deal.categoryCode ?? '').trim() || null;
  const startDate = body.startDate || todayStr();
  const now = new Date().toISOString();

  setHolidays([...(await holidaySet())]);
  const rows = applyAutoStatuses(buildProjectTasks(
    // เทียบ field โครงการ: type = ประเภทดีล, productMainCategory = หมวดบนดีล
    { type: dealTypeOf(deal), productMainCategory: categoryCode || '', startDate, aeOwner: deal.ownerName || '' },
    null,          // projectId ว่าง = ไทม์ไลน์ลอยของดีล
    deal.id,
  ));
  const { data: inserted, error: insErr } = await supabase.from('project_tasks').insert(rows).select();
  if (insErr) return fail(`สร้างไทม์ไลน์ไม่สำเร็จ: ${insErr.message}`, 500);

  // บันทึกหมวดที่ใช้ + ขยับ stage เป็น timeline_proposed (เหมือน flow ผูกโครงการ)
  const patch = { updatedAt: now };
  if (categoryCode !== (deal.categoryCode || null)) patch.categoryCode = categoryCode;
  if (['lead', 'qualified', 'quotation'].includes(deal.stage)) patch.stage = 'timeline_proposed';
  const { data: updatedDeal, error: upErr } = await supabase
    .from('sales_deals').update(patch).eq('id', deal.id).select().single();
  if (upErr) return fail(upErr.message, 500);
  if (patch.stage) {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'), dealId: deal.id, fromStage: deal.stage, toStage: patch.stage,
      changedBy: user.id || null, changedByName: user.name || null,
    });
  }

  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id, before: deal, after: updatedDeal,
    summary: `สร้างไทม์ไลน์ของดีล ${dealAuditLabel(deal)} (${dealTypeOf(deal)}${categoryCode ? ` · หมวด ${categoryCode}` : ''} · ${inserted.length} ขั้นตอน)`,
    request: req,
  });
  return ok({ deal: updatedDeal, tasks: inserted }, 201);
});

// DELETE /api/sales-planning/deals/[id]/timeline — ลบไทม์ไลน์ลอย (ไว้สร้างใหม่)
// เฉพาะดีลที่ยังไม่ผูกโครงการ; segment ในโครงการลบผ่านฝั่ง PM ตามเดิม
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  const denied = guard(user, deal);
  if (denied) return denied;
  if (deal.projectId) return conflict('ดีลนี้ผูกโครงการแล้ว — จัดการไทม์ไลน์ที่หน้าโครงการ');

  const { data: gone, error } = await supabase
    .from('project_tasks').delete().eq('dealId', deal.id).is('projectId', null).select('id');
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id, before: deal,
    summary: `ลบไทม์ไลน์ของดีล ${dealAuditLabel(deal)} (${(gone || []).length} ขั้นตอน)`,
    request: req,
  });
  return ok({ removed: (gone || []).length });
});
