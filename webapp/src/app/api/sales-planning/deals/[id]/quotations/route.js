import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canEditSalesPlanning,
  canViewSalesPlanning,
  inSalesEditScope,
  inSalesViewScope,
} from '@/lib/salesPlanning';
import { refreshFgLinesForDisplay } from '@/lib/sales/quoteLines';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { createQuotationDraft, QuotationDraftError } from '@/lib/sales/createQuotationDraft';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*)';

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const { data, error } = await supabase
    .from('quotations')
    .select(quoteSelect)
    .eq('dealId', deal.id)
    .order('createdAt', { ascending: false });
  if (error) return fail(error.message, 500);
  // บรรทัด FG โชว์คำอธิบายสดจาก master เฉพาะใบที่ยังแก้ได้ (แสดงผลเท่านั้น ไม่บันทึก)
  return ok(await refreshFgLinesForDisplay(supabase, latestQuotationRevisions(data || [])));
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, deal)) return forbidden();
  if (deal.stage === 'lost') return badRequest('ไม่สามารถสร้างใบเสนอราคาจากโครงการที่ Lost แล้ว');
  // ดีลปิด Won แล้ว = ใบเสนอราคาถูกล็อกทั้งชุด (เพิ่ม/แก้/ลบไม่ได้ — มติผู้ใช้ 2026-07-15)
  if (['won', 'in_project'].includes(deal.stage)) {
    return badRequest('ดีลนี้ปิด Won แล้ว — ใบเสนอราคาถูกล็อก เพิ่มใบใหม่ไม่ได้');
  }

  // เงื่อนไขใหม่ (feedback ผู้ใช้): ดีลต้องผูกโครงการก่อน — โครงการเป็นตัวเชื่อมลูกค้า
  // ส่วนรายการสินค้า (รหัส FG) ค่อยใส่ตอนแก้ใบ ไม่บังคับตอนสร้าง
  if (!deal.projectId) return badRequest('ดีลนี้ยังไม่ผูกโครงการ — สร้าง/ผูกโครงการก่อน แล้วจึงออกใบเสนอราคา');
  // cascade: ใบเสนอราคาต้องมีลูกค้า (มติผู้ใช้ — เลือกลูกค้าที่ดีลก่อน)
  if (!deal.customerId) return badRequest('ดีลนี้ยังไม่ระบุลูกค้า — เลือกลูกค้าที่ดีลก่อน แล้วจึงออกใบเสนอราคา');

  // มติผู้ใช้ 2026-07-15: 1 ดีลมีใบเสนอราคาได้หลายใบจนกว่าจะ Won — guard "1 ใบ active
  // ต่อดีล" (0099) ถูกยกเลิก (mig 0103 ดรอป unique index); ตอน Won ใบอื่นถูกปิด+ล็อกใน RPC
  const body = await req.json().catch(() => ({}));
  // core การสร้างใบอยู่ใน lib เดียวกับสายสหมิตร (ยืนยัน PO → ออก QT) — แก้กติกาใบที่นั่น
  try {
    const { quote, deal: updatedDeal } = await createQuotationDraft({ supabase, user, deal, body, request: req });
    return ok({ ...quote, deal: updatedDeal }, 201);
  } catch (e) {
    if (e instanceof QuotationDraftError) return fail(e.message, e.status);
    throw e;
  }
});
