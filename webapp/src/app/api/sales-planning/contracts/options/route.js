import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { contractBusinessLine, contractEligibility, contractKindLabel, contractKindsForDeal } from '@/lib/sales/contracts';
import { contractTemplateFields, hasContractTemplate, MISSING_TEMPLATE_NOTE } from '@/lib/sales/contractTemplates';

export const dynamic = 'force-dynamic';

/* GET /api/sales-planning/contracts/options?dealId=… — "ดีลนี้ออกสัญญาอะไรได้บ้าง"
   GET /api/sales-planning/contracts/options            — "ตอนนี้ออกสัญญาจากดีลไหนได้บ้าง"

   ⭐ จอถามด่านตัวเดียวกับที่ API ใช้ปฏิเสธจริง (contractEligibility) — ไม่คิดเงื่อนไขเอง
      เพื่อไม่ให้เกิดปุ่มที่กดได้แล้วโดนปฏิเสธ หรือปุ่มที่หายไปทั้งที่ทำได้
   ⭐ แบบไม่ระบุดีลใช้กับปุ่ม "สร้างสัญญา" บนหัวทะเบียน (มติผู้ใช้ 2026-08-22) — คนกดยังไม่ได้
      อยู่ในดีลไหน ⇒ ต้องมีรายการดีลที่ *ออกได้จริง* ให้เลือกก่อน ไม่ใช่ให้ไปหาเอง */
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const dealId = new URL(req.url).searchParams.get('dealId');
  if (!dealId) return listDealsThatCanIssue({ user, supabase });

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

/* ดีลที่ออกสัญญาได้ตอนนี้ — เริ่มจาก **ใบเสนอราคาที่อนุมัติแล้ว** แล้วค่อยย้อนขึ้นไปหาดีล
   (ไล่จากดีลทุกใบแล้วค่อยกรองคือกวาดทั้งตารางเพื่อเอาไม่กี่แถว)
   ⚠️ ด่านจริงยังเป็น contractEligibility ตัวเดิม — ที่นี่แค่คัดผู้เข้าชิงให้แคบลงก่อน */
async function listDealsThatCanIssue({ user, supabase }) {
  const { data: quotations, error } = await supabase
    .from('quotations')
    .select('id, "quoteNumber", status, "approvalStatus", "totalAmount", "customerId", "customerName", "createdAt", "dealId"')
    .eq('approvalStatus', 'approved')
    .order('createdAt', { ascending: false })
    .limit(500);
  if (error) return fail(error.message, 500);

  const byDeal = new Map();
  for (const quotation of quotations || []) {
    if (!quotation.dealId) continue;
    if (!byDeal.has(quotation.dealId)) byDeal.set(quotation.dealId, []);
    byDeal.get(quotation.dealId).push(quotation);
  }
  if (!byDeal.size) return ok({ deals: [] });

  const { data: deals, error: dealError } = await supabase
    .from('sales_deals')
    .select('id, code, title, stage, "dealType", team, "ownerId", "ownerName", "customerName", "projectId"')
    .in('id', [...byDeal.keys()]);
  if (dealError) return fail(dealError.message, 500);

  const projectIds = [...new Set((deals || []).map((deal) => deal.projectId).filter(Boolean))];
  let projectById = new Map();
  if (projectIds.length) {
    const { data: projects, error: projectError } = await supabase
      .from('projects').select('id, code, name, line').in('id', projectIds);
    if (projectError) return fail(projectError.message, 500);
    projectById = new Map((projects || []).map((project) => [project.id, project]));
  }

  const rows = (deals || [])
    .filter((deal) => inSalesViewScope(user, deal))
    .map((deal) => {
      const project = deal.projectId ? projectById.get(deal.projectId) || null : null;
      const eligibility = contractEligibility({ deal, project, quotations: byDeal.get(deal.id) || [] });
      return { deal, project, eligibility };
    })
    .filter((row) => row.eligibility.ok)
    .map((row) => ({
      id: row.deal.id,
      code: row.deal.code,
      title: row.deal.title,
      customerName: row.deal.customerName,
      ownerName: row.deal.ownerName,
      quotationCount: (row.eligibility.quotations || []).length,
    }))
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

  return ok({ deals: rows });
}
