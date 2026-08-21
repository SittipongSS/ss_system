import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { loadScoped } from '@/lib/scopedRow';
import { withUser, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { buildAddendumHTML } from '@/lib/sales/addendumDocument';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/sales-planning/addenda/[id]/document — ฉบับที่ตรึงไว้ (ออกแล้ว) หรือพรีวิวสด (ร่าง)
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: addendum, response } = await loadScoped(supabase, 'sales_contract_addenda', id, user, 'view');
  if (response) return response;

  let html = addendum.issuedHtml || null;
  if (!html) {
    const { data: contract, error } = await supabase
      .from('sales_contracts').select('*').eq('id', addendum.contractId).maybeSingle();
    if (error) return fail(error.message, 500);
    const company = await getPublishedCompanyProfile(supabase);
    html = buildAddendumHTML(addendum, { contract: contract || {}, company });
    // ใบที่ออกเลขแล้วเท่านั้นที่เก็บเนื้อไว้ — ร่างต้องเรนเดอร์สดทุกครั้ง
    if (addendum.docNo) await supabase.from('sales_contract_addenda').update({ issuedHtml: html }).eq('id', id);
  }

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
});
