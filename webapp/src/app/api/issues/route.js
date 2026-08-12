// ── API เรื่องแจ้งปัญหาระบบ (mig 0223) ───────────────────────────────────
// GET  /api/issues?status=&kind=&mine=1   รายการ — ขอบเขตตัดที่ query (ดู listIssues)
// POST /api/issues                        เปิดเรื่องใหม่ · ทุกคนที่ล็อกอินทำได้
//
// ⚠️ ไม่มีพารามิเตอร์ `reportedById` โดยเจตนา — ผู้แจ้งคือคนที่ล็อกอินอยู่เท่านั้น
// เปิดเรื่องในนามคนอื่นไม่ได้ (ไม่ใช่แค่ "ไม่มีปุ่ม" แต่ไม่มีทางเลย)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { withUser, ok, fail, badRequest, unauthorized } from '@/lib/http';
import { canReportIssue } from '@/lib/issues/access';
import { normalizeIssueInput } from '@/lib/issues/model';
import { issuesForPage, listIssues } from '@/lib/issues/repo';
import { notifyNewIssue } from '@/lib/issues/notify';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user?.id) return unauthorized();
  const url = new URL(req.url);

  // กันแจ้งซ้ำ: หน้าโมดัลถามว่า "หน้านี้มีคนแจ้งไปแล้วไหม" ก่อนผู้ใช้พิมพ์เสร็จ
  const pageUrl = url.searchParams.get('pageUrl');
  if (pageUrl) {
    return ok({ items: await issuesForPage(supabase, pageUrl) });
  }

  try {
    const items = await listIssues(supabase, user, {
      status: url.searchParams.get('status'),
      kind: url.searchParams.get('kind'),
      mine: url.searchParams.get('mine') === '1',
    });
    return ok({ items });
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!canReportIssue(user)) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeIssueInput(body, user);
  if (error) return badRequest(error);

  try {
    // รหัส IS ออกพร้อม insert ในทรานแซกชันเดียว (mig 0238) — insert ล้ม = เลขคืน
    const row = { id: genId('ISS'), ...value };
    const { data, error: insertError } = await insertRowWithEntityCode(supabase, 'IS', row);
    if (insertError) return fail(insertError.message, 500);

    // ⚠️ ทั้งสองอย่างข้างล่างนี้ **ห้ามทำให้ POST ตอบ error** — เรื่องถูกบันทึกแล้ว
    // คนที่กำลังแจ้งบั๊กอยู่ต้องไม่เจอบั๊กซ้อนบั๊ก (ทั้งคู่กลืน error เองอยู่แล้ว)
    notifyNewIssue(data);
    await recordAudit({
      user, action: 'create', entityType: 'system_issue', entityId: data.id, after: data,
      summary: `แจ้งปัญหาระบบ ${data.code} · ${data.title || ''}`.trim(),
      request: req,
    });

    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
