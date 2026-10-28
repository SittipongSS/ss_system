import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, dealAuditLabel } from '@/lib/salesPlanning';
import { attachSourceDeals, inSalesDocScope } from '@/lib/scopedRow';
import { quotationApprovalDeal } from '@/lib/sales/quotationWorkflow';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { linePackGateMessage, linePackIssues } from '@/lib/sales/linePacks';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import {
  submitQuotationWithSignatureEvidence,
  signatureEvidenceErrorResponse,
} from '@/lib/admin/signatureEvidence';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/quotations/[id]/submit — ยื่นใบเสนอราคาให้เจ้าของดีลอนุมัติ
// (mig 0155). ขั้นนี้ไม่เคยมีมาก่อน: ใบเกิดมาเป็น "รออนุมัติ" ทันทีตั้งแต่ mig 0114 ทำให้
// อนุมัติใบที่ยังกรอกไม่เสร็จได้ และช่อง "ผู้เสนอราคา" ไม่มีจุดที่ถือว่าลงนาม
//
// การกดยื่น = การลงนามของผู้เสนอราคา → บันทึกหลักฐานบทบาท proposer พร้อมเปลี่ยนสถานะใน
// ทรานแซกชันเดียว (RPC). **ห้ามย้ายตรรกะนี้ไปอยู่ใน save_quotation_content** เพราะนั่นถูก
// เรียกทุกครั้งที่กดบันทึก จะเกิดหลักฐานซ้ำทุกการบันทึก
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  // ยื่น = การกระทำของผู้จัดทำเอกสาร (ไม่ใช่ผู้อนุมัติ) จึง gate ด้วยสิทธิ์แก้ไขเหมือนการบันทึก
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*), deal:sales_deals(id, title, code, ownerId, ownerName, team, stage, customerName)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  /* ใบค่าสรรพสามิต (mig 0414/0415) ไม่มีดีล — ขอบเขต/ผู้อนุมัติถอยไปดีลของ SO ต้นทาง */
  const { error: sourceError } = await attachSourceDeals(supabase, [quote]);
  if (sourceError) return fail(sourceError.message, 500);
  const approvalDeal = quotationApprovalDeal(quote);
  if (!approvalDeal) return badRequest('ใบเสนอราคานี้ไม่มีดีลผูกอยู่');
  if (!inSalesDocScope(user, quote, 'edit')) return forbidden();

  // ข้อความเฉพาะกรณีที่ผู้ใช้เจอบ่อย — ที่เหลือให้ RPC เป็นผู้ตัดสิน (กันสองแหล่งความจริง)
  if (quote.approvalStatus === 'pending') return badRequest('ใบเสนอราคานี้ยื่นอนุมัติไปแล้ว');
  if (quote.approvalStatus === 'approved') return badRequest('ใบเสนอราคานี้อนุมัติแล้ว');
  if (quote.approvalStatus === 'not_required') {
    return badRequest('ใบเสนอราคาฉบับนี้ออกก่อนระบบอนุมัติ — ส่งลูกค้าได้เลยโดยไม่ต้องยื่น');
  }

  // ⚠️ ไม่มีด่าน "ผู้รับผิดชอบเอกสารต้องครบ" ที่นี่แล้ว (มติผู้ใช้ 2026-08-18):
  // ใบเสนอราคาเลิกมีบล็อกนั้นทั้งบล็อก เพราะทุกบทบาทมีคำตอบอยู่ที่อื่นแล้ว —
  // ผู้ดูแล = เจ้าของดีล · ผู้จัดทำ = คนที่กดยื่น (บรรทัดล่างนี้เอง) · ผู้ตรวจสอบอยู่ที่
  // ใบสั่งขาย · ผู้ประสานงานไม่เคยขึ้นเอกสาร ⇒ ไม่เหลืออะไรให้บังคับ
  // (ดู lib/sales/quotationMetadata.js)

  /* ด่านเลขแพ็คของ "ยื่นอนุมัติ" (มติเจ้าของ 08/10 ข้อ 3 · งวด PR-3): บรรทัดหมวด 02-001 ที่ยังไม่มีเลขแพ็ค (ร่างเก่า · ร่างที่เพิ่งออก Rev.
     · ร่างที่เซิร์ฟเวอร์สร้างบรรทัดให้ · แท็บเบราว์เซอร์รุ่นเก่าที่ไม่มีช่องกรอก) ยื่นไม่ได้ — ก่อนลงนาม ก่อนเขียนอะไรทั้งสิ้น
     ตัดสินจาก **บรรทัดที่เก็บไว้** (รหัส FG ที่ตรึงบนบรรทัดตอนบันทึก) ไม่อ่านทะเบียนสินค้า · เลขรายการ = ลำดับที่หน้าใบเรียง
     ข้อความบอกปุ่มที่ต้องกด ("แก้ไขข้อมูล") — เซิร์ฟเวอร์ไม่เติมเลขให้ */
  const packIssues = linePackIssues(quote.lines, { numbering: 'stored' });
  if (packIssues.length) return badRequest(linePackGateMessage(packIssues, 'submit'));

  let result;
  try {
    result = await submitQuotationWithSignatureEvidence(supabase, {
      documentId: id,
      evidenceId: genId('DSE'),
      expectedUpdatedAt: quote.updatedAt,
      documentFingerprint: quotationApprovalFingerprint(quote, quote.lines),
      user,
    });
  } catch (submitError) {
    return signatureEvidenceErrorResponse(submitError, { action: 'submit' });
  }
  const data = result.document;

  // เหตุการณ์ลงเธรดของใบ — ไม่เช็ค error โดยเจตนา: เขียนเธรดพลาดต้องไม่ทำให้
  // action ที่ DB บันทึกสำเร็จแล้วตอบ 500 (กติกาเดียวกับ askActionUpdate)
  await appendDocumentEvent(supabase, {
    docType: 'quotation', doc: quote, action: 'submit', user,
  });

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: id,
    before: quote,
    after: data,
    summary: `ยื่นอนุมัติใบเสนอราคา ${quote.quoteNumber} (ลงนามผู้เสนอราคา) (${dealAuditLabel(approvalDeal)})`,
    request: req,
  });
  // แจ้งผู้อนุมัติ: ใบรอเจ้าของดีลเซ็น — เดิมเงียบทั้งขั้นตอน (ผู้อนุมัติต้องเปิดหน้าเจอเอง)
  // ต่างจาก SO ที่แจ้ง space approvals ตั้งแต่ตอนยื่น. ระบุชื่อเจ้าของดีลไว้ในการ์ดเพราะ
  // ผู้อนุมัติของ QT คือ "เจ้าของดีลรายนั้น" ไม่ใช่หัวหน้าคนเดียวทั้ง space
  return ok(data);
});
