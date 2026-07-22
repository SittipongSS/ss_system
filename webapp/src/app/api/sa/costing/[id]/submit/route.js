// ส่งใบขอราคาเดินหน้า — ฝ่ายขายเป็นคนกด (costing:edit, proxy กันชั้นแรกแล้ว)
//   stage 'pricing' → ส่งขอราคา RD/PC (ออกเลขที่เอกสารครั้งแรกที่นี่)
//   stage 'exec'    → ส่งผู้บริหารอนุมัติราคาผลิต
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditCostingRequest, generateCostingDocNo, submitForPricingError, submitToExecError } from '@/lib/costing';
import { findCostingRequest } from '@/lib/costingAdmin';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canEditCostingRequest(user, before)) {
    return Response.json({ error: 'ไม่มีสิทธิ์ส่งใบนี้' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const stage = body.stage === 'exec' ? 'exec' : 'pricing';
  const nowIso = new Date().toISOString();

  if (stage === 'pricing') {
    const blocked = submitForPricingError(before);
    if (blocked) return Response.json({ error: blocked }, { status: 409 });

    // เลขที่เอกสารออก "ครั้งแรกที่ส่งออกจากมือฝ่ายขาย" — ร่างที่ถูกทิ้งจะได้ไม่กิน
    // เลขจนเลขขาดช่วง. ออกครั้งเดียวตลอดอายุใบ (guard 0141 ห้ามเปลี่ยนทีหลัง)
    const docNo = before.docNo || await generateCostingDocNo(supabase);

    const { error } = await supabase.from('costing_requests').update({
      docNo, status: 'pricing', submittedAt: before.submittedAt || nowIso, updatedAt: nowIso,
    }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const after = await findCostingRequest(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
      summary: `ส่งขอราคาต้นทุน ${docNo} ให้ RD/PC`, request,
    });

    // แจ้งเฉพาะฝ่ายที่มีบรรทัดต้องตอบจริง — ไม่รบกวนฝ่ายที่ไม่เกี่ยวกับใบนี้
    const components = (after.items || []).flatMap((i) => i.components || []);
    const countFor = (dept) => components.filter((c) => c.sourceDept === dept && c.priceStatus === 'pending').length;
    for (const [dept, space] of [['RD', 'rd'], ['PC', 'pc']]) {
      const pending = countFor(dept);
      if (!pending) continue;
      sendChat(space, chatCard({
        title: `ขอราคาต้นทุน ${docNo}`,
        subtitle: after.customerName || '',
        rows: [
          { label: 'สินค้า', value: (after.items || []).map((i) => i.productLabel).join(', ') },
          { label: 'รายการที่รอราคา', value: `${pending} บรรทัด` },
          { label: 'ผู้ขอ', value: after.requestedByName || '' },
        ],
        linkPath: `/sa/costing/${id}`,
        linkLabel: 'เปิดใบขอราคา',
      }));
    }
    return Response.json(after);
  }

  const blocked = submitToExecError(before);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  // ตีกลับแล้วส่งใหม่: รายการที่เคยถูกตีกลับกลับไปรออนุมัติอีกครั้ง
  // (รายการที่อนุมัติผ่านแล้วไม่ถูกแตะ — ไม่ต้องอนุมัติซ้ำ)
  const { error: resetError } = await supabase.from('costing_request_items')
    .update({ approvalStatus: 'pending', returnReason: null, updatedAt: nowIso })
    .eq('requestId', id).eq('approvalStatus', 'returned');
  if (resetError) return Response.json({ error: resetError.message }, { status: 500 });

  const { error } = await supabase.from('costing_requests')
    .update({ status: 'pending_exec', updatedAt: nowIso }).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ส่งใบขอราคา ${after.docNo || id} ให้ผู้บริหารอนุมัติ`, request,
  });

  sendChat('executive', chatCard({
    title: `รออนุมัติราคาผลิต ${after.docNo || ''}`,
    subtitle: after.customerName || '',
    rows: [
      { label: 'สินค้า', value: `${(after.items || []).length} รายการ` },
      { label: 'MOQ', value: `${Number(after.moq).toLocaleString('th-TH')} ชิ้น` },
      { label: 'ผู้ขอ', value: after.requestedByName || '' },
    ],
    linkPath: `/sa/costing/${id}`,
    linkLabel: 'เปิดใบขอราคา',
  }));

  return Response.json(after);
}
