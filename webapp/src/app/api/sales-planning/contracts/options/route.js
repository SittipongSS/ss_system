import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { contractBusinessLine, contractEligibility, contractKindLabel, contractKindsForDeal } from '@/lib/sales/contracts';
import { contractTemplateFields, hasContractTemplate, MISSING_TEMPLATE_NOTE } from '@/lib/sales/contractTemplates';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/contracts/options?dealId=… — "ดีลนี้ออกสัญญาอะไรได้บ้าง"
//
// ⭐ จอถามด่านตัวเดียวกับที่ API ใช้ปฏิเสธจริง (contractEligibility) — ไม่คิดเงื่อนไขเอง
//    เพื่อไม่ให้เกิดปุ่มที่กดได้แล้วโดนปฏิเสธ หรือปุ่มที่หายไปทั้งที่ทำได้
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const dealId = new URL(req.url).searchParams.get('dealId');
  if (!dealId) return badRequest('ต้องระบุดีล');

  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', dealId, user, 'view');
  if (response) return response;

  const [{ data: project }, { data: quotations, error }] = await Promise.all([
    deal.projectId
      ? supabase.from('projects').select('id, code, name, line').eq('id', deal.projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('quotations')
      .select('id, "quoteNumber", status, "approvalStatus", "totalAmount", "customerId", "customerName", "createdAt"')
      .eq('dealId', dealId),
  ]);
  if (error) return fail(error.message, 500);

  const eligibility = contractEligibility({ deal, project, quotations: quotations || [] });
  const kinds = contractKindsForDeal(deal, project).map((kind) => ({
    kind,
    label: contractKindLabel(kind),
    ready: hasContractTemplate(kind),
    note: hasContractTemplate(kind) ? null : MISSING_TEMPLATE_NOTE,
    fields: contractTemplateFields(kind),
  }));

  return ok({
    dealId,
    // สายธุรกิจที่ใช้ตัดสินจริง — ของดีลก่อน แล้วค่อยตกไปที่โครงการ (mig 0275)
    businessLine: contractBusinessLine(deal, project),
    ok: eligibility.ok,
    reason: eligibility.reason,
    kinds,
    // ใบเสนอราคาที่ปลดล็อกสัญญาได้ (อนุมัติแล้วและยังมีผล) — เรียงใหม่สุดขึ้นก่อน
    quotations: (eligibility.quotations || [])
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  });
});
