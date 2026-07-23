// ส่งใบขอราคาผลิตให้ผู้บริหาร (costing:edit, proxy กันชั้นแรกแล้ว)
// PR-B: ราคาวัสดุมาจากคลัง (เซลดึงเอง) — ไม่มีขั้น "ส่งขอราคา RD/PC" ในใบผลิตแล้ว
// เลขที่เอกสารออกครั้งแรกที่นี่ (ส่งออกจากมือฝ่ายขาย = ร่างที่ทิ้งไม่กินเลข)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditCostingRequest, generateCostingDocNo, submitToExecError } from '@/lib/costing';
import { libraryPricingBlocker } from '@/lib/costingLibrary';
import { findCostingRequest } from '@/lib/costingAdmin';
import { loadMaterials } from '@/lib/materialPricesAdmin';
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

  const nowIso = new Date().toISOString();

  // เช็คด่านส่งผู้บริหาร + บรรทัดคลังที่เกินอายุยังไม่ยืนยัน
  const materials = await loadMaterials(supabase);
  const libBlocker = libraryPricingBlocker(before.items || [], materials, {
    customerId: before.customerId || null, todayIso: nowIso.slice(0, 10),
  });
  const blocked = submitToExecError(before, libBlocker);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  // ออกเลขที่เอกสารครั้งแรกที่ส่งผู้บริหาร (guard 0141 ห้ามเปลี่ยนทีหลัง)
  const docNo = before.docNo || await generateCostingDocNo(supabase);

  // ตีกลับแล้วส่งใหม่: รายการที่เคยถูกตีกลับกลับไปรออนุมัติอีกครั้ง
  // (รายการที่อนุมัติผ่านแล้วไม่ถูกแตะ — ไม่ต้องอนุมัติซ้ำ)
  const { error: resetError } = await supabase.from('costing_request_items')
    .update({ approvalStatus: 'pending', returnReason: null, updatedAt: nowIso })
    .eq('requestId', id).eq('approvalStatus', 'returned');
  if (resetError) return Response.json({ error: resetError.message }, { status: 500 });

  const { error } = await supabase.from('costing_requests')
    .update({ docNo, status: 'pending_exec', submittedAt: before.submittedAt || nowIso, updatedAt: nowIso })
    .eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ส่งใบขอราคาผลิต ${after.docNo || id} ให้ผู้บริหารอนุมัติ`, request,
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
