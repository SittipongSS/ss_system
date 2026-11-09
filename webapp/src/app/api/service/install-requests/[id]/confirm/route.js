import { withUser, fail, unauthorized } from '@/lib/http';
import { installConfirmPost } from '@/lib/service/installConfirmRoute';

export const dynamic = 'force-dynamic';

/* ── TS ยืนยันวันติดตั้ง (ขั้นเข้าติดตั้ง PR-3a · ม็อก B2 · mig 0425 · docs/service-install-step.md) ──────────────
   POST → นัดติดตั้งร่าง + โซนของนัด + เครื่องที่วาง · รอ SA คอนเฟิร์มลูกค้าก่อนขึ้นงานช่าง
   ⭐ ตรรกะทั้งหมดอยู่ที่ `lib/service/installConfirmRoute.js` (ทดสอบด้วยฐานในหน่วยความจำ) · ที่นี่ส่งต่อ
   ⚠️ สิทธิ์: `canEditService` (หัวหน้า/Planner ฝ่าย TS) — ช่าง (`service:work`) ยืนยันวันไม่ได้
   ⚠️ จอห้ามส่ง retry: true — POST สร้างนัด (ยิงซ้ำ = นัดซ้ำ · ด่าน "โซนมีนัดแล้ว" กันได้แค่หลังรอบแรกสำเร็จ) */
const UNEXPECTED = 'ยืนยันวันติดตั้งไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ';

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  try {
    const result = await installConfirmPost({ supabase, user, requestId: id, body, request: req });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error(`[install-confirm] POST ${id} unexpected error:`, error);
    return fail(UNEXPECTED, 500);
  }
});
