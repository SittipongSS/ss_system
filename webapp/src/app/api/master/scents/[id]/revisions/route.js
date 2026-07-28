// ── บันทึกการส่งกลิ่นให้ลูกค้า 1 ครั้ง (Rev ใหม่) — mig 0171 ──────────────
// เฉพาะ RD: การส่งตัวอย่างเป็นงานของฝ่ายวิจัย ฝ่ายขายบันทึกได้แค่ "ผลตอบรับ"
// ที่ได้จากลูกค้า (ดู [revisionId]/route.js)
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { isScentRegistrar } from '@/lib/master/scents';
import { normalizeRevisionInput, sendRevisionError } from '@/lib/master/scentRevisions';
import { appendScentRevision, findScent } from '@/lib/master/scentFormulaAdmin';

export const dynamic = 'force-dynamic';

// POST /api/master/scents/[id]/revisions  { sentAt, sampleCode?, note? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!isScentRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่บันทึกการส่งกลิ่นได้');
  const { id } = await ctx.params;

  let scent;
  try {
    scent = await findScent(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!scent) return notFound('ไม่พบกลิ่น');

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeRevisionInput(body);
  if (error) return badRequest(error);

  const gate = sendRevisionError(scent, scent.revisions || []);
  if (gate) return badRequest(gate);

  try {
    const data = await appendScentRevision(supabase, scent, value, user);
    await recordAudit({
      user, action: 'create', entityType: 'scent_revision', entityId: data.id,
      after: data, summary: `ส่งกลิ่น ${scent.name} ครั้งที่ ${data.revisionNo}`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
