import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';

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
    supabase.from('quotations').select('id, quoteNumber, status, wonDocType, wonDocDate, wonAttachments').eq('id', order.quotationId).maybeSingle(),
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
  const order = await loadOrder(supabase, id).catch(() => null);
  if (!order) return notFound('ไม่พบ Sale Order');
  if (!order.deal || !inSalesViewScope(user, order.deal)) return forbidden();
  return ok(order);
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const before = await loadOrder(supabase, id).catch(() => null);
  if (!before) return notFound('ไม่พบ Sale Order');
  if (!before.deal || !inSalesEditScope(user, before.deal)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const reviewer = isSalesOrderReviewer(user.role);

  if (action === 'save') {
    if (!['draft', 'rejected'].includes(before.status)) return badRequest('แก้ไขได้เฉพาะ SO ร่างหรือรายการที่ถูกตีกลับ');
    const patch = {
      orderDate: body.orderDate || before.orderDate,
      paymentDueDate: body.paymentDueDate || null,
      notes: String(body.notes || '').trim() || null,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
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
    return ok(data);
  }

  if (action === 'approve') {
    if (!reviewer) return forbidden('เฉพาะ AE Supervisor ที่อนุมัติ Sale Order ได้');
    if (before.status !== 'pending_approval') return badRequest('SO ใบนี้ไม่ได้รออนุมัติ');
    const now = new Date().toISOString();
    const patch = { status: 'approved', approvedAt: now, approvedBy: user.id || null, approvedByName: user.name || null, approvalNote: String(body.note || '').trim() || null, updatedAt: now };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).eq('status', before.status).select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return badRequest('สถานะ SO เปลี่ยนแล้ว กรุณาโหลดใหม่');
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `approve ${before.orderNumber}`, request: req });
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
    return ok(data);
  }

  if (action === 'cancel') {
    const reason = String(body.reason || '').trim();
    if (!reason) return badRequest('กรุณาระบุเหตุผลที่ยกเลิก Sale Order');
    if (before.status === 'cancelled') return badRequest('Sale Order นี้ถูกยกเลิกแล้ว');
    if (before.status === 'pending_approval' && !reviewer) return forbidden('รายการที่รออนุมัติต้องให้ AE Supervisor ดำเนินการ');
    const patch = {
      status: 'cancelled', cancelledAt: new Date().toISOString(),
      cancelledBy: user.name || user.id || null, cancelReason: reason,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).select('*').single();
    if (error) return fail(error.message, 500);
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `cancel ${before.orderNumber}: ${reason}`, request: req });
    return ok(data);
  }

  if (action === 'restore') {
    if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่คืนสถานะ Sale Order ได้');
    if (before.status !== 'cancelled') return badRequest('Sale Order นี้ไม่ได้อยู่ในสถานะยกเลิก');
    const patch = { status: 'draft', cancelledAt: null, cancelledBy: null, cancelReason: null, approvedAt: null, approvedBy: null, approvedByName: null, approvalNote: null, updatedAt: new Date().toISOString() };
    const { data, error } = await supabase.from('sales_orders').update(patch).eq('id', id).select('*').single();
    if (error) return fail(error.message, 500);
    await recordAudit({ user, action: 'update', entityType: 'sales_order', entityId: id, before, after: data, summary: `restore ${before.orderNumber}`, request: req });
    return ok(data);
  }

  return badRequest('คำสั่งไม่ถูกต้อง');
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden('เฉพาะผู้ดูแลระบบที่ลบ Sale Order ได้');
  const { id } = await ctx.params;
  const before = await loadOrder(supabase, id).catch(() => null);
  if (!before) return notFound('ไม่พบ Sale Order');
  const { error } = await supabase.from('sales_orders').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await recordAudit({ user, action: 'delete', entityType: 'sales_order', entityId: id, before, after: null, summary: `delete ${before.orderNumber}`, request: req });
  return ok({ deleted: true });
});
