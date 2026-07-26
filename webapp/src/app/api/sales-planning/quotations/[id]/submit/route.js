import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, inSalesEditScope, dealAuditLabel } from '@/lib/salesPlanning';
import { sendChat, chatCard } from '@/lib/chat';
import { fmtMoney } from '@/lib/format';
import { quotationWonAmount } from '@/lib/sales/quotationWonAmount';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
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
  if (!quote.deal) return badRequest('ใบเสนอราคานี้ไม่มีดีลผูกอยู่');
  if (!inSalesEditScope(user, quote.deal)) return forbidden();

  // ข้อความเฉพาะกรณีที่ผู้ใช้เจอบ่อย — ที่เหลือให้ RPC เป็นผู้ตัดสิน (กันสองแหล่งความจริง)
  if (quote.approvalStatus === 'pending') return badRequest('ใบเสนอราคานี้ยื่นอนุมัติไปแล้ว');
  if (quote.approvalStatus === 'approved') return badRequest('ใบเสนอราคานี้อนุมัติแล้ว');
  if (quote.approvalStatus === 'not_required') {
    return badRequest('ใบเสนอราคาฉบับนี้ออกก่อนระบบอนุมัติ — ส่งลูกค้าได้เลยโดยไม่ต้องยื่น');
  }

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

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: id,
    before: quote,
    after: data,
    summary: `ยื่นอนุมัติใบเสนอราคา ${quote.quoteNumber} (ลงนามผู้เสนอราคา) (${dealAuditLabel(quote.deal)})`,
    request: req,
  });
  // แจ้งผู้อนุมัติ: ใบรอเจ้าของดีลเซ็น — เดิมเงียบทั้งขั้นตอน (ผู้อนุมัติต้องเปิดหน้าเจอเอง)
  // ต่างจาก SO ที่แจ้ง space approvals ตั้งแต่ตอนยื่น. ระบุชื่อเจ้าของดีลไว้ในการ์ดเพราะ
  // ผู้อนุมัติของ QT คือ "เจ้าของดีลรายนั้น" ไม่ใช่หัวหน้าคนเดียวทั้ง space
  sendChat('approvals', chatCard({
    title: '📝 ใบเสนอราคารออนุมัติ',
    subtitle: quote.deal.title || quote.quoteNumber,
    rows: [
      { label: 'เลขที่ใบเสนอราคา', value: quote.quoteNumber },
      { label: 'ยอด (ก่อน VAT)', value: `${fmtMoney(quotationWonAmount(quote))} บาท` },
      { label: 'ลูกค้า', value: quote.customerName || quote.deal.customerName || '' },
      { label: 'ผู้อนุมัติ (เจ้าของดีล)', value: quote.deal.ownerName || '' },
      { label: 'ผู้ยื่น', value: user.name || '' },
    ],
    linkPath: `/sa/quotations/${id}`,
    linkLabel: 'ตรวจ/อนุมัติ',
  }));
  return ok(data);
});
