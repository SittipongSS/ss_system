import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { ADDENDUM_DOC_TITLE, canCancelAddendum } from '@/lib/sales/contractAddenda';

export const dynamic = 'force-dynamic';

const MIN_REASON = 10;

// POST /api/sales-planning/addenda/[id]/cancel
// ⚠️ ฉบับที่ลงนามแล้วยกเลิกที่นี่ไม่ได้ — เป็นส่วนหนึ่งของสัญญาไปแล้วตามข้อ 2 ของตัวมันเอง
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contract_addenda', id, user, 'edit');
  if (response) return response;
  if (!canCancelAddendum(before)) return fail('ยกเลิกได้เฉพาะบันทึกที่ยังเป็นร่างหรือรอลงนาม', 409);

  const body = await req.json();
  const reason = String(body?.reason || '').trim();
  if (reason.length < MIN_REASON) return badRequest(`ระบุเหตุผลที่ยกเลิกอย่างน้อย ${MIN_REASON} ตัวอักษร`);

  const { data, error } = await supabase.from('sales_contract_addenda').update({
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    cancelReason: reason,
    updatedAt: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract_addendum', entityId: id,
    before, after: data,
    summary: `ยกเลิก${ADDENDUM_DOC_TITLE} ${data.docNo || data.id} — ${reason}`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});
