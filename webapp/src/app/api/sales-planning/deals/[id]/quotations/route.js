import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { canEditSalesPlanning, canViewSalesPlanning, isWonStage } from '@/lib/salesPlanning';
import { refreshFgLinesForDisplay } from '@/lib/sales/quoteLines';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { createQuotationDraft, QuotationDraftError } from '@/lib/sales/createQuotationDraft';
import { closedProjectBlock } from '@/lib/sales/closedProjectGate';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*)';


export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'view');
  if (response) return response;

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
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'edit');
  if (response) return response;
  if (deal.stage === 'lost') return badRequest('ไม่สามารถสร้างใบเสนอราคาจากโครงการที่ Lost แล้ว');
  // ดีลปิด Won แล้ว = ใบเสนอราคาถูกล็อกทั้งชุด (เพิ่ม/แก้/ลบไม่ได้ — มติผู้ใช้ 2026-07-15)
  if (isWonStage(deal.stage)) {
    return badRequest('ดีลนี้ปิด Won แล้ว — ใบเสนอราคาถูกล็อก เพิ่มใบใหม่ไม่ได้');
  }

  /* ⭐ **ไม่บังคับโครงการตอนออกใบ** (2026-08-24 · ฟีดแบคผู้ใช้ "ยุ่งยาก") — ด่านนี้เคย
     อ้างว่า "โครงการเป็นตัวเชื่อมลูกค้า" ซึ่งบรรทัดถัดไปตรวจ `customerId` ตรง ๆ อยู่แล้ว
     และ `createQuotationDraft` ไม่อ่านค่าโครงการเลยสักที่ (`quotations` ไม่มีคอลัมน์
     `projectId` ด้วยซ้ำ — โครงการโชว์บนใบผ่านดีลเท่านั้น)
     ⇒ ด่าน "ต้องมีโครงการ" เหลือที่เดียวคือตอนรับใบปิด Won (`quotations/[id]/accept`)
     ซึ่งเป็นจุดที่ SO ก๊อป `projectId` ไปใช้จริงแล้วไหลต่อไปงานผลิต/ส่งของ
     ⚠️ ห้ามเพิ่มด่านกลับมาที่นี่โดยไม่ย้ายด่านของ accept ออกก่อน — สองด่านที่ถามเรื่อง
     เดียวกันคนละเวลาคือที่มาของฟีดแบครอบนี้
     ส่วนรายการสินค้า (รหัส FG) ค่อยใส่ตอนแก้ใบ ไม่บังคับตอนสร้าง */
  // cascade: ใบเสนอราคาต้องมีลูกค้า (มติผู้ใช้ — เลือกลูกค้าที่ดีลก่อน)
  if (!deal.customerId) return badRequest('ดีลนี้ยังไม่ระบุลูกค้า — เลือกลูกค้าที่ดีลก่อน แล้วจึงออกใบเสนอราคา');
  // โครงการปิดแล้ว = ออกใบใหม่ผูกเข้าโครงการนั้นไม่ได้ (มติ B3)
  const closedProject = await closedProjectBlock(supabase, deal.projectId, 'ออกใบเสนอราคาใบใหม่');
  if (closedProject) return badRequest(closedProject);

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
