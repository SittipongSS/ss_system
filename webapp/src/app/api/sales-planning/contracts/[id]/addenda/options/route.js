import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { addendumEligibility } from '@/lib/sales/contractAddenda';
import { addendumSourceReason, loadAddendumRequestCandidates, pickAddendumRequest } from '@/lib/sales/addendumRequests';

export const dynamic = 'force-dynamic';

/* GET /api/sales-planning/contracts/[id]/addenda/options
   "สัญญาใบนี้ทำบันทึกเพิ่มเติมจากคำร้องใบไหน"

   ⭐ มติผู้ใช้ 2026-08-22: **ไม่ให้เลือก** — คำร้องมาจากใบสั่งขาย สัญญาก็มาจากใบเสนอราคา
      ของใบสั่งขายเดียวกัน ⇒ ระบบไล่สายให้เอง คืน "ใบที่จะใช้" ใบเดียว
   คืนใบที่เหลือมาด้วยเพื่อให้จอบอกได้ว่ายังทำได้อีกกี่ครั้ง (ไม่ใช่ให้เลือก) */
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: contract, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;

  const eligibility = addendumEligibility({ contract, request: { kind: 'scent_dev', status: 'closed' } });

  const { candidates, error } = await loadAddendumRequestCandidates(supabase, contract);
  if (error) return fail(error, 500);

  const next = pickAddendumRequest(candidates);
  const usable = candidates.filter((request) => request.formulaCount > 0 && !request.taken);

  return ok({
    ok: eligibility.ok && Boolean(next),
    reason: eligibility.ok ? (next ? null : addendumSourceReason(candidates)) : eligibility.reason,
    next,
    remaining: usable.length,
  });
});
