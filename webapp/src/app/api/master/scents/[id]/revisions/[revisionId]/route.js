// ── บันทึกผลตอบรับของลูกค้าต่อกลิ่นที่ส่งไป (mig 0171) ────────────────────
// ⚠️ ฝ่ายขายบันทึกได้ด้วย ไม่ใช่ RD คนเดียว — คนที่คุยกับลูกค้าจริงคือฝ่ายขาย
// ถ้าให้เฉพาะ RD กรอก ข้อมูลจะมาถึงช้าหรือไม่มาเลย (ดู canRecordScentFeedback)
//
// ⚠️ Rev ของกลิ่น **แก้ได้** ต่างจาก rev ของราคาวัสดุที่ immutable — feedback
// มาทีหลังวันส่งเสมอ จึงไม่มี guard ห้าม UPDATE ที่ระดับ DB
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { canRecordScentFeedback } from '@/lib/master/scents';
import { recordFeedbackError, scentStatusAfterFeedback } from '@/lib/master/scentRevisions';
import {
  findScent, findScentRevision, recordScentFeedback, updateScent,
} from '@/lib/master/scentFormulaAdmin';

export const dynamic = 'force-dynamic';

// PATCH /api/master/scents/[id]/revisions/[revisionId]
// { status: 'approved'|'revise'|'rejected', feedbackAt, feedback?, note? }
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canRecordScentFeedback(user)) return forbidden('ไม่มีสิทธิ์บันทึกผลตอบรับ');
  const { id, revisionId } = await ctx.params;

  let scent;
  let revision;
  try {
    scent = await findScent(supabase, id);
    revision = await findScentRevision(supabase, revisionId);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!scent) return notFound('ไม่พบกลิ่น');
  if (!revision || revision.scentId !== id) return notFound('ไม่พบรายการส่งกลิ่นของกลิ่นนี้');

  const body = await req.json().catch(() => ({}));
  const error = recordFeedbackError(revision, body);
  if (error) return badRequest(error);

  const feedback = String(body.feedback ?? '').trim();
  if (feedback.length > 4000) return badRequest('ผลตอบรับยาวเกิน 4000 ตัวอักษร');

  try {
    const data = await recordScentFeedback(supabase, revisionId, {
      feedbackStatus: body.status,
      feedbackAt: body.feedbackAt,
      feedback: feedback || null,
    }, user);

    // สถานะกลิ่นขยับตามผลตอบรับให้เอง — ไม่มีปุ่มแยกให้ใครลืมกด
    // (approved → ใช้งานได้ · revise → กลับไปพัฒนา · rejected → คนตัดสินเอง)
    const nextStatus = scentStatusAfterFeedback(scent, body.status);
    if (nextStatus) await updateScent(supabase, id, { status: nextStatus });

    await recordAudit({
      user, action: 'update', entityType: 'scent_revision', entityId: revisionId,
      before: revision, after: data, request: req,
      summary: `ผลตอบรับกลิ่น ${scent.name} Rev. ${revision.revisionNo}`,
    });
    return ok({ ...data, scentStatus: nextStatus || scent.status });
  } catch (e) {
    return fail(e.message, 500);
  }
});
