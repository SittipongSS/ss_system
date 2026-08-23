import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { cascadeNpdProbability } from '@/lib/sales/dealProbability';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { canEditSalesPlanning, dealAuditLabel, inSalesEditScope, isWonStage } from '@/lib/salesPlanning';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { validateDocumentReadiness } from '@/lib/documentWorkflow';
import { quotationWonAmount } from '@/lib/sales/quotationWonAmount';
import { linkDealToProject } from '@/lib/sales/dealProjectLink';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  /* ปิด Won = ยืนยันอย่างเดียว (มติผู้ใช้ 2026-08-24) — ไม่มีหลักฐานให้กรอกแล้ว
     เอกสารยืนยันคำสั่งซื้อ (สลิป/PO/ใบยืนยัน) ย้ายไปอยู่กับใบสั่งขาย (mig 0285)
     และเป็นด่านของ **การยื่นอนุมัติใบสั่งขาย** ไม่ใช่ด่านของการปิดการขาย
     ⚠️ RPC ยังรับ `p_evidence` ไว้เผื่อของเก่า — ที่นี่ส่ง {} เสมอ */
  const body = await req.json().catch(() => ({}));
  const { id } = await ctx.params;
  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('quotation not found');
  if (quote.status === 'accepted') return badRequest('ใบเสนอราคานี้ถูกรับแล้ว');
  if (quote.status === 'closed') return badRequest('ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น)');
  if (['cancelled', 'rejected', 'revised'].includes(quote.status)) return badRequest('quotation cannot be accepted');
  // ยอดก่อน VAT 0 บาทปิด Won ได้ (มติผู้ใช้ 2026-08-03) — ใบที่ลด/แถมจนเหลือ 0 ก็เป็นดีล
  // ที่ปิดได้จริง ยอด Won 0 ที่เขียนลงดีลคือค่าที่ถูกต้องของใบนั้น ไม่ใช่ข้อมูลหาย

  const { data: dealRow, error: dealError } = await supabase.from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
  if (dealError) return fail(dealError.message, 500);
  if (!dealRow) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, dealRow)) return forbidden();
  if (dealRow.stage === 'lost') return badRequest('ดีลนี้ปิดเป็น Lost แล้ว ไม่สามารถปิด Won ผ่านใบเสนอราคาได้');
  if (isWonStage(dealRow.stage)) return badRequest('ดีลนี้ปิดการขาย (Won) แล้ว');

  /* ⭐ **ผูกโครงการให้ในคำขอเดียวกัน** (มติผู้ใช้ 2026-08-24) — ตั้งแต่ #1385 ด่าน
     โครงการเหลือที่เดียวคือตรงนี้ ⇒ ดีลลอยที่พร้อมปิดต้องปลดด่านได้จากโมดัลเลย
     ไม่ต้องออกไปหน้าดีลก่อนแล้วกลับมา
     ⚠️ **ทำในคำขอเดียว ไม่ใช่ให้หน้าจอยิงสองครั้ง** — ยิงสองครั้งแล้วครั้งที่สองล้ม
     = ดีลผูกโครงการไปแล้วโดยที่ยังไม่ Won ซึ่งไม่มีใครสั่งให้เกิด
     ⚠️ ล้มที่ขั้นผูก = ยังไม่แตะสถานะใบเลย (ผูกก่อน accept โดยตั้งใจ: RPC ต้องเห็น
     projectId แล้ว ไม่งั้นมันจะ raise deal_project_required) */
  let deal = dealRow;
  if (!deal.projectId) {
    const projectId = String(body.projectId || '').trim();
    if (!projectId) return badRequest('ดีลนี้ยังไม่ผูกโครงการ — เลือกโครงการในโมดัลปิด Won ก่อน');
    if (!can(user.role, 'pm:edit')) return forbidden('ไม่มีสิทธิ์ผูกโครงการให้ดีล');
    const linked = await linkDealToProject(supabase, { deal, projectId, user, req });
    if (linked.error) return fail(linked.error, linked.status);
    deal = linked.data.deal || { ...deal, projectId };
  } else if (body.projectId && String(body.projectId) !== String(deal.projectId)) {
    // ย้ายโครงการเป็นคนละเรื่องกับการปิดการขาย — ทำที่หน้าดีล (ต้องส่ง move: true)
    return badRequest('ดีลนี้ผูกโครงการอยู่แล้ว — ย้ายโครงการทำที่หน้าดีล');
  }

  const currentFingerprint = quotationApprovalFingerprint(quote);
  // ปิด Won ได้ต่อเมื่อใบผ่านการอนุมัติ (approved + fingerprint ตรง) หรือเป็นใบ grandfather
  // (not_required) — กัน Won ใบที่ยังไม่ได้เซ็นรับรองจากเจ้าของดีล (มติ 2026-07-18).
  const readiness = validateDocumentReadiness({
    action: 'accept',
    status: quote.status,
    lineCount: quote.lines?.length || 0,
    approvalStatus: quote.approvalStatus,
    approvalFingerprint: quote.approvalFingerprint,
    currentFingerprint,
  });
  if (!readiness.ok) {
    // แยก "ยังไม่ยื่น" ออกจาก "ยื่นแล้วรออนุมัติ" (mig 0155) — คนละปุ่มที่ต้องกดต่อ
    if (quote.approvalStatus === 'not_submitted') {
      return badRequest('ใบเสนอราคานี้ยังไม่ได้ยื่นอนุมัติ — กด "ยื่นอนุมัติ" แล้วให้เจ้าของดีลอนุมัติก่อนจึงจะปิด Won ได้');
    }
    return badRequest(quote.approvalStatus === 'pending'
      ? 'ใบเสนอราคานี้ยังไม่ได้รับการอนุมัติจากเจ้าของดีล — อนุมัติก่อนจึงจะปิด Won ได้'
      : readiness.error);
  }

  const { data: result, error: acceptError } = await supabase.rpc('accept_quotation_atomic', {
    p_quote_id: quote.id,
    p_current_fingerprint: currentFingerprint,
    p_actor_id: user.id || null,
    p_actor_name: user.name || null,
    p_history_id: genId('DSH'),
    p_forecast_id: genId('DFC'),
    p_evidence: {},
  });
  if (acceptError) {
    if (acceptError.code === '23505' || acceptError.message?.includes('already_has_accepted')) {
      return conflict('ดีลนี้มีใบเสนอราคาที่รับแล้ว');
    }
    const clientError = /quotation_|deal_closed|deal_not_found|deal_project_required/.test(acceptError.message || '');
    return fail(acceptError.message, clientError ? 400 : 500);
  }
  const accepted = { ...(result?.quotation || {}), lines: quote.lines || [] };
  const updatedDeal = result?.deal;

  // ⭐ SCENT ปิด Won แล้ว → NPD พี่น้องในโครงการเดียวกันขึ้นเป็น 80% (มติผู้ใช้ 2026-08-05)
  // ลูกค้าจ่ายจริงกับโครงการนี้ไปแล้ว งานพัฒนาสินค้าที่ต่อยอดจึงไม่ใช่ 50% อีกต่อไป
  // ⚠️ นอก RPC โดยตั้งใจ: กติกาอยู่ใน JS ที่เดียว (dealProbability.js) ถ้าย้ายลง SQL จะมี
  // กติกาสองชุดที่ต้องแก้พร้อมกันตลอดไป · พลาดแล้วไม่ล้ม accept (ดีลปิดไปแล้วจริง)
  let cascaded = [];
  try {
    cascaded = await cascadeNpdProbability(supabase, updatedDeal?.projectId || deal.projectId, { changedBy: user.id || null });
  } catch (cascadeError) {
    console.error('cascadeNpdProbability failed', cascadeError);
  }

  // เหตุการณ์ลงเธรดของใบ — ไม่เช็ค error โดยเจตนา (ดู submit/route.js)
  await appendDocumentEvent(supabase, {
    docType: 'quotation', doc: quote, action: 'accept', user,
  });

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: quote.id,
    before: quote,
    after: accepted,
    summary: `mark quotation ${quote.quoteNumber} as Won for ${dealAuditLabel(deal)}`,
    request: req,
  });

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: deal.id,
    before: deal,
    after: updatedDeal,
    summary: `Won deal from quotation ${quote.quoteNumber} (ex VAT ${quotationWonAmount(quote)})`,
    request: req,
  });

  // FC ที่ถูก cascade ต้องมีร่องรอย — ไม่งั้นเลขขยับเองโดยไม่มีใครอธิบายได้
  for (const row of cascaded) {
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_deal',
      entityId: row.id,
      before: { probability: row.previousProbability },
      after: { probability: row.probability },
      summary: `FC ${row.previousProbability}% → ${row.probability}% (SCENT ในโครงการเดียวกันปิด Won จากใบ ${quote.quoteNumber})`,
      request: req,
    });
  }

  // แจ้งทีมขาย: ดีลปิดได้ (Won) — จุดสำคัญสุดของวงจร เดิมเงียบ (ทาง QT accept ไม่ผ่าน
  // insertWinSideEffects เลยไม่มีการ์ด). ส่งหลังเขียน DB สำเร็จ, fire-and-forget

  return ok({ quotation: accepted, deal: updatedDeal });
});
