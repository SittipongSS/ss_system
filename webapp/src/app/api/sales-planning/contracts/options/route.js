import { loadScoped } from '@/lib/scopedRow';
import { nonExciseRowsOnly } from '@/lib/sales/historicalOrders';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
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

  /* สายธุรกิจอ่านจากดีลเอง (`deal` จาก loadScoped — select '*') · ไม่อ่านโครงการแล้ว (งวด P3b-1 ยุบโครงการ) */
  // ⚠️ ไล่ทีละหน้า — เหตุผลเดียวกับ /contracts
  const { data: quotations, error } = await fetchAllResult(() => supabase.from('quotations')
    .select('id, "quoteNumber", status, "approvalStatus", "totalAmount", "customerId", "customerName", "createdAt"')
    .eq('dealId', dealId).order('id', { ascending: true }));
  if (error) return fail(error.message, 500);

  const eligibility = contractEligibility({ deal, quotations: quotations || [] });
  const kinds = contractKindsForDeal(deal).map((kind) => ({
    kind,
    label: contractKindLabel(kind),
    ready: hasContractTemplate(kind),
    note: hasContractTemplate(kind) ? null : MISSING_TEMPLATE_NOTE,
    fields: contractTemplateFields(kind),
  }));

  return ok({
    dealId,
    // สายธุรกิจที่ใช้ตัดสินจริง — ของดีล (mig 0275)
    businessLine: contractBusinessLine(deal),
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
  /* ⛔ ใบค่าสรรพสามิต (mig 0414) ไม่ออกสัญญา และไม่มีดีล — ตัดที่ query ไม่งั้นมันกินโควตา 500 ใบของใบจริงไปเงียบ ๆ */
  const { data: quotations, error } = await nonExciseRowsOnly(supabase
    .from('quotations')
    .select('id, "quoteNumber", status, "approvalStatus", "totalAmount", "customerId", "customerName", "createdAt", "dealId"'))
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
    /* `line` = สายธุรกิจของดีล — ตัวตัดสินชนิดสัญญา (จ้างผลิต/บริการ) · เดิมอ่านจากโครงการเพราะ select นี้ไม่มี line
       ⇒ ต้องขอเพิ่มตอนถอดการอ่านโครงการ (งวด P3b-1 ยุบโครงการ) ไม่งั้นดีล NPD/RE-ORDER หลุดทุกใบ */
    .select('id, code, title, stage, "dealType", line, team, "ownerId", "ownerName", "customerId", "customerName", "projectId"')
    .in('id', [...byDeal.keys()]);
  if (dealError) return fail(dealError.message, 500);

  const rows = (deals || [])
    .filter((deal) => inSalesViewScope(user, deal))
    .map((deal) => {
      const eligibility = contractEligibility({ deal, quotations: byDeal.get(deal.id) || [] });
      return { deal, eligibility };
    })
    .filter((row) => row.eligibility.ok)
    .map((row) => ({
      id: row.deal.id,
      code: row.deal.code,
      title: row.deal.title,
      customerId: row.deal.customerId || null,
      customerName: row.deal.customerName,
      ownerName: row.deal.ownerName,
      quotationCount: (row.eligibility.quotations || []).length,
      /* ⭐ ชนิดสัญญาที่ดีลนี้ออกได้ (มติผู้ใช้ 2026-08-22 รอบสอง) — จอถามเรียง
         ลูกค้า → ชนิดสัญญา → ดีล ⇒ ต้องรู้ตั้งแต่ตอนโหลดว่าดีลไหนตอบชนิดไหนได้

         🐞 **เคยกรองด้วย `hasContractTemplate` ที่นี่ แล้วมันฆ่าเส้น external ทั้งเส้น**
         (เจอบนจอจริง 2026-08-31 หลัง #1529 ขึ้น production): สัญญาบริการยังไม่มีแม่แบบ
         ⇒ `kinds` ของดีลสาย SERVICE ว่างเปล่า ⇒ `.filter(row => row.kinds.length)`
         ตัดดีลบริการทิ้งทั้งหมด ⇒ ป้าย "สัญญาบริการ" เทาทุกลูกค้าพร้อมเหตุผลที่ผิด
         ("ลูกค้ารายนี้ยังไม่มีดีลที่ออกสัญญาชนิดนี้ได้" ทั้งที่มีดีลอยู่ 29 ดีล)
         ⇒ ฟีเจอร์ที่เพิ่งทำมาเพื่อ *ข้าม* ข้อจำกัดแม่แบบ ถูกข้อจำกัดเดิมปิดตายเสียเอง

         ⚠️ **ความพร้อมของแม่แบบไม่ใช่เรื่องของ "ดีลนี้ออกชนิดไหนได้"** — มันเป็นเรื่องของ
         *ที่มา* ที่ผู้ใช้เลือกทีหลัง (เจนต้องมีแม่แบบ · เอกสารภายนอกไม่ต้อง)
         ⇒ ที่นี่ตอบเฉพาะ "ดีลรองรับชนิดไหน" · จอเป็นคนบวกเงื่อนไขแม่แบบตามที่มาที่เลือก
            (`ContractCreateModal` — `!external && !hasContractTemplate(item)`) */
      kinds: contractKindsForDeal(row.deal),
    }))
    .filter((row) => row.kinds.length)
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

  return ok({ deals: rows });
}
