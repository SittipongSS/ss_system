import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { isSalesOrderReviewer, isValidCancelReasonCode, cancelReasonLabel, isValidReversalTarget } from '@/lib/sales/salesOrderWorkflow';
import { salesOrderApprovalFingerprint } from '@/lib/sales/salesOrderApprovalFingerprint';
import {
  adminOverrideReasonError,
  isSalesOrderSelfApproval,
  normalizeAdminOverrideReason,
} from '@/lib/sales/salesOrderApprovalOverride';
import {
  approveSalesOrderWithSignatureEvidence,
  signatureEvidenceErrorResponse,
} from '@/lib/admin/signatureEvidence';
import { sendChat, chatCard } from '@/lib/chat';
import { fmtMoney } from '@/lib/format';

const soAmount = (o) => `${fmtMoney(o?.actualAmount)} บาท`;

export const dynamic = 'force-dynamic';

async function loadOrder(supabase, id) {
  const { data: order, error } = await supabase
    .from('sales_orders')
    .select('*, lines:sales_order_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const [{ data: deal }, { data: quotation }, { data: project }] = await Promise.all([
    supabase.from('sales_deals').select('id, title, stage, dealType, team, ownerId, ownerName, customerName, projectId').eq('id', order.dealId).maybeSingle(),
    supabase.from('quotations').select('id, quoteNumber, status, wonDocType, wonDocDate, wonAttachments, billingAddress, shippingAddress, branchCode, contactName, contactPhone, paymentPlan, paymentTerms').eq('id', order.quotationId).maybeSingle(),
    order.projectId
      ? supabase.from('projects').select('id, code, name').eq('id', order.projectId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { ...order, deal: deal || null, quotation: quotation || null, project: project || null };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  let order;
  try { order = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลด Sale Order ไม่สำเร็จ: ${error.message}`, 500); }
  if (!order) return notFound('ไม่พบ Sale Order');
  if (!order.deal || !inSalesViewScope(user, order.deal)) return forbidden();
  // meId ให้หน้าเว็บซ่อนปุ่มอนุมัติของ SO ที่ตัวเองสร้าง/ยื่น (แบ่งแยกหน้าที่)
  return ok({ ...order, meId: user.id || null });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  let before;
  try { before = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลด Sale Order ไม่สำเร็จ: ${error.message}`, 500); }
  if (!before) return notFound('ไม่พบ Sale Order');
  if (!before.deal || !inSalesEditScope(user, before.deal)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const reviewer = isSalesOrderReviewer(user.role);

  if (action === 'save') {
    if (!['draft', 'rejected'].includes(before.status)) return badRequest('แก้ไขได้เฉพาะ SO ร่างหรือรายการที่ถูกตีกลับ');
    const orderDate = String(body.orderDate || '').trim();
    const paymentDueDate = String(body.paymentDueDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) return badRequest('วันที่ SO ไม่ถูกต้อง');
    if (paymentDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDueDate)) return badRequest('วันที่กำหนดชำระไม่ถูกต้อง');
    const patch = {
      orderDate,
      paymentDueDate: paymentDueDate || null,
      notes: String(body.notes || '').trim() || null,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(`บันทึก Sale Order ไม่สำเร็จ: ${error.message}`, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `edit ${before.orderNumber}`, request: req });
    return ok(data);
  }

  if (action === 'submit') {
    if (!['draft', 'rejected'].includes(before.status)) return badRequest('SO ใบนี้ยื่นอนุมัติไม่ได้');
    if (!before.orderDate || !(Number(before.actualAmount) > 0) || !(before.lines?.length > 0)) {
      return badRequest('ข้อมูล SO ไม่ครบ: ต้องมีวันที่ ยอดก่อน VAT และรายการสินค้า');
    }
    if (!before.quotation || before.quotation.status !== 'accepted' || !before.deal || !before.projectId || !before.customerName) {
      return badRequest('เอกสารอ้างอิงไม่ครบ: ต้องมี QT Won, ดีล, โครงการ และลูกค้า');
    }
    const now = new Date().toISOString();
    const patch = { status: 'pending_approval', submittedAt: now, submittedBy: user.id || null, submittedByName: user.name || null, rejectedAt: null, rejectedBy: null, rejectedByName: null, rejectionReason: null, updatedAt: now };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `submit ${before.orderNumber} for approval`, request: req });
    // แจ้ง space ผู้อนุมัติ: มี SO รออนุมัติ (จุด clear ยอด Actual — เดิมเงียบ)
    sendChat('approvals', chatCard({
      title: 'Sale Order รออนุมัติ',
      subtitle: before.deal?.title || before.orderNumber,
      rows: [
        { label: 'เลขที่ SO', value: before.orderNumber },
        { label: 'ยอด (ก่อน VAT)', value: soAmount(before) },
        { label: 'ลูกค้า', value: before.customerName || '' },
        { label: 'ผู้ยื่น', value: user.name || '' },
      ],
      linkPath: `/sa/sales-orders/${id}`,
      linkLabel: 'ตรวจ/อนุมัติ',
    }));
    return ok(data);
  }

  if (action === 'approve') {
    if (!reviewer) return forbidden('เฉพาะ AE Supervisor ที่อนุมัติ Sale Order ได้');
    if (before.status !== 'pending_approval') return badRequest('SO ใบนี้ไม่ได้รออนุมัติ');
    // แบ่งแยกหน้าที่ยังคงเป็นค่าเริ่มต้น; Admin ใช้ break-glass ได้เมื่อยังไม่มี
    // ผู้ตรวจสอบคนที่สอง โดยต้องระบุเหตุผลซึ่งถูกเก็บกับหลักฐานแบบ immutable.
    const selfApproval = isSalesOrderSelfApproval(before, user.id);
    let overrideReason = null;
    if (selfApproval) {
      if (user.role !== 'admin') {
        return forbidden('อนุมัติ SO ที่ตัวเองสร้างหรือยื่นไม่ได้ — ต้องให้ผู้ตรวจสอบคนอื่นอนุมัติ');
      }
      const reasonError = adminOverrideReasonError(body.overrideReason);
      if (reasonError) return badRequest(reasonError);
      overrideReason = normalizeAdminOverrideReason(body.overrideReason);
    }
    let result;
    try {
      result = await approveSalesOrderWithSignatureEvidence(supabase, {
        documentId: id,
        evidenceId: genId('DSE'),
        expectedUpdatedAt: before.updatedAt,
        documentFingerprint: salesOrderApprovalFingerprint(before, before.lines),
        note: String(body.note || '').trim() || null,
        overrideReason,
        user,
      });
    } catch (approvalError) {
      return signatureEvidenceErrorResponse(approvalError);
    }
    const data = result.document;
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order',
      entityId: id,
      before,
      after: data,
      summary: selfApproval
        ? `admin override approve ${before.orderNumber}: ${overrideReason}`
        : `approve ${before.orderNumber}`,
      request: req,
    });
    // แจ้งทีมขาย: SO อนุมัติแล้ว → ยอด Actual เข้าระบบ
    sendChat('sales', chatCard({
      title: '✅ Sale Order อนุมัติแล้ว',
      subtitle: before.deal?.title || before.orderNumber,
      rows: [
        { label: 'เลขที่ SO', value: before.orderNumber },
        { label: 'ยอด Actual (ก่อน VAT)', value: soAmount(before) },
        { label: 'ผู้อนุมัติ', value: user.name || '' },
        { label: 'ผู้ยื่น', value: before.submittedByName || '' },
        ...(selfApproval ? [{ label: 'รูปแบบ', value: 'Admin Override' }] : []),
      ],
      linkPath: `/sa/sales-orders/${id}`,
      linkLabel: 'เปิด Sale Order',
    }));
    return ok(data);
  }

  if (action === 'reject') {
    if (!reviewer) return forbidden('เฉพาะ AE Supervisor ที่ตีกลับ Sale Order ได้');
    if (before.status !== 'pending_approval') return badRequest('SO ใบนี้ไม่ได้รออนุมัติ');
    const reason = String(body.reason || '').trim();
    if (!reason) return badRequest('กรุณาระบุเหตุผลที่ตีกลับ');
    const now = new Date().toISOString();
    const patch = { status: 'rejected', rejectedAt: now, rejectedBy: user.id || null, rejectedByName: user.name || null, rejectionReason: reason, updatedAt: now };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `reject ${before.orderNumber}: ${reason}`, request: req });
    // แจ้งทีมขาย: SO ถูกตีกลับ ให้ผู้ยื่นแก้แล้วยื่นใหม่
    sendChat('sales', chatCard({
      title: '↩️ Sale Order ถูกตีกลับ',
      subtitle: before.deal?.title || before.orderNumber,
      rows: [
        { label: 'เลขที่ SO', value: before.orderNumber },
        { label: 'เหตุผล', value: reason },
        { label: 'ผู้ตีกลับ', value: user.name || '' },
        { label: 'ผู้ยื่น', value: before.submittedByName || '' },
      ],
      linkPath: `/sa/sales-orders/${id}`,
      linkLabel: 'แก้ไข Sale Order',
    }));
    return ok(data);
  }

  if (action === 'cancel') {
    // เหตุผลยกเลิกแบบมีโครงสร้าง (มติ 2026-07-18): เลือกรหัสจากตัวเลือกมาตรฐาน +
    // หมายเหตุอิสระ (บังคับหมายเหตุเมื่อเลือก "อื่น ๆ"). เก็บทั้ง code + note.
    const reasonCode = String(body.reasonCode || '').trim();
    const note = String(body.reason || body.note || '').trim();
    if (!isValidCancelReasonCode(reasonCode)) return badRequest('กรุณาเลือกเหตุผลที่ยกเลิก Sale Order');
    if (reasonCode === 'other' && !note) return badRequest('เลือก "อื่น ๆ" ต้องระบุหมายเหตุ');
    if (before.status === 'cancelled') return badRequest('Sale Order นี้ถูกยกเลิกแล้ว');
    if (before.status === 'pending_approval' && !reviewer) return forbidden('รายการที่รออนุมัติต้องให้ AE Supervisor ดำเนินการ');
    // ยกเลิก SO ที่อนุมัติแล้ว = ถอนยอด Actual ที่ผ่านการอนุมัติ → ต้องเป็นผู้ตรวจสอบ
    // เท่านั้น (มติผู้ใช้ 2026-07-16): สมมาตรกับตอนอนุมัติ ไม่ให้ AE ถอนฝ่ายเดียว
    if (before.status === 'approved' && !reviewer) return forbidden('ยกเลิก SO ที่อนุมัติแล้วต้องให้ AE Supervisor ดำเนินการ (ถอนยอด Actual)');

    // ย้อน Won พร้อมยกเลิก SO (มติ 2026-07-18): เมื่อลูกค้าหลุด (เหตุฝั่งลูกค้า) ให้ถอย
    // ดีลออกจาก Won ด้วย — atomic ผ่าน RPC (ยกเลิก SO + ใบเสนอราคา accept → cancelled +
    // ถอยดีล). ทำได้เฉพาะ SO ที่อนุมัติแล้ว (ตัวที่นับ Actual + ดีล Won).
    const reverseTo = String(body.reverseTo || '').trim();
    if (reverseTo) {
      if (!isValidReversalTarget(reverseTo)) return badRequest('ปลายทางการย้อน Won ไม่ถูกต้อง');
      if (before.status !== 'approved') return badRequest('ย้อน Won ได้เฉพาะ SO ที่อนุมัติแล้ว');
      if (reverseTo === 'lost' && !String(body.lostReason || '').trim()) {
        return badRequest('เลือกปลายทาง "Lost" ต้องระบุเหตุผล');
      }
      const { data: result, error: revErr } = await supabase.rpc('cancel_sales_order_with_reversal_atomic', {
        p_order_id: id,
        p_reason_code: reasonCode,
        p_reason_note: note || null,
        p_actor_id: user.id || null,
        p_actor_name: user.name || null,
        p_reverse_to: reverseTo,
        p_lost_reason: String(body.lostReason || '').trim() || null,
        p_history_id: genId('DSH'),
        p_forecast_id: genId('DFC'),
      });
      if (revErr) {
        const clientErr = /reversal_|sales_order_not_|deal_not_/.test(revErr.message || '');
        return fail(revErr.message, clientErr ? 400 : 500);
      }
      const revReason = cancelReasonLabel(reasonCode) + (note ? ` — ${note}` : '');
      const targetLabel = reverseTo === 'lost' ? 'Lost' : 'เปิดใหม่';
      await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: result?.order, summary: `cancel + reverse Won ${before.orderNumber}: ${revReason} → ดีล ${targetLabel}`, request: req });
      if (before.dealId) {
        await recordAudit({ user, action: 'update', entityType: 'sales_deal', entityId: before.dealId, after: result?.deal, summary: `ย้อน Won (${targetLabel}) จากยกเลิก SO ${before.orderNumber}: ${revReason}`, request: req });
      }
      // แจ้งทีมขาย: ดีลถูกถอนจาก Won (จุดสำคัญ — ยอด Actual ถูกนำออก)
      sendChat('sales', chatCard({
        title: '↩️ ย้อน Won (ถอนยอดขาย)',
        subtitle: before.deal?.title || before.orderNumber,
        rows: [
          { label: 'SO', value: before.orderNumber },
          { label: 'เหตุผล', value: revReason },
          { label: 'ดีลไปสถานะ', value: targetLabel },
          { label: 'โดย', value: user.name || '' },
        ],
        linkPath: before.dealId ? `/sa/deals/${before.dealId}` : `/sa/sales-orders/${id}`,
        linkLabel: 'เปิดดีล',
      }));
      return ok(result?.order || {});
    }

    const patch = {
      status: 'cancelled', cancelledAt: new Date().toISOString(),
      cancelledBy: user.name || user.id || null,
      cancelReasonCode: reasonCode, cancelReason: note || null,
      updatedAt: new Date().toISOString(),
    };
    // optimistic guard .eq('status', before.status) — เหมือน save/submit/approve/reject
    // กัน TOCTOU: คนอื่น submit (draft→pending) พร้อมกัน ต้องไม่ยกเลิกทับสถานะที่เปลี่ยนไป
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    const summaryReason = cancelReasonLabel(reasonCode) + (note ? ` — ${note}` : '');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `cancel ${before.orderNumber}: ${summaryReason}`, request: req });
    return ok(data);
  }

  if (action === 'restore') {
    if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่คืนสถานะ Sale Order ได้');
    if (before.status !== 'cancelled') return badRequest('Sale Order นี้ไม่ได้อยู่ในสถานะยกเลิก');
    // คืนเป็น draft สะอาด: ล้างทั้งฟิลด์ยกเลิก/อนุมัติ และ submitted*/rejected* ที่ค้าง
    // (เดิมเหลือ rejectionReason → หน้ารายละเอียดโชว์ป้าย "ตีกลับ" บน draft ใหม่)
    const patch = {
      status: 'draft',
      cancelledAt: null, cancelledBy: null, cancelReason: null, cancelReasonCode: null,
      approvedAt: null, approvedBy: null, approvedByName: null, approvalNote: null,
      submittedAt: null, submittedBy: null, submittedByName: null,
      rejectedAt: null, rejectedBy: null, rejectedByName: null, rejectionReason: null,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `restore ${before.orderNumber}`, request: req });
    return ok(data);
  }

  return badRequest('คำสั่งไม่ถูกต้อง');
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่ลบ Sale Order ได้');
  const { id } = await ctx.params;
  let before;
  try { before = await loadOrder(supabase, id); }
  catch (error) { return fail(`โหลด Sale Order ไม่สำเร็จ: ${error.message}`, 500); }
  if (!before) return notFound('ไม่พบ Sale Order');
  const { error } = await supabase.from('sales_orders').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'sales_order', entityId: id, before, after: null, summary: `delete ${before.orderNumber}`, request: req });
  return ok({ deleted: true });
});
