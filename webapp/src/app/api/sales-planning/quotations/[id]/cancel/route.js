import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { isDryRun } from '@/lib/forceDelete';
import { loadScoped } from '@/lib/scopedRow';
import { canApproveQuotation, canEditSalesPlanning } from '@/lib/salesPlanning';
import { canCancelQuotation } from '@/lib/sales/quotationWorkflow';
import { quotationCancelStateError } from '@/lib/sales/quotationCancel';
import { normalizeUnacceptReason, unacceptReasonError } from '@/lib/sales/quotationUnaccept';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';
import {
  cancelQuotation,
  loadQuotationCancelContext,
  previewQuotationCancel,
} from '@/lib/sales/quotationCancelRepo';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/quotations/[id]/cancel — "ยกเลิกใบ" ของผู้อนุมัติ (มติเจ้าของ 24/09
// "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ") · ถาวร: ไม่มีกู้คืน ไม่มีออก Rev. จากใบยกเลิก
//   ?dryRun=1 → พรีวิวผลกระทบให้โมดัล (FC · สัญญา · คำร้องการเงิน · SO ที่ยกเลิกแล้ว) ไม่เขียนอะไร
//   body { reason (10–500), expectedUpdatedAt (ดิบจาก GET) } → ยกเลิกจริง
//
// ⭐ **ช่องใหม่ ไม่ได้ย้ายสิทธิ์** — ลบร่าง · ดึงกลับ · ตีกลับ · ออก Rev. · บังคับลบของแอดมิน อยู่ครบทุกตัว
// ⭐ ผู้ยกเลิก = ผู้อนุมัติ (`canApproveQuotation` = เจ้าของดีลปัจจุบัน + CD/CM/AE Sup/admin) ที่ถือ
//   salesplan:edit และอยู่ในขอบเขตแก้ของดีล (`loadScoped` 'edit' — เกณฑ์เดียวกับย้อนการรับ)
// ⚠️ ด่านตัวเดียวกับธง `canCancel` ที่ GET ส่งให้จอ (`canCancelQuotation`) — ห้ามคิดซ้ำที่นี่
// ⚠️ ไม่มี RPC/migration โดยเจตนา — ดูหัวไฟล์ lib/sales/quotationCancelRepo.js
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  // โหลด + ตรวจขอบเขตแก้ในจังหวะเดียว (systemRules กฎ 6 — ห้ามโหลดใบเอง)
  const { row: quote, response } = await loadScoped(supabase, 'quotations', id, user, 'edit');
  if (response) return response;

  // หลักฐานลายเซ็นเป็นส่วนหนึ่งของด่าน (ร่างที่ถูกดึงกลับ/ตีกลับหลังยื่น) — อ่านไม่ขึ้น = หยุด ไม่ใช่เดา
  let context;
  try {
    context = await loadQuotationCancelContext(supabase, quote);
  } catch (contextError) {
    return fail(contextError.message, 500);
  }

  const approver = canApproveQuotation(user, quote.deal);
  const allowed = canCancelQuotation(quote, {
    approver,
    canEdit: true, // ผ่าน canEditSalesPlanning ข้างบนแล้ว
    inScope: true, // ผ่าน loadScoped โหมด 'edit' แล้ว
    hasSignatureEvidence: context.hasSignatureEvidence,
  });
  if (!allowed) {
    if (!approver) {
      return forbidden(`ยกเลิกใบได้เฉพาะผู้อนุมัติของใบนี้ (เจ้าของดีลหรือผู้จัดการฝ่ายขาย) — ส่งต่อให้ ${quote.deal?.ownerName || 'เจ้าของดีล'}`);
    }
    return badRequest(quotationCancelStateError(quote));
  }

  // พรีวิวผ่านด่านเดียวกับตอนกดจริง — ผลกระทบของใบ (ยอด FC · เลขเอกสารการเงิน) ไม่ใช่ของที่ใครก็อ่านได้
  if (isDryRun(req)) {
    try {
      const preview = await previewQuotationCancel(supabase, quote, { context, user });
      return ok({ dryRun: true, ...preview });
    } catch (previewError) {
      return fail(previewError.message, 500);
    }
  }

  const body = await req.json().catch(() => ({}));
  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return badRequest(expected.error);
  // เหตุผลบังคับ 10–500 ตัวอักษร — เกณฑ์เดียวกับย้อนการรับ (quotationUnaccept.js)
  const reasonProblem = unacceptReasonError(body.reason);
  if (reasonProblem) return badRequest(reasonProblem);
  const reason = normalizeUnacceptReason(body.reason);

  const result = await cancelQuotation(supabase, {
    quote, context, user, reason, expectedUpdatedAt: expected.value, req,
  });
  if (result.error) return fail(result.error, result.status || 500);
  return ok(result.data);
});
