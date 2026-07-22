// ผู้บริหารอนุมัติ/ตีกลับราคาผลิต — รายสินค้า (costing:approve, proxy กันชั้นแรกแล้ว)
//
// อนุมัติคนเดียวจบ ไม่มีอนุมัติซ้อน (มติ 2026-07-22) และสถานะใบคำนวณจากลูกทุกครั้ง
// ในคำขอเดียวกับ action — ไม่มีปุ่ม "ปิดใบ" แยกให้ใครลืมกด
//
// ลายเซ็น: อ้างเวอร์ชันลายเซ็นที่ใช้งานอยู่ของผู้อนุมัติ (mig 0122) ตามที่ 0141
// ออกแบบไว้ (approvalSignatureId) — ไม่มีลายเซ็น = อนุมัติไม่ได้ แนวเดียวกับ
// ด่านอนุมัติใบเสนอราคา/SO (Phase 5B)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  approvalProgress, canDecideItem, canViewCostingRequest, deriveRequestStatusAfterApproval,
} from '@/lib/costing';
import { findCostingRequest } from '@/lib/costingAdmin';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function activeSignatureId(supabase, userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('user_signatures').select('activeVersionId').eq('id', userId).maybeSingle();
  return data?.activeVersionId || null;
}

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canViewCostingRequest(user, before)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const decision = body.decision === 'return' ? 'return' : 'approve';
  const item = (before.items || []).find((i) => i.id === body.itemId);
  if (!item) return Response.json({ error: 'ไม่พบรายการสินค้าที่ระบุ' }, { status: 404 });
  if (!canDecideItem(user, before, item)) {
    return Response.json({
      error: 'อนุมัติรายการนี้ไม่ได้ — ต้องเป็นผู้บริหาร และรายการต้องยังรออนุมัติอยู่',
    }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  if (decision === 'return') {
    const reason = String(body.returnReason || '').trim();
    if (!reason) return Response.json({ error: 'ต้องระบุเหตุผลที่ตีกลับ' }, { status: 400 });
    const { error } = await supabase.from('costing_request_items').update({
      approvalStatus: 'returned', returnReason: reason.slice(0, 500), updatedAt: nowIso,
    }).eq('id', item.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    // ราคาต่อชั้นต้องครบทุกชั้นก่อนถือว่าอนุมัติรายการนี้ได้
    const prices = Array.isArray(body.tierPrices) ? body.tierPrices : [];
    const byTier = new Map(prices.map((p) => [p?.tierId, p?.price]));
    for (const tier of item.tiers || []) {
      const raw = byTier.has(tier.id) ? byTier.get(tier.id) : tier.approvedUnitPrice;
      const price = raw == null || raw === '' ? null : Number(raw);
      if (price == null || !Number.isFinite(price) || price < 0) {
        return Response.json({
          error: `ต้องระบุราคาผลิตของชั้น ${Number(tier.qty).toLocaleString('th-TH')} ชิ้น ให้ครบก่อนอนุมัติ`,
        }, { status: 400 });
      }
    }

    const signatureId = await activeSignatureId(supabase, user?.id);
    if (!signatureId) {
      return Response.json({
        error: 'กรุณาเพิ่มลายเซ็นอิเล็กทรอนิกส์ในบัญชีของฉันก่อนอนุมัติ',
        code: 'signature_required', accountUrl: '/account',
      }, { status: 409 });
    }

    for (const tier of item.tiers || []) {
      const raw = byTier.has(tier.id) ? byTier.get(tier.id) : tier.approvedUnitPrice;
      const { error } = await supabase.from('costing_item_tiers')
        .update({ approvedUnitPrice: Number(raw), updatedAt: nowIso }).eq('id', tier.id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    const { error } = await supabase.from('costing_request_items').update({
      approvalStatus: 'approved',
      returnReason: null,
      approvedById: user?.id ?? null,
      approvedByName: user?.name ?? null,
      approvedAt: nowIso,
      approvalSignatureId: signatureId,
      updatedAt: nowIso,
    }).eq('id', item.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // สถานะใบคำนวณใหม่จากลูกจริงหลังเขียนเสร็จ (ไม่เดาจาก payload)
  const afterWrite = await findCostingRequest(supabase, id);
  const nextStatus = deriveRequestStatusAfterApproval(afterWrite.items || [], afterWrite.status);
  if (nextStatus !== afterWrite.status) {
    const patch = { status: nextStatus, updatedAt: nowIso };
    if (nextStatus === 'approved') patch.approvedAt = nowIso;
    const { error } = await supabase.from('costing_requests').update(patch).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const after = await findCostingRequest(supabase, id);
  const progress = approvalProgress(after.items || []);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: decision === 'return'
      ? `ตีกลับ "${item.productLabel}" ในใบ ${after.docNo || id}`
      : `อนุมัติราคาผลิต "${item.productLabel}" ในใบ ${after.docNo || id} (${progress.approved}/${progress.total})`,
    request,
  });

  // แจ้งฝ่ายขายเมื่อ "จบรอบ" เท่านั้น — อนุมัติทีละรายการไม่ต้องเด้งทุกครั้ง
  if (nextStatus !== afterWrite.status && ['approved', 'returned'].includes(nextStatus)) {
    sendChat('sales', chatCard({
      title: nextStatus === 'approved'
        ? `อนุมัติราคาผลิตครบแล้ว ${after.docNo || ''}`
        : `ผู้บริหารตีกลับใบขอราคา ${after.docNo || ''}`,
      subtitle: after.customerName || '',
      rows: [
        { label: 'อนุมัติแล้ว', value: `${progress.approved}/${progress.total} รายการ` },
        { label: 'ตีกลับ', value: progress.returned ? `${progress.returned} รายการ` : '' },
        { label: 'ผู้ขอ', value: after.requestedByName || '' },
      ],
      linkPath: `/sa/costing/${id}`,
      linkLabel: 'เปิดใบขอราคา',
    }));
  }

  return Response.json(after);
}
