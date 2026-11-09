import { withUser, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { installGet, installModePut, installRequestPost } from '@/lib/service/installRequestRoute';
// สวิตช์ขั้นเข้าติดตั้ง (mig 0425) — ตัวอ่านเดียว · ฝั่ง server เท่านั้น
import { installStepEnabled } from '@/lib/service/installStepFlag';

export const dynamic = 'force-dynamic';

/* ── งานติดตั้งของใบสั่งขาย (ขั้นเข้าติดตั้ง PR-2b · mig 0425 · docs/service-install-step.md) ──────────────
   GET  ภาพรวมรายไซต์ (การ์ด "ติดตั้ง · เข้าบริการ") — ทุกคนที่อ่านใบได้
   PUT  เลือกโหมดรายไซต์ ติดตั้ง/Service
   POST ขอคิว/แก้คำขอคิวติดตั้ง (+ กระดิ่งถึงหัวหน้า TS/Planner)
   ⭐ ตรรกะทั้งหมดอยู่ที่ `lib/service/installRequestRoute.js` (ทดสอบด้วย supabase ปลอมได้) · ที่นี่ส่งต่อ + อ่านสวิตช์
   ⚠️ proxy: อยู่ใต้ /api/sales-planning ⇒ เขียนได้เฉพาะคนที่ถือ salesplan:edit
   ⚠️ จอห้ามส่ง retry: true — PUT/POST เทียบ updatedAt ของแถว (ยิงซ้ำ = 409) */
const UNEXPECTED = 'ดำเนินการกับงานติดตั้งไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ';

async function forward(label, run) {
  try {
    const result = await run();
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error(`[install] ${label} unexpected error:`, error);
    return fail(UNEXPECTED, 500);
  }
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  return forward(`GET ${id}`, () => installGet({ supabase, user, id, enabled: installStepEnabled() }));
});

export const PUT = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return forward(`PUT ${id}`, () => installModePut({ supabase, user, id, body, enabled: installStepEnabled(), request: req }));
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return forward(`POST ${id}`, () => installRequestPost({ supabase, user, id, body, enabled: installStepEnabled(), request: req }));
});
