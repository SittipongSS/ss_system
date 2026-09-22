import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { linkDealToLead, unlinkDealFromLead } from '@/lib/sales/dealLeadLinkRepo';

export const dynamic = 'force-dynamic';

// POST   /api/sales-planning/deals/[id]/link-lead { leadId } — ผูกดีลที่มีอยู่เข้ากับลีดต้นทาง (ย้อนหลัง)
// DELETE /api/sales-planning/deals/[id]/link-lead           — ถอดลีดต้นทางออกจากดีล
//
// มติผู้ใช้ 2026-09-22: SA ลืมกด "เปิดดีลจากลีดนี้" แล้วไปเปิดดีลตรงจากหน้าดีล ⇒ ต้องผูกย้อนหลังได้
// ทั้งจากหน้าดีลและหน้าลีด — **สองจอยิง endpoint เดียวนี้** (หน้าลีดส่ง dealId ใน path)
// เพื่อให้ด่านฝั่งดีลผ่าน proxy (`salesplan:edit`) ทางเดียว · route ใต้ /leads ผ่าน proxy ด้วยแค่
// `salesplan:lead` ซึ่ง marketing ถือ ⇒ ถ้าวางไว้ฝั่งลีดต้องเขียนด่านดีลซ้ำเองในนั้น
//
// ด่าน: แก้ดีลใบนี้ได้ (loadScoped edit) + กติกาฝั่งลีด/ดีลใน lib/sales/dealLeadLink (ตัวเดียวกับจอ)
async function loadDeal({ user, supabase, ctx }) {
  if (!user) return { response: unauthorized() };
  if (!canEditSalesPlanning(user)) return { response: forbidden() };
  const { id } = await ctx.params;
  return loadScoped(supabase, 'sales_deals', id, user, 'edit');
}

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { row: deal, response } = await loadDeal({ user, supabase, ctx });
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  const result = await linkDealToLead(supabase, { deal, leadId: body.leadId, user, req });
  if (result.error) return fail(result.error, result.status);
  return ok(result.data, result.status);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { row: deal, response } = await loadDeal({ user, supabase, ctx });
  if (response) return response;
  const result = await unlinkDealFromLead(supabase, { deal, user, req });
  if (result.error) return fail(result.error, result.status);
  return ok(result.data, result.status);
});
