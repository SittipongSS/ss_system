import { withUser, ok, fail, badRequest, conflict, forbidden, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { canEditSalesPlanning, canViewSalesPlanning, dealAuditLabel, isWonStage } from '@/lib/salesPlanning';
import { refreshFgLinesForDisplay } from '@/lib/sales/quoteLines';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { createQuotationDraft, QuotationDraftError } from '@/lib/sales/createQuotationDraft';
import { closedProjectBlock } from '@/lib/sales/closedProjectGate';
import { dealAwaitsCustomer, dealCustomerAdoptError } from '@/lib/sales/dealCustomerAdopt';
import { caretakerTeamsOf, hasTeam, userTeams, viewScopeUser } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*)';


export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'view');
  if (response) return response;

  // ⚠️ ไล่ทีละหน้า — ดีลอายุยาวที่ออก Rev. ซ้ำ ๆ สะสมใบได้เรื่อย ๆ · พ่วง `id` ให้ลำดับนิ่ง
  const { data, error } = await fetchAllResult(() => supabase
    .from('quotations')
    .select(quoteSelect)
    .eq('dealId', deal.id)
    .order('createdAt', { ascending: false })
    .order('id', { ascending: true }));
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
  // มติผู้ใช้ 2026-07-15: 1 ดีลมีใบเสนอราคาได้หลายใบจนกว่าจะ Won — guard "1 ใบ active
  // ต่อดีล" (0099) ถูกยกเลิก (mig 0103 ดรอป unique index); ตอน Won ใบอื่นถูกปิด+ล็อกใน RPC
  const body = await req.json().catch(() => ({}));

  /* ⭐ **ดีลที่ยังไม่มีลูกค้า รับลูกค้าที่เลือกบนฟอร์มไปตั้งให้ตัวเอง** (มติผู้ใช้ 2026-08-24)
     ใบเสนอราคายังต้องมีลูกค้าเสมอ — ที่เปลี่ยนคือ "เติมได้จากตรงนี้" แทนการไล่คนกลับไป
     หน้าดีล (prod 2026-08-24: ดีลเปิดอยู่ 82 ใบไม่มีลูกค้า · 17 ใบไปถึงขั้นเสนอราคาแล้ว)
     กติกาอยู่ที่ lib/sales/dealCustomerAdopt ที่เดียว — ฟอร์มใช้ตัวเดียวกันกันเสนอ
     ตัวเลือกที่กดแล้วโดนตีกลับ · ท่าเดียวกับที่ `link-project` รับลูกค้าจากโครงการ */
  let workingDeal = deal;
  let adoptedCustomer = null;
  if (dealAwaitsCustomer(deal)) {
    if (!body.customerId) {
      return badRequest('ดีลนี้ยังไม่ระบุลูกค้า — เลือกลูกค้าบนฟอร์ม แล้วระบบจะตั้งให้ดีลด้วย');
    }
    const { data: customer } = await supabase
      .from('customers').select('id, name, "arCode", team, teams, "approvalStatus", "isActive"')
      .eq('id', body.customerId).maybeSingle();
    const adoptError = dealCustomerAdoptError(deal, customer);
    if (adoptError) return badRequest(adoptError);
    /* ⚠️ ขอบเขตทีมต้องตรวจซ้ำที่ server — ตัวเลือกบนจอถูกกรองด้วยกติกานี้อยู่แล้ว
       (GET /api/customers) แต่คนยิงตรงเข้ามาไม่ผ่านตัวกรองนั้น · ลูกค้าที่ไม่มีทีม
       เป็นของกลางที่ทุกทีมใช้ได้ (กติกาเดียวกับ `inScope`) */
    const teams = caretakerTeamsOf(customer);
    if (viewScopeUser(user) === 'team' && userTeams(user).length
      && teams.length && !hasTeam(user, teams)) {
      return badRequest('ลูกค้ารายนี้อยู่ในความดูแลของทีมอื่น');
    }
    /* guard `.is('customerId', null)` — สองคนกดพร้อมกันคนละลูกค้า ต้องมีคนแพ้
       ไม่ใช่เขียนทับกันเงียบ ๆ (ท่าเดียวกับ guard `projectId` ของ link-project) */
    const { data: linked, error: linkError } = await supabase
      .from('sales_deals')
      .update({ customerId: customer.id, customerName: customer.name || null, updatedAt: new Date().toISOString() })
      .eq('id', deal.id).is('customerId', null)
      .select().single();
    if (linkError) {
      if (linkError.code === 'PGRST116') return conflict('ดีลนี้เพิ่งถูกตั้งลูกค้าโดยคนอื่น — โหลดหน้าใหม่แล้วลองอีกครั้ง');
      return fail(linkError.message, 500);
    }
    workingDeal = linked;
    adoptedCustomer = customer;
    /* ⚠️ **เขียน audit ตรงนี้ ไม่ใช่หลังสร้างใบสำเร็จ** — ดีลถูกแก้ไปแล้วตั้งแต่บรรทัดบน
       ถ้ารอไปเขียนท้ายสุด เคสที่ "ตั้งลูกค้าสำเร็จแต่สร้างใบล้ม" จะกลายเป็นการแก้ข้อมูล
       ที่ไม่มีร่องรอยเลย (ตรวจเจอตอน UAT 2026-08-24) */
    await recordAudit({
      user, action: 'update', entityType: 'sales_deal', entityId: workingDeal.id,
      before: deal, after: workingDeal,
      summary: `ตั้งลูกค้า ${customer.arCode ? `${customer.arCode} · ` : ''}${customer.name || customer.id} ให้ดีล ${dealAuditLabel(deal)} ตอนออกใบเสนอราคา`,
      request: req,
    });
    /* ⚠️ **ตั้งลูกค้าก่อน แล้วค่อยสร้างใบ — ไม่ย้อนคืนถ้าสร้างใบล้ม** โดยเจตนา:
       ค่าที่เขียนคือสิ่งที่ผู้ใช้เลือกเองบนฟอร์ม และเป็นการเติมช่องว่าง ไม่ใช่ทับของเดิม
       ⇒ ล้มแล้วกดใหม่ได้ทันทีโดยไม่ต้องไปเติมลูกค้าซ้ำ (ย้อนคืนต่างหากคือการลบ
       สิ่งที่ผู้ใช้เพิ่งตั้งใจตั้ง) */
  }

  // โครงการปิดแล้ว = ออกใบใหม่ผูกเข้าโครงการนั้นไม่ได้ (มติ B3)
  const closedProject = await closedProjectBlock(supabase, workingDeal.projectId, 'ออกใบเสนอราคาใบใหม่');
  if (closedProject) return badRequest(closedProject);

  // core การสร้างใบอยู่ใน lib เดียวกับสายสหมิตร (ยืนยัน PO → ออก QT) — แก้กติกาใบที่นั่น
  try {
    const { quote, deal: updatedDeal } = await createQuotationDraft({ supabase, user, deal: workingDeal, body, request: req });
    return ok({
      ...quote,
      deal: updatedDeal,
      ...(adoptedCustomer ? { adoptedCustomer: { id: adoptedCustomer.id, name: adoptedCustomer.name || null } } : {}),
    }, 201);
  } catch (e) {
    if (e instanceof QuotationDraftError) return fail(e.message, e.status);
    throw e;
  }
});
