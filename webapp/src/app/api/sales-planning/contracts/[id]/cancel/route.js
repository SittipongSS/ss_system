import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { canCancelContract, contractKindLabel } from '@/lib/sales/contracts';

export const dynamic = 'force-dynamic';

// เหตุผลอย่างน้อย 10 ตัวอักษร — กติกาเดียวกับการตีกลับใบสั่งขาย/ถอนคำรับรองงวด
// ("ยกเลิก" ลอย ๆ ตอบคำถามคนที่มาอ่านทีหลังไม่ได้สักข้อ)
const MIN_REASON = 10;

// POST /api/sales-planning/contracts/[id]/cancel
// ⚠️ ใบที่ลงนามแล้วยกเลิกที่นี่ไม่ได้ — การเลิกสัญญาที่มีผลแล้วเป็นเรื่องของเอกสาร
//    อีกฉบับ (บันทึกเพิ่มเติมสัญญา) ไม่ใช่ปุ่มในระบบ
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;
  if (!canCancelContract(before)) {
    return fail('ยกเลิกได้เฉพาะสัญญาที่ยังเป็นร่างหรือรอลงนาม', 409);
  }

  const body = await req.json();
  const reason = String(body?.reason || '').trim();
  if (reason.length < MIN_REASON) return badRequest(`ระบุเหตุผลที่ยกเลิกอย่างน้อย ${MIN_REASON} ตัวอักษร`);

  const { data, error } = await supabase.from('sales_contracts').update({
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    cancelReason: reason,
    updatedAt: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before, after: data,
    summary: `ยกเลิก${contractKindLabel(data.kind)} ${data.contractNo || data.id} — ${reason}`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});
