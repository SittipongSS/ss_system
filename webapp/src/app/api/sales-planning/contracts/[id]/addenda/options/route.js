import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { addendumEligibility } from '@/lib/sales/contractAddenda';

export const dynamic = 'force-dynamic';

/* GET /api/sales-planning/contracts/[id]/addenda/options
   "สัญญาใบนี้ทำบันทึกเพิ่มเติมจากคำร้องใบไหนได้บ้าง"

   ⚠️ คืนเฉพาะคำร้องที่ **ปิดเรื่องแล้ว และมีสูตรขึ้นทะเบียนแล้ว** — ใบที่ยังไม่มีสูตร
   ใส่ลงบันทึกไม่ได้เพราะไม่มีรหัสให้อ้าง ⇒ โชว์ในดรอปดาวน์แล้วเลือกไม่ได้ = แย่กว่าไม่โชว์ */
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: contract, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;

  const eligibility = addendumEligibility({ contract, request: { kind: 'scent_dev', status: 'closed' } });

  /* ⭐ ขอบเขต = **ลูกค้าของสัญญาใบนี้** (มติผู้ใช้ 2026-08-22) ไม่ใช่ดีลใบเดียวกัน —
     คำร้องพัฒนากลิ่นมักถูกเปิดคนละดีลกับดีลที่ออกสัญญา ผูกกับดีลแล้วลิสต์ว่างทั้งที่
     ของมีอยู่ · เทียบด้วย customerId ก่อน แล้วค่อยตกมาที่ชื่อ (ใบเก่าที่ไม่มีรหัส) */
  let query = supabase
    .from('dept_requests')
    .select('id, "docNo", "closedAt", "customerName", "customerId"')
    .eq('kind', 'scent_dev')
    .eq('status', 'closed')
    .order('closedAt', { ascending: false });
  if (contract.customerId) query = query.eq('customerId', contract.customerId);
  else if (contract.customerName) query = query.eq('customerName', contract.customerName);
  else query = query.eq('dealId', contract.dealId);

  const { data: requests, error } = await query;
  if (error) return fail(error.message, 500);

  const ids = (requests || []).map((request) => request.id);
  let countByRequest = new Map();
  if (ids.length) {
    const { data: items, error: itemError } = await supabase
      .from('dept_request_items').select('"requestId", "producedFormulaId"').in('requestId', ids);
    if (itemError) return fail(itemError.message, 500);
    countByRequest = (items || []).reduce((map, item) => {
      if (!item.producedFormulaId) return map;
      map.set(item.requestId, (map.get(item.requestId) || 0) + 1);
      return map;
    }, new Map());
  }

  /* ⭐ หนึ่งคำร้อง = หนึ่งบันทึก (มติผู้ใช้ 2026-08-22) — ใบที่ถูกใช้ไปแล้วหายจากลิสต์
     ⚠️ นับเฉพาะบันทึกที่ยังไม่ถูกยกเลิก · ใบที่ยกเลิกแล้วต้องกลับมาเลือกได้อีก
     ไม่งั้นคำร้องจะตายถาวรเพราะบันทึกที่ทิ้งไปแล้ว */
  let takenIds = new Set();
  if (ids.length) {
    const { data: taken, error: takenError } = await supabase
      .from('sales_contract_addenda').select('"requestId"')
      .in('requestId', ids).neq('status', 'cancelled');
    if (takenError) return fail(takenError.message, 500);
    takenIds = new Set((taken || []).map((row) => row.requestId));
  }

  return ok({
    ok: eligibility.ok,
    reason: eligibility.reason,
    requests: (requests || [])
      .map((request) => ({ ...request, formulaCount: countByRequest.get(request.id) || 0 }))
      .filter((request) => request.formulaCount > 0 && !takenIds.has(request.id)),
  });
});
