import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { loadScoped } from '@/lib/scopedRow';
import { withUser, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { buildContractHTML } from '@/lib/sales/contractDocument';
import { hasContractTemplate, MISSING_TEMPLATE_NOTE } from '@/lib/sales/contractTemplates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/sales-planning/contracts/[id]/document — เอกสารสัญญาเป็น HTML สำหรับพิมพ์
//
// ใบที่ออกแล้ว → **เนื้อที่ตรึงไว้** เสมอ (ไม่เรนเดอร์จากข้อมูลสด) เพื่อให้พิมพ์ซ้ำได้
// เหมือนฉบับที่ลูกค้าถืออยู่ แม้แม่แบบหรือทะเบียนลูกค้าจะเปลี่ยนไปแล้ว
// ใบร่าง → เรนเดอร์สดเป็นตัวอย่าง (มีลายน้ำ "ฉบับร่าง")
//
// ⭐ ใบที่ออกเลขแล้วแต่เนื้อยังว่าง (เรนเดอร์ล้มตอนกดออกสัญญา) → เรนเดอร์ซ้ำแล้วเก็บ
//    ให้เอง (idempotent) — ไม่ใช่ใบเสียที่ต้องยกเลิกทิ้ง
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: contract, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;
  if (!hasContractTemplate(contract.kind)) return fail(MISSING_TEMPLATE_NOTE, 409);

  let html = contract.issuedHtml || null;
  if (!html) {
    const company = await getPublishedCompanyProfile(supabase);
    html = buildContractHTML(contract, {
      company,
      quotation: { quoteNumber: contract.metadata?.quoteNumber },
      options: { toolbar: false },
    });
    // ใบที่ออกเลขแล้วเท่านั้นที่เก็บเนื้อไว้ — ร่างต้องเรนเดอร์สดทุกครั้ง ไม่งั้นจะ
    // พิมพ์ร่างเก่าออกมาหลังแก้ช่องกรอก
    if (contract.contractNo) {
      await supabase.from('sales_contracts').update({ issuedHtml: html }).eq('id', id);
    }
  }

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
});
