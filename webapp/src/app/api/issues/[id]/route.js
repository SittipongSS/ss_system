// ── API เรื่องแจ้งปัญหาระบบ รายใบ (mig 0219) ─────────────────────────────
// GET   /api/issues/[id]              เรื่อง + เรื่องอื่นจากหน้าเดียวกัน
// PATCH /api/issues/[id]  { action }  รับเรื่อง · มอบหมาย · ปรับผลกระทบ · แก้แล้ว ·
//                                     ยืนยัน · ยังไม่หาย · ไม่ใช่บั๊ก
//
// ⚠️ **ไม่มี PATCH แบบแก้ฟิลด์ตรง ๆ** — ทุกการเปลี่ยนแปลงผ่าน `action` ที่ประกาศไว้
// ใน `lib/issues/model.js` เพราะลำดับขั้นบังคับที่ชั้นนี้ (ไม่มี trigger ใน DB)
// ปล่อยให้ client ส่ง `status` มาเองเมื่อไร = ข้ามขั้นได้ทันที
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { issueAction } from '@/lib/issues/model';
import { issuesForPage, requireIssue } from '@/lib/issues/repo';
import { recordIssueEvent } from '@/lib/issues/notify';

export const dynamic = 'force-dynamic';

const http = { unauthorized, forbidden, notFound };

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireIssue({ user, supabase, id }, http);
    if (access.response) return access.response;
    return ok({
      issue: access.row,
      related: await issuesForPage(supabase, access.row.pageUrl, { excludeId: id }),
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireIssue({ user, supabase, id }, http);
    if (access.response) return access.response;
    const before = access.row;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    // ด่านสิทธิ์รายคำสั่งอยู่ใน issueAction (ตาราง ACTIONS) — ที่นี่ไม่ตัดสินซ้ำ
    // เพราะกฎสองที่ที่ต้องตรงกันเองคือกฎที่จะเพี้ยนหากันวันหนึ่ง
    const result = issueAction(action, before, { user, payload: body });
    if (result.error) return badRequest(result.error);

    const { data, error } = await supabase
      .from('system_issues')
      .update({ ...result.patch, updatedAt: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return fail(error.message, 500);

    // เรียก **หลัง** update เสร็จ — appendUpdate โหลดแถวแม่ใหม่เองเพื่อหาผู้รับ
    // ถ้าเรียกก่อน คนที่เพิ่งถูกมอบหมายจะไม่ได้รับแจ้งเตือนของก้าวที่มอบหมายเขาเอง
    await recordIssueEvent(supabase, {
      row: data,
      kind: action,
      body: action === 'reject' ? body.reason : null,
      user,
    });

    await recordAudit({
      user, action: 'update', entityType: 'system_issue', entityId: id, before, after: data,
      summary: result.summary, request: req,
    });

    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});
