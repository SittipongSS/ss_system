import { withUser, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { serviceSetupGet, serviceSetupPatch, serviceSetupPost } from '@/lib/sales/serviceSetupRoute';

export const dynamic = 'force-dynamic';

/* ── งานบริการรายบรรทัดของใบสั่งขาย (mig 0392 · PR-A · แผน §2.4) ─────────────────────────────────
   GET   ก้อนของตาราง/โมดัล/แถบผู้อนุมัติ — ทุกคนที่อ่านใบได้ (loadScoped โหมด view)
   PATCH บันทึกงานบริการ (ชนิด · แพ็คเกจ · รอบ · โซน/แพ็คต่อรอบ · ช่วงบริการ) — ฝ่ายขายที่แก้ใบนี้ได้
   POST  งานบริการย้อนหลังของใบที่อนุมัติแล้ว — action: submit (ยื่นตรวจ) · approve / reject (ผู้จัดการฝ่ายขาย)
   ⭐ ตรรกะทั้งหมดอยู่ที่ `lib/sales/serviceSetupRoute.js` (ทดสอบด้วย supabase ปลอมได้) · ที่นี่แค่ส่งต่อ
   ⚠️ proxy: เส้นนี้อยู่ใต้ /api/sales-planning ⇒ เขียนได้เฉพาะคนที่ถือ salesplan:edit (ไม่ต้องแก้ proxy)
   ⚠️ จอห้ามส่ง retry: true — PATCH/POST เทียบเวลาของใบ (expectedUpdatedAt) ยิงซ้ำ = workflow_stale */
const UNEXPECTED = 'ดำเนินการกับงานบริการไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้แจ้งผู้ดูแลระบบ';

async function forward(label, run) {
  try {
    const result = await run();
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error(`[service-setup] ${label} unexpected error:`, error);
    return fail(UNEXPECTED, 500);
  }
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  return forward(`GET ${id}`, () => serviceSetupGet({ supabase, user, id }));
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return forward(`PATCH ${id}`, () => serviceSetupPatch({ supabase, user, id, body, request: req }));
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return forward(`POST ${id}`, () => serviceSetupPost({ supabase, user, id, body, request: req }));
});
