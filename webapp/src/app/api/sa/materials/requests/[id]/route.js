// ใบขอราคาวัสดุรายใบ — อ่าน + ส่งขอราคา/ยกเลิก (mig 0143)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewCosting, isSuperuser } from '@/lib/permissions';
import { inSalesEditScope } from '@/lib/salesPlanning';
import { generateMaterialRequestDocNo } from '@/lib/materialPrices';
import { findMaterialRequest } from '@/lib/materialPricesAdmin';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function canEditRequest(user, req) {
  if (!user || !req) return false;
  if (['answered', 'cancelled'].includes(req.status)) return false;
  if (isSuperuser(user.role)) return true;
  return inSalesEditScope(user, { team: req.team, ownerId: req.requestedById });
}

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const found = await findMaterialRequest(getSupabaseAdmin(), id);
    if (!found) return Response.json({ error: 'ไม่พบใบขอราคาวัสดุ' }, { status: 404 });
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    return Response.json(found, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — action 'submit' (ส่งขอราคา ออกเลขที่) | 'cancel'
export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;
  if (!can(user?.role, 'costing:edit')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findMaterialRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคาวัสดุ' }, { status: 404 });
  if (!canEditRequest(user, before)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้ใบนี้ หรือใบจบแล้ว' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const nowIso = new Date().toISOString();

  if (body.action === 'cancel') {
    const reason = String(body.cancelReason || '').trim();
    if (!reason) return Response.json({ error: 'ต้องระบุเหตุผลที่ยกเลิก' }, { status: 400 });
    const { error } = await supabase.from('material_price_requests').update({
      status: 'cancelled', cancelReason: reason.slice(0, 500), cancelledAt: nowIso, updatedAt: nowIso,
    }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const after = await findMaterialRequest(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'material_price_request', entityId: id, before, after,
      summary: `ยกเลิกใบขอราคาวัสดุ ${before.docNo || id}: ${reason}`, request,
    });
    return Response.json(after);
  }

  // submit
  if (before.status !== 'draft') {
    return Response.json({ error: 'ส่งได้เฉพาะใบที่ยังเป็นร่าง' }, { status: 409 });
  }
  if (!(before.items || []).length) {
    return Response.json({ error: 'ใบนี้ยังไม่มีรายการวัสดุ' }, { status: 409 });
  }
  const docNo = before.docNo || await generateMaterialRequestDocNo(supabase);
  const { error } = await supabase.from('material_price_requests').update({
    docNo, status: 'pending', submittedAt: before.submittedAt || nowIso, updatedAt: nowIso,
  }).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const after = await findMaterialRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'material_price_request', entityId: id, before, after,
    summary: `ส่งใบขอราคาวัสดุ ${docNo} ให้ RD/PC`, request,
  });

  // แจ้งเฉพาะฝ่ายที่มีบรรทัดต้องตอบ
  for (const [dept, space] of [['RD', 'rd'], ['PC', 'pc']]) {
    const pending = (after.items || []).filter((i) => i.sourceDept === dept && i.priceStatus === 'pending');
    if (!pending.length) continue;
    sendChat(space, chatCard({
      title: `ขอราคาวัสดุ ${docNo}`,
      subtitle: after.customerName || 'ราคากลาง',
      rows: [
        { label: 'รายการที่รอราคา', value: `${pending.length} รายการ` },
        { label: 'ผู้ขอ', value: after.requestedByName || '' },
      ],
      linkPath: `/sa/materials/requests/${id}`,
      linkLabel: 'เปิดใบขอราคาวัสดุ',
    }));
  }
  return Response.json(after);
}
