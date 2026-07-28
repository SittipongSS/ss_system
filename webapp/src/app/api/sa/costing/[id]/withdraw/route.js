// ดึงกลับใบขอราคาผลิตที่ยื่นไปแล้ว (มติผู้ใช้ B5 2026-07-28)
// pending_exec → assembling · ของ **ผู้ยื่น** เท่านั้น ผู้บริหารต้องใช้ "ตีกลับให้แก้ไข"
// ที่เก็บเหตุผลลงคอลัมน์จริงและโชว์บนใบ (ดูคำศัพท์ในหัว lib/sales/quotationWorkflow.js)
//
// ไม่แตะ docNo (guard 0141 ห้ามเปลี่ยน/ถอน) และไม่แตะ submittedAt — ทั้งคู่คือหลักฐานว่า
// ใบนี้เคยออกจากมือฝ่ายขายไปแล้ว. รายการที่ผู้บริหารอนุมัติไปแล้วคงสถานะเดิม เหมือนตอน
// ยื่นใหม่ที่รีเซ็ตเฉพาะรายการ 'returned'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { withdrawFromExecError } from '@/lib/costing';
import { findCostingRequest } from '@/lib/costingAdmin';
import { costingWithdrawUpdate } from '@/lib/costingUpdates';
import { appendUpdate } from '@/lib/master/updates';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const REASON_MIN = 10;
const REASON_MAX = 500;

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });

  const blocked = withdrawFromExecError(before, user);
  // ไม่มีสิทธิ์ = 403 · สถานะไม่ใช่ pending_exec = 409 (เป็นเรื่องจังหวะ ไม่ใช่สิทธิ์)
  if (blocked) {
    return Response.json({ error: blocked }, { status: before.status === 'pending_exec' ? 403 : 409 });
  }

  const reason = String((await request.json().catch(() => ({}))).reason || '').trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return Response.json({ error: `ระบุเหตุผลที่ดึงกลับ ${REASON_MIN}–${REASON_MAX} ตัวอักษร` }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  // .eq('status', ...) = กันแข่งกับผู้บริหารที่กำลังกดอนุมัติอยู่พอดี — แพ้ให้บอกไปโหลดใหม่
  // ดีกว่าดึงใบที่เพิ่งถูกตัดสินไปแล้วกลับมา
  const { data: updated, error } = await supabase.from('costing_requests')
    .update({ status: 'assembling', updatedAt: nowIso })
    .eq('id', id).eq('status', 'pending_exec')
    .select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!updated?.length) {
    return Response.json({ error: 'สถานะใบเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่' }, { status: 409 });
  }

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ดึงกลับใบขอราคาผลิต ${before.docNo || id}: ${reason}`, request,
  });

  const event = costingWithdrawUpdate(after, reason);
  if (event) {
    await appendUpdate(supabase, { entityType: 'costing_request', entityId: id, ...event, user });
  }

  // แจ้งผู้บริหารว่าใบหลุดออกจากคิวแล้ว — ไม่งั้นจะเปิดเข้าไปหาใบที่หายไปเฉย ๆ
  sendChat('executive', chatCard({
    title: `ดึงกลับใบขอราคาผลิต ${after.docNo || ''}`,
    subtitle: after.customerName || '',
    rows: [
      { label: 'เหตุผล', value: reason },
      { label: 'ผู้ดึงกลับ', value: user?.name || '' },
      { label: 'สถานะใหม่', value: 'กลับไปให้ฝ่ายขายแก้ไข — จะยื่นเข้ามาใหม่อีกครั้ง' },
    ],
    linkPath: `/sa/costing/${id}`,
    linkLabel: 'เปิดใบขอราคา',
  }));

  return Response.json(after);
}
