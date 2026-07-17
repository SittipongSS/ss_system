import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canApproveQuotation, canViewSalesPlanning, dealAuditLabel } from '@/lib/salesPlanning';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/quotations/[id]/approval — อนุมัติใบเสนอราคา (มติ 2026-07-18).
// การเซ็นรับรองโดย "เจ้าของดีล" (ผู้อนุมัติบน FM-SA-01). เดิม route นี้เป็น stub ตอบ
// "ไม่ต้องขออนุมัติ" — เปลี่ยนเป็น action จริง: pending → approved + snapshot fingerprint
// ของเนื้อหา ณ เวลาอนุมัติ (แก้เนื้อหาภายหลัง = fingerprint ไม่ตรง → ต้องอนุมัติใหม่).
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const reqBody = await req.json().catch(() => ({}));

  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*), deal:sales_deals(id, title, code, ownerId, ownerName, team, stage, customerName)')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (!quote.deal) return badRequest('ใบเสนอราคานี้ไม่มีดีลผูกอยู่');

  // ผู้อนุมัติ = เจ้าของดีล (ownerId) หรือ superuser เท่านั้น — ผู้สร้างที่ไม่ใช่เจ้าของ
  // (เช่น AC/AE ทีมเดียวกัน) อนุมัติไม่ได้; เจ้าของสร้างเอง = เซ็นเองได้.
  if (!canApproveQuotation(user, quote.deal)) {
    return forbidden('อนุมัติใบเสนอราคาได้เฉพาะ AE เจ้าของดีล (หรือผู้ดูแลระบบ)');
  }

  if (quote.deal.stage === 'lost') return badRequest('ดีลนี้ Lost แล้ว — อนุมัติใบเสนอราคาไม่ได้');
  if (!['draft', 'sent', 'rejected'].includes(quote.status)) {
    return badRequest(`ใบสถานะ "${quote.status}" อนุมัติไม่ได้`);
  }
  if (quote.approvalStatus === 'approved') return badRequest('ใบเสนอราคานี้อนุมัติแล้ว');
  if (quote.approvalStatus !== 'pending') {
    return badRequest('ใบเสนอราคานี้ไม่อยู่ในสถานะรออนุมัติ');
  }
  if (!(quote.lines?.length > 0)) return badRequest('ต้องมีอย่างน้อย 1 รายการก่อนอนุมัติ');
  if (!(Number(quote.totalAmount) > 0)) return badRequest('ยอดใบเสนอราคาต้องมากกว่า 0 ก่อนอนุมัติ');

  const now = new Date().toISOString();
  const patch = {
    approvalStatus: 'approved',
    approvalFingerprint: quotationApprovalFingerprint(quote, quote.lines),
    approvedAt: now,
    approvedBy: user.id || null,
    approvedByName: user.name || null,
    approvalNotes: String(reqBody?.note || '').trim() || null,
    updatedAt: now,
  };
  // optimistic guard — กันอนุมัติทับหลังมีคนแก้เนื้อหา (สถานะเปลี่ยนจาก pending) พร้อมกัน
  const { data, error: updErr } = await supabase
    .from('quotations').update(patch).eq('id', id).eq('approvalStatus', 'pending').select('*').maybeSingle();
  if (updErr) return fail(updErr.message, 500);
  if (!data) return badRequest('สถานะใบเปลี่ยนแล้ว (อาจถูกแก้เนื้อหา) — โหลดใหม่แล้วอนุมัติอีกครั้ง');

  await recordAudit({
    user, action: 'update', entityType: 'quotation', entityId: id, before: quote, after: data,
    summary: `อนุมัติใบเสนอราคา ${quote.quoteNumber} (${dealAuditLabel(quote.deal)})`,
    request: req,
  });
  return ok(data);
});
